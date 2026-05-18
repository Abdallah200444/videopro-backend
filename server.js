require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');


const app = express();
const PORT = process.env.PORT || 3001;

// Ensure tmp directory exists
const tmpDir = path.resolve(process.env.TEMP_DIR || './tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

// ─── Security & Middleware ─────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
}));

// ── CORS: Manually inject headers on EVERY response ──────────────────────────
// This correctly handles origin: null (file:// protocol) and all Netlify origins
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // When origin is missing or 'null' (file:// protocol), allow it explicitly
  if (!origin || origin === 'null') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight immediately
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
app.use(morgan('combined'));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const { createRateLimiter } = require('./middleware/rateLimit');
app.use('/api/', createRateLimiter());

// ─── Routes ───────────────────────────────────────────────────────────────────
const infoRoutes = require('./routes/info');
const downloadRoutes = require('./routes/download');

app.use('/api', infoRoutes);
app.use('/api', downloadRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Video Pro API',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: '1.0.0',
  });
});

// ─── Root ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service: 'Video Pro API',
    status: 'running',
    endpoints: {
      health: 'GET /api/health',
      info: 'POST /api/info',
      download: 'GET /api/download?url=...&format=...&engine=...',
    },
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: true, message: `Route ${req.path} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || 'Internal server error',
    engines: err.engines || undefined,
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║      🎬 Video Pro API Ready           ║
  ║   http://localhost:${PORT}              ║
  ╚═══════════════════════════════════════╝
  `);
});

module.exports = app;
