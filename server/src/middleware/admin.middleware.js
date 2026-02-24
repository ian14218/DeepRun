const pool = require('../db');

async function requireAdmin(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0] || !result.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
}

module.exports = { requireAdmin };
