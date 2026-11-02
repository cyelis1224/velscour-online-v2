// DAGYR ONLINE Client Auto-Updater & Differential In-Game OTA Distribution Module
import { UI } from './ui.js';
import { sfx } from '../core/audio.js';

export const CURRENT_BUILD_VERSION = '0.2.3';

const STORAGE_VERSION_KEY = 'Dagyr_installed_version';
const STORAGE_MANIFEST_HASH_KEY = 'Dagyr_installed_manifest_hash';
const STORAGE_LIVE_FILES_KEY = 'Dagyr_live_updated_files';
const LIVE_CACHE_NAME = 'Dagyr-live-update-v1';

/**
 * Detects whether the client is running on Android (Capacitor native wrapper, Android WebView, or Android test mode).
 */
export function isAndroidClient() {
  if (typeof window === 'undefined') return false;
  if (window.DAGYR_TEST_ANDROID) return true;
  if (window.Capacitor?.isNativePlatform?.()) return true;
  return /Android/i.test(navigator.userAgent || '');
}

/**
 * Synchronizes version and manifest hash metadata from the native Android LiveUpdate plugin on boot.
 */
async function syncNativeLiveUpdateInfo() {
  if (typeof window === 'undefined') return null;
  const plugin = window.Capacitor?.Plugins?.LiveUpdate;
  if (!plugin || typeof plugin.getInfo !== 'function') return null;
  try {
    const info = await plugin.getInfo();
    if (info && info.installedVersion) {
      if (compareVersions(info.installedVersion, CURRENT_BUILD_VERSION) >= 0) {
        localStorage.setItem(STORAGE_VERSION_KEY, info.installedVersion);
      }
    }
    if (info && info.installedManifestHash) {
      localStorage.setItem(STORAGE_MANIFEST_HASH_KEY, info.installedManifestHash);
    }
    return info;
  } catch (e) {
    return null;
  }
}

if (typeof window !== 'undefined') {
  syncNativeLiveUpdateInfo().catch(() => { });
}

/**
 * Returns the effective client version.
 * Supports URL param override (?client_version=1.0.0) or localStorage from in-game OTA updates.
 */
export function getClientVersion() {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const forced = params.get('client_version');
      if (forced) return forced;
    } catch (e) { }
    try {
      const saved = localStorage.getItem(STORAGE_VERSION_KEY);
      if (saved) {
        if (compareVersions(saved, CURRENT_BUILD_VERSION) > 0) {
          return saved;
        } else {
          localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_BUILD_VERSION);
        }
      }
    } catch (e) { }
  }
  return CURRENT_BUILD_VERSION;
}

/**
 * Returns the currently installed manifest hash (if known).
 */
export function getInstalledManifestHash() {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('manifest_hash');
    if (forced) return forced;
    return localStorage.getItem(STORAGE_MANIFEST_HASH_KEY) || '';
  } catch (e) {
    return '';
  }
}

export const CLIENT_VERSION = CURRENT_BUILD_VERSION;

let cachedUpdateInfo = null;
let updateCheckPromise = null;
let cachedDeltaPromise = null;
const updateListeners = new Set();

/**
 * Formats byte counts into human-readable strings.
 */
export function formatByteSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

/**
 * Returns whether string v1 is newer than v2 using semantic versioning.
 * e.g. '1.0.1' > '1.0.0' => 1, '1.0.0' < '1.0.1' => -1, equal => 0.
 */
export function compareVersions(v1, v2) {
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

/**
 * Resolves the appropriate HTTP base URL for server API calls, manifest checks, and binary/delta downloads.
 */
export function getServerBaseUrl() {
  if (typeof window === 'undefined') return 'http://localhost:8124';

  const loc = window.location;
  if (loc.protocol.startsWith('http') && loc.host && !loc.host.startsWith('localhost') && !loc.host.startsWith('127.0.0.1')) {
    return loc.origin;
  }

  try {
    const params = new URLSearchParams(loc.search);
    const configured = params.get('server') || localStorage.getItem('dagyr_lobby_server');
    if (configured) {
      if (configured.startsWith('mmo.dagyr.me')) return 'https://mmo.dagyr.me';
      if (configured.startsWith('http://') || configured.startsWith('https://')) {
        return configured.replace(/\/+$/, '');
      }
      const proto = loc.protocol === 'https:' ? 'https:' : 'http:';
      return `${proto}//${configured}`;
    }
  } catch (e) { }

  // If running locally in dev browser (with an explicit port like :8124)
  if ((loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') && loc.port) {
    return loc.origin;
  }

  // Default production tunnel for desktop and native mobile clients
  return 'https://mmo.dagyr.me';
}

/**
 * Hard reload the game assets by clearing browser caches (except active OTA cache if needed),
 * unregistering stale service workers, and performing a cache-busting reload.
 */
export async function hardReload(targetVersion = null, targetManifestHash = null) {
  if (typeof window === 'undefined') return;
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== LIVE_CACHE_NAME).map(k => caches.delete(k)));
    } catch (e) { }
  }
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    } catch (e) { }
  }
  try {
    await fetch(window.location.origin + window.location.pathname + '?_hard=' + Date.now(), {
      cache: 'reload',
      mode: 'no-cors'
    });
  } catch (e) { }
  const u = new URL(window.location.href);
  u.searchParams.set('_v', Date.now().toString());
  u.searchParams.delete('client_version');
  u.searchParams.delete('manifest_hash');
  u.searchParams.delete('test_update');
  if (targetVersion) {
    try { localStorage.setItem(STORAGE_VERSION_KEY, targetVersion); } catch (e) { }
  }
  if (targetManifestHash) {
    try { localStorage.setItem(STORAGE_MANIFEST_HASH_KEY, targetManifestHash); } catch (e) { }
  }
  window.location.replace(u.href);
}

