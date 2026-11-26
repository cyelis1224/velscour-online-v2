// Infernal Marks (docs/ENDGAME.md): the account-wide progression past the level cap. A Mark comes from XP earned at
// MAX_LEVEL (one per xpToNext(MAX_LEVEL), Player.gainXp), from Abyssal Rift clears (riftMarks) and from Heresy rank 20
// (one per depth cleared). Each is spent on one of four categories; a category's bonus grows with diminishing returns
// but no cap (eff: the n-th point adds 1/sqrt(1 + n/100) of the first's worth, so the 300th still adds half and the
// 1000th ~30%). It used to approach a cap (97% of it by 500 points), and a player's 454th Vitality point read +0.00.
// Vitality multiplies the whole life pool (after gear's life % and Fortitude) and Fortune is more drops (gear, gems and
// Sigils, like the Greed lever): as plain life % and magic find they were lost beside gear's hundreds and thousands.
// The points live in the shared record (game/endgame.js), which the cloud merges three ways (game/cloud.js), so Marks
// earned on two devices add up.
import { G } from '../state.js';
import { endgame, saveEndgame, MARK_CATS } from './endgame.js';
import { xpToNext, MAX_LEVEL } from './player.js';
import { sfx } from '../core/audio.js';
import { floatText, addEffect, Ring } from '../gfx/vfx.js';

export const CATS = {
  life: { name: 'Vitality', per: 0.4, unit: '% more life', color: '#ff6a5a', desc: 'Multiplies your whole life pool, after gear and Fortitude.' },
  crit: { name: 'Precision', per: 0.06, unit: '% critical chance', also: { k: 'critDmg', per: 0.5, unit: '% critical damage' }, color: '#ffd860', desc: 'Critical strikes land more often and hit harder.' },
  mf: { name: 'Fortune', per: 0.25, unit: '% more drops', color: '#b45cff', desc: 'More gear, gems and Sigil Stones from every kill, like the Greed lever.' }, // (key 'mf': saved records)
  rift: { name: 'Haste', per: 0.3, unit: ' s on the rift clock', color: '#20e0ff', desc: 'More time in Abyssal Rifts.' },
};
const nonNegativeFinite = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
const experienceEarned = (c = G.char) => Math.max(0, Math.floor(nonNegativeFinite(c?.experienceMarks?.earned)));
/** One Mark's worth of XP at the cap: scales along the hero-level XP curve per Mark earned by this hero. */
export const markXp = (earned = experienceEarned(G.char)) => xpToNext(MAX_LEVEL + Math.max(0, Math.floor(nonNegativeFinite(earned))));
/** Ensure a level-100 hero has per-character Mark XP progress (migrating any legacy shared remainder once). */
export function prepareCharacterMarkProgress(c = G.char) {
  if (!c) return null;
  const progress = c.experienceMarks && typeof c.experienceMarks === 'object' && !Array.isArray(c.experienceMarks)
    ? c.experienceMarks : (c.experienceMarks = { earned: 0, xp: 0 });
  progress.earned = Math.max(0, Math.floor(nonNegativeFinite(progress.earned)));
  progress.xp = nonNegativeFinite(progress.xp);
  if (c.level >= MAX_LEVEL) {
    const rec = endgame();
    if (!rec.markXpMigrationV1) {
      const legacy = nonNegativeFinite(rec.marks?.xp);
      if (legacy > 0) progress.xp += legacy;
      if (rec.marks) rec.marks.xp = 0;
      rec.markXpMigrationV1 = true;
      saveEndgame(true);
    }
  }
  return progress;
}
/** A category's worth of n points, in its per (eff(100) ~58, eff(500) ~203, eff(1000) ~324: no cap). */
export const eff = (n) => 140 * (Math.sqrt(1 + Math.max(0, n) / 100) - 1);
/** What the next point adds against the first one (1 at 0 points, 0.5 at 300, ~0.3 at 1000). */
export const worthNext = (n) => 1 / Math.sqrt(1 + Math.max(0, n) / 100);
/** A category's bonus for n points. */
export const bonusAt = (k, n) => Math.round(CATS[k].per * eff(n) * 100) / 100;

export const marksTotal = () => endgame().marks.pts;
export const marksSpent = () => MARK_CATS.reduce((s, k) => s + endgame().marks.spent[k], 0);
export const marksFree = () => marksTotal() - marksSpent();
export const marksIn = (k) => endgame().marks.spent[k] || 0;

/** Check if player has enough free/unspent Infernal Marks. */
export const canAffordMarks = (cost) => marksFree() >= cost;

/** Deduct Infernal Marks for account/character purchases (e.g. storage rows). */
export function deductMarks(cost) {
  cost = Math.max(0, Math.floor(cost));
  if (!cost) return true;
  if (marksFree() < cost) return false;
  endgame().marks.pts -= cost;
  changed();
  const p = G.player;
  if (p && G.world) {
    floatText(p.x, p.y, 96, `-${cost} INFERNAL MARK${cost > 1 ? 'S' : ''}`, '#ffd860', 18, { life: 2.6, vz: 22 });
    sfx('levelup', 0.6);
  }
  if (G.ui && G.ui.log) {
    G.ui.log(`<b style="color:#ffd860">-${cost} Infernal Mark${cost > 1 ? 's' : ''}</b> <span class="dim">(${marksFree()} free marks remain)</span>`, '#ffd860');
  }
  return true;
}
/** A category's second bonus for n points (Precision's critical damage), or 0. */
export const alsoAt = (k, n) => (CATS[k].also ? Math.round(CATS[k].also.per * eff(n) * 100) / 100 : 0);
/** PvP Arena normalization caps so veteran Mark investment never one-shots opponents in duels. */
export const PVP_MARK_SCALE = 0.25;
export const PVP_MARK_CAPS = Object.freeze({ life: 15, crit: 6, critDmg: 25 });

