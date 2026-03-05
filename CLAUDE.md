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
npm run seed --workspace=server       # Import tournament data from ESPN
node database/seed_first_four.js      # Auto-detect and seed First Four teams
```

## Database Setup

Requires PostgreSQL. Create databases `mmfantasy` and `mmfantasy_test`, run migrations from `database/migrations/` in order. Copy `server/.env.example` to `server/.env`. The test database is auto-truncated between test suites — never seed it manually.

### Migrations

Numbered SQL files in `database/migrations/` (001 through 009). Run sequentially with `psql -U postgres -d mmfantasy -f database/migrations/NNN_name.sql`. When adding schema changes, create the next numbered file (010+). All tables use UUID primary keys (`uuid_generate_v4()`). Current migrations: initial schema, is_bot, season stats, is_admin, draft timer, draft messages, best ball (5 tables + config seed data), First Four support, performance indexes.

### Testing Conventions

Server tests use a separate `mmfantasy_test` database (via `DATABASE_URL_TEST`). Test fixtures are built using helper functions in `server/tests/factories.js` — use these instead of inserting raw SQL in tests. Tables are truncated between test suites automatically.

## Architecture

### Backend (server/src/)
Layered MVC: **routes → services → models → pg**

- `server.js` — HTTP server + Socket.IO bootstrap, scheduler startup, graceful shutdown (SIGTERM/SIGINT)
- `app.js` — Express app, mounts all route groups under `/api/`, global rate limiting
- `db.js` — PostgreSQL connection pool (uses `DATABASE_URL` / `DATABASE_URL_TEST`), SSL in production
- `routes/` — Express routers (auth, league, draft, player, standings, admin, bestBall)
- `services/` — Business logic (draft snake ordering, scoring, elimination cascade, ESPN sync, Best Ball pricing/roster, simulation)
- `models/` — Raw SQL queries via `pg` pool (no ORM). `league.model.js` uses column allowlist for update safety.
- `middleware/` — JWT auth (`auth.middleware.js`), admin role check, global error handler (never leaks 5xx internals)
- `socket/draftSocket.js` — Socket.IO handlers for live draft rooms with JWT authentication middleware
- `jobs/` — Scheduled tasks: `scheduler.js` starts/stops the stat sync interval, `statSync.job.js` fetches ESPN data every 5 minutes

### Frontend (client/src/)
- `App.jsx` — React Router setup with nested layouts
- `context/AuthContext.jsx` — Auth state, login/register/logout, JWT token management with auto-logout on expiry
- `context/SocketContext.jsx` — Socket.IO provider for real-time draft, passes JWT via handshake auth
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

**Real-time Draft**: Socket.IO events (`draft:pick`, `draft:turn`, `draft:complete`) broadcast to league draft rooms. Server exposes `req.app.io` for emitting from route handlers. All socket connections require JWT authentication.

**Best Ball** (`server/src/services/bestBall.service.js`, `bestBallPricing.service.js`): Salary-cap contest with transactional roster management using `FOR UPDATE` row locks. Pricing uses a 5-step pipeline (minutes weight → weighted PPG → seed multiplier → normalization → convex curve). Config stored in `best_ball_config` table. Auto-provisions a contest when tournament data exists. Contest lifecycle: upcoming → open → live → completed (auto-transitions to `live` on first simulation). Scores updated via `updateScores()` after stat sync and simulation.

**First Four** (migration 008, `tournamentTeam.model.js`): The NCAA tournament starts with 68 teams — 4 play-in games (the "First Four") reduce to 64 before the Round of 64. Schema: `tournament_teams.is_first_four` (boolean) and `tournament_teams.first_four_partner_id` (FK to partner team, bidirectional). First Four pairs are identified by two teams sharing the same seed+region. `seed_first_four.js` auto-detects pairs from the database. Admin UI (`AdminTournament.jsx`, First Four tab) manages pairs via `setFirstFourPartner()`/`clearFirstFourPair()`. When drafting a First Four player, `PlayerList` detects `is_first_four=true` and opens `FirstFourPairDialog`, which calls `/api/players/first-four-partners/:teamId` to load partner-team players. The pick is stored with `draft_picks.paired_player_id`. Best Ball uses the same pattern via `best_ball_roster_players.paired_player_id`. Simulation round 0 matches First Four pairs; losers are eliminated before the Round of 64. First Four games do not generate `player_game_stats` (no scoring impact). The `resetSimulation()` function auto-restores First Four pairs from bracket structure (teams sharing seed+region) so pairs survive any reset.

**Simulation** (`server/src/services/simulation.service.js`): Simulates tournament rounds with bracket-aware matchups. Round 0 = First Four, rounds 1-6 = R64 through Championship. Generates random `player_game_stats` (except First Four), eliminates losing teams, and auto-updates Best Ball scores. **Gated by `SIMULATION_ENABLED` env var** — disabled in production to prevent accidental corruption of real tournament data. Used via admin UI or CLI (`npm run simulate`). `resetSimulation()` in `admin.service.js` clears all game stats, resets team/player elimination and wins, resets Best Ball contests, and restores First Four pairs. With `includeDrafts=true`, also clears draft picks and resets leagues to pre_draft.

**ESPN Stat Sync** (`server/src/jobs/statSync.job.js`, `scheduler.js`): Fetches live game data from ESPN every 5 minutes when `SYNC_ENABLED=true`. Upserts player game stats, handles team elimination, updates Best Ball scores. Scheduler starts automatically on server boot and stops on graceful shutdown.

### API Routes

All routes are mounted under `/api/` in `app.js`:

- `/api/auth` — register (password min 8 chars), login (returns JWT + user), rate-limited (15 req/15 min)
- `/api/leagues` — CRUD leagues, join via invite code, fill bots
- `/api/leagues/:id/draft` — start draft, make picks, get draft state
- `/api/players` — search/filter players (paginated)
- `/api/leagues/:id/standings` — leaderboard, team rosters, scoreboard
- `/api/admin` — system stats, user/league management, tournament simulation (gated by `SIMULATION_ENABLED`), First Four pair management (requires admin middleware)
- `/api/best-ball` — Best Ball contest, entries, roster management, player market, leaderboard, admin endpoints
- `/api/players/first-four-partners/:teamId` — returns players on the partner First Four team for pair selection
- `/api/tournaments` — tournament teams and bracket data
- `/api/chat` — draft room chat messages
- `/api/health` — health check with DB ping

### Security

- JWT authentication with 24h expiry, auto-logout on client
- Socket.IO JWT authentication middleware (rejects unauthenticated connections)
- Helmet security headers (CSP disabled for Vite inline scripts)
- Rate limiting: 15 req/15 min on auth routes, 200 req/min global API limit
- Parameterized SQL queries throughout (no string concatenation)
- Column allowlist on `league.model.update()` to prevent SQL injection via dynamic keys
- HTML sanitization via `utils/sanitize.js` on user input
- Password minimum 8 characters
- Error handler never leaks internal details for 5xx errors
- SSL enabled for production database connections
- CORS locked to `CORS_ORIGIN` in production

## Tech Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS 4, Radix UI, React Router 7, Socket.IO Client, Axios
- **Backend**: Express 4, PostgreSQL (pg driver), JWT auth (bcryptjs), Socket.IO, Axios (ESPN API)
- **Testing**: Jest + Supertest (server), Vitest + React Testing Library + jsdom (client)

## Environment Variables (server/.env)

- `DATABASE_URL` — PostgreSQL connection string
- `DATABASE_URL_TEST` — Test database connection string
- `JWT_SECRET` — Token signing secret
- `PORT` — Server port (default 3001)
- `SYNC_ENABLED` — Enable ESPN stat sync job (`true`/`false`)
- `SYNC_INTERVAL_MS` — Sync interval in ms (default 300000 = 5 min)
- `SIMULATION_ENABLED` — Enable simulation endpoints (`true`/`false`, default false)
- `CORS_ORIGIN` — Allowed CORS origin (default `*`, set to your domain in production)
- `MIGRATE_ON_START` — Auto-run migrations on startup (`true`/`false`)
- `NODE_ENV` — Environment (set to `production` for prod)

## Production Deployment

Configured for Railway via `railway.json`. Server serves `client/dist/` for SPA routing. Graceful shutdown handles SIGTERM/SIGINT. See `server/.env.production.example` for required variables.

### Tournament Seeding (March 15+)

1. Confirm R64 dates in `database/seed_tournament.js` (`R64_DATES[2026]`)
2. Run `node database/seed_tournament.js --year 2026` to import teams + rosters
3. Run `node database/seed_first_four.js` to auto-detect and seed First Four pairs

## Specs

`spec/SPEC.md` contains the original 11-phase feature specification. `spec/SPEC_V2.md` has enhancement/polish phases. `spec/SPEC_BEST_BALL.md` has the Best Ball salary-cap contest specification.
