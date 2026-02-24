const pool = require('../db');

async function findAll({ search, teamName, page = 1, limit = 100 } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (search) {
    conditions.push(`p.name ILIKE $${idx++}`);
    values.push(`%${search}%`);
  }
  if (teamName) {
    conditions.push(`tt.name ILIKE $${idx++}`);
    values.push(`%${teamName}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  // Run count query and data query in parallel
  const [countResult, dataResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total
       FROM players p
       JOIN tournament_teams tt ON tt.id = p.team_id
       ${where}`,
      values
    ),
    pool.query(
      `SELECT p.*, tt.name AS team_name, tt.seed, tt.region,
              tt.is_eliminated AS team_is_eliminated, tt.wins,
              tt.external_id AS team_external_id,
              COALESCE(gs.games_played, 0)::int AS games_played,
              COALESCE(gs.total_points, 0)::int AS total_points
       FROM players p
       JOIN tournament_teams tt ON tt.id = p.team_id
       LEFT JOIN (
         SELECT player_id, COUNT(*) AS games_played, SUM(points) AS total_points
         FROM player_game_stats
         GROUP BY player_id
       ) gs ON gs.player_id = p.id
       ${where}
       ORDER BY p.season_ppg DESC NULLS LAST, p.name
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    ),
  ]);

  return { rows: dataResult.rows, total: parseInt(countResult.rows[0].total, 10) };
}

async function findById(id) {
  const result = await pool.query(
    `SELECT p.*, tt.name AS team_name, tt.seed, tt.region,
            tt.is_eliminated AS team_is_eliminated, tt.wins,
            tt.external_id AS team_external_id
     FROM players p
     JOIN tournament_teams tt ON tt.id = p.team_id
     WHERE p.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function findByTeamId(teamId) {
  const result = await pool.query(
    `SELECT * FROM players WHERE team_id = $1 ORDER BY name`,
    [teamId]
  );
  return result.rows;
}

async function eliminateByTeam(teamId) {
  await pool.query(
    `UPDATE players SET is_eliminated = true WHERE team_id = $1`,
    [teamId]
  );
}

async function findByExternalId(externalId) {
  const result = await pool.query(
    `SELECT * FROM players WHERE external_id = $1`,
    [externalId]
  );
  return result.rows[0] || null;
}

async function upsert(name, teamId, position, jerseyNumber, externalId) {
  const result = await pool.query(
    `INSERT INTO players (name, team_id, position, jersey_number, external_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (external_id) DO UPDATE
       SET name = EXCLUDED.name, team_id = EXCLUDED.team_id,
           position = EXCLUDED.position, jersey_number = EXCLUDED.jersey_number
     RETURNING *`,
    [name, teamId, position, jerseyNumber, externalId]
  );
  return result.rows[0];
}

module.exports = { findAll, findById, findByExternalId, findByTeamId, eliminateByTeam, upsert };
