# March Madness Fantasy App - Specification Document

## 1. Overview

A web application that allows a configurable group of friends (4-20 people) to run a fantasy league for the NCAA March Madness basketball tournament. Users create or join a league, participate in a snake draft of college basketball players before the tournament begins, and then track their drafted players' total points scored throughout the entire tournament. Player stats are pulled automatically from a live sports data API.

### Key Game Mechanic: Tournament Longevity

The core strategic element of the fantasy league is that **not all drafted players are equal in opportunity**. The NCAA tournament is single-elimination, meaning:

- A player on a team that **loses in the Round of 64** plays only **1 game** and can only contribute points from that single game.
- A player on a team that reaches the **championship game** plays up to **6 games**, accumulating points across each round.
- The tournament rounds are: Round of 64, Round of 32, Sweet 16, Elite 8, Final Four, Championship.

This means drafting is a balance between picking **high-scoring players** and picking players on **teams likely to make deep tournament runs**. A role player on a #1 seed who reaches the Final Four may outscore a star on a #14 seed that gets eliminated in the first round. Tracking which teams are still alive vs. eliminated — and how that affects each fantasy team's upside — is a central part of the app experience.

---

## 2. Tech Stack

| Layer        | Technology                          |
|-------------|--------------------------------------|
| Frontend    | React (Vite), React Router, CSS Modules or Tailwind CSS |
| Backend     | Node.js, Express                     |
| Database    | PostgreSQL                           |
| Real-time   | Socket.IO (for draft turn notifications) |
| External API| ESPN or NCAA API for live player stats |
| Auth        | JWT-based authentication             |
| Testing     | Jest (backend), React Testing Library + Vitest (frontend) |

---

## 3. User Roles

| Role          | Description |
|---------------|-------------|
| **Commissioner** | The user who creates the league. Can configure league settings, manage the draft, and resolve disputes. |
| **Team Owner**   | A user who joins a league. Can draft players and view standings. |

All users are Team Owners. The league creator is additionally the Commissioner.

---

## 4. Core Features

### 4.1 User Authentication

Users can register and log in to manage their leagues.

#### Acceptance Criteria
- AC-1.1: A user can register with a username, email, and password.
- AC-1.2: A user can log in with email and password and receive a JWT token.
- AC-1.3: A user can log out, invalidating their session on the client.
- AC-1.4: Passwords are hashed before storage (bcrypt).
- AC-1.5: Protected routes return 401 for unauthenticated requests.

#### Tests
- `POST /api/auth/register` with valid data returns 201 and user object (no password).
- `POST /api/auth/register` with duplicate email returns 409.
- `POST /api/auth/register` with missing fields returns 400.
- `POST /api/auth/login` with valid credentials returns 200 and JWT token.
- `POST /api/auth/login` with invalid credentials returns 401.
- Accessing a protected endpoint without a token returns 401.
- Accessing a protected endpoint with an expired token returns 401.

---

### 4.2 League Management

Users can create and join leagues. The league creator becomes the Commissioner.

#### Acceptance Criteria
- AC-2.1: A user can create a league with a name and a configurable team count (4-20).
- AC-2.2: A user can configure the roster size (number of players each team drafts) when creating a league.
- AC-2.3: Creating a league generates a unique invite code.
- AC-2.4: A user can join a league using an invite code, up to the team limit.
- AC-2.5: A user cannot join a league that is already full.
- AC-2.6: A user cannot join the same league twice.
- AC-2.7: The Commissioner can update league settings before the draft starts.
- AC-2.8: A user can view all leagues they belong to.
- AC-2.9: A user can view the members of a league they belong to.

#### Tests
- `POST /api/leagues` with valid data returns 201 and league object with invite code.
- `POST /api/leagues` with team count < 4 or > 20 returns 400.
- `POST /api/leagues/join` with valid invite code adds user to league, returns 200.
- `POST /api/leagues/join` when league is full returns 400.
- `POST /api/leagues/join` when user is already a member returns 409.
- `POST /api/leagues/join` with invalid invite code returns 404.
- `GET /api/leagues` returns all leagues for the authenticated user.
- `GET /api/leagues/:id` returns league details including members.
- `PUT /api/leagues/:id` by non-commissioner returns 403.
- `PUT /api/leagues/:id` after draft has started returns 400.

---

### 4.3 Snake Draft

An asynchronous snake draft where team owners take turns picking NCAA tournament players. The draft order serpentines (1-N, then N-1, and so on).

#### Acceptance Criteria
- AC-3.1: The Commissioner can start the draft once all team slots are filled.
- AC-3.2: Draft order is randomly generated when the draft is started.
- AC-3.3: The draft follows snake order (Round 1: 1→N, Round 2: N→1, Round 3: 1→N, ...).
- AC-3.4: Each team drafts a number of players equal to the configured roster size.
- AC-3.5: When it is a user's turn, they can pick any undrafted player from the tournament field.
- AC-3.6: A user cannot pick a player that has already been drafted.
- AC-3.7: A user cannot pick when it is not their turn.
- AC-3.8: After a pick is made, the turn advances to the next team in snake order.
- AC-3.9: All league members can see the draft board (picks made so far) in real-time.
- AC-3.10: All league members are notified (in-app) when it becomes their turn.
- AC-3.11: The draft is complete when all teams have filled their rosters.
- AC-3.12: The list of available players comes from the 68 NCAA tournament teams' rosters.

#### Tests
- `POST /api/leagues/:id/draft/start` by commissioner starts draft, returns 200 with draft order.
- `POST /api/leagues/:id/draft/start` by non-commissioner returns 403.
- `POST /api/leagues/:id/draft/start` when league is not full returns 400.
- `POST /api/leagues/:id/draft/start` when draft already started returns 400.
- `POST /api/leagues/:id/draft/pick` with valid player on user's turn returns 200.
- `POST /api/leagues/:id/draft/pick` when not user's turn returns 403.
- `POST /api/leagues/:id/draft/pick` with already-drafted player returns 400.
- `POST /api/leagues/:id/draft/pick` after draft is complete returns 400.
- `GET /api/leagues/:id/draft` returns current draft state (picks, current turn, available players).
- Snake order is correct: for 4 teams, pick order is [1,2,3,4,4,3,2,1,1,2,3,4,...].
- Draft completes after (team_count * roster_size) total picks.
- WebSocket emits `draft:pick` event to all league members when a pick is made.
- WebSocket emits `draft:turn` event to the next drafter when the turn advances.

