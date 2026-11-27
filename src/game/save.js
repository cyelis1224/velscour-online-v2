// LocalStorage persistence for heroes.
import { CLASSES } from '../data/classes.js';
import { normalizeDungeonAffixIds } from '../data/dungeonaffixes.js';
import { rollItem, HOLLOW, augTarget, armsReason } from '../data/items.js';
import { drawBiome } from '../data/biomes.js';
import { migrateBar, BAR_SIZE } from '../data/bar.js';
import { TAB_SLOTS } from '../data/tabs.js';
import { newMacros, migrateMacros } from '../data/macros.js';
import { fixBag, fixGemBag, fixStash, fixJewelBox, BAG_COLS, BAG_ROWS } from '../data/bag.js';
import { stashRaw, listRaw } from './herobackup.js';
import { FINAL_DEPTH, MAX_DEPTH } from '../data/depth.js';
import { SKILLS, CLASS_SKILLS, MAX_SKILL_LEVEL, grantedSkillsAt } from '../data/skills.js';
import { augmentable, AUGMENTS } from '../data/rings.js';
import { TALENTS, isTalentLockedByChoice, isTalentPrereqMet } from '../data/talents.js';

const KEY = 'velscour_saves_v1';
const ASIDE = KEY + '_unreadable_';   // + time: save data that couldn't be read, set aside before anything replaced it
var watchers = [];
/** fn(classId, deletedIds) after a hero of that class is saved, or deleted by the player (game/cloud.js syncs it). */
export function onSaveChange(fn) { (watchers || (watchers = [])).push(fn); }
const changed = (classId, deleted) => { for (const fn of watchers) try { fn(classId, deleted); } catch (e) { console.warn(e); } };

let unreadable = false;   // the saves are there but don't parse: cloud sync must not touch them
function readAll() {
  let list;
  const raw = localStorage.getItem(KEY) || localStorage.getItem('Velscour_saves_v1');
  try { list = JSON.parse(raw || '[]'); } catch (e) { unreadable = true; return []; }
  unreadable = !Array.isArray(list);
  if (!unreadable && !localStorage.getItem(KEY) && raw) {
    try { localStorage.setItem(KEY, raw); } catch (e) { }
  }
  if (!unreadable) {
    for (const c of list) {
      if (c && typeof c === 'object') {
        delete c.isOnline;
        delete c.accountId;
      }
    }
  }
  return unreadable ? [] : list;
}
/** False when this device's saves exist but can't be read (cloud.js then changes nothing). */
export function savesReadable() { readAll(); return !unreadable; }
function writeAll(list) {   // callers have just run readAll(), so `unreadable` is current
  if (unreadable && !setAside()) return false;   // never write over saves that couldn't be read until they're copied
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) {
    console.warn('Save failed', e);
    if (unreadable && asideKey) moveAside();   // the copy took the room: move it to IndexedDB, the next save fits
    return false;
  }
}
// Unreadable saves are copied aside (localStorage, or IndexedDB when that's full) before the first write replaces
// them; until a copy exists every write is refused. Settings > Hero backups lists them for download.
let asideDone = null, asidePending = null, asideKey = null;
function setAside() {
  const raw = localStorage.getItem(KEY);
  if (raw === null || raw === asideDone) return true;
  try { const k = ASIDE + Date.now(); localStorage.setItem(k, raw); asideDone = raw; asideKey = k; return true; } catch (e) { /* no room: IndexedDB */ }
  if (!asidePending) asidePending = stashRaw(raw).then(() => { asideDone = raw; }, (e) => { console.warn('Could not set the unreadable saves aside', e); saveBlocked(); }).finally(() => { asidePending = null; });
  saveBlocked();
  return false;
}
function moveAside() {
  const k = asideKey, raw = k && localStorage.getItem(k);
  asideKey = null;
  if (raw !== null && raw !== undefined) stashRaw(raw).then(() => localStorage.removeItem(k), (e) => console.warn(e));   // removed only once IndexedDB holds it
}
let blockedOnce = false;
function saveBlocked() {
  if (blockedOnce || typeof dispatchEvent !== 'function') return;
  blockedOnce = true;
  dispatchEvent(new CustomEvent('Velscour-save-blocked'));
}
/** Unreadable save data that was set aside: [{ at, text }], newest first. */
export async function unreadableSaves() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(ASIDE)) out.push({ at: Number(k.slice(ASIDE.length)) || 0, text: localStorage.getItem(k) });
  }
  try { out.push(...(await listRaw()).map((r) => ({ at: r.at, text: r.text }))); } catch (e) { /* no IndexedDB */ }
  return out.sort((a, b) => b.at - a.at);
}

