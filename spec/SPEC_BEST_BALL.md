# DeepRun Best Ball — Specification Document

## 1. Overview

Best Ball is a global, salary-cap fantasy game that runs alongside the existing league-based snake draft. Instead of drafting players within a private league, **every user on the platform competes in a single shared pool**. Each user builds an 8-player roster by "purchasing" players with a fixed virtual budget. Scoring follows the same tournament-based rules as regular leagues — points come from `player_game_stats` as the NCAA tournament progresses.

### How It Differs From Leagues

| Aspect | Leagues (Snake Draft) | Best Ball (Salary Cap) |
|--------|----------------------|------------------------|
| Competition scope | 4-20 friends in a private league | All Best Ball players on the platform |
| Player selection | Turn-based snake draft | Self-service roster building at any time before lock |
| Player exclusivity | Drafted player is off the board | Any player can appear on unlimited rosters |
| Team size | Configurable (default 3 per member) | Fixed at 8 players |
| Constraint | Draft position / availability | $8,000 salary cap budget |
| Entry limit | One team per league | One lineup per user per contest |

### Core Strategy

The salary cap forces tradeoffs. Loading up on elite players from top seeds exhausts the budget quickly, leaving roster holes. Savvy players find value — mid-major stars, high-PPG players on lower seeds who might pull upsets, or role players on deep-run favorites at bargain prices. Since every user can pick any player, differentiation comes from budget allocation, not draft position.

---

## 2. Player Pricing Model

### 2.1 Design Principles

The pricing model is inspired by how DraftKings prices their NCAA tournament DFS slates. Key principles drawn from industry research:

1. **Points-based scoring** — Year 1 tracks points only (tournament points scored). The pricing formula uses `season_ppg` as the primary player value input. Future versions may add rebounds, assists, steals, and blocks as scoring categories.
2. **Expected games played** — The defining March Madness dimension. A 1-seed is historically expected to play ~4.3 games; a 16-seed ~1.05. This is the biggest price lever.
3. **Convex distribution** — The gap between the #1 and #10 player is larger than the gap between #50 and #60. Elite production is scarce and priced accordingly.
4. **Tight budget** — The top player costs ~22% of the budget. You can afford at most 1-2 elite players, forcing real tradeoffs for the remaining 6-7 slots.
5. **Meaningful floor** — The cheapest player costs ~$500 (6.25% of budget), so even "punt" picks feel like real decisions, not throwaways.
6. **$50 increments** — Clean price tags that create ~26 distinct salary tiers across the $500–$1,800 range.

### 2.2 Pricing Formula

Player prices are computed from **season PPG** scaled by a **minutes-played weight** and a **seed-based expected-games multiplier**, then normalized into the salary range.

```
Step 1: minutes_weight  = clamp(MPG / 30, 0.15, 1.0)
Step 2: weighted_ppg    = season_ppg × minutes_weight
Step 3: projected_value = weighted_ppg × SEED_MULTIPLIER[seed]
Step 4: normalized      = (projected_value - min_projected) / (max_projected - min_projected)
Step 5: price           = round_to_nearest(SALARY_FLOOR + normalized^CURVE_EXPONENT × (SALARY_CEILING - SALARY_FLOOR), 50)
```

**Null/zero handling**: Players with 0 or null PPG (walk-ons, injured) get the minimum price (`SALARY_FLOOR`).

#### Step 1 — Minutes Weight

```
minutes_weight = clamp(season_mpg / 30, 0.15, 1.0)
```

Minutes played is a proxy for **role and opportunity**. A player averaging 32 MPG is a starter who plays the whole game. A player averaging 5 MPG barely sees the floor and is unlikely to produce meaningful stats in a tournament game, even if their per-minute rates look decent.

- 30+ MPG → weight 1.0 (full value)
- 20 MPG → weight 0.67
- 10 MPG → weight 0.33
- 5 MPG → weight 0.17 (near-minimum)

The floor of 0.15 ensures bench players don't collapse to zero — they still get a minimum price.

#### Step 2 — Weighted PPG

Simply `season_ppg × minutes_weight`. This is the player's expected scoring output adjusted for playing time. Two players with 8 PPG cost very differently if one plays 28 MPG and the other plays 12 MPG — the starter is more likely to reproduce that output in a tournament game.

#### Step 3 — Seed Multiplier (Expected Games)

This is the March Madness pricing dimension. A player's total tournament value is their per-game production multiplied by how many games their team is expected to play. The multipliers below are derived from **historical NCAA tournament win probabilities by seed** (1985–2024, ~40 years of data):

| Seed | Historical Expected Games | Seed Multiplier |
|------|---------------------------|-----------------|
| 1 | 4.30 | 1.50 |
| 2 | 3.55 | 1.35 |
| 3 | 2.98 | 1.25 |
| 4 | 2.60 | 1.18 |
| 5 | 2.18 | 1.10 |
| 6 | 2.05 | 1.05 |
| 7 | 1.82 | 1.00 |
| 8 | 1.65 | 0.97 |
| 9 | 1.55 | 0.95 |
| 10 | 1.50 | 0.93 |
| 11 | 1.48 | 0.91 |
| 12 | 1.38 | 0.88 |
| 13 | 1.18 | 0.82 |
| 14 | 1.10 | 0.76 |
| 15 | 1.08 | 0.72 |
| 16 | 1.02 | 0.65 |

**Why the multiplier range is compressed (0.65–1.50, not 0.25–4.3)**:

The raw expected-games ratio between a 1-seed (4.3 games) and a 16-seed (1.0 games) is 4.3:1. But if we used that directly, 16-seed players would be priced at near-zero and a 1-seed star would cost the entire budget. The compressed range keeps low-seed players temptingly cheap (not worthlessly cheap) while still rewarding the higher seeds with a meaningful premium. This preserves the core strategic tension: *"Is a 20 PPG scorer on a 12-seed at $950 a better value than the same player on a 2-seed at $1,450?"*

