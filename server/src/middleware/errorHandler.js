/**
 * Global Express error handler.
 *
 * Must be registered AFTER all routes (four-argument middleware signature).
 * Catches any error passed to next(err) or thrown inside async route handlers
 * that is not already handled by a route's own try/catch.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || 500;

  if (status >= 500) {
    console.error('[error]', err);
  }

  res.status(status).json({ error: err.message || 'Internal server error' });
}

module.exports = errorHandler;