/**
 * Computes a 16-hex-char SHA-256 prefix for an ArrayBuffer using Web Crypto API.
 */
async function sha256Buffer16(arrayBuffer) {
  if (typeof crypto === 'undefined' || !crypto.subtle) return '';
  const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const bytes = new Uint8Array(hashBuf);
  let hex = '';
  for (let i = 0; i < 8 && i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Loads the local bundled update-manifest.json (if present) and merges any locally applied OTA file hashes.
 */
async function getLocalManifestData() {
  let baseManifest = null;
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('update-manifest.json', { cache: 'no-cache' });
      if (res && res.ok) {
        baseManifest = await res.json();
      }
    } catch (e) { }
  }

  const files = Object.assign({}, baseManifest?.files || {});
  try {
    const savedLive = localStorage.getItem(STORAGE_LIVE_FILES_KEY);
    if (savedLive) {
      const parsed = JSON.parse(savedLive);
      if (parsed && parsed.files) {
        Object.assign(files, parsed.files);
      }
      if (Array.isArray(parsed?.deletedFiles)) {
        for (const del of parsed.deletedFiles) {
          delete files[del];
        }
      }
    }
  } catch (e) { }

  return {
    version: getClientVersion(),
    manifestHash: getInstalledManifestHash() || baseManifest?.manifestHash || '',
    files,
  };
}

/**
 * Checks the server for a newer game version or updated file manifest.
 * Returns an object with update status and metadata.
 */
