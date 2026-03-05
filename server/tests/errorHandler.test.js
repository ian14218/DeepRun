const errorHandler = require('../src/middleware/errorHandler');

describe('errorHandler middleware', () => {
  function makeRes() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    return res;
  }

  it('returns the error status and message as JSON for 4xx errors', () => {
    const err = Object.assign(new Error('Validation failed'), { status: 422 });
    const res = makeRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: 'Validation failed' });
  });

  it('defaults to HTTP 500 when err.status is not set', () => {
    const err = new Error('relation "users" does not exist');
    const res = makeRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    // Should NOT leak the internal error message
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('does not leak internal details for 5xx errors', () => {
    const err = Object.assign(new Error('ECONNREFUSED 127.0.0.1:5432'), { status: 503 });
    const res = makeRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('preserves error message for 4xx errors', () => {
    const err = Object.assign(new Error('League not found'), { status: 404 });
    const res = makeRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'League not found' });
  });
});
