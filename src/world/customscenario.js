// Runtime loader & live 2D/2.5D/3D World builder for authored .velscen.json scenarios.
// Shared by both Velscour Studio (live WYSIWYG viewport & F5 playtest) and the main game (Skull menu,
// biome rotation pools, pinned campaign depths, and co-op rooms).
import { G } from '../state.js';
import { TileMap } from './map.js';
import { World } from '../game/world.js';
import { RNG, clamp } from '../core/util.js';
import { camera, setElevation, setWarp, warpMoved, HW, HH, isoX, isoY } from '../core/view.js';
import { loadBiomeArt, biomeTileSet, mixedTileSet, keepTileSets, A } from '../core/assets.js';
import { loadArtFor } from '../core/enemyart.js';
import { TOWN_BIOME, ACT2_TOWN_BIOME } from '../data/biomes.js';
import { SWAPS, rollLooks } from '../data/bestiary.js';
import { TOWNSFOLK, ANIMALS } from '../data/townsfolk.js';
import { VENDORS, makeTownTiles, townObject } from './town.js';
import { overworldObject } from '../gfx/overworldart.js';
import { seaOfSandFloorTiles, seaOfSandObject, loadSeaOfSandPack } from '../gfx/seaofsand.js';
import { castleFloorTiles, castleObject, loadCastlePack } from '../gfx/castle.js';
import { loadDarkForestTrees } from '../gfx/darkforest.js';
import { loadBaked } from '../gfx/castle3dart.js';
import { loadVelscourThrone, throneSprite, THRONE_ART } from '../gfx/velscourthrone.js';
import { useTerrain, HS } from '../gfx/terrain.js';
import { dropBakes, propReach, preloadTownSheets } from '../game/render.js';
import { makeMonster } from '../game/monster.js';
import { makeRaidBoss, RAID_BOSSES } from '../game/raid.js';
import { makeFolk } from '../game/folk.js';
import { depthLevel } from '../data/depth.js';
import { rollTreasureChest } from '../data/treasurechests.js';
import { dropChest } from '../game/loot.js';
import { sfx } from '../core/audio.js';
import { sparkle, floatText } from '../gfx/vfx.js';
import { deserializeScenarioDoc, resolveBiome } from './scenariocodec.js';
import { createScenarioDirector } from '../game/cutscenerunner.js';

// 3D & vehicle subsystems
import { VZ, CAVE_S, CAVE_VARIANTS, vnoise } from './caverns.js';
import { loadCave3D, buildCave3D, drawCave3D, tickCave3D, disposeCave3D, caveSprite } from '../gfx/cave3d.js';
import { TOWER_VARIANTS, towerGeo, CUT_N, CUT_C, upCut } from './tower.js';
import { loadTower3D, buildTower3D, drawTower3D, drawTowerFront, tickTower3D, disposeTower3D } from '../gfx/tower3d.js';
import { buildField, fieldLevels, LV as ALP_LV } from './alpine.js';
import { loadAlpine3D, disposeAlpine3D } from '../gfx/alpine3d.js';
import { alpineHook } from '../game/alpine.js';
import { DUNE_VARIANTS } from '../data/dunes.js';
import { loadDunes3D, buildDunes3D, drawDunes3D, tickDunes3D, disposeDunes3D, duneSprite } from '../gfx/dunes3d.js';
import { applyDeck, joinDecks, mapChanged as seaMapChanged, SEA_LV } from './seaship.js';
import { loadSea3D, loadFleet, buildSea3D, spawnShip as spawnSeaShip, bakeDeck, seaPlank, tickSea3D, drawSea3D, disposeSea3D } from '../gfx/seabattle3d.js';
import { SKY_VARIANTS } from '../data/skybattle.js';
import { warmSky } from '../gfx/skyship.js';
import { loadTrain3D, buildTrain3D, tickTrain3D, drawTrain3D, trainCutaway, disposeTrain3D } from '../gfx/ghosttrain3d.js';

let cachedIndex = null;
const cachedDocs = new Map();

export async function loadScenarioIndex(force = false) {
  if (cachedIndex && !force) return cachedIndex;
  try {
    const res = await fetch('assets/scenarios/index.json', { cache: 'no-cache' });
    if (!res.ok) return (cachedIndex = { version: 1, scenarios: [] });
    cachedIndex = await res.json();
    cachedIndex.scenarios ||= [];
    return cachedIndex;
  } catch {
    return (cachedIndex = { version: 1, scenarios: [] });
  }
}

