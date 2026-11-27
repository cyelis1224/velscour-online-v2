// The Reliquary: a vault in Herrington Hollow shared by every hero on this browser (six tabs of 96 slots, two open
// at first), and its Codex of every Heirloom, Covenant piece, Glyphword and Sigil any hero has found. It lives in its
// own localStorage key, beside the heroes' saves (game/save.js), so deleting a hero keeps the collection.
// Tabs open by collecting (25% and 80% of the Codex) and by Town Commission lines finished (1 and 3; game/commissions.js).
import { G } from '../state.js';
import { GEMS, SIGILS, itemName, itemColor } from '../data/items.js';
import { codexKey, CODEX_TOTAL, HEIRLOOMS, GLYPHWORDS, PIECE_BY_ID, makeHeirloom, maybeRelic } from '../data/relics.js';

const KEY = 'Velscour_reliquary_v1';
export const VAULT_TABS = 6, VAULT_SIZE = 96, JEWEL_BOX_SIZE = 300;
export const MAX_RELIQUARY_GOLD = Number.MAX_SAFE_INTEGER;
export const MILESTONES = [
  { pct: 25, text: 'Vault III opens' },
  { pct: 40, text: '+3% Magic Find for every hero', mf: 3 },
  { pct: 60, text: '+5% Magic Find for every hero (in all)', mf: 5 },
  { pct: 80, text: 'Vault VI opens' },
  { pct: 100, text: 'The title "Keeper of Relics" and a golden aura', title: 'Keeper of Relics' },
];
let R = null;

let onlineHooks = {
  getAccount: () => null,
  isLoggedIn: () => false,
  saveReliquary: () => Promise.resolve(false),
};

export function setReliquaryOnlineHooks(hooks) {
  Object.assign(onlineHooks, hooks);
}

export function reliquaryStorageKey() {
  try {
    const acc = onlineHooks.getAccount ? onlineHooks.getAccount() : null;
    if (acc && acc.id) return `Velscour_reliquary_${acc.id}`;
  } catch (e) { }
  return KEY;
}

function blank() { return { tabs: Array.from({ length: VAULT_TABS }, () => Array(VAULT_SIZE).fill(null)), codex: {}, lines: 0, gold: 0, jewelBox: Array(JEWEL_BOX_SIZE).fill(null) }; }
function safeGold(value) { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }

function sanitizeReliquary(r) {
  if (!r || !Array.isArray(r.tabs)) r = blank();
  while (r.tabs.length < VAULT_TABS) r.tabs.push([]);
  for (const t of r.tabs) while (t.length < VAULT_SIZE || (t.length % 12 !== 0)) t.push(null);
  r.codex = r.codex || {};
  r.lines = r.lines || 0;
  r.gold = safeGold(r.gold);
  if (!Array.isArray(r.jewelBox)) r.jewelBox = Array(JEWEL_BOX_SIZE).fill(null);
  while (r.jewelBox.length < JEWEL_BOX_SIZE || (r.jewelBox.length % 10 !== 0)) r.jewelBox.push(null);
  return r;
}

