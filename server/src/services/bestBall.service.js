const pool = require('../db');
const bestBallModel = require('../models/bestBall.model');
const pricingService = require('./bestBallPricing.service');

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
  if (existing) return existing;

  // Check if tournament teams + players exist
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM tournament_teams'
  );
  if (rows[0].count === 0) return null;

  // Auto-create an open contest
  const lockDate = new Date();
  lockDate.setDate(lockDate.getDate() + 7);

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

async function addPlayer(entryId, playerId) {
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

    // Check not already on roster
    const dupResult = await client.query(
      'SELECT id FROM best_ball_roster_players WHERE entry_id = $1 AND player_id = $2',
      [entryId, playerId]
    );
    if (dupResult.rows.length > 0) {
      throw createError('Player already on roster', 400);
    }

    // Look up price
    const priceResult = await client.query(
      'SELECT price FROM best_ball_player_prices WHERE contest_id = $1 AND player_id = $2',
      [entry.contest_id, playerId]
    );
    if (!priceResult.rows[0]) throw createError('Player not found in this contest', 404);
    const price = priceResult.rows[0].price;

    // Check budget
    if (entry.budget_remaining < price) {
      throw createError('Insufficient budget', 400);
    }

    // Insert roster player
    await client.query(
      'INSERT INTO best_ball_roster_players (entry_id, player_id, purchase_price) VALUES ($1, $2, $3)',
      [entryId, playerId, price]
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

    // Remove player
    const removeResult = await client.query(
      'DELETE FROM best_ball_roster_players WHERE entry_id = $1 AND player_id = $2 RETURNING purchase_price',
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
  // Bulk update all complete entries' scores in one query
  await pool.query(
    `UPDATE best_ball_entries e
     SET total_score = COALESCE(sub.total, 0), updated_at = NOW()
     FROM (
       SELECT rp.entry_id, SUM(pgs.points)::int AS total
       FROM best_ball_roster_players rp
       JOIN player_game_stats pgs ON pgs.player_id = rp.player_id
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

  // Get points per player from game stats
  const statsResult = await pool.query(
    `SELECT rp.player_id,
            COALESCE(SUM(pgs.points), 0)::int AS total_points,
            json_agg(
              json_build_object('round', pgs.tournament_round, 'points', pgs.points)
              ORDER BY pgs.game_date
            ) FILTER (WHERE pgs.id IS NOT NULL) AS round_points
     FROM best_ball_roster_players rp
     LEFT JOIN player_game_stats pgs ON pgs.player_id = rp.player_id
     WHERE rp.entry_id = $1
     GROUP BY rp.player_id`,
    [entryId]
  );

  const statsMap = {};
  for (const row of statsResult.rows) {
    statsMap[row.player_id] = {
      totalPoints: row.total_points,
      roundPoints: row.round_points || [],
    };
  }

  const rosterWithStats = roster.map((p) => ({
    ...p,
    total_points: statsMap[p.player_id]?.totalPoints || 0,
    round_points: statsMap[p.player_id]?.roundPoints || [],
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
