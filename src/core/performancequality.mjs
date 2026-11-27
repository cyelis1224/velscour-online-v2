/** Runtime quality policy. Gameplay simulation and combat never read these values. */
const state = { elapsed: 0, frames: 0, poorSeconds: 0, recoveredSeconds: 0, tier: 0, changedAt: -Infinity };

export function performanceTier(settings = {}) {
  if (settings.graphicsPreset === 'extreme') return 2;
  return settings.adaptivePerformance === true ? state.tier : 0;
}

export function particleBudget(touch = false, tier = 0) {
  if (tier >= 2) return touch ? 300 : 700;
  if (tier === 1) return touch ? 700 : 1400;
  return touch ? 1400 : 3000;
}

/** Cosmetic-only shedding. Telegraphs and functional hazard renderers are separate systems. */
export function allowParticleType(type, tier = 0) {
  if (tier >= 1 && type === 'smoke') return false;
  if (tier >= 2 && (type === 'glow' || type === 'flame' || type === 'streak')) return false;
  return true;
}

/**
 * Observe requestAnimationFrame intervals over stable two-second windows. Returns
 * only state transitions; callers perform costly canvas/cache changes on change.
 */
export function observeAdaptivePerformance(frameSeconds, settings = {}, now = 0) {
  if (settings.graphicsPreset === 'extreme' || !Number.isFinite(frameSeconds) || frameSeconds <= 0) {
    const changed = state.tier !== 0;
    state.elapsed = state.frames = state.poorSeconds = state.recoveredSeconds = 0;
    state.tier = 0;
    return { tier: performanceTier(settings), changed, recommend: false, fps: null };
  }

  const dt = Math.min(frameSeconds, 0.5);
  state.elapsed += dt;
  state.frames++;
  if (state.elapsed < 2) return { tier: performanceTier(settings), changed: false, recommend: false, fps: null };

  const fps = state.frames / state.elapsed;
  const target = settings.fpsCap ? Math.min(60, Number(settings.fpsCap) || 60) : 60;
  const desired = fps < target * 0.42 ? 2 : fps < target * 0.78 ? 1 : 0;
  state.elapsed = state.frames = 0;
  state.poorSeconds = fps < 24 ? state.poorSeconds + 2 : 0;
  state.recoveredSeconds = fps >= target * 0.95 ? state.recoveredSeconds + 2 : 0;

  let changed = false;
  if (settings.adaptivePerformance !== true) {
    changed = state.tier !== 0;
    state.tier = 0;
  } else if (now - state.changedAt >= 6000 && desired > state.tier) {
    state.tier = desired;
    state.changedAt = now;
    state.recoveredSeconds = 0;
    changed = true;
  } else if (now - state.changedAt >= 12000 && state.recoveredSeconds >= 15 && state.tier > desired) {
    state.tier = Math.max(desired, state.tier - 1);
    state.changedAt = now;
    state.recoveredSeconds = 0;
    changed = true;
  }
  const recommend = state.poorSeconds >= 6 && settings.performanceRecommendationShown !== true;
  return { tier: performanceTier(settings), changed, recommend, fps };
}

export function resetAdaptivePerformance() {
  state.elapsed = state.frames = state.poorSeconds = state.recoveredSeconds = 0;
  state.tier = 0;
  state.changedAt = -Infinity;
}
