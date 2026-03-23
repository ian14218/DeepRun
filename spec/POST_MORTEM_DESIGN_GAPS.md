# Post-Mortem: Design Gaps & Why Bugs Weren't Caught in the Initial Build

_Analysis date: 2026-03-23_
_Scope: Full git history review (641d1a2 through e9b6b95, Feb 23 – Mar 20, 2026)_

## Executive Summary

After reviewing all 70+ commits across 4 weeks of development, 13 distinct post-build fixes were identified. They cluster into 5 systemic root causes — all traceable to gaps in the original specification and development process, not to poor coding.

---

## Timeline

| Date | Phase | Key Commits |
|------|-------|-------------|
| Feb 23 | Initial build | Core app: auth, leagues, draft, scoring, bracket |
| Feb 24 | Polish | Timer controls, draft filters, branding, deployment |
| Feb 25 | **Fix** | Draft chat broken (migration never applied) |
| Feb 26 | Feature | Best Ball salary-cap contest |
| Feb 27 | **Fix** | Best Ball completed contests not showing |
| Mar 3 | Feature + **Fix** | First Four support; simulation reset fix |
| Mar 3–4 | Hardening | JWT auto-logout, production hardening, Best Ball pricing |
| Mar 5 | Go-live | Elimination blocking, backfill, ESPN round detection |
| Mar 13 | Feature | Admin password reset |
| Mar 15 | Feature + **Fix** | Tournament seeding UI; skip TBD teams (seed=99) |
| Mar 16 | **Fixes** | Best Ball lock date, mobile draft, PPG discrepancy (3 commits), draft layout |
| Mar 18 | **Fix** | First Four production bugs (stats, lock, bracket, scoreboard) |
| Mar 19 | **Fix** | Points reverting to 0 after games end |
| Mar 20 | Feature | Game times on scoreboard |

---

## Root Cause 1: No Real External API Testing (~30% of fixes)

### Affected Fixes
- `8dbca21` / `246a829` / `a54b3c5` — PPG discrepancy (3 iterations)
- `223bc92` — Points reverting to 0 after games end
- `fd0ce84` — TBD teams with seed=99 breaking DB constraint

### What Happened
The ESPN API returns data in formats that weren't anticipated:
- Season stats are nested under `season.displayName`, not a top-level field
- The `totals` field is career averages, not current-season PPG
- Completed game box scores sometimes return 0 or malformed data
- Unresolved First Four matchups return placeholder teams with seed=99

### Why It Wasn't Caught
- Development used **simulated data** with clean, predictable shapes
- ESPN API response structure was assumed, never verified against real payloads
- No integration tests used real API response snapshots
- A debug endpoint (`1a3bcc9`) had to be added in production to discover the actual response format
- The stat sync upsert used naive `INSERT ... ON CONFLICT UPDATE` without defensive guards

### What Should Have Been Done
- Record real ESPN API responses and use them as test fixtures
- Add contract tests validating expected response shapes
- Use `GREATEST()` in upserts to prevent data regression (eventually added in `223bc92`)
- Add validation/filtering before database writes (e.g., reject seed=99)

---

## Root Cause 2: Incomplete Domain Model (~25% of fixes)

### Affected Fixes
- `22f1d5d` — Entire First Four feature (added 3 weeks after initial build)
- `ad042ee` — First Four production bugs across 6 subsystems
- `fd0ce84` — TBD teams in tournament seeder

### What Happened
The original spec modeled a **64-team tournament**. The NCAA tournament actually has **68 teams** with 4 play-in games ("First Four"). This single domain omission cascaded into bugs in:
1. **Drafting** — needed paired player picks for First Four teams
2. **Simulation** — needed a "round 0" before the Round of 64
3. **Scoring** — First Four games shouldn't generate player_game_stats
4. **Bracket display** — First Four winners appeared in wrong round
5. **Contest locking** — First Four games triggered premature lock
6. **Reset** — simulation reset destroyed First Four pair relationships

### Why It Wasn't Caught
- SPEC.md references "64 teams" — the standard shorthand, but incorrect for the actual format
- First Four is an edge case affecting only 8 of 68 teams
- The domain complexity is disproportionate to the number of teams affected
- No domain expert review of the spec against actual NCAA tournament rules

### What Should Have Been Done
- Validate the spec against the actual NCAA tournament format (68 teams, not 64)
- Model the First Four as a first-class concept from day one
- Include edge cases in the data model (play-in games, byes, TBD teams)

---

## Root Cause 3: No Mobile/Responsive Testing (~20% of fixes)

### Affected Fixes
- `1cc450a` — Mobile draft not updating after pick
- `10d2cce` — Chat covering available players section
- `663b56a` — Sidebar ratio on small laptops
- `94771aa` — Draft players section responsiveness

