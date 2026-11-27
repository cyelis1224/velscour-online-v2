export const GORE_PRESET_VERSION = 3;
export const MAX_CUSTOM_GORE_LIMIT = 1000000;
export const GORE_PERFORMANCE_WARNING_LIMIT = 1000;
export const GORE_DECAL_LIFETIME = 10;
export const GORE_DECAL_FADE_START = 8;

// Bloody and Extreme retain their established limits and emission multipliers. The historical 8,000-decal
// ceiling is assigned to Annihilation; the higher presets increase gore output while remaining bounded.
export const GORE_PRESETS = Object.freeze([
  { name: 'Off', limit: 0, spray: 0, gibs: 0, death: 0 },
  { name: 'Minimal', limit: 25, spray: 0.25, gibs: 0.25, death: 0.25 },
  { name: 'Light', limit: 75, spray: 0.5, gibs: 0.5, death: 0.5 },
  { name: 'Bloody', limit: 150, spray: 1, gibs: 1, death: 1 },
  { name: 'Very Bloody', limit: 250, spray: 1.3, gibs: 1.25, death: 1.2 },
  { name: 'Extreme', limit: 400, spray: 1.6, gibs: 1.5, death: 1.4 },
  { name: 'Carnage', limit: 700, spray: 2, gibs: 2, death: 1.8 },
  { name: 'Massacre', limit: 1200, spray: 2.5, gibs: 2.6, death: 2.3 },
  { name: 'Annihilation', limit: 8000, spray: 3, gibs: 3.2, death: 2.8 },
  { name: 'Unlimited', limit: Infinity, spray: 4, gibs: 4, death: 3.5 },
]);

export function normalizeGorePreset(value) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.max(0, Math.min(GORE_PRESETS.length - 1, n)) : 3;
}

export function gorePreset(settingsOrPreset) {
  const value = typeof settingsOrPreset === 'object' ? settingsOrPreset?.gore : settingsOrPreset;
  return GORE_PRESETS[normalizeGorePreset(value)];
}

export function goreLimit(settings = {}) {
  const preset = normalizeGorePreset(settings.gore);
  if (preset === 0) return 0;
  if (settings.goreCustomEnabled) {
    const custom = Number(settings.goreCustomLimit);
    return Number.isFinite(custom) ? Math.max(1, Math.min(MAX_CUSTOM_GORE_LIMIT, Math.floor(custom))) : GORE_PRESETS[preset].limit;
  }
  return GORE_PRESETS[preset].limit;
}

export function goreMultiplier(kind, settingsOrPreset) {
  const preset = gorePreset(settingsOrPreset);
  return preset[kind] ?? 1;
}

/** Oldest entries are removed first when a setting is lowered. Infinity means no cap. */
export function trimGoreDecals(pool, limit) {
  if (limit <= 0) { const removed = pool.length; pool.length = 0; return removed; }
  if (!Number.isFinite(limit) || pool.length <= limit) return 0;
  const removed = pool.length - limit;
  pool.copyWithin(0, removed);
  pool.length = limit;
  return removed;
}

export function addGoreDecal(pool, decal, limit) {
  if (limit <= 0) return false;
  if (Number.isFinite(limit) && pool.length >= limit) trimGoreDecals(pool, limit - 1);
  pool.push(decal);
  return true;
}

/** Age and compact only cosmetic gore decals; returns the number removed. */
export function updateGoreDecals(pool, dt) {
  let write = 0, removed = 0;
  for (let i = 0; i < pool.length; i++) {
    const decal = pool[i];
    if (decal.grow < 1) decal.grow = Math.min(1, decal.grow + dt * 1.2);
    decal.life -= dt;
    if (decal.life <= 0) { removed++; continue; }
    pool[write++] = decal;
  }
  pool.length = write;
  return removed;
}

/** Gore age is derived from the VFX clock so stationary decals need no per-frame update pass. */
export function goreDecalAge(decal, now) {
  return Math.max(0, now - (Number.isFinite(decal.bornAt) ? decal.bornAt : now));
}

export function goreDecalExpiredAt(decal, now) {
  return goreDecalAge(decal, now) >= GORE_DECAL_LIFETIME;
}

export function goreDecalGrowAt(decal, now) {
  return goreDecalGrowForAge(decal, goreDecalAge(decal, now));
}

export function goreDecalAlphaAt(decal, now) {
  return goreDecalAlphaForAge(decal, goreDecalAge(decal, now));
}

export function goreDecalGrowForAge(decal, age) {
  return Math.min(1, (decal.grow ?? 1) + age * 1.2);
}

export function goreDecalAlphaForAge(decal, age) {
  const fadeDuration = GORE_DECAL_LIFETIME - GORE_DECAL_FADE_START;
  return decal.alpha * (age <= GORE_DECAL_FADE_START ? 1 : Math.max(0, (GORE_DECAL_LIFETIME - age) / fadeDuration));
}

export function goreDecalAlpha(decal) {
  const fadeDuration = GORE_DECAL_LIFETIME - GORE_DECAL_FADE_START;
  return decal.alpha * (decal.life <= fadeDuration ? Math.max(0, decal.life / fadeDuration) : 1);
}

/** Keep a decal until its visible footprint has fully left the viewport. */
export function goreDecalOutsideView(decal, px, py, view, radius) {
  const c = Math.abs(Math.cos(decal.rot || 0)), s = Math.abs(Math.sin(decal.rot || 0));
  const rx = radius * (c + s * 0.5), ry = radius * (s + c * 0.5);
  return px + rx < view.x0 || px - rx > view.x1 || py + ry < view.y0 || py - ry > view.y1;
}
