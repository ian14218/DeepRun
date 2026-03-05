const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const pool = require('./db');
const scheduler = require('./jobs/scheduler');
const { initDraftSocket } = require('./socket/draftSocket');

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' },
});

// Make io available to Express routes via req.app.io
app.io = io;
initDraftSocket(io);

// Graceful shutdown handler
function shutdown(signal) {
  console.log(`[server] ${signal} received — shutting down gracefully...`);
  scheduler.stop();
  server.close(() => {
    pool.end().then(() => {
      console.log('[server] Shutdown complete.');
      process.exit(0);
    });
  });
  // Force exit after 10 seconds if graceful shutdown stalls
  setTimeout(() => {
    console.error('[server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});

(async () => {
  // Run migrations on startup when MIGRATE_ON_START is enabled
  if (process.env.MIGRATE_ON_START === 'true') {
    try {
      const { runMigrations } = require('./db/migrate');
      await runMigrations();
    } catch (err) {
      console.error('[startup] Migration failed:', err.message);
      process.exit(1);
    }
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Start the ESPN stat sync scheduler
  scheduler.start();
})();

module.exports = server;
