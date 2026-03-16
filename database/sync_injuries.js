/**
 * Sync injury status from ESPN for all existing players.
 * Updates ONLY the injury_status column — no data is deleted.
 *
 * Usage:
 *   node database/sync_injuries.js              # update injury status
 *   node database/sync_injuries.js --dry-run    # preview only, no DB writes
 *
 * Run from the project root. Requires DATABASE_URL in server/.env.
 */

require('dotenv').config({ path: `${__dirname}/../server/.env` });
const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ESPN_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';

const dryRun = process.argv.includes('--dry-run');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncInjuries() {
  // Get all teams with their ESPN external IDs
  const teamsResult = await pool.query(
    'SELECT id, name, external_id FROM tournament_teams ORDER BY name'
  );
  const teams = teamsResult.rows;
  console.log(`Found ${teams.length} teams. Fetching rosters from ESPN...\n`);

  let updated = 0;
  let outCount = 0;

  for (const team of teams) {
    let athletes;
    try {
      const resp = await axios.get(`${ESPN_BASE}/teams/${team.external_id}/roster`);
      athletes = resp.data.athletes || [];
    } catch (err) {
      console.log(`  WARNING: Could not fetch roster for ${team.name}: ${err.message}`);
      continue;
    }

    for (const athlete of athletes) {
      const externalId = String(athlete.id);
      const injuryStatus = athlete.injuries?.[0]?.status || null;

      if (!dryRun) {
        const result = await pool.query(
          `UPDATE players SET injury_status = $1 WHERE external_id = $2 AND COALESCE(injury_status, '') IS DISTINCT FROM COALESCE($1, '')`,
          [injuryStatus, externalId]
        );
        if (result.rowCount > 0) updated++;
      }

      if (injuryStatus === 'Out') {
        console.log(`  OUT: ${athlete.displayName} (${team.name})`);
        outCount++;
      }
    }

    await delay(50);
  }

  if (dryRun) {
    console.log(`\n--dry-run: Found ${outCount} players with "Out" status. No DB changes made.`);
  } else {
    console.log(`\nDone. Updated ${updated} players. ${outCount} marked as OUT.`);
  }

  await pool.end();
}

syncInjuries().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
