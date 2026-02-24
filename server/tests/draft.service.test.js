/**
 * Unit tests for the pure draft service functions.
 * No database or HTTP needed.
 */
const {
  generateSnakeOrder,
  getCurrentPickPosition,
  isDraftComplete,
} = require('../src/services/draft.service');

describe('generateSnakeOrder', () => {
  it('produces correct snake order for 4 teams, roster size 3', () => {
    expect(generateSnakeOrder(4, 3)).toEqual([
      1, 2, 3, 4,  // round 1 forward
      4, 3, 2, 1,  // round 2 reverse
      1, 2, 3, 4,  // round 3 forward
    ]);
  });

  it('produces correct snake order for 2 teams, roster size 2', () => {
    expect(generateSnakeOrder(2, 2)).toEqual([1, 2, 2, 1]);
  });

  it('produces correct snake order for 3 teams, roster size 4', () => {
    expect(generateSnakeOrder(3, 4)).toEqual([
      1, 2, 3,
      3, 2, 1,
      1, 2, 3,
      3, 2, 1,
    ]);
  });

  it('returns a flat array of length teamCount * rosterSize', () => {
    const order = generateSnakeOrder(6, 5);
    expect(order).toHaveLength(6 * 5);
  });
});

describe('getCurrentPickPosition', () => {
  const snakeOrder = generateSnakeOrder(4, 3); // [1,2,3,4,4,3,2,1,1,2,3,4]

  it('returns position 1 when no picks have been made', () => {
    expect(getCurrentPickPosition(0, snakeOrder)).toBe(1);
  });

  it('returns position 4 at the start of round 2 (after 4 picks)', () => {
    expect(getCurrentPickPosition(4, snakeOrder)).toBe(4);
  });

  it('returns position 3 for pick #6 (index 5)', () => {
    expect(getCurrentPickPosition(5, snakeOrder)).toBe(3);
  });

  it('returns null when all picks have been made', () => {
    expect(getCurrentPickPosition(12, snakeOrder)).toBeNull();
  });
});

describe('isDraftComplete', () => {
  it('returns false when picks remain', () => {
    expect(isDraftComplete(7, 4, 2)).toBe(false);
  });

  it('returns true when exactly all picks are made', () => {
    expect(isDraftComplete(8, 4, 2)).toBe(true);
  });

  it('returns false with 0 picks', () => {
    expect(isDraftComplete(0, 4, 3)).toBe(false);
  });
});