/** The shared Reliquary (loaded once). */
export function reliquary() {
  if (R) return R;
  const k = reliquaryStorageKey();
  try { R = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { R = null; }
  if (!R && k !== KEY) {
    try { R = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { R = null; }
    if (R) {
      try { localStorage.setItem(k, JSON.stringify(R)); } catch (e) { }
    }
  }
  R = sanitizeReliquary(R);
  return R;
}

export function saveReliquary() {
  const r = reliquary();
  const k = reliquaryStorageKey();
  try { localStorage.setItem(k, JSON.stringify(r)); } catch (e) { }
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) { }
  if (onlineHooks.isLoggedIn()) {
    try { onlineHooks.saveReliquary(r); } catch (e) { }
  }
}

/** Tests or account switch: forget the cached copy (the next call reads localStorage again). */
export function resetReliquaryCache() { R = null; }

/** Adopt reliquary data from server or another client. */
export function adoptOnlineReliquary(serverRel) {
  const current = reliquary();
  if (!serverRel) {
    const hasLocal = current.tabs.some(t => t && t.some(Boolean)) || Object.keys(current.codex).length > 0 || current.lines > 0;
    if (hasLocal && onlineHooks.isLoggedIn()) {
      onlineHooks.saveReliquary(current);
    }
    return current;
  }
  const s = sanitizeReliquary(serverRel);

  // Server is the single authoritative source of truth for online accounts!
  current.tabs = s.tabs;
  current.codex = Object.assign({}, current.codex, s.codex);
  current.lines = Math.max(current.lines || 0, s.lines || 0);
  current.gold = s.gold;
  current.jewelBox = s.jewelBox;

  R = current;
  const k = reliquaryStorageKey();
  try { localStorage.setItem(k, JSON.stringify(R)); } catch (e) { }
  try { localStorage.setItem(KEY, JSON.stringify(R)); } catch (e) { }
  return R;
}

/** Shared account gold stored in the Reliquary. */
export function reliquaryGold() { return reliquary().gold || 0; }

/** Transfer gold between hero and shared Reliquary; persists both atomically. */
export function transferReliquaryGold(char, direction, rawAmount) {
  if (!char) return { ok: false, amount: 0, error: 'No active hero.' };
  const r = reliquary();
  const heroGold = safeGold(Math.floor(char.gold || 0));
  const vaultGold = safeGold(r.gold || 0);
  const want = Math.floor(Number(rawAmount) || 0);
  if (want <= 0) return { ok: false, amount: 0, error: 'Enter a gold amount greater than zero.' };

  if (direction === 'deposit') {
    const amount = Math.min(want, heroGold, MAX_RELIQUARY_GOLD - vaultGold);
    if (amount <= 0) return { ok: false, amount: 0, error: heroGold <= 0 ? 'You have no gold to deposit.' : 'Reliquary gold is at capacity.' };
    char.gold = heroGold - amount;
    r.gold = vaultGold + amount;
    saveReliquary();
    if (G.game?.autosave) G.game.autosave();
    return { ok: true, amount, heroGold: char.gold, vaultGold: r.gold };
  }
  if (direction === 'withdraw') {
    const amount = Math.min(want, vaultGold, MAX_RELIQUARY_GOLD - heroGold);
    if (amount <= 0) return { ok: false, amount: 0, error: vaultGold <= 0 ? 'The Reliquary holds no gold.' : 'Your hero gold is at capacity.' };
    r.gold = vaultGold - amount;
    char.gold = heroGold + amount;
    saveReliquary();
    if (G.game?.autosave) G.game.autosave();
    return { ok: true, amount, heroGold: char.gold, vaultGold: r.gold };
  }
  return { ok: false, amount: 0, error: 'Invalid transfer direction.' };
}

/** Account-wide Jewel Box array (migrates any legacy per-character gems on first access). */
export function accountJewelBox(char = G.char) {
  const r = reliquary();
  if (!Array.isArray(r.jewelBox)) r.jewelBox = Array(JEWEL_BOX_SIZE).fill(null);
  if (char && Array.isArray(char.jewelBox) && char.jewelBox.some(Boolean)) {
    let moved = false;
    if (char.jewelBox.length > r.jewelBox.length) {
      while (r.jewelBox.length < char.jewelBox.length) r.jewelBox.push(null);
      moved = true;
    }
    for (let i = 0; i < char.jewelBox.length; i++) {
      const it = char.jewelBox[i];
      if (!it || it.type !== 'gem') continue;
      const same = r.jewelBox.find((b) => b && b.type === 'gem' && b.gem === it.gem && b.tier === it.tier);
      if (same) {
        same.count = (same.count || 1) + (it.count || 1);
        char.jewelBox[i] = null;
        moved = true;
        continue;
      }
      const empty = r.jewelBox.findIndex((b) => !b);
      if (empty >= 0) {
        r.jewelBox[empty] = it;
        char.jewelBox[i] = null;
        moved = true;
      }
    }
    if (moved) {
      saveReliquary();
      if (G.game?.autosave) G.game.autosave();
    }
  }
  return r.jewelBox;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === reliquaryStorageKey() || e.key === KEY) {
      try {
        const next = JSON.parse(e.newValue || 'null');
        if (next && Array.isArray(next.tabs)) {
          R = sanitizeReliquary(next);
          import('../ui/ui.js').then(({ UI }) => {
            if (UI.refresh) UI.refresh();
          }).catch(() => { });
          if (G.ui?.reliquary?.active) {
            G.ui.reliquary.refresh();
          }
        }
      } catch (err) { }
    }
  });
}

/** Codex progress: {by: {h, c, g, s}, have, total, pct}. */
export function codexProgress() {
  const r = reliquary(), by = { h: 0, c: 0, g: 0, s: 0 };
  for (const k of Object.keys(r.codex)) if (by[k[0]] !== undefined) by[k[0]]++;
  const total = CODEX_TOTAL.h + CODEX_TOTAL.c + CODEX_TOTAL.g + CODEX_TOTAL.s;
  const have = by.h + by.c + by.g + by.s;
  return { by, have, total, pct: Math.floor((have / total) * 100) };
}
/** How many vault tabs are open. */
export function openTabs() {
  const pct = codexProgress().pct, lines = reliquary().lines;
  return 2 + (pct >= 25) + (lines >= 1) + (lines >= 3) + (pct >= 80);
}
/** Magic find every hero gets from the Codex. */
export function codexMf() { const pct = codexProgress().pct; return pct >= 60 ? 5 : pct >= 40 ? 3 : 0; }
export function codexTitle() { return codexProgress().pct >= 100 ? 'Keeper of Relics' : null; }

