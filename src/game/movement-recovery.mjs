import { developerRecordingActive, recordDeveloperEvent } from '../core/developer-session.js';

/** Clear stale movement/ability locks after the map has safely recovered an actor. */
export function clearInterruptedMovement(entity) {
  if (!entity) return false;
  if (entity.isPlayer && developerRecordingActive()) recordDeveloperEvent('player-attack-interruption-cleared', {
    channel: entity.channel?.constructor?.name || null, castLock: Number(entity.castLock) || 0, queuedCast: !!entity.queued,
    attackTarget: !!entity.attackTarget, moving: !!entity.moving, moveTarget: !!entity.moveTarget,
    lootTarget: !!entity.lootTarget, z: Number(entity.z) || 0,
  }, 'movement-input');
  entity.channel = null;
  entity.castLock = 0;
  entity.castFree = false;
  entity.queued = null;
  entity.z = 0;
  entity.lunge = 0;
  entity.attackAnimT = 0;
  entity.moving = false;
  entity.moveVec = [0, 0];
  entity.moveTarget = null;
  entity.path = null;
  entity.pathFor = null;
  entity.attackTarget = null;
  entity.interact = null;
  entity.lootTarget = null;
  return true;
}
