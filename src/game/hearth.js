// The Hearthstone: a third special button beside MADNESS and SMITE. It refills over HEARTH_FILL seconds spent in
// the dungeon (like MADNESS) and, when full, the button (or H) carries the hero straight back to town from
// anywhere in a level — the same as stepping through the level's blue Town Portal, without walking back to it.
// Wiring: game.update -> hearthTick, hud.js shows the button, game.js -> useHearth (H key / button).
import { G } from '../state.js';
import { rand, chance, TAU } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { camera } from '../core/view.js';
import { addEffect, Ring, Column, sparkle, spawn, floatText } from '../gfx/vfx.js';
import { UI } from '../ui/ui.js';

export const HEARTH_FILL = 600; // seconds in the dungeon to refill (10 minutes)
const CHANNEL = 1.6; // seconds of swirling light before the hero is carried home

let channel = null; // { t, world } while the stone is being invoked

/** Meter 0..1; a hero who has never used the stone starts with it full. */
export const hearthOf = (c = G.char) => (c ? (c.hearth ?? 1) : 0);
const inDungeon = () => !!G.world && G.world.kind === 'dungeon' && !!G.player && !G.player.dead;
export const hearthReady = () => !!G.char && hearthOf() >= 1 && inDungeon();
export const hearthChanneling = () => !!channel;
/** Seconds left until the stone is ready again. */
export const hearthSecondsLeft = (c = G.char) => Math.max(0, Math.ceil((1 - hearthOf(c)) * HEARTH_FILL));

/** Fills while the hero is in the dungeon; carries out the channel once it finishes. */
export function hearthTick(dt) {
  const c = G.char;
  if (!c) return;
  if (channel) {
    const p = G.player;
    if (G.world !== channel.world || !p || p.dead) { channel = null; return; } // left the level / died mid-invocation
    channel.t += dt;
    if (chance(dt * 40)) {
      const a = rand(TAU), r = rand(0.4, 1.1);
      spawn({ type: 'glow', x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, z: rand(0, 20), vz: rand(60, 140), life: rand(0.5, 0.9), size: rand(2, 4), size1: 0, color: chance(0.5) ? '#7fd8ff' : '#ffffff', add: true });
    }
    if (channel.t >= CHANNEL) finish();
    return;
  }
  if (inDungeon() && hearthOf(c) < 1) {
    c.hearth = Math.min(1, hearthOf(c) + dt / HEARTH_FILL);
    if (c.hearth >= 1) {
      sfx('holy', 0.4);
      UI.log('Your <b style="color:#7fd8ff">Hearthstone</b> is ready: press HEARTH (H) to return to town from anywhere.', '#9fe4ff');
    }
  }
}

/** The button / H key: begin the trip home. */
export function useHearth() {
  if (channel || !hearthReady()) {
    if (!channel && G.char && G.world?.kind === 'dungeon' && hearthOf() < 1) {
      const s = hearthSecondsLeft();
      UI.log(`The Hearthstone is still cold: ready in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.`, '#8aa8c0');
      sfx('error');
    }
    return false;
  }
  const p = G.player;
  channel = { t: 0, world: G.world };
  G.char.hearth = 0;
  G.smiteArmed = false;
  p.path = null; p.moveTarget = null; p.attackTarget = null;
  addEffect(new Ring(p.x, p.y, 1.4, 0.2, CHANNEL, '#7fd8ff', 4));
  addEffect(new Column(p.x, p.y, '#9fe4ff', 0.45, 26, CHANNEL * 1000));
  floatText(p.x, p.y, 90, 'Hearthstone', '#9fe4ff', 16, { life: 1.6 });
  sfx('portal', 0.8);
  return true;
}

function finish() {
  const p = G.player, w = G.world;
  channel = null;
  if (!p || !w) return;
  addEffect(new Ring(p.x, p.y, 0.2, 3, 0.4, '#ffffff', 6));
  sparkle(p.x, p.y, 30, '#bfeaff', 26, 0.8);
  camera.shake(3);
  sfx('portal');
  // same bookkeeping as the level's Town Portal (game.useTownPortal): the depth is re-forged on return
  if (w.depth) {
    G.char.depth = w.depth;
    if (G.room) G.room.depth = w.depth;
  }
  G.game?.enterTown?.();
}