#### Step 4 — Normalization

```
normalized = (projected_value - min_projected) / (max_projected - min_projected)
```

Maps all players to a 0.0–1.0 scale based on the min and max `projected_value` across all tournament players in the contest. The best player scores 1.0, the weakest scores 0.0.

#### Step 5 — Salary Mapping (with convex curve)

```
price = round_to_nearest_50( SALARY_FLOOR + normalized^CURVE_EXPONENT × (SALARY_CEILING - SALARY_FLOOR) )
```

| Constant | Default | Description |
|----------|---------|-------------|
| `SALARY_FLOOR` | `500` | Minimum player price |
| `SALARY_CEILING` | `1800` | Maximum player price |
| `CURVE_EXPONENT` | `0.7` | Controls price distribution shape |
| `ROUNDING` | `50` | Round to nearest N |

**The curve exponent (`0.7`) creates a convex distribution:**
- Without the exponent (linear, exponent = 1.0), prices would be evenly spread. A player at the 50th percentile would cost $1,150.
- With exponent `0.7`, a player at the 50th percentile costs ~$1,295 — prices are "pulled up," making mid-tier players relatively more expensive.
- This means **true value picks exist in the lower tiers** — you have to look harder to find them, but the payoff for spotting an underpriced mid-major star is real.
- It also means **elite players aren't proportionally more expensive** than they "should" be, creating the classic DFS dynamic where paying up for stars is a viable strategy.

Exponent effects on a normalized=0.5 (median) player:
| Exponent | Price at 50th percentile | Distribution shape |
|----------|-------------------------|-------------------|
| 1.0 | $1,150 | Linear (even spread) |
| 0.85 | $1,200 | Slightly convex |
| 0.7 | $1,295 | Moderately convex (recommended) |
| 0.5 | $1,420 | Heavily convex |

### 2.3 Example Prices

Using the full formula with default constants. Assume the player pool's max projected value is ~33.0 (a 22 PPG, 34 MPG player on a 1-seed) and min is ~0.3 (walk-on):

| Player Profile | PPG | MPG | Seed | Min Wt | Wtd PPG | Proj Value | Norm | ~ Price |
|----------------|-----|-----|------|--------|---------|------------|------|---------|
| Elite 1-seed star | 22.0 | 34 | 1 | 1.00 | 22.00 | 33.00 | 1.00 | **$1,800** |
| Strong 1-seed starter | 16.0 | 32 | 1 | 1.00 | 16.00 | 24.00 | 0.72 | **$1,550** |
| 2-seed leading scorer | 20.0 | 33 | 2 | 1.00 | 20.00 | 27.00 | 0.82 | **$1,600** |
| 4-seed star guard | 18.0 | 35 | 4 | 1.00 | 18.00 | 21.24 | 0.64 | **$1,450** |
| 1-seed role player | 8.0 | 25 | 1 | 0.83 | 6.64 | 9.96 | 0.30 | **$1,000** |
| 8-seed solid starter | 15.0 | 30 | 8 | 1.00 | 15.00 | 14.55 | 0.44 | **$1,200** |
| 12-seed mid-major star | 20.0 | 33 | 12 | 1.00 | 20.00 | 17.60 | 0.53 | **$1,300** |
| 12-seed #2 scorer | 14.0 | 28 | 12 | 0.93 | 13.02 | 11.46 | 0.34 | **$1,050** |
| 5-seed bench scorer | 10.0 | 18 | 5 | 0.60 | 6.00 | 6.60 | 0.19 | **$850** |
| 14-seed star | 18.0 | 32 | 14 | 1.00 | 18.00 | 13.68 | 0.41 | **$1,150** |
| 16-seed role player | 6.0 | 15 | 16 | 0.50 | 3.00 | 1.95 | 0.05 | **$550** |
| Walk-on / deep bench | 1.0 | 3 | any | 0.15 | 0.15 | ~0.15 | ~0.0 | **$500** |

### 2.4 Price Distribution Analysis

With ~960 tournament players (64 teams × ~15 per roster), the expected distribution:

| Price Tier | Range | % of Players | Player Profile |
|------------|-------|-------------|----------------|
| Elite | $1,500–$1,800 | ~3% (~30) | Stars on 1-3 seeds |
| Premium | $1,200–$1,450 | ~8% (~75) | Starters on top seeds, stars on mid-seeds |
| Mid-tier | $900–$1,150 | ~15% (~145) | Solid contributors, mid-seed starters |
| Value | $650–$850 | ~20% (~190) | Role players on good teams, starters on low seeds |
| Bargain | $500–$600 | ~54% (~520) | Bench players, walk-ons, low-minute players |

**Budget math for typical roster archetypes:**

| Strategy | Player Prices | Total | Remaining |
|----------|---------------|-------|-----------|
| Stars & scrubs | $1,800 + $1,600 + $1,000 + $850 + $650 + $550 + $550 + $500 | $7,500 | $500 |
| Balanced build | $1,450 + $1,300 + $1,200 + $1,050 + $950 + $850 + $700 + $500 | $8,000 | $0 |
| Contrarian value | $1,300 + $1,150 + $1,150 + $1,050 + $1,000 + $950 + $850 + $550 | $8,000 | $0 |
| Chalky favorites | $1,800 + $1,600 + $1,550 + $1,450 + $550 + $550 + $500 + $500 | $8,500 | **OVER** |

The "Chalky favorites" strategy is intentionally impossible — you cannot just pick the top 4 players and fill with minimum-price scrubs. The budget forces real decisions.

### 2.5 Why This Formula Works

1. **Minutes weight separates starters from bench**: Two players on the same team might both average 8 PPG, but the starter playing 28 MPG costs significantly more than the reserve playing 12 MPG. The reserve is a true value pick — if he gets extra minutes due to foul trouble or blowouts, he over-delivers his price.