export function listSaves() {
  return readAll().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
}
// The autosave (every 30 s) used to parse and re-encode every hero on the device to change one: with full stashes on
// all classes that was 1.5 MB of JSON and a 100-200 ms freeze on a phone. What this tab last wrote is kept as one JSON
// text per hero; while the stored data is still exactly that, only the hero being saved is encoded again.
let memo = null;   // { raw, parts: Map(id -> JSON) }
export function writeSave(char) {
  if (!char || char.isOnline) return false; // Never write online characters to local single-player storage
  char.lastPlayed = Date.now();
  const raw = localStorage.getItem(KEY);
  let ok;
  if (memo && raw === memo.raw) {
    const parts = new Map(memo.parts);
    parts.delete(char.id); parts.set(char.id, JSON.stringify(char));   // (to the end, as filter + push did)
    const out = '[' + [...parts.values()].join(',') + ']';
    try { localStorage.setItem(KEY, out); ok = true; memo = { raw: out, parts }; } catch (e) { console.warn('Save failed', e); ok = false; memo = null; }
  } else {
    const list = readAll().filter((c) => c.id !== char.id);
    list.push(char);
    ok = writeAll(list);
    memo = ok && !unreadable ? remember(list) : null;
  }
  changed(char.classId);
  return ok;
}
function remember(list) {
  const parts = new Map(list.map((c) => [c.id, JSON.stringify(c)]));
  const raw = '[' + [...parts.values()].join(',') + ']';
  return raw === localStorage.getItem(KEY) ? { raw, parts } : null;
}
export function deleteSave(id) {
  const list = readAll(), gone = list.find((c) => c.id === id);
  writeAll(list.filter((c) => c.id !== id));
  if (gone) changed(gone.classId, [id]);
}
/** One hero per class: classId -> that class's most recently played hero. (Older saves may hold several heroes of a
 * class; the newest one is the class's hero, and deleting it deletes them all.) */
export function heroesByClass() {
  const out = {};
  for (const c of listSaves()) if (!out[c.classId]) out[c.classId] = c;
  return out;
}
export function deleteClassSaves(classId) {
  const list = readAll();
  writeAll(list.filter((c) => c.classId !== classId));
  changed(classId, list.filter((c) => c.classId === classId).map((c) => c.id));
}
/** Every save of a class (old saves may hold several). */
export function classSaves(classId) { return readAll().filter((c) => c.classId === classId); }
/** A class's hero from the cloud (or null): replaces every local save of that class, keeping its lastPlayed.
 * cloud.js backs the old ones up first (game/herobackup.js). Refuses when the saves can't be read. */
export function replaceClassHero(classId, char) {
  const all = readAll();
  if (unreadable) return false;
  const list = all.filter((c) => c.classId !== classId);
  if (char) list.push(char);
  return writeAll(list);
}

