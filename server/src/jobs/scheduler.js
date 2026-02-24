const { runSyncJob } = require('./statSync.job');

// Default: every 5 minutes (300 000 ms). Override with SYNC_INTERVAL_MS env var.
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS || '300000', 10);

let intervalId = null;

/**
 * Start the stat-sync scheduler.
 *
 * Only runs when SYNC_ENABLED=true is set in the environment, so the job is
 * dormant in development and test environments unless explicitly opted in.
 */
function start() {
  if (process.env.SYNC_ENABLED !== 'true') {
    console.log('[scheduler] SYNC_ENABLED is not "true" — stat sync is disabled.');
    return;
  }

  console.log(`[scheduler] Stat sync starting — interval: ${SYNC_INTERVAL_MS}ms`);

  // Run once immediately, then on the interval
  runSyncJob().catch((err) => console.error('[scheduler] Initial sync error:', err));

  intervalId = setInterval(() => {
    runSyncJob().catch((err) => console.error('[scheduler] Sync error:', err));
  }, SYNC_INTERVAL_MS);
}

/**
 * Stop the scheduler (used in tests and graceful shutdown handlers).
 */
function stop() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[scheduler] Stat sync stopped.');
  }
}

module.exports = { start, stop };
