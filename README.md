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
   for f in database/migrations/0*.sql; do psql -U postgres -d mmfantasy -f "$f"; done
   ```

4. Configure environment variables:
   ```bash
   cp server/.env.example server/.env
   # Edit server/.env with your database credentials and JWT secret
   ```

5. Seed tournament data:
   ```bash
   npm run seed --workspace=server
   node database/seed_first_four.js
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

### League Draft
- **Snake Draft** — Real-time drafting with Socket.IO, alternating pick order, bot auto-pick
- **Draft Board** — Full grid showing all picks with on-the-clock indicator, snake direction arrows, and user column highlighting
- **Draft Timer** — Configurable per-pick timer with pause/resume/disable controls for commissioners
- **Draft Chat** — Real-time chat in the draft room via Socket.IO
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
- **Simulation** — Simulate tournament rounds with random stats via admin UI or CLI (`npm run simulate --workspace=server`)

### General
- **Standings & Leaderboard** — Track team totals, view rosters, compare scores
- **Admin Dashboard** — System stats, user/league management, tournament simulation, First Four pair configuration, simulation reset
