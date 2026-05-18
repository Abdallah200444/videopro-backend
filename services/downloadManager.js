/**
 * downloadManager.js - Smart Download Orchestrator
 *
 * Priority Chain:
 *   1. yt-dlp (primary - supports 1000+ sites)
 *   2. Cobalt API (fallback - free public API)
 *
 * Auto-retries with next engine on failure.
 */

const ytdlp = require('./primary/ytdlpService');
const cobalt = require('./fallback/cobaltService');

const ENGINES = [
  { name: 'yt-dlp',  service: ytdlp   },
  { name: 'cobalt',  service: cobalt  },
];

/**
 * Get video info with fallback chain.
 */
async function getInfo(url) {
  const errors = [];

  for (const engine of ENGINES) {
    try {
      console.log(`[Manager] Trying getInfo with: ${engine.name}`);
      const info = await engine.service.getInfo(url);
      console.log(`[Manager] Success with: ${engine.name}`);
      return { info, engine: engine.name };
    } catch (err) {
      console.warn(`[Manager] ${engine.name} failed: ${err.message}`);
      errors.push({ engine: engine.name, error: err.message });
    }
  }

  throw Object.assign(
    new Error('Unable to fetch video information. Please check the URL and try again.'),
    { engines: errors, status: 422 }
  );
}

/**
 * Download video with fallback chain.
 */
async function download(url, formatId, res, preferredEngine) {
  const errors = [];

  let engines = [...ENGINES];
  if (preferredEngine) {
    engines = [
      ...engines.filter(e => e.name === preferredEngine),
      ...engines.filter(e => e.name !== preferredEngine),
    ];
  }

  for (const engine of engines) {
    if (res.headersSent) break;

    try {
      console.log(`[Manager] Trying download with: ${engine.name}`);
      await engine.service.download(url, formatId, res);
      console.log(`[Manager] Download complete with: ${engine.name}`);
      return;
    } catch (err) {
      console.warn(`[Manager] ${engine.name} download failed: ${err.message}`);
      errors.push({ engine: engine.name, error: err.message });
    }
  }

  if (!res.headersSent) {
    const err = new Error('Download failed. All engines exhausted. Please try again later.');
    err.status = 502;
    err.engines = errors;
    throw err;
  }
}

module.exports = { getInfo, download };
