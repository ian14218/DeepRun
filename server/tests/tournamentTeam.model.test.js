const pool = require('../src/db');
const { runMigrations, truncateTables } = require('./setup');
const { createTestTeam, createTestPlayer, createTestGameStat } = require('./factories');
const tournamentTeamModel = require('../src/models/tournamentTeam.model');

beforeAll(async () => {
  await runMigrations();
});

afterEach(async () => {
  await truncateTables();
});

describe('tournamentTeam.model', () => {
  describe('updateWinsFromStats', () => {
    it('counts distinct games in player_game_stats as wins for a normal team', async () => {
      const team = await createTestTeam({ external_id: 'ext-t1', wins: 0 });
      const player = await createTestPlayer(team.id, { external_id: 'ext-p1' });

      await createTestGameStat(player.id, { external_game_id: 'game-r64', tournament_round: 'Round of 64' });
      await createTestGameStat(player.id, { external_game_id: 'game-r32', tournament_round: 'Round of 32' });

      const updated = await tournamentTeamModel.updateWinsFromStats(team.id);
      expect(updated.wins).toBe(2);
    });

    it('preserves First Four win for a non-eliminated FF team (adds +1 to stat count)', async () => {
      // A First Four winner has wins=1 set directly (no stats for FF game).
      // After they win R64, updateWinsFromStats should give wins=2 (1 stat + 1 FF bonus).
      const team = await createTestTeam({
        external_id: 'ext-ff-winner',
        wins: 1,
        is_first_four: true,
        is_eliminated: false,
      });
      const player = await createTestPlayer(team.id, { external_id: 'ext-p-ff' });

      // One R64 game in stats
      await createTestGameStat(player.id, { external_game_id: 'game-r64', tournament_round: 'Round of 64' });

      const updated = await tournamentTeamModel.updateWinsFromStats(team.id);
      expect(updated.wins).toBe(2); // 1 from stats + 1 FF bonus
    });

    it('does NOT add FF bonus for an eliminated First Four team', async () => {
      const team = await createTestTeam({
        external_id: 'ext-ff-loser',
        wins: 0,
        is_first_four: true,
        is_eliminated: true,
      });
      const player = await createTestPlayer(team.id, { external_id: 'ext-p-ff-loser' });

      const updated = await tournamentTeamModel.updateWinsFromStats(team.id);
      expect(updated.wins).toBe(0); // no stats, no bonus (eliminated)
    });

    it('does NOT add FF bonus for a non-FF team', async () => {
      const team = await createTestTeam({
        external_id: 'ext-normal',
        wins: 0,
        is_first_four: false,
      });
      const player = await createTestPlayer(team.id, { external_id: 'ext-p-normal' });

      await createTestGameStat(player.id, { external_game_id: 'game-r64', tournament_round: 'Round of 64' });

      const updated = await tournamentTeamModel.updateWinsFromStats(team.id);
      expect(updated.wins).toBe(1); // just the stat count, no bonus
    });
  });

  describe('addCurrentRound', () => {
    it('returns correct current_round for a non-FF team', async () => {
      const team = await createTestTeam({ external_id: 'ext-t2', wins: 2 });
      const fetched = await tournamentTeamModel.findById(team.id);
      expect(fetched.current_round).toBe('Sweet 16');
    });

    it('offsets FF win so a FF winner with wins=1 shows Round of 64', async () => {
      const team = await createTestTeam({
        external_id: 'ext-ff-round',
        wins: 1,
        is_first_four: true,
      });
      const fetched = await tournamentTeamModel.findById(team.id);
      expect(fetched.current_round).toBe('Round of 64');
    });

    it('FF winner with wins=2 (won FF + R64) shows Round of 32', async () => {
      const team = await createTestTeam({
        external_id: 'ext-ff-r32',
        wins: 2,
        is_first_four: true,
      });
      const fetched = await tournamentTeamModel.findById(team.id);
      expect(fetched.current_round).toBe('Round of 32');
    });
  });
});
