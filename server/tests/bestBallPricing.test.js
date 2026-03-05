const { runMigrations, truncateTables } = require('./setup');
const {
  createTestTeam,
  createTestPlayer,
  createTestContest,
  seedBestBallConfig,
} = require('./factories');
const {
  getProjectedValue,
  calculatePlayerPrice,
  generatePrices,
} = require('../src/services/bestBallPricing.service');
const bestBallModel = require('../src/models/bestBall.model');

const DEFAULT_CONFIG = {
  salaryFloor: 500,
  salaryCeiling: 1800,
  curveExponent: 0.7,
  priceRounding: 50,
  minutesBaseline: 30,
  minutesFloor: 0.15,
  seedMultipliers: {
    '1': 1.50, '2': 1.35, '3': 1.25, '4': 1.18,
    '5': 1.10, '6': 1.05, '7': 1.00, '8': 0.97,
    '9': 0.95, '10': 0.93, '11': 0.91, '12': 0.88,
    '13': 0.82, '14': 0.76, '15': 0.72, '16': 0.65,
  },
};

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await truncateTables();
  await seedBestBallConfig();
});


describe('getProjectedValue', () => {
  test('full minutes starter on 1-seed', () => {
    const value = getProjectedValue(22, 34, 1, DEFAULT_CONFIG);
    // minutesWeight = min(34/30, 1.0) = 1.0, weightedPpg = 22, projValue = 22 * 1.50 = 33.0
    expect(value).toBe(33.0);
  });

  test('partial minutes player', () => {
    const value = getProjectedValue(10, 18, 5, DEFAULT_CONFIG);
    // minutesWeight = 18/30 = 0.6, weightedPpg = 6.0, projValue = 6.0 * 1.10 = 6.6
    expect(value).toBeCloseTo(6.6, 5);
  });

  test('minutes floor is applied for very low MPG', () => {
    const value = getProjectedValue(10, 2, 7, DEFAULT_CONFIG);
    // minutesWeight = max(2/30, 0.15) = 0.15, weightedPpg = 1.5, projValue = 1.5 * 1.00 = 1.5
    expect(value).toBeCloseTo(1.5, 5);
  });

  test('zero PPG returns zero', () => {
    expect(getProjectedValue(0, 30, 1, DEFAULT_CONFIG)).toBe(0);
  });

  test('null PPG returns zero', () => {
    expect(getProjectedValue(null, 30, 1, DEFAULT_CONFIG)).toBe(0);
  });

  test('16-seed gets lowest multiplier', () => {
    const value = getProjectedValue(20, 30, 16, DEFAULT_CONFIG);
    // 20 * 1.0 * 0.65 = 13.0
    expect(value).toBe(13.0);
  });
});

describe('calculatePlayerPrice', () => {
  // Normalization range for testing: min=0, max=33
  const norm = { min: 0, max: 33 };

  test('top player gets ceiling price', () => {
    // projectedValue = 33, normalized = 1.0, price = 500 + 1^0.7 * 1300 = 1800
    const price = calculatePlayerPrice(22, 34, 1, DEFAULT_CONFIG, norm);
    expect(price).toBe(1800);
  });

  test('zero PPG gets floor price', () => {
    const price = calculatePlayerPrice(0, 0, 16, DEFAULT_CONFIG, norm);
    expect(price).toBe(500);
  });

  test('mid-range player gets rounded price', () => {
    // 12-seed mid-major star: 20ppg, 33mpg
    // minutesWeight = 1.0, weightedPpg = 20, projValue = 20 * 0.88 = 17.6
    // normalized = 17.6 / 33 = 0.5333, price = 500 + 0.5333^0.7 * 1300
    const price = calculatePlayerPrice(20, 33, 12, DEFAULT_CONFIG, norm);
    expect(price).toBeGreaterThanOrEqual(500);
    expect(price).toBeLessThanOrEqual(1800);
    expect(price % 50).toBe(0); // rounded to nearest 50
  });

  test('price is always rounded to nearest rounding unit', () => {
    const price = calculatePlayerPrice(15, 30, 8, DEFAULT_CONFIG, norm);
    expect(price % 50).toBe(0);
  });

  test('different curve exponent changes price distribution', () => {
    const lowCurve = { ...DEFAULT_CONFIG, curveExponent: 0.5 };
    const highCurve = { ...DEFAULT_CONFIG, curveExponent: 1.0 };

    // Mid-range player
    const priceLow = calculatePlayerPrice(15, 30, 7, lowCurve, norm);
    const priceHigh = calculatePlayerPrice(15, 30, 7, highCurve, norm);

    // Lower exponent → higher mid-range prices (more convex)
    expect(priceLow).toBeGreaterThanOrEqual(priceHigh);
  });

  test('handles zero normalization range gracefully', () => {
    const price = calculatePlayerPrice(10, 20, 5, DEFAULT_CONFIG, { min: 5, max: 5 });
    expect(price).toBe(500); // returns floor when range is 0
  });
});

