/**
 * cobaltService.js - FALLBACK Download Engine #1
 * Uses Cobalt public API instances (https://cobalt.tools)
 * Free, no API key required. Supports YouTube, Instagram, Facebook, TikTok, etc.
 */

const axios = require('axios');

// Multiple Cobalt instances to try in order
const COBALT_INSTANCES = [
  'https://api.cobalt.tools',
  'https://cobalt.api.timelessnesses.me',
  'https://cobalt.ggtyler.dev',
  'https://co.wuk.sh',
];

/**
 * Get basic video info via Cobalt (generic quality options).
 */
async function getInfo(url) {
  const platform = detectPlatform(url);
  return {
    title: `Video from ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
    thumbnail: '',
    duration: 'Unknown',
    platform,
    uploader: '',
    formats: [
      { id: '1080', quality: '1080p (Full HD)', ext: 'mp4', size: 'Unknown', height: 1080 },
      { id: '720',  quality: '720p (HD)',       ext: 'mp4', size: 'Unknown', height: 720  },
      { id: '480',  quality: '480p',            ext: 'mp4', size: 'Unknown', height: 480  },
      { id: '360',  quality: '360p',            ext: 'mp4', size: 'Unknown', height: 360  },
      { id: 'audio', quality: 'Audio Only (MP3)', ext: 'mp3', size: 'Unknown', height: 0 },
    ],
    _source: 'cobalt',
  };
}

/**
 * Try a single Cobalt instance.
 */
async function tryCobaltInstance(instanceUrl, url, quality) {
  const isAudio = quality === 'audio' || quality === 'mp3';
  const qualityMap = { '2160': '2160', '1440': '1440', '1080': '1080', '720': '720', '480': '480', '360': '360', 'audio': '128' };
  const vQuality = qualityMap[quality] || '720';

  const cobaltRes = await axios.post(
    `${instanceUrl}/`,
    {
      url,
      videoQuality: vQuality,
      audioFormat: isAudio ? 'mp3' : 'best',
      isAudioOnly: isAudio,
      filenameStyle: 'basic',
    },
    {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );

  return cobaltRes.data;
}

/**
 * Download video by streaming Cobalt's response to the client.
 */
async function download(url, quality, res) {
  const isAudio = quality === 'audio' || quality === 'mp3';
  let lastError = null;

  for (const instance of COBALT_INSTANCES) {
    try {
      console.log(`[Cobalt] Trying instance: ${instance}`);
      const data = await tryCobaltInstance(instance, url, quality);
      const { status } = data;

      if (status === 'error' || status === 'rate-limit') {
        lastError = new Error(`Cobalt error: ${data.text || status}`);
        continue;
      }

      const finalUrl = data.url;
      if (!finalUrl) {
        lastError = new Error('Cobalt returned no stream URL');
        continue;
      }

      const videoRes = await axios.get(finalUrl, {
        responseType: 'stream',
        timeout: 120000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });

      const ext = isAudio ? 'mp3' : 'mp4';
      const contentType = isAudio ? 'audio/mpeg' : 'video/mp4';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="videopro.${ext}"`);
      res.setHeader('X-Download-Engine', 'cobalt');

      if (videoRes.headers['content-length']) {
        res.setHeader('Content-Length', videoRes.headers['content-length']);
      }

      videoRes.data.pipe(res);
      return new Promise((resolve, reject) => {
        videoRes.data.on('end', resolve);
        videoRes.data.on('error', reject);
        res.on('close', resolve);
      });

    } catch (err) {
      lastError = err;
      console.warn(`[Cobalt] Instance ${instance} failed: ${err.message}`);
    }
  }

  throw lastError || new Error('All Cobalt instances failed');
}

function detectPlatform(url) {
  const lower = url.toLowerCase();
  if (lower.includes('youtube') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('instagram')) return 'instagram';
  if (lower.includes('facebook') || lower.includes('fb.watch')) return 'facebook';
  if (lower.includes('tiktok')) return 'tiktok';
  if (lower.includes('twitter') || lower.includes('x.com')) return 'twitter';
  return 'unknown';
}

module.exports = { getInfo, download };
