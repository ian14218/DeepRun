/**
 * Seed players for the 4 First Four teams that were added manually.
 * Fetches rosters + season stats from ESPN.
 */
require('dotenv').config({ path: `${__dirname}/../server/.env` });
const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEAMS = [
  { id: '72275ecc-3f60-49c1-a915-f483bf21bf50', ext: '44', name: 'American Eagles' },
  { id: '13b3e8d6-5598-46d8-b243-90e617ccfe9b', ext: '2598', name: 'Saint Francis Red Flash' },
  { id: '5043d3d8-71eb-44bb-949b-c61466d34cd5', ext: '21', name: 'San Diego State Aztecs' },
  { id: 'afe0b616-43ab-4d92-901e-5827199f2428', ext: '251', name: 'Texas Longhorns' },
];

async function fetchAndSeedPlayers(teamId, externalId, teamName) {
  const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${externalId}/roster`;
  const resp = await axios.get(rosterUrl);
  const athletes = resp.data.athletes || [];
  console.log(`${teamName}: found ${athletes.length} players`);

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

  // Fetch season stats for each player (same format as seed_tournament.js)
  const ESPN_STATS_BASE = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball';
  let statsUpdated = 0;
  for (const a of athletes) {
    try {
      const statsResp = await axios.get(`${ESPN_STATS_BASE}/athletes/${a.id}/stats`, { timeout: 5000 });
      const categories = statsResp.data.categories || [];
      const averages = categories.find((c) => c.displayName === 'Season Averages');
      if (!averages) continue;

      let values = averages.totals;
      if (!values || values.length === 0) {
        const statKeys = Object.keys(averages.statistics || {});
        if (statKeys.length > 0) {
          values = averages.statistics[statKeys[0]].stats;
        }
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

async function main() {
  for (const t of TEAMS) {
    await fetchAndSeedPlayers(t.id, t.ext, t.name);
  }
  await pool.end();
  console.log('Done seeding First Four players!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
