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
const scoringService = require('../src/services/scoring.service');

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  await truncateTables();
});


// ─── calculateTeamScore ───────────────────────────────────────────────────────

describe('calculateTeamScore', () => {
  it('returns 0 when the member has no game stats', async () => {
    const { user } = await createTestUser();
    const league = await createTestLeague(user.id);
    const member = await createTestMember(league.id, user.id);
    const team   = await createTestTeam();
    const player = await createTestPlayer(team.id);
    await createTestDraftPick(league.id, member.id, player.id, 1, 1);

    const score = await scoringService.calculateTeamScore(member.id);
    expect(score).toBe(0);
  });

  it('sums points across multiple games for a single player', async () => {
    const { user } = await createTestUser();
    const league = await createTestLeague(user.id);
    const member = await createTestMember(league.id, user.id);
    const team   = await createTestTeam();
    const player = await createTestPlayer(team.id);
    await createTestDraftPick(league.id, member.id, player.id, 1, 1);

    await createTestGameStat(player.id, { points: 20, tournament_round: 'Round of 64' });
    await createTestGameStat(player.id, { points: 15, tournament_round: 'Round of 32' });
    await createTestGameStat(player.id, { points: 8,  tournament_round: 'Sweet 16' });
    await createTestGameStat(player.id, { points: 12, tournament_round: 'Elite 8' });

    const score = await scoringService.calculateTeamScore(member.id);
    expect(score).toBe(55); // 20 + 15 + 8 + 12
  });

  it('does not error when a player scored 0 in a game', async () => {
    const { user } = await createTestUser();
    const league = await createTestLeague(user.id);
    const member = await createTestMember(league.id, user.id);
    const team   = await createTestTeam();
    const player = await createTestPlayer(team.id);
    await createTestDraftPick(league.id, member.id, player.id, 1, 1);

    await createTestGameStat(player.id, { points: 10, tournament_round: 'Round of 64' });
    await createTestGameStat(player.id, { points: 0,  tournament_round: 'Round of 32' });

    const score = await scoringService.calculateTeamScore(member.id);
    expect(score).toBe(10);
  });

  it('sums points across multiple drafted players', async () => {
    const { user } = await createTestUser();
    const league  = await createTestLeague(user.id);
    const member  = await createTestMember(league.id, user.id);
    const team    = await createTestTeam();
    const player1 = await createTestPlayer(team.id);
    const player2 = await createTestPlayer(team.id);

    await createTestDraftPick(league.id, member.id, player1.id, 1, 1);
    await createTestDraftPick(league.id, member.id, player2.id, 2, 1);

    await createTestGameStat(player1.id, { points: 22 });
    await createTestGameStat(player2.id, { points: 18 });

    const score = await scoringService.calculateTeamScore(member.id);
    expect(score).toBe(40);
  });
});

// ─── getActivePlayerCount ────────────────────────────────────────────────────

describe('getActivePlayerCount', () => {
  it('counts only drafted players whose teams are not eliminated', async () => {
    const { user }    = await createTestUser();
    const league      = await createTestLeague(user.id);
    const member      = await createTestMember(league.id, user.id);
    const activeTeam  = await createTestTeam();
    const elimTeam    = await createTestTeam({ is_eliminated: true });
    const activePlayer= await createTestPlayer(activeTeam.id);
    const elimPlayer  = await createTestPlayer(elimTeam.id, { is_eliminated: true });

    await createTestDraftPick(league.id, member.id, activePlayer.id, 1, 1);
    await createTestDraftPick(league.id, member.id, elimPlayer.id,   2, 1);

    const count = await scoringService.getActivePlayerCount(member.id);
    expect(count).toBe(1);
  });
});

// ─── getEliminatedPlayerCount ────────────────────────────────────────────────

describe('getEliminatedPlayerCount', () => {
  it('counts only drafted players whose teams are eliminated', async () => {
    const { user }    = await createTestUser();
    const league      = await createTestLeague(user.id);
    const member      = await createTestMember(league.id, user.id);
    const activeTeam  = await createTestTeam();
    const elimTeam    = await createTestTeam({ is_eliminated: true });
    const activePlayer= await createTestPlayer(activeTeam.id);
    const elimPlayer  = await createTestPlayer(elimTeam.id, { is_eliminated: true });

    await createTestDraftPick(league.id, member.id, activePlayer.id, 1, 1);
    await createTestDraftPick(league.id, member.id, elimPlayer.id,   2, 1);

    const count = await scoringService.getEliminatedPlayerCount(member.id);
    expect(count).toBe(1);
  });
});
