const externalApi = require('../services/externalApi.service');
const playerGameStats = require('../models/playerGameStats.model');
const playerModel = require('../models/player.model');
const teamModel = require('../models/tournamentTeam.model');
const eliminationService = require('../services/elimination.service');
const bestBallService = require('../services/bestBall.service');
const bestBallModel = require('../models/bestBall.model');

/**
 * Main sync job.
 *
 * Algorithm:
 *  1. Fetch today's game list from the external API.
 *  2. Skip upcoming games (no box score yet).
 *  3. For each in-progress or final game:
 *     a. Fetch the box score.
 *     b. Upsert Player_Game_Stats for every player (idempotent via external_game_id).
 *  4. For final games only:
 *     a. Eliminate the losing team (and their players) if not already eliminated.
 *     b. Increment the winning team's win count.
 *
 * Error handling: top-level API failures are caught and logged so the scheduler
 * continues running. Per-game errors are also isolated so one bad game does
 * not abort the rest of the batch.
 */
async function runSyncJob() {
  let games;
  try {
    games = await externalApi.fetchTodaysGames();
  } catch (err) {
    console.error('[statSync] Failed to fetch today\'s games:', err.message);
    return;
  }

  for (const game of games) {
    if (game.status === 'upcoming') continue;

    try {
      await processGame(game);
    } catch (err) {
      console.error(
        `[statSync] Error processing game ${game.external_game_id}:`,
        err.message
      );
    }
  }
}

async function processGame(game) {
  const boxScore = await externalApi.fetchGameBoxScore(game.external_game_id, game.tournament_round);
  const isFirstFour = boxScore.tournament_round === 'First Four';

  // Detect suspicious all-zero box scores for final games (ESPN API quirk
  // when games transition status — can return empty/zero stats briefly).
  const allPlayers = boxScore.teams.flatMap((t) => t.players);
  const totalPoints = allPlayers.reduce((sum, p) => sum + p.points, 0);
  const skipStats = allPlayers.length > 0 && totalPoints === 0 && game.status === 'final';
  if (skipStats) {
    console.warn(
      `[statSync] Suspicious: all ${allPlayers.length} players have 0 points for final game ${game.external_game_id} — skipping stat upserts`
    );
  }

  // Build a map of external_team_id → internal team record so we can resolve
  // opponent_team_id for each player's stat entry.
  const teamRecords = {};
  for (const teamData of boxScore.teams) {
    const team = await teamModel.findByExternalId(teamData.external_team_id);
    if (team) teamRecords[teamData.external_team_id] = team;
  }

  // Upsert stats for each player in each team.
  // First Four play-in games have no scoring impact — skip stat insertion.
  // Also skip when ESPN returns suspicious all-zero data for final games.
  if (!isFirstFour && !skipStats) {
    for (const teamData of boxScore.teams) {
      const opponentExternalId = boxScore.teams
        .map((t) => t.external_team_id)
        .find((id) => id !== teamData.external_team_id);

      const opponentTeam = opponentExternalId ? teamRecords[opponentExternalId] : null;

      for (const playerData of teamData.players) {
        const player = await playerModel.findByExternalId(playerData.external_player_id);
        if (!player) continue;

        await playerGameStats.create(
          player.id,
          boxScore.game_date,
          opponentTeam ? opponentTeam.id : null,
          playerData.points,
          boxScore.tournament_round,
          game.external_game_id
        );
      }
    }
  }

  // Handle post-game events only when the game is final
  if (game.status === 'final') {
    if (game.loser_external_id) {
      const loserTeam = await teamModel.findByExternalId(game.loser_external_id);
      if (loserTeam && !loserTeam.is_eliminated) {
        await eliminationService.eliminateTeam(loserTeam.id, boxScore.tournament_round);
      }
    }

    if (game.winner_external_id) {
      const winnerTeam = await teamModel.findByExternalId(game.winner_external_id);
      if (winnerTeam) {
        if (isFirstFour) {
          // Direct win update for FF (no stats to derive from)
          await teamModel.updateWins(winnerTeam.id, 1);
        } else {
          // Use stat-derived count (idempotent) rather than wins + 1 (would
          // double-count on every subsequent sync after the game is final).
          await teamModel.updateWinsFromStats(winnerTeam.id);
        }
      }
    }
  }

  // Auto-transition Best Ball contest to 'live' when the lock date has passed.
  // The lock_date is set to 30 min before R64 tip-off, so First Four games
  // (played days earlier) will never trigger this.
  try {
    const activeContest = await bestBallModel.getActiveContest();
    if (activeContest) {
      if (activeContest.status === 'open') {
        const now = new Date();
        const lockDate = activeContest.lock_date ? new Date(activeContest.lock_date) : null;
        if (lockDate && now >= lockDate) {
          console.log('[statSync] Lock date reached — locking Best Ball contest');
          await bestBallModel.updateContestStatus(activeContest.id, 'live');
        }
      }
      if (['open', 'live', 'locked'].includes(activeContest.status)) {
        await bestBallService.updateScores(activeContest.id);
      }
    }
  } catch (err) {
    console.error('[statSync] Failed to update Best Ball scores:', err.message);
  }
}

/**
 * Backfill sync for a specific date (YYYYMMDD string).
 * Fetches all games for that date and processes them.
 */
async function runSyncForDate(dateStr) {
  let games;
  try {
    games = await externalApi.fetchGamesByDate(dateStr);
  } catch (err) {
    console.error(`[statSync] Failed to fetch games for ${dateStr}:`, err.message);
    return { date: dateStr, gamesProcessed: 0, error: err.message };
  }

  let processed = 0;
  for (const game of games) {
    if (game.status === 'upcoming') continue;
    try {
      await processGame(game);
      processed++;
    } catch (err) {
      console.error(`[statSync] Error processing game ${game.external_game_id} on ${dateStr}:`, err.message);
    }
  }

  return { date: dateStr, gamesFound: games.length, gamesProcessed: processed };
}

module.exports = { runSyncJob, runSyncForDate };
