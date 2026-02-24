const express = require('express');
const { authenticateToken } = require('../middleware/auth.middleware');
const scoringService = require('../services/scoring.service');

// mergeParams: true gives access to :id from the parent router (league id)
const router = express.Router({ mergeParams: true });

router.use(authenticateToken);

// GET /api/leagues/:id/standings
router.get('/standings', async (req, res) => {
  try {
    const standings = await scoringService.getStandings(req.params.id);
    return res.status(200).json(standings);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/leagues/:id/teams/:teamId
router.get('/teams/:teamId', async (req, res) => {
  try {
    const roster = await scoringService.getTeamRoster(req.params.id, req.params.teamId);
    return res.status(200).json(roster);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/leagues/:id/scoreboard — placeholder (Phase 9 adds live data)
router.get('/scoreboard', async (req, res) => {
  return res.status(200).json([]);
});

module.exports = router;
