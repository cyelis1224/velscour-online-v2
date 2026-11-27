// Full-screen menus: title, class select, hero save slots, death, victory, settings, help.
import { G, saveSettings } from '../state.js';
import { camera } from '../core/view.js';
import { el, escapeHtml, fmtInt } from '../core/util.js';
import { sfx, applyVolumes, initAudio } from '../core/audio.js';
import { CLASS_IDS, A, classSprite } from '../core/assets.js';
import { CLASSES, ACTIVE_CLASS_IDS, ATTRS } from '../data/classes.js';
import { UI, $ } from './ui.js';
import { listSaves, heroesByClass, deleteClassSaves, classSaves, writeSave, savesReadable, unreadableSaves } from '../game/save.js';
import { backupHeroes, listBackups } from '../game/herobackup.js';
import { heroCanvas, excitable, preloadPortraits } from './heroanim.js';
import { savedGearPreview, heroPortrait, heroLook, loadGearArt, characterPaperdollPortrait } from '../core/gearart.js';
import { heldPortraitArgs, loadHeld } from '../gfx/heldart.js';
import { attachTitleFx } from './titlefx.js';
import { creditsScreen } from './credits.js';
import { openCustomizeUI } from './layoutcustomizer.js';
import { MOUSE_CURSOR_DEFAULTS, refreshMouseCursor } from './mousecursor.js';
import { openHealthBarSettings } from './healthbar-settings.mjs';
import { RARITY, shownEquip, SLOTS, SLOT_NAMES } from '../data/items.js';
import { DOLL } from './inventory.js';
import { itemCell, rarityClass, itemTooltip } from './itemui.js';
import { FILTER_ROWS, lootFilter, lootLabelFilter, saveLootFilterSettings } from '../game/lootfilter.js';
import { Cloud } from '../game/cloud.js';
import { initTitleUpdater, checkForUpdates, showUpdateDialog, compareVersions, CLIENT_VERSION, getClientVersion, getServerBaseUrl, hardReload } from './updater.js';
import {
  getOnlineAccount,
  getOnlineCharacters,
  isOnlineLoggedIn,
  registerOnlineAccount,
  loginOnlineAccount,
  logoutOnlineAccount,
  fetchOnlineSession,
  checkOnlineCharName,
  createOnlineCharacter,
  deleteOnlineCharacter,
  fetchOnlineReliquary,
} from '../net/online.js';
import { isProfaneName } from '../net/profanity.js';
export { hardReload };

let current = null;

/** On phones, hide the browser chrome and prefer landscape (where supported). */
function goFullscreen() {
  if (!G.touch || document.fullscreenElement) return;
  const de = document.documentElement;
  const req = de.requestFullscreen || de.webkitRequestFullscreen;
  if (!req) return;
  try { const p = req.call(de, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => { }); } catch (e) { /* not allowed - fine */ }
}
function show(node) {
  hide();
  current = node;
  UI.screensEl.appendChild(node);
}
export function hide() { if (current) { current.remove(); current = null; } }

