// Shared .velscen.json schema, RLE64 typed-array codec, blank scenario factories (all 11 categories & 45+ biomes),
// procedural seed-to-document baker, and reachability/cutscene validator. Pure ES module (runs in Browser and Node).
import { BIOMES, BETA_BIOMES, BREACH_BIOME, SCORPION_KING_PYRAMID_BIOME, TOWN_BIOME, ACT2_TOWN_BIOME, BIOME_BY_ID } from '../data/biomes.js';
import { TOWER_VARIANTS, towerGeo } from './tower.js';
import { CAVE_VARIANTS } from './caverns.js';
import { DUNE_VARIANTS } from '../data/dunes.js';
import { CASTLE_VARIANTS } from '../data/castles.js';
import { SIEGE_VARIANTS } from './siege.js';
import { HUNT_LANDS } from '../data/huntlands.js';
import { shipLayout, MAP_W as SKY_W, MAP_H as SKY_H, OX as SKY_OX, OY as SKY_OY, GATE as SKY_GATE, LANDING as SKY_LANDING } from './skyship.js';
import { SEA_W, SEA_H, OX as SEA_OX, OY as SEA_OY, SEA_LV, DAWNWAKE } from './seaship.js';
import { GT_W, GT_H, ROW0, ROWS, trainLayout, crateCells } from './ghosttrain.js';

export const SCENARIO_FORMAT = 'velscour-scenario';
export const SCENARIO_VERSION = 1;

