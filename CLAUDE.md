# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeepRun is a March Madness Fantasy League web app with two game modes:

1. **League Draft** — Groups of 4-20 friends snake-draft NCAA tournament players, then track points across the tournament. The core strategy: the tournament is single-elimination, so players on teams that go deeper play more games and score more total points.

2. **Best Ball** — A global salary-cap contest where every user competes in a single pool. Each user builds an 8-player lineup with an $8,000 virtual budget. Players are priced using a formula based on PPG, minutes, and tournament seed. No league needed — compete against the entire platform.

## Monorepo Structure

npm workspaces with three areas: `client/` (React/Vite), `server/` (Express/Node), `database/` (PostgreSQL migrations/seeds).

## Commands

```bash
# Development
npm run dev:server          # Express on :3001 (nodemon)
npm run dev:client          # Vite on :5173

# Testing
npm test                    # Run all tests (server + client)
npm run test:server         # Jest (server only) — runs with --runInBand --forceExit
npm run test:client         # Vitest (client only)
cd client && npx vitest run src/path/to/file.test.jsx  # Single client test
cd server && npx jest tests/path/to/file.test.js       # Single server test

# Client
cd client && npm run build  # Production build
cd client && npm run lint   # ESLint

# Database
npm run seed --workspace=server       # Import tournament data
npm run simulate --workspace=server   # Simulate tournament games
node database/seed_first_four.js      # Seed First Four team players from ESPN
```

## Database Setup

Requires PostgreSQL. Create databases `mmfantasy` and `mmfantasy_test`, run migrations from `database/migrations/` in order. Copy `server/.env.example` to `server/.env`. The test database is auto-truncated between test suites — never seed it manually.

### Migrations

Numbered SQL files in `database/migrations/` (001 through 008). Run sequentially with `psql -U postgres -d mmfantasy -f database/migrations/NNN_name.sql`. When adding schema changes, create the next numbered file (009+). All tables use UUID primary keys (`uuid_generate_v4()`). Current migrations: initial schema, is_bot, season stats, is_admin, draft timer, draft messages, best ball (5 tables + config seed data), First Four support.

### Testing Conventions

Server tests use a separate `mmfantasy_test` database (via `DATABASE_URL_TEST`). Test fixtures are built using helper functions in `server/tests/factories.js` — use these instead of inserting raw SQL in tests. Tables are truncated between test suites automatically.

## Architecture

### Backend (server/src/)
Layered MVC: **routes → services → models → pg**

- `server.js` — HTTP server + Socket.IO bootstrap
- `app.js` — Express app, mounts all route groups under `/api/`
- `db.js` — PostgreSQL connection pool (uses `DATABASE_URL` / `DATABASE_URL_TEST`)
- `routes/` — Express routers (auth, league, draft, player, standings, admin, bestBall)
- `services/` — Business logic (draft snake ordering, scoring, elimination cascade, ESPN sync, Best Ball pricing/roster, simulation)
- `models/` — Raw SQL queries via `pg` pool (no ORM)
- `middleware/` — JWT auth (`auth.middleware.js`), admin role check, global error handler
- `socket/draftSocket.js` — Socket.IO handlers for live draft rooms
- `jobs/` — Scheduled tasks (stat sync from ESPN every 5 minutes, auto-updates Best Ball scores)

### Frontend (client/src/)
- `App.jsx` — React Router setup with nested layouts
- `context/AuthContext.jsx` — Auth state, login/register/logout, JWT token management
- `context/SocketContext.jsx` — Socket.IO provider for real-time draft
- `services/` — Axios-based API layer; `api.js` has JWT interceptor that attaches token to all requests
- `components/ui/` — Radix UI primitives (button, card, dialog, etc.)
- `components/layout/` — AppLayout, LeagueLayout (sidebar), AdminLayout
- `components/` — Feature components (DraftBoard, PlayerList, StandingsTable, BracketView, TeamLogo, FirstFourPairDialog)
- `components/bestball/` — Best Ball UI components (PlayerMarket, RosterPanel, BudgetBar, PriceTag)
- `pages/` — Route pages; `pages/admin/` for admin dashboard
- `pages/BestBall*.jsx` — Best Ball hub, roster builder, leaderboard, and entry detail pages
- `lib/utils.js` — `cn()` helper (clsx + tailwind-merge)
- Path alias: `@/` maps to `client/src/`

### Key Domain Logic

