# March Madness Fantasy App — SPEC V2: Polish & Enhancement

## 1. Overview

This document picks up where SPEC.md left off. All 11 core phases are implemented and passing tests. The app has working auth, league management, snake draft with CPU bots, live scoring/elimination, and an ESPN data sync pipeline.

This spec covers the remaining work needed to make the app **production-ready and enjoyable to use**: fixing incomplete features, improving UX, hardening the backend, and preparing for deployment.

---

## 2. Current State Summary

| Area | Status | Notes |
|------|--------|-------|
| Auth (register, login, JWT) | Complete | Working end-to-end |
| League CRUD + invite codes | Complete | |
| CPU Bot fill | Complete | Commissioner can fill empty slots with bots |
| Snake draft (backend + frontend) | Complete | Real-time via Socket.IO, bot auto-pick works |
| Player database + search | Complete | Search by name, filter by team, pagination |
| Scoring + standings | Complete | Per-round breakdowns, active/eliminated counts |
| Elimination cascade | Complete | Losing team + all players auto-eliminated |
| ESPN data sync job | Complete | 5-min interval, idempotent, graceful errors |
| Scoreboard endpoint | **Stub** | Returns `[]` — needs real implementation |
| Tournament seed data | **Missing** | No script to import real 68-team bracket |
| Responsive design | **Untested** | Tailwind used but no mobile verification pass |
| Error UX | **Minimal** | No toast notifications, no error boundaries |
| League settings UX | **Basic** | No delete league, no kick member, no leave league |

---

## 3. Implementation Phases

### Phase 12: Scoreboard Backend + Frontend Integration

**Goal**: The scoreboard page shows today's real tournament games with live scores and highlights drafted players.

#### 12.1 Scoreboard API Endpoint
**File**: `server/src/routes/standings.routes.js`

Replace the placeholder `GET /api/leagues/:id/scoreboard` with a real implementation.

**Acceptance Criteria**:
- AC-12.1: Endpoint returns today's tournament games with team names, scores, game status (upcoming/in_progress/final), and tournament round.
- AC-12.2: Each game includes a list of players from that game who are drafted in this league, with their points.
- AC-12.3: If no games are scheduled today, returns an empty array (frontend already handles this).
- AC-12.4: If the ESPN API is unreachable, returns a 503 with a user-friendly error message.

**Implementation**:
- Create `server/src/services/scoreboard.service.js`:
  - `getScoreboard(leagueId)` — Calls `externalApi.fetchTodaysGames()`, then for each game, cross-references players with the league's draft picks to identify "my players" in each game.
  - For final/in-progress games, includes player point totals from `player_game_stats`.
  - For upcoming games, includes drafted players on each team with their season totals so far.
- Wire into `standings.routes.js` replacing the `[]` stub.

**Tests** (`server/tests/scoreboard.test.js`):
- Returns today's games with correct structure.
- Highlights drafted players within each game.
- Returns `[]` when no games today.
- Returns 503 when external API fails.

---

### Phase 13: Tournament Data Import & Simulation

**Goal**: Import real 2025 NCAA tournament teams and rosters from ESPN so there's real data to draft. Then provide a tournament simulator that generates fake game results round-by-round so the full app flow (draft → scoring → elimination → standings) can be tested end-to-end without waiting for a live tournament.

#### 13.1 Import Script (2025 Tournament Data)
**File**: `database/seed_tournament.js` (rewrite existing placeholder)

**Strategy**: The 2026 bracket hasn't been announced yet, so import the **2025 tournament** data from ESPN. This gives us 64 real teams with real rosters. When the 2026 bracket drops, re-run the import against the new data.

**How to get all 64 teams with seeds & regions**: Query the ESPN scoreboard for the Round of 64 dates (March 20-21, 2025). Each game's competitor data includes team ID, seed, and region. Extract all unique teams from those games.