export async function checkForUpdates({ force = false } = {}) {
  if (!force && cachedUpdateInfo) {
    return cachedUpdateInfo;
  }
  if (updateCheckPromise && !force) {
    return updateCheckPromise;
  }

  updateCheckPromise = (async () => {
    await syncNativeLiveUpdateInfo();

    let forceTestUpdate = false;
    if (typeof window !== 'undefined') {
      if (window.DAGYR_TEST_UPDATE) forceTestUpdate = true;
      try {
        if (new URLSearchParams(window.location.search).has('test_update')) forceTestUpdate = true;
      } catch (e) { }
    }

    const baseUrl = getServerBaseUrl();
    const url = `${baseUrl}/api/version?_t=${Date.now()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      let res = null;
      try {
        res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      } catch (e) { }
      clearTimeout(timeoutId);

      if (!res || !res.ok) {
        if (baseUrl !== 'https://mmo.dagyr.me' && (!window.DAGYR_TEST_MENU || forceTestUpdate)) {
          try {
            const fallbackRes = await fetch(`https://mmo.dagyr.me/api/version?_t=${Date.now()}`, { cache: 'no-store' });
            if (fallbackRes && fallbackRes.ok) {
              res = fallbackRes;
            }
          } catch (e) { }
        }
      }

      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : 'offline'}`);
      const data = await res.json();

      const currentVer = getClientVersion();
      const versionNewer = compareVersions(data.version, currentVer) > 0;

      let installedHash = getInstalledManifestHash();
      const sameOriginWeb = typeof window !== 'undefined' && window.location.origin === baseUrl && !window.Capacitor?.isNativePlatform?.();
      if (!installedHash && data.manifestHash && sameOriginWeb && !versionNewer && !forceTestUpdate) {
        try {
          localStorage.setItem(STORAGE_MANIFEST_HASH_KEY, data.manifestHash);
          installedHash = data.manifestHash;
        } catch (e) { }
      }

      const manifestChanged = !!(installedHash && data.manifestHash && installedHash !== data.manifestHash);
      let hasUpdate = versionNewer || manifestChanged;
      if (forceTestUpdate) hasUpdate = true;

      if (force) cachedDeltaPromise = null;

      cachedUpdateInfo = {
        hasUpdate,
        versionNewer,
        manifestChanged,
        serverVersion: data.version || CURRENT_BUILD_VERSION,
        clientVersion: currentVer,
        serverManifestHash: data.manifestHash || '',
        clientManifestHash: installedHash || '',
        data,
        baseUrl,
      };

      if (hasUpdate) {
        notifyListeners(cachedUpdateInfo);
      }
      return cachedUpdateInfo;
    } catch (err) {
      console.warn('[Updater] Could not reach server version API:', err.message);
      const currentVer = getClientVersion();
      const fallback = {
        hasUpdate: forceTestUpdate,
        serverVersion: forceTestUpdate ? '0.2.0' : currentVer,
        clientVersion: currentVer,
        offline: true,
        baseUrl,
        data: {
          version: forceTestUpdate ? '0.2.0' : currentVer,
          inGameUpdateSupported: true,
          changelog: [
            'Travelling Merchant Malakor: Trade Infernal Marks for Sealed Chests just off the town square',
            'Mountainside Biome Overworld Overhaul: Complete high-altitude terrain, snow drifts, goats, and shrines',
            'The Pirate Seas Expansion: 12 naval scenario battlefields on Bellmourn\'s waters with 3D ships',
            'Diablo-Style Cast Lock & Auto-Cast Summons: Fluid spellcasting flow and persistent summon management',
            'Infernal Marks Storage Expansions: Account-wide row expansions for Bag, Gem Bag, Stash, Jewel Box, and Reliquary',
            'In-Game Differential Android OTA Updater: downloads and replaces only modified game files in-place without reinstalling the full APK',
          ],
          downloads: {
            android: { available: true, url: '/download/android', filename: 'DagyrOnline.apk', sizeFormatted: '346 MB' },
            windows: { available: true, url: '/download/windows', filename: 'DagyrOnline.exe', sizeFormatted: '1.29 GB' },
            linux: { available: true, url: '/download/linux', filename: 'DagyrOnline.AppImage', sizeFormatted: '1.38 GB' },
          }
        }
      };
      cachedUpdateInfo = fallback;
      if (forceTestUpdate) notifyListeners(cachedUpdateInfo);
      return fallback;
    } finally {
      updateCheckPromise = null;
    }
  })();

  return updateCheckPromise;
}

/**
 * Fetches the server's /api/update-manifest and computes the exact delta of changed, new, and deleted files.
 */
export async function calculateUpdateDelta(updateInfo = null, { force = false } = {}) {
  if (!force && cachedDeltaPromise) return cachedDeltaPromise;

  cachedDeltaPromise = (async () => {
    const info = updateInfo || cachedUpdateInfo || (await checkForUpdates());
    const baseUrl = info?.baseUrl || getServerBaseUrl();
    const manifestUrl = `${baseUrl}/api/update-manifest?_t=${Date.now()}`;

    let serverManifest = null;
    try {
      const res = await fetch(manifestUrl, { cache: 'no-store' });
      if (res && res.ok) {
        serverManifest = await res.json();
      }
    } catch (e) { }

    if (!serverManifest || !serverManifest.files) {
      try {
        const res = await fetch(`${baseUrl}/update-manifest.json?_t=${Date.now()}`, { cache: 'no-store' });
        if (res && res.ok) {
          serverManifest = await res.json();
        }
      } catch (e) { }
    }

    if (!serverManifest || !serverManifest.files) {
      return {
        available: false,
        changedFiles: [],
        deletedFiles: [],
        totalChangedCount: 0,
        totalDeltaBytes: 0,
        totalDeltaFormatted: '0 B',
        serverManifest: null,
      };
    }

    let forceTestUpdate = false;
    if (typeof window !== 'undefined') {
      if (window.DAGYR_TEST_UPDATE) forceTestUpdate = true;
      try {
        if (new URLSearchParams(window.location.search).has('test_update')) forceTestUpdate = true;
      } catch (e) { }
    }

    const nativePlugin = typeof window !== 'undefined' ? window.Capacitor?.Plugins?.LiveUpdate : null;
    if (nativePlugin && typeof nativePlugin.computeDelta === 'function') {
      try {
        const nativeDelta = await nativePlugin.computeDelta({ files: serverManifest.files });
        if (nativeDelta && Array.isArray(nativeDelta.changedFiles)) {
          let changedFiles = nativeDelta.changedFiles;
          if (forceTestUpdate && changedFiles.length === 0) {
            changedFiles = buildTestSampleDelta(serverManifest.files);
          }
          const totalDeltaBytes = changedFiles.reduce((acc, f) => acc + (Number(f.s) || 0), 0);
          return {
            available: true,
            native: true,
            changedFiles,
            deletedFiles: nativeDelta.deletedFiles || [],
            totalChangedCount: changedFiles.length,
            totalDeltaBytes,
            totalDeltaFormatted: formatByteSize(totalDeltaBytes),
            serverManifest,
          };
        }
      } catch (e) {
        console.warn('[Updater] Native computeDelta failed, falling back to JS diff:', e);
      }
    }

    const localData = await getLocalManifestData();
    const localFiles = localData.files || {};
    const serverFiles = serverManifest.files;

    let changedFiles = [];
    for (const [relPath, sMeta] of Object.entries(serverFiles)) {
      const lMeta = localFiles[relPath];
      if (!lMeta || lMeta.h !== sMeta.h) {
        changedFiles.push({ path: relPath, h: sMeta.h, s: sMeta.s || 0 });
      }
    }

    const deletedFiles = [];
    for (const relPath of Object.keys(localFiles)) {
      if (!Object.prototype.hasOwnProperty.call(serverFiles, relPath)) {
        deletedFiles.push(relPath);
      }
    }

    // When testing update flow locally where server and client share the same disk directory,
    // provide a realistic sample file delta so the in-game downloader and progress UI are exercised.
    if (forceTestUpdate && changedFiles.length === 0) {
      changedFiles = buildTestSampleDelta(serverFiles);
    }

    const totalDeltaBytes = changedFiles.reduce((acc, f) => acc + (Number(f.s) || 0), 0);

    return {
      available: true,
      native: false,
      changedFiles,
      deletedFiles,
      totalChangedCount: changedFiles.length,
      totalDeltaBytes,
      totalDeltaFormatted: formatByteSize(totalDeltaBytes),
      serverManifest,
    };
  })();

  return cachedDeltaPromise;
}

function buildTestSampleDelta(serverFiles) {
  const sampleKeys = ['index.html', 'src/ui/updater.js', 'css/style.css'];
  const sample = [];
  for (const k of sampleKeys) {
    if (serverFiles[k]) {
      sample.push({ path: k, h: serverFiles[k].h, s: serverFiles[k].s || 0 });
    }
  }
  return sample;
}

/**
 * Executes the in-game differential file update:
 * 1. Computes the file delta against /api/update-manifest
 * 2. Downloads only modified/added files (with SHA-256 verification and live progress callbacks)
 * 3. Commits updated files to Android LiveUpdate storage (or Cache Storage in web/test mode)
 * 4. Reloads the game in-place without reinstalling the APK
 */
export async function performInGameUpdate(updateInfo = null, onProgress = null) {
  const emit = (prog) => {
    if (typeof onProgress === 'function') {
      try { onProgress(prog); } catch (e) { }
    }
  };

  const info = updateInfo || cachedUpdateInfo || (await checkForUpdates({ force: true }));
  const baseUrl = info?.baseUrl || getServerBaseUrl();

  emit({
    stage: 'manifest',
    percent: 3,
    completedFiles: 0,
    totalFiles: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    currentFile: 'Checking file manifest…',
    label: 'Comparing installed files with server manifest…',
  });

  const delta = await calculateUpdateDelta(info, { force: true });
  const changedFiles = delta.changedFiles || [];
  const deletedFiles = delta.deletedFiles || [];
  const totalFiles = changedFiles.length;
  const totalBytes = delta.totalDeltaBytes || 0;
  const targetVersion = delta.serverManifest?.version || info?.serverVersion || getClientVersion();
  const targetHash = delta.serverManifest?.manifestHash || info?.data?.manifestHash || '';

  const nativePlugin = typeof window !== 'undefined' ? window.Capacitor?.Plugins?.LiveUpdate : null;
  if (nativePlugin && typeof nativePlugin.downloadAndApply === 'function') {
    let listenerHandle = null;
    try {
      if (typeof nativePlugin.addListener === 'function') {
        listenerHandle = await nativePlugin.addListener('updateProgress', (prog) => {
          emit({
            stage: prog.stage || 'downloading',
            percent: prog.percent ?? 10,
            completedFiles: prog.completedFiles ?? 0,
            totalFiles: prog.totalFiles ?? totalFiles,
            downloadedBytes: prog.downloadedBytes ?? 0,
            totalBytes: prog.totalBytes ?? totalBytes,
            currentFile: prog.currentFile || '',
            label: prog.stage === 'applying'
              ? 'Applying updated files…'
              : `Updating game files (${prog.completedFiles || 0} / ${prog.totalFiles || totalFiles})…`,
          });
        });
      }

      await nativePlugin.downloadAndApply({
        baseUrl,
        version: targetVersion,
        manifestHash: targetHash,
        files: changedFiles,
        deletedFiles,
      });
    } finally {
      if (listenerHandle && typeof listenerHandle.remove === 'function') {
        try { await listenerHandle.remove(); } catch (e) { }
      }
    }
  } else {
    // JS differential downloader (verifies SHA-256 and stores updated files in Cache Storage)
    let completedFiles = 0;
    let downloadedBytes = 0;
    let cache = null;
    if (typeof window !== 'undefined' && 'caches' in window) {
      try { cache = await caches.open(LIVE_CACHE_NAME); } catch (e) { }
    }

    if (totalFiles > 0) {
      emit({
        stage: 'downloading',
        percent: 5,
        completedFiles: 0,
        totalFiles,
        downloadedBytes: 0,
        totalBytes,
        currentFile: changedFiles[0].path,
        label: `Updating game files (0 / ${totalFiles})…`,
      });

      const queue = [...changedFiles];
      const concurrency = Math.min(4, queue.length);

      const worker = async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;
          const encodedPath = item.path.split('/').map(encodeURIComponent).join('/');
          const fileUrl = `${baseUrl}/${encodedPath}?_v=${encodeURIComponent(targetVersion)}&_h=${encodeURIComponent(item.h || '')}`;

          const res = await fetch(fileUrl, { cache: 'reload' });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} downloading ${item.path}`);
          }
          const buf = await res.arrayBuffer();
          if (item.h) {
            const actualHash = await sha256Buffer16(buf);
            if (actualHash && actualHash.toLowerCase() !== String(item.h).toLowerCase()) {
              throw new Error(`Integrity check failed for ${item.path}`);
            }
          }

          if (cache) {
            try {
              const headers = new Headers(res.headers);
              headers.set('Cache-Control', 'no-cache');
              await cache.put(`/${item.path}`, new Response(buf, { status: 200, headers }));
            } catch (e) { }
          }

          completedFiles++;
          downloadedBytes += buf.byteLength || item.s || 0;
          const pct = totalBytes > 0
            ? Math.min(98, Math.max(5, Math.round((downloadedBytes * 100) / totalBytes)))
            : Math.min(98, Math.round((completedFiles * 100) / totalFiles));

          emit({
            stage: 'downloading',
            percent: pct,
            completedFiles,
            totalFiles,
            downloadedBytes,
            totalBytes,
            currentFile: item.path,
            label: `Updating game files (${completedFiles} / ${totalFiles})…`,
          });
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    }

    // Record applied delta in localStorage
    try {
      let liveState = { files: {}, deletedFiles: [] };
      const existing = localStorage.getItem(STORAGE_LIVE_FILES_KEY);
      if (existing) {
        const parsed = JSON.parse(existing);
        if (parsed && typeof parsed === 'object') liveState = parsed;
      }
      if (!liveState.files) liveState.files = {};
      for (const f of changedFiles) {
        liveState.files[f.path] = { h: f.h, s: f.s };
      }
      for (const del of deletedFiles) {
        delete liveState.files[del];
      }
      liveState.deletedFiles = deletedFiles;
      liveState.version = targetVersion;
      liveState.manifestHash = targetHash;
      liveState.updatedAt = Date.now();
      localStorage.setItem(STORAGE_LIVE_FILES_KEY, JSON.stringify(liveState));
    } catch (e) { }
  }

  try {
    if (targetVersion) localStorage.setItem(STORAGE_VERSION_KEY, targetVersion);
    if (targetHash) localStorage.setItem(STORAGE_MANIFEST_HASH_KEY, targetHash);
  } catch (e) { }

  emit({
    stage: 'complete',
    percent: 100,
    completedFiles: totalFiles,
    totalFiles,
    downloadedBytes: totalBytes,
    totalBytes,
    currentFile: 'Complete',
    label: `Updated ${totalFiles} ${totalFiles === 1 ? 'file' : 'files'} (${formatByteSize(totalBytes)}). Reloading game…`,
  });

  if (typeof window !== 'undefined' && !window.DAGYR_NO_RELOAD_ON_UPDATE) {
    setTimeout(() => {
      hardReload(targetVersion, targetHash);
    }, 450);
  }

  return {
    ok: true,
    type: 'android-ota',
    updatedFiles: totalFiles,
    deletedFiles: deletedFiles.length,
    totalDeltaBytes: totalBytes,
    version: targetVersion,
    manifestHash: targetHash,
  };
}

