# MMFantasy

A March Madness Fantasy League web app. Groups of 4–20 friends snake-draft NCAA tournament players, then track points across the tournament. The core strategy: the tournament is single-elimination, so players on teams that go deeper play more games and score more total points.

## Tech Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS 4, Radix UI, Socket.IO Client
- **Backend**: Express 4, PostgreSQL (pg), JWT auth, Socket.IO
- **Testing**: Jest + Supertest (server), Vitest + React Testing Library (client)

## Project Structure

```
MMFantasy/
├── client/          # React/Vite frontend
├── server/          # Express/Node backend
├── database/        # PostgreSQL migrations & seeds
└── package.json     # npm workspaces root
```

## Getting Started

### Prerequisites

- Node.js
- PostgreSQL

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

3. Run migrations in order:
   ```bash
   psql -U postgres -d mmfantasy -f database/migrations/001_initial_schema.sql
   psql -U postgres -d mmfantasy -f database/migrations/002_add_is_bot.sql
   psql -U postgres -d mmfantasy -f database/migrations/003_add_season_stats.sql
   psql -U postgres -d mmfantasy -f database/migrations/004_add_is_admin.sql
   ```

4. Configure environment variables:
   ```bash
   cp server/.env.example server/.env
   # Edit server/.env with your database credentials and JWT secret
   ```

5. Seed tournament data:
   ```bash
   npm run seed --workspace=server
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

## Features

- **Snake Draft** — Real-time drafting with Socket.IO, alternating pick order, bot auto-pick
- **Live Scoring** — Player stats synced from ESPN, automatic score calculations
- **Elimination Cascade** — When a tournament team loses, all drafted players from that team are eliminated
- **Standings & Leaderboard** — Track team totals, view rosters, compare scores
- **League Management** — Create/join leagues via invite code, fill empty spots with bots
- **Admin Dashboard** — System stats, user/league management, tournament controls
