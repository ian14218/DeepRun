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

  // Never leak internal error details (SQL errors, stack traces) for 5xx.
  // Only expose err.message for client errors (4xx).
  const message = status < 500 ? (err.message || 'Internal server error') : 'Internal server error';

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
