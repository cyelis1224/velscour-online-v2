// Account-wide Infernal Mark currency/upgrades plus per-character XP progression.
import { G } from '../state.js';
import { endgame, saveEndgame, MARK_CATS, canEarnInfernalMarks } from './endgame.js';
import { INFERNAL_UPGRADES, INFERNAL_UPGRADE_BY_ID, MARK_CATEGORIES, bonusFor, purchaseCost, maxPurchasable } from '../data/infernalupgrades.js';
import { xpToNext, MAX_LEVEL } from './player.js';
import { writeSave } from './save.js';
import { sfx } from '../core/audio.js';
import { floatText, addEffect, Ring, Sigil, Column, sparkle } from '../gfx/vfx.js';

export {
  INFERNAL_UPGRADES, INFERNAL_UPGRADE_BY_ID, MARK_CATEGORIES,
  bonusFor, purchaseCost, maxPurchasable,
};
export const CATS = Object.freeze(Object.fromEntries(INFERNAL_UPGRADES.map((u) => [u.id, {
  name: u.name, per: u.per, unit: u.unit, maxRank: u.maxRank, baseCost: u.baseCost,
  color: ({ offensive: '#ff765c', defensive: '#65baff', resources: '#65dcce', loot: '#e7c552', utility: '#b999ff', endgame: '#e87dff' })[u.category],
  desc: u.description, icon: u.icon,
}])));
const nonNegativeFinite = (v) => Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0;
const experienceEarned = (c) => Math.max(0, Math.floor(nonNegativeFinite(c?.experienceMarks?.earned)));
/** The next Mark costs the next step of the existing hero-level XP curve. */
export const markXp = (earned = experienceEarned(G.char)) => xpToNext(MAX_LEVEL + Math.max(0, Math.floor(nonNegativeFinite(earned))));
export const eff = (n) => 140 * (Math.sqrt(1 + Math.max(0, n) / 100) - 1);
export const worthNext = (n) => 1 / Math.sqrt(1 + Math.max(0, n) / 100);
export const bonusAt = (k, n) => bonusFor(k, n);
export const alsoAt = () => 0;

/** PvP Arena normalization caps so veteran Mark investment never one-shots opponents in duels. */
export const PVP_MARK_SCALE = 0.25;
export const PVP_MARK_CAPS = Object.freeze({
  life: 15, vitality: 15, damage: 15, might: 15, crit: 6, critDmg: 25,
  reduce: 10, fortitude: 10, evasion: 6, lifeSteal: 3,
});

let bonusCache = null, bonusCacheKey = '';
export function markBonuses(world = G.world) {
  const isArena = world?.kind === 'arena';
  const m = endgame().marks, spent = m.spent;
  const key = MARK_CATS.map((id) => `${id}:${spent[id] || 0}`).join('|') + `|legacy:${m.legacyFerocity || 0}|arena:${isArena ? 1 : 0}`;
  if (bonusCache && key === bonusCacheKey) return bonusCache;
  const b = {};
  for (const id of MARK_CATS) b[id] = bonusFor(id, spent[id] || 0);
  b.life = b.vitality;
  b.critDmg = b.ferocity + (m.legacyFerocity || 0);
  b.damage = b.might;
  b.castSpeed = b.haste;
  b.penetration = b.penetration;
  b.execution = b.execution;
  b.eliteDamage = b.slayer;
  b.bossDamage = b.godslayer;
  b.fullHealthDamage = b.overwhelming;
  b.area = b.expanse;
  b.dotDuration = b.duration;
  b.cdr = b.swiftness;
  b.reduce = b.fortitude;
  b.regen = b.regeneration;
  b.dotReduce = b.resilience;
  b.ccReduce = b.tenacity;
  b.evasion = b.evasion;
  b.lifeSteal = b.vampirism;
  b.healing = b.recovery;
  b.bossReduce = b.bulwark;
  b.lowHpReduce = b.defiance;
  b.mana = b.intellect;
  b.manaRegen = b.meditation;
  b.manaCost = b.efficiency;
  b.manaOnKill = b.siphon;
  b.orbMana = b.replenishment;
  b.orbHeal = b.restoration;
  b.gold = b.greed;
  b.drops = b.abundance;
  b.gemChance = b.gemHunter;
  b.gemTier = b.gemMastery;
  b.sigilChance = b.sigilHunter;
  b.collector = b.collector;
  b.impSpawn = b.impHunter;
  b.impReward = b.impFortune;
  b.chestSpawn = b.treasureHunter;
  b.discount = b.bargaining;
  b.sell = b.merchant;
  b.moveSpeed = b.agility;
  b.pickupRadius = b.magnetism;
  b.shrineDuration = b.blessing;
  b.potionDuration = b.alchemy;
  b.impDamage = b.pursuit;
  b.bounty = b.bounty;
  b.riftRewards = b.riftHunter;
  b.riftDamage = b.riftSlayer;
  b.breachRewards = b.breachMastery;
  b.heretic = b.heretic;
  b.affixReduce = b.affixMastery;
  b.unboundDamage = b.unboundSlayer;
  b.rift = 0; // compatibility alias: Haste no longer modifies Rift time
  if (isArena) {
    for (const [k, cap] of Object.entries(PVP_MARK_CAPS)) {
      if (typeof b[k] === 'number') b[k] = Math.min(cap, Math.round(b[k] * PVP_MARK_SCALE * 100) / 100);
    }
    b.pvpNormalized = true;
  }
  bonusCache = Object.freeze(b); bonusCacheKey = key;
  return bonusCache;
}