// Base64 helpers safe for both Browser and Node 18+
function bytesToBase64(u8) {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  if (typeof Buffer !== 'undefined') {
    const b = Buffer.from(b64, 'base64');
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const TYPE_MAP = {
  u8: Uint8Array,
  u16: Uint16Array,
  i16: Int16Array,
  f32: Float32Array,
};

function typeTagOf(arr) {
  if (arr instanceof Uint8Array) return 'u8';
  if (arr instanceof Uint16Array) return 'u16';
  if (arr instanceof Int16Array) return 'i16';
  if (arr instanceof Float32Array) return 'f32';
  return 'i16';
}

/**
 * Lossless RLE + Base64 encoder for TypedArrays.
 * Format: "rle1:<tag>:<len>:<b64>" where each run is [countLo, countHi, ...valueBytesLittleEndian].
 * Falls back to "raw1:<tag>:<len>:<b64>" if RLE is larger.
 */
export function encodeTypedArray(arr) {
  if (!arr || !arr.length) return null;
  const tag = typeTagOf(arr);
  const T = TYPE_MAP[tag];
  const src = arr instanceof T ? arr : new T(arr);
  const bpe = src.BYTES_PER_ELEMENT;
  const rawView = new Uint8Array(src.buffer, src.byteOffset, src.byteLength);

  // RLE encode on exact byte-pattern equality per element
  const out = [];
  const eq = (i, j) => {
    const a = i * bpe, b = j * bpe;
    for (let k = 0; k < bpe; k++) if (rawView[a + k] !== rawView[b + k]) return false;
    return true;
  };
  let i = 0;
  const n = src.length;
  while (i < n) {
    let run = 1;
    while (i + run < n && run < 65535 && eq(i, i + run)) run++;
    out.push(run & 0xff, (run >>> 8) & 0xff);
    const off = i * bpe;
    for (let k = 0; k < bpe; k++) out.push(rawView[off + k]);
    i += run;
  }
  if (out.length < rawView.byteLength) {
    return `rle1:${tag}:${n}:${bytesToBase64(new Uint8Array(out))}`;
  }
  return `raw1:${tag}:${n}:${bytesToBase64(rawView)}`;
}

export function decodeTypedArray(encoded, FallbackType = Uint8Array, expectedLen = 0) {
  if (!encoded) return expectedLen ? new FallbackType(expectedLen) : null;
  if (ArrayBuffer.isView(encoded)) {
    if (encoded instanceof FallbackType && (!expectedLen || encoded.length === expectedLen)) return new FallbackType(encoded);
    const res = new FallbackType(expectedLen || encoded.length);
    res.set(encoded.subarray(0, res.length));
    return res;
  }
  if (Array.isArray(encoded)) {
    const res = new FallbackType(expectedLen || encoded.length);
    for (let i = 0; i < res.length && i < encoded.length; i++) res[i] = encoded[i];
    return res;
  }
  if (typeof encoded !== 'string') return expectedLen ? new FallbackType(expectedLen) : null;
  const parts = encoded.split(':');
  if (parts.length < 4) return expectedLen ? new FallbackType(expectedLen) : null;
  const [mode, tag, lenStr] = parts;
  const b64 = parts.slice(3).join(':');
  const T = TYPE_MAP[tag] || FallbackType;
  const len = expectedLen || parseInt(lenStr, 10) || 0;
  const bytes = base64ToBytes(b64);
  const bpe = T.BYTES_PER_ELEMENT;
  const outBytes = new Uint8Array(len * bpe);

  if (mode === 'raw1') {
    outBytes.set(bytes.subarray(0, outBytes.length));
  } else if (mode === 'rle1') {
    const stride = 2 + bpe;
    let dst = 0;
    for (let p = 0; p + stride <= bytes.length && dst < len; p += stride) {
      const count = bytes[p] | (bytes[p + 1] << 8);
      for (let r = 0; r < count && dst < len; r++, dst++) {
        const doff = dst * bpe;
        for (let k = 0; k < bpe; k++) outBytes[doff + k] = bytes[p + 2 + k];
      }
    }
  }
  const typed = new T(outBytes.buffer, outBytes.byteOffset, len);
  if (T === FallbackType) return typed;
  const conv = new FallbackType(len);
  conv.set(typed);
  return conv;
}

// ------------------------------------------------------------------ Master Scenario Category & Biome Registry
const INDOOR_BIOME_IDS = BIOMES.filter((b) => !b.overworld).map((b) => b.id);

export const SCENARIO_CATEGORIES = [
  {
    id: 'dungeon',
    name: 'Indoor Dungeon',
    short: 'Dungeon',
    icon: '🏰',
    projection: 'flat',
    defaultSize: [56, 56],
    blurb: 'Rooms, corridors, 16-join autotile walls, 3D doorway arches, dynamic torches, traps, shrines & boss chambers.',
    biomes: INDOOR_BIOME_IDS,
    supportsMix: true,
    variants: [
      { id: 'standard', name: 'Standard Dungeon Floor' },
      { id: 'castle_keep_layout', name: 'Castle Keep Room Layout' },
      { id: 'raid_arena', name: 'Boss Room / Raid Arena' },
      { id: 'abyssal_rift', name: 'Abyssal Rift (Timed + Pylons)' },
      { id: 'throne_gauntlet', name: "Velscour's Throne Gauntlet" },
    ],
  },
  {
    id: 'town_arena',
    name: 'Town Hub & PvP Arena',
    short: 'Town / Arena',
    icon: '🏘️',
    projection: 'flat',
    defaultSize: [56, 56],
    blurb: 'Safe hubs with multi-tile shops, vendors, portals & ambient NPC routines, or walled PvP duel coliseums.',
    biomes: ['town', 'act2_town', 'catacombs'],
    variants: [
      { id: 'town_act1', name: 'Herrington Hollow (Act 1 Town)' },
      { id: 'town_act2', name: 'Sunscorch Oasis (Act 2 Town)' },
      { id: 'pvp_arena', name: 'PvP Duel Coliseum (32x32)' },
    ],
  },
  {
    id: 'overworld',
    name: 'Outdoor Overworld & Regions',
    short: 'Overworld',
    icon: '🌲',
    projection: 'terrain_25d',
    defaultSize: [72, 72],
    blurb: '2.5D outdoor wilds, towering Dark Forest, concentric 3D-baked Castles, Endless Siege keeps, Great Hunt & Rail Mines.',
    biomes: ['overworld', 'dark_forest', 'castle', 'sea_of_sand', 'endless_siege', 'great_hunt', 'deep_mines'],
    variantsByBiome: {
      castle: CASTLE_VARIANTS.map((v) => ({ id: v.id, name: v.name })),
      endless_siege: SIEGE_VARIANTS.map((v) => ({ id: v.id, name: v.name })),
      great_hunt: HUNT_LANDS.map((v) => ({ id: v.id, name: v.name })),
    },
  },
  {
    id: 'breach',
    name: 'Eternal Breach (Void Islands)',
    short: 'Void Breach',
    icon: '🌌',
    projection: 'breach_25d',
    defaultSize: [96, 96],
    blurb: 'Floating 2.5D islands over the nebula void with tapered rock undersides, curved rims, 3D sloped walkways & Wyrm.',
    biomes: ['eternal_breach'],
    variants: [
      { id: 'standard', name: 'Floating Island Cluster' },
      { id: 'wyrm_gauntlet', name: 'Ethereal Wyrm Ambush Floor' },
    ],
  },
  {
    id: 'naval',
    name: 'Naval Battle (Pirate Seas)',
    short: 'Naval',
    icon: '⚓',
    projection: 'deck_3d',
    defaultSize: [SEA_W, SEA_H],
    blurb: 'Live Three.js ocean aboard the Dawnwake with 20+ 3D ships, one-click GPU deck baking, boarding planks & sea cutscenes.',
    biomes: ['pirate_seas'],
    variants: [
      { id: 'day', name: 'Open Day Swell' },
      { id: 'storm', name: 'Heavy Storm & Whitecaps' },
      { id: 'night', name: 'Starless Night Watch' },
      { id: 'sunset', name: 'Copper Sunset' },
      { id: 'fog', name: 'Dead Fog Bank' },
      { id: 'blood', name: 'The Red Tide' },
    ],
  },
  {
    id: 'airship',
    name: 'Airship Battle (Sky Lanes)',
    short: 'Airship',
    icon: '⛵',
    projection: 'sky_25d',
    defaultSize: [SKY_W, SKY_H],
    blurb: 'Ironclad sky-deck above scrolling clouds with boarding skiffs, enemy flagship broadsides, Sky-Knights & Cine stories.',
    biomes: ['skyship'],
    variants: [
      { id: 'clear', name: 'High Blue Sky' },
      { id: 'storm', name: 'Lightning Squall' },
      { id: 'night', name: 'Moonlit Cloudbank' },
      { id: 'fog', name: 'Rime Mist' },
      { id: 'sunset', name: 'Dusk Armada' },
      { id: 'gale', name: 'Crosswind Gale' },
      { id: 'blizzard', name: 'Ice-Storm Drift' },
      { id: 'ash', name: 'Cinderfall Sky' },
    ],
  },
  {
    id: '3d_caverns',
    name: "3D Caverns (Depth's Edge)",
    short: '3D Caverns',
    icon: '💎',
    projection: 'heightfield_3d',
    defaultSize: [96, 96],
    blurb: 'Live Three.js triplanar cavern heightfield with underground lakes, scrolling 3D waterfalls, spiral shafts & stalagmites.',
    biomes: ['depths_edge'],
    variants: CAVE_VARIANTS.map((v) => ({ id: v.id, name: v.name })),
  },
  {
    id: '3d_tower',
    name: '3D Spiral Tower (Serpentine)',
    short: '3D Tower',
    icon: '🗼',
    projection: 'helix_3d',
    defaultSize: [280, 40],
    blurb: 'Unrolled 2D stair strip + rooftop arena wrapped live onto a rotating 3D cutaway tower with Pass-1 railings & airships.',
    biomes: ['serpentine_tower'],
    variants: TOWER_VARIANTS.map((v) => ({ id: v.id, name: v.name })),
  },
  {
    id: '3d_alpine',
    name: '3D Alpine Mountains & Summit',
    short: '3D Alpine',
    icon: '🏔️',
    projection: 'heightfield_3d',
    defaultSize: [80, 96],
    blurb: 'Live Three.js mountain heightfield compiling tile elevations into smooth trails, crisp hop ledges, snow cliffs & cloud seas.',
    biomes: ['mountainside', 'snowy_summit'],
    variants: [
      { id: 'switchback', name: 'Alpine Switchback Climb' },
      { id: 'ridgeline', name: 'High Ridgeline & Plateaus' },
    ],
  },
  {
    id: '3d_dunes',
    name: '3D Desert Dunes & Pyramids',
    short: '3D Dunes',
    icon: '🏜️',
    projection: 'dual_heightfield_3d',
    defaultSize: [310, 172],
    blurb: 'Dual-scene Three.js desert heightfield + monumental 3D Pyramid paired with a downward-spiraling interior Tomb.',
    biomes: ['sea_of_sand', 'scorpion_king_pyramid'],
    variants: DUNE_VARIANTS.map((v) => ({ id: v.id, name: v.name })),
  },
  {
    id: '3d_train',
    name: '3D Moving Train (Iron Express)',
    short: '3D Train',
    icon: '🚂',
    projection: 'train_3d',
    defaultSize: [GT_W, GT_H],
    blurb: 'Live Three.js 19-car speeding steam locomotive with per-car roof cutaways, gorge trestles & dynamic station stops.',
    biomes: ['ghost_train'],
    variants: [
      { id: 'night_express', name: 'Midnight Raider Express' },
      { id: 'armoured_convoy', name: 'Armoured War Train' },
    ],
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(SCENARIO_CATEGORIES.map((c) => [c.id, c]));

export function allEditorBiomes() {
  return [TOWN_BIOME, ACT2_TOWN_BIOME, ...BIOMES, ...BETA_BIOMES, BREACH_BIOME, SCORPION_KING_PYRAMID_BIOME];
}

export function resolveBiome(biomeId) {
  if (biomeId === 'town') return TOWN_BIOME;
  if (biomeId === 'act2_town') return ACT2_TOWN_BIOME;
  return BIOME_BY_ID[biomeId] || BIOMES[0];
}

export function variantsFor(categoryId, biomeId) {
  const cat = CATEGORY_BY_ID[categoryId];
  if (!cat) return [{ id: 'default', name: 'Default' }];
  if (cat.variantsByBiome && cat.variantsByBiome[biomeId]) return cat.variantsByBiome[biomeId];
  if (cat.variants && cat.variants.length) return cat.variants;
  return [{ id: 'default', name: 'Default' }];
}

export function inferCategoryForBiome(biomeId, opts = {}) {
  if (opts.dunes || biomeId === 'scorpion_king_pyramid') return '3d_dunes';
  if (biomeId === 'town' || biomeId === 'act2_town' || opts.kind === 'town' || opts.kind === 'arena') return 'town_arena';
  if (biomeId === 'eternal_breach') return 'breach';
  if (biomeId === 'pirate_seas') return 'naval';
  if (biomeId === 'skyship') return 'airship';
  if (biomeId === 'depths_edge') return '3d_caverns';
  if (biomeId === 'serpentine_tower') return '3d_tower';
  if (biomeId === 'mountainside' || biomeId === 'snowy_summit') return '3d_alpine';
  if (biomeId === 'ghost_train') return '3d_train';
  const b = resolveBiome(biomeId);
  if (b && b.overworld) return 'overworld';
  return 'dungeon';
}

export function slugifyId(text) {
  return String(text || 'custom_scenario')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'custom_scenario';
}

// ------------------------------------------------------------------ Blank Scenario Factory (Playable Starter Canvas)
export function createBlankScenarioDoc(opts = {}) {
  const category = CATEGORY_BY_ID[opts.category] ? opts.category : 'dungeon';
  const cat = CATEGORY_BY_ID[category];
  const biomeId = opts.biomeId && cat.biomes.includes(opts.biomeId) ? opts.biomeId : cat.biomes[0];
  const biome = resolveBiome(biomeId);
  const vars = variantsFor(category, biomeId);
  const variantId = opts.variantId || vars[0]?.id || 'default';
  const id = slugifyId(opts.id || opts.name || `${biomeId}_custom`);
  const name = String(opts.name || `Untitled ${biome.name}`).trim();

  let [w, h] = opts.w && opts.h ? [opts.w | 0, opts.h | 0] : cat.defaultSize.slice();
  let towerSpec = null;
  if (category === '3d_tower') {
    const tv = opts.towerSpec || TOWER_VARIANTS.find((v) => v.id === variantId) || TOWER_VARIANTS[0];
    const g = towerGeo(tv);
    if (!opts.w || !opts.h) { w = g.GW; h = g.GH; }
    towerSpec = { ...tv };
  } else if (category === 'town_arena' && variantId === 'pvp_arena' && (!opts.w || !opts.h)) {
    w = 32; h = 32;
  }

  const N = w * h;
  const t = new Uint8Array(N);
  const v = new Uint16Array(N);
  const block = new Uint8Array(N);
  const hgt = new Int16Array(N);
  const wet = new Uint8Array(N);
  const waterLevel = new Float32Array(N);
  const under = new Int16Array(N);
  const flags = new Uint8Array(N); // bit0: rounded, bit1: rampTile, bit2: c3struct, bit3: rampartDeck
  const deck = new Uint8Array(N);

  const carveRect = (x0, y0, rw, rh, fv = 0, lv = 0) => {
    for (let y = Math.max(0, y0 | 0); y < Math.min(h, (y0 + rh) | 0); y++) {
      for (let x = Math.max(0, x0 | 0); x < Math.min(w, (x0 + rw) | 0); x++) {
        const i = y * w + x;
        t[i] = 1; v[i] = fv; hgt[i] = lv;
      }
    }
  };
  const carveDisk = (cx, cy, rad, fv = 0, lv = 0) => {
    const r2 = rad * rad;
    for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(h - 1, Math.ceil(cy + rad)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(w - 1, Math.ceil(cx + rad)); x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2) {
          const i = y * w + x;
          t[i] = 1; v[i] = fv; hgt[i] = lv;
        }
      }
    }
  };

  let start = [w / 2, h / 2];
  let townPortal = [w / 2 + 1.6, h / 2 - 0.6];
  let exit = { x: w / 2, y: Math.max(6, h / 2 - 12), sealed: category !== 'town_arena', unsealOn: 'objective_complete', continueToBiome: null };
  const rooms = [];
  const spawns = [];
  const props = [];
  const torches = [];
  const waterfalls = [];
  let trainCars = null;
  let dunesMeta = null;

  if (category === 'dungeon') {
    carveRect(20, 34, 16, 12, 0, 0);
    carveRect(26, 22, 4, 13, 0, 0);
    carveRect(18, 8, 20, 14, 0, 0);
    rooms.push(
      { id: 'r_start', x: 20, y: 34, w: 16, h: 12, title: 'Entrance Chamber', theme: null },
      { id: 'r_sanctum', x: 18, y: 8, w: 20, h: 14, title: 'The Inner Sanctum', theme: 'shrine' }
    );
    start = [28, 40];
    townPortal = [30, 39.5];
    exit = { x: 28, y: 12, sealed: true, unsealOn: 'boss_killed', continueToBiome: null };
    const arch = (biome.roster && biome.roster[0]) || 'skeleton';
    spawns.push(
      { id: 'sp_guard_1', castKey: '', x: 28, y: 28, arch, rank: 'normal', n: 3, art: null, swap: null, name: '' },
      { id: 'sp_boss_1', castKey: 'sanctum_guardian', x: 28, y: 15, arch, rank: 'boss', n: 1, art: null, swap: null, name: 'Sanctum Warden' }
    );
  } else if (category === 'town_arena') {
    if (variantId === 'pvp_arena') {
      carveRect(3, 3, w - 6, h - 6, 0, 0);
      for (const [px, py] of [[10, 10], [21, 10], [10, 21], [21, 21]]) { block[py * w + px] = 1; }
      start = [8.5, 16.5];
      townPortal = [6.5, 16.5];
      exit = { x: 23.5, y: 16.5, sealed: false, unsealOn: 'always', continueToBiome: null };
    } else {
      t.fill(1);
      for (let x = 0; x < w; x++) { block[x] = 1; block[(h - 1) * w + x] = 1; }
      for (let y = 0; y < h; y++) { block[y * w] = 1; block[y * w + w - 1] = 1; }
      carveDisk(w / 2, h / 2, 8, 4, 0);
      start = [w / 2, h / 2 + 2];
      townPortal = [w / 2 + 3, h / 2 - 2];
      exit = { x: w / 2, y: h / 2 - 5, sealed: false, unsealOn: 'always', continueToBiome: null };
    }
  } else if (category === 'overworld') {
    t.fill(1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
        if (edge < 3) { block[y * w + x] = 1; hgt[y * w + x] = 10; }
      }
    }
    start = [12.5, h - 12.5];
    townPortal = [14.5, h - 12.5];
    exit = { x: w - 12.5, y: 12.5, sealed: true, unsealOn: 'objective_complete', continueToBiome: null };
    const arch = (biome.roster && biome.roster[0]) || 'skeleton';
    spawns.push({ id: 'sp_ow_boss', castKey: 'wild_warden', x: w / 2, y: h / 2, arch, rank: 'boss', n: 1, art: null, swap: null, name: 'Warden of the Wilds' });
  } else if (category === 'breach') {
    // Two floating islands joined by a ramped stone bridge
    const c1 = [28, 66], c2 = [66, 28];
    for (const [cx, cy, rad, lv] of [[c1[0], c1[1], 11, 8], [c2[0], c2[1], 13, 16]]) {
      for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
        for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d <= rad && x > 1 && y > 1 && x < w - 2 && y < h - 2) {
            const i = y * w + x;
            t[i] = 1; hgt[i] = lv;
            under[i] = lv - Math.round(10 + (1 - d / rad) * 26);
            flags[i] |= 1; // rounded
          }
        }
      }
    }
    // Bridge between islands
    const steps = 44;
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      const bx = Math.round(c1[0] + (c2[0] - c1[0]) * k);
      const by = Math.round(c1[1] + (c2[1] - c1[1]) * k);
      const lv = Math.round(8 + 8 * k);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = bx + ox, ny = by + oy;
        if (nx > 1 && ny > 1 && nx < w - 2 && ny < h - 2) {
          const i = ny * w + nx;
          if (!t[i]) {
            t[i] = 1; hgt[i] = lv; under[i] = lv - 8; flags[i] |= 3; // rounded + rampTile
          }
        }
      }
    }
    start = [28.5, 68.5];
    townPortal = [30.5, 68.5];
    exit = { x: 66.5, y: 25.5, sealed: true, unsealOn: 'boss_killed', continueToBiome: null };
    spawns.push({ id: 'sp_breach_boss', castKey: 'breach_lord', x: 66.5, y: 29.5, arch: (biome.roster && biome.roster[0]) || 'wraith', rank: 'boss', n: 1, art: null, swap: null, name: 'Herald of the Breach' });
  } else if (category === 'naval') {
    const L = shipLayout();
    const dx = SEA_OX - SKY_OX, dy = SEA_OY - SKY_OY;
    for (let ty = 0; ty < SKY_H; ty++) for (let tx = 0; tx < SKY_W; tx++) {
      const si = ty * SKY_W + tx;
      if (!L.ship[si]) continue;
      const j = (ty + dy) * w + (tx + dx);
      t[j] = 1; hgt[j] = L.lv[si]; block[j] = L.walk[si] ? 0 : 1; deck[j] = DAWNWAKE;
    }
    start = [SEA_OX + SKY_LANDING[0] + 0.5, SEA_OY + SKY_LANDING[1]];
    townPortal = [SEA_OX - 2.5, SEA_OY + 14.5];
    exit = { x: SEA_OX + 0.5, y: SEA_OY + SKY_GATE.z + 0.55, sealed: true, unsealOn: 'objective_complete', continueToBiome: null };
  } else if (category === 'airship') {
    const L = shipLayout();
    for (let i = 0; i < L.W * L.H; i++) {
      if (!L.ship[i]) continue;
      t[i] = 1; hgt[i] = L.lv[i]; block[i] = L.walk[i] ? 0 : 1;
      if (!L.walk[i]) flags[i] |= 4; // c3struct
    }
    start = [SKY_OX + SKY_LANDING[0] + 0.5, SKY_OY + SKY_LANDING[1]];
    townPortal = [SKY_OX - 2.5, SKY_OY + 14.5];
    exit = { x: SKY_OX + 0.5, y: SKY_OY + SKY_GATE.z + 0.55, sealed: true, unsealOn: 'objective_complete', continueToBiome: null };
  } else if (category === '3d_caverns') {
    // Entrance cavern -> winding passage -> shallow lake -> ramp up to boss plateau with waterfall
    carveDisk(26, 74, 10, 0, 0);
    for (let s = 0; s <= 32; s++) {
      const k = s / 32;
      carveDisk(26 + k * 22, 74 - k * 24, 3.5, 0, Math.round(k * 4));
    }
    carveDisk(52, 46, 12, 0, 4);
    // Shallow walkable pool in middle of cavern
    for (let y = 41; y <= 51; y++) for (let x = 47; x <= 57; x++) {
      if ((x - 52) ** 2 + (y - 46) ** 2 <= 25) { wet[y * w + x] = 1; waterLevel[y * w + x] = 0.45; }
    }
    // Ramp climbing to upper plateau
    for (let s = 0; s <= 36; s++) {
      const k = s / 36;
      carveDisk(58 + k * 14, 44 - k * 22, 3.2, 0, Math.round(4 + k * 28));
    }
    carveDisk(54, 20, 11, 0, 32);
    waterfalls.push({ x: 52, y: 32, top: 3.2, base: 0.4, w: 4.5 });
    start = [26.5, 76.5];
    townPortal = [28.5, 76.0];
    exit = { x: 54.5, y: 15.5, sealed: true, unsealOn: 'boss_killed', continueToBiome: null };
    spawns.push({ id: 'sp_cave_boss', castKey: 'falls_warden', x: 54.5, y: 21.5, arch: 'spider', rank: 'boss', n: 1, art: 'de_widow', swap: null, name: 'Matriarch of the Falls' });
  } else if (category === '3d_tower') {
    const tv = towerSpec || TOWER_VARIANTS[0];
    const g = towerGeo(tv);
    for (let y = g.YR; y < g.YR + g.w; y++) {
      for (let x = Math.floor(g.XT); x < Math.ceil(g.XB); x++) {
        t[y * w + x] = 1;
      }
    }
    for (let y = 0; y < g.GH; y++) {
      for (let x = 0; x < g.XR; x++) {
        const dx = x + 0.5 - g.AX, dy = y + 0.5 - g.AY;
        if (dx * dx + dy * dy > g.RT * g.RT) continue;
        const i = y * w + x;
        t[i] = 1;
        if (Math.hypot(dx, dy + g.rc) < 2.6) block[i] = 1;
      }
    }
    start = [g.XB - 3.5, g.YR + g.w / 2];
    townPortal = [g.XB - 2.0, g.YR + g.w / 2];
    exit = { x: g.AX, y: g.AY, sealed: true, unsealOn: 'boss_killed', continueToBiome: null };
    spawns.push({ id: 'sp_roof_boss', castKey: 'sky_admiral', x: g.AX, y: g.AY + 4, arch: 'knight', rank: 'boss', n: 1, art: null, swap: null, name: 'Tower Sovereign' });
  } else if (category === '3d_alpine') {
    // Switchback mountain climb
    carveDisk(22, 80, 9, 0, 0);
    for (let s = 0; s <= 40; s++) {
      const k = s / 40;
      carveDisk(22 + k * 34, 80 - k * 24, 3.8, 0, Math.round(k * 16));
    }
    carveDisk(56, 56, 8, 0, 16);
    for (let s = 0; s <= 40; s++) {
      const k = s / 40;
      carveDisk(56 - k * 22, 56 - k * 34, 3.8, 0, Math.round(16 + k * 20));
    }
    carveDisk(34, 22, 11, 1, 36);
    start = [22.5, 82.5];
    townPortal = [24.5, 82.0];
    exit = { x: 34.5, y: 17.5, sealed: true, unsealOn: 'boss_killed', continueToBiome: null };
    spawns.push({ id: 'sp_peak_boss', castKey: 'peak_warden', x: 34.5, y: 23.5, arch: 'golem', rank: 'boss', n: 1, art: null, swap: null, name: 'The Summit Warden' });
  } else if (category === '3d_dunes') {
    const E = 172, OXI = E + 26;
    dunesMeta = { extW: E, oxi: OXI, tombSize: 112, pyramid: { cx: 39, cy: 39, half: 26 } };
    // Exterior desert plaza & camp trail
    carveDisk(140, 140, 14, 0, 0);
    for (let s = 0; s <= 60; s++) {
      const k = s / 60;
      carveDisk(140 - k * 90, 140 - k * 66, 6, 0, Math.round(Math.sin(k * Math.PI * 2) * 3));
    }
    carveRect(28, 66, 24, 16, 0, 0);
    // Interior tomb chamber at x >= OXI
    carveRect(OXI + 40, 50, 32, 32, 0, -20);
    start = [140.5, 140.5];
    townPortal = [142.5, 140.0];
    exit = { x: OXI + 56, y: 60, sealed: true, unsealOn: 'boss_killed', continueToBiome: null };
    spawns.push({ id: 'sp_pharaoh', castKey: 'pharaoh', x: OXI + 56, y: 66, arch: 'knight', rank: 'boss', n: 1, art: null, swap: null, name: 'The Sunless Pharaoh' });
  } else if (category === '3d_train') {
    const cars = trainLayout();
    trainCars = cars.map((c) => ({ kind: c.kind, len: c.x1 - c.x0 }));
    for (const c of cars) {
      if (c.kind === 'engine') continue;
      for (let y = ROW0; y < ROW0 + ROWS; y++) {
        for (let x = c.x0; x <= c.x1; x++) {
          if (x >= 0 && x < w) t[y * w + x] = 1;
        }
      }
      for (const [bx, by] of crateCells(c)) {
        if (bx >= 0 && bx < w && by >= 0 && by < h) block[by * w + bx] = 1;
      }
    }
    const cab = cars[0], tend = cars.find((c) => c.kind === 'tender') || cars[cars.length - 2];
    start = [cab.x0 + 3.5, ROW0 + 1.5];
    townPortal = [cab.x0 + 1.8, ROW0 + 1.5];
    exit = { x: tend.x1 - 1.5, y: ROW0 + 1.5, sealed: true, unsealOn: 'boss_killed', continueToBiome: null };
    spawns.push({ id: 'sp_train_chief', castKey: 'iron_chief', x: tend.x0 + 4.5, y: ROW0 + 1.5, arch: 'knight', rank: 'boss', n: 1, art: null, swap: null, name: 'Chief of the Iron Express' });
  }

  return {
    format: SCENARIO_FORMAT,
    version: SCENARIO_VERSION,
    meta: {
      id,
      name,
      author: opts.author || 'creator',
      blurb: opts.blurb || `Hand-crafted ${cat.name} scenario in ${biome.name}.`,
      category,
      biomeId,
      mixBiomeId: opts.mixBiomeId || null,
      variantId,
      publish: {
        skullPortal: true,
        campaignPool: false,
        pinnedDepth: null,
        ...(opts.publish || {}),
      },
      lighting: {
        dark: biome.dark ?? 0.75,
        light: biome.light ?? 8.5,
        fog: biome.fog || '#0b0706',
        torch: biome.torch || '#ffb060',
        rain: 0,
        night: false,
      },
      audio: {
        music: category === 'town_arena' ? 'town' : 'wilds',
        ambience: biome.id,
      },
    },
    grid: {
      w,
      h,
      projection: cat.projection,
      traversal: {
        climb: category === 'dungeon' || category === 'town_arena' ? 2 : category === 'naval' || category === 'airship' ? 6 : 4,
        drop: 10,
        walkStep: category === 'naval' || category === 'airship' ? 6 : 3,
        smoothMax: 3,
        losCap: true,
      },
      layers: {
        t,
        v,
        block,
        hgt,
        wet,
        waterLevel,
        under,
        flags,
        deck,
      },
      heightfield: {
        subdiv: category === '3d_alpine' ? 4 : 2,
        waterfalls,
        snowLine: biomeId === 'snowy_summit' ? 0 : 28,
        cloudSeaY: -6,
      },
      tower: towerSpec,
      dunes: dunesMeta,
      train: trainCars ? { cars: trainCars, stations: [] } : null,
      naval: category === 'naval' ? { ships: [], planks: [], docks: [[-16, 12], [2.5, 12], [12, 15.5]], waves: [] } : null,
      airship: category === 'airship' ? { flagship: 'THE BLACK SCOURGE', flagshipSub: 'Pirate Dreadnought', knights: [], waves: [], gauntlet: null } : null,
      splines: [],
    },
    architecture: {
      rooms,
      openings: [],
      torches,
      wallHangings: [],
      buildings: [],
    },
    entities: {
      start,
      townPortal,
      exit,
      props,
      spawns,
      npcs: [],
      interactables: [],
      zones: [
        {
          id: 'z_boss_approach',
          name: 'Boss Approach Zone',
          shape: 'rect',
          x: Math.max(2, Math.floor(exit.x - 6)),
          y: Math.max(2, Math.floor(exit.y - 4)),
          w: 12,
          h: 10,
          color: '#ff9a40',
        },
      ],
      marks: [
        { id: 'mk_arrival', name: 'Arrival Look', x: start[0], y: Math.max(2, start[1] - 2) },
      ],
    },
    objectives: spawns.some((s) => s.rank === 'boss' || s.rank === 'raid')
      ? [{ id: 'obj_slay_boss', kind: 'kill_bosses', text: `Defeat ${spawns.find((s) => s.rank === 'boss' || s.rank === 'raid').name || 'the Guardian'}` }]
      : [],
    triggers: [
      {
        id: 'trig_arrival',
        name: 'Arrival Intro Card',
        enabled: true,
        event: 'onArrival',
        once: true,
        requireCombatClear: false,
        zoneId: null,
        targetKey: null,
        hpPct: 50,
        runCutscene: 'cine_arrival',
      },
    ],
    cutscenes: [
      {
        id: 'cine_arrival',
        name: 'Scenario Arrival',
        allowFastForward: true,
        steps: [
          { id: 'st_1', type: 'card', title: name.toUpperCase(), sub: biome.name, dur: 2.6, block: false },
          { id: 'st_2', type: 'cam', mode: 'actor', who: 'hero', zoom: 1.8, dur: 1.1, ease: 'out', push: 0.02, wait: true },
          { id: 'st_3', type: 'cam', mode: 'return_hero', dur: 0.7, wait: true },
        ],
      },
    ],
  };
}

