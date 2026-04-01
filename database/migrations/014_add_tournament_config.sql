-- 014_add_tournament_config.sql — Tournament configuration key-value store

CREATE TABLE IF NOT EXISTS tournament_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(50) UNIQUE NOT NULL,
  value VARCHAR(500) NOT NULL,
  description TEXT
);

-- Seed default bracket layout (left-side regions play each other in FF, right-side likewise)
INSERT INTO tournament_config (key, value, description) VALUES
  ('bracket_layout', '{"left":["East","West"],"right":["South","Midwest"]}', 'Bracket region layout: left[0] vs left[1] in FF Game 1, right[0] vs right[1] in FF Game 2')
ON CONFLICT (key) DO NOTHING;