export const marksTotal = () => endgame().marks.pts;
export const marksSpent = () => endgame().marks.spentValue || 0;
export const marksFree = () => Math.max(0, marksTotal() - marksSpent());
export const marksIn = (k) => endgame().marks.spent[k] || 0;
export const canAffordMarks = (cost) => marksFree() >= cost;

function changed() {
  bonusCache = null; bonusCacheKey = '';
  saveEndgame();
  if (G.player) G.player.recompute();
  if (G.ui && G.ui.refresh) G.ui.refresh();
  if (G.char?.isOnline && G.game?.autosave) G.game.autosave();
}

export function deductMarks(cost) {
  cost = Math.max(0, Math.floor(cost));
  if (!cost) return true;
  if (marksFree() < cost) return false;
  endgame().marks.pts -= cost;
  changed();
  const p = G.player;
  if (p && G.world) { floatText(p.x, p.y, 96, `-${cost} INFERNAL MARK${cost > 1 ? 'S' : ''}`, '#ffd860', 18, { life: 2.6, vz: 22 }); sfx('levelup', 0.6); }
  G.ui?.log?.(`<b style="color:#ffd860">-${cost} Infernal Mark${cost > 1 ? 's' : ''}</b> <span class="dim">(${marksFree()} free marks remain)</span>`, '#ffd860');
  return true;
}

export function purchaseUpgrade(id, count = 1) {
  const def = INFERNAL_UPGRADE_BY_ID[id], m = endgame().marks;
  if (!def || !Number.isFinite(count) || count < 1) return 0;
  count = Math.floor(count);
  const possible = maxPurchasable(id, m.spent[id] || 0, marksFree(), count);
  if (possible !== count) return 0;
  const cost = purchaseCost(id, m.spent[id] || 0, count);
  if (cost > marksFree()) return 0;
  m.spent[id] = (m.spent[id] || 0) + count;
  m.spentValue = (m.spentValue || 0) + cost;
  changed();
  return count;
}
/** Cost of refunding the most recently purchased `count` ranks of one upgrade. */
export function refundCost(id, count = 1) {
  const rank = marksIn(id);
  const requested = count === 'max' ? rank : Math.max(0, Math.floor(Number(count) || 0));
  const n = Math.min(rank, requested);
  return n ? purchaseCost(id, rank - n, n) : 0;
}
/** Refund only the selected upgrade's latest ranks; rank and wallet update atomically. */
export function refundUpgrade(id, count = 1) {
  const def = INFERNAL_UPGRADE_BY_ID[id], m = endgame().marks;
  if (!def || (count !== 'max' && (!Number.isFinite(count) || count < 1))) return null;
  const rank = Math.max(0, Math.floor(Number(m.spent[id]) || 0));
  const n = count === 'max' ? rank : Math.min(rank, Math.floor(count));
  if (!n) return null;
  const refund = purchaseCost(id, rank - n, n);
  if (!Number.isFinite(refund) || refund <= 0 || (m.spentValue || 0) < refund) return null;
  m.spent[id] = rank - n;
  m.spentValue = Math.max(0, m.spentValue - refund);
  changed();
  return { ranks: n, marks: refund };
}
/** Compatibility call: rank purchases now use the registry's escalating price formula. */
export function spendMark(k, n = 1) { return purchaseUpgrade(k, n); }