**Acceptance Criteria**:
- AC-13.1: Script fetches all 64 tournament teams from ESPN 2025 scoreboard data and inserts into `tournament_teams` with name, seed, region, and external_id.
- AC-13.2: For each team, script fetches the full roster and inserts players into `players`.
- AC-13.3: Script is idempotent — running it twice does not create duplicates (uses `external_id` upsert).
- AC-13.4: Script logs progress (e.g., "Imported Duke (South #4): 15 players") and a final summary.
- AC-13.5: Script can be run via `npm run seed` from the server workspace.
- AC-13.6: Script accepts a `--year` flag (default 2025) so it can be repointed to 2026 when the bracket is announced.

**Implementation**:
- Fetch ESPN scoreboard for tournament dates to extract teams with seeds/regions.
- For each team, call the ESPN roster endpoint.
- Use existing model upsert methods for idempotent inserts.
- Add `"seed": "node ../database/seed_tournament.js"` to `server/package.json` scripts.

#### 13.2 Tournament Simulator
**File**: `database/simulate_tournament.js` (new)

**Purpose**: After importing teams and completing a draft, run this script to simulate tournament game results. It generates fake box scores with random player stats, eliminates losers, and updates standings — letting you test the entire post-draft experience.

**Acceptance Criteria**:
- AC-13.7: Simulator creates proper bracket matchups based on seeds and regions (1v16, 2v15, ... 8v9 per region).
- AC-13.8: For each game, generates random points (5-25) for each player on both teams. The team with the higher total wins.
- AC-13.9: Losing team is eliminated (is_eliminated = true, eliminated_in_round set). Winning team's wins incremented.
- AC-13.10: Player stats are inserted into `player_game_stats` with proper game_date and tournament_round.
- AC-13.11: Can simulate one round at a time: `npm run simulate -- --round 1` (Round of 64), `--round 2` (Round of 32), etc.
- AC-13.12: Can simulate all remaining rounds at once: `npm run simulate -- --all`.
- AC-13.13: Idempotent — skips games that have already been simulated (checks external_game_id).
- AC-13.14: After simulation, the standings page and scoreboard update to reflect new scores and eliminations.

**Implementation**:
- Read all non-eliminated teams from the database, grouped by region.
- Build bracket matchups for the current round based on seed ordering.
- For each matchup, generate random player stats, determine winner, insert stats, eliminate loser.
- Use `external_game_id` format like `sim-2025-round1-east-1v16` for idempotency.
- Add `"simulate": "node ../database/simulate_tournament.js"` to `server/package.json` scripts.

**Round progression logic**:
| Round | Command | Matchups |
|-------|---------|----------|
| Round of 64 | `--round 1` | 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15 per region (32 games) |
| Round of 32 | `--round 2` | Winners of adjacent R64 games play each other (16 games) |
| Sweet 16 | `--round 3` | Winners of adjacent R32 games (8 games) |
| Elite 8 | `--round 4` | Winners of adjacent S16 games (4 games) |
| Final Four | `--round 5` | Region winners play each other (2 games) |
| Championship | `--round 6` | Final Four winners (1 game) |

**Tests**: Manual verification via standings page + database queries after each simulated round.

---

### Phase 14: UI/UX Polish

**Goal**: Make every page feel complete, handle edge cases gracefully, and look good on mobile.

#### 14.1 Toast Notifications
**File**: `client/src/components/Toast.jsx` (new)

- Lightweight toast component (success/error/info) that auto-dismisses after 4 seconds.
- Create `client/src/context/ToastContext.jsx` providing `showToast(message, type)`.
- Replace inline error states with toasts for transient errors (API failures, "not your turn", etc.).
- Keep inline errors for form validation (login, register, create league).

#### 14.2 Error Boundary
**File**: `client/src/components/ErrorBoundary.jsx` (new)

- Catches render errors and shows a "Something went wrong" fallback with a "Reload" button.
- Wrap the main `<App />` in the error boundary.

#### 14.3 Responsive Design Pass

Audit and fix all pages for mobile (375px viewport):

