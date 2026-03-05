const request = require('supertest');
const app = require('../src/app');
const { runMigrations, truncateTables } = require('./setup');
const { createTestUser } = require('./factories');

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  await truncateTables();
});


// ─── POST /api/leagues ────────────────────────────────────────────────────────

describe('POST /api/leagues', () => {
  it('returns 201 and league object with invite code for valid data', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .post('/api/leagues')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test League', team_count: 8, roster_size: 10 });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name', 'Test League');
    expect(res.body).toHaveProperty('invite_code');
    expect(res.body.invite_code).toHaveLength(8);
    expect(res.body).toHaveProperty('team_count', 8);
    expect(res.body).toHaveProperty('draft_status', 'pre_draft');
  });

  it('returns 400 when team_count is less than 4', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .post('/api/leagues')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Too Small', team_count: 3, roster_size: 10 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when team_count is greater than 20', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .post('/api/leagues')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Too Big', team_count: 21, roster_size: 10 });

    expect(res.status).toBe(400);
  });

  it('returns 401 for unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/leagues')
      .send({ name: 'No Auth', team_count: 8, roster_size: 10 });

    expect(res.status).toBe(401);
  });
});

// ─── POST /api/leagues/join ───────────────────────────────────────────────────

describe('POST /api/leagues/join', () => {
  async function createLeagueAsUser(teamCount = 4) {
    const creator = await createTestUser();
    const res = await request(app)
      .post('/api/leagues')
      .set('Authorization', `Bearer ${creator.token}`)
      .send({ name: 'A League', team_count: teamCount, roster_size: 5 });
    return { league: res.body, creator };
  }

  it('adds user to league and returns 200 with valid invite code', async () => {
    const { league } = await createLeagueAsUser();
    const joiner = await createTestUser();

    const res = await request(app)
      .post('/api/leagues/join')
      .set('Authorization', `Bearer ${joiner.token}`)
      .send({ invite_code: league.invite_code });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('league_id', league.id);
  });

  it('returns 400 when the league is full', async () => {
    // Create a 4-person league and fill it
    const { league, creator } = await createLeagueAsUser(4);
    // Creator is already member (1). Add 3 more to fill.
    for (let i = 0; i < 3; i++) {
      const u = await createTestUser();
      await request(app)
        .post('/api/leagues/join')
        .set('Authorization', `Bearer ${u.token}`)
        .send({ invite_code: league.invite_code });
    }
    // 5th person tries to join
    const late = await createTestUser();
    const res = await request(app)
      .post('/api/leagues/join')
      .set('Authorization', `Bearer ${late.token}`)
      .send({ invite_code: league.invite_code });

    expect(res.status).toBe(400);
  });

  it('returns 409 when user is already a member', async () => {
    const { league, creator } = await createLeagueAsUser();
    // Creator tries to join their own league again
    const res = await request(app)
      .post('/api/leagues/join')
      .set('Authorization', `Bearer ${creator.token}`)
      .send({ invite_code: league.invite_code });

    expect(res.status).toBe(409);
  });

  it('returns 404 with an invalid invite code', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .post('/api/leagues/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ invite_code: 'NOTVALID' });

    expect(res.status).toBe(404);
  });
});

// ─── GET /api/leagues ─────────────────────────────────────────────────────────

describe('GET /api/leagues', () => {
  it('returns all leagues for the authenticated user', async () => {
    const { token, user } = await createTestUser();

    // Create 2 leagues
    await request(app)
      .post('/api/leagues')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'League One', team_count: 4, roster_size: 5 });
    await request(app)
      .post('/api/leagues')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'League Two', team_count: 6, roster_size: 5 });

    const res = await request(app)
      .get('/api/leagues')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((l) => l.name)).toContain('League One');
    expect(res.body.map((l) => l.name)).toContain('League Two');
  });
});

// ─── GET /api/leagues/:id ─────────────────────────────────────────────────────

describe('GET /api/leagues/:id', () => {
  it('returns league details including members', async () => {
    const { token } = await createTestUser();
    const createRes = await request(app)
      .post('/api/leagues')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Detail League', team_count: 4, roster_size: 5 });

    const res = await request(app)
      .get(`/api/leagues/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', createRes.body.id);
    expect(res.body).toHaveProperty('name', 'Detail League');
    expect(res.body).toHaveProperty('members');
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(res.body.members).toHaveLength(1); // creator is first member
  });
});

// ─── PUT /api/leagues/:id ─────────────────────────────────────────────────────

describe('PUT /api/leagues/:id', () => {
  it('returns 403 when updated by a non-commissioner', async () => {
    const { token } = await createTestUser();
    const createRes = await request(app)
      .post('/api/leagues')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Original', team_count: 4, roster_size: 5 });

    const { token: otherToken } = await createTestUser();
    const res = await request(app)
      .put(`/api/leagues/${createRes.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(403);
  });

  it('returns 400 when updated after draft has started', async () => {
    const { token } = await createTestUser();
    const createRes = await request(app)
      .post('/api/leagues')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Started League', team_count: 4, roster_size: 5 });

    // Manually set draft_status to in_progress in DB
    const pool = require('../src/db');
    await pool.query(
      `UPDATE leagues SET draft_status = 'in_progress' WHERE id = $1`,
      [createRes.body.id]
    );

    const res = await request(app)
      .put(`/api/leagues/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(400);
  });
});