**Snake Draft** (`server/src/services/draft.service.js`): `generateSnakeOrder()` produces alternating pick order. Draft picks use PostgreSQL `FOR UPDATE` row locks to prevent race conditions. Bot members auto-pick random available players.

**Elimination** (`server/src/services/elimination.service.js`): When a tournament team is eliminated, all drafted players from that team are cascade-eliminated, affecting scoring.

**Scoring** (`server/src/services/scoring.service.js`): Player scores = sum of `player_game_stats.points`. Team standings = sum of all drafted players' points, ranked.

**Real-time Draft**: Socket.IO events (`draft:pick`, `draft:turn`, `draft:complete`) broadcast to league draft rooms. Server exposes `req.app.io` for emitting from route handlers.

**Best Ball** (`server/src/services/bestBall.service.js`, `bestBallPricing.service.js`): Salary-cap contest with transactional roster management using `FOR UPDATE` row locks. Pricing uses a 5-step pipeline (minutes weight → weighted PPG → seed multiplier → normalization → convex curve). Config stored in `best_ball_config` table. Auto-provisions a contest when tournament data exists. Contest lifecycle: upcoming → open → live → completed (auto-transitions to `live` on first simulation). Scores updated via `updateScores()` after stat sync and simulation.

**First Four** (migration 008, `tournamentTeam.model.js`): The NCAA tournament starts with 68 teams — 4 play-in games (the "First Four") reduce to 64 before the Round of 64. Schema: `tournament_teams.is_first_four` (boolean) and `tournament_teams.first_four_partner_id` (FK to partner team, bidirectional). First Four pairs are identified by two teams sharing the same seed+region. Admin UI (`AdminTournament.jsx`, First Four tab) manages pairs via `setFirstFourPartner()`/`clearFirstFourPair()`. When drafting a First Four player, `PlayerList` detects `is_first_four=true` and opens `FirstFourPairDialog`, which calls `/api/players/first-four-partners/:teamId` to load partner-team players. The pick is stored with `draft_picks.paired_player_id`. Best Ball uses the same pattern via `best_ball_roster_players.paired_player_id`. Simulation round 0 matches First Four pairs; losers are eliminated before the Round of 64. First Four games do not generate `player_game_stats` (no scoring impact). The `resetSimulation()` function auto-restores First Four pairs from bracket structure (teams sharing seed+region) so pairs survive any reset.

**Simulation** (`server/src/services/simulation.service.js`): Simulates tournament rounds with bracket-aware matchups. Round 0 = First Four, rounds 1-6 = R64 through Championship. Generates random `player_game_stats` (except First Four), eliminates losing teams, and auto-updates Best Ball scores. Used via admin UI or CLI (`npm run simulate`). `resetSimulation()` in `admin.service.js` clears all game stats, resets team/player elimination and wins, resets Best Ball contests, and restores First Four pairs. With `includeDrafts=true`, also clears draft picks and resets leagues to pre_draft.

### API Routes

All routes are mounted under `/api/` in `app.js`:

- `/api/auth` — register, login (returns JWT + user)
- `/api/leagues` — CRUD leagues, join via invite code, fill bots
- `/api/leagues/:id/draft` — start draft, make picks, get draft state
- `/api/players` — search/filter players (paginated)
- `/api/leagues/:id/standings` — leaderboard, team rosters, scoreboard
- `/api/admin` — system stats, user/league management, tournament simulation, First Four pair management (requires admin middleware)
- `/api/best-ball` — Best Ball contest, entries, roster management, player market, leaderboard, admin endpoints
- `/api/players/first-four-partners/:teamId` — returns players on the partner First Four team for pair selection
- `/api/tournaments` — tournament teams and bracket data
- `/api/chat` — draft room chat messages

## Tech Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS 4, Radix UI, React Router 7, Socket.IO Client, Axios
- **Backend**: Express 4, PostgreSQL (pg driver), JWT auth (bcryptjs), Socket.IO, Axios (ESPN API)
- **Testing**: Jest + Supertest (server), Vitest + React Testing Library + jsdom (client)

## Environment Variables (server/.env)

- `DATABASE_URL` — PostgreSQL connection string
- `DATABASE_URL_TEST` — Test database connection string
- `JWT_SECRET` — Token signing secret
- `PORT` — Server port (default 3001)
- `SYNC_ENABLED` — Enable ESPN stat sync job

## Specs

`spec/SPEC.md` contains the original 11-phase feature specification. `spec/SPEC_V2.md` has enhancement/polish phases. `spec/SPEC_BEST_BALL.md` has the Best Ball salary-cap contest specification.
