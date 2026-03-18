# First Four Production Bug Fix Spec

**Date:** 2026-03-18
**Priority:** Critical — must be fixed before Round of 64 starts Thursday 3/19
**Revision:** 2 (post-review)

---

## Problem Summary

The First Four games played on 3/17 exposed three bugs in how the live ESPN stat sync handles play-in games:

1. **Best Ball contest locked prematurely** — Contest transitioned from `open` → `live` during First Four, preventing roster changes. It should remain `open` until the Round of 64 starts Thursday.
2. **First Four scoring stats recorded + bracket advancement wrong** — Player game stats were created for First Four players (violating our "no scoring in First Four" rule), AND `updateWinsFromStats()` counted the First Four game as a win, giving the winning team `wins=1`. The bracket view uses `wins >= r` to determine advancement, so a team with 1 win appears in the R32 column instead of R64.
3. **Scoreboard tab didn't show First Four game** — The API returns games in ESPN's `teams[]` nested format, but the Scoreboard UI expects a flat format with `home_team`, `away_team`, `players[]`, etc. The data shape mismatch means no games render correctly (not just First Four).

---

## Root Cause Analysis

### Bug 1: Best Ball Premature Lock

**File:** `server/src/jobs/statSync.job.js:108-114`

The stat sync auto-transitions the Best Ball contest to `live` when it processes a non-First-Four game. The detection logic checks:

```js
const isFirstFourGame = teamsInGame.length === 2 && teamsInGame.every(t => t.is_first_four);
```

This check is **fragile** — it depends on both teams having `is_first_four = true` in the database. If either team wasn't flagged correctly during seeding (or if one team's lookup failed), the check returns `false` and the contest locks.

Additionally, even if detection worked perfectly, this approach is backwards: we should not be inferring lock timing from game detection. We already have a computed `lock_date` on the contest (set to 30 min before R64 tip-off). The lock transition should use that date, not game-type inference.

**Note:** `simulation.service.js:251` has the same problem — it transitions `open → live` unconditionally with no lock_date check. Both paths need fixing.

### Bug 2: First Four Stats + Bracket Advancement

**Files:**
- `server/src/jobs/statSync.job.js:72-79` — Creates `player_game_stats` for ALL games including First Four
- `server/src/models/tournamentTeam.model.js:65-78` — `updateWinsFromStats()` counts ALL distinct game IDs in `player_game_stats`, including First Four
- `client/src/components/BracketView.jsx:77-87` — Uses `wins >= r` to determine round advancement

The chain of events:
1. ESPN sync processes First Four game → creates `player_game_stats` with `tournament_round = 'First Four'`
2. `updateWinsFromStats()` counts distinct games → First Four winner gets `wins = 1`
3. `ROUND_BY_WINS` maps `1 → 'Round of 32'`, so the team's `current_round` = R32
4. `BracketView.buildRegionRounds()` checks `wins >= 1` for R32 advancement → Texas appears in R32

The simulation service already handles this partially — it skips stat insertion for First Four games and uses direct `updateWins(id, 1)` for FF winners. But it has the same bracket bug since `wins=1` still triggers R32 advancement.

### Bug 2b: `updateWinsFromStats()` Overwrite Problem (found in review)

**Critical issue the initial spec missed.** After we fix the sync to skip FF stats and set `wins=1` directly for FF winners, a new problem emerges:

1. After FF: `updateWins(texas.id, 1)` → `wins = 1` ✓
2. After Texas wins R64: `updateWinsFromStats(texas.id)` is called
3. `updateWinsFromStats` does `SET wins = COUNT(DISTINCT games in player_game_stats)`
4. Only the R64 game has stats (FF stats were skipped) → count = 1
5. `wins` is **overwritten to 1** instead of being 2 (FF + R64)

This is because `updateWinsFromStats()` uses `SET` (replacement), not addition. It counts only games with `player_game_stats` rows, and since we skip FF stats, the FF win is invisible to this count.

**This same bug exists in `simulation.service.js:234`** — after simulating R64 for a FF winner, `updateWinsFromStats` overwrites the FF win.

### Bug 3: Scoreboard Data Shape Mismatch

**Files:**
- `server/src/services/scoreboard.service.js` — Returns ESPN-shaped data with nested `teams[]` array
- `client/src/pages/Scoreboard.jsx:84-113` — Expects flat properties

