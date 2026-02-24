const pool = require('../db');

async function create(name, teamCount, rosterSize, commissionerId, inviteCode) {
  const result = await pool.query(
    `INSERT INTO leagues (name, team_count, roster_size, commissioner_id, invite_code)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, teamCount, rosterSize, commissionerId, inviteCode]
  );
  return result.rows[0];
}

async function findById(id) {
  const result = await pool.query(`SELECT * FROM leagues WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function findByInviteCode(inviteCode) {
  const result = await pool.query(
    `SELECT * FROM leagues WHERE invite_code = $1`,
    [inviteCode]
  );
  return result.rows[0] || null;
}

async function findByUserId(userId) {
  const result = await pool.query(
    `SELECT l.*
     FROM leagues l
     JOIN league_members lm ON lm.league_id = l.id
     WHERE lm.user_id = $1
     ORDER BY l.created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function update(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return findById(id);
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map((k) => fields[k]);
  const result = await pool.query(
    `UPDATE leagues SET ${setClauses} WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return result.rows[0];
}

async function addMember(leagueId, userId, teamName = null) {
  const result = await pool.query(
    `INSERT INTO league_members (league_id, user_id, team_name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [leagueId, userId, teamName]
  );
  return result.rows[0];
}

async function findMembersByLeague(leagueId) {
  const result = await pool.query(
    `SELECT lm.*, u.username, u.email, u.is_bot
     FROM league_members lm
     JOIN users u ON u.id = lm.user_id
     WHERE lm.league_id = $1
     ORDER BY lm.joined_at ASC`,
    [leagueId]
  );
  return result.rows;
}

async function isMember(leagueId, userId) {
  const result = await pool.query(
    `SELECT 1 FROM league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, userId]
  );
  return result.rowCount > 0;
}

async function getMemberCount(leagueId) {
  const result = await pool.query(
    `SELECT COUNT(*) FROM league_members WHERE league_id = $1`,
    [leagueId]
  );
  return parseInt(result.rows[0].count, 10);
}

async function setDraftStatus(leagueId, status) {
  await pool.query(
    `UPDATE leagues SET draft_status = $2 WHERE id = $1`,
    [leagueId, status]
  );
}

// assignments: [{ memberId, position }, ...]
async function setMemberDraftPositions(assignments) {
  for (const { memberId, position } of assignments) {
    await pool.query(
      `UPDATE league_members SET draft_position = $2 WHERE id = $1`,
      [memberId, position]
    );
  }
}

module.exports = {
  create,
  findById,
  findByInviteCode,
  findByUserId,
  update,
  addMember,
  findMembersByLeague,
  isMember,
  getMemberCount,
  setDraftStatus,
  setMemberDraftPositions,
};
