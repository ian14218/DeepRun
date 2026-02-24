const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');

let userCounter = 0;
let teamCounter = 0;
let playerCounter = 0;
let leagueCounter = 0;
let statCounter = 0;

async function createTestUser(overrides = {}) {
  userCounter += 1;
  const defaults = {
    username: `user${userCounter}`,
    email: `user${userCounter}@example.com`,
    password: 'Password123!',
  };
  const data = { ...defaults, ...overrides };

  const res = await request(app).post('/api/auth/register').send(data);
  if (res.status !== 201) {
    throw new Error(`createTestUser failed: ${JSON.stringify(res.body)}`);
  }

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: data.email, password: data.password });

  return { user: loginRes.body.user, token: loginRes.body.token };
}

async function createTestTeam(overrides = {}) {
  teamCounter += 1;
  const defaults = {
    name: `Team ${teamCounter}`,
    seed: (teamCounter % 16) + 1,
    region: 'East',
    is_eliminated: false,
    wins: 0,
    external_id: `ext-team-${teamCounter}`,
  };
  const data = { ...defaults, ...overrides };

  const result = await pool.query(
    `INSERT INTO tournament_teams (name, seed, region, is_eliminated, wins, external_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.name, data.seed, data.region, data.is_eliminated, data.wins, data.external_id]
  );
  return result.rows[0];
}

async function createTestPlayer(teamId, overrides = {}) {
  playerCounter += 1;
  const defaults = {
    name: `Player ${playerCounter}`,
    position: 'G',
    jersey_number: playerCounter,
    is_eliminated: false,
    external_id: `ext-player-${playerCounter}`,
  };
  const data = { ...defaults, ...overrides };

  const result = await pool.query(
    `INSERT INTO players (name, team_id, position, jersey_number, is_eliminated, external_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.name, teamId, data.position, data.jersey_number, data.is_eliminated, data.external_id]
  );
  return result.rows[0];
}

// ─── Phase 8 helpers ──────────────────────────────────────────────────────────

async function createTestLeague(commissionerId, overrides = {}) {
  leagueCounter += 1;
  const defaults = {
    name: `League ${leagueCounter}`,
    invite_code: `LC${String(leagueCounter).padStart(6, '0')}`,
    team_count: 4,
    roster_size: 2,
    draft_status: 'completed',
  };
  const data = { ...defaults, ...overrides };

  const result = await pool.query(
    `INSERT INTO leagues (name, invite_code, team_count, roster_size, commissioner_id, draft_status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.name, data.invite_code, data.team_count, data.roster_size, commissionerId, data.draft_status]
  );
  return result.rows[0];
}

async function createTestMember(leagueId, userId, overrides = {}) {
  const data = { draft_position: 1, ...overrides };
  const result = await pool.query(
    `INSERT INTO league_members (league_id, user_id, draft_position) VALUES ($1, $2, $3) RETURNING *`,
    [leagueId, userId, data.draft_position]
  );
  return result.rows[0];
}

async function createTestDraftPick(leagueId, memberId, playerId, pickNumber = 1, round = 1) {
  const result = await pool.query(
    `INSERT INTO draft_picks (league_id, member_id, player_id, pick_number, round)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [leagueId, memberId, playerId, pickNumber, round]
  );
  return result.rows[0];
}

async function createTestGameStat(playerId, overrides = {}) {
  statCounter += 1;
  const defaults = {
    game_date: '2024-03-22',
    points: 10,
    tournament_round: 'Round of 64',
    external_game_id: `ext-game-${statCounter}`,
    opponent_team_id: null,
  };
  const data = { ...defaults, ...overrides };

  const result = await pool.query(
    `INSERT INTO player_game_stats (player_id, game_date, opponent_team_id, points, tournament_round, external_game_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [playerId, data.game_date, data.opponent_team_id, data.points, data.tournament_round, data.external_game_id]
  );
  return result.rows[0];
}

module.exports = {
  createTestUser,
  createTestTeam,
  createTestPlayer,
  createTestLeague,
  createTestMember,
  createTestDraftPick,
  createTestGameStat,
};