**Full field mismatch:**

| UI Field | API Source | Status |
|----------|-----------|--------|
| `game.id` | `external_game_id` | Wrong key name |
| `game.home_team` | `teams[].name` (nested) | Missing — must flatten |
| `game.away_team` | `teams[].name` (nested) | Missing — must flatten |
| `game.home_score` | `teams[].score` (nested) | Missing — must flatten |
| `game.away_score` | `teams[].score` (nested) | Missing — must flatten |
| `game.home_team_external_id` | `teams[].external_team_id` (nested) | Missing — must flatten |
| `game.away_team_external_id` | `teams[].external_team_id` (nested) | Missing — must flatten |
| `game.status` | `status` | ✓ Present |
| `game.tournament_round` | `tournament_round` | ✓ Present |
| `game.players[].name` | `teams[].drafted_players[].player_name` | Nested + wrong key |
| `game.players[].points` | `teams[].drafted_players[].total_points` | Nested + wrong key + wrong semantics (cumulative vs per-game) |

**Additional issue:** The query fetches `total_points` (cumulative career sum from all games), but the UI expects per-game points for the current game. Need to join `player_game_stats` for the specific game to get today's points.

---

## Fix Plan

### Fix 1: Best Ball Lock — Use `lock_date` Instead of Game Detection

**Files to change:** `server/src/jobs/statSync.job.js`, `server/src/services/simulation.service.js`

**Change in statSync.job.js:** Replace the `isFirstFourGame` detection logic with a simple date check:

```js
// Current (remove):
if (activeContest.status === 'open' && game.status !== 'upcoming') {
  const teamsInGame = Object.values(teamRecords);
  const isFirstFourGame = teamsInGame.length === 2 && teamsInGame.every(t => t.is_first_four);
  if (!isFirstFourGame) {
    await bestBallModel.updateContestStatus(activeContest.id, 'live');
  }
}

// New:
if (activeContest.status === 'open') {
  const now = new Date();
  const lockDate = activeContest.lock_date ? new Date(activeContest.lock_date) : null;
  if (lockDate && now >= lockDate) {
    console.log('[statSync] Lock date reached — locking Best Ball contest');
    await bestBallModel.updateContestStatus(activeContest.id, 'live');
  }
}
```

**Change in simulation.service.js:** Apply the same lock_date guard:

```js
// Current (remove):
if (contest.status === 'open') {
  await bestBallModel.updateContestStatus(contest.id, 'live');
}

// New:
if (contest.status === 'open') {
  const now = new Date();
  const lockDate = contest.lock_date ? new Date(contest.lock_date) : null;
  if (lockDate && now >= lockDate) {
    await bestBallModel.updateContestStatus(contest.id, 'live');
  }
}
```

This is deterministic, doesn't depend on game detection, and uses the lock date we already compute (30 min before R64 tip-off on 3/19). The `lock_date` column is `NOT NULL` in the schema (migration 007), and is always set via `getLockDate()` in `bestBall.service.js`.

**Immediate production fix:** Revert the contest status back to `open` since it was prematurely locked:

```sql
UPDATE best_ball_contests SET status = 'open', updated_at = NOW()
WHERE status = 'live';
```

### Fix 2: Skip First Four Stats in Live Sync

**File to change:** `server/src/jobs/statSync.job.js`

**Change:** Mirror the simulation's behavior — skip `player_game_stats` creation for First Four games, but still handle elimination and update wins directly.

In `processGame()`, wrap the stat upsert loop in a First Four check:

```js
const isFirstFour = boxScore.tournament_round === 'First Four';

// Only create player_game_stats for R64+ (First Four has no scoring impact)
if (!isFirstFour) {
  for (const teamData of boxScore.teams) {
    // ... existing stat upsert loop (unchanged)
  }
}

// Handle post-game events
if (game.status === 'final') {
  // Elimination stays the same — FF losers are still eliminated
  if (game.loser_external_id) {
    const loserTeam = await teamModel.findByExternalId(game.loser_external_id);
    if (loserTeam && !loserTeam.is_eliminated) {
      await eliminationService.eliminateTeam(loserTeam.id, boxScore.tournament_round);
    }
  }

  if (game.winner_external_id) {
    const winnerTeam = await teamModel.findByExternalId(game.winner_external_id);
    if (winnerTeam) {
      if (isFirstFour) {
        // Direct win update for FF (no stats to derive from)
        await teamModel.updateWins(winnerTeam.id, 1);
      } else {
        await teamModel.updateWinsFromStats(winnerTeam.id);
      }
    }
  }
}
```

