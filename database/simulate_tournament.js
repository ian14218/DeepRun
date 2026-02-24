/**
 * Tournament simulator: generates fake game results round-by-round.
 *
 * Usage:
 *   node database/simulate_tournament.js --round 1    # simulate Round of 64
 *   node database/simulate_tournament.js --round 2    # simulate Round of 32
 *   node database/simulate_tournament.js --round 3    # simulate Sweet 16
 *   node database/simulate_tournament.js --round 4    # simulate Elite 8
 *   node database/simulate_tournament.js --round 5    # simulate Final Four
 *   node database/simulate_tournament.js --round 6    # simulate Championship
 *   node database/simulate_tournament.js --all        # simulate all remaining rounds
 *
 * Run from the project root after seeding teams and completing a draft.
 */

require('dotenv').config({ path: `${__dirname}/../server/.env` });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ROUND_NAMES = {
  1: 'Round of 64',
  2: 'Round of 32',
  3: 'Sweet 16',
  4: 'Elite 8',
  5: 'Final Four',
  6: 'Championship',
};

// Standard bracket matchups for Round of 64 (seed pairings per region)
const R64_SEED_MATCHUPS = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15],
];

const REGIONS = ['East', 'Midwest', 'South', 'West'];

// Final Four cross-region pairings (standard NCAA bracket)
const FF_PAIRINGS = [
  ['East', 'Midwest'],
  ['South', 'West'],
];

function randomPlayerPoints() {
  // Random points between 0-30, weighted toward lower values
  return Math.floor(Math.random() * 31);
}

async function getTeamsByRegion() {
  const result = await pool.query(
    `SELECT id, name, seed, region, is_eliminated, wins
     FROM tournament_teams
     WHERE is_eliminated = false
     ORDER BY region, seed`
  );
  const byRegion = {};
  for (const team of result.rows) {
    if (!byRegion[team.region]) byRegion[team.region] = [];
    byRegion[team.region].push(team);
  }
  return byRegion;
}

async function getPlayers(teamId) {
  const result = await pool.query(
    `SELECT id, name FROM players WHERE team_id = $1`,
    [teamId]
  );
  return result.rows;
}

async function gameAlreadySimulated(externalGameId) {
  const result = await pool.query(
    `SELECT 1 FROM player_game_stats WHERE external_game_id = $1 LIMIT 1`,
    [externalGameId]
  );
  return result.rowCount > 0;
}

async function simulateGame(teamA, teamB, roundNum, gameTag) {
  const roundName = ROUND_NAMES[roundNum];
  const externalGameId = `sim-${gameTag}`;

  // Check idempotency
  if (await gameAlreadySimulated(externalGameId)) {
    console.log(`  SKIP: ${teamA.name} vs ${teamB.name} (already simulated)`);
    // Return the winner based on who's still not eliminated
    // Actually we need to figure out who won — check which team got eliminated
    const elimA = await pool.query('SELECT is_eliminated FROM tournament_teams WHERE id = $1', [teamA.id]);
    return elimA.rows[0].is_eliminated ? teamB : teamA;
  }

  const playersA = await getPlayers(teamA.id);
  const playersB = await getPlayers(teamB.id);

  const today = new Date().toISOString().split('T')[0];

  // Generate random stats for each player
  let scoreA = 0;
  let scoreB = 0;

  for (const p of playersA) {
    const pts = randomPlayerPoints();
    scoreA += pts;
    await pool.query(
      `INSERT INTO player_game_stats (player_id, game_date, opponent_team_id, points, tournament_round, external_game_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (player_id, external_game_id) DO NOTHING`,
      [p.id, today, teamB.id, pts, roundName, externalGameId]
    );
  }

  for (const p of playersB) {
    const pts = randomPlayerPoints();
    scoreB += pts;
    await pool.query(
      `INSERT INTO player_game_stats (player_id, game_date, opponent_team_id, points, tournament_round, external_game_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (player_id, external_game_id) DO NOTHING`,
      [p.id, today, teamA.id, pts, roundName, externalGameId]
    );
  }

  // If tied, higher seed wins (lower seed number)
  const winner = scoreA >= scoreB ? teamA : teamB;
  const loser = winner === teamA ? teamB : teamA;
  const winScore = winner === teamA ? scoreA : scoreB;
  const loseScore = winner === teamA ? scoreB : scoreA;

  // Eliminate the loser
  await pool.query(
    `UPDATE tournament_teams SET is_eliminated = true, eliminated_in_round = $2 WHERE id = $1`,
    [loser.id, roundName]
  );
  await pool.query(
    `UPDATE players SET is_eliminated = true WHERE team_id = $1`,
    [loser.id]
  );

  // Increment winner's wins
  await pool.query(
    `UPDATE tournament_teams SET wins = wins + 1 WHERE id = $1`,
    [winner.id]
  );

  console.log(`  ${winner.name} ${winScore} - ${loseScore} ${loser.name}  (${loser.name} eliminated)`);
  return winner;
}

