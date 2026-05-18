const express = require('express');
const router = express.Router();
const { validateUrl } = require('../middleware/validate');
const manager = require('../services/downloadManager');

/**
 * POST /api/info
 * Body: { url: string }
 * Returns video info + available formats
 */
router.post('/info', async (req, res, next) => {
  const { url } = req.body;

  const validation = validateUrl(url);
  if (!validation.valid) {
    return res.status(400).json({ error: true, message: validation.error });
  }

  try {
    const { info, engine } = await manager.getInfo(validation.url);
    res.json({
      success: true,
      engine,
      platform: validation.platform,
      ...info,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
