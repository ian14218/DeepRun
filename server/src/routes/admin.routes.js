const express = require('express');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');
const adminService = require('../services/admin.service');
const simulationService = require('../services/simulation.service');
const userModel = require('../models/user.model');
const tournamentTeamModel = require('../models/tournamentTeam.model');
const { runSyncForDate } = require('../jobs/statSync.job');
const bestBallModel = require('../models/bestBall.model');
const bestBallPricing = require('../services/bestBallPricing.service');

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

// Simulation endpoints — gated by SIMULATION_ENABLED env var to prevent
// accidental simulation over real tournament data in production.
function requireSimulationEnabled(req, res, next) {
  if (process.env.SIMULATION_ENABLED !== 'true') {
    return res.status(403).json({ error: 'Simulation is disabled in this environment' });
  }
  next();
}

router.post('/tournament/reset-simulation', requireSimulationEnabled, async (req, res) => {
  try {
    const { includeDrafts } = req.body;
    const result = await adminService.resetSimulation({ includeDrafts: !!includeDrafts });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/tournament/simulate-round', requireSimulationEnabled, async (req, res) => {
  try {
    const result = await simulationService.simulateRound();
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// First Four pair management
router.post('/tournament/first-four-pairs', async (req, res) => {
  try {
    const { teamAId, teamBId } = req.body;
    if (!teamAId || !teamBId) {
      return res.status(400).json({ error: 'teamAId and teamBId are required' });
    }
    await tournamentTeamModel.setFirstFourPartner(teamAId, teamBId);
    res.json({ message: 'First Four pair created' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/tournament/first-four-pairs', async (req, res) => {
  try {
    const pairs = await tournamentTeamModel.getFirstFourPairs();
    res.json(pairs);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/tournament/first-four-pairs/:teamId', async (req, res) => {
  try {
    await tournamentTeamModel.clearFirstFourPair(req.params.teamId);
    res.json({ message: 'First Four pair removed' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Stat Sync Backfill ─────────────────────────────────────────────────────

router.post('/sync/backfill', async (req, res) => {
  try {
    const { dates } = req.body;
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: 'dates array is required (YYYYMMDD format)' });
    }
    if (dates.length > 30) {
      return res.status(400).json({ error: 'Maximum 30 dates per request' });
    }
    // Validate date format
    for (const d of dates) {
      if (!/^\d{8}$/.test(d)) {
        return res.status(400).json({ error: `Invalid date format: ${d}. Use YYYYMMDD.` });
      }
    }

    const results = [];
    for (const dateStr of dates) {
      const result = await runSyncForDate(dateStr);
      results.push(result);
    }
    res.json({ results });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Best Ball Contest Management ───────────────────────────────────────────

router.patch('/best-ball/contest/:id/status', async (req, res) => {
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

router.post('/best-ball/contest/:id/regenerate-prices', async (req, res) => {
  try {
    await bestBallPricing.generatePrices(req.params.id);
    res.json({ message: 'Prices regenerated' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Tournament Seeding (run from production) ──────────────────────────────

router.post('/tournament/seed', async (req, res) => {
  try {
    const { year = 2026 } = req.body;
    // Fork the seed script as a child process so it doesn't block the request
    const { execFile } = require('child_process');
    const path = require('path');
    const scriptPath = path.resolve(__dirname, '../../../database/seed_tournament.js');

    const child = execFile('node', [scriptPath, '--year', String(year)], {
      env: { ...process.env },
      timeout: 600000, // 10 minute timeout
    }, (error, stdout, stderr) => {
      // Log results but response already sent
      if (error) console.error('[admin] Seed script error:', error.message);
      if (stdout) console.log('[admin] Seed script output:', stdout);
      if (stderr) console.error('[admin] Seed script stderr:', stderr);
    });

    res.json({
      message: `Tournament seed started for year ${year}. Check server logs for progress.`,
      note: 'Run /api/admin/tournament/seed-first-four after seeding completes.',
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/tournament/seed-first-four', async (req, res) => {
  try {
    const { execFile } = require('child_process');
    const path = require('path');
    const scriptPath = path.resolve(__dirname, '../../../database/seed_first_four.js');

    execFile('node', [scriptPath], {
      env: { ...process.env },
      timeout: 300000,
    }, (error, stdout, stderr) => {
      if (error) console.error('[admin] First Four seed error:', error.message);
      if (stdout) console.log('[admin] First Four seed output:', stdout);
      if (stderr) console.error('[admin] First Four seed stderr:', stderr);
    });

    res.json({ message: 'First Four seed started. Check server logs for progress.' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
