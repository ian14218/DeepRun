const request = require('supertest');
const app = require('../src/app');
const { runMigrations, truncateTables, closePool } = require('./setup');

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await closePool();
});

const validUser = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'Password123!',
};

describe('POST /api/auth/register', () => {
  it('returns 201 and user object (no password) with valid data', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('username', validUser.username);
    expect(res.body).toHaveProperty('email', validUser.email);
    expect(res.body).not.toHaveProperty('password');
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it('returns 409 with duplicate email', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, username: 'other' });
    expect(res.status).toBe(409);
  });

  it('returns 400 with missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  it('returns 200 and JWT token with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
  });

  it('returns 401 with invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });
});

describe('Protected routes', () => {
  it('returns 401 for unauthenticated requests', async () => {
    const res = await request(app).get('/api/protected-test');
    expect(res.status).toBe(401);
  });

  it('returns 401 with an expired/invalid token', async () => {
    const res = await request(app)
      .get('/api/protected-test')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});
