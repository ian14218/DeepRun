const request = require('supertest');
const app = require('../../src/app');
const { runMigrations, truncateTables, closePool } = require('../setup');
const { createTestTeam, createTestPlayer, createTestGameStat } = require('../factories');
const { eliminateTeam } = require('../../src/services/elimination.service');

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await closePool();
});

describe('Full lifecycle integration', () => {
  /**
   * This test walks through the complete application flow:
   *   1.  Register 4 users
   *   2.  User 1 creates a league (4 teams, roster_size 2)
   *   3.  Users 2–4 join via invite code
   *   4.  Create 8 tournament players (4 per team, 2 teams)
   *   5.  Commissioner starts the snake draft
   *   6.  All 8 picks made in the correct snake order (reads current_turn each time)
   *   7.  Draft is marked complete
   *   8.  Game stats added for all drafted players
   *   9.  One tournament team eliminated
   *   10. Standings verified for scores, active/eliminated counts, and sort order
   */
  it('register → create → join → draft → score → eliminate → standings', async () => {
    // ── 1. Register 4 users ────────────────────────────────────────────────
    const users = [];
    for (let i = 1; i <= 4; i++) {
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ username: `lcuser${i}`, email: `lc${i}@test.com`, password: 'Password123!' });
      expect(reg.status).toBe(201);

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: `lc${i}@test.com`, password: 'Password123!' });
      expect(login.status).toBe(200);
      users.push({ user: login.body.user, token: login.body.token });
    }

    // ── 2. User 1 creates a league ─────────────────────────────────────────
    const createRes = await request(app)
      .post('/api/leagues')
      .set('Authorization', `Bearer ${users[0].token}`)
      .send({ name: 'Lifecycle League', team_count: 4, roster_size: 2 });
    expect(createRes.status).toBe(201);
    const { id: leagueId, invite_code } = createRes.body;

    // ── 3. Users 2–4 join ──────────────────────────────────────────────────
    for (let i = 1; i <= 3; i++) {
      const joinRes = await request(app)
        .post('/api/leagues/join')
        .set('Authorization', `Bearer ${users[i].token}`)
        .send({ invite_code });
      expect(joinRes.status).toBe(200);
    }

    // ── 4. Create tournament teams and 8 players ───────────────────────────
    const teamA = await createTestTeam({ name: 'Duke', seed: 1, region: 'East' });
    const teamB = await createTestTeam({ name: 'UNC', seed: 2, region: 'East' });
    const players = [];
    for (let i = 0; i < 4; i++) players.push(await createTestPlayer(teamA.id, { name: `Duke P${i + 1}` }));
    for (let i = 0; i < 4; i++) players.push(await createTestPlayer(teamB.id, { name: `UNC P${i + 1}` }));

    // ── 5. Commissioner starts the draft ───────────────────────────────────
    const startRes = await request(app)
      .post(`/api/leagues/${leagueId}/draft/start`)
      .set('Authorization', `Bearer ${users[0].token}`);
    expect(startRes.status).toBe(200);
    expect(startRes.body.draft_status).toBe('in_progress');

    // Non-commissioner cannot start an already-started draft
    const badStart = await request(app)
      .post(`/api/leagues/${leagueId}/draft/start`)
      .set('Authorization', `Bearer ${users[1].token}`);
    expect(badStart.status).toBe(403);

    // ── 6. Make 8 picks in snake order (reads current_turn each time) ──────
    // The snake order is [1,2,3,4, 4,3,2,1] for 4 teams × 2 rounds.
    // Players 0–3 go in round 1 (one Duke player per team).
    // Players 4–7 go in round 2 (one UNC player per team).
    // Result: every team ends up with exactly 1 Duke + 1 UNC player.
    for (let i = 0; i < 8; i++) {
      const stateRes = await request(app)
        .get(`/api/leagues/${leagueId}/draft`)
        .set('Authorization', `Bearer ${users[0].token}`);
      expect(stateRes.status).toBe(200);
      expect(stateRes.body.current_turn).not.toBeNull();

      const currentUserId = stateRes.body.current_turn.user_id;
      const picker = users.find((u) => u.user.id === currentUserId);
      expect(picker).toBeDefined();

      // Wrong user cannot pick
      const wrongUser = users.find((u) => u.user.id !== currentUserId);
      const badPick = await request(app)
        .post(`/api/leagues/${leagueId}/draft/pick`)
        .set('Authorization', `Bearer ${wrongUser.token}`)
        .send({ player_id: players[i].id });
      expect(badPick.status).toBe(403);

      // Correct user picks
      const pickRes = await request(app)
        .post(`/api/leagues/${leagueId}/draft/pick`)
        .set('Authorization', `Bearer ${picker.token}`)
        .send({ player_id: players[i].id });
      expect(pickRes.status).toBe(200);
    }

    // ── 7. Draft is now complete ────────────────────────────────────────────
    const finalState = await request(app)
      .get(`/api/leagues/${leagueId}/draft`)
      .set('Authorization', `Bearer ${users[0].token}`);
    expect(finalState.body.status).toBe('completed');
    expect(finalState.body.picks).toHaveLength(8);
    expect(finalState.body.current_turn).toBeNull();

    // Cannot pick after completion
    const afterDone = await request(app)
      .post(`/api/leagues/${leagueId}/draft/pick`)
      .set('Authorization', `Bearer ${users[0].token}`)
      .send({ player_id: players[0].id });
    expect(afterDone.status).toBe(400);

    // ── 8. Add game stats for all players ──────────────────────────────────
    for (const p of players.slice(0, 4)) {
      await createTestGameStat(p.id, { points: 20, tournament_round: 'Round of 64' });
    }
    for (const p of players.slice(4)) {
      await createTestGameStat(p.id, { points: 10, tournament_round: 'Round of 64' });
    }

    // ── 9. Eliminate UNC (teamB) ───────────────────────────────────────────
    await eliminateTeam(teamB.id, 'Round of 64');

    // ── 10. Verify standings ───────────────────────────────────────────────
    const standingsRes = await request(app)
      .get(`/api/leagues/${leagueId}/standings`)
      .set('Authorization', `Bearer ${users[0].token}`);
    expect(standingsRes.status).toBe(200);

    const standings = standingsRes.body;
    expect(standings).toHaveLength(4);

    // Each team drafted 1 Duke (20 pts) and 1 UNC (10 pts) → total 30 pts each
    for (const row of standings) {
      expect(row.total_score).toBe(30);
      expect(row.active_players).toBe(1);    // Duke player is alive
      expect(row.eliminated_players).toBe(1); // UNC player is eliminated
      expect(row.players_remaining).toBe(1);
    }

    // Standings are sorted descending (all equal here, so any order is fine)
    for (let i = 0; i < standings.length - 1; i++) {
      expect(standings[i].total_score).toBeGreaterThanOrEqual(standings[i + 1].total_score);
    }

    // Unauthenticated standings request is rejected
    const unauth = await request(app).get(`/api/leagues/${leagueId}/standings`);
    expect(unauth.status).toBe(401);
  });
});
