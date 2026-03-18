const pool = require('../db');
const playerModel = require('../models/player.model');
const playerGameStats = require('../models/playerGameStats.model');
const eliminationService = require('./elimination.service');
const tournamentTeamModel = require('../models/tournamentTeam.model');
const bestBallService = require('./bestBall.service');
const bestBallModel = require('../models/bestBall.model');

// Standard bracket matchups for Round of 64 (seed pairings per region)
const R64_SEED_MATCHUPS = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15],
];

const REGIONS = ['East', 'Midwest', 'South', 'West'];

// Cross-region pairings for Final Four (must match BracketView.jsx)
const FF_PAIRINGS = [
  ['East', 'West'],
  ['South', 'Midwest'],
];

function getRoundName(teamCount) {
  const rounds = {
    68: 'First Four',
    64: 'Round of 64',
    32: 'Round of 32',
    16: 'Sweet 16',
    8: 'Elite 8',
    4: 'Final Four',
    2: 'Championship',
  };
  return rounds[teamCount] || null;
}

function getRoundNum(teamCount) {
  return { 68: 0, 64: 1, 32: 2, 16: 3, 8: 4, 4: 5, 2: 6 }[teamCount] ?? null;
}

const ROUND_SHORT = {
  'First Four': 'FF4',
  'Round of 64': 'R64',
  'Round of 32': 'R32',
  'Sweet 16': 'S16',
  'Elite 8': 'E8',
  'Final Four': 'FF',
  'Championship': 'CH',
};

/**
 * Build bracket-aware matchups for the given round.
 * For rounds 2-4 this reconstructs the bracket tree from R64 seed positions
 * so that e.g. the winner of 1v16 plays the winner of 8v9, not a random team.
 */
function buildBracketMatchups(allTeams, roundNum) {
  const byRegion = {};
  for (const team of allTeams) {
    if (!byRegion[team.region]) byRegion[team.region] = [];
    byRegion[team.region].push(team);
  }

  // First Four: pair teams by first_four_partner_id
  if (roundNum === 0) {
    const matchups = [];
    const seen = new Set();
    for (const team of allTeams) {
      if (team.is_first_four && !team.is_eliminated && !seen.has(team.id)) {
        const partner = allTeams.find((t) => t.id === team.first_four_partner_id);
        if (partner && !partner.is_eliminated) {
          matchups.push({ teamA: team, teamB: partner });
          seen.add(team.id);
          seen.add(partner.id);
        }
      }
    }
    return matchups;
  }

  if (roundNum === 1) {
    const matchups = [];
    for (const region of REGIONS) {
      const bySeed = {};
      // Filter out eliminated teams (First Four losers) for R64
      (byRegion[region] || []).filter((t) => !t.is_eliminated).forEach((t) => { bySeed[t.seed] = t; });
      for (const [seedA, seedB] of R64_SEED_MATCHUPS) {
        const teamA = bySeed[seedA];
        const teamB = bySeed[seedB];
        if (teamA && teamB) matchups.push({ teamA, teamB });
      }
    }
    return matchups;
  }

  if (roundNum >= 2 && roundNum <= 4) {
    const matchups = [];
    for (const region of REGIONS) {
      const bySeed = {};
      // Filter out eliminated teams when building seed map
      (byRegion[region] || []).filter((t) => !t.is_eliminated).forEach((t) => { bySeed[t.seed] = t; });

      // Determine R64 winners in bracket order.
      // First Four winners get +1 win from the play-in that doesn't count
      // for bracket advancement — offset so thresholds work correctly.
      const ew = (t) => t ? t.wins - (t.is_first_four ? 1 : 0) : 0;

      let bracketSlots = R64_SEED_MATCHUPS.map(([seedA, seedB]) => {
        const teamA = bySeed[seedA];
        const teamB = bySeed[seedB];
        if (teamA && ew(teamA) >= 1) return teamA;
        if (teamB && ew(teamB) >= 1) return teamB;
        return null;
      });

      // Advance through intermediate rounds
      for (let r = 2; r < roundNum; r++) {
        const next = [];
        for (let i = 0; i < bracketSlots.length; i += 2) {
          const a = bracketSlots[i];
          const b = bracketSlots[i + 1];
          if (a && ew(a) >= r) next.push(a);
          else if (b && ew(b) >= r) next.push(b);
          else next.push(null);
        }
        bracketSlots = next;
      }

      // Pair adjacent bracket slots
      for (let i = 0; i < bracketSlots.length; i += 2) {
        if (bracketSlots[i] && bracketSlots[i + 1]) {
          matchups.push({ teamA: bracketSlots[i], teamB: bracketSlots[i + 1] });
        }
      }
    }
    return matchups;
  }

  if (roundNum === 5) {
    // Final Four: one surviving team per region, paired cross-region
    const matchups = [];
    for (const [regionA, regionB] of FF_PAIRINGS) {
      const activeA = (byRegion[regionA] || []).find((t) => !t.is_eliminated);
      const activeB = (byRegion[regionB] || []).find((t) => !t.is_eliminated);
      if (activeA && activeB) matchups.push({ teamA: activeA, teamB: activeB });
    }
    return matchups;
  }

  if (roundNum === 6) {
    const active = allTeams.filter((t) => !t.is_eliminated);
    if (active.length === 2) {
      return [{ teamA: active[0], teamB: active[1] }];
    }
    return [];
  }

  return [];
}

