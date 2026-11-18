// Runtime loader & live 2D/2.5D/3D World builder for authored .velscen.json scenarios.
// Shared by both Velscour Studio (live WYSIWYG viewport & F5 playtest) and the main game (Skull menu,
// biome rotation pools, pinned campaign depths, and co-op rooms).
import { G } from '../state.js';
import { TileMap } from './map.js';
import { World } from '../game/world.js';
import { RNG, clamp } from '../core/util.js';
import { camera, setElevation, setWarp, warpMoved, HW, HH, isoX, isoY, elevationAt } from '../core/view.js';
import { loadBiomeArt, biomeTileSet, mixedTileSet, keepTileSets, A } from '../core/assets.js';
import { loadArtFor } from '../core/enemyart.js';
import { TOWN_BIOME, ACT2_TOWN_BIOME } from '../data/biomes.js';
import { SWAPS, rollLooks } from '../data/bestiary.js';
import { TOWNSFOLK, ANIMALS } from '../data/townsfolk.js';
import { VENDORS, makeTownTiles, townObject } from './town.js';
import { overworldObject } from '../gfx/overworldart.js';
import { seaOfSandFloorTiles, seaOfSandObject, loadSeaOfSandPack } from '../gfx/seaofsand.js';
import { castleFloorTiles, castleObject, loadCastlePack } from '../gfx/castle.js';
import { loadDarkForestTrees, darkForestTree } from '../gfx/darkforest.js';
import { loadBaked, castle3dState } from '../gfx/castle3dart.js';
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
import { sparkle, floatText, addLight, addEffect, Column, Ring, Telegraph, burst, smoke, spawn as vfxSpawn } from '../gfx/vfx.js';
import { aoe } from '../game/combat.js';
import { deserializeScenarioDoc, resolveBiome } from './scenariocodec.js';
import { createScenarioDirector } from '../game/cutscenerunner.js';

// 3D & vehicle subsystems
import { VZ, CAVE_S, CAVE_VARIANTS, vnoise } from './caverns.js';
import { loadCave3D, buildCave3D, drawCave3D, tickCave3D, disposeCave3D, caveSprite } from '../gfx/cave3d.js';
import { TOWER_VARIANTS, towerGeo, CUT_N, CUT_C, upCut } from './tower.js';
import { loadTower3D, buildTower3D, drawTower3D, drawTowerFront, tickTower3D, disposeTower3D } from '../gfx/tower3d.js';
import { buildField, fieldLevels, LV as ALP_LV, AS as ALP_AS, fbm as alpFbm, smooth as alpSmooth } from './alpine.js';
import { mountainFloorList } from './mountain.js';
import { loadAlpine3D, disposeAlpine3D } from '../gfx/alpine3d.js';
import { alpineHook } from '../game/alpine.js';
import { DUNE_VARIANTS } from '../data/dunes.js';
import { loadDunes3D, buildDunes3D, drawDunes3D, tickDunes3D, disposeDunes3D, duneSprite, openSeal } from '../gfx/dunes3d.js';
import { applyDeck, joinDecks, mapChanged as seaMapChanged, SEA_LV } from './seaship.js';
import { loadSea3D, loadFleet, buildSea3D, spawnShip as spawnSeaShip, bakeDeck, seaPlank, tickSea3D, drawSea3D, disposeSea3D } from '../gfx/seabattle3d.js';
import { SKY_VARIANTS, DOCKS as SKY_DOCKS } from '../data/skybattle.js';
import { AIR_CREW, AIR_CAPTAIN, AIR_ART } from '../data/airpirates.js';
import { warmSky, tilePx as skyTilePx } from '../gfx/skyship.js';
import { shipLayout, OX as SKY_OX, OY as SKY_OY, LV as SKY_LV, FC_H as SKY_FC_H, GATE as SKY_GATE, beam as skyBeam, sheer as skySheer, inner as skyInner, sAt as skySAt } from './skyship.js';
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
    jobs.push(
      loadBiomeArt(TOWN_BIOME),
      loadBiomeArt(resolveBiome('dark_forest')),
      loadBiomeArt(resolveBiome('snowy_summit')),
      loadDarkForestTrees().catch(() => {}),
      loadAlpine3D(),
    );
  } else if (cat === '3d_dunes') {
    jobs.push(loadDunes3D());
  } else if (cat === 'naval') {
    const shipKinds = (doc.grid?.naval?.ships || []).map((s) => s.kind).filter(Boolean);
    jobs.push(loadSea3D(), loadFleet(['longboat', 'cutter', 'brig', ...shipKinds]));
  } else if (cat === 'airship') {
    jobs.push(
      loadBaked('assets/tiles/skyship/'),
      loadArtFor(AIR_ART.map((a) => a.id)).catch(() => {}),
    );
  } else if (cat === '3d_train') {
    jobs.push(loadTrain3D());
  }

  const folkIds = (doc.entities?.npcs || []).map((n) => n.spriteId).filter(Boolean);
  if (folkIds.length) jobs.push(preloadTownSheets(folkIds));

  const artIds = (doc.entities?.spawns || []).map((s) => s.art).filter(Boolean);
  for (const s of doc.entities?.spawns || []) {
    if (s.rank === 'raid') {
      const tpl = RAID_BOSSES.find((b) => b.id === s.arch);
      if (tpl?.art) artIds.push(...tpl.art);
      else artIds.push(...RAID_BOSSES.flatMap((b) => b.art || []));
    }
  }
  if (artIds.length) jobs.push(loadArtFor([...new Set(artIds)]));

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
  const cm = doc.grid?.heightfield?.caveMeta || null;
  const baked3dTorches = doc.grid?.heightfield?.torches3d || [];
  const torches3d = [
    ...baked3dTorches.map((tc) => ({
      x: tc.x,
      y: tc.y,
      h: tc.h ?? (H2(tc.x, tc.y) + 1.1),
      nx: tc.nx ?? 0.7,
      ny: tc.ny ?? 0.7,
      stand: !!tc.stand,
    })),
    ...(doc.architecture?.torches || []).map((tc) => ({
      x: tc.x,
      y: tc.y,
      h: H2(tc.x, tc.y) + 1.1,
      nx: 0.7,
      ny: 0.7,
      stand: true,
    })),
  ];

  return {
    W, H, VW, VH, hv, ceil, mat, vd, cls, surf, lvl, H2,
    v,
    seed: cm?.seed || 1337,
    wallStal: cm?.wallStal || [],
    torches: torches3d,
    river: cm?.river?.length ? cm.river : [[wf.x - 2, wf.y - 2], [wf.x, wf.y]],
    plunge: wf.plunge || [wf.x + 1, wf.y + 1],
    lip: [wf.x, wf.y],
    HP: wf.top ?? 3.2,
    WL: wf.base ?? 0.2,
    lake: cm?.lake || { x: wf.x + 2, y: wf.y + 4, A: 6 },
    shaft: cm?.shaft || { x: -200, y: -200, pool: 0 },
    notchIn: [-200, -200],
    mouth: cm?.mouth || [-200, -200],
    mouthDir: cm?.mouthDir || [1, 0],
    mouthH: cm?.mouthH || 0,
  };
}

