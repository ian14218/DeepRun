const request = require('supertest');
const app = require('../src/app');
const { runMigrations, truncateTables, closePool } = require('./setup');
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

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await closePool();
});

// ─── Shared setup ─────────────────────────────────────────────────────────────

async function setupScoringData() {
  const user1 = await createTestUser();
  const user2 = await createTestUser();

  const league = await createTestLeague(user1.user.id, {
    team_count: 4,
    roster_size: 2,
    draft_status: 'completed',
  });

  const member1 = await createTestMember(league.id, user1.user.id, { draft_position: 1 });
  const member2 = await createTestMember(league.id, user2.user.id, { draft_position: 2 });

  const activeTeam = await createTestTeam({ name: 'Active Univ', seed: 1, region: 'East', wins: 2 });
  const elimTeam   = await createTestTeam({ name: 'Elim Univ',   seed: 16, region: 'West' });

  // Players
  const p1 = await createTestPlayer(activeTeam.id, { name: 'Star Player'  });
  const p2 = await createTestPlayer(activeTeam.id, { name: 'Good Player'  });
  const p3 = await createTestPlayer(elimTeam.id,   { name: 'Elim Player'  });

  // Member 1 drafts p1 (round 1 pick) and p3 (round 2 pick)
  await createTestDraftPick(league.id, member1.id, p1.id, 1, 1);
  await createTestDraftPick(league.id, member1.id, p3.id, 3, 2);

  // Member 2 drafts p2 (round 1 pick)
  await createTestDraftPick(league.id, member2.id, p2.id, 2, 1);

  // Game stats: member1 total = 45, member2 total = 5
  await createTestGameStat(p1.id, { points: 20, tournament_round: 'Round of 64' });
  await createTestGameStat(p1.id, { points: 15, tournament_round: 'Round of 32' });
  await createTestGameStat(p3.id, { points: 10, tournament_round: 'Round of 64' });
  await createTestGameStat(p2.id, { points: 5,  tournament_round: 'Round of 64' });

  // Eliminate Elim Univ
  await eliminateTeam(elimTeam.id, 'Round of 64');

  return { user1, user2, league, member1, member2, activeTeam, elimTeam, p1, p2, p3 };
}

// ─── GET /api/leagues/:id/standings ──────────────────────────────────────────

describe('GET /api/leagues/:id/standings', () => {
  it('returns teams sorted by total points descending', async () => {
    const { user1, league } = await setupScoringData();

    const res = await request(app)
      .get(`/api/leagues/${league.id}/standings`)
      .set('Authorization', `Bearer ${user1.token}`);

    expect(res.status).toBe(200);
    const { standings } = res.body;
    expect(Array.isArray(standings)).toBe(true);
    expect(standings).toHaveLength(2);

    // Member1 scored 45, Member2 scored 5 → Member1 first
    expect(standings[0].total_score).toBe(45);
    expect(standings[1].total_score).toBe(5);
  });

  it('includes active_players and eliminated_players counts per team', async () => {
    const { user1, league, member1 } = await setupScoringData();

    const res = await request(app)
      .get(`/api/leagues/${league.id}/standings`)
      .set('Authorization', `Bearer ${user1.token}`);

    expect(res.status).toBe(200);
    const m1Row = res.body.standings.find((r) => r.member_id === member1.id);
    expect(m1Row).toHaveProperty('active_players', 1);    // p1 is active
    expect(m1Row).toHaveProperty('eliminated_players', 1); // p3 is eliminated
  });

  it('includes players_remaining count per team', async () => {
    const { user1, league, member1, member2 } = await setupScoringData();

    const res = await request(app)
      .get(`/api/leagues/${league.id}/standings`)
      .set('Authorization', `Bearer ${user1.token}`);

    const m1Row = res.body.standings.find((r) => r.member_id === member1.id);
    const m2Row = res.body.standings.find((r) => r.member_id === member2.id);

    expect(m1Row.players_remaining).toBe(1); // only p1 is active
    expect(m2Row.players_remaining).toBe(1); // p2 is active
  });

  it('returns 401 without a token', async () => {
    const { league } = await setupScoringData();
    const res = await request(app).get(`/api/leagues/${league.id}/standings`);
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/leagues/:id/teams/:teamId ──────────────────────────────────────

describe('GET /api/leagues/:id/teams/:teamId', () => {
  it('returns the member roster with per-player stats and elimination status', async () => {
    const { user1, league, member1, p1, p3 } = await setupScoringData();

    const res = await request(app)
      .get(`/api/leagues/${league.id}/teams/${member1.id}`)
      .set('Authorization', `Bearer ${user1.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);

    const starPlayer = res.body.find((r) => r.player_id === p1.id);
    const elimPlayer = res.body.find((r) => r.player_id === p3.id);

    expect(starPlayer).toHaveProperty('is_eliminated', false);
    expect(starPlayer).toHaveProperty('total_points', 35);
    expect(elimPlayer).toHaveProperty('is_eliminated', true);
    expect(elimPlayer).toHaveProperty('total_points', 10);
  });

  it('includes per-round point breakdown for each player', async () => {
    const { user1, league, member1, p1 } = await setupScoringData();

    const res = await request(app)
      .get(`/api/leagues/${league.id}/teams/${member1.id}`)
      .set('Authorization', `Bearer ${user1.token}`);

    const starPlayer = res.body.find((r) => r.player_id === p1.id);
    expect(starPlayer.points_by_round).toHaveProperty('Round of 64', 20);
    expect(starPlayer.points_by_round).toHaveProperty('Round of 32', 15);
  });

  it('returns active players before eliminated players', async () => {
    const { user1, league, member1, p1, p3 } = await setupScoringData();

    const res = await request(app)
      .get(`/api/leagues/${league.id}/teams/${member1.id}`)
      .set('Authorization', `Bearer ${user1.token}`);

    // First entry should be the active player
    expect(res.body[0].player_id).toBe(p1.id);
    expect(res.body[1].player_id).toBe(p3.id);
  });
});

// ─── GET /api/leagues/:id/scoreboard ─────────────────────────────────────────

describe('GET /api/leagues/:id/scoreboard', () => {
  it('returns 200 with an array', async () => {
    const { user1, league } = await setupScoringData();

    const res = await request(app)
      .get(`/api/leagues/${league.id}/scoreboard`)
      .set('Authorization', `Bearer ${user1.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