// ------------------------------------------------------------------ Serialize / Deserialize (.velscen.json <-> Live Doc)
export function serializeScenarioDoc(doc) {
  const L = doc.grid.layers || {};
  const hasNonZero = (arr) => {
    if (!arr) return false;
    for (let i = 0; i < arr.length; i++) if (arr[i] !== 0 && !Number.isNaN(arr[i])) return true;
    return false;
  };
  const encodedLayers = {
    t: encodeTypedArray(L.t),
    v: hasNonZero(L.v) ? encodeTypedArray(L.v) : null,
    block: hasNonZero(L.block) ? encodeTypedArray(L.block) : null,
    hgt: hasNonZero(L.hgt) ? encodeTypedArray(L.hgt) : null,
    wet: hasNonZero(L.wet) ? encodeTypedArray(L.wet) : null,
    waterLevel: hasNonZero(L.waterLevel) ? encodeTypedArray(L.waterLevel) : null,
    under: hasNonZero(L.under) ? encodeTypedArray(L.under) : null,
    flags: hasNonZero(L.flags) ? encodeTypedArray(L.flags) : null,
    deck: hasNonZero(L.deck) ? encodeTypedArray(L.deck) : null,
  };
  for (const k of Object.keys(encodedLayers)) {
    if (encodedLayers[k] == null) delete encodedLayers[k];
  }
  return {
    format: SCENARIO_FORMAT,
    version: SCENARIO_VERSION,
    meta: structuredClone(doc.meta),
    grid: {
      ...structuredClone({ ...doc.grid, layers: undefined }),
      layers: encodedLayers,
    },
    architecture: structuredClone(doc.architecture),
    entities: structuredClone(doc.entities),
    objectives: structuredClone(doc.objectives || []),
    triggers: structuredClone(doc.triggers || []),
    cutscenes: structuredClone(doc.cutscenes || []),
  };
}

