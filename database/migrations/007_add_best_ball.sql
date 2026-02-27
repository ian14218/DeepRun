-- 007_add_best_ball.sql — Best Ball salary-cap contest tables

-- Contest container
CREATE TABLE IF NOT EXISTS best_ball_contests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'upcoming',
  budget INTEGER NOT NULL DEFAULT 8000,
  roster_size INTEGER NOT NULL DEFAULT 8,
  lock_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Player prices for a contest
CREATE TABLE IF NOT EXISTS best_ball_player_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contest_id UUID NOT NULL REFERENCES best_ball_contests(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  price INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(contest_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_bb_player_prices_contest ON best_ball_player_prices(contest_id);

-- User entries (one per user per contest)
CREATE TABLE IF NOT EXISTS best_ball_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contest_id UUID NOT NULL REFERENCES best_ball_contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  budget_remaining INTEGER NOT NULL,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  total_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(contest_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bb_entries_contest_user ON best_ball_entries(contest_id, user_id);
CREATE INDEX IF NOT EXISTS idx_bb_entries_leaderboard ON best_ball_entries(contest_id, total_score DESC);

-- Roster players (junction: entry ↔ player)
CREATE TABLE IF NOT EXISTS best_ball_roster_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES best_ball_entries(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  purchase_price INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(entry_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_bb_roster_entry ON best_ball_roster_players(entry_id);

-- Config key-value store for pricing formula constants
CREATE TABLE IF NOT EXISTS best_ball_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(50) UNIQUE NOT NULL,
  value VARCHAR(500) NOT NULL,
  description TEXT
);

-- Seed default config rows
INSERT INTO best_ball_config (key, value, description) VALUES
  ('salary_floor', '500', 'Minimum player price'),
  ('salary_ceiling', '1800', 'Maximum player price'),
  ('curve_exponent', '0.7', 'Price distribution shape (lower = more convex)'),
  ('price_rounding', '50', 'Round prices to nearest N'),
  ('minutes_baseline', '30', 'MPG denominator for minutes weight'),
  ('minutes_floor', '0.15', 'Minimum minutes weight'),
  ('seed_multipliers', '{"1":1.50,"2":1.35,"3":1.25,"4":1.18,"5":1.10,"6":1.05,"7":1.00,"8":0.97,"9":0.95,"10":0.93,"11":0.91,"12":0.88,"13":0.82,"14":0.76,"15":0.72,"16":0.65}', 'JSON map of seed to multiplier')
ON CONFLICT (key) DO NOTHING;