async function simulateRound() {
  // 1. Get ALL teams (including eliminated) to reconstruct bracket structure
  const { rows: allTeams } = await pool.query(
    `SELECT * FROM tournament_teams ORDER BY region, seed`
  );

  // 2. Determine current round from active team count
  const activeCount = allTeams.filter((t) => !t.is_eliminated).length;
  const roundName = getRoundName(activeCount);
  if (!roundName) {
    const err = new Error(
      activeCount <= 1
        ? 'Tournament is over — no more rounds to simulate'
        : `Invalid team count (${activeCount}) — cannot determine round`
    );
    err.status = 400;
    throw err;
  }

  const roundNum = getRoundNum(activeCount);

  // 3. Build bracket-aware matchups
  const matchups = buildBracketMatchups(allTeams, roundNum);

  const games = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const { teamA, teamB } of matchups) {
    // Fetch players for both teams
    const [playersA, playersB] = await Promise.all([
      playerModel.findByTeamId(teamA.id),
      playerModel.findByTeamId(teamB.id),
    ]);

    // Generate random points based on season PPG
    const genPoints = (player) => {
      const ppg = parseFloat(player.season_ppg) || 5;
      return Math.max(0, Math.round(ppg * (0.4 + Math.random() * 1.2)));
    };

    const statsA = playersA.map((p) => ({ player: p, points: genPoints(p) }));
    const statsB = playersB.map((p) => ({ player: p, points: genPoints(p) }));

    // Sum to decide winner (tie → team A)
    const scoreA = statsA.reduce((s, x) => s + x.points, 0);
    const scoreB = statsB.reduce((s, x) => s + x.points, 0);
    const aWins = scoreA >= scoreB;

    // Eliminate loser
    const loserId = aWins ? teamB.id : teamA.id;
    const winnerId = aWins ? teamA.id : teamB.id;
    await eliminationService.eliminateTeam(loserId, roundName);

    // First Four play-in games don't count toward scoring — skip stat insertion.
    // Only record player_game_stats for R64 onward.
    if (roundName !== 'First Four') {
      const short = ROUND_SHORT[roundName] || 'SIM';
      const idA = String(teamA.id).slice(0, 8);
      const idB = String(teamB.id).slice(0, 8);
      const externalGameId = `sim-${short}-${idA}-${idB}`;

      const statInserts = [];
      for (const { player, points } of statsA) {
        statInserts.push(
          playerGameStats.create(player.id, today, teamB.id, points, roundName, externalGameId)
        );
      }
      for (const { player, points } of statsB) {
        statInserts.push(
          playerGameStats.create(player.id, today, teamA.id, points, roundName, externalGameId)
        );
      }
      await Promise.all(statInserts);
    }

    // Update winner wins — use stats count for regular rounds, direct update for First Four
    if (roundName === 'First Four') {
      await tournamentTeamModel.updateWins(winnerId, 1);
    } else {
      await tournamentTeamModel.updateWinsFromStats(winnerId);
    }

    games.push({
      home: teamA.name,
      away: teamB.name,
      homeScore: scoreA,
      awayScore: scoreB,
      winner: aWins ? teamA.name : teamB.name,
    });
  }

  // Update Best Ball: auto-transition open→live when lock_date has passed, then update scores
  try {
    const contest = await bestBallModel.getActiveContest();
    if (contest) {
      if (contest.status === 'open') {
        const now = new Date();
        const lockDate = contest.lock_date ? new Date(contest.lock_date) : null;
        if (lockDate && now >= lockDate) {
          await bestBallModel.updateContestStatus(contest.id, 'live');
        }
      }
      if (['open', 'locked', 'live'].includes(contest.status)) {
        await bestBallService.updateScores(contest.id);
      }
    }
  } catch (_) {
    // Best Ball score update is non-critical; don't fail the simulation
  }

  return { round: roundName, games };
}

module.exports = { simulateRound };
