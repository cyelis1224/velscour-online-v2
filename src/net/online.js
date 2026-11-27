// Online Account Authentication & Server-Side Character Management for Velscour Online
import { getServerBaseUrl } from '../ui/updater.js';
import { newCharData, migrate } from '../game/save.js';
import { endgame, adoptEndgame } from '../game/endgame.js';
import { adoptOnlineReliquary, setReliquaryOnlineHooks, resetReliquaryCache } from '../game/reliquary.js';
import { isProfaneName } from './profanity.js';

const SESSION_KEY = 'dagyr_online_session_v1';

let currentToken = '';
let currentAccount = null;
let cachedCharacters = [];
let cachedReliquary = null;

setReliquaryOnlineHooks({
  getAccount: () => currentAccount,
  isLoggedIn: () => isOnlineLoggedIn(),
  saveReliquary: (rel) => saveOnlineReliquary(rel),
});

function loadStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || localStorage.getItem('dagyr_online_session_v1');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === 'string' && parsed.token) {
      currentToken = parsed.token;
      currentAccount = parsed.account || null;
      if (!localStorage.getItem(SESSION_KEY)) {
        try { localStorage.setItem(SESSION_KEY, raw); } catch (e) { }
      }
    }
  } catch (e) { }
}
loadStoredSession();

function persistSession(token, account) {
  currentToken = token || '';
  currentAccount = account || null;
  try {
    if (currentToken && currentAccount) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token: currentToken, account: currentAccount }));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (e) { }
}

function normalizeCharList(list) {
  if (!Array.isArray(list)) return [];
  const chars = list
    .filter(c => c && c.id && c.classId)
    .map(c => {
      const m = migrate({ ...c });
      m.isOnline = true;
      return m;
    })
    .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  // Hydrate account-wide Infernal Marks from the highest-marks character in the roster
  // so no character switch or legacy migration can ever lose earned Marks.
  let bestMarks = null;
  for (const ch of chars) {
    if (ch.marks && (Number(ch.marks.pts) || 0) > (Number(bestMarks?.pts) || 0)) bestMarks = ch.marks;
  }
  if (bestMarks) {
    try { adoptEndgame({ marks: bestMarks }); } catch (e) { }
  }
  return chars;
}

export function getOnlineAccount() {
  return currentAccount;
}

export function getOnlineToken() {
  return currentToken;
}

export function getOnlineCharacters() {
  return cachedCharacters;
}

export function isOnlineLoggedIn() {
  return !!(currentToken && currentAccount && currentAccount.email);
}

function utf8ByteLength(str) {
  if (!str) return 0;
  try {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).byteLength;
  } catch (e) { }
  return str.length * 2;
}

function charFingerprint(char) {
  if (!char || !char.id) return '';
  const prev = char.lastPlayed;
  char.lastPlayed = 0;
  let fp = '';
  try {
    fp = JSON.stringify(char);
  } catch (e) {
    fp = '';
  } finally {
    char.lastPlayed = prev;
  }
  return fp;
}

async function apiRequest(path, { method = 'GET', body = null, keepalive = false } = {}) {
  const baseUrl = getServerBaseUrl();
  const headers = {
    'Accept': 'application/json',
  };
  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }
  const opts = {
    method,
    headers,
    cache: 'no-store',
  };
  let encodedBody = null;
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
    encodedBody = JSON.stringify(body);
    opts.body = encodedBody;
  }
  // Browser safety: keepalive: true throws TypeError in Chrome/WebViews if total inflight keepalive bytes > 64KB (65536 bytes)
  if (keepalive && (!encodedBody || utf8ByteLength(encodedBody) < 60000)) {
    opts.keepalive = true;
  }
  let resp;
  try {
    resp = await fetch(`${baseUrl}${path}`, opts);
  } catch (fetchErr) {
    if (opts.keepalive) {
      delete opts.keepalive;
      resp = await fetch(`${baseUrl}${path}`, opts);
    } else {
      throw fetchErr;
    }
  }
  let data = null;
  try {
    data = await resp.json();
  } catch (e) {
    data = { ok: false, error: `Server error (${resp.status})` };
  }
  if (!resp.ok || !data || data.ok === false) {
    const err = new Error((data && data.error) || `Request failed (${resp.status})`);
    err.status = resp.status;
    throw err;
  }
  return data;
}

