/** True for normal enemies and event creatures explicitly marked hostile to the player. */
export function isPlayerHostile(creature) {
  return !!creature && creature.team !== 'player' && (creature.team === 'enemy' || creature.eventFoe === true);
}

/** A living, visible target the player can select. Scripted untargetable states remain respected. */
export function isPlayerTargetable(creature) {
  return isPlayerHostile(creature) && !creature.dead && !creature.clutter && creature.targetable !== false && creature.alpha !== 0 && !creature.hidden;
}

/** Store the visible, screen-space body bounds used by the shared pointer picker. */
export function setCreatureTargetBounds(creature, bounds, anchor) {
  if (!creature || !bounds || bounds.length !== 4 || !bounds.every(Number.isFinite)) {
    if (creature) creature.targetBox = null;
    return;
  }
  const box = creature.targetBox || (creature.targetBox = [0, 0, 0, 0]);
  box[0] = Math.min(bounds[0], bounds[2]);
  box[1] = Math.min(bounds[1], bounds[3]);
  box[2] = Math.max(bounds[0], bounds[2]);
  box[3] = Math.max(bounds[1], bounds[3]);
  if (anchor && Number.isFinite(anchor[0]) && Number.isFinite(anchor[1])) {
    const at = creature.targetAnchor || (creature.targetAnchor = [0, 0]);
    at[0] = anchor[0]; at[1] = anchor[1];
  }
}

/** Select the living hostile whose actually rendered body contains the pointer. */
export function pickPlayerTarget(creatures, sx, sy) {
  let best = null, bestDistance = Infinity;
  for (const creature of creatures || []) {
    if (!isPlayerTargetable(creature)) continue;
    const box = creature.targetBox || creature.sbox;
    if (!box || box.length !== 4) continue;
    const pad = Math.max(5, Math.min(12, (creature.targetPad || 6)));
    if (sx < box[0] - pad || sx > box[2] + pad || sy < box[1] - pad || sy > box[3] + pad) continue;
    const anchor = creature.targetAnchor || [(box[0] + box[2]) * 0.5, box[3]];
    const dx = anchor[0] - sx, dy = anchor[1] - sy;
    const distance = dx * dx + dy * dy * 0.35;
    if (distance < bestDistance) { bestDistance = distance; best = creature; }
  }
  return best;
}
