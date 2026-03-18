jest.mock('../src/services/externalApi.service');

const externalApi = require('../src/services/externalApi.service');
const scoreboardService = require('../src/services/scoreboard.service');
const pool = require('../src/db');
const { runMigrations, truncateTables } = require('./setup');
const {
  createTestUser,
  createTestTeam,
  createTestPlayer,
  createTestLeague,
  createTestMember,
  createTestDraftPick,
  createTestGameStat,
} = require('./factories');

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  await truncateTables();
  jest.clearAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEspnGame(overrides = {}) {
  return {
    external_game_id: 'espn-game-1',
    name: 'Team A vs Team B',
    short_name: 'A vs B',
    start_time: '2026-03-19T12:15:00Z',
    status: 'final',
    status_detail: 'Final',
    tournament_round: 'Round of 64',
    winner_external_id: 'ext-team-1',
    loser_external_id: 'ext-team-2',
    teams: [
      { external_team_id: 'ext-team-1', name: 'Team A', score: 72, is_home: true },
      { external_team_id: 'ext-team-2', name: 'Team B', score: 68, is_home: false },
    ],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('scoreboard.service', () => {
  it('returns games in flat format with home/away fields', async () => {
    await createTestTeam({ external_id: 'ext-team-1' });
    await createTestTeam({ external_id: 'ext-team-2' });

    const { user } = await createTestUser();
    const league = await createTestLeague(user.id);

    externalApi.fetchTodaysGames.mockResolvedValue([makeEspnGame()]);

    const result = await scoreboardService.getScoreboard(league.id);
    expect(result).toHaveLength(1);

    const game = result[0];
    expect(game.id).toBe('espn-game-1');
    expect(game.home_team).toBe('Team A');
    expect(game.away_team).toBe('Team B');
    expect(game.home_score).toBe(72);
    expect(game.away_score).toBe(68);
    expect(game.home_team_external_id).toBe('ext-team-1');
    expect(game.away_team_external_id).toBe('ext-team-2');
    expect(game.status).toBe('final');
    expect(game.tournament_round).toBe('Round of 64');
    expect(Array.isArray(game.players)).toBe(true);
  });

  it('includes drafted players in the flat players array with per-game points', async () => {
    const teamA = await createTestTeam({ external_id: 'ext-team-1' });
    const teamB = await createTestTeam({ external_id: 'ext-team-2' });
    const player1 = await createTestPlayer(teamA.id, { external_id: 'ext-p1', name: 'Star Player' });
    const player2 = await createTestPlayer(teamB.id, { external_id: 'ext-p2', name: 'Other Player' });

    const { user } = await createTestUser();
    const league = await createTestLeague(user.id);
    const member = await createTestMember(league.id, user.id);
    await createTestDraftPick(league.id, member.id, player1.id, 1, 1);

    // Create game stat for this specific game
    await createTestGameStat(player1.id, {
      external_game_id: 'espn-game-1',
      points: 22,
      tournament_round: 'Round of 64',
    });

    externalApi.fetchTodaysGames.mockResolvedValue([makeEspnGame()]);

    const result = await scoreboardService.getScoreboard(league.id);
    const game = result[0];

    expect(game.players).toHaveLength(1);
    expect(game.players[0].player_id).toBe(player1.id);
    expect(game.players[0].name).toBe('Star Player');
    expect(game.players[0].points).toBe(22);
  });

  it('returns empty players array when no drafted players are in the game', async () => {
    await createTestTeam({ external_id: 'ext-team-1' });
    await createTestTeam({ external_id: 'ext-team-2' });

    const { user } = await createTestUser();
    const league = await createTestLeague(user.id);

    externalApi.fetchTodaysGames.mockResolvedValue([makeEspnGame()]);

    const result = await scoreboardService.getScoreboard(league.id);
    expect(result[0].players).toEqual([]);
  });

  it('returns empty array when there are no games today', async () => {
    const { user } = await createTestUser();
    const league = await createTestLeague(user.id);

    externalApi.fetchTodaysGames.mockResolvedValue([]);

    const result = await scoreboardService.getScoreboard(league.id);
    expect(result).toEqual([]);
  });
});
