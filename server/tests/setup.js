const path = require('path');
const fs = require('fs');
const pool = require('../src/db');

const MIGRATION_FILE = path.join(
  __dirname,
  '../../database/migrations/001_initial_schema.sql'
);

async function runMigrations() {
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  await pool.query(sql);
}

async function truncateTables() {
  await pool.query(`
    TRUNCATE TABLE
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
