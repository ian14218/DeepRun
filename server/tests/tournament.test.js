const request = require('supertest');
const app = require('../src/app');
const { runMigrations, truncateTables, closePool } = require('./setup');
const { createTestTeam, createTestPlayer } = require('./factories');
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

describe('GET /api/tournaments/teams', () => {
  it('returns all tournament teams with seed and region', async () => {
    await createTestTeam({ name: 'Duke',   seed: 1, region: 'East' });
    await createTestTeam({ name: 'Kansas', seed: 2, region: 'West' });

    const res = await request(app).get('/api/tournaments/teams');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);

    const duke = res.body.find((t) => t.name === 'Duke');
    expect(duke).toHaveProperty('seed', 1);
    expect(duke).toHaveProperty('region', 'East');
  });

  it('includes is_eliminated and current_round for each team', async () => {
    await createTestTeam({ name: 'Active Team',    seed: 1,  region: 'East', wins: 2 });
    await createTestTeam({ name: 'Eliminated Team', seed: 16, region: 'West', is_eliminated: true, wins: 0 });

    const res = await request(app).get('/api/tournaments/teams');

    expect(res.status).toBe(200);
    const active    = res.body.find((t) => t.name === 'Active Team');
    const eliminated = res.body.find((t) => t.name === 'Eliminated Team');

    expect(active).toHaveProperty('is_eliminated', false);
    expect(active).toHaveProperty('current_round', 'Sweet 16'); // 2 wins → Sweet 16
    expect(eliminated).toHaveProperty('is_eliminated', true);
    expect(eliminated).toHaveProperty('current_round');
  });

  it('eliminateTeam() atomically sets team and all players to is_eliminated = true', async () => {
    const team = await createTestTeam({ name: 'Doomed Team', seed: 15, region: 'South' });
    await createTestPlayer(team.id, { name: 'Player A' });
    await createTestPlayer(team.id, { name: 'Player B' });

    await eliminateTeam(team.id, 'Round of 64');

    // Verify team
    const teamsRes = await request(app).get('/api/tournaments/teams');
    const doomedTeam = teamsRes.body.find((t) => t.name === 'Doomed Team');
    expect(doomedTeam.is_eliminated).toBe(true);
    expect(doomedTeam.eliminated_in_round).toBe('Round of 64');

    // Verify players
    const playersRes = await request(app).get('/api/players');
    const playerA = playersRes.body.players.find((p) => p.name === 'Player A');
    const playerB = playersRes.body.players.find((p) => p.name === 'Player B');
    expect(playerA.is_eliminated).toBe(true);
    expect(playerB.is_eliminated).toBe(true);
  });
});
