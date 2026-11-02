// MOUNTAINSIDE (docs/MOUNTAINSIDE.md): an expanded 80 x 80 height-mapped overworld. The foot of the mountain is
// the bottom-left edge (+y), the summit the top-right (y = 0), so the ground rises away from the camera and its
// cliffs face the climber. Seven cliff bands too tall to hop cross the slope; each is broken by one stair-stepped
// ramp alternating east and west, creating an epic winding switchback trail through diverse alpine zones.
// Heights are in levels (gfx/terrain.js HS px each); a body hops up `map.climb` levels and drops at most `map.drop`.
import { TileMap } from './map.js';
import { RNG } from '../core/util.js';
import { TW } from '../core/view.js';
import { biomeTileSet } from '../core/assets.js';
import { townObject } from './town.js';
import { overworldObject } from '../gfx/overworldart.js';
import { darkForestTree, darkTreeK } from '../gfx/darkforest.js';
import { mountainFloors, MF } from '../gfx/mountainart.js';
import { BIOME_BY_ID } from '../data/biomes.js';
import { rollLooks } from '../data/bestiary.js';

export const MW = 80, MH = 80;
const K = TW / 160;          // town-pack source tiles are 160 x 80
const X_MIN = 4, X_MAX = 74, Y_MIN = 4, Y_MAX = 75; // playable bounds: west ridge is x < 4, east precipice is x > 74
const CLIFF = [10, 20, 30, 40, 50, 60, 69]; // uphill distance (v = 79 - y) of each cliff band
const RAMP = [60, 18, 62, 16, 64, 18, 62];  // the column each band's ramp climbs
const TERRACE = [15, 25, 35, 45, 55, 65];   // hop-high terrace steps across each band between cliffs
export const START = [12.5, 73.5], SUMMIT = [64.5, 8.5];
const CLIMB = 4, DROP = 10; // levels of 4 px: a 16 px hop up, a 40 px drop

