// Rare, natural Sigil drops are limited to one per generated level and tracked
// on the hero so returning to that level cannot reset the limit.
// The first 80% reduction still made high-depth, high-Heresy levels drop Sigils
// on most floors. The validated final chance uses 5% of each prior roll.
export const NATURAL_SIGIL_DROP_SCALE = 0.05;

const numberOr = (value, fallback = 1) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function naturalSigilDropLevelKey(world) {
  if (!world || world.kind !== 'dungeon') return null;
  const depth = Math.max(1, Math.floor(numberOr(world.depth, 1)));
  const biome = String(world.biome?.id || world.environmentVariant || 'unknown');
  if (world.rift) return `rift:${Math.max(1, Math.floor(numberOr(world.rift.tier, world.riftTier || 1)))}:${numberOr(world.riftSeed, world.environmentTrapSeed || depth)}`;
  if (world.breach) {
    const floor = Math.max(1, Math.floor(numberOr(world.breach.floor, 1)));
    return `breach:${floor}:${numberOr(world.breach.seed, world.environmentTrapSeed || depth)}`;
  }
  if (world.heresyChallenge) return `heresy:${world.heresyChallenge.kind || 'challenge'}:${numberOr(world.heresyChallenge.seed, world.environmentTrapSeed || depth)}`;
  if (world.unboundExploration) {
    const floor = Math.max(1, Math.floor(numberOr(world.unboundExploration.floor, 1)));
    return `unbound:${floor}:${numberOr(world.environmentTrapSeed, depth)}`;
  }
  if (world.unbound) return `unbound-boss:${depth}:${numberOr(world.environmentTrapSeed, depth)}`;
  // Campaign and Infinite Endgame floors use the same persisted floor key. The
  // normal game returns to the same depth/environment after town, even when it
  // reconstructs that floor's map rather than keeping its World object alive.
  return `depth:${depth}:${biome}`;
}

export function naturalSigilDropChance(baseChance, world = {}, stats = {}, { includeBreachReward = false } = {}) {
  const base = Math.max(0, numberOr(baseChance, 0));
  const sigilMul = Math.max(0, numberOr(world.sigilMul, 1));
  const lootMul = Math.max(0, numberOr(world.lootMul, 1));
  const markMul = Math.max(0, 1 + numberOr(stats.markSigilChance, 0) / 100);
  const breachMul = includeBreachReward && world.breach ? Math.max(0, 1 + numberOr(stats.markBreachRewards, 0) / 100) : 1;
  // Reduce the probability after the existing bonuses and their cap. This keeps
  // their relative value but guarantees the final 95% reduction even when
  // bonuses previously pushed an individual roll to 100%.
  return Math.min(1, base * sigilMul * lootMul * markMul * breachMul) * NATURAL_SIGIL_DROP_SCALE;
}

/** Imp reward Sigils keep their normal reward roll but never consume the floor's natural-drop allowance. */
export function rollTreasureImpSigilDrop(world, char, stats = {}, random = Math.random) {
  if (world?.kind !== 'dungeon' || !char || typeof random !== 'function') return false;
  const roll = Number(random());
  return Number.isFinite(roll) && roll < naturalSigilDropChance(1, world, stats);
}

export function canDropNaturalSigil(world, char) {
  const key = naturalSigilDropLevelKey(world);
  if (!key || !char) return false;
  const recorded = Array.isArray(char.sigilDropLevels) ? char.sigilDropLevels : [];
  return !recorded.includes(key) && world._sigilDropCommittedKey !== key;
}

export function recordNaturalSigilDrop(world, char) {
  const key = naturalSigilDropLevelKey(world);
  if (!key || !canDropNaturalSigil(world, char)) return false;
  if (!Array.isArray(char.sigilDropLevels)) char.sigilDropLevels = [];
  char.sigilDropLevels.push(key);
  world._sigilDropCommittedKey = key;
  return true;
}
