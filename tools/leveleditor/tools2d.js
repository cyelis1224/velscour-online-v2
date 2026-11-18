// Undo/Redo Command Stack + 2D/Isometric Authoring Tools:
// Brush, Void Eraser, Rect/Ellipse Carve, Flood Fill, Catmull-Rom/Minecart Splines,
// BIOME_ROOMS Auto-Furnisher Stamp, Wall Arch/Door/Torch/Hanging Snappers, Entity/Zone/Mark Placers,
// and Isometric Viewport Gizmo Overlay Renderer.
import { THEMES, TAGS } from '../../src/data/biomerooms.js';
import { torchAtWallSegment } from '../../src/world/dungeon.js';
import { wallHangingAtWallSegment } from '../../src/gfx/wallhangings.js';
import { camera, isoX, isoY, HW, HH } from '../../src/core/view.js';
import { clamp, dist } from '../../src/core/util.js';
import { computeRectFloorLv } from '../../src/world/scenariocodec.js';

export class CommandStack {
  constructor(limit = 60, onChange = null) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.onChange = onChange;
  }
  snapshot(doc, label = 'Edit') {
    const snap = {
      label,
      layers: {
        t: new Uint8Array(doc.grid.layers.t),
        v: new Uint16Array(doc.grid.layers.v),
        block: new Uint8Array(doc.grid.layers.block),
        hgt: new Int16Array(doc.grid.layers.hgt),
        wet: new Uint8Array(doc.grid.layers.wet),
        waterLevel: new Float32Array(doc.grid.layers.waterLevel),
        under: new Int16Array(doc.grid.layers.under),
        flags: new Uint8Array(doc.grid.layers.flags),
        deck: new Uint8Array(doc.grid.layers.deck),
      },
      meta: structuredClone(doc.meta),
      gridMeta: structuredClone({ ...doc.grid, layers: undefined }),
      architecture: structuredClone(doc.architecture),
      entities: structuredClone(doc.entities),
      objectives: structuredClone(doc.objectives),
      triggers: structuredClone(doc.triggers),
      cutscenes: structuredClone(doc.cutscenes),
    };
    this.undoStack.push(snap);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    if (this.onChange) this.onChange();
  }
  applySnap(doc, snap) {
    Object.assign(doc.meta, structuredClone(snap.meta));
    const layers = {
      t: new Uint8Array(snap.layers.t),
      v: new Uint16Array(snap.layers.v),
      block: new Uint8Array(snap.layers.block),
      hgt: new Int16Array(snap.layers.hgt),
      wet: new Uint8Array(snap.layers.wet),
      waterLevel: new Float32Array(snap.layers.waterLevel),
      under: new Int16Array(snap.layers.under),
      flags: new Uint8Array(snap.layers.flags),
      deck: new Uint8Array(snap.layers.deck),
    };
    Object.assign(doc.grid, structuredClone(snap.gridMeta), { layers });
    doc.architecture = structuredClone(snap.architecture);
    doc.entities = structuredClone(snap.entities);
    doc.objectives = structuredClone(snap.objectives);
    doc.triggers = structuredClone(snap.triggers);
    doc.cutscenes = structuredClone(snap.cutscenes);
  }
  captureCurrent(doc) {
    return {
      label: 'State',
      layers: {
        t: new Uint8Array(doc.grid.layers.t),
        v: new Uint16Array(doc.grid.layers.v),
        block: new Uint8Array(doc.grid.layers.block),
        hgt: new Int16Array(doc.grid.layers.hgt),
        wet: new Uint8Array(doc.grid.layers.wet),
        waterLevel: new Float32Array(doc.grid.layers.waterLevel),
        under: new Int16Array(doc.grid.layers.under),
        flags: new Uint8Array(doc.grid.layers.flags),
        deck: new Uint8Array(doc.grid.layers.deck),
      },
      meta: structuredClone(doc.meta),
      gridMeta: structuredClone({ ...doc.grid, layers: undefined }),
      architecture: structuredClone(doc.architecture),
      entities: structuredClone(doc.entities),
      objectives: structuredClone(doc.objectives),
      triggers: structuredClone(doc.triggers),
      cutscenes: structuredClone(doc.cutscenes),
    };
  }
  undo(doc) {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.captureCurrent(doc));
    const prev = this.undoStack.pop();
    this.applySnap(doc, prev);
    if (this.onChange) this.onChange();
    return true;
  }
  redo(doc) {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.captureCurrent(doc));
    const next = this.redoStack.pop();
    this.applySnap(doc, next);
    if (this.onChange) this.onChange();
    return true;
  }
}

/** Pick smart floor variant for Auto-Pave (base seamless + occasional brightness-matched feature). */
export function pickAutoPaveVariant(world, tx, ty) {
  const ts = world?.tileset;
  if (!ts || !ts.bases?.length) return 0;
  const base = ts.bases[0];
  const hash = (((tx * 73856093) ^ (ty * 19349663)) >>> 0) % 100;
  if (hash < 8 && ts.features?.length) {
    const lum = ts.floors[base]?.lum ?? 0.5;
    const match = ts.features.filter((i) => Math.abs((ts.floors[i]?.lum ?? 0.5) - lum) < 0.08);
    const pool = match.length ? match : ts.features;
    return pool[hash % pool.length];
  }
  return base;
}

