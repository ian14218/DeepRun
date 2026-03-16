const pool = require('../db');
const bestBallModel = require('../models/bestBall.model');
const pricingService = require('./bestBallPricing.service');

// Round of 64 tip-off times (Eastern) by tournament year.
// The lock date defaults to 30 minutes before the first R64 game so rosters
// are locked before scoring begins (First Four games have no scoring impact).
const R64_TIPOFF = {
  2025: '2025-03-20T12:15:00-04:00',
  2026: '2026-03-19T12:15:00-04:00',
};

function getLockDate() {
  const year = new Date().getFullYear();
  const tipoff = R64_TIPOFF[year];
  if (tipoff) {
    // Lock 30 minutes before first tip-off
    return new Date(new Date(tipoff).getTime() - 30 * 60 * 1000);
  }
  // Fallback: 7 days from now
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 7);
  return fallback;
}

function createError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Returns the active contest, auto-creating one (with generated prices)
 * if tournament data exists but no contest does yet.
 */
async function ensureActiveContest() {
  const existing = await bestBallModel.getActiveContest();
  // Return the most recent contest even if completed (so users can see results)
  if (existing) return existing;

  // Check if tournament teams + players exist
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM tournament_teams'
  );
  if (rows[0].count === 0) return null;

  // Auto-create an open contest — lock before Round of 64 tip-off
  const lockDate = getLockDate();

  const contest = await bestBallModel.createContest({
    name: 'March Madness Best Ball',
    status: 'open',
    budget: 8000,
    roster_size: 8,
    lock_date: lockDate.toISOString(),
  });

  // Generate player prices from tournament data
  await pricingService.generatePrices(contest.id);

  return contest;
}

async function createEntry(contestId, userId) {
  const contest = await bestBallModel.getContestById(contestId);
  if (!contest) throw createError('Contest not found', 404);
  if (contest.status !== 'open') throw createError('Contest is not open for entries', 400);

  const existing = await bestBallModel.getUserEntry(contestId, userId);
  if (existing) throw createError('You already have an entry in this contest', 400);

  return bestBallModel.createEntry(contestId, userId, contest.budget);
}