export function newCharData(classId, name) {
  const C = CLASSES[classId];
  const c = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    version: 1, campaignOverhaulV2: true, skillRespecV1: true, classWeaponRestrictionsV1: 1, name, classId, level: 1, xp: 0,
    attrs: { ...C.base }, statPoints: 0, skillPoints: 1, talentPoints: 0,
    skills: {}, talents: {}, granted: {}, skillTutorialSeen: false, bar: Array(BAR_SIZE).fill(null),
    equip: { weapon: null, offhand: null, head: null, body: null, hands: null, legs: null, feet: null, ring1: null, ring2: null, ring3: null, ring4: null },
    vanity: { head: null, body: null, weapon: null, offhand: null }, hideHelm: false,
    macros: newMacros(), // game/macros.js
    mastery: {}, rage: 0, townSeed: (Math.random() * 1e9) | 0,
    bag: Array(BAG_COLS * BAG_ROWS).fill(null), // more rows are bought in the inventory (data/bag.js)
    gemBag: Array(30).fill(null),
    stash: Array(300).fill(null),
    jewelBox: Array(300).fill(null),
    tabs: Array(TAB_SLOTS).fill(null), tabAt: 0, // the Bard's Tabs: locked Music Sheets he plays (data/tabs.js)
    gold: 150, potions: { hp: 6, mp: 4, rejuv: 1, fury: 1 },
    depth: 1, deepest: 0, nextBiome: null, biomeBag: [], cleared: {}, dungeonAffixes: [], nextAffixes: [], overworldMisses: 0, overworldLastVisit: null, seaOfSandRuns: {}, darkForestRuns: {}, breach: { best: 0, cleared: {} },
    heresy: { on: [] }, rifts: { open: 1, best: 0, cleared: {}, bestTime: {}, runs: 0, fails: 0, deaths: 0 }, keys: 0, unbound: { wins: 0, best: 0 }, unboundExploration: { depth: 1, deepest: 1, cleared: {} }, // the Endgame (docs/ENDGAME.md)
    kills: 0, deaths: 0, created: Date.now(), lastPlayed: Date.now(), tips: {},
  };
  c.equip.weapon = rollItem(1, { slot: 'weapon', base: C.weapon, rarity: 0 });
  c.equip.weapon.affixes = c.equip.weapon.affixes.filter((a) => a.implicit);
  if (C.offhand) { c.equip.offhand = rollItem(1, { slot: 'offhand', base: C.offhand, rarity: 0 }); }
  else if (classId === 'rogue') { c.equip.offhand = rollItem(1, { slot: 'weapon', base: C.weapon, rarity: 0 }); c.equip.offhand.affixes = c.equip.offhand.affixes.filter((x) => x.implicit); } // her second dagger
  c.equip.body = rollItem(1, { slot: 'body', rarity: 0 });
  c.equip.body.affixes = [];
  if (['monk', 'rogue', 'ninja'].includes(classId)) c.equip.body.look = [1, 0, -1, 2]; // they start as their portraits: the first Common, in its own colours
  c.equip.weapon.sockets = 1;
  c.nextBiome = drawBiome(c, 1); // the first descent is a random biome too
  return c;
}

/** Map legacy 500-depth campaign values proportionally into the 100-depth campaign + infinite endgame without wiping saves. */
export function mapLegacyDepth(d) {
  const n = Math.floor(Number(d) || 0);
  if (n <= 0) return 0;
  if (n <= 500) return Math.max(1, Math.round(n / 5));
  return FINAL_DEPTH + (n - 500);
}

/** Move newly class-restricted equipped weapons/off-hands safely into bag or stash (never deleted). */
function migrateClassWeaponEquipment(c) {
  if (c.classWeaponRestrictionsV1) return;
  const displaced = ['weapon', 'offhand']
    .filter((slot) => c.equip?.[slot] && armsReason(c.classId, c.equip[slot], slot))
    .map((slot) => ({ slot, item: c.equip[slot] }));
  for (const { slot, item } of displaced) {
    const free = Array.isArray(c.bag) ? c.bag.findIndex((entry) => !entry) : -1;
    if (free >= 0) c.bag[free] = item;
    else if (Array.isArray(c.stash)) c.stash.push(item);
    c.equip[slot] = null;
  }
  c.classWeaponRestrictionsV1 = 1;
}