export function deserializeScenarioDoc(raw) {
  if (!raw || raw.format !== SCENARIO_FORMAT) {
    throw new Error('Invalid scenario document: expected format "velscour-scenario".');
  }
  const w = Math.max(8, Math.min(512, raw.grid?.w | 0));
  const h = Math.max(8, Math.min(512, raw.grid?.h | 0));
  const N = w * h;
  const L = raw.grid?.layers || {};
  const doc = structuredClone({
    ...raw,
    grid: { ...raw.grid, w, h, layers: {} },
  });
  doc.grid.layers = {
    t: decodeTypedArray(L.t, Uint8Array, N),
    v: decodeTypedArray(L.v, Uint16Array, N),
    block: decodeTypedArray(L.block, Uint8Array, N),
    hgt: decodeTypedArray(L.hgt, Int16Array, N),
    wet: decodeTypedArray(L.wet, Uint8Array, N),
    waterLevel: decodeTypedArray(L.waterLevel, Float32Array, N),
    under: decodeTypedArray(L.under, Int16Array, N),
    flags: decodeTypedArray(L.flags, Uint8Array, N),
    deck: decodeTypedArray(L.deck, Uint8Array, N),
  };
  doc.architecture ||= { rooms: [], openings: [], torches: [], wallHangings: [], buildings: [] };
  doc.architecture.rooms ||= [];
  doc.architecture.openings ||= [];
  doc.architecture.torches ||= [];
  doc.architecture.wallHangings ||= [];
  doc.architecture.buildings ||= [];
  doc.entities ||= { start: [w / 2, h / 2], townPortal: [w / 2 + 1.5, h / 2], exit: { x: w / 2, y: 6, sealed: true, unsealOn: 'objective_complete' }, props: [], spawns: [], npcs: [], interactables: [], zones: [], marks: [] };
  doc.entities.props ||= [];
  doc.entities.spawns ||= [];
  doc.entities.npcs ||= [];
  doc.entities.interactables ||= [];
  doc.entities.zones ||= [];
  doc.entities.marks ||= [];
  doc.objectives ||= [];
  doc.triggers ||= [];
  doc.cutscenes ||= [];
  return doc;
}

