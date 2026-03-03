const pool = require('../db');

async function create(leagueId, memberId, playerId, pickNumber, round) {
  const result = await pool.query(
    `INSERT INTO draft_picks (league_id, member_id, player_id, pick_number, round)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [leagueId, memberId, playerId, pickNumber, round]
  );
  return result.rows[0];
}

async function findByLeague(leagueId) {
  const result = await pool.query(
    `SELECT dp.*, p.name AS player_name, p.position, p.jersey_number,
            tt.name AS team_name, tt.external_id AS team_external_id,
            u.username, lm.draft_position,
            pp.name AS paired_player_name, pp.position AS paired_player_position,
            ptt.name AS paired_team_name, ptt.external_id AS paired_team_external_id
     FROM draft_picks dp
     JOIN players p ON p.id = dp.player_id
     JOIN tournament_teams tt ON tt.id = p.team_id
     JOIN league_members lm ON lm.id = dp.member_id
     JOIN users u ON u.id = lm.user_id
     LEFT JOIN players pp ON pp.id = dp.paired_player_id
     LEFT JOIN tournament_teams ptt ON ptt.id = pp.team_id
     WHERE dp.league_id = $1
     ORDER BY dp.pick_number`,
    [leagueId]
  );
  return result.rows;
}

async function isPlayerDrafted(leagueId, playerId) {
  const result = await pool.query(
    `SELECT 1 FROM draft_picks WHERE league_id = $1 AND (player_id = $2 OR paired_player_id = $2)`,
    [leagueId, playerId]
  );
  return result.rowCount > 0;
}

async function countByLeague(leagueId) {
  const result = await pool.query(
    `SELECT COUNT(*) FROM draft_picks WHERE league_id = $1`,
    [leagueId]
  );
  return parseInt(result.rows[0].count, 10);
}

module.exports = { create, findByLeague, isPlayerDrafted, countByLeague };
