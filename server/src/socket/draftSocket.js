/**
 * Socket.IO handlers for the draft room.
 *
 * Clients must provide a valid JWT in socket.handshake.auth.token to connect.
 * The server verifies the token and attaches user info to socket.user.
 *
 * Events:
 *   - draft:started  — when the commissioner starts the draft
 *   - draft:pick     — when any pick is made
 *   - draft:turn     — whose turn is next
 *   - draft:complete — when all picks have been made
 *   - draft:timer    — countdown info
 *   - draft:message  — chat messages
 */
const jwt = require('jsonwebtoken');
const draftMessageModel = require('../models/draftMessage.model');
const { stripHtml } = require('../utils/sanitize');

function initDraftSocket(io) {
  // JWT authentication middleware — reject unauthenticated connections
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: no token provided'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = {
        id: decoded.id,
        username: decoded.username,
        email: decoded.email,
        is_admin: decoded.is_admin || false,
      };
      next();
    } catch {
      next(new Error('Authentication error: invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join-draft', ({ leagueId }) => {
      if (leagueId) socket.join(`league:${leagueId}`);
    });

    socket.on('leave-draft', ({ leagueId }) => {
      if (leagueId) socket.leave(`league:${leagueId}`);
    });

    socket.on('draft:message', async ({ leagueId, message }) => {
      if (!leagueId || !message) return;

      // Use the verified identity from the JWT, not client-supplied data
      const userId = socket.user.id;
      const username = socket.user.username;

      const sanitized = stripHtml(message).slice(0, 500);
      if (!sanitized) return;

      try {
        const saved = await draftMessageModel.create(leagueId, userId, sanitized);
        io.to(`league:${leagueId}`).emit('draft:message', {
          id: saved.id,
          user_id: userId,
          username,
          message: sanitized,
          created_at: saved.created_at,
        });
      } catch {
        // Silently fail — chat is non-critical
      }
    });
  });
}

module.exports = { initDraftSocket };