const h01 = (x, y, s) => {
  let h = Math.imul(x ^ 0x5bd1e995, 0x27d4eb2d) ^ Math.imul(y ^ s, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};
/** Smooth value noise in [0, 1) at a feature size of s tiles. */
const noiseFn = (seed) => (x, y, s) => {
  const gx = x / s, gy = y / s, x0 = Math.floor(gx), y0 = Math.floor(gy), sm = (t) => t * t * (3 - 2 * t);
  const u = sm(gx - x0), v = sm(gy - y0), salt = (seed + s * 131) | 0, r = (a, b) => h01(a, b, salt);
  return (r(x0, y0) * (1 - u) + r(x0 + 1, y0) * u) * (1 - v) + (r(x0, y0 + 1) * (1 - u) + r(x0 + 1, y0 + 1) * u) * v;
};

export function generateMountain(depth, biome, seed) {
  for (let k = 0; k < 8; k++) {
    const gen = build(depth, biome, (seed + k * 7919) >>> 0);
    if (gen) return gen;
  }
  throw new Error('Mountainside generator found no trail to the summit; seed ' + seed);
}

function build(depth, biome, seed) {
  const W = MW, H = MH, N = W * H, rng = new RNG(seed), noise = noiseFn(seed & 0xffff);
  const id = (x, y) => y * W + x, map = new TileMap(W, H);
  const hgt = new Int16Array(N), mat = new Int8Array(N).fill(-1);
  const rock = new Uint8Array(N); // ridge and outcrop tiles: bare rock
  const playable = (x, y) => x >= X_MIN && x <= X_MAX && y >= Y_MIN && y <= Y_MAX;

  const ph = CLIFF.map(() => [rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)]);
  const cliffAt = (k, x) => CLIFF[k] + Math.round(1.8 * Math.sin(x * 0.16 + ph[k][0]) + 0.9 * Math.sin(x * 0.38 + ph[k][1]));
  const rise = (k, x) => 9 + Math.round(2 * (1 + Math.sin(x * 0.28 + ph[k][2]))) + (k >= 4 ? 2 : 0); // 9..15 levels
  const band = (x, v) => { let b = 0; for (let k = 0; k < CLIFF.length; k++) if (v >= cliffAt(k, x)) b++; return b; };
  const onRamp = (x, v) => CLIFF.some((c, k) => Math.abs(x - RAMP[k]) <= 3 && v >= cliffAt(k, RAMP[k]) - 5 && v <= cliffAt(k, RAMP[k]) + 4);

  // ---- heights: the slope, the cliff bands (a stair where the ramp crosses), a lumpy surface, the west ridge
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = H - 1 - y, i = id(x, y);
    let lv = Math.floor(v * 0.65);
    // ramps lie in alternating columns, so each band provides a climbable stair
    const stair = (k, r) => Math.round(r * Math.min(1, Math.max(0, (v - (cliffAt(k, RAMP[k]) - 4)) / 8))); // ~2 levels a tile
    const onStair = (k) => Math.abs(x - RAMP[k]) <= 3;
    for (let k = 0; k < CLIFF.length; k++) {
      if (onStair(k)) lv += stair(k, rise(k, x));
      else if (v >= cliffAt(k, x)) lv += rise(k, x);
    }
    for (let k = 0; k < TERRACE.length; k++) {
      const tv = TERRACE[k] + Math.round(1.3 * Math.sin(x * 0.24 + ph[k % ph.length][1])), T = x % 7 === k % 7 ? CLIMB : CLIMB - 1;
      const j = CLIFF.findIndex((c, r) => onStair(r) && Math.abs(tv - cliffAt(r, RAMP[r])) <= 5);
      if (j >= 0) lv += stair(j, T); // a terrace meeting a ramp folds into its stair
      else if (v >= tv) lv += T;
    }
    if (!onRamp(x, v)) lv += Math.round((noise(x, y, 7) - 0.5) * 5);
    if (x < X_MIN) { lv += (X_MIN - x) * 9; rock[i] = 1; }
    hgt[i] = lv;
    if (!playable(x, y)) {
      map.t[i] = 0;       // void: outside playable mountain bounds
      map.block[i] = 1;   // blocked: strictly unpassable and unspawnable
    } else {
      map.t[i] = 1;
      map.block[i] = 0;
    }
  }

  const flatten = (cx, cy, r, lv = hgt[id(Math.floor(cx), Math.floor(cy))]) => {
    for (let y = Math.max(Y_MIN, Math.floor(cy - r)); y <= Math.min(Y_MAX, Math.ceil(cy + r)); y++)
      for (let x = Math.max(X_MIN, Math.floor(cx - r)); x <= Math.min(X_MAX, Math.ceil(cx + r)); x++)
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) hgt[id(x, y)] = lv;
    return lv;
  };
  flatten(START[0], START[1], 3.2);
  flatten(SUMMIT[0], SUMMIT[1], 5.5); // spacious summit arena for the Warden boss fight

  // ---- outcrops: crags too tall to hop and shelves exactly a hop up with chests on top
  const near = (x, y, p, r) => Math.hypot(x - p[0], y - p[1]) < r;
  const s0 = id(Math.floor(START[0]), Math.floor(START[1])), g0 = id(Math.floor(SUMMIT[0]), Math.floor(SUMMIT[1]));
  const seen = new Uint8Array(N), q = [];
  const connected = () => {
    seen.fill(0); q.length = 0; q.push(s0); seen[s0] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % W;
      if (i === g0) return true;
      for (const j of [x > X_MIN ? i - 1 : -1, x < X_MAX ? i + 1 : -1, i - W, i + W])
        if (j >= 0 && j < N && !seen[j] && !rock[j] && map.t[j] && Math.abs(hgt[j] - hgt[i]) <= CLIMB) { seen[j] = 1; q.push(j); }
    }
    return false;
  };
  const keepClear = (x, y) => near(x, y, START, 7) || near(x, y, SUMMIT, 8) || onRamp(Math.floor(x), H - 1 - Math.floor(y));
  const ledges = [];
  for (let n = 0, tries = 0; n < 40 && tries < 600; tries++) {
    const cx = rng.range(X_MIN + 3, X_MAX - 3), cy = rng.range(Y_MIN + 3, H - 4), ledge = ledges.length < 6 && n % 6 === 2;
    if (keepClear(cx, cy)) continue;
    const r = ledge ? rng.range(1.2, 1.8) : rng.range(0.8, 2.3), up = ledge ? CLIMB : rng.int(6, 14);
    const blob = [];
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if (playable(x, y) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r && !onRamp(x, H - 1 - y)) blob.push(id(x, y));
    if (!blob.length) continue;
    if (ledge) {
      // a flat shelf exactly a hop above the lowest ground round it
      const inBlob = new Set(blob);
      let ring = Infinity;
      for (const i of blob) for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && !inBlob.has(j) && (j % W) >= X_MIN && (j % W) <= X_MAX) ring = Math.min(ring, hgt[j]);
      for (const i of blob) hgt[i] = ring + CLIMB;
    } else {
      const lv0 = hgt[id(Math.floor(cx), Math.floor(cy))], was = blob.map((i) => [hgt[i], rock[i]]);
      for (const i of blob) { hgt[i] = Math.max(hgt[i], lv0 + up); rock[i] = 1; }
      if (!connected()) { blob.forEach((i, k) => { hgt[i] = was[k][0]; rock[i] = was[k][1]; }); continue; }
    }
    if (ledge) ledges.push([Math.floor(cx) + 0.5, Math.floor(cy) + 0.5]);
    n++;
  }
  for (let y = 0; y < H; y++) for (let x = X_MAX + 1; x < W; x++) hgt[id(x, y)] = hgt[id(X_MAX, y)]; // void keeps edge height
  map.hgt = hgt; map.climb = CLIMB; map.drop = DROP;

  // ---- the trail: the cheapest two-way hop path from the foot to the peak
  const cost = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  cost[s0] = 0;
  const open = [s0];
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (cost[open[k]] < cost[open[bi]]) bi = k;
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (done[cur]) continue;
    done[cur] = 1;
    if (cur === g0) break;
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!playable(nx, ny)) continue;
      const j = id(nx, ny), dh = Math.abs(hgt[j] - hgt[cur]);
      if (dh > CLIMB || done[j] || rock[j]) continue;
      const c = cost[cur] + 1 + dh * 0.6 + (nx < X_MIN + 3 || nx > X_MAX - 2 ? 2 : 0);
      if (c < cost[j]) { cost[j] = c; came[j] = cur; open.push(j); }
    }
  }
  if (!done[g0]) return null;
  const trail = [], onTrail = new Uint8Array(N);
  for (let c = g0; c >= 0; c = came[c]) { trail.push(c); onTrail[c] = 2; if (c === s0) break; }
  trail.reverse();
  for (const c of trail) {
    const x = c % W, y = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = id(x + dx, y + dy);
      if (playable(x + dx, y + dy) && !onTrail[j] && Math.abs(hgt[j] - hgt[c]) <= 2 && !rock[j]) onTrail[j] = 1;
    }
  }

  // ---- landmarks: Glacial Tarn on Tier 3
  const tarnCx = 42, tarnCy = H - 1 - 35, tarnR = 4.2;
  const inTarn = (x, y) => Math.hypot((x - tarnCx) * 1.15, y - tarnCy) <= tarnR;
  const tarnLv = hgt[id(tarnCx, tarnCy)];
  for (let y = Math.floor(tarnCy - tarnR); y <= Math.ceil(tarnCy + tarnR); y++) {
    for (let x = Math.floor(tarnCx - tarnR); x <= Math.ceil(tarnCx + tarnR); x++) {
      if (playable(x, y) && inTarn(x + 0.5, y + 0.5) && !onTrail[id(x, y)]) {
        hgt[id(x, y)] = tarnLv;
      }
    }
  }

  // ---- ground by zone: meadow at the foot, pine woodland, alpine terraces, scree, frost crags, snow summit
  const ZONE = [
    ['grass', 'meadow', 'petals'],       // 0: foot meadow
    ['deep_grass', 'ferns', 'moss'],     // 1: pine forest floor
    ['grass', 'alpine', 'dirt'],         // 2: lower terrace / base camp
    ['alpine', 'wash', 'moss'],          // 3: glacial tarn plateau
    ['alpine', 'dry_grass', 'lichen'],   // 4: mid scree slope
    ['dry_grass', 'scree', 'lichen'],    // 5: high crags & mine
    ['scree', 'stone', 'lichen'],        // 6: windswept ruined watchtower
    ['stone', 'snow', 'scree'],          // 7: summit snow peak
  ];
  const ROCK = ['stone', 'stone', 'vein', 'lichen'];
  const zoneOf = (x, y) => Math.min(7, band(x, H - 1 - y));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = id(x, y), z = zoneOf(x, y), n = noise(x, y, 6), m = noise(x + 31, y + 17, 3), q = noise(x + 77, y + 5, 9);
    const s = y + 1 < H ? hgt[i] - hgt[id(x, y + 1)] : 0, e = x < X_MAX ? hgt[i] - hgt[id(x + 1, y)] : 0;
    let name;
    if (inTarn(x + 0.5, y + 0.5) && !onTrail[i]) {
      name = Math.hypot((x - tarnCx) * 1.15, y - tarnCy) < 2.5 ? (m > 0.5 ? 'wash' : 'moss') : 'deep_grass';
    } else if (onTrail[i] === 2) {
      name = onRamp(x, H - 1 - y) && z < 7 ? 'steps' : z <= 1 ? 'dirt' : z <= 4 ? (m < 0.6 ? 'dirt' : 'gravel') : 'gravel';
    } else if (onTrail[i] === 1) {
      name = z <= 1 ? (m < 0.5 ? 'mud' : 'dirt') : z <= 4 ? (m < 0.5 ? 'dirt' : 'wash') : 'wash';
    } else if (rock[i] || Math.max(s, e) >= 9) {
      name = ROCK[Math.floor(n * ROCK.length)];
    } else {
      const [base, a, b] = ZONE[z];
      name = q > 0.7 ? a : n > 0.76 && m > 0.5 ? b : base;
    }
    mat[i] = MF[name] ?? 0;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) map.v[id(x, y)] = Math.max(0, mat[id(x, y)]);
  map.v[g0] = MF.cairn;

  // ---- props: trees, undergrowth, markers, set pieces
  const pack = biomeTileSet(BIOME_BY_ID.dark_forest), scat = new Map(pack.scatter.map((s) => [s.name, s]));
  const props = [], taken = new Uint8Array(N);
  const free = (x, y) => playable(x, y) && !taken[id(x, y)] && !onTrail[id(x, y)] && !keepClear(x + 0.5, y + 0.5) &&
    !ledges.some((l) => near(x + 0.5, y + 0.5, l, 2.0));
  const put = (spr, k, x, y, o = {}) => {
    if (!spr) return null;
    const p = { kind: 'scatter', x, y, spr, k, flip: o.flip ?? (spr.isometric ? false : rng.chance(0.5)), light: o.light || 0 };
    if (spr.tree) p.tree = true;
    props.push(p);
    return p;
  };
  const town = (name, x, y, o) => { const s = overworldObject(name) || townObject(name); return s && put(s, K * (s.pixelScale || 1), x, y, o); };
  const forest = (name, x, y, o = {}) => { const s = scat.get(name); return s && put(s, pack.k * (o.scale || 1), x, y, o); };
  const tall = (name, x, y, sc) => put(darkForestTree(name), darkTreeK(sc), x, y);
  const block = (x, y) => {
    const i = id(x, y);
    if (onTrail[i] === 2) return; // never block the trail spine
    taken[i] = 1;
    map.block[i] = 1;
  };
  const jit = () => rng.range(-0.18, 0.18);

  const TREES = [
    [['t_medium_fir', 'T'], ['t_scots_pine', 'T'], ['t_old_cedar', 'T'], ['spire_pine', 'D'], ['hanging_moss_fir', 'D'], ['t_young_pine', 'T']],
    [['spire_pine', 'D'], ['hanging_moss_fir', 'D'], ['t_medium_fir', 'T'], ['t_scots_pine', 'T'], ['t_old_cedar', 'T'], ['t_dusk_cedar', 'T']],
    [['t_scots_pine', 'T'], ['t_wind_pine', 'T'], ['t_young_pine', 'T'], ['t_medium_fir', 'T'], ['t_frost_fir', 'T']],
    [['t_wind_pine', 'T'], ['t_frost_fir', 'T'], ['t_young_pine', 'T'], ['t_wind_juniper', 'T']],
    [['t_wind_juniper', 'T'], ['t_wind_pine', 'T'], ['t_frost_fir', 'T'], ['t_dead_thorn', 'T']],
    [['t_wind_juniper', 'T'], ['t_dead_thorn', 'T'], ['t_frost_fir', 'T'], ['t_storm_deadwood', 'T']],
    [['t_dead_thorn', 'T'], ['t_frost_fir', 'T'], ['t_storm_deadwood', 'T']],
    [['t_storm_deadwood', 'T'], ['t_frost_fir', 'T']],
  ];
  const DENS = [0.48, 0.52, 0.58, 0.64, 0.69, 0.74, 0.80, 0.88];

  for (let y = Y_MIN; y <= Y_MAX; y++) for (let x = X_MIN; x <= X_MAX; x++) {
    const i = id(x, y), z = zoneOf(x, y);
    if (!free(x, y) || rock[i] || inTarn(x + 0.5, y + 0.5)) continue;
    const g = noise(x + 101, y + 7, 5);
    const edgeBias = x <= X_MIN + 2 ? 0.12 : x >= X_MAX - 2 ? 0.08 : 0;
    if (g + edgeBias > DENS[z] && rng.chance(0.72)) {
      const [name, src] = rng.pick(TREES[z]);
      const p = src === 'D' ? tall(name, x + 0.5 + jit(), y + 0.5 + jit(), rng.range(0.55, 0.72)) : town(name, x + 0.5 + jit(), y + 0.5 + jit());
      if (p) block(x, y);
    }
  }

  // decorative rocks on the west ridge (strictly off-limits, framing the mountain)
  for (let y = 0; y < H; y++) for (let x = 0; x < X_MIN; x++) {
    if (!rng.chance(x === X_MIN - 1 ? 0.35 : 0.2)) continue;
    const r = rng.next();
    if (r < 0.45) town(rng.pick(['moss_boulder', 'fieldstone_cluster']), x + 0.5 + jit(), y + 0.5 + jit());
    else if (r < 0.7) forest(rng.pick(['moss_boulder', 'stone_cairn']), x + 0.5, y + 0.5);
    else town(rng.pick(['t_wind_juniper', 't_wind_pine', 't_frost_fir']), x + 0.5 + jit(), y + 0.5 + jit());
  }

  // boulders and flora across the mountain
  for (let n = 0; n < 480; n++) {
    const x = rng.int(X_MIN, X_MAX), y = rng.int(Y_MIN, Y_MAX);
    if (!free(x, y) || inTarn(x + 0.5, y + 0.5)) continue;
    const z = zoneOf(x, y), cx = x + 0.5 + jit(), cy = y + 0.5 + jit();
    if (rng.chance(0.18 + z * 0.05)) {
      const r = rng.next();
      if (r < 0.4) town(rng.pick(['moss_boulder', 'fieldstone_cluster']), cx, cy);
      else if (r < 0.75) forest('moss_boulder', cx, cy);
      else town(rng.pick(['ow_standing_stone', 'ow_ancient_stone']), cx, cy);
      block(x, y);
    } else if (z <= 2) {
      const pickName = rng.pick(['leafy_shrub', 'wildflowers', 'wildflowers', 'dry_reeds', 'mushrooms', 'thorn_bush', 'F:fern_clump', 'F:reeds', 'ow_blue_flowers', 'ow_red_flowers']);
      if (pickName.startsWith('F:')) forest(pickName.slice(2), cx, cy); else town(pickName, cx, cy);
      taken[id(x, y)] = 1;
    } else {
      const pickName = rng.pick(['dry_reeds', 'thorn_bush', 'F:dead_sapling', 'F:dead_bramble', 'fieldstone_cluster', 'F:feather_scatter']);
      if (pickName.startsWith('F:')) forest(pickName.slice(2), cx, cy); else town(pickName, cx, cy);
      taken[id(x, y)] = 1;
    }
  }

  // trail markers and signs
  const beside = (c) => {
    const x = c % W, y = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (playable(nx, ny) && !onTrail[id(nx, ny)] && !taken[id(nx, ny)] && Math.abs(hgt[id(nx, ny)] - hgt[c]) <= 2) return [nx, ny];
    }
    return null;
  };
  for (let k = 10; k < trail.length - 8; k += 14) {
    const at = beside(trail[k]);
    if (!at || keepClear(at[0] + 0.5, at[1] + 0.5)) continue;
    forest(k % 3 === 0 ? 'trail_sign' : 'stone_cairn', at[0] + 0.5, at[1] + 0.5);
    block(at[0], at[1]);
  }
  for (let k = 0; k < RAMP.length; k++) {
    const c0 = cliffAt(k, RAMP[k]);
    for (const [v, name] of [[c0 - 5, 'trail_sign'], [c0 + 4, 'rope_post']]) {
      const y = H - 1 - v;
      for (const x of [RAMP[k] - 3, RAMP[k] + 3]) {
        if (!playable(x, y) || taken[id(x, y)] || onTrail[id(x, y)]) continue;
        forest(name, x + 0.5, y + 0.5); block(x, y); break;
      }
    }
  }

  // ---- landmark 1: Climbers' Base Camp (Tier 2, halfway up lower mountain)
  const mid1 = trail[Math.floor(trail.length * 0.28)], camp = beside(mid1);
  const chests = [];
  if (camp) {
    const [cx, cy] = camp;
    forest('campfire', cx + 0.5, cy + 0.5, { light: 5 }); block(cx, cy);
    for (const [dx, dy, name] of [[1, 0, 'F:bedroll'], [-1, 0, 'F:bedroll'], [0, 1, 'firewood_stack'], [1, 1, 'F:wooden_crate']]) {
      const x = cx + dx, y = cy + dy;
      if (!playable(x, y) || onTrail[id(x, y)] || taken[id(x, y)]) continue;
      if (name.startsWith('F:')) forest(name.slice(2), x + 0.5, y + 0.5); else town(name, x + 0.5, y + 0.5);
      taken[id(x, y)] = 1;
    }
  }

  // ---- landmark 2: Glacial Tarn props
  forest('reeds', tarnCx + 2.5, tarnCy + 0.5);
  forest('reeds', tarnCx - 2.8, tarnCy - 0.5);
  forest('stone_cairn', tarnCx + 1.2, tarnCy + 2.8); block(Math.floor(tarnCx + 1.2), Math.floor(tarnCy + 2.8));
  town('moss_boulder', tarnCx - 1.5, tarnCy + 2.6); block(Math.floor(tarnCx - 1.5), Math.floor(tarnCy + 2.6));

  // ---- landmark 3: High Mountain Outpost (Tier 6, overlooking the precipice)
  const mid2 = trail[Math.floor(trail.length * 0.82)], outpost = beside(mid2);
  if (outpost) {
    const [ox, oy] = outpost;
    forest('ruined_shrine', ox + 0.5, oy + 0.5, { light: 4 }); block(ox, oy);
    for (const [dx, dy, name] of [[1, 0, 'stone_cairn'], [-1, 1, 'ow_ancient_stone'], [0, -1, 'ow_standing_stone']]) {
      const x = ox + dx, y = oy + dy;
      if (!playable(x, y) || onTrail[id(x, y)] || taken[id(x, y)]) continue;
      if (name.startsWith('ow_')) town(name, x + 0.5, y + 0.5); else forest(name, x + 0.5, y + 0.5);
      taken[id(x, y)] = 1;
    }
  }

  // ---- landmark 4: The Summit
  forest('ruined_shrine', SUMMIT[0] + 2.5, SUMMIT[1] - 1.5); block(Math.floor(SUMMIT[0] + 2.5), Math.floor(SUMMIT[1] - 1.5));
  for (const [dx, dy] of [[-3.5, -1.5], [3.8, 2.5], [-3.2, 3.8], [0, 4.5]]) {
    const x = Math.floor(SUMMIT[0] + dx), y = Math.floor(SUMMIT[1] + dy);
    if (playable(x, y) && !onTrail[id(x, y)]) { forest('stone_cairn', x + 0.5, y + 0.5); block(x, y); }
  }

  // ---- reachability check from foot
  const up = new Uint8Array(N), uq = [s0]; up[s0] = 1;
  for (let k = 0; k < uq.length; k++) {
    const i = uq[k];
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j >= 0 && j < N && map.walkableTile(j % W, (j / W) | 0) && !up[j] && Math.abs((j % W) - (i % W)) <= 1 && map.stepOk(i, j)) {
        up[j] = 1; uq.push(j);
      }
    }
  }

  // ---- loot: chests on secret shelves, at the base camp, and the high outpost
  for (const [x, y] of ledges) {
    const i = id(Math.floor(x), Math.floor(y));
    map.block[i] = 0;
    if (up[i]) chests.push({ x, y, rare: rng.chance(0.4) });
  }
  if (camp) {
    const at = map.randomNear(camp[0] + 0.5, camp[1] + 0.5, 2.0, rng.fn());
    if (playable(Math.floor(at[0]), Math.floor(at[1])) && up[id(Math.floor(at[0]), Math.floor(at[1]))]) {
      chests.push({ x: at[0], y: at[1], rare: false });
    }
  }
  if (outpost) {
    const at = map.randomNear(outpost[0] + 0.5, outpost[1] + 0.5, 2.0, rng.fn());
    if (playable(Math.floor(at[0]), Math.floor(at[1])) && up[id(Math.floor(at[0]), Math.floor(at[1]))]) {
      chests.push({ x: at[0], y: at[1], rare: true });
    }
  }

  // ---- monsters: safely placed within playable boundaries and guaranteed reachable
  const looks = rollLooks(biome, rng.fn()), spawns = [];
  const archs = biome.roster;
  for (let n = 0, tries = 0; n < 38 && tries < 900; tries++) {
    const x = rng.int(X_MIN + 3, X_MAX - 3) + 0.5, y = rng.int(Y_MIN + 3, Y_MAX - 3) + 0.5;
    const i = id(Math.floor(x), Math.floor(y));
    if (!map.walkable(x, y) || !map.circleFree(x, y, 0.45) || near(x, y, START, 12) || near(x, y, SUMMIT, 8)) continue;
    if (!up[i]) continue;
    const z = zoneOf(Math.floor(x), Math.floor(y)), arch = rng.pick(archs);
    spawns.push({
      x, y, arch,
      n: rng.int(2, 3 + Math.min(2, z >> 1)),
      rank: n % 5 === 4 || (z >= 5 && n % 3 === 0) ? 'champion' : 'normal',
      look: looks.pick(arch),
    });
    n++;
  }
  // The Summit Warden on the peak
  spawns.push({ x: SUMMIT[0] - 1.2, y: SUMMIT[1] + 2.2, arch: 'golem', rank: 'boss', look: looks.pick('golem') });

  // ---- level bookkeeping
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) if (map.t[i] === 1) { lo = Math.min(lo, hgt[i]); hi = Math.max(hi, hgt[i]); }
  map.minLevel = lo; map.maxLevel = hi; map.baseLevel = lo - 14;
  map.losBlocks = true;
  map.mountain = { trail, summit: SUMMIT, start: START, ledges, camp, outpost };
  return {
    map, props, buildings: [], wallHangings: [], torches: [], townTiles: mountainFloors(), looks, spawns, chests,
    start: START, exit: SUMMIT, summit: SUMMIT, trail, seed,
  };
}