2. **Seed multiplier is the March Madness edge**: A 20 PPG star on a 14-seed costs ~$1,150 while a similar player on a 2-seed costs ~$1,600. The 14-seed is $450 cheaper — but his team will likely play only 1 game. If the 14-seed pulls an upset and makes a run, that $1,150 player becomes the steal of the contest.

3. **Convex curve creates value tiers**: The 0.7 exponent pushes mid-tier prices up, meaning true bargains live in the lower tiers where you have to dig. This rewards users who do their homework on mid-major players.

4. **Budget is just tight enough**: With $8,000 across 8 players ($1,000 avg), you can afford 1-2 elite players but the rest of your roster must come from the value/mid tier. No strategy dominates — stars-and-scrubs, balanced builds, and contrarian value plays can all win.

### 2.6 Price Generation Timing

Prices are **computed once** when tournament data is imported (or via a dedicated admin action) and stored in a `best_ball_player_prices` table. This ensures:
- Prices are stable (no mid-contest fluctuations), just like DraftKings locks salaries before a slate.
- The pricing formula can be adjusted by an admin before the contest opens without code changes.
- Historical price data is preserved for post-tournament analysis.

### 2.7 Tuning & Admin Controls

All formula constants are stored in the `best_ball_config` table so admins can tune without code deploys:

| Config Key | Default | Description |
|------------|---------|-------------|
| `salary_floor` | `500` | Minimum player price |
| `salary_ceiling` | `1800` | Maximum player price |
| `curve_exponent` | `0.7` | Price distribution shape (lower = more convex) |
| `price_rounding` | `50` | Round prices to nearest N |
| `minutes_baseline` | `30` | MPG denominator for minutes weight |
| `minutes_floor` | `0.15` | Minimum minutes weight |

The seed multiplier table is stored as a JSON config value (`seed_multipliers`) so it can be tuned per-contest:

```json
{ "1": 1.50, "2": 1.35, "3": 1.25, "4": 1.18, "5": 1.10, "6": 1.05, "7": 1.00, "8": 0.97, "9": 0.95, "10": 0.93, "11": 0.91, "12": 0.88, "13": 0.82, "14": 0.76, "15": 0.72, "16": 0.65 }
```

A **"Generate Prices" admin action** recalculates all prices from the current config and shows a preview (price distribution histogram, min/max/avg, tier breakdown) before committing. This lets the admin iterate on the formula until the distribution feels right for the current year's player pool.

> **Future Enhancement (Year 2+):** Add multi-stat scoring where rebounds, assists, steals, and blocks contribute to both fantasy scoring and player pricing. The formula is already structured to support this — add stat weights to the config table and expand Step 1 to a composite: `(PPG × w1) + (RPG × w2) + (APG × w3) + (SPG × w4) + (BPG × w5)`. The rest of the pipeline stays the same.

---

## 3. Game Rules

### 3.1 Entry

- Any authenticated user can enter the Best Ball contest.
- Each user gets **one lineup** per contest — this is an app-wide challenge, not a private league.
- Each lineup gets **$8,000** virtual budget and an 8-player roster to fill.
- Entry is free (no real money).

### 3.2 Roster Building

- Users browse the full player pool with prices displayed.
- Clicking "Add to Roster" deducts the player's price from the remaining budget.
- Users can **remove a player** from their roster before lock, refunding the full price.
- A roster must have **exactly 8 players** to be considered complete/valid.
- **No position restrictions** — users can pick any 8 players regardless of position.
- The same player can appear on unlimited different users' rosters (non-exclusive).

### 3.3 Contest Lifecycle

| Phase | Description |
|-------|-------------|
| `upcoming` | Contest created by admin, prices generated, but roster building not yet open. |
| `open` | Users can create entries and build/modify rosters. |
| `locked` | Roster building closes (tournament tip-off). No further changes allowed. |
| `live` | Tournament is underway. Scores update in real-time. |
| `completed` | Tournament is over. Final standings are frozen. |

**Lock Timing**: Rosters lock at the tip-off of the first tournament game. An admin sets the lock date/time when creating the contest. A scheduled job or manual admin action transitions the status.

### 3.4 Scoring

Scoring tracks **points only** (year 1). Each player earns the points they score in each tournament game (from `player_game_stats.points`). A Best Ball entry's total score is the sum of all 8 roster players' tournament points. This is identical to how league scoring works.

> **Future Enhancement (Year 2+):** Expand scoring to include rebounds, assists, steals, and blocks as additional fantasy point categories.

### 3.5 Incomplete Rosters

- Entries with fewer than 8 players at lock time are marked `incomplete` and excluded from the leaderboard.
- Users are warned when the lock deadline approaches if their roster is not full.

---

## 4. Data Model

### 4.1 New Tables

#### `best_ball_contests`
Represents a single Best Ball contest (typically one per tournament year).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | |
| `name` | VARCHAR(100) | NOT NULL | e.g., "March Madness 2025 Best Ball" |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'upcoming' | upcoming, open, locked, live, completed |
| `budget` | INTEGER | NOT NULL, DEFAULT 8000 | Virtual currency per entry |
| `roster_size` | INTEGER | NOT NULL, DEFAULT 8 | Players per roster |
| `lock_date` | TIMESTAMP WITH TIME ZONE | NOT NULL | When rosters lock |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | |

#### `best_ball_player_prices`
Stores the computed price for each player in a specific contest.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | |
| `contest_id` | UUID | FK → best_ball_contests, NOT NULL | |
| `player_id` | UUID | FK → players, NOT NULL | |
| `price` | INTEGER | NOT NULL | Price in virtual dollars |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | |
| UNIQUE | | (contest_id, player_id) | One price per player per contest |