| Page | Issue | Fix |
|------|-------|-----|
| DraftBoard | Table overflows on small screens | Add horizontal scroll wrapper with `overflow-x-auto` |
| PlayerList | Search + filter + table cramped | Stack search/filter vertically on mobile |
| StandingsTable | Wide columns | Hide less-important columns on mobile, or use horizontal scroll |
| LeagueDetail | Sidebar + content side-by-side | Stack vertically on mobile (`flex-col` below `md:`) |
| Navbar | League switcher may overflow | Collapse to hamburger menu on mobile |
| DraftRoom | Draft board + player list side-by-side layout | Stack vertically on mobile |

#### 14.4 Loading Skeletons
- Replace bare "Loading..." text with animated skeleton placeholders on:
  - LeagueDetail (member list, standings)
  - DraftRoom (draft board, player list)
  - Standings page
  - MyTeam page

#### 14.5 Empty States
Verify and improve empty states:

| Page | Empty State | Message |
|------|-------------|---------|
| Dashboard | No leagues | "You're not in any leagues yet. Create one or join with an invite code!" |
| Standings | Pre-draft | "Standings will appear after the draft is complete." |
| MyTeam | Pre-draft | "Your team will appear here after you draft players." |
| Scoreboard | No games today | "No tournament games today. Check back on game days!" (already implemented) |
| DraftBoard | No picks yet | "No picks have been made yet. The draft will begin soon." |

**Tests**:
- Toast appears and auto-dismisses on API error.
- Error boundary renders fallback when child component throws.
- DraftBoard is scrollable on 375px viewport (snapshot or visual regression test).
- Empty state messages render when data arrays are empty.

---

### Phase 15: League Management Enhancements

**Goal**: Quality-of-life features for managing leagues before and after the draft.

#### 15.1 Leave League
**Acceptance Criteria**:
- AC-15.1: A non-commissioner member can leave a league if draft status is `pre_draft`.
- AC-15.2: Cannot leave after the draft has started (your team would be abandoned).
- AC-15.3: Commissioner cannot leave (must delete league instead).

**Backend**:
- `DELETE /api/leagues/:id/members/me` — removes the authenticated user from the league.
- Add `removeMember(leagueId, userId)` to `league.model.js`.

**Frontend**:
- "Leave League" button on LeagueDetail, visible to non-commissioner members during pre_draft.
- Confirmation dialog before leaving.

#### 15.2 Remove Member (Commissioner)
**Acceptance Criteria**:
- AC-15.4: Commissioner can remove a member (human or bot) during `pre_draft`.
- AC-15.5: Commissioner cannot remove themselves.
- AC-15.6: Cannot remove members after draft has started.

**Backend**:
- `DELETE /api/leagues/:id/members/:userId` — commissioner-only, pre-draft only.

**Frontend**:
- "X" button next to each member in the member list (commissioner only, pre-draft only).

#### 15.3 Update League Settings UX
**Acceptance Criteria**:
- AC-15.7: Commissioner can edit league name, team count, and roster size from LeagueDetail during `pre_draft`.
- AC-15.8: If team count is reduced below current member count, show a validation error.

**Frontend**:
- "Edit" icon/button next to league name that opens an inline edit form or modal.
- Currently the PUT endpoint exists but there's no UI for it.

**Tests**:
- Leave league removes user from member list and redirects to dashboard.
- Commissioner cannot see "Leave" button; members cannot see "Remove" button for others.
- Remove member updates member list immediately.
- Edit league settings persists changes on refresh.

---

### Phase 16: Draft UX Improvements

**Goal**: Make the draft experience smoother and more informative.

#### 16.1 Draft Countdown / Auto-Pick Timer
**Acceptance Criteria**:
- AC-16.1: Each pick has a configurable time limit (default: 90 seconds).
- AC-16.2: A countdown timer is visible to all league members during a human's turn.
- AC-16.3: If time expires, the server auto-picks a random player for that user (same logic as bot auto-pick).
- AC-16.4: Timer resets after each pick.
- AC-16.5: Timer is optional — commissioner can disable it when creating the league.

