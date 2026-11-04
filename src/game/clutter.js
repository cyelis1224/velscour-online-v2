import { Creature } from './creature.js';
import { sfx } from '../core/audio.js';
import { gibs, smoke, burst } from '../gfx/vfx.js';
import { G } from '../state.js';

export class Clutter extends Creature {
  constructor(world, prop) {
    super({
      x: prop.x,
      y: prop.y,
      team: 'enemy',
      maxHp: 1,
      hp: 1,
      r: 0.45,
      speed: 0,
    });
    this.world = world;
    this.prop = prop;
    this.name = prop.spr?.name || 'Clutter';
    this.clutter = true;
    this.noLifeBar = true;
    this.targetable = true;
    this.static = true;
    this.ghost = true; // prevent world.add nudge
    this.xp = 0;
    this.rank = 'normal';
    this.tx = Math.floor(prop.x);
    this.ty = Math.floor(prop.y);
  }

  update(dt) {
    return !this.dead;
  }

  // Rendered in world.props layer in render.js
  draw(ctx) {}

  drawOverhead(ctx, px, py, w) {}

  spriteImage() {
    return null;
  }

  spriteDims(img) {
    const w = (this.prop?.spr?.w || 32) * (this.prop?.k || 1);
    const h = (this.prop?.spr?.h || 32) * (this.prop?.k || 1);
    return [w, h];
  }

  rimColor() {
    return null;
  }

  flashImage() {
    return null;
  }

  die(src) {
    this.dead = true;
    breakClutter(this);
  }
}

export function breakClutter(c) {
  const w = c.world;
  if (!w) return;

  // 1. Remove prop from world.props
  if (w.props && c.prop) {
    const pidx = w.props.indexOf(c.prop);
    if (pidx !== -1) w.props.splice(pidx, 1);
  }

  // 2. Unblock the tile in map
  if (w.map) {
    const tidx = c.ty * w.map.w + c.tx;
    const remaining = w.creatures && w.creatures.some((o) => o !== c && o.clutter && !o.dead && o.tx === c.tx && o.ty === c.ty);
    if (!remaining) {
      if (w.map.block) w.map.block[tidx] = 0;
      if (w.map.clutter) w.map.clutter[tidx] = 0;
      if (w.map.flowFrom) w.map.flowFrom = [-999, -999];
      w.map.blockKey = (w.map.blockKey || 0) + 1;
    }
  }

  // 3. Audio & debris particles
  sfx('thud', 0.85);
  sfx('hit', 0.75);
  gibs(c.x, c.y, 14, '#7a6854', 0.45);
  smoke(c.x, c.y, 8, '#584e44', 4, 1.2);
  burst(c.x, c.y, 8, 'phys', 6, 2.0);

  // 4. Remove from world creatures
  if (w.creatures) {
    const cidx = w.creatures.indexOf(c);
    if (cidx !== -1) w.creatures.splice(cidx, 1);
  }

  // 5. Invalidate autoplay pathing so it immediately walks through
  if (G.autoplay) {
    G.autoplay.navT = 0;
    G.autoplay.path = null;
  }
}
