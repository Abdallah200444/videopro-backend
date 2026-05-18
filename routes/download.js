const express = require('express');
const router = express.Router();
const { validateUrl } = require('../middleware/validate');
const manager = require('../services/downloadManager');

/**
 * GET /api/download?url=...&format=...&engine=...
 * Streams the video file directly to client.
 */
router.get('/download', async (req, res, next) => {
  const { url, format, engine } = req.query;

  const validation = validateUrl(url);
  if (!validation.valid) {
    return res.status(400).json({ error: true, message: validation.error });
  }

  try {
    await manager.download(validation.url, format || 'best', res, engine);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
