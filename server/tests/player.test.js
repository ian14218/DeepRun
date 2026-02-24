const request = require('supertest');
const app = require('../src/app');
const { runMigrations, truncateTables, closePool } = require('./setup');
const { createTestTeam, createTestPlayer } = require('./factories');

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await closePool();
});

describe('GET /api/players', () => {
  it('returns a paginated object with players, total, page, and limit', async () => {
    const team = await createTestTeam({ name: 'Duke', seed: 1, region: 'East' });
    await createTestPlayer(team.id, { name: 'John Smith' });
    await createTestPlayer(team.id, { name: 'Mike Jones' });

    const res = await request(app).get('/api/players');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('players');
    expect(res.body).toHaveProperty('total', 2);
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit');
    expect(Array.isArray(res.body.players)).toBe(true);
    expect(res.body.players).toHaveLength(2);
  });

  it('filters players by name search', async () => {
    const team = await createTestTeam({ name: 'Duke', seed: 1, region: 'East' });
    await createTestPlayer(team.id, { name: 'John Smith' });
    await createTestPlayer(team.id, { name: 'Mike Jones' });

    const res = await request(app).get('/api/players?search=Smith');

    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].name).toBe('John Smith');
    expect(res.body.total).toBe(1);
  });

  it('filters players by team name', async () => {
    const duke   = await createTestTeam({ name: 'Duke',   seed: 1, region: 'East' });
    const kansas = await createTestTeam({ name: 'Kansas', seed: 2, region: 'West' });
    await createTestPlayer(duke.id,   { name: 'Duke Player'   });
    await createTestPlayer(kansas.id, { name: 'Kansas Player' });

    const res = await request(app).get('/api/players?team=Duke');

    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].name).toBe('Duke Player');
    expect(res.body.total).toBe(1);
  });

  it('includes games_played and max_remaining_games for each player', async () => {
    const team = await createTestTeam({ name: 'Duke', seed: 1, region: 'East', wins: 0 });
    await createTestPlayer(team.id, { name: 'Star Player' });

    const res = await request(app).get('/api/players');

    expect(res.status).toBe(200);
    const player = res.body.players.find((p) => p.name === 'Star Player');
    expect(player).toHaveProperty('games_played', 0);
    expect(player).toHaveProperty('max_remaining_games', 6);
  });

  it('returns max_remaining_games = 0 for a player on an eliminated team', async () => {
    const team = await createTestTeam({
      name: 'Gone Team', seed: 16, region: 'South',
      is_eliminated: true, wins: 0,
    });
    await createTestPlayer(team.id, { name: 'Eliminated Player', is_eliminated: true });

    const res = await request(app).get('/api/players');
    const player = res.body.players.find((p) => p.name === 'Eliminated Player');
    expect(player.max_remaining_games).toBe(0);
  });

  it('returns max_remaining_games = 3 for a player on an active team with 3 wins (in Elite 8)', async () => {
    const team = await createTestTeam({
      name: 'Elite Team', seed: 1, region: 'East',
      is_eliminated: false, wins: 3,
    });
    await createTestPlayer(team.id, { name: 'Elite Player' });

    const res = await request(app).get('/api/players');
    const player = res.body.players.find((p) => p.name === 'Elite Player');
    expect(player.max_remaining_games).toBe(3);
  });
});