**Backend**:
- Add `draft_timer_seconds INTEGER DEFAULT 90` to leagues table (migration `003_add_draft_timer.sql`).
- Add timer tracking in draft service — on `startDraft` and after each pick, schedule a timeout. If timeout fires before next pick, call `makePick` with a random player.
- Use `setTimeout` with cleanup (clear on pick or draft complete).

**Frontend**:
- Display countdown bar/number in DraftRoom during active turn.
- Socket event `draft:timer` emitted with seconds remaining on each pick start.

#### 16.2 Draft Pick Confirmation
**Acceptance Criteria**:
- AC-16.6: When a user clicks "Pick" on a player, show a confirmation dialog: "Draft [Player Name] ([Team])?" with Confirm/Cancel.
- AC-16.7: Prevents accidental mis-picks.

**Frontend**:
- Modal/dialog component shown before `makePick` API call.

#### 16.3 Draft Chat
**Acceptance Criteria**:
- AC-16.8: League members can send text messages during the draft.
- AC-16.9: Messages appear in a chat panel within the DraftRoom.
- AC-16.10: Messages are broadcast via Socket.IO to all league members.

**Backend**:
- New table: `draft_messages (id, league_id, user_id, message, created_at)`.
- Socket event `draft:message` for real-time broadcast.
- `GET /api/leagues/:id/draft/messages` to load history on page load.

**Frontend**:
- Chat panel in DraftRoom (collapsible on mobile).
- Input field + send button at bottom.

**Tests**:
- Timer counts down and auto-picks on expiration.
- Pick confirmation dialog prevents accidental picks.
- Chat messages appear in real-time for all connected users.

---

### Phase 17: Visual Design & Branding

**Goal**: Give the app a cohesive visual identity instead of bare Tailwind utility styling.

