/**
 * Socket.IO handlers for the draft room.
 *
 * Clients emit 'join-draft' with { leagueId } to subscribe to a league's
 * draft events. The server then emits:
 *   - draft:started  — when the commissioner starts the draft
 *   - draft:pick     — when any pick is made
 *   - draft:turn     — whose turn is next
 *   - draft:complete — when all picks have been made
 *   - draft:timer    — countdown info
 *   - draft:message  — chat messages
 */
const draftMessageModel = require('../models/draftMessage.model');
const { stripHtml } = require('../utils/sanitize');

function initDraftSocket(io) {
  io.on('connection', (socket) => {
    socket.on('join-draft', ({ leagueId }) => {
      if (leagueId) socket.join(`league:${leagueId}`);
    });

    socket.on('leave-draft', ({ leagueId }) => {
      if (leagueId) socket.leave(`league:${leagueId}`);
    });

    socket.on('draft:message', async ({ leagueId, userId, username, message }) => {
      if (!leagueId || !userId || !message) return;

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
