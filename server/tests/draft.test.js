const request = require('supertest');
const app = require('../src/app');
const { runMigrations, truncateTables, closePool } = require('./setup');
const { createTestUser, createTestTeam, createTestPlayer } = require('./factories');

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await closePool();
});

// ─── Test helpers ─────────────────────────────────────────────────────────────

async function setupFullLeague({ teamCount = 4, rosterSize = 2 } = {}) {
  const users = [];
  for (let i = 0; i < teamCount; i++) users.push(await createTestUser());

  // Create enough tournament players to fill all rosters
  const team = await createTestTeam({ name: 'NCAA Team', seed: 1, region: 'East' });
  const players = [];
  for (let i = 0; i < teamCount * rosterSize + 4; i++) {
    players.push(await createTestPlayer(team.id));
  }

  // Commissioner creates league
  const leagueRes = await request(app)
    .post('/api/leagues')
    .set('Authorization', `Bearer ${users[0].token}`)
    .send({ name: 'Draft League', team_count: teamCount, roster_size: rosterSize });

  const league = leagueRes.body;

  // Others join
  for (let i = 1; i < teamCount; i++) {
    await request(app)
      .post('/api/leagues/join')
      .set('Authorization', `Bearer ${users[i].token}`)
      .send({ invite_code: league.invite_code });
  }

  return { users, league, players };
}

// ─── POST /api/leagues/:id/draft/start ────────────────────────────────────────

