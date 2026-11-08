// VELSCOUR ONLINE - Multiplayer HTTP & WebSocket Server
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { buildUpdateManifest } = require('./tools/manifest');

const PORT = parseInt(process.env.PORT, 10) || 8124;
const ROOT = __dirname;
const DATA_DIR = process.env.VELSCOUR_DATA_DIR ? path.resolve(process.env.VELSCOUR_DATA_DIR) : path.join(ROOT, 'data');
const CHARS_DIR = path.join(DATA_DIR, 'characters');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// ------------------------------------------------------------------ Online Account & Character Storage
function ensureDataDirs() {
  try {
    fs.mkdirSync(CHARS_DIR, { recursive: true });
  } catch (e) { }
}
ensureDataDirs();

function writeJsonAtomic(filePath, data) {
  ensureDataDirs();
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

const accountsById = new Map();
const accountsByEmail = new Map();
const sessionsByToken = new Map();
// Global character name registry: nameLower -> { charId, accountId, name }
const onlineCharNames = new Map();

function loadAccountCharacters(accountId) {
  const file = path.join(CHARS_DIR, `${accountId}.json`);
  const data = readJsonSafe(file, { characters: [] });
  const chars = Array.isArray(data.characters) ? data.characters : [];
  for (const c of chars) {
    if (c) {
      if (typeof c.depth === 'number' && c.depth > 500) c.depth = 500;
      if (typeof c.deepest === 'number' && c.deepest > 500) c.deepest = 500;
    }
  }
  return chars;
}

function saveAccountCharacters(accountId, characters) {
  const file = path.join(CHARS_DIR, `${accountId}.json`);
  const data = readJsonSafe(file, {});
  for (const c of characters) {
    if (c) {
      if (typeof c.depth === 'number' && c.depth > 500) c.depth = 500;
      if (typeof c.deepest === 'number' && c.deepest > 500) c.deepest = 500;
    }
  }
  data.characters = characters;
  writeJsonAtomic(file, data);
}

function loadAccountReliquary(accountId) {
  const file = path.join(CHARS_DIR, `${accountId}.json`);
  const data = readJsonSafe(file, {});
  return data.reliquary || null;
}

function saveAccountReliquary(accountId, reliquary) {
  const file = path.join(CHARS_DIR, `${accountId}.json`);
  const data = readJsonSafe(file, {});
  data.reliquary = reliquary;
  writeJsonAtomic(file, data);
}

function saveAccountsToDisk() {
  const obj = {};
  for (const [id, acc] of accountsById.entries()) {
    obj[id] = acc;
  }
  writeJsonAtomic(ACCOUNTS_FILE, obj);
}

function saveSessionsToDisk() {
  const obj = {};
  const now = Date.now();
  for (const [tok, sess] of sessionsByToken.entries()) {
    if (sess.expiresAt && sess.expiresAt < now) {
      sessionsByToken.delete(tok);
      continue;
    }
    obj[tok] = sess;
  }
  writeJsonAtomic(SESSIONS_FILE, obj);
}

function initOnlineStore() {
  ensureDataDirs();
  const rawAccounts = readJsonSafe(ACCOUNTS_FILE, {});
  for (const [id, acc] of Object.entries(rawAccounts)) {
    if (acc && acc.id && acc.emailLower) {
      accountsById.set(acc.id, acc);
      accountsByEmail.set(acc.emailLower, acc);
    }
  }
  const rawSessions = readJsonSafe(SESSIONS_FILE, {});
  const now = Date.now();
  for (const [tok, sess] of Object.entries(rawSessions)) {
    if (sess && sess.token && sess.accountId && (!sess.expiresAt || sess.expiresAt > now)) {
      sessionsByToken.set(tok, sess);
    }
  }
  try {
    if (fs.existsSync(CHARS_DIR)) {
      const files = fs.readdirSync(CHARS_DIR);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const accountId = f.slice(0, -5);
        const chars = loadAccountCharacters(accountId);
        for (const c of chars) {
          if (c && c.id && c.name) {
            const key = String(c.name).trim().toLowerCase();
            if (key) {
              onlineCharNames.set(key, { charId: c.id, accountId, name: String(c.name).trim() });
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('[Velscour Online] Error indexing character names:', e);
  }
}
initOnlineStore();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  try {
    const hashBuf = crypto.scryptSync(String(password), String(salt), 64);
    const expBuf = Buffer.from(String(expectedHash), 'hex');
    if (hashBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, expBuf);
  } catch (e) {
    return false;
  }
}

function createSession(account) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session = {
    token,
    accountId: account.id,
    email: account.email,
    createdAt: now,
    expiresAt: now + 1000 * 60 * 60 * 24 * 90, // 90 days
  };
  sessionsByToken.set(token, session);
  saveSessionsToDisk();
  return session;
}

function getAuthAccount(req, parsedUrl, body = null) {
  let token = '';
  const authHeader = String(req.headers['authorization'] || '');
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token && parsedUrl && parsedUrl.searchParams.get('token')) {
    token = parsedUrl.searchParams.get('token').trim();
  }
  if (!token && body && typeof body.token === 'string') {
    token = body.token.trim();
  }
  if (!token) return null;
  const sess = sessionsByToken.get(token);
  if (!sess) return null;
  if (sess.expiresAt && sess.expiresAt < Date.now()) {
    sessionsByToken.delete(token);
    return null;
  }
  const acc = accountsById.get(sess.accountId);
  if (!acc) return null;
  return { account: acc, token };
}

function validateEmail(email) {
  const str = String(email || '').trim();
  if (!str || str.length > 120) return { valid: false, error: 'Please enter a valid email address.' };
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!re.test(str)) return { valid: false, error: 'Please enter a valid email address.' };
  return { valid: true, email: str, emailLower: str.toLowerCase() };
}

function validateCharName(rawName) {
  const name = String(rawName || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2) {
    return { valid: false, name, error: 'Character name must be at least 2 characters.' };
  }
  if (name.length > 18) {
    return { valid: false, name, error: 'Character name must be 18 characters or fewer.' };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 _'-]*$/.test(name)) {
    return { valid: false, name, error: 'Name may only contain letters, numbers, spaces, hyphens, or apostrophes.' };
  }
  return { valid: true, name, nameLower: name.toLowerCase(), error: null };
}

function isCharNameAvailable(rawName, excludeCharId = null) {
  const v = validateCharName(rawName);
  if (!v.valid) return { available: false, name: v.name, error: v.error };
  const existing = onlineCharNames.get(v.nameLower);
  if (existing && existing.charId !== excludeCharId) {
    return { available: false, name: v.name, error: 'That character name is already taken.' };
  }
  return { available: true, name: v.name, nameLower: v.nameLower, error: null };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw.trim()) return resolve({});
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function getPackageInfo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  } catch (e) {
    return { version: '0.1.0' };
  }
}

const serverStartTime = Date.now();
const manifestFileCache = new Map();
let cachedManifest = null;
let cachedManifestTime = 0;

function getLiveUpdateManifest(force = false) {
  const now = Date.now();
  const pkg = getPackageInfo();
  const ver = pkg.version || '0.1.0';
  if (!force && cachedManifest && cachedManifest.version === ver && (now - cachedManifestTime) < 2000) {
    return cachedManifest;
  }
  cachedManifest = buildUpdateManifest(ROOT, { version: ver, cache: manifestFileCache });
  cachedManifestTime = now;
  return cachedManifest;
}

function findBinary(dir, filterFn) {
  try {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    let best = null;
    for (const f of files) {
      if (filterFn(f)) {
        const full = path.join(dir, f);
        const st = fs.statSync(full);
        if (st.isFile()) {
          if (!best || st.mtimeMs > best.mtime) {
            best = { path: full, filename: f, size: st.size, mtime: st.mtimeMs };
          }
        }
      }
    }
    return best;
  } catch (e) { }
  return null;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;
  const p1 = String(v1).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const p2 = String(v2).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function getBuildArtifacts() {
  return {
    android: findBinary(path.join(ROOT, 'android/app/build/outputs/apk/debug'), f => f.endsWith('.apk')),
    windows: findBinary(path.join(ROOT, 'dist/desktop'), f => f.endsWith('.exe')),
    linux: findBinary(path.join(ROOT, 'dist/desktop'), f => f.endsWith('.AppImage')),
    // electron-builder zip names: Velscour-<v>-arm64-mac.zip (Apple Silicon), Velscour-<v>-mac.zip (Intel)
    mac: findBinary(path.join(ROOT, 'dist/desktop'), f => f.endsWith('-arm64-mac.zip')),
    macIntel: findBinary(path.join(ROOT, 'dist/desktop'), f => f.endsWith('-mac.zip') && !f.endsWith('-arm64-mac.zip')),
  };
}

function streamFile(req, res, filePath, downloadFilename, contentType = 'application/octet-stream') {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('File not found');
      return;
    }

    const headers = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    };

    if (downloadFilename) {
      headers['Content-Disposition'] = `attachment; filename="${downloadFilename}"`;
    }

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      if (start >= stats.size || end >= stats.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
        res.end();
        return;
      }
      const chunksize = (end - start) + 1;
      headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
      headers['Content-Length'] = chunksize;
      res.writeHead(206, headers);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      headers['Content-Length'] = stats.size;
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  });
}

