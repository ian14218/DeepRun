const pool = require('../db');

// ─── Contest ─────────────────────────────────────────────────────────────────

async function createContest(data) {
  const result = await pool.query(
    `INSERT INTO best_ball_contests (name, status, budget, roster_size, lock_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.name, data.status || 'upcoming', data.budget || 8000, data.roster_size || 8, data.lock_date]
  );
  return result.rows[0];
}

async function getContestById(id) {
  const result = await pool.query(
    'SELECT * FROM best_ball_contests WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

async function getActiveContest() {
  const result = await pool.query(
    `SELECT * FROM best_ball_contests
     ORDER BY created_at DESC
     LIMIT 1`
  );
  return result.rows[0] || null;
}

async function updateContestStatus(id, status) {
  const result = await pool.query(
    `UPDATE best_ball_contests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return result.rows[0] || null;
}

// ─── Player Prices ───────────────────────────────────────────────────────────

async function upsertPlayerPrice(contestId, playerId, price) {
  const result = await pool.query(
    `INSERT INTO best_ball_player_prices (contest_id, player_id, price)
     VALUES ($1, $2, $3)
     ON CONFLICT (contest_id, player_id) DO UPDATE SET price = $3
     RETURNING *`,
    [contestId, playerId, price]
  );
  return result.rows[0];
}

async function getPlayerPrices(contestId, { search, minPrice, maxPrice, seed, sortBy, page = 1, limit = 50 } = {}) {
  const conditions = ['bp.contest_id = $1'];
  const values = [contestId];
  let idx = 2;

  if (search) {
    conditions.push(`p.name ILIKE $${idx++}`);
    values.push(`%${search}%`);
  }
  if (minPrice != null) {
    conditions.push(`bp.price >= $${idx++}`);
    values.push(minPrice);
  }
  if (maxPrice != null) {
    conditions.push(`bp.price <= $${idx++}`);
    values.push(maxPrice);
  }
  if (seed != null) {
    conditions.push(`tt.seed = $${idx++}`);
    values.push(seed);
  }

  const where = conditions.join(' AND ');

  let orderBy = 'bp.price DESC';
  if (sortBy === 'price_asc') orderBy = 'bp.price ASC';
  else if (sortBy === 'ppg') orderBy = 'p.season_ppg DESC NULLS LAST';
  else if (sortBy === 'seed') orderBy = 'tt.seed ASC';
  else if (sortBy === 'name') orderBy = 'p.name ASC';

  const offset = (page - 1) * limit;

  const [countResult, dataResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total
       FROM best_ball_player_prices bp
       JOIN players p ON p.id = bp.player_id
       JOIN tournament_teams tt ON tt.id = p.team_id
       WHERE ${where}`,
      values
    ),
    pool.query(
      `SELECT bp.id AS price_id, bp.price, bp.contest_id,
              p.id AS player_id, p.name, p.position, p.season_ppg, p.season_mpg,
              p.is_eliminated,
              tt.name AS team_name, tt.seed, tt.region, tt.external_id AS team_external_id
       FROM best_ball_player_prices bp
       JOIN players p ON p.id = bp.player_id
       JOIN tournament_teams tt ON tt.id = p.team_id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    ),
  ]);

  return {
    rows: dataResult.rows,
    total: parseInt(countResult.rows[0].total, 10),
  };
}

async function getPlayerPrice(contestId, playerId) {
  const result = await pool.query(
    'SELECT * FROM best_ball_player_prices WHERE contest_id = $1 AND player_id = $2',
    [contestId, playerId]
  );
  return result.rows[0] || null;
}

// ─── Entries ─────────────────────────────────────────────────────────────────