export function resetMarks() {
  const m = endgame().marks;
  for (const id of MARK_CATS) m.spent[id] = 0;
  m.spentValue = 0;
  m.legacyFerocity = 0;
  changed();
}
export function autoSpend() {
  let count = 0;
  while (true) {
    const m = endgame().marks, free = marksFree();
    let choice = null, best = 0;
    for (const u of INFERNAL_UPGRADES) {
      const rank = m.spent[u.id] || 0;
      const n = maxPurchasable(u.id, rank, free, 1);
      if (!n) continue;
      const delta = bonusFor(u.id, rank + 1) - bonusFor(u.id, rank);
      const value = delta / u.cost(rank);
      if (value > best) { best = value; choice = u.id; }
    }
    if (!choice || !purchaseUpgrade(choice, 1)) break;
    count++;
  }
  return count;
}

export const riftMarks = (tier) => Math.max(1, Math.ceil(tier / 10));
let xpDirty = false, xpSaved = 0;
/**
 * Per-character progression replaces the old shared XP remainder. The old remainder can be migrated only once,
 * to the first level-100 hero that enters after this update. Its historical lifetime count was never recorded, so
 * we intentionally do not infer one from the shared Mark wallet.
 */
export function prepareCharacterMarkProgress(c = G.char) {
  if (!c) return null;
  const progress = c.experienceMarks && typeof c.experienceMarks === 'object' && !Array.isArray(c.experienceMarks)
    ? c.experienceMarks : (c.experienceMarks = { earned: 0, xp: 0 });
  const earned = Math.max(0, Math.floor(nonNegativeFinite(progress.earned))), xp = nonNegativeFinite(progress.xp);
  if (progress.earned !== earned) progress.earned = earned;
  if (progress.xp !== xp) progress.xp = xp;
  let dirty = false;
  if (c.level >= MAX_LEVEL && Number(c.xp) > 0) {
    progress.xp = Math.min(Number.MAX_VALUE, progress.xp + nonNegativeFinite(c.xp));
    c.xp = 0;
    dirty = true;
  }
  if (c.level >= MAX_LEVEL) {
    const record = endgame();
    if (!record.markXpMigrationV1) {
      const legacy = nonNegativeFinite(record.marks.xp);
      if (legacy > 0) progress.xp = Math.min(Number.MAX_VALUE, progress.xp + legacy);
      record.marks.xp = 0;
      record.markXpMigrationV1 = true;
      saveEndgame(true);
      dirty = true;
    }
  }
  if (dirty) xpDirty = true;
  return progress;
}

// Exact summation is cheap for ordinary payouts. For artificial, extremely large test/reward values use the
// Euler–Maclaurin sum of the same smooth curve to avoid a per-Mark loop proportional to the payout.
const powerDelta = (start, delta, power) => start ** power * Math.expm1(power * Math.log1p(delta / start));
function curveValue(x) { return (45 * x * x + 35 * x) * (1 + (x / 25) ** 1.25); }
function curveDerivative(x) {
  return (90 * x + 35) * (1 + (x / 25) ** 1.25) + (45 * x * x + 35 * x) * (1.25 / 25) * (x / 25) ** 0.25;
}
function cumulativeMarkCost(earned, count) {
  count = Math.max(0, Math.floor(count));
  if (!count) return 0;
  const start = MAX_LEVEL + earned;
  if (count <= 50000) {
    let total = 0;
    for (let i = 0; i < count; i++) total += xpToNext(start + i);
    return total;
  }
  const end = start + count - 1;
  const delta = end - start, q = 25 ** 1.25;
  const integral = 15 * powerDelta(start, delta, 3) + 17.5 * powerDelta(start, delta, 2)
    + (45 / (4.25 * q)) * powerDelta(start, delta, 4.25)
    + (35 / (3.25 * q)) * powerDelta(start, delta, 3.25);
  // Sum f(start..end) = integral + endpoint correction + first Bernoulli correction.
  return integral + (curveValue(start) + curveValue(end)) / 2 + (curveDerivative(end) - curveDerivative(start)) / 12;
}
function affordableMarkCount(progressXp, earned) {
  if (progressXp < markXp(earned)) return 0;
  let low = 0, high = 1;
  while (high < Number.MAX_SAFE_INTEGER && cumulativeMarkCost(earned, high) <= progressXp) {
    low = high;
    high = Math.min(Number.MAX_SAFE_INTEGER, high * 2);
  }
  if (high === Number.MAX_SAFE_INTEGER && cumulativeMarkCost(earned, high) <= progressXp) return high;
  while (low + 1 < high) {
    const mid = Math.floor(low + (high - low) / 2);
    if (cumulativeMarkCost(earned, mid) <= progressXp) low = mid;
    else high = mid;
  }
  return low;
}
/** Award experience-earned Marks from any legitimate XP source once this character reaches level 100. */
export function gainMarkXp(xp, _world = G.world, character = G.char) {
  if (!character || character.level < MAX_LEVEL) return 0;
  const progress = prepareCharacterMarkProgress(character);
  const amount = nonNegativeFinite(xp);
  if (!progress || amount <= 0) return 0;
  progress.xp = Math.min(Number.MAX_VALUE, progress.xp + amount);
  const earned = progress.earned;
  const n = affordableMarkCount(progress.xp, earned);
  if (n > 0) {
    const cost = cumulativeMarkCost(earned, n);
    progress.xp = Math.max(0, progress.xp - cost);
    progress.earned += n;
    endgame().marks.pts += n;
    xpDirty = true;
    changed();
    saveMarkXp();
    announce(n, 'from experience', true);
  } else {
    xpDirty = true;
    if (Date.now() - xpSaved > 5000) saveMarkXp();
  }
  return n;
}
export function saveMarkXp() {
  if (!xpDirty) return true;
  const charSaved = G.char ? writeSave(G.char) : true;
  const endgameSaved = saveEndgame(true);
  if (!charSaved || !endgameSaved) return false;
  xpDirty = false; xpSaved = Date.now();
  return true;
}
export const capXp = (c = G.char) => {
  if (!c || c.level < MAX_LEVEL) return null;
  const progress = prepareCharacterMarkProgress(c);
  return progress ? { xp: progress.xp, need: markXp(progress.earned), earned: progress.earned } : null;
};

