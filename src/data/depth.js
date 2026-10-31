// The descent: Demon Lord Velscour waits at FINAL_DEPTH, and depthLevel maps a depth to the monster level that
// sets its monsters' life, damage, XP and loot.
// Rebalanced for Dagyr Online: Level 1-100 polynomial progression where Player HP, Player Damage, Monster HP,
// and Monster Damage operate on a unified 1:1 scale suitable for both tactical co-op and PvP.
export const FINAL_DEPTH = 500;
/** The hero level cap (game/player.js re-exports it): no item asks for more (data/items.js rollItem). */
export const MAX_LEVEL = 100;
export const depthLevel = (d) => {
  if (d <= 40) return Math.max(1, d);
  if (d <= FINAL_DEPTH) return Math.min(MAX_LEVEL, Math.round(40 + 60 * Math.pow((d - 40) / (FINAL_DEPTH - 40), 0.78)));
  return Math.min(120, MAX_LEVEL + Math.floor((d - FINAL_DEPTH) / 25));
};
/** Every fifth depth but the last ends in a BOSS ROOM. */
export const isRaidDepth = (d) => d % 5 === 0 && d !== FINAL_DEPTH;
/** First depth of d's five-depth block (the block ends in its BOSS ROOM): where a death sends the hero back to. */
export const blockStart = (d) => Math.floor((Math.max(1, d) - 1) / 5) * 5 + 1;
/**
 * Armor's divisor against an attacker of level `lvl`: armor / (armor + armorDiv) of physical damage is mitigated.
 * Polynomial curve matched to polynomial item armor (data/items.js).
 */
export const armorDiv = (lvl) => Math.round(40 + lvl * 14 + 0.12 * lvl * lvl);
/** Hero life multiplier by hero level ("Fortitude"): unified 1:1 scale across levels 1-100. */
export const fortitude = (_level) => 1;
/** Read a table of [x, value] points at x: log-linear between points, held flat past either end. */
export function logCurve(T, x) {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) {
    const [x0, a] = T[i - 1], [x1, b] = T[i];
    return a * Math.pow(b / a, (x - x0) / (x1 - x0));
  }
  return T[T.length - 1][1];
}
/** Monster life multiplier by monster level: unified 1:1 polynomial curve in monsterBase. */
export const toughness = (_lvl) => 1;
/** Abyssal Rifts hold multiplier: 1.0 on the unified 1-100 scale. */
export const riftHold = (_lvl) => 1;
/** Monster damage multiplier by monster level: unified 1:1 polynomial curve in monsterBase. */
export const danger = (_lvl) => 1;
/** Monster packs per room area by depth (world/dungeon.js). */
export const density = (d) => 1 + Math.min(d, 120) * 0.006;
const OLD_DENSITY = (d) => 1.1 + Math.min(d, 120) * 0.013;
/** XP multiplier for a monster level. */
export const densityXp = (lvl) => { const d = lvl <= 40 ? lvl : 40 + (lvl - 40) * 4; return OLD_DENSITY(d) / density(d); };
/**
 * Unified 1:1 combat scale: raw damage and displayed damage are identical (dmgScale = 1),
 * so player damage, player HP, enemy damage, and enemy HP are directly comparable for PvE and PvP.
 */
export const dmgScale = (_lvl) => 1;
export const shownDmg = (raw, _lvl) => raw;
/** Reference weapon average damage at level `lvl`, and direct 1:1 weapon damage display. */
export const weaponRef = (lvl) => 6 + lvl * 1.8 + 0.022 * lvl * lvl;
export const shownWeapon = (raw, _lvl) => raw;
/** The level tooltips and the stats plaque measure against: the monsters of the hero's depth. */
export const heroDmgLevel = (c) => depthLevel((c && c.depth) || 1);
