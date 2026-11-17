// 2.5D & Live 3D Heightfield Sculpting Brushes, Walkability/Reachability Heatmap,
// Unrolled 2D Plan Canvas Renderer, and Zero-Dependency 3D Orbit Camera Inspector.
import { G } from '../../src/state.js';
import { camera, isoX, isoY, HW, HH, warpMoved } from '../../src/core/view.js';
import { clamp } from '../../src/core/util.js';
import { computeReachabilityMask } from '../../src/world/scenariocodec.js';
import { VZ } from '../../src/world/caverns.js';
import { caveScene } from '../../src/gfx/cave3d.js';
import { dunesScene } from '../../src/gfx/dunes3d.js';
import { seaScene } from '../../src/gfx/seabattle3d.js';

export const SCULPT_MODES = [
  { id: 'raise', label: '↑ Raise' },
  { id: 'lower', label: '↓ Lower' },
  { id: 'plateau', label: '═ Plateau' },
  { id: 'smooth', label: '≈ Smooth' },
  { id: 'ramp', label: '⟋ 2-Pt Ramp' },
  { id: 'relax', label: '✓ Relax Cliffs' },
  { id: 'noise', label: '∿ Roughness' },
  { id: 'water', label: '💧 Water Pool' },
  { id: 'dry', label: '☀ Dry Water' },
  { id: 'waterfall', label: '🌊 Waterfall' },
  { id: 'island', label: '🌌 Void Island' },
];

/**
 * Apply a 2.5D / 3D elevation or water brush at `(cx, cy)` on `doc.grid.layers`.
 * Returns `true` if any layer values changed.
 */
