const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RUNTIME_ITEMS = [
  'index.html',
  'home.html',
  'wiki.html',
  'bestiary.html',
  'classes.html',
  'skills.html',
  'talents.html',
  'gear.html',
  'world.html',
  'lore.html',
  'manifest.webmanifest',
  'assets',
  'css',
  'src',
  'vendor',
];

const EXCLUDED_ASSET_DIRS = new Set([
  'assets/FinalClasses',
  'assets/PrelimMonsters',
  'assets/The_Eternal_Breach_Biome_Pack',
  'assets/The_Eternal_Breach_Expanded_Pack',
  'assets/martialarts',
  'assets/newhelms',
]);

/**
 * Returns true if the relative path (using forward slashes, no leading slash)
 * is a runtime game file/directory that belongs in the mobile bundle and OTA update manifest.
 */
function shouldIncludeRuntimePath(relPath) {
  const rel = String(relPath).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel) return false;

  const parts = rel.split('/');
  for (const part of parts) {
    if (part.startsWith('.')) return false;
  }

  for (const ex of EXCLUDED_ASSET_DIRS) {
    if (rel === ex || rel.startsWith(ex + '/')) return false;
  }

  if (rel.startsWith('assets/source/')) {
    const allowedPrefixes = [
      'assets/source/castle3d/tex',
      'assets/source/airship/textures',
    ];
    for (const prefix of allowedPrefixes) {
      if (rel === prefix || rel.startsWith(prefix + '/') || prefix.startsWith(rel + '/')) {
        return true;
      }
    }
    return false;
  }

  return true;
}

/**
 * Computes a 16-hex-character (64-bit) SHA-256 prefix for a Buffer or file.
 */
function hashFile16(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

/**
 * Generates the differential update manifest for all runtime game files in rootDir.
 * Supports an optional Map cache (relPath -> { mtimeMs, size, h }) for instant incremental updates.
 */
function buildUpdateManifest(rootDir, { version = '0.1.0', cache = null } = {}) {
  const files = {};
  let totalFiles = 0;
  let totalSize = 0;
  let latestMtime = 0;

  function walk(absPath, relPath) {
    if (!shouldIncludeRuntimePath(relPath)) return;
    let st;
    try {
      st = fs.statSync(absPath);
    } catch (e) {
      return;
    }

    if (st.isDirectory()) {
      let children;
      try {
        children = fs.readdirSync(absPath);
      } catch (e) {
        return;
      }
      for (const child of children) {
        walk(path.join(absPath, child), `${relPath}/${child}`);
      }
    } else if (st.isFile()) {
      const normRel = relPath.replace(/\\/g, '/');
      let h = null;
      if (cache) {
        const cached = cache.get(normRel);
        if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
          h = cached.h;
        }
      }
      if (!h) {
        h = hashFile16(absPath);
        if (cache) {
          cache.set(normRel, { mtimeMs: st.mtimeMs, size: st.size, h });
        }
      }
      files[normRel] = { h, s: st.size };
      totalFiles++;
      totalSize += st.size;
      if (st.mtimeMs > latestMtime) latestMtime = st.mtimeMs;
    }
  }

  for (const item of RUNTIME_ITEMS) {
    const abs = path.join(rootDir, item);
    if (fs.existsSync(abs)) {
      walk(abs, item);
    }
  }

  const sortedKeys = Object.keys(files).sort();
  const summaryHasher = crypto.createHash('sha256');
  const sortedFiles = {};
  for (const k of sortedKeys) {
    sortedFiles[k] = files[k];
    summaryHasher.update(`${k}:${files[k].h}:${files[k].s}\n`);
  }
  const manifestHash = summaryHasher.digest('hex').slice(0, 16);

  return {
    version: version || '0.1.0',
    manifestHash,
    buildTime: Math.round(latestMtime || Date.now()),
    totalFiles,
    totalSize,
    files: sortedFiles,
  };
}

module.exports = {
  RUNTIME_ITEMS,
  shouldIncludeRuntimePath,
  hashFile16,
  buildUpdateManifest,
};

