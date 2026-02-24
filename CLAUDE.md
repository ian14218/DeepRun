# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeepRun is a March Madness Fantasy League web app. Groups of 4-20 friends snake-draft NCAA tournament players, then track points across the tournament. The core strategy: the tournament is single-elimination, so players on teams that go deeper play more games and score more total points.

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
```

## Database Setup

Requires PostgreSQL. Create databases `mmfantasy` and `mmfantasy_test`, run migrations from `database/migrations/` in order. Copy `server/.env.example` to `server/.env`. The test database is auto-truncated between test suites — never seed it manually.

### Migrations

Numbered SQL files in `database/migrations/` (e.g., `001_initial_schema.sql`, `002_add_is_bot.sql`). Run sequentially with `psql -U postgres -d mmfantasy -f database/migrations/NNN_name.sql`. When adding schema changes, create the next numbered file. All tables use UUID primary keys (`uuid_generate_v4()`).

### Testing Conventions

Server tests use a separate `mmfantasy_test` database (via `DATABASE_URL_TEST`). Test fixtures are built using helper functions in `server/tests/factories.js` — use these instead of inserting raw SQL in tests. Tables are truncated between test suites automatically.

## Architecture

### Backend (server/src/)
Layered MVC: **routes → services → models → pg**

- `server.js` — HTTP server + Socket.IO bootstrap
- `app.js` — Express app, mounts all route groups under `/api/`
- `db.js` — PostgreSQL connection pool (uses `DATABASE_URL` / `DATABASE_URL_TEST`)
- `routes/` — Express routers (auth, league, draft, player, standings, admin)
- `services/` — Business logic (draft snake ordering, scoring, elimination cascade, ESPN sync)
- `models/` — Raw SQL queries via `pg` pool (no ORM)
- `middleware/` — JWT auth (`auth.middleware.js`), admin role check, global error handler
- `socket/draftSocket.js` — Socket.IO handlers for live draft rooms
- `jobs/` — Scheduled tasks (stat sync from ESPN every 5 minutes)

### Frontend (client/src/)
- `App.jsx` — React Router setup with nested layouts
- `context/AuthContext.jsx` — Auth state, login/register/logout, JWT token management
- `context/SocketContext.jsx` — Socket.IO provider for real-time draft
- `services/` — Axios-based API layer; `api.js` has JWT interceptor that attaches token to all requests
- `components/ui/` — Radix UI primitives (button, card, dialog, etc.)
- `components/layout/` — AppLayout, LeagueLayout (sidebar), AdminLayout
- `components/` — Feature components (DraftBoard, PlayerList, StandingsTable)
- `pages/` — Route pages; `pages/admin/` for admin dashboard
- `lib/utils.js` — `cn()` helper (clsx + tailwind-merge)
- Path alias: `@/` maps to `client/src/`

### Key Domain Logic

**Snake Draft** (`server/src/services/draft.service.js`): `generateSnakeOrder()` produces alternating pick order. Draft picks use PostgreSQL `FOR UPDATE` row locks to prevent race conditions. Bot members auto-pick random available players.

**Elimination** (`server/src/services/elimination.service.js`): When a tournament team is eliminated, all drafted players from that team are cascade-eliminated, affecting scoring.

**Scoring** (`server/src/services/scoring.service.js`): Player scores = sum of `player_game_stats.points`. Team standings = sum of all drafted players' points, ranked.

**Real-time Draft**: Socket.IO events (`draft:pick`, `draft:turn`, `draft:complete`) broadcast to league draft rooms. Server exposes `req.app.io` for emitting from route handlers.

### API Routes

All routes are mounted under `/api/` in `app.js`:

- `/api/auth` — register, login (returns JWT + user)
- `/api/leagues` — CRUD leagues, join via invite code, fill bots
- `/api/leagues/:id/draft` — start draft, make picks, get draft state
- `/api/players` — search/filter players (paginated)
- `/api/leagues/:id/standings` — leaderboard, team rosters, scoreboard
- `/api/admin` — system stats, user/league management (requires admin middleware)

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

`SPEC.md` contains the original 11-phase feature specification. `SPEC_V2.md` has enhancement/polish phases.
