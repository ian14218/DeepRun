const pool = require('../db');
const bestBallModel = require('../models/bestBall.model');

/**
 * Step 1-3: compute un-normalized projected value.
 * Pure function for unit testing.
 */
function getProjectedValue(ppg, mpg, seed, config) {
  if (!ppg || ppg <= 0) return 0;

  const minutesBaseline = config.minutesBaseline || 30;
  const minutesFloor = config.minutesFloor || 0.15;
  const seedMultipliers = config.seedMultipliers || {};

  // Step 1: minutes weight
  const minutesWeight = Math.min(Math.max((mpg || 0) / minutesBaseline, minutesFloor), 1.0);

  // Step 2: weighted PPG
  const weightedPpg = ppg * minutesWeight;

  // Step 3: seed multiplier
  const multiplier = seedMultipliers[String(seed)] || 1.0;
  return weightedPpg * multiplier;
}

/**
 * Steps 1-5: full price calculation.
 * Pure function for unit testing.
 */
function calculatePlayerPrice(ppg, mpg, seed, config, normalization) {
  const projectedValue = getProjectedValue(ppg, mpg, seed, config);

  const floor = config.salaryFloor || 100;
  const ceiling = config.salaryCeiling || 2200;
  const exponent = config.curveExponent || 1.2;
  const rounding = config.priceRounding || 50;

  // Step 4: normalize
  const range = normalization.max - normalization.min;
  if (range <= 0) return floor;
  const normalized = Math.max(0, Math.min(1, (projectedValue - normalization.min) / range));

  // Step 5: salary mapping with convex curve
  const rawPrice = floor + Math.pow(normalized, exponent) * (ceiling - floor);
  return Math.round(rawPrice / rounding) * rounding;
}

/**
 * Load config from best_ball_config table into a flat object.
 */
async function loadConfig() {
  const rows = await bestBallModel.getAllConfig();
  const raw = {};
  for (const row of rows) {
    raw[row.key] = row.value;
  }
  return {
    salaryFloor: parseInt(raw.salary_floor, 10) || 100,
    salaryCeiling: parseInt(raw.salary_ceiling, 10) || 2200,
    curveExponent: parseFloat(raw.curve_exponent) || 1.2,
    priceRounding: parseInt(raw.price_rounding, 10) || 50,
    minutesBaseline: parseInt(raw.minutes_baseline, 10) || 30,
    minutesFloor: parseFloat(raw.minutes_floor) || 0.15,
    seedMultipliers: raw.seed_multipliers ? JSON.parse(raw.seed_multipliers) : {},
  };
}

/**
 * Generate prices for all players in a contest.
 * Loads config, queries players, computes prices, upserts into DB.
 */
async function generatePrices(contestId) {
  const config = await loadConfig();

  // Get all players with team info
  const result = await pool.query(
    `SELECT p.id, p.name, p.season_ppg, p.season_mpg,
            tt.seed
     FROM players p
     JOIN tournament_teams tt ON tt.id = p.team_id
     WHERE tt.is_eliminated = false OR tt.is_eliminated IS NULL
     ORDER BY p.name`
  );

  const players = result.rows;
  if (players.length === 0) {
    return { totalPlayers: 0, priceRange: { min: 0, max: 0, avg: 0 }, tierBreakdown: {} };
  }

  // Compute projected values for normalization
  const projectedValues = players.map((p) => ({
    ...p,
    projectedValue: getProjectedValue(
      parseFloat(p.season_ppg) || 0,
      parseFloat(p.season_mpg) || 0,
      p.seed,
      config
    ),
  }));

  const values = projectedValues.map((p) => p.projectedValue);
  const normalization = {
    min: Math.min(...values),
    max: Math.max(...values),
  };

  // Calculate prices and upsert
  let totalPrice = 0;
  let minPrice = Infinity;
  let maxPrice = 0;
  const tierCounts = { elite: 0, premium: 0, mid: 0, value: 0, bargain: 0 };

  for (const p of projectedValues) {
    const price = calculatePlayerPrice(
      parseFloat(p.season_ppg) || 0,
      parseFloat(p.season_mpg) || 0,
      p.seed,
      config,
      normalization
    );

    await bestBallModel.upsertPlayerPrice(contestId, p.id, price);

    totalPrice += price;
    if (price < minPrice) minPrice = price;
    if (price > maxPrice) maxPrice = price;

    if (price >= 1500) tierCounts.elite++;
    else if (price >= 1200) tierCounts.premium++;
    else if (price >= 900) tierCounts.mid++;
    else if (price >= 650) tierCounts.value++;
    else tierCounts.bargain++;
  }

  return {
    totalPlayers: players.length,
    priceRange: {
      min: minPrice === Infinity ? 0 : minPrice,
      max: maxPrice,
      avg: Math.round(totalPrice / players.length),
    },
    tierBreakdown: tierCounts,
  };
}

module.exports = {
  getProjectedValue,
  calculatePlayerPrice,
  generatePrices,
  loadConfig,
};
