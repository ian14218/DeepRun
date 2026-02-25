const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
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

// Helper — create a league and start its draft so chat is available
async function setupLeague() {
  const users = [];
  for (let i = 0; i < 4; i++) users.push(await createTestUser());

  const team = await createTestTeam();
  for (let i = 0; i < 12; i++) await createTestPlayer(team.id);

  const leagueRes = await request(app)
    .post('/api/leagues')
    .set('Authorization', `Bearer ${users[0].token}`)
    .send({ name: 'Chat League', team_count: 4, roster_size: 2 });
  const league = leagueRes.body;

  for (let i = 1; i < 4; i++) {
    await request(app)
      .post('/api/leagues/join')
      .set('Authorization', `Bearer ${users[i].token}`)
      .send({ invite_code: league.invite_code });
  }

  return { users, league };
}

describe('Draft message model', () => {
  const draftMessageModel = require('../src/models/draftMessage.model');

  it('create() stores a message and returns it with id and timestamp', async () => {
    const { users, league } = await setupLeague();

    const msg = await draftMessageModel.create(league.id, users[0].user.id, 'Hello chat!');
    expect(msg).toHaveProperty('id');
    expect(msg).toHaveProperty('created_at');
    expect(msg.league_id).toBe(league.id);
    expect(msg.user_id).toBe(users[0].user.id);
    expect(msg.message).toBe('Hello chat!');
  });

  it('findByLeague() returns messages with usernames in chronological order', async () => {
    const { users, league } = await setupLeague();

    await draftMessageModel.create(league.id, users[0].user.id, 'First');
    await draftMessageModel.create(league.id, users[1].user.id, 'Second');

    const messages = await draftMessageModel.findByLeague(league.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].message).toBe('First');
    expect(messages[0].username).toBe(users[0].user.username);
    expect(messages[1].message).toBe('Second');
    expect(messages[1].username).toBe(users[1].user.username);
  });

  it('findByLeague() does not return messages from other leagues', async () => {
    const { users, league } = await setupLeague();
    const { league: league2 } = await setupLeague();

    await draftMessageModel.create(league.id, users[0].user.id, 'In league 1');
    await draftMessageModel.create(league2.id, users[0].user.id, 'In league 2');

    const messages = await draftMessageModel.findByLeague(league.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toBe('In league 1');
  });

  it('findByLeague() respects the limit parameter', async () => {
    const { users, league } = await setupLeague();

    for (let i = 0; i < 5; i++) {
      await draftMessageModel.create(league.id, users[0].user.id, `Message ${i}`);
    }

    const messages = await draftMessageModel.findByLeague(league.id, 3);
    expect(messages).toHaveLength(3);
  });
});

describe('GET /api/leagues/:id/draft/messages', () => {
  it('returns messages for the league', async () => {
    const { users, league } = await setupLeague();
    const draftMessageModel = require('../src/models/draftMessage.model');

    await draftMessageModel.create(league.id, users[0].user.id, 'Test message');

    const res = await request(app)
      .get(`/api/leagues/${league.id}/draft/messages`)
      .set('Authorization', `Bearer ${users[0].token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].message).toBe('Test message');
    expect(res.body[0].username).toBe(users[0].user.username);
  });

  it('returns empty array when no messages exist', async () => {
    const { users, league } = await setupLeague();

    const res = await request(app)
      .get(`/api/leagues/${league.id}/draft/messages`)
      .set('Authorization', `Bearer ${users[0].token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 401 without authentication', async () => {
    const { league } = await setupLeague();

    const res = await request(app)
      .get(`/api/leagues/${league.id}/draft/messages`);

    expect(res.status).toBe(401);
  });
});