---

### 4.4 Player Database & Tournament Data

The app maintains a database of all players in the NCAA tournament field, sourced from an external API.

#### Acceptance Criteria
- AC-4.1: The app stores players with: name, team, position, and jersey number.
- AC-4.2: Players are associated with one of the 68 tournament teams.
- AC-4.3: Tournament teams include their seed, region, and current tournament status (active/eliminated).
- AC-4.4: When a team loses a tournament game, they are marked as eliminated and all their players are flagged as inactive (no more games to play).
- AC-4.5: The player database is populated/refreshed from an external data source before the tournament.
- AC-4.6: Players can be searched/filtered by name or team during the draft.
- AC-4.7: Each player record tracks the number of tournament games played and their maximum possible remaining games (based on how far their team can still advance).

#### Tests
- `GET /api/players` returns a paginated list of tournament players.
- `GET /api/players?search=Smith` returns players matching the search term.
- `GET /api/players?team=Duke` returns players from the specified team.
- `GET /api/tournaments/teams` returns all 68 tournament teams with seeds and regions.
- `GET /api/tournaments/teams` includes `is_eliminated` and `current_round` for each team.
- When a team is eliminated, all their players' `is_eliminated` flag is set to true.
- `GET /api/players` response includes `games_played` and `max_remaining_games` for each player.
- A player on an eliminated team has `max_remaining_games = 0`.
- A player on an active team in the Sweet 16 has `max_remaining_games = 3` (Elite 8, Final Four, Championship).
- Player sync job populates the database correctly from external source.

---

### 4.5 Live Scoring & Standings

Player points are automatically tracked from a live data API throughout the tournament. Standings update as games are played.

#### Acceptance Criteria
- AC-5.1: The app periodically fetches game results and player scoring stats from a live API.
- AC-5.2: A team's score is the sum of all points scored by their drafted players across all tournament games.
- AC-5.3: The league standings page shows all teams ranked by total score, updated in near real-time.
- AC-5.4: A user can view a breakdown of their team's scoring: each player's points per game and total.
- AC-5.5: A user can view any other team's roster and scoring breakdown.
- AC-5.6: Games that are in progress show live-updating scores.
- AC-5.7: Players on eliminated teams are visually indicated (grayed out, strikethrough, or "Eliminated" badge) and sorted below active players.
- AC-5.8: When a tournament game concludes, the losing team is automatically marked as eliminated and all their players stop accumulating points.
- AC-5.9: The standings page shows each team's number of **active players** (still alive in the tournament) vs. **eliminated players** alongside their total score.
- AC-5.10: A team roster view shows each player's points broken down **per tournament round** (Round of 64, Round of 32, Sweet 16, Elite 8, Final Four, Championship) so users can see how points accumulated over time.
- AC-5.11: The standings page shows a "potential points" or "players remaining" indicator so users can gauge how much upside each team still has.

