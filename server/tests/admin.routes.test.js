const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
const { runMigrations, truncateTables } = require('./setup');
const { createTestUser } = require('./factories');

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  await truncateTables();
});


async function createAdminUser() {
  const { user, token } = await createTestUser();
  await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [user.id]);
  // Re-login to get a token with is_admin=true
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: 'Password123!' });
  return { user: loginRes.body.user, token: loginRes.body.token };
}

describe('POST /api/admin/tournament/simulate-round', () => {
  it('returns 403 when SIMULATION_ENABLED is not true', async () => {
    const original = process.env.SIMULATION_ENABLED;
    delete process.env.SIMULATION_ENABLED;

    const { token } = await createAdminUser();
    const res = await request(app)
      .post('/api/admin/tournament/simulate-round')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/simulation/i);

    process.env.SIMULATION_ENABLED = original;
  });

  it('returns 403 when SIMULATION_ENABLED is explicitly false', async () => {
    const original = process.env.SIMULATION_ENABLED;
    process.env.SIMULATION_ENABLED = 'false';

    const { token } = await createAdminUser();
    const res = await request(app)
      .post('/api/admin/tournament/simulate-round')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/simulation/i);

    process.env.SIMULATION_ENABLED = original;
  });
});

describe('POST /api/admin/tournament/reset-simulation', () => {
  it('returns 403 when SIMULATION_ENABLED is not true', async () => {
    const original = process.env.SIMULATION_ENABLED;
    delete process.env.SIMULATION_ENABLED;

    const { token } = await createAdminUser();
    const res = await request(app)
      .post('/api/admin/tournament/reset-simulation')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/simulation/i);

    process.env.SIMULATION_ENABLED = original;
  });
});
