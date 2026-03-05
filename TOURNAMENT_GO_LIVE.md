# Tournament Go-Live Checklist

## When: Selection Sunday (March 15, 2026)

The NCAA bracket is announced on Selection Sunday. Once it's out, follow these steps to seed the tournament data.

## Prerequisites

- Production DATABASE_URL set in `server/.env` (or connect directly to Railway Postgres)
- Node.js installed locally
- Run from the project root directory

## Step 1: Confirm Round of 64 Dates

Open `database/seed_tournament.js` and verify the R64 dates for 2026:

```js
const R64_DATES = {
  2026: ['20260319', '20260320'], // update if the NCAA announces different dates
};
```

The Round of 64 is typically the Thursday and Friday after Selection Sunday. Update if needed and commit.

## Step 2: Seed Tournament Teams + Rosters

```bash
# Dry run first to verify ESPN data looks correct
node database/seed_tournament.js --year 2026 --dry-run

# If everything looks good, seed for real
node database/seed_tournament.js --year 2026
```

This imports all 68 tournament teams, their rosters, and season stats from ESPN.

## Step 3: Seed First Four Pairs

```bash
# Dry run to verify detected pairs
node database/seed_first_four.js --dry-run

# Seed First Four pairs
node database/seed_first_four.js
```

This auto-detects First Four teams (teams sharing the same seed + region) and links them as pairs.

## Step 4: Verify in the Admin Dashboard

1. Log into the app as an admin
2. Go to the Admin panel > Tournament tab
3. Confirm all 68 teams are listed with correct seeds and regions
4. Check the First Four tab — 4 pairs should be shown (8 teams total)

## Step 5: Enable ESPN Stat Sync (when games start)

In Railway environment variables, set:

```
SYNC_ENABLED=true
```

This starts the ESPN stat sync job (every 5 minutes) to pull live scores once games begin. Do NOT enable this before games start — there won't be any data to sync.

## Step 6: Update CORS Origin

Make sure `CORS_ORIGIN` in Railway env vars matches your production domain.

## Best Ball

The Best Ball contest auto-provisions when tournament data exists. No manual steps needed. It will transition from `upcoming` to `open` automatically.

## Troubleshooting

- **"No tournament dates configured"** — Update `R64_DATES` in `seed_tournament.js`
- **Missing teams/players** — ESPN may not have full data until closer to tip-off. Re-run the seed script later.
- **First Four pairs not detected** — Ensure Step 2 completed successfully. Pairs require two teams with the same seed + region.
- **Stat sync not working** — Check Railway logs. Verify `SYNC_ENABLED=true` is set and the server has restarted.
