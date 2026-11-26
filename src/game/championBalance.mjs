// Champion durability adjustments target only the stacked tank profile. Other ranks keep their existing values.
export const HULKING_HEALTH_MULTIPLIER = 4.5;
export const HULKING_CHAMPION_HEALTH_MULTIPLIER = 3.75;
export const TOUGH_HEALTH_MULTIPLIER = 1.5;
export const TOUGH_CHAMPION_HEALTH_MULTIPLIER = 1.35;
export const WAR_CAPTAIN_GUARD_DAMAGE_REDUCTION = 0.10;
export const WAR_CAPTAIN_GUARD_RESIST = 0.05;

export function hulkingHealthMultiplier(rank) {
  return rank === 'champion' ? HULKING_CHAMPION_HEALTH_MULTIPLIER : HULKING_HEALTH_MULTIPLIER;
}

export function toughHealthMultiplier(rank) {
  return rank === 'champion' ? TOUGH_CHAMPION_HEALTH_MULTIPLIER : TOUGH_HEALTH_MULTIPLIER;
}

export function applyToughHealthModifier(monster) {
  if (!monster) return 1;
  const multiplier = toughHealthMultiplier(monster.rank);
  monster.maxHp *= multiplier;
  monster.hp *= multiplier;
  return multiplier;
}

/** Correct an already-applied Hulking trait if a normal pack leader is promoted afterward. */
export function adjustHulkingChampionHealth(monster) {
  if (!monster || monster.trait !== 'tank' || monster.rank !== 'champion' || monster._hulkingChampionAdjusted) return false;
  const factor = HULKING_CHAMPION_HEALTH_MULTIPLIER / HULKING_HEALTH_MULTIPLIER;
  monster.maxHp *= factor;
  monster.hp *= factor;
  monster._hulkingChampionAdjusted = true;
  return true;
}

/** War Captains are the other reported Hulking defensive combination, even when their pack rank is normal. */
export function adjustHulkingWarCaptainHealth(monster) {
  if (!monster || monster.trait !== 'tank' || monster.packLeaderType !== 'war_captain' || monster._hulkingCaptainAdjusted) return false;
  const factor = HULKING_CHAMPION_HEALTH_MULTIPLIER / HULKING_HEALTH_MULTIPLIER;
  monster.maxHp *= factor;
  monster.hp *= factor;
  monster._hulkingCaptainAdjusted = true;
  return true;
}