function renderDownloadPage(artifacts) {
  const pkg = getPackageInfo();
  const android = artifacts.android;
  const windows = artifacts.windows;
  const linux = artifacts.linux;
  const mac = artifacts.mac;
  const macIntel = artifacts.macIntel;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Download VELSCOUR ONLINE - Dark Fantasy Action RPG</title>
  <link rel="icon" type="image/x-icon" href="/assets/ui/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090706;
      --card-bg: rgba(22, 16, 12, 0.88);
      --gold: #ffd34a;
      --gold-dim: #c89e38;
      --gold-bright: #fff0a0;
      --text: #dfd3c3;
      --text-dim: #9e8f7a;
      --border: rgba(180, 140, 70, 0.35);
      --border-bright: #ffd34a;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      background-image: 
        radial-gradient(ellipse at 50% 0%, rgba(130, 24, 16, 0.35) 0%, transparent 65%),
        radial-gradient(ellipse at 50% 100%, rgba(30, 16, 8, 0.8) 0%, transparent 70%);
      color: var(--text);
      font-family: 'Lora', serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 30px 20px 60px;
    }
    .header {
      text-align: center;
      max-width: 700px;
      margin-bottom: 35px;
    }
    .logo {
      max-width: 380px;
      width: 90%;
      height: auto;
      filter: drop-shadow(0 6px 18px rgba(0,0,0,0.9));
      margin-bottom: 12px;
    }
    .tagline {
      font-style: italic;
      color: var(--gold-dim);
      font-size: 16px;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .version-badge {
      display: inline-block;
      padding: 4px 14px;
      background: rgba(200, 150, 40, 0.15);
      border: 1px solid var(--border);
      border-radius: 20px;
      color: var(--gold);
      font-family: 'Cinzel', serif;
      font-size: 13px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 6px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
      max-width: 1000px;
      width: 100%;
      margin-bottom: 40px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      position: relative;
      box-shadow: 0 8px 30px rgba(0,0,0,0.7), inset 0 0 16px rgba(0,0,0,0.5);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: all 0.25s ease;
    }
    .card:hover {
      border-color: var(--border-bright);
      box-shadow: 0 12px 35px rgba(255, 211, 74, 0.18), inset 0 0 20px rgba(255, 211, 74, 0.08);
      transform: translateY(-4px);
    }
    .card-icon {
      width: 52px;
      height: 52px;
      margin-bottom: 14px;
      color: var(--gold);
    }
    .card-title {
      font-family: 'Cinzel', serif;
      font-size: 20px;
      font-weight: 700;
      color: var(--gold-bright);
      margin-bottom: 6px;
      letter-spacing: 1px;
    }
    .card-meta {
      font-size: 13px;
      color: var(--text-dim);
      margin-bottom: 14px;
    }
    .card-desc {
      font-size: 14px;
      line-height: 1.5;
      color: var(--text);
      margin-bottom: 22px;
      flex-grow: 1;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 24px;
      background: linear-gradient(180deg, #3d2a1c 0%, #20140c 100%);
      border: 1px solid var(--gold);
      border-radius: 4px;
      color: var(--gold-bright);
      font-family: 'Cinzel', serif;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 1px;
      text-decoration: none;
      text-transform: uppercase;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5), inset 0 0 8px rgba(255, 211, 74, 0.2);
      transition: all 0.2s ease;
      width: 100%;
    }
    .btn:hover {
      background: linear-gradient(180deg, #593e28 0%, #2e1c10 100%);
      box-shadow: 0 0 16px rgba(255, 211, 74, 0.4);
      color: #fff;
      transform: scale(1.02);
    }
    .btn.disabled {
      opacity: 0.4;
      pointer-events: none;
      border-color: #555;
      color: #777;
    }
    .play-web {
      text-align: center;
      margin-top: 10px;
    }
    .play-web a {
      color: var(--gold);
      text-decoration: none;
      font-family: 'Cinzel', serif;
      font-size: 15px;
      letter-spacing: 1px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: color 0.2s;
    }
    .play-web a:hover {
      color: #fff;
      text-shadow: 0 0 8px var(--gold);
    }
  </style>
</head>
<body>
  <div class="header">
    <a href="/"><img class="logo" src="/assets/ui/logo.webp" alt="VELSCOUR ONLINE"></a>
    <div class="tagline">A world built upon something that should have stayed dead.</div>
    <div class="version-badge">Version ${pkg.version || '1.0.0'} · Official Game Clients</div>
  </div>

  <div class="grid">
    <!-- Android APK -->
    <div class="card">
      <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
      <div class="card-title">Android APK</div>
      <div class="card-meta">${android ? formatBytes(android.size) : 'Unavailable'} · Android 8.0+</div>
      <div class="card-desc">Full mobile experience with immersive fullscreen touch controls, haptics, and built-in auto-updater.</div>
      <a class="btn ${android ? '' : 'disabled'}" href="/download/android">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download APK
      </a>
    </div>

    <!-- Windows Desktop -->
    <div class="card">
      <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
      <div class="card-title">Windows</div>
      <div class="card-meta">${windows ? formatBytes(windows.size) : 'Unavailable'} · Windows 10/11 64-bit</div>
      <div class="card-desc">Portable standalone executable. Clean frameless display, high refresh rate support, zero install needed.</div>
      <a class="btn ${windows ? '' : 'disabled'}" href="/download/windows">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download .EXE
      </a>
    </div>

    <!-- Linux Desktop -->
    <div class="card">
      <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a4 4 0 0 0-4 4v4a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4z" />
        <path d="M6 10v2a6 6 0 0 0 12 0v-2" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </svg>
      <div class="card-title">Linux AppImage</div>
      <div class="card-meta">${linux ? formatBytes(linux.size) : 'Unavailable'} · Universal Linux x64</div>
      <div class="card-desc">Universal portable Linux AppImage. Works out-of-the-box on Ubuntu, Debian, Arch, Fedora and Steam Deck.</div>
      <a class="btn ${linux ? '' : 'disabled'}" href="/download/linux">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download AppImage
      </a>
    </div>

    <!-- macOS Desktop -->
    <div class="card">
      <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" ry="2" />
        <path d="M1 20h22" />
      </svg>
      <div class="card-title">macOS</div>
      <div class="card-meta">${mac ? formatBytes(mac.size) : 'Unavailable'} · macOS 11+</div>
      <div class="card-desc">Unzip and drag Velscour Online.app to Applications. Unsigned: if macOS says it is damaged, run <code>xattr -cr "/Applications/Velscour Online.app"</code> in Terminal, then right-click → Open.</div>
      <a class="btn ${mac ? '' : 'disabled'}" href="/download/mac">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Apple Silicon (M1+)
      </a>
      <a class="btn ${macIntel ? '' : 'disabled'}" href="/download/mac-intel" style="margin-top:8px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Intel Mac
      </a>
    </div>
  </div>

  <div class="play-web">
    <a href="/">← Return to Web Game Client</a>
  </div>
</body>
</html>`;
}

// ------------------------------------------------------------------ HTTP Server
const server = http.createServer((req, res) => {
  let parsedUrl, pathname;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = decodeURIComponent(parsedUrl.pathname);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  // 0. CORS Preflight for API requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  // 0b. API: Online Account Authentication & Server-Side Character Management
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    readJsonBody(req).then(body => {
      const emailCheck = validateEmail(body.email);
      if (!emailCheck.valid) {
        return sendJson(res, 400, { ok: false, error: emailCheck.error });
      }
      const password = String(body.password || '');
      if (password.length < 6) {
        return sendJson(res, 400, { ok: false, error: 'Password must be at least 6 characters.' });
      }
      if (accountsByEmail.has(emailCheck.emailLower)) {
        return sendJson(res, 409, { ok: false, error: 'An account with that email address already exists.' });
      }
      const { salt, hash } = hashPassword(password);
      const now = Date.now();
      const account = {
        id: 'acc_' + now.toString(36) + '_' + crypto.randomBytes(4).toString('hex'),
        email: emailCheck.email,
        emailLower: emailCheck.emailLower,
        passwordHash: hash,
        salt,
        createdAt: now,
        lastLoginAt: now,
      };
      accountsById.set(account.id, account);
      accountsByEmail.set(account.emailLower, account);
      saveAccountsToDisk();
      saveAccountCharacters(account.id, []);
      const session = createSession(account);
      sendJson(res, 200, {
        ok: true,
        token: session.token,
        account: { id: account.id, email: account.email, createdAt: account.createdAt },
        characters: [],
        reliquary: null,
      });
    }).catch(err => {
      sendJson(res, 400, { ok: false, error: err.message || 'Invalid request' });
    });
    return;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    readJsonBody(req).then(body => {
      const emailCheck = validateEmail(body.email);
      if (!emailCheck.valid) {
        return sendJson(res, 400, { ok: false, error: 'Please enter a valid email address.' });
      }
      const password = String(body.password || '');
      const account = accountsByEmail.get(emailCheck.emailLower);
      if (!account || !verifyPassword(password, account.salt, account.passwordHash)) {
        return sendJson(res, 401, { ok: false, error: 'Invalid email or password.' });
      }
      account.lastLoginAt = Date.now();
      saveAccountsToDisk();
      const session = createSession(account);
      const characters = loadAccountCharacters(account.id);
      const reliquary = loadAccountReliquary(account.id);
      sendJson(res, 200, {
        ok: true,
        token: session.token,
        account: { id: account.id, email: account.email, createdAt: account.createdAt },
        characters,
        reliquary,
      });
    }).catch(err => {
      sendJson(res, 400, { ok: false, error: err.message || 'Invalid request' });
    });
    return;
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    readJsonBody(req).then(body => {
      const auth = getAuthAccount(req, parsedUrl, body);
      if (auth && auth.token) {
        sessionsByToken.delete(auth.token);
        saveSessionsToDisk();
      }
      sendJson(res, 200, { ok: true });
    }).catch(() => {
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  if (pathname === '/api/admin/shutdown' && req.method === 'POST') {
    const clientIp = req.socket.remoteAddress || '';
    const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
    readJsonBody(req).then(body => {
      if (!isLocal && body.secret !== (process.env.ADMIN_SECRET || 'dagyr_secret_update')) {
        return sendJson(res, 403, { ok: false, error: 'Forbidden. Admin access only.' });
      }
      if (body.cancel) {
        const cancelled = cancelServerShutdown();
        return sendJson(res, 200, { ok: true, cancelled });
      }
      const minutes = typeof body.minutes === 'number' ? body.minutes : 3;
      const reason = body.reason || 'Server update';
      startServerShutdown(minutes, reason);
      return sendJson(res, 200, {
        ok: true,
        shutdown: true,
        minutes,
        targetTime: shutdownState.targetTime,
        message: `Shutdown initiated: restarting in ${minutes} minutes.`,
      });
    }).catch(err => {
      sendJson(res, 400, { ok: false, error: err.message || 'Invalid request' });
    });
    return;
  }

  if ((pathname === '/api/auth/session' || pathname === '/api/online/characters') && req.method === 'GET') {
    const auth = getAuthAccount(req, parsedUrl);
    if (!auth) {
      return sendJson(res, 401, { ok: false, error: 'Session expired or not logged in.' });
    }
    const characters = loadAccountCharacters(auth.account.id);
    const reliquary = loadAccountReliquary(auth.account.id);
    return sendJson(res, 200, {
      ok: true,
      account: { id: auth.account.id, email: auth.account.email, createdAt: auth.account.createdAt },
      characters,
      reliquary,
    });
  }

  if (pathname === '/api/online/check-name' && req.method === 'GET') {
    const rawName = parsedUrl.searchParams.get('name') || '';
    const excludeId = parsedUrl.searchParams.get('excludeId') || null;
    const check = isCharNameAvailable(rawName, excludeId);
    return sendJson(res, 200, {
      ok: true,
      name: check.name,
      available: check.available,
      error: check.error,
    });
  }

  if (pathname === '/api/online/characters' && req.method === 'POST') {
    readJsonBody(req).then(body => {
      const auth = getAuthAccount(req, parsedUrl, body);
      if (!auth) {
        return sendJson(res, 401, { ok: false, error: 'Please sign in to create an online character.' });
      }
      const charData = body.character && typeof body.character === 'object' ? body.character : body;
      const rawName = charData.name || body.name || '';
      const nameCheck = isCharNameAvailable(rawName);
      if (!nameCheck.available) {
        const status = nameCheck.error && nameCheck.error.includes('already taken') ? 409 : 400;
        return sendJson(res, status, { ok: false, error: nameCheck.error || 'Character name is unavailable.' });
      }
      const classId = String(charData.classId || body.classId || 'paladin');
      const now = Date.now();
      const charId = (charData.id && typeof charData.id === 'string')
        ? charData.id
        : ('chr_' + now.toString(36) + '_' + crypto.randomBytes(4).toString('hex'));

      const characters = loadAccountCharacters(auth.account.id);
      const newChar = {
        ...charData,
        id: charId,
        name: nameCheck.name,
        classId,
        isOnline: true,
        accountId: auth.account.id,
        createdAt: charData.createdAt || now,
        lastPlayed: now,
      };
      characters.push(newChar);
      saveAccountCharacters(auth.account.id, characters);
      onlineCharNames.set(nameCheck.nameLower, {
        charId: newChar.id,
        accountId: auth.account.id,
        name: newChar.name,
      });
      return sendJson(res, 200, {
        ok: true,
        character: newChar,
        characters,
      });
    }).catch(err => {
      sendJson(res, 400, { ok: false, error: err.message || 'Invalid request' });
    });
    return;
  }

  if (
    (pathname === '/api/online/characters/save' && (req.method === 'POST' || req.method === 'PUT')) ||
    (pathname.startsWith('/api/online/characters/') && (req.method === 'PUT' || req.method === 'POST'))
  ) {
    readJsonBody(req).then(body => {
      const auth = getAuthAccount(req, parsedUrl, body);
      if (!auth) {
        return sendJson(res, 401, { ok: false, error: 'Session expired or not logged in.' });
      }
      const charData = body.character && typeof body.character === 'object' ? body.character : body;
      const urlCharId = pathname !== '/api/online/characters/save'
        ? pathname.slice('/api/online/characters/'.length)
        : null;
      const charId = String(urlCharId || charData.id || '');
      if (!charId) {
        return sendJson(res, 400, { ok: false, error: 'Missing character ID.' });
      }
      const characters = loadAccountCharacters(auth.account.id);
      const idx = characters.findIndex(c => c && c.id === charId);
      if (idx === -1) {
        return sendJson(res, 404, { ok: false, error: 'Character not found on this account.' });
      }
      const existing = characters[idx];
      const safeLevel = Math.max(existing.level || 1, charData.level || 1);
      const safeXp = safeLevel > (existing.level || 1)
        ? (charData.xp || 0)
        : (safeLevel === (existing.level || 1) ? Math.max(existing.xp || 0, charData.xp || 0) : existing.xp || 0);
      const safeDeepest = Math.min(500, Math.max(existing.deepest || 1, charData.deepest || 1));
      const safeDepth = Math.min(500, Math.max(existing.depth || 1, charData.depth || 1));

      const levelDeficit = safeLevel - (charData.level || 1);
      const statBonus = levelDeficit > 0 ? (levelDeficit * 5) : 0;
      const skillBonus = levelDeficit > 0 ? levelDeficit : 0;
      const talentBonus = levelDeficit > 0 ? Math.floor(levelDeficit / 5) : 0;

      const safeStatPoints = levelDeficit > 0
        ? Math.max(existing.statPoints || 0, (charData.statPoints || 0) + statBonus)
        : (charData.statPoints != null ? charData.statPoints : (existing.statPoints || 0));
      const safeSkillPoints = levelDeficit > 0
        ? Math.max(existing.skillPoints || 0, (charData.skillPoints || 0) + skillBonus)
        : (charData.skillPoints != null ? charData.skillPoints : (existing.skillPoints || 0));
      const safeTalentPoints = levelDeficit > 0
        ? Math.max(existing.talentPoints || 0, (charData.talentPoints || 0) + talentBonus)
        : (charData.talentPoints != null ? charData.talentPoints : (existing.talentPoints || 0));

      const safeMarks = charData.marks || existing.marks || { pts: 0, xp: 0, spent: { life: 0, crit: 0, mf: 0, rift: 0 } };

      const updated = {
        ...existing,
        ...charData,
        level: safeLevel,
        xp: safeXp,
        depth: safeDepth,
        deepest: safeDeepest,
        statPoints: safeStatPoints,
        skillPoints: safeSkillPoints,
        talentPoints: safeTalentPoints,
        marks: safeMarks,
        cleared: { ...(existing.cleared || {}), ...(charData.cleared || {}) },
        id: existing.id,
        name: existing.name, // Preserve registered unique name
        classId: existing.classId || charData.classId,
        isOnline: true,
        accountId: auth.account.id,
        createdAt: existing.createdAt || Date.now(),
        lastPlayed: Date.now(),
      };
      characters[idx] = updated;
      saveAccountCharacters(auth.account.id, characters);
      return sendJson(res, 200, {
        ok: true,
        character: updated,
      });
    }).catch(err => {
      sendJson(res, 400, { ok: false, error: err.message || 'Invalid request' });
    });
    return;
  }

  if (pathname.startsWith('/api/online/characters/') && req.method === 'DELETE') {
    const auth = getAuthAccount(req, parsedUrl);
    if (!auth) {
      return sendJson(res, 401, { ok: false, error: 'Session expired or not logged in.' });
    }
    const charId = pathname.slice('/api/online/characters/'.length);
    const characters = loadAccountCharacters(auth.account.id);
    const idx = characters.findIndex(c => c && c.id === charId);
    if (idx === -1) {
      return sendJson(res, 404, { ok: false, error: 'Character not found.' });
    }
    const [removed] = characters.splice(idx, 1);
    saveAccountCharacters(auth.account.id, characters);
    if (removed && removed.name) {
      const key = String(removed.name).trim().toLowerCase();
      const reg = onlineCharNames.get(key);
      if (reg && reg.charId === removed.id) {
        onlineCharNames.delete(key);
      }
    }
    return sendJson(res, 200, {
      ok: true,
      deletedId: charId,
      characters,
    });
  }

  if (pathname === '/api/online/reliquary' && req.method === 'GET') {
    const auth = getAuthAccount(req, parsedUrl);
    if (!auth) {
      return sendJson(res, 401, { ok: false, error: 'Session expired or not logged in.' });
    }
    const reliquary = loadAccountReliquary(auth.account.id);
    return sendJson(res, 200, { ok: true, reliquary });
  }

  if (pathname === '/api/online/reliquary' && (req.method === 'PUT' || req.method === 'POST')) {
    readJsonBody(req).then(body => {
      const auth = getAuthAccount(req, parsedUrl, body);
      if (!auth) {
        return sendJson(res, 401, { ok: false, error: 'Session expired or not logged in.' });
      }
      const relData = body.reliquary || body;
      saveAccountReliquary(auth.account.id, relData);

      // Broadcast reliquary update to all other connected clients of the same account
      const updateJson = JSON.stringify({ type: 'reliquary_updated', reliquary: relData });
      for (const [ws, c] of clients) {
        let accId = c.accountId;
        if (!accId && c.name) {
          const reg = onlineCharNames.get(c.name.trim().toLowerCase());
          if (reg) accId = reg.accountId;
        }
        if (accId === auth.account.id && ws && ws.readyState === WebSocket.OPEN) {
          try { ws.send(updateJson); } catch (e) { }
        }
      }

      return sendJson(res, 200, { ok: true, reliquary: relData });
    }).catch(err => {
      sendJson(res, 400, { ok: false, error: err.message || 'Invalid request' });
    });
    return;
  }

  // 1. API: Version & Update metadata
  if (pathname === '/api/version') {
    const pkg = getPackageInfo();
    const artifacts = getBuildArtifacts();
    const manifest = getLiveUpdateManifest();
    const mtimes = [
      artifacts.android?.mtime || 0,
      artifacts.windows?.mtime || 0,
      artifacts.linux?.mtime || 0,
      artifacts.mac?.mtime || 0,
      artifacts.macIntel?.mtime || 0,
      manifest.buildTime || 0,
    ];
    const latestBuild = Math.max(...mtimes, serverStartTime);
    const resData = {
      name: 'Velscour Online',
      version: pkg.version || '0.1.0',
      manifestHash: manifest.manifestHash,
      manifestUrl: '/api/update-manifest',
      totalFiles: manifest.totalFiles,
      totalSize: manifest.totalSize,
      inGameUpdateSupported: true,
      serverTime: Date.now(),
      buildTime: latestBuild,
      changelog: [
        "8 New Playable Classes: Play as the Monk, Dragoon, Totem Master, Death Knight, Arcane Sorcerer (Astronomer), Slime Lord, Boomerang Knight, and Dragon Knight — expanding the roster to 17 unique classes!",
        "17 Bespoke Class Ultimates: Unique kill-charged power moves for all 17 classes with dynamic primary attribute scaling, multi-phase isometric animations, and procedural vector icons.",
        "Multiplayer Ultimate Skill Synchronization: Party members now see remote player Ultimate casts in real time, complete with synchronized ground sigils, celestial VFX, screen shake, and combat log announcements.",
        "New Regions & Biomes: Explore 10 Castle Overworld variants, Sea of Sand Dune variants with 3D Pyramids, Alpine / Mountainside snow drifts, and Snowy Summit with deterministic party synchronization.",
        "Boss Arena Mid-Fight Join: Players arriving at sealed boss gates can now accept an entrance prompt to warp directly into active boss encounters with VFX and party notifications.",
        "Title Screen & Boss Polish: Restored retro pixelated parallax blinking eyes to the title screen and fixed Demon Lord Velscour boss spawn art resolution.",
        "Travelling Merchant in Town: Added Malakor the Ash-Wanderer just off the town square. Trade unspent Infernal Marks for Sealed Chests (Mystery Casket, Armament Coffer, Armor Vault, and Abyssal Reliquary with guaranteed Legendary/Mythic loot) that unseal via the HUD or backpack.",
        "Mountainside Biome Overworld Overhaul: Complete integration of high-altitude rugged terrain, snow drifts, mountain goats, peak temples, avalanche hazards, and mobile performance optimizations.",
        "The Pirate Seas Naval Expansion: 12 unique naval scenarios (Flight Deck, Ninth Bell, The Lightless, Wrecker's Reef, Harpoon Weather, Lashed Together, Fire Below, Across the Plank, Three Chains, Red Tide, Sea Coming Over, Dawnwake) with 3D ship models and tactical naval battles on Bellmourn's waters.",
        "Diablo-Style Cast Lock & Auto-Cast Summons: Responsive casting lock preventing interruption during ability sequences and automated cast logic for persistent pet and minion management.",
        "Infernal Marks Storage Expansions: Account-wide row expansions for Backpack, Gem Bag, Stash, Jewel Box, and Reliquary unlockable using free Infernal Marks.",
        "Fullscreen Loading Screen & Spawn Polish: Dedicated loading transition with game tip carousel, progress bar, and graceful player/camera spawn stabilization.",
        "Minimizable Portrait & Desktop Chat Dock: Compact dockable chat overlay with unread activity badges, customizable channels, and responsive viewport layout.",
        "Bespoke Class Ultimates Animations: Multi-phase visual animations for all 9 class ultimates (Paladin Divine Smite, Barbarian Cataclysm, Lancer Gungnir's Fall, Ranger Storm of Shafts, Gunner Siege Artillery, Bard Grand Crescendo, Wizard Supernova, Necromancer Grave Eruption, Carrion Witch Feast of Crows) featuring rotating ground sigils, celestial spears, subterranean magma fissures, falling arrow storms, artillery shells, musical staff spirals, cosmic singularities, and bone pikes",
        "Class Ultimates Major Update: Unique kill-charged 1-shot Ultimate power move for all 9 classes scaled off primary attributes with custom vector icons, distinct VFX, and SFX",
        "Universal Gothic Fantasy Scrollbars: slim, stylistic scrollbars matching dark parchment and bronze aesthetics across the lobby, inventory, shops, stash, character screens, and chat",
        "Lancer Orbiting Shield Visual Clarity: eliminated particle clutter and blinding additive fire bloom across all 7 Bulwark orbiting shield abilities (Tower Shield, Storm Bulwark, Burning Aegis, Frost Rampart, Holy Citadel, Shield Storm, Bastion of Ten), ring augments, and stances so shields, monsters, and combat remain crystal clear",
        "Weapon & Off-hand Archetype Stat Requirements: Strength required for blunt weapons, spears, swords, axes, and shields; Dexterity required for bows, crossbows, pistols, instruments, and quivers; Intellect required for staves, wands, scythes, orbs, and tomes",
        "Bard Music Sheet Equipping: one-click 'Lock & Equip' from inventory, sheet editor, or drag-and-drop straight into Tab slots with 'Unlock to Edit' support",
        "Acoustic Plucked Lute Audio: redesigned Bard instrument sampler and procedural notes with warm acoustic string body resonance, plectrum attack transient, and harmonic damping",
        "In-Game Differential Android OTA Updater: checks per-file SHA-256 hashes and downloads only modified/new game files directly in-game without downloading or reinstalling the full APK",
        "Level Cap 3000 & Uncapped Infernal Marks: hero progression extended to level 3000 across Endless Torment depths up to D6600, with uncapped Infernal Marks (Vitality life multiplier, Precision crit chance & crit damage, Fortune extra drops, Haste rift time)",
        "Skill Macros (R E Y U O & Touch M1-M5): 5 customizable skill macro slots per hero with 'Keep up' automatic buff recast when enemies are nearby and full online party synchronization",
        "Thorns Scaling & Weapon Base Display: endgame thorns scale with hero fortitude and attacker level; normalized weapon damage numbers and added Weapon Base to the Character Sheet",
        "Compact Big-Number Notation & Gold Scaling: added Qa through Dc and scientific notation suffixes along with high-depth logarithmic gold scaling",
        "Velscour Unbound & Sealed Treasure Updates: Unbound prioritizes uncollected Heirlooms + 3 Abyssal items + 20 Infernal Marks; ring augments display calculated hit damage; sealed items blocked from socketing/upgrading/enchanting until unsealed",
        "Mobile portrait mode redesign with upward-expanding bottom-docked chat, flank special action buttons, repositioned ATK button, enlarged 108px minimap, and Android fullSensor dynamic rotation",
        "Organized Settings dialog into 5 clean category tabs (General, Audio, Graphics, HUD & UI, Auto-Play) with instant responsive navigation across desktop and mobile",
        "Multiplayer Bard Music Synchronization: live melodic note playback, rhythm audio, cadences, staff notation, and custom sheet titles replicated to all party members",
        "Vanity Appearance Slots: wear any armor or helmet look while retaining full combat stats, set bonuses, and sockets with 'Hide Helmet' support",
        "Death Knight Flying Sword Outlines: flying greatsword inherits hero's pale-gold rim outline and see-through wall/spell occlusion shaders",
        "Lobby & Paperdoll Vanity + Held Gear: character pedestal previews in the online lobby and hero selection screens now display vanity outfits and held weapons and off-hands",
        "Bard Music Sheets: paste tablature or note names, lock sheets, and load them into 5 Tab slots under paper doll to play songs during combat",
        "Death Knight 3D Flying Greatsword: equipped two-handed blade flies beside hero and rests on back with 50 unique greatsword designs",
        "Fixed castle drawbridges across all maps so lowered bridges rest flush against the stone pier without floating",
        "Hero damage scale: combat and sheet numbers scaled to hero life for clear, readable figures without altering underlying damage mechanics",
        "Auto-play AI evasion: intelligently steps out of Great Sand Wyrm charge paths and ground quakes",
        "Major expansion: Held 3D weapons & off-hands for all classes with 50 unique designs per weapon and elemental particle glows",
        "10 Castle Overworld variants with custom layouts, stones, moats, and story dialogue",
        "10 Sea of Sand Dune variants and massive 3D pyramids with deep burial chamber raid encounters",
        "Integrated VELSCOUR DEFENSE tower defense card campaign behind the town Riftgate",
        "Synchronized multiplayer world generation for Castle and Dune variants to ensure 100% party determinism",
        "Host-authoritative wave triggers and spawn timers preventing multiplayer encounter desynchronization",
        "Mobile pathfinding and typed array mask optimizations for smooth 60 FPS performance",
        "3D bone gibs and gore physics overhaul",
        "Vendored Three.js and custom canvas filter fallback for Safari/iOS compatibility",
        "Fixed multiplayer dungeon progression: exit portal now reliably unseals for all party members when the floor champion/guardian is slain, including remote and late-joining players",
        "Fine-tuned UI styling: experience bar placement, Velscour contact skull positioning, and inventory alignment",
        "Restored missing inventory stats grid, attribute allocation rows, and item rarity styles",
        "Fixed HP and MP numerical text display on life and mana orbs in compact mobile views (portrait & landscape)",
        "Fixed sealed item opening panel styling, responsiveness, and reel animations on mobile & touch displays",
        "Fine-tuned mobile touch controls and UI pointer-events layering",
        "Disabled pausing in online multiplayer across all menus, modals, and hit-stops to eliminate client and server desync",
        "Real-time simulation catch-up and background tab heartbeat to preserve synchronization during window unfocus",
        "Netcode smoothness optimization: TCP_NODELAY, dead-reckoning extrapolation, and 60 FPS monster interpolation",
        "Equipment delta compression reducing continuous player state bandwidth by 85%",
        "Full visual replication for remote player skills, animations, hazards, and Barbarian Leap 3D arc",
        "Persistent killed monsters across late-joining party members entering active dungeon depths",
        "Room capacity capped to 4 players for optimal party performance",
        "Full multiplayer synchronization for champion monsters, affixes, auras, and stats",
        "Synchronized boss awakening across all peers and shared boss HUD health bar",
        "Multiplayer ambush waves targeting any active party member with matching champion spawns",
        "Resolved town ghost characters and duplication bug on room leave and rejoin",
        "Deterministic raid boss generation and modifiers across all peers on raid depths",
        "Shared multiplayer Heresies: portal activator sets party Heresies and biomes for deterministic enemy synchronization",
        "Resolved multiplayer monster authority symmetry and split-monster replication",
        "Enforced version synchronization for Online Multiplayer mode with direct one-click update prompts",
        "Lobby auto-reconnect on foreground resume, WebSocket keepalive heartbeat, and 90-second host room grace period",
        "Endgame expansion: Heresies of the Hollow, Abyssal Rifts, Velscour Unbound, and Infernal Marks",
        "Global Abyssal Rift leaderboard and honour board integration",
        "Interactive mobile pinch-to-zoom gesture support with smooth camera zoom scaling",
        "NPC-style walking bounce animation with organic squash, stretch, stride sway, and idle breathing",
        "Dedicated round buttons for Smite and Madness with procedural canvas artwork and circular SVG charge rings",
        "Streamlined bottom-left special ability action cluster positioned cleanly beside the HP orb",
        "Anti-cache automatic updater delivery for Android APK and desktop platforms"
      ],
      downloads: {
        android: {
          available: !!artifacts.android,
          url: `/download/android?v=${pkg.version || ''}`,
          filename: `VelscourOnline-${pkg.version || ''}.apk`,
          size: artifacts.android ? artifacts.android.size : 0,
          sizeFormatted: artifacts.android ? formatBytes(artifacts.android.size) : null
        },
        windows: {
          available: !!artifacts.windows,
          url: '/download/windows',
          filename: 'VelscourOnline.exe',
          size: artifacts.windows ? artifacts.windows.size : 0,
          sizeFormatted: artifacts.windows ? formatBytes(artifacts.windows.size) : null
        },
        linux: {
          available: !!artifacts.linux,
          url: '/download/linux',
          filename: 'VelscourOnline.AppImage',
          size: artifacts.linux ? artifacts.linux.size : 0,
          sizeFormatted: artifacts.linux ? formatBytes(artifacts.linux.size) : null
        },
        mac: {
          available: !!artifacts.mac,
          url: '/download/mac',
          filename: 'VelscourOnline-mac-arm64.zip',
          size: artifacts.mac ? artifacts.mac.size : 0,
          sizeFormatted: artifacts.mac ? formatBytes(artifacts.mac.size) : null
        },
        macIntel: {
          available: !!artifacts.macIntel,
          url: '/download/mac-intel',
          filename: 'VelscourOnline-mac-x64.zip',
          size: artifacts.macIntel ? artifacts.macIntel.size : 0,
          sizeFormatted: artifacts.macIntel ? formatBytes(artifacts.macIntel.size) : null
        }
      }
    };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(resData, null, 2));
    return;
  }

  // 1b. API: Differential Update File Manifest (SHA-256 hashes & sizes for in-game OTA updater)
  if (pathname === '/api/update-manifest' || pathname === '/update-manifest.json') {
    const force = parsedUrl.searchParams.has('force');
    const manifest = getLiveUpdateManifest(force);
    const jsonBuf = Buffer.from(JSON.stringify(manifest), 'utf8');
    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    };
    if (acceptEncoding.includes('gzip')) {
      const gz = zlib.gzipSync(jsonBuf);
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = gz.length;
      res.writeHead(200, headers);
      res.end(gz);
    } else {
      headers['Content-Length'] = jsonBuf.length;
      res.writeHead(200, headers);
      res.end(jsonBuf);
    }
    return;
  }

  // 2. Direct binary download routes
  if (pathname === '/download/android' || pathname === '/download/apk' || pathname.endsWith('.apk')) {
    const pkg = getPackageInfo();
    const artifacts = getBuildArtifacts();
    if (!artifacts.android) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('Android APK not found on server.');
      return;
    }
    const dlName = `VelscourOnline-${pkg.version || ''}.apk`;
    streamFile(req, res, artifacts.android.path, dlName, 'application/vnd.android.package-archive');
    return;
  }

  if (pathname === '/download/windows' || pathname === '/download/exe') {
    const artifacts = getBuildArtifacts();
    if (!artifacts.windows) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('Windows executable not found on server.');
      return;
    }
    streamFile(req, res, artifacts.windows.path, 'VelscourOnline.exe', 'application/octet-stream');
    return;
  }

  if (pathname === '/download/linux' || pathname === '/download/appimage') {
    const artifacts = getBuildArtifacts();
    if (!artifacts.linux) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('Linux AppImage not found on server.');
      return;
    }
    streamFile(req, res, artifacts.linux.path, 'VelscourOnline.AppImage', 'application/x-executable');
    return;
  }

  if (pathname === '/download/mac' || pathname === '/download/mac-intel') {
    const intel = pathname === '/download/mac-intel';
    const art = getBuildArtifacts()[intel ? 'macIntel' : 'mac'];
    if (!art) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('macOS build not found on server.');
      return;
    }
    streamFile(req, res, art.path, intel ? 'VelscourOnline-mac-x64.zip' : 'VelscourOnline-mac-arm64.zip', 'application/zip');
    return;
  }

  // 3. Download Portal Web Page
  if (pathname === '/download' || pathname === '/downloads' || pathname === '/download/') {
    const artifacts = getBuildArtifacts();
    const html = renderDownloadPage(artifacts);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(html);
    return;
  }

  // 4. Static Game Assets Serving
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT) || safePath.startsWith(DATA_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isCodeOrMarkup = ext === '.html' || ext === '.js' || ext === '.json' || ext === '.css';
    const headers = {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Access-Control-Allow-Origin': '*',
    };

    if (isCodeOrMarkup || parsedUrl.searchParams.has('_v') || parsedUrl.searchParams.has('_hard') || req.headers['cache-control'] === 'no-cache') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }

    // Range support for audio/media files
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
      headers['Accept-Ranges'] = 'bytes';
      headers['Content-Length'] = chunksize;
      res.writeHead(206, headers);
      fs.createReadStream(safePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, headers);
      fs.createReadStream(safePath).pipe(res);
    }
  });
});

// ------------------------------------------------------------------ WebSocket Server
const wss = new WebSocketServer({ server, path: '/ws' });

let clientIdSeq = 1;
const clients = new Map(); // ws -> clientData
const rooms = new Map();   // roomName -> roomData
const DEFAULT_CHANNEL = 'USEast-1';
const ROOM_GRACE_PERIOD_MS = 90000; // 90s grace period before tearing down an empty room on unexpected disconnect

function broadcastToChannel(channel, msg, excludeWs = null) {
  const json = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const [ws, c] of clients) {
    if (ws !== excludeWs && c.channel === channel && ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  }
}

function broadcastToRoom(roomName, msg, excludeWs = null) {
  const json = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const [ws, c] of clients) {
    if (ws !== excludeWs && c.room === roomName && ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  }
}

function broadcastToAll(msg, excludeWs = null) {
  const json = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const [ws] of clients) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      try { ws.send(json); } catch (e) { }
    }
  }
}

// ------------------------------------------------------------------ Server Shutdown Manager
let shutdownState = {
  inProgress: false,
  targetTime: 0,
  timer: null,
  interval: null,
  reason: 'Server update',
};

function startServerShutdown(minutes = 3, reason = 'Server update') {
  if (shutdownState.inProgress) {
    cancelServerShutdown();
  }
  const totalSeconds = Math.max(0, Math.round(minutes * 60));
  const targetTime = Date.now() + totalSeconds * 1000;
  shutdownState.inProgress = true;
  shutdownState.targetTime = targetTime;
  shutdownState.reason = reason;

  console.log(`\n================================================================`);
  console.log(`[SERVER SHUTDOWN INITIATED] Restarting in ${minutes} minute(s) (${totalSeconds}s)`);
  console.log(`Reason: ${reason}`);
  console.log(`================================================================\n`);

  if (totalSeconds === 0) {
    executeFinalShutdown();
    return;
  }

  const broadcastWarning = () => {
    const msLeft = Math.max(0, shutdownState.targetTime - Date.now());
    const secLeft = Math.ceil(msLeft / 1000);
    const minLeft = Math.ceil(secLeft / 60);

    const warnMsg = {
      type: 'server_shutdown_warning',
      secondsLeft: secLeft,
      minutesLeft: minLeft,
      reason: shutdownState.reason,
      message: `[SERVER RESTART] The server is restarting for an update in ${secLeft >= 60 ? `${minLeft} minute(s)` : `${secLeft} second(s)`}! Please get to a safe place and Save & Exit to avoid data loss.`,
    };

    // Chat broadcast to all active players
    broadcastToAll({
      type: 'chat',
      kind: 'system',
      from: 'VELSCOUR SYSTEM',
      text: warnMsg.message,
      color: '#ff4444',
      time: Date.now(),
    });

    // Dedicated packet for HUD banner and auto-save trigger
    broadcastToAll(warnMsg);
  };

  // Immediate first broadcast
  broadcastWarning();

  // Periodic reminder interval:
  // Every 30 seconds when > 60s left, then at 45s, 30s, 15s, 10s, 5s..1s
  let lastAnnounceSec = totalSeconds;
  shutdownState.interval = setInterval(() => {
    if (!shutdownState.inProgress) return;
    const secLeft = Math.ceil(Math.max(0, shutdownState.targetTime - Date.now()) / 1000);

    if (secLeft <= 0) {
      clearInterval(shutdownState.interval);
      shutdownState.interval = null;
      executeFinalShutdown();
      return;
    }

    let shouldBroadcast = false;
    if (secLeft > 60 && lastAnnounceSec - secLeft >= 30) {
      shouldBroadcast = true;
    } else if (secLeft <= 60 && secLeft > 10 && lastAnnounceSec - secLeft >= 15) {
      shouldBroadcast = true;
    } else if (secLeft <= 10 && secLeft !== lastAnnounceSec) {
      shouldBroadcast = true;
    }

    if (shouldBroadcast) {
      lastAnnounceSec = secLeft;
      broadcastWarning();
    }
  }, 1000);
}

function cancelServerShutdown() {
  if (!shutdownState.inProgress) return false;
  if (shutdownState.interval) clearInterval(shutdownState.interval);
  if (shutdownState.timer) clearTimeout(shutdownState.timer);
  shutdownState.inProgress = false;
  shutdownState.targetTime = 0;
  shutdownState.interval = null;
  shutdownState.timer = null;

  broadcastToAll({
    type: 'server_shutdown_cancelled',
    message: '[SERVER] Scheduled restart has been cancelled. You may continue playing normally.',
  });
  broadcastToAll({
    type: 'chat',
    kind: 'system',
    from: 'VELSCOUR SYSTEM',
    text: 'Scheduled restart has been cancelled. You may continue playing normally.',
    color: '#60ff80',
    time: Date.now(),
  });
  console.log('[SERVER SHUTDOWN CANCELLED]');
  return true;
}

function executeFinalShutdown() {
  console.log('\n[SERVER SHUTTING DOWN NOW] Flushing all data to disk...');
  broadcastToAll({
    type: 'server_shutdown_now',
    message: 'Server is restarting now for an update. Character progression has been safely recorded. Please reconnect in a minute!',
  });

  // Flush accounts and sessions
  try { saveAccountsToDisk(); } catch (e) { console.error('Error saving accounts:', e); }
  try { saveSessionsToDisk(); } catch (e) { console.error('Error saving sessions:', e); }

  // Give clients 1.5 seconds to finish any final in-flight HTTP saves and gracefully close
  setTimeout(() => {
    for (const [ws] of clients) {
      try {
        ws.close(1001, 'Server Restarting');
      } catch (e) { }
    }
    clients.clear();
    rooms.clear();

    server.close(() => {
      console.log('[VELSCOUR ONLINE] Server stopped cleanly. Ready for update.');
      process.exit(0);
    });

    // Fallback force exit after 4s
    setTimeout(() => process.exit(0), 4000);
  }, 1500);
}

function getChannelPlayers(channel) {
  const list = [];
  for (const [, c] of clients) {
    if (c.channel === channel && !c.room) {
      list.push({
        id: c.id,
        name: c.name,
        classId: c.classId,
        level: c.level,
        title: c.title,
        gear: c.gear,
      });
    }
  }
  return list;
}

function getRoomList() {
  const list = [];
  const now = Date.now();
  for (const [name, r] of rooms) {
    const activePlayers = r.players.filter(p => !p.disconnected);
    list.push({
      name,
      hasPassword: !!r.password,
      maxPlayers: r.maxPlayers,
      playerCount: r.players.length,
      activeCount: activePlayers.length,
      hostName: r.hostName,
      depth: r.depth,
      biome: r.biome,
      elapsed: Math.floor((now - r.startTime) / 1000),
      isHostAway: activePlayers.length === 0,
      players: r.players.map(p => ({
        name: p.name,
        classId: p.classId,
        level: p.level,
        title: p.title,
        disconnected: !!p.disconnected,
      })),
    });
  }
  return list;
}

function broadcastLobbyUpdate() {
  const channelPlayers = getChannelPlayers(DEFAULT_CHANNEL);
  const roomList = getRoomList();
  const updateMsg = JSON.stringify({
    type: 'lobby_update',
    channel: DEFAULT_CHANNEL,
    players: channelPlayers,
    rooms: roomList,
  });
  broadcastToChannel(DEFAULT_CHANNEL, updateMsg);
  broadcastFriendsPresenceUpdate();
}

function handleWhisper(ws, clientData, text) {
  const parts = text.split(' ');
  const targetName = parts[1];
  const whisperText = parts.slice(2).join(' ');
  if (!targetName || !whisperText) {
    ws.send(JSON.stringify({ type: 'chat', kind: 'system', text: 'Usage: /w <playername> <message>', color: '#ff6060', time: Date.now() }));
    return;
  }
  let foundWs = null;
  let foundData = null;
  for (const [otherWs, otherData] of clients) {
    if (otherData.name && otherData.name.toLowerCase() === targetName.toLowerCase()) {
      foundWs = otherWs;
      foundData = otherData;
      break;
    }
  }
  if (foundWs) {
    clientData.lastWhisperTo = foundData.name;
    foundData.lastWhisperFrom = clientData.name;
    const payloadRecipient = {
      type: 'chat',
      kind: 'whisper',
      from: clientData.name,
      fromId: clientData.id,
      to: foundData.name,
      text: whisperText,
      color: '#d870ff',
      time: Date.now(),
    };
    const payloadSender = {
      type: 'chat',
      kind: 'whisper_sent',
      from: clientData.name,
      fromId: clientData.id,
      to: foundData.name,
      text: whisperText,
      color: '#d870ff',
      time: Date.now(),
    };
    foundWs.send(JSON.stringify(payloadRecipient));
    ws.send(JSON.stringify(payloadSender));
  } else {
    ws.send(JSON.stringify({
      type: 'chat',
      kind: 'system',
      text: `Player '${targetName}' is not online.`,
      color: '#ff6060',
      time: Date.now(),
    }));
  }
}

function handleReply(ws, clientData, text) {
  if (!clientData.lastWhisperFrom) {
    ws.send(JSON.stringify({
      type: 'chat',
      kind: 'system',
      text: 'Nobody has whispered you yet to reply to.',
      color: '#ff6060',
      time: Date.now(),
    }));
    return;
  }
  const replyText = text.replace(/^\/(?:r|reply)\s*/, '').trim();
  if (!replyText) {
    ws.send(JSON.stringify({
      type: 'chat',
      kind: 'system',
      text: `Usage: /r <message> (replies to ${clientData.lastWhisperFrom})`,
      color: '#ff6060',
      time: Date.now(),
    }));
    return;
  }
  handleWhisper(ws, clientData, `/w ${clientData.lastWhisperFrom} ${replyText}`);
}

function handlePlayersList(ws, clientData) {
  const online = [];
  for (const [, c] of clients) {
    if (c.name) {
      const loc = c.room ? `[Game: ${c.room}]` : `[Lobby]`;
      online.push(`${c.name} ${loc}`);
    }
  }
  ws.send(JSON.stringify({
    type: 'chat',
    kind: 'system',
    text: `Online Heroes (${online.length}): ${online.join(', ')}`,
    color: '#ffd34a',
    time: Date.now(),
  }));
}

// ------------------------------------------------------------------ Friends List Manager
function resolveFriendPresence(friendName) {
  const nameTrimmed = String(friendName || '').trim();
  const nameLower = nameTrimmed.toLowerCase();

  // 1. Check if currently online on any connected client
  for (const [ws, c] of clients) {
    if (c.name && c.name.toLowerCase() === nameLower && ws.readyState === WebSocket.OPEN) {
      return {
        name: c.name,
        level: c.level || 1,
        classId: c.classId || 'paladin',
        online: true,
        status: c.room ? 'room' : 'lobby',
        roomName: c.room || null,
      };
    }
  }

  // 2. Check registered online characters database
  const reg = onlineCharNames.get(nameLower);
  if (reg && reg.accountId) {
    const chars = loadAccountCharacters(reg.accountId);
    const found = chars.find(ch => ch && ch.id === reg.charId);
    if (found) {
      return {
        name: found.name || reg.name,
        level: found.level || 1,
        classId: found.classId || 'paladin',
        online: false,
        status: 'offline',
        roomName: null,
      };
    }
  }

  // 3. Fallback
  return {
    name: nameTrimmed,
    level: 1,
    classId: 'paladin',
    online: false,
    status: 'offline',
    roomName: null,
  };
}

function sendFriendsList(ws, clientData) {
  let accountId = clientData.accountId;
  if (!accountId && clientData.name) {
    const info = onlineCharNames.get(clientData.name.trim().toLowerCase());
    if (info) accountId = info.accountId;
  }
  const acc = accountId ? accountsById.get(accountId) : null;
  const friendNames = (acc && Array.isArray(acc.friends)) ? acc.friends : [];
  const list = friendNames.map(fName => resolveFriendPresence(fName));

  // Sort: online friends first, then level descending, then name
  list.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (b.level !== a.level) return b.level - a.level;
    return a.name.localeCompare(b.name);
  });

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'friends_list',
      friends: list,
    }));
  }
  return list;
}

function broadcastFriendsPresenceUpdate() {
  for (const [ws, c] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      sendFriendsList(ws, c);
    }
  }
}

function handleAddFriend(ws, clientData, rawTargetName) {
  const targetName = String(rawTargetName || '').trim();
  if (!targetName) {
    ws.send(JSON.stringify({ type: 'friend_error', message: 'Please specify a character name to add.' }));
    return;
  }
  if (clientData.name && targetName.toLowerCase() === clientData.name.toLowerCase()) {
    ws.send(JSON.stringify({ type: 'friend_error', message: 'You cannot add yourself to your friends list.' }));
    return;
  }
  let accountId = clientData.accountId;
  if (!accountId && clientData.name) {
    const info = onlineCharNames.get(clientData.name.trim().toLowerCase());
    if (info) accountId = info.accountId;
  }
  if (!accountId) {
    ws.send(JSON.stringify({ type: 'friend_error', message: 'Online account required to manage friends.' }));
    return;
  }
  const acc = accountsById.get(accountId);
  if (!acc) {
    ws.send(JSON.stringify({ type: 'friend_error', message: 'Account not found.' }));
    return;
  }
  acc.friends = Array.isArray(acc.friends) ? acc.friends : [];

  let actualName = targetName;
  let exists = false;
  for (const [, c] of clients) {
    if (c.name && c.name.toLowerCase() === targetName.toLowerCase()) {
      actualName = c.name;
      exists = true;
      break;
    }
  }
  if (!exists) {
    const reg = onlineCharNames.get(targetName.toLowerCase());
    if (reg) {
      actualName = reg.name;
      exists = true;
    }
  }
  if (!exists) {
    ws.send(JSON.stringify({ type: 'friend_error', message: `Character "${targetName}" does not exist.` }));
    return;
  }

  if (acc.friends.some(f => f.toLowerCase() === actualName.toLowerCase())) {
    ws.send(JSON.stringify({ type: 'friend_error', message: `${actualName} is already on your friends list.` }));
    return;
  }

  acc.friends.push(actualName);
  saveAccountsToDisk();
  sendFriendsList(ws, clientData);
  ws.send(JSON.stringify({
    type: 'chat',
    kind: 'system',
    text: `Added ${actualName} to your friends list.`,
    color: '#34d399',
    time: Date.now(),
  }));
}

function handleRemoveFriend(ws, clientData, rawTargetName) {
  const targetName = String(rawTargetName || '').trim();
  if (!targetName) {
    ws.send(JSON.stringify({ type: 'friend_error', message: 'Please specify a character name to remove.' }));
    return;
  }
  let accountId = clientData.accountId;
  if (!accountId && clientData.name) {
    const info = onlineCharNames.get(clientData.name.trim().toLowerCase());
    if (info) accountId = info.accountId;
  }
  if (!accountId) return;
  const acc = accountsById.get(accountId);
  if (!acc || !Array.isArray(acc.friends)) return;

  const initialLen = acc.friends.length;
  acc.friends = acc.friends.filter(f => f.toLowerCase() !== targetName.toLowerCase());
  if (acc.friends.length !== initialLen) {
    saveAccountsToDisk();
    sendFriendsList(ws, clientData);
    ws.send(JSON.stringify({
      type: 'chat',
      kind: 'system',
      text: `Removed ${targetName} from your friends list.`,
      color: '#ffd34a',
      time: Date.now(),
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'friend_error',
      message: `${targetName} is not on your friends list.`,
    }));
  }
}

function handleFriendCommand(ws, clientData, text) {
  const parts = text.trim().split(/\s+/);
  const sub = (parts[1] || '').toLowerCase();
  const nameArg = parts.slice(2).join(' ').trim();

  if (sub === 'add' || sub === 'a') {
    handleAddFriend(ws, clientData, nameArg);
    return;
  }
  if (sub === 'remove' || sub === 'rm' || sub === 'del' || sub === 'delete') {
    handleRemoveFriend(ws, clientData, nameArg);
    return;
  }
  if (sub === 'list' || sub === 'l' || !sub) {
    const list = sendFriendsList(ws, clientData);
    if (!list || list.length === 0) {
      ws.send(JSON.stringify({
        type: 'chat',
        kind: 'system',
        text: 'Your friends list is empty. Add friends using /f add <name> or the Friends button.',
        color: '#ffd34a',
        time: Date.now(),
      }));
    } else {
      const onlineCount = list.filter(f => f.online).length;
      ws.send(JSON.stringify({
        type: 'chat',
        kind: 'system',
        text: `Friends List (${onlineCount}/${list.length} Online):`,
        color: '#ffd34a',
        time: Date.now(),
      }));
      for (const f of list) {
        const clsName = (f.classId || 'Hero').charAt(0).toUpperCase() + (f.classId || 'Hero').slice(1);
        let loc = 'Offline';
        if (f.online) {
          loc = f.status === 'room' ? `Game: "${f.roomName}"` : 'Lobby';
        }
        ws.send(JSON.stringify({
          type: 'chat',
          kind: 'system',
          text: `• ${f.name} (Lv ${f.level} ${clsName}) — ${loc}`,
          color: f.online ? '#34d399' : '#8a7660',
          time: Date.now(),
        }));
      }
    }
    return;
  }

  ws.send(JSON.stringify({
    type: 'chat',
    kind: 'system',
    text: 'Usage: /f add <name>, /f remove <name>, or /f list',
    color: '#ff6060',
    time: Date.now(),
  }));
}

wss.on('connection', (ws) => {
  if (ws._socket && ws._socket.setNoDelay) {
    ws._socket.setNoDelay(true);
  }
  const clientId = 'c_' + (clientIdSeq++);
  const clientData = {
    id: clientId,
    name: 'Adventurer',
    classId: 'paladin',
    level: 1,
    title: 'Wanderer',
    gear: null,
    channel: DEFAULT_CHANNEL,
    room: null,
    gemClicks: 0,
    lastWhisperFrom: null,
    lastWhisperTo: null,
  };
  clients.set(ws, clientData);

  if (shutdownState.inProgress) {
    const msLeft = Math.max(0, shutdownState.targetTime - Date.now());
    const secLeft = Math.ceil(msLeft / 1000);
    const minLeft = Math.ceil(secLeft / 60);
    try {
      ws.send(JSON.stringify({
        type: 'server_shutdown_warning',
        secondsLeft: secLeft,
        minutesLeft: minLeft,
        reason: shutdownState.reason,
        message: `[SERVER RESTART] The server is restarting for an update in ${secLeft >= 60 ? `${minLeft} minute(s)` : `${secLeft} second(s)`}! Please get to a safe place and Save & Exit to avoid data loss.`,
      }));
    } catch (e) { }
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    switch (msg.type) {
      case 'ping': {
        clientData.lastSeen = Date.now();
        ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
        break;
      }

      case 'enter_lobby': {
        if (msg.reconnectId) {
          clientData.id = msg.reconnectId;
        }
        const serverVer = getPackageInfo().version || '';
        if (msg.clientVersion && compareVersions(serverVer, msg.clientVersion) > 0) {
          ws.send(JSON.stringify({
            type: 'version_outdated',
            serverVersion: serverVer,
            clientVersion: msg.clientVersion,
            message: `Your client version (v${msg.clientVersion}) is outdated. Please update to v${serverVer} to play online.`
          }));
          ws.close();
          break;
        }

        const incomingName = (msg.name || 'Hero').slice(0, 24);
        const incomingNameLower = incomingName.trim().toLowerCase();
        const incomingCharId = msg.charId ? String(msg.charId) : null;

        // If this character is already online on another connection/device, kick the previous session offline
        for (const [otherWs, otherClient] of Array.from(clients.entries())) {
          if (otherWs === ws) continue;
          const sameCharId = !!(incomingCharId && otherClient.charId && otherClient.charId === incomingCharId);
          const sameName = !!(incomingNameLower && otherClient.name && otherClient.name.trim().toLowerCase() === incomingNameLower);
          if (!sameCharId && !sameName) continue;

          otherClient.kicked = true;
          if (otherClient.room) {
            const oldRoomName = otherClient.room;
            const oldRoom = rooms.get(oldRoomName);
            otherClient.room = null;
            if (oldRoom) {
              const leaving = oldRoom.players.filter(p => p.id === otherClient.id || (p.name && p.name.trim().toLowerCase() === incomingNameLower));
              for (const lp of leaving) {
                if (lp.disconnectTimer) clearTimeout(lp.disconnectTimer);
              }
              // Only remove from the room if the new session isn't reconnecting right into that same room
              if (msg.reconnectRoom !== oldRoomName) {
                oldRoom.players = oldRoom.players.filter(p => p.id !== otherClient.id && (!p.name || p.name.trim().toLowerCase() !== incomingNameLower));
                broadcastToRoom(oldRoomName, {
                  type: 'player_left_room',
                  playerId: otherClient.id,
                  playerName: otherClient.name,
                }, otherWs);
                if (oldRoom.players.length === 0) {
                  if (oldRoom.cleanupTimer) clearTimeout(oldRoom.cleanupTimer);
                  rooms.delete(oldRoomName);
                } else if (oldRoom.hostId === otherClient.id) {
                  const nextHost = oldRoom.players.find(p => !p.disconnected) || oldRoom.players[0];
                  if (nextHost) {
                    oldRoom.hostId = nextHost.id;
                    oldRoom.hostName = nextHost.name;
                    broadcastToRoom(oldRoomName, {
                      type: 'host_migrated',
                      hostId: oldRoom.hostId,
                      hostName: oldRoom.hostName,
                    }, otherWs);
                  }
                }
              }
            }
          }

          clients.delete(otherWs);
          if (otherWs.readyState === WebSocket.OPEN) {
            try {
              otherWs.send(JSON.stringify({
                type: 'session_kicked',
                charName: incomingName,
                message: `${incomingName} was logged into from another device. Your previous session has been disconnected.`,
              }));
            } catch (e) { }
            try {
              otherWs.close(4001, 'Logged in from another device');
            } catch (e) { }
          }
        }

        const charReg = onlineCharNames.get(incomingNameLower);
        clientData.accountId = msg.accountId || (charReg && charReg.accountId) || null;
        clientData.charId = incomingCharId;
        clientData.name = incomingName;
        clientData.classId = msg.classId || 'paladin';
        clientData.level = parseInt(msg.level, 10) || 1;
        clientData.title = msg.title || (clientData.level >= 50 ? 'Matriarch' : clientData.level >= 20 ? 'Slayer' : 'Hero');
        clientData.gear = msg.gear || null;
        clientData.banner = msg.banner || null;
        clientData.channel = DEFAULT_CHANNEL;
        clientData.disconnected = false;
        clientData.kicked = false;

        // Check if reconnecting to an existing room still in its grace period, or restore room after server reboot
        let reconnectedRoom = null;
        if (msg.reconnectRoom) {
          if (rooms.has(msg.reconnectRoom)) {
            const room = rooms.get(msg.reconnectRoom);
            if (room) {
              if (room.cleanupTimer) {
                clearTimeout(room.cleanupTimer);
                room.cleanupTimer = null;
              }
              clientData.room = room.name;
              const existingIdx = room.players.findIndex(p => p.id === clientData.id || p.name === clientData.name);
              if (existingIdx >= 0) {
                room.players[existingIdx] = clientData;
              } else {
                room.players.push(clientData);
              }
              if (room.hostId === clientData.id || room.hostName === clientData.name || room.players.length === 1) {
                room.hostId = clientData.id;
                room.hostName = clientData.name;
              }
              reconnectedRoom = room;
            }
          } else if (msg.reconnectRoomData && msg.reconnectRoomData.name === msg.reconnectRoom) {
            const rd = msg.reconnectRoomData;
            const seed = parseInt(rd.seed, 10) || parseInt(rd.townSeed, 10) || (Math.floor(Math.random() * 1e9) + 1);
            const depth = Math.min(500, Math.max(1, parseInt(rd.depth, 10) || 1));
            const restoredRoom = {
              name: String(rd.name).slice(0, 24),
              password: String(rd.password || '').trim(),
              maxPlayers: Math.max(2, Math.min(4, parseInt(rd.maxPlayers, 10) || 4)),
              depth,
              biome: rd.biome || 'town',
              seed,
              townSeed: parseInt(rd.townSeed, 10) || seed,
              dungeonSeed: rd.dungeonSeed ? parseInt(rd.dungeonSeed, 10) : ((((seed * 31 + depth * 7919) ^ 0x41c64e6d) >>> 0) || 1234567),
              mixId: rd.mixId || null,
              heresies: Array.isArray(rd.heresies) ? rd.heresies : [],
              startTime: Date.now(),
              hostId: rd.hostId || clientData.id,
              hostName: rd.hostName || clientData.name,
              players: [clientData],
              groundLoot: new Map(),
              killedMonsters: new Map(),
              unsealedDepths: new Set(Array.isArray(rd.unsealedDepths) ? rd.unsealedDepths : []),
            };
            if (Array.isArray(rd.killed) && depth > 0) {
              const kSet = new Set(rd.killed);
              restoredRoom.killedMonsters.set(depth, kSet);
            }
            rooms.set(restoredRoom.name, restoredRoom);
            clientData.room = restoredRoom.name;
            reconnectedRoom = restoredRoom;
            console.log(`[Velscour Online] Room "${restoredRoom.name}" restored after server restart by player ${clientData.name} (${clientData.id})`);
            broadcastLobbyUpdate();
          }
        }
        if (!reconnectedRoom) {
          clientData.room = null;
        }

        // Send welcome packet
        ws.send(JSON.stringify({
          type: 'lobby_welcome',
          id: clientData.id,
          channel: DEFAULT_CHANNEL,
          players: getChannelPlayers(DEFAULT_CHANNEL),
          rooms: getRoomList(),
          serverVersion: getPackageInfo().version || '',
        }));

        if (reconnectedRoom) {
          ws.send(JSON.stringify({
            type: 'room_reconnected',
            room: {
              name: reconnectedRoom.name,
              seed: reconnectedRoom.seed,
              townSeed: reconnectedRoom.townSeed || reconnectedRoom.seed,
              dungeonSeed: reconnectedRoom.dungeonSeed || null,
              depth: reconnectedRoom.depth,
              biome: reconnectedRoom.biome,
              hostId: reconnectedRoom.hostId,
              mixId: reconnectedRoom.mixId || null,
              heresies: reconnectedRoom.heresies || [],
              killed: Array.from(reconnectedRoom.killedMonsters?.get(reconnectedRoom.depth) || []),
              unsealedDepths: Array.from(reconnectedRoom.unsealedDepths || []),
              players: reconnectedRoom.players.map(p => ({
                id: p.id,
                name: p.name,
                classId: p.classId,
                level: p.level,
                title: p.title,
                gear: p.gear,
              })),
            },
          }));
          broadcastToRoom(reconnectedRoom.name, {
            type: 'player_reconnected',
            playerId: clientData.id,
            playerName: clientData.name,
          }, ws);
        }

        // Send Diablo 2 Battle.net welcome system lines
        const totalOnline = clients.size;
        ws.send(JSON.stringify({
          type: 'chat',
          text: `You have joined channel: ${DEFAULT_CHANNEL}`,
          color: '#3a8aff',
          kind: 'system',
        }));
        ws.send(JSON.stringify({
          type: 'chat',
          text: `There are currently ${totalOnline} heroes journeying across Sanctuary.`,
          color: '#5a9aff',
          kind: 'system',
        }));
        ws.send(JSON.stringify({
          type: 'chat',
          text: `Welcome to VELSCOUR ONLINE. Type /help for chat commands.`,
          color: '#ffd34a',
          kind: 'system',
        }));

        broadcastLobbyUpdate();
        sendFriendsList(ws, clientData);
        break;
      }

      case 'chat': {
        const text = String(msg.text || '').trim();
        if (!text) break;

        // Commands
        if (text.startsWith('/w ') || text.startsWith('/whisper ')) {
          handleWhisper(ws, clientData, text);
          break;
        }

        if (text.startsWith('/r ') || text.startsWith('/reply ') || text === '/r' || text === '/reply') {
          handleReply(ws, clientData, text);
          break;
        }

        if (text.startsWith('/f ') || text.startsWith('/friend ') || text === '/f' || text === '/friend') {
          handleFriendCommand(ws, clientData, text);
          break;
        }

        if (text === '/help') {
          ws.send(JSON.stringify({
            type: 'chat',
            kind: 'system',
            text: `Commands: /w <name> <msg> (Whisper), /r <msg> (Reply), /f <add|remove|list> (Friends), /p <msg> (Party), /l <msg> (Lobby), /players (List players)`,
            color: '#ffd34a',
            time: Date.now(),
          }));
          break;
        }

        if (text.startsWith('/f ') || text.startsWith('/friend ') || text === '/f' || text === '/friend') {
          handleFriendCommand(ws, clientData, text);
          break;
        }

        if (text === '/players' || text === '/who') {
          handlePlayersList(ws, clientData);
          break;
        }

        if (text.startsWith('/me ')) {
          const action = text.slice(4).trim();
          broadcastToChannel(clientData.channel || DEFAULT_CHANNEL, {
            type: 'chat',
            kind: 'emote',
            text: `* ${clientData.name} ${action}`,
            color: '#ffc040',
            time: Date.now(),
          });
          break;
        }

        if (text.startsWith('/p ') || text.startsWith('/party ')) {
          if (clientData.room) {
            const pText = text.replace(/^\/(?:p|party)\s+/, '').trim();
            broadcastToRoom(clientData.room, {
              type: 'game_party_chat',
              fromId: clientData.id,
              from: clientData.name,
              text: pText,
              time: Date.now(),
            }, ws);
          } else {
            ws.send(JSON.stringify({
              type: 'chat',
              kind: 'system',
              text: 'You are not in a game room.',
              color: '#ff6060',
              time: Date.now(),
            }));
          }
          break;
        }

        // Standard global channel chat
        broadcastToChannel(clientData.channel || DEFAULT_CHANNEL, {
          type: 'chat',
          kind: 'channel',
          from: clientData.name,
          classId: clientData.classId,
          level: clientData.level,
          text: text,
          color: '#e9dcc4',
          time: Date.now(),
        });
        break;
      }

      case 'gem_click': {
        clientData.gemClicks = (clientData.gemClicks || 0) + 1;
        const roll = Math.random();
        let gemText = clientData.gemClicks % 2 === 1 ? 'Gem Activated' : 'Gem Deactivated';
        let gemColor = '#c040ff';

        if (roll < 0.05) {
          gemText = 'Perfect Gem Activated';
          gemColor = '#ff40d0';
        } else if (roll < 0.08) {
          gemText = 'Murloc sounds echo from the abyss...';
          gemColor = '#3ee0e0';
        }

        ws.send(JSON.stringify({
          type: 'chat',
          kind: 'gem',
          text: gemText,
          color: gemColor,
        }));
        break;
      }

      case 'refresh_lobby': {
        ws.send(JSON.stringify({
          type: 'lobby_update',
          channel: clientData.channel || DEFAULT_CHANNEL,
          players: getChannelPlayers(clientData.channel || DEFAULT_CHANNEL),
          rooms: getRoomList(),
        }));
        break;
      }

      case 'create_room': {
        const rawName = String(msg.name || '').trim();
        const roomName = (rawName || `${clientData.name}'s Game`).slice(0, 24);
        const password = String(msg.password || '').trim();
        const maxPlayers = Math.max(2, Math.min(4, parseInt(msg.maxPlayers, 10) || 4));
        const depth = Math.min(500, Math.max(1, parseInt(msg.depth, 10) || 1));
        const biome = msg.biome || 'town';
        const seed = parseInt(msg.seed, 10) || (Math.floor(Math.random() * 1e9) + 1);

        if (rooms.has(roomName)) {
          ws.send(JSON.stringify({ type: 'room_error', message: `A game named "${roomName}" already exists.` }));
          break;
        }

        const pool = ['catacombs', 'castle_keep', 'frozen', 'ice_temple', 'molten', 'fungal', 'sunken', 'blood', 'ashen', 'void', 'gilded', 'plague', 'crystal', 'desert', 'shadow', 'forge', 'abyss', 'thorn', 'storm', 'obsidian', 'flesh', 'serpent', 'shattered', 'library', 'sewers', 'necropolis', 'cathedral', 'amber', 'desert_temple', 'hell', 'astral_plane', 'heavenly'];
        const defaultBiome = pool[Math.abs(((seed * 31 + depth * 7919) ^ 0x5bd1e995) | 0) % pool.length];
        const initialBiome = msg.biome || 'town';
        const initialDungeonSeed = (((seed * 31 + depth * 7919) ^ 0x41c64e6d) >>> 0) || 1234567;

        const roomData = {
          name: roomName,
          password,
          maxPlayers,
          depth,
          biome: initialBiome,
          seed,
          townSeed: seed,
          dungeonSeed: initialDungeonSeed,
          heresies: Array.isArray(msg.heresies) ? msg.heresies : [],
          startTime: Date.now(),
          hostId: clientData.id,
          hostName: clientData.name,
          players: [clientData],
          groundLoot: new Map(),
          killedMonsters: new Map(),
          unsealedDepths: new Set(),
        };
        rooms.set(roomName, roomData);
        clientData.room = roomName;

        ws.send(JSON.stringify({
          type: 'room_joined',
          room: {
            name: roomData.name,
            seed: roomData.seed,
            townSeed: roomData.townSeed || roomData.seed,
            dungeonSeed: roomData.dungeonSeed || null,
            depth: roomData.depth,
            biome: roomData.biome,
            hostId: roomData.hostId,
            maxPlayers: roomData.maxPlayers,
            mixId: roomData.mixId || null,
            heresies: roomData.heresies || [],
            killed: Array.from(roomData.killedMonsters?.get(roomData.depth) || []),
            unsealedDepths: Array.from(roomData.unsealedDepths || []),
            players: roomData.players.map(p => ({
              id: p.id,
              name: p.name,
              classId: p.classId,
              level: p.level,
              title: p.title,
              gear: p.gear,
              banner: p.banner || null,
              bardTabs: p.bardTabs || null,
            })),
          },
        }));

        broadcastLobbyUpdate();
        break;
      }

      case 'join_room': {
        const roomName = String(msg.name || '').trim();
        const password = String(msg.password || '').trim();
        const room = rooms.get(roomName);

        if (!room) {
          ws.send(JSON.stringify({ type: 'room_error', message: `Game "${roomName}" does not exist.` }));
          break;
        }
        if (room.players.length >= room.maxPlayers) {
          ws.send(JSON.stringify({ type: 'room_error', message: `Game "${roomName}" is full.` }));
          break;
        }
        if (room.password && room.password !== password) {
          ws.send(JSON.stringify({ type: 'room_error', message: `Incorrect password for game "${roomName}".` }));
          break;
        }

        // Clean up any existing or disconnected instance of this player in the room
        const existingIdx = room.players.findIndex(p => p.id === clientData.id || p.name === clientData.name);
        if (existingIdx >= 0) {
          const oldP = room.players[existingIdx];
          if (oldP.disconnectTimer) clearTimeout(oldP.disconnectTimer);
          room.players.splice(existingIdx, 1);
          broadcastToRoom(roomName, {
            type: 'player_left_room',
            playerId: oldP.id,
            playerName: oldP.name,
          }, ws);
        }

        clientData.room = roomName;
        clientData.disconnected = false;
        if (msg.bardTabs) clientData.bardTabs = msg.bardTabs;
        room.players.push(clientData);

        // Notify room members
        broadcastToRoom(roomName, {
          type: 'player_joined_room',
          player: {
            id: clientData.id,
            name: clientData.name,
            classId: clientData.classId,
            level: clientData.level,
            title: clientData.title,
            gear: clientData.gear,
            banner: clientData.banner || null,
            bardTabs: clientData.bardTabs || null,
          },
        }, ws);

        // Send room state to joining player
        ws.send(JSON.stringify({
          type: 'room_joined',
          room: {
            name: room.name,
            seed: room.seed,
            townSeed: room.townSeed || room.seed,
            dungeonSeed: room.dungeonSeed || null,
            depth: room.depth,
            biome: room.biome,
            hostId: room.hostId,
            maxPlayers: room.maxPlayers,
            mixId: room.mixId || null,
            heresies: room.heresies || [],
            killed: Array.from(room.killedMonsters?.get(room.depth) || []),
            unsealedDepths: Array.from(room.unsealedDepths || []),
            players: room.players.map(p => ({
              id: p.id,
              name: p.name,
              classId: p.classId,
              level: p.level,
              title: p.title,
              gear: p.gear,
              banner: p.banner || null,
              bardTabs: p.bardTabs || null,
            })),
          },
        }));

        broadcastLobbyUpdate();
        break;
      }

      case 'leave_room': {
        if (!clientData.room) break;
        const roomName = clientData.room;
        const room = rooms.get(roomName);
        clientData.room = null;

        if (room) {
          const leaving = room.players.filter(p => p.id === clientData.id || p.name === clientData.name);
          for (const lp of leaving) {
            if (lp.disconnectTimer) clearTimeout(lp.disconnectTimer);
          }
          room.players = room.players.filter(p => p.id !== clientData.id && p.name !== clientData.name);
          broadcastToRoom(roomName, {
            type: 'player_left_room',
            playerId: clientData.id,
            playerName: clientData.name,
          });

          if (room.players.length === 0) {
            if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
            rooms.delete(roomName);
          } else if (room.hostId === clientData.id) {
            const nextHost = room.players.find(p => !p.disconnected) || room.players[0];
            room.hostId = nextHost.id;
            room.hostName = nextHost.name;
            broadcastToRoom(roomName, {
              type: 'host_migrated',
              hostId: room.hostId,
              hostName: room.hostName,
            });
          }
        }

        ws.send(JSON.stringify({
          type: 'left_room',
          channel: DEFAULT_CHANNEL,
          players: getChannelPlayers(DEFAULT_CHANNEL),
          rooms: getRoomList(),
        }));

        broadcastLobbyUpdate();
        break;
      }

      // ------------------------------------------------ Friends Management
      case 'friend_list': {
        sendFriendsList(ws, clientData);
        break;
      }

      case 'friend_add': {
        handleAddFriend(ws, clientData, msg.name);
        break;
      }

      case 'friend_remove': {
        handleRemoveFriend(ws, clientData, msg.name);
        break;
      }

      // ------------------------------------------------ Character Save (WebSocket Fallback)
      case 'save_character': {
        const charData = msg.character;
        if (!charData || !charData.id) break;
        let accountId = clientData.accountId;
        if (!accountId && clientData.name) {
          const charInfo = onlineCharNames.get(clientData.name.trim().toLowerCase());
          if (charInfo) accountId = charInfo.accountId;
        }
        if (!accountId && charData.accountId) {
          accountId = charData.accountId;
        }
        if (!accountId) break;
        const characters = loadAccountCharacters(accountId);
        const idx = characters.findIndex(c => c && c.id === charData.id);
        if (idx >= 0) {
          const existing = characters[idx];
          const safeLevel = Math.max(existing.level || 1, charData.level || 1);
          const safeXp = safeLevel > (existing.level || 1)
            ? (charData.xp || 0)
            : (safeLevel === (existing.level || 1) ? Math.max(existing.xp || 0, charData.xp || 0) : existing.xp || 0);
          const safeDeepest = Math.min(500, Math.max(existing.deepest || 1, charData.deepest || 1));
          const safeDepth = Math.min(500, Math.max(existing.depth || 1, charData.depth || 1));

          const levelDeficit = safeLevel - (charData.level || 1);
          const statBonus = levelDeficit > 0 ? (levelDeficit * 5) : 0;
          const skillBonus = levelDeficit > 0 ? levelDeficit : 0;
          const talentBonus = levelDeficit > 0 ? Math.floor(levelDeficit / 5) : 0;

          const safeStatPoints = levelDeficit > 0
            ? Math.max(existing.statPoints || 0, (charData.statPoints || 0) + statBonus)
            : (charData.statPoints != null ? charData.statPoints : (existing.statPoints || 0));
          const safeSkillPoints = levelDeficit > 0
            ? Math.max(existing.skillPoints || 0, (charData.skillPoints || 0) + skillBonus)
            : (charData.skillPoints != null ? charData.skillPoints : (existing.skillPoints || 0));
          const safeTalentPoints = levelDeficit > 0
            ? Math.max(existing.talentPoints || 0, (charData.talentPoints || 0) + talentBonus)
            : (charData.talentPoints != null ? charData.talentPoints : (existing.talentPoints || 0));

          const safeMarks = charData.marks || existing.marks || { pts: 0, xp: 0, spent: { life: 0, crit: 0, mf: 0, rift: 0 } };

          const updated = {
            ...existing,
            ...charData,
            level: safeLevel,
            xp: safeXp,
            depth: safeDepth,
            deepest: safeDeepest,
            statPoints: safeStatPoints,
            skillPoints: safeSkillPoints,
            talentPoints: safeTalentPoints,
            marks: safeMarks,
            cleared: { ...(existing.cleared || {}), ...(charData.cleared || {}) },
            id: existing.id,
            name: existing.name,
            classId: existing.classId || charData.classId,
            isOnline: true,
            accountId: accountId,
            lastPlayed: Date.now(),
          };
          characters[idx] = updated;
          saveAccountCharacters(accountId, characters);
          clientData.level = safeLevel;
          broadcastLobbyUpdate();
          ws.send(JSON.stringify({
            type: 'character_saved',
            ok: true,
            charId: charData.id,
            level: safeLevel,
          }));
        }
        break;
      }

      case 'save_reliquary': {
        const relData = msg.reliquary;
        if (!relData) break;
        let accountId = clientData.accountId;
        if (!accountId && msg.accountId) accountId = msg.accountId;
        if (!accountId && clientData.name) {
          const charInfo = onlineCharNames.get(clientData.name.trim().toLowerCase());
          if (charInfo) accountId = charInfo.accountId;
        }
        if (!accountId) break;
        saveAccountReliquary(accountId, relData);
        const updateJson = JSON.stringify({ type: 'reliquary_updated', reliquary: relData });
        for (const [otherWs, c] of clients) {
          let cAcc = c.accountId;
          if (!cAcc && c.name) {
            const reg = onlineCharNames.get(c.name.trim().toLowerCase());
            if (reg) cAcc = reg.accountId;
          }
          if (cAcc === accountId && otherWs !== ws && otherWs.readyState === WebSocket.OPEN) {
            try { otherWs.send(updateJson); } catch (e) { }
          }
        }
        break;
      }

      // ------------------------------------------------ In-Game State Relay
      case 'game_player_state': {
        if (msg.gear) clientData.gear = msg.gear;
        if (msg.banner !== undefined) clientData.banner = msg.banner;
        if (typeof msg.level === 'number' && msg.level !== clientData.level) {
          clientData.level = msg.level;
          broadcastLobbyUpdate(); // a level-up mid-game shows in the lobby's player and room lists right away
        }
        if (!clientData.room) break;
        msg.id = clientData.id;
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

      case 'update_banner': {
        clientData.banner = msg.banner || null;
        if (clientData.room) {
          broadcastToRoom(clientData.room, {
            type: 'game_player_banner',
            id: clientData.id,
            banner: clientData.banner,
          }, ws);
        }
        break;
      }

      case 'update_gear': {
        clientData.gear = msg.gear || null;
        if (msg.banner !== undefined) clientData.banner = msg.banner || null;
        if (typeof msg.level === 'number') clientData.level = msg.level;
        if (clientData.room) {
          broadcastToRoom(clientData.room, {
            type: 'game_player_gear',
            id: clientData.id,
            gear: clientData.gear,
            banner: clientData.banner,
            level: clientData.level,
          }, ws);
        }
        broadcastLobbyUpdate();
        break;
      }

      case 'game_ultimate_cast':
      case 'game_skill_cast': {
        if (!clientData.room) break;
        msg.playerId = clientData.id;
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

      case 'game_bard_tabs': {
        if (!clientData.room) break;
        clientData.bardTabs = {
          tabs: Array.isArray(msg.tabs) ? msg.tabs : [],
          tabAt: Number(msg.tabAt) || 0,
        };
        msg.playerId = clientData.id;
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

const isValidKilledMonsterId = (id) => (typeof id === 'string' && id.length > 0) || (typeof id === 'number' && id > 0 && id < 2000);

      case 'game_monster_hit': {
        if (!clientData.room) break;
        msg.sourceId = clientData.id;
        const room = rooms.get(clientData.room);
        if (room && msg.killed) {
          if (!room.killedMonsters) room.killedMonsters = new Map();
          const d = msg.depth || room.depth || 1;
          let set = room.killedMonsters.get(d);
          if (!set) { set = new Set(); room.killedMonsters.set(d, set); }
          if (typeof msg.netId === 'string' && msg.netId.length > 0) set.add(msg.netId);
          if (isValidKilledMonsterId(msg.monsterIdx)) set.add(msg.monsterIdx);
          if (msg.isBoss || msg.rank === 'boss' || (msg.netId && (String(msg.netId).startsWith('boss_') || String(msg.netId).startsWith('raid_')))) {
            if (!room.unsealedDepths) room.unsealedDepths = new Set();
            room.unsealedDepths.add(d);
            broadcastToRoom(clientData.room, {
              type: 'game_floor_unsealed',
              depth: d,
              bossId: msg.netId || msg.monsterIdx,
              bossName: '',
              sourcePlayerId: clientData.id,
              sourcePlayerName: clientData.name,
            });
          }
        }
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

      case 'game_floor_unsealed': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        const d = msg.depth || (room ? room.depth : 1);
        if (room) {
          if (!room.unsealedDepths) room.unsealedDepths = new Set();
          room.unsealedDepths.add(d);
        }
        broadcastToRoom(clientData.room, {
          type: 'game_floor_unsealed',
          depth: d,
          bossId: msg.bossId || null,
          bossName: msg.bossName || '',
          sourcePlayerId: clientData.id,
          sourcePlayerName: clientData.name,
        });
        break;
      }

      case 'game_monsters_state': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        const d = msg.depth || (room ? room.depth : 1);
        let set = null;
        if (room) {
          if (!room.killedMonsters) room.killedMonsters = new Map();
          set = room.killedMonsters.get(d);
          if (!set) { set = new Set(); room.killedMonsters.set(d, set); }
          if (Array.isArray(msg.killed)) {
            for (const kid of msg.killed) {
              if (isValidKilledMonsterId(kid)) set.add(kid);
            }
          }
        }
        let staleFiltered = false;
        if (room && set && Array.isArray(msg.monsters)) {
          msg.monsters = msg.monsters.filter(s => {
            if (!s) return false;
            const killed = (s.id && set.has(s.id)) || (s.idx != null && set.has(s.idx));
            if (killed) {
              staleFiltered = true;
              return false;
            }
            return true;
          });
          if (staleFiltered) {
            ws.send(JSON.stringify({
              type: 'dungeon_killed_sync',
              depth: d,
              killed: Array.from(set),
              unsealed: room.unsealedDepths ? room.unsealedDepths.has(d) : false,
              unsealedDepths: Array.from(room.unsealedDepths || []),
            }));
          }
        }
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

      case 'request_dungeon_state': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        if (!room) break;
        const d = msg.depth || room.depth || 1;
        const set = room.killedMonsters ? room.killedMonsters.get(d) : null;
        ws.send(JSON.stringify({
          type: 'dungeon_killed_sync',
          depth: d,
          killed: set ? Array.from(set) : [],
          unsealed: room.unsealedDepths ? room.unsealedDepths.has(d) : false,
          unsealedDepths: Array.from(room.unsealedDepths || []),
        }));
        break;
      }

      case 'game_monster_spawn':
      case 'game_ambush_spawn': {
        if (!clientData.room) break;
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

      case 'game_loot_spawn': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        if (room) {
          if (!room.groundLoot) room.groundLoot = new Map();
          room.groundLoot.set(msg.lootId, {
            lootId: msg.lootId,
            x: msg.x,
            y: msg.y,
            kind: msg.kind,
            item: msg.item,
            amount: msg.amount,
            droppedBy: msg.droppedBy || clientData.name,
            worldKind: msg.worldKind,
            depth: msg.depth,
          });
        }
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

      case 'game_loot_pickup': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        if (room && room.groundLoot) {
          room.groundLoot.delete(msg.lootId);
        }
        msg.pickerId = clientData.id;
        msg.pickerName = clientData.name;
        broadcastToRoom(clientData.room, msg);
        break;
      }

      case 'game_loot_request': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        if (!room || !room.groundLoot) {
          ws.send(JSON.stringify({ type: 'game_ground_loot_sync', loot: [] }));
          break;
        }
        const relevantLoot = [];
        for (const item of room.groundLoot.values()) {
          if (msg.worldKind && item.worldKind !== msg.worldKind) continue;
          if (msg.worldKind === 'dungeon' && msg.depth != null && item.depth !== msg.depth) continue;
          relevantLoot.push(item);
        }
        ws.send(JSON.stringify({ type: 'game_ground_loot_sync', loot: relevantLoot }));
        break;
      }

      case 'game_chat': {
        const text = String(msg.text || '').trim();
        if (!text) break;

        if (text.startsWith('/w ') || text.startsWith('/whisper ')) {
          handleWhisper(ws, clientData, text);
          break;
        }

        if (text.startsWith('/r ') || text.startsWith('/reply ') || text === '/r' || text === '/reply') {
          handleReply(ws, clientData, text);
          break;
        }

        if (text.startsWith('/f ') || text.startsWith('/friend ') || text === '/f' || text === '/friend') {
          handleFriendCommand(ws, clientData, text);
          break;
        }

        if (text === '/players' || text === '/who') {
          handlePlayersList(ws, clientData);
          break;
        }

        if (text.startsWith('/l ') || text.startsWith('/all ') || text.startsWith('/global ')) {
          const lMsg = text.replace(/^\/(?:l|all|global)\s+/, '').trim();
          if (lMsg) {
            broadcastToChannel(clientData.channel || DEFAULT_CHANNEL, {
              type: 'chat',
              kind: 'channel',
              from: clientData.name,
              classId: clientData.classId,
              level: clientData.level,
              text: lMsg,
              color: '#e9dcc4',
              time: Date.now(),
            });
          }
          break;
        }

        if (!clientData.room) break;
        const partyText = text.startsWith('/p ') ? text.slice(3).trim() : (text.startsWith('/party ') ? text.slice(7).trim() : text);
        broadcastToRoom(clientData.room, {
          type: 'game_party_chat',
          fromId: clientData.id,
          from: clientData.name,
          text: partyText,
          time: Date.now(),
        }, ws);
        break;
      }

      case 'room_depth_update':
      case 'game_dungeon_transition': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        if (room && (room.hostId === clientData.id || room.players.some(p => p.id === clientData.id))) {
          if (typeof msg.depth === 'number' && msg.depth > 0) room.depth = Math.min(500, msg.depth);
          if (msg.biome) room.biome = msg.biome;
          if (msg.seed && room.dungeonSeed !== msg.seed) {
            room.dungeonSeed = msg.seed;
            room.killedMonsters?.delete(room.depth);
          }
          if (msg.mixId !== undefined) room.mixId = msg.mixId || null;
          if (Array.isArray(msg.heresies)) room.heresies = msg.heresies;
          broadcastToRoom(clientData.room, {
            type: 'room_depth_sync',
            depth: room.depth,
            biome: room.biome,
            seed: room.dungeonSeed,
            mixId: room.mixId,
            heresies: room.heresies || [],
            killed: Array.from(room.killedMonsters?.get(room.depth) || []),
            unsealed: room.unsealedDepths ? room.unsealedDepths.has(room.depth) : false,
            unsealedDepths: Array.from(room.unsealedDepths || []),
            sourcePlayerId: clientData.id,
            sourcePlayerName: clientData.name,
          });
          broadcastLobbyUpdate();
        }
        break;
      }

      case 'game_town_transition': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        if (room && (room.hostId === clientData.id || room.players.some(p => p.id === clientData.id))) {
          if (typeof msg.depth === 'number' && msg.depth > 0) {
            room.depth = Math.min(500, msg.depth);
          }
          if (room.biome && room.biome !== 'town') {
            room.dungeonBiome = room.biome;
          }
          room.biome = 'town';
          broadcastToRoom(clientData.room, {
            type: 'room_depth_sync',
            depth: room.depth,
            biome: room.biome,
            seed: room.dungeonSeed,
            mixId: room.mixId,
            heresies: room.heresies || [],
            killed: Array.from(room.killedMonsters?.get(room.depth) || []),
            unsealed: room.unsealedDepths ? room.unsealedDepths.has(room.depth) : false,
            unsealedDepths: Array.from(room.unsealedDepths || []),
            sourcePlayerId: clientData.id,
            sourcePlayerName: clientData.name,
          });
          broadcastLobbyUpdate();
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (clientData.kicked) {
      clients.delete(ws);
      return;
    }
    if (clientData.room) {
      const room = rooms.get(clientData.room);
      if (room) {
        const p = room.players.find(pl => pl.id === clientData.id);
        if (p) {
          p.disconnected = true;
          p.disconnectedAt = Date.now();
          if (p.disconnectTimer) clearTimeout(p.disconnectTimer);
          const roomName = clientData.room;
          p.disconnectTimer = setTimeout(() => {
            const r = rooms.get(roomName);
            if (r) {
              const idx = r.players.findIndex(pl => pl.id === clientData.id);
              if (idx >= 0 && r.players[idx].disconnected) {
                const removed = r.players.splice(idx, 1)[0];
                broadcastToRoom(r.name, {
                  type: 'player_left_room',
                  playerId: removed.id,
                  playerName: removed.name,
                });
                broadcastLobbyUpdate();
              }
            }
          }, 15000);
        }
        const activePlayers = room.players.filter(pl => !pl.disconnected);
        if (activePlayers.length === 0) {
          // Grace period: keep room alive for 90s so minimized host/player can return!
          if (!room.cleanupTimer) {
            const roomName = clientData.room;
            room.cleanupTimer = setTimeout(() => {
              const r = rooms.get(roomName);
              if (r && r.players.every(pl => pl.disconnected)) {
                rooms.delete(roomName);
                broadcastLobbyUpdate();
              }
            }, ROOM_GRACE_PERIOD_MS);
          }
        } else {
          broadcastToRoom(clientData.room, {
            type: 'player_disconnected',
            playerId: clientData.id,
            playerName: clientData.name,
          });
          if (room.hostId === clientData.id) {
            room.hostId = activePlayers[0].id;
            room.hostName = activePlayers[0].name;
            broadcastToRoom(clientData.room, {
              type: 'host_migrated',
              hostId: room.hostId,
              hostName: room.hostName,
            });
          }
        }
      }
    }
    clients.delete(ws);
    broadcastLobbyUpdate();
  });
});

server.listen(PORT, () => {
  console.log(`VELSCOUR ONLINE server running on http://localhost:${PORT}`);
  console.log(`WebSocket server listening on ws://localhost:${PORT}/ws`);
});

process.on('uncaughtException', (err) => {
  console.error('[Server UncaughtException]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server UnhandledRejection]', reason);
});