/** Infer a sensible floor `lv` when carving new walkable floor into void rock on elevated/3D maps. */
export function inferCarveFloorLv(doc, cx, cy, targetLv = null) {
  if (typeof targetLv === 'number' && Number.isFinite(targetLv)) return Math.round(targetLv);
  const { w, h, layers } = doc.grid;
  if (!layers?.hgt) return 0;
  const bx = clamp(Math.floor(cx), 0, w - 1), by = clamp(Math.floor(cy), 0, h - 1);
  if (layers.t[by * w + bx] === 1) return layers.hgt[by * w + bx];
  for (let r = 1; r <= 6; r++) {
    let sum = 0, cnt = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = bx + dx, ny = by + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (layers.t[ni] === 1) { sum += layers.hgt[ni]; cnt++; }
      }
    }
    if (cnt > 0) return Math.round(sum / cnt);
  }
  return 0;
}

/** Paint floor/void tiles inside brush footprint `(cx, cy)` with radius `r`. */
export function paintFloorBrush(doc, world, cx, cy, { radius = 1, shape = 'circle', erase = false, variant = 0, autoPave = true, targetLv = null }) {
  const { w, h, layers } = doc.grid;
  const rad = Math.max(0.5, radius / 2);
  const x0 = Math.max(1, Math.floor(cx - rad)), x1 = Math.min(w - 2, Math.ceil(cx + rad - 0.01));
  const y0 = Math.max(1, Math.floor(cy - rad)), y1 = Math.min(h - 2, Math.ceil(cy + rad - 0.01));
  const hasElev = !!(world?.cave || doc.meta?.category === 'breach' || layers.hgt?.some((v) => v !== 0));
  const carveLv = !erase && hasElev ? inferCarveFloorLv(doc, cx, cy, targetLv) : null;
  let changed = false;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (shape === 'circle' && radius > 1 && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > rad + 0.15) continue;
      const i = y * w + x;
      if (erase) {
        if (layers.t[i] !== 0 || layers.block[i] !== 0) {
          layers.t[i] = 0;
          layers.block[i] = 0;
          changed = true;
        }
      } else {
        const fv = autoPave ? pickAutoPaveVariant(world, x, y) : variant;
        const wasVoid = layers.t[i] === 0 && !layers.wet[i];
        if (layers.t[i] !== 1 || layers.v[i] !== fv || (wasVoid && carveLv !== null && layers.hgt[i] !== carveLv)) {
          layers.t[i] = 1;
          layers.v[i] = fv;
          if (wasVoid && carveLv !== null) {
            layers.hgt[i] = carveLv;
            if (doc.meta?.category === 'breach') {
              layers.under[i] = carveLv - 14;
              layers.flags[i] |= 1;
            }
          }
          changed = true;
        }
      }
    }
  }
  return changed;
}

/** Paint a rectangle or ellipse region between `p0` and `p1`. */
export function paintShapeRegion(doc, world, p0, p1, { ellipse = false, erase = false, variant = 0, autoPave = true, targetLv = null }) {
  const { w, h, layers } = doc.grid;
  const x0 = clamp(Math.floor(Math.min(p0[0], p1[0])), 1, w - 2);
  const x1 = clamp(Math.floor(Math.max(p0[0], p1[0])), 1, w - 2);
  const y0 = clamp(Math.floor(Math.min(p0[1], p1[1])), 1, h - 2);
  const y1 = clamp(Math.floor(Math.max(p0[1], p1[1])), 1, h - 2);
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  const rx = Math.max(0.6, (x1 - x0 + 1) / 2), ry = Math.max(0.6, (y1 - y0 + 1) / 2);
  const hasElev = !!(world?.cave || doc.meta?.category === 'breach' || layers.hgt?.some((v) => v !== 0));
  const carveLv = !erase && hasElev ? inferCarveFloorLv(doc, p0[0], p0[1], targetLv) : null;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (ellipse && ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 > 1.02) continue;
      const i = y * w + x;
      if (erase) {
        layers.t[i] = 0;
        layers.block[i] = 0;
      } else {
        const wasVoid = layers.t[i] === 0 && !layers.wet[i];
        layers.t[i] = 1;
        layers.v[i] = autoPave ? pickAutoPaveVariant(world, x, y) : variant;
        if (wasVoid && carveLv !== null) {
          layers.hgt[i] = carveLv;
          if (doc.meta?.category === 'breach') {
            layers.under[i] = carveLv - 14;
            layers.flags[i] |= 1;
          }
        }
      }
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Contiguous flood fill on `(t, v)`. */
export function floodFillTiles(doc, world, startX, startY, { erase = false, variant = 0, autoPave = false }) {
  const { w, h, layers } = doc.grid;
  const sx = Math.floor(startX), sy = Math.floor(startY);
  if (sx < 1 || sy < 1 || sx >= w - 1 || sy >= h - 1) return false;
  const sIdx = sy * w + sx;
  const targetT = layers.t[sIdx];
  const targetV = layers.v[sIdx];
  const newT = erase ? 0 : 1;
  if (targetT === newT && (erase || (!autoPave && targetV === variant))) return false;

  const seen = new Uint8Array(w * h);
  const q = [sIdx];
  seen[sIdx] = 1;
  let filled = 0;
  while (q.length && filled < 16000) {
    const i = q.pop();
    const x = i % w, y = (i / w) | 0;
    layers.t[i] = newT;
    if (!erase) layers.v[i] = autoPave ? pickAutoPaveVariant(world, x, y) : variant;
    else layers.block[i] = 0;
    filled++;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
      const ni = ny * w + nx;
      if (seen[ni]) continue;
      if (layers.t[ni] === targetT && (targetT === 0 || layers.v[ni] === targetV)) {
        seen[ni] = 1;
        q.push(ni);
      }
    }
  }
  return filled > 0;
}

