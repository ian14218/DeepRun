const express = require('express');
const playerService = require('../services/player.service');
const tournamentTeamModel = require('../models/tournamentTeam.model');
const playerModel = require('../models/player.model');
const pool = require('../db');

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

// GET /api/players/first-four-partners/:teamId — returns players on the partner First Four team
router.get('/players/first-four-partners/:teamId', async (req, res) => {
  try {
    const team = await tournamentTeamModel.findById(req.params.teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (!team.is_first_four || !team.first_four_partner_id) {
      return res.status(400).json({ error: 'Team is not a First Four team' });
    }
    const partnerTeam = await tournamentTeamModel.findById(team.first_four_partner_id);
    let players = await playerModel.findByTeamId(team.first_four_partner_id);

    // If contestId is provided, attach Best Ball prices
    const { contestId } = req.query;
    if (contestId) {
      const playerIds = players.map((p) => p.id);
      const priceResult = await pool.query(
        `SELECT player_id, price FROM best_ball_player_prices
         WHERE contest_id = $1 AND player_id = ANY($2)`,
        [contestId, playerIds]
      );
      const priceMap = {};
      for (const row of priceResult.rows) {
        priceMap[row.player_id] = row.price;
      }
      players = players.map((p) => ({ ...p, price: priceMap[p.id] ?? null }));
    }

    return res.json({ players, partnerTeam: { name: partnerTeam.name, external_id: partnerTeam.external_id, seed: partnerTeam.seed, region: partnerTeam.region } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