#### `best_ball_entries`
A user's single lineup in a contest.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | |
| `contest_id` | UUID | FK → best_ball_contests, NOT NULL | |
| `user_id` | UUID | FK → users, NOT NULL | |
| `budget_remaining` | INTEGER | NOT NULL | Tracks remaining budget (starts at contest.budget) |
| `is_complete` | BOOLEAN | NOT NULL, DEFAULT false | True when roster is full (8 players) |
| `total_score` | INTEGER | NOT NULL, DEFAULT 0 | Cached total score (updated by scoring job) |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | |
| UNIQUE | | (contest_id, user_id) | One lineup per user per contest |

#### `best_ball_roster_players`
Junction table linking entries to their rostered players.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | |
| `entry_id` | UUID | FK → best_ball_entries, NOT NULL | |
| `player_id` | UUID | FK → players, NOT NULL | |
| `purchase_price` | INTEGER | NOT NULL | Price paid (snapshot at time of add) |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW() | |
| UNIQUE | | (entry_id, player_id) | Can't roster same player twice on one entry |

#### `best_ball_config`
Key-value store for tunable pricing/contest parameters.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | |
| `key` | VARCHAR(50) | UNIQUE, NOT NULL | Config key name |
| `value` | VARCHAR(100) | NOT NULL | Config value |
| `description` | TEXT | | Human-readable explanation |

**Default config rows:**

| Key | Value | Description |
|-----|-------|-------------|
| `salary_floor` | `500` | Minimum player price |
| `salary_ceiling` | `1800` | Maximum player price |
| `curve_exponent` | `0.7` | Price distribution shape (lower = more convex) |
| `price_rounding` | `50` | Round prices to nearest N |
| `minutes_baseline` | `30` | MPG denominator for minutes weight |
| `minutes_floor` | `0.15` | Minimum minutes weight |
| `seed_multipliers` | `{"1":1.50,"2":1.35,...,"16":0.65}` | JSON map of seed → multiplier (see Section 2.2) |

### 4.2 Migration File

**`007_add_best_ball.sql`**

Creates all four tables above with proper foreign keys, indexes, and constraints.

**Indexes:**
- `best_ball_player_prices(contest_id)` — lookup prices for a contest
- `best_ball_entries(contest_id, user_id)` — lookup user's entries in a contest
- `best_ball_entries(contest_id, total_score DESC)` — leaderboard query
- `best_ball_roster_players(entry_id)` — lookup roster for an entry

---

## 5. Architecture

### 5.1 Backend (server/src/)

#### New Files

| File | Description |
|------|-------------|
| `models/bestBall.model.js` | All Best Ball database queries |
| `services/bestBall.service.js` | Business logic (pricing, roster ops, scoring) |
| `services/bestBallPricing.service.js` | Player pricing formula and generation |
| `routes/bestBall.routes.js` | REST API endpoints |

#### Model Layer (`models/bestBall.model.js`)

```
Contest operations:
  - createContest(data) → contest
  - getContestById(id) → contest
  - getActiveContest() → contest (most recent non-completed)
  - updateContestStatus(id, status) → contest
  - getAllContests() → contest[]

Player price operations:
  - upsertPlayerPrice(contestId, playerId, price)
  - getPlayerPrices(contestId, { search, minPrice, maxPrice, seed, sortBy }) → priced_player[]
  - getPlayerPrice(contestId, playerId) → price

Entry operations:
  - createEntry(contestId, userId) → entry
  - getEntryById(id) → entry (with roster)
  - getUserEntry(contestId, userId) → entry or null
  - updateEntryScore(entryId, score)
  - deleteEntry(entryId)

Roster operations:
  - addPlayerToRoster(entryId, playerId, price) → roster_player
  - removePlayerFromRoster(entryId, playerId) → removed price
  - getRoster(entryId) → roster_player[] (with player details and stats)
  - getRosterCount(entryId) → number

Leaderboard:
  - getLeaderboard(contestId, { limit, offset }) → entry[] with user info, ordered by total_score DESC
  - getEntryRank(entryId) → rank number

Config:
  - getConfig(key) → value
  - setConfig(key, value)
  - getAllConfig() → config[]
```

#### Service Layer

**`services/bestBallPricing.service.js`**

```
generatePrices(contestId)
  - Reads all config values (seed multipliers, salary bounds, curve exponent, minutes baseline/floor).
  - Queries all players joined with tournament_teams (needs PPG, MPG, seed).
  - Computes minutes_weight, weighted_ppg, and projected_value for each player.
  - Finds min/max projected_value across the player pool for normalization.
  - Applies normalization → curve exponent → salary mapping → rounding for each player.
  - Upserts all prices into best_ball_player_prices.
  - Returns summary: { totalPlayers, priceRange: { min, max, avg }, tierBreakdown: { elite, premium, mid, value, bargain } }

calculatePlayerPrice(ppg, mpg, seed, config, normalization)
  - Pure function implementing the full pricing formula (Section 2.2, Steps 1-5).
  - config: { salary bounds, curve exponent, rounding, seed multipliers, minutes baseline/floor }
  - normalization: { minProjected, maxProjected } (from the full player pool)
  - Exported separately for unit testing.

getProjectedValue(ppg, mpg, seed, config)
  - Pure function for Steps 1-3 (before normalization). Returns the un-normalized projected value.
  - Useful for admin price preview and debugging.
```

**`services/bestBall.service.js`**

