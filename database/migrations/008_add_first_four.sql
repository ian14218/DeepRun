-- 008: First Four (Play-In Game) Support
-- Adds columns to mark First Four teams and link paired picks

-- tournament_teams: mark and link First Four pairs
ALTER TABLE tournament_teams
  ADD COLUMN IF NOT EXISTS is_first_four BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS first_four_partner_id UUID REFERENCES tournament_teams(id);

-- draft_picks: store paired player alongside primary pick
ALTER TABLE draft_picks
  ADD COLUMN IF NOT EXISTS paired_player_id UUID REFERENCES players(id);

CREATE UNIQUE INDEX IF NOT EXISTS draft_picks_paired_player_unique
  ON draft_picks (league_id, paired_player_id)
  WHERE paired_player_id IS NOT NULL;

-- best_ball_roster_players: same pattern
ALTER TABLE best_ball_roster_players
  ADD COLUMN IF NOT EXISTS paired_player_id UUID REFERENCES players(id);

CREATE UNIQUE INDEX IF NOT EXISTS best_ball_roster_paired_player_unique
  ON best_ball_roster_players (entry_id, paired_player_id)
  WHERE paired_player_id IS NOT NULL;