**Immediate production fix:** Delete the `player_game_stats` rows that were created for First Four games, and correct the winning team's `wins` count:

```sql
-- Remove First Four game stats
DELETE FROM player_game_stats WHERE tournament_round = 'First Four';

-- Reset wins for First Four winner — they should have wins=1 from FF
UPDATE tournament_teams SET wins = 1
WHERE is_first_four = true AND is_eliminated = false;

-- Set to 0 for eliminated FF teams (they lost the play-in)
UPDATE tournament_teams SET wins = 0
WHERE is_first_four = true AND is_eliminated = true;
```

### Fix 3: Fix `updateWinsFromStats()` to Preserve First Four Wins

**File to change:** `server/src/models/tournamentTeam.model.js`

**Problem (found in review):** `updateWinsFromStats()` does `SET wins = COUNT(DISTINCT games)` from `player_game_stats`. Since we skip FF stats (Fix 2), the FF win is invisible to this count. When a FF winner later wins R64, `updateWinsFromStats` overwrites `wins` to 1 (only the R64 game) instead of 2 (FF + R64).

**Change:** Add `+1` for First Four teams whose FF win isn't reflected in stats:

```sql
-- Current:
UPDATE tournament_teams
SET wins = (
  SELECT COUNT(DISTINCT pgs.external_game_id)::int
  FROM player_game_stats pgs
  JOIN players p ON p.id = pgs.player_id
  WHERE p.team_id = $1
)
WHERE id = $1
RETURNING *

-- New:
UPDATE tournament_teams
SET wins = (
  SELECT COUNT(DISTINCT pgs.external_game_id)::int
  FROM player_game_stats pgs
  JOIN players p ON p.id = pgs.player_id
  WHERE p.team_id = $1
) + CASE WHEN is_first_four AND NOT is_eliminated THEN 1 ELSE 0 END
WHERE id = $1
RETURNING *
```

**Why `AND NOT is_eliminated`?** A FF team that **lost** their play-in game has 0 real wins. Only the FF **winner** (not eliminated) should get the +1 bonus. Note: eliminated FF teams will never have `updateWinsFromStats` called on them (they lost), but the guard is defensive.

**This also fixes the simulation's `updateWinsFromStats` calls** since both sync and simulation use the same model function.

### Fix 4: Bracket View — Account for First Four Wins

**File to change:** `client/src/components/BracketView.jsx`

**Change:** The `buildRegionRounds()` advancement logic needs to account for First Four teams having a "bonus" win that doesn't count toward bracket advancement.

```js
// In buildRegionRounds(), replace the round advancement loop:
for (let r = 1; r <= 3; r++) {
  const prev = rounds[r - 1];
  const next = [];
  for (let i = 0; i < prev.length; i += 2) {
    const a = prev[i], b = prev[i + 1];
    // First Four winners get +1 win from the play-in that doesn't count
    // for bracket advancement (it gets them INTO R64, not past it).
    const aWins = a ? a.wins - (a.is_first_four ? 1 : 0) : 0;
    const bWins = b ? b.wins - (b.is_first_four ? 1 : 0) : 0;
    if (a && aWins >= r) next.push(a);
    else if (b && bWins >= r) next.push(b);
    else next.push(null);
  }
  rounds.push(next);
}
```

**Also update `buildFinalRounds()`** — it uses `wins >= 4` for Final Four entry, `wins >= 5` for Championship, `wins >= 6` for Champion. Apply the same offset:

