-- Additional performance indexes for query patterns identified in code review.
-- Covers common JOINs, WHERE clauses, and foreign key lookups that lacked indexes.

-- draft_picks: queried by league_id on every draft state fetch
CREATE INDEX IF NOT EXISTS idx_draft_picks_league_id ON draft_picks (league_id);

-- league_members: queried by league_id on every league/draft operation
CREATE INDEX IF NOT EXISTS idx_league_members_league_id ON league_members (league_id);

-- best_ball_roster_players: player_id and paired_player_id used in score updates and duplicate checks
CREATE INDEX IF NOT EXISTS idx_bb_roster_player_id ON best_ball_roster_players (player_id);
CREATE INDEX IF NOT EXISTS idx_bb_roster_paired_player_id ON best_ball_roster_players (paired_player_id);

-- player_game_stats: game_date used in stat sync queries
CREATE INDEX IF NOT EXISTS idx_player_game_stats_game_date ON player_game_stats (game_date);

-- draft_picks: paired_player_id used in duplicate checks during draft
CREATE INDEX IF NOT EXISTS idx_draft_picks_paired_player_id ON draft_picks (paired_player_id);
