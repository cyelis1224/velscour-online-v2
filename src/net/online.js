// Online Account Authentication & Server-Side Character Management for Dagyr Online
import { getServerBaseUrl } from '../ui/updater.js';
import { newCharData, migrate } from '../game/save.js';
import { endgame } from '../game/endgame.js';

const SESSION_KEY = 'dagyr_online_session_v1';

let currentToken = '';
let currentAccount = null;
let cachedCharacters = [];

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
  return list
    .filter(c => c && c.id && c.classId)
    .map(c => {
      const m = migrate({ ...c });
      m.isOnline = true;
      return m;
    })
    .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
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
  // Browser safety: keepalive: true throws TypeError in Chrome/WebViews if body > 64KB (65536 bytes)
  if (keepalive && (!encodedBody || encodedBody.length < 60000)) {
    opts.keepalive = true;
  }
  const resp = await fetch(`${baseUrl}${path}`, opts);
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
  return { account: currentAccount, characters: cachedCharacters };
}

export async function loginOnlineAccount(email, password) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: String(email || '').trim(), password: String(password || '') },
  });
  persistSession(data.token, data.account);
  cachedCharacters = normalizeCharList(data.characters);
  return { account: currentAccount, characters: cachedCharacters };
}

export async function logoutOnlineAccount() {
  if (savePromiseChain) {
    try {
      await savePromiseChain;
    } catch (e) { }
  }
  try {
    if (currentToken) {
      await apiRequest('/api/auth/logout', { method: 'POST', body: { token: currentToken } });
    }
  } catch (e) { }
  persistSession('', null);
  cachedCharacters = [];
}

export async function fetchOnlineSession() {
  if (!currentToken) {
    return null;
  }
  try {
    const data = await apiRequest('/api/auth/session', { method: 'GET' });
    persistSession(currentToken, data.account);
    cachedCharacters = normalizeCharList(data.characters);
    return { account: currentAccount, characters: cachedCharacters };
  } catch (err) {
    if (err && err.status === 401) {
      persistSession('', null);
      cachedCharacters = [];
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
  cachedCharacters = normalizeCharList(data.characters);
  return { deletedId: charId, characters: cachedCharacters };
}

let savePromiseChain = Promise.resolve(true);

export function flushOnlineSave() {
  return savePromiseChain;
}

export function saveOnlineCharacter(char) {
  if (!char || !char.id || !currentToken) return Promise.resolve(false);
  char.isOnline = true;
  char.lastPlayed = Date.now();
  try {
    char.marks = JSON.parse(JSON.stringify(endgame().marks));
  } catch (e) { }

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
        });
        return true;
      } catch (e) {
        console.warn('[Dagyr Online] Failed to save online character to server over HTTP:', e);
        if (typeof window !== 'undefined' && window.net && window.net.connected) {
          try {
            window.net.send({ type: 'save_character', character: snapshot });
          } catch (netErr) { }
        }
        return false;
      }
    })
    .catch((err) => {
      console.warn('[Dagyr Online] Save promise chain recovered from error:', err);
      return false;
    });

  return savePromiseChain;
}