```js
function buildFinalRounds(regionRounds) {
  const winner = (region) => {
    const e8 = regionRounds[region]?.[3];
    if (!e8) return null;
    const ffOffset = (t) => t ? t.wins - (t.is_first_four ? 1 : 0) : 0;
    if (e8[0] && ffOffset(e8[0]) >= 4) return e8[0];
    if (e8[1] && ffOffset(e8[1]) >= 4) return e8[1];
    return null;
  };

  const ff = [winner('East'), winner('West'), winner('South'), winner('Midwest')];

  const ffOffset = (t) => t ? t.wins - (t.is_first_four ? 1 : 0) : 0;
  const champ = [];
  for (let i = 0; i < 4; i += 2) {
    if (ffOffset(ff[i]) >= 5) champ.push(ff[i]);
    else if (ffOffset(ff[i + 1]) >= 5) champ.push(ff[i + 1]);
    else champ.push(null);
  }

  const champion = ffOffset(champ[0]) >= 6 ? champ[0] : ffOffset(champ[1]) >= 6 ? champ[1] : null;
  return { ff, champ, champion };
}
```

**Why is this still needed after Fix 3?** Because Fix 3 makes `wins` accurate (FF win + tournament wins combined), but the bracket thresholds assume wins map 1:1 to tournament rounds. A FF winner who also won R64 has `wins=2`, but the bracket expects `wins >= 1` for R32. Without the offset, that team would show in R32 correctly — but a FF winner who has *only* won FF would have `wins=1` and falsely appear in R32. The offset subtracts the FF bonus so thresholds work uniformly.

**Also update `addCurrentRound()` in `tournamentTeam.model.js`** so that the `current_round` API field is accurate:

```js
function addCurrentRound(team) {
  const effectiveWins = team.is_first_four ? Math.max(0, team.wins - 1) : team.wins;
  return { ...team, current_round: ROUND_BY_WINS[effectiveWins] || 'Round of 64' };
}
```

### Fix 5: Scoreboard Service — Transform Data to Match UI Contract

**File to change:** `server/src/services/scoreboard.service.js`

**Change:** Transform the ESPN-shaped game data into the flat format the UI expects before returning. Also add per-game points lookup.

```js
async function getScoreboard(leagueId) {
  const games = await externalApi.fetchTodaysGames();
  if (games.length === 0) return [];

  // Collect all team external IDs from today's games
  const gameTeamIds = new Set();
  const gameIds = [];
  for (const game of games) {
    gameIds.push(game.external_game_id);
    for (const team of game.teams || []) {
      if (team.external_team_id) gameTeamIds.add(team.external_team_id);
    }
  }

  if (gameTeamIds.size === 0) return flattenGames(games, {}, {});

  // Find all drafted players in this league whose teams are playing today
  const { rows: draftedPlayers } = await pool.query(
    `SELECT
       dp.member_id,
       p.id AS player_id,
       p.name AS player_name,
       p.position,
       p.is_eliminated,
       tt.external_id AS team_external_id,
       tt.name AS team_name,
       u.username AS drafter_username
     FROM draft_picks dp
     JOIN players p ON p.id = dp.player_id
     JOIN tournament_teams tt ON tt.id = p.team_id
     JOIN league_members lm ON lm.id = dp.member_id
     JOIN users u ON u.id = lm.user_id
     WHERE dp.league_id = $1
       AND tt.external_id = ANY($2::text[])`,
    [leagueId, Array.from(gameTeamIds)]
  );

  // Fetch per-game points for these players in today's games
  const playerIds = draftedPlayers.map(p => p.player_id);
  let pointsByPlayerGame = {};
  if (playerIds.length > 0 && gameIds.length > 0) {
    const { rows: gameStats } = await pool.query(
      `SELECT pgs.player_id, pgs.points, pgs.external_game_id
       FROM player_game_stats pgs
       WHERE pgs.external_game_id = ANY($1::text[])
         AND pgs.player_id = ANY($2::uuid[])`,
      [gameIds, playerIds]
    );
    for (const stat of gameStats) {
      pointsByPlayerGame[`${stat.player_id}-${stat.external_game_id}`] = stat.points;
    }
  }

  // Group drafted players by team external ID
  const playersByTeam = {};
  for (const p of draftedPlayers) {
    if (!playersByTeam[p.team_external_id]) playersByTeam[p.team_external_id] = [];
    playersByTeam[p.team_external_id].push(p);
  }

  // Flatten games into the format the UI expects
  return games.map((game) => {
    const homeTeam = (game.teams || []).find(t => t.is_home) || game.teams?.[0];
    const awayTeam = (game.teams || []).find(t => !t.is_home) || game.teams?.[1];

    // Collect all drafted players across both teams into flat array
    const players = [];
    for (const team of game.teams || []) {
      const teamDrafted = playersByTeam[team.external_team_id] || [];
      for (const p of teamDrafted) {
        const gamePoints = pointsByPlayerGame[`${p.player_id}-${game.external_game_id}`] ?? null;
        players.push({
          player_id: p.player_id,
          name: p.player_name,
          team_name: p.team_name,
          team_external_id: p.team_external_id,
          position: p.position,
          points: gamePoints ?? 0,
          drafter_username: p.drafter_username,
        });
      }
    }

    return {
      id: game.external_game_id,
      external_game_id: game.external_game_id,
      name: game.name,
      short_name: game.short_name,
      status: game.status,
      status_detail: game.status_detail,
      tournament_round: game.tournament_round,
      start_time: game.start_time,
      home_team: homeTeam?.name || '',
      away_team: awayTeam?.name || '',
      home_team_external_id: homeTeam?.external_team_id || '',
      away_team_external_id: awayTeam?.external_team_id || '',
      home_score: homeTeam?.score ?? 0,
      away_score: awayTeam?.score ?? 0,
      players,
    };
  });
}
```