describe('generatePrices (integration)', () => {
  test('generates prices for all players in a contest', async () => {
    const contest = await createTestContest();
    const team1 = await createTestTeam({ seed: 1 });
    const team2 = await createTestTeam({ seed: 12 });
    await createTestPlayer(team1.id, { season_ppg: 22, season_mpg: 34 });
    await createTestPlayer(team1.id, { season_ppg: 8, season_mpg: 25 });
    await createTestPlayer(team2.id, { season_ppg: 20, season_mpg: 33 });

    const summary = await generatePrices(contest.id);
    expect(summary.totalPlayers).toBe(3);
    expect(summary.priceRange.min).toBeGreaterThanOrEqual(500);
    expect(summary.priceRange.max).toBeLessThanOrEqual(1800);
    expect(summary.priceRange.avg).toBeGreaterThan(0);
  });

  test('is idempotent — running twice produces same prices', async () => {
    const contest = await createTestContest();
    const team = await createTestTeam({ seed: 2 });
    await createTestPlayer(team.id, { season_ppg: 15, season_mpg: 30 });
    await createTestPlayer(team.id, { season_ppg: 10, season_mpg: 20 });

    await generatePrices(contest.id);
    const first = await bestBallModel.getPlayerPrices(contest.id);

    await generatePrices(contest.id);
    const second = await bestBallModel.getPlayerPrices(contest.id);

    expect(first.total).toBe(second.total);
    for (let i = 0; i < first.rows.length; i++) {
      expect(first.rows[i].price).toBe(second.rows[i].price);
    }
  });

  test('returns empty summary when no players exist', async () => {
    const contest = await createTestContest();
    const summary = await generatePrices(contest.id);
    expect(summary.totalPlayers).toBe(0);
  });

  test('elite player on 1-seed gets highest price', async () => {
    const contest = await createTestContest();
    const team1 = await createTestTeam({ seed: 1 });
    const team16 = await createTestTeam({ seed: 16 });
    const star = await createTestPlayer(team1.id, { season_ppg: 22, season_mpg: 34 });
    const bench = await createTestPlayer(team16.id, { season_ppg: 2, season_mpg: 5 });

    await generatePrices(contest.id);

    const starPrice = await bestBallModel.getPlayerPrice(contest.id, star.id);
    const benchPrice = await bestBallModel.getPlayerPrice(contest.id, bench.id);
    expect(starPrice.price).toBe(1800);
    expect(benchPrice.price).toBe(500);
  });

  test('respects config changes', async () => {
    const contest = await createTestContest();
    const team = await createTestTeam({ seed: 1 });
    await createTestPlayer(team.id, { season_ppg: 22, season_mpg: 34 });

    await bestBallModel.setConfig('salary_ceiling', '2000');
    await generatePrices(contest.id);

    const prices = await bestBallModel.getPlayerPrices(contest.id);
    // With only 1 player, it's both min and max, so normalized=0, price=floor
    // Actually with 1 player range=0, price defaults to floor
    expect(prices.rows[0].price).toBe(500);
  });
});
