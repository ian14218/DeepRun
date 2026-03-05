const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const leagueRoutes = require('./routes/league.routes');
const draftRoutes = require('./routes/draft.routes');
const playerRoutes = require('./routes/player.routes');
const standingsRoutes = require('./routes/standings.routes');
const adminRoutes = require('./routes/admin.routes');
const bestBallRoutes = require('./routes/bestBall.routes');
const { authenticateToken } = require('./middleware/auth.middleware');
const errorHandler = require('./middleware/errorHandler');
const pool = require('./db');

const app = express();

// Security headers (CSP disabled — Vite build uses inline scripts)
app.use(helmet({ contentSecurityPolicy: false }));

// Request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// CORS — lock to CORS_ORIGIN in production, allow all in dev
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());

// Global API rate limiting — 200 requests per minute per IP
if (process.env.NODE_ENV !== 'test') {
  app.use('/api/', rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  }));
}

// Health check with DB ping
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
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

// Best Ball routes (auth middleware applied inside the router)
app.use('/api/best-ball', bestBallRoutes);

// Protected test route (used by auth middleware tests)
app.get('/api/protected-test', authenticateToken, (req, res) => {
  res.json({ message: 'ok', user: req.user });
});

// Serve client build in production (when dist exists)
const clientDistPath = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  // SPA fallback — serve index.html for non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Global error handler — must be last
app.use(errorHandler);

module.exports = app;
