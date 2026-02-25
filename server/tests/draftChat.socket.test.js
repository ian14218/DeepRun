/**
 * Socket.IO integration tests for draft chat messages.
 */
const http = require('http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
const { initDraftSocket } = require('../src/socket/draftSocket');
const { runMigrations, truncateTables, closePool } = require('./setup');
const { createTestUser } = require('./factories');

let httpServer, serverAddress;

beforeAll(async () => {
  await runMigrations();

  httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });
  app.io = io;
  initDraftSocket(io);

  await new Promise((resolve) => httpServer.listen(0, resolve));
  serverAddress = `http://localhost:${httpServer.address().port}`;
});

afterEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await closePool();
  await new Promise((resolve) => httpServer.close(resolve));
});

// Helper — create a league (no need to start draft; chat works during any draft status)
async function setupLeague() {
  const users = [];
  for (let i = 0; i < 4; i++) users.push(await createTestUser());

  const leagueRes = await request(httpServer)
    .post('/api/leagues')
    .set('Authorization', `Bearer ${users[0].token}`)
    .send({ name: 'Chat League', team_count: 4, roster_size: 2 });
  const league = leagueRes.body;

  for (let i = 1; i < 4; i++) {
    await request(httpServer)
      .post('/api/leagues/join')
      .set('Authorization', `Bearer ${users[i].token}`)
      .send({ invite_code: league.invite_code });
  }

  return { users, league };
}

function connectClient(leagueId) {
  return new Promise((resolve, reject) => {
    const socket = ioc(serverAddress, { forceNew: true });
    socket.on('connect', () => {
      socket.emit('join-draft', { leagueId });
      resolve(socket);
    });
    socket.on('connect_error', reject);
  });
}

describe('Draft chat socket events', () => {
  it('broadcasts draft:message to the league room', async () => {
    const { users, league } = await setupLeague();

    const sender = await connectClient(league.id);
    const receiver = await connectClient(league.id);

    const msgPromise = new Promise((resolve) => receiver.on('draft:message', resolve));

    sender.emit('draft:message', {
      leagueId: league.id,
      userId: users[0].user.id,
      username: users[0].user.username,
      message: 'Hello everyone!',
    });

    const event = await Promise.race([
      msgPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);

    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('created_at');
    expect(event.user_id).toBe(users[0].user.id);
    expect(event.username).toBe(users[0].user.username);
    expect(event.message).toBe('Hello everyone!');

    sender.disconnect();
    receiver.disconnect();
  });

  it('persists message to the database', async () => {
    const { users, league } = await setupLeague();

    const socket = await connectClient(league.id);

    const msgPromise = new Promise((resolve) => socket.on('draft:message', resolve));

    socket.emit('draft:message', {
      leagueId: league.id,
      userId: users[0].user.id,
      username: users[0].user.username,
      message: 'Saved message',
    });

    await Promise.race([
      msgPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);

    const result = await pool.query(
      'SELECT * FROM draft_messages WHERE league_id = $1',
      [league.id]
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].message).toBe('Saved message');

    socket.disconnect();
  });

  it('strips HTML tags from messages', async () => {
    const { users, league } = await setupLeague();

    const socket = await connectClient(league.id);

    const msgPromise = new Promise((resolve) => socket.on('draft:message', resolve));

    socket.emit('draft:message', {
      leagueId: league.id,
      userId: users[0].user.id,
      username: users[0].user.username,
      message: '<script>alert("xss")</script>Nice pick!',
    });

    const event = await Promise.race([
      msgPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);

    expect(event.message).toBe('alert("xss")Nice pick!');
    expect(event.message).not.toContain('<script>');

    socket.disconnect();
  });

  it('truncates messages to 500 characters', async () => {
    const { users, league } = await setupLeague();

    const socket = await connectClient(league.id);

    const msgPromise = new Promise((resolve) => socket.on('draft:message', resolve));

    const longMessage = 'A'.repeat(600);
    socket.emit('draft:message', {
      leagueId: league.id,
      userId: users[0].user.id,
      username: users[0].user.username,
      message: longMessage,
    });

    const event = await Promise.race([
      msgPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);

    expect(event.message).toHaveLength(500);

    socket.disconnect();
  });

  it('ignores messages with missing required fields', async () => {
    const { league } = await setupLeague();

    const socket = await connectClient(league.id);

    // No userId
    socket.emit('draft:message', {
      leagueId: league.id,
      message: 'No user',
    });

    // No message
    socket.emit('draft:message', {
      leagueId: league.id,
      userId: 'some-id',
    });

    // Give time for any potential DB writes
    await new Promise((resolve) => setTimeout(resolve, 500));

    const result = await pool.query(
      'SELECT * FROM draft_messages WHERE league_id = $1',
      [league.id]
    );
    expect(result.rows).toHaveLength(0);

    socket.disconnect();
  });

  it('does not broadcast to other league rooms', async () => {
    const { users, league } = await setupLeague();
    const { users: users2, league: league2 } = await setupLeague();

    const sender = await connectClient(league.id);
    const otherRoom = await connectClient(league2.id);

    let receivedInOtherRoom = false;
    otherRoom.on('draft:message', () => { receivedInOtherRoom = true; });

    const sameRoomPromise = new Promise((resolve) => sender.on('draft:message', resolve));

    sender.emit('draft:message', {
      leagueId: league.id,
      userId: users[0].user.id,
      username: users[0].user.username,
      message: 'Private to league 1',
    });

    await Promise.race([
      sameRoomPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);

    // Give extra time for any stray events
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(receivedInOtherRoom).toBe(false);

    sender.disconnect();
    otherRoom.disconnect();
  });
});