async function addPlayer(entryId, playerId, inputPairedPlayerId = null) {
  let pairedPlayerId = inputPairedPlayerId;

  // Block adding eliminated players
  const playerCheck = await pool.query(
    `SELECT p.is_eliminated, tt.is_first_four, tt.first_four_partner_id, tt.is_eliminated AS team_eliminated
     FROM players p JOIN tournament_teams tt ON tt.id = p.team_id WHERE p.id = $1`,
    [playerId]
  );
  const playerInfo = playerCheck.rows[0];
  if (!playerInfo) throw createError('Player not found', 404);
  if (playerInfo.is_eliminated) throw createError('Cannot add an eliminated player', 400);

  // First Four pairing: only required if the partner team is still alive
  const partnerAlive = playerInfo.is_first_four && playerInfo.first_four_partner_id
    ? await pool.query('SELECT is_eliminated FROM tournament_teams WHERE id = $1', [playerInfo.first_four_partner_id])
        .then(r => r.rows[0] && !r.rows[0].is_eliminated)
    : false;

  if (playerInfo.is_first_four && partnerAlive) {
    if (!pairedPlayerId) throw createError('First Four player requires a paired player from the partner team', 400);
    const pairedCheck = await pool.query('SELECT team_id, is_eliminated FROM players WHERE id = $1', [pairedPlayerId]);
    if (!pairedCheck.rows[0] || pairedCheck.rows[0].team_id !== playerInfo.first_four_partner_id) {
      throw createError('Paired player must be from the First Four partner team', 400);
    }
    if (pairedCheck.rows[0].is_eliminated) throw createError('Cannot add an eliminated paired player', 400);
  } else if (pairedPlayerId && !(playerInfo.is_first_four && !partnerAlive)) {
    throw createError('Cannot pair a player who is not in the First Four', 400);
  }

  // If partner is eliminated, clear pairedPlayerId (First Four resolved)
  if (playerInfo.is_first_four && !partnerAlive) {
    pairedPlayerId = null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the entry row
    const entryResult = await client.query(
      'SELECT e.*, c.status, c.roster_size, c.id AS contest_id FROM best_ball_entries e JOIN best_ball_contests c ON c.id = e.contest_id WHERE e.id = $1 FOR UPDATE',
      [entryId]
    );
    const entry = entryResult.rows[0];
    if (!entry) throw createError('Entry not found', 404);
    if (entry.status !== 'open') throw createError('Contest is not open', 400);

    // Check roster not full
    const countResult = await client.query(
      'SELECT COUNT(*)::int AS count FROM best_ball_roster_players WHERE entry_id = $1',
      [entryId]
    );
    if (countResult.rows[0].count >= entry.roster_size) {
      throw createError('Roster is full', 400);
    }

    // Check not already on roster (check both columns for primary and paired)
    const dupResult = await client.query(
      'SELECT id FROM best_ball_roster_players WHERE entry_id = $1 AND (player_id = $2 OR paired_player_id = $2)',
      [entryId, playerId]
    );
    if (dupResult.rows.length > 0) {
      throw createError('Player already on roster', 400);
    }

    if (pairedPlayerId) {
      const dupPairedResult = await client.query(
        'SELECT id FROM best_ball_roster_players WHERE entry_id = $1 AND (player_id = $2 OR paired_player_id = $2)',
        [entryId, pairedPlayerId]
      );
      if (dupPairedResult.rows.length > 0) {
        throw createError('Paired player already on roster', 400);
      }
    }

    // Look up price — for First Four pairs, use the higher of the two prices
    const priceResult = await client.query(
      'SELECT price FROM best_ball_player_prices WHERE contest_id = $1 AND player_id = $2',
      [entry.contest_id, playerId]
    );
    if (!priceResult.rows[0]) throw createError('Player not found in this contest', 404);
    let price = priceResult.rows[0].price;

    if (pairedPlayerId) {
      const pairedPriceResult = await client.query(
        'SELECT price FROM best_ball_player_prices WHERE contest_id = $1 AND player_id = $2',
        [entry.contest_id, pairedPlayerId]
      );
      if (pairedPriceResult.rows[0]) {
        price = Math.max(price, pairedPriceResult.rows[0].price);
      }
    }

    // Check budget
    if (entry.budget_remaining < price) {
      throw createError('Insufficient budget', 400);
    }

    // Insert roster player with paired_player_id
    await client.query(
      'INSERT INTO best_ball_roster_players (entry_id, player_id, purchase_price, paired_player_id) VALUES ($1, $2, $3, $4)',
      [entryId, playerId, price, pairedPlayerId]
    );

    // Update budget and completeness
    const newBudget = entry.budget_remaining - price;
    const newCount = countResult.rows[0].count + 1;
    const isComplete = newCount >= entry.roster_size;

    const updatedEntry = await client.query(
      'UPDATE best_ball_entries SET budget_remaining = $1, is_complete = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [newBudget, isComplete, entryId]
    );

    await client.query('COMMIT');
    return updatedEntry.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function removePlayer(entryId, playerId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock entry and check contest status
    const entryResult = await client.query(
      'SELECT e.*, c.status FROM best_ball_entries e JOIN best_ball_contests c ON c.id = e.contest_id WHERE e.id = $1 FOR UPDATE',
      [entryId]
    );
    const entry = entryResult.rows[0];
    if (!entry) throw createError('Entry not found', 404);
    if (entry.status !== 'open') throw createError('Contest is not open', 400);

    // Remove player (removing either primary or paired player removes the whole pair)
    const removeResult = await client.query(
      'DELETE FROM best_ball_roster_players WHERE entry_id = $1 AND (player_id = $2 OR paired_player_id = $2) RETURNING purchase_price',
      [entryId, playerId]
    );
    if (removeResult.rows.length === 0) {
      throw createError('Player not on roster', 404);
    }

    const refund = removeResult.rows[0].purchase_price;

    // Update budget and mark incomplete
    const updatedEntry = await client.query(
      'UPDATE best_ball_entries SET budget_remaining = budget_remaining + $1, is_complete = false, updated_at = NOW() WHERE id = $2 RETURNING *',
      [refund, entryId]
    );

    await client.query('COMMIT');
    return updatedEntry.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteEntry(entryId, userId) {
  const entry = await bestBallModel.getEntryById(entryId);
  if (!entry) throw createError('Entry not found', 404);
  if (entry.user_id !== userId) throw createError('Not your entry', 403);

  const contest = await bestBallModel.getContestById(entry.contest_id);
  if (contest.status !== 'open') throw createError('Contest is not open', 400);

  await bestBallModel.deleteEntry(entryId);
}

async function updateScores(contestId) {
  // Bulk update all complete entries' scores in one query (include paired player stats)
  await pool.query(
    `UPDATE best_ball_entries e
     SET total_score = COALESCE(sub.total, 0), updated_at = NOW()
     FROM (
       SELECT rp.entry_id,
              (COALESCE(SUM(pgs1.points), 0) + COALESCE(SUM(pgs2.points), 0))::int AS total
       FROM best_ball_roster_players rp
       LEFT JOIN player_game_stats pgs1 ON pgs1.player_id = rp.player_id
       LEFT JOIN player_game_stats pgs2 ON pgs2.player_id = rp.paired_player_id
       GROUP BY rp.entry_id
     ) sub
     WHERE e.id = sub.entry_id
       AND e.contest_id = $1
       AND e.is_complete = true`,
    [contestId]
  );
}

async function getLeaderboard(contestId, { page = 1, limit = 50 } = {}) {
  const offset = (page - 1) * limit;
  return bestBallModel.getLeaderboard(contestId, { limit, offset });
}

async function getEntryDetail(entryId) {
  const entry = await bestBallModel.getEntryById(entryId);
  if (!entry) throw createError('Entry not found', 404);

  const roster = await bestBallModel.getRoster(entryId);

  // Get points per player from game stats (include paired player stats)
  const statsResult = await pool.query(
    `SELECT rp.player_id, rp.paired_player_id,
            COALESCE(SUM(pgs1.points), 0)::int AS primary_points,
            COALESCE(SUM(pgs2.points), 0)::int AS paired_points,
            json_agg(
              json_build_object('round', pgs1.tournament_round, 'points', pgs1.points)
              ORDER BY pgs1.game_date
            ) FILTER (WHERE pgs1.id IS NOT NULL) AS round_points,
            json_agg(
              json_build_object('round', pgs2.tournament_round, 'points', pgs2.points)
              ORDER BY pgs2.game_date
            ) FILTER (WHERE pgs2.id IS NOT NULL) AS paired_round_points
     FROM best_ball_roster_players rp
     LEFT JOIN player_game_stats pgs1 ON pgs1.player_id = rp.player_id
     LEFT JOIN player_game_stats pgs2 ON pgs2.player_id = rp.paired_player_id
     WHERE rp.entry_id = $1
     GROUP BY rp.player_id, rp.paired_player_id`,
    [entryId]
  );

  const statsMap = {};
  for (const row of statsResult.rows) {
    statsMap[row.player_id] = {
      totalPoints: row.primary_points + row.paired_points,
      roundPoints: row.round_points || [],
      pairedRoundPoints: row.paired_round_points || [],
    };
  }

  const rosterWithStats = roster.map((p) => ({
    ...p,
    total_points: statsMap[p.player_id]?.totalPoints || 0,
    round_points: statsMap[p.player_id]?.roundPoints || [],
    paired_round_points: statsMap[p.player_id]?.pairedRoundPoints || [],
  }));

  const rank = await bestBallModel.getEntryRank(entryId);

  return {
    ...entry,
    roster: rosterWithStats,
    rank,
  };
}

module.exports = {
  ensureActiveContest,
  createEntry,
  addPlayer,
  removePlayer,
  deleteEntry,
  updateScores,
  getLeaderboard,
  getEntryDetail,
};