export function grantMarks(n, why = '', world = G.world) {
  n = Math.max(0, Math.floor(n));
  if (!n || !canEarnInfernalMarks(world)) return 0;
  endgame().marks.pts += n; changed(); announce(n, why); return n;
}
/** Bonus Mark payout with fractional carry so small Heresy awards retain their long-run value. */
export function grantMarksWithBonus(n, why = '', world = G.world, bonusPct = 0) {
  n = Math.max(0, Math.floor(n));
  if (!n || !canEarnInfernalMarks(world)) return 0;
  const m = endgame().marks;
  const total = n * (1 + Math.max(0, bonusPct) / 100) + (m.rewardRemainder || 0);
  const paid = Math.floor(total);
  m.rewardRemainder = total - paid;
  if (!paid) { saveEndgame(); return 0; }
  m.pts += paid; changed(); announce(paid, why); return paid;
}
function announce(n, why, fx) {
  const p = G.player;
  if (p && G.world) {
    if (fx) {
      addEffect(new Sigil(p.x, p.y, 1.05, 1.8, '#68121d', '#dda44f'), 'ground');
      addEffect(new Ring(p.x, p.y, 0.18, 1.9, 0.92, '#d39b47', 2), 'ground');
      if (!G.settings?.reduceFlashing) {
        addEffect(new Column(p.x, p.y, '#922630', 0.42, 11, 112), 'top');
        sparkle(p.x, p.y, 9, '#e7b45e', 6, 0.28);
        sparkle(p.x, p.y, 14, '#b72e32', 4, 0.34);
      }
      floatText(p.x, p.y, 96, `+${n} Infernal Mark${n === 1 ? '' : 's'}`, '#e7b45e', 18, {
        life: 1.85, vz: 28, gradient: [[0, '#c33b3d'], [0.48, '#f4cb75'], [1, '#b52c32']],
      });
      sfx('levelup', 0.55);
    } else {
      floatText(p.x, p.y, 96, `+${n} INFERNAL MARK${n > 1 ? 'S' : ''}`, '#ff9050', 18, { life: 2.6, vz: 22 });
    }
  }
  G.ui?.log?.(`<b style="color:#ff9050">+${n} Infernal Mark${n > 1 ? 's' : ''}</b>${why ? ` ${why}` : ''} <span class="dim">(${marksFree()} to spend)</span>`, '#ffc0a0');
}
export function marksText() {
  const b = markBonuses();
  return `${marksTotal()} (${marksFree()} free) · +${b.vitality}% health · +${b.crit}% crit · +${b.critDmg}% critical damage · +${b.haste}% cast speed`;
}