/** Open the Velscour Online Wiki in a browser tab (resolves server URL cleanly on native mobile & desktop). */
function openWikiBrowser() {
  const loc = window.location;
  const isNativeLocal = !loc.protocol.startsWith('http') || ((loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') && !loc.port);
  const url = isNativeLocal ? `${getServerBaseUrl()}/wiki.html` : new URL('wiki.html', loc.href).href;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function titleScreen() {
  G.mode = 'title';
  const s = el('div', 'screen');
  s.classList.add('title-screen');
  s.innerHTML = `<img class="title-logo intro" src="assets/ui/logo.webp" alt="VELSCOUR ONLINE"><div class="title-tag">A world built upon something that should have stayed dead.</div>`;

  // Update button in top right corner - ONLY shown when an update is available from server
  const updateBtn = el('button', 'title-update-btn hidden');
  updateBtn.id = 'title-update-btn';
  updateBtn.dataset.legacyId = 'title-reload-btn';
  updateBtn.title = 'New Client Update Available';
  updateBtn.setAttribute('aria-label', 'New Client Update Available');
  updateBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
    <span class="title-update-label">Update Available</span>
  `;
  s.appendChild(updateBtn);
  initTitleUpdater(updateBtn);

  const menu = el('div', 'title-menu');
  const add = (label, fn, cls = 'btn big') => { const b = el('button', cls, label); b.onclick = () => { if (!s.classList.contains('title-ready')) return; initAudio(); sfx('ui'); goFullscreen(); fn(); }; menu.appendChild(b); return b; };
  // rebuilt when the cloud brings heroes in while the title is up
  const fill = () => {
    menu.textContent = '';
    const activeSaves = listSaves().filter((c) => ACTIVE_CLASS_IDS.includes(c.classId));
    const last = activeSaves[0];
    const used = Object.keys(heroesByClass()).filter((id) => ACTIVE_CLASS_IDS.includes(id)).length;
    const spSub = used > 0
      ? ` <span style="font-size:13px;color:#a8977c">· ${used}/${ACTIVE_CLASS_IDS.length}</span>`
      : '';
    const spBtn = add(`Single Player${spSub}`, () => classSelect(last ? last.classId : 'paladin', titleScreen));
    spBtn.id = 'title-singleplayer-btn';

    const onlineAcc = getOnlineAccount();
    const onlineSub = onlineAcc && onlineAcc.email
      ? `<br><span style="font-size:12px;color:#a8977c">${escapeHtml(onlineAcc.email)}</span>`
      : '';
    const onlineBtn = add(`Online${onlineSub}`, () => onlineEntryScreen(titleScreen));
    onlineBtn.id = 'title-online-btn';

    add('Settings', settingsDialog, 'btn');
    // add('Classes', () => window.open('classes.html', '_blank'), 'btn');
    // add('Bestiary', () => window.open('bestiary.html', '_blank'), 'btn');
    add('Credits', () => creditsScreen(titleScreen), 'btn');
    add('How to Play', helpDialog, 'btn');
  };
  fill();
  s.refresh = fill;
  s.appendChild(menu);
  const foot = el('div', 'title-foot');
  s.appendChild(foot);
  s.cloudFoot = () => { foot.textContent = 'Rough draft · placeholder art · ' + cloudLine(); };
  s.cloudFoot();

  const wikiBtn = el('button', 'title-wiki-btn');
  wikiBtn.id = 'title-wiki-btn';
  wikiBtn.type = 'button';
  wikiBtn.title = 'Open Official Velscour Wiki in Browser';
  wikiBtn.setAttribute('aria-label', 'Open Official Velscour Wiki in Browser');
  wikiBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
    <span>Wiki</span>
  `;
  wikiBtn.onclick = (e) => {
    e.stopPropagation();
    if (!s.classList.contains('title-ready')) return;
    initAudio();
    sfx('ui');
    openWikiBrowser();
  };
  s.appendChild(wikiBtn);
  const gate = el('div', 'title-gate', G.touch ? 'Tap to awaken' : 'Click to awaken');
  s.appendChild(gate);
  show(s);
  attachTitleFx(s, s.querySelector('.title-logo'), {
    tag: s.querySelector('.title-tag'),
    menu,
    gate,
    onAwaken: (proceed) => {   // once a visit (not again back from a game), never once "Don't show this window again" is ticked
      if (flashWarned || G.settings.flashWarning === false) return proceed();
      flashWarned = true;
      showSeizureWarningSplash(proceed);
    },
  });
  Cloud.flush();
  Cloud.sync();
  if (Cloud.conflicts.size) conflictDialogs();
  if (!unreadableNoted && !savesReadable()) {
    unreadableNoted = true;
    UI.dialog({ title: 'Saved heroes unreadable', html: `<p>The heroes saved in this browser could not be read. VELSCOUR will not write over them: before anything new is saved, the old data is set aside.</p><p class="dim">Settings &gt; Hero backups can download it, so it can be recovered.${Cloud.signedIn ? ' Heroes in your Google cloud save come back on their own once the next save is made.' : ''}</p>`, buttons: [{ label: 'OK' }] });
  }
}

/** Photosensitive Epilepsy & Seizure Warning splash screen shown upon awakening the game. */
export function showSeizureWarningSplash(onContinue) {
  const splash = el('div', 'seizure-warning-splash');
  const card = el('div', 'seizure-warning-card');

  card.innerHTML = `
    <div class="seizure-warning-icon">⚠️</div>
    <h2 class="seizure-warning-title">PHOTOSENSITIVE EPILEPSY &amp; SEIZURE WARNING</h2>
    <h3 class="seizure-warning-subtitle">WARNING: FLASHING LIGHTS AND VISUAL EFFECTS</h3>
    <div class="seizure-warning-body">
      <p>This game contains flashing lights, strobing effects, rapidly changing colors, and visual patterns that may trigger seizures or other adverse reactions in individuals with photosensitive epilepsy or other visual sensitivities.</p>
      <p>Some individuals may experience seizures when exposed to certain flashing lights or visual patterns, even if they have no prior history of epilepsy or seizures.</p>
      <p>Stop playing immediately if you experience dizziness, visual disturbances, eye or muscle twitching, involuntary movements, confusion, disorientation, or loss of awareness.</p>
      <p>If you experience a seizure, seek medical attention. Consult a healthcare professional before playing if you have a history of seizures or photosensitivity.</p>
      <p class="seizure-warning-advisory">PLAYER DISCRETION IS ADVISED.</p>
    </div>
    <div class="seizure-warning-toggle">
      <label class="seizure-toggle-label">
        <input type="checkbox" id="seizure-reduce-flashing-checkbox" ${G.settings.reduceFlashing ? 'checked' : ''}>
        <span>Reduce flashing &amp; strobing visual effects</span>
      </label>
      <label class="seizure-toggle-label">
        <input type="checkbox" id="seizure-dont-show-checkbox">
        <span>Don't show this window again</span>
      </label>
      <div class="seizure-warning-hint">Both can be changed later in Settings &gt; Graphics.</div>
    </div>
    <div class="seizure-warning-prompt">${G.touch ? 'Tap anywhere to continue' : 'Click anywhere to continue'}</div>
  `;

  splash.appendChild(card);
  document.body.appendChild(splash);

  // each box saves at once: reduce flashing, and "don't show again" (Settings > Graphics > Flashing-lights warning at start)
  for (const [id, apply] of [['#seizure-reduce-flashing-checkbox', (on) => { G.settings.reduceFlashing = on; }], ['#seizure-dont-show-checkbox', (on) => { G.settings.flashWarning = !on; }]]) {
    const box = card.querySelector(id);
    if (!box) continue;
    box.onchange = (e) => {
      e.stopPropagation();
      apply(!!box.checked);
      saveSettings();
    };
    box.onclick = (e) => e.stopPropagation();
    box.onpointerdown = (e) => e.stopPropagation();
  }

  let closed = false;
  const allowDismissAt = performance.now() + 400; // guard against the awaken tap immediately dismissing

  const dismiss = (e) => {
    if (closed || performance.now() < allowDismissAt) return;
    if (e && e.target && e.target.closest && e.target.closest('.seizure-toggle-label')) return;
    closed = true;
    window.removeEventListener('keydown', onKeyDown);
    splash.classList.add('fading');
    setTimeout(() => {
      splash.remove();
      if (onContinue) onContinue();
    }, 280);
  };

  const onKeyDown = (e) => {
    if (closed || performance.now() < allowDismissAt) return;
    if (e.key === 'Tab') return;
    dismiss();
  };

  splash.addEventListener('click', dismiss);
  splash.addEventListener('pointerup', dismiss);
  window.addEventListener('keydown', onKeyDown);
}
let unreadableNoted = false, flashWarned = false;
if (typeof addEventListener === 'function') {
  const onBlocked = () => {
    UI.dialog({ title: 'Not saving', html: '<p>The heroes saved in this browser could not be read, and there was no room to set them aside, so the game is not saving over them. Free some browser storage (or use another browser) and reload.</p>', buttons: [{ label: 'OK' }] });
  };
  addEventListener('velscour-save-blocked', onBlocked);
  addEventListener('Velscour-save-blocked', onBlocked);
}

// ------------------------------------------------------------ cloud saves (game/cloud.js)
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return !t ? 'never' : m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
function cloudLine() {
  if (!Cloud.signedIn) return 'progress saves in this browser';
  return { loading: 'connecting to Google…', syncing: 'syncing with Google…', ok: 'saves sync with your Google account', conflict: 'a hero needs a choice of copies', offline: 'offline: saving in this browser', error: 'cloud save problem (see Settings)' }[Cloud.status] || 'saves sync with your Google account';
}
const heroLine = (h, cls) => h
  ? `<b>${escapeHtml(h.name)}</b><br>Level ${h.level} · Depth ${h.depth} · ${fmtInt(h.gold || 0)} gold<br><span class="dim">played ${ago(h.lastPlayed)}</span>`
  : `<span class="dim">No ${CLASSES[cls] ? CLASSES[cls].name : 'hero'} (deleted)</span>`;
let asking = false;
/** Both this device and the cloud changed a class's hero since they last synced: the player keeps one of them. */
export function conflictDialogs(onDone) {
  if (asking) return;
  const c = [...Cloud.conflicts.values()].find((x) => !x.later && !(G.mode === 'game' && G.char && G.char.classId === x.cls));
  if (!c) { onDone && onDone(); return; }
  asking = true;
  const name = CLASSES[c.cls] ? CLASSES[c.cls].name : c.cls;
  const html = `<p>Your ${name} changed both here and on another device since they last synced. Which copy do you keep?</p>
    <div class="cloud-pick"><div><h3>This device</h3>${heroLine(c.local, c.cls)}</div><div><h3>Google cloud</h3>${heroLine(c.cloud, c.cls)}</div></div>
    <p class="dim" style="font-size:12px">The other copy is replaced. Later keeps both apart for now (this hero won't sync until you choose).</p>`;
  const next = () => { asking = false; setTimeout(() => conflictDialogs(onDone), 0); };
  UI.dialog({
    title: 'Two copies of a hero', html, closable: false, cls: 'cloud-conflict',
    buttons: [
      { label: 'Later', fn: () => { c.later = true; next(); } },
      { label: 'Keep this device', fn: () => Cloud.resolve(c.cls, 'local').then(next) },
      { label: 'Keep the cloud', cls: 'red', fn: () => Cloud.resolve(c.cls, 'cloud').then(next) },
    ],
  });
}
Cloud.on((what) => {
  if (what === 'change' && current && current.refresh) current.refresh();
  if (what === 'status' && current && current.cloudFoot) current.cloudFoot();
  if (what === 'status' && cloudRow) cloudRow();
  if (what !== 'conflict') return;
  if (G.mode !== 'game') { conflictDialogs(); return; }
  const cls = G.char && G.char.classId;
  if (Cloud.conflicts.has(cls) && Cloud.warnOnce(cls)) UI.log(`This hero was also played on another device. Its cloud save is paused: you will choose which copy to keep on the title screen.`, '#ffb060');
});

const WHY = { cloud: 'replaced by the cloud copy', deleted: 'deleted on another device', cloudcopy: 'cloud copy, replaced by this device', restore: 'replaced by a restored backup' };
/** Settings > Hero backups: every hero cloud sync replaced or deleted, newest first; Restore puts one back. */
export function backupsDialog() {
  const d = UI.dialog({ title: 'Hero Backups', html: '<p class="dim">Loading…</p>', buttons: [{ label: 'Done' }], cls: 'backups-dialog' });
  const body = d.box.querySelector('.dlg-body');
  Promise.all([listBackups().catch(() => null), unreadableSaves()]).then(([list, raws]) => {
    if (!d.box.isConnected) return;
    if (!list && !raws.length) { body.innerHTML = '<p>Backups can\'t be opened in this browser.</p>'; return; }
    list = list || [];
    if (!list.length && !raws.length) { body.innerHTML = '<p>No backups yet. Whenever cloud sync replaces or deletes a hero on this device, the old one is kept here.</p>'; return; }
    body.innerHTML = `<p class="dim" style="font-size:12px">${G.mode === 'game' ? 'Return to the title screen to restore a hero.' : 'Restoring makes that copy the class\'s hero; the one it replaces is backed up too.'}</p><div class="backup-list"></div>`;
    const box = body.querySelector('.backup-list');
    for (const r of raws) {   // unreadable save data set aside by save.js: download it for recovery
      const row = el('div', 'backup-row', `<span><b>Unreadable saved heroes</b> · ${fmtInt(Math.ceil(r.text.length / 1024))} KB<br><span class="dim">set aside before a new save · ${new Date(r.at).toLocaleString()}</span></span>`);
      const btn = el('button', 'btn small', 'Download');
      btn.onclick = () => {
        sfx('ui');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([r.text], { type: 'application/json' }));
        a.download = `Velscour-unreadable-saves-${new Date(r.at).toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      };
      row.appendChild(btn);
      box.appendChild(row);
    }
    for (const b of list) {
      const h = b.hero, C = CLASSES[b.cls];
      const row = el('div', 'backup-row', `<span><b>${escapeHtml(h.name)}</b> · ${C ? C.name : escapeHtml(b.cls)} · Lv ${h.level} · Depth ${h.depth} · ${fmtInt(h.gold || 0)} gold<br><span class="dim">${WHY[b.why] || escapeHtml(b.why)} · ${new Date(b.at).toLocaleString()}</span></span>`);
      const btn = el('button', 'btn small', 'Restore');
      btn.disabled = G.mode === 'game';
      btn.onclick = () => {
        sfx('ui');
        UI.confirm('Restore hero?', `Make this copy of ${escapeHtml(h.name)} (Level ${h.level}) your ${C ? C.name : 'hero'}? The current one is kept as a backup.`, async () => {
          try { await backupHeroes(classSaves(b.cls), 'restore'); } catch (e) { UI.dialog({ title: 'Hero Backups', html: '<p>Could not back up the current hero first, so nothing was restored.</p>', buttons: [{ label: 'OK' }] }); return; }
          writeSave(JSON.parse(JSON.stringify(h)));
          d.close();
          if (current && current.refresh) current.refresh();
          UI.dialog({ title: 'Hero Backups', html: `<p>${escapeHtml(h.name)} is restored.</p>`, buttons: [{ label: 'OK' }] });
        }, 'Restore');
      };
      row.appendChild(btn);
      box.appendChild(row);
    }
  }).catch((e) => { console.warn(e); if (d.box.isConnected) body.innerHTML = '<p>Backups can\'t be opened in this browser.</p>'; });
  return d;
}

let cloudRow = null;
/** Settings > Cloud save: sign in with Google, or the account, last sync, Sync now and Sign out. */
export function cloudDialog(onDone) {
  const u = Cloud.user;
  const html = `<p>Signed in with Google as <b>${escapeHtml(u.name || u.email)}</b>${u.name && u.email ? `<br><span class="dim">${escapeHtml(u.email)}</span>` : ''}</p>
    <p>Your heroes are saved in this browser and copied to your Google account, so you can play them on any device where you sign in.</p>
    <p class="dim" data-cloud-status></p>`;
  const d = UI.dialog({
    title: 'Cloud Save', html,
    buttons: [
      { label: 'Sign out', cls: 'red', fn: () => Cloud.signOut().then(() => onDone && onDone()) },
      { label: 'Sync now', keepOpen: true, fn: () => Cloud.sync(true).then(() => { stat(); if (Cloud.conflicts.size && G.mode !== 'game') conflictDialogs(); }) },
      { label: 'Done', fn: () => onDone && onDone() },
    ],
  });
  const stat = () => {
    const p = d.box.querySelector('[data-cloud-status]');
    if (p) p.textContent = (Cloud.error || ({ syncing: 'Syncing…', loading: 'Connecting…', conflict: 'A hero has two copies to choose from.' }[Cloud.status] || '')) + ` Last synced ${ago(Cloud.lastSync)}.`;
  };
  stat();
  Cloud.on((w) => { if (w === 'status' && d.box.isConnected) stat(); });
  return d;
}
const cloudErr = (e) => {
  const c = String(e && e.code || '');
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return '';
  if (c === 'auth/popup-blocked') return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site, then try again.';
  if (c === 'auth/unauthorized-domain') return 'Google sign-in is not set up for this web address yet.';
  if (c === 'auth/network-request-failed' || !navigator.onLine) return 'Could not reach Google. Check your connection and try again.';
  return 'Google sign-in failed: ' + escapeHtml(String(e && (e.message || e)));
};

const plaque = (name) => `<div class="plaque"><span>${escapeHtml(name)}</span></div>`;

/**
 * Renders an interactive equipment paperdoll for `char` with 11 equipment slots
 * and a center portrait showing their current equipped armor, helmet, and held weapons.
 */
export function renderPaperdoll(char, container = null) {
  const doll = container || el('div', 'paperdoll');
  doll.innerHTML = '';

  const portrait = el('div', 'portrait');
  const img = new Image();
  const eq = shownEquip(char);
  const look = heroLook(char.classId, eq?.body, eq?.head);
  const held = heldPortraitArgs(look, char.classId, eq);
  const initial = heroPortrait(char.classId, eq?.body, eq?.head, 130, 260, ...held) || classSprite(char.classId, 260);
  if (initial) img.src = initial.toDataURL();

  portrait.appendChild(img);
  portrait.style.gridColumn = '3';
  portrait.style.gridRow = '3 / span 2';
  doll.appendChild(portrait);

  const charKey = char.id || (char.classId + '_' + (char.name || ''));
  doll.dataset.charKey = charKey;
  characterPaperdollPortrait(char, 130, 260).then(cv => {
    if (!cv || !doll.isConnected || doll.dataset.charKey !== String(charKey)) return;
    img.src = cv.toDataURL();
  });

  for (const sKey of SLOTS) {
    const it = char.equip ? char.equip[sKey] : null;
    const slotEl = el('div', 'eslot ' + rarityClass(it));
    const [cx, cy] = DOLL[sKey];
    slotEl.style.gridColumn = cx;
    slotEl.style.gridRow = cy;
    if (it) {
      slotEl.appendChild(itemCell(it));
      UI.tip(slotEl, () => itemTooltip(it));
    } else {
      slotEl.appendChild(el('span', 'lbl', SLOT_NAMES[sKey] || sKey));
    }
    doll.appendChild(slotEl);
  }

  return doll;
}

/** Hero select: one hero per class. A class with a hero plays it; an empty class names and starts a new one.
 * Delete arms delete mode: the next class picked with a hero is deleted (after a confirm), freeing that class. */
export function classSelect(sel = 'paladin', back = titleScreen) {
  if (!ACTIVE_CLASS_IDS.includes(sel)) sel = 'paladin';
  const heroes = heroesByClass();
  const activeCount = Object.keys(heroes).filter((id) => ACTIVE_CLASS_IDS.includes(id)).length;
  let delMode = false;
  preloadPortraits(ACTIVE_CLASS_IDS);
  const s = el('div', 'screen class-screen');
  s.appendChild(el('h2', 'screen-title', `CHOOSE YOUR HERO <small>${activeCount} of ${ACTIVE_CLASS_IDS.length} heroes</small>`));
  const grid = el('div', 'class-grid');
  const info = el('div', 'class-info');
  const bigBox = el('div', 'class-big');
  const big = heroCanvas(sel, 'hero-cv');
  bigBox.appendChild(big.canvas);
  const dollBox = el('div', 'class-doll-box');
  const text = el('div', 'class-text');
  info.append(bigBox, dollBox, text);
  const cards = {};
  const showSavedGear = (id, anim) => {
    const h = heroes[id];
    if (!h || !h.equip) return;
    const look = shownEquip(h);
    savedGearPreview(id, look.body, look.head, look.weapon, look.offhand).then(art => {
      if (!art || !s.isConnected || anim.id !== id) return;
      anim.setArt(art);
      anim.canvas.dataset.gearPreview = 'ready';
    });
  };
  const row = el('div', 'row');
  const name = el('input', 'name-input');
  const go = el('button', 'btn big', 'Begin');
  const delBtn = el('button', 'btn red', 'Delete');
  const renderInfo = () => {
    const C = CLASSES[sel], h = heroes[sel];
    if (h) {
      bigBox.style.display = 'none';
      dollBox.style.display = '';
      dollBox.innerHTML = '';
      const doll = renderPaperdoll(h);
      doll.classList.add('online-char-paperdoll');
      dollBox.appendChild(doll);
    } else {
      dollBox.style.display = 'none';
      dollBox.innerHTML = '';
      bigBox.style.display = '';
      big.setId(sel);
    }
    const hName = (h?.name || '').trim();
    const hHasCls = hName.toLowerCase().includes(C.name.toLowerCase());
    const hClsTag = hHasCls ? '' : ` ${C.name}`;
    text.innerHTML = (h ? `<h2>${escapeHtml(hName || C.name)}</h2><p><b style="color:#ffd34a">Level ${h.level}${hClsTag}</b> · Depth ${h.depth} · Deepest ${h.deepest || 0} · ${fmtInt(h.gold)} gold</p>` : `<h2>${C.name}</h2>`) +
      `<p>${escapeHtml(C.desc)}</p><p class="dim">Skill trees: <b style="color:#e9dcc4">${C.trees.join(' · ')}</b><br>Primary attribute: <b style="color:#ffd34a">${ATTRS[C.primary].name}</b> · Life ${C.life} · Mana ${C.mana}</p>`;
    for (const id in cards) cards[id].classList.toggle('sel', id === sel);
    name.style.display = h ? 'none' : '';
    go.innerHTML = h ? 'Play' : 'Begin';
    s.classList.toggle('del-mode', delMode);
    delBtn.innerHTML = delMode ? 'Cancel' : 'Delete';
  };
  const delHero = (id) => {
    delMode = false;
    renderInfo();
    UI.confirm('Delete hero?', `Permanently delete ${escapeHtml(heroes[id].name)}, the ${CLASSES[id].name}? You can then start a new ${CLASSES[id].name}.`, () => { deleteClassSaves(id); classSelect(id, back); }, 'Delete');
  };
  for (const id of ACTIVE_CLASS_IDS) {
    const card = el('div', 'class-card' + (heroes[id] ? ' has-hero' : ''));
    const anim = heroCanvas(id);
    card.appendChild(anim.canvas);
    showSavedGear(id, anim);
    const h = heroes[id];
    if (h) card.insertAdjacentHTML('beforeend', `<div class="card-lv">Lv ${h.level}</div>`);
    card.insertAdjacentHTML('beforeend', plaque(h ? h.name : CLASSES[id].name));
    card.dataset.id = id;
    card.onclick = () => {
      if (delMode && heroes[id]) { sfx('ui'); delHero(id); return; }
      if (sel !== id) { sel = id; sfx('ui'); renderInfo(); }
    };
    card.ondblclick = () => { if (!delMode) start(); };
    grid.appendChild(card);
    cards[id] = card;
  }
  s.appendChild(grid);
  s.appendChild(info);
  row.style.justifyContent = 'center';
  row.style.margin = '6px 0 14px';
  name.placeholder = 'Hero name';
  name.maxLength = 18;
  const backBtn = el('button', 'btn', 'Back');
  backBtn.onclick = () => { sfx('ui'); back(); };
  delBtn.onclick = () => {
    sfx('ui');
    if (!Object.keys(heroes).length) return;
    if (!delMode && heroes[sel]) { delHero(sel); return; }
    delMode = !delMode;
    renderInfo();
  };
  const start = async () => {
    sfx('ui');
    await Cloud.settle();
    const h = heroesByClass()[sel];   // fresh: the cloud may have brought this class's hero in
    if (h) {
      G.game.startSinglePlayer(h, false);
    } else {
      const enteredName = name.value.trim() || CLASSES[sel].name;
      if (isProfaneName(enteredName)) {
        UI.alert('Inappropriate Name', 'Hero name contains prohibited or inappropriate language. Please choose another name.');
        return;
      }
      G.game.startSinglePlayer({ classId: sel, name: enteredName }, true);
    }
  };
  go.onclick = start;
  name.onkeydown = (e) => { if (e.key === 'Enter') start(); };
  row.append(backBtn, delBtn, name, go);
  s.appendChild(row);
  renderInfo();
  show(s);
  s.refresh = () => classSelect(sel, back);
}

/**
 * Entry point when choosing Online from the title screen:
 * Verifies client version, then opens the Login/Register panel (or Character Roster if already authenticated).
 */
export async function onlineEntryScreen(back = titleScreen) {
  try {
    const updateInfo = await checkForUpdates({ force: true });
    const currentVer = getClientVersion();
    const serverVer = updateInfo?.serverVersion;
    const isOutdated = !!(updateInfo && (updateInfo.hasUpdate || (serverVer && compareVersions(serverVer, currentVer) > 0)));
    if (isOutdated) {
      showUpdateDialog(updateInfo);
      return;
    }
  } catch (e) {
    // Allow continuing to login screen
  }

  if (isOnlineLoggedIn()) {
    const session = await fetchOnlineSession();
    if (session && session.account) {
      onlineCharSelectScreen(null, back);
      return;
    }
  }
  onlineAuthScreen('login', back);
}

/**
 * Online Account Login & Registration Panel.
 * Users register using their email address and password, or sign into an existing account.
 */
export function onlineAuthScreen(initialTab = 'login', back = titleScreen) {
  let mode = initialTab === 'register' ? 'register' : 'login';
  let busy = false;

  const s = el('div', 'screen online-auth-screen');

  const panel = el('div', 'online-auth-panel');
  panel.innerHTML = `
    <div class="online-auth-header">
      <div class="online-auth-badge">VELSCOUR ONLINE REALM</div>
      <h2 class="online-auth-title" id="online-auth-title">ACCOUNT LOGIN</h2>
      <p class="online-auth-sub" id="online-auth-sub">Sign in with your email to access your server-saved online characters</p>
    </div>
    <div class="online-auth-tabs" role="tablist">
      <button type="button" class="online-auth-tab active" data-tab="login" id="online-tab-login">Sign In</button>
      <button type="button" class="online-auth-tab" data-tab="register" id="online-tab-register">Create Account</button>
    </div>
    <form class="online-auth-form" id="online-auth-form" autocomplete="on">
      <label class="online-auth-field">
        <span class="online-auth-label">Email Address</span>
        <input type="email" class="online-auth-input" id="online-auth-email" placeholder="adventurer@example.com" autocomplete="email" required />
      </label>
      <label class="online-auth-field">
        <span class="online-auth-label">Password</span>
        <input type="password" class="online-auth-input" id="online-auth-password" placeholder="At least 6 characters" autocomplete="current-password" required />
      </label>
      <label class="online-auth-field hidden" id="online-auth-confirm-wrap">
        <span class="online-auth-label">Confirm Password</span>
        <input type="password" class="online-auth-input" id="online-auth-confirm" placeholder="Re-enter password" autocomplete="new-password" />
      </label>
      <div class="online-auth-error hidden" id="online-auth-error" role="alert"></div>
      <div class="online-auth-actions">
        <button type="button" class="btn" id="online-auth-back">Back</button>
        <button type="submit" class="btn big" id="online-auth-submit">Sign In</button>
      </div>
      <div class="online-auth-switch">
        <button type="button" class="online-auth-link" id="online-auth-toggle-link">Need an account? Register with your email</button>
      </div>
    </form>
  `;
  s.appendChild(panel);

  const titleEl = panel.querySelector('#online-auth-title');
  const subEl = panel.querySelector('#online-auth-sub');
  const tabLogin = panel.querySelector('#online-tab-login');
  const tabRegister = panel.querySelector('#online-tab-register');
  const emailInput = panel.querySelector('#online-auth-email');
  const passInput = panel.querySelector('#online-auth-password');
  const confirmWrap = panel.querySelector('#online-auth-confirm-wrap');
  const confirmInput = panel.querySelector('#online-auth-confirm');
  const errEl = panel.querySelector('#online-auth-error');
  const backBtn = panel.querySelector('#online-auth-back');
  const submitBtn = panel.querySelector('#online-auth-submit');
  const toggleLink = panel.querySelector('#online-auth-toggle-link');
  const form = panel.querySelector('#online-auth-form');

  const showError = (msg) => {
    if (!msg) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    } else {
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
    }
  };

  const syncMode = () => {
    const isReg = mode === 'register';
    tabLogin.classList.toggle('active', !isReg);
    tabRegister.classList.toggle('active', isReg);
    titleEl.textContent = isReg ? 'CREATE ONLINE ACCOUNT' : 'ACCOUNT LOGIN';
    subEl.textContent = isReg
      ? 'Register with your email to store and manage your online characters on the server'
      : 'Sign in with your email to access your server-saved online characters';
    confirmWrap.classList.toggle('hidden', !isReg);
    passInput.setAttribute('autocomplete', isReg ? 'new-password' : 'current-password');
    submitBtn.textContent = busy
      ? (isReg ? 'Creating Account…' : 'Signing In…')
      : (isReg ? 'Create Account' : 'Sign In');
    toggleLink.textContent = isReg
      ? 'Already have an account? Sign In'
      : 'Need an account? Register with your email';
    showError('');
  };

  tabLogin.onclick = () => { if (busy) return; sfx('ui'); mode = 'login'; syncMode(); };
  tabRegister.onclick = () => { if (busy) return; sfx('ui'); mode = 'register'; syncMode(); };
  toggleLink.onclick = () => { if (busy) return; sfx('ui'); mode = mode === 'login' ? 'register' : 'login'; syncMode(); };
  backBtn.onclick = () => { if (busy) return; sfx('ui'); back(); };

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    sfx('ui');
    const email = emailInput.value.trim();
    const pass = passInput.value;
    const confirm = confirmInput.value;

    if (!email || !email.includes('@')) {
      showError('Please enter a valid email address.');
      return;
    }
    if (!pass || pass.length < 6) {
      showError('Password must be at least 6 characters.');
      return;
    }
    if (mode === 'register' && pass !== confirm) {
      showError('Passwords do not match.');
      return;
    }

    busy = true;
    submitBtn.disabled = true;
    syncMode();
    try {
      if (mode === 'register') {
        await registerOnlineAccount(email, pass);
      } else {
        await loginOnlineAccount(email, pass);
      }
      busy = false;
      onlineCharSelectScreen(null, back);
    } catch (err) {
      busy = false;
      submitBtn.disabled = false;
      syncMode();
      showError(err.message || 'Authentication failed. Please try again.');
    }
  };

  syncMode();
  show(s);
  setTimeout(() => { if (emailInput.isConnected) emailInput.focus(); }, 40);
}

/**
 * Online Character Roster Screen:
 * Shows all characters belonging to the logged-in account (supporting multiple characters per class),
 * with options to Create, Delete, or Enter Lobby with the selected character.
 */
export function onlineCharSelectScreen(selectedCharId = null, back = titleScreen) {
  if (!isOnlineLoggedIn()) {
    onlineAuthScreen('login', back);
    return;
  }

  preloadPortraits(ACTIVE_CLASS_IDS);
  fetchOnlineReliquary().catch(() => { });
  const acc = getOnlineAccount();
  let chars = getOnlineCharacters().filter(c => c && ACTIVE_CLASS_IDS.includes(c.classId));
  let selId = selectedCharId && chars.some(c => c.id === selectedCharId)
    ? selectedCharId
    : (chars[0] ? chars[0].id : null);

  const s = el('div', 'screen class-screen online-char-screen');

  // Top Header with Title and Red Back Button (top right)
  const topBar = el('div', 'online-roster-topbar');
  topBar.innerHTML = `
    <div class="online-roster-heading">
      <h2 class="screen-title">ONLINE CHARACTERS <small id="online-char-count">${chars.length} ${chars.length === 1 ? 'Hero' : 'Heroes'}</small></h2>
    </div>
    <button type="button" class="btn red d2-btn-quit" id="online-roster-back-btn">Back</button>
  `;
  s.appendChild(topBar);

  const backBtn = topBar.querySelector('#online-roster-back-btn');
  backBtn.onclick = () => {
    sfx('ui');
    back();
  };

  // Main Layout: Left (Characters Grid) + Right (Character Info & Equipment Panel)
  const mainLayout = el('div', 'online-roster-main');
  const leftCol = el('div', 'online-roster-left');
  const grid = el('div', 'class-grid online-char-grid');
  leftCol.appendChild(grid);

  const rightCol = el('div', 'online-roster-right');
  const detailPanel = el('div', 'online-char-detail-panel');
  rightCol.appendChild(detailPanel);

  mainLayout.append(leftCol, rightCol);
  s.appendChild(mainLayout);

  // Bottom Footer with Account Info & Logout in bottom right
  const footer = el('div', 'online-roster-footer');
  footer.innerHTML = `
    <div class="online-account-bar">
      <span class="online-account-email" title="Logged in account">Account: <b>${escapeHtml(acc ? acc.email : '')}</b></span>
      <button type="button" class="btn small" id="online-logout-btn">Log Out</button>
    </div>
  `;
  s.appendChild(footer);

  const logoutBtn = footer.querySelector('#online-logout-btn');
  logoutBtn.onclick = async () => {
    sfx('ui');
    await logoutOnlineAccount();
    onlineAuthScreen('login', back);
  };

  const playBtn = el('button', 'btn big online-enter-btn', 'Enter Lobby');
  playBtn.id = 'online-enter-lobby-btn';
  const delBtn = el('button', 'btn red online-delete-btn', 'Delete Character');
  delBtn.id = 'online-delete-char-btn';

  const actions = el('div', 'online-detail-actions');
  actions.append(playBtn, delBtn);
  rightCol.appendChild(actions);

  const enterSelectedLobby = () => {
    const selChar = chars.find(c => c.id === selId);
    if (!selChar) return;
    sfx('ui');
    G.game.selectAndEnterLobby(selChar, false, () => onlineCharSelectScreen(selChar.id, back));
  };

  playBtn.onclick = enterSelectedLobby;

  delBtn.onclick = () => {
    const selChar = chars.find(c => c.id === selId);
    if (!selChar) return;
    sfx('ui');
    const C = CLASSES[selChar.classId] || { name: 'Hero' };
    UI.confirm(
      'Delete Online Character?',
      `Permanently delete <b>${escapeHtml(selChar.name)}</b> (Level ${selChar.level || 1} ${escapeHtml(C.name)}) from your account? This frees the name "${escapeHtml(selChar.name)}" and cannot be undone.`,
      async () => {
        try {
          const res = await deleteOnlineCharacter(selChar.id);
          chars = (res?.characters || []).filter(c => c && ACTIVE_CLASS_IDS.includes(c.classId));
          selId = chars[0] ? chars[0].id : null;
          renderRoster();
        } catch (err) {
          UI.dialog({ title: 'Delete Failed', html: `<p>${escapeHtml(err.message || 'Could not delete character.')}</p>`, buttons: [{ label: 'OK' }] });
        }
      },
      'Delete'
    );
  };

  const showCharGear = (charObj, anim) => {
    if (!charObj || !charObj.equip) return;
    const look = shownEquip(charObj);
    savedGearPreview(charObj.classId, look.body, look.head, look.weapon, look.offhand).then(art => {
      if (!art || !s.isConnected || anim.id !== charObj.classId) return;
      anim.setArt(art);
      anim.canvas.dataset.gearPreview = 'ready';
    });
  };

  const cards = new Map();

  const renderRoster = () => {
    grid.textContent = '';
    cards.clear();
    const countEl = topBar.querySelector('#online-char-count');
    if (countEl) countEl.textContent = `${chars.length} ${chars.length === 1 ? 'Hero' : 'Heroes'}`;

    if (selId && !chars.some(c => c.id === selId)) {
      selId = chars[0] ? chars[0].id : null;
    }

    for (const c of chars) {
      const C = CLASSES[c.classId] || CLASSES.paladin;
      const card = el('div', 'class-card has-hero online-char-card' + (c.id === selId ? ' sel' : ''));
      card.dataset.charId = c.id;
      card.dataset.classId = c.classId;
      const anim = heroCanvas(c.classId);
      card.appendChild(anim.canvas);
      showCharGear(c, anim);
      card.insertAdjacentHTML('beforeend', `<div class="card-lv">Lv ${c.level || 1} · ${escapeHtml(C.name)}</div>`);
      card.insertAdjacentHTML('beforeend', plaque(c.name || C.name));
      card.onclick = () => {
        if (selId !== c.id) {
          selId = c.id;
          sfx('ui');
          renderDetails();
        }
      };
      card.ondblclick = () => enterSelectedLobby();
      grid.appendChild(card);
      cards.set(c.id, card);
    }

    // "+ Create New Character" card in the grid
    const createCard = el('div', 'class-card online-create-card');
    createCard.id = 'online-create-card';
    createCard.innerHTML = `
      <div class="online-create-card-inner">
        <div class="online-create-plus">+</div>
        <div class="online-create-label">New Character</div>
      </div>
      ${plaque('Create Hero')}
    `;
    createCard.onclick = () => {
      sfx('ui');
      onlineCreateCharScreen(() => onlineCharSelectScreen(selId, back));
    };
    grid.appendChild(createCard);

    renderDetails();
  };

  const renderDetails = () => {
    for (const [id, card] of cards.entries()) {
      card.classList.toggle('sel', id === selId);
    }
    const selChar = chars.find(c => c.id === selId) || null;
    detailPanel.innerHTML = '';

    if (!selChar) {
      detailPanel.innerHTML = `
        <div class="online-detail-header">
          <h2 class="online-char-name">No Online Characters Yet</h2>
          <p>Your account currently has no characters on the realm. Click the <b>+ New Character</b> card on the left to forge a new hero and claim your unique character name.</p>
          <p class="dim">You can create multiple characters of any class, all stored and protected on the server under your account.</p>
        </div>
      `;
      delBtn.disabled = true;
      playBtn.disabled = true;
      return;
    }

    delBtn.disabled = false;
    playBtn.disabled = false;
    const C = CLASSES[selChar.classId] || CLASSES.paladin;

    // Header info
    const header = el('div', 'online-detail-header');
    header.innerHTML = `
      <h2 class="online-char-name">${escapeHtml(selChar.name)}</h2>
      <div class="online-char-meta">
        <b style="color:#ffd34a">Level ${selChar.level || 1} ${escapeHtml(C.name)}</b>
        · Depth ${selChar.depth || 1} · Deepest ${selChar.deepest || 0} · <span style="color:#ffd34a">${fmtInt(selChar.gold || 0)} gold</span>
      </div>
      <p class="online-char-lore">${escapeHtml(C.desc)}</p>
      <div class="online-char-stats dim">
        Skill trees: <b style="color:#e9dcc4">${C.trees.join(' · ')}</b><br>
        Primary attribute: <b style="color:#ffd34a">${ATTRS[C.primary].name}</b> · Life ${C.life} · Mana ${C.mana}
      </div>
    `;
    detailPanel.appendChild(header);

    // Equipment Paperdoll Section
    const equipSection = el('div', 'online-detail-equip');
    const titleRow = el('div', 'inv-section-title');
    titleRow.appendChild(el('div', 'inv-title-label', 'Equipment'));
    equipSection.appendChild(titleRow);

    const doll = el('div', 'paperdoll online-char-paperdoll');
    renderPaperdoll(selChar, doll);
    equipSection.appendChild(doll);
    detailPanel.appendChild(equipSection);
  };

  renderRoster();
  show(s);

  // Refresh latest character list from server in background
  fetchOnlineSession().then(sess => {
    if (!s.isConnected) return;
    if (!sess || !sess.account) {
      onlineAuthScreen('login', back);
      return;
    }
    chars = (sess?.characters || []).filter(c => c && ACTIVE_CLASS_IDS.includes(c.classId));
    renderRoster();
  });
}

/**
 * Online Character Creation Screen:
 * Lets the player pick any class (even if they already have characters of that class)
 * and checks the server to ensure the character name is globally unique.
 */
export function onlineCreateCharScreen(onCancel = () => onlineCharSelectScreen()) {
  let sel = 'paladin';
  let creating = false;
  let nameTimer = null;
  let lastCheckedName = '';

  preloadPortraits(ACTIVE_CLASS_IDS);
  const s = el('div', 'screen class-screen online-create-screen');
  s.appendChild(el('h2', 'screen-title', `CREATE ONLINE CHARACTER <small>Pick any class · Choose a unique name</small>`));

  const grid = el('div', 'class-grid');
  const info = el('div', 'class-info');
  const bigBox = el('div', 'class-big');
  const big = heroCanvas(sel, 'hero-cv');
  bigBox.appendChild(big.canvas);
  const text = el('div', 'class-text');
  info.append(bigBox, text);

  const cards = {};
  for (const id of ACTIVE_CLASS_IDS) {
    const card = el('div', 'class-card');
    const anim = heroCanvas(id);
    card.appendChild(anim.canvas);
    card.insertAdjacentHTML('beforeend', plaque(CLASSES[id].name));
    card.dataset.id = id;
    card.onclick = () => {
      if (sel !== id) {
        sel = id;
        sfx('ui');
        renderClassInfo();
      }
    };
    grid.appendChild(card);
    cards[id] = card;
  }

  const renderClassInfo = () => {
    const C = CLASSES[sel];
    big.setId(sel);
    text.innerHTML = `
      <h2>${escapeHtml(C.name)}</h2>
      <p>${escapeHtml(C.desc)}</p>
      <p class="dim">Skill trees: <b style="color:#e9dcc4">${C.trees.join(' · ')}</b><br>Primary attribute: <b style="color:#ffd34a">${ATTRS[C.primary].name}</b> · Life ${C.life} · Mana ${C.mana}</p>
    `;
    for (const id in cards) {
      cards[id].classList.toggle('sel', id === sel);
    }
  };

  const nameRow = el('div', 'online-create-name-wrap');
  const nameInput = el('input', 'name-input');
  nameInput.id = 'online-char-name-input';
  nameInput.placeholder = 'Unique character name';
  nameInput.maxLength = 18;
  nameInput.autocomplete = 'off';

  const statusEl = el('div', 'online-name-status dim', 'Enter a unique name (2–18 characters)');
  statusEl.id = 'online-name-status';
  nameRow.append(nameInput, statusEl);

  const setStatus = (state, msg) => {
    statusEl.className = 'online-name-status ' + state;
    statusEl.textContent = msg;
  };

  const triggerNameCheck = async (rawVal) => {
    const trimmed = String(rawVal || '').trim();
    if (!trimmed) {
      setStatus('dim', 'Enter a unique name (2–18 characters)');
      return;
    }
    if (trimmed.length < 2) {
      setStatus('bad', 'Character name must be at least 2 characters.');
      return;
    }
    if (isProfaneName(trimmed)) {
      setStatus('bad', '✕ Name contains inappropriate language.');
      return;
    }
    setStatus('checking', `Checking "${trimmed}"…`);
    lastCheckedName = trimmed;
    try {
      const res = await checkOnlineCharName(trimmed);
      if (nameInput.value.trim() !== trimmed) return;
      if (res.available) {
        setStatus('ok', `✓ "${res.name}" is available`);
      } else {
        setStatus('bad', `✕ ${res.error || 'That character name is already taken.'}`);
      }
    } catch (e) {
      if (nameInput.value.trim() !== trimmed) return;
      setStatus('bad', e.message || 'Could not check name availability.');
    }
  };

  nameInput.oninput = () => {
    if (nameTimer) clearTimeout(nameTimer);
    const val = nameInput.value;
    if (!val.trim()) {
      setStatus('dim', 'Enter a unique name (2–18 characters)');
      return;
    }
    nameTimer = setTimeout(() => triggerNameCheck(val), 220);
  };

  const row = el('div', 'row');
  row.style.justifyContent = 'center';
  row.style.margin = '6px 0 14px';

  const cancelBtn = el('button', 'btn', 'Back');
  cancelBtn.id = 'online-cancel-create-btn';
  cancelBtn.onclick = () => { if (!creating) { sfx('ui'); onCancel(); } };

  const confirmBtn = el('button', 'btn big', 'Create Character');
  confirmBtn.id = 'online-confirm-create-btn';

  const submitCreate = async () => {
    if (creating) return;
    sfx('ui');
    const trimmed = nameInput.value.trim();
    if (!trimmed) {
      setStatus('bad', 'Please enter a character name.');
      nameInput.focus();
      return;
    }
    if (isProfaneName(trimmed)) {
      setStatus('bad', '✕ Name contains inappropriate language.');
      nameInput.focus();
      return;
    }
    creating = true;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Creating…';
    try {
      const res = await createOnlineCharacter(sel, trimmed);
      creating = false;
      onlineCharSelectScreen(res.character.id);
    } catch (err) {
      creating = false;
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Create Character';
      setStatus('bad', `✕ ${err.message || 'Could not create character.'}`);
    }
  };

  confirmBtn.onclick = submitCreate;
  nameInput.onkeydown = (e) => { if (e.key === 'Enter') submitCreate(); };

  row.append(cancelBtn, confirmBtn);
  s.append(grid, info, nameRow, row);
  renderClassInfo();
  show(s);
  setTimeout(() => { if (nameInput.isConnected) nameInput.focus(); }, 40);
}

/** Game mode select screen: choose between Single Player (offline/solo) and Online (Diablo II Battle.net tavern lobby). */
export function gameModeScreen(charInfo, fresh = false, onBack = () => { }) {
  const C = CLASSES[charInfo.classId] || { name: 'Hero' };
  const s = el('div', 'screen gamemode-screen');

  // Hero plaque / summary at the top
  const heroBox = el('div', 'gamemode-hero');
  const anim = heroCanvas(charInfo.classId, 'gamemode-hero-cv');
  heroBox.appendChild(anim.canvas);
  excitable(heroBox, anim);
  if (charInfo.equip) {
    const look = shownEquip(charInfo);
    savedGearPreview(charInfo.classId, look.body, look.head, look.weapon, look.offhand).then(art => {
      if (art && s.isConnected) anim.setArt(art);
    });
  }

  const heroInfo = el('div', 'gamemode-hero-info');
  heroInfo.innerHTML = `
    <h2 class="gamemode-hero-name">${escapeHtml(charInfo.name || C.name)}</h2>
    <div class="gamemode-hero-stats">
      <span class="gamemode-class">Level ${charInfo.level || 1} ${escapeHtml(C.name)}</span>
      <span class="gamemode-dot">·</span>
      <span class="gamemode-depth">Depth ${charInfo.depth || 1}</span>
      <span class="gamemode-dot">·</span>
      <span class="gamemode-gold">${fmtInt(charInfo.gold || 0)} Gold</span>
    </div>
  `;
  heroBox.appendChild(heroInfo);
  s.appendChild(heroBox);

  s.appendChild(el('h1', 'gamemode-title', 'CHOOSE GAME MODE'));
  s.appendChild(el('p', 'gamemode-subtitle', 'Select your path into the depths of Velscour'));

  const grid = el('div', 'gamemode-grid');

  // Single Player Card
  const spCard = el('div', 'gamemode-card gamemode-card-sp');
  spCard.setAttribute('tabindex', '0');
  spCard.setAttribute('role', 'button');
  spCard.setAttribute('aria-label', 'Play Single Player');
  spCard.innerHTML = `
    <div class="gamemode-card-glow"></div>
    <div class="gamemode-card-icon-wrap">
      <svg class="gamemode-card-icon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.5 17.5L3 6V3h3l11.5 11.5"/>
        <path d="m13 19 6-6"/>
        <path d="M16 16l4 4"/>
        <path d="M19 21l2-2"/>
      </svg>
    </div>
    <h3 class="gamemode-card-name">SINGLE PLAYER</h3>
    <div class="gamemode-card-tag">SOLO EXPEDITION</div>
    <p class="gamemode-card-desc">Venture into the abyss in a private world. Disconnected from multiplayer servers, with no lobby chat, whispers, or remote players.</p>
    <button class="btn big gamemode-action-btn">Enter World</button>
  `;
  const launchSP = () => {
    sfx('ui');
    G.game.startSinglePlayer(charInfo, fresh);
  };
  spCard.onclick = launchSP;
  spCard.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launchSP(); } };
  grid.appendChild(spCard);

  // Online Multiplayer Card
  const mpCard = el('div', 'gamemode-card gamemode-card-mp');
  mpCard.setAttribute('tabindex', '0');
  mpCard.setAttribute('role', 'button');
  mpCard.setAttribute('aria-label', 'Enter Online Multiplayer');
  mpCard.innerHTML = `
    <div class="gamemode-card-glow"></div>
    <div class="gamemode-card-icon-wrap">
      <svg class="gamemode-card-icon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
        <path d="M2 12h20"/>
      </svg>
    </div>
    <h3 class="gamemode-card-name">ONLINE MULTIPLAYER</h3>
    <div class="gamemode-card-tag">BATTLE.NET LOBBY</div>
    <p class="gamemode-card-desc">Enter the tavern lobby to socialize, whisper other adventurers, and create or join cooperative party rooms.</p>
    <button class="btn big gamemode-action-btn gamemode-btn-online">Enter Lobby</button>
  `;
  let checkingMpVersion = false;
  const launchMP = async () => {
    if (checkingMpVersion) return;
    sfx('ui');
    const onlineBtn = mpCard.querySelector('.gamemode-btn-online');
    const origText = onlineBtn ? onlineBtn.textContent : 'Enter Lobby';
    if (onlineBtn) {
      onlineBtn.disabled = true;
      onlineBtn.textContent = 'Verifying Version…';
    }
    checkingMpVersion = true;

    try {
      const updateInfo = await checkForUpdates({ force: true });
      const currentVer = getClientVersion();
      const serverVer = updateInfo?.serverVersion;
      const isOutdated = !!(updateInfo && (updateInfo.hasUpdate || (serverVer && compareVersions(serverVer, currentVer) > 0)));

      if (isOutdated) {
        if (onlineBtn) {
          onlineBtn.disabled = false;
          onlineBtn.textContent = origText;
        }
        checkingMpVersion = false;
        showUpdateDialog(updateInfo);
        return;
      }
    } catch (err) {
      console.warn('[Online] Version verification error:', err);
    }

    if (onlineBtn) {
      onlineBtn.disabled = false;
      onlineBtn.textContent = origText;
    }
    checkingMpVersion = false;

    G.game.selectAndEnterLobby(charInfo, fresh, () => gameModeScreen(charInfo, fresh, onBack));
  };
  mpCard.onclick = launchMP;
  mpCard.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launchMP(); } };
  grid.appendChild(mpCard);

  s.appendChild(grid);

  const row = el('div', 'gamemode-bottom-row');
  const backBtn = el('button', 'btn', 'Back');
  backBtn.onclick = () => {
    sfx('ui');
    onBack();
  };
  row.appendChild(backBtn);
  s.appendChild(row);

  const escHandler = (e) => {
    if (e.key === 'Escape' && s.isConnected) {
      window.removeEventListener('keydown', escHandler);
      sfx('ui');
      onBack();
    }
  };
  window.addEventListener('keydown', escHandler);

  show(s);
  s.refresh = () => gameModeScreen(charInfo, fresh, onBack);
}


/** o.where / o.note replace the "Depth N" line and the descent note (the Eternal Breach). */
export function deathScreen(depth, killer, onReturn, o = {}) {
  const s = el('div', 'screen');
  s.innerHTML = `<div class="death-title">YOU HAVE DIED</div><p style="font-size:18px">Slain ${o.where || `on Depth ${depth}`}${killer ? ` by <b style="color:#ff8060">${escapeHtml(killer)}</b>` : ''}.</p><p class="dim" style="max-width:520px;text-align:center;padding:0 12px">${o.note || `Your gear, levels and skills endure — but you must fight back down from Depth ${Math.max(1, Math.floor((depth - 1) / 5) * 5 - 4)}.`}</p>`;
  const b = el('button', 'btn big red', 'Return to Town');
  b.onclick = () => { sfx('ui'); hide(); onReturn(); };
  s.appendChild(b);
  show(s);
}

export function victoryScreen(onContinue) {
  const c = G.char;
  const s = el('div', 'screen');
  s.innerHTML = `<img class="title-logo" src="assets/ui/logo.webp" style="max-height:28vh"><div class="death-title" style="color:#ffb030;text-shadow:0 0 30px #f80">VELSCOUR HAS FALLEN</div>
  <p style="font-size:18px;text-align:center;max-width:620px;padding:0 12px">${escapeHtml(c.name)} the ${CLASSES[c.classId].name} has slain the Demon Lord at the bottom of the world.</p>
  <p class="dim">Level ${c.level} · ${fmtInt(c.kills || 0)} kills · ${c.deaths || 0} deaths</p>
  <p class="dim" style="text-align:center;max-width:560px">Demon Lord Velscour is defeated. Return through the throne portal to Herrington Hollow.</p>`;
  const b = el('button', 'btn big', 'Continue');
  b.onclick = () => { sfx('ui'); hide(); onContinue(); };
  s.appendChild(b);
  show(s);
}

let activeSettingsTab = 'general';

export function settingsDialog() {
  const st = G.settings;
  const html = `<div class="settings-tabs">
    <button type="button" class="settings-tab-btn" data-tab="general">General</button>
    <button type="button" class="settings-tab-btn" data-tab="audio">Audio</button>
    <button type="button" class="settings-tab-btn" data-tab="graphics">Graphics</button>
    <button type="button" class="settings-tab-btn" data-tab="hud">HUD &amp; UI</button>
    <button type="button" class="settings-tab-btn" data-tab="mouseCursor">Mouse Cursor</button>
    <button type="button" class="settings-tab-btn" data-tab="autoplay">Auto-Play</button>
  </div>
  <div class="settings-tab-pane" data-pane="general">
    <div class="settings-grid">
      <label>Game version</label><div style="display:flex;gap:8px;align-items:center;"><span style="color:#ffd860;font-family:var(--font-head);font-size:12px;font-weight:700;">v${getClientVersion()}</span><button class="btn small" data-check-update>Check for Updates</button></div>
      <label>Cloud save (Google account)</label><button class="btn small" data-cloud></button>
      <label>Hero backups</label><button class="btn small" data-backups>View</button>
      <label>Pause while menus open (Single Player)</label><input type="checkbox" data-k="pauseMenus" ${st.pauseMenus !== false ? 'checked' : ''}>
      <label title="Off: a Sky Battle cut scene you have already watched once plays at 20x">Don't skip cutscenes</label><input type="checkbox" data-k="noSkipCine" ${st.noSkipCine ? 'checked' : ''}>
      <label title="Summons, totems and turrets on your skill bar are cast again the moment one is missing (timed ones only with an enemy near). Auto-play does its own summoning">Auto-cast summons</label><input type="checkbox" data-k="autoSummon" ${st.autoSummon !== false ? 'checked' : ''}>
    </div>
  </div>
  <div class="settings-tab-pane" data-pane="audio">
    <div class="settings-grid">
      <label>Sound effects</label><input type="range" min="0" max="1" step="0.05" value="${st.sfx}" data-k="sfx">
      <label>Music</label><input type="range" min="0" max="1" step="0.05" value="${st.music}" data-k="music">
      <label>Ambience</label><input type="range" min="0" max="1" step="0.05" value="${st.amb ?? 0.5}" data-k="amb">
    </div>
  </div>
  <div class="settings-tab-pane" data-pane="graphics">
    <div class="settings-grid">
      <label>Camera zoom</label><input type="range" min="0.7" max="1.6" step="0.05" value="${st.zoom}" data-k="zoom">
      <label title="30 draws half the frames: smoother than a frame rate that keeps dipping, and a phone stays cooler (a hot phone slows itself down after a long session)">Frame rate cap</label><select data-k="fpsCap"><option value="0">None</option><option value="30">30 fps</option></select>
      <label>Gore</label><select data-k="gore"><option value="0">Off</option><option value="1">Bloody</option><option value="2">Extreme</option></select>
      <label>Screen shake</label><input type="checkbox" data-k="shake" ${st.shake ? 'checked' : ''}>
      <label title="Reduce full-screen flashes, flashbangs, and rapid hit strobing">Reduce flashing effects</label><input type="checkbox" data-k="reduceFlashing" ${st.reduceFlashing ? 'checked' : ''}>
      <label title="The photosensitive epilepsy warning shown after &quot;Click to awaken&quot; (its &quot;Don't show this window again&quot; box turns this off)">Flashing-lights warning at start</label><input type="checkbox" data-k="flashWarning" ${st.flashWarning !== false ? 'checked' : ''}>
      <label title="The hero, monsters and pets keep a coloured outline over spells, walls and darkness (hidden only behind another creature)">See-through outlines</label><input type="checkbox" data-k="outlines" ${st.outlines !== false ? 'checked' : ''}>
      <label title="A line along the foot of the dungeon's walls, drawn over every spell (not over creatures)">Outline wall bases</label><input type="checkbox" data-k="wallLines" ${st.wallLines ? 'checked' : ''}>
      <label title="The hero holds his weapon and off-hand, each in its own look">Show weapons and off-hands</label><input type="checkbox" data-k="heldGear" ${st.heldGear !== false ? 'checked' : ''}>
      <label title="Glows, particles and gem sparks on held weapons, and sparkles on rare armor and helmets (with weapons shown)">Weapon and gear effects</label><input type="checkbox" data-k="heldFx" ${st.heldFx !== false ? 'checked' : ''}>
      <label title="The Death Knight's flying sword: his equipped sword as a flat 2D object, the same sword as a live 3D model, or the old Runeblade">Death Knight's flying sword</label><select data-k="dkBlade" data-str="1">${[['sprite', 'Equipped sword (2D)'], ['model', 'Equipped sword (3D)'], ['runeblade', 'Runeblade']].map(([v, n]) => `<option value="${v}"${(st.dkBlade || 'sprite') === v ? ' selected' : ''}>${n}</option>`).join('')}</select>
    </div>
  </div>
  <div class="settings-tab-pane" data-pane="hud">
    <div class="settings-grid">
      <label>Damage numbers</label><input type="checkbox" data-k="dmgNumbers" ${st.dmgNumbers ? 'checked' : ''}>
      <label title="Off: a bar shows only for a moment over a monster you hit, and never over bosses">Life bars over every enemy (bosses too)</label><input type="checkbox" data-k="lifeBars" ${st.lifeBars !== false ? 'checked' : ''}>
      <label>Hero stats plaque (Battle Ledger)</label><input type="checkbox" data-k="showHeroStats" ${st.showHeroStats !== false ? 'checked' : ''}>
      <label title="Online: keep the party list on screen. Off: it shows with the automap (Tab / M)">Always show party list</label><input type="checkbox" data-k="alwaysShowParty" ${st.alwaysShowParty ? 'checked' : ''}>
      <label>Target info box</label><input type="checkbox" data-k="showTargetBox" ${st.showTargetBox !== false ? 'checked' : ''}>
      <label>Target portrait sprite</label><input type="checkbox" data-k="showTargetSprite" ${st.showTargetSprite !== false ? 'checked' : ''}>
      <label>Player chat bubbles</label><input type="checkbox" data-k="showChatBubbles" ${st.showChatBubbles !== false ? 'checked' : ''}>
      <label>Chat in side notifications</label><input type="checkbox" data-k="chatInSideLog" ${st.chatInSideLog !== false ? 'checked' : ''}>
      <label title="An icon per summoning skill next to the buffs, with how many of its minions are out">Minion counts with the buffs</label><input type="checkbox" data-k="minionCounts" ${st.minionCounts !== false ? 'checked' : ''}>
      <label>Show gold labels</label><input type="checkbox" data-k="showGoldLabels" ${st.showGoldLabels ? 'checked' : ''}>
      <label>Ground loot label filter</label><button type="button" class="btn small" data-label-filter>${lootLabelFilter().on ? 'On' : 'Off'} · Set up</button>
      <label>Hide dropped item names</label><input type="checkbox" data-k="hideItemNames" ${st.hideItemNames ? 'checked' : ''}>
      <label title="Off: the best drops are named first and lesser ones only close by, so a big fight's loot doesn't bury the screen; hover any item for its name">Show every item name</label><input type="checkbox" data-k="allItemNames" ${st.allItemNames ? 'checked' : ''}>
      <label>Standard skill bar on mobile (landscape)</label><input type="checkbox" data-k="mobileSkillBar" ${st.mobileSkillBar !== false ? 'checked' : ''}>
      <label title="Drag, resize, hide, and save profiles for HUD elements">HUD &amp; UI Layout</label><button class="btn small" data-customize-ui>Customize UI</button>
      <label title="Customize ornate boss and overhead creature health bars, theme, size, and info toggles">Health Bars</label><button type="button" class="btn small" data-healthbar-settings>Customize Health Bars</button>
      <label title="Changes terrain and wall transparency on the TAB map only; markers stay clear">TAB Map Transparency</label><div style="display:flex;align-items:center;gap:6px"><input type="range" min="0" max="100" step="1" value="${st.tabMapTransparency ?? 45}" data-k="tabMapTransparency" style="flex:1"><output data-map-opacity style="min-width:34px;text-align:right">${st.tabMapTransparency ?? 45}%</output><button type="button" class="btn small" data-reset-map-opacity>Reset</button></div>
    </div>
  </div>
  <div class="settings-tab-pane" data-pane="mouseCursor">
    <div class="cursor-live-preview" data-cursor-preview tabindex="0"><b>Live Cursor Preview</b><span>Move your mouse here to preview the cursor, trail, and locator effects.</span></div>
    <div class="cursor-settings-group"><h3>Cursor Appearance</h3><div class="cursor-settings-grid">
      <label>Color</label><select data-cursor="color"><option value="default">Default</option><option value="white">White</option><option value="black">Black</option><option value="red">Red</option><option value="orange">Orange</option><option value="yellow">Yellow</option><option value="green">Green</option><option value="cyan">Cyan</option><option value="blue">Blue</option><option value="purple">Purple</option><option value="pink">Pink</option><option value="gold">Gold</option><option value="rainbow">Rainbow</option><option value="inverted">Inverted / high contrast</option><option value="custom">Custom</option></select>
      <label>Custom cursor color</label><input type="color" data-cursor="customColor">
      <label>Cursor size <output data-cursor-output="size"></output></label><input type="range" min="50" max="300" step="25" data-cursor="size">
      <label>Transparency <output data-cursor-output="transparency"></output></label><input type="range" min="20" max="100" step="5" data-cursor="transparency">
      <label>Outline</label><input type="checkbox" data-cursor="outline">
      <label>Outline color</label><input type="color" data-cursor="outlineColor">
      <label>Outline thickness <output data-cursor-output="outlineThickness"></output></label><input type="range" min="1" max="8" step="1" data-cursor="outlineThickness">
      <label>Glow</label><input type="checkbox" data-cursor="glow">
      <label>Glow color</label><input type="color" data-cursor="glowColor">
      <label>Glow intensity <output data-cursor-output="glowIntensity"></output></label><input type="range" min="0" max="100" step="5" data-cursor="glowIntensity">
      <label>Pulsating glow</label><input type="checkbox" data-cursor="pulsatingGlow">
      <label>Highlight circle</label><input type="checkbox" data-cursor="highlightCircle">
    </div></div>
    <div class="cursor-settings-group"><h3>Cursor Trails</h3><div class="cursor-settings-grid">
      <label>Trail style</label><select data-cursor="trailStyle"><option value="none">None</option><option value="solid">Solid fading trail</option><option value="dotted">Dotted trail</option><option value="sparkles">Sparkles</option><option value="stars">Stars</option><option value="particles">Magical particles</option><option value="fire">Fire</option><option value="lightning">Lightning</option><option value="frost">Frost</option><option value="smoke">Smoke</option><option value="arcane">Arcane energy</option><option value="orbs">Glowing orbs</option><option value="rainbow">Rainbow</option><option value="ghost">Ghost cursor afterimages</option></select>
      <label>Custom trail color</label><input type="color" data-cursor="customTrailColor">
      <label>Match cursor color</label><input type="checkbox" data-cursor="matchCursorColor">
      <label>Rainbow color cycling</label><input type="checkbox" data-cursor="rainbowTrail">
      <label>Trail length <output data-cursor-output="trailLength"></output></label><input type="range" min="100" max="1500" step="50" data-cursor="trailLength">
      <label>Trail width <output data-cursor-output="trailWidth"></output></label><input type="range" min="1" max="14" step="1" data-cursor="trailWidth">
      <label>Particle size <output data-cursor-output="particleSize"></output></label><input type="range" min="1" max="20" step="1" data-cursor="particleSize">
      <label>Particle density <output data-cursor-output="particleDensity"></output></label><input type="range" min="0" max="100" step="5" data-cursor="particleDensity">
      <label>Fade speed <output data-cursor-output="fadeSpeed"></output></label><input type="range" min="0.25" max="3" step="0.25" data-cursor="fadeSpeed">
      <label>Trail glow <output data-cursor-output="trailGlow"></output></label><input type="range" min="0" max="100" step="5" data-cursor="trailGlow">
      <label>Trail opacity <output data-cursor-output="trailOpacity"></output></label><input type="range" min="10" max="100" step="5" data-cursor="trailOpacity">
    </div></div>
    <div class="cursor-settings-group"><h3>Cursor Locator</h3><div class="cursor-settings-grid">
      <label>Enable locator key</label><input type="checkbox" data-cursor="locatorEnabled">
      <label>Temporary highlight key</label><select data-cursor="locatorKey"><option value="AltLeft">Left Alt</option><option value="ShiftLeft">Left Shift</option><option value="ControlLeft">Left Control</option><option value="F2">F2</option><option value="F3">F3</option><option value="F4">F4</option><option value="F6">F6</option><option value="F7">F7</option><option value="F8">F8</option></select>
      <label>Highlight when mouse is shaken</label><input type="checkbox" data-cursor="shakeLocator">
      <label>Expanding pulse rings</label><input type="checkbox" data-cursor="locatorRings">
      <label>Locator size <output data-cursor-output="locatorSize"></output></label><input type="range" min="24" max="160" step="4" data-cursor="locatorSize">
      <label>Locator color</label><input type="color" data-cursor="locatorColor">
    </div></div>
    <button type="button" class="btn small" data-reset-cursor>Restore cursor defaults</button>
  </div>
  <div class="settings-tab-pane" data-pane="autoplay">
    <div class="settings-grid">
      <label>Auto-pickup items</label><input type="checkbox" data-k="autoLoot" ${st.autoLoot ? 'checked' : ''}>
      <label>Loot filter (what auto-pickup and auto-play pick up)</label><button class="btn small" data-loot-filter>${lootFilter().on ? 'On' : 'Off'} · Set up</button>
      <label>Lock skill bar (auto-play only fills empty slots)</label><input type="checkbox" data-k="lockSkillBar" ${st.lockSkillBar ? 'checked' : ''}>
      <label>Auto skill point assignment (auto-play)</label><input type="checkbox" data-k="autoSkillPoints" ${st.autoSkillPoints !== false ? 'checked' : ''}>
      <label title="Off: auto-play leaves your attribute points (Strength, Dexterity, Vitality, Energy) for you to spend">Auto attribute point assignment (auto-play)</label><input type="checkbox" data-k="autoStatPoints" ${st.autoStatPoints !== false ? 'checked' : ''}>
      <label title="Off: auto-play never equips, sells, buys, stashes, sockets, upgrades or enchants gear; in town it only buys potions. A full bag doesn't stop it: it keeps playing and leaves new gear on the ground. Locked items (the lock in the item's panel) are never touched either way">Auto-play manages gear (equip, sell, buy, upgrade)</label><input type="checkbox" data-k="autoGear" ${st.autoGear !== false ? 'checked' : ''}>
    </div>
  </div>`;
  const d = UI.dialog({ title: 'Settings', html, cls: 'settings-dialog', buttons: [{ label: 'Done', fn: () => { camera.computeZoom(); if (UI.hud) UI.hud.applyVisibilitySettings(); saveSettings(); } }] });
  const tabBtns = d.box.querySelectorAll('.settings-tab-btn');
  const tabPanes = d.box.querySelectorAll('.settings-tab-pane');
  const setTab = (name) => {
    activeSettingsTab = name;
    tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === name));
    tabPanes.forEach((pane) => pane.classList.toggle('active', pane.dataset.pane === name));
  };
  tabBtns.forEach((btn) => {
    btn.onclick = () => {
      sfx('ui');
      setTab(btn.dataset.tab);
    };
  });
  if (!['general', 'audio', 'graphics', 'hud', 'mouseCursor', 'autoplay'].includes(activeSettingsTab)) activeSettingsTab = 'general';
  setTab(activeSettingsTab);
  // Mouse Cursor live controls
  const cursorSettings = () => (st.mouseCursor ||= { ...MOUSE_CURSOR_DEFAULTS });
  const cursorOutput = (key, value) => {
    const units = { size: '%', transparency: '%', outlineThickness: ' px', glowIntensity: '%', trailLength: ' ms', trailWidth: ' px', particleSize: ' px', particleDensity: '%', fadeSpeed: '×', trailGlow: '%', trailOpacity: '%', locatorSize: ' px' };
    const output = d.box.querySelector(`[data-cursor-output="${key}"]`);
    if (output) output.textContent = `${value}${units[key] || ''}`;
  };
  const refreshCursorControls = () => d.box.querySelectorAll('[data-cursor]').forEach((control) => {
    const key = control.dataset.cursor, value = cursorSettings()[key];
    if (control.type === 'checkbox') control.checked = !!value; else control.value = String(value ?? MOUSE_CURSOR_DEFAULTS[key]);
    cursorOutput(key, control.value);
  });
  refreshCursorControls();
  d.box.querySelectorAll('[data-cursor]').forEach((control) => {
    control.oninput = control.onchange = () => {
      const key = control.dataset.cursor;
      cursorSettings()[key] = control.type === 'checkbox' ? control.checked : control.type === 'range' ? Number(control.value) : control.value;
      cursorOutput(key, control.value);
      refreshMouseCursor(); saveSettings();
    };
  });
  const rcBtn = d.box.querySelector('[data-reset-cursor]');
  if (rcBtn) rcBtn.onclick = () => {
    st.mouseCursor = { ...MOUSE_CURSOR_DEFAULTS };
    refreshCursorControls(); refreshMouseCursor(); saveSettings();
  };
  refreshMouseCursor();
  const llf = d.box.querySelector('[data-label-filter]');
  if (llf) llf.onclick = () => {
    sfx('ui');
    const f = lootLabelFilter();
    const hue = ['white', 'green', 'blue', 'purple', 'orange', 'red', 'cyan'];
    const opts = `<option value="-1">None</option>` + RARITY.map((r, i) => `<option value="${i}" style="color:${r.color}">${r.name}${i < RARITY.length - 1 ? ' or better' : ''} (${hue[i]})</option>`).join('');
    const gemGradeNames = ['Chipped', 'Flawed', 'Standard', 'Flawless', 'Perfect', 'Royal', 'Imperial', 'Celestial', 'Abyssal', 'Eternal'];
    const gemOpts = `<option value="-1">None</option>` + gemGradeNames.map((name, i) => `<option value="${i}">${name}${i < gemGradeNames.length - 1 ? ' or better' : ''}</option>`).join('');
    const lfHtml = `<div class="settings-grid">
      <label><b>Use the ground label filter</b></label><input type="checkbox" data-lf="on" ${f.on ? 'checked' : ''}>
      ${(FILTER_ROWS || []).map((r) => `<label>${r.name}</label><select data-lf="${r.k}">${opts}</select>`).join('')}
      <label>Gems &amp; Runes</label><select data-lf="gems">${gemOpts}</select>
      <label title="Hide ground labels for potions whose belt stack is already full (30)">Dynamic potion labels (hide when full)</label><input type="checkbox" data-lf="dynamicPotionLabels" ${f.dynamicPotionLabels ? 'checked' : ''}>
    </div>`;
    const ld = UI.dialog({ title: 'Ground Loot Label Filter', html: lfHtml, buttons: [{ label: 'Done', fn: () => { saveLootFilterSettings(); llf.textContent = `${lootLabelFilter().on ? 'On' : 'Off'} · Set up`; } }] });
    ld.box.querySelectorAll('[data-lf]').forEach((inp) => {
      const k = inp.dataset.lf;
      if (inp.type === 'checkbox') inp.checked = !!f[k]; else inp.value = String(f[k] ?? 0);
      inp.onchange = () => { f[k] = inp.type === 'checkbox' ? inp.checked : Number(inp.value); saveLootFilterSettings(); };
    });
  };
  d.box.querySelector('[data-k=gore]').value = String(st.gore ?? 0);
  d.box.querySelector('[data-k=fpsCap]').value = String(st.fpsCap ?? 30);
  d.box.querySelector('[data-backups]').onclick = () => { sfx('ui'); backupsDialog(); };
  const cui = d.box.querySelector('[data-customize-ui]');
  if (cui) cui.onclick = () => { sfx('ui'); d.close(); openCustomizeUI(); };
  const hbs = d.box.querySelector('[data-healthbar-settings]');
  if (hbs) hbs.onclick = (event) => {
    event?.preventDefault?.();
    try {
      openHealthBarSettings();
    } catch (error) {
      console.error('[health-bars] failed to open settings', error);
      UI.dialog({ title: 'Health Bars', html: `<p>Could not open health bar settings: ${escapeHtml(error?.message || error)}</p>` });
      return;
    }
    try { sfx('ui'); } catch (error) { console.warn('[health-bars] UI sound unavailable', error); }
  };
  const rmo = d.box.querySelector('[data-reset-map-opacity]');
  if (rmo) rmo.onclick = () => {
    st.tabMapTransparency = 45;
    const range = d.box.querySelector('[data-k="tabMapTransparency"]');
    if (range) range.value = '45';
    const out = d.box.querySelector('[data-map-opacity]');
    if (out) out.textContent = '45%';
    saveSettings();
  };
  const ub = d.box.querySelector('[data-check-update]');
  if (ub) {
    ub.onclick = async () => {
      sfx('ui');
      ub.disabled = true;
      ub.textContent = 'Checking…';
      const info = await checkForUpdates({ force: true });
      ub.disabled = false;
      ub.textContent = 'Check for Updates';
      if (info && info.hasUpdate) {
        showUpdateDialog(info);
      } else {
        UI.dialog({
          title: 'Velscour Online Updater',
          html: `<p style="text-align:center;padding:12px 0;line-height:1.5;">You are running the latest version of Velscour Online (<strong>v${getClientVersion()}</strong>).</p>`,
          buttons: [{ label: 'OK' }]
        });
      }
    };
  }
  const cb = d.box.querySelector('[data-cloud]');
  cloudRow = () => {
    if (!cb.isConnected) { cloudRow = null; return; }
    const u = Cloud.user;
    cb.textContent = u ? `${u.name || u.email || 'Signed in'} · ${{ syncing: 'syncing…', loading: 'connecting…', offline: 'offline', error: 'problem', conflict: 'choose a copy' }[Cloud.status] || 'synced'}` : 'Sign in with Google';
  };
  cloudRow();
  // the SDK loads as the pointer reaches the button, so the popup can open inside the tap (only sign-ins load it)
  const warm = () => { if (!Cloud.signedIn) Cloud.preload().catch(() => { }); };
  cb.onpointerenter = cb.onpointerdown = cb.onfocus = warm;
  cb.onclick = () => {
    sfx('ui');
    if (Cloud.signedIn) { cloudDialog(() => cloudRow && cloudRow()); return; }
    cb.textContent = 'Signing in…';
    Cloud.signIn().then(() => {
      console.log('[Cloud] Sign in succeeded. Current user:', Cloud.user);
      if (cloudRow) cloudRow();
      if (G.mode !== 'game') conflictDialogs();
    }).catch((e) => {
      console.error('[Cloud] Sign in failed:', e);
      if (cloudRow) cloudRow();
      if (String(e && e.code) === 'auth/popup-blocked' && !cb.dataset.again) { cb.dataset.again = 1; cb.textContent = 'Tap again to sign in'; return; }
      const msg = cloudErr(e);
      if (msg) UI.dialog({ title: 'Cloud Save', html: `<p>${msg}</p>`, buttons: [{ label: 'OK' }] });
    });
  };
  const lf = d.box.querySelector('[data-loot-filter]');
  lf.onclick = () => { sfx('ui'); lootFilterDialog(() => { lf.textContent = `${lootFilter().on ? 'On' : 'Off'} · Set up`; }); };
  d.box.querySelectorAll('[data-k]').forEach((inp) => {
    inp.oninput = inp.onchange = () => {
      const k = inp.dataset.k;
      st[k] = inp.type === 'checkbox' ? inp.checked : inp.dataset.str ? inp.value : Number(inp.value);
      if (k === 'mobileSkillBar' && UI.hud) UI.hud.layoutMobile();
      if (k === 'tabMapTransparency') { const out = d.box.querySelector('[data-map-opacity]'); if (out) out.textContent = `${st[k]}%`; }
      if ((k === 'showHeroStats' || k === 'showTargetBox' || k === 'showTargetSprite') && UI.hud) UI.hud.applyVisibilitySettings();
      applyVolumes();
      saveSettings();
    };
  });
}

/** Settings > Loot filter: the lowest rarity of each item type auto-pickup grabs (game/lootfilter.js). */
export function lootFilterDialog(onDone) {
  const f = lootFilter() || {};
  const hue = ['white', 'green', 'blue', 'purple', 'orange', 'red', 'cyan'];
  const opts = `<option value="-1">None</option>` + RARITY.map((r, i) => `<option value="${i}" style="color:${r.color}">${r.name}${i < RARITY.length - 1 ? ' or better' : ''} (${hue[i]})</option>`).join('');
  const gemGradeNames = ['Chipped', 'Flawed', 'Standard', 'Flawless', 'Perfect', 'Royal', 'Imperial', 'Celestial', 'Abyssal', 'Eternal'];
  const gemOpts = `<option value="-1">None</option>` + gemGradeNames.map((name, i) => `<option value="${i}">${name}${i < gemGradeNames.length - 1 ? ' or better' : ''}</option>`).join('');
  const html = `<div class="settings-grid">
    <label><b>Use the loot filter</b></label><input type="checkbox" data-f="on" ${f.on ? 'checked' : ''}>
    ${(FILTER_ROWS || []).map((r) => `<label>${r.name}</label><select data-f="${r.k}">${opts}</select>`).join('')}
    <label>Gems & Runes</label><select data-f="gems">${gemOpts}</select>
    <label>Auto-play also picks up upgrades it will wear</label><input type="checkbox" data-f="upgrades" ${f.upgrades ? 'checked' : ''}>
    <label>Auto-play keeps what passes (stores it in the chest instead of selling it)</label><input type="checkbox" data-f="keep" ${f.keep ? 'checked' : ''}>
  </div><p class="dim" style="font-size:12px;max-width:520px">With the filter on, auto-play and walk-over pickup take only what passes. Clicking or tapping an item still picks it up, and sealed treasures always pass.</p>`;
  const d = UI.dialog({ title: 'Loot Filter', html, buttons: [{ label: 'Done', fn: () => { saveSettings(); onDone && onDone(); } }] });
  d.box.querySelectorAll('[data-f]').forEach((inp) => {
    if (inp.tagName === 'SELECT') inp.value = String(f[inp.dataset.f] ?? 0);
    inp.onchange = () => { f[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : Number(inp.value); saveSettings(); onDone && onDone(); };
  });
  return d;
}

export function helpDialog() {
  const html = `<div class="help-keys">
    <div><b style="color:#ffe2a0">PC</b></div>
    <div><kbd>Left click</kbd> move / attack / pick up / talk</div>
    <div><kbd>Shift</kbd>+click attack in place</div>
    <div><kbd>W A S D</kbd> move directly</div>
    <div><kbd>Right click</kbd> right-click skill</div>
    <div><kbd>&#96;</kbd> <kbd>1</kbd>–<kbd>9</kbd> <kbd>0</kbd> <kbd>-</kbd> <kbd>=</kbd> cast skills at the cursor (13 keys + both mouse buttons)</div>
    <div><kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> <kbd>V</kbd> potions</div>
    <div><kbd>R</kbd> <kbd>E</kbd> <kbd>Y</kbd> <kbd>U</kbd> <kbd>O</kbd> macros: several skills on one key, set up from the skill tree's <b>Macros</b> button (or the menu)</div>
    <div><kbd>C</kbd> character · <kbd>I</kbd> bag · <kbd>K</kbd> skill tree · <kbd>T</kbd> passive talent tree · <kbd>B</kbd> friends · <kbd>Q</kbd> quest log</div>
    <div><kbd>Tab</kbd>/<kbd>M</kbd> map · <kbd>Esc</kbd> menu · wheel zoom</div>
    <div><kbd>Alt</kbd>+<kbd>P</kbd> or the <b>Auto</b> button: auto-play (the hero fights, loots, shops and delves on autopilot)</div>
    <div><kbd>G</kbd> MADNESS · <kbd>F</kbd> CLASS ULTIMATE (Smite, Cataclysm, Supernova, etc.), then click where it should strike (both fill as you fight)</div>
    <div><b style="color:#ffe2a0">While the hero plays</b></div>
    <div>Click or tap <b style="color:#ffd040">gilded critters</b> before they get away (follow the red arrows): each is worth a big sum of experience (a Golden Scarab, a pile of gold). Auto-play leaves them to you.</div>
    <div>Now and then an Epic or better drops <b style="color:#ffdf8a">sealed</b>: break the seals from the SEALED button or the inventory. Auto-play waits in town when the bag is full of what it can't sell, until a slot is free.</div>
    <div><b>Loot filter</b> (Settings): pick which weapons, off-hands, armor and rings (by rarity) and whether gems get picked up, by auto-play and by walking over them.</div>
    <div>Pick one of three portals down at each cleared exit (auto-play picks after 8 seconds). Set auto-play's stance, and pull the <b style="color:#ffc040">Greed</b> lever for tougher depths and richer drops; a death loses the Hoard.</div>
    <div><b style="color:#ffe2a0">Mobile</b></div>
    <div>Left thumb: virtual joystick</div>
    <div>Tap the world: move / attack / talk</div>
    <div>Right cluster: skills (hold to repeat, long-press to change; the &#8644; button flips to the second page of skills)</div>
    <div>Tap potions on the bar to drink</div>
    <div>Pinch with two fingers: zoom in and out</div>
    <div>Macros you set up (skill tree, <b>Macros</b>) get a purple button each by the skills</div>
    <div><b style="color:#ffe2a0">Goal</b></div>
    <div>Enter the portal in town. Find the exit of each depth — it is sealed until its guardian falls.</div>
    <div>Die and you restart a few depths back (the start of the previous five), keeping everything else.</div>
    <div>Reach Depth 500 and slay Demon Lord Velscour.</div>
    <div><b style="color:#ffe2a0">Growing stronger</b></div>
    <div><b>Rings</b> (four slots): each carries augments that change a skill, a kind of skill or every skill — burning or venomous hits, chain lightning, a storm tether to your orbiting weapons, meteors, extra projectiles and more. The Jeweler sells them; guardians drop them.</div>
    <div><b>Skill mastery</b>: every skill levels from 1 to 1000 as you use it and kill with it, growing stronger and its effects bigger.</div>
    <div><b>Gem Forge</b> (Gem Merchant): fuse three gems into the next grade, or refine one, up to Eternal.</div>
  </div>`;
  UI.dialog({ title: 'How to Play', html, buttons: [{ label: 'Got it' }] });
}

export function pauseMenu() {
  const isOnline = !!G.room || !!G.char?.isOnline;
  const d = UI.dialog({
    title: isOnline ? 'Game Menu (Live)' : 'Paused',
    html: `<p class="dim">${escapeHtml(G.char.name)} · Level ${G.char.level} · Depth ${G.char.depth}</p>${isOnline ? '<p style="color:#ffb060;font-size:12px;margin-top:6px">Game continues in real time while playing online.</p>' : ''}`,
    buttons: [
      { label: 'Resume' },
      { label: 'Settings', fn: settingsDialog },
      { label: 'Macros', fn: () => G.ui.macros.open() },
      { label: 'Customize UI', keepOpen: true, fn: () => openCustomizeUI() },
      // { label: 'Classes', fn: () => window.open('classes.html', '_blank') },
      // { label: 'Bestiary', fn: () => window.open('bestiary.html', '_blank') },
      { label: 'How to Play', fn: helpDialog },
      {
        label: 'Save & Quit',
        cls: 'red',
        keepOpen: true,
        fn: async (close) => {
          const btn = d.box.querySelector('button.red');
          if (btn) {
            btn.disabled = true;
            btn.textContent = 'Saving...';
          }
          try {
            await G.game.quitToTitle();
          } finally {
            close();
          }
        },
      },
    ],
  });
  return d;
}

export { $, A };
