import { bodyR } from '../world/map.js';

/**
 * Pick a nearby collision-safe point for a newly revealed chest mimic. Prefer a
 * point away from the hero so the transformation cannot overlap or pin them.
 * This runs only once when a mimic chest is opened.
 */
export function findMimicSpawn(map, mimic, actors, chestX, chestY) {
  if (!map || !mimic || !Number.isFinite(chestX) || !Number.isFinite(chestY)) return null;
  const liveActors = (actors || []).filter((actor) => actor && !actor.dead && Number.isFinite(actor.x) && Number.isFinite(actor.y));
  const player = liveActors.find((actor) => actor.isPlayer) || null;
  const away = player ? Math.atan2(chestY - player.y, chestX - player.x) : -Math.PI / 2;
  const radii = [0.82, 1.08, 1.34, 1.6];
  const angleOffsets = [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2,
    (2 * Math.PI) / 3, -(2 * Math.PI) / 3, Math.PI, Math.PI / 6 * 5, -Math.PI / 6 * 5];
  const minPlayerGap = player ? bodyR(mimic) + bodyR(player) + 0.12 : 0;
  const reachable = player && typeof map.movementReachable === 'function'
    ? map.movementReachable([player.x, player.y], bodyR(mimic))
    : null;

  for (const radius of radii) for (const offset of angleOffsets) {
    const x = chestX + Math.cos(away + offset) * radius;
    const y = chestY + Math.sin(away + offset) * radius;
    const free = typeof map.positionFree === 'function' ? map.positionFree(mimic, x, y) : map.circleFree(x, y, bodyR(mimic));
    if (!free) continue;
    if (reachable) {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (!map.inb(tx, ty) || !reachable[map.tileIdx(x, y)]) continue;
    }
    if (player && Math.hypot(x - player.x, y - player.y) < minPlayerGap) continue;
    // Avoid placing the creature inside another living body; terrain collision
    // alone does not account for moving entities.
    if (liveActors.some((actor) => Math.hypot(x - actor.x, y - actor.y) < bodyR(mimic) + bodyR(actor) + 0.04)) continue;
    return { x, y };
  }
  return null;
}
