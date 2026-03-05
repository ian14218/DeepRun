const request = require('supertest');
const app = require('../src/app');
const { runMigrations, truncateTables } = require('./setup');
const pool = require('../src/db');
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

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await truncateTables();
  await seedBestBallConfig();
});


async function createAdminUser() {
  const { user, token } = await createTestUser();
  await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [user.id]);
  return { user: { ...user, is_admin: true }, token };
}

describe('Best Ball Routes', () => {
  // ─── Auth ─────────────────────────────────────────────────────────

  test('401 without auth token', async () => {
    const res = await request(app).get('/api/best-ball/contests/active');
    expect(res.status).toBe(401);
  });

  // ─── Contests ─────────────────────────────────────────────────────

  test('GET /contests/active returns active contest', async () => {
    const { token } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });

    const res = await request(app)
      .get('/api/best-ball/contests/active')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(contest.id);
  });

  test('GET /contests/:id returns specific contest', async () => {
    const { token } = await createTestUser();
    const contest = await createTestContest();

    const res = await request(app)
      .get(`/api/best-ball/contests/${contest.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(contest.name);
  });

  // ─── Entry CRUD ───────────────────────────────────────────────────

  test('POST /contests/:id/enter creates entry', async () => {
    const { token } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });

    const res = await request(app)
      .post(`/api/best-ball/contests/${contest.id}/enter`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.budget_remaining).toBe(8000);
  });

  test('GET /contests/:id/my-lineup returns user lineup', async () => {
    const { user, token } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });
    await createTestEntry(contest.id, user.id);

    const res = await request(app)
      .get(`/api/best-ball/contests/${contest.id}/my-lineup`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.roster).toEqual([]);
  });

  test('GET /contests/:id/my-lineup returns null when no entry', async () => {
    const { token } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });

    const res = await request(app)
      .get(`/api/best-ball/contests/${contest.id}/my-lineup`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('DELETE /entries/:id deletes entry', async () => {
    const { user, token } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });
    const entry = await createTestEntry(contest.id, user.id);

    const res = await request(app)
      .delete(`/api/best-ball/entries/${entry.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Entry deleted');
  });

  // ─── Roster operations ────────────────────────────────────────────

  test('POST + DELETE roster player flow', async () => {
    const { user, token } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);
    await createTestPlayerPrice(contest.id, player.id, 1000);
    const entry = await createTestEntry(contest.id, user.id);

    // Add player
    const addRes = await request(app)
      .post(`/api/best-ball/entries/${entry.id}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({ playerId: player.id });

    expect(addRes.status).toBe(200);
    expect(addRes.body.budget_remaining).toBe(7000);

    // Remove player
    const removeRes = await request(app)
      .delete(`/api/best-ball/entries/${entry.id}/players/${player.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(removeRes.status).toBe(200);
    expect(removeRes.body.budget_remaining).toBe(8000);
  });

  test('POST /entries/:id/players returns 400 without playerId', async () => {
    const { user, token } = await createTestUser();
    const contest = await createTestContest({ status: 'open' });
    const entry = await createTestEntry(contest.id, user.id);

    const res = await request(app)
      .post(`/api/best-ball/entries/${entry.id}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  // ─── Market ───────────────────────────────────────────────────────

  test('GET /contests/:id/players returns player market with filters', async () => {
    const { token } = await createTestUser();
    const contest = await createTestContest();
    const team = await createTestTeam({ seed: 1 });
    const player = await createTestPlayer(team.id, { season_ppg: 20, season_mpg: 30 });
    await createTestPlayerPrice(contest.id, player.id, 1500);

    const res = await request(app)
      .get(`/api/best-ball/contests/${contest.id}/players`)
      .set('Authorization', `Bearer ${token}`)
      .query({ minPrice: 1000, sortBy: 'price_asc' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0].price).toBe(1500);
  });

  // ─── Leaderboard ──────────────────────────────────────────────────

  test('GET /contests/:id/leaderboard returns ranked entries', async () => {
    const { user: u1, token } = await createTestUser();
    const { user: u2 } = await createTestUser();
    const contest = await createTestContest({ status: 'live' });

    await createTestEntry(contest.id, u1.id, { budget_remaining: 0, is_complete: true, total_score: 50 });
    await createTestEntry(contest.id, u2.id, { budget_remaining: 0, is_complete: true, total_score: 100 });

    const res = await request(app)
      .get(`/api/best-ball/contests/${contest.id}/leaderboard`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.rows[0].total_score).toBe(100);
  });

  // ─── Entry Detail ─────────────────────────────────────────────────

  test('GET /entries/:id returns entry detail', async () => {
    const { user, token } = await createTestUser();
    const contest = await createTestContest({ status: 'live', roster_size: 1, budget: 5000 });
    const team = await createTestTeam();
    const player = await createTestPlayer(team.id);
    const entry = await createTestEntry(contest.id, user.id, {
      budget_remaining: 0,
      is_complete: true,
      total_score: 0,
    });
    await createTestRosterPlayer(entry.id, player.id, 500);

    const res = await request(app)
      .get(`/api/best-ball/entries/${entry.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.roster.length).toBe(1);
    expect(res.body.rank).toBe(1);
  });

  // ─── Admin ────────────────────────────────────────────────────────

  test('admin routes require admin role (403)', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/best-ball/admin/contests')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', lock_date: '2025-03-20T12:00:00Z' });

    expect(res.status).toBe(403);
  });

  test('POST /admin/contests creates contest', async () => {
    const { token } = await createAdminUser();

    const res = await request(app)
      .post('/api/best-ball/admin/contests')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'March Madness 2025', lock_date: '2025-03-20T12:00:00Z' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('March Madness 2025');
  });

  test('PUT /admin/contests/:id/status updates status', async () => {
    const { token } = await createAdminUser();
    const contest = await createTestContest({ status: 'upcoming' });

    const res = await request(app)
      .put(`/api/best-ball/admin/contests/${contest.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'open' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('open');
  });

  test('GET/PUT /admin/config manages config', async () => {
    const { token } = await createAdminUser();

    const getRes = await request(app)
      .get('/api/best-ball/admin/config')
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.length).toBeGreaterThanOrEqual(7);

    const putRes = await request(app)
      .put('/api/best-ball/admin/config/salary_floor')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: '600' });

    expect(putRes.status).toBe(200);
    expect(putRes.body.value).toBe('600');
  });
});
