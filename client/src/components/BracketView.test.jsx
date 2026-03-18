import { describe, it, expect } from 'vitest';
import { buildRegionRounds, buildFinalRounds } from './BracketView';

// Helper to create a team with required fields
function makeTeam(seed, overrides = {}) {
  return {
    id: `team-${seed}-${overrides.region || 'East'}`,
    external_id: `ext-${seed}-${overrides.region || 'East'}`,
    name: `Team ${seed}`,
    seed,
    region: 'East',
    wins: 0,
    is_eliminated: false,
    is_first_four: false,
    ...overrides,
  };
}

// Build a full region of 16 teams (seeds 1-16)
function makeRegion(overrides = {}) {
  return Array.from({ length: 16 }, (_, i) => makeTeam(i + 1, overrides));
}

describe('BracketView data builders', () => {
  describe('buildRegionRounds — First Four offset', () => {
    it('non-FF team with wins=1 appears in R32 (normal advancement)', () => {
      const teams = makeRegion();
      teams[0].wins = 1; // seed 1 won R64
      const rounds = buildRegionRounds(teams);

      // rounds[0] = R64 (16 slots), rounds[1] = R32 (8 slots)
      // Seed 1 is first in the matchup order [1,16], so R32 slot 0
      expect(rounds[1][0]).not.toBeNull();
      expect(rounds[1][0].seed).toBe(1);
    });

    it('FF team with wins=1 does NOT appear in R32 (only won play-in)', () => {
      const teams = makeRegion();
      // Seed 11 is a First Four winner: wins=1 from play-in, but hasn't played R64
      const seed11 = teams.find(t => t.seed === 11);
      seed11.is_first_four = true;
      seed11.wins = 1;

      const rounds = buildRegionRounds(teams);

      // Matchup [6,11] is 5th pair (index 4) in R64, so R32 slot 4
      // With the FF offset, seed 11 has effective wins = 0, so shouldn't advance
      expect(rounds[1][4]).toBeNull();
    });

    it('FF team with wins=2 (won FF + R64) appears in R32', () => {
      const teams = makeRegion();
      const seed11 = teams.find(t => t.seed === 11);
      seed11.is_first_four = true;
      seed11.wins = 2; // FF win + R64 win

      // Eliminate seed 6 so seed 11 can advance
      const seed6 = teams.find(t => t.seed === 6);
      seed6.is_eliminated = true;

      const rounds = buildRegionRounds(teams);

      // [6,11] matchup → R32 slot 4
      expect(rounds[1][4]).not.toBeNull();
      expect(rounds[1][4].seed).toBe(11);
    });

    it('non-FF team with wins=0 stays in R64 only', () => {
      const teams = makeRegion();
      const rounds = buildRegionRounds(teams);

      // All R32 slots should be null (nobody has won anything)
      for (const slot of rounds[1]) {
        expect(slot).toBeNull();
      }
    });
  });

  describe('buildFinalRounds — First Four offset', () => {
    it('FF team with wins=5 appears in Final Four (effective wins=4)', () => {
      const regions = {};
      for (const region of ['East', 'West', 'South', 'Midwest']) {
        const teams = makeRegion({ region });
        // Make seed 1 win enough to reach E8
        teams[0].wins = region === 'East' ? 5 : 4;
        teams[0].is_first_four = region === 'East';
        regions[region] = buildRegionRounds(teams);
      }

      const { ff } = buildFinalRounds(regions);
      // East team is FF with wins=5, effective=4, should be in Final Four
      expect(ff[0]).not.toBeNull();
      expect(ff[0].region).toBe('East');
    });
  });
});