export async function registerOnlineAccount(email, password) {
  const data = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { email: String(email || '').trim(), password: String(password || '') },
  });
  persistSession(data.token, data.account);
  cachedCharacters = normalizeCharList(data.characters);
  if (data.reliquary !== undefined) {
    cachedReliquary = data.reliquary || null;
    adoptOnlineReliquary(cachedReliquary);
  }
  return { account: currentAccount, characters: cachedCharacters };
}

export async function loginOnlineAccount(email, password) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: String(email || '').trim(), password: String(password || '') },
  });
  persistSession(data.token, data.account);
  cachedCharacters = normalizeCharList(data.characters);
  if (data.reliquary !== undefined) {
    cachedReliquary = data.reliquary || null;
    adoptOnlineReliquary(cachedReliquary);
  }
  return { account: currentAccount, characters: cachedCharacters };
}

export async function logoutOnlineAccount() {
  if (savePromiseChain) {
    try {
      await savePromiseChain;
    } catch (e) { }
  }
  if (reliquarySavePromiseChain) {
    try {
      await reliquarySavePromiseChain;
    } catch (e) { }
  }
  try {
    if (currentToken) {
      await apiRequest('/api/auth/logout', { method: 'POST', body: { token: currentToken } });
    }
  } catch (e) { }
  persistSession('', null);
  cachedCharacters = [];
  cachedReliquary = null;
  lastSavedFingerprints.clear();
  reliquaryDirty = false;
  resetReliquaryCache();
}

export async function fetchOnlineSession() {
  if (!currentToken) {
    return null;
  }
  try {
    const data = await apiRequest('/api/auth/session', { method: 'GET' });
    persistSession(currentToken, data.account);
    cachedCharacters = normalizeCharList(data.characters);
    if (data.reliquary !== undefined) {
      cachedReliquary = data.reliquary || null;
      adoptOnlineReliquary(cachedReliquary);
    }
    return { account: currentAccount, characters: cachedCharacters };
  } catch (err) {
    if (err && err.status === 401) {
      persistSession('', null);
      cachedCharacters = [];
      cachedReliquary = null;
      resetReliquaryCache();
    }
    return null;
  }
}

export async function checkOnlineCharName(name) {
  const trimmed = String(name || '').trim();
  if (trimmed.length < 2) {
    return { available: false, name: trimmed, error: 'Character name must be at least 2 characters.' };
  }
  if (trimmed.length > 18) {
    return { available: false, name: trimmed, error: 'Character name must be 18 characters or fewer.' };
  }
  if (isProfaneName(trimmed)) {
    return { available: false, name: trimmed, error: 'Character name contains inappropriate or prohibited language.' };
  }
  const data = await apiRequest(`/api/online/check-name?name=${encodeURIComponent(trimmed)}`, {
    method: 'GET',
  });
  return {
    available: !!data.available,
    name: data.name || trimmed,
    error: data.error || null,
  };
}

export async function createOnlineCharacter(classId, name) {
  const trimmedName = String(name || '').trim();
  if (isProfaneName(trimmedName)) {
    throw new Error('Character name contains inappropriate or prohibited language.');
  }
  const baseChar = newCharData(classId, trimmedName);
  baseChar.isOnline = true;
  if (currentAccount && currentAccount.id) {
    baseChar.accountId = currentAccount.id;
  }
  const data = await apiRequest('/api/online/characters', {
    method: 'POST',
    body: {
      name: trimmedName,
      classId,
      character: baseChar,
    },
  });
  cachedCharacters = normalizeCharList(data.characters);
  const created = data.character ? migrate({ ...data.character, isOnline: true }) : baseChar;
  return { character: created, characters: cachedCharacters };
}

export async function deleteOnlineCharacter(charId) {
  const data = await apiRequest(`/api/online/characters/${encodeURIComponent(charId)}`, {
    method: 'DELETE',
  });
  lastSavedFingerprints.delete(charId);
  cachedCharacters = normalizeCharList(data.characters);
  return { deletedId: charId, characters: cachedCharacters };
}