export function applySculptBrush(doc, cx, cy, {
  mode = 'raise',
  radius = 4,
  strength = 2,
  targetLv = 8,
  waterDepth = 1,
  falloff = true,
} = {}) {
  const { w, h, layers, traversal } = doc.grid;
  if (mode === 'waterfall') {
    return placeWaterfallAt(doc, cx, cy, { width: Math.max(2, radius) });
  }

  const rad = Math.max(0.6, radius / 2);
  const x0 = clamp(Math.floor(cx - rad), 1, w - 2);
  const x1 = clamp(Math.ceil(cx + rad), 1, w - 2);
  const y0 = clamp(Math.floor(cy - rad), 1, h - 2);
  const y1 = clamp(Math.ceil(cy + rad), 1, h - 2);
  const LV = VZ / 4;
  let changed = false;

  // Snapshot original hgt for neighborhood filters (smooth / relax)
  const srcHgt = (mode === 'smooth' || mode === 'relax') ? new Int16Array(layers.hgt) : null;
  const climb = traversal?.climb ?? 4;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > rad + 0.15) continue;
      const k = falloff && rad > 1 ? 0.5 * (1 + Math.cos(Math.min(1, d / rad) * Math.PI)) : 1;
      const i = y * w + x;

      if (mode === 'raise' || mode === 'lower') {
        const sign = mode === 'raise' ? 1 : -1;
        const delta = Math.max(1, Math.round(strength * Math.max(0.35, k))) * sign;
        const next = clamp(layers.hgt[i] + delta, -120, 180);
        if (layers.t[i] !== 1 || layers.hgt[i] !== next) {
          layers.t[i] = 1;
          layers.hgt[i] = next;
          if (doc.meta.category === 'breach') {
            layers.under[i] = Math.min(layers.under[i] || (next - 16), next - 8);
            layers.flags[i] |= 1;
          }
          changed = true;
        }
      } else if (mode === 'plateau') {
        const next = clamp(Math.round(targetLv), -120, 180);
        if (layers.t[i] !== 1 || layers.hgt[i] !== next) {
          layers.t[i] = 1;
          layers.hgt[i] = next;
          if (doc.meta.category === 'breach') {
            layers.under[i] = next - 16;
            layers.flags[i] |= 1;
          }
          changed = true;
        }
      } else if (mode === 'smooth') {
        if (!layers.t[i]) continue;
        let sum = 0, cnt = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const ni = (y + oy) * w + (x + ox);
            if (layers.t[ni]) { sum += srcHgt[ni]; cnt++; }
          }
        }
        if (cnt > 0) {
          const avg = Math.round(srcHgt[i] + (sum / cnt - srcHgt[i]) * Math.min(1, 0.65 * k));
          if (layers.hgt[i] !== avg) {
            layers.hgt[i] = avg;
            changed = true;
          }
        }
      } else if (mode === 'relax') {
        if (!layers.t[i]) continue;
        let lo = -Infinity, hi = Infinity;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = (y + oy) * w + (x + ox);
          if (layers.t[ni]) {
            lo = Math.max(lo, srcHgt[ni] - climb);
            hi = Math.min(hi, srcHgt[ni] + climb);
          }
        }
        if (lo <= hi) {
          const next = clamp(srcHgt[i], lo, hi);
          if (layers.hgt[i] !== next) {
            layers.hgt[i] = next;
            changed = true;
          }
        }
      } else if (mode === 'noise') {
        if (!layers.t[i]) continue;
        const hash = (((x * 374761393) ^ (y * 668265263) ^ (Date.now() & 0xff)) >>> 0) % 1000;
        const n = ((hash / 500) - 1) * strength * k;
        const next = clamp(Math.round(layers.hgt[i] + n), -120, 180);
        if (layers.hgt[i] !== next) {
          layers.hgt[i] = next;
          changed = true;
        }
      } else if (mode === 'water') {
        const wd = waterDepth === 2 ? 2 : 1;
        const surf = (layers.hgt[i] / LV) + (wd === 2 ? 0.85 : 0.35);
        layers.t[i] = wd === 2 ? 0 : 1;
        layers.wet[i] = wd;
        layers.waterLevel[i] = Math.round(surf * 100) / 100;
        changed = true;
      } else if (mode === 'dry') {
        if (layers.wet[i] !== 0 || layers.waterLevel[i] !== 0) {
          layers.wet[i] = 0;
          layers.waterLevel[i] = 0;
          layers.t[i] = 1;
          changed = true;
        }
      } else if (mode === 'island') {
        const lv = clamp(Math.round(targetLv), -60, 120);
        const depth = Math.round(10 + (1 - Math.min(1, d / rad)) * 26);
        layers.t[i] = 1;
        layers.block[i] = 0;
        layers.hgt[i] = lv;
        layers.under[i] = lv - depth;
        layers.flags[i] |= 1; // rounded Breach rim
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Carve a walkable linear elevation ramp between `p0` and `p1`, interpolating `hgt` smoothly.
 */
export function applyRampGrade(doc, p0, p1, { width = 3, startLv = null, endLv = null } = {}) {
  const { w, h, layers } = doc.grid;
  const x0 = clamp(Math.floor(p0[0]), 1, w - 2), y0 = clamp(Math.floor(p0[1]), 1, h - 2);
  const x1 = clamp(Math.floor(p1[0]), 1, w - 2), y1 = clamp(Math.floor(p1[1]), 1, h - 2);
  const lv0 = startLv !== null ? startLv : layers.hgt[y0 * w + x0];
  const lv1 = endLv !== null ? endLv : layers.hgt[y1 * w + x1];
  const distSteps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2.5));
  const half = Math.max(0.6, width / 2);

  for (let s = 0; s <= distSteps; s++) {
    const t = s / distSteps;
    const cx = p0[0] + (p1[0] - p0[0]) * t;
    const cy = p0[1] + (p1[1] - p0[1]) * t;
    const lv = Math.round(lv0 + (lv1 - lv0) * t);
    for (let y = Math.max(1, Math.floor(cy - half)); y <= Math.min(h - 2, Math.ceil(cy + half)); y++) {
      for (let x = Math.max(1, Math.floor(cx - half)); x <= Math.min(w - 2, Math.ceil(cx + half)); x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > half + 0.2) continue;
        const i = y * w + x;
        layers.t[i] = 1;
        layers.block[i] = 0;
        layers.hgt[i] = lv;
        layers.flags[i] |= 2; // rampTile
        if (doc.meta.category === 'breach') {
          layers.flags[i] |= 1;
          layers.under[i] = lv - 8;
        }
      }
    }
  }
  return true;
}

