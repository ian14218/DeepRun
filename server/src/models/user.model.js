const pool = require('../db');
const crypto = require('crypto');

async function createUser(username, email, passwordHash) {
  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, created_at`,
    [username, email, passwordHash]
  );
  return result.rows[0];
}

async function findByEmail(email) {
  const result = await pool.query(
    `SELECT id, username, email, password_hash, is_bot, is_admin, created_at
     FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

async function findById(id) {
  const result = await pool.query(
    `SELECT id, username, email, is_bot, is_admin, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function createBotUser(username) {
  const email = `bot-${crypto.randomUUID()}@cpu.local`;
  const dummyHash = 'BOT_NO_LOGIN';
  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, is_bot)
     VALUES ($1, $2, $3, TRUE)
     RETURNING id, username, email, created_at, is_bot`,
    [username, email, dummyHash]
  );
  return result.rows[0];
}

async function findBotUsers(limit) {
  const result = await pool.query(
    `SELECT id, username, email, created_at, is_bot
     FROM users WHERE is_bot = TRUE
     ORDER BY created_at
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function findAll(search = '', page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const searchPattern = `%${search}%`;

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM users
     WHERE username ILIKE $1 OR email ILIKE $1`,
    [searchPattern]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(
    `SELECT id, username, email, is_bot, is_admin, created_at
     FROM users
     WHERE username ILIKE $1 OR email ILIKE $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [searchPattern, limit, offset]
  );

  return { users: result.rows, total, page, limit };
}

async function deleteUser(id) {
  // Delete in order: draft_picks → league_members → user
  await pool.query(`DELETE FROM draft_picks WHERE member_id IN (SELECT id FROM league_members WHERE user_id = $1)`, [id]);
  await pool.query(`DELETE FROM league_members WHERE user_id = $1`, [id]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
}

async function setAdmin(id, isAdmin) {
  const result = await pool.query(
    `UPDATE users SET is_admin = $2 WHERE id = $1
     RETURNING id, username, email, is_bot, is_admin, created_at`,
    [id, isAdmin]
  );
  return result.rows[0] || null;
}

module.exports = { createUser, findByEmail, findById, createBotUser, findBotUsers, findAll, deleteUser, setAdmin };
