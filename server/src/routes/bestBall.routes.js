const express = require('express');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');
const bestBallService = require('../services/bestBall.service');
const bestBallModel = require('../models/bestBall.model');
const pricingService = require('../services/bestBallPricing.service');

const router = express.Router();

router.use(authenticateToken);

// ─── Contest endpoints ──────────────────────────────────────────────────────

router.get('/contests/active', async (req, res) => {
  try {
    const contest = await bestBallService.ensureActiveContest();
    res.json(contest);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/contests/:contestId', async (req, res) => {
  try {
    const contest = await bestBallModel.getContestById(req.params.contestId);
    if (!contest) return res.status(404).json({ error: 'Contest not found' });
    res.json(contest);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Entry endpoints ────────────────────────────────────────────────────────

router.post('/contests/:contestId/enter', async (req, res) => {
  try {
    const entry = await bestBallService.createEntry(req.params.contestId, req.user.id);
    res.status(201).json(entry);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/contests/:contestId/my-lineup', async (req, res) => {
  try {
    const entry = await bestBallModel.getUserEntry(req.params.contestId, req.user.id);
    if (!entry) return res.json(null);

    const roster = await bestBallModel.getRoster(entry.id);
    res.json({ ...entry, roster });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/entries/:entryId', async (req, res) => {
  try {
    const detail = await bestBallService.getEntryDetail(req.params.entryId);
    res.json(detail);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/entries/:entryId', async (req, res) => {
  try {
    await bestBallService.deleteEntry(req.params.entryId, req.user.id);
    res.json({ message: 'Entry deleted' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Roster endpoints ───────────────────────────────────────────────────────

router.post('/entries/:entryId/players', async (req, res) => {
  try {
    const { playerId } = req.body;
    if (!playerId) return res.status(400).json({ error: 'playerId is required' });

    const updated = await bestBallService.addPlayer(req.params.entryId, playerId);
    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/entries/:entryId/players/:playerId', async (req, res) => {
  try {
    const updated = await bestBallService.removePlayer(req.params.entryId, req.params.playerId);
    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Market / Leaderboard ───────────────────────────────────────────────────

router.get('/contests/:contestId/players', async (req, res) => {
  try {
    const { search, minPrice, maxPrice, seed, sortBy, page, limit } = req.query;
    const result = await bestBallModel.getPlayerPrices(req.params.contestId, {
      search,
      minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
      seed: seed ? parseInt(seed, 10) : undefined,
      sortBy,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/contests/:contestId/leaderboard', async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await bestBallService.getLeaderboard(req.params.contestId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Admin endpoints ────────────────────────────────────────────────────────

router.post('/admin/contests', requireAdmin, async (req, res) => {
  try {
    const { name, budget, roster_size, lock_date } = req.body;
    if (!name || !lock_date) {
      return res.status(400).json({ error: 'name and lock_date are required' });
    }
    const contest = await bestBallModel.createContest({
      name,
      budget: budget || 8000,
      roster_size: roster_size || 8,
      lock_date,
    });
    res.status(201).json(contest);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/admin/contests/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['upcoming', 'open', 'locked', 'live', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    const contest = await bestBallModel.updateContestStatus(req.params.id, status);
    if (!contest) return res.status(404).json({ error: 'Contest not found' });
    res.json(contest);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/admin/contests/:id/generate-prices', requireAdmin, async (req, res) => {
  try {
    const summary = await pricingService.generatePrices(req.params.id);
    res.json(summary);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/admin/config', requireAdmin, async (req, res) => {
  try {
    const config = await bestBallModel.getAllConfig();
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/admin/config/:key', requireAdmin, async (req, res) => {
  try {
    const { value } = req.body;
    if (value == null) return res.status(400).json({ error: 'value is required' });
    const config = await bestBallModel.setConfig(req.params.key, String(value));
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
