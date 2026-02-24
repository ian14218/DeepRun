-- Add is_bot flag to users table for CPU bot support
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;
