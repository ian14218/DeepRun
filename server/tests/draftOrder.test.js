const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
const { runMigrations, truncateTables } = require('./setup');
const { createTestUser, createTestTeam, createTestPlayer } = require('./factories');

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  await truncateTables();
});

// Helper to create a full league via API
async function createFullLeague(teamCount = 4) {
  const commissioner = await createTestUser();
  const res = await request(app)
    .post('/api/leagues')
    .set('Authorization', `Bearer ${commissioner.token}`)
    .send({ name: 'Draft Order Test', team_count: teamCount, roster_size: 2 });

  const league = res.body;

  // Join additional users
  const members = [commissioner];
  for (let i = 1; i < teamCount; i++) {
    const u = await createTestUser();
    await request(app)
      .post('/api/leagues/join')
      .set('Authorization', `Bearer ${u.token}`)
      .send({ invite_code: league.invite_code });
    members.push(u);
  }

  // Fetch league to get member IDs
  const leagueRes = await request(app)
    .get(`/api/leagues/${league.id}`)
    .set('Authorization', `Bearer ${commissioner.token}`);

  return { league: leagueRes.body, commissioner, members };
}

// ─── PUT /api/leagues/:id/draft-order ─────────────────────────────────────────

describe('PUT /api/leagues/:id/draft-order', () => {
  it('saves custom draft order and returns updated members', async () => {
    const { league, commissioner } = await createFullLeague();
    const memberIds = league.members.map((m) => m.id).reverse(); // reverse the join order

    const res = await request(app)
      .put(`/api/leagues/${league.id}/draft-order`)
      .set('Authorization', `Bearer ${commissioner.token}`)
      .send({ memberIds });

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(4);

    // Verify the league now has custom_draft_order flag
    const leagueRes = await request(app)
      .get(`/api/leagues/${league.id}`)
      .set('Authorization', `Bearer ${commissioner.token}`);
    expect(leagueRes.body.custom_draft_order).toBe(true);
  });

  it('returns 403 for non-commissioner', async () => {
    const { league, members } = await createFullLeague();
    const nonCommissioner = members[1];
    const memberIds = league.members.map((m) => m.id);

    const res = await request(app)
      .put(`/api/leagues/${league.id}/draft-order`)
      .set('Authorization', `Bearer ${nonCommissioner.token}`)
      .send({ memberIds });

    expect(res.status).toBe(403);
  });

  it('returns 400 if memberIds is missing', async () => {
    const { league, commissioner } = await createFullLeague();

    const res = await request(app)
      .put(`/api/leagues/${league.id}/draft-order`)
      .set('Authorization', `Bearer ${commissioner.token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 400 if memberIds has wrong count', async () => {
    const { league, commissioner } = await createFullLeague();
    const memberIds = league.members.map((m) => m.id).slice(0, 2);

    const res = await request(app)
      .put(`/api/leagues/${league.id}/draft-order`)
      .set('Authorization', `Bearer ${commissioner.token}`)
      .send({ memberIds });

    expect(res.status).toBe(400);
  });

  it('returns 400 if memberIds has duplicates', async () => {
    const { league, commissioner } = await createFullLeague();
    const memberIds = league.members.map((m) => m.id);
    memberIds[1] = memberIds[0]; // duplicate

    const res = await request(app)
      .put(`/api/leagues/${league.id}/draft-order`)
      .set('Authorization', `Bearer ${commissioner.token}`)
      .send({ memberIds });

    expect(res.status).toBe(400);
  });

  it('returns 400 if memberIds contains invalid member', async () => {
    const { league, commissioner } = await createFullLeague();
    const memberIds = league.members.map((m) => m.id);
    memberIds[0] = '00000000-0000-0000-0000-000000000000';

    const res = await request(app)
      .put(`/api/leagues/${league.id}/draft-order`)
      .set('Authorization', `Bearer ${commissioner.token}`)
      .send({ memberIds });

    expect(res.status).toBe(400);
  });
});

// ─── startDraft respects custom order ─────────────────────────────────────────

describe('startDraft with custom order', () => {
  it('uses custom order when set', async () => {
    const { league, commissioner } = await createFullLeague();

    // Create tournament data so draft can work
    const team = await createTestTeam();
    for (let i = 0; i < 20; i++) {
      await createTestPlayer(team.id);
    }

    // Set custom order: reverse of join order
    const memberIds = league.members.map((m) => m.id).reverse();
    await request(app)
      .put(`/api/leagues/${league.id}/draft-order`)
      .set('Authorization', `Bearer ${commissioner.token}`)
      .send({ memberIds });

    // Start draft
    const startRes = await request(app)
      .post(`/api/leagues/${league.id}/draft/start`)
      .set('Authorization', `Bearer ${commissioner.token}`);

    expect(startRes.status).toBe(200);

    // Verify draft order matches our custom order
    const draftOrder = startRes.body.draft_order;
    expect(draftOrder).toHaveLength(4);
    for (let i = 0; i < memberIds.length; i++) {
      expect(draftOrder[i].member_id).toBe(memberIds[i]);
      expect(draftOrder[i].draft_position).toBe(i + 1);
    }
  });

  it('uses random order when no custom order is set', async () => {
    const { league, commissioner } = await createFullLeague();

    // Create tournament data
    const team = await createTestTeam();
    for (let i = 0; i < 20; i++) {
      await createTestPlayer(team.id);
    }

    // Start draft without setting custom order
    const startRes = await request(app)
      .post(`/api/leagues/${league.id}/draft/start`)
      .set('Authorization', `Bearer ${commissioner.token}`);

    expect(startRes.status).toBe(200);
    expect(startRes.body.draft_order).toHaveLength(4);
    // We can't test randomness, but we can verify all positions are assigned
    const positions = startRes.body.draft_order.map((d) => d.draft_position).sort();
    expect(positions).toEqual([1, 2, 3, 4]);
  });
});
