/** Per-source audio-only coalescing for several valid hits resolved in one update. */
export function createCombatSoundGate(windowSeconds = 0.045) {
  const recentBySource = new WeakMap();
  return (source, cue, nowSeconds) => {
    if (!source || typeof source !== 'object' || !Number.isFinite(nowSeconds)) return true;
    let recent = recentBySource.get(source);
    if (!recent) { recent = new Map(); recentBySource.set(source, recent); }
    const previous = recent.get(cue);
    if (previous != null && nowSeconds >= previous && nowSeconds - previous < windowSeconds) return false;
    recent.set(cue, nowSeconds);
    return true;
  };
}