export async function renameOnlineCharacter(charId, newName) {
  const trimmedName = String(newName || '').trim();
  if (trimmedName.length < 2) {
    throw new Error('Character name must be at least 2 characters.');
  }
  if (trimmedName.length > 18) {
    throw new Error('Character name must be 18 characters or fewer.');
  }
  if (isProfaneName(trimmedName)) {
    throw new Error('Character name contains inappropriate or prohibited language.');
  }
  const data = await apiRequest('/api/online/characters/rename', {
    method: 'POST',
    body: { charId, name: trimmedName },
  });
  lastSavedFingerprints.delete(charId);
  cachedCharacters = normalizeCharList(data.characters);
  const renamed = data.character ? migrate({ ...data.character, isOnline: true }) : null;
  return { character: renamed, characters: cachedCharacters };
}

let savePromiseChain = Promise.resolve(true);
let reliquarySavePromiseChain = Promise.resolve(true);
const lastSavedFingerprints = new Map();
let reliquaryDirty = false;
let lastUnloadFlushAt = 0;
let lastUnloadFp = '';

export function flushOnlineSave() {
  return Promise.all([savePromiseChain, reliquarySavePromiseChain]);
}

export function flushOnlineReliquarySave() {
  return reliquarySavePromiseChain;
}

export function getOnlineReliquary() {
  return cachedReliquary;
}

export async function fetchOnlineReliquary() {
  if (!currentToken) return null;
  try {
    const data = await apiRequest('/api/online/reliquary', { method: 'GET' });
    if (data && data.ok) {
      cachedReliquary = data.reliquary || null;
      reliquaryDirty = false;
      adoptOnlineReliquary(cachedReliquary);
      return cachedReliquary;
    }
  } catch (err) {
    console.warn('[Velscour Online] Failed to fetch online reliquary:', err);
  }
  return null;
}

export function saveOnlineReliquary(relData) {
  if (!relData || !currentToken) return Promise.resolve(false);
  cachedReliquary = relData;
  reliquaryDirty = true;
  reliquarySavePromiseChain = reliquarySavePromiseChain
    .then(async () => {
      if (!currentToken) return false;
      try {
        await apiRequest('/api/online/reliquary', {
          method: 'PUT',
          body: { token: currentToken, reliquary: relData },
          keepalive: true,
        });
        reliquaryDirty = false;
        return true;
      } catch (e) {
        console.warn('[Velscour Online] Failed to save online reliquary over HTTP:', e);
        if (typeof window !== 'undefined' && window.net && window.net.ws && window.net.ws.readyState === 1) {
          try {
            window.net.ws.send(JSON.stringify({ type: 'save_reliquary', reliquary: relData, accountId: currentAccount?.id || null }));
            reliquaryDirty = false;
            return true;
          } catch (netErr) { }
        }
        return false;
      }
    })
    .catch((err) => {
      console.warn('[Velscour Online] Reliquary save promise chain recovered:', err);
      return false;
    });

  return reliquarySavePromiseChain;
}

export function saveOnlineCharacter(char, { onlyIfChanged = false } = {}) {
  if (!char || !char.isOnline || !char.id || !currentToken) return Promise.resolve(false);
  try {
    char.marks = JSON.parse(JSON.stringify(endgame().marks));
  } catch (e) { }

  const fp = charFingerprint(char);
  if (onlyIfChanged && fp && lastSavedFingerprints.get(char.id) === fp) {
    return Promise.resolve(true);
  }

  char.lastPlayed = Date.now();

  // Keep in-memory roster cache fresh immediately
  const idx = cachedCharacters.findIndex(c => c && c.id === char.id);
  const snapshot = JSON.parse(JSON.stringify(char));
  if (idx >= 0) {
    cachedCharacters[idx] = snapshot;
  } else {
    cachedCharacters.unshift(snapshot);
  }
  cachedCharacters.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));

  savePromiseChain = savePromiseChain
    .then(async () => {
      if (!currentToken) return false;
      try {
        await apiRequest(`/api/online/characters/${encodeURIComponent(snapshot.id)}`, {
          method: 'PUT',
          body: { token: currentToken, character: snapshot },
          keepalive: true,
        });
        if (fp) lastSavedFingerprints.set(snapshot.id, fp);
        return true;
      } catch (e) {
        console.warn('[Velscour Online] Failed to save online character to server over HTTP:', e);
        if (typeof window !== 'undefined' && window.net && window.net.ws && window.net.ws.readyState === 1) {
          try {
            window.net.ws.send(JSON.stringify({ type: 'save_character', character: snapshot }));
            if (fp) lastSavedFingerprints.set(snapshot.id, fp);
            return true;
          } catch (netErr) { }
        }
        return false;
      }
    })
    .catch((err) => {
      console.warn('[Velscour Online] Save promise chain recovered from error:', err);
      return false;
    });

  return savePromiseChain;
}