/** The codex key of anything collectable (relics, and Sigils by rank). */
export function findKey(it) {
  if (!it) return null;
  if (it.type === 'gem' && GEMS[it.gem] && GEMS[it.gem].sigil) return 's:' + it.tier;
  return codexKey(it);
}
/** Record a find in the Codex; true when it's new (with a log line and any milestone it reached). */
export function noteFind(it) {
  const k = findKey(it);
  if (!k) return false;
  const r = reliquary();
  if (r.codex[k]) return false;
  const before = codexProgress().pct, tabs = openTabs();
  r.codex[k] = Date.now();
  saveReliquary();
  const after = codexProgress();
  if (G.ui && G.ui.log) {
    G.ui.log(`New in the Codex: <span style="color:${itemColor(it)}">${itemName(it)}</span> <span class="dim">(${after.have}/${after.total})</span>`, '#e8d8a0');
    for (const m of MILESTONES) if (before < m.pct && after.pct >= m.pct) G.ui.log(`<b style="color:#ffe2a0">Codex ${m.pct}%:</b> ${m.text}.`, '#ffe2a0');
    if (openTabs() > tabs) G.ui.log('A new vault opens in the Reliquary.', '#ffe2a0');
  }
  if (G.player && codexMf() !== (G.player.codexMf || 0)) G.player.recompute();
  return true;
}
/** Undiscovered account Heirlooms eligible for a particular equipment slot. */
export function undiscoveredHeirlooms(slot = null, unboundOnly = false) {
  const known = reliquary().codex;
  return HEIRLOOMS.filter((h) => (!slot || h.slot === slot) && (!unboundOnly || (h.unbound && !h.crown)) && !known['h:' + h.id]);
}
/** Create and account-unlock a one-time Heirloom drop. Ordinary loot can use this at any level/depth. */
export function makeAccountHeirloom(ilvl, opts = {}) {
  const pool = undiscoveredHeirlooms(opts.slot || null, !!opts.unboundOnly);
  if (opts.id) {
    const H = pool.find((h) => h.id === opts.id);
    if (!H) return null;
    const item = makeHeirloom(1, { id: H.id });
    if (item) noteFind(item);
    return item;
  }
  if (!pool.length) return null;
  const item = makeHeirloom(1, { id: pool[Math.floor(Math.random() * pool.length)].id });
  if (item) noteFind(item);
  return item;
}
/** Apply the existing relic odds while ensuring a Heirloom can only be generated once account-wide. */
export function maybeAccountRelic(item, boost = 1) {
  const eligible = undiscoveredHeirlooms().map((h) => h.id);
  const result = maybeRelic(item, boost, eligible);
  if (result !== item && result?.relic === 'heir') noteFind(result);
  return result;
}
/** A Town Commission line finished (by any hero): may open a vault. */
export function noteLineDone() {
  const r = reliquary(), tabs = openTabs();
  r.lines++;
  saveReliquary();
  if (openTabs() > tabs && G.ui && G.ui.log) G.ui.log('A new vault opens in the Reliquary.', '#ffe2a0');
}
/** Every collectable entry for the Codex page: [{key, kind, name, slot}]. */
export function codexEntries() {
  return [
    ...HEIRLOOMS.map((h) => ({ key: 'h:' + h.id, kind: 'h', name: h.name, slot: h.slot })),
    ...Object.values(PIECE_BY_ID).map((p) => ({ key: 'c:' + p.id, kind: 'c', name: p.name, slot: p.slot, set: p.set })),
    ...GLYPHWORDS.map((g) => ({ key: 'g:' + g.id, kind: 'g', name: g.name, slot: g.slots[0], sig: g.sig, slots: g.slots })),
    ...SIGILS.map((s, i) => ({ key: 's:' + i, kind: 's', name: s.name + ' Sigil', rank: i })),
  ];
}
/** Put an item in the first free slot of an open vault tab (gems stack). */
export function addToVault(it, tab = null) {
  const r = reliquary(), n = openTabs();
  const order = tab != null ? [tab] : [...Array(n).keys()];
  if (it.type === 'gem') for (const t of order) { const same = r.tabs[t].find((b) => b && b.type === 'gem' && b.gem === it.gem && b.tier === it.tier); if (same) { same.count = (same.count || 1) + (it.count || 1); saveReliquary(); return true; } }
  for (const t of order) {
    if (t >= n) continue;
    const i = r.tabs[t].findIndex((b) => !b);
    if (i >= 0) { r.tabs[t][i] = it; saveReliquary(); return true; }
  }
  return false;
}