**Note on First Four games in the scoreboard:** Since Fix 2 skips `player_game_stats` for FF games, drafted FF players will show `points: 0` on the scoreboard. The game itself (team scores, status) will still display correctly from ESPN live data. This is acceptable — FF games have no fantasy scoring impact. The user can see their player's team is playing and the game score, just no individual fantasy points.

### Fix 6: Scoreboard UI — Minor Field Cleanup

**File to change:** `client/src/pages/Scoreboard.jsx`

After Fix 5, the API will return the flat format the UI expects, so most of the UI code works as-is. Minor adjustments:

- Line 84: `game.players` will now be populated correctly (flat array from API)
- The `game.status` field is already present and used correctly
- Consider showing `game.tournament_round` (e.g., "First Four", "Round of 64") as a label on each game card
- Consider showing `game.status_detail` (e.g., "Final", "Halftime", "2nd 12:34") for richer live status

---

## Execution Order

### Phase 1: Immediate Production Data Fix (SQL, manual)

Run these SQL statements against the production database:

```sql
-- 1. Revert Best Ball contest from 'live' back to 'open'
UPDATE best_ball_contests SET status = 'open', updated_at = NOW()
WHERE status = 'live';

-- 2. Remove First Four game stats (incorrectly created)
DELETE FROM player_game_stats WHERE tournament_round = 'First Four';

-- 3. Correct wins for First Four teams
UPDATE tournament_teams SET wins = 1
WHERE is_first_four = true AND is_eliminated = false;

UPDATE tournament_teams SET wins = 0
WHERE is_first_four = true AND is_eliminated = true;
```

### Phase 2: Code Fixes (deploy before tonight's FF games on 3/18)

Apply in this order (each fix builds on the previous):

1. **Fix 3** — `updateWinsFromStats()` in `tournamentTeam.model.js` — Add FF win preservation (foundation fix, needed by everything else)
2. **Fix 2** — Skip First Four stats in `statSync.job.js` — Prevents recurrence tonight
3. **Fix 1** — Use `lock_date` for Best Ball transition in both `statSync.job.js` AND `simulation.service.js` — Prevents premature lock tonight
4. **Fix 4** — Bracket view First Four offset in `BracketView.jsx` + `addCurrentRound()` fix — Corrects visual bracket
5. **Fix 5** — Scoreboard service data transformation — Fixes scoreboard for R64 Thursday
6. **Fix 6** — Minor Scoreboard UI polish

### Phase 3: Verification

1. **Tonight's FF games (3/18):**
   - No `player_game_stats` created for FF games
   - FF winners get `wins=1` via direct update
   - Best Ball stays `open`
   - Bracket shows FF winners in R64 slot, not R32
   - Scoreboard shows FF games with team scores (no player fantasy points, which is correct)

2. **Thursday R64 (3/19):**
   - Best Ball transitions to `live` when lock_date is reached (~11:45 AM ET)
   - `player_game_stats` created for R64 games
   - `updateWinsFromStats` correctly computes wins (stat-game-count + 1 for FF teams)
   - FF winners who win R64 show `wins=2`, bracket shows them in R32
   - Scoreboard shows all R64 games with per-game player points

