const rateLimit = require('express-rate-limit');

/**
 * Creates a rate limiter middleware.
 * Defaults: 30 requests per minute per IP.
 */
function createRateLimiter(max, windowMinutes) {
  return rateLimit({
    windowMs: (windowMinutes || 1) * 60 * 1000,
    max: max || parseInt(process.env.RATE_LIMIT_MAX) || 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: true,
      message: 'Too many requests. Please wait a moment and try again.',
    },
  });
}

module.exports = { createRateLimiter };