/**
 * Synchronous, browser-unload-safe character & reliquary flush for `beforeunload` and `pagehide`.
 * Uses BOTH:
 * 1. Direct synchronous WebSocket frame (`window.net.ws.send`), which has NO 64KB browser limit.
 * 2. `navigator.sendBeacon` (with `fetch(..., { keepalive: true })` fallback) for payloads under 60KB
 *    as a belt-and-suspenders guarantee if the WebSocket is mid-reconnect.
 */
export function flushOnlineSaveUnload(char) {
  if (!currentToken) return false;
  const baseUrl = getServerBaseUrl();
  let sentAny = false;

  if (char && char.isOnline && char.id) {
    try {
      char.marks = JSON.parse(JSON.stringify(endgame().marks));
    } catch (e) { }

    const fp = charFingerprint(char);
    const now = Date.now();
    if (!(fp && fp === lastUnloadFp && (now - lastUnloadFlushAt) < 500)) {
      lastUnloadFp = fp;
      lastUnloadFlushAt = now;
      char.lastPlayed = now;

      // Update in-memory cache in case unload is canceled
      try {
        const idx = cachedCharacters.findIndex(c => c && c.id === char.id);
        const snapshot = JSON.parse(JSON.stringify(char));
        if (idx >= 0) cachedCharacters[idx] = snapshot;
        else cachedCharacters.unshift(snapshot);
      } catch (e) { }

      // 1. Synchronous WebSocket frame (no 64KB browser cap; writes straight to socket buffer before teardown)
      if (typeof window !== 'undefined' && window.net && window.net.ws && window.net.ws.readyState === 1) {
        try {
          window.net.ws.send(JSON.stringify({ type: 'save_character', character: char }));
          sentAny = true;
        } catch (e) { }
      }

      // 2. navigator.sendBeacon / keepalive fetch fallback (CORS-safelisted text/plain JSON string, <= 60KB)
      try {
        const payload = JSON.stringify({ token: currentToken, character: char });
        const bytes = utf8ByteLength(payload);
        if (bytes > 0 && bytes < 60000) {
          let beaconQueued = false;
          if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            try {
              beaconQueued = navigator.sendBeacon(`${baseUrl}/api/online/characters/save`, payload);
            } catch (e) {
              beaconQueued = false;
            }
          }
          if (!beaconQueued && typeof fetch === 'function') {
            fetch(`${baseUrl}/api/online/characters/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
              body: payload,
              keepalive: true,
            }).catch(() => { });
          }
          sentAny = true;
        }
      } catch (e) { }

      if (sentAny && fp) lastSavedFingerprints.set(char.id, fp);
    }
  }

  // Also flush dirty online reliquary on unload if needed
  if (reliquaryDirty && cachedReliquary) {
    if (typeof window !== 'undefined' && window.net && window.net.ws && window.net.ws.readyState === 1) {
      try {
        window.net.ws.send(JSON.stringify({
          type: 'save_reliquary',
          reliquary: cachedReliquary,
          accountId: currentAccount?.id || null,
        }));
      } catch (e) { }
    }
    try {
      const relPayload = JSON.stringify({ token: currentToken, reliquary: cachedReliquary });
      if (utf8ByteLength(relPayload) < 60000 && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(`${baseUrl}/api/online/reliquary`, relPayload);
      }
    } catch (e) { }
    reliquaryDirty = false;
  }

  return sentAny;
}