/** Compile a Dunes3D field (`dv`) directly from `doc.grid` layers (preserving 3D Pyramid, LOS tomb masonry & seals). */
export function compileDunesFieldFromDoc(doc) {
  const { w: W, h: H, layers, dunes, traversal } = doc.grid;
  const v = DUNE_VARIANTS.find((q) => q.id === doc.meta?.variantId) || DUNE_VARIANTS[0];
  const E = dunes?.extW || Math.min(W, 172);
  const OXI = dunes?.oxi || Math.min(W - 32, E + 26);
  const S = CAVE_S;
  const VW = W * S + 1, VH = H * S + 1, NV = VW * VH;
  const LV = VZ / 4;
  const KS = 16 / VZ;
  const seed = dunes?.seed || 1337;
  const ns = (seed % 997) + 11;

  const pyRaw = dunes?.pyramid || { pc: 41, half: v.pyramid?.half || 26, base: 0, steps: v.pyramid?.steps || 0 };
  const pc = pyRaw.pc ?? pyRaw.cx ?? 41;
  const pyHalf = pyRaw.half ?? v.pyramid?.half ?? 26;
  const pyBase = pyRaw.base ?? 0;
  const pyTop = pyRaw.top ?? (pyHalf * (v.pyramid?.rise || 1.25));
  const pyDoorStep = pyRaw.doorStep || [pc + 0.5, pc + pyHalf + 3.5];

  const hv = new Float32Array(NV);
  const ceil = new Float32Array(NV).fill(200);
  const mat = new Uint8Array(NV * 4);
  const vd = new Float32Array(NV).fill(1e9);
  const nh = new Float32Array(NV);
  const vin = new Uint8Array(NV);
  const cls = new Uint8Array(NV);
  const surf = new Float32Array(NV).fill(NaN);
  const lvl = new Float32Array(W * H).fill(NaN);

  for (let i = 0; i < W * H; i++) {
    if (layers.wet[i]) lvl[i] = layers.waterLevel[i] || (layers.hgt[i] / LV + 0.25);
  }

  const isOpen = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && (layers.t[ty * W + tx] === 1 || layers.wet[ty * W + tx] > 0);
  const inPyr = (tx, ty) => tx < OXI - 2 && Math.abs(tx - pc) <= pyHalf && Math.abs(ty - pc) <= pyHalf;
  const tileH = (tx, ty) => {
    const cx = clamp(tx, 0, W - 1), cy = clamp(ty, 0, H - 1);
    return layers.hgt[cy * W + cx] / LV;
  };
  const sm = Math.max(1.2, (traversal?.smoothMax ?? 4) / LV);

  for (let j = 0; j < VH; j++) {
    for (let i = 0; i < VW; i++) {
      const u = i / S, vv = j / S, k = j * VW + i;
      const tx = clamp(Math.floor(u), 0, W - 1), ty = clamp(Math.floor(vv), 0, H - 1), ti = ty * W + tx;
      vin[k] = u >= OXI - 2 ? 1 : 0;
      const open = isOpen(tx, ty) || (vin[k] && isOpen(Math.floor(u - 0.01), Math.floor(vv - 0.01)));
      if (open) {
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
      } else if (inPyr(tx, ty)) {
        hv[k] = pyBase;
        nh[k] = pyBase;
      }
    }
  }

  // Full 8-neighbor chamfer distance & nearest-floor height propagation (strictly separated across Exterior vs Tomb)
  const da = 1 / S, db = Math.SQRT2 / S;
  const relax = (k, n, c) => {
    if (vin[k] !== vin[n]) return;
    if (vd[n] + c < vd[k]) { vd[k] = vd[n] + c; nh[k] = nh[n]; }
  };
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
    const i = k % VW, j = (k / VW) | 0, u = i / S, vv = j / S;
    const tx = clamp(Math.floor(u), 0, W - 1), ty = clamp(Math.floor(vv), 0, H - 1), ti = ty * W + tx;
    const d = vd[k] > 1e8 ? 8 : vd[k];
    if (vin[k]) {
      if (!cls[k]) {
        const wallRise = Math.min(5.4, 1.4 + d * 2.8);
        hv[k] = (nh[k] || 0) + wallRise;
      }
      ceil[k] = (nh[k] || hv[k]) + 6.4;
      mat[k * 4] = Math.round(255 * clamp((vnoise(i * 0.04, j * 0.04, ns + 71) - 0.35) / 0.3, 0, 1));
      mat[k * 4 + 1] = Math.round(255 * clamp((vnoise(i * 0.06, j * 0.06, ns + 73) - 0.4) / 0.2, 0, 1));
      mat[k * 4 + 2] = 0;
      mat[k * 4 + 3] = cls[k] === 1 ? 235 : Math.round(clamp(225 - d * 24, 110, 225));
    } else {
      if (!cls[k]) {
        if (inPyr(tx, ty)) {
          hv[k] = pyBase;
        } else {
          const rawH = tileH(tx, ty);
          const ridge = Math.max(1.4, rawH - (nh[k] || 0));
          const q = Math.min(1, d / 5.5);
          hv[k] = (nh[k] || 0) + ridge * (1 - (1 - q) * (1 - q)) + (vnoise(i * 0.11, j * 0.11, ns + 41) - 0.5) * 0.45 * q;
        }
      }
      ceil[k] = hv[k] + 200;
      mat[k * 4] = (layers.v[ti] % 2) * 255;
      mat[k * 4 + 1] = layers.v[ti] === 2 ? 255 : 0;
      mat[k * 4 + 2] = layers.wet[ti] ? 255 : (layers.v[ti] >= 3 ? 220 : 0);
      mat[k * 4 + 3] = 238;
    }
  }

  // Tomb LOS masonry cap: foreground tomb walls smoothly step down so they never hide deep spiraling halls behind them
  if (traversal?.losCap !== false) {
    const NC = VW + VH, M = new Float32Array(NC).fill(1e9);
    for (let dsum = 0; dsum < VW + VH - 1; dsum++) {
      const iA = Math.max(0, dsum - (VH - 1)), iB = Math.min(VW - 1, dsum), dTile = dsum / S;
      for (let i = iA; i <= iB; i++) {
        const j = dsum - i, k = j * VW + i;
        if (cls[k] || !vin[k]) continue;
        const c = i - j + VH;
        let m = 1e9;
        for (let o = -2; o <= 2; o++) { const qq = c + o; if (qq >= 0 && qq < NC && M[qq] < m) m = M[qq]; }
        if (m < 1e8) {
          const cap = m + (dTile - 0.5) * KS;
          if (hv[k] > cap) hv[k] = Math.max(cap, (nh[k] || 0) - 0.3);
        }
      }
      for (let i = iA; i <= iB; i++) {
        const j = dsum - i, k = j * VW + i;
        if (!cls[k] || !vin[k]) continue;
        const c = i - j + VH, val = hv[k] - dTile * KS;
        if (val < M[c]) M[c] = val;
      }
    }
  }

  const H2 = (x, y) => {
    const fx = clamp(x * S, 0, VW - 1.001), fy = clamp(y * S, 0, VH - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, t = fy - j, k = j * VW + i;
    return (hv[k] * (1 - u) + hv[k + 1] * u) * (1 - t) + (hv[k + VW] * (1 - u) + hv[k + VW + 1] * u) * t;
  };

  const baked3dTorches = dunes?.torches3d || [];
  const torches = [
    ...baked3dTorches.map((tc) => ({
      x: tc.x,
      y: tc.y,
      h: tc.h ?? (H2(tc.x, tc.y) + 1.2),
      inside: tc.x >= OXI - 2,
      stand: !!tc.stand,
      nx: tc.nx ?? 0.7,
      ny: tc.ny ?? 0.7,
    })),
    ...(doc.architecture?.torches || []).map((tc) => ({
      x: tc.x,
      y: tc.y,
      h: H2(tc.x, tc.y) + 1.2,
      inside: tc.x >= OXI - 2,
      stand: true,
      nx: 0.7,
      ny: 0.7,
    })),
  ];

  return {
    W, H, E, OXI, VW, VH, hv, ceil, mat, vd, vin, cls, surf, lvl, H2,
    v,
    seed,
    pyramid: {
      pc,
      half: pyHalf,
      base: pyBase,
      top: pyTop,
      door: pyRaw.door || [pc + 0.5, pc + pyHalf + 1],
      doorStep: pyDoorStep,
      plaza: pyRaw.plaza || null,
      steps: pyRaw.steps ?? v.pyramid?.steps ?? 0,
    },
    pyrBox: [pc - pyHalf, pc - pyHalf, pc + pyHalf, pc + pyHalf, pyBase],
    seals: (dunes?.seals || []).map((s) => ({ ...s })),
    torches,
    inside: (x) => x >= OXI - 2,
  };
}

