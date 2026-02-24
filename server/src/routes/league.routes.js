const express = require('express');
const { authenticateToken } = require('../middleware/auth.middleware');
const leagueService = require('../services/league.service');

const router = express.Router();

// All league routes require authentication
router.use(authenticateToken);

// POST /api/leagues — create a league
router.post('/', async (req, res) => {
  const { name, team_count, roster_size = 10 } = req.body;

  if (!name || team_count === undefined) {
    return res.status(400).json({ error: 'name and team_count are required' });
  }

  try {
    const league = await leagueService.createLeague(
      name,
      Number(team_count),
      Number(roster_size),
      req.user.id
    );
    return res.status(201).json(league);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/leagues/join — join via invite code
// NOTE: this must come before /:id to avoid route collision
router.post('/join', async (req, res) => {
  const { invite_code } = req.body;

  if (!invite_code) {
    return res.status(400).json({ error: 'invite_code is required' });
  }

  try {
    const membership = await leagueService.joinLeague(invite_code, req.user.id);
    return res.status(200).json(membership);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/leagues — list user's leagues
router.get('/', async (req, res) => {
  try {
    const leagues = await leagueService.getLeaguesByUser(req.user.id);
    return res.status(200).json(leagues);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/leagues/:id — get league details with members
router.get('/:id', async (req, res) => {
  try {
    const league = await leagueService.getLeagueById(req.params.id);
    return res.status(200).json(league);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/leagues/:id/fill-bots — fill remaining slots with CPU bots (commissioner only)
router.post('/:id/fill-bots', async (req, res) => {
  try {
    const members = await leagueService.fillWithBots(req.params.id, req.user.id);
    return res.status(200).json({ members });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// PUT /api/leagues/:id — update league settings (commissioner only, pre-draft only)
router.put('/:id', async (req, res) => {
  try {
    const league = await leagueService.updateLeague(req.params.id, req.body, req.user.id);
    return res.status(200).json(league);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// DELETE /api/leagues/:id/members/me — leave a league (non-commissioner, pre_draft)
router.delete('/:id/members/me', async (req, res) => {
  try {
    await leagueService.leaveLeague(req.params.id, req.user.id);
    return res.status(200).json({ message: 'Left league' });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// DELETE /api/leagues/:id/members/:userId — remove a member (commissioner only, pre_draft)
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    await leagueService.removeMemberByCommissioner(req.params.id, req.params.userId, req.user.id);
    return res.status(200).json({ message: 'Member removed' });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
