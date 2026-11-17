// Undo/Redo Command Stack + 2D/Isometric Authoring Tools:
// Brush, Void Eraser, Rect/Ellipse Carve, Flood Fill, Catmull-Rom/Minecart Splines,
// BIOME_ROOMS Auto-Furnisher Stamp, Wall Arch/Door/Torch/Hanging Snappers, Entity/Zone/Mark Placers,
// and Isometric Viewport Gizmo Overlay Renderer.
import { THEMES, TAGS } from '../../src/data/biomerooms.js';
import { torchAtWallSegment } from '../../src/world/dungeon.js';
import { wallHangingAtWallSegment } from '../../src/gfx/wallhangings.js';
import { camera, isoX, isoY, HW, HH } from '../../src/core/view.js';
import { clamp, dist } from '../../src/core/util.js';

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

/** Paint floor/void tiles inside brush footprint `(cx, cy)` with radius `r`. */
export function paintFloorBrush(doc, world, cx, cy, { radius = 1, shape = 'circle', erase = false, variant = 0, autoPave = true }) {
  const { w, h, layers } = doc.grid;
  const rad = Math.max(0.5, radius / 2);
  const x0 = Math.max(1, Math.floor(cx - rad)), x1 = Math.min(w - 2, Math.ceil(cx + rad - 0.01));
  const y0 = Math.max(1, Math.floor(cy - rad)), y1 = Math.min(h - 2, Math.ceil(cy + rad - 0.01));
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
        if (layers.t[i] !== 1 || layers.v[i] !== fv) {
          layers.t[i] = 1;
          layers.v[i] = fv;
          changed = true;
        }
      }
    }
  }
  return changed;
}

