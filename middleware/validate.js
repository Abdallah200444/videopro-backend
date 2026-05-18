const SUPPORTED_DOMAINS = [
  'youtube.com', 'youtu.be',
  'instagram.com', 'instagr.am',
  'facebook.com', 'fb.watch', 'fb.com', 'm.facebook.com',
  'twitter.com', 'x.com',
  'tiktok.com', 'vm.tiktok.com',
  'vimeo.com',
  'dailymotion.com',
];

/**
 * Detects platform from URL.
 */
function detectPlatform(url) {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('instagram.com') || lower.includes('instagr.am')) return 'instagram';
  if (lower.includes('facebook.com') || lower.includes('fb.watch') || lower.includes('fb.com')) return 'facebook';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('vimeo.com')) return 'vimeo';
  if (lower.includes('dailymotion.com')) return 'dailymotion';
  return 'unknown';
}

/**
 * Validates a URL - returns { valid, platform, url, error }
 */
function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required.' };
  }

  const trimmed = url.trim();
  let parsed;

  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format. Please paste a valid video link.' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only HTTP/HTTPS URLs are supported.' };
  }

  const hostname = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const isSupported = SUPPORTED_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));

  if (!isSupported) {
    return {
      valid: false,
      error: `Unsupported platform. We support: YouTube, Instagram, Facebook, Twitter, TikTok, Vimeo, Dailymotion.`,
    };
  }

  const platform = detectPlatform(trimmed);
  return { valid: true, platform, url: trimmed };
}

module.exports = { validateUrl, detectPlatform };
