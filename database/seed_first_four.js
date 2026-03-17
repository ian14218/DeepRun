/**
 * Seed players for First Four teams.
 *
 * Dynamically detects First Four teams from the database — any teams that share
 * the same (seed, region) are First Four pairs. This replaces the previous
 * hardcoded team list and works for any tournament year.
 *
 * Also sets the is_first_four flag and first_four_partner_id for each pair.
 *
 * Usage:
 *   node database/seed_first_four.js                    # detect and seed First Four teams
 *   node database/seed_first_four.js --year 2026        # specify tournament year (for correct season stats)
 *   node database/seed_first_four.js --dry-run          # show detected teams without DB writes
 */
require('dotenv').config({ path: `${__dirname}/../server/.env` });
const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ESPN_ROSTER_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams';
const ESPN_STATS_BASE =
  'https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball';

const args = process.argv.slice(2);
const yearIdx = args.indexOf('--year');
const year = yearIdx >= 0 ? parseInt(args[yearIdx + 1], 10) : 2026;
const dryRun = args.includes('--dry-run');

/**
 * Find First Four teams: teams that share the same (seed, region).
 * In a standard 64-team bracket, each (seed, region) is unique.
 * Duplicates mean First Four play-in teams.
 */
async function detectFirstFourTeams() {
  const result = await pool.query(`
    SELECT t1.id AS team_a_id, t1.name AS team_a_name, t1.external_id AS team_a_ext,
           t2.id AS team_b_id, t2.name AS team_b_name, t2.external_id AS team_b_ext,
           t1.seed, t1.region
    FROM tournament_teams t1
    JOIN tournament_teams t2
      ON t1.region = t2.region AND t1.seed = t2.seed AND t1.id < t2.id
    ORDER BY t1.region, t1.seed
  `);
  return result.rows;
}

async function fetchAndSeedPlayers(teamId, externalId, teamName) {
  const rosterUrl = `${ESPN_ROSTER_BASE}/${externalId}/roster`;
  const resp = await axios.get(rosterUrl);
  const athletes = resp.data.athletes || [];
  console.log(`  ${teamName}: found ${athletes.length} players`);

  for (const a of athletes) {
    const name = a.fullName || a.displayName;
    const pos = a.position ? a.position.abbreviation : null;
    const jersey = a.jersey ? parseInt(a.jersey) : null;
    const extId = String(a.id);

    await pool.query(
      `INSERT INTO players (name, team_id, position, jersey_number, external_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (external_id) DO UPDATE
         SET name = EXCLUDED.name, team_id = EXCLUDED.team_id,
             position = EXCLUDED.position, jersey_number = EXCLUDED.jersey_number
       RETURNING id`,
      [name, teamId, pos, jersey, extId]
    );
  }

  // Fetch season stats
  let statsUpdated = 0;
  for (const a of athletes) {
    try {
      const statsResp = await axios.get(`${ESPN_STATS_BASE}/athletes/${a.id}/stats`, { timeout: 5000 });
      const categories = statsResp.data.categories || [];
      const averages = categories.find((c) => c.displayName === 'Season Averages');
      if (!averages) continue;

      // ESPN nests per-season stats under statistics (e.g. "2025-26", "2024-25").
      // 'totals' is the career aggregate — we want the current season instead.
      const statistics = averages.statistics || {};
      const statEntries = Object.values(statistics);
      let values = null;

      const currentSeasonLabel = `${year - 1}-${String(year).slice(2)}`;
      const currentSeason = statEntries.find(
        (s) => s.displayName === currentSeasonLabel
      );
      if (currentSeason && currentSeason.stats && currentSeason.stats.length > 0) {
        values = currentSeason.stats;
      }
      if (!values && statEntries.length > 0) {
        values = statEntries[0].stats;
      }
      if (!values || values.length === 0) {
        values = averages.totals;
      }
      if (!values || values.length === 0) continue;

      const labels = averages.labels || [];
      const get = (label) => {
        const idx = labels.indexOf(label);
        return idx >= 0 ? parseFloat(values[idx]) || 0 : 0;
      };

      const ppg = get('PTS'), rpg = get('REB'), apg = get('AST');
      const spg = get('STL'), bpg = get('BLK'), mpg = get('MIN');
      const gp = Math.round(get('GP'));

      await pool.query(
        `UPDATE players SET season_ppg=$1, season_rpg=$2, season_apg=$3, season_spg=$4, season_bpg=$5, season_mpg=$6, season_gp=$7 WHERE external_id=$8`,
        [ppg, rpg, apg, spg, bpg, mpg, gp, String(a.id)]
      );
      statsUpdated++;
    } catch (_) {
      // Stats might not be available for all players
    }
  }
  console.log(`  Stats updated for ${statsUpdated}/${athletes.length} players`);
}

async function setFirstFourPair(teamAId, teamBId) {
  await pool.query(
    `UPDATE tournament_teams
     SET is_first_four = true, first_four_partner_id = $2
     WHERE id = $1`,
    [teamAId, teamBId]
  );
  await pool.query(
    `UPDATE tournament_teams
     SET is_first_four = true, first_four_partner_id = $1
     WHERE id = $2`,
    [teamAId, teamBId]
  );
}

async function main() {
  const pairs = await detectFirstFourTeams();

  if (pairs.length === 0) {
    console.log('No First Four teams detected (no duplicate seed+region pairs found).');
    console.log('Make sure you have run seed_tournament.js first and that First Four teams are included.');
    await pool.end();
    return;
  }

  console.log(`Detected ${pairs.length} First Four pair(s):\n`);
  for (const pair of pairs) {
    console.log(`  ${pair.region} #${pair.seed}: ${pair.team_a_name} vs ${pair.team_b_name}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: no database writes.');
    await pool.end();
    return;
  }

  console.log('\nSeeding rosters and setting First Four flags...\n');

  for (const pair of pairs) {
    await fetchAndSeedPlayers(pair.team_a_id, pair.team_a_ext, pair.team_a_name);
    await fetchAndSeedPlayers(pair.team_b_id, pair.team_b_ext, pair.team_b_name);
    await setFirstFourPair(pair.team_a_id, pair.team_b_id);
    console.log(`  Set First Four pair: ${pair.team_a_name} <-> ${pair.team_b_name}\n`);
  }

  await pool.end();
  console.log('Done seeding First Four players!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
