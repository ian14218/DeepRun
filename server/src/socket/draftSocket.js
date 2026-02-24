/**
 * Socket.IO handlers for the draft room.
 *
 * Clients emit 'join-draft' with { leagueId } to subscribe to a league's
 * draft events. The server then emits:
 *   - draft:started  — when the commissioner starts the draft
 *   - draft:pick     — when any pick is made
 *   - draft:turn     — whose turn is next
 *   - draft:complete — when all picks have been made
 */
function initDraftSocket(io) {
  io.on('connection', (socket) => {
    socket.on('join-draft', ({ leagueId }) => {
      if (leagueId) socket.join(`league:${leagueId}`);
    });

    socket.on('leave-draft', ({ leagueId }) => {
      if (leagueId) socket.leave(`league:${leagueId}`);
    });
  });
}

module.exports = { initDraftSocket };
