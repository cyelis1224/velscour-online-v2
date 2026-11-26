// Unique enemies should stay threatening without defensive affix combinations
// turning them into prolonged attrition encounters. These limits are scoped to
// rank === 'unique'; bosses and other enemy ranks retain their existing tuning.
export const UNIQUE_HEALTH_MULTIPLIER = 3.9; // 35% below the former 6x multiplier.
export const UNIQUE_MIN_DAMAGE_TAKEN = 0.4; // defensive layers together cannot exceed 60% reduction.
export const UNIQUE_MAX_REGEN_PER_SECOND = 0.005; // combine all regeneration sources before applying the unique-only cap.

// These elite affixes primarily improve survivability. A unique can still roll
// its usual number of affixes, but no more than one of these may be combined.
export const UNIQUE_DEFENSIVE_AFFIXES = Object.freeze(['tough', 'fiery', 'frozen', 'regen', 'vampiric']);
const UNIQUE_DEFENSIVE_AFFIX_SET = new Set(UNIQUE_DEFENSIVE_AFFIXES);

export function rollUniqueAffixes(keys, count, random = Math.random) {
  count = Math.max(0, Math.floor(Number(count) || 0));
  if (!count) return [];
  const pool = [...keys];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const selected = [];
  let defensiveCount = 0;
  for (const key of pool) {
    if (UNIQUE_DEFENSIVE_AFFIX_SET.has(key)) {
      if (defensiveCount) continue;
      defensiveCount++;
    }
    selected.push(key);
    if (selected.length >= count) break;
  }
  return selected;
}

/** Keep the full unique-specific defensive stack while retaining at least 40% incoming damage. */
export function uniqueDamageAfterDefense(rank, damageBeforeDefense, damageAfterDefense) {
  if (rank !== 'unique') return damageAfterDefense;
  return Math.max(damageAfterDefense, damageBeforeDefense * UNIQUE_MIN_DAMAGE_TAKEN);
}

export function uniqueRegenPerSecond(rank, totalRegenPerSecond) {
  const amount = Math.max(0, Number(totalRegenPerSecond) || 0);
  return rank === 'unique' ? Math.min(amount, UNIQUE_MAX_REGEN_PER_SECOND) : amount;
}
