// Admin check uses the is_admin flag already decoded from the JWT by auth middleware.
// No DB round-trip needed — admin status is embedded in the token at login time.
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAdmin };
