const request = require('supertest');
const app = require('../src/app');
const { runMigrations, truncateTables } = require('./setup');
const {
  createTestUser,
  createTestTeam,
  createTestPlayer,
  createTestLeague,
  createTestMember,
  createTestDraftPick,
  createTestGameStat,
} = require('./factories');
const { eliminateTeam } = require('../src/services/elimination.service');
const scoringService = require('../src/services/scoring.service');

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  await truncateTables();
});


describe('eliminateTeam()', () => {
  it('sets is_eliminated = true and eliminated_in_round on the team', async () => {
    const team = await createTestTeam({ name: 'Upset Bait', seed: 14, region: 'South' });

    await eliminateTeam(team.id, 'Round of 64');

    const res = await request(app).get('/api/tournaments/teams');
    const found = res.body.find((t) => t.id === team.id);
    expect(found.is_eliminated).toBe(true);
    expect(found.eliminated_in_round).toBe('Round of 64');
  });

  it('sets is_eliminated = true on all players of the team', async () => {
    const team = await createTestTeam({ name: 'Doomed', seed: 16, region: 'West' });
    const p1 = await createTestPlayer(team.id, { name: 'Alpha' });
    const p2 = await createTestPlayer(team.id, { name: 'Beta' });

    await eliminateTeam(team.id, 'Round of 64');

    const res = await request(app).get('/api/players');
    const found1 = res.body.players.find((p) => p.id === p1.id);
    const found2 = res.body.players.find((p) => p.id === p2.id);
    expect(found1.is_eliminated).toBe(true);
    expect(found2.is_eliminated).toBe(true);
  });

  it('max_remaining_games is 0 for players on an eliminated team', async () => {
    const team   = await createTestTeam({ wins: 2 });
    const player = await createTestPlayer(team.id);

    // Before elimination, max_remaining_games should be > 0
    const before = await request(app).get('/api/players');
    const beforePlayer = before.body.players.find((p) => p.id === player.id);
    expect(beforePlayer.max_remaining_games).toBeGreaterThan(0);

    await eliminateTeam(team.id, 'Round of 32');

    const after = await request(app).get('/api/players');
    const afterPlayer = after.body.players.find((p) => p.id === player.id);
    expect(afterPlayer.max_remaining_games).toBe(0);
  });

  it('pre-elimination stats still count toward the team score after elimination', async () => {
    const { user } = await createTestUser();
    const league   = await createTestLeague(user.id);
    const member   = await createTestMember(league.id, user.id);
    const team     = await createTestTeam();
    const player   = await createTestPlayer(team.id);
    await createTestDraftPick(league.id, member.id, player.id, 1, 1);

    // Stats recorded before elimination
    await createTestGameStat(player.id, { points: 18, tournament_round: 'Round of 64' });

    await eliminateTeam(team.id, 'Round of 64');

    const score = await scoringService.calculateTeamScore(member.id);
    expect(score).toBe(18);
  });

  it('eliminated players are counted in eliminated_players, not active_players', async () => {
    const { user } = await createTestUser();
    const league   = await createTestLeague(user.id);
    const member   = await createTestMember(league.id, user.id);
    const team     = await createTestTeam();
    const player   = await createTestPlayer(team.id);
    await createTestDraftPick(league.id, member.id, player.id, 1, 1);

    await eliminateTeam(team.id, 'Round of 64');

    const [active, eliminated] = await Promise.all([
      scoringService.getActivePlayerCount(member.id),
      scoringService.getEliminatedPlayerCount(member.id),
    ]);
    expect(active).toBe(0);
    expect(eliminated).toBe(1);
  });
});
