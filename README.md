# DeepRun

A March Madness Fantasy League web app with two game modes:

- **League Draft** — Groups of 4–20 friends snake-draft NCAA tournament players, then track points across the tournament. The core strategy: the tournament is single-elimination, so players on teams that go deeper play more games and score more total points.

- **Best Ball** — A global salary-cap contest where every user competes in a single pool. Build an 8-player lineup with an $8,000 virtual budget. Players are priced based on PPG, minutes, and tournament seed. No league needed — compete against the entire platform.

## Tech Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS 4, Radix UI, React Router 7, Socket.IO Client, Axios
- **Backend**: Express 4, PostgreSQL (pg), JWT auth (bcryptjs), Socket.IO, Axios (ESPN API)
- **Testing**: Jest + Supertest (server), Vitest + React Testing Library (client)

## Project Structure

```
DeepRun/
├── client/          # React/Vite frontend
├── server/          # Express/Node backend
├── database/        # PostgreSQL migrations & seeds
├── spec/            # Feature specifications
└── package.json     # npm workspaces root
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create PostgreSQL databases:
   ```sql
   CREATE DATABASE mmfantasy;
   CREATE DATABASE mmfantasy_test;
   ```

3. Configure environment variables:
   ```bash
   cp server/.env.example server/.env
   # Edit server/.env with your database credentials and JWT secret
   ```

4. Run migrations (auto or manual):
   ```bash
   # Option A: Auto-migrate on startup (set MIGRATE_ON_START=true in .env)
   # Option B: Manual
   for f in database/migrations/0*.sql; do psql -U postgres -d mmfantasy -f "$f"; done
   ```

5. Seed tournament data (when tournament teams are announced):
   ```bash
   npm run seed --workspace=server           # Imports teams, rosters, stats from ESPN
   node database/seed_first_four.js          # Auto-detects and seeds First Four teams
   ```

### Development

```bash
npm run dev:server    # Express API on :3001
npm run dev:client    # Vite dev server on :5173
```

### Testing

```bash
npm test              # Run all tests
npm run test:server   # Server tests only
npm run test:client   # Client tests only
```

## Production Deployment

### Railway (Recommended)

The project includes a `railway.json` config for one-click deployment.

1. Push to a GitHub repo
2. Connect the repo to Railway
3. Add a PostgreSQL plugin (sets `DATABASE_URL` automatically)
4. Set environment variables (see `server/.env.production.example`):
   - `JWT_SECRET` — long random string
   - `CORS_ORIGIN` — your production domain
   - `MIGRATE_ON_START=true`
   - `SYNC_ENABLED=true`
5. Deploy — Railway runs `npm install && npm run build`, then `npm start`

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | JWT token signing secret |
| `CORS_ORIGIN` | Yes (prod) | `*` | Allowed origin for CORS |
| `MIGRATE_ON_START` | No | `false` | Auto-run migrations on startup |
| `SYNC_ENABLED` | No | `false` | Enable ESPN stat sync job |
| `SYNC_INTERVAL_MS` | No | `300000` | Stat sync interval (ms) |
| `SIMULATION_ENABLED` | No | `false` | Enable simulation endpoints (dev/staging only) |
| `PORT` | No | `3001` | Server port |
| `NODE_ENV` | No | — | Set to `production` for prod builds |

### Tournament Seeding Workflow (March 15+)

When the NCAA tournament bracket is announced:

1. Update `R64_DATES` in `database/seed_tournament.js` with the actual Round of 64 dates
2. Run the seed script:
   ```bash
   node database/seed_tournament.js --year 2026 --dry-run  # Preview first
   node database/seed_tournament.js --year 2026            # Import teams + rosters
   ```
3. Seed First Four teams (auto-detected from bracket structure):
   ```bash
   node database/seed_first_four.js --dry-run  # Preview detected pairs
   node database/seed_first_four.js             # Import rosters + set pairs
   ```

### Architecture

- **Server** serves the built client from `client/dist/` in production
- **Health check** at `GET /api/health` (verifies DB connectivity)
- **Graceful shutdown** on SIGTERM/SIGINT (stops scheduler, drains connections)
- **SSL** auto-enabled for production database connections
- **Socket.IO** requires JWT authentication for all connections
- **Rate limiting**: 15 req/15 min on auth, 200 req/min global API limit

## Features

### League Draft
- **Snake Draft** — Real-time drafting with Socket.IO, alternating pick order, bot auto-pick
- **Draft Board** — Full grid showing all picks with on-the-clock indicator, snake direction arrows, and user column highlighting
- **Draft Timer** — Configurable per-pick timer with pause/resume/disable controls for commissioners
- **Draft Chat** — Real-time authenticated chat in the draft room via Socket.IO
- **First Four Pairs** — Play-in game teams are drafted as pairs; picking a First Four player prompts selection of a partner from the opposing team
- **League Management** — Create/join leagues via invite code, fill empty spots with bots

### Best Ball
- **Salary Cap** — Build an 8-player roster within an $8,000 budget
- **Dynamic Pricing** — Player prices calculated from PPG, minutes, and seed using a multi-step pricing pipeline
- **Global Leaderboard** — Compete against all users on the platform

### Tournament
- **Live Scoring** — Player stats synced from ESPN every 5 minutes, automatic score calculations
- **Elimination Cascade** — When a tournament team loses, all drafted players from that team are eliminated
- **Bracket View** — Visual tournament bracket with First Four play-in section
- **First Four** — 4 play-in games (68 → 64 teams) with paired team management

### Security
- JWT authentication with 24h expiry and auto-logout
- Socket.IO JWT authentication middleware
- Helmet security headers
- Rate limiting (auth + global API)
- Parameterized SQL queries (no injection)
- HTML sanitization on user input
- Password minimum length (8 characters)
- CORS locked to configured origin in production
- Error handler never leaks internal details on 5xx

### Admin Dashboard
- System stats, user/league management
- Tournament team/player browser
- First Four pair configuration
- Simulation controls (gated by `SIMULATION_ENABLED` env var — disabled in production)
