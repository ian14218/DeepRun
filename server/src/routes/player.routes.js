const express = require('express');
const playerService = require('../services/player.service');

const router = express.Router();

// GET /api/players — list/search players
router.get('/players', async (req, res) => {
  const { search, team, page, limit } = req.query;
  try {
    const players = await playerService.getPlayers({
      search,
      teamName: team,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 100,
    });
    return res.json(players);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/tournaments/teams — list all tournament teams
router.get('/tournaments/teams', async (req, res) => {
  try {
    const teams = await playerService.getTournamentTeams();
    return res.json(teams);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
