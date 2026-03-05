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
    season_ppg: null,
    season_mpg: null,
  };
  const data = { ...defaults, ...overrides };

  const result = await pool.query(
    `INSERT INTO players (name, team_id, position, jersey_number, is_eliminated, external_id, season_ppg, season_mpg)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [data.name, teamId, data.position, data.jersey_number, data.is_eliminated, data.external_id, data.season_ppg, data.season_mpg]
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

// ─── Best Ball helpers ────────────────────────────────────────────────────────

let contestCounter = 0;

async function createTestContest(overrides = {}) {
  contestCounter += 1;
  const defaults = {
    name: `Contest ${contestCounter}`,
    status: 'open',
    budget: 8000,
    roster_size: 8,
    lock_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const data = { ...defaults, ...overrides };

  const result = await pool.query(
    `INSERT INTO best_ball_contests (name, status, budget, roster_size, lock_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.name, data.status, data.budget, data.roster_size, data.lock_date]
  );
  return result.rows[0];
}

async function createTestEntry(contestId, userId, overrides = {}) {
  const defaults = {
    budget_remaining: 8000,
    is_complete: false,
    total_score: 0,
  };
  const data = { ...defaults, ...overrides };

  const result = await pool.query(
    `INSERT INTO best_ball_entries (contest_id, user_id, budget_remaining, is_complete, total_score)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [contestId, userId, data.budget_remaining, data.is_complete, data.total_score]
  );
  return result.rows[0];
}

async function createTestPlayerPrice(contestId, playerId, price) {
  const result = await pool.query(
    `INSERT INTO best_ball_player_prices (contest_id, player_id, price)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [contestId, playerId, price]
  );
  return result.rows[0];
}

async function createTestRosterPlayer(entryId, playerId, price) {
  const result = await pool.query(
    `INSERT INTO best_ball_roster_players (entry_id, player_id, purchase_price)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [entryId, playerId, price]
  );
  return result.rows[0];
}

async function seedBestBallConfig() {
  await pool.query(`
    INSERT INTO best_ball_config (key, value, description) VALUES
      ('salary_floor', '500', 'Minimum player price'),
      ('salary_ceiling', '1800', 'Maximum player price'),
      ('curve_exponent', '0.7', 'Price distribution shape'),
      ('price_rounding', '50', 'Round prices to nearest N'),
      ('minutes_baseline', '30', 'MPG denominator for minutes weight'),
      ('minutes_floor', '0.15', 'Minimum minutes weight'),
      ('seed_multipliers', '{"1":1.50,"2":1.35,"3":1.25,"4":1.18,"5":1.10,"6":1.05,"7":1.00,"8":0.97,"9":0.95,"10":0.93,"11":0.91,"12":0.88,"13":0.82,"14":0.76,"15":0.72,"16":0.65}', 'JSON map of seed to multiplier')
    ON CONFLICT (key) DO NOTHING
  `);
}

function resetCounters() {
  userCounter = 0;
  teamCounter = 0;
  playerCounter = 0;
  leagueCounter = 0;
  statCounter = 0;
  contestCounter = 0;
}

module.exports = {
  createTestUser,
  createTestTeam,
  createTestPlayer,
  createTestLeague,
  createTestMember,
  createTestDraftPick,
  createTestGameStat,
  createTestContest,
  createTestEntry,
  createTestPlayerPrice,
  createTestRosterPlayer,
  seedBestBallConfig,
  resetCounters,
};