/** Compile an Alpine3D spec (`av`) from `doc.grid` layers. */
export function compileAlpineSpecFromDoc(doc, floors) {
  const { w: W, h: H, layers, traversal, heightfield } = doc.grid;
  const isSummit = doc.meta?.biomeId === 'snowy_summit';
  const rk = new Float32Array(W * H);
  let walkLo = Infinity, walkHi = -Infinity;
  for (let i = 0; i < W * H; i++) {
    if (layers.t[i]) {
      const h0 = layers.hgt[i] / ALP_LV;
      rk[i] = h0;
      if (h0 < walkLo) walkLo = h0;
      if (h0 > walkHi) walkHi = h0;
    } else {
      rk[i] = layers.hgt[i] !== 0 ? (layers.hgt[i] / ALP_LV) : 3.2;
    }
  }
  if (!Number.isFinite(walkLo)) { walkLo = 0; walkHi = 6; }

  const F = buildField({
    W,
    H,
    lv: layers.hgt,
    walk: layers.t,
    rk,
    smoothMax: traversal?.smoothMax ?? 3,
    rough: (u, v, b0, d) => b0 + (alpFbm(u * 1.3, v * 1.3, 32) - 0.5) * Math.min(0.5, d * 0.6),
  });
  const tfloor = new Uint8Array(W * H);
  const maxFl = Math.max(1, floors.length);
  for (let i = 0; i < W * H; i++) tfloor[i] = layers.v[i] % maxFl;
  const snowLo = (heightfield?.snowLine ?? (isSummit ? -10 : 165)) / ALP_LV;
  const { VW, VH, own, near: vnear } = F;
  const vmat = new Uint8Array(VW * VH * 4);
  for (let k = 0; k < VW * VH; k++) {
    const u = (k % VW) / ALP_AS, vv = ((k / VW) | 0) / ALP_AS;
    const rock = own[k] < 0;
    vmat[k * 4] = rock ? (vnear[k] < 0.6 ? 200 : 255) : 0;
    vmat[k * 4 + 1] = rock ? Math.round(255 * alpSmooth(1.5, 9, vnear[k]) * 0.5) : 0;
    vmat[k * 4 + 2] = Math.round(255 * (0.25 + 0.75 * alpFbm(u * 0.21, vv * 0.21, 62)));
    vmat[k * 4 + 3] = Math.round(255 * alpSmooth(0.4, 0.6, alpFbm(u * 0.08, vv * 0.08, 64)));
  }

  const FI = Object.fromEntries(floors.map((f, idx) => [f.name, idx]));
  const edgeH = (x, y) => F.H2(Math.min(W - 0.01, Math.max(0, x)), Math.min(H - 0.01, Math.max(0, y)));
  const skirt = (x, y) => {
    const ex = Math.min(W, Math.max(0, x)), ey = Math.min(H, Math.max(0, y)), d = Math.hypot(x - ex, y - ey), he = edgeH(x, y);
    if (x > 0 && y > 0 && x < W && y < H) return he - 0.25;
    const n1 = alpFbm(x * 0.07, y * 0.07, 92), n2 = alpFbm(x * 0.21, y * 0.21, 94);
    if (x < 0 || y < 0) {
      const k = (d * d) / (d * d + 40);
      return he + k * (6 + 16 * n1 + 5 * n2) + (y < 0 ? Math.max(0, -y) * 0.35 : 0) - (x > W ? (x - W) * 1.4 : 0);
    }
    return Math.min(he, walkHi) - d * 1.1 - 1.8 * n1;
  };

  return {
    W,
    H,
    F,
    tfloor,
    floors,
    vmat,
    skirt,
    skirtP: 44,
    snowFloor: FI['s:windpacked_snow'] ?? FI.windpacked_snow ?? 0,
    flankSnowFloor: FI['s:blue_snow_crust'] ?? FI.blue_snow_crust ?? 0,
    stepFloor: FI.steps ?? FI.snowy_slate_flags ?? 0,
    noFlip: new Set(
      ['steps', 's:bootprints', 's:snowy_slate_flags', 's:compact_snow_path', 'bootprints', 'crossed_bootprints', 'sled_groove', 'runner_tracks', 'snowy_slate_flags', 'compact_snow_path', 'weathered_sun']
        .map((n) => FI[n])
        .filter((v) => v !== undefined)
    ),
    look: isSummit
      ? {
          rock: ['ice_bound_shale', null],
          rockB: ['frost_niche_slate', null],
          snow: [snowLo, snowLo + 3.5],
          snowC: '#eef4fa',
          mist: [walkLo - 0.5, walkLo - 6],
          mistC: '#2a384e',
          cloud: { y: heightfield?.cloudSeaY ?? (walkLo - 3.5), color: '#bcd0e4', shade: '#6f87a6', k: 0.78, wisp: 0.35 },
          sun: '#fff0d8',
          sunI: 2.1,
          amb: '#687890',
          ambI: 0.8,
          hemiSky: '#a8c8f0',
          hemiGround: '#2c343e',
          hemiI: 1.4,
          sky: ['#0d182b', '#274268', '#6e8eb2'],
          far: ['#2a3f5c', '#3c5678', '#527094'],
          peaks: true,
          winter: 1,
        }
      : {
          rock: ['snow_capped_granite', { sat: 0.82, light: -0.02 }],
          rockB: ['ice_bound_shale', { sat: 0.7, light: -0.04 }],
          tint: '#e8e2d8',
          snow: [snowLo, snowLo + 1.5],
          snowC: '#e9eef3',
          mist: [walkLo - 0.2, walkLo - 3.7],
          mistC: '#c8d4dc',
          flank: '#a8b4c4',
          cloud: { y: heightfield?.cloudSeaY ?? (walkLo - 3.2), color: '#eef2f6', shade: '#a8b4c4', k: 0.8, wisp: 0.32 },
          sun: '#fff1dc',
          sunI: 2.3,
          amb: '#c8d0dc',
          ambI: 0.85,
          hemiSky: '#cfe0f0',
          hemiGround: '#7a705e',
          hemiI: 1.35,
          sky: ['#5b86b8', '#a8c4dc', '#e0e6ea'],
          far: ['#9fb4c8', '#8197ad', '#6c8199'],
          rockScale: 0.24,
          bump: 1.0,
        },
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
  const dTree = darkForestTree(name);
  if (dTree) return dTree;
  if (biomeId === 'castle' || biomeId === 'endless_siege') {
    const co = castleObject(name);
    if (co) return co;
  }
  if (biomeId === 'sea_of_sand' || biomeId === 'scorpion_king_pyramid') {
    const so = pr.tree ? (seaOfSandObject(name, 'tree') || seaOfSandObject(name)) : (seaOfSandObject(name) || seaOfSandObject(name, 'tree'));
    if (so) return so;
  }
  if (biomeId === 'mountainside' || biomeId === 'snowy_summit' || biomeId === 'dark_forest') {
    const dfScat = biomeTileSet(resolveBiome('dark_forest'))?.scatter?.find((s) => s.name === name);
    if (dfScat) return dfScat;
    const snScat = biomeTileSet(resolveBiome('snowy_summit'))?.scatter?.find((s) => s.name === name);
    if (snScat) return snScat;
  }
  const ow = overworldObject(name);
  if (ow) return ow;
  if (A.town) {
    const to = townObject(name);
    if (to) return to;
  }
  return tileset?.scatter?.[0] || null;
}

// ------------------------------------------------------------------ Custom Airship Sky Director (Skiffs, Flagship, Broadsides & Grappling Hooks)
function createCustomSkyDirector(world, doc, biome, depth) {
  const S = world.sky;
  const map = world.map;
  const lvl = depthLevel(depth);
  const spawnedByDirector = new Set();
  const timers = [];
  const easeOut = (k) => 1 - (1 - k) ** 3;

  const stagePreview = { flagship: false, skiffs: false, hooks: false };

  const tileOf = (x, z) => [SKY_OX + x, SKY_OY + z];
  const lvAt = (x, y) => (map.hgt ? map.hgt[map.tileIdx(x, y)] || 0 : 0);
  const nearDeck = (x, y, r = 2.4) => {
    if (map.walkable(x, y)) return [x, y];
    for (let rad = 0.6; rad <= r; rad += 0.6) {
      for (let a = 0; a < 8; a++) {
        const nx = x + Math.cos((a * Math.PI) / 4) * rad, ny = y + Math.sin((a * Math.PI) / 4) * rad;
        if (map.walkable(nx, ny)) return [nx, ny];
      }
    }
    return [SKY_OX + 0.5, SKY_OY + 0.5];
  };

  const dockZOf = (dock) => {
    if (typeof dock === 'number') return dock;
    if (dock === 'fore') return SKY_DOCKS[0];
    if (dock === 'mid') return SKY_DOCKS[1];
    if (dock === 'aft') return SKY_DOCKS[2];
    const busy = (d) => S.boats.some((b) => !b._preview && b.dz === d && (b.st === 'in' || (b.st === 'dock' && b.crew.length)));
    const free = SKY_DOCKS.filter((d) => !busy(d));
    return (free.length ? free : SKY_DOCKS)[Math.floor(Math.random() * (free.length || SKY_DOCKS.length))];
  };

  const dockSpot = (kind, dz) => {
    const A0 = castle3dState()?.anchors;
    const K = A0?.skiffs?.[kind] || { rampLen: 2.2, ramp: [2.2, 0.2, 0], deck: [[0, 0, -1], [0, 0, 0], [0, 0, 1], [-0.5, 0, 0]] };
    const s = skySAt(dz), reach = K.rampLen * Math.cos(0.1);
    return {
      x: SKY_OX - (skyBeam(s) - 0.15) - reach - K.ramp[0],
      y: SKY_OY + dz - K.ramp[2],
      lv: ((skySheer(s) + 0.12) - K.ramp[1] + K.rampLen * Math.sin(0.1)) * SKY_LV,
      deck: K.deck || [[0, 0, 0]],
    };
  };

  const later = (sec, fn) => timers.push({ t: Math.max(0.01, sec), fn });

  const orientToward = (m, fx, fy, tx, ty) => {
    const ang = Math.atan2(ty - fy, tx - fx);
    m.facing = ang;
    const sx = Math.cos(ang) - Math.sin(ang);
    if (Math.abs(sx) > 0.05) m.flip = sx < 0;
  };

  const leapMonster = (m, from, to, opts = {}) => {
    const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const dur = opts.dur ?? (0.55 + d / 11);
    const arc = opts.arc ?? (65 + d * 6);
    const lvTo = lvAt(to[0], to[1]);
    let t = 0;
    m.spawnT = 1;
    m.x = from[0];
    m.y = from[1];
    m.z = from[2] * HS - elevationAt(m.x, m.y);
    orientToward(m, from[0], from[1], to[0], to[1]);
    m.targetable = false; m.awake = true; m.moving = true;
    m.entering = (dt) => {
      t += dt; m.animT = (m.animT || 0) + dt; m.spawnT = Math.max(m.spawnT || 0, 1);
      const k = Math.min(1, t / dur);
      m.x = from[0] + (to[0] - from[0]) * k;
      m.y = from[1] + (to[1] - from[1]) * k;
      m.z = (from[2] * (1 - k) + lvTo * k) * HS + arc * Math.sin(Math.PI * k) - elevationAt(m.x, m.y);
      if (k >= 1) {
        m.entering = null; m.targetable = true; m.z = 0; m.x = to[0]; m.y = to[1]; m.moving = false;
        smoke(m.x, m.y, 4, '#6a5a4a', 3, 9);
        sfx('thud', m.rank === 'boss' ? 0.9 : 0.4);
        if (m.rank === 'boss') {
          addEffect(new Ring(m.x, m.y, 0.2, 2.6, 0.5, '#e8d0a0', 6));
          camera.shake(8);
        }
      }
    };
  };

  const swingMonster = (m, anchorFn, to, dur = 1.6) => {
    const from = [m.x, m.y, ((m.z || 0) + elevationAt(m.x, m.y)) / HS];
    const rope = { a: anchorFn, m };
    let t = 0;
    m.spawnT = 1;
    orientToward(m, from[0], from[1], to[0], to[1]);
    m.targetable = false; m.awake = true; m.moving = true;
    S.ropes.push(rope);
    sfx('swing', 0.8);
    m.entering = (dt) => {
      t += dt; m.animT = (m.animT || 0) + dt; m.spawnT = Math.max(m.spawnT || 0, 1);
      const k = Math.min(1, t / dur), e = k * k * (3 - 2 * k);
      m.x = from[0] + (to[0] - from[0]) * e;
      m.y = from[1] + (to[1] - from[1]) * e;
      const ground = lvAt(m.x, m.y), lInterp = from[2] * (1 - e) + lvAt(to[0], to[1]) * e;
      m.z = Math.max(ground + 6, lInterp - Math.sin(Math.PI * e) * 14 + Math.sin(Math.PI * e) * 30 * (1 - Math.abs(2 * e - 1))) * HS - elevationAt(m.x, m.y);
      if (k >= 1) {
        const ri = S.ropes.indexOf(rope); if (ri >= 0) S.ropes.splice(ri, 1);
        m.entering = null; m.targetable = true; m.z = 0; m.x = to[0]; m.y = to[1]; m.moving = false;
        smoke(m.x, m.y, 4, '#6a5a4a', 4, 10);
        sfx('thud', 0.85);
        camera.shake(7);
      }
    };
  };

  const rappelMonster = (m, to, anchorFn) => {
    const top = 78;
    let t = 0;
    const dur = 1.15;
    const rope = { a: anchorFn || (() => [to[0] - 0.6, to[1] + 0.4, lvAt(to[0], to[1]) + top + 28]), m };
    m.spawnT = 1;
    m.targetable = false; m.awake = true; m.x = to[0]; m.y = to[1]; m.z = top * HS;
    S.ropes.push(rope);
    m.entering = (dt) => {
      t += dt; m.animT = (m.animT || 0) + dt; m.spawnT = Math.max(m.spawnT || 0, 1);
      const k = Math.min(1, t / dur);
      m.z = top * HS * (1 - k * k);
      if (k >= 1) {
        const ri = S.ropes.indexOf(rope); if (ri >= 0) S.ropes.splice(ri, 1);
        m.entering = null; m.targetable = true; m.z = 0;
        smoke(m.x, m.y, 2, '#6a5a4a', 2, 7);
        sfx('thud', 0.4);
      }
    };
  };

  const spawnAirBoarder = (crewDef, rank, from, to, how = 'leap', anchorFn = null) => {
    const c = crewDef || AIR_CREW[Math.floor(Math.random() * AIR_CREW.length)];
    const m = makeMonster(world, c.arch || 'ghoul', biome, lvl + (rank === 'normal' ? 0 : 1), rank || 'normal', to[0], to[1], 0, { art: c.id });
    if (c.shot && m.proj) m.proj = { ...m.proj, fx: c.shot };
    m.artH = c.h || 56;
    m.name = c.name || m.name;
    m.sky = true;
    m.spawnT = 1;
    world.add(m);
    spawnedByDirector.add(m);
    if (how === 'rope') rappelMonster(m, to, anchorFn);
    else leapMonster(m, from, to);
    return m;
  };

  const spawnAirCaptain = (capId, from, to, castKey = '', style = 'leap', anchorFn = null) => {
    const cap = AIR_CAPTAIN[capId] || AIR_CAPTAIN.ap_admiral_veyl;
    const m = makeMonster(world, cap.arch || 'knight', biome, lvl + 2, 'boss', to[0], to[1], 0, { art: cap.id });
    if (cap.shot && m.proj) m.proj = { ...m.proj, fx: cap.shot };
    m.name = cap.name;
    m.title = cap.title;
    m.scale = 1;
    m.artH = cap.h || 90;
    m.castKey = castKey || cap.id;
    m.sky = true;
    m.spawnT = 1;
    world.add(m);
    world.boss = m;
    spawnedByDirector.add(m);
    if (style === 'swing' && anchorFn) {
      m.x = from[0]; m.y = from[1];
      m.z = from[2] * HS - elevationAt(m.x, m.y);
      swingMonster(m, anchorFn, to, 1.65);
    } else {
      leapMonster(m, from, to, { arc: 135 });
    }
    return m;
  };

  const buildGalleonObj = (capA = 'ap_admiral_veyl', capB = 'ap_red_gale_corsair', closeNow = false) => {
    const far = { x: SKY_OX - 33, y: SKY_OY + 7, lv: 26 };
    const close = { x: SKY_OX - 15.2, y: SKY_OY + 0.6, lv: 0.6 * SKY_LV };
    const g = {
      galleon: true,
      x: closeNow ? close.x : far.x,
      y: closeNow ? close.y : far.y,
      lv: closeNow ? close.lv : far.lv,
      alpha: closeNow ? 1 : 0.05,
      far,
      close,
      k: closeNow ? 1 : 0,
      speed: 1 / 3.2,
      burn: [],
      crew: [],
    };
    const G0 = castle3dState()?.anchors?.galleon;
    if (G0?.rail) {
      G0.rail.forEach(([x, y, z], i) => {
        if (i === 2 && AIR_CAPTAIN[capA]) {
          const ca = AIR_CAPTAIN[capA];
          g.crew.push({ art: ca.id, cap: capA, x, y, z, h: (ca.h || 90) * 0.95, flip: false, ph: i });
        } else if (i === 4 && AIR_CAPTAIN[capB]) {
          const cb = AIR_CAPTAIN[capB];
          g.crew.push({ art: cb.id, cap: capB, x, y, z, h: (cb.h || 90) * 0.95, flip: false, ph: i });
        } else {
          const cr = AIR_CREW[(i * 5 + 3) % AIR_CREW.length];
          g.crew.push({ art: cr.id, x, y, z, h: cr.h || 56, flip: false, ph: i * 1.3 });
        }
      });
    }
    return g;
  };

  const railOfIronclad = (dz) => {
    const s = skySAt(dz);
    return [SKY_OX - skyBeam(s) + 0.1, SKY_OY + dz, (skySheer(s) + 0.1) * SKY_LV];
  };
  const railOfGalleon = (g, idx) => {
    const G0 = castle3dState()?.anchors?.galleon;
    const list = G0?.railTop || G0?.rail || [[3.2, 2.4, -4], [3.2, 2.4, 0], [3.2, 2.4, 4]];
    const [x, y, z] = list[idx % list.length];
    return [g.x + x, g.y + z, g.lv + y * SKY_LV];
  };

  const director = {
    stagePreview,

    launchSkiff(opts = {}) {
      const boatKind = opts.boatKind || 'cutter';
      const count = Math.max(0, Math.min(10, Number(opts.count ?? 4)));
      const rank = opts.rank || 'normal';
      const captainId = opts.captainId || '';

      if (boatKind === 'flyover') {
        const b = { kind: 'gasbag', dz: 0, x: SKY_OX - 3, y: SKY_OY + 34, lv: 95, alpha: 0, ramp: 0, phase: 0, st: 'fly', t: 0, crew: [], drops: count, rank };
        S.boats.push(b);
        return b;
      }

      const kind = ['cutter', 'hauler', 'gasbag'].includes(boatKind) ? boatKind : 'cutter';
      const dz = dockZOf(opts.dock || 'auto');
      for (const old of S.boats) {
        if (!old._preview && old.dz === dz && old.st === 'dock' && !old.crew.length) { old.st = 'out'; old.t = 0; }
      }
      const dock = dockSpot(kind, dz);
      const from = { x: dock.x - 16, y: dock.y + 18, lv: dock.lv + 40 };
      const crew = [];
      if (captainId && AIR_CAPTAIN[captainId]) {
        const cap = AIR_CAPTAIN[captainId];
        const sp = dock.deck[0] || [0, 0, 0];
        crew.push({ art: cap.id, captain: true, captainId, castKey: opts.castKey || captainId, x: sp[0], z: sp[2], h: cap.h || 90, flip: false, ph: 0 });
      }
      for (let i = 0; i < count; i++) {
        const c = AIR_CREW[(i * 7 + Math.abs(Math.round(dz))) % AIR_CREW.length];
        const sp = dock.deck[(i + 1) % dock.deck.length] || [0, 0, 0];
        crew.push({ crewDef: c, art: c.id, rank: i === 0 && rank !== 'normal' ? rank : 'normal', x: sp[0] + (i % 2 ? 0.14 : -0.14), z: sp[2], h: c.h || 56, flip: false, ph: i * 1.4 });
      }
      const b = {
        kind, dz, x: from.x, y: from.y, lv: from.lv, alpha: 0, ramp: 0, phase: Math.floor(Math.random() * 4),
        st: 'in', t: 0, dock, from, wait: 0.65, hold: 2.5, leap: true, crew,
      };
      S.boats.push(b);
      return b;
    },

    controlFlagship(opts = {}) {
      const action = opts.action || 'arrive';
      if (action === 'depart') {
        if (S.galleon) { S.galleon.leaving = true; S.galleon.t2 = 0; S.galleon._preview = false; }
        S.hooks.length = 0;
        return S.galleon;
      }
      const closeNow = action === 'close';
      const g = buildGalleonObj(opts.captainA || 'ap_admiral_veyl', opts.captainB || 'ap_red_gale_corsair', closeNow);
      g.speed = 1 / Math.max(0.5, Number(opts.dur) || 3.2);
      S.galleon = g;
      if (!closeNow) S.bank = { x: g.far.x, y: g.far.y, lv: g.far.lv, t: 0 };
      return g;
    },

    controlHooks(opts = {}) {
      const action = opts.action || 'throw_and_lash';
      if (action === 'release') {
        for (const h of S.hooks) {
          const [x, y, l] = h.to;
          sparkle(x, y, l * HS, '#ffd080', 10, 0.4);
        }
        S.hooks.length = 0;
        sfx('thud', 0.6);
        camera.shake(5);
        return;
      }
      const targetVessel = opts.vesselKey
        ? S.boats.find((b) => b._vesselKey === opts.vesselKey || b._vesselId === opts.vesselKey)
        : null;
      if (!targetVessel && !S.galleon) director.controlFlagship({ action: 'close' });
      const g = targetVessel || S.galleon;
      if (!g) return;
      g.alpha = 1;
      if (!targetVessel && g.close) { g.k = 1; g.x = g.close.x; g.y = g.close.y; g.lv = g.close.lv; }

      const vRail = (idx) => {
        if (g.galleon) return railOfGalleon(g, idx);
        return [g.x + 1.8, g.y + (idx - 1.5) * 1.2, g.lv + 2];
      };

      if (action === 'taut') {
        for (const h of S.hooks) { h.t = 1; h.taut = 1; }
        if (g.close) g.close.x = SKY_OX - 14.0;
        else g.x += 1.0;
        camera.shake(8);
        sfx('thud', 0.9);
        return;
      }

      const cnt = Math.max(2, Math.min(6, Number(opts.count ?? 4)));
      const baseZ = clamp((g.y || SKY_OY) - SKY_OY, -12, 12);
      const dzList = g.galleon ? [-7, -2.5, 2.5, 7.5, 11.5, -10] : [baseZ - 2, baseZ, baseZ + 2, baseZ - 3.5, baseZ + 3.5, baseZ + 1];
      const created = [];
      for (let i = 0; i < cnt; i++) {
        const dz = clamp(dzList[i % dzList.length], -12, 14);
        const fromVessel = i % 2 === 1;
        const pShip = railOfIronclad(dz);
        const pVes = vRail(i);
        const hk = { from: fromVessel ? pVes : pShip, to: fromVessel ? pShip : pVes, t: 0, taut: 0, delay: i * 0.16 };
        S.hooks.push(hk);
        created.push(hk);
      }
      if (action === 'throw_and_lash') {
        later(0.72 + cnt * 0.16, () => {
          for (const h of created) { h.t = 1; h.taut = 1; }
          if (g.close) g.close.x = SKY_OX - 14.0;
          else g.x += 0.9;
          camera.shake(8);
          sfx('thud', 0.95);
        });
      }
    },

    fireVolley(opts = {}) {
      const action = opts.action || 'flagship_volley';
      if (action === 'captain_leap' || action === 'captain_swing') {
        if (!S.galleon) director.controlFlagship({ action: 'close' });
        const g = S.galleon;
        const capId = opts.captainId || 'ap_admiral_veyl';
        g.crew = (g.crew || []).filter((c) => c.cap !== capId);
        const from = railOfGalleon(g, action === 'captain_swing' ? 4 : 2);
        const dz = Number(opts.dz ?? (action === 'captain_swing' ? 2.4 : -1.2));
        const to = nearDeck(...tileOf(-1.8, dz));
        const mast = () => (S.galleon ? [S.galleon.x, S.galleon.y - 0.8, S.galleon.lv + 17 * SKY_LV] : [SKY_OX - 15, SKY_OY, 40]);
        return spawnAirCaptain(capId, from, to, opts.castKey || capId, action === 'captain_swing' ? 'swing' : 'leap', mast);
      }

      const count = Math.max(1, Math.min(8, Number(opts.count ?? 4)));
      const A0 = castle3dState()?.anchors;
      for (let i = 0; i < count; i++) {
        later(i * 0.28, () => {
          if (action === 'ironclad_volley') {
            const ports = A0?.ship?.ports?.filter((q) => q[3] < 0) || [[-5.5, -1.2, 0]];
            const [px, py, pz] = ports[i % ports.length];
            const from = [SKY_OX + px, SKY_OY + pz, py * SKY_LV];
            const g = S.galleon;
            const to = g ? [g.x + 2, g.y + (i - 1.5) * 3, g.lv + 14] : [SKY_OX - 18, SKY_OY + (i - 1.5) * 3, 20];
            S.shots.push({
              from, to, t: 0, dur: 1.05, arc: 85,
              onHit: () => {
                burst(to[0], to[1], to[2] * HS, 'fire', 16, 4);
                smoke(to[0], to[1], to[2] * HS, '#3a3230', 6, 15);
                sfx('explode', 0.55);
                camera.shake(4);
                if (S.galleon && S.galleon.burn.length < 4) S.galleon.burn.push([1.8, 1.2, (i - 1.5) * 2.5]);
              },
            });
            vfxSpawn({ type: 'glow', x: from[0], y: from[1], z: from[2] * HS, life: 0.25, size: 24, size1: 4, color: '#ffd080', add: true });
            sfx('explode', 0.35);
          } else {
            const g = S.galleon;
            const gPorts = A0?.galleon?.ports || [[3.0, 1.0, -3], [3.0, 1.0, 2]];
            const [gx, gy, gz] = gPorts[i % gPorts.length];
            const from = g ? [g.x + gx, g.y + gz, g.lv + gy * SKY_LV] : [SKY_OX - 22, SKY_OY + (i - 1.5) * 3.5, 28];
            const tgt = nearDeck(SKY_OX + (Math.random() - 0.5) * 8, SKY_OY + (Math.random() - 0.5) * 18);
            const to = [tgt[0], tgt[1], lvAt(tgt[0], tgt[1])];
            addEffect(new Telegraph({ kind: 'circle', x: to[0], y: to[1], r: 1.5, dur: 1.25 }), 'ground');
            S.shots.push({
              from, to, t: 0, dur: 1.25, arc: 95,
              onHit: () => {
                if (!G.cine) aoe(world, null, to[0], to[1], 1.5, 18, 'fire', { team: 'player', knock: 0.7 });
                burst(to[0], to[1], 10, 'fire', 18, 4);
                smoke(to[0], to[1], 8, '#3a3230', 6, 14);
                addEffect(new Ring(to[0], to[1], 0.2, 2.3, 0.4, '#ffb060', 5));
                camera.shake(6);
                sfx('explode', 0.6);
              },
            });
            vfxSpawn({ type: 'glow', x: from[0], y: from[1], z: from[2] * HS, life: 0.25, size: 24, size1: 4, color: '#ffd080', add: true });
            sfx('explode', 0.35);
          }
        });
      }
    },

    syncPlacedVessels({ inEditor = false } = {}) {
      S.boats = S.boats.filter((b) => !b._placed);
      S.hooks = S.hooks.filter((h) => !h._placed);
      const vessels = doc.grid?.airship?.vessels || [];
      for (const av of vessels) {
        const isGal = av.kind === 'galleon';
        const dock = isGal ? null : dockSpot(av.kind || 'cutter', (av.y || SKY_OY) - SKY_OY);
        const crew = [];
        const cnt = Math.max(0, Math.min(8, Number(av.crewCount ?? 4)));
        if (isGal) {
          const G0 = castle3dState()?.anchors?.galleon;
          (G0?.rail || []).slice(0, Math.max(cnt, av.captainId ? 3 : cnt)).forEach(([x, y, z], i) => {
            if (i === 2 && av.captainId && AIR_CAPTAIN[av.captainId]) {
              const cp = AIR_CAPTAIN[av.captainId];
              crew.push({ art: cp.id, cap: av.captainId, x, y, z, h: (cp.h || 90) * 0.95, flip: false, ph: i });
            } else if (i < cnt) {
              const cr = AIR_CREW[(i * 5 + 1) % AIR_CREW.length];
              crew.push({ art: cr.id, x, y, z, h: cr.h || 56, flip: false, ph: i * 1.2 });
            }
          });
        } else {
          const spots = dock?.deck || [[0, 0, 0]];
          if (av.captainId && AIR_CAPTAIN[av.captainId]) {
            const cp = AIR_CAPTAIN[av.captainId];
            crew.push({ art: cp.id, cap: av.captainId, x: spots[0]?.[0] || 0, z: spots[0]?.[2] || 0, h: cp.h || 90, flip: false, ph: 0 });
          }
          for (let i = 0; i < cnt; i++) {
            const cr = AIR_CREW[(i * 7 + 2) % AIR_CREW.length];
            const sp = spots[(i + 1) % spots.length] || [0, 0, 0];
            crew.push({ art: cr.id, x: sp[0], z: sp[2], h: cr.h || 56, flip: false, ph: i * 1.3 });
          }
        }
        const hiddenNow = !!av.startHidden && !inEditor;
        const b = {
          _placed: true,
          _vesselId: av.id,
          _vesselKey: av.castKey || av.id,
          galleon: isGal,
          kind: isGal ? 'galleon' : (av.kind || 'cutter'),
          x: Number(av.x ?? (SKY_OX - 10)),
          y: Number(av.y ?? SKY_OY),
          baseLv: Number(av.lv ?? (isGal ? 6 : 12)),
          lv: Number(av.lv ?? (isGal ? 6 : 12)),
          alpha: hiddenNow ? 0 : (av.startHidden && inEditor ? 0.52 : 1),
          ramp: av.rampDown !== false ? 1 : 0,
          phase: 0,
          st: 'placed',
          t: 0,
          burn: [],
          crew,
        };
        S.boats.push(b);

        const hkCnt = Math.max(0, Math.min(6, Number(av.hooks ?? 0)));
        if (hkCnt > 0 && !hiddenNow) {
          const baseZ = clamp((b.y || SKY_OY) - SKY_OY, -12, 12);
          for (let i = 0; i < hkCnt; i++) {
            const dz = clamp(isGal ? [-7, -2.5, 2.5, 7.5, 11.5, -10][i % 6] : (baseZ + (i - (hkCnt - 1) / 2) * 2.2), -12, 14);
            const pShip = railOfIronclad(dz);
            const pVes = isGal ? railOfGalleon(b, i) : [b.x + 1.8, b.y + (i - (hkCnt - 1) / 2) * 1.1, b.lv + 2];
            S.hooks.push({ from: pShip, to: pVes, t: 1, taut: 1, _placed: true, _vesselId: av.id });
          }
        }
      }
    },

    hasVessel(keyRaw) {
      const k = String(keyRaw || '').replace(/^@/, '');
      return S.boats.some((b) => b._placed && (b._vesselKey === k || b._vesselId === k));
    },

    vesselScreenPos(keyRaw) {
      const k = String(keyRaw || '').replace(/^@/, '');
      const b = S.boats.find((q) => q._placed && (q._vesselKey === k || q._vesselId === k));
      return b ? skyTilePx(b.x, b.y, b.lv + (b.galleon ? 18 : 8)) : null;
    },

    sailPlacedVessel(keyRaw, opts = {}) {
      const k = String(keyRaw || '').replace(/^@/, '');
      const b = S.boats.find((q) => q._placed && (q._vesselKey === k || q._vesselId === k));
      if (!b) return null;
      const toX = Number.isFinite(opts.toX) ? opts.toX : b.x;
      const toY = Number.isFinite(opts.toY) ? opts.toY : b.y;
      const toLv = Number.isFinite(opts.toLv) ? opts.toLv : b.baseLv;
      if (opts.fromClouds) {
        b.x = toX - 18;
        b.y = toY + 14;
        b.lv = toLv + 28;
        b.alpha = 0.05;
        if (b.galleon) S.bank = { x: b.x, y: b.y, lv: b.lv, t: 0 };
      } else {
        b.alpha = 1;
      }
      b._sail = {
        fromX: b.x, fromY: b.y, fromLv: b.lv,
        toX, toY, toLv,
        t: 0,
        dur: Math.max(0.3, Number(opts.dur) || 2.2),
      };
      return b;
    },

    setStagePreview(next = {}) {
      Object.assign(stagePreview, next);
      director.restoreEditorPreview();
    },

    restoreEditorPreview() {
      timers.length = 0;
      S.shots.length = 0;
      S.ropes.length = 0;
      S.bank = null;
      for (const m of spawnedByDirector) world.remove(m);
      spawnedByDirector.clear();

      S.boats = [];
      S.galleon = null;
      S.hooks = [];
      director.syncPlacedVessels({ inEditor: !world.player });

      if (stagePreview.skiffs) {
        for (const [kind, dz] of [['cutter', -6], ['hauler', 3]]) {
          const dock = dockSpot(kind, dz);
          const cr1 = AIR_CREW[0], cr2 = AIR_CREW[2];
          S.boats.push({
            _preview: true, kind, dz, x: dock.x, y: dock.y, lv: dock.lv, alpha: 1, ramp: 1, phase: 0, st: 'dock', t: 2, dock, from: dock, wait: 999, hold: 999, leap: false,
            crew: [
              { art: cr1.id, x: dock.deck[0]?.[0] || 0, z: dock.deck[0]?.[2] || 0, h: 55, flip: false, ph: 0 },
              { art: cr2.id, x: dock.deck[1]?.[0] || -0.4, z: dock.deck[1]?.[2] || 0.6, h: 55, flip: false, ph: 1.5 },
            ],
          });
        }
      }
      if (stagePreview.flagship || stagePreview.hooks) {
        const g = buildGalleonObj('ap_admiral_veyl', 'ap_red_gale_corsair', true);
        g._preview = true;
        if (stagePreview.hooks) g.close.x = SKY_OX - 14.0;
        g.x = g.close.x;
        S.galleon = g;
      }
      if (stagePreview.hooks && S.galleon) {
        const g = S.galleon;
        [-6, -1.5, 3.5, 8.5].forEach((dz, i) => {
          S.hooks.push({ from: railOfIronclad(dz), to: railOfGalleon(g, i), t: 1, taut: 1, _preview: true });
        });
      }
    },

    flagshipScreenPos() {
      const g = S.galleon;
      return g ? skyTilePx(g.x, g.y, g.lv + 18) : skyTilePx(SKY_OX - 16, SKY_OY + 1, 20);
    },

    skiffScreenPos() {
      const b = S.boats[S.boats.length - 1];
      return b ? skyTilePx(b.x, b.y, b.lv + 8) : skyTilePx(SKY_OX - 9, SKY_OY + 3, 12);
    },

    gateScreenPos() {
      return skyTilePx(SKY_OX + 0.5, SKY_OY + SKY_GATE.z, (SKY_FC_H + 1.4) * SKY_LV);
    },

    tick(dt) {
      if (!dt) return;
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt;
        if (timers[i].t <= 0) {
          const fn = timers[i].fn;
          timers.splice(i, 1);
          fn();
        }
      }

      if (S.gateFlash > 0) S.gateFlash = Math.max(0, S.gateFlash - dt * 1.2);
      if (S.bank) {
        S.bank.t += dt;
        if (S.bank.t > 8) S.bank = null;
      }

      const g = S.galleon;
      if (g && !g._preview) {
        g.alpha = Math.min(1, g.alpha + dt * 0.65);
        if (g.leaving) {
          g.t2 = (g.t2 || 0) + dt;
          const k = clamp(g.t2 / 6.5, 0, 1);
          g.x = g.close.x - k * k * 38;
          g.y = g.close.y + k * 28;
          g.lv = g.close.lv - k * 56;
          g.alpha = 1 - k;
          if (k >= 1) S.galleon = null;
        } else {
          g.k = Math.min(1, (g.k || 0) + dt * (g.speed || 0.32));
          const k = easeOut(clamp(g.k, 0, 1)), bob = Math.sin(G.time * 0.9) * 1.1;
          g.x = g.far.x + (g.close.x - g.far.x) * k;
          g.y = g.far.y + (g.close.y - g.far.y) * k;
          g.lv = g.far.lv + (g.close.lv - g.far.lv) * k + bob;
        }
      } else if (g && g._preview) {
        g.lv = g.close.lv + Math.sin(G.time * 0.9) * 0.9;
      }

      for (let i = S.boats.length - 1; i >= 0; i--) {
        const b = S.boats[i];
        if (b._placed) {
          if (b._sail) {
            const sl = b._sail;
            sl.t += dt;
            const q = easeOut(clamp(sl.t / sl.dur, 0, 1));
            b.x = sl.fromX + (sl.toX - sl.fromX) * q;
            b.y = sl.fromY + (sl.toY - sl.fromY) * q;
            b.baseLv = sl.fromLv + (sl.toLv - sl.fromLv) * q;
            b.alpha = Math.min(1, b.alpha + dt * 1.4);
            if (q >= 1) b._sail = null;
          }
          if (b.alpha > 0) {
            b.lv = (b.baseLv ?? b.lv) + Math.sin(G.time * 1.2 + i) * 0.6;
          }
          continue;
        }
        if (b._preview) {
          b.lv = b.dock.lv + Math.sin(G.time * 1.3 + i) * 0.5;
          continue;
        }
        b.t += dt;
        if (b.st === 'fly') {
          b.y -= dt * 5.8;
          b.lv = 95 + Math.sin(b.t * 0.8) * 2;
          b.alpha = clamp(Math.min(b.t / 1.0, (b.y - (SKY_OY - 30)) / 6), 0, 1);
          if (b.drops > 0 && b.y < SKY_OY + 12 && ((b.dropT = (b.dropT ?? 0) - dt) <= 0)) {
            b.dropT = 0.42;
            b.drops--;
            const to = nearDeck(b.x + 3 + (Math.random() - 0.5) * 4, b.y + (Math.random() - 0.5) * 2);
            spawnAirBoarder(null, b.rank || 'normal', null, to, 'rope', () => [b.x + 0.4, b.y + 0.2, b.lv]);
          }
          if (b.y < SKY_OY - 32) S.boats.splice(i, 1);
          continue;
        }
        const bob = Math.sin(G.time * 1.3 + b.phase) * 0.75;
        if (b.st === 'in') {
          const k = easeOut(clamp(b.t / 3.4, 0, 1));
          b.x = b.from.x + (b.dock.x - b.from.x) * k;
          b.y = b.from.y + (b.dock.y - b.from.y) * k;
          b.lv = b.from.lv + (b.dock.lv - b.from.lv) * k + bob;
          b.alpha = clamp(b.t / 0.7, 0, 1);
          if (k >= 1) { b.st = 'dock'; b.t = 0; sfx('thud', 0.6); camera.shake(3); }
        } else if (b.st === 'dock') {
          b.lv = b.dock.lv + bob * 0.4;
          b.ramp = Math.min(1, b.t / 0.45);
          if (b.leap && b.crew.length && b.t > b.wait && ((b.nextLeap = (b.nextLeap ?? 0) - dt) <= 0)) {
            b.nextLeap = 0.32;
            const c = b.crew.shift();
            const s = skySAt(b.dz);
            const to = nearDeck(...tileOf(-(skyInner(s) - 1.1) + Math.random() * 2.4, b.dz + (Math.random() - 0.5) * 2.8));
            const from = [b.x + (c.x || 0), b.y + (c.z || 0), b.lv];
            if (c.captain) spawnAirCaptain(c.captainId, from, to, c.castKey, 'leap');
            else spawnAirBoarder(c.crewDef, c.rank, from, to, 'leap');
          }
          if (!b.crew.length && b.t > b.wait + 0.6) {
            b.holdT = (b.holdT || 0) + dt;
            if (b.holdT > b.hold) { b.st = 'out'; b.t = 0; }
          }
        } else if (b.st === 'out') {
          const k = clamp(b.t / 3.5, 0, 1), e = k * k;
          b.ramp = 0;
          b.x = b.dock.x + (b.from.x - b.dock.x) * e;
          b.y = b.dock.y + (b.from.y - b.dock.y) * e;
          b.lv = b.dock.lv + (b.from.lv - b.dock.lv) * e;
          b.alpha = 1 - k;
          if (k >= 1) S.boats.splice(i, 1);
        }
      }

      for (const h of S.hooks) {
        if (h._preview) continue;
        if (h.delay > 0) { h.delay -= dt; continue; }
        if (h.t < 1) {
          h.t = Math.min(1, h.t + dt * 1.75);
          if (h.t >= 1 && !h.hit) {
            h.hit = true;
            sfx('thud', 0.5);
            sparkle(h.to[0], h.to[1], h.to[2] * HS, '#ffe0a0', 6, 0.3);
          }
        }
      }

      for (let i = S.shots.length - 1; i >= 0; i--) {
        const sh = S.shots[i];
        sh.t += dt;
        if (sh.t >= sh.dur) {
          S.shots.splice(i, 1);
          sh.onHit?.();
        }
      }
    },
  };

  return director;
}
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
  if (cat === '3d_alpine' && biomeId === 'mountainside') {
    townTiles = mountainFloorList();
  } else if (useTownFloors) {
    townTiles = makeTownTiles();
  } else if (biomeId === 'act2_town' || (biomeId === 'sea_of_sand' && cat !== '3d_dunes')) {
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
    // Ensure all baked 3D hull, keel, bowsprit, outrigger & bridge-spire slices outside walkable L.ship render cleanly
    const st = castle3dState();
    const L = shipLayout();
    for (const partMap of [st?.base, st?.over]) {
      if (!partMap) continue;
      for (const idx of partMap.keys()) {
        if (idx >= 0 && idx < N && !L.ship[idx]) {
          map.t[idx] = 1;
          map.block[idx] = 1;
          map.c3struct[idx] = 1;
        }
      }
    }
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < N; i++) if (map.t[i] === 1) { lo = Math.min(lo, map.hgt[i]); hi = Math.max(hi, map.hgt[i]); }
    if (Number.isFinite(lo)) { map.minLevel = lo; map.maxLevel = hi; map.baseLevel = lo - 40; }
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
    if (pr.caveProp === 'sprite') {
      const spr = resolvePropSprite(pr, tileset, biomeId);
      if (spr) props.push({ ...pr, spr });
      continue;
    }
    if (pr.caveProp || pr.kind === 'decor') {
      props.push({ ...pr, k: pr.k || 1 });
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
    torches: (cat === '3d_caverns' || cat === '3d_dunes') ? [] : structuredClone(doc.architecture?.torches || []),
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

  // Shared 3D Heightfield Raycaster (Walkable-floor-first in Auto Z; Plane-locked in Editor Depth Lock!)
  const makeHeightfieldPick = ({ lo, hi, lvPerUnit, groundFn, inRegionFn }) => (wx, wy) => {
    const at = (hh) => {
      const yy = wy + hh * VZ;
      return [(wx / HW + yy / HH) / 2, (yy / HH - wx / HW) / 2];
    };
    const ed = !world.player ? world.cave?.editor : null;
    if (ed?.lockDepth) {
      const hLock = ed.depthLv / lvPerUnit;
      const band = Math.max(1.0, ((ed.sliceBand || 24) / lvPerUnit) * 0.4);
      for (let hh = hLock + band; hh >= hLock - band; hh -= 0.08) {
        const [x, y] = at(hh);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (inRegionFn && !inRegionFn(x)) continue;
        const ti = Math.floor(y) * w + Math.floor(x);
        if ((map.t[ti] === 1 || (map.wet && map.wet[ti] > 0)) && groundFn(x, y) >= hh) return [x, y];
      }
      return at(hLock);
    }

    let firstRock = null;
    let inRock = false;
    for (let hh = hi; hh >= lo; hh -= 0.08) {
      const [x, y] = at(hh);
      if (x < 0 || y < 0 || x >= w || y >= h || (inRegionFn && !inRegionFn(x)) || groundFn(x, y) < hh) {
        inRock = false;
        continue;
      }
      const ti = Math.floor(y) * w + Math.floor(x);
      const isOpen = map.t[ti] === 1 || (map.wet && map.wet[ti] > 0);
      if (isOpen) return [x, y];
      if (!inRock && !firstRock) firstRock = [x, y];
      inRock = true;
    }
    if (firstRock) return firstRock;
    const refH = ed ? groundFn(ed.focusTile[0], ed.focusTile[1]) : 0;
    return at(refH);
  };

  // Bind 3D / 2.5D Viewport & Scene Hooks
  if (cat === '3d_caverns') {
    const cv = compileCaveFieldFromDoc(doc);
    map.smoothField = true;
    await buildCave3D(cv);
    const LV = VZ / 4;
    const floorLo = (map.minLevel || 0) / LV - 3, floorHi = (map.maxLevel || 32) / LV + 6;
    const groundT = (x, y) => {
      const ti = map.tileIdx(x, y);
      const s = map.wet && map.wet[ti] ? cv.lvl[ti] : NaN;
      const h0 = cv.H2(x, y);
      return !Number.isNaN(s) && s > h0 ? s : h0;
    };
    const cr = (world.cave = {
      cv,
      v: cv.v,
      lvPerUnit: LV,
      editor: {
        focusTile: [doc.entities.start[0], doc.entities.start[1]],
        lockDepth: false,
        depthLv: Math.round(groundT(...doc.entities.start) * LV),
        sliceMode: false,
        sliceBand: 24,
      },
      focus: [doc.entities.start[0], groundT(...doc.entities.start), doc.entities.start[1]],
      cut: true,
      elev: (x, y) => groundT(x, y) * VZ,
      cutAt: () => false,
      pick: makeHeightfieldPick({ lo: floorLo, hi: floorHi, lvPerUnit: LV, groundFn: groundT, inRegionFn: null }),
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
        if (p) {
          cr.focus[0] = p.x; cr.focus[1] = groundT(p.x, p.y); cr.focus[2] = p.y;
        } else if (cr.editor) {
          const [fx, fy] = cr.editor.focusTile;
          cr.focus[0] = fx;
          cr.focus[1] = cr.editor.lockDepth ? (cr.editor.depthLv / LV) : groundT(fx, fy);
          cr.focus[2] = fy;
        }
        const vr = camera.viewRect(80);
        const torchCol = cv.v?.torch || '#ffb060';
        for (const t of cv.torches || []) {
          const px = isoX(t.x, t.y), py = isoY(t.x, t.y);
          if (px < vr.x0 || px > vr.x1 || py < vr.y0 - 80 || py > vr.y1 + 80) continue;
          const z = (t.h - groundT(t.x, t.y)) * VZ + 16;
          addLight(t.x, t.y, 6.2, 0.9, z, torchCol);
        }
        if (cv.plunge) addLight(cv.plunge[0], cv.plunge[1], 8.5, 0.75, 24, cv.v?.hi || '#7fd0ff');
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
        const curS = clamp(tw.curNorm ?? 0.05, 0, 1) * g.L;
        let x = clamp(world.player ? world.player.x : (g.X1 - curS), g.XT, g.XB), y = g.YR + g.w / 2;
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
        const norm = clamp(norm01, 0, 1);
        tw.curNorm = norm;
        const s = norm * g.L;
        const ty = g.YR + g.w / 2;
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
            tw.curNorm = clamp(s / g.L, 0, 1);
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
    const alpFloors = biomeId === 'mountainside'
      ? (townTiles || mountainFloorList())
      : biomeTileSet(resolveBiome('snowy_summit')).floors;
    const av = compileAlpineSpecFromDoc(doc, alpFloors.length ? alpFloors : tileset.floors);
    map.hgt = fieldLevels(av.F, w, h, layers.hgt, layers.t);
    map.smoothField = true;
    map.hopArc = true;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < N; i++) { lo = Math.min(lo, map.hgt[i]); hi = Math.max(hi, map.hgt[i]); }
    map.minLevel = lo; map.maxLevel = hi;
    const cr = alpineHook(world, av, { zoom: 1 });
    cr.lvPerUnit = ALP_LV;
    cr.editor = {
      focusTile: [doc.entities.start[0], doc.entities.start[1]],
      lockDepth: false,
      depthLv: Math.round(av.F.H2(...doc.entities.start) * ALP_LV),
      sliceMode: false,
      sliceBand: 28,
    };
    const origPick = cr.pick.bind(cr);
    cr.pick = (wx, wy) => {
      if (!world.player && cr.editor?.lockDepth) {
        const hLock = cr.editor.depthLv / ALP_LV;
        const yy = wy + hLock * VZ;
        return [(wx / HW + yy / HH) / 2, (yy / HH - wx / HW) / 2];
      }
      return origPick(wx, wy);
    };
    const origFrame = cr.frame.bind(cr);
    cr.frame = (dt, snap = false) => {
      if (world.player) {
        origFrame(dt, snap);
      } else if (cr.editor) {
        const [fx, fy] = cr.editor.focusTile;
        cr.focus[0] = fx;
        cr.focus[1] = cr.editor.lockDepth ? (cr.editor.depthLv / ALP_LV) : av.F.H2(fx, fy);
        cr.focus[2] = fy;
      }
    };
    cr.dispose = disposeAlpine3D;
    setElevation(cr.elev, cr.pick);
  } else if (cat === '3d_dunes') {
    const dv = compileDunesFieldFromDoc(doc);
    map.smoothField = true;
    await buildDunes3D(dv);
    const LV = VZ / 4;
    const floorLo = (map.minLevel || -200) / LV - 4, floorHi = (map.maxLevel || 40) / LV + 10;
    const groundT = (x, y) => {
      const ti = map.tileIdx(x, y);
      const s = map.wet && map.wet[ti] ? dv.lvl[ti] : NaN;
      const h0 = dv.H2(x, y);
      return !Number.isNaN(s) && s > h0 ? s : h0;
    };
    if (opts.isEditor && !world.player) {
      openSeal('door');
    }
    const cr = (world.cave = {
      dv,
      v: dv.v,
      lvPerUnit: LV,
      editor: {
        focusTile: [doc.entities.start[0], doc.entities.start[1]],
        lockDepth: false,
        depthLv: Math.round(groundT(...doc.entities.start) * LV),
        sliceMode: false,
        sliceBand: 24,
      },
      focus: [doc.entities.start[0], groundT(...doc.entities.start), doc.entities.start[1]],
      cut: true,
      inside: dv.inside(doc.entities.start[0]),
      inRegion: (x) => dv.inside(x) === cr.inside,
      elev: (x, y) => groundT(x, y) * VZ,
      pick: makeHeightfieldPick({
        lo: floorLo,
        hi: floorHi,
        lvPerUnit: LV,
        groundFn: groundT,
        inRegionFn: (x) => dv.inside(x) === cr.inside,
      }),
      horizon: (o) => (!cr.inRegion(o.x) ? -Infinity : null),
      drawProp(ctx, o) {
        if (!cr.inRegion(o.x)) return;
        const spr = o.caveProp === 'sprite' ? o.spr : duneSprite(o.caveProp, o.m || 0);
        if (!spr) return;
        const sc = o.caveProp === 'sprite' ? (o.k || 0.4) : (o.k || o.s || 1);
        const sx = isoX(o.x, o.y), sy = isoY(o.x, o.y) - (o.z || 0);
        const rx = sx + (o.flip ? -spr.ox - spr.w : spr.ox) * sc, ry = sy + spr.oy * sc;
        const rw = spr.w * sc, rh = spr.h * sc;
        if (o.flip) {
          ctx.save();
          ctx.translate(sx, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(spr.img, spr.sx || 0, spr.sy || 0, spr.w, spr.h, spr.ox * sc, ry, rw, rh);
          ctx.restore();
        } else {
          ctx.drawImage(spr.img, spr.sx || 0, spr.sy || 0, spr.w, spr.h, rx, ry, rw, rh);
        }
      },
      frame(dt) {
        const p = world.player;
        if (p) {
          cr.inside = dv.inside(p.x);
          cr.focus[0] = p.x; cr.focus[1] = groundT(p.x, p.y); cr.focus[2] = p.y;
          // Smoothly lower Pyramid door & tomb stone seals as the hero approaches cleared thresholds
          if (!cr.inside && dv.pyramid?.doorStep && Math.hypot(p.x - dv.pyramid.doorStep[0], p.y - dv.pyramid.doorStep[1]) < 9) {
            openSeal('door');
          }
          for (const sl of dv.seals || []) {
            if (!sl._opened && Math.hypot(p.x - sl.x, p.y - sl.y) < 5.5) {
              const nearFoe = world.creatures.some((c) => c.team === 'enemy' && !c.dead && c.awake && Math.hypot(c.x - p.x, c.y - p.y) < 12);
              if (!nearFoe) { sl._opened = true; openSeal(sl.k); }
            }
          }
        } else if (cr.editor) {
          const [fx, fy] = cr.editor.focusTile;
          cr.focus[0] = fx;
          cr.focus[1] = cr.editor.lockDepth ? (cr.editor.depthLv / LV) : groundT(fx, fy);
          cr.focus[2] = fy;
        }
        const vr = camera.viewRect(80);
        const torchCol = cr.inside ? (dv.v?.pyramid?.torch || '#ffb060') : '#ffb050';
        for (const t of dv.torches || []) {
          if (dv.inside(t.x) !== cr.inside) continue;
          const px = isoX(t.x, t.y), py = isoY(t.x, t.y);
          if (px < vr.x0 || px > vr.x1 || py < vr.y0 - 80 || py > vr.y1 + 80) continue;
          if (cr.inside || dv.v?.sky?.night || world.night) {
            const z = (t.h - groundT(t.x, t.y)) * VZ + (t.stand ? 60 : 16);
            addLight(t.x, t.y, t.stand ? 7 : 6, 0.92, z, torchCol);
          }
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
      ropes: [],
      blades: [],
      flash: 0,
      gateColor: '#ff5020',
      gateFlash: 0,
      windK: 1,
      fogR: 1,
      through: 0,
    };
    warmSky(world);
    useTerrain(map);
    world.skyDirector = createCustomSkyDirector(world, doc, biome, depth);
    world.skyDirector.syncPlacedVessels({ inEditor: !!opts.isEditor && !world.player });
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

  // Spawn Monsters & Bosses (including Multi-Stage 3D Raid & Hall Bosses)
  const lvl = depthLevel(depth);
  const isOpen3D = ['3d_dunes', '3d_caverns', '3d_tower', '3d_alpine', 'overworld', 'breach'].includes(cat);
  const raidBossList = [];
  world._generatingDungeon = true;
  let seq = 1;
  for (let si = 0; si < (doc.entities?.spawns || []).length; si++) {
    const s = doc.entities.spawns[si];
    if (s.rank === 'raid') {
      const tpl = RAID_BOSSES.find((b) => b.id === s.arch) || RAID_BOSSES[0];
      const bakedArena = doc.architecture?.raidArena;
      const roomBox = s.arenaRect || (doc.architecture?.rooms || []).find((r) => s.x >= r.x && s.y >= r.y && s.x <= r.x + r.w && s.y <= r.y + r.h);
      const arena = bakedArena && bakedArena.gate && !s.arenaRect
        ? structuredClone(bakedArena)
        : roomBox
          ? {
              type: 'arena',
              x: roomBox.x,
              y: roomBox.y,
              w: roomBox.w,
              h: roomBox.h,
              cx: roomBox.cx ?? (roomBox.x + roomBox.w / 2),
              cy: roomBox.cy ?? (roomBox.y + roomBox.h / 2),
              mx: roomBox.cx ?? (roomBox.x + roomBox.w / 2),
              my: roomBox.cy ?? (roomBox.y + roomBox.h / 2),
              pillars: [],
              gate: { x: -40, y0: -40, y1: -39 },
            }
          : {
              type: 'arena',
              x: s.x - 12,
              y: s.y - 10,
              w: 24,
              h: 20,
              cx: s.x - 4,
              cy: s.y,
              mx: s.x - 4,
              my: s.y,
              pillars: [],
              gate: isOpen3D
                ? { x: -40, y0: -40, y1: -39 }
                : { x: Math.max(2, Math.round(s.x - 12)), y0: Math.round(s.y - 1), y1: Math.round(s.y + 1) },
            };
      const m = makeRaidBoss(world, arena, depth, lvl + 3, {
        tpl,
        art: s.art || undefined,
        court: !isOpen3D && !(bakedArena && bakedArena.gate),
        rnd: () => rng.next(),
      });
      if (m) {
        m.x = s.x; m.y = s.y;
        m.netId = `c_raid_${si}`;
        m.idx = seq++;
        if (s.scale) m.scale = s.scale;
        if (s.hpK) { m.maxHp *= s.hpK; m.hp = m.maxHp; }
        if (isOpen3D && m.raid) m.raid.execT = Infinity;
        if (s.castKey) m.castKey = s.castKey;
        if (s.name) m.name = s.name;
        if (opts.freezeAI) m.awake = false;
        world.add(m);
        world.boss = m;
        raidBossList.push(m);
        if (bakedArena && !isOpen3D) world.raid = m.raid || arena;
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
      if (s.scale && i === 0) m.scale = s.scale;
      if (i === 0 && s.castKey) m.castKey = s.castKey;
      if (i === 0 && s.name) m.name = s.name;
      if (rk === 'boss') world.boss = m;
      if (opts.freezeAI) m.awake = false;
      world.add(m);
    }
  }
  world._generatingDungeon = false;

  // Portals (Town Portal + Exit + Intra-Map 3D Passages)
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

  // Intra-map Passage / Door Teleports (Pyramid Door <-> Tomb, Cavern Notch <-> Spiral Shaft, Tower Stairhead <-> Roof)
  let passageCooldown = 0;
  const teleportHeroTo = (destX, destY, labelText, colorHex = '#ffd060') => {
    const p = world.player;
    if (!p || p.dead) return;
    passageCooldown = 1.6;
    sfx('door', 0.75);
    const [nx, ny] = map.nudge(destX, destY, p.r || 0.35);
    p.x = nx; p.y = ny;
    p.path = null; p.moveTarget = null; p.attackTarget = null;
    for (const c of world.creatures) {
      if (c !== p && c.team === 'player' && !c.dead) {
        [c.x, c.y] = map.randomNear(nx, ny, 1.6);
        c.aggro = null; c.foe = null;
      }
    }
    map.flowFrom = [-9, -9];
    map.reveal(nx, ny, 16);
    if (world.cave) world.cave.frame?.(0, true);
    if (world.tower) world.tower.frame?.(0);
    camera.follow(nx, ny, 1, true);
    addEffect(new Column(nx, ny, colorHex, 0.85, 28, 220));
    burst(nx, ny, 18, 'arcane', 16, 3.5);
    if (labelText) floatText(nx, ny, 56, labelText, colorHex, 13);
  };

  const passageEndpoints = [];
  for (const psg of doc.entities?.passages || []) {
    if (!Array.isArray(psg.from) || !Array.isArray(psg.to)) continue;
    const col = psg.color || '#ffd060';
    const fwdLabel = psg.name || 'Passage';
    const mkEndpoint = (fx, fy, tx, ty, lbl) => {
      const ep = {
        x: fx,
        y: fy,
        type: 'passage',
        active: true,
        color: col,
        reach: 1.8,
        label: lbl,
        use: () => {
          if (psg.lockUntil === 'combat_clear') {
            const nearFoe = world.creatures.some((c) => c.team === 'enemy' && !c.dead && c.awake && Math.hypot(c.x - fx, c.y - fy) < 16);
            if (nearFoe) {
              floatText(fx, fy, 48, 'Defeat nearby foes first!', '#ff8a70', 12);
              return;
            }
          }
          teleportHeroTo(tx, ty, lbl, col);
        },
      };
      world.portals.push(ep);
      passageEndpoints.push(ep);
    };
    mkEndpoint(psg.from[0], psg.from[1], psg.to[0], psg.to[1], fwdLabel);
    if (psg.bidirectional) {
      mkEndpoint(psg.to[0], psg.to[1], psg.from[0], psg.from[1], `Return · ${fwdLabel}`);
    }
  }

  // Runtime tick hazard for Multi-Boss Raid HUD switching & walk-on Passage triggers
  if (passageEndpoints.length || raidBossList.length) {
    world.addHazard({
      keep: true,
      draw() {},
      update(dt) {
        if (world !== G.world) return false;
        const p = world.player;
        if (!p || p.dead) return true;
        if (passageCooldown > 0) passageCooldown = Math.max(0, passageCooldown - dt);
        else {
          for (const ep of passageEndpoints) {
            if (Math.hypot(p.x - ep.x, p.y - ep.y) < 1.05) {
              ep.use();
              break;
            }
          }
        }
        if (raidBossList.length) {
          const activeRaidBoss = raidBossList.find((b) => !b.dead && b.awake && Math.hypot(b.x - p.x, b.y - p.y) < 28);
          if (activeRaidBoss) {
            world.boss = activeRaidBoss;
            world.raid = activeRaidBoss.raid || null;
          } else if (world.boss && world.boss.dead) {
            world.raid = null;
          }
        }
        return true;
      },
    });
  }

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