/**
 * Triggers the full standalone APK download via browser as a fallback option.
 */
export function triggerApkDownload(updateInfo = null) {
  const baseUrl = updateInfo?.baseUrl || getServerBaseUrl();
  const downloadUrl = `${baseUrl}/download/android`;
  try {
    window.open(downloadUrl, '_system');
  } catch (e) {
    window.location.href = downloadUrl;
  }
  return {
    type: 'android-apk',
    url: downloadUrl,
    msg: 'Downloading full DagyrOnline.apk in browser... When finished, tap the notification to install.'
  };
}

/**
 * Register a callback to be notified when an update is found.
 */
export function onUpdateAvailable(fn) {
  updateListeners.add(fn);
  if (cachedUpdateInfo && cachedUpdateInfo.hasUpdate) {
    try { fn(cachedUpdateInfo); } catch (e) { }
  }
  return () => updateListeners.delete(fn);
}

function notifyListeners(info) {
  for (const fn of updateListeners) {
    try { fn(info); } catch (e) { console.error('[Updater] Listener error', e); }
  }
}

/**
 * Triggers the appropriate platform update (in-game differential OTA on Android, executable download on Electron, or hot-reload on Web).
 */
export function triggerUpdate(updateInfo, onProgress = null) {
  const isAndroid = isAndroidClient();
  const isElectron = /Electron/i.test(navigator.userAgent) || !!(window.process && window.process.type);
  const isWindows = /Windows|Win32/i.test(navigator.userAgent);
  const baseUrl = updateInfo?.baseUrl || getServerBaseUrl();

  if (isAndroid) {
    const promise = performInGameUpdate(updateInfo, onProgress);
    return {
      type: 'android-ota',
      promise,
      msg: 'Downloading and applying changed game files in-place…'
    };
  }

  if (isElectron) {
    const route = isWindows ? '/download/windows' : '/download/linux';
    const downloadUrl = `${baseUrl}${route}`;
    const filename = isWindows ? 'DagyrOnline.exe' : 'DagyrOnline.AppImage';
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return {
      type: isWindows ? 'windows' : 'linux',
      url: downloadUrl,
      msg: `Downloading ${filename}... Save and run the new executable to launch the updated game.`
    };
  }

  if (updateInfo?.serverVersion) {
    try { localStorage.setItem(STORAGE_VERSION_KEY, updateInfo.serverVersion); } catch (e) { }
  }
  if (updateInfo?.serverManifestHash) {
    try { localStorage.setItem(STORAGE_MANIFEST_HASH_KEY, updateInfo.serverManifestHash); } catch (e) { }
  }
  hardReload(updateInfo?.serverVersion, updateInfo?.serverManifestHash);
  return { type: 'web', msg: 'Updating and refreshing client assets...' };
}