/** Stamp a themed Room Recipe (`BIOME_ROOMS` / `THEMES`) across rectangle `rect`. */
export function stampThemedRoom(doc, world, rect, { theme = 'chapel', title = 'Sanctum Chamber', targetLv = null }) {
  const { w, h, layers } = doc.grid;
  const r = paintShapeRegion(doc, world, [rect.x, rect.y], [rect.x + rect.w - 1, rect.y + rect.h - 1], { autoPave: true, targetLv });
  const roomObj = {
    id: `r_${Date.now().toString(36)}`,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    title: title || '',
    theme,
    floorLv: computeRectFloorLv(layers, w, h, r.x, r.y, r.w, r.h),
  };
  doc.architecture.rooms.push(roomObj);

  // Auto-furnish props inside the stamped room using THEMES[theme]
  const recipe = THEMES[theme];
  const scat = world?.tileset?.scatter || [];
  if (!recipe || !scat.length || r.w < 5 || r.h < 5) return roomObj;

  const pickByTags = (tagExpr) => {
    for (const tg of tagExpr.split('|')) {
      const matches = tg === 'light'
        ? scat.filter((e) => /brazier|candel|torch|lantern|censer|fire/.test(e.name))
        : scat.filter((e) => TAGS[tg] && TAGS[tg].test(e.name));
      if (matches.length) return matches[Math.floor(Math.random() * matches.length)];
    }
    return null;
  };

  const occupied = new Set();
  const putProp = (tx, ty, spr) => {
    if (!spr || tx <= r.x || ty <= r.y || tx >= r.x + r.w - 1 || ty >= r.y + r.h - 1) return;
    const idx = ty * w + tx;
    if (occupied.has(idx) || !layers.t[idx]) return;
    occupied.add(idx);
    if (spr.block) layers.block[idx] = 1;
    doc.entities.props.push({
      id: `pr_${Date.now().toString(36)}_${occupied.size}`,
      kind: 'scatter',
      name: spr.name,
      x: tx + 0.5,
      y: ty + 0.5,
      z: 0,
      k: world.tileset?.k || 0.4,
      flip: false,
      light: /brazier|candel|torch|lantern|censer/.test(spr.name) ? 3.2 : 0,
      tree: false,
      throne: false,
    });
  };

  const cx = Math.floor(r.x + r.w / 2), cy = Math.floor(r.y + r.h / 2);
  const alongX = r.w >= r.h;
  const at = (a, b) => (alongX ? [r.x + a, cy + b] : [cx + b, r.y + a]);

  for (const [kind, tag, count] of recipe.steps || []) {
    const spr = pickByTags(tag);
    if (!spr) continue;
    if (kind === 'head') {
      const [px, py] = at(1, 0);
      putProp(px, py, spr);
    } else if (kind === 'pairs') {
      const hh = Math.max(1, Math.floor((alongX ? r.h : r.w) / 2) - 1);
      putProp(...at(1, -hh), spr);
      putProp(...at(1, hh), spr);
    } else if (kind === 'corners') {
      putProp(r.x + 1, r.y + 1, spr);
      putProp(r.x + r.w - 2, r.y + 1, spr);
      putProp(r.x + 1, r.y + r.h - 2, spr);
      putProp(r.x + r.w - 2, r.y + r.h - 2, spr);
    } else if (kind === 'aisle') {
      const hh = Math.max(1, Math.floor((alongX ? r.h : r.w) / 2) - 1);
      const len = alongX ? r.w : r.h;
      for (let a = 2; a < len - 1; a += 2) {
        putProp(...at(a, -hh), spr);
        putProp(...at(a, hh), spr);
      }
    } else if (kind === 'walls') {
      const n = Math.min(count || 4, 8);
      for (let k = 0; k < n; k++) {
        const tx = r.x + 1 + ((k * 3) % Math.max(1, r.w - 2));
        const ty = k % 2 ? r.y + 1 : r.y + r.h - 2;
        putProp(tx, ty, spr);
      }
    }
  }
  return roomObj;
}

/** Carve a Catmull-Rom polyline path/corridor/road through `pts`. */
export function paintSplinePath(doc, world, pts, { width = 3, variant = 0, autoPave = true, kind = 'corridor', targetLv = null }) {
  if (!pts || pts.length < 2) return false;
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const cm = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  for (let s = 1; s < P.length - 2; s++) {
    const len = Math.hypot(P[s + 1][0] - P[s][0], P[s + 1][1] - P[s][1]);
    const steps = Math.max(2, Math.ceil(len * 3));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = cm(P[s - 1][0], P[s][0], P[s + 1][0], P[s + 2][0], t);
      const y = cm(P[s - 1][1], P[s][1], P[s + 1][1], P[s + 2][1], t);
      paintFloorBrush(doc, world, x, y, { radius: width, shape: 'circle', variant, autoPave, targetLv });
    }
  }
  doc.grid.splines.push({
    id: `spl_${Date.now().toString(36)}`,
    kind,
    width,
    pts: pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]),
  });
  return true;
}

/** Snap a Wall Torch or Wall Hanging onto the nearest valid back-wall segment in `world.map.segments`. */
export function snapWallMount(doc, world, tx, ty, item) {
  const segs = (world?.map?.segments || []).filter((s) => !s.front);
  if (!segs.length) return false;
  let best = null, bestD = 3.2;
  for (const s of segs) {
    const d = Math.hypot(s.mx - tx, s.my - ty);
    if (d < bestD) { bestD = d; best = s; }
  }
  if (!best) return false;
  if (item.kind === 'torch') {
    doc.architecture.torches.push(torchAtWallSegment(best));
  } else if (item.kind === 'hanging') {
    doc.architecture.wallHangings.push(wallHangingAtWallSegment(best, item.design || 0));
  }
  return true;
}