3. **Edge cases:**
   - A non-FF team winning R64 → `wins=1`, bracket shows R32 (no offset applied) ✓
   - A FF team that lost their play-in → `is_eliminated=true`, `wins=0`, doesn't appear in bracket ✓
   - Best Ball contest with no remaining FF games but R64 hasn't started → stays `open` until lock_date ✓

---

## Test Plan

### New/Updated Server Tests

1. **`statSync.job.js` — First Four game skips stats:**
   - Mock a game with `tournament_round = 'First Four'`
   - Assert no `player_game_stats` rows created
   - Assert losing team still eliminated
   - Assert winning team gets `wins=1` via direct `updateWins` (not `updateWinsFromStats`)

2. **`statSync.job.js` — Best Ball lock uses lock_date:**
   - Mock contest with `status=open`, `lock_date` in the future → assert status stays `open`
   - Mock contest with `status=open`, `lock_date` in the past → assert status transitions to `live`
   - Process a First Four game with lock_date in the future → assert contest stays `open`

3. **`tournamentTeam.model.js` — `updateWinsFromStats` preserves FF wins:**
   - Create a FF team with `is_first_four=true`, `is_eliminated=false`
   - Set `wins=1` directly (FF win)
   - Create 1 `player_game_stats` row (R64 game)
   - Call `updateWinsFromStats()` → assert `wins=2` (1 from stats + 1 FF bonus)
   - Repeat for non-FF team → assert `wins=1` (no bonus)

4. **`scoreboard.service.js` — Flat format transformation:**
   - Assert returned data has `id`, `home_team`, `away_team`, `home_score`, `away_score`, `home_team_external_id`, `away_team_external_id`
   - Assert `players[]` is a flat array containing drafted players from both teams
   - Assert `players[].name` and `players[].points` are correctly mapped
   - Assert per-game `points` are populated from `player_game_stats` for the specific game

5. **`simulation.service.js` — Best Ball lock uses lock_date:**
   - Mock contest with `status=open`, `lock_date` in the future → assert status stays `open` after simulating FF round

### Updated Client Tests

6. **`BracketView` — First Four offset:**
   - Team with `is_first_four=true, wins=1` should appear in R64, not R32
   - Team with `is_first_four=true, wins=2` should appear in R32 (won FF + R64)
   - Team with `is_first_four=true, wins=5` should appear in Final Four
   - Non-FF team with `wins=1` should appear in R32 as before (no offset)

---

## Files Changed Summary

| File | Change |
|------|--------|
| `server/src/jobs/statSync.job.js` | Skip FF stats, direct wins update for FF, lock_date-based Best Ball transition |
| `server/src/models/tournamentTeam.model.js` | `updateWinsFromStats()` adds +1 for non-eliminated FF teams; `addCurrentRound()` applies FF offset |
| `server/src/services/simulation.service.js` | Lock_date guard on Best Ball `open → live` transition |
| `server/src/services/scoreboard.service.js` | Transform nested ESPN data to flat UI format, add per-game points query |
| `client/src/components/BracketView.jsx` | Offset `is_first_four` wins in `buildRegionRounds()` and `buildFinalRounds()` |
| `client/src/pages/Scoreboard.jsx` | Minor UI polish (tournament_round label, status_detail) |
| `server/tests/sync.test.js` | Add First Four skip-stats + lock_date tests |
| `server/tests/tournamentTeam.model.test.js` | Add updateWinsFromStats FF preservation test |
| `server/tests/scoreboard.service.test.js` | Add/update data shape + per-game points tests |
| `client/src/components/BracketView.test.jsx` | Add FF advancement offset tests |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `lock_date` is NULL | Column is `NOT NULL` per migration 007; `ensureActiveContest()` always sets it via `getLockDate()` |
| Future years missing from `R64_TIPOFF` map | `getLockDate()` has 7-day fallback; should add 2027+ before next season |
| FF team lookup fails in sync | Elimination/win logic is guarded by `if (team)` checks; worst case = no win recorded, manually fixable |
| Scoreboard shows 0 pts for FF players | Correct behavior — FF games have no scoring impact. Game score still shows from ESPN. |
| `updateWinsFromStats` +1 applied to eliminated FF team | Guarded by `AND NOT is_eliminated` in the SQL CASE |