/** The bonuses every hero gets now: { life % more, crit %, critDmg %, mf = % more drops, rift s }. */
export function markBonuses(world = G.world) {
  const s = endgame().marks.spent, o = {};
  for (const k of MARK_CATS) o[k] = bonusAt(k, s[k]);
  o.critDmg = alsoAt('crit', s.crit);
  if (world?.kind === 'arena') {
    o.life = Math.min(PVP_MARK_CAPS.life, Math.round(o.life * PVP_MARK_SCALE * 100) / 100);
    o.crit = Math.min(PVP_MARK_CAPS.crit, Math.round(o.crit * PVP_MARK_SCALE * 100) / 100);
    o.critDmg = Math.min(PVP_MARK_CAPS.critDmg, Math.round(o.critDmg * PVP_MARK_SCALE * 100) / 100);
    o.pvpNormalized = true;
  }
  return o;
}
/** Marks for clearing an Abyssal Rift of this tier. */
export const riftMarks = (tier) => Math.max(1, Math.ceil(tier / 10)); // (was tier / 4: rifts dwarfed every other source)

function changed() {
  saveEndgame();
  if (G.char) {
    G.char.marks = JSON.parse(JSON.stringify(endgame().marks));
  }
  if (G.player) G.player.recompute();
  if (G.ui && G.ui.refresh) G.ui.refresh();
  if (G.char && G.char.isOnline && G.game && G.game.autosave) {
    G.game.autosave();
  }
}
let xpDirty = false, xpSaved = 0;
/** XP earned at the level cap: per-character progressive Mark XP curve feeding the account-wide Mark wallet. */
export function gainMarkXp(xp, c = G.char) {
  const m = endgame().marks;
  const prog = prepareCharacterMarkProgress(c);
  const gained = Math.max(0, xp || 0);
  if (prog) {
    prog.xp += gained;
    let n = 0;
    let cost = markXp(prog.earned);
    while (prog.xp >= cost && cost > 0) {
      prog.xp -= cost;
      prog.earned++;
      m.pts++;
      n++;
      cost = markXp(prog.earned);
    }
    if (n) { xpDirty = false; xpSaved = Date.now(); changed(); announce(n, 'from the abyss', true); }
    else if (gained > 0) { xpDirty = true; if (Date.now() - xpSaved > 5000) saveMarkXp(); }
    return n;
  }
  m.xp += gained;
  let n = 0;
  const cost = markXp(0);
  while (m.xp >= cost) { m.xp -= cost; m.pts++; n++; }
  if (n) { xpDirty = false; xpSaved = Date.now(); changed(); announce(n, 'from the abyss', true); } else if (gained > 0) { xpDirty = true; if (Date.now() - xpSaved > 5000) saveMarkXp(); }
  return n;
}
/** Write XP towards the next Mark if any is unsaved (game.autosave). */
export function saveMarkXp() {
  if (!xpDirty) return;
  xpDirty = false; xpSaved = Date.now();
  saveEndgame(true);
}
/** At the level cap: { xp, need } towards the next Mark (the HUD's XP bar, the character sheet), else null. */
export const capXp = (c = G.char) => {
  if (!c || c.level < MAX_LEVEL) return null;
  const prog = prepareCharacterMarkProgress(c);
  return prog ? { xp: prog.xp, need: markXp(prog.earned), earned: prog.earned } : { xp: endgame().marks.xp, need: markXp(0), earned: 0 };
};
/** Marks given outright (rift clears, Heresy milestones). */
export function grantMarks(n, why = '') {
  n = Math.max(0, Math.floor(n));
  if (!n) return 0;
  endgame().marks.pts += n;
  changed();
  announce(n, why);
  return n;
}
function announce(n, why, fx) {
  const p = G.player;
  if (p && G.world) {
    floatText(p.x, p.y, 96, `+${n} INFERNAL MARK${n > 1 ? 'S' : ''}`, '#ff9050', 18, { life: 2.6, vz: 22 });
    if (fx) { addEffect(new Ring(p.x, p.y, 0.3, 2.6, 0.9, '#ff6a20', 4)); sfx('levelup', 0.5); }
  }
  if (G.ui && G.ui.log) G.ui.log(`<b style="color:#ff9050">+${n} Infernal Mark${n > 1 ? 's' : ''}</b>${why ? ` ${why}` : ''} <span class="dim">(${marksFree()} to spend)</span>`, '#ffc0a0');
}
/** Spend a free Mark on a category. */
export function spendMark(k, n = 1) {
  if (!CATS[k]) return 0;
  n = Math.min(Math.max(0, Math.floor(n)), marksFree());
  if (!n) return 0;
  endgame().marks.spent[k] += n;
  changed();
  return n;
}
/** Take every point back (free, any time). */
export function resetMarks() {
  const s = endgame().marks.spent;
  for (const k of MARK_CATS) s[k] = 0;
  changed();
}
/** Spend every free Mark, each on the category that gains the most of its cap from it (auto-play, the panel's button). */
export function autoSpend() {
  const s = endgame().marks.spent;
  let n = marksFree(), spent = 0;
  while (n-- > 0) {
    let best = null, bv = -1;
    for (const k of MARK_CATS) { const v = eff(s[k] + 1) - eff(s[k]); if (v > bv) { bv = v; best = k; } }
    s[best]++; spent++;
  }
  if (spent) changed();
  return spent;
}
/** One line for the character sheet. */
export function marksText() {
  const b = markBonuses();
  return `${marksTotal()} (${marksFree()} free) · +${b.life}% more life · +${b.crit}% crit, +${b.critDmg}% crit damage · +${b.mf}% more drops · +${Math.round(b.rift)} s rifts`;
}