/** Snap an Arch or Door opening across a hallway/doorway near `(tx, ty)`. */
export function placeOpeningAt(doc, tx, ty, item) {
  const span = item.span || (item.openKind === 'door' ? 2 : 3);
  const axis = doc._lastOpenAxis || 'x';
  const line = Math.round(axis === 'x' ? ty : tx);
  const a0 = Math.floor((axis === 'x' ? tx : ty) - span / 2);
  const opening = {
    id: `op_${Date.now().toString(36)}`,
    axis,
    line,
    a0,
    a1: a0 + span,
    kind: item.openKind || 'arch',
    design: item.design,
    flip: false,
  };
  doc.architecture.openings.push(opening);
  return opening;
}

/** Check whether tile `(x, y)` belongs to the currently visible 3D sub-region (Dunes Exterior vs Tomb, Tower Stair vs Roof). */
export function inActiveEditorRegion(world, x) {
  if (world?.cave?.inRegion) return world.cave.inRegion(x);
  if (world?.tower?.g) return world.tower.roof ? x < world.tower.g.XR : x >= world.tower.g.XR;
  return true;
}

/** Find topmost selectable object near tile `(tx, ty)`. */
export function pickSceneObjectAt(doc, tx, ty, maxDist = 1.6, world = null) {
  const candidates = [];
  const check = (type, obj, x, y, r = maxDist, extra = null) => {
    if (world && !inActiveEditorRegion(world, x)) return;
    const d = dist(tx, ty, x, y);
    if (d <= r) candidates.push({ type, obj, d, ...(extra || {}) });
  };

  const [sx, sy] = doc.entities.start || [0, 0];
  check('start', doc.entities.start, sx, sy, 1.3);
  if (doc.entities.townPortal) check('townPortal', doc.entities.townPortal, doc.entities.townPortal[0], doc.entities.townPortal[1], 1.3);
  if (doc.entities.exit) check('exit', doc.entities.exit, doc.entities.exit.x, doc.entities.exit.y, 1.4);

  for (const psg of doc.entities.passages || []) {
    if (Array.isArray(psg.from)) check('passage', psg, psg.from[0], psg.from[1], 1.6, { end: 'from' });
    if (Array.isArray(psg.to)) check('passage', psg, psg.to[0], psg.to[1], 1.6, { end: 'to' });
  }

  for (const sp of doc.entities.spawns || []) check('spawn', sp, sp.x, sp.y, 1.5);
  for (const np of doc.entities.npcs || []) check('npc', np, np.x, np.y, 1.5);
  for (const it of doc.entities.interactables || []) check('interactable', it, it.x, it.y, 1.4);
  for (const mk of doc.entities.marks || []) check('mark', mk, mk.x, mk.y, 1.4);
  for (const pr of doc.entities.props || []) check('prop', pr, pr.x, pr.y, 1.2);
  for (const b of doc.architecture.buildings || []) check('building', b, b.x + b.w / 2, b.y + b.h / 2, 2.2);
  for (const sh of doc.grid?.naval?.ships || []) check('naval_ship', sh, sh.x, sh.y, 4.5);
  for (const av of doc.grid?.airship?.vessels || []) {
    const shift = (av.lv || 0) / 8;
    check('sky_vessel', av, av.x - shift, av.y - shift, av.kind === 'galleon' ? 7.5 : 4.2);
  }

  if (candidates.length) {
    candidates.sort((a, b) => a.d - b.d);
    return candidates[0];
  }

  for (const z of doc.entities.zones || []) {
    if (world && !inActiveEditorRegion(world, z.x + (z.w || 6) / 2)) continue;
    if (tx >= z.x && ty >= z.y && tx <= z.x + z.w && ty <= z.y + z.h) {
      return { type: 'zone', obj: z, d: 0 };
    }
  }
  for (const r of doc.architecture.rooms || []) {
    if (world && !inActiveEditorRegion(world, r.x + (r.w || 6) / 2)) continue;
    if (tx >= r.x && ty >= r.y && tx <= r.x + r.w && ty <= r.y + r.h) {
      return { type: 'room', obj: r, d: 0 };
    }
  }
  return null;
}

