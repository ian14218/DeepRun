const pool = require('../db');

async function calculateTeamScore(memberId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(pgs.points), 0)::int AS total_score
     FROM draft_picks dp
     LEFT JOIN player_game_stats pgs ON pgs.player_id IN (dp.player_id, dp.paired_player_id)
     WHERE dp.member_id = $1`,
    [memberId]
  );
  return result.rows[0].total_score;
}

async function getActivePlayerCount(memberId) {
  // A First Four pair counts as 1 active if EITHER player is not eliminated
  const result = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM draft_picks dp
     JOIN players p ON p.id = dp.player_id
     LEFT JOIN players pp ON pp.id = dp.paired_player_id
     WHERE dp.member_id = $1
       AND (p.is_eliminated = false OR (pp.id IS NOT NULL AND pp.is_eliminated = false))`,
    [memberId]
  );
  return result.rows[0].cnt;
}

async function getEliminatedPlayerCount(memberId) {
  // A First Four pair is eliminated only if BOTH are eliminated (or paired is null and primary is eliminated)
  const result = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM draft_picks dp
     JOIN players p ON p.id = dp.player_id
     LEFT JOIN players pp ON pp.id = dp.paired_player_id
     WHERE dp.member_id = $1
       AND p.is_eliminated = true
       AND (pp.id IS NULL OR pp.is_eliminated = true)`,
    [memberId]
  );
  return result.rows[0].cnt;
}

async function getStandings(leagueId) {
  const [result, champResult] = await Promise.all([
    pool.query(
      `SELECT
         lm.id AS member_id,
         lm.user_id,
         COALESCE(lm.team_name, u.username) AS team_name,
         u.username,
         COALESCE(SUM(pgs.points), 0)::int AS total_score,
         COUNT(DISTINCT CASE
           WHEN p.is_eliminated = false OR (pp.id IS NOT NULL AND pp.is_eliminated = false)
           THEN dp.id END)::int AS active_players,
         COUNT(DISTINCT CASE
           WHEN p.is_eliminated = true AND (pp.id IS NULL OR pp.is_eliminated = true)
           THEN dp.id END)::int AS eliminated_players,
         COUNT(DISTINCT CASE
           WHEN p.is_eliminated = false OR (pp.id IS NOT NULL AND pp.is_eliminated = false)
           THEN dp.id END)::int AS players_remaining
       FROM league_members lm
       JOIN users u ON u.id = lm.user_id
       LEFT JOIN draft_picks dp ON dp.member_id = lm.id
       LEFT JOIN players p ON p.id = dp.player_id
       LEFT JOIN players pp ON pp.id = dp.paired_player_id
       LEFT JOIN player_game_stats pgs ON pgs.player_id IN (dp.player_id, dp.paired_player_id)
       WHERE lm.league_id = $1
       GROUP BY lm.id, lm.user_id, lm.team_name, u.username
       ORDER BY total_score DESC`,
      [leagueId]
    ),
    pool.query(
      `SELECT EXISTS(
         SELECT 1 FROM player_game_stats WHERE tournament_round = 'Championship'
       ) AS completed`
    ),
  ]);
  const rows = result.rows;
  rows.tournament_completed = champResult.rows[0]?.completed || false;
  return rows;
}

async function getTeamRoster(leagueId, memberId) {
  // Fetch all drafted players with total points (include paired player points)
  const playersResult = await pool.query(
    `SELECT
       dp.pick_number,
       p.id AS player_id, p.name, p.position, p.jersey_number, p.is_eliminated,
       tt.name AS team_name, tt.seed, tt.region, tt.external_id AS team_external_id,
       dp.paired_player_id,
       pp.name AS paired_player_name, pp.position AS paired_player_position,
       pp.is_eliminated AS paired_is_eliminated,
       ptt.name AS paired_team_name, ptt.seed AS paired_team_seed,
       ptt.external_id AS paired_team_external_id,
       COALESCE(SUM(pgs.points), 0)::int AS total_points
     FROM draft_picks dp
     JOIN players p ON p.id = dp.player_id
     JOIN tournament_teams tt ON tt.id = p.team_id
     LEFT JOIN players pp ON pp.id = dp.paired_player_id
     LEFT JOIN tournament_teams ptt ON ptt.id = pp.team_id
     LEFT JOIN player_game_stats pgs ON pgs.player_id IN (dp.player_id, dp.paired_player_id)
     WHERE dp.member_id = $1 AND dp.league_id = $2
     GROUP BY dp.pick_number, dp.paired_player_id,
              p.id, p.name, p.position, p.jersey_number, p.is_eliminated,
              tt.name, tt.seed, tt.region, tt.external_id,
              pp.name, pp.position, pp.is_eliminated,
              ptt.name, ptt.seed, ptt.external_id
     ORDER BY p.is_eliminated ASC, dp.pick_number ASC`,
    [memberId, leagueId]
  );

  // Fetch per-round point breakdown for all players in this roster (include paired)
  const roundsResult = await pool.query(
    `SELECT pgs.player_id, pgs.tournament_round, SUM(pgs.points)::int AS points
     FROM draft_picks dp
     LEFT JOIN player_game_stats pgs ON pgs.player_id IN (dp.player_id, dp.paired_player_id)
     WHERE dp.member_id = $1 AND dp.league_id = $2 AND pgs.player_id IS NOT NULL
     GROUP BY pgs.player_id, pgs.tournament_round`,
    [memberId, leagueId]
  );

  // Build round breakdown map keyed by player_id
  const roundMap = {};
  for (const row of roundsResult.rows) {
    if (!roundMap[row.player_id]) roundMap[row.player_id] = {};
    roundMap[row.player_id][row.tournament_round] = row.points;
  }

  return playersResult.rows.map((p) => ({
    ...p,
    points_by_round: roundMap[p.player_id] || {},
    paired_points_by_round: p.paired_player_id ? (roundMap[p.paired_player_id] || {}) : {},
  }));
}

module.exports = {
  calculateTeamScore,
  getActivePlayerCount,
  getEliminatedPlayerCount,
  getStandings,
  getTeamRoster,
};
