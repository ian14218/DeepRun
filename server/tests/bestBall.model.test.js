const { runMigrations, truncateTables, closePool } = require('./setup');
const {
  createTestUser,
  createTestTeam,
  createTestPlayer,
  createTestContest,
  createTestEntry,
  createTestPlayerPrice,
  createTestRosterPlayer,
  seedBestBallConfig,
} = require('./factories');
const bestBallModel = require('../src/models/bestBall.model');

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await truncateTables();
  await seedBestBallConfig();
});

afterAll(async () => {
  await closePool();
});

describe('Best Ball Model', () => {
  // ─── Contests ───────────────────────────────────────────────────────

  test('createContest and getContestById', async () => {
    const contest = await bestBallModel.createContest({
      name: 'Test Contest',
      lock_date: new Date('2025-03-20T12:00:00Z'),
    });
    expect(contest.name).toBe('Test Contest');
    expect(contest.status).toBe('upcoming');
    expect(contest.budget).toBe(8000);
    expect(contest.roster_size).toBe(8);

    const found = await bestBallModel.getContestById(contest.id);
    expect(found.id).toBe(contest.id);
  });

  test('getActiveContest returns most recent non-completed contest', async () => {
    await createTestContest({ status: 'completed' });
    const open = await createTestContest({ status: 'open' });

    const active = await bestBallModel.getActiveContest();
    expect(active.id).toBe(open.id);
  });

  test('updateContestStatus', async () => {
    const contest = await createTestContest({ status: 'upcoming' });
    const updated = await bestBallModel.updateContestStatus(contest.id, 'open');
    expect(updated.status).toBe('open');
  });

  // ─── Player Prices ─────────────────────────────────────────────────

  test('upsertPlayerPrice creates and updates', async () => {
    const contest = await createTestContest();
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);

    const price = await bestBallModel.upsertPlayerPrice(contest.id, player.id, 1200);
    expect(price.price).toBe(1200);

    const updated = await bestBallModel.upsertPlayerPrice(contest.id, player.id, 1500);
    expect(updated.price).toBe(1500);
  });

  test('getPlayerPrices with pagination and filters', async () => {
    const contest = await createTestContest();
    const team = await createTestTeam({ seed: 1 });
    const p1 = await createTestPlayer(team.id, { name: 'Alpha', season_ppg: 20, season_mpg: 30 });
    const p2 = await createTestPlayer(team.id, { name: 'Beta', season_ppg: 10, season_mpg: 25 });
    await createTestPlayerPrice(contest.id, p1.id, 1800);
    await createTestPlayerPrice(contest.id, p2.id, 900);

    // No filters
    const all = await bestBallModel.getPlayerPrices(contest.id);
    expect(all.total).toBe(2);
    expect(all.rows.length).toBe(2);

    // Search filter
    const searched = await bestBallModel.getPlayerPrices(contest.id, { search: 'Alpha' });
    expect(searched.total).toBe(1);
    expect(searched.rows[0].name).toBe('Alpha');

    // Price range filter
    const priced = await bestBallModel.getPlayerPrices(contest.id, { minPrice: 1000 });
    expect(priced.total).toBe(1);

    // Sort by price ascending
    const sorted = await bestBallModel.getPlayerPrices(contest.id, { sortBy: 'price_asc' });
    expect(sorted.rows[0].price).toBe(900);
  });

  test('getPlayerPrice returns single price', async () => {
    const contest = await createTestContest();
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);
    await createTestPlayerPrice(contest.id, player.id, 1200);

    const price = await bestBallModel.getPlayerPrice(contest.id, player.id);
    expect(price.price).toBe(1200);
  });

  // ─── Entries ────────────────────────────────────────────────────────

  test('createEntry and getUserEntry', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest();

    const entry = await bestBallModel.createEntry(contest.id, user.id, 8000);
    expect(entry.budget_remaining).toBe(8000);
    expect(entry.is_complete).toBe(false);

    const found = await bestBallModel.getUserEntry(contest.id, user.id);
    expect(found.id).toBe(entry.id);
  });

  test('unique constraint on contest_id + user_id', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest();

    await bestBallModel.createEntry(contest.id, user.id, 8000);
    await expect(
      bestBallModel.createEntry(contest.id, user.id, 8000)
    ).rejects.toThrow();
  });

  // ─── Roster ─────────────────────────────────────────────────────────

  test('addPlayerToRoster, getRoster, removePlayerFromRoster', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest();
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);
    const entry = await createTestEntry(contest.id, user.id);

    await bestBallModel.addPlayerToRoster(entry.id, player.id, 1000);
    const roster = await bestBallModel.getRoster(entry.id);
    expect(roster.length).toBe(1);
    expect(roster[0].purchase_price).toBe(1000);

    const count = await bestBallModel.getRosterCount(entry.id);
    expect(count).toBe(1);

    const removed = await bestBallModel.removePlayerFromRoster(entry.id, player.id);
    expect(removed.purchase_price).toBe(1000);

    const emptyRoster = await bestBallModel.getRoster(entry.id);
    expect(emptyRoster.length).toBe(0);
  });

  test('unique constraint on entry_id + player_id', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest();
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);
    const entry = await createTestEntry(contest.id, user.id);

    await bestBallModel.addPlayerToRoster(entry.id, player.id, 1000);
    await expect(
      bestBallModel.addPlayerToRoster(entry.id, player.id, 1000)
    ).rejects.toThrow();
  });

  // ─── Leaderboard ───────────────────────────────────────────────────

  test('getLeaderboard returns complete entries ordered by score', async () => {
    const { user: u1 } = await createTestUser();
    const { user: u2 } = await createTestUser();
    const { user: u3 } = await createTestUser();
    const contest = await createTestContest();

    await createTestEntry(contest.id, u1.id, { budget_remaining: 0, is_complete: true, total_score: 100 });
    await createTestEntry(contest.id, u2.id, { budget_remaining: 0, is_complete: true, total_score: 200 });
    await createTestEntry(contest.id, u3.id, { budget_remaining: 5000, is_complete: false, total_score: 50 });

    const lb = await bestBallModel.getLeaderboard(contest.id);
    expect(lb.total).toBe(2); // only complete entries
    expect(lb.rows[0].total_score).toBe(200);
    expect(lb.rows[1].total_score).toBe(100);
  });

  test('getEntryRank returns correct rank', async () => {
    const { user: u1 } = await createTestUser();
    const { user: u2 } = await createTestUser();
    const contest = await createTestContest();

    await createTestEntry(contest.id, u1.id, { budget_remaining: 0, is_complete: true, total_score: 100 });
    const e2 = await createTestEntry(contest.id, u2.id, { budget_remaining: 0, is_complete: true, total_score: 200 });

    const rank = await bestBallModel.getEntryRank(e2.id);
    expect(rank).toBe(1);
  });

  // ─── Config ─────────────────────────────────────────────────────────

  test('getConfig, setConfig, getAllConfig', async () => {
    const floor = await bestBallModel.getConfig('salary_floor');
    expect(floor).toBe('500');

    await bestBallModel.setConfig('salary_floor', '600', 'Updated floor');
    const updated = await bestBallModel.getConfig('salary_floor');
    expect(updated).toBe('600');

    const all = await bestBallModel.getAllConfig();
    expect(all.length).toBeGreaterThanOrEqual(7);
  });
});
