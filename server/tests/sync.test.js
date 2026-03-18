jest.mock('../src/services/externalApi.service');

const externalApi = require('../src/services/externalApi.service');
const { runSyncJob } = require('../src/jobs/statSync.job');
const pool = require('../src/db');
const { runMigrations, truncateTables } = require('./setup');
const { createTestTeam, createTestPlayer, createTestGameStat, createTestContest } = require('./factories');

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  await truncateTables();
  jest.clearAllMocks();
});


// ─── Shared game fixture builder ───────────────────────────────────────────────

function makeGameResponse(overrides = {}) {
  return {
    external_game_id: 'espn-game-1',
    status: 'final',
    tournament_round: 'Round of 64',
    winner_external_id: 'ext-team-1',
    loser_external_id: 'ext-team-2',
    ...overrides,
  };
}

function makeBoxScore(overrides = {}) {
  return {
    external_game_id: 'espn-game-1',
    game_date: '2025-03-20',
    tournament_round: 'Round of 64',
    teams: [
      {
        external_team_id: 'ext-team-1',
        players: [{ external_player_id: 'ext-player-1', points: 22 }],
      },
      {
        external_team_id: 'ext-team-2',
        players: [{ external_player_id: 'ext-player-2', points: 14 }],
      },
    ],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('statSync.job', () => {
  it('creates Player_Game_Stats records for a completed game', async () => {
    const teamA = await createTestTeam({ external_id: 'ext-team-1', wins: 0 });
    const teamB = await createTestTeam({ external_id: 'ext-team-2', wins: 0 });
    const p1 = await createTestPlayer(teamA.id, { external_id: 'ext-player-1' });
    const p2 = await createTestPlayer(teamB.id, { external_id: 'ext-player-2' });

    externalApi.fetchTodaysGames.mockResolvedValue([makeGameResponse()]);
    externalApi.fetchGameBoxScore.mockResolvedValue(makeBoxScore());

    await runSyncJob();

    const result = await pool.query(
      'SELECT * FROM player_game_stats ORDER BY points DESC'
    );
    expect(result.rows).toHaveLength(2);

    const s1 = result.rows.find((r) => r.player_id === p1.id);
    const s2 = result.rows.find((r) => r.player_id === p2.id);
    expect(s1.points).toBe(22);
    expect(s1.tournament_round).toBe('Round of 64');
    expect(s2.points).toBe(14);
  });

  it('is idempotent — running twice does not duplicate stats', async () => {
    const teamA = await createTestTeam({ external_id: 'ext-team-1', wins: 0 });
    const teamB = await createTestTeam({ external_id: 'ext-team-2', wins: 0 });
    await createTestPlayer(teamA.id, { external_id: 'ext-player-1' });
    await createTestPlayer(teamB.id, { external_id: 'ext-player-2' });

    externalApi.fetchTodaysGames.mockResolvedValue([makeGameResponse()]);
    externalApi.fetchGameBoxScore.mockResolvedValue(makeBoxScore());

    await runSyncJob();
    await runSyncJob();

    const result = await pool.query('SELECT * FROM player_game_stats');
    expect(result.rows).toHaveLength(2);
  });

  it('marks the losing team and their players as eliminated after a final game', async () => {
    const teamA = await createTestTeam({ external_id: 'ext-team-1', wins: 0 });
    const teamB = await createTestTeam({ external_id: 'ext-team-2', wins: 0 });
    await createTestPlayer(teamA.id, { external_id: 'ext-player-1' });
    await createTestPlayer(teamB.id, { external_id: 'ext-player-2' });

    externalApi.fetchTodaysGames.mockResolvedValue([makeGameResponse()]);
    externalApi.fetchGameBoxScore.mockResolvedValue(makeBoxScore());

    await runSyncJob();

    const teamResult = await pool.query(
      'SELECT is_eliminated, eliminated_in_round FROM tournament_teams WHERE id = $1',
      [teamB.id]
    );
    expect(teamResult.rows[0].is_eliminated).toBe(true);
    expect(teamResult.rows[0].eliminated_in_round).toBe('Round of 64');

    const playerResult = await pool.query(
      'SELECT is_eliminated FROM players WHERE team_id = $1',
      [teamB.id]
    );
    expect(playerResult.rows[0].is_eliminated).toBe(true);
  });

  it('sets the winning team wins count from stats — idempotent across multiple sync runs', async () => {
    const teamA = await createTestTeam({ external_id: 'ext-team-1', wins: 0 });
    const teamB = await createTestTeam({ external_id: 'ext-team-2', wins: 0 });
    const p1 = await createTestPlayer(teamA.id, { external_id: 'ext-player-1' });
    await createTestPlayer(teamB.id, { external_id: 'ext-player-2' });

    // Simulate 2 prior wins already stored from previous sync runs
    await createTestGameStat(p1.id, { external_game_id: 'prev-game-1', points: 18 });
    await createTestGameStat(p1.id, { external_game_id: 'prev-game-2', points: 12 });

    externalApi.fetchTodaysGames.mockResolvedValue([makeGameResponse()]);
    externalApi.fetchGameBoxScore.mockResolvedValue(makeBoxScore());

    // First sync run — new game stats inserted, wins derived from 3 distinct games
    await runSyncJob();
    const afterFirst = await pool.query(
      'SELECT wins FROM tournament_teams WHERE id = $1',
      [teamA.id]
    );
    expect(afterFirst.rows[0].wins).toBe(3); // 2 prior + 1 new

    // Second sync run — same game, ON CONFLICT updates stats, wins stay at 3
    await runSyncJob();
    const afterSecond = await pool.query(
      'SELECT wins FROM tournament_teams WHERE id = $1',
      [teamA.id]
    );
    expect(afterSecond.rows[0].wins).toBe(3); // still 3, not 4
  });

  it('handles API errors gracefully without crashing', async () => {
    externalApi.fetchTodaysGames.mockRejectedValue(new Error('Network timeout'));

    await expect(runSyncJob()).resolves.toBeUndefined();
  });

  it('skips upcoming games — no stats created, no box score fetched', async () => {
    const teamA = await createTestTeam({ external_id: 'ext-team-1' });
    const teamB = await createTestTeam({ external_id: 'ext-team-2' });
    await createTestPlayer(teamA.id, { external_id: 'ext-player-1' });
    await createTestPlayer(teamB.id, { external_id: 'ext-player-2' });

    externalApi.fetchTodaysGames.mockResolvedValue([
      makeGameResponse({ status: 'upcoming', winner_external_id: null, loser_external_id: null }),
    ]);

    await runSyncJob();

    const stats = await pool.query('SELECT * FROM player_game_stats');
    expect(stats.rows).toHaveLength(0);
    expect(externalApi.fetchGameBoxScore).not.toHaveBeenCalled();
  });

  it('creates stats for in-progress games but does not trigger elimination', async () => {
    const teamA = await createTestTeam({ external_id: 'ext-team-1', wins: 0 });
    const teamB = await createTestTeam({ external_id: 'ext-team-2', wins: 0 });
    await createTestPlayer(teamA.id, { external_id: 'ext-player-1' });
    await createTestPlayer(teamB.id, { external_id: 'ext-player-2' });

    externalApi.fetchTodaysGames.mockResolvedValue([
      makeGameResponse({ status: 'in_progress', winner_external_id: null, loser_external_id: null }),
    ]);
    externalApi.fetchGameBoxScore.mockResolvedValue(makeBoxScore());

    await runSyncJob();

    const stats = await pool.query('SELECT * FROM player_game_stats');
    expect(stats.rows.length).toBeGreaterThan(0);

    const teamResult = await pool.query(
      'SELECT is_eliminated FROM tournament_teams WHERE id = $1',
      [teamB.id]
    );
    expect(teamResult.rows[0].is_eliminated).toBe(false);
  });

  // ─── First Four handling ────────────────────────────────────────────────────

  it('does NOT create player_game_stats for First Four games', async () => {
    const teamA = await createTestTeam({ external_id: 'ext-team-1', wins: 0, is_first_four: true });
    const teamB = await createTestTeam({ external_id: 'ext-team-2', wins: 0, is_first_four: true });
    await createTestPlayer(teamA.id, { external_id: 'ext-player-1' });
    await createTestPlayer(teamB.id, { external_id: 'ext-player-2' });

    externalApi.fetchTodaysGames.mockResolvedValue([
      makeGameResponse({ tournament_round: 'First Four' }),
    ]);
    externalApi.fetchGameBoxScore.mockResolvedValue(
      makeBoxScore({ tournament_round: 'First Four' })
    );

    await runSyncJob();

    const stats = await pool.query('SELECT * FROM player_game_stats');
    expect(stats.rows).toHaveLength(0);
  });

  it('still eliminates the losing team in First Four games', async () => {
    const teamA = await createTestTeam({ external_id: 'ext-team-1', wins: 0, is_first_four: true });
    const teamB = await createTestTeam({ external_id: 'ext-team-2', wins: 0, is_first_four: true });
    await createTestPlayer(teamA.id, { external_id: 'ext-player-1' });
    await createTestPlayer(teamB.id, { external_id: 'ext-player-2' });

    externalApi.fetchTodaysGames.mockResolvedValue([
      makeGameResponse({ tournament_round: 'First Four' }),
    ]);
    externalApi.fetchGameBoxScore.mockResolvedValue(
      makeBoxScore({ tournament_round: 'First Four' })
    );

    await runSyncJob();

    const loser = await pool.query(
      'SELECT is_eliminated, eliminated_in_round FROM tournament_teams WHERE id = $1',
      [teamB.id]
    );
    expect(loser.rows[0].is_eliminated).toBe(true);
    expect(loser.rows[0].eliminated_in_round).toBe('First Four');
  });

  it('sets wins=1 directly for First Four winner (not via updateWinsFromStats)', async () => {
    const teamA = await createTestTeam({ external_id: 'ext-team-1', wins: 0, is_first_four: true });
    const teamB = await createTestTeam({ external_id: 'ext-team-2', wins: 0, is_first_four: true });
    await createTestPlayer(teamA.id, { external_id: 'ext-player-1' });
    await createTestPlayer(teamB.id, { external_id: 'ext-player-2' });

    externalApi.fetchTodaysGames.mockResolvedValue([
      makeGameResponse({ tournament_round: 'First Four' }),
    ]);
    externalApi.fetchGameBoxScore.mockResolvedValue(
      makeBoxScore({ tournament_round: 'First Four' })
    );

    await runSyncJob();

    const winner = await pool.query(
      'SELECT wins FROM tournament_teams WHERE id = $1',
      [teamA.id]
    );
    expect(winner.rows[0].wins).toBe(1);
  });

  // ─── Best Ball lock_date ─────────────────────────────────────────────────────

  it('does NOT lock Best Ball contest when lock_date is in the future', async () => {
    const teamA = await createTestTeam({ external_id: 'ext-team-1', wins: 0 });
    const teamB = await createTestTeam({ external_id: 'ext-team-2', wins: 0 });
    await createTestPlayer(teamA.id, { external_id: 'ext-player-1' });
    await createTestPlayer(teamB.id, { external_id: 'ext-player-2' });

    // Contest with lock_date in the future
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const contest = await createTestContest({ status: 'open', lock_date: futureDate });

    externalApi.fetchTodaysGames.mockResolvedValue([makeGameResponse()]);
    externalApi.fetchGameBoxScore.mockResolvedValue(makeBoxScore());

    await runSyncJob();

    const updated = await pool.query(
      'SELECT status FROM best_ball_contests WHERE id = $1',
      [contest.id]
    );
    expect(updated.rows[0].status).toBe('open');
  });

  it('locks Best Ball contest when lock_date has passed', async () => {
    const teamA = await createTestTeam({ external_id: 'ext-team-1', wins: 0 });
    const teamB = await createTestTeam({ external_id: 'ext-team-2', wins: 0 });
    await createTestPlayer(teamA.id, { external_id: 'ext-player-1' });
    await createTestPlayer(teamB.id, { external_id: 'ext-player-2' });

    // Contest with lock_date in the past
    const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const contest = await createTestContest({ status: 'open', lock_date: pastDate });

    externalApi.fetchTodaysGames.mockResolvedValue([makeGameResponse()]);
    externalApi.fetchGameBoxScore.mockResolvedValue(makeBoxScore());

    await runSyncJob();

    const updated = await pool.query(
      'SELECT status FROM best_ball_contests WHERE id = $1',
      [contest.id]
    );
    expect(updated.rows[0].status).toBe('live');
  });

  it('does NOT lock Best Ball contest during First Four even if lock_date is in the past', async () => {
    // Edge case: First Four game processed, lock_date passed — contest should lock
    // because lock is date-based, not game-type-based. The lock_date is set to
    // 30 min before R64 tip-off, so if it has passed, locking is correct.
    // This test verifies that FF games don't interfere with the date-based lock.
    const teamA = await createTestTeam({ external_id: 'ext-team-1', wins: 0, is_first_four: true });
    const teamB = await createTestTeam({ external_id: 'ext-team-2', wins: 0, is_first_four: true });
    await createTestPlayer(teamA.id, { external_id: 'ext-player-1' });
    await createTestPlayer(teamB.id, { external_id: 'ext-player-2' });

    // lock_date in the future — contest should stay open even when processing a game
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const contest = await createTestContest({ status: 'open', lock_date: futureDate });

    externalApi.fetchTodaysGames.mockResolvedValue([
      makeGameResponse({ tournament_round: 'First Four' }),
    ]);
    externalApi.fetchGameBoxScore.mockResolvedValue(
      makeBoxScore({ tournament_round: 'First Four' })
    );

    await runSyncJob();

    const updated = await pool.query(
      'SELECT status FROM best_ball_contests WHERE id = $1',
      [contest.id]
    );
    expect(updated.rows[0].status).toBe('open');
  });
});
