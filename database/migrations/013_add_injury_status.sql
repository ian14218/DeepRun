-- Add injury status to players so we can filter out players with season-ending injuries
ALTER TABLE players ADD COLUMN IF NOT EXISTS injury_status VARCHAR(20) DEFAULT NULL;
