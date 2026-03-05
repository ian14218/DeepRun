const { runMigrations, truncateTables } = require('./setup');
const {
  createTestUser,
  createTestTeam,
  createTestPlayer,
  createTestContest,
  createTestEntry,
  createTestPlayerPrice,
  createTestRosterPlayer,
  createTestGameStat,
  seedBestBallConfig,
} = require('./factories');
const bestBallService = require('../src/services/bestBall.service');
const bestBallModel = require('../src/models/bestBall.model');

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await truncateTables();
  await seedBestBallConfig();
});


describe('Best Ball Service', () => {
  // ─── createEntry ────────────────────────────────────────────────────

  test('createEntry succeeds for open contest', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });

    const entry = await bestBallService.createEntry(contest.id, user.id);
    expect(entry.budget_remaining).toBe(8000);
    expect(entry.is_complete).toBe(false);
  });

  test('createEntry rejects when contest is not open', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'locked' });

    await expect(
      bestBallService.createEntry(contest.id, user.id)
    ).rejects.toThrow('Contest is not open');
  });

  test('createEntry rejects duplicate entry', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });

    await bestBallService.createEntry(contest.id, user.id);
    await expect(
      bestBallService.createEntry(contest.id, user.id)
    ).rejects.toThrow('already have an entry');
  });

  // ─── addPlayer ──────────────────────────────────────────────────────

  test('addPlayer deducts budget and adds to roster', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);
    await createTestPlayerPrice(contest.id, player.id, 1200);

    const entry = await bestBallService.createEntry(contest.id, user.id);
    const updated = await bestBallService.addPlayer(entry.id, player.id);

    expect(updated.budget_remaining).toBe(6800);
    const roster = await bestBallModel.getRoster(entry.id);
    expect(roster.length).toBe(1);
  });

  test('addPlayer marks entry complete when roster is full', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'open', roster_size: 2, budget: 5000 });
    const team = await createTestTeam();
    const p1 = await createTestPlayer(team.id);
    const p2 = await createTestPlayer(team.id);
    await createTestPlayerPrice(contest.id, p1.id, 500);
    await createTestPlayerPrice(contest.id, p2.id, 500);

    const entry = await bestBallService.createEntry(contest.id, user.id);
    await bestBallService.addPlayer(entry.id, p1.id);
    const updated = await bestBallService.addPlayer(entry.id, p2.id);

    expect(updated.is_complete).toBe(true);
  });

  test('addPlayer rejects when budget insufficient', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'open', budget: 500 });
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);
    await createTestPlayerPrice(contest.id, player.id, 1000);

    const entry = await bestBallService.createEntry(contest.id, user.id);
    await expect(
      bestBallService.addPlayer(entry.id, player.id)
    ).rejects.toThrow('Insufficient budget');
  });

  test('addPlayer rejects duplicate player', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);
    await createTestPlayerPrice(contest.id, player.id, 500);

    const entry = await bestBallService.createEntry(contest.id, user.id);
    await bestBallService.addPlayer(entry.id, player.id);
    await expect(
      bestBallService.addPlayer(entry.id, player.id)
    ).rejects.toThrow('already on roster');
  });

  test('addPlayer rejects when roster is full', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'open', roster_size: 1, budget: 5000 });
    const team = await createTestTeam();
    const p1 = await createTestPlayer(team.id);
    const p2 = await createTestPlayer(team.id);
    await createTestPlayerPrice(contest.id, p1.id, 500);
    await createTestPlayerPrice(contest.id, p2.id, 500);

    const entry = await bestBallService.createEntry(contest.id, user.id);
    await bestBallService.addPlayer(entry.id, p1.id);
    await expect(
      bestBallService.addPlayer(entry.id, p2.id)
    ).rejects.toThrow('Roster is full');
  });

  test('addPlayer rejects when contest is locked', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);
    await createTestPlayerPrice(contest.id, player.id, 500);

    const entry = await bestBallService.createEntry(contest.id, user.id);
    await bestBallModel.updateContestStatus(contest.id, 'locked');

    await expect(
      bestBallService.addPlayer(entry.id, player.id)
    ).rejects.toThrow('Contest is not open');
  });

  // ─── removePlayer ──────────────────────────────────────────────────

  test('removePlayer refunds budget and removes from roster', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);
    await createTestPlayerPrice(contest.id, player.id, 1200);

    const entry = await bestBallService.createEntry(contest.id, user.id);
    await bestBallService.addPlayer(entry.id, player.id);
    const updated = await bestBallService.removePlayer(entry.id, player.id);

    expect(updated.budget_remaining).toBe(8000);
    expect(updated.is_complete).toBe(false);
    const roster = await bestBallModel.getRoster(entry.id);
    expect(roster.length).toBe(0);
  });

  // ─── deleteEntry ───────────────────────────────────────────────────

  test('deleteEntry removes the entry', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });

    const entry = await bestBallService.createEntry(contest.id, user.id);
    await bestBallService.deleteEntry(entry.id, user.id);

    const found = await bestBallModel.getUserEntry(contest.id, user.id);
    expect(found).toBeNull();
  });

  test('deleteEntry rejects if not owner', async () => {
    const { user: u1 } = await createTestUser();
    const { user: u2 } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });

    const entry = await bestBallService.createEntry(contest.id, u1.id);
    await expect(
      bestBallService.deleteEntry(entry.id, u2.id)
    ).rejects.toThrow('Not your entry');
  });

  // ─── updateScores ──────────────────────────────────────────────────

  test('updateScores calculates scores from game stats', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'live', roster_size: 2, budget: 5000 });
    const team = await createTestTeam();
    const p1 = await createTestPlayer(team.id);
    const p2 = await createTestPlayer(team.id);

    const entry = await createTestEntry(contest.id, user.id, {
      budget_remaining: 0,
      is_complete: true,
    });
    await createTestRosterPlayer(entry.id, p1.id, 1000);
    await createTestRosterPlayer(entry.id, p2.id, 1000);

    await createTestGameStat(p1.id, { points: 20 });
    await createTestGameStat(p1.id, { points: 15 });
    await createTestGameStat(p2.id, { points: 10 });

    await bestBallService.updateScores(contest.id);

    const updated = await bestBallModel.getEntryById(entry.id);
    expect(updated.total_score).toBe(45);
  });

  test('updateScores is idempotent', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'live', roster_size: 1, budget: 5000 });
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);

    const entry = await createTestEntry(contest.id, user.id, {
      budget_remaining: 0,
      is_complete: true,
    });
    await createTestRosterPlayer(entry.id, player.id, 500);
    await createTestGameStat(player.id, { points: 25 });

    await bestBallService.updateScores(contest.id);
    await bestBallService.updateScores(contest.id);

    const updated = await bestBallModel.getEntryById(entry.id);
    expect(updated.total_score).toBe(25);
  });

  // ─── getLeaderboard ────────────────────────────────────────────────

  test('getLeaderboard returns only complete entries, ordered by score', async () => {
    const { user: u1 } = await createTestUser();
    const { user: u2 } = await createTestUser();
    const { user: u3 } = await createTestUser();
    const contest = await createTestContest({ status: 'live' });

    await createTestEntry(contest.id, u1.id, { budget_remaining: 0, is_complete: true, total_score: 50 });
    await createTestEntry(contest.id, u2.id, { budget_remaining: 0, is_complete: true, total_score: 100 });
    await createTestEntry(contest.id, u3.id, { budget_remaining: 5000, is_complete: false, total_score: 0 });

    const lb = await bestBallService.getLeaderboard(contest.id);
    expect(lb.total).toBe(2);
    expect(lb.rows[0].total_score).toBe(100);
    expect(lb.rows[1].total_score).toBe(50);
  });

  // ─── getEntryDetail ────────────────────────────────────────────────

  test('getEntryDetail returns roster with stats and rank', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'live', roster_size: 1, budget: 5000 });
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);

    const entry = await createTestEntry(contest.id, user.id, {
      budget_remaining: 0,
      is_complete: true,
      total_score: 25,
    });
    await createTestRosterPlayer(entry.id, player.id, 500);
    await createTestGameStat(player.id, { points: 25, tournament_round: 'Round of 64' });

    const detail = await bestBallService.getEntryDetail(entry.id);
    expect(detail.roster.length).toBe(1);
    expect(detail.roster[0].total_points).toBe(25);
    expect(detail.roster[0].round_points.length).toBe(1);
    expect(detail.rank).toBe(1);
  });
});