async function createEntry(contestId, userId, budget) {
  const result = await pool.query(
    `INSERT INTO best_ball_entries (contest_id, user_id, budget_remaining)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [contestId, userId, budget]
  );
  return result.rows[0];
}

async function getEntryById(id) {
  const result = await pool.query(
    `SELECT e.*, u.username
     FROM best_ball_entries e
     JOIN users u ON u.id = e.user_id
     WHERE e.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getUserEntry(contestId, userId) {
  const result = await pool.query(
    'SELECT * FROM best_ball_entries WHERE contest_id = $1 AND user_id = $2',
    [contestId, userId]
  );
  return result.rows[0] || null;
}

async function updateEntryScore(entryId, score) {
  const result = await pool.query(
    'UPDATE best_ball_entries SET total_score = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [score, entryId]
  );
  return result.rows[0] || null;
}

async function deleteEntry(entryId) {
  await pool.query('DELETE FROM best_ball_entries WHERE id = $1', [entryId]);
}

// ─── Roster ──────────────────────────────────────────────────────────────────

async function addPlayerToRoster(entryId, playerId, price) {
  const result = await pool.query(
    `INSERT INTO best_ball_roster_players (entry_id, player_id, purchase_price)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [entryId, playerId, price]
  );
  return result.rows[0];
}

async function removePlayerFromRoster(entryId, playerId) {
  const result = await pool.query(
    'DELETE FROM best_ball_roster_players WHERE entry_id = $1 AND player_id = $2 RETURNING *',
    [entryId, playerId]
  );
  return result.rows[0] || null;
}

async function getRoster(entryId) {
  const result = await pool.query(
    `SELECT rp.id, rp.player_id, rp.purchase_price, rp.created_at,
            p.name, p.position, p.season_ppg, p.season_mpg, p.is_eliminated,
            tt.name AS team_name, tt.seed, tt.region, tt.external_id AS team_external_id
     FROM best_ball_roster_players rp
     JOIN players p ON p.id = rp.player_id
     JOIN tournament_teams tt ON tt.id = p.team_id
     WHERE rp.entry_id = $1
     ORDER BY rp.purchase_price DESC`,
    [entryId]
  );
  return result.rows;
}

async function getRosterCount(entryId) {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS count FROM best_ball_roster_players WHERE entry_id = $1',
    [entryId]
  );
  return result.rows[0].count;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

async function getLeaderboard(contestId, { limit = 50, offset = 0 } = {}) {
  const [countResult, dataResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total FROM best_ball_entries
       WHERE contest_id = $1 AND is_complete = true`,
      [contestId]
    ),
    pool.query(
      `SELECT e.id, e.user_id, e.total_score, e.is_complete, e.budget_remaining,
              u.username,
              (SELECT COUNT(*)::int FROM best_ball_roster_players rp
               JOIN players p ON p.id = rp.player_id
               WHERE rp.entry_id = e.id AND p.is_eliminated = false) AS active_players,
              (SELECT COUNT(*)::int FROM best_ball_roster_players rp
               JOIN players p ON p.id = rp.player_id
               WHERE rp.entry_id = e.id AND p.is_eliminated = true) AS eliminated_players
       FROM best_ball_entries e
       JOIN users u ON u.id = e.user_id
       WHERE e.contest_id = $1 AND e.is_complete = true
       ORDER BY e.total_score DESC
       LIMIT $2 OFFSET $3`,
      [contestId, limit, offset]
    ),
  ]);

  return {
    rows: dataResult.rows,
    total: parseInt(countResult.rows[0].total, 10),
  };
}

async function getEntryRank(entryId) {
  const result = await pool.query(
    `SELECT rank FROM (
       SELECT e.id, RANK() OVER (ORDER BY e.total_score DESC) AS rank
       FROM best_ball_entries e
       WHERE e.contest_id = (SELECT contest_id FROM best_ball_entries WHERE id = $1)
         AND e.is_complete = true
     ) ranked
     WHERE ranked.id = $1`,
    [entryId]
  );
  return result.rows[0] ? parseInt(result.rows[0].rank, 10) : null;
}

// ─── Config ──────────────────────────────────────────────────────────────────

async function getConfig(key) {
  const result = await pool.query(
    'SELECT value FROM best_ball_config WHERE key = $1',
    [key]
  );
  return result.rows[0] ? result.rows[0].value : null;
}

async function setConfig(key, value, description) {
  const result = await pool.query(
    `INSERT INTO best_ball_config (key, value, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = $2
     RETURNING *`,
    [key, value, description || null]
  );
  return result.rows[0];
}

async function getAllConfig() {
  const result = await pool.query('SELECT * FROM best_ball_config ORDER BY key');
  return result.rows;
}

module.exports = {
  createContest,
  getContestById,
  getActiveContest,
  updateContestStatus,
  upsertPlayerPrice,
  getPlayerPrices,
  getPlayerPrice,
  createEntry,
  getEntryById,
  getUserEntry,
  updateEntryScore,
  deleteEntry,
  addPlayerToRoster,
  removePlayerFromRoster,
  getRoster,
  getRosterCount,
  getLeaderboard,
  getEntryRank,
  getConfig,
  setConfig,
  getAllConfig,
};