/** Paint a rectangle or ellipse region between `p0` and `p1`. */
export function paintShapeRegion(doc, world, p0, p1, { ellipse = false, erase = false, variant = 0, autoPave = true }) {
  const { w, h, layers } = doc.grid;
  const x0 = clamp(Math.floor(Math.min(p0[0], p1[0])), 1, w - 2);
  const x1 = clamp(Math.floor(Math.max(p0[0], p1[0])), 1, w - 2);
  const y0 = clamp(Math.floor(Math.min(p0[1], p1[1])), 1, h - 2);
  const y1 = clamp(Math.floor(Math.max(p0[1], p1[1])), 1, h - 2);
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  const rx = Math.max(0.6, (x1 - x0 + 1) / 2), ry = Math.max(0.6, (y1 - y0 + 1) / 2);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (ellipse && ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 > 1.02) continue;
      const i = y * w + x;
      if (erase) {
        layers.t[i] = 0;
        layers.block[i] = 0;
      } else {
        layers.t[i] = 1;
        layers.v[i] = autoPave ? pickAutoPaveVariant(world, x, y) : variant;
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
export function stampThemedRoom(doc, world, rect, { theme = 'chapel', title = 'Sanctum Chamber' }) {
  const { w, layers } = doc.grid;
  const r = paintShapeRegion(doc, world, [rect.x, rect.y], [rect.x + rect.w - 1, rect.y + rect.h - 1], { autoPave: true });
  const roomObj = {
    id: `r_${Date.now().toString(36)}`,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    title: title || '',
    theme,
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
export function paintSplinePath(doc, world, pts, { width = 3, variant = 0, autoPave = true, kind = 'corridor' }) {
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
      paintFloorBrush(doc, world, x, y, { radius: width, shape: 'circle', variant, autoPave });
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

/** Find topmost selectable object near tile `(tx, ty)`. */
export function pickSceneObjectAt(doc, tx, ty, maxDist = 1.6) {
  const candidates = [];
  const check = (type, obj, x, y, r = maxDist) => {
    const d = dist(tx, ty, x, y);
    if (d <= r) candidates.push({ type, obj, d });
  };

  const [sx, sy] = doc.entities.start || [0, 0];
  check('start', doc.entities.start, sx, sy, 1.3);
  if (doc.entities.townPortal) check('townPortal', doc.entities.townPortal, doc.entities.townPortal[0], doc.entities.townPortal[1], 1.3);
  if (doc.entities.exit) check('exit', doc.entities.exit, doc.entities.exit.x, doc.entities.exit.y, 1.4);

  for (const sp of doc.entities.spawns || []) check('spawn', sp, sp.x, sp.y, 1.5);
  for (const np of doc.entities.npcs || []) check('npc', np, np.x, np.y, 1.5);
  for (const it of doc.entities.interactables || []) check('interactable', it, it.x, it.y, 1.4);
  for (const mk of doc.entities.marks || []) check('mark', mk, mk.x, mk.y, 1.4);
  for (const pr of doc.entities.props || []) check('prop', pr, pr.x, pr.y, 1.2);
  for (const b of doc.architecture.buildings || []) check('building', b, b.x + b.w / 2, b.y + b.h / 2, 2.2);
  for (const sh of doc.grid?.naval?.ships || []) check('naval_ship', sh, sh.x, sh.y, 4.5);

  if (candidates.length) {
    candidates.sort((a, b) => a.d - b.d);
    return candidates[0];
  }

  for (const z of doc.entities.zones || []) {
    if (tx >= z.x && ty >= z.y && tx <= z.x + z.w && ty <= z.y + z.h) {
      return { type: 'zone', obj: z, d: 0 };
    }
  }
  for (const r of doc.architecture.rooms || []) {
    if (tx >= r.x && ty >= r.y && tx <= r.x + r.w && ty <= r.y + r.h) {
      return { type: 'room', obj: r, d: 0 };
    }
  }
  return null;
}

// ------------------------------------------------------------------ Viewport Overlay & Gizmo Renderer
export function drawEditorOverlays(ctx, doc, world, state) {
  const { w, h } = doc.grid;
  ctx.save();
  camera.apply(ctx);

  // 1. Isometric Tile Grid (visible window around camera)
  if (state.showGrid) {
    const [cx, cy] = camera.screenToTile(ctx.canvas.clientWidth / 2, ctx.canvas.clientHeight / 2);
    const span = Math.min(48, Math.ceil(900 / Math.max(0.4, camera.zoom) / 32));
    const x0 = Math.max(0, Math.floor(cx - span)), x1 = Math.min(w, Math.ceil(cx + span));
    const y0 = Math.max(0, Math.floor(cy - span)), y1 = Math.min(h, Math.ceil(cy + span));
    ctx.strokeStyle = 'rgba(216, 178, 106, 0.13)';
    ctx.lineWidth = 1 / Math.max(0.5, camera.zoom);
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
  }

  // Helper to draw an iso quad on ground plane
  const drawIsoRect = (rx, ry, rw, rh, stroke, fill = null, dash = null) => {
    const p0 = [isoX(rx, ry), isoY(rx, ry)];
    const p1 = [isoX(rx + rw, ry), isoY(rx + rw, ry)];
    const p2 = [isoX(rx + rw, ry + rh), isoY(rx + rw, ry + rh)];
    const p3 = [isoX(rx, ry + rh), isoY(rx, ry + rh)];
    ctx.save();
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.lineTo(p3[0], p3[1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.6 / Math.max(0.5, camera.zoom);
    ctx.stroke();
    ctx.restore();
  };

  // 2. Named Rooms & Spatial Trigger Zones
  if (state.layers.cutscenes !== false) {
    for (const r of doc.architecture.rooms || []) {
      drawIsoRect(r.x, r.y, r.w, r.h, 'rgba(216, 178, 106, 0.45)', null, [4, 4]);
      if (r.title) {
        const mx = isoX(r.x + r.w / 2, r.y + r.h / 2), my = isoY(r.x + r.w / 2, r.y + r.h / 2);
        ctx.font = 'bold 11px "Cinzel", serif';
        ctx.fillStyle = '#ffe2a0';
        ctx.textAlign = 'center';
        ctx.fillText(r.title, mx, my - 6);
      }
    }
    for (const z of doc.entities.zones || []) {
      const col = z.color || '#ff9a40';
      drawIsoRect(z.x, z.y, z.w || 6, z.h || 6, col, 'rgba(255, 154, 64, 0.14)', [5, 3]);
      const mx = isoX(z.x + (z.w || 6) / 2, z.y + (z.h || 6) / 2);
      const my = isoY(z.x + (z.w || 6) / 2, z.y + (z.h || 6) / 2);
      ctx.font = 'bold 11px "Alegreya Sans", sans-serif';
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.fillText(`⚡ ${z.name || z.id}`, mx, my);
    }

    // Cutscene Waypoint Marks
    for (const mk of doc.entities.marks || []) {
      const mx = isoX(mk.x, mk.y), my = isoY(mk.x, mk.y);
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

    // Active Cutscene Camera Frustum Gizmo
    if (state.selectedCineStep && state.selectedCineStep.type === 'cam') {
      const st = state.selectedCineStep;
      let fx = camera.x, fy = camera.y;
      if (st.mode === 'tile') {
        fx = isoX(st.x || 0, st.y || 0);
        fy = isoY(st.x || 0, st.y || 0) - 24;
      } else if (st.mode === 'actor') {
        const who = String(st.who || 'hero').replace(/^@/, '');
        if (who === 'hero') {
          fx = isoX(...doc.entities.start); fy = isoY(...doc.entities.start) - 32;
        } else {
          const sp = (doc.entities.spawns || []).find((q) => q.castKey === who) || (doc.entities.npcs || []).find((q) => q.castKey === who);
          if (sp) { fx = isoX(sp.x, sp.y); fy = isoY(sp.x, sp.y) - 32; }
        }
      }
      const zm = Math.max(0.35, Number(st.zoom) || 1.4);
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
  }

  // 3. Player Start & @castKey Badges
  const [sx, sy] = doc.entities.start || [0, 0];
  {
    const px = isoX(sx, sy), py = isoY(sx, sy);
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

  for (const sp of doc.entities.spawns || []) {
    if (!sp.castKey) continue;
    const px = isoX(sp.x, sp.y), py = isoY(sp.x, sp.y);
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#ffd860';
    ctx.textAlign = 'center';
    ctx.fillText(`@${sp.castKey}`, px, py - 54);
  }
  for (const np of doc.entities.npcs || []) {
    if (!np.castKey) continue;
    const px = isoX(np.x, np.y), py = isoY(np.x, np.y);
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#9fd0ff';
    ctx.textAlign = 'center';
    ctx.fillText(`@${np.castKey}`, px, py - 54);
  }

  // 4. Selection Highlight
  if (state.selected) {
    const sel = state.selected;
    let ox = null, oy = null;
    if (sel.type === 'start' || sel.type === 'townPortal') { ox = sel.obj[0]; oy = sel.obj[1]; }
    else if (sel.obj && typeof sel.obj.x === 'number' && sel.type !== 'zone' && sel.type !== 'room') { ox = sel.obj.x; oy = sel.obj.y; }
    if (ox !== null) {
      const px = isoX(ox, oy), py = isoY(ox, oy);
      ctx.strokeStyle = '#ffe2a0';
      ctx.lineWidth = 2.5 / Math.max(0.5, camera.zoom);
      ctx.beginPath();
      ctx.ellipse(px, py, 22, 11, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (sel.type === 'zone' || sel.type === 'room') {
      drawIsoRect(sel.obj.x, sel.obj.y, sel.obj.w || 4, sel.obj.h || 4, '#ffe2a0', 'rgba(255, 226, 160, 0.1)');
    }
  }

  // 5. Drag Preview (Rect / Ellipse / Room / Zone / Spline)
  if (state.dragStart && state.hoverTile && ['rect', 'ellipse', 'roomstamp', 'zone'].includes(state.tool)) {
    const x0 = Math.floor(Math.min(state.dragStart[0], state.hoverTile[0]));
    const y0 = Math.floor(Math.min(state.dragStart[1], state.hoverTile[1]));
    const rw = Math.max(1, Math.ceil(Math.max(state.dragStart[0], state.hoverTile[0])) - x0);
    const rh = Math.max(1, Math.ceil(Math.max(state.dragStart[1], state.hoverTile[1])) - y0);
    drawIsoRect(x0, y0, rw, rh, '#ffe2a0', 'rgba(216, 178, 106, 0.18)');
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
    if (['brush', 'erase', 'sculpt'].includes(state.tool) && state.brushSize > 1) {
      const r = state.brushSize / 2;
      drawIsoRect(Math.floor(hx - r), Math.floor(hy - r), state.brushSize, state.brushSize, state.tool === 'erase' ? '#ff5d4d' : '#d8b26a', 'rgba(216, 178, 106, 0.1)');
    } else {
      drawIsoRect(tx, ty, 1, 1, '#ffe2a0', 'rgba(255, 226, 160, 0.15)');
    }
  }

  ctx.restore();
  void HW; void HH; void world;
}
