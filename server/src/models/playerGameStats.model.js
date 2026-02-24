const pool = require('../db');

async function create(playerId, gameDate, opponentTeamId, points, tournamentRound, externalGameId) {
  const result = await pool.query(
    `INSERT INTO player_game_stats
       (player_id, game_date, opponent_team_id, points, tournament_round, external_game_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (player_id, external_game_id) DO UPDATE
       SET points = EXCLUDED.points
     RETURNING *`,
    [playerId, gameDate, opponentTeamId, points, tournamentRound, externalGameId]
  );
  return result.rows[0];
}

async function findByPlayer(playerId) {
  const result = await pool.query(
    `SELECT * FROM player_game_stats WHERE player_id = $1 ORDER BY game_date`,
    [playerId]
  );
  return result.rows;
}

module.exports = { create, findByPlayer };