describe('POST /api/leagues/:id/draft/start', () => {
  it('starts the draft and returns 200 with draft order when called by commissioner', async () => {
    const { users, league } = await setupFullLeague();
    const res = await request(app)
      .post(`/api/leagues/${league.id}/draft/start`)
      .set('Authorization', `Bearer ${users[0].token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('draft_status', 'in_progress');
    expect(res.body).toHaveProperty('draft_order');
    expect(Array.isArray(res.body.draft_order)).toBe(true);
    expect(res.body.draft_order).toHaveLength(4);
  });

  it('returns 403 when called by a non-commissioner', async () => {
    const { users, league } = await setupFullLeague();
    const res = await request(app)
      .post(`/api/leagues/${league.id}/draft/start`)
      .set('Authorization', `Bearer ${users[1].token}`);

    expect(res.status).toBe(403);
  });

  it('returns 400 when the league is not full', async () => {
    // Create league with 4 slots but only commissioner joins (1 member)
    const { token } = await createTestUser();
    const leagueRes = await request(app)
      .post('/api/leagues')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Incomplete', team_count: 4, roster_size: 2 });

    const res = await request(app)
      .post(`/api/leagues/${leagueRes.body.id}/draft/start`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 when the draft has already started', async () => {
    const { users, league } = await setupFullLeague();
    await request(app)
      .post(`/api/leagues/${league.id}/draft/start`)
      .set('Authorization', `Bearer ${users[0].token}`);

    const res = await request(app)
      .post(`/api/leagues/${league.id}/draft/start`)
      .set('Authorization', `Bearer ${users[0].token}`);

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/leagues/:id/draft/pick ─────────────────────────────────────────

describe('POST /api/leagues/:id/draft/pick', () => {
  async function startedLeague() {
    const setup = await setupFullLeague({ teamCount: 4, rosterSize: 2 });
    const startRes = await request(app)
      .post(`/api/leagues/${setup.league.id}/draft/start`)
      .set('Authorization', `Bearer ${setup.users[0].token}`);
    setup.draftOrder = startRes.body.draft_order; // [{member_id, user_id, draft_position}, ...]
    return setup;
  }

  it('returns 200 when the correct user makes a valid pick on their turn', async () => {
    const { users, league, players, draftOrder } = await startedLeague();

    // Find which user has draft_position 1 (picks first)
    const firstPicker = draftOrder.find((d) => d.draft_position === 1);
    const pickerUser  = users.find((u) => u.user.id === firstPicker.user_id);

    const res = await request(app)
      .post(`/api/leagues/${league.id}/draft/pick`)
      .set('Authorization', `Bearer ${pickerUser.token}`)
      .send({ player_id: players[0].id });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('pick_number', 1);
    expect(res.body).toHaveProperty('player_id', players[0].id);
  });

  it('returns 403 when a user tries to pick out of turn', async () => {
    const { users, league, players, draftOrder } = await startedLeague();

    // Find the user who is NOT first
    const firstPicker = draftOrder.find((d) => d.draft_position === 1);
    const outOfTurnUser = users.find((u) => u.user.id !== firstPicker.user_id);

    const res = await request(app)
      .post(`/api/leagues/${league.id}/draft/pick`)
      .set('Authorization', `Bearer ${outOfTurnUser.token}`)
      .send({ player_id: players[0].id });

    expect(res.status).toBe(403);
  });

  it('returns 400 when picking an already-drafted player', async () => {
    const { users, league, players, draftOrder } = await startedLeague();

    const firstPicker = draftOrder.find((d) => d.draft_position === 1);
    const pickerUser  = users.find((u) => u.user.id === firstPicker.user_id);

    // Make the first pick
    await request(app)
      .post(`/api/leagues/${league.id}/draft/pick`)
      .set('Authorization', `Bearer ${pickerUser.token}`)
      .send({ player_id: players[0].id });

    // Second picker tries to draft the same player
    const secondPicker = draftOrder.find((d) => d.draft_position === 2);
    const secondUser   = users.find((u) => u.user.id === secondPicker.user_id);

    const res = await request(app)
      .post(`/api/leagues/${league.id}/draft/pick`)
      .set('Authorization', `Bearer ${secondUser.token}`)
      .send({ player_id: players[0].id });

    expect(res.status).toBe(400);
  });

  it('returns 400 when trying to pick after the draft is complete', async () => {
    const { users, league, players, draftOrder } = await startedLeague();
    // 4 teams × 2 roster = 8 total picks
    const snakeOrder = [1, 2, 3, 4, 4, 3, 2, 1];

    for (let i = 0; i < snakeOrder.length; i++) {
      const pos    = snakeOrder[i];
      const drafter = draftOrder.find((d) => d.draft_position === pos);
      const pickerUser = users.find((u) => u.user.id === drafter.user_id);
      await request(app)
        .post(`/api/leagues/${league.id}/draft/pick`)
        .set('Authorization', `Bearer ${pickerUser.token}`)
        .send({ player_id: players[i].id });
    }

    // One more pick after completion
    const anyUser = users[0];
    const res = await request(app)
      .post(`/api/leagues/${league.id}/draft/pick`)
      .set('Authorization', `Bearer ${anyUser.token}`)
      .send({ player_id: players[8].id });

    expect(res.status).toBe(400);
  });
});

// ─── GET /api/leagues/:id/draft ───────────────────────────────────────────────

describe('GET /api/leagues/:id/draft', () => {
  it('returns current draft state: picks, current turn, and available player count', async () => {
    const { users, league } = await setupFullLeague();
    await request(app)
      .post(`/api/leagues/${league.id}/draft/start`)
      .set('Authorization', `Bearer ${users[0].token}`);

    const res = await request(app)
      .get(`/api/leagues/${league.id}/draft`)
      .set('Authorization', `Bearer ${users[0].token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('picks');
    expect(res.body).toHaveProperty('current_turn');
    expect(res.body).toHaveProperty('available_players_count');
    expect(Array.isArray(res.body.picks)).toBe(true);
  });
});

// ─── Snake order correctness ──────────────────────────────────────────────────

describe('Snake order correctness', () => {
  it('pick order for 4 teams follows snake pattern [1,2,3,4,4,3,2,1,...]', async () => {
    const { users, league, players } = await setupFullLeague({ teamCount: 4, rosterSize: 2 });

    const startRes = await request(app)
      .post(`/api/leagues/${league.id}/draft/start`)
      .set('Authorization', `Bearer ${users[0].token}`);
    const draftOrder = startRes.body.draft_order;

    const expectedSnake = [1, 2, 3, 4, 4, 3, 2, 1];
    const recordedPositions = [];

    for (let i = 0; i < expectedSnake.length; i++) {
      const pos        = expectedSnake[i];
      const drafter    = draftOrder.find((d) => d.draft_position === pos);
      const pickerUser = users.find((u) => u.user.id === drafter.user_id);

      const res = await request(app)
        .post(`/api/leagues/${league.id}/draft/pick`)
        .set('Authorization', `Bearer ${pickerUser.token}`)
        .send({ player_id: players[i].id });

      expect(res.status).toBe(200);
      recordedPositions.push(res.body.draft_position);
    }

    expect(recordedPositions).toEqual(expectedSnake);
  });

  it('draft completes after teamCount * rosterSize total picks', async () => {
    const teamCount  = 4;
    const rosterSize = 2;
    const { users, league, players } = await setupFullLeague({ teamCount, rosterSize });

    const startRes = await request(app)
      .post(`/api/leagues/${league.id}/draft/start`)
      .set('Authorization', `Bearer ${users[0].token}`);
    const draftOrder = startRes.body.draft_order;

    const snakeOrder = [1, 2, 3, 4, 4, 3, 2, 1];
    for (let i = 0; i < snakeOrder.length; i++) {
      const drafter    = draftOrder.find((d) => d.draft_position === snakeOrder[i]);
      const pickerUser = users.find((u) => u.user.id === drafter.user_id);
      const res = await request(app)
        .post(`/api/leagues/${league.id}/draft/pick`)
        .set('Authorization', `Bearer ${pickerUser.token}`)
        .send({ player_id: players[i].id });

      if (i === snakeOrder.length - 1) {
        expect(res.body.draft_status).toBe('completed');
      }
    }
  });
});
