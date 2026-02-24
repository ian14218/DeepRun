-- MM Fantasy: Initial Schema Migration
-- Run this against a PostgreSQL database to create all tables.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(50)  UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Leagues
DO $$ BEGIN
  CREATE TYPE draft_status_enum AS ENUM ('pre_draft', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS leagues (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             VARCHAR(100)     NOT NULL,
  invite_code      VARCHAR(10)      UNIQUE NOT NULL,
  team_count       INTEGER          NOT NULL CHECK (team_count >= 4 AND team_count <= 20),
  roster_size      INTEGER          NOT NULL DEFAULT 10,
  draft_status     draft_status_enum NOT NULL DEFAULT 'pre_draft',
  commissioner_id  UUID             NOT NULL REFERENCES users(id),
  created_at       TIMESTAMP        NOT NULL DEFAULT NOW()
);

-- League Members (join table)
CREATE TABLE IF NOT EXISTS league_members (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id      UUID    NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id        UUID    NOT NULL REFERENCES users(id),
  team_name      VARCHAR(100),
  draft_position INTEGER,
  joined_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, user_id)
);

-- Tournament Teams
CREATE TABLE IF NOT EXISTS tournament_teams (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                VARCHAR(100) NOT NULL,
  seed                INTEGER      NOT NULL CHECK (seed >= 1 AND seed <= 16),
  region              VARCHAR(50)  NOT NULL,
  is_eliminated       BOOLEAN      NOT NULL DEFAULT FALSE,
  eliminated_in_round VARCHAR(20),
  wins                INTEGER      NOT NULL DEFAULT 0,
  external_id         VARCHAR(50)  UNIQUE
);

-- Players
CREATE TABLE IF NOT EXISTS players (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  team_id       UUID         NOT NULL REFERENCES tournament_teams(id),
  position      VARCHAR(10),
  jersey_number INTEGER,
  is_eliminated BOOLEAN      NOT NULL DEFAULT FALSE,
  external_id   VARCHAR(50)  UNIQUE
);

-- Draft Picks
CREATE TABLE IF NOT EXISTS draft_picks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id   UUID      NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  member_id   UUID      NOT NULL REFERENCES league_members(id),
  player_id   UUID      NOT NULL REFERENCES players(id),
  pick_number INTEGER   NOT NULL,
  round       INTEGER   NOT NULL,
  picked_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, player_id),
  UNIQUE (league_id, pick_number)
);

-- Player Game Stats
CREATE TABLE IF NOT EXISTS player_game_stats (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id        UUID        NOT NULL REFERENCES players(id),
  game_date        DATE        NOT NULL,
  opponent_team_id UUID        REFERENCES tournament_teams(id),
  points           INTEGER     NOT NULL DEFAULT 0,
  tournament_round VARCHAR(20) NOT NULL,
  external_game_id VARCHAR(50),
  UNIQUE (player_id, external_game_id)
);
