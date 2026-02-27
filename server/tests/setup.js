const path = require('path');
const fs = require('fs');
const pool = require('../src/db');

const MIGRATIONS_DIR = path.join(__dirname, '../../database/migrations');

async function runMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await pool.query(sql);
  }
}

async function truncateTables() {
  await pool.query(`
    TRUNCATE TABLE
      best_ball_roster_players,
      best_ball_entries,
      best_ball_player_prices,
      best_ball_contests,
      best_ball_config,
      draft_messages,
      player_game_stats,
      draft_picks,
      players,
      tournament_teams,
      league_members,
      leagues,
      users
    RESTART IDENTITY CASCADE
  `);
}

async function closePool() {
  await pool.end();
}

module.exports = { runMigrations, truncateTables, closePool };