```
createEntry(contestId, userId)
  - Validates contest is in 'open' status.
  - Validates user doesn't already have an entry in this contest.
  - Creates entry with budget_remaining = contest.budget.

addPlayer(entryId, playerId)
  - Validates contest is 'open'.
  - Validates player isn't already on roster.
  - Validates roster isn't full (< roster_size).
  - Looks up player price.
  - Validates budget_remaining >= price.
  - Uses transaction:
    1. INSERT into best_ball_roster_players.
    2. UPDATE best_ball_entries SET budget_remaining = budget_remaining - price.
    3. If roster count = roster_size, SET is_complete = true.
  - Returns updated entry.

removePlayer(entryId, playerId)
  - Validates contest is 'open'.
  - Uses transaction:
    1. DELETE from best_ball_roster_players (returning purchase_price).
    2. UPDATE best_ball_entries SET budget_remaining = budget_remaining + purchase_price, is_complete = false.
  - Returns updated entry.

deleteEntry(entryId, userId)
  - Validates the entry belongs to the requesting user.
  - Validates contest is 'open'.
  - Deletes roster players and entry in a transaction.
  - User can re-enter by creating a new entry.

updateScores(contestId)
  - For each complete entry in the contest:
    - SUM player_game_stats.points for all rostered players.
    - UPDATE best_ball_entries.total_score.
  - Called by the existing scoring sync job.

getLeaderboard(contestId, pagination)
  - Returns paginated entries ordered by total_score DESC.
  - Includes username, total score, roster summary.
  - Only includes entries where is_complete = true.

getEntryDetail(entryId)
  - Returns the entry with full roster, each player's:
    - Name, team, seed, PPG, purchase_price
    - Tournament points scored so far
    - is_eliminated status
    - Points by round breakdown
  - Includes the user's overall rank in the contest
```

### 5.2 Frontend (client/src/)

#### New Files

| File | Description |
|------|-------------|
| `pages/BestBall.jsx` | Best Ball landing/hub page |
| `pages/BestBallRoster.jsx` | Roster builder for a single entry |
| `pages/BestBallLeaderboard.jsx` | Global leaderboard |
| `pages/BestBallEntry.jsx` | Entry detail (roster + scores) |
| `pages/admin/BestBallAdmin.jsx` | Admin contest management |
| `components/bestball/PlayerMarket.jsx` | Browsable player list with prices |
| `components/bestball/RosterPanel.jsx` | Current roster sidebar/panel |
| `components/bestball/BudgetBar.jsx` | Visual budget remaining indicator |
| `components/bestball/PriceTag.jsx` | Formatted price display component |
| `services/bestBallApi.js` | API client for Best Ball endpoints |

#### Page Descriptions

**BestBall.jsx** — Hub page (`/best-ball`)
- Shows the active contest info (name, status, lock date countdown).
- If the user has an entry: shows their lineup with roster completion status, budget remaining, and score.
- If the user has no entry: shows an "Enter Contest" button (contest must be `open`).
- Link to global leaderboard.
- If contest is `upcoming`, shows a teaser with lock date.

**BestBallRoster.jsx** — Roster builder (`/best-ball/lineup`)
- Two-panel layout:
  - **Left/Main**: PlayerMarket — searchable, filterable, sortable player list with prices. Each row has an "Add" button.
  - **Right/Sidebar**: RosterPanel — current 8 roster slots (filled or empty), BudgetBar showing remaining funds.
- Filters: by team, by seed range, by price range, by name search.
- Sort: by price, by PPG, by seed, by name.
- Players already on roster are visually indicated and "Add" is disabled.
- Players too expensive for remaining budget have "Add" disabled with tooltip.
- When contest is locked/live/completed, page is read-only (shows roster + scores instead).

**BestBallLeaderboard.jsx** — Global leaderboard (`/best-ball/leaderboard`)
- Paginated table of all complete entries ranked by total score.
- Columns: Rank, User, Total Score, Active Players, Eliminated Players.
- Click an entry to view its full roster detail.
- Highlights the current user's entry.

