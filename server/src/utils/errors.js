/**
 * Create an Error with an HTTP status code.
 * Used across services so the error handler middleware can send the right status.
 */
function createError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { createError };