### What Happened
- Socket.IO connections drop when mobile browsers are backgrounded
- The draft UI relied solely on socket events to refresh; no API fallback
- Socket.IO loses room membership on reconnect (server-side state cleared)
- Chat component expanded to cover the player list on smaller viewports

### Why It Wasn't Caught
- SPEC_V2 explicitly noted: _"Responsive design — **Untested**: Tailwind used but no mobile verification pass"_
- Development was desktop-only
- Socket.IO's mobile-specific behaviors (backgrounding, reconnection) only manifest on real devices
- No responsive breakpoint testing was in the acceptance criteria

### What Should Have Been Done
- Include mobile viewport testing in acceptance criteria
- Test Socket.IO reconnection scenarios (network drop, background/foreground)
- Add API-based fallback for all socket-dependent state updates
- Auto-rejoin rooms on socket reconnection

---

## Root Cause 4: Production Operations Deferred (~15% of fixes)

### Affected Fixes
- `eae65db` — Trust proxy for Railway reverse proxy
- `1a612ed` — Entire hardening commit (SSL, rate limiting, error masking, socket auth)
- `cb14ff5` — JWT auto-logout on expiration
- `45eb3fb` — Best Ball lock date using hardcoded offset instead of real schedule

### What Happened
- `express-rate-limit` threw errors behind Railway's proxy (`X-Forwarded-For` unexpected)
- Socket.IO accepted unauthenticated connections
- 5xx errors leaked internal stack traces to clients
- JWT tokens expired silently, leaving users in zombie-authenticated state
- Best Ball lock date was `now + 7 days` instead of actual tournament tip-off time

### Why It Wasn't Caught
- SPEC.md had zero acceptance criteria for deployment, security hardening, or operational concerns
- The `1a612ed` "Harden for production" commit (9 days post-initial-build) confirms this was intentionally deferred
- No staging environment to test proxy/SSL behavior before production
- JWT lifecycle (expiration, refresh, auto-logout) wasn't in the auth spec

### What Should Have Been Done
- Include a "production readiness" phase in the original spec
- Add acceptance criteria for: reverse proxy, SSL, error sanitization, socket authentication
- Test behind a reverse proxy in development (e.g., nginx)
- Model JWT lifecycle including expiration and client-side handling

---

## Root Cause 5: Happy-Path-Only Test Coverage (~10% of fixes)

### Affected Fixes
- `5ab9280` — Draft chat broken (migration 006 never applied)
- `eaec04e` — Best Ball completed contests not returned by getActiveContest()
- `22f1d5d` — Simulation reset destroying First Four pairs

### What Happened
- Migration 006 existed but was never applied; chat silently returned empty
- `getActiveContest()` filtered out `status = 'completed'`, so leaderboards disappeared post-tournament
- `resetSimulation()` blanket-wiped `first_four_partner_id`, destroying structural data

### Why It Wasn't Caught
- Tests ran with all migrations pre-applied — never tested a fresh migration sequence
- No test for "what does the app look like after the tournament ends?"
- Simulation reset tested the "it cleans up" path, not "does it preserve structural data?"
- Test matrix only covered the "during tournament" state

### What Should Have Been Done
- Test migration ordering and idempotency as part of CI
- Add lifecycle tests: pre-draft, during-draft, during-tournament, post-tournament
- Distinguish between transactional data (game stats) and structural data (First Four pairs) in reset logic
- Test boundary conditions (empty state, completed state, reset state)

---

## Summary Table

| Root Cause | % of Fixes | Key Insight |
|---|---|---|
| No real API contract testing | ~30% | Simulated data hid real ESPN response formats |
| Incomplete domain model | ~25% | 64-team spec vs 68-team reality caused cascading bugs |
| No mobile/responsive testing | ~20% | Socket + layout issues only found by real users |
| Production ops deferred | ~15% | Spec had zero deployment/security acceptance criteria |
| Happy-path-only coverage | ~10% | No tests for post-completion, post-reset, or migration edge states |

## Overarching Lesson

The app was spec'd and built as a **feature prototype** — the specifications were thorough on _what features should do_ but silent on _how they fail_. No error scenarios, no edge states, no operational requirements, and no integration tests against real external services. The most expensive gap was the First Four omission: one missing domain concept in the spec created a cascade of 3+ fix commits across 6 subsystems over 2 weeks.

**The pattern**: build features → deploy → discover gaps through live usage → fix reactively. A more defensive approach would front-load: real API fixture tests, domain model validation against actual rules, mobile testing in acceptance criteria, and a production-readiness checklist in the spec.