**BestBallEntry.jsx** — Entry detail (`/best-ball/users/:userId`)
- Full roster table with columns: Player, Team, Seed, Price Paid, Tournament Points, Status (Active/Eliminated).
- Points-by-round breakdown per player.
- Total score and rank.
- Viewable by any authenticated user (you can see other users' lineups from the leaderboard).

**BestBallAdmin.jsx** — Admin page (`/admin/best-ball`)
- Create new contest (name, budget, roster size, lock date).
- Update contest status (upcoming → open → locked → live → completed).
- "Generate Prices" button (runs pricing formula, shows preview).
- Edit pricing config values.
- View contest stats (total entries, complete rosters, avg score).

---

## 6. API Endpoints

All routes mounted under `/api/best-ball` in `app.js`.

### 6.1 Contest Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/best-ball/contests/active` | Yes | Get the current active contest |
| GET | `/api/best-ball/contests/:id` | Yes | Get contest details |

### 6.2 Entry Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/best-ball/contests/:contestId/enter` | Yes | Enter the contest (creates user's lineup) |
| GET | `/api/best-ball/contests/:contestId/my-lineup` | Yes | Get current user's lineup (entry + roster) |
| GET | `/api/best-ball/entries/:entryId` | Yes | Get any entry with full roster (for viewing from leaderboard) |
| DELETE | `/api/best-ball/entries/:entryId` | Yes | Withdraw from contest (open only) |

### 6.3 Roster Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/best-ball/entries/:entryId/players` | Yes | Add player to roster |
| DELETE | `/api/best-ball/entries/:entryId/players/:playerId` | Yes | Remove player from roster |

**POST body**: `{ "playerId": "uuid" }`

### 6.4 Player Market

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/best-ball/contests/:contestId/players` | Yes | List players with prices (paginated, filterable) |

**Query params**: `search`, `seed`, `minPrice`, `maxPrice`, `sortBy` (price, ppg, seed, name), `sortOrder` (asc, desc), `page`, `limit`

### 6.5 Leaderboard

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/best-ball/contests/:contestId/leaderboard` | Yes | Paginated leaderboard |

**Query params**: `page`, `limit`

**Response**: `{ entries: [{ rank, username, totalScore, activePlayers, eliminatedPlayers }], total, page, totalPages }`

### 6.6 Admin Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/best-ball/admin/contests` | Admin | Create a new contest |
| PUT | `/api/best-ball/admin/contests/:id/status` | Admin | Update contest status |
| POST | `/api/best-ball/admin/contests/:id/generate-prices` | Admin | Run pricing formula |
| GET | `/api/best-ball/admin/config` | Admin | Get all config values |
| PUT | `/api/best-ball/admin/config/:key` | Admin | Update a config value |
| GET | `/api/best-ball/admin/contests/:id/stats` | Admin | Contest statistics |

---

## 7. Implementation Phases

### Phase BB-1: Database & Model Layer

**Goal**: Create the schema, migration, and model with full test coverage.

#### BB-1.1 Migration
**File**: `database/migrations/007_add_best_ball.sql`

Create all four tables (`best_ball_contests`, `best_ball_player_prices`, `best_ball_entries`, `best_ball_roster_players`, `best_ball_config`) with constraints and indexes. Seed the default config rows.

**Acceptance Criteria**:
- AC-BB-1.1: Migration runs cleanly on a fresh database.
- AC-BB-1.2: Migration is idempotent (uses `IF NOT EXISTS`).
- AC-BB-1.3: All foreign keys reference correct parent tables.
- AC-BB-1.4: Unique constraints prevent duplicate prices, duplicate roster players, and more than one entry per user per contest.
- AC-BB-1.5: Default config rows are inserted.

#### BB-1.2 Model
**File**: `server/src/models/bestBall.model.js`

Implement all query functions listed in Section 5.1.

**Tests** (`server/tests/bestBall.model.test.js`):
- Creates a contest and retrieves it by ID.
- `getActiveContest()` returns the most recent non-completed contest.
- `upsertPlayerPrice()` inserts a price and updates on conflict.
- `getPlayerPrices()` returns paginated results with filters (search, price range, seed).
- `createEntry()` initializes with correct budget_remaining.
- `createEntry()` fails when user already has an entry in this contest.
- `addPlayerToRoster()` inserts and decrements budget.
- `addPlayerToRoster()` fails on duplicate player in same entry.
- `removePlayerFromRoster()` deletes and increments budget.
- `getRoster()` returns full player details with team info.
- `getLeaderboard()` returns entries ordered by total_score DESC, only complete entries.
- `getConfig()` / `setConfig()` round-trip correctly.

---

### Phase BB-2: Pricing Service

**Goal**: Implement the pricing formula with thorough unit tests.

**File**: `server/src/services/bestBallPricing.service.js`

**Acceptance Criteria**:
- AC-BB-2.1: `minutes_weight` clamps `MPG / minutes_baseline` between `minutes_floor` and 1.0.
- AC-BB-2.2: `weighted_ppg` equals `season_ppg × minutes_weight`.
- AC-BB-2.3: Seed multipliers map correctly (1-seed → 1.50, 7-seed → 1.00, 16-seed → 0.65).
- AC-BB-2.4: `projected_value` equals `weighted_ppg × seed_multiplier`.
- AC-BB-2.5: Normalization maps the best player to 1.0 and worst to 0.0.
- AC-BB-2.6: Curve exponent 0.7 produces convex distribution (50th percentile player > midpoint price).
- AC-BB-2.7: Prices are rounded to nearest `price_rounding` value ($50 default).
- AC-BB-2.8: Prices are clamped between `salary_floor` ($500) and `salary_ceiling` ($1,800).
- AC-BB-2.9: Players with 0 or null PPG get `salary_floor`.
- AC-BB-2.10: `generatePrices(contestId)` computes and upserts prices for all players.
- AC-BB-2.11: `generatePrices()` is idempotent — running twice produces the same prices.
- AC-BB-2.12: `generatePrices()` returns summary with total count, min/max/avg, and tier breakdown.
- AC-BB-2.13: Changing config values (e.g., `curve_exponent`) changes output prices on regeneration.

**Tests** (`server/tests/bestBallPricing.test.js`):

*Unit tests — minutes weight:*
- 32 MPG → 1.0 (capped).
- 20 MPG → 0.667.
- 5 MPG → 0.167.
- 0 or null MPG → 0.15 (floor).

*Unit tests — `getProjectedValue()`:*
- 22 PPG, 34 MPG, 1-seed → 22.0 × 1.0 × 1.50 = 33.0.
- 20 PPG, 33 MPG, 12-seed → 20.0 × 1.0 × 0.88 = 17.6.
- 10 PPG, 18 MPG, 5-seed → 10.0 × 0.6 × 1.10 = 6.6.
- 0 PPG, any MPG, any seed → 0.

*Unit tests — `calculatePlayerPrice()`:*
- Elite 1-seed star (22 PPG, 34 MPG, seed 1) → $1,800 (ceiling).
- 12-seed mid-major star (20 PPG, 33 MPG, seed 12) → ~$1,300.
- 16-seed bench player (1 PPG, 3 MPG, seed 16) → $500 (floor).
- All null/zero stats → $500 (salary floor).

*Unit tests — rounding:*
- Raw $1,273 rounds to $1,250 (nearest $50).
- Raw $1,325 rounds to $1,350.
- Raw $490 clamps to $500 (floor).
- Raw $1,900 clamps to $1,800 (ceiling).

*Unit tests — curve exponent:*
- Exponent 1.0 (linear): normalized 0.5 → price $1,150.
- Exponent 0.7 (convex): normalized 0.5 → price ~$1,295.
- Exponent 0.5 (heavy convex): normalized 0.5 → price ~$1,420.

*Integration test:*
- Seed 10 players with known PPG/MPG across multiple seeds.
- Run `generatePrices()` and verify prices match expected values.
- Run `generatePrices()` again — same prices (idempotency).
- Verify summary tier breakdown is correct.

*Config sensitivity:*
- Change `salary_ceiling` from 1800 to 2000 and regenerate — top prices increase.
- Change `curve_exponent` from 0.7 to 1.0 and regenerate — mid-tier prices decrease.
- Change seed multiplier for 1-seeds from 1.50 to 1.80 and regenerate — 1-seed players get more expensive.

---

### Phase BB-3: Core Service Layer

**Goal**: Implement roster building, validation, and scoring business logic.

**File**: `server/src/services/bestBall.service.js`

**Acceptance Criteria**:
- AC-BB-3.1: `createEntry()` creates an entry only when contest status is `open`.
- AC-BB-3.2: `createEntry()` rejects when user already has an entry in this contest.
- AC-BB-3.3: `addPlayer()` deducts price from budget_remaining atomically.
- AC-BB-3.4: `addPlayer()` rejects if budget_remaining < player price.
- AC-BB-3.5: `addPlayer()` rejects if roster is full (8 players).
- AC-BB-3.6: `addPlayer()` rejects if contest is not `open`.
- AC-BB-3.7: `addPlayer()` rejects if player is already on the roster.
- AC-BB-3.8: `removePlayer()` refunds price to budget_remaining atomically.
- AC-BB-3.9: `removePlayer()` rejects if contest is not `open`.
- AC-BB-3.10: `deleteEntry()` rejects if user doesn't own the entry.
- AC-BB-3.11: `deleteEntry()` rejects if contest is not `open`.
- AC-BB-3.12: `addPlayer()` sets `is_complete = true` when roster reaches `roster_size`.
- AC-BB-3.13: `removePlayer()` sets `is_complete = false`.
- AC-BB-3.14: `updateScores()` correctly sums player_game_stats.points for each entry's roster.
- AC-BB-3.15: `getLeaderboard()` only includes complete entries.
- AC-BB-3.16: `getEntryDetail()` returns per-player tournament points and points-by-round.

**Tests** (`server/tests/bestBall.service.test.js`):
- Happy path: create entry → add 8 players → verify is_complete, budget math.
- Attempt to add player with insufficient budget → error.
- Attempt to add player when roster is full → error.
- Attempt to add duplicate player → error.
- Remove player → budget restored, is_complete set to false.
- Create entry when contest is locked → error.
- Add player when contest is locked → error.
- Create second entry for same user → error (one lineup per user).
- Score calculation: set up roster with player_game_stats, verify updateScores() produces correct totals.
- Leaderboard ordering: create entries for different users with different scores, verify rank order.
- Delete entry removes roster players and entry.
- Delete someone else's entry → error.

---

### Phase BB-4: API Routes

**Goal**: Expose all Best Ball functionality via REST API.

**File**: `server/src/routes/bestBall.routes.js`

Mount at `/api/best-ball` in `app.js`.

**Acceptance Criteria**:
- AC-BB-4.1: All endpoints require authentication (401 without token).
- AC-BB-4.2: Admin endpoints require admin role (403 for non-admins).
- AC-BB-4.3: Users can only modify their own entries (403 otherwise).
- AC-BB-4.4: `POST /entries/:entryId/players` validates request body has `playerId`.
- AC-BB-4.5: Player market endpoint supports all query params (search, filters, sort, pagination).
- AC-BB-4.6: Leaderboard endpoint returns paginated results with total count.
- AC-BB-4.7: Error responses use consistent format: `{ error: "message" }`.
- AC-BB-4.8: Contest status transitions follow valid order (upcoming → open → locked → live → completed).

**Tests** (`server/tests/bestBall.routes.test.js`):
- Unauthenticated requests → 401.
- Non-admin creating contest → 403.
- Admin creates contest → 201.
- User enters contest → 201, entry has correct budget.
- User enters contest a second time → 409 conflict (already entered).
- User enters contest when contest not open → 400.
- User adds player → 200, budget decremented.
- User adds player over budget → 400.
- User removes player → 200, budget restored.
- Get player market with search filter → filtered results.
- Get player market with price range filter → filtered results.
- Get player market sorted by price → correct order.
- Get leaderboard → ordered by score DESC.
- Get entry detail → full roster with scores.
- User deletes own entry → 200.
- User deletes another's entry → 403.
- Admin generates prices → 200, prices populated.
- Admin updates contest status → 200, valid transitions only.

---

### Phase BB-5: Frontend — Player Market & Roster Builder

**Goal**: Build the core roster-building experience.

**Acceptance Criteria**:
- AC-BB-5.1: PlayerMarket displays all players with name, team, seed, PPG, and price.
- AC-BB-5.2: PlayerMarket supports search by player name.
- AC-BB-5.3: PlayerMarket supports filtering by seed, price range.
- AC-BB-5.4: PlayerMarket supports sorting by price, PPG, seed, name.
- AC-BB-5.5: "Add" button is disabled for players already on roster.
- AC-BB-5.6: "Add" button is disabled for players whose price exceeds remaining budget (with tooltip showing "Over budget").
- AC-BB-5.7: RosterPanel shows 8 slots, filled slots show player name/team/price, empty slots show placeholder.
- AC-BB-5.8: BudgetBar shows remaining budget as both a number and a visual progress bar.
- AC-BB-5.9: Clicking "Remove" on a rostered player removes them and refunds budget immediately (optimistic UI).
- AC-BB-5.10: Adding a player updates budget and roster panel immediately (optimistic UI with rollback on error).
- AC-BB-5.11: When contest is locked/live/completed, all add/remove controls are hidden and the page is view-only.

**Tests** (`client/src/pages/__tests__/BestBallRoster.test.jsx`):
- Renders player market with prices.
- Search filters player list.
- "Add" button is disabled when budget insufficient.
- "Add" button is disabled for already-rostered players.
- Adding player updates roster panel and budget.
- Removing player updates roster panel and budget.
- Roster panel shows correct number of filled/empty slots.
- Read-only mode when contest is locked.

---

### Phase BB-6: Frontend — Leaderboard & Entry Detail

**Goal**: Build the leaderboard and entry detail pages.

**Acceptance Criteria**:
- AC-BB-6.1: Leaderboard shows all complete entries ranked by total score.
- AC-BB-6.2: Current user's entries are visually highlighted.
- AC-BB-6.3: Clicking an entry navigates to entry detail page.
- AC-BB-6.4: Leaderboard is paginated (25 entries per page).
- AC-BB-6.5: Entry detail shows full roster with player stats, prices, and elimination status.
- AC-BB-6.6: Entry detail shows points-by-round breakdown per player.
- AC-BB-6.7: Entry detail shows total score and overall rank.

**Tests** (`client/src/pages/__tests__/BestBallLeaderboard.test.jsx`):
- Renders leaderboard with ranked entries.
- Current user's entry is highlighted.
- Pagination controls work.
- Entry detail shows roster with scores.
- Empty leaderboard shows "No entries yet" message.

---

### Phase BB-7: Frontend — Hub Page & Navigation

**Goal**: Best Ball hub page and integration into app navigation.

**Acceptance Criteria**:
- AC-BB-7.1: "Best Ball" link appears in the main app navigation (alongside Leagues/Dashboard).
- AC-BB-7.2: Hub page shows active contest info with lock date countdown.
- AC-BB-7.3: If user has a lineup: shows their roster summary, budget remaining, completion status, and score.
- AC-BB-7.4: If user has no lineup: shows "Enter Contest" button that creates their entry and navigates to roster builder.
- AC-BB-7.5: "Enter Contest" is hidden when contest is not `open`.
- AC-BB-7.6: When no active contest exists, shows "No contest available" message.
- AC-BB-7.7: Dashboard page includes a Best Ball section/card linking to the hub.

**Tests** (`client/src/pages/__tests__/BestBall.test.jsx`):
- Hub page renders contest info.
- Hub page shows user's lineup summary when entered.
- "Enter Contest" button shown when user has no lineup.
- "Enter Contest" hidden when contest is not open.
- No contest state renders correctly.

---

### Phase BB-8: Admin UI & Scoring Integration

**Goal**: Admin can manage contests and pricing. Scores update automatically.

**Acceptance Criteria**:
- AC-BB-8.1: Admin can create a new contest with all parameters.
- AC-BB-8.2: Admin can advance contest status through the lifecycle.
- AC-BB-8.3: Admin can generate prices and preview them before committing.
- AC-BB-8.4: Admin can edit pricing config values.
- AC-BB-8.5: Admin can view contest stats (total entries, avg score, etc.).
- AC-BB-8.6: Best Ball scores are updated by the existing ESPN sync job (or a parallel scheduled task).
- AC-BB-8.7: Score updates are idempotent — re-running produces the same totals.

**Tests** (`client/src/pages/__tests__/BestBallAdmin.test.jsx`):
- Admin creates contest form validation.
- Admin generates prices shows summary.
- Admin status transitions only allow valid next status.
- Non-admin cannot access admin page.

**Tests** (`server/tests/bestBallScoring.test.js`):
- `updateScores()` sums player_game_stats correctly for rostered players.
- Score update is idempotent.
- Only complete entries get scores updated.
- Entries with eliminated players still get scores from games played before elimination.

---

## 8. Routes Summary

### Frontend Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/best-ball` | BestBall.jsx | Hub page |
| `/best-ball/lineup` | BestBallRoster.jsx | Roster builder / viewer (current user's lineup) |
| `/best-ball/users/:userId` | BestBallEntry.jsx | View any user's lineup with scores |
| `/best-ball/leaderboard` | BestBallLeaderboard.jsx | Global leaderboard |
| `/admin/best-ball` | BestBallAdmin.jsx | Admin contest management |

### API Routes

See Section 6 for complete API endpoint listing.

---

## 9. Phase Summary & Checklist

| Phase | Feature | Priority | Estimated Tests |
|-------|---------|----------|-----------------|
| BB-1 | Database schema + Model layer | High | ~12 |
| BB-2 | Pricing service | High | ~10 |
| BB-3 | Core service (roster, scoring) | High | ~15 |
| BB-4 | API routes | High | ~18 |
| BB-5 | Frontend — Market + Roster Builder | High | ~8 |
| BB-6 | Frontend — Leaderboard + Entry Detail | Medium | ~5 |
| BB-7 | Frontend — Hub + Navigation | Medium | ~5 |
| BB-8 | Admin UI + Scoring Integration | Medium | ~8 |

**Recommended build order**: BB-1 → BB-2 → BB-3 → BB-4 → BB-5 → BB-7 → BB-6 → BB-8

Build the data layer first (BB-1, BB-2), then business logic (BB-3), then API (BB-4). Frontend starts with the core experience — roster building (BB-5) — then the hub/navigation (BB-7) so users can reach it, then leaderboard/detail (BB-6), and finally admin tooling (BB-8).

---

## 10. Development Methodology

Follow the same TDD approach used across the project:

1. **Write failing tests first** for each acceptance criterion.
2. **Implement minimum code** to pass.
3. **Refactor** while green.

For the pricing formula specifically, start with pure-function unit tests for `calculatePlayerPrice()` before wiring it to the database. This allows rapid iteration on the formula with instant feedback.

---

## 11. Open Questions & Future Considerations

### Pricing Formula Tuning
The formula and constants in Section 2 are a starting point. After importing real tournament data, generate prices and review the distribution. Key questions:
- Is the price spread wide enough? (Should a star cost 25× a bench player, or 10×?)
- Are there enough viable "value picks" in the $500–$700 range?
- Do all 8 roster slots feel meaningfully different in price tier?

The admin config table makes tuning easy — adjust constants and regenerate.

### Future Enhancements (Out of Scope)
- **Multiple entries**: Allow users to create 2-3 lineups per contest for more experimentation.
- **Multi-stat scoring**: Expand scoring to include rebounds, assists, steals, blocks (Year 2+).
- **Entry fees / prizes**: Real or virtual currency entry fees with prize pools.
- **Contest types**: Head-to-head, 50/50, tournaments with different payouts.
- **Roster locks by game**: Lock individual player slots at their game's tip-off instead of all at once.
- **Player ownership %**: Show what percentage of entries roster each player.
- **Lineup optimizer**: Suggest optimal rosters within budget (could be a premium feature).
- **Social features**: Share lineup, challenge a friend, lineup comparison view.
- **Historical contests**: Archive past contests with final standings.
