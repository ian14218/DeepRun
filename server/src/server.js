const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { initDraftSocket } = require('./socket/draftSocket');

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' },
});

// Make io available to Express routes via req.app.io
app.io = io;
initDraftSocket(io);

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
})();

module.exports = server;
