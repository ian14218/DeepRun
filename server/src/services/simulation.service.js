const pool = require('../db');
const playerModel = require('../models/player.model');
const playerGameStats = require('../models/playerGameStats.model');
const eliminationService = require('./elimination.service');
const tournamentTeamModel = require('../models/tournamentTeam.model');

function getRoundName(teamCount) {
  const rounds = {
    64: 'Round of 64',
    32: 'Round of 32',
    16: 'Sweet 16',
    8: 'Elite 8',
    4: 'Final Four',
    2: 'Championship',
  };
  return rounds[teamCount] || null;
}

const ROUND_SHORT = {
  'Round of 64': 'R64',
  'Round of 32': 'R32',
  'Sweet 16': 'S16',
  'Elite 8': 'E8',
  'Final Four': 'FF',
  'Championship': 'CH',
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function simulateRound() {
  // 1. Get all non-eliminated teams
  const { rows: activeTeams } = await pool.query(
    `SELECT * FROM tournament_teams WHERE is_eliminated = false ORDER BY id`
  );

  const teamCount = activeTeams.length;

  // 2. Determine current round
  const roundName = getRoundName(teamCount);
  if (!roundName) {
    const err = new Error(
      teamCount <= 1
        ? 'Tournament is over — no more rounds to simulate'
        : `Invalid team count (${teamCount}) — cannot determine round`
    );
    err.status = 400;
    throw err;
  }

  // 3. Shuffle and pair
  const shuffled = shuffle(activeTeams);
  const games = [];
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < shuffled.length; i += 2) {
    const teamA = shuffled[i];
    const teamB = shuffled[i + 1];

    // 4a. Fetch players for both teams
    const [playersA, playersB] = await Promise.all([
      playerModel.findByTeamId(teamA.id),
      playerModel.findByTeamId(teamB.id),
    ]);

    // 4b. Generate random points
    const genPoints = (player) => {
      const ppg = parseFloat(player.season_ppg) || 5;
      return Math.max(0, Math.round(ppg * (0.4 + Math.random() * 1.2)));
    };

    const statsA = playersA.map((p) => ({ player: p, points: genPoints(p) }));
    const statsB = playersB.map((p) => ({ player: p, points: genPoints(p) }));

    // 4c. Sum to decide winner (tie → team A)
    const scoreA = statsA.reduce((s, x) => s + x.points, 0);
    const scoreB = statsB.reduce((s, x) => s + x.points, 0);
    const aWins = scoreA >= scoreB;

    const short = ROUND_SHORT[roundName] || 'SIM';
    const idA = String(teamA.id).slice(0, 8);
    const idB = String(teamB.id).slice(0, 8);
    const externalGameId = `sim-${short}-${idA}-${idB}`;

    // 4d. Insert player_game_stats for all players
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

    // 4e. Eliminate loser
    const loserId = aWins ? teamB.id : teamA.id;
    const winnerId = aWins ? teamA.id : teamB.id;
    await eliminationService.eliminateTeam(loserId, roundName);

    // 4f. Update winner wins
    await tournamentTeamModel.updateWinsFromStats(winnerId);

    games.push({
      home: teamA.name,
      away: teamB.name,
      homeScore: scoreA,
      awayScore: scoreB,
      winner: aWins ? teamA.name : teamB.name,
    });
  }

  return { round: roundName, games };
}

module.exports = { simulateRound };
