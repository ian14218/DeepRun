/**
 * Seed script: imports NCAA tournament teams, rosters, and season stats from ESPN.
 *
 * Usage:
 *   node database/seed_tournament.js              # imports 2025 tournament
 *   node database/seed_tournament.js --year 2026  # imports 2026 tournament (when available)
 *   node database/seed_tournament.js --dry-run    # fetch only, no database writes
 *
 * Run from the project root. Requires DATABASE_URL in server/.env.
 */

require('dotenv').config({ path: `${__dirname}/../server/.env` });
const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ESPN_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';
const ESPN_STATS_BASE =
  'https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball';

// Round of 64 dates by tournament year
const R64_DATES = {
  2025: ['20250320', '20250321'],
  2026: ['20260319', '20260320'], // estimated — update when announced
};

const args = process.argv.slice(2);
const yearIdx = args.indexOf('--year');
const year = yearIdx >= 0 ? parseInt(args[yearIdx + 1], 10) : 2025;
const dryRun = args.includes('--dry-run');

function extractRegion(notes) {
  for (const note of notes || []) {
    const match = (note.headline || '').match(/(East|West|South|Midwest)\s*Region/i);
    if (match) return match[1];
  }
  return 'Unknown';
}

async function fetchAllTeams() {
  const dates = R64_DATES[year];
  if (!dates) {
    throw new Error(`No tournament dates configured for year ${year}. Update R64_DATES in seed_tournament.js.`);
  }

  console.log(`Fetching ${year} tournament games from ESPN (dates: ${dates.join(', ')})...`);

  const responses = await Promise.all(
    dates.map((d) =>
      axios.get(`${ESPN_BASE}/scoreboard`, { params: { dates: d, groups: 100, limit: 50 } })
    )
  );

  const teams = new Map();
  for (const resp of responses) {
    for (const event of resp.data.events || []) {
      const region = extractRegion(event.competitions?.[0]?.notes);
      for (const comp of event.competitions?.[0]?.competitors || []) {
        const id = String(comp.id || comp.team?.id);
        if (!teams.has(id)) {
          teams.set(id, {
            external_id: id,
            name: comp.team?.displayName,
            seed: comp.curatedRank?.current || null,
            region,
          });
        }
      }
    }
  }

  return Array.from(teams.values());
}

async function fetchRoster(externalTeamId) {
  const resp = await axios.get(`${ESPN_BASE}/teams/${externalTeamId}/roster`);
  return (resp.data.athletes || []).map((a) => ({
    external_id: String(a.id),
    name: a.displayName,
    position: a.position?.abbreviation || 'F',
    jersey_number: parseInt(a.jersey, 10) || 0,
  }));
}

/**
 * Fetch season per-game averages for a single player from ESPN.
 * Returns { ppg, rpg, apg, spg, bpg, mpg, gp } or null on failure.
 *
 * ESPN labels for Season Averages:
 *   GP, GS, MIN, FG, FG%, 3PT, 3P%, FT, FT%, OR, DR, REB, AST, BLK, STL, PF, TO, PTS
 *   0   1   2    3   4    5    6    7   8    9   10  11   12   13   14   15  16  17
 */
async function fetchPlayerSeasonStats(externalPlayerId) {
  try {
    const resp = await axios.get(`${ESPN_STATS_BASE}/athletes/${externalPlayerId}/stats`, {
      timeout: 5000,
    });
    const categories = resp.data.categories || [];
    const averages = categories.find((c) => c.displayName === 'Season Averages');
    if (!averages) return null;

    // Stats can be in 'totals' (aggregate) or nested under statistics[key].stats
    let values = averages.totals;
    if (!values || values.length === 0) {
      const statKeys = Object.keys(averages.statistics || {});
      if (statKeys.length > 0) {
        values = averages.statistics[statKeys[0]].stats;
      }
    }
    if (!values || values.length === 0) return null;

    const labels = averages.labels || [];
    const get = (label) => {
      const idx = labels.indexOf(label);
      return idx >= 0 ? parseFloat(values[idx]) || 0 : 0;
    };

    return {
      gp: Math.round(get('GP')),
      mpg: get('MIN'),
      ppg: get('PTS'),
      rpg: get('REB'),
      apg: get('AST'),
      spg: get('STL'),
      bpg: get('BLK'),
    };
  } catch {
    return null;
  }
}

// Small delay to be polite to ESPN's API
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seed() {
  const teams = await fetchAllTeams();
  console.log(`Found ${teams.length} teams.\n`);

  if (dryRun) {
    for (const t of teams.sort((a, b) => a.region.localeCompare(b.region) || a.seed - b.seed)) {
      console.log(`  ${t.region} #${t.seed} ${t.name} (ESPN ID: ${t.external_id})`);
    }
    console.log('\n--dry-run: no database writes.');
    await pool.end();
    return;
  }

  // Clear existing data for a clean import
  console.log('Clearing existing tournament data...');
  await pool.query('DELETE FROM player_game_stats');
  await pool.query('DELETE FROM draft_picks');
  await pool.query('DELETE FROM players');
  await pool.query('DELETE FROM tournament_teams');
  console.log('  Done.\n');

  let totalPlayers = 0;
  let statsFound = 0;

  console.log('Importing teams, rosters, and season stats...');
  for (const team of teams.sort((a, b) => a.region.localeCompare(b.region) || a.seed - b.seed)) {
    // Insert team
    const teamResult = await pool.query(
      `INSERT INTO tournament_teams (name, seed, region, external_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (external_id) DO UPDATE
         SET name = EXCLUDED.name, seed = EXCLUDED.seed, region = EXCLUDED.region
       RETURNING id`,
      [team.name, team.seed, team.region, team.external_id]
    );
    const teamId = teamResult.rows[0].id;

    // Fetch roster
    let players;
    try {
      players = await fetchRoster(team.external_id);
    } catch (err) {
      console.log(`  WARNING: Could not fetch roster for ${team.name}: ${err.message}`);
      players = [];
    }

    // Insert players and fetch their season stats
    for (const p of players) {
      await pool.query(
        `INSERT INTO players (name, team_id, position, jersey_number, external_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (external_id) DO UPDATE
           SET name = EXCLUDED.name, team_id = EXCLUDED.team_id,
               position = EXCLUDED.position, jersey_number = EXCLUDED.jersey_number`,
        [p.name, teamId, p.position, p.jersey_number, p.external_id]
      );

      // Fetch and store season stats
      const stats = await fetchPlayerSeasonStats(p.external_id);
      if (stats) {
        await pool.query(
          `UPDATE players
           SET season_ppg = $1, season_rpg = $2, season_apg = $3,
               season_spg = $4, season_bpg = $5, season_mpg = $6, season_gp = $7
           WHERE external_id = $8`,
          [stats.ppg, stats.rpg, stats.apg, stats.spg, stats.bpg, stats.mpg, stats.gp, p.external_id]
        );
        statsFound++;
      }

      // Small delay to avoid hammering ESPN
      await delay(50);
    }

    totalPlayers += players.length;
    console.log(`  ${team.region} #${team.seed} ${team.name}: ${players.length} players`);
  }

  console.log(`\nSeed complete: ${teams.length} teams, ${totalPlayers} players, ${statsFound} with season stats.`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
