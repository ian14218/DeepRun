-- Performance indexes for production scale
-- These cover the most common JOIN and WHERE patterns in the app.

CREATE INDEX IF NOT EXISTS idx_players_team_id ON players (team_id);
CREATE INDEX IF NOT EXISTS idx_league_members_user_id ON league_members (user_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_member_id ON draft_picks (member_id);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_player_id ON player_game_stats (player_id);
