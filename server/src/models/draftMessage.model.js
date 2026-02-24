const pool = require('../db');

async function create(leagueId, userId, message) {
  const result = await pool.query(
    `INSERT INTO draft_messages (league_id, user_id, message)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [leagueId, userId, message]
  );
  return result.rows[0];
}

async function findByLeague(leagueId, limit = 100) {
  const result = await pool.query(
    `SELECT dm.*, u.username
     FROM draft_messages dm
     JOIN users u ON u.id = dm.user_id
     WHERE dm.league_id = $1
     ORDER BY dm.created_at ASC
     LIMIT $2`,
    [leagueId, limit]
  );
  return result.rows;
}

module.exports = { create, findByLeague };
