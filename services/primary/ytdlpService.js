/**
 * ytdlpService.js - PRIMARY Download Engine
 * Uses yt-dlp CLI tool. Supports YouTube, Facebook, Instagram, and 1000+ sites.
 *
 * On Render free tier: yt-dlp is installed via build command.
 */

const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const TEMP_DIR = path.resolve(process.env.TEMP_DIR || './tmp');
const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '500') * 1024 * 1024;

// Check if yt-dlp is available at startup
let ytdlpAvailable = null;
let ytdlpCommand = 'yt-dlp';
let ytdlpArgsPrefix = [];

function checkYtdlp() {
  if (ytdlpAvailable !== null) return Promise.resolve(ytdlpAvailable);
  return new Promise((resolve) => {
    // First try yt-dlp directly
    execFile('yt-dlp', ['--version'], { timeout: 8000 }, (err, stdout) => {
      if (!err) {
        ytdlpAvailable = true;
        console.log(`[ytdlp] Found yt-dlp version: ${stdout.trim()}`);
        return resolve(true);
      }
      
      // Fallback to python -m yt_dlp
      execFile('python', ['-m', 'yt_dlp', '--version'], { timeout: 8000 }, (err2, stdout2) => {
        if (!err2) {
          ytdlpAvailable = true;
          ytdlpCommand = 'python';
          ytdlpArgsPrefix = ['-m', 'yt_dlp'];
          console.log(`[ytdlp] Found python -m yt_dlp version: ${stdout2.trim()}`);
          return resolve(true);
        }
        
        ytdlpAvailable = false;
        console.warn('[ytdlp] yt-dlp not found in PATH or via Python. This engine will be skipped.');
        resolve(false);
      });
    });
  });
}

/**
 * Get video info (title, thumbnail, formats)
 */
async function getInfo(url) {
  const available = await checkYtdlp();
  if (!available) throw new Error('yt-dlp is not installed on this server');

  return new Promise((resolve, reject) => {
    const args = [
      ...ytdlpArgsPrefix,
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout', '20',
      '--retries', '3',
      '--extractor-args', 'youtube:player_client=android,web',
    ];

    if (fs.existsSync(path.join(__dirname, '../../cookies.txt'))) {
      args.push('--cookies', path.join(__dirname, '../../cookies.txt'));
    }

    args.push(url);

    execFile(ytdlpCommand, args, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`yt-dlp info failed: ${err.message}`));
      }

      try {
        const data = JSON.parse(stdout.trim());
        const formats = extractFormats(data.formats || []);
        resolve({
          title: data.title || 'Unknown Video',
          thumbnail: data.thumbnail || '',
          duration: formatDuration(data.duration || 0),
          platform: data.extractor_key?.toLowerCase() || 'unknown',
          uploader: data.uploader || data.channel || '',
          formats,
          _source: 'ytdlp',
        });
      } catch (e) {
        reject(new Error('Failed to parse yt-dlp output'));
      }
    });
  });
}

/**
 * Download a video by format ID, stream it to response.
 */