// ------------------------------------------------------------------ Viewport Overlay & Gizmo Renderer
export function drawEditorOverlays(ctx, doc, world, state) {
  const { w, h, layers, traversal } = doc.grid;
  const isWarped = !!world?.tower;
  const isElevated = !isWarped && !!(world?.cave || layers.hgt?.some((v) => v !== 0));
  const sliceActive = !!(state.sliceMode && (isElevated || isWarped));
  const depthLv = state.depthLv ?? 0;
  const sliceBand = state.sliceBand ?? 24;

  // Project `(x, y)` anchored cleanly to an explicit `lv` plane (4 world px per lv across all 2.5D/3D modes)
  const projAtLv = (x, y, lv) => {
    if (isWarped) return [isoX(x, y), isoY(x, y)];
    if (!isElevated) return [(x - y) * HW, (x + y) * HH];
    return [(x - y) * HW, (x + y) * HH - (lv || 0) * 4];
  };

  // Compute walkable-floor corner `lv` at grid vertex `(vx, vy)` without blending adjacent wall rock spikes
  const walkableCornerLv = (vx, vy, fallbackLv) => {
    let sum = 0, cnt = 0;
    for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const tx = vx + ox, ty = vy + oy;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      if (!inActiveEditorRegion(world, tx + 0.5)) continue;
      const ti = ty * w + tx;
      if (layers.t[ti] === 1 || layers.wet[ti] > 0) {
        const lv = layers.hgt[ti];
        if (Math.abs(lv - fallbackLv) <= 10) {
          sum += lv;
          cnt++;
        }
      }
    }
    return cnt > 0 ? sum / cnt : fallbackLv;
  };

  const sliceAlphaForLv = (lv) => {
    if (!sliceActive) return 1;
    const d = Math.abs((lv ?? 0) - depthLv);
    if (d <= sliceBand) return 1;
    if (d <= sliceBand + 12) return 0.35;
    return 0.10;
  };

  ctx.save();
  camera.apply(ctx);

  const [cx, cy] = state.camFocusTile || camera.screenToTile(ctx.canvas.clientWidth / 2, ctx.canvas.clientHeight / 2);

  // 1. Isometric Tile Grid (Flat fast lines on 2D; Walkable-floor-conforming per-tile quads on 3D/Elevated!)
  if (state.showGrid) {
    const span = Math.min(44, Math.ceil(880 / Math.max(0.4, camera.zoom) / 32));
    const x0 = Math.max(0, Math.floor(cx - span)), x1 = Math.min(w, Math.ceil(cx + span));
    const y0 = Math.max(0, Math.floor(cy - span)), y1 = Math.min(h, Math.ceil(cy + span));
    const lw = 1 / Math.max(0.5, camera.zoom);

    if (!isElevated && !isWarped) {
      ctx.strokeStyle = 'rgba(216, 178, 106, 0.13)';
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) {
        ctx.moveTo(isoX(x, y0), isoY(x, y0));
        ctx.lineTo(isoX(x, y1), isoY(x, y1));
      }
      for (let y = y0; y <= y1; y++) {
        ctx.moveTo(isoX(x0, y), isoY(x0, y));
        ctx.lineTo(isoX(x1, y), isoY(x1, y));
      }
      ctx.stroke();
    } else {
      const climb = traversal?.climb ?? 4;
      ctx.lineWidth = lw;
      const inBandPath = new Path2D();
      const dimBandPath = new Path2D();
      const cliffPath = new Path2D();
      let hasIn = false, hasDim = false, hasCliff = false;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (!inActiveEditorRegion(world, x + 0.5)) continue;
          const ti = y * w + x;
          if (!layers.t[ti] && !layers.wet[ti]) continue;
          const flv = layers.hgt[ti];
          const a = sliceAlphaForLv(flv);
          if (a <= 0.12 && sliceActive && Math.abs(flv - depthLv) > sliceBand + 30) continue;

          let p0, p1, p2, p3;
          if (isWarped) {
            p0 = [isoX(x, y), isoY(x, y)];
            p1 = [isoX(x + 1, y), isoY(x + 1, y)];
            p2 = [isoX(x + 1, y + 1), isoY(x + 1, y + 1)];
            p3 = [isoX(x, y + 1), isoY(x, y + 1)];
            if (Math.abs(p0[0]) > 1e6 || Math.abs(p1[0]) > 1e6 || Math.abs(p2[0]) > 1e6 || Math.abs(p3[0]) > 1e6) continue;
          } else {
            p0 = projAtLv(x, y, walkableCornerLv(x, y, flv));
            p1 = projAtLv(x + 1, y, walkableCornerLv(x + 1, y, flv));
            p2 = projAtLv(x + 1, y + 1, walkableCornerLv(x + 1, y + 1, flv));
            p3 = projAtLv(x, y + 1, walkableCornerLv(x, y + 1, flv));
          }

          const target = a >= 0.9 ? inBandPath : dimBandPath;
          if (a >= 0.9) hasIn = true; else hasDim = true;
          target.moveTo(p0[0], p0[1]);
          target.lineTo(p1[0], p1[1]);
          target.lineTo(p2[0], p2[1]);
          target.lineTo(p3[0], p3[1]);
          target.closePath();

          // Highlight cliff / ledge drop edges where step exceeds walkable climb
          if (a >= 0.9 && !isWarped) {
            if (x + 1 < w && layers.t[ti + 1] && Math.abs(layers.hgt[ti + 1] - flv) > climb) {
              cliffPath.moveTo(p1[0], p1[1]); cliffPath.lineTo(p2[0], p2[1]); hasCliff = true;
            }
            if (y + 1 < h && layers.t[ti + w] && Math.abs(layers.hgt[ti + w] - flv) > climb) {
              cliffPath.moveTo(p3[0], p3[1]); cliffPath.lineTo(p2[0], p2[1]); hasCliff = true;
            }
          }
        }
      }

      if (hasDim) {
        ctx.strokeStyle = 'rgba(216, 178, 106, 0.045)';
        ctx.stroke(dimBandPath);
      }
      if (hasIn) {
        ctx.strokeStyle = 'rgba(216, 178, 106, 0.16)';
        ctx.stroke(inBandPath);
      }
      if (hasCliff) {
        ctx.strokeStyle = 'rgba(255, 162, 74, 0.42)';
        ctx.lineWidth = lw * 1.35;
        ctx.stroke(cliffPath);
      }

      // Local Working-Plane Reference Grid around cursor when Depth Lock is on or painting over void
      if (!isWarped && state.hoverTile && (state.lockDepth || ['brush', 'rect', 'ellipse', 'roomstamp', 'sculpt', 'zone'].includes(state.tool))) {
        const [hx, hy] = state.hoverTile;
        const bx = Math.floor(hx), by = Math.floor(hy);
        const ti = clamp(by, 0, h - 1) * w + clamp(bx, 0, w - 1);
        const onVoid = !layers.t[ti] && !layers.wet[ti];
        if (state.lockDepth || onVoid) {
          const refLv = state.lockDepth ? depthLv : inferCarveFloorLv(doc, hx, hy, null);
          const R = 4;
          ctx.save();
          ctx.strokeStyle = state.lockDepth ? 'rgba(79, 205, 185, 0.28)' : 'rgba(255, 226, 160, 0.22)';
          ctx.lineWidth = lw;
          ctx.beginPath();
          for (let gx = bx - R; gx <= bx + R + 1; gx++) {
            const a0 = projAtLv(gx, by - R, refLv), a1 = projAtLv(gx, by + R + 1, refLv);
            ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]);
          }
          for (let gy = by - R; gy <= by + R + 1; gy++) {
            const b0 = projAtLv(bx - R, gy, refLv), b1 = projAtLv(bx + R + 1, gy, refLv);
            ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  // Helper to draw a terrain-flush, non-skewing iso rectangle at `floorLv`
  const drawIsoRect = (rx, ry, rw, rh, stroke, fill = null, dash = null, explicitFloorLv = null, alpha = 1) => {
    const baseLv = explicitFloorLv !== null && explicitFloorLv !== undefined
      ? explicitFloorLv
      : (isElevated ? computeRectFloorLv(layers, w, h, rx, ry, rw, rh) : 0);

    const samplePerimeterPt = (px, py) => {
      if (isWarped) return [isoX(px, py), isoY(px, py)];
      if (!isElevated) return [(px - py) * HW, (px + py) * HH];
      const tx = clamp(Math.floor(px), 0, w - 1), ty = clamp(Math.floor(py), 0, h - 1);
      const ti = ty * w + tx;
      let lv = baseLv;
      if ((layers.t[ti] === 1 || layers.wet[ti] > 0) && Math.abs(layers.hgt[ti] - baseLv) <= 8) {
        lv = walkableCornerLv(Math.round(px), Math.round(py), baseLv);
      }
      return projAtLv(px, py, lv);
    };

    const pts = [];
    const stepsX = Math.max(1, Math.min(24, Math.round(rw)));
    const stepsY = Math.max(1, Math.min(24, Math.round(rh)));
    for (let i = 0; i < stepsX; i++) pts.push(samplePerimeterPt(rx + (rw * i) / stepsX, ry));
    for (let i = 0; i < stepsY; i++) pts.push(samplePerimeterPt(rx + rw, ry + (rh * i) / stepsY));
    for (let i = 0; i < stepsX; i++) pts.push(samplePerimeterPt(rx + rw - (rw * i) / stepsX, ry + rh));
    for (let i = 0; i < stepsY; i++) pts.push(samplePerimeterPt(rx, ry + rh - (rh * i) / stepsY));
    if (pts.some((p) => Math.abs(p[0]) > 1e6 || Math.abs(p[1]) > 1e6)) return null;

    ctx.save();
    ctx.globalAlpha *= alpha;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.6 / Math.max(0.5, camera.zoom);
    ctx.stroke();
    ctx.restore();
    return baseLv;
  };

  // 2. Named Rooms, Spatial Trigger Zones, Passage Teleports & Marks
  if (state.layers.cutscenes !== false) {
    for (const r of doc.architecture.rooms || []) {
      const rcx = r.x + r.w / 2, rcy = r.y + r.h / 2;
      if (!inActiveEditorRegion(world, rcx)) continue;
      const flv = r.floorLv ?? (isElevated ? computeRectFloorLv(layers, w, h, r.x, r.y, r.w, r.h) : 0);
      const a = sliceAlphaForLv(flv);
      if (a <= 0.12) continue;
      const usedLv = drawIsoRect(r.x, r.y, r.w, r.h, 'rgba(216, 178, 106, 0.45)', null, [4, 4], flv, a);
      if (r.title && usedLv !== null) {
        const [mx, my] = projAtLv(rcx, rcy, flv);
        if (Math.abs(mx) < 1e6) {
          ctx.save();
          ctx.globalAlpha *= a;
          ctx.font = 'bold 11px "Cinzel", serif';
          ctx.fillStyle = '#ffe2a0';
          ctx.textAlign = 'center';
          ctx.fillText(isElevated ? `${r.title} (${flv} lv)` : r.title, mx, my - 6);
          ctx.restore();
        }
      }
    }

    for (const z of doc.entities.zones || []) {
      const zw = z.w || 6, zh = z.h || 6;
      const zcx = z.x + zw / 2, zcy = z.y + zh / 2;
      if (!inActiveEditorRegion(world, zcx)) continue;
      const flv = z.floorLv ?? (isElevated ? computeRectFloorLv(layers, w, h, z.x, z.y, zw, zh) : 0);
      const a = sliceAlphaForLv(flv);
      if (a <= 0.12) continue;
      const col = z.color || '#ff9a40';
      const usedLv = drawIsoRect(z.x, z.y, zw, zh, col, 'rgba(255, 154, 64, 0.14)', [5, 3], flv, a);
      if (usedLv !== null) {
        const [mx, my] = projAtLv(zcx, zcy, flv);
        if (Math.abs(mx) < 1e6) {
          ctx.save();
          ctx.globalAlpha *= a;
          ctx.font = 'bold 11px "Alegreya Sans", sans-serif';
          ctx.fillStyle = col;
          ctx.textAlign = 'center';
          ctx.fillText(`⚡ ${z.name || z.id}`, mx, my);
          ctx.restore();
        }
      }
    }

    // Intra-map Passage / Door Links
    for (const psg of doc.entities.passages || []) {
      const col = psg.color || '#ffd060';
      const drawEndpoint = (pt, tag) => {
        if (!Array.isArray(pt) || !inActiveEditorRegion(world, pt[0])) return null;
        const mx = isoX(pt[0], pt[1]), my = isoY(pt[0], pt[1]);
        if (Math.abs(mx) > 1e6) return null;
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2 / Math.max(0.5, camera.zoom);
        ctx.beginPath();
        ctx.ellipse(mx, my, 18, 9, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = 'bold 10.5px "Alegreya Sans", sans-serif';
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        ctx.fillText(`🚪 ${psg.name || psg.id} [${tag}]`, mx, my - 14);
        ctx.restore();
        return [mx, my];
      };
      const pA = drawEndpoint(psg.from, 'IN');
      const pB = drawEndpoint(psg.to, psg.bidirectional ? 'OUT/IN' : 'OUT');
      if (pA && pB) {
        ctx.save();
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.4 / Math.max(0.5, camera.zoom);
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(pA[0], pA[1]);
        ctx.lineTo(pB[0], pB[1]);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Cutscene Waypoint Marks
    for (const mk of doc.entities.marks || []) {
      if (!inActiveEditorRegion(world, mk.x)) continue;
      const mx = isoX(mk.x, mk.y), my = isoY(mk.x, mk.y);
      if (Math.abs(mx) > 1e6) continue;
      ctx.fillStyle = '#b694ff';
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = 'bold 11px "Alegreya Sans", sans-serif';
      ctx.fillStyle = '#decbff';
      ctx.textAlign = 'center';
      ctx.fillText(`📍 ${mk.name || mk.id}`, mx, my - 10);
    }

    // Active Cutscene Keyframe Gizmo (Camera Frustum / Walk Target / Actor Halo)
    if (state.selectedCineStep) {
      const st = state.selectedCineStep;
      const resolveActorTile = (whoRaw) => {
        const who = String(whoRaw || 'hero').replace(/^@/, '');
        if (who === 'hero') return doc.entities.start || [0, 0];
        const sp = (doc.entities.spawns || []).find((q) => q.castKey === who) || (doc.entities.npcs || []).find((q) => q.castKey === who);
        return sp ? [sp.x, sp.y] : null;
      };
      const resolveMarkOrTile = (s) => {
        if (s.markId) {
          const mk = (doc.entities.marks || []).find((m) => m.id === s.markId);
          if (mk) return [mk.x, mk.y];
        }
        return Number.isFinite(s.x) && Number.isFinite(s.y) ? [s.x, s.y] : null;
      };

      if (st.type === 'cam') {
        let fx = camera.x, fy = camera.y;
        if (st.mode === 'tile') {
          const pt = resolveMarkOrTile(st);
          if (pt) { fx = isoX(pt[0], pt[1]); fy = isoY(pt[0], pt[1]) - 24; }
        } else if (st.mode === 'actor' || st.mode === 'return_hero') {
          const pt = resolveActorTile(st.mode === 'return_hero' ? 'hero' : st.who);
          if (pt) { fx = isoX(pt[0], pt[1]); fy = isoY(pt[0], pt[1]) - 32; }
        }
        if (Math.abs(fx) < 1e6) {
          const zm = st.mode === 'return_hero' ? 1.0 : Math.max(0.35, Number(st.zoom) || 1.4);
          const fw = 640 / zm, fh = 360 / zm;
          ctx.save();
          ctx.strokeStyle = '#4fcdb9';
          ctx.lineWidth = 2 / Math.max(0.5, camera.zoom);
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(fx - fw / 2, fy - fh / 2, fw, fh);
          ctx.fillStyle = 'rgba(79, 205, 185, 0.08)';
          ctx.fillRect(fx - fw / 2, fy - fh / 2, fw, fh);
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = '#4fcdb9';
          ctx.textAlign = 'left';
          ctx.fillText(`🎥 CAM (${zm.toFixed(1)}x)`, fx - fw / 2 + 6, fy - fh / 2 + 14);
          ctx.restore();
        }
      } else if (st.type === 'walk' || st.type === 'spawn' || st.type === 'vfx') {
        const pt = st.type === 'vfx' && st.who ? resolveActorTile(st.who) : resolveMarkOrTile(st);
        if (pt && inActiveEditorRegion(world, pt[0])) {
          const gx = isoX(pt[0], pt[1]), gy = isoY(pt[0], pt[1]);
          ctx.save();
          ctx.strokeStyle = st.type === 'walk' ? '#7fd36a' : '#ee9442';
          ctx.lineWidth = 2 / Math.max(0.5, camera.zoom);
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.ellipse(gx, gy, 24, 12, 0, 0, Math.PI * 2);
          ctx.stroke();
          if (st.type === 'walk') {
            const fromPt = resolveActorTile(st.who);
            if (fromPt && inActiveEditorRegion(world, fromPt[0])) {
              const ax = isoX(fromPt[0], fromPt[1]), ay = isoY(fromPt[0], fromPt[1]);
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(gx, gy);
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      }
    }
  }

  // 3. Player Start & @castKey Badges (Region-Clipped)
  const [sx, sy] = doc.entities.start || [0, 0];
  if (inActiveEditorRegion(world, sx)) {
    const px = isoX(sx, sy), py = isoY(sx, sy);
    if (Math.abs(px) < 1e6) {
      ctx.strokeStyle = '#7fd36a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(px, py, 16, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = 'bold 10px "Cinzel", serif';
      ctx.fillStyle = '#a9f5b6';
      ctx.textAlign = 'center';
      ctx.fillText('START', px, py - 14);
    }
  }

  for (const sp of doc.entities.spawns || []) {
    if (!sp.castKey || !inActiveEditorRegion(world, sp.x)) continue;
    const spTi = clamp(Math.floor(sp.y), 0, h - 1) * w + clamp(Math.floor(sp.x), 0, w - 1);
    const a = sliceAlphaForLv(layers.hgt[spTi]);
    if (a <= 0.15) continue;
    const px = isoX(sp.x, sp.y), py = isoY(sp.x, sp.y);
    if (Math.abs(px) > 1e6) continue;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = sp.rank === 'raid' || sp.rank === 'boss' ? '#ffb347' : '#ffd860';
    ctx.textAlign = 'center';
    ctx.fillText(`${sp.rank === 'raid' || sp.rank === 'boss' ? '👑 ' : ''}@${sp.castKey}`, px, py - 54);
    ctx.restore();
  }
  for (const np of doc.entities.npcs || []) {
    if (!np.castKey || !inActiveEditorRegion(world, np.x)) continue;
    const px = isoX(np.x, np.y), py = isoY(np.x, np.y);
    if (Math.abs(px) > 1e6) continue;
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#9fd0ff';
    ctx.textAlign = 'center';
    ctx.fillText(`@${np.castKey}`, px, py - 54);
  }
  for (const av of doc.grid?.airship?.vessels || []) {
    const vx = (av.x - av.y) * HW, vy = (av.x + av.y) * HH - (av.lv || 0) * 4;
    ctx.save();
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = av.startHidden ? '#b694ff' : '#4fcdb9';
    ctx.textAlign = 'center';
    ctx.fillText(`⛵ @${av.castKey || av.id}${av.startHidden ? ' [Hidden until Cine]' : ''}`, vx, vy - (av.kind === 'galleon' ? 115 : 52));
    ctx.restore();
  }

  // 4. Selection Highlight
  if (state.selected) {
    const sel = state.selected;
    let ox = null, oy = null;
    if (sel.type === 'sky_vessel' && sel.obj) {
      const av = sel.obj;
      const vx = (av.x - av.y) * HW, vy = (av.x + av.y) * HH - (av.lv || 0) * 4;
      ctx.save();
      ctx.strokeStyle = '#ffe2a0';
      ctx.lineWidth = 2.5 / Math.max(0.5, camera.zoom);
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.ellipse(vx, vy - 18, av.kind === 'galleon' ? 128 : 54, av.kind === 'galleon' ? 58 : 26, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (sel.type === 'start' || sel.type === 'townPortal') { ox = sel.obj[0]; oy = sel.obj[1]; }
    else if (sel.type === 'passage') {
      const pt = sel.end === 'to' ? sel.obj.to : sel.obj.from;
      if (pt) { ox = pt[0]; oy = pt[1]; }
    } else if (sel.obj && typeof sel.obj.x === 'number' && sel.type !== 'zone' && sel.type !== 'room') {
      ox = sel.obj.x; oy = sel.obj.y;
    }
    if (ox !== null && inActiveEditorRegion(world, ox)) {
      const px = isoX(ox, oy), py = isoY(ox, oy);
      if (Math.abs(px) < 1e6) {
        ctx.strokeStyle = '#ffe2a0';
        ctx.lineWidth = 2.5 / Math.max(0.5, camera.zoom);
        ctx.beginPath();
        ctx.ellipse(px, py, 22, 11, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (sel.type === 'zone' || sel.type === 'room') {
      drawIsoRect(sel.obj.x, sel.obj.y, sel.obj.w || 4, sel.obj.h || 4, '#ffe2a0', 'rgba(255, 226, 160, 0.1)', null, sel.obj.floorLv ?? null);
    }
  }

  // 5. Drag Preview (Rect / Ellipse / Room / Zone / Spline)
  if (state.dragStart && state.hoverTile && ['rect', 'ellipse', 'roomstamp', 'zone'].includes(state.tool)) {
    const x0 = Math.floor(Math.min(state.dragStart[0], state.hoverTile[0]));
    const y0 = Math.floor(Math.min(state.dragStart[1], state.hoverTile[1]));
    const rw = Math.max(1, Math.ceil(Math.max(state.dragStart[0], state.hoverTile[0])) - x0);
    const rh = Math.max(1, Math.ceil(Math.max(state.dragStart[1], state.hoverTile[1])) - y0);
    const prevLv = state.lockDepth ? depthLv : inferCarveFloorLv(doc, state.dragStart[0], state.dragStart[1], null);
    drawIsoRect(x0, y0, rw, rh, '#ffe2a0', 'rgba(216, 178, 106, 0.18)', null, prevLv);
  }
  if (state.splinePts?.length) {
    ctx.strokeStyle = '#4fcdb9';
    ctx.lineWidth = 2.5 / Math.max(0.5, camera.zoom);
    ctx.beginPath();
    state.splinePts.forEach(([x, y], idx) => {
      const px = isoX(x, y), py = isoY(x, y);
      if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    if (state.hoverTile) ctx.lineTo(isoX(...state.hoverTile), isoY(...state.hoverTile));
    ctx.stroke();
  }

  // 6. Hovered Brush / Tile Cursor
  if (state.hoverTile) {
    const [hx, hy] = state.hoverTile;
    const tx = Math.floor(hx), ty = Math.floor(hy);
    const curLv = state.lockDepth ? depthLv : inferCarveFloorLv(doc, hx, hy, null);
    if (['brush', 'erase', 'sculpt'].includes(state.tool) && state.brushSize > 1) {
      const r = state.brushSize / 2;
      drawIsoRect(Math.floor(hx - r), Math.floor(hy - r), state.brushSize, state.brushSize, state.tool === 'erase' ? '#ff5d4d' : '#d8b26a', 'rgba(216, 178, 106, 0.1)', null, curLv);
    } else {
      drawIsoRect(tx, ty, 1, 1, '#ffe2a0', 'rgba(255, 226, 160, 0.15)', null, curLv);
    }
  }

  ctx.restore();
}
