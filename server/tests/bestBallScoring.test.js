const { runMigrations, truncateTables } = require('./setup');
const {
  createTestUser,
  createTestTeam,
  createTestPlayer,
  createTestContest,
  createTestEntry,
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


describe('Best Ball Scoring', () => {
  test('updateScores aggregates game stats correctly', async () => {
    const { user: u1 } = await createTestUser();
    const { user: u2 } = await createTestUser();
    const contest = await createTestContest({ status: 'live', roster_size: 2, budget: 5000 });
    const team = await createTestTeam();
    const p1 = await createTestPlayer(team.id);
    const p2 = await createTestPlayer(team.id);
    const p3 = await createTestPlayer(team.id);

    // User 1: players p1 and p2
    const e1 = await createTestEntry(contest.id, u1.id, { budget_remaining: 0, is_complete: true });
    await createTestRosterPlayer(e1.id, p1.id, 1000);
    await createTestRosterPlayer(e1.id, p2.id, 1000);

    // User 2: players p2 and p3 (p2 is shared — non-exclusive)
    const e2 = await createTestEntry(contest.id, u2.id, { budget_remaining: 0, is_complete: true });
    await createTestRosterPlayer(e2.id, p2.id, 1000);
    await createTestRosterPlayer(e2.id, p3.id, 1000);

    // Game stats
    await createTestGameStat(p1.id, { points: 20, tournament_round: 'Round of 64' });
    await createTestGameStat(p1.id, { points: 15, tournament_round: 'Round of 32' });
    await createTestGameStat(p2.id, { points: 30, tournament_round: 'Round of 64' });
    await createTestGameStat(p3.id, { points: 10, tournament_round: 'Round of 64' });

    await bestBallService.updateScores(contest.id);

    const entry1 = await bestBallModel.getEntryById(e1.id);
    const entry2 = await bestBallModel.getEntryById(e2.id);

    // User 1: p1(20+15) + p2(30) = 65
    expect(entry1.total_score).toBe(65);
    // User 2: p2(30) + p3(10) = 40
    expect(entry2.total_score).toBe(40);
  });

  test('updateScores is idempotent', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'live', roster_size: 1, budget: 5000 });
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);

    const entry = await createTestEntry(contest.id, user.id, { budget_remaining: 0, is_complete: true });
    await createTestRosterPlayer(entry.id, player.id, 500);
    await createTestGameStat(player.id, { points: 25 });

    await bestBallService.updateScores(contest.id);
    await bestBallService.updateScores(contest.id);

    const updated = await bestBallModel.getEntryById(entry.id);
    expect(updated.total_score).toBe(25);
  });

  test('updateScores only updates complete entries', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'live', roster_size: 2, budget: 5000 });
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);

    // Incomplete entry (only 1 of 2 players)
    const entry = await createTestEntry(contest.id, user.id, { budget_remaining: 4000, is_complete: false });
    await createTestRosterPlayer(entry.id, player.id, 1000);
    await createTestGameStat(player.id, { points: 50 });

    await bestBallService.updateScores(contest.id);

    const updated = await bestBallModel.getEntryById(entry.id);
    expect(updated.total_score).toBe(0); // Not updated because incomplete
  });

  test('updateScores handles entries with no game stats', async () => {
    const { user } = await createTestUser();
    const contest = await createTestContest({ status: 'live', roster_size: 1, budget: 5000 });
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);

    const entry = await createTestEntry(contest.id, user.id, { budget_remaining: 0, is_complete: true });
    await createTestRosterPlayer(entry.id, player.id, 500);
    // No game stats added

    await bestBallService.updateScores(contest.id);

    const updated = await bestBallModel.getEntryById(entry.id);
    expect(updated.total_score).toBe(0);
  });
});
