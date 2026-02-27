const express = require('express');
const { authenticateToken } = require('../middleware/auth.middleware');
const scoringService = require('../services/scoring.service');
const scoreboardService = require('../services/scoreboard.service');

// mergeParams: true gives access to :id from the parent router (league id)
const router = express.Router({ mergeParams: true });

router.use(authenticateToken);

// GET /api/leagues/:id/standings
router.get('/standings', async (req, res) => {
  try {
    const standings = await scoringService.getStandings(req.params.id);
    return res.status(200).json({
      standings,
      tournament_completed: standings.tournament_completed || false,
    });
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

// GET /api/leagues/:id/scoreboard
router.get('/scoreboard', async (req, res) => {
  try {
    const scoreboard = await scoreboardService.getScoreboard(req.params.id);
    return res.status(200).json(scoreboard);
  } catch (err) {
    // Graceful degradation if ESPN is down
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.response?.status >= 500) {
      return res.status(503).json({ error: 'Scoreboard data temporarily unavailable' });
    }
    return res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
