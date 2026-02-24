const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const leagueRoutes = require('./routes/league.routes');
const draftRoutes = require('./routes/draft.routes');
const playerRoutes = require('./routes/player.routes');
const standingsRoutes = require('./routes/standings.routes');
const adminRoutes = require('./routes/admin.routes');
const { authenticateToken } = require('./middleware/auth.middleware');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes
app.use('/api/auth', authRoutes);

// League routes
app.use('/api/leagues', leagueRoutes);

// Draft routes (nested under leagues, mergeParams handles :id)
app.use('/api/leagues/:id/draft', draftRoutes);

// Player & tournament routes (both under /api)
app.use('/api', playerRoutes);

// Standings, team roster, scoreboard (nested under leagues/:id)
app.use('/api/leagues/:id', standingsRoutes);

// Admin routes (auth + admin middleware applied inside the router)
app.use('/api/admin', adminRoutes);

// Protected test route (used by auth middleware tests)
app.get('/api/protected-test', authenticateToken, (req, res) => {
  res.json({ message: 'ok', user: req.user });
});

// Global error handler — must be last
app.use(errorHandler);

module.exports = app;
