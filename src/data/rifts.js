// Abyssal Rifts (docs/ENDGAME.md, docs/ENDGAME_OVERHAUL.md): the true endgame dungeon experience.
import { FINAL_DEPTH } from './depth.js';
import { qualityAtDepth, RARITY } from './items.js';
import { clamp } from '../core/util.js';

// Rift progression is unbounded by game design. Use safe Number integers rather
// than bitwise coercion (which silently wraps at 2^31), and saturate only at the
// largest exactly representable integer.
export const MAX_RIFT_TIER = Number.MAX_SAFE_INTEGER;
export const normalizeRiftTier = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_RIFT_TIER, Math.floor(n))) : 1;
};
export const nextRiftTier = (tier, amount = 1) => Math.min(MAX_RIFT_TIER, normalizeRiftTier(tier) + Math.max(0, Math.floor(Number(amount) || 0)));

export const RIFT_TIME = 420;  // 7 minutes base clock
export const RIFT_QUOTA = 0.6; // 60% of monster weight to summon Guardian
export const RIFT_DENSITY = 0.85; // pack density in rifts
export const RIFT_GUARDIAN_HP = 1.0; // Guardian health scaling

/** Baseline monster level for Rifts is level 100 */
export const riftLevel = (_tier) => 100;
export const riftDepth = (_tier) => FINAL_DEPTH;
/** Reward progression for Rifts follows the game's 25-depth quality unlock cadence. */
export const riftLootDepth = (tier) => FINAL_DEPTH + 1 + (normalizeRiftTier(tier) - 1) * 25;

// Keep exponential combat curves finite at arbitrarily high unlocked tiers.
// Keep far below IEEE-754 overflow so baseline stats and boss multipliers stay finite;
// this guard is only reached at tiers in the thousands, not normal endgame play.
const hpLogCap = Math.log(1e290), damageLogCap = Math.log(1e290);
const stableMultiplier = (base, tier, logCap) => Math.exp(Math.min(logCap, Math.max(0, normalizeRiftTier(tier) - 1) * Math.log(base)));
/** Predictable +10% monster health scaling per tier above Tier 1. */
export const riftHpMul = (tier) => stableMultiplier(1.10, tier, hpLogCap);
/** Predictable +6% monster damage scaling per tier above Tier 1. */
export const riftDmgMul = (tier) => stableMultiplier(1.06, tier, damageLogCap);

/** Displayed equipment-quality bounds for the selected Rift tier (1-based). */
export const riftMaxQuality = (tier) => Math.min(RARITY.length, 5 + Math.floor((normalizeRiftTier(tier) - 1) / 5));
export const riftMinQuality = (tier) => Math.min(RARITY.length, 1 + Math.floor((normalizeRiftTier(tier) - 1) / 5));
/** Highest quality unlocked through normal progression; qualityAtDepth is the authoritative threshold table. */
export function normalProgressionDepth(character) {
  const current = Number(character?.depth);
  const deepest = Number(character?.deepest);
  const unlockedByClear = Number.isFinite(deepest) ? deepest + 1 : 1;
  return Math.max(1, Number.isFinite(current) ? current : 1, unlockedByClear);
}
export const normalProgressionMaxQuality = (character) => qualityAtDepth(normalProgressionDepth(character)) + 1;
/** Effective quality interval after applying both Rift-tier and normal-depth limits. */
export function riftQualityRange(tier, character) {
  const progressionMax = normalProgressionMaxQuality(character);
  const max = Math.max(1, Math.min(riftMaxQuality(tier), progressionMax));
  return { min: Math.min(riftMinQuality(tier), max), max, progressionMax, normalDepth: normalProgressionDepth(character) };
}
/** Shared depth budget for Rift gems and sigils, capped by ordinary progression. */
export function riftRewardProgressionDepth(tier, character) {
  return Math.min(riftLootDepth(tier), normalProgressionDepth(character));
}

/** Tiers a win opens: fast clear jumps further (k = time used / limit) */
export const riftJump = (k) => (k <= 0.5 ? 3 : k <= 0.8 ? 2 : 1);

/** Monster kill weight toward the quota */
export const riftWeight = (m) => (!m || m.goblin || m.summon || m.pitSpawn || m.vk ? 0 : m.rank === 'unique' ? 8 : m.rank === 'champion' ? 4 : m.rank === 'boss' || m.isRaid ? 0 : 1);

/** Pylon Definitions */
export const PYLONS = [
  { id: 'conduit', name: 'Conduit Pylon', color: '#30b0ff', dur: 20, desc: 'Lethal chain lightning strikes nearby enemies.' },
  { id: 'frenzy', name: 'Frenzy Pylon', color: '#ff8830', dur: 30, desc: '+50% Attack/Cast Speed, 0 Mana Cost, and 50% Cooldown Recovery.' },
  { id: 'aegis', name: 'Aegis Pylon', color: '#ffe040', dur: 25, desc: 'Complete immunity to damage and crowd control.' },
  { id: 'velocity', name: 'Velocity Pylon', color: '#40ff80', dur: 30, desc: '+100% Movement Speed and monster phasing.' },
];

/** Tier Instabilities / Hazards */
export const RIFT_INSTABILITIES = [
  { id: 'volatile', name: 'Volatile Corpses', minTier: 20, desc: 'Slain monsters explode into void shrapnel after 1.5s.' },
  { id: 'molten', name: 'Molten Ground', minTier: 20, desc: 'Elites leave trails of burning lava.' },
  { id: 'chilling', name: 'Chilling Mist', minTier: 40, desc: 'Chilling patches periodically appear, slowing and freezing.' },
  { id: 'arcane_lasers', name: 'Arcane Sentries', minTier: 40, desc: 'Rotating arcane beams appear near elite packs.' },
  { id: 'enrage', name: 'Guardian Frenzy', minTier: 60, desc: 'The Rift Guardian enrages and deals escalating damage.' },
];

export const instabilitiesForTier = (tier) => RIFT_INSTABILITIES.filter((i) => normalizeRiftTier(tier) >= i.minTier);

/**
 * The Grand Piñata reward on Guardian death:
 * Drops consolidated gear, guaranteed Abyssal items at high tiers, and Abyssal Keys for Unbound Exploration.
 */
export function riftReward(tier, first) {
  const t = normalizeRiftTier(tier);
  return {
    abyssal: first ? 1 : clamp(0.15 + 0.025 * t, 0, 1.0),
    items: Math.min(8, 3 + Math.floor(t / 15)),
    sigils: Math.min(5, 2 + Math.floor(t / 20)),
    sigilBonus: 1 + Math.floor(t / 10),
    // Abyssal Keys for Unbound Exploration:
    // Every completed Rift grants a key; high tiers retain the established bonus payout.
    keys: t >= 40 ? 2 : 1,
    marks: Math.max(1, Math.ceil(t / 10)),
  };
}

export const fmtTime = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