export async function fetchScenarioDoc(id, force = false) {
  if (!force && cachedDocs.has(id)) return deserializeScenarioDoc(cachedDocs.get(id));
  const idx = await loadScenarioIndex(force);
  const entry = idx.scenarios.find((s) => s.id === id);
  const path = entry?.file || `assets/scenarios/${id}.velscen.json`;
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load scenario "${id}" (${res.status})`);
  const raw = await res.json();
  cachedDocs.set(id, raw);
  return deserializeScenarioDoc(raw);
}

/** Option A publish resolution: pinned campaign depth first, then biome rotation pool. */
export async function resolvePublishedScenarioForDepth(depth, biomeId, rnd = Math.random) {
  const idx = await loadScenarioIndex();
  if (!idx.scenarios.length) return null;
  const pinned = idx.scenarios.find((s) => s.publish?.pinnedDepth === depth);
  if (pinned) return pinned;
  const pool = idx.scenarios.filter((s) => s.publish?.campaignPool && s.biomeId === biomeId);
  if (pool.length && rnd() < 0.35) {
    return pool[Math.floor(rnd() * pool.length)];
  }
  return null;
}

export async function listSkullScenarios(force = false) {
  const idx = await loadScenarioIndex(force);
  return (idx.scenarios || []).filter((s) => s.publish?.skullPortal !== false);
}

export function disposeAll3DScenes() {
  try { disposeCave3D(); } catch {}
  try { disposeTower3D(); } catch {}
  try { disposeAlpine3D(); } catch {}
  try { disposeDunes3D(); } catch {}
  try { disposeSea3D(); } catch {}
  try { disposeTrain3D(); } catch {}
  setElevation(null, null);
  setWarp(null, null);
}

/** Preload all 2D packs, 3D textures/models, and monster sprite sheets required by `doc`. */
export async function loadCustomScenarioArt(doc) {
  const cat = doc.meta?.category || 'dungeon';
  const biome = resolveBiome(doc.meta?.biomeId);
  const mix = doc.meta?.mixBiomeId ? resolveBiome(doc.meta.mixBiomeId) : null;
  const jobs = [loadBiomeArt(biome)];
  if (mix) jobs.push(loadBiomeArt(mix));

  if (biome.id === 'castle' || doc.meta?.biomeId === 'endless_siege') {
    jobs.push(loadCastlePack().catch(() => {}), loadDarkForestTrees().catch(() => {}));
  }
  if (biome.id === 'dark_forest') jobs.push(loadDarkForestTrees().catch(() => {}));
  if (biome.id === 'sea_of_sand' || cat === '3d_dunes') jobs.push(loadSeaOfSandPack().catch(() => {}));
  if (biome.id === 'throne' || (doc.entities?.props || []).some((p) => p.throne)) {
    jobs.push(loadVelscourThrone().catch(() => {}));
  }

  if (cat === '3d_caverns') {
    const vi = Math.max(0, CAVE_VARIANTS.findIndex((v) => v.id === doc.meta?.variantId));
    jobs.push(loadCave3D(vi));
  } else if (cat === '3d_tower') {
    jobs.push(loadTower3D());
  } else if (cat === '3d_alpine') {
    jobs.push(loadBiomeArt(resolveBiome('snowy_summit')), loadAlpine3D());
  } else if (cat === '3d_dunes') {
    jobs.push(loadDunes3D());
  } else if (cat === 'naval') {
    const shipKinds = (doc.grid?.naval?.ships || []).map((s) => s.kind).filter(Boolean);
    jobs.push(loadSea3D(), loadFleet(['longboat', 'cutter', 'brig', ...shipKinds]));
  } else if (cat === 'airship') {
    jobs.push(loadBaked('assets/tiles/skyship/'));
  } else if (cat === '3d_train') {
    jobs.push(loadTrain3D());
  }

  const folkIds = (doc.entities?.npcs || []).map((n) => n.spriteId).filter(Boolean);
  if (folkIds.length) jobs.push(preloadTownSheets(folkIds));

  const artIds = (doc.entities?.spawns || []).map((s) => s.art).filter(Boolean);
  if (artIds.length) jobs.push(loadArtFor(artIds));

  await Promise.all(jobs);
}

// ------------------------------------------------------------------ 3D Field Compilers from Editable Doc Layers

/** Compile a Cave3D field (`cv`) directly from `doc.grid` layers so sculpted caves render live in cave3d.js! */
export function compileCaveFieldFromDoc(doc) {
  const { w: W, h: H, layers, traversal } = doc.grid;
  const v = CAVE_VARIANTS.find((q) => q.id === doc.meta?.variantId) || CAVE_VARIANTS[0];
  const S = CAVE_S; // 2 vertices per tile
  const VW = W * S + 1, VH = H * S + 1, NV = VW * VH;
  const LV = VZ / 4;
  const KS = 16 / VZ;

  const hv = new Float32Array(NV);
  const ceil = new Float32Array(NV);
  const mat = new Uint8Array(NV * 4);
  const vd = new Float32Array(NV).fill(1e9);
  const cls = new Uint8Array(NV);
  const surf = new Float32Array(NV).fill(NaN);
  const lvl = new Float32Array(W * H).fill(NaN);

  for (let i = 0; i < W * H; i++) {
    if (layers.wet[i]) lvl[i] = layers.waterLevel[i] || (layers.hgt[i] / LV + 0.35);
  }

  const isOpen = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && (layers.t[ty * W + tx] === 1 || layers.wet[ty * W + tx] > 0);
  const tileH = (tx, ty) => {
    const cx = clamp(tx, 0, W - 1), cy = clamp(ty, 0, H - 1);
    return layers.hgt[cy * W + cx] / LV;
  };

  const sm = (traversal?.smoothMax ?? 3) / LV;
  const nh = new Float32Array(NV);
  for (let j = 0; j < VH; j++) {
    for (let i = 0; i < VW; i++) {
      const u = i / S, vv = j / S, k = j * VW + i;
      const tx = Math.min(W - 1, Math.floor(u)), ty = Math.min(H - 1, Math.floor(vv));
      const open = isOpen(tx, ty) || isOpen(Math.floor(u - 0.01), Math.floor(vv - 0.01));
      if (open) {
        const ti = ty * W + tx;
        cls[k] = layers.wet[ti] === 2 ? 2 : 1;
        const h0 = tileH(tx, ty);
        const cx = Math.floor(u - 0.5), cy = Math.floor(vv - 0.5), fx = u - 0.5 - cx, fy = vv - 0.5 - cy;
        const val = (x, y) => {
          if (!isOpen(x, y)) return h0;
          const th = tileH(x, y);
          return Math.abs(th - h0) <= sm ? th : h0;
        };
        hv[k] = (val(cx, cy) * (1 - fx) + val(cx + 1, cy) * fx) * (1 - fy) + (val(cx, cy + 1) * (1 - fx) + val(cx + 1, cy + 1) * fx) * fy;
        if (layers.wet[ti]) surf[k] = lvl[ti];
        vd[k] = 0;
        nh[k] = hv[k];
      }
    }
  }

  // Two-pass chamfer distance from floor/water into surrounding cavern rock
  const da = 1 / S, db = Math.SQRT2 / S;
  const relax = (k, n, c) => { if (vd[n] + c < vd[k]) { vd[k] = vd[n] + c; nh[k] = nh[n]; } };
  for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) {
    const k = j * VW + i;
    if (i > 0) relax(k, k - 1, da);
    if (j > 0) { relax(k, k - VW, da); if (i > 0) relax(k, k - VW - 1, db); if (i < VW - 1) relax(k, k - VW + 1, db); }
  }
  for (let j = VH - 1; j >= 0; j--) for (let i = VW - 1; i >= 0; i--) {
    const k = j * VW + i;
    if (i < VW - 1) relax(k, k + 1, da);
    if (j < VH - 1) { relax(k, k + VW, da); if (i < VW - 1) relax(k, k + VW + 1, db); if (i > 0) relax(k, k + VW - 1, db); }
  }

  for (let k = 0; k < NV; k++) {
    const u = (k % VW) / S, vv = ((k / VW) | 0) / S;
    const d = vd[k] > 1e8 ? 10 : vd[k];
    if (!cls[k]) {
      const rise = Math.min(6.5, d * 2.6 + (vnoise(u * 0.45, vv * 0.45, 17) - 0.5) * 1.1);
      hv[k] = (nh[k] || 0) + rise;
    }
    ceil[k] = (nh[k] || hv[k]) + 5.8;
    const tx = clamp(Math.floor(u), 0, W - 1), ty = clamp(Math.floor(vv), 0, H - 1), ti = ty * W + tx;
    const floorMix = (layers.v[ti] % 2) * 255;
    const wallMix = Math.round(vnoise(u * 0.25, vv * 0.25, 31) * 255);
    const wetByte = layers.wet[ti] ? 220 : Math.round(clamp(1 - d / 2, 0, 1) * 40);
    const ao = cls[k] ? Math.round(clamp(vd[k] === 0 ? 220 : 255, 160, 255)) : Math.round(clamp(230 - d * 35, 90, 230));
    mat[k * 4] = floorMix;
    mat[k * 4 + 1] = wallMix;
    mat[k * 4 + 2] = wetByte;
    mat[k * 4 + 3] = ao;
  }

  // LOS rock cap so foreground walls never hide walkable cavern floor behind them
  if (traversal?.losCap !== false) {
    const NC = VW + VH, M = new Float32Array(NC).fill(1e9);
    for (let dsum = 0; dsum < VW + VH - 1; dsum++) {
      const iA = Math.max(0, dsum - (VH - 1)), iB = Math.min(VW - 1, dsum), dv = dsum / S;
      for (let i = iA; i <= iB; i++) {
        const j = dsum - i, k = j * VW + i;
        if (cls[k]) continue;
        const c = i - j + VH;
        let m = 1e9;
        for (let o = -2; o <= 2; o++) { const q = c + o; if (q >= 0 && q < NC && M[q] < m) m = M[q]; }
        if (m < 1e8) {
          const lim = m + (dv - 0.35) * KS;
          if (hv[k] > lim) hv[k] = lim;
        }
      }
      for (let i = iA; i <= iB; i++) {
        const j = dsum - i, k = j * VW + i;
        if (!cls[k]) continue;
        const c = i - j + VH, val = hv[k] - dv * KS;
        if (val < M[c]) M[c] = val;
      }
    }
  }

  const H2 = (x, y) => {
    const fx = clamp(x * S, 0, VW - 1.001), fy = clamp(y * S, 0, VH - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, t = fy - j, k = j * VW + i;
    return (hv[k] * (1 - u) + hv[k + 1] * u) * (1 - t) + (hv[k + VW] * (1 - u) + hv[k + VW + 1] * u) * t;
  };

  const wf = (doc.grid?.heightfield?.waterfalls || [])[0] || { x: W / 2, y: H / 3, top: 3.2, base: 0.2, w: 4 };
  const torches3d = (doc.architecture?.torches || []).map((tc) => ({
    x: tc.x,
    y: tc.y,
    h: H2(tc.x, tc.y) + 1.1,
    nx: 0.7,
    ny: 0.7,
    stand: true,
  }));

  return {
    W, H, VW, VH, hv, ceil, mat, vd, cls, surf, lvl, H2,
    v,
    seed: 1337,
    wallStal: [],
    torches: torches3d,
    river: [[wf.x - 2, wf.y - 2], [wf.x, wf.y]],
    plunge: [wf.x + 1, wf.y + 1],
    lip: [wf.x, wf.y],
    HP: wf.top ?? 3.2,
    WL: wf.base ?? 0.2,
    lake: { x: wf.x + 2, y: wf.y + 4, A: 6 },
    shaft: { x: -200, y: -200, pool: 0 },
    notchIn: [-200, -200],
    mouth: [-200, -200],
    mouthDir: [1, 0],
    mouthH: 0,
  };
}

/** Compile a Dunes3D field (`dv`) directly from `doc.grid` layers. */
export function compileDunesFieldFromDoc(doc) {
  const { w: W, h: H, layers, dunes } = doc.grid;
  const v = DUNE_VARIANTS.find((q) => q.id === doc.meta?.variantId) || DUNE_VARIANTS[0];
  const E = dunes?.extW || Math.min(W, 172);
  const OXI = dunes?.oxi || Math.min(W - 32, E + 26);
  const S = CAVE_S;
  const VW = W * S + 1, VH = H * S + 1, NV = VW * VH;
  const LV = VZ / 4;
  const hv = new Float32Array(NV);
  const ceil = new Float32Array(NV).fill(12);
  const mat = new Uint8Array(NV * 4);
  const vd = new Float32Array(NV).fill(1e9);
  const vin = new Uint8Array(NV);
  const cls = new Uint8Array(NV);
  const surf = new Float32Array(NV).fill(NaN);
  const lvl = new Float32Array(W * H).fill(NaN);

  for (let i = 0; i < W * H; i++) {
    if (layers.wet[i]) lvl[i] = layers.waterLevel[i] || (layers.hgt[i] / LV + 0.25);
  }
  for (let j = 0; j < VH; j++) {
    for (let i = 0; i < VW; i++) {
      const u = i / S, vv = j / S, k = j * VW + i;
      const tx = clamp(Math.floor(u), 0, W - 1), ty = clamp(Math.floor(vv), 0, H - 1), ti = ty * W + tx;
      vin[k] = u >= OXI - 2 ? 1 : 0;
      const open = layers.t[ti] === 1 || layers.wet[ti] > 0;
      cls[k] = open ? 1 : 0;
      hv[k] = layers.hgt[ti] / LV + (vin[k] ? (open ? 0 : 4.2) : (open ? 0 : 2.2 + vnoise(u * 0.12, vv * 0.12, 9) * 2.5));
      if (open) vd[k] = 0;
      ceil[k] = hv[k] + (vin[k] ? 6.0 : 40);
      if (layers.wet[ti]) surf[k] = lvl[ti];
      mat[k * 4] = (layers.v[ti] % 2) * 255;
      mat[k * 4 + 1] = layers.v[ti] === 2 ? 255 : 0;
      mat[k * 4 + 2] = layers.v[ti] >= 3 ? 255 : 0;
      mat[k * 4 + 3] = 235;
    }
  }
  const da = 1 / S;
  for (let j = 0; j < VH; j++) for (let i = 1; i < VW; i++) vd[j * VW + i] = Math.min(vd[j * VW + i], vd[j * VW + i - 1] + da);
  for (let j = VH - 1; j >= 0; j--) for (let i = VW - 2; i >= 0; i--) vd[j * VW + i] = Math.min(vd[j * VW + i], vd[j * VW + i + 1] + da);

  const H2 = (x, y) => {
    const fx = clamp(x * S, 0, VW - 1.001), fy = clamp(y * S, 0, VH - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, t = fy - j, k = j * VW + i;
    return (hv[k] * (1 - u) + hv[k + 1] * u) * (1 - t) + (hv[k + VW] * (1 - u) + hv[k + VW + 1] * u) * t;
  };

  const py = dunes?.pyramid || { cx: 39, cy: 39, half: 26 };
  return {
    W, H, E, OXI, VW, VH, hv, ceil, mat, vd, vin, cls, surf, lvl, H2,
    v,
    seed: 1337,
    pyramid: { pc: py.cx ?? 39, half: py.half ?? 26, base: 0, top: 28, steps: v.pyramid?.steps || 0 },
    pyrBox: [py.cx - py.half, py.cy - py.half, py.cx + py.half, py.cy + py.half, 0],
    seals: [],
    torches: (doc.architecture?.torches || []).map((tc) => ({
      x: tc.x, y: tc.y, h: H2(tc.x, tc.y) + 1.2, inside: tc.x >= OXI - 2, stand: true, nx: 0.7, ny: 0.7,
    })),
    inside: (x) => x >= OXI - 2,
  };
}

/** Compile an Alpine3D spec (`av`) from `doc.grid` layers. */
export function compileAlpineSpecFromDoc(doc, floors) {
  const { w: W, h: H, layers, traversal, heightfield } = doc.grid;
  const rk = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    rk[i] = layers.t[i] ? layers.hgt[i] / ALP_LV : (layers.hgt[i] / ALP_LV + 3.2);
  }
  const F = buildField({
    W,
    H,
    lv: layers.hgt,
    walk: layers.t,
    rk,
    smoothMax: traversal?.smoothMax ?? 3,
    rough: (u, v, b0, d) => b0 + Math.min(5.5, d * 1.35) + (vnoise(u * 0.35, v * 0.35, 19) - 0.5) * 0.9,
  });
  const tfloor = new Uint8Array(W * H);
  const maxFl = Math.max(1, floors.length);
  for (let i = 0; i < W * H; i++) tfloor[i] = layers.v[i] % maxFl;
  const isSummit = doc.meta?.biomeId === 'snowy_summit';
  const snowLo = (heightfield?.snowLine ?? (isSummit ? -10 : 24)) / ALP_LV;
  const vmat = new Uint8Array(F.VW * F.VH * 4);
  for (let k = 0; k < F.VW * F.VH; k++) {
    vmat[k * 4] = F.own[k] < 0 ? 255 : 0;
    vmat[k * 4 + 1] = 0;
    vmat[k * 4 + 2] = 220;
    vmat[k * 4 + 3] = Math.round(vnoise((k % F.VW) * 0.1, ((k / F.VW) | 0) * 0.1, 7) * 255);
  }
  return {
    W,
    H,
    F,
    tfloor,
    floors,
    vmat,
    look: {
      rock: [isSummit ? 'ice_bound_shale' : 'snow_capped_granite', null],
      rockB: ['frost_niche_slate', null],
      snow: [snowLo, snowLo + 3.5],
      snowC: '#eef4fa',
      mist: [-14, -4],
      mistC: isSummit ? '#2a384e' : '#304254',
      cloud: { y: heightfield?.cloudSeaY ?? -6, color: '#bcd0e4', k: 0.75 },
      sun: '#fff0d8',
      sunI: 2.1,
      amb: '#687890',
      ambI: 0.8,
      hemiSky: '#a8c8f0',
      hemiGround: '#2c343e',
      hemiI: 1.4,
      sky: isSummit ? ['#0d182b', '#274268', '#6e8eb2'] : ['#1b3556', '#46709b', '#9ab8d4'],
      far: ['#2a3f5c', '#3c5678', '#527094'],
      peaks: true,
      winter: isSummit ? 1 : 0,
    },
    skirt: (x, y) => -8 - Math.hypot(x - W / 2, y - H / 2) * 0.12 + vnoise(x * 0.08, y * 0.08, 41) * 4,
  };
}

// ------------------------------------------------------------------ Resolve Prop Sprite Across All Packs
function resolvePropSprite(pr, tileset, biomeId) {
  if (pr.throne) return throneSprite();
  const name = pr.name;
  if (tileset?.scatter) {
    const hit = tileset.scatter.find((s) => s.name === name);
    if (hit) return hit;
  }
  if (biomeId === 'castle' || biomeId === 'endless_siege') {
    const co = castleObject(name);
    if (co) return co;
  }
  if (biomeId === 'sea_of_sand' || biomeId === 'scorpion_king_pyramid') {
    const so = seaOfSandObject(name);
    if (so) return so;
  }
  const ow = overworldObject(name);
  if (ow) return ow;
  if (A.town) {
    const to = townObject(name);
    if (to) return to;
  }
  return tileset?.scatter?.[0] || null;
}

/**
 * Instantiate a complete, playable `World` (with active 2D/2.5D/3D render hooks and Cutscene Director)
 * from a live `VelscourScenarioDoc`.
 */
export async function buildCustomScenarioWorld(doc, opts = {}) {
  const cat = doc.meta?.category || 'dungeon';
  const biomeId = doc.meta?.biomeId || 'catacombs';
  const biome = resolveBiome(biomeId);
  const mix = doc.meta?.mixBiomeId ? resolveBiome(doc.meta.mixBiomeId) : null;
  const depth = opts.depth || 1;
  const rng = new RNG(opts.seed || 1337);

  if (!opts.skipArtLoad) {
    await loadCustomScenarioArt(doc);
  }
  disposeAll3DScenes();

  const useTownFloors = ['town', 'overworld', 'great_hunt', 'endless_siege'].includes(biomeId) && A.town;
  const tileset = mix ? mixedTileSet(biome, mix, false) : biomeTileSet(biome.overworld && !biome.packArt ? TOWN_BIOME : biome);
  if (!opts.keepAllTileSets) keepTileSets(tileset);

  let townTiles = null;
  if (useTownFloors) townTiles = makeTownTiles();
  else if (biomeId === 'act2_town' || (biomeId === 'sea_of_sand' && cat !== '3d_dunes')) {
    const sf = seaOfSandFloorTiles();
    if (sf && sf.length) townTiles = sf;
  } else if (biomeId === 'castle') {
    const cf = castleFloorTiles();
    if (cf && cf.length) townTiles = cf;
  }

  const { w, h, layers, traversal } = doc.grid;
  const N = w * h;
  const map = new TileMap(w, h);
  map.t.set(layers.t.subarray(0, N));
  // Widen map.v to Uint16Array if variant indices exceed 255
  let maxV = 0;
  for (let i = 0; i < N; i++) if (layers.v[i] > maxV) maxV = layers.v[i];
  if (maxV > 255) map.v = new Uint16Array(N);
  map.v.set(layers.v.subarray(0, N));
  map.block.set(layers.block.subarray(0, N));
  map.climb = traversal?.climb ?? 4;
  map.drop = traversal?.drop ?? 10;
  map.walkStep = traversal?.walkStep ?? 3;

  const hasElevation = cat !== 'dungeon' && cat !== 'town_arena' && cat !== '3d_train' && (
    ['overworld', 'breach', 'naval', 'airship', '3d_caverns', '3d_alpine', '3d_dunes'].includes(cat) ||
    layers.hgt.some((v) => v !== 0)
  );
  if (hasElevation) {
    map.hgt = new Int16Array(N);
    map.hgt.set(layers.hgt.subarray(0, N));
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < N; i++) if (map.t[i]) { lo = Math.min(lo, map.hgt[i]); hi = Math.max(hi, map.hgt[i]); }
    if (!Number.isFinite(lo)) { lo = 0; hi = 0; }
    map.minLevel = lo;
    map.maxLevel = hi;
    map.baseLevel = lo - 14;
  }

  if (layers.wet.some((v) => v !== 0)) {
    map.wet = new Uint8Array(layers.wet);
  }

  if (cat === 'breach') {
    map.voidFace = 'breach';
    map.under = new Int16Array(layers.under);
    map.rounded = new Uint8Array(N);
    map.rampTile = new Uint8Array(N);
    map.ramp = new Float32Array((w + 1) * (h + 1));
    for (let i = 0; i < N; i++) {
      if (layers.flags[i] & 1) map.rounded[i] = 1;
      if (layers.flags[i] & 2) map.rampTile[i] = 1;
    }
    // Smooth corner heights for ramp tiles
    for (let cy = 0; cy <= h; cy++) {
      for (let cx = 0; cx <= w; cx++) {
        let sum = 0, cnt = 0;
        for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const tx = cx + ox, ty = cy + oy;
          if (tx >= 0 && ty >= 0 && tx < w && ty < h && map.t[ty * w + tx]) {
            sum += map.hgt[ty * w + tx];
            cnt++;
          }
        }
        map.ramp[cy * (w + 1) + cx] = cnt ? sum / cnt : 0;
      }
    }
  } else if (cat === 'airship') {
    map.c3only = true;
    map.occStruct = true;
    map.sky = true;
    map.c3struct = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (layers.flags[i] & 4) map.c3struct[i] = 1;
  } else if (cat === 'naval') {
    map.sea = true;
    map.noSky = true;
    map.losOverWater = true;
    map.deck = new Uint8Array(layers.deck);
    map.baseLevel = SEA_LV;
  } else if (cat === 'dungeon' || (cat === 'town_arena' && doc.meta?.variantId === 'pvp_arena') || biomeId === 'deep_mines') {
    map.buildWalls(tileset, () => rng.next(), doc.architecture?.openings || []);
  }

  const worldKind = cat === 'town_arena' && doc.meta?.variantId !== 'pvp_arena' ? 'town' : 'dungeon';
  const props = [];
  for (const pr of doc.entities?.props || []) {
    if (pr.caveProp) {
      props.push({ ...pr });
      continue;
    }
    const spr = resolvePropSprite(pr, tileset, biomeId);
    if (!spr) continue;
    props.push({
      id: pr.id,
      kind: pr.kind || 'scatter',
      x: pr.x,
      y: pr.y,
      z: pr.z || 0,
      spr,
      k: pr.throne ? 1 / THRONE_ART.over : (pr.k || tileset.k || 0.4),
      flip: !!pr.flip,
      light: pr.light || 0,
      tree: !!pr.tree || !!spr.tree,
      throne: !!pr.throne,
    });
  }

  const buildings = (doc.architecture?.buildings || []).map((b) => {
    const spr = A.town ? townObject(b.kind.startsWith('b_') ? b.kind : `b_${b.kind}`) || townObject(b.kind) : null;
    return { ...b, spr };
  });

  const looks = rollLooks(biome, () => rng.next());
  const world = new World(worldKind, {
    map,
    tileset,
    biome,
    depth,
    props,
    buildings,
    torches: structuredClone(doc.architecture?.torches || []),
    wallHangings: structuredClone(doc.architecture?.wallHangings || []),
    townTiles,
    looks,
    rooms: structuredClone(doc.architecture?.rooms || []),
    customScenarioId: doc.meta?.id,
  });

  if (doc.meta?.lighting) {
    world.darkK = doc.meta.lighting.dark ?? biome.dark ?? 0.75;
    world.raining = (doc.meta.lighting.rain || 0) > 0.5;
    world.night = !!doc.meta.lighting.night;
    if (doc.meta.lighting.fog) world.ambientFog = doc.meta.lighting.fog;
  }

  // Bind 3D / 2.5D Viewport & Scene Hooks
  if (cat === '3d_caverns') {
    const cv = compileCaveFieldFromDoc(doc);
    map.smoothField = true;
    await buildCave3D(cv);
    const LV = VZ / 4, K = HH / VZ;
    const floorLo = (map.minLevel || 0) / LV - 2, floorHi = (map.maxLevel || 32) / LV + 4;
    const groundT = (x, y) => {
      const ti = map.tileIdx(x, y);
      const s = map.wet && map.wet[ti] ? cv.lvl[ti] : NaN;
      const h0 = cv.H2(x, y);
      return !Number.isNaN(s) && s > h0 ? s : h0;
    };
    const cr = (world.cave = {
      cv,
      v: cv.v,
      focus: [doc.entities.start[0], groundT(...doc.entities.start), doc.entities.start[1]],
      cut: true,
      elev: (x, y) => groundT(x, y) * VZ,
      cutAt: () => false,
      pick(wx, wy) {
        const at = (hh) => { const yy = wy + hh * VZ; return [(wx / HW + yy / HH) / 2, (yy / HH - wx / HW) / 2]; };
        for (let hh = floorHi + 4; hh >= floorLo; hh -= 0.08) {
          const [x, y] = at(hh);
          if (x >= 0 && y >= 0 && x < w && y < h && groundT(x, y) >= hh) return [x, y];
        }
        return [(wx / HW + wy / HH) / 2, (wy / HH - wx / HW) / 2];
      },
      horizon(o) {
        if (o === world.player) return null;
        const x = o.x, y = o.y, h0 = groundT(x, y), fy = (x + y) * HH - h0 * VZ - (o.z || 0);
        let top = Infinity;
        for (let s = 0.3; s < 14; s += 0.5) {
          if (x + s >= w || y + s >= h) break;
          const py = (x + s + y + s) * HH - groundT(x + s, y + s) * VZ;
          if (py < top) top = py;
        }
        if (top >= fy - 3) return null;
        const hgt = o.viewH || 46 * (o.scale || 1);
        return top <= fy - hgt ? -Infinity : top;
      },
      drawProp(ctx, o) {
        const spr = caveSprite(o.caveProp, o.m || 0);
        if (!spr) return;
        const sc = o.k || o.s || 1, sx = isoX(o.x, o.y), sy = isoY(o.x, o.y) - (o.z || 0);
        ctx.drawImage(spr.img, 0, 0, spr.w, spr.h, sx + spr.ox * sc, sy + spr.oy * sc, spr.w * sc, spr.h * sc);
      },
      frame(dt) {
        const p = world.player;
        if (p) { cr.focus[0] = p.x; cr.focus[1] = groundT(p.x, p.y); cr.focus[2] = p.y; }
        if (dt) tickCave3D(dt, cr);
      },
      draw(ctx) { drawCave3D(ctx, cr); },
      dispose: disposeCave3D,
    });
    setElevation(cr.elev, cr.pick);
  } else if (cat === '3d_tower') {
    const tv = doc.grid?.tower || TOWER_VARIANTS.find((v) => v.id === doc.meta?.variantId) || TOWER_VARIANTS[0];
    const g = towerGeo(tv);
    map.tower = g;
    await buildTower3D(g);
    const tw = (world.tower = {
      g,
      v: tv,
      alpha: g.theta(g.s(doc.entities.start[0])) + Math.PI / 2,
      roof: doc.entities.start[0] < g.XR,
      focus: [0, 0, 0],
      raw(x, y, out, clip) {
        let cx, cy, z;
        if (x < g.XR) { cx = x - g.AX; cy = y - g.AY; z = g.roofZ; }
        else {
          const s = g.X1 - x, t = g.theta0 - s / g.rc - tw.alpha, r = g.rWall - (y - g.YR);
          cx = r * Math.cos(t); cy = r * Math.sin(t); z = g.z(s);
          if (clip && (cx * CUT_N[0] + cy * CUT_N[1] < -CUT_C || upCut(cx, cy, z, tw.focus) < 0)) {
            out[0] = out[1] = 1e7;
            return out;
          }
        }
        out[0] = (cx - cy) * HW;
        out[1] = (cx + cy) * HH - z * VZ;
        return out;
      },
      warp: (x, y, out) => tw.raw(x, y, out, !tw.roof),
      pick(wx, wy) {
        if (tw.roof) {
          const yy = wy + g.roofZ * VZ;
          return [g.AX + (wx / HW + yy / HH) / 2, g.AY + (yy / HH - wx / HW) / 2];
        }
        let x = clamp(world.player ? world.player.x : doc.entities.start[0], g.XT, g.XB), y = g.YR + g.w / 2;
        const a = [0, 0], b = [0, 0], c = [0, 0];
        for (let k = 0; k < 6; k++) {
          tw.raw(x, y, a, false);
          tw.raw(x + 0.05, y, b, false);
          tw.raw(x, y + 0.05, c, false);
          const ax = (b[0] - a[0]) / 0.05, ay = (b[1] - a[1]) / 0.05;
          const bx = (c[0] - a[0]) / 0.05, by = (c[1] - a[1]) / 0.05;
          const det = ax * by - ay * bx;
          if (Math.abs(det) < 1e-4) break;
          const ex = wx - a[0], ey = wy - a[1];
          x = clamp(x + (ex * by - ey * bx) / det, g.XT - 2, g.XB + 2);
          y = clamp(y + (ax * ey - ay * ex) / det, g.YR - 1, g.YR + g.w + 1);
        }
        return [x, y];
      },
      setClimbTurn(norm01) {
        if (norm01 === 'roof') {
          tw.roof = true;
          tw.alpha = g.alphaTop;
          warpMoved();
          return;
        }
        tw.roof = false;
        const s = clamp(norm01, 0, 1) * g.L;
        const tx = g.X1 - s, ty = g.YR + g.w / 2;
        tw.alpha = g.theta(s) + Math.PI / 2;
        const t = g.theta0 - s / g.rc - tw.alpha, r = g.r(ty);
        tw.focus = [r * Math.cos(t), g.z(s), r * Math.sin(t)];
        warpMoved();
      },
      frame(dt) {
        const p = world.player;
        if (p) {
          tw.roof = p.x < g.XR;
          if (tw.roof) tw.alpha = g.alphaTop;
          else {
            const s = g.s(p.x);
            tw.alpha = g.theta(s) + Math.PI / 2;
            const t = g.theta0 - s / g.rc - tw.alpha, r = g.r(p.y);
            tw.focus[0] = r * Math.cos(t); tw.focus[1] = g.z(s); tw.focus[2] = r * Math.sin(t);
          }
          warpMoved();
        }
        if (dt) tickTower3D(dt, tw);
      },
      draw(ctx) { drawTower3D(ctx, tw); },
      front(ctx) { if (!tw.roof) drawTowerFront(ctx); },
      minimap(c, W2, H2) {
        c.clearRect(0, 0, W2, H2);
        c.strokeStyle = '#d8b26a';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(W2 / 2, H2 / 2, Math.min(W2, H2) * 0.36, 0, Math.PI * 2);
        c.stroke();
      },
      dispose: disposeTower3D,
    });
    tw.setClimbTurn(0.05);
    setWarp(tw.warp, tw.pick);
  } else if (cat === '3d_alpine') {
    const summitFloors = biomeTileSet(resolveBiome('snowy_summit')).floors;
    const av = compileAlpineSpecFromDoc(doc, summitFloors.length ? summitFloors : tileset.floors);
    map.hgt = fieldLevels(av.F, w, h, layers.hgt, layers.t);
    map.smoothField = true;
    map.hopArc = true;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < N; i++) { lo = Math.min(lo, map.hgt[i]); hi = Math.max(hi, map.hgt[i]); }
    map.minLevel = lo; map.maxLevel = hi;
    const cr = alpineHook(world, av, { zoom: 1 });
    cr.dispose = disposeAlpine3D;
    setElevation(cr.elev, cr.pick);
  } else if (cat === '3d_dunes') {
    const dv = compileDunesFieldFromDoc(doc);
    map.smoothField = true;
    await buildDunes3D(dv);
    const LV = VZ / 4;
    const floorLo = (map.minLevel || -30) / LV - 2, floorHi = (map.maxLevel || 20) / LV + 8;
    const groundT = (x, y) => dv.H2(x, y);
    const cr = (world.cave = {
      dv,
      v: dv.v,
      focus: [doc.entities.start[0], groundT(...doc.entities.start), doc.entities.start[1]],
      cut: true,
      inside: dv.inside(doc.entities.start[0]),
      inRegion: (x) => dv.inside(x) === cr.inside,
      elev: (x, y) => groundT(x, y) * VZ,
      pick(wx, wy) {
        const at = (hh) => { const yy = wy + hh * VZ; return [(wx / HW + yy / HH) / 2, (yy / HH - wx / HW) / 2]; };
        for (let hh = floorHi; hh >= floorLo; hh -= 0.08) {
          const [x, y] = at(hh);
          if (x >= 0 && y >= 0 && x < w && y < h && cr.inRegion(x) && groundT(x, y) >= hh) return [x, y];
        }
        return [(wx / HW + wy / HH) / 2, (wy / HH - wx / HW) / 2];
      },
      horizon: () => null,
      drawProp(ctx, o) {
        const spr = duneSprite(o.caveProp, o.m || 0);
        if (!spr) return;
        const sc = o.k || o.s || 1, sx = isoX(o.x, o.y), sy = isoY(o.x, o.y) - (o.z || 0);
        ctx.drawImage(spr.img, 0, 0, spr.w, spr.h, sx + spr.ox * sc, sy + spr.oy * sc, spr.w * sc, spr.h * sc);
      },
      frame(dt) {
        const p = world.player;
        if (p) {
          cr.inside = dv.inside(p.x);
          cr.focus[0] = p.x; cr.focus[1] = groundT(p.x, p.y); cr.focus[2] = p.y;
        }
        if (dt) tickDunes3D(dt, cr);
      },
      draw(ctx) { drawDunes3D(ctx, cr); },
      dispose: disposeDunes3D,
    });
    setElevation(cr.elev, cr.pick);
  } else if (cat === 'naval') {
    buildSea3D({ weather: doc.meta?.variantId || 'day' });
    const handles = new Map();
    let nextDeckId = 2;
    for (const sh of doc.grid?.naval?.ships || []) {
      const hdl = spawnSeaShip(sh.kind || 'brig', {
        deck: sh.walkableDeck !== false,
        at: [sh.x, sh.y],
        heading: sh.heading || 0,
      });
      handles.set(sh.id, { hdl, deckId: sh.walkableDeck !== false ? nextDeckId++ : 0 });
      if (sh.walkableDeck !== false && sh.autoBake !== false) {
        const bk = bakeDeck(hdl);
        applyDeck(map, bk, nextDeckId - 1, { levels: sh.levels || [0] });
      }
    }
    for (const pl of doc.grid?.naval?.planks || []) {
      seaPlank(pl.from, pl.to, pl.w || 1.2);
      joinDecks(map, pl.from, pl.to, Math.max(1, Math.round(pl.w || 2)), 1);
    }
    seaMapChanged(map);
    const cr = (world.cave = {
      sea: true,
      handles,
      focus: [doc.entities.start[0], 0, doc.entities.start[1]],
      elev: (x, y) => (map.hgt ? map.hgt[map.tileIdx(x, y)] * HS : 0),
      pick(wx, wy) {
        const at = (lv) => { const yy = wy + lv * HS; return [(wx / HW + yy / HH) / 2, (yy / HH - wx / HW) / 2]; };
        for (let lv = (map.maxLevel || 30); lv >= (map.minLevel || -25); lv -= 2) {
          const [x, y] = at(lv);
          if (map.inb(Math.floor(x), Math.floor(y)) && map.t[map.tileIdx(x, y)] && map.hgt[map.tileIdx(x, y)] >= lv) return [x, y];
        }
        return [(wx / HW + wy / HH) / 2, (wy / HH - wx / HW) / 2];
      },
      horizon: () => null,
      frame(dt) {
        const p = world.player;
        if (p) { cr.focus[0] = p.x; cr.focus[2] = p.y; }
        if (dt) tickSea3D(dt);
      },
      draw(ctx) { drawSea3D(ctx, cr.focus); },
      dispose: disposeSea3D,
    });
    setElevation(cr.elev, cr.pick);
  } else if (cat === 'airship') {
    const sv = SKY_VARIANTS.find((v) => v.id === doc.meta?.variantId) || SKY_VARIANTS[0];
    world.sky = {
      v: sv,
      boats: [],
      galleon: null,
      hooks: [],
      shots: [],
      bolts: [],
      flash: 0,
      gateFlash: 0,
      through: 0,
    };
    warmSky(world);
    useTerrain(map);
  } else if (cat === '3d_train') {
    buildTrain3D(world);
    const cr = (world.cave = {
      train: true,
      speed: opts.isEditor ? 0 : 12,
      focus: [doc.entities.start[0], 0, doc.entities.start[1]],
      elev: () => 0,
      pick: (wx, wy) => [(wx / HW + wy / HH) / 2, (wy / HH - wx / HW) / 2],
      horizon: () => null,
      frame(dt) {
        const p = world.player;
        if (p) {
          cr.focus[0] = p.x;
          cr.focus[2] = p.y;
          trainCutaway(p.x);
        }
        if (dt) tickTrain3D(dt, { speed: cr.speed, fire: 1 });
      },
      draw(ctx) { drawTrain3D(ctx, cr.focus); },
      dispose: disposeTrain3D,
    });
    trainCutaway(doc.entities.start[0]);
  } else {
    useTerrain(map);
  }

  // Spawn Interactables / Chests
  const chestRng = new RNG(0x51a7beef);
  world.chests = (doc.entities?.interactables || []).map((it) => {
    const rolled = rollTreasureChest(chestRng);
    if (it.subType === 'rare') rolled.rare = true;
    return {
      ...it,
      ...rolled,
      label: it.label || rolled.label,
      opened: false,
      reach: 1.4,
      use() {
        if (this.opened) return;
        this.opened = true;
        sfx('chest');
        dropChest(world, this, depth);
        sparkle(this.x, this.y, 20, this.tint || '#ffd060', 20, 0.5);
        for (const tr of doc.triggers || []) {
          if (tr.event === 'onInteract' && tr.targetKey === it.id) {
            world.customDirector?.fireTriggerById(tr.id);
          }
        }
      },
    };
  });

  // Spawn NPCs & Vendors
  world.npcs = [];
  for (const n of doc.entities?.npcs || []) {
    const vend = VENDORS.find((v) => v.id === n.role);
    const folkDef = TOWNSFOLK.find((f) => f.spriteId === n.spriteId) || ANIMALS.find((a) => a.spriteId === n.spriteId) || TOWNSFOLK[0];
    const folk = makeFolk(world, folkDef, n.x, n.y, { calm: true, still: true, chatter: n.lines || [] });
    folk.name = n.name || vend?.name || folkDef.name;
    folk.castKey = n.castKey || n.id;
    if (vend) folk.vendorId = vend.id;
    const origUse = folk.onUse;
    folk.onUse = () => {
      let handled = false;
      for (const tr of doc.triggers || []) {
        if (tr.event === 'onInteract' && (tr.targetKey === folk.castKey || tr.targetKey === n.id)) {
          world.customDirector?.fireTriggerById(tr.id);
          handled = true;
        }
      }
      if (!handled && n.lines?.length) {
        folk.say(n.lines[0], 4.2);
      } else if (!handled && origUse) {
        origUse();
      }
    };
    world.npcs.push(folk);
  }

  // Spawn Monsters & Bosses
  const lvl = depthLevel(depth);
  world._generatingDungeon = true;
  let seq = 1;
  for (let si = 0; si < (doc.entities?.spawns || []).length; si++) {
    const s = doc.entities.spawns[si];
    if (s.rank === 'raid') {
      const tpl = RAID_BOSSES.find((b) => b.id === s.arch) || RAID_BOSSES[0];
      const m = makeRaidBoss(world, { mx: s.x, my: s.y, x: s.x - 10, y: s.y - 10, w: 20, h: 20 }, depth, lvl + 3, { tpl });
      if (m) {
        m.x = s.x; m.y = s.y;
        m.netId = `c_raid_${si}`;
        m.idx = seq++;
        if (s.castKey) m.castKey = s.castKey;
        if (s.name) m.name = s.name;
        world.add(m);
        world.boss = m;
      }
      continue;
    }
    const count = Math.max(1, Math.min(20, s.n || 1));
    const lookOverride = s.art ? { art: s.art, swap: s.swap ? SWAPS[s.swap] : null } : null;
    for (let i = 0; i < count; i++) {
      const [mx, my] = i === 0 ? [s.x, s.y] : map.randomNear(s.x, s.y, 1.6, () => rng.next());
      const rk = s.rank === 'unique' && i > 0 ? 'normal' : (s.rank || 'normal');
      const m = makeMonster(world, s.arch || 'skeleton', biome, lvl + (rk === 'boss' ? 2 : rk === 'normal' ? 0 : 1), rk, mx, my, 0, lookOverride, () => rng.next());
      if (!m) continue;
      m.netId = `c_m_${si}_${i}`;
      m.idx = seq++;
      if (i === 0 && s.castKey) m.castKey = s.castKey;
      if (i === 0 && s.name) m.name = s.name;
      if (rk === 'boss') world.boss = m;
      if (opts.freezeAI) m.awake = false;
      world.add(m);
    }
  }
  world._generatingDungeon = false;

  // Portals (Town Portal + Exit)
  const tp = doc.entities?.townPortal || [doc.entities.start[0] + 1.6, doc.entities.start[1] - 0.6];
  const exSpec = doc.entities?.exit || { x: doc.entities.start[0], y: Math.max(4, doc.entities.start[1] - 10), sealed: false };
  const initiallyActive = !exSpec.sealed || worldKind === 'town';
  const exitPortal = {
    x: exSpec.x,
    y: exSpec.y,
    type: 'exit',
    active: initiallyActive,
    color: initiallyActive ? '#40a0ff' : '#5a5a60',
    reach: 1.6,
    skygate: cat === 'airship',
    seagate: cat === 'naval',
    label: initiallyActive ? 'Exit — continue' : 'Sealed Exit',
    use: () => {
      if (!exitPortal.active) {
        floatText(exitPortal.x, exitPortal.y, 48, 'The way is sealed', '#ff8a70', 12);
        return;
      }
      if (opts.onExitUsed) opts.onExitUsed(world, exitPortal, exSpec);
      else if (exSpec.continueToBiome && G.game?.continueTo) G.game.continueTo(exSpec.continueToBiome);
      else if (G.game?.useExit) G.game.useExit(world, exitPortal);
    },
  };
  world.portals = [
    {
      x: tp[0],
      y: tp[1],
      type: 'town',
      active: true,
      color: '#3a8aff',
      reach: 1.6,
      label: 'Town Portal',
      use: () => {
        if (opts.onTownPortalUsed) opts.onTownPortalUsed();
        else if (G.game?.useTownPortal) G.game.useTownPortal();
      },
    },
    exitPortal,
  ];

  map.stepMask();
  propReach(world);
  dropBakes();

  createScenarioDirector(world, doc, {
    skipArrival: !!opts.skipArrival,
    isEditorPreview: !!opts.isEditorPreview,
    onWin: opts.onWin,
  });

  // Reveal map in editor mode so lighting/fog doesn't black out unexplored corners while painting
  if (opts.revealAll) {
    map.seen.fill(1);
  }

  return world;
}
