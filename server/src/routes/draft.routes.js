const express = require('express');
const { authenticateToken } = require('../middleware/auth.middleware');
const draftService = require('../services/draft.service');
const leagueModel = require('../models/league.model');
const draftMessageModel = require('../models/draftMessage.model');

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
    await draftService.autoPick(req.params.id, io);

    // Start draft timer for the first human turn
    // ?? 90 so null/undefined defaults to 90, but 0 stays 0 (disabled)
    draftService.startDraftTimer(req.params.id, result.draft_timer_seconds ?? 90, io);

    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/leagues/:id/draft/pick
router.post('/pick', async (req, res) => {
  const { player_id, paired_player_id } = req.body;
  if (!player_id) return res.status(400).json({ error: 'player_id is required' });

  try {
    const pick = await draftService.makePick(req.params.id, req.user.id, player_id, paired_player_id || null);

    // Emit real-time events
    const io = req.app.io;
    if (io) {
      io.to(`league:${req.params.id}`).emit('draft:pick', {
        pick_number:    pick.pick_number,
        player_id:      pick.player_id,
        paired_player_id: pick.paired_player_id,
        member_id:      pick.member_id,
        draft_position: pick.draft_position,
      });

      if (pick.draft_status === 'completed') {
        io.to(`league:${req.params.id}`).emit('draft:complete', {});
        draftService.clearDraftTimer(req.params.id);
      } else if (pick.next_turn) {
        io.to(`league:${req.params.id}`).emit('draft:turn', pick.next_turn);
      }
    }

    // Auto-pick consecutive bot turns after the human's pick
    if (pick.draft_status !== 'completed') {
      await draftService.autoPick(req.params.id, req.app.io);
      // Restart timer for the next human turn (use league setting, not hardcoded)
      // ?? 90 so null/undefined defaults to 90, but 0 stays 0 (disabled)
      const league = await leagueModel.findById(req.params.id);
      const timerSeconds = league?.draft_timer_seconds ?? 90;
      draftService.startDraftTimer(req.params.id, timerSeconds, req.app.io);
    }

    return res.status(200).json(pick);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/leagues/:id/draft/timer-control
router.post('/timer-control', async (req, res) => {
  const { action, seconds } = req.body;
  const validActions = ['pause', 'resume', 'change', 'disable', 'enable'];
  if (!action || !validActions.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` });
  }

  try {
    const league = await leagueModel.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the commissioner can control the draft timer' });
    }
    if (league.draft_status !== 'in_progress') {
      return res.status(400).json({ error: 'Draft is not in progress' });
    }

    const io = req.app.io;

    switch (action) {
      case 'pause':
        draftService.pauseDraftTimer(req.params.id, io);
        break;
      case 'resume':
        draftService.resumeDraftTimer(req.params.id, io);
        break;
      case 'change': {
        const newSeconds = parseInt(seconds, 10);
        if (!newSeconds || newSeconds < 1) {
          return res.status(400).json({ error: 'seconds must be a positive number' });
        }
        await leagueModel.update(req.params.id, { draft_timer_seconds: newSeconds });
        draftService.startDraftTimer(req.params.id, newSeconds, io);
        break;
      }
      case 'disable':
        await leagueModel.update(req.params.id, { draft_timer_seconds: 0 });
        draftService.clearDraftTimer(req.params.id);
        if (io) io.to(`league:${req.params.id}`).emit('draft:timer-disabled', {});
        break;
      case 'enable': {
        const enableSeconds = parseInt(seconds, 10) || 90;
        await leagueModel.update(req.params.id, { draft_timer_seconds: enableSeconds });
        draftService.startDraftTimer(req.params.id, enableSeconds, io);
        break;
      }
    }

    return res.status(200).json({ ok: true, timer: draftService.getDraftTimerState(req.params.id) });
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

// GET /api/leagues/:id/draft/messages
router.get('/messages', async (req, res) => {
  try {
    const messages = await draftMessageModel.findByLeague(req.params.id);
    return res.status(200).json(messages);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