/** Add or reposition a 3D waterfall lip at `(tx, ty)` in `doc.grid.heightfield.waterfalls`. */
export function placeWaterfallAt(doc, tx, ty, { width = 4.5 } = {}) {
  const { w, h, layers } = doc.grid;
  const LV = VZ / 4;
  const ix = clamp(Math.floor(tx), 1, w - 2), iy = clamp(Math.floor(ty), 1, h - 2);
  const here = layers.hgt[iy * w + ix] / LV;
  doc.grid.heightfield ||= { subdiv: 2, waterfalls: [], snowLine: 28, cloudSeaY: -6 };
  doc.grid.heightfield.waterfalls ||= [];
  const wf = {
    x: Math.round(tx * 10) / 10,
    y: Math.round(ty * 10) / 10,
    top: Math.round(Math.max(1.2, here + 2.4) * 100) / 100,
    base: Math.round(Math.min(here, 0.4) * 100) / 100,
    w: width,
  };
  if (doc.grid.heightfield.waterfalls.length) doc.grid.heightfield.waterfalls[0] = wf;
  else doc.grid.heightfield.waterfalls.push(wf);
  return true;
}

// ------------------------------------------------------------------ Walkability & BFS Reachability Heatmap
export function drawWalkabilityHeatmap(ctx, doc) {
  const { w, h, layers, traversal } = doc.grid;
  const climb = traversal?.climb ?? 4;
  const drop = traversal?.drop ?? 10;
  const walkStep = traversal?.walkStep ?? 3;
  const reach = computeReachabilityMask(doc);

  const [cx, cy] = camera.screenToTile(G.W / 2, G.H / 2);
  const span = Math.min(44, Math.ceil(850 / Math.max(0.4, camera.zoom) / 32));
  const x0 = Math.max(0, Math.floor(cx - span)), x1 = Math.min(w - 1, Math.ceil(cx + span));
  const y0 = Math.max(0, Math.floor(cy - span)), y1 = Math.min(h - 1, Math.ceil(cy + span));

  ctx.save();
  camera.apply(ctx);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!layers.t[i] && !layers.wet[i]) continue;
      let fill = 'rgba(80, 215, 110, 0.20)'; // smooth walkable
      if (layers.block[i] || layers.wet[i] === 2) {
        fill = 'rgba(220, 60, 50, 0.36)'; // blocked / deep water
      } else if (!reach[i]) {
        fill = 'rgba(210, 75, 225, 0.34)'; // unreachable island/pocket from Start
      } else {
        let maxUp = 0, maxDown = 0;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!layers.t[ni]) continue;
          const d = layers.hgt[ni] - layers.hgt[i];
          if (d > maxUp) maxUp = d;
          if (-d > maxDown) maxDown = -d;
        }
        if (maxUp > climb) fill = 'rgba(220, 60, 50, 0.30)';
        else if (maxUp > walkStep) fill = 'rgba(79, 205, 185, 0.30)';
        else if (maxDown > climb && maxDown <= drop) fill = 'rgba(238, 148, 66, 0.30)';
      }

      const p0x = isoX(x, y), p0y = isoY(x, y);
      const p1x = isoX(x + 1, y), p1y = isoY(x + 1, y);
      const p2x = isoX(x + 1, y + 1), p2y = isoY(x + 1, y + 1);
      const p3x = isoX(x, y + 1), p3y = isoY(x, y + 1);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(p0x, p0y);
      ctx.lineTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.lineTo(p3x, p3y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ 2D Unrolled / Plan Grid Viewport
export class Plan2DView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cx = 28;
    this.cy = 28;
    this.ppu = 9; // pixels per tile
  }

  fitToDoc(doc) {
    if (!doc) return;
    const cw = Math.max(200, this.canvas.clientWidth || 420);
    const ch = Math.max(200, this.canvas.clientHeight || 420);
    this.cx = doc.grid.w / 2;
    this.cy = doc.grid.h / 2;
    this.ppu = clamp(Math.min((cw - 24) / doc.grid.w, (ch - 24) / doc.grid.h), 0.95, 24);
  }

  screenToTile(sx, sy) {
    const cw = this.canvas.clientWidth || 400;
    const ch = this.canvas.clientHeight || 400;
    return [
      (sx - cw / 2) / this.ppu + this.cx,
      (sy - ch / 2) / this.ppu + this.cy,
    ];
  }

  tileToScreen(tx, ty) {
    const cw = this.canvas.clientWidth || 400;
    const ch = this.canvas.clientHeight || 400;
    return [
      (tx - this.cx) * this.ppu + cw / 2,
      (ty - this.cy) * this.ppu + ch / 2,
    ];
  }

  render(doc, world, state) {
    const cv = this.canvas;
    if (!cv || cv.offsetParent === null || !doc) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = cv.clientWidth || 400, ch = cv.clientHeight || 400;
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#080504';
    ctx.fillRect(0, 0, cw, ch);

    const { w, h, layers } = doc.grid;
    const ppu = this.ppu;
    const [ox, oy] = this.tileToScreen(0, 0);

    // Map bounds frame
    ctx.strokeStyle = '#36261a';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, w * ppu, h * ppu);

    const x0 = clamp(Math.floor((0 - ox) / ppu), 0, w - 1);
    const x1 = clamp(Math.ceil((cw - ox) / ppu), 0, w - 1);
    const y0 = clamp(Math.floor((0 - oy) / ppu), 0, h - 1);
    const y1 = clamp(Math.ceil((ch - oy) / ppu), 0, h - 1);

    const cell = Math.max(1, ppu - (ppu >= 7 ? 0.5 : 0));
    for (let y = y0; y <= y1; y++) {
      const sy = oy + y * ppu;
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        const t = layers.t[i], wet = layers.wet[i];
        if (!t && !wet) continue;
        if (wet === 2) ctx.fillStyle = '#1b4f8c';
        else if (wet === 1) ctx.fillStyle = '#3179a6';
        else if (layers.block[i]) ctx.fillStyle = '#6c2e24';
        else {
          const lv = layers.hgt[i];
          const shade = clamp(92 + lv * 2.1 + (layers.v[i] % 4) * 6, 42, 205) | 0;
          ctx.fillStyle = `rgb(${shade}, ${Math.round(shade * 0.86)}, ${Math.round(shade * 0.68)})`;
        }
        ctx.fillRect(ox + x * ppu, sy, cell, cell);
      }
    }

    // Special structural guides for Serpentine Tower & Dual Dunes
    if (doc.meta.category === '3d_tower' && world?.tower?.g) {
      const g = world.tower.g;
      const rx = ox + g.XR * ppu;
      ctx.strokeStyle = '#4fcdb9';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(rx, oy); ctx.lineTo(rx, oy + h * ppu); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold 11px "Alegreya Sans", sans-serif';
      ctx.fillStyle = '#4fcdb9';
      ctx.fillText('← ROOF ARENA', ox + 6, oy + 14);
      ctx.fillText('UNROLLED HELIX STAIR STRIP →', rx + 8, oy + 14);
      // Turn markers along the unrolled stair strip
      const turnSpan = Math.PI * 2 * g.rc;
      for (let k = 1; k <= Math.floor(g.v.turns || 3); k++) {
        const tx = g.X1 - k * turnSpan;
        if (tx > g.XT) {
          const sx = ox + tx * ppu;
          ctx.strokeStyle = 'rgba(216, 178, 106, 0.35)';
          ctx.beginPath(); ctx.moveTo(sx, oy + g.YR * ppu); ctx.lineTo(sx, oy + (g.YR + g.w) * ppu); ctx.stroke();
          ctx.fillStyle = '#d8b26a';
          ctx.fillText(`Turn ${k}`, sx + 3, oy + g.YR * ppu - 4);
        }
      }
    } else if (doc.meta.category === '3d_dunes' && doc.grid.dunes) {
      const d = doc.grid.dunes;
      const sxE = ox + d.extW * ppu, sxI = ox + d.oxi * ppu;
      ctx.strokeStyle = '#ee9442';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(ox, oy, d.extW * ppu, h * ppu);
      ctx.strokeRect(sxI, oy, (w - d.oxi) * ppu, h * ppu);
      ctx.setLineDash([]);
      ctx.font = 'bold 11px "Alegreya Sans", sans-serif';
      ctx.fillStyle = '#ffe2a0';
      ctx.fillText('EXTERIOR DUNES & PYRAMID', ox + 6, oy + 14);
      ctx.fillText('INTERIOR SPIRALING TOMB', sxI + 6, oy + 14);
      void sxE;
    }

    // Zones & Rooms
    for (const z of doc.entities.zones || []) {
      ctx.strokeStyle = z.color || '#ff9a40';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + z.x * ppu, oy + z.y * ppu, (z.w || 4) * ppu, (z.h || 4) * ppu);
    }

    // Entities dots
    const dot = (tx, ty, col, r = 4) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(ox + tx * ppu, oy + ty * ppu, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const sp of doc.entities.spawns || []) dot(sp.x, sp.y, sp.rank === 'boss' || sp.rank === 'raid' ? '#ff9a2e' : '#e04838', sp.rank === 'boss' ? 4.5 : 3);
    for (const np of doc.entities.npcs || []) dot(np.x, np.y, '#9fd0ff', 3.5);
    if (doc.entities.start) dot(doc.entities.start[0], doc.entities.start[1], '#7fd36a', 5);
    if (doc.entities.exit) dot(doc.entities.exit.x, doc.entities.exit.y, '#40a0ff', 5);

    // Hover cursor
    if (state.hoverTile) {
      const [hx, hy] = state.hoverTile;
      ctx.strokeStyle = '#ffe2a0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + Math.floor(hx) * ppu, oy + Math.floor(hy) * ppu, ppu, ppu);
    }
  }
}

