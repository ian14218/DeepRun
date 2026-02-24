const errorHandler = require('../src/middleware/errorHandler');

describe('errorHandler middleware', () => {
  function makeRes() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    return res;
  }

  it('returns the error status and message as JSON', () => {
    const err = Object.assign(new Error('Validation failed'), { status: 422 });
    const res = makeRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: 'Validation failed' });
  });

  it('defaults to HTTP 500 when err.status is not set', () => {
    const err = new Error('Something unexpected');
    const res = makeRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Something unexpected' });
  });
});