/**
 * Displays the Gothic Update Dialog with version comparison, differential file patch summary,
 * live in-game progress bar, changelog, and 1-click in-game update action.
 */
export function showUpdateDialog(updateInfo) {
  const currentVer = getClientVersion();
  const info = updateInfo || cachedUpdateInfo || {
    serverVersion: CURRENT_BUILD_VERSION,
    clientVersion: currentVer,
    data: { changelog: ['New features and stability enhancements.'] }
  };

  const isAndroid = isAndroidClient();
  const isElectron = /Electron/i.test(navigator.userAgent) || !!(window.process && window.process.type);
  const isWindows = /Windows|Win32/i.test(navigator.userAgent);

  let platformName = 'Web Client';
  let actionBtnText = 'Update & Refresh';
  let actionHint = 'Clears browser cache and loads the newest client version immediately.';
  let downloadSize = '';

  const dls = info.data?.downloads || {};
  if (isAndroid) {
    platformName = 'Android Client (In-Game Patcher)';
    actionBtnText = 'Update In-Game';
    actionHint = 'Downloads and replaces only the modified game files directly inside the app, then reloads automatically — no full APK reinstall required.';
  } else if (isElectron) {
    if (isWindows) {
      platformName = 'Windows Desktop';
      downloadSize = dls.windows?.sizeFormatted ? ` (${dls.windows.sizeFormatted})` : '';
      actionBtnText = `Download Windows .EXE${downloadSize}`;
    } else {
      platformName = 'Linux Desktop';
      downloadSize = dls.linux?.sizeFormatted ? ` (${dls.linux.sizeFormatted})` : '';
      actionBtnText = `Download AppImage${downloadSize}`;
    }
    actionHint = 'Downloads the updated standalone game client from the server.';
  }

  const changelogItems = (info.data?.changelog || [
    'In-Game Differential Android OTA Updater: replaces only changed files without reinstalling the APK',
    'Built-in automatic updater with in-game download & installation',
    'Immersive fullscreen Android display with hidden status bars',
    'Seamless Google Account sign-in on Desktop and Android',
  ]).map(item => `<li style="margin-bottom:6px;color:#dfd3c3;font-size:13px;line-height:1.4;">${item}</li>`).join('');

  const deltaSectionHtml = isAndroid ? `
    <div id="update-delta-summary" style="background:rgba(255,211,74,0.07);border:1px solid rgba(255,211,74,0.28);border-radius:4px;padding:8px 12px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;">
      <span style="color:#dfd3c3;">Differential Patch:</span>
      <span id="update-delta-badge" style="color:#ffd860;font-weight:700;font-family:var(--font-head);">Calculating changed files…</span>
    </div>
  ` : '';

  const apkFallbackBtnHtml = isAndroid ? `
    <button class="btn" data-download-apk title="Download full standalone APK installer instead" style="padding:8px 12px;font-size:11px;opacity:0.85;">Full APK</button>
  ` : '';

  const html = `
    <div class="update-dialog-content" style="max-width:440px;text-align:left;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(180,140,70,0.3);">
        <div style="width:40px;height:40px;border-radius:4px;background:rgba(255,211,74,0.15);border:1px solid #ffd34a;display:flex;align-items:center;justify-content:center;color:#ffd860;flex-shrink:0;">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div>
          <div style="font-family:var(--font-head);font-size:16px;color:#fff0a0;font-weight:700;letter-spacing:1px;">New Version Available</div>
          <div style="font-size:12px;color:#a8977c;">Platform: <span style="color:#ffd860;">${platformName}</span></div>
        </div>
      </div>

      <div style="background:rgba(12,8,6,0.7);padding:10px 14px;border:1px solid rgba(160,120,60,0.3);border-radius:4px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-size:11px;color:#8a7762;display:block;text-transform:uppercase;letter-spacing:1px;">Installed Version</span>
          <span style="font-family:var(--font-head);color:#a8977c;font-size:14px;font-weight:700;">v${info.clientVersion}</span>
        </div>
        <div style="color:#ffd34a;font-size:18px;">➔</div>
        <div style="text-align:right;">
          <span style="font-size:11px;color:#ffd34a;display:block;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Server Version</span>
          <span style="font-family:var(--font-head);color:#ffd860;font-size:15px;font-weight:700;">v${info.serverVersion}</span>
        </div>
      </div>

      ${deltaSectionHtml}

      <div style="margin-bottom:14px;max-height:160px;overflow-y:auto;padding-right:4px;">
        <div style="font-family:var(--font-head);font-size:12px;color:#c89e38;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">What's New</div>
        <ul style="padding-left:18px;margin:0;">
          ${changelogItems}
        </ul>
      </div>

      <div id="update-progress-wrap" style="display:none;background:rgba(10,6,4,0.85);border:1px solid rgba(255,211,74,0.35);border-radius:4px;padding:10px 12px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#fff0a0;margin-bottom:6px;">
          <span id="update-progress-text">Preparing in-game update…</span>
          <span id="update-progress-pct" style="font-family:var(--font-head);font-weight:700;color:#ffd34a;">0%</span>
        </div>
        <div style="width:100%;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;margin-bottom:6px;">
          <div id="update-progress-fill" style="width:0%;height:100%;background:linear-gradient(90deg,#c88a28 0%,#ffd860 100%);transition:width 0.15s ease;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#9e8f7a;gap:8px;">
          <span id="update-progress-file" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;"></span>
          <span id="update-progress-bytes" style="flex-shrink:0;"></span>
        </div>
      </div>

      <div id="update-action-status" style="display:none;font-size:12px;color:#ffd34a;background:rgba(255,211,74,0.1);padding:8px 12px;border-radius:4px;margin-bottom:12px;line-height:1.4;"></div>

      <p style="font-size:12px;color:#8a7762;margin:0 0 16px;line-height:1.4;">${actionHint}</p>

      <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap;">
        <button class="btn" data-cancel style="padding:8px 14px;font-size:12px;">Dismiss</button>
        ${apkFallbackBtnHtml}
        <button class="btn big" data-update style="padding:10px 18px;font-size:13px;background:linear-gradient(180deg,#593e28 0%,#2e1c10 100%);color:#fff0a0;border-color:#ffd34a;box-shadow:0 0 12px rgba(255,211,74,0.35);">
          ${actionBtnText}
        </button>
      </div>
    </div>
  `;

  const d = UI.dialog({
    title: 'Dagyr Online Updater',
    html,
    buttons: []
  });

  const cancelBtn = d.box.querySelector('[data-cancel]');
  const updateBtn = d.box.querySelector('[data-update]');
  const apkBtn = d.box.querySelector('[data-download-apk]');
  const statusEl = d.box.querySelector('#update-action-status');
  const deltaBadgeEl = d.box.querySelector('#update-delta-badge');
  const progressWrap = d.box.querySelector('#update-progress-wrap');
  const progressText = d.box.querySelector('#update-progress-text');
  const progressPct = d.box.querySelector('#update-progress-pct');
  const progressFill = d.box.querySelector('#update-progress-fill');
  const progressFile = d.box.querySelector('#update-progress-file');
  const progressBytes = d.box.querySelector('#update-progress-bytes');

  if (isAndroid) {
    calculateUpdateDelta(info).then((delta) => {
      if (!d.box.isConnected) return;
      if (delta && delta.available) {
        const count = delta.totalChangedCount;
        const sizeStr = delta.totalDeltaFormatted;
        if (deltaBadgeEl) {
          deltaBadgeEl.textContent = count > 0
            ? `${count} ${count === 1 ? 'file' : 'files'} · ${sizeStr}`
            : `Up to date (0 files)`;
        }
        if (updateBtn && !updateBtn.disabled && count > 0) {
          updateBtn.textContent = `Update In-Game (${count} ${count === 1 ? 'file' : 'files'} · ${sizeStr})`;
        }
      } else if (deltaBadgeEl) {
        deltaBadgeEl.textContent = 'Ready for in-game patch';
      }
    }).catch(() => { });
  }

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      sfx('ui');
      d.box.remove();
    };
  }

  if (apkBtn) {
    apkBtn.onclick = () => {
      sfx('ui');
      const res = triggerApkDownload(info);
      if (res && res.msg && statusEl) {
        statusEl.textContent = res.msg;
        statusEl.style.display = 'block';
      }
    };
  }

  if (updateBtn) {
    updateBtn.onclick = async () => {
      sfx('ui');
      updateBtn.disabled = true;
      updateBtn.style.opacity = '0.6';
      if (apkBtn) apkBtn.disabled = true;

      if (isAndroid) {
        if (progressWrap) progressWrap.style.display = 'block';
        if (statusEl) statusEl.style.display = 'none';

        try {
          await performInGameUpdate(info, (prog) => {
            if (!d.box.isConnected) return;
            const pct = Math.max(0, Math.min(100, Math.round(prog.percent || 0)));
            if (progressFill) progressFill.style.width = `${pct}%`;
            if (progressPct) progressPct.textContent = `${pct}%`;
            if (progressText && prog.label) progressText.textContent = prog.label;
            if (progressFile) progressFile.textContent = prog.currentFile || '';
            if (progressBytes) {
              progressBytes.textContent = prog.totalBytes > 0
                ? `${formatByteSize(prog.downloadedBytes || 0)} / ${formatByteSize(prog.totalBytes)}`
                : '';
            }
          });
          if (statusEl) {
            statusEl.textContent = 'In-game update applied! Reloading Dagyr Online…';
            statusEl.style.display = 'block';
          }
        } catch (err) {
          console.error('[Updater] In-game update error:', err);
          updateBtn.disabled = false;
          updateBtn.style.opacity = '1';
          updateBtn.textContent = 'Retry In-Game Update';
          if (apkBtn) apkBtn.disabled = false;
          if (statusEl) {
            statusEl.textContent = `In-game update error: ${err.message || err}. You can retry or tap Full APK.`;
            statusEl.style.display = 'block';
          }
        }
        return;
      }

      const res = triggerUpdate(info);
      if (res && res.msg && statusEl) {
        statusEl.textContent = res.msg;
        statusEl.style.display = 'block';
      }
    };
  }
}

/**
 * Initializes the title screen update button.
 * The button is initially hidden, and only becomes visible if an update is available.
 */
export function initTitleUpdater(btnEl) {
  if (!btnEl) return;

  const showButton = (info) => {
    btnEl.classList.remove('hidden');
    btnEl.title = `Update available: v${info.serverVersion} (Installed: v${info.clientVersion})`;
    btnEl.onclick = (e) => {
      e.stopPropagation();
      sfx('ui');
      showUpdateDialog(info);
    };
  };

  onUpdateAvailable((info) => {
    if (btnEl.isConnected) showButton(info);
  });

  checkForUpdates().then((info) => {
    if (info && info.hasUpdate && btnEl.isConnected) {
      showButton(info);
    }
  }).catch(() => { });
}
