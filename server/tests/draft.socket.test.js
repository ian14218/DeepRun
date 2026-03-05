/**
 * WebSocket integration tests for the draft.
 * Starts a real HTTP server with Socket.IO and connects socket.io-client.
 */
const http = require('http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const request = require('supertest');
const app = require('../src/app');
const { initDraftSocket } = require('../src/socket/draftSocket');
const { runMigrations, truncateTables } = require('./setup');
const { createTestUser, createTestTeam, createTestPlayer } = require('./factories');

let httpServer, serverAddress;

beforeAll(async () => {
  await runMigrations();

  // Create real HTTP server with Socket.IO
  httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });
  app.io = io;
  initDraftSocket(io);

  await new Promise((resolve) => httpServer.listen(0, resolve));
  serverAddress = `http://localhost:${httpServer.address().port}`;
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
});

// Helper — creates a full league, starts draft, returns setup info
async function setupStartedLeague() {
  const users = [];
  for (let i = 0; i < 4; i++) users.push(await createTestUser());

  const team = await createTestTeam({ name: 'NCAA', seed: 1, region: 'East' });
  const players = [];
  for (let i = 0; i < 12; i++) players.push(await createTestPlayer(team.id));

  const leagueRes = await request(httpServer)
    .post('/api/leagues')
    .set('Authorization', `Bearer ${users[0].token}`)
    .send({ name: 'Socket League', team_count: 4, roster_size: 2 });
  const league = leagueRes.body;

  for (let i = 1; i < 4; i++) {
    await request(httpServer)
      .post('/api/leagues/join')
      .set('Authorization', `Bearer ${users[i].token}`)
      .send({ invite_code: league.invite_code });
  }

  const startRes = await request(httpServer)
    .post(`/api/leagues/${league.id}/draft/start`)
    .set('Authorization', `Bearer ${users[0].token}`);

  return { users, league, players, draftOrder: startRes.body.draft_order };
}

// Helper — connect a socket client with JWT auth and join a league room
function connectClient(leagueId, token) {
  return new Promise((resolve, reject) => {
    const socket = ioc(serverAddress, { forceNew: true, auth: { token } });
    socket.on('connect', () => {
      socket.emit('join-draft', { leagueId });
      resolve(socket);
    });
    socket.on('connect_error', reject);
  });
}

describe('Draft WebSocket events', () => {
  it('emits draft:pick to the league room when a pick is made', async () => {
    const { users, league, players, draftOrder } = await setupStartedLeague();

    const socket = await connectClient(league.id, users[0].token);

    const pickEvent = new Promise((resolve) => socket.on('draft:pick', resolve));

    const firstPicker = draftOrder.find((d) => d.draft_position === 1);
    const pickerUser  = users.find((u) => u.user.id === firstPicker.user_id);

    await request(httpServer)
      .post(`/api/leagues/${league.id}/draft/pick`)
      .set('Authorization', `Bearer ${pickerUser.token}`)
      .send({ player_id: players[0].id });

    const event = await Promise.race([
      pickEvent,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);

    expect(event).toHaveProperty('player_id', players[0].id);
    expect(event).toHaveProperty('pick_number', 1);

    socket.disconnect();
  });

  it('emits draft:turn to the league room after a pick', async () => {
    const { users, league, players, draftOrder } = await setupStartedLeague();

    const socket = await connectClient(league.id, users[0].token);

    const turnEvent = new Promise((resolve) => socket.on('draft:turn', resolve));

    const firstPicker = draftOrder.find((d) => d.draft_position === 1);
    const pickerUser  = users.find((u) => u.user.id === firstPicker.user_id);

    await request(httpServer)
      .post(`/api/leagues/${league.id}/draft/pick`)
      .set('Authorization', `Bearer ${pickerUser.token}`)
      .send({ player_id: players[0].id });

    const event = await Promise.race([
      turnEvent,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);

    // The next drafter should have draft_position 2
    const secondPicker = draftOrder.find((d) => d.draft_position === 2);
    expect(event).toHaveProperty('user_id', secondPicker.user_id);

    socket.disconnect();
  });
});