#### 17.1 Color Scheme & Theme
- Primary: Deep blue (#1a365d) — college basketball feel
- Accent: Orange (#dd6b20) — tournament energy
- Success: Green (#38a169) — active players, positive scores
- Danger: Red (#e53e3e) — eliminated, errors
- Define in `tailwind.config.js` as custom theme colors.

#### 17.2 Component Styling Pass
- Consistent button styles (primary, secondary, danger, ghost).
- Card components for league cards, game cards, player cards.
- Consistent table styling with striped rows and hover states.
- Badge components (Commissioner, CPU, Eliminated, Live, Final).

#### 17.3 Landing Page
**File**: `client/src/pages/Home.jsx` (new)

- Public landing page (shown when not logged in) with:
  - App name and tagline ("Draft your squad. Dominate March Madness.")
  - Brief description of how it works (3 steps: Create League, Draft Players, Track Scores)
  - "Sign Up" and "Log In" buttons
- Route: `/` (redirects to `/dashboard` if already logged in)

#### 17.4 Favicon & App Title
- Add a basketball-themed favicon.
- Set page title to "MM Fantasy" in `index.html`.
- Dynamic page titles per route (e.g., "Draft Room — MM Fantasy").

**Tests**:
- Landing page renders for unauthenticated users.
- Landing page redirects to dashboard for authenticated users.
- All badge variants render with correct colors.

---

### Phase 18: Deployment Preparation

**Goal**: Get the app ready to run in production.

#### 18.1 Environment Configuration
- Audit all `process.env` usage; ensure every variable has a fallback or clear error.
- Create `server/.env.production.example` documenting all required env vars.
- Add `CORS_ORIGIN` env var to restrict CORS in production (currently `cors()` allows all origins).

#### 18.2 Production Build
- `client/`: Vite production build (`npm run build`) outputs to `client/dist/`.
- `server/`: Serve `client/dist/` as static files in production so the whole app runs on one port.
- Add `server/src/app.js` static file serving: `app.use(express.static('../client/dist'))` with SPA fallback for React Router.

#### 18.3 Database Migrations Runner
- Create `server/src/db/migrate.js` — reads and executes all SQL files in `database/migrations/` in order.
- Add `"migrate": "node src/db/migrate.js"` script.
- Run automatically on server start in production (with a `MIGRATE_ON_START=true` flag).

#### 18.4 Health Check & Monitoring
- Expand `GET /api/health` to check database connectivity.
- Add request logging middleware (morgan or custom) for production.
- Add `SYNC_ENABLED` guard so sync job doesn't run in development without explicitly enabling it (already implemented).

#### 18.5 Security Hardening
- Add rate limiting to auth endpoints (prevent brute-force login).
- Add `helmet` middleware for security headers.
- Validate and sanitize all user inputs (league names, usernames) — strip HTML/scripts.
- Ensure bot users cannot authenticate via login (check `is_bot` flag in login flow).

**Tests**:
- Health check returns database status.
- Rate limiter blocks after N failed login attempts.
- Bot user cannot log in via `/api/auth/login`.
- Static file serving works for SPA routes.

---

## 4. Data Model Changes

### New/Modified Tables

| Migration | Table | Change |
|-----------|-------|--------|
| `003_add_draft_timer.sql` | `leagues` | Add `draft_timer_seconds INTEGER DEFAULT 90` |
| `004_add_draft_messages.sql` | `draft_messages` (new) | `id UUID PK, league_id UUID FK, user_id UUID FK, message TEXT, created_at TIMESTAMP` |

---

## 5. New API Endpoints

| Method | Endpoint | Description | Phase |
|--------|----------|-------------|-------|
| GET | /api/leagues/:id/scoreboard | Today's games with drafted player highlights | 12 |
| DELETE | /api/leagues/:id/members/me | Leave a league | 15 |
| DELETE | /api/leagues/:id/members/:userId | Remove a member (commissioner) | 15 |
| GET | /api/leagues/:id/draft/messages | Draft chat history | 16 |

---

## 6. New Frontend Files

| File | Description | Phase |
|------|-------------|-------|
| `client/src/components/Toast.jsx` | Toast notification component | 14 |
| `client/src/context/ToastContext.jsx` | Toast state management | 14 |
| `client/src/components/ErrorBoundary.jsx` | React error boundary | 14 |
| `client/src/components/ConfirmDialog.jsx` | Reusable confirmation modal | 15, 16 |
| `client/src/pages/Home.jsx` | Public landing page | 17 |

---

## 7. Phase Summary & Checklist

| Phase | Feature | Priority | Estimated Tests |
|-------|---------|----------|-----------------|
| 12 | Scoreboard Backend | High | ~5 |
| 13 | Tournament Data Import | High | Manual + dry-run |
| 14 | UI/UX Polish (toasts, errors, responsive, skeletons) | High | ~10 |
| 15 | League Management (leave, remove, edit UI) | Medium | ~8 |
| 16 | Draft UX (timer, confirmation, chat) | Medium | ~10 |
| 17 | Visual Design & Branding | Medium | ~5 |
| 18 | Deployment Preparation | High | ~6 |

**Recommended build order**: 13 -> 12 -> 14 -> 18 -> 15 -> 16 -> 17

Import tournament data first (13) so the scoreboard (12) and all testing has real data to work with. Then polish the UX (14), harden for deployment (18), and add nice-to-have features (15-17).

---

## 8. Development Methodology

Continue the TDD approach from SPEC.md:
1. Write failing tests first.
2. Implement minimum code to pass.
3. Refactor while green.

For UI/UX phases (14, 17), supplement automated tests with manual visual review on both desktop (1440px) and mobile (375px) viewports.

---

## 9. Future Enhancements (Out of Scope for v2)

- Trade players between teams
- Push notifications (mobile/email)
- Bonus scoring categories (rebounds, assists, upsets)
- Multiple scoring format options
- Public leagues (anyone can join without invite)
- Historical league data across years
- OAuth login (Google, Apple)
- PWA support for mobile home screen install