// ------------------------------------------------------------------ Bake Procedural Generator Output -> Editable Doc
export function bakeGeneratedToDoc(gen, opts = {}) {
  const map = gen.map;
  const w = map.w, h = map.h, N = w * h;
  const biomeId = opts.biomeId || gen.biome?.id || 'catacombs';
  const category = opts.category || inferCategoryForBiome(biomeId, { dunes: !!gen.dunes, kind: opts.kind });
  const base = createBlankScenarioDoc({
    id: opts.id || `${biomeId}_seed_${opts.seed || gen.seed || 1}`,
    name: opts.name || `${gen.variant?.name || resolveBiome(biomeId).name} (Baked)`,
    category,
    biomeId,
    mixBiomeId: opts.mixBiomeId || null,
    variantId: opts.variantId || gen.variant?.id || 'default',
    towerSpec: category === '3d_tower' ? gen.variant : null,
    w,
    h,
  });

  const L = base.grid.layers;
  L.t.set(map.t.subarray(0, N));
  if (map.v) for (let i = 0; i < N; i++) L.v[i] = map.v[i];
  if (map.block) L.block.set(map.block.subarray(0, N));
  if (map.hgt) for (let i = 0; i < N; i++) L.hgt[i] = Math.round(map.hgt[i]);
  if (map.wet) L.wet.set(map.wet.subarray(0, N));
  if (gen.cave?.lvl) {
    for (let i = 0; i < N; i++) L.waterLevel[i] = Number.isNaN(gen.cave.lvl[i]) ? 0 : gen.cave.lvl[i];
  } else if (gen.dunes?.lvl) {
    for (let i = 0; i < N; i++) L.waterLevel[i] = Number.isNaN(gen.dunes.lvl[i]) ? 0 : gen.dunes.lvl[i];
  }
  if (map.under) for (let i = 0; i < N; i++) L.under[i] = Math.round(map.under[i]);
  if (map.deck) L.deck.set(map.deck.subarray(0, N));
  for (let i = 0; i < N; i++) {
    let fl = 0;
    if (map.rounded && map.rounded[i]) fl |= 1;
    if (map.rampTile && map.rampTile[i]) fl |= 2;
    if (map.c3struct && map.c3struct[i]) fl |= 4;
    if ((map.rampartDeck && map.rampartDeck[i]) || (map.siegeDeck && map.siegeDeck[i])) fl |= 8;
    L.flags[i] = fl;
  }

  base.grid.traversal.climb = map.climb ?? base.grid.traversal.climb;
  base.grid.traversal.drop = map.drop ?? base.grid.traversal.drop;
  base.grid.traversal.walkStep = map.walkStep ?? base.grid.traversal.walkStep;
  if (gen.tower) base.grid.tower = { ...(gen.variant || TOWER_VARIANTS[0]) };

  const toXY = (pt) => {
    if (!pt) return null;
    if (Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number') return [pt[0], pt[1]];
    if (typeof pt === 'object' && typeof pt.x === 'number' && typeof pt.y === 'number') return [pt.x, pt.y];
    return null;
  };
  const sXY = toXY(gen.start);
  if (sXY) base.entities.start = sXY;
  const tpXY = toXY(gen.townPortal) || toXY(gen.portal) || [base.entities.start[0] + 1.6, base.entities.start[1] - 0.6];
  base.entities.townPortal = tpXY;
  const exXY = toXY(gen.exit);
  if (exXY) {
    base.entities.exit = {
      x: exXY[0],
      y: exXY[1],
      sealed: category !== 'town_arena',
      unsealOn: (gen.spawns || []).some((s) => s.rank === 'boss' || s.rank === 'raid') ? 'boss_killed' : 'objective_complete',
      continueToBiome: biomeId === 'mountainside' ? 'snowy_summit' : null,
    };
  }

  base.architecture.rooms = (gen.rooms || []).filter((r) => r && r.w && r.h).map((r, idx) => ({
    id: `r_${idx + 1}`,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    title: r.title || '',
    theme: r.theme || null,
  }));

  if (gen.raid) {
    base.architecture.raidArena = structuredClone(gen.raid);
    if (gen.raid.arch) {
      base.architecture.openings.push({
        id: 'op_raid_gate',
        ...structuredClone(gen.raid.arch),
      });
    }
  }

  base.architecture.torches = (gen.torches || []).map((tc) => ({
    x: tc.x,
    y: tc.y,
    mountX: tc.mountX ?? tc.x,
    mountY: tc.mountY ?? tc.y,
    dir: tc.dir || 'b',
    front: !!tc.front,
    depth: tc.depth ?? (tc.x + tc.y),
    flameZ: tc.flameZ ?? 60,
  }));

  base.architecture.wallHangings = (gen.wallHangings || []).map((wh) => ({
    x: wh.x,
    y: wh.y,
    dir: wh.dir || 'b',
    design: wh.design ?? 0,
    depth: wh.depth ?? (wh.x + wh.y),
  }));

  base.architecture.buildings = (gen.buildings || []).map((b, idx) => ({
    id: `bld_${idx + 1}`,
    kind: b.kind || b.name || 'cottage',
    x: b.x,
    y: b.y,
    w: b.w || 3,
    h: b.h || 3,
    flip: !!b.flip,
  }));

  base.entities.props = (gen.props || []).slice(0, 2500).map((p, idx) => ({
    id: `pr_${idx + 1}`,
    kind: p.kind || (p.caveProp ? 'caveProp' : 'scatter'),
    name: p.spr?.name || p.name || p.caveProp || p.sprite || 'prop',
    sprite: p.sprite || null,
    seed: p.seed ?? 0,
    caveProp: p.caveProp || null,
    m: p.m ?? 0,
    x: Math.round(p.x * 100) / 100,
    y: Math.round(p.y * 100) / 100,
    z: p.z || 0,
    k: p.k || p.s || 0.4,
    flip: !!p.flip,
    light: p.light || 0,
    tree: !!p.tree,
    throne: !!p.throne,
  }));

  base.entities.spawns = (gen.spawns || []).map((s, idx) => ({
    id: `sp_${idx + 1}`,
    castKey: (s.rank === 'boss' || s.rank === 'raid') ? `boss_${idx + 1}` : '',
    x: Math.round(s.x * 100) / 100,
    y: Math.round(s.y * 100) / 100,
    arch: s.arch || (s.rank === 'raid' ? 'malphas' : 'skeleton'),
    rank: s.rank || 'normal',
    n: s.n || 1,
    art: s.look?.art || s.art || null,
    swap: typeof s.look?.swap === 'string' ? s.look.swap : (s.swap || null),
    name: s.name || '',
  }));

  base.entities.interactables = (gen.chests || []).map((ch, idx) => ({
    id: `ch_${idx + 1}`,
    kind: ch.worldObjId ? 'worldobject' : 'chest',
    subType: ch.worldObjId || (ch.rare ? 'rare' : 'standard'),
    x: Math.round(ch.x * 100) / 100,
    y: Math.round(ch.y * 100) / 100,
    label: ch.label || '',
  }));

  if (gen.vendors || gen.npcs) {
    base.entities.npcs = (gen.npcs || gen.vendors || []).map((n, idx) => ({
      id: `npc_${idx + 1}`,
      castKey: n.id || `npc_${idx + 1}`,
      role: n.vendorId || n.role || 'villager',
      spriteId: n.townsfolkSpriteId || n.spriteId || '01_blacksmith_apprentice',
      name: n.name || 'Villager',
      x: Math.round(n.x * 100) / 100,
      y: Math.round(n.y * 100) / 100,
      lines: Array.isArray(n.storyLines) ? n.storyLines.slice() : [],
    }));
  }

  return base;
}

// ------------------------------------------------------------------ Reachability & Scenario Diagnostics
export function validateScenarioDoc(doc) {
  const issues = [];
  if (!doc || doc.format !== SCENARIO_FORMAT) {
    return [{ level: 'error', code: 'FORMAT', msg: 'Invalid scenario document format.' }];
  }
  const { w, h, layers, traversal } = doc.grid || {};
  if (!w || !h || !layers?.t || layers.t.length !== w * h) {
    issues.push({ level: 'error', code: 'GRID', msg: 'Grid dimensions or floor layer buffer mismatch.' });
    return issues;
  }

  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const walkable = (x, y) => {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (!inb(tx, ty)) return false;
    const i = ty * w + tx;
    return layers.t[i] === 1 && !layers.block[i];
  };

  const [sx, sy] = doc.entities?.start || [-1, -1];
  if (!walkable(sx, sy)) {
    issues.push({ level: 'error', code: 'START_BLOCKED', msg: `Player Start (${sx.toFixed(1)}, ${sy.toFixed(1)}) is not on a walkable floor tile.`, at: [sx, sy] });
  }
  const ex = doc.entities?.exit;
  if (ex && !walkable(ex.x, ex.y)) {
    issues.push({ level: 'warn', code: 'EXIT_BLOCKED', msg: `Exit Portal (${ex.x.toFixed(1)}, ${ex.y.toFixed(1)}) is on a blocked or void tile.`, at: [ex.x, ex.y] });
  }

  // BFS reachability from start under climb/drop rules
  const reach = new Uint8Array(w * h);
  if (walkable(sx, sy)) {
    const climb = traversal?.climb ?? 4;
    const drop = traversal?.drop ?? 10;
    const hasHgt = layers.hgt && layers.hgt.some((v) => v !== 0);
    const startIdx = Math.floor(sy) * w + Math.floor(sx);
    const q = [startIdx];
    reach[startIdx] = 1;
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi], cx = cur % w, cy = (cur / w) | 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + ox, ny = cy + oy;
        if (!inb(nx, ny)) continue;
        const ni = ny * w + nx;
        if (reach[ni] || layers.t[ni] !== 1 || layers.block[ni]) continue;
        if (hasHgt) {
          const d = layers.hgt[ni] - layers.hgt[cur];
          if (d > climb || -d > drop) continue;
        }
        reach[ni] = 1;
        q.push(ni);
      }
    }

    // Disconnected multi-region modes (Serpentine Tower roof, Dunes interior tomb, Mines shafts) link by teleports/doors
    const multiRegion = ['3d_tower', '3d_dunes', 'naval'].includes(doc.meta?.category) || doc.meta?.biomeId === 'deep_mines';
    if (ex && walkable(ex.x, ex.y) && !multiRegion) {
      const ei = Math.floor(ex.y) * w + Math.floor(ex.x);
      if (!reach[ei]) {
        issues.push({ level: 'warn', code: 'EXIT_UNREACHABLE', msg: 'Exit Portal cannot be reached by walking/hopping from Player Start (check cliffs or walls).', at: [ex.x, ex.y] });
      }
    }
  }

  // Cutscene & Trigger checks
  const castKeys = new Set(['hero', 'k1', 'k2']);
  for (const s of doc.entities?.spawns || []) if (s.castKey) castKeys.add(s.castKey);
  for (const n of doc.entities?.npcs || []) if (n.castKey) castKeys.add(n.castKey);
  const cineIds = new Set((doc.cutscenes || []).map((c) => c.id));
  const zoneIds = new Set((doc.entities?.zones || []).map((z) => z.id));

  for (const tr of doc.triggers || []) {
    if (tr.runCutscene && !cineIds.has(tr.runCutscene)) {
      issues.push({ level: 'error', code: 'MISSING_CINE', msg: `Trigger "${tr.name || tr.id}" references missing cutscene "${tr.runCutscene}".` });
    }
    if ((tr.event === 'onEnterZone' || tr.event === 'onExitZone') && tr.zoneId && !zoneIds.has(tr.zoneId)) {
      issues.push({ level: 'warn', code: 'MISSING_ZONE', msg: `Trigger "${tr.name || tr.id}" references missing zone "${tr.zoneId}".` });
    }
  }

  for (const c of doc.cutscenes || []) {
    let lastCamTarget = null;
    for (const st of c.steps || []) {
      if (st.type === 'cam') {
        lastCamTarget = st.mode === 'actor' ? st.who : st.mode === 'fit' ? (st.actors || []) : 'tile';
      }
      if (st.type === 'say') {
        if (st.text && st.text.length > 160) {
          issues.push({ level: 'info', code: 'LINE_LONG', msg: `Cutscene "${c.name}": line by "${st.who}" is ${st.text.length} chars (>150 mobile two-line guideline).` });
        }
        if (st.who && !castKeys.has(st.who) && !st.customName) {
          issues.push({ level: 'warn', code: 'UNKNOWN_SPEAKER', msg: `Cutscene "${c.name}": speaker "@${st.who}" has no matching Cast Key on the map.` });
        }
        if (lastCamTarget && typeof lastCamTarget === 'string' && lastCamTarget !== 'tile' && st.who && lastCamTarget !== st.who && !st.allowOffscreen) {
          issues.push({ level: 'info', code: 'SPEAKER_FRAMING', msg: `Cutscene "${c.name}": "@${st.who}" speaks while camera follows "@${lastCamTarget}" (consider framing speaker).` });
        }
      }
    }
  }

  return issues;
}

export function computeReachabilityMask(doc) {
  const { w, h, layers, traversal } = doc.grid;
  const reach = new Uint8Array(w * h);
  const [sx, sy] = doc.entities?.start || [0, 0];
  const tx = Math.floor(sx), ty = Math.floor(sy);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return reach;
  const startIdx = ty * w + tx;
  if (layers.t[startIdx] !== 1 || layers.block[startIdx]) return reach;
  const climb = traversal?.climb ?? 4, drop = traversal?.drop ?? 10;
  const q = [startIdx];
  reach[startIdx] = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi], cx = cur % w, cy = (cur / w) | 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (reach[ni] || layers.t[ni] !== 1 || layers.block[ni]) continue;
      const d = layers.hgt[ni] - layers.hgt[cur];
      if (d > climb || -d > drop) continue;
      reach[ni] = 1;
      q.push(ni);
    }
  }
  return reach;
}
