const playerModel = require('../models/player.model');
const teamModel = require('../models/tournamentTeam.model');

function computeMaxRemainingGames(player) {
  // If the player's team is eliminated, no games remain
  if (player.is_eliminated || player.team_is_eliminated) return 0;
  // Total rounds in tournament = 6; remaining = 6 - wins already recorded for the team
  return Math.max(0, 6 - (player.wins || 0));
}

async function getPlayers(filters = {}) {
  const { page = 1, limit = 100 } = filters;
  const { rows, total } = await playerModel.findAll(filters);
  return {
    players: rows.map((p) => ({
      ...p,
      max_remaining_games: computeMaxRemainingGames(p),
      ppg: p.games_played > 0 ? +(p.total_points / p.games_played).toFixed(1) : 0,
    })),
    total,
    page: Number(page),
    limit: Number(limit),
  };
}

async function getTournamentTeams() {
  return teamModel.findAll();
}

module.exports = { getPlayers, getTournamentTeams };
