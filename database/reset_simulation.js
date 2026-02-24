/**
 * Reset simulation: clears game results and restores all teams/players to alive.
 *
 * Usage:
 *   node database/reset_simulation.js                # reset simulation only (keeps drafts)
 *   node database/reset_simulation.js --include-drafts  # also reset drafts back to pre_draft
 *
 * Run from the project root. Useful for testing the full tournament flow
 * before the real bracket is announced.
 */

require('dotenv').config({ path: `${__dirname}/../server/.env` });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function reset() {
  const includeDrafts = process.argv.includes('--include-drafts');

  console.log('\nResetting simulation...\n');

  // 1. Clear all game stats
  const stats = await pool.query('DELETE FROM player_game_stats');
  console.log(`  Deleted ${stats.rowCount} player game stat rows.`);

  // 2. Reset tournament teams
  const teams = await pool.query(
    `UPDATE tournament_teams
     SET is_eliminated = false, eliminated_in_round = NULL, wins = 0
     WHERE is_eliminated = true OR wins > 0`
  );
  console.log(`  Reset ${teams.rowCount} tournament teams.`);

  // 3. Reset players
  const players = await pool.query(
    `UPDATE players SET is_eliminated = false WHERE is_eliminated = true`
  );
  console.log(`  Reset ${players.rowCount} eliminated players.`);

  if (includeDrafts) {
    console.log('');

    // 4. Clear draft picks
    const picks = await pool.query('DELETE FROM draft_picks');
    console.log(`  Deleted ${picks.rowCount} draft picks.`);

    // 5. Reset member draft positions
    const members = await pool.query(
      `UPDATE league_members SET draft_position = NULL WHERE draft_position IS NOT NULL`
    );
    console.log(`  Cleared draft position for ${members.rowCount} league members.`);

    // 6. Reset league draft status
    const leagues = await pool.query(
      `UPDATE leagues SET draft_status = 'pre_draft' WHERE draft_status != 'pre_draft'`
    );
    console.log(`  Reset draft status for ${leagues.rowCount} leagues.`);
  }

  // Summary
  const remaining = await pool.query(
    `SELECT COUNT(*)::int AS count FROM tournament_teams WHERE is_eliminated = false`
  );
  console.log(`\nDone. ${remaining.rows[0].count} teams ready for simulation.`);

  if (includeDrafts) {
    console.log('All drafts reset to pre_draft. You can re-draft and re-simulate.');
  } else {
    console.log('Draft picks preserved. Run "npm run simulate --workspace=server -- --all" to re-simulate.');
  }

  await pool.end();
}

reset().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
