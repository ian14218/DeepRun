const express = require('express');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');
const adminService = require('../services/admin.service');
const simulationService = require('../services/simulation.service');
const userModel = require('../models/user.model');

const router = express.Router();

// All admin routes require authentication + admin
router.use(authenticateToken);
router.use(requireAdmin);

// Dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await adminService.getStats();
    res.json(stats);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Users
router.get('/users', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const result = await userModel.findAll(search, parseInt(page), parseInt(limit));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    await userModel.deleteUser(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/users/:id/admin', async (req, res) => {
  try {
    const { is_admin } = req.body;
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own admin status' });
    }
    const user = await userModel.setAdmin(req.params.id, is_admin);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Leagues
router.get('/leagues', async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 20 } = req.query;
    const result = await adminService.getAllLeagues(search, status, parseInt(page), parseInt(limit));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/leagues/:id', async (req, res) => {
  try {
    const league = await adminService.getLeagueDetail(req.params.id);
    res.json(league);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/leagues/:id', async (req, res) => {
  try {
    await adminService.deleteLeague(req.params.id);
    res.json({ message: 'League deleted' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/leagues/:id/reset-draft', async (req, res) => {
  try {
    await adminService.resetDraft(req.params.id);
    res.json({ message: 'Draft reset to pre_draft' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Tournament
router.get('/tournament/teams', async (req, res) => {
  try {
    const teams = await adminService.getTournamentTeams();
    res.json(teams);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/tournament/players', async (req, res) => {
  try {
    const { search = '', team = '', page = 1, limit = 20 } = req.query;
    const result = await adminService.getTournamentPlayers(search, team, parseInt(page), parseInt(limit));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/tournament/simulate-round', async (req, res) => {
  try {
    const result = await simulationService.simulateRound();
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