// ------------------------------------------------------------------ Zero-Dependency 3D Orbit Turntable Controller
export class Orbit3DController {
  constructor() {
    this.enabled = false;
    this.yaw = 0;
    this.pitch = 0;
    this.towerHeightOffset = 0;
  }

  toggle(world, force) {
    this.enabled = force !== undefined ? !!force : !this.enabled;
    if (!this.enabled) this.reset(world);
    return this.enabled;
  }

  reset(world) {
    this.yaw = 0;
    this.pitch = 0;
    this.towerHeightOffset = 0;
    for (const fn of [caveScene, dunesScene, seaScene]) {
      const s = fn();
      if (s?.scene) s.scene.rotation.set(0, 0, 0);
    }
    if (world?.tower) warpMoved();
  }

  rotateByPixels(dx, dy, world) {
    if (!this.enabled || !world) return;
    if (world.tower) {
      world.tower.alpha -= dx * 0.008;
      world.tower.focus[1] = clamp((world.tower.focus[1] || 0) + dy * 0.08, -4, world.tower.g.roofZ + 6);
      warpMoved();
      return;
    }
    this.yaw += dx * 0.007;
    this.pitch = clamp(this.pitch + dy * 0.005, -0.45, 0.55);
    for (const fn of [caveScene, dunesScene, seaScene]) {
      const s = fn();
      if (s?.scene) {
        s.scene.rotation.y = this.yaw;
        s.scene.rotation.x = this.pitch;
      }
    }
  }
}
