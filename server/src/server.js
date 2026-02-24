const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { initDraftSocket } = require('./socket/draftSocket');

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
});

// Make io available to Express routes via req.app.io
app.io = io;
initDraftSocket(io);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = server;