#### Tests
- `GET /api/leagues/:id/standings` returns teams ranked by total points.
- `GET /api/leagues/:id/standings` response includes `active_players` and `eliminated_players` count per team.
- `GET /api/leagues/:id/standings` response includes `players_remaining` count for each team.
- `GET /api/leagues/:id/teams/:teamId` returns roster with per-player scoring breakdown.
- `GET /api/leagues/:id/teams/:teamId` response groups player points by tournament round (R64, R32, S16, E8, F4, Championship).
- `GET /api/leagues/:id/teams/:teamId` response marks each player as `active` or `eliminated`.
- Scoring job correctly sums player points across multiple tournament games (a player who plays 4 games has 4 stat entries).
- Scoring job handles a player who scores 0 (played but didn't score).
- Scoring job handles a player whose team is eliminated (no further stat entries are created).
- When a game result is synced and a team loses, that team's `is_eliminated` is set to true.
- After elimination sync, all players on the losing team show `is_eliminated = true` in API responses.
- A fantasy team with 10 drafted players where 6 are eliminated and 4 are active shows `active_players: 4, eliminated_players: 6`.
- `GET /api/leagues/:id/scoreboard` returns today's games with live scores for drafted players.
- Standings update correctly after a scoring job runs.
- A player who plays all 6 tournament games has 6 entries in Player_Game_Stats and their total is the sum of all 6.

---

### 4.6 Dashboard & Game Day Views

#### Acceptance Criteria
- AC-6.1: After login, users see a dashboard listing their leagues with current standings summary.
- AC-6.2: A league detail page shows: standings, user's team, recent game results.
- AC-6.3: A "Game Day" view shows today's tournament games with live scores for relevant drafted players.
- AC-6.4: A "My Team" view shows the user's full roster with cumulative and per-game stats. Active players are shown prominently; eliminated players are visually dimmed with an "Eliminated" badge.
- AC-6.5: A "Draft Board" view shows the complete draft history for the league.
- AC-6.6: A "Tournament Bracket" or "Teams Alive" view shows which of the 68 tournament teams are still active vs. eliminated, so users can quickly see how their drafted players' teams are doing.
- AC-6.7: The league detail page shows a summary stat: "You have X of Y players still alive in the tournament."

#### Tests
- Dashboard renders league cards with standings for each league the user belongs to.
- League detail page displays standings table sorted by total points.
- Game Day view shows only games being played today.
- My Team view lists all drafted players with their cumulative tournament points.
- My Team view shows active players above eliminated players.
- My Team view shows an "Eliminated" badge on players whose teams have been knocked out.
- My Team view shows a summary: "X of Y players still alive."
- Draft Board view shows all picks in order with round and pick number.
- Draft Board view indicates which drafted players are still active vs. eliminated.

---

## 5. Data Model

### Users
| Column       | Type         | Notes |
|-------------|-------------|-------|
| id          | UUID (PK)    |       |
| username    | VARCHAR(50)  | Unique |
| email       | VARCHAR(255) | Unique |
| password_hash | VARCHAR(255) |     |
| created_at  | TIMESTAMP    |       |

### Leagues
| Column       | Type         | Notes |
|-------------|-------------|-------|
| id          | UUID (PK)    |       |
| name        | VARCHAR(100) |       |
| invite_code | VARCHAR(10)  | Unique, auto-generated |
| team_count  | INTEGER      | 4-20  |
| roster_size | INTEGER      | Default 10 |
| draft_status | ENUM        | `pre_draft`, `in_progress`, `completed` |
| commissioner_id | UUID (FK) | References Users |
| created_at  | TIMESTAMP    |       |

### League_Members (join table)
| Column       | Type         | Notes |
|-------------|-------------|-------|
| id          | UUID (PK)    |       |
| league_id   | UUID (FK)    | References Leagues |
| user_id     | UUID (FK)    | References Users |
| team_name   | VARCHAR(100) | User's fantasy team name |
| draft_position | INTEGER   | Set when draft starts |
| joined_at   | TIMESTAMP    |       |

### Tournament_Teams
| Column       | Type         | Notes |
|-------------|-------------|-------|
| id          | UUID (PK)    |       |
| name        | VARCHAR(100) |       |
| seed        | INTEGER      | 1-16  |
| region      | VARCHAR(50)  | East, West, South, Midwest |
| is_eliminated | BOOLEAN    | Default false |
| eliminated_in_round | VARCHAR(20) | Null if active; e.g., "Round of 64", "Sweet 16" |
| wins        | INTEGER      | Default 0. Number of tournament wins (0-6) |
| external_id | VARCHAR(50)  | ID from external API |

### Players
| Column       | Type         | Notes |
|-------------|-------------|-------|
| id          | UUID (PK)    |       |
| name        | VARCHAR(100) |       |
| team_id     | UUID (FK)    | References Tournament_Teams |
| position    | VARCHAR(10)  | G, F, C, etc. |
| jersey_number | INTEGER    |       |
| is_eliminated | BOOLEAN    | Default false. Derived from team's elimination status |
| external_id | VARCHAR(50)  | ID from external API |

### Draft_Picks
| Column       | Type         | Notes |
|-------------|-------------|-------|
| id          | UUID (PK)    |       |
| league_id   | UUID (FK)    | References Leagues |
| member_id   | UUID (FK)    | References League_Members |
| player_id   | UUID (FK)    | References Players |
| pick_number | INTEGER      | Overall pick number (1, 2, 3...) |
| round       | INTEGER      |       |
| picked_at   | TIMESTAMP    |       |

### Player_Game_Stats
| Column       | Type         | Notes |
|-------------|-------------|-------|
| id          | UUID (PK)    |       |
| player_id   | UUID (FK)    | References Players |
| game_date   | DATE         |       |
| opponent_team_id | UUID (FK) | References Tournament_Teams |
| points      | INTEGER      |       |
| tournament_round | VARCHAR(20) | Round of 64, 32, Sweet 16, etc. |
| external_game_id | VARCHAR(50) | ID from external API |

---

## 6. API Endpoints Summary

### Auth
| Method | Endpoint              | Description |
|--------|----------------------|-------------|
| POST   | /api/auth/register    | Register a new user |
| POST   | /api/auth/login       | Log in, receive JWT |

### Leagues
| Method | Endpoint                        | Description |
|--------|---------------------------------|-------------|
| POST   | /api/leagues                    | Create a league |
| GET    | /api/leagues                    | List user's leagues |
| GET    | /api/leagues/:id                | Get league details |
| PUT    | /api/leagues/:id                | Update league settings (commissioner) |
| POST   | /api/leagues/join               | Join a league via invite code |

### Draft
| Method | Endpoint                          | Description |
|--------|----------------------------------|-------------|
| POST   | /api/leagues/:id/draft/start      | Start the draft (commissioner) |
| GET    | /api/leagues/:id/draft            | Get draft state |
| POST   | /api/leagues/:id/draft/pick       | Make a draft pick |

### Players
| Method | Endpoint                | Description |
|--------|------------------------|-------------|
| GET    | /api/players            | List/search players |
| GET    | /api/tournaments/teams  | List tournament teams |

### Scoring & Standings
| Method | Endpoint                            | Description |
|--------|-------------------------------------|-------------|
| GET    | /api/leagues/:id/standings          | Get league standings |
| GET    | /api/leagues/:id/teams/:teamId      | Get team roster + scoring |
| GET    | /api/leagues/:id/scoreboard         | Get today's live scores |

---

## 7. External Data Integration

### Data Source
Use a free or affordable sports API that provides NCAA tournament player stats. Candidates:
- **ESPN hidden API** (unofficial, free, no key required)
- **SportsData.io** (has a free tier for NCAA basketball)
- **The Sports DB** (free, community-driven)

### Sync Strategy
- **Pre-tournament**: One-time sync of all 68 tournament teams and their rosters.
- **During tournament**: Scheduled job runs every 5 minutes during game windows to fetch live scoring data and update `Player_Game_Stats`.
- **Post-game**: Final stat sync after each game completes to ensure accuracy. When a game is final, the losing team is marked `is_eliminated = true` and all players on that team are flagged `is_eliminated = true`.
- **Elimination cascade**: When a team is eliminated, the sync job sets `Tournament_Teams.is_eliminated = true`, `Tournament_Teams.eliminated_in_round` to the round they lost in, and `Players.is_eliminated = true` for all players on that team. This is the trigger for the UI to gray out those players and stop expecting future stats.

---

## 8. Project Structure

```
MMFantasy/
├── client/                    # React frontend (Vite)
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # Route-level page components
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── LeagueDetail.jsx
│   │   │   ├── DraftRoom.jsx
│   │   │   ├── MyTeam.jsx
│   │   │   └── Scoreboard.jsx
│   │   ├── hooks/             # Custom React hooks
│   │   ├── context/           # Auth context, Socket context
│   │   ├── services/          # API client functions
│   │   └── App.jsx
│   └── tests/                 # Frontend tests (Vitest + RTL)
├── server/                    # Node.js backend (Express)
│   ├── src/
│   │   ├── routes/            # Express route handlers
│   │   ├── middleware/        # Auth middleware, error handling
│   │   ├── models/            # Database models / queries
│   │   ├── services/          # Business logic (draft, scoring, sync)
│   │   ├── jobs/              # Scheduled jobs (stat sync)
│   │   ├── socket/            # Socket.IO event handlers
│   │   └── app.js             # Express app setup
│   └── tests/                 # Backend tests (Jest)
├── database/
│   └── migrations/            # SQL migration files
├── package.json
└── SPEC.md                    # This file
```

---

## 9. Development Methodology: Test-Driven Development (TDD)

This project follows a strict **test-driven development** approach. For every feature:

1. **Red**: Write failing tests first that define the expected behavior (based on the acceptance criteria and test cases in this spec).
2. **Green**: Write the minimum code necessary to make the tests pass.
3. **Refactor**: Clean up the code while keeping all tests green.

### TDD Workflow Per Feature
1. Write backend unit/integration tests for the API endpoint or service (Jest).
2. Run the tests — confirm they fail.
3. Implement the route, service, and model code to make them pass.
4. Write frontend component tests (Vitest + React Testing Library).
5. Run the tests — confirm they fail.
6. Implement the React component/page to make them pass.
7. Run the full test suite to confirm no regressions.

### Test Categories
| Category | Tool | Scope |
|----------|------|-------|
| Backend unit tests | Jest | Services, utilities, draft logic, scoring calculations |
| Backend integration tests | Jest + Supertest | API endpoints, database queries, auth middleware |
| Frontend unit tests | Vitest + RTL | Component rendering, user interactions, conditional display |
| Frontend integration tests | Vitest + RTL | Page-level flows (login, draft picks, viewing standings) |
| WebSocket tests | Jest + socket.io-client | Draft events, real-time notifications |

### Test Conventions
- Test files live alongside source files or in a parallel `tests/` directory.
- Backend test files: `*.test.js` (e.g., `draft.service.test.js`).
- Frontend test files: `*.test.jsx` (e.g., `MyTeam.test.jsx`).
- Use factories/fixtures for test data (e.g., `createTestUser()`, `createTestLeague()`).
- Database tests use a test database that is reset between test suites.
- All API tests use Supertest against the Express app (no live server needed).

---

## 10. Hosting & Deployment

Hosting decisions do not need to be finalized before development begins. The app will be built in a deployment-agnostic way (environment variables for config, no hard-coded URLs). When ready to deploy, recommended options include:

| Component | Option A (Simple) | Option B (Scalable) |
|-----------|-------------------|---------------------|
| Frontend  | Vercel or Netlify (free tier) | AWS S3 + CloudFront |
| Backend   | Railway or Render (free/hobby tier) | AWS EC2 / ECS |
| Database  | Railway Postgres or Render Postgres | AWS RDS |
| WebSocket | Included in backend host | Separate service if needed |

For a 10-person friend group, **Option A is more than sufficient** and can be set up in minutes with zero cost. We'll revisit hosting when we're ready to deploy.

---

## 11. Non-Functional Requirements

- **Responsiveness**: The app should be usable on mobile and desktop.
- **Performance**: Standings and scoreboard pages should load in under 2 seconds.
- **Security**: Passwords hashed with bcrypt. JWT tokens expire after 24 hours. SQL injection prevented via parameterized queries.
- **Reliability**: The stat sync job should retry on failure and log errors without crashing.

---

## 12. Implementation Plan (Build Order)

This is the step-by-step build plan. Follow it **in order**. Each phase must be fully working with passing tests before moving to the next. Follow TDD: write tests FIRST, confirm they fail, then implement code to make them pass.

---

### Phase 0: Project Scaffolding

**Goal**: Set up the monorepo, install dependencies, configure tooling. No business logic yet.

**Steps**:
1. Initialize the root project with `package.json` (workspaces for `client` and `server`).
2. **Server setup**:
   - `cd server && npm init -y`
   - Install: `express`, `cors`, `dotenv`, `pg` (node-postgres), `bcryptjs`, `jsonwebtoken`, `uuid`, `socket.io`
   - Install dev: `jest`, `supertest`, `nodemon`
   - Create `server/src/app.js` — basic Express app with JSON parsing, CORS, and a health check route (`GET /api/health` returns `{ status: "ok" }`).
   - Create `server/src/server.js` — starts the app on `process.env.PORT || 3001`.
   - Create `server/jest.config.js`.
   - Create `server/.env.example` with `DATABASE_URL`, `JWT_SECRET`, `PORT`.
   - Add scripts to `package.json`: `"start"`, `"dev"` (nodemon), `"test"` (jest).
3. **Client setup**:
   - `npm create vite@latest client -- --template react`
   - Install: `react-router-dom`, `axios`, `socket.io-client`
   - Install dev: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`
   - Configure `vitest.config.js` with jsdom environment.
   - Add Tailwind CSS (install `tailwindcss`, `@tailwindcss/vite`).
   - Create placeholder `App.jsx` with React Router and a home route.
   - Add scripts: `"test"` (vitest).
4. **Database setup**:
   - Create `database/migrations/001_initial_schema.sql` containing all CREATE TABLE statements from the data model in Section 5.
   - Create `server/src/db.js` — a shared pg Pool using `DATABASE_URL` from env.
   - Create `database/seed.sql` — empty placeholder for seed data.
   - Document in a `database/README.md`: how to create the local DB, run migrations, and run seeds.
5. **Verify**: `GET /api/health` returns 200. Server test suite runs (even if 0 tests). Client test suite runs (even if 0 tests). Database tables can be created by running the migration SQL.

**Files created**:
```
server/package.json
server/src/app.js
server/src/server.js
server/src/db.js
server/jest.config.js
server/.env.example
client/  (Vite scaffolded)
client/vitest.config.js
database/migrations/001_initial_schema.sql
database/README.md
```

---

### Phase 1: User Authentication (Backend)

**Goal**: Register, login, JWT middleware. Fully tested before writing any frontend.

**Step 1 — Write tests** (`server/tests/auth.test.js`):
- Write all 7 auth tests listed in Section 4.1.
- Use Supertest against the Express app.
- Create a test helper `server/tests/setup.js` that:
  - Connects to a test database (`DATABASE_URL_TEST`).
  - Runs migrations before all tests.
  - Truncates tables between tests.
  - Closes the pool after all tests.

**Step 2 — Run tests, confirm they all fail.**

**Step 3 — Implement**:
- `server/src/models/user.model.js` — `createUser(username, email, passwordHash)`, `findByEmail(email)`, `findById(id)`.
- `server/src/services/auth.service.js` — `register(username, email, password)`, `login(email, password)`. Uses bcrypt for hashing and jwt for token generation.
- `server/src/routes/auth.routes.js` — `POST /api/auth/register`, `POST /api/auth/login`.
- `server/src/middleware/auth.middleware.js` — `authenticateToken(req, res, next)`. Reads `Authorization: Bearer <token>`, verifies JWT, attaches `req.user = { id, username, email }`.
- Register routes in `app.js`.

**Step 4 — Run tests, confirm they all pass.**

**Files created**:
```
server/tests/setup.js
server/tests/auth.test.js
server/src/models/user.model.js
server/src/services/auth.service.js
server/src/routes/auth.routes.js
server/src/middleware/auth.middleware.js
```

---

### Phase 2: User Authentication (Frontend)

**Goal**: Login and Register pages with auth context. Fully tested.

**Step 1 — Write tests**:
- `client/src/pages/Register.test.jsx` — renders form fields, submits registration, shows validation errors, redirects on success.
- `client/src/pages/Login.test.jsx` — renders form fields, submits login, shows error on bad credentials, stores token and redirects on success.
- `client/src/context/AuthContext.test.jsx` — provides user state, `login()` stores token, `logout()` clears token.

**Step 2 — Run tests, confirm they fail.**

**Step 3 — Implement**:
- `client/src/services/api.js` — Axios instance with base URL and auth interceptor that attaches JWT from localStorage.
- `client/src/context/AuthContext.jsx` — React context providing `user`, `token`, `login(email, password)`, `register(username, email, password)`, `logout()`.
- `client/src/pages/Register.jsx` — Registration form. On success, redirect to dashboard.
- `client/src/pages/Login.jsx` — Login form. On success, store JWT, redirect to dashboard.
- `client/src/components/ProtectedRoute.jsx` — Redirects to `/login` if no token.
- Update `App.jsx` with routes: `/login`, `/register`, `/dashboard` (protected, placeholder for now).

**Step 4 — Run tests, confirm they pass.**

**Files created**:
```
client/src/services/api.js
client/src/context/AuthContext.jsx
client/src/pages/Login.jsx
client/src/pages/Login.test.jsx
client/src/pages/Register.jsx
client/src/pages/Register.test.jsx
client/src/context/AuthContext.test.jsx
client/src/components/ProtectedRoute.jsx
```

---

### Phase 3: League Management (Backend)

**Goal**: Create, join, view, and update leagues. Fully tested.

**Step 1 — Write tests** (`server/tests/league.test.js`):
- Write all 10 league tests from Section 4.2.
- Create test factory: `createTestUser()` that registers a user and returns `{ user, token }`.

**Step 2 — Run tests, confirm they fail.**

**Step 3 — Implement**:
- `server/src/models/league.model.js` — `create(name, teamCount, rosterSize, commissionerId)`, `findById(id)`, `findByUserId(userId)`, `update(id, fields)`, `addMember(leagueId, userId, teamName)`, `findMembersByLeague(leagueId)`, `isMember(leagueId, userId)`, `getMemberCount(leagueId)`.
- `server/src/services/league.service.js` — Business logic for creating (generates invite code), joining (validates capacity, duplicates), updating (commissioner-only, pre-draft-only).
- `server/src/routes/league.routes.js` — All 5 league endpoints from Section 6. All routes use `authenticateToken` middleware.
- Utility: `server/src/utils/inviteCode.js` — generates random 8-char alphanumeric codes.
- Register routes in `app.js`.

**Step 4 — Run tests, confirm they pass.**

**Files created**:
```
server/tests/league.test.js
server/src/models/league.model.js
server/src/services/league.service.js
server/src/routes/league.routes.js
server/src/utils/inviteCode.js
```

---

### Phase 4: League Management (Frontend)

**Goal**: Create league, join league, view leagues on dashboard. Fully tested.

**Step 1 — Write tests**:
- `client/src/pages/Dashboard.test.jsx` — renders list of user's leagues, each showing name, member count, draft status. Shows "Create League" and "Join League" buttons.
- `client/src/pages/CreateLeague.test.jsx` — form with name, team count (4-20), roster size. On submit, creates league and redirects to league detail. Shows validation for out-of-range team count.
- `client/src/pages/JoinLeague.test.jsx` — form with invite code input. Shows error for invalid code, full league, already a member.
- `client/src/pages/LeagueDetail.test.jsx` — shows league name, invite code (for commissioner), member list, draft status.

**Step 2 — Run tests, confirm they fail.**

**Step 3 — Implement**:
- `client/src/pages/Dashboard.jsx`
- `client/src/pages/CreateLeague.jsx`
- `client/src/pages/JoinLeague.jsx`
- `client/src/pages/LeagueDetail.jsx` (basic version — will be extended in later phases)
- `client/src/services/leagueService.js` — API calls for league CRUD.
- Update `App.jsx` routes: `/dashboard`, `/leagues/create`, `/leagues/join`, `/leagues/:id`.

**Step 4 — Run tests, confirm they pass.**

**Files created**:
```
client/src/pages/Dashboard.jsx
client/src/pages/Dashboard.test.jsx
client/src/pages/CreateLeague.jsx
client/src/pages/CreateLeague.test.jsx
client/src/pages/JoinLeague.jsx
client/src/pages/JoinLeague.test.jsx
client/src/pages/LeagueDetail.jsx
client/src/pages/LeagueDetail.test.jsx
client/src/services/leagueService.js
```

---

### Phase 5: Player Database & Tournament Teams (Backend)

**Goal**: Store and serve tournament teams and players. Fully tested.

**Step 1 — Write tests** (`server/tests/player.test.js`, `server/tests/tournament.test.js`):
- Write all tests from Section 4.4 (player search, team listing, elimination flags, games_played, max_remaining_games).
- Seed test data: create a few tournament teams and players in the test setup.

**Step 2 — Run tests, confirm they fail.**

**Step 3 — Implement**:
- `server/src/models/tournamentTeam.model.js` — `findAll()`, `findById(id)`, `eliminate(id, round)`, `updateWins(id, wins)`.
- `server/src/models/player.model.js` — `findAll(filters)` (supports pagination, search by name, filter by team), `findById(id)`, `findByTeamId(teamId)`, `eliminateByTeam(teamId)`.
- `server/src/services/player.service.js` — Business logic for computing `games_played` (count of Player_Game_Stats rows) and `max_remaining_games` (based on team's current tournament progress: 6 minus games played by the team so far, or 0 if eliminated).
- `server/src/routes/player.routes.js` — `GET /api/players`, `GET /api/tournaments/teams`.
- Register routes in `app.js`.

**Step 4 — Run tests, confirm they pass.**

**Step 5 — Create seed data**:
- `database/seed_tournament.js` — A script (or SQL file) that populates Tournament_Teams and Players with real or sample data for the 68 teams. This can initially use placeholder data and be replaced with real data closer to the tournament.

**Files created**:
```
server/tests/player.test.js
server/tests/tournament.test.js
server/src/models/tournamentTeam.model.js
server/src/models/player.model.js
server/src/services/player.service.js
server/src/routes/player.routes.js
database/seed_tournament.js
```

---

### Phase 6: Snake Draft (Backend)

**Goal**: Full snake draft logic — start, pick, state, completion. This is the most complex backend feature. Fully tested.

**Step 1 — Write tests**:
- `server/tests/draft.service.test.js` — **Unit tests** for the draft service in isolation:
  - `generateSnakeOrder(teamCount, rosterSize)` returns the correct pick sequence. For 4 teams, roster size 3: `[1,2,3,4, 4,3,2,1, 1,2,3,4]`.
  - `getCurrentPick(draftPicks, snakeOrder)` returns the correct next pick position.
  - `isDraftComplete(draftPicks, teamCount, rosterSize)` returns true when all picks are made.
- `server/tests/draft.test.js` — **Integration tests** (API level) for all 12 draft tests from Section 4.3.
  - Setup: create a league with 4 users, fill it, start the draft.
  - Test each endpoint and edge case.

**Step 2 — Run tests, confirm they fail.**

**Step 3 — Implement**:
- `server/src/services/draft.service.js`:
  - `startDraft(leagueId, userId)` — Validates user is commissioner, league is full, draft hasn't started. Generates random draft order, sets `draft_status = 'in_progress'`, assigns `draft_position` to each league member.
  - `makePick(leagueId, userId, playerId)` — Validates it's the user's turn, player is not already drafted, draft is in progress. Creates Draft_Pick record. Checks if draft is complete, if so sets `draft_status = 'completed'`.
  - `getDraftState(leagueId)` — Returns all picks, current turn, available players count.
  - `generateSnakeOrder(teamCount, rosterSize)` — Pure function that returns an array of draft positions in snake order.
- `server/src/models/draftPick.model.js` — `create(leagueId, memberId, playerId, pickNumber, round)`, `findByLeague(leagueId)`, `isPlayerDrafted(leagueId, playerId)`.
- `server/src/routes/draft.routes.js` — `POST /start`, `POST /pick`, `GET /`.
- Register routes in `app.js`.

**Step 4 — Run tests, confirm they pass.**

**Step 5 — Add WebSocket events**:
- `server/src/socket/draftSocket.js`:
  - On connection, join a room named `league:<leagueId>`.
  - After a pick is made, emit `draft:pick` with the pick details to the league room.
  - After a pick is made, emit `draft:turn` with the next drafter's user ID.
  - Emit `draft:complete` when all picks are made.
- Write WebSocket tests: `server/tests/draft.socket.test.js` — Use `socket.io-client` to verify events are received.

**Files created**:
```
server/tests/draft.service.test.js
server/tests/draft.test.js
server/tests/draft.socket.test.js
server/src/services/draft.service.js
server/src/models/draftPick.model.js
server/src/routes/draft.routes.js
server/src/socket/draftSocket.js
```

---

### Phase 7: Snake Draft (Frontend)

**Goal**: Draft room UI where users pick players, see the draft board update, and get turn notifications.

**Step 1 — Write tests**:
- `client/src/pages/DraftRoom.test.jsx`:
  - Before draft starts (commissioner): shows "Start Draft" button. Non-commissioners see "Waiting for commissioner to start."
  - During draft (user's turn): shows available player list with search/filter, "Pick" button is enabled.
  - During draft (not user's turn): shows "Waiting for [username] to pick..." and "Pick" button is disabled.
  - After a pick: draft board updates with the new pick, available player list shrinks.
  - Draft complete: shows "Draft Complete!" message and link to "My Team."
- `client/src/components/DraftBoard.test.jsx`:
  - Renders a table/grid of all picks organized by round and team.
  - Shows player name, team, and position for each pick.
- `client/src/components/PlayerList.test.jsx`:
  - Renders available players.
  - Search input filters the list by name.
  - Filter dropdown filters by team.
  - Already-drafted players are not shown.

**Step 2 — Run tests, confirm they fail.**

**Step 3 — Implement**:
- `client/src/context/SocketContext.jsx` — Provides Socket.IO connection, handles `draft:pick`, `draft:turn`, `draft:complete` events.
- `client/src/pages/DraftRoom.jsx` — Main draft page. Fetches draft state on load, listens for socket events.
- `client/src/components/DraftBoard.jsx` — Grid/table showing all picks.
- `client/src/components/PlayerList.jsx` — Searchable, filterable list of available players.
- `client/src/services/draftService.js` — API calls for draft start, pick, and state.
- Update `App.jsx` route: `/leagues/:id/draft`.

**Step 4 — Run tests, confirm they pass.**

**Files created**:
```
client/src/context/SocketContext.jsx
client/src/pages/DraftRoom.jsx
client/src/pages/DraftRoom.test.jsx
client/src/components/DraftBoard.jsx
client/src/components/DraftBoard.test.jsx
client/src/components/PlayerList.jsx
client/src/components/PlayerList.test.jsx
client/src/services/draftService.js
```

---

### Phase 8: Live Scoring & Elimination (Backend)

**Goal**: Stat sync job, scoring calculations, elimination cascade, standings API. Fully tested.

**Step 1 — Write tests**:
- `server/tests/scoring.service.test.js` — Unit tests:
  - `calculateTeamScore(memberId)` sums all points from all Player_Game_Stats for that member's drafted players.
  - Player with stats across 4 games returns sum of all 4.
  - Player with 0 points in a game still counts (doesn't error).
  - `getActivePlayerCount(memberId)` returns count of drafted players whose team is not eliminated.
  - `getEliminatedPlayerCount(memberId)` returns count of drafted players whose team is eliminated.
- `server/tests/elimination.test.js` — Integration tests:
  - When `eliminateTeam(teamId, round)` is called, the team's `is_eliminated` is true and `eliminated_in_round` is set.
  - All players on that team have `is_eliminated = true`.
  - `max_remaining_games` for those players returns 0.
  - Fantasy standings correctly reflect the elimination (player stops contributing new points).
- `server/tests/standings.test.js` — Integration tests:
  - `GET /api/leagues/:id/standings` returns teams sorted by total points descending.
  - Response includes `active_players` and `eliminated_players` per team.
  - Response includes `players_remaining` per team.
  - `GET /api/leagues/:id/teams/:teamId` returns player list with per-round breakdown and active/eliminated status.

**Step 2 — Run tests, confirm they fail.**

**Step 3 — Implement**:
- `server/src/services/scoring.service.js`:
  - `calculateTeamScore(memberId)` — Queries sum of points from Player_Game_Stats joined with Draft_Picks.
  - `getStandings(leagueId)` — Returns all teams with total score, active/eliminated player counts, players remaining.
  - `getTeamRoster(leagueId, memberId)` — Returns player list with per-round point breakdown and elimination status.
  - `getActivePlayerCount(memberId)` / `getEliminatedPlayerCount(memberId)`.
- `server/src/services/elimination.service.js`:
  - `eliminateTeam(teamId, round)` — Sets `Tournament_Teams.is_eliminated = true`, `eliminated_in_round = round`. Updates `Players.is_eliminated = true` for all players on the team.
  - `getMaxRemainingGames(teamId)` — Calculates based on team's win count (6 - wins, or 0 if eliminated).
- `server/src/models/playerGameStats.model.js` — `create(...)`, `findByPlayer(playerId)`, `findByGame(gameId)`, `getPointsByPlayerGroupedByRound(playerId)`.
- `server/src/routes/standings.routes.js` — `GET /standings`, `GET /teams/:teamId`, `GET /scoreboard`.
- Register routes in `app.js`.

**Step 4 — Run tests, confirm they pass.**

**Files created**:
```
server/tests/scoring.service.test.js
server/tests/elimination.test.js
server/tests/standings.test.js
server/src/services/scoring.service.js
server/src/services/elimination.service.js
server/src/models/playerGameStats.model.js
server/src/routes/standings.routes.js
```

---

### Phase 9: External Data Sync Job (Backend)

**Goal**: Scheduled job that fetches live data from the sports API, updates player stats, and triggers eliminations.

**Step 1 — Write tests** (`server/tests/sync.test.js`):
- Mock the external API responses.
- Sync job creates Player_Game_Stats records for completed games.
- Sync job does not duplicate stats for games already synced (idempotent via `external_game_id`).
- Sync job marks losing teams as eliminated after a game is final.
- Sync job updates team `wins` count for winning teams.
- Sync job handles API errors gracefully (logs error, does not crash).
- Sync job skips games that are still in progress (or creates partial entries and updates them).

**Step 2 — Run tests, confirm they fail.**

**Step 3 — Implement**:
- `server/src/services/externalApi.service.js` — Abstraction layer for the sports API. Methods: `fetchTodaysGames()`, `fetchGameBoxScore(gameId)`, `fetchTournamentTeams()`, `fetchTeamRoster(teamId)`. Initially implement with one provider (ESPN or SportsData.io). Use axios.
- `server/src/jobs/statSync.job.js`:
  - Fetches today's completed games from the API.
  - For each completed game, fetches the box score.
  - Creates/updates Player_Game_Stats for each player in the game.
  - If game is final, calls `eliminateTeam()` for the losing team and updates `wins` for the winning team.
  - Uses `external_game_id` to avoid duplicates.
- `server/src/jobs/scheduler.js` — Uses `node-cron` or `setInterval` to run `statSync` every 5 minutes. Only runs during configured game windows (configurable via env var, e.g., `SYNC_ENABLED=true`).
- Install: `node-cron` (or use setInterval).

**Step 4 — Run tests, confirm they pass.**

**Files created**:
```
server/tests/sync.test.js
server/src/services/externalApi.service.js
server/src/jobs/statSync.job.js
server/src/jobs/scheduler.js
```

---

### Phase 10: Standings, My Team, & Scoreboard (Frontend)

**Goal**: The core post-draft experience — seeing how your team is doing, who's eliminated, and live game scores.

**Step 1 — Write tests**:
- `client/src/pages/Standings.test.jsx`:
  - Renders a table of teams sorted by total points.
  - Each row shows: rank, team name, total points, active players, eliminated players, players remaining.
  - Eliminated player count is visually distinct (e.g., red text or badge).
- `client/src/pages/MyTeam.test.jsx`:
  - Lists all drafted players.
  - Active players are shown above eliminated players.
  - Eliminated players have an "Eliminated" badge and are visually dimmed.
  - Each player row shows: name, college team, total points, points per round (R64, R32, S16, E8, F4, Champ).
  - Summary line: "X of Y players still alive in the tournament."
- `client/src/pages/Scoreboard.test.jsx`:
  - Shows today's games.
  - Each game shows teams, score, and status (live / final / upcoming).
  - Highlights drafted players and their points in each game.
- `client/src/pages/LeagueDetail.test.jsx` (extend from Phase 4):
  - Shows standings summary.
  - Shows "You have X of Y players still alive" message.
  - Has navigation tabs/links to: Standings, My Team, Draft Board, Scoreboard.

**Step 2 — Run tests, confirm they fail.**

**Step 3 — Implement**:
- `client/src/pages/Standings.jsx`
- `client/src/pages/MyTeam.jsx`
- `client/src/pages/Scoreboard.jsx`
- `client/src/components/PlayerRow.jsx` — Reusable row component showing player name, team, points, elimination badge.
- `client/src/components/StandingsTable.jsx` — Reusable standings table.
- `client/src/services/standingsService.js` — API calls for standings, team roster, scoreboard.
- Extend `client/src/pages/LeagueDetail.jsx` — Add tabs and summary stats.
- Update `App.jsx` routes: `/leagues/:id/standings`, `/leagues/:id/my-team`, `/leagues/:id/scoreboard`.

**Step 4 — Run tests, confirm they pass.**

**Files created**:
```
client/src/pages/Standings.jsx
client/src/pages/Standings.test.jsx
client/src/pages/MyTeam.jsx
client/src/pages/MyTeam.test.jsx
client/src/pages/Scoreboard.jsx
client/src/pages/Scoreboard.test.jsx
client/src/components/PlayerRow.jsx
client/src/components/StandingsTable.jsx
client/src/services/standingsService.js
```

---

### Phase 11: Polish & Integration Testing

**Goal**: End-to-end flows, responsive design, error handling, and final cleanup.

**Steps**:
1. **Error handling**:
   - `server/src/middleware/errorHandler.js` — Global Express error handler that returns consistent JSON error responses.
   - Add client-side error boundaries and toast notifications for API errors.

2. **Responsive design pass**:
   - Test all pages on mobile viewport (375px wide).
   - Ensure draft board scrolls horizontally on small screens.
   - Ensure standings table is readable on mobile.

3. **Navigation**:
   - `client/src/components/Navbar.jsx` — App header with logo, user name, league switcher, logout button.
   - `client/src/components/LeagueSidebar.jsx` — In-league navigation (Standings, My Team, Draft, Scoreboard).

4. **Loading & empty states**:
   - Add loading spinners for all data-fetching pages.
   - Add empty states: "No leagues yet — create or join one!", "Draft hasn't started yet", "No games today".

5. **Full integration test**:
   - Write a test that walks through the entire lifecycle:
     1. Register 4 users.
     2. User 1 creates a league (4 teams, roster size 2).
     3. Users 2-4 join.
     4. User 1 starts draft.
     5. All 4 users make their picks in snake order (8 total picks).
     6. Draft completes.
     7. Simulate game stats for some players.
     8. Simulate one team getting eliminated.
     9. Verify standings reflect correct scores, active/eliminated counts.

6. **Run the full test suite** (backend + frontend) — everything passes.

**Files created**:
```
server/src/middleware/errorHandler.js
server/tests/integration/fullLifecycle.test.js
client/src/components/Navbar.jsx
client/src/components/LeagueSidebar.jsx
```

---

### Phase Summary & Checklist

| Phase | Feature | Backend Tests | Frontend Tests | Status |
|-------|---------|--------------|----------------|--------|
| 0 | Project Scaffolding | — | — | ☐ |
| 1 | Auth (Backend) | 7 tests | — | ☐ |
| 2 | Auth (Frontend) | — | ~10 tests | ☐ |
| 3 | Leagues (Backend) | 10 tests | — | ☐ |
| 4 | Leagues (Frontend) | — | ~12 tests | ☐ |
| 5 | Players & Teams (Backend) | ~10 tests | — | ☐ |
| 6 | Snake Draft (Backend) | ~15 tests | — | ☐ |
| 7 | Snake Draft (Frontend) | — | ~12 tests | ☐ |
| 8 | Scoring & Elimination (Backend) | ~15 tests | — | ☐ |
| 9 | External Data Sync (Backend) | ~7 tests | — | ☐ |
| 10 | Standings/MyTeam/Scoreboard (Frontend) | — | ~15 tests | ☐ |
| 11 | Polish & Integration | ~1 big test | ~5 tests | ☐ |

**Total estimated: ~65 backend tests, ~55 frontend tests, ~120 total.**

When handing off to Sonnet, say: **"Read SPEC.md and start building at Phase 0. Follow the implementation plan in Section 12 step by step. Use TDD — write tests first, confirm they fail, then implement. Complete each phase fully before moving to the next. Ask me before making architectural decisions not covered in the spec."**

---

## 13. Future Enhancements (Out of Scope for v1)

- Trade players between teams
- Chat / trash talk within a league
- Draft timer with auto-pick
- Historical league data across years
- Push notifications (mobile/email) for draft turns and game results
- Bonus scoring categories (rebounds, assists, upsets, etc.)
- Multiple scoring format options
- Public leagues (anyone can join without invite)