/** Fill in fields added by later versions (non-destructive for all online & local characters). */
export function migrate(c) {
  c.cleared = c.cleared || {};
  if (!c.campaignOverhaulV2) {
    const oldDepth = Number(c.depth) || 1;
    const oldDeepest = Number(c.deepest) || 0;
    const beatOldVelscour = oldDeepest >= 500 || !!c.cleared[500] || !!c.velscourDefeated;
    c.depth = Math.max(1, mapLegacyDepth(oldDepth));
    c.deepest = oldDeepest > 0 ? mapLegacyDepth(oldDeepest) : 0;
    const remappedCleared = {};
    for (const [k, v] of Object.entries(c.cleared)) {
      if (!v) continue;
      const mapped = mapLegacyDepth(k);
      if (mapped > 0) remappedCleared[mapped] = true;
    }
    if (beatOldVelscour) {
      remappedCleared[FINAL_DEPTH] = true;
      c.deepest = Math.max(c.deepest || 0, FINAL_DEPTH);
      c.velscourDefeated = true;
    }
    c.cleared = remappedCleared;
    if (c.deepest >= 25) c.visitedAct2Town = true;
    if (c.deepest >= 75) c.visitedAct4Town = true;
    c.nextBiome = drawBiome(c, c.depth);
    c.campaignOverhaulV2 = true;
  }
  c.depth = Math.max(1, Math.min(MAX_DEPTH, Math.floor(Number(c.depth) || 1)));
  c.deepest = Math.max(0, Math.min(MAX_DEPTH, Math.floor(Number(c.deepest) || 0)));
  c.dungeonAffixes = normalizeDungeonAffixIds(c.dungeonAffixes);
  c.nextAffixes = normalizeDungeonAffixIds(c.nextAffixes);
  c.potions = Object.assign({ hp: 0, mp: 0, rejuv: 0, fury: 0 }, c.potions);
  c.cleared = c.cleared || {};
  c.seaOfSandRuns = c.seaOfSandRuns || {};
  c.darkForestRuns = c.darkForestRuns || {};
  c.breach = Object.assign({ best: 0, cleared: {} }, c.breach); // THE ETERNAL BREACH: best floor beaten, clears per floor
  // the Endgame (docs/ENDGAME.md): Heresies on, Abyssal Rifts, Abyssal Keys, Velscour Unbound
  c.heresy = Object.assign({ on: [] }, c.heresy); if (!Array.isArray(c.heresy.on)) c.heresy.on = [];
  c.rifts = Object.assign({ open: 1, best: 0, cleared: {}, bestTime: {}, runs: 0, fails: 0, deaths: 0 }, c.rifts); c.rifts.open = Math.max(1, c.rifts.open | 0);
  c.keys = Math.max(0, c.keys | 0);
  c.unbound = Object.assign({ wins: 0, best: 0 }, c.unbound);
  c.unboundExploration = Object.assign({ depth: 1, deepest: 1, cleared: {} }, c.unboundExploration);
  c.unboundExploration.depth = Math.min(100, Math.max(1, c.unboundExploration.depth | 0 || 1));
  c.unboundExploration.deepest = Math.min(100, Math.max(1, c.unboundExploration.deepest | 0 || 1));
  if (c.marks && typeof c.marks === 'object') {
    const rawSpent = c.marks.spent && typeof c.marks.spent === 'object' ? c.marks.spent : {};
    const spent = {};
    for (const [k, v] of Object.entries(rawSpent)) {
      const n = Math.max(0, Math.floor(Number(v) || 0));
      if (n > 0) spent[k] = n;
    }
    c.marks = {
      pts: Math.max(0, Math.floor(Number(c.marks.pts) || 0)),
      xp: Math.max(0, Number(c.marks.xp) || 0),
      spentValue: Math.max(0, Math.floor(Number(c.marks.spentValue) || 0)),
      rewardRemainder: Math.max(0, Math.min(0.999999, Number(c.marks.rewardRemainder) || 0)),
      legacyFerocity: Math.max(0, Number(c.marks.legacyFerocity) || 0),
      spent,
    };
  }
  c.granted = c.granted || {};
  c.skills = c.skills || {};
  c.skillPoints = Math.max(0, c.skillPoints | 0);
  // Migrate pruned or out-of-class skill IDs: refund spent skill points, preserve free grants on valid skills
  for (const [id, rawLv] of Object.entries(c.skills)) {
    const lv = Math.max(0, rawLv | 0);
    const sk = SKILLS[id];
    if (!sk || sk.classId !== c.classId || lv <= 0) {
      const paid = Math.max(0, lv - (c.granted[id] ? 1 : 0));
      c.skillPoints += paid;
      delete c.skills[id];
      delete c.granted[id];
    } else if (lv > MAX_SKILL_LEVEL) {
      c.skillPoints += lv - MAX_SKILL_LEVEL;
      c.skills[id] = MAX_SKILL_LEVEL;
    } else {
      c.skills[id] = lv;
    }
  }
  for (const gid of Object.keys(c.granted)) {
    if (!SKILLS[gid] || SKILLS[gid].classId !== c.classId) delete c.granted[gid];
  }
  c.talents = c.talents || {};
  if (!Number.isInteger(c.talentPoints)) {
    const earnedTalents = Math.floor((c.level || 1) / 5);
    const spentTalents = Object.values(c.talents).reduce((acc, v) => acc + (Number(v) || 0), 0);
    if (spentTalents <= earnedTalents) {
      const unspent = earnedTalents - spentTalents;
      const moveFromSkillPts = Math.min(Math.max(0, c.skillPoints | 0), unspent);
      c.skillPoints = Math.max(0, (c.skillPoints | 0) - moveFromSkillPts);
      c.talentPoints = unspent;
    } else {
      // Refund any excess skill points previously spent in talents beyond 1 per 5 levels
      const excessSkillPts = spentTalents - earnedTalents;
      c.talents = {};
      c.skillPoints = Math.max(0, (c.skillPoints | 0) + excessSkillPts);
      c.talentPoints = earnedTalents;
    }
  }
  c.talentPoints = Math.max(0, c.talentPoints | 0);
  // One-time free skill point refund for existing heroes transitioning to rank-scaled resource costs and choose-your-first-skill.
  if (!c.skillRespecV1) {
    c.skills = {};
    c.granted = {};
    c.skillPoints = Math.max(1, Math.floor(Number(c.level) || 1));
    c.bar = Array(BAR_SIZE).fill(null);
    c.skillRespecV1 = true;
  }
  // Migrate overhauled talent IDs, ranks, and prerequisite/choice constraints: refund orphaned points cleanly
  for (const [tid, rawRk] of Object.entries(c.talents)) {
    const rk = Math.max(0, rawRk | 0);
    const node = TALENTS[tid];
    if (!node || node.classId !== c.classId || rk <= 0) {
      c.talentPoints += rk;
      delete c.talents[tid];
    } else if (rk > node.maxRank) {
      c.talentPoints += rk - node.maxRank;
      c.talents[tid] = node.maxRank;
    } else {
      c.talents[tid] = rk;
    }
  }
  for (let row = 0; row <= 4; row++) {
    for (const [tid, rk] of Object.entries(c.talents)) {
      const node = TALENTS[tid];
      if (!node || node.row !== row) continue;
      if ((c.level || 1) < node.reqLevel || isTalentLockedByChoice(c, node) || !isTalentPrereqMet(c, node)) {
        c.talentPoints += rk;
        delete c.talents[tid];
      }
    }
  }
  c.tips = c.tips || {};
  if (c.phobos) c.phobos = Object.assign({ q: 0, qAt: null, bell: false, city: false, gate: false, floor: 0, cleared: {}, wards: [], hubs: {}, vWins: 0, vSeen: [], seenD: [], errands: {}, quests: {} }, c.phobos); // ACT III (game/phobos.js)
  if (c.classId === 'barbarian') c.rage = Math.max(0, Math.min(100, Number(c.rage) || 0));
  c.homunculus = c.homunculus || { talks: 0, chapter: 0, told: [], recap: [] }; // the blacksmith's axe story (game/homunculus.js)
  c.mastery = c.mastery || {}; // skill mastery: {skillId: [level 1-1000, xp]}
  c.comm = c.comm || { open: [], done: [] }; // Town Commissions (game/commissions.js)
  // plain (Common) gear takes more sockets now, as Glyphword bases (data/items.js HOLLOW)
  for (const it of [...Object.values(c.equip || {}), ...(c.bag || []), ...(c.stash || [])]) if (it && it.type === 'gear' && it.rarity === 0 && !it.relic && HOLLOW[it.slot] > (it.maxSockets || 0)) it.maxSockets = HOLLOW[it.slot];
  // Sky Battle cut scenes watched ('<story or base>:<scene>'): seen ones play at 20x. A hero who fought one before this
  // was kept has seen the weathers' scenes.
  if (!c.skySeen) c.skySeen = c.lastSkyVariant ? Object.fromEntries(['intro', 'mid', 'parley', 'hooks', 'victory'].map((n) => [`base:${n}`, 1])) : {};
  c.equip = c.equip || {};
  // the Pirate Seas (game/seabattle.js): sea battles won ('<id>': 1, one of Tolland's bells each) and cut scenes watched
  // ('cine:<scene>'); the count of bells rung; the battle fought last (never the next one, if there's a choice)
  if (!c.seaSeen || typeof c.seaSeen !== 'object') c.seaSeen = {};
  c.seaBells = Math.max(0, Math.floor(Number(c.seaBells) || 0));
  // sea battles won in all (Brask's first-win line plays once): a hero from before this kept counts the ones in seaSeen
  if (!(c.seaWins >= 0)) c.seaWins = Object.keys(c.seaSeen).filter((k) => !k.startsWith('cine:')).length;
  if (typeof c.lastSeaVariant !== 'string') c.lastSeaVariant = null;
  for (const s of ['ring1', 'ring2', 'ring3', 'ring4']) if (!(s in c.equip)) c.equip[s] = null;
  c.vanity = Object.assign({ head: null, body: null, weapon: null, offhand: null }, c.vanity); // looks only: worn over the real gear, no stats
  c.hideHelm = !!c.hideHelm;
  c.macros = migrateMacros(c.macros);
  for (const m of c.macros) {
    if (Array.isArray(m.skills)) m.skills = m.skills.filter((id) => SKILLS[id] && SKILLS[id].classId === c.classId);
  }
  if (c.townSeed === undefined) c.townSeed = (Math.random() * 1e9) | 0;
  if (!Array.isArray(c.biomeBag)) c.biomeBag = [];
  if (!Number.isInteger(c.overworldMisses)) c.overworldMisses = 0;
  c.overworldMisses = Math.max(0, Math.min(3, c.overworldMisses));
  if (!('overworldLastVisit' in c)) c.overworldLastVisit = c.lastBiome ? String(c.depth) + ':' + c.lastBiome : null;
  // heroes made before the shuffle bag always started in the catacombs: give an unexplored hero a random start
  if (c.nextBiome === 'catacombs' && !c.deepest && !c.lastBiome) c.nextBiome = drawBiome(c, c.depth || 1);
  c.bar = migrateBar(c.bar); // 10 slots (LMB, 1-8, RMB) -> 15 (LMB, ` 1-9 0 - =, RMB)
  c.bar = c.bar.map((id) => (id && SKILLS[id] && SKILLS[id].classId === c.classId && c.skills[id] > 0 ? id : null));
  if (!c.bar[0]) {
    const clsSkills = CLASS_SKILLS[c.classId] || [];
    const def = clsSkills.find((s) => s.m.free && c.skills[s.id] > 0) || clsSkills.find((s) => c.skills[s.id] > 0);
    if (def) c.bar[0] = def.id;
  }
  fixBag(c); // 6 rows, plus any bought
  fixGemBag(c);
  // Migrate existing gems from regular bag to the dedicated Gem Bag
  for (let i = 0; i < c.bag.length; i++) {
    const it = c.bag[i];
    if (it && it.type === 'gem') {
      const same = c.gemBag.find((b) => b && b.type === 'gem' && b.gem === it.gem && b.tier === it.tier);
      if (same) {
        same.count = (same.count || 1) + (it.count || 1);
        c.bag[i] = null;
      } else {
        const free = c.gemBag.findIndex((b) => !b);
        if (free >= 0) {
          c.gemBag[free] = it;
          c.bag[i] = null;
        }
      }
    }
  }
  fixStash(c);
  fixJewelBox(c);
  migrateClassWeaponEquipment(c);
  // Remap orphaned ring skill augments from pruned 80-skill trees onto valid augmentable skills in the same tree/class
  for (const it of [...Object.values(c.equip || {}), ...(c.bag || []), ...(c.stash || []), ...(c.jewelBox || [])]) {
    if (!it || !Array.isArray(it.aug)) continue;
    let remapped = false;
    for (const a of it.aug) {
      if (a && a.sk && !SKILLS[a.sk]) {
        const parts = String(a.sk).split('.');
        const targetCls = CLASS_SKILLS[parts[0]] ? parts[0] : c.classId;
        const targetTree = Number(parts[1]) || 0;
        const oldIdx = Number(parts[2]) || 0;
        const allPool = (CLASS_SKILLS[targetCls] || []).filter(augmentable);
        const treePool = allPool.filter((s) => s.tree === targetTree);
        const pool = treePool.length ? treePool : allPool;
        if (pool.length) {
          a.sk = pool[oldIdx % pool.length].id;
          remapped = true;
        }
      }
    }
    if (remapped && it.slot === 'ring' && it.rname && !it.uname && it.aug[0] && AUGMENTS[it.aug[0].id]) {
      it.rname = `${AUGMENTS[it.aug[0].id].word} ${it.baseName} of ${augTarget(it.aug[0])}`;
    }
  }
  if (!Array.isArray(c.tabs)) c.tabs = [];
  while (c.tabs.length < TAB_SLOTS) c.tabs.push(null);
  if (!Number.isInteger(c.tabAt) || c.tabAt < 0 || c.tabAt >= TAB_SLOTS) c.tabAt = 0;
  // body armor and helmets of the first Paladin art pack: their look now comes from the gear art
  for (const it of [...Object.values(c.equip), ...c.bag]) if (it && it.art && (it.slot === 'body' || it.slot === 'head')) { delete it.art; delete it.artCls; }
  // the generated biome natives (bn_) are gone: a nemesis wearing one takes a look from its next level
  if (c.nemesis && typeof c.nemesis.art === 'string' && c.nemesis.art.startsWith('bn_')) { c.nemesis.art = null; c.nemesis.swap = null; }
  return c;
}
