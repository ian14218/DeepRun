const pool = require('../db');
const externalApi = require('./externalApi.service');

/**
 * getScoreboard(leagueId)
 *
 * Returns today's tournament games enriched with info about which
 * drafted players in this league are playing.
 */
async function getScoreboard(leagueId) {
  // Fetch today's games from ESPN
  const games = await externalApi.fetchTodaysGames();

  if (games.length === 0) return [];

  // Collect all team external IDs from today's games
  const gameTeamIds = new Set();
  for (const game of games) {
    for (const team of game.teams || []) {
      if (team.external_team_id) gameTeamIds.add(team.external_team_id);
    }
  }

  if (gameTeamIds.size === 0) return games;

  // Find all drafted players in this league whose teams are playing today
  const { rows: draftedPlayers } = await pool.query(
    `SELECT
       dp.member_id,
       p.id AS player_id,
       p.name AS player_name,
       p.position,
       p.is_eliminated,
       tt.external_id AS team_external_id,
       tt.name AS team_name,
       u.username AS drafter_username,
       COALESCE(
         (SELECT SUM(pgs.points)::int FROM player_game_stats pgs WHERE pgs.player_id = p.id),
         0
       ) AS total_points
     FROM draft_picks dp
     JOIN players p ON p.id = dp.player_id
     JOIN tournament_teams tt ON tt.id = p.team_id
     JOIN league_members lm ON lm.id = dp.member_id
     JOIN users u ON u.id = lm.user_id
     WHERE dp.league_id = $1
       AND tt.external_id = ANY($2::text[])`,
    [leagueId, Array.from(gameTeamIds)]
  );

  // Group drafted players by team external ID
  const playersByTeam = {};
  for (const p of draftedPlayers) {
    if (!playersByTeam[p.team_external_id]) playersByTeam[p.team_external_id] = [];
    playersByTeam[p.team_external_id].push(p);
  }

  // Enrich each game with drafted player info
  return games.map((game) => ({
    ...game,
    teams: (game.teams || []).map((team) => ({
      ...team,
      drafted_players: playersByTeam[team.external_team_id] || [],
    })),
  }));
}

module.exports = { getScoreboard };
