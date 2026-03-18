const pool = require('../db');
const externalApi = require('./externalApi.service');

/**
 * getScoreboard(leagueId)
 *
 * Returns today's tournament games in a flat format enriched with info about
 * which drafted players in this league are playing, including per-game points.
 */
async function getScoreboard(leagueId) {
  // Fetch today's games from ESPN
  const games = await externalApi.fetchTodaysGames();

  if (games.length === 0) return [];

  // Collect all team external IDs and game IDs from today's games
  const gameTeamIds = new Set();
  const gameIds = [];
  for (const game of games) {
    gameIds.push(game.external_game_id);
    for (const team of game.teams || []) {
      if (team.external_team_id) gameTeamIds.add(team.external_team_id);
    }
  }

  if (gameTeamIds.size === 0) return flattenGames(games, {}, {});

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
       u.username AS drafter_username
     FROM draft_picks dp
     JOIN players p ON p.id = dp.player_id
     JOIN tournament_teams tt ON tt.id = p.team_id
     JOIN league_members lm ON lm.id = dp.member_id
     JOIN users u ON u.id = lm.user_id
     WHERE dp.league_id = $1
       AND tt.external_id = ANY($2::text[])`,
    [leagueId, Array.from(gameTeamIds)]
  );

  // Fetch per-game points for these players in today's games
  const playerIds = draftedPlayers.map((p) => p.player_id);
  const pointsByPlayerGame = {};
  if (playerIds.length > 0 && gameIds.length > 0) {
    const { rows: gameStats } = await pool.query(
      `SELECT pgs.player_id, pgs.points, pgs.external_game_id
       FROM player_game_stats pgs
       WHERE pgs.external_game_id = ANY($1::text[])
         AND pgs.player_id = ANY($2::uuid[])`,
      [gameIds, playerIds]
    );
    for (const stat of gameStats) {
      pointsByPlayerGame[`${stat.player_id}-${stat.external_game_id}`] = stat.points;
    }
  }

  // Group drafted players by team external ID
  const playersByTeam = {};
  for (const p of draftedPlayers) {
    if (!playersByTeam[p.team_external_id]) playersByTeam[p.team_external_id] = [];
    playersByTeam[p.team_external_id].push(p);
  }

  return flattenGames(games, playersByTeam, pointsByPlayerGame);
}

/**
 * Transform ESPN-shaped games into the flat format the Scoreboard UI expects.
 */
function flattenGames(games, playersByTeam, pointsByPlayerGame) {
  return games.map((game) => {
    const homeTeam = (game.teams || []).find((t) => t.is_home) || game.teams?.[0];
    const awayTeam = (game.teams || []).find((t) => !t.is_home) || game.teams?.[1];

    // Collect all drafted players across both teams into a flat array
    const players = [];
    for (const team of game.teams || []) {
      const teamDrafted = playersByTeam[team.external_team_id] || [];
      for (const p of teamDrafted) {
        const gamePoints =
          pointsByPlayerGame[`${p.player_id}-${game.external_game_id}`] ?? 0;
        players.push({
          player_id: p.player_id,
          name: p.player_name,
          team_name: p.team_name,
          team_external_id: p.team_external_id,
          position: p.position,
          points: gamePoints,
          drafter_username: p.drafter_username,
        });
      }
    }

    return {
      id: game.external_game_id,
      external_game_id: game.external_game_id,
      name: game.name,
      short_name: game.short_name,
      status: game.status,
      status_detail: game.status_detail,
      tournament_round: game.tournament_round,
      start_time: game.start_time,
      home_team: homeTeam?.name || '',
      away_team: awayTeam?.name || '',
      home_team_external_id: homeTeam?.external_team_id || '',
      away_team_external_id: awayTeam?.external_team_id || '',
      home_score: homeTeam?.score ?? 0,
      away_score: awayTeam?.score ?? 0,
      players,
    };
  });
}

module.exports = { getScoreboard };