async function download(url, formatId, res) {
  const available = await checkYtdlp();
  if (!available) throw new Error('yt-dlp is not installed on this server');

  const filename = `vp_${uuidv4()}.mp4`;
  const outputPath = path.join(TEMP_DIR, filename);

  return new Promise((resolve, reject) => {
    // Smart format selection
    let formatSelector;
    if (formatId === 'audio' || formatId === 'mp3') {
      formatSelector = 'bestaudio[ext=m4a]/bestaudio/best';
    } else if (formatId && formatId !== 'best') {
      formatSelector = `${formatId}+bestaudio[ext=m4a]/best[height<=${getHeightFromFormatId(formatId)}][ext=mp4]/best`;
    } else {
      formatSelector = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
    }

    const isAudio = formatId === 'audio' || formatId === 'mp3';
    const outputFilename = `vp_${uuidv4()}.${isAudio ? 'mp3' : 'mp4'}`;
    const outPath = path.join(TEMP_DIR, outputFilename);

    const args = [
      ...ytdlpArgsPrefix,
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout', '20',
      '--retries', '3',
      '--extractor-args', 'youtube:player_client=android,web',
      '-f', formatSelector,
      '--merge-output-format', isAudio ? 'mp3' : 'mp4',
      '-o', outPath,
    ];

    if (fs.existsSync(path.join(__dirname, '../../cookies.txt'))) {
      args.push('--cookies', path.join(__dirname, '../../cookies.txt'));
    }

    args.push(url);

    if (isAudio) {
      args.push('--extract-audio', '--audio-format', 'mp3');
    }

    const proc = spawn(ytdlpCommand, args);
    let stderr = '';

    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        cleanup(outPath);
        return reject(new Error(`yt-dlp exited with code ${code}: ${stderr.slice(-500)}`));
      }

      // yt-dlp might create a slightly different filename
      let finalPath = outPath;
      if (!fs.existsSync(finalPath)) {
        // Try to find the file
        const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith('vp_'));
        if (files.length === 0) {
          return reject(new Error('Downloaded file not found'));
        }
        finalPath = path.join(TEMP_DIR, files[files.length - 1]);
      }

      const stat = fs.statSync(finalPath);
      if (stat.size > MAX_SIZE) {
        cleanup(finalPath);
        return reject(new Error(`File too large: ${Math.round(stat.size / 1024 / 1024)}MB`));
      }

      const ext = isAudio ? 'mp3' : 'mp4';
      const contentType = isAudio ? 'audio/mpeg' : 'video/mp4';

      res.setHeader('Content-Disposition', `attachment; filename="videopro.${ext}"`);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('X-Download-Engine', 'yt-dlp');

      const stream = fs.createReadStream(finalPath);
      stream.pipe(res);
      stream.on('end', () => { cleanup(finalPath); resolve(); });
      stream.on('error', (e) => { cleanup(finalPath); reject(e); });
    });

    proc.on('error', (e) => {
      reject(new Error(`Failed to start yt-dlp: ${e.message}`));
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractFormats(rawFormats) {
  const result = [];
  const seenHeights = new Set();

  // Extract video formats with a valid height and codec
  const videoFormats = rawFormats
    .filter(f => f.vcodec !== 'none' && (f.height || f.width))
    .sort((a, b) => {
      // Sort by height descending, then by filesize descending
      const heightA = a.height || a.width || 0;
      const heightB = b.height || b.width || 0;
      if (heightB !== heightA) return heightB - heightA;
      return (b.filesize || 0) - (a.filesize || 0);
    });

  for (const fmt of videoFormats) {
    const height = fmt.height || fmt.width;
    // Keep only one best format per resolution height
    if (!seenHeights.has(height)) {
      seenHeights.add(height);
      
      let label = `${height}p`;
      if (height >= 2160) label = '4K (2160p)';
      else if (height >= 1440) label = '2K (1440p)';
      else if (height >= 1080) label = '1080p (Full HD)';
      else if (height >= 720) label = '720p (HD)';

      result.push({
        id: fmt.format_id,
        quality: label,
        height: height,
        ext: fmt.ext || 'mp4',
        size: fmt.filesize ? `~${Math.round(fmt.filesize / 1024 / 1024)}MB` : 'Unknown',
        vcodec: fmt.vcodec,
      });
    }
  }

  // Audio-only option
  const audioFmt = rawFormats
    .filter(f => f.vcodec === 'none' && f.acodec !== 'none')
    .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

  if (audioFmt) {
    result.push({
      id: 'audio',
      quality: 'Audio Only (MP3)',
      height: 0,
      ext: 'mp3',
      size: audioFmt.filesize ? `~${Math.round(audioFmt.filesize / 1024 / 1024)}MB` : 'Unknown',
    });
  }

  return result.length > 0
    ? result
    : [{ id: 'best', quality: 'Best Available', ext: 'mp4', size: 'Unknown', height: 720 }];
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function getHeightFromFormatId(formatId) {
  const map = {
    '313': 2160, '271': 1440, '137': 1080, '136': 720,
    '135': 480, '134': 360, '133': 240, '160': 144,
  };
  return map[formatId] || 720;
}

function cleanup(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

module.exports = { getInfo, download };