async function simulateRound(roundNum) {
  const roundName = ROUND_NAMES[roundNum];
  if (!roundName) {
    console.error(`Invalid round number: ${roundNum}. Use 1-6.`);
    return;
  }

  console.log(`\nSimulating ${roundName}...\n`);

  const byRegion = await getTeamsByRegion();

  if (roundNum === 1) {
    // Round of 64: pair by seeds within each region
    for (const region of REGIONS) {
      const regionTeams = byRegion[region] || [];
      console.log(`--- ${region} Region ---`);

      for (const [seedA, seedB] of R64_SEED_MATCHUPS) {
        const teamA = regionTeams.find((t) => t.seed === seedA);
        const teamB = regionTeams.find((t) => t.seed === seedB);
        if (!teamA || !teamB) {
          console.log(`  SKIP: Missing seed #${seedA} or #${seedB} in ${region}`);
          continue;
        }
        await simulateGame(teamA, teamB, roundNum, `r${roundNum}-${region}-${seedA}v${seedB}`);
      }
    }
  } else if (roundNum >= 2 && roundNum <= 4) {
    // Rounds 2-4: pair surviving teams within each region by seed (lowest vs highest)
    for (const region of REGIONS) {
      const regionTeams = (byRegion[region] || []).sort((a, b) => a.seed - b.seed);
      console.log(`--- ${region} Region ---`);

      if (regionTeams.length % 2 !== 0) {
        console.log(`  WARNING: Odd number of teams (${regionTeams.length}) in ${region}. Round may be incomplete.`);
      }

      // Pair top seed vs bottom seed, second vs second-to-last, etc.
      const half = Math.floor(regionTeams.length / 2);
      for (let i = 0; i < half; i++) {
        const teamA = regionTeams[i];
        const teamB = regionTeams[regionTeams.length - 1 - i];
        await simulateGame(teamA, teamB, roundNum, `r${roundNum}-${region}-${teamA.seed}v${teamB.seed}`);
      }
    }
  } else if (roundNum === 5) {
    // Final Four: cross-region matchups
    console.log('--- Final Four ---');
    const allSurviving = [];
    for (const [regionA, regionB] of FF_PAIRINGS) {
      const teamA = (byRegion[regionA] || [])[0];
      const teamB = (byRegion[regionB] || [])[0];
      if (!teamA || !teamB) {
        console.log(`  SKIP: Missing region winner for ${regionA} or ${regionB}`);
        continue;
      }
      const winner = await simulateGame(teamA, teamB, roundNum, `r${roundNum}-${regionA}v${regionB}`);
      allSurviving.push(winner);
    }
  } else if (roundNum === 6) {
    // Championship: last 2 standing
    const allTeams = Object.values(byRegion).flat();
    if (allTeams.length !== 2) {
      console.log(`  Cannot simulate championship: ${allTeams.length} teams remaining (need 2).`);
      return;
    }
    console.log('--- Championship ---');
    await simulateGame(allTeams[0], allTeams[1], roundNum, `r${roundNum}-championship`);
  }

  // Show surviving teams count
  const remaining = await pool.query(
    `SELECT COUNT(*) FROM tournament_teams WHERE is_eliminated = false`
  );
  console.log(`\n${remaining.rows[0].count} teams remaining after ${roundName}.`);
}

async function run() {
  const args = process.argv.slice(2);

  if (args.includes('--all')) {
    // Figure out which round to start from based on surviving team count
    const remaining = await pool.query(
      `SELECT COUNT(*)::int AS count FROM tournament_teams WHERE is_eliminated = false`
    );
    const count = remaining.rows[0].count;

    let startRound;
    if (count === 64) startRound = 1;
    else if (count === 32) startRound = 2;
    else if (count === 16) startRound = 3;
    else if (count === 8) startRound = 4;
    else if (count === 4) startRound = 5;
    else if (count === 2) startRound = 6;
    else {
      console.log(`Unexpected team count: ${count}. Cannot determine starting round.`);
      await pool.end();
      return;
    }

    for (let r = startRound; r <= 6; r++) {
      await simulateRound(r);
    }
  } else {
    const roundIdx = args.indexOf('--round');
    const roundNum = roundIdx >= 0 ? parseInt(args[roundIdx + 1], 10) : null;

    if (!roundNum || roundNum < 1 || roundNum > 6) {
      console.log('Usage:');
      console.log('  node database/simulate_tournament.js --round <1-6>');
      console.log('  node database/simulate_tournament.js --all');
      console.log('');
      console.log('Rounds: 1=R64, 2=R32, 3=Sweet16, 4=Elite8, 5=FinalFour, 6=Championship');
      await pool.end();
      return;
    }

    await simulateRound(roundNum);
  }

  await pool.end();
}

run().catch((err) => {
  console.error('Simulation failed:', err.message);
  process.exit(1);
});
