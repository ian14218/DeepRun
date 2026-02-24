const express = require('express');
const { authenticateToken } = require('../middleware/auth.middleware');
const draftService = require('../services/draft.service');

// mergeParams: true gives us access to :id from the parent router (league id)
const router = express.Router({ mergeParams: true });

router.use(authenticateToken);

// POST /api/leagues/:id/draft/start
router.post('/start', async (req, res) => {
  try {
    const result = await draftService.startDraft(req.params.id, req.user.id);

    // Notify connected clients via Socket.IO if available
    const io = req.app.io;
    if (io) {
      io.to(`league:${req.params.id}`).emit('draft:started', result);
    }

    // Auto-pick if the first position belongs to a bot
    draftService.autoPick(req.params.id, io).catch(() => {});

    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/leagues/:id/draft/pick
router.post('/pick', async (req, res) => {
  const { player_id } = req.body;
  if (!player_id) return res.status(400).json({ error: 'player_id is required' });

  try {
    const pick = await draftService.makePick(req.params.id, req.user.id, player_id);

    // Emit real-time events
    const io = req.app.io;
    if (io) {
      io.to(`league:${req.params.id}`).emit('draft:pick', {
        pick_number:    pick.pick_number,
        player_id:      pick.player_id,
        member_id:      pick.member_id,
        draft_position: pick.draft_position,
      });

      if (pick.draft_status === 'completed') {
        io.to(`league:${req.params.id}`).emit('draft:complete', {});
      } else if (pick.next_turn) {
        io.to(`league:${req.params.id}`).emit('draft:turn', pick.next_turn);
      }
    }

    // Auto-pick consecutive bot turns after the human's pick
    if (pick.draft_status !== 'completed') {
      draftService.autoPick(req.params.id, req.app.io).catch(() => {});
    }

    return res.status(200).json(pick);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/leagues/:id/draft
router.get('/', async (req, res) => {
  try {
    const state = await draftService.getDraftState(req.params.id);
    return res.status(200).json(state);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
