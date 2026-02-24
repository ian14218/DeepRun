const pool = require('../db');

// Map wins count to a human-readable round name
const ROUND_BY_WINS = {
  0: 'Round of 64',
  1: 'Round of 32',
  2: 'Sweet 16',
  3: 'Elite 8',
  4: 'Final Four',
  5: 'Championship',
  6: 'Champion',
};

function addCurrentRound(team) {
  return { ...team, current_round: ROUND_BY_WINS[team.wins] || 'Round of 64' };
}

async function findAll() {
  const result = await pool.query(
    `SELECT * FROM tournament_teams ORDER BY region, seed`
  );
  return result.rows.map(addCurrentRound);
}

async function findById(id) {
  const result = await pool.query(
    `SELECT * FROM tournament_teams WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? addCurrentRound(result.rows[0]) : null;
}

async function findByExternalId(externalId) {
  const result = await pool.query(
    `SELECT * FROM tournament_teams WHERE external_id = $1`,
    [externalId]
  );
  return result.rows[0] ? addCurrentRound(result.rows[0]) : null;
}

async function eliminate(id, round) {
  const result = await pool.query(
    `UPDATE tournament_teams
     SET is_eliminated = true, eliminated_in_round = $2
     WHERE id = $1
     RETURNING *`,
    [id, round]
  );
  return result.rows[0] ? addCurrentRound(result.rows[0]) : null;
}

async function updateWins(id, wins) {
  const result = await pool.query(
    `UPDATE tournament_teams SET wins = $2 WHERE id = $1 RETURNING *`,
    [id, wins]
  );
  return result.rows[0] ? addCurrentRound(result.rows[0]) : null;
}

/**
 * Sets wins to the count of distinct games in player_game_stats for this
 * team's players. Idempotent: running multiple times after the same game is
 * final always produces the correct win total.
 */
async function updateWinsFromStats(id) {
  const result = await pool.query(
    `UPDATE tournament_teams
     SET wins = (
       SELECT COUNT(DISTINCT pgs.external_game_id)::int
       FROM player_game_stats pgs
       JOIN players p ON p.id = pgs.player_id
       WHERE p.team_id = $1
     )
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return result.rows[0] ? addCurrentRound(result.rows[0]) : null;
}

async function upsert(name, seed, region, externalId) {
  const result = await pool.query(
    `INSERT INTO tournament_teams (name, seed, region, external_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (external_id) DO UPDATE
       SET name = EXCLUDED.name, seed = EXCLUDED.seed, region = EXCLUDED.region
     RETURNING *`,
    [name, seed, region, externalId]
  );
  return addCurrentRound(result.rows[0]);
}

module.exports = { findAll, findById, findByExternalId, eliminate, updateWins, updateWinsFromStats, upsert, ROUND_BY_WINS };
