// Shared .velscen.json schema, RLE64 typed-array codec, blank scenario factories (all 11 categories & 45+ biomes),
// procedural seed-to-document baker, and reachability/cutscene validator. Pure ES module (runs in Browser and Node).
import { BIOMES, BETA_BIOMES, BREACH_BIOME, SCORPION_KING_PYRAMID_BIOME, TOWN_BIOME, ACT2_TOWN_BIOME, BIOME_BY_ID } from '../data/biomes.js';
import { TOWER_VARIANTS, towerGeo } from './tower.js';
import { CAVE_VARIANTS, VZ, CAVE_ROSTER } from './caverns.js';
import { DUNE_VARIANTS, DUNE_ROSTER } from '../data/dunes.js';
import { DEPTHS_EDGE, DEPTHS_EDGE_BOSSES } from '../data/depthsedge.js';
import { ART_BY_ID } from '../data/bestiary.js';
import { CASTLE_VARIANTS } from '../data/castles.js';
import { SIEGE_VARIANTS } from './siege.js';
import { HUNT_LANDS } from '../data/huntlands.js';
import { shipLayout, MAP_W as SKY_W, MAP_H as SKY_H, OX as SKY_OX, OY as SKY_OY, GATE as SKY_GATE, LANDING as SKY_LANDING } from './skyship.js';
import { SEA_W, SEA_H, OX as SEA_OX, OY as SEA_OY, SEA_LV, DAWNWAKE } from './seaship.js';
import { GT_W, GT_H, ROW0, ROWS, trainLayout, crateCells } from './ghosttrain.js';
import { LV as ALP_LV } from './alpine.js';

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
    blurb: '2.5D outdoor wilds, towering Dark Forest, forested Mountainside climb, 3D-baked Castles, Siege keeps, Hunt & Mines.',
    biomes: ['overworld', 'dark_forest', 'mountainside', 'castle', 'sea_of_sand', 'endless_siege', 'great_hunt', 'deep_mines'],
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
    name: '3D Mountainside & Snowy Summit',
    short: '3D Mountain',
    icon: '🏔️',
    projection: 'heightfield_3d',
    defaultSize: [72, 96],
    blurb: 'Forested hillside switchback trail (Mountainside) & high ridgeline climb (Snowy Summit) drawn live in Three.js.',
    biomes: ['mountainside', 'snowy_summit'],
    variants: [
      { id: 'switchback', name: 'Forested Hillside Switchback' },
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
  let category = CATEGORY_BY_ID[opts.category] ? opts.category : 'dungeon';
  if (category === 'overworld' && opts.biomeId === 'mountainside') category = '3d_alpine';
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
  const torches3d = [];
  const passages = [];
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
    // Ramp climbing around the falls cliff to the upper plateau
    for (let s = 0; s <= 40; s++) {
      const k = s / 40;
      carveDisk(58 + Math.sin(k * Math.PI) * 8, 44 - k * 23, 3.4, 0, Math.round(4 + k * 28));
    }
    carveDisk(54, 20, 11, 0, 32);
    waterfalls.push({ x: 52, y: 32, top: 3.2, base: 0.4, w: 4.5 });
    for (const [tx, ty, th] of [[24, 70, 0.8], [30, 70, 0.8], [46, 44, 1.2], [58, 44, 1.2], [50, 22, 4.1], [58, 22, 4.1]]) {
      torches3d.push({ x: tx, y: ty, h: th, nx: 0.7, ny: 0.7, stand: true });
    }
    rooms.push(
      { id: 'r_cave_entry', x: 18, y: 66, w: 16, h: 16, title: 'Cavern Mouth', theme: null, floorLv: 0 },
      { id: 'r_cave_lake', x: 42, y: 36, w: 20, h: 20, title: 'Silt Plunge Pool', theme: null, floorLv: 4 },
      { id: 'r_cave_summit', x: 44, y: 10, w: 20, h: 20, title: 'Top of the Falls', theme: null, floorLv: 32 }
    );
    start = [26.5, 76.5];
    townPortal = [28.5, 76.0];
    exit = { x: 54.5, y: 15.5, sealed: true, unsealOn: 'boss_killed', continueToBiome: null };
    spawns.push({ id: 'sp_cave_boss', castKey: 'falls_warden', x: 54.5, y: 21.5, arch: 'golem', rank: 'boss', n: 1, art: 'de_mother_of_closed_doors', swap: null, name: 'Mother of Closed Doors' });
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
    passages.push({
      id: 'psg_stairhead',
      name: 'Stairhead Arch → Rooftop Arena',
      from: [Math.round((g.XT + 2.5) * 10) / 10, Math.round((g.YR + g.w / 2) * 10) / 10],
      to: [Math.round(g.AX * 10) / 10, Math.round((g.AY + g.RT * 0.65) * 10) / 10],
      bidirectional: true,
      lockUntil: 'none',
      color: '#ffe2a0',
    });
    rooms.push(
      { id: 'r_tw_base', x: Math.floor(g.XB - 12), y: g.YR, w: 12, h: g.w, title: 'Tower Base', theme: null, floorLv: 0 },
      { id: 'r_tw_roof', x: Math.floor(g.AX - g.RT), y: Math.floor(g.AY - g.RT), w: Math.round(g.RT * 2), h: Math.round(g.RT * 2), title: 'Rooftop Arena', theme: null, floorLv: Math.round(g.roofZ * (VZ / 4)) }
    );
    spawns.push({ id: 'sp_roof_boss', castKey: 'sky_admiral', x: g.AX, y: g.AY + 4, arch: 'knight', rank: 'boss', n: 1, art: null, swap: null, name: 'Tower Sovereign' });
  } else if (category === '3d_alpine') {
    const isMtn = biomeId === 'mountainside';
    // Grassy forested hillside switchback (Mountainside) or snowy ridge climb (Snowy Summit)
    carveDisk(20, 80, 10, isMtn ? 1 : 0, 8);
    for (let s = 0; s <= 40; s++) {
      const k = s / 40;
      const px = 20 + k * 34, py = 80 - k * 24, lv = Math.round(8 + k * 18);
      carveDisk(px, py, 5.2, isMtn ? 0 : 0, lv);
      if (isMtn) carveDisk(px, py, 1.9, 9, lv); // dirt forest path down the middle
    }
    carveDisk(54, 56, 9, isMtn ? 3 : 0, 26);
    for (let s = 0; s <= 40; s++) {
      const k = s / 40;
      const px = 54 - k * 20, py = 56 - k * 34, lv = Math.round(26 + k * 22);
      carveDisk(px, py, 5.0, isMtn ? 6 : 0, lv);
      if (isMtn) carveDisk(px, py, 1.9, 10, lv); // gravel switchback path
    }
    carveDisk(34, 22, 11, isMtn ? 7 : 1, 48);
    if (isMtn) {
      for (const [tx, ty, nm, tr] of [
        [14.5, 78.5, 't_scots_pine', true], [27.5, 81.5, 't_medium_fir', true], [16.5, 84.5, 't_old_cedar', true],
        [29.5, 73.5, 'wildflowers', false], [48.5, 62.5, 't_scots_pine', true], [60.5, 53.5, 't_medium_fir', true],
        [49.5, 55.5, 'campfire', false], [42.5, 42.5, 't_wind_pine', true], [26.5, 24.5, 'stone_cairn', false],
      ]) {
        props.push({ id: `pr_mtn_${props.length + 1}`, kind: 'scatter', name: nm, x: tx, y: ty, z: 0, k: 0.4, flip: false, light: nm === 'campfire' ? 5 : 0, tree: tr });
      }
    }
    rooms.push(
      { id: 'r_alp_base', x: 12, y: 72, w: 16, h: 16, title: isMtn ? 'Forest Trailhead' : 'Arrival Ridge Camp', theme: null, floorLv: 8 },
      { id: 'r_alp_mid', x: 46, y: 48, w: 16, h: 16, title: isMtn ? 'Hillside Pine Camp' : 'Midway Shelf', theme: null, floorLv: 26 },
      { id: 'r_alp_peak', x: 24, y: 12, w: 20, h: 20, title: isMtn ? 'Slate Pass Summit' : 'Summit Plateau', theme: null, floorLv: 48 }
    );
    start = [20.5, 82.5];
    townPortal = [22.5, 82.0];
    exit = { x: 34.5, y: 17.5, sealed: true, unsealOn: 'boss_killed', continueToBiome: isMtn ? 'snowy_summit' : null };
    spawns.push({ id: 'sp_peak_boss', castKey: 'peak_warden', x: 34.5, y: 23.5, arch: 'golem', rank: 'boss', n: 1, art: null, swap: 'frost', name: 'The Summit Warden' });
  } else if (category === '3d_dunes') {
    const E = 172, OXI = E + 26;
    const pc = 41, half = 26, doorStep = [pc + 0.5, pc + half + 3.5];
    // Exterior desert plaza & camp trail
    carveDisk(140, 140, 14, 0, 0);
    for (let s = 0; s <= 60; s++) {
      const k = s / 60;
      carveDisk(140 - k * 95, 140 - k * 66, 6, 0, Math.round(Math.sin(k * Math.PI * 2) * 3));
    }
    carveRect(pc - 14, pc + half + 1, 29, 14, 3, 0);
    // Interior tomb chamber at x >= OXI
    carveRect(OXI + 40, 50, 32, 32, 0, -20);
    const tombTorches = [
      { x: doorStep[0] - 3, y: doorStep[1] - 1.5, h: 0.2, stand: true, nx: 0, ny: 1 },
      { x: doorStep[0] + 3, y: doorStep[1] - 1.5, h: 0.2, stand: true, nx: 0, ny: 1 },
      { x: OXI + 44, y: 54, h: -20 / (VZ / 4), stand: true, nx: 0, ny: 1 },
      { x: OXI + 68, y: 54, h: -20 / (VZ / 4), stand: true, nx: 0, ny: 1 },
      { x: OXI + 44, y: 78, h: -20 / (VZ / 4), stand: true, nx: 0, ny: 1 },
      { x: OXI + 68, y: 78, h: -20 / (VZ / 4), stand: true, nx: 0, ny: 1 },
    ];
    dunesMeta = {
      extW: E,
      oxi: OXI,
      tombSize: 112,
      pyramid: { pc, cx: pc, cy: pc, half, base: 0, top: 32, door: [pc + 0.5, pc + half + 1], doorStep, steps: 0 },
      seals: [],
      torches3d: tombTorches,
    };
    passages.push({
      id: 'psg_pyramid_door',
      name: 'Pyramid Entrance → Tomb Chamber',
      from: doorStep,
      to: [OXI + 56, 78],
      bidirectional: true,
      lockUntil: 'none',
      color: '#ffd060',
    });
    rooms.push(
      { id: 'r_dn_start', x: 128, y: 128, w: 24, h: 24, title: 'Caravan Arrival', theme: null, floorLv: 0 },
      { id: 'r_dn_plaza', x: pc - 14, y: pc + half + 1, w: 29, h: 14, title: 'Pyramid Forecourt', theme: null, floorLv: 0 },
      { id: 'r_dn_chamber', x: OXI + 40, y: 50, w: 32, h: 32, title: 'The Burial Chamber', theme: null, floorLv: -20 }
    );
    start = [140.5, 140.5];
    townPortal = [142.5, 140.0];
    exit = { x: OXI + 56, y: 58, sealed: true, unsealOn: 'boss_killed', continueToBiome: null };
    spawns.push({ id: 'sp_pharaoh', castKey: 'pharaoh', x: OXI + 56, y: 66, arch: 'knight', rank: 'boss', n: 1, art: 'ss_boss_the_salt_pharaoh', swap: null, name: 'The Sunless Pharaoh' });
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
        dark: category === '3d_alpine' ? (biomeId === 'mountainside' ? 0.05 : 0.12) : (biome.dark ?? 0.75),
        light: biome.light ?? 8.5,
        fog: biomeId === 'mountainside' ? '#a8c4dc' : (biome.fog || '#0b0706'),
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
        torches3d,
        snowLine: biomeId === 'snowy_summit' ? -10 : 165,
        cloudSeaY: biomeId === 'mountainside' ? -2.4 : -6,
      },
      tower: towerSpec,
      dunes: dunesMeta,
      train: trainCars ? { cars: trainCars, stations: [] } : null,
      naval: category === 'naval' ? { ships: [], planks: [], docks: [[-16, 12], [2.5, 12], [12, 15.5]], waves: [] } : null,
      airship: category === 'airship' ? { flagship: 'THE BLACK SCOURGE', flagshipSub: 'Pirate Dreadnought', vessels: [], knights: [], waves: [], gauntlet: null } : null,
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
      passages,
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
          floorLv: hgt[Math.min(w * h - 1, Math.max(0, Math.floor(exit.y) * w + Math.floor(exit.x)))] || 0,
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

/** Compute median walkable floor elevation (`lv`) inside a tile rectangle `[rx..rx+rw, ry..ry+rh]`. */
export function computeRectFloorLv(layers, w, h, rx, ry, rw, rh) {
  if (!layers?.hgt) return 0;
  const x0 = Math.max(0, Math.floor(rx)), x1 = Math.min(w - 1, Math.ceil(rx + rw) - 1);
  const y0 = Math.max(0, Math.floor(ry)), y1 = Math.min(h - 1, Math.ceil(ry + rh) - 1);
  const vals = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (layers.t?.[i] === 1 && !layers.block?.[i]) vals.push(layers.hgt[i]);
    }
  }
  if (!vals.length) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (layers.t?.[i] === 1 || layers.wet?.[i] > 0) vals.push(layers.hgt[i]);
      }
    }
  }
  if (!vals.length) {
    const cx = Math.max(0, Math.min(w - 1, Math.floor(rx + rw / 2)));
    const cy = Math.max(0, Math.min(h - 1, Math.floor(ry + rh / 2)));
    return layers.hgt[cy * w + cx] || 0;
  }
  vals.sort((a, b) => a - b);
  return vals[vals.length >> 1];
}

function findNearestWalkable(layers, w, h, cx, cy, maxR = 8, dryOnly = false) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const ok = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;
    const i = ty * w + tx;
    if (layers.t[i] !== 1 || layers.block[i]) return false;
    if (dryOnly && layers.wet?.[i]) return false;
    return true;
  };
  const bx = Math.floor(cx), by = Math.floor(cy);
  if (ok(bx, by)) return [round2(cx), round2(cy)];
  let best = null, bestD = Infinity;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = bx + dx, ty = by + dy;
        if (!ok(tx, ty)) continue;
        const d = (tx + 0.5 - cx) ** 2 + (ty + 0.5 - cy) ** 2;
        if (d < bestD) { bestD = d; best = [tx + 0.5, ty + 0.5]; }
      }
    }
    if (best) return best;
  }
  return [round2(Math.max(1, Math.min(w - 2, cx))), round2(Math.max(1, Math.min(h - 2, cy)))];
}

function prettyArtName(artId) {
  if (!artId) return '';
  if (ART_BY_ID[artId]?.name) return ART_BY_ID[artId].name;
  return String(artId)
    .replace(/^(ss_boss_|ss_|de_|ap_|eb_|hv_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
    objectives: structuredClone(doc.objectives || []).map(({ _done, ...rest }) => rest),
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
  doc.grid.heightfield ||= { subdiv: 2, waterfalls: [], torches3d: [], snowLine: 28, cloudSeaY: -6 };
  doc.grid.heightfield.waterfalls ||= [];
  doc.grid.heightfield.torches3d ||= [];
  if (doc.grid.airship) doc.grid.airship.vessels ||= [];
  doc.architecture ||= { rooms: [], openings: [], torches: [], wallHangings: [], buildings: [] };
  doc.architecture.rooms ||= [];
  doc.architecture.openings ||= [];
  doc.architecture.torches ||= [];
  doc.architecture.wallHangings ||= [];
  doc.architecture.buildings ||= [];
  doc.entities ||= { start: [w / 2, h / 2], townPortal: [w / 2 + 1.5, h / 2], exit: { x: w / 2, y: 6, sealed: true, unsealOn: 'objective_complete' }, passages: [], props: [], spawns: [], npcs: [], interactables: [], zones: [], marks: [] };
  doc.entities.passages ||= [];
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
  const round2 = (n) => Math.round(n * 100) / 100;
  const map = gen.map;
  const w = map.w, h = map.h, N = w * h;
  const biomeId = opts.biomeId || gen.biome?.id || 'catacombs';
  const category = opts.category || inferCategoryForBiome(biomeId, { dunes: !!gen.dunes, kind: opts.kind });
  const seed = Number(opts.seed || gen.seed || 1337);
  const bossCount = Math.max(1, Math.min(3, Number(opts.bossCount) || 2));

  const base = createBlankScenarioDoc({
    id: opts.id || `${biomeId}_seed_${seed}`,
    name: opts.name || `${gen.variant?.name || resolveBiome(biomeId).name} (Baked)`,
    category,
    biomeId,
    mixBiomeId: opts.mixBiomeId || null,
    variantId: opts.variantId || gen.variant?.id || 'default',
    towerSpec: category === '3d_tower' ? gen.variant : null,
    w,
    h,
  });

  // Reset blank template's placeholder passages/zones/rooms before filling from generator
  base.entities.passages = [];
  base.grid.heightfield.torches3d = [];

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
  if (sXY) base.entities.start = findNearestWalkable(L, w, h, sXY[0], sXY[1], 4);
  const tpRaw = toXY(gen.townPortal) || toXY(gen.portal) || [base.entities.start[0] + 1.6, base.entities.start[1] - 0.6];
  base.entities.townPortal = findNearestWalkable(L, w, h, tpRaw[0], tpRaw[1], 4);
  const exXY = toXY(gen.exit);
  if (exXY) {
    const [ex, ey] = findNearestWalkable(L, w, h, exXY[0], exXY[1], 6, true);
    base.entities.exit = {
      x: ex,
      y: ey,
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
    floorLv: computeRectFloorLv(L, w, h, r.x, r.y, r.w, r.h),
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
    x: round2(p.x),
    y: round2(p.y),
    z: p.z || 0,
    k: p.k || p.s || (p.caveProp ? 1 : 0.4),
    flip: !!p.flip,
    light: p.light || 0,
    tree: !!p.tree || !!p.spr?.tree,
    throne: !!p.throne,
  }));

  base.entities.spawns = (gen.spawns || []).map((s, idx) => ({
    id: `sp_${idx + 1}`,
    castKey: (s.rank === 'boss' || s.rank === 'raid') ? `boss_${idx + 1}` : '',
    x: round2(s.x),
    y: round2(s.y),
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
    subType: ch.worldObjId || (ch.rare || ch.rich ? 'rare' : 'standard'),
    x: round2(ch.x),
    y: round2(ch.y),
    label: ch.label || '',
  }));

  if (gen.vendors || gen.npcs) {
    base.entities.npcs = (gen.npcs || gen.vendors || []).map((n, idx) => ({
      id: `npc_${idx + 1}`,
      castKey: n.id || `npc_${idx + 1}`,
      role: n.vendorId || n.role || 'villager',
      spriteId: n.townsfolkSpriteId || n.spriteId || '01_blacksmith_apprentice',
      name: n.name || 'Villager',
      x: round2(n.x),
      y: round2(n.y),
      lines: Array.isArray(n.storyLines) ? n.storyLines.slice() : [],
    }));
  }

  // ------------------------------------------------------------------ Specialized 3D Architecture, Multi-Boss & Encounter Materialization
  const LV = VZ / 4;
  let bossZoneSet = false;
  const setBossZone = (rx, ry, rw, rh, zName = 'Boss Approach Zone') => {
    const zx = Math.max(1, Math.round(rx)), zy = Math.max(1, Math.round(ry));
    const zw = Math.max(4, Math.min(w - zx - 1, Math.round(rw)));
    const zh = Math.max(4, Math.min(h - zy - 1, Math.round(rh)));
    base.entities.zones = [{
      id: 'z_boss_approach',
      name: zName,
      shape: 'rect',
      x: zx,
      y: zy,
      w: zw,
      h: zh,
      floorLv: computeRectFloorLv(L, w, h, zx, zy, zw, zh),
      color: '#ff9a40',
    }];
    bossZoneSet = true;
  };

  const pushSpawn = (spec) => {
    const [wx, wy] = findNearestWalkable(L, w, h, spec.x, spec.y, spec.maxR ?? 6, !!spec.dry);
    const id = spec.id || `sp_${base.entities.spawns.length + 1}`;
    base.entities.spawns.push({
      id,
      castKey: spec.castKey || '',
      x: wx,
      y: wy,
      arch: spec.arch || 'skeleton',
      rank: spec.rank || 'normal',
      n: spec.n || 1,
      art: spec.art || null,
      swap: spec.swap || null,
      name: spec.name || '',
      scale: spec.scale || undefined,
      hpK: spec.hpK || undefined,
      arenaRect: spec.arenaRect || undefined,
    });
  };

  // 1. SEA OF SAND & PYRAMID (3D Dunes + Downward-Spiraling Multi-Boss Tomb)
  if (gen.dunes) {
    const dv = gen.dunes;
    const v = dv.v || DUNE_VARIANTS[0];
    base.meta.variantId = v.id;
    const P = dv.pyramid;
    base.grid.dunes = {
      extW: dv.E,
      oxi: dv.OXI,
      oyi: dv.OYI,
      tombSize: dv.IS,
      seed: dv.seed,
      pyramid: {
        pc: P.pc,
        cx: P.pc,
        cy: P.pc,
        half: P.half,
        top: round2(P.top),
        base: round2(P.base),
        door: [round2(P.door[0]), round2(P.door[1])],
        doorStep: [round2(P.doorStep[0]), round2(P.doorStep[1])],
        plaza: P.plaza ? { ...P.plaza } : null,
        steps: P.steps || 0,
      },
      seals: (dv.seals || []).map((s) => ({
        k: s.k,
        x: round2(s.x),
        y: round2(s.y),
        h: round2(s.h),
        axis: s.axis,
        tiles: Array.from(s.tiles || []),
      })),
      torches3d: (dv.torches || []).map((tc) => ({
        x: round2(tc.x),
        y: round2(tc.y),
        h: round2(tc.h),
        stand: !!tc.stand,
        nx: round2(tc.nx ?? 0),
        ny: round2(tc.ny ?? 1),
      })),
    };

    // Passage linking Exterior Pyramid Door <-> Interior Entrance Hall
    if (P?.doorStep && dv.arrive) {
      base.entities.passages.push({
        id: 'psg_pyramid_door',
        name: `${v.pyramid?.name || 'Pyramid'} Entrance ↔ Entrance Hall`,
        from: findNearestWalkable(L, w, h, P.doorStep[0], P.doorStep[1], 4),
        to: findNearestWalkable(L, w, h, dv.arrive[0], dv.arrive[1], 4),
        bidirectional: true,
        lockUntil: 'none',
        color: '#ffd060',
      });
    }

    // Exterior Rooms: Caravan Start, Waystone Camps (with Captains & Guards), and Pyramid Plaza
    const [sx, sy] = base.entities.start;
    base.architecture.rooms.push({
      id: 'r_dunes_start',
      x: Math.max(2, Math.round(sx - 8)),
      y: Math.max(2, Math.round(sy - 8)),
      w: 16,
      h: 16,
      title: 'Caravan Arrival',
      theme: null,
      floorLv: computeRectFloorLv(L, w, h, sx - 8, sy - 8, 16, 16),
    });

    const campNames = v.camps || [];
    const pickArt = (arch, k = 0) => {
      const list = v.roster?.[arch] || [];
      return list.length ? list[(seed + k) % list.length] : (gen.looks?.pick?.(arch)?.art || null);
    };

    (dv.camps || []).forEach((c, idx) => {
      const cTitle = campNames[(seed + idx * 3) % Math.max(1, campNames.length)] || `Waystone Camp ${idx + 1}`;
      const cr = Math.max(6, Math.round(c.r || 8));
      const rx = Math.max(2, Math.round(c.x - cr)), ry = Math.max(2, Math.round(c.y - cr));
      const flv = computeRectFloorLv(L, w, h, rx, ry, cr * 2, cr * 2);
      base.architecture.rooms.push({
        id: `r_camp_${idx + 1}`,
        x: rx,
        y: ry,
        w: cr * 2,
        h: cr * 2,
        title: `Waystone ${idx + 1}: ${cTitle}`,
        theme: null,
        floorLv: flv,
      });
      // Materialize Camp Captain / Champion + Guard Pack
      const capArch = ['knight', 'golem', 'scorpion', 'cultist'][idx % 4];
      pushSpawn({
        id: `sp_camp_capt_${idx + 1}`,
        castKey: `waystone_captain_${idx + 1}`,
        x: c.x + 1.2,
        y: c.y + 1.0,
        arch: capArch,
        rank: 'unique',
        n: 1,
        art: pickArt(capArch, idx),
        name: `${v.tint || 'Sand'} Warden of ${cTitle.replace(/^The /, '')}`,
      });
      const packArch = DUNE_ROSTER[(seed + idx * 5) % DUNE_ROSTER.length];
      pushSpawn({
        id: `sp_camp_pack_${idx + 1}`,
        x: c.x - 2.0,
        y: c.y + 1.8,
        arch: packArch,
        rank: idx === (dv.camps.length - 1) ? 'champion' : 'normal',
        n: 4,
        art: pickArt(packArch, idx + 7),
      });
    });

    if (P?.plaza) {
      const pz = P.plaza;
      base.architecture.rooms.push({
        id: 'r_pyramid_plaza',
        x: pz.x0,
        y: pz.y0,
        w: pz.x1 - pz.x0 + 1,
        h: pz.y1 - pz.y0 + 1,
        title: `${v.pyramid?.name || 'Pyramid'} Forecourt`,
        theme: null,
        floorLv: Math.round(P.base * LV),
      });
    }

    // Interior Spiraling Tomb Cells (k = 0..11), Mid-Tomb Boss at k=6, Treasury, and Burial Chamber Final Boss
    const roomTitles = v.rooms || [];
    let hallSeq = 0;
    (dv.rooms || []).forEach((rm, k) => {
      const rw = rm.x1 - rm.x0 + 1, rh = rm.y1 - rm.y0 + 1;
      const flv = Math.round(rm.h * LV);
      let rTitle = '';
      if (k === 0) rTitle = 'Tomb Entrance Hall';
      else if (k === 6 && rm.room) rTitle = `Warden's Hall (Mid-Boss)`;
      else if (rm.room) {
        rTitle = roomTitles[(seed + hallSeq * 2) % Math.max(1, roomTitles.length)] || `Tomb Hall ${k}`;
        hallSeq++;
      } else {
        rTitle = `Spiral Landing ${k}`;
      }
      base.architecture.rooms.push({
        id: `r_tomb_${k}`,
        x: rm.x0,
        y: rm.y0,
        w: rw,
        h: rh,
        title: rTitle,
        theme: null,
        floorLv: flv,
      });

      // Populate Tomb Fighting Halls (generateDunes left rm.room === true empty for runtime director!)
      if (rm.room && k > 0) {
        if (k === 6) {
          // Mid-Tomb Boss (v.bosses[1]) + 2 Honor Guards
          const [bArt, bTpl, bSub] = v.bosses?.[1] || v.bosses?.[0] || ['ss_boss_the_salt_pharaoh', 'pontiff', 'Warden of the Sealed Stair'];
          const bName = prettyArtName(bArt);
          pushSpawn({
            id: 'sp_tomb_midboss',
            castKey: 'tomb_warden',
            x: rm.cx + 0.5,
            y: rm.cy + 0.5,
            arch: bTpl || 'pontiff',
            rank: 'raid',
            n: 1,
            art: bArt,
            scale: 2.0,
            hpK: 0.55,
            name: bSub ? `${bName}, ${bSub}` : bName,
            arenaRect: { x: rm.x0, y: rm.y0, w: rw, h: rh, cx: rm.cx, cy: rm.cy },
          });
          pushSpawn({
            id: 'sp_tomb_midboss_guards',
            x: rm.cx - 2.5,
            y: rm.cy + 2.0,
            arch: 'knight',
            rank: 'champion',
            n: 2,
            art: pickArt('knight', k),
          });
        } else {
          // Fighting Hall encounter: Champion Statues / High Priests + Risen Tomb Pack
          const leadArch = ['golem', 'cultist', 'knight', 'scorpion', 'wraith'][k % 5];
          const mobArch = ['zombie', 'beetle', 'skeleton', 'archer', 'hound'][k % 5];
          pushSpawn({
            id: `sp_tomb_hall_lead_${k}`,
            x: rm.cx,
            y: rm.cy - 1.5,
            arch: leadArch,
            rank: 'champion',
            n: 2,
            art: pickArt(leadArch, k),
          });
          pushSpawn({
            id: `sp_tomb_hall_pack_${k}`,
            x: rm.cx + 1.5,
            y: rm.cy + 1.8,
            arch: mobArch,
            rank: 'normal',
            n: 4,
            art: pickArt(mobArch, k + 3),
          });
        }
      }
    });

    // The Treasury (off k=7)
    if (dv.treasury) {
      const T = dv.treasury;
      base.architecture.rooms.push({
        id: 'r_tomb_treasury',
        x: T.x0,
        y: T.y0,
        w: T.x1 - T.x0 + 1,
        h: T.y1 - T.y0 + 1,
        title: 'The Royal Treasury',
        theme: 'vault',
        floorLv: Math.round(T.h * LV),
      });
      pushSpawn({
        id: 'sp_treasury_guards',
        x: T.cx,
        y: T.cy + 1.2,
        arch: 'golem',
        rank: 'champion',
        n: 2,
        art: pickArt('golem', 99),
        name: 'Treasury Guardian',
      });
    }

    // The Burial Chamber (Heart of the Pyramid at -189 lv)
    if (dv.chamber) {
      const ch = dv.chamber;
      const cw = ch.x1 - ch.x0 + 1, chH = ch.y1 - ch.y0 + 1;
      const chLv = Math.round(ch.h * LV);
      base.architecture.rooms.push({
        id: 'r_burial_chamber',
        x: ch.x0,
        y: ch.y0,
        w: cw,
        h: chH,
        title: 'The Burial Chamber',
        theme: 'shrine',
        floorLv: chLv,
      });
      setBossZone(ch.x0 + 2, ch.y0 + 2, cw - 4, chH - 4, 'Burial Chamber Boss Arena');

      const [fArt, fTpl, fSub] = v.bosses?.[0] || ['sandstone_scarab_emperor', 'scarab', 'Lord of the Burial Chamber'];
      const fName = prettyArtName(fArt);
      pushSpawn({
        id: 'sp_burial_boss',
        castKey: 'pyramid_pharaoh',
        x: ch.cx + 0.5,
        y: ch.cy + 3.2,
        arch: fTpl || 'scarab',
        rank: 'raid',
        n: 1,
        art: fArt,
        scale: 2.6,
        name: fSub ? `${fName}, ${fSub}` : fName,
        arenaRect: { x: ch.x0, y: ch.y0, w: cw, h: chH, cx: ch.cx, cy: ch.cy },
      });
      // Additional Pharaoh / Co-Ruler if bossCount >= 3
      if (bossCount >= 3 && v.bosses?.[1]) {
        const [b2Art, b2Tpl, b2Sub] = v.bosses[1];
        pushSpawn({
          id: 'sp_burial_consort',
          castKey: 'pyramid_consort',
          x: ch.cx - 3.5,
          y: ch.cy + 2.5,
          arch: b2Tpl || 'pontiff',
          rank: 'boss',
          n: 1,
          art: b2Art,
          name: `${prettyArtName(b2Art)}${b2Sub ? `, ${b2Sub}` : ''}`,
        });
      }
      pushSpawn({
        id: 'sp_burial_adds_w',
        x: ch.cx - 5.5,
        y: ch.cy - 2.5,
        arch: 'zombie',
        rank: 'normal',
        n: 3,
        art: pickArt('zombie', 11),
      });
      pushSpawn({
        id: 'sp_burial_adds_e',
        x: ch.cx + 5.5,
        y: ch.cy - 2.5,
        arch: 'skeleton',
        rank: 'normal',
        n: 3,
        art: pickArt('skeleton', 13),
      });

      // 3 Rich Sarcophagus Reward Chests + Walkable Burial Chamber Exit Portal
      for (let k = -1; k <= 1; k++) {
        const [cx, cy] = findNearestWalkable(L, w, h, ch.cx + k * 4, ch.cy - 4.5, 4);
        base.entities.interactables.push({
          id: `ch_burial_${k + 2}`,
          kind: 'chest',
          subType: 'rare',
          x: cx,
          y: cy,
          label: 'Royal Burial Coffer',
        });
      }
      const [ex, ey] = findNearestWalkable(L, w, h, ch.cx + 0.5, ch.cy + 5.5, 5);
      base.entities.exit = {
        x: ex,
        y: ey,
        sealed: true,
        unsealOn: 'boss_killed',
        continueToBiome: null,
      };
    }
  }

  // 2. DEPTH'S EDGE CAVERNS (Delve -> Falls Notch Passage -> Spiral Shaft -> 1-3 Waterfall Summit Bosses)
  if (gen.cave) {
    const cv = gen.cave;
    base.meta.variantId = cv.v?.id || base.meta.variantId;
    base.grid.heightfield.waterfalls = [{
      x: round2(cv.lip[0]),
      y: round2(cv.lip[1]),
      plunge: [round2(cv.plunge[0]), round2(cv.plunge[1])],
      top: round2(cv.HP),
      base: round2(cv.WL),
      w: 4.5,
    }];
    base.grid.heightfield.torches3d = (cv.torches || []).map((tc) => ({
      x: round2(tc.x),
      y: round2(tc.y),
      h: round2(tc.h),
      stand: !!tc.stand,
      nx: round2(tc.nx ?? 0.7),
      ny: round2(tc.ny ?? 0.7),
    }));
    base.grid.heightfield.caveMeta = {
      seed: cv.seed,
      mouth: cv.mouth ? [round2(cv.mouth[0]), round2(cv.mouth[1])] : null,
      mouthH: round2(cv.mouthH || 0),
      mouthDir: cv.mouthDir ? [round2(cv.mouthDir[0]), round2(cv.mouthDir[1])] : [1, 0],
      lake: cv.lake ? { x: round2(cv.lake.x), y: round2(cv.lake.y), A: round2(cv.lake.A), B: round2(cv.lake.B || cv.lake.A) } : null,
      shaft: cv.shaft ? { ...cv.shaft, x: round2(cv.shaft.x), y: round2(cv.shaft.y) } : null,
      plateau: cv.plateau ? { x: round2(cv.plateau.x), y: round2(cv.plateau.y), r: round2(cv.plateau.r) } : null,
      river: (cv.river || []).filter((_, idx) => idx % 2 === 0).map(([rx, ry]) => [round2(rx), round2(ry)]),
      wallStal: (cv.wallStal || []).slice(0, 320).map((ws) => ({
        x: round2(ws.x), y: round2(ws.y), z: round2(ws.z), len: round2(ws.len), r: round2(ws.r), seed: ws.seed,
      })),
    };

    if (cv.notchIn && cv.arrive) {
      base.entities.passages.push({
        id: 'psg_falls_shaft',
        name: 'Falls Cliff Notch ↔ Spiral Shaft Foot',
        from: findNearestWalkable(L, w, h, cv.notchIn[0], cv.notchIn[1], 4, true),
        to: findNearestWalkable(L, w, h, cv.arrive[0], cv.arrive[1], 4, true),
        bidirectional: true,
        lockUntil: 'none',
        color: '#4fcdb9',
      });
    }

    (cv.caverns || []).forEach((c, idx) => {
      const cr = Math.max(5, Math.round(c.R || 8));
      base.architecture.rooms.push({
        id: `r_cavern_${idx + 1}`,
        x: Math.max(1, Math.round(c.x - cr)),
        y: Math.max(1, Math.round(c.y - cr)),
        w: cr * 2,
        h: cr * 2,
        title: c.name || `Cavern Chamber ${idx + 1}`,
        theme: null,
        floorLv: computeRectFloorLv(L, w, h, c.x - cr, c.y - cr, cr * 2, cr * 2),
      });
    });

    if (cv.lakeCave) {
      const lc = cv.lakeCave;
      base.architecture.rooms.push({
        id: 'r_cavern_lake',
        x: Math.max(1, Math.round(lc.x - lc.A)),
        y: Math.max(1, Math.round(lc.y - lc.B)),
        w: Math.round(lc.A * 2),
        h: Math.round(lc.B * 2),
        title: 'Underground Lake & Plunge Pool',
        theme: null,
        floorLv: Math.round(cv.WL * LV),
      });
    }

    if (cv.shaft) {
      const sh = cv.shaft, sr = Math.round(sh.rRim || 14);
      base.architecture.rooms.push({
        id: 'r_spiral_shaft',
        x: Math.max(1, Math.round(sh.x - sr)),
        y: Math.max(1, Math.round(sh.y - sr)),
        w: sr * 2,
        h: sr * 2,
        title: 'The Great Spiral Shaft',
        theme: null,
        floorLv: Math.round((sh.h0 || 0) * LV),
      });
    }

    if (cv.plateau) {
      const P = cv.plateau, pr = Math.max(6, Math.round(P.r || 10));
      base.architecture.rooms.push({
        id: 'r_falls_summit',
        x: Math.max(1, Math.round(P.x - pr)),
        y: Math.max(1, Math.round(P.y - pr)),
        w: pr * 2,
        h: pr * 2,
        title: 'Top of the Falls (Boss Plateau)',
        theme: null,
        floorLv: Math.round(cv.HP * LV),
      });
      setBossZone(P.x - pr + 1, P.y - pr + 1, pr * 2 - 2, pr * 2 - 2, 'Waterfall Summit Boss Arena');

      const deBosses = DEPTHS_EDGE.filter((a) => a.boss);
      for (let bi = 0; bi < bossCount && deBosses.length; bi++) {
        const pickB = deBosses[(seed + bi * 3) % deBosses.length];
        const [tplId, title] = DEPTHS_EDGE_BOSSES[pickB.id] || ['colossus', 'Guardian of the Falls'];
        const ang = (bi / Math.max(1, bossCount)) * Math.PI * 2 + 0.6;
        const distR = bossCount === 1 ? 1.5 : 3.2;
        pushSpawn({
          id: `sp_falls_boss_${bi + 1}`,
          castKey: bi === 0 ? 'falls_warden' : `falls_warden_${bi + 1}`,
          x: P.x + Math.cos(ang) * distR,
          y: P.y + Math.sin(ang) * distR,
          arch: tplId,
          rank: bi === bossCount - 1 ? 'raid' : 'boss',
          n: 1,
          art: pickB.id,
          scale: bi === bossCount - 1 ? 2.5 : 2.0,
          hpK: bossCount === 1 ? 0.85 : 0.55,
          name: title ? `${pickB.name}, ${title}` : pickB.name,
          arenaRect: { x: P.x - pr, y: P.y - pr, w: pr * 2, h: pr * 2, cx: P.x, cy: P.y },
          dry: true,
        });
      }
      const addArch = CAVE_ROSTER[seed % CAVE_ROSTER.length];
      pushSpawn({
        id: 'sp_falls_adds',
        x: P.x - 3.5,
        y: P.y + 3.0,
        arch: addArch,
        rank: 'normal',
        n: 3,
        art: gen.looks?.pick?.(addArch)?.art || null,
        dry: true,
      });
      const [ex, ey] = findNearestWalkable(L, w, h, P.x, P.y - 2.5, 5, true);
      base.entities.exit = { x: ex, y: ey, sealed: true, unsealOn: 'boss_killed', continueToBiome: null };
    }
  }

  // 3. SERPENTINE TOWER (Helix Stair Strip -> Stairhead Passage -> Rooftop Multi-Boss & Pirate Raid)
  if (category === '3d_tower' && base.grid.tower) {
    const g = towerGeo(base.grid.tower);
    base.entities.passages.push({
      id: 'psg_tower_roof',
      name: 'Stairhead Arch ↔ Rooftop Arena',
      from: findNearestWalkable(L, w, h, g.XT + 2.5, g.YR + g.w / 2, 4),
      to: findNearestWalkable(L, w, h, g.AX, g.AY + g.RT * 0.65, 4),
      bidirectional: true,
      lockUntil: 'none',
      color: '#ffe2a0',
    });

    const roofLv = Math.round(g.roofZ * LV);
    for (const [frac, label] of [[0.04, 'Tower Base'], [0.35, 'Lower Helix Turn'], [0.68, 'Upper Helix Turn'], [0.95, 'Stairhead Arch']]) {
      const rx = Math.round(g.X1 - frac * g.L) - 5;
      base.architecture.rooms.push({
        id: `r_tower_${Math.round(frac * 100)}`,
        x: Math.max(g.XR + 2, rx),
        y: g.YR,
        w: 10,
        h: g.w,
        title: label,
        theme: null,
        floorLv: Math.round(g.z(frac * g.L) * LV),
      });
    }
    const rr = Math.round(g.RT);
    base.architecture.rooms.push({
      id: 'r_tower_roof',
      x: Math.max(1, Math.round(g.AX - rr)),
      y: Math.max(1, Math.round(g.AY - rr)),
      w: rr * 2,
      h: rr * 2,
      title: 'Circular Rooftop Arena',
      theme: null,
      floorLv: roofLv,
    });
    setBossZone(g.AX - rr + 2, g.AY - rr + 2, rr * 2 - 4, rr * 2 - 4, 'Rooftop Boss Arena');

    for (let bi = 0; bi < bossCount; bi++) {
      const bLook = gen.looks?.boss?.() || {};
      const ang = (bi / Math.max(1, bossCount)) * Math.PI * 2 - 0.8;
      pushSpawn({
        id: `sp_roof_boss_${bi + 1}`,
        castKey: bi === 0 ? 'tower_sovereign' : `tower_ward_${bi + 1}`,
        x: g.AX + Math.cos(ang) * 4.2,
        y: g.AY + Math.sin(ang) * 4.2,
        arch: bLook.arch || 'knight',
        rank: 'boss',
        n: 1,
        art: bLook.art || null,
        name: bi === 0 ? 'Sovereign of the Spire' : `Spire Wing-Warden ${bi + 1}`,
      });
    }
    pushSpawn({
      id: 'sp_roof_pirate_captain',
      castKey: 'sky_raid_captain',
      x: g.AX + g.RT * 0.55,
      y: g.AY - g.RT * 0.35,
      arch: 'knight',
      rank: 'unique',
      n: 1,
      art: ART_BY_ID.ap_sky_captain ? 'ap_sky_captain' : null,
      name: 'Sky-Skiff Raid Captain',
    });
    const [ex, ey] = findNearestWalkable(L, w, h, g.AX, g.AY - 3.5, 5);
    base.entities.exit = { x: ex, y: ey, sealed: true, unsealOn: 'boss_killed', continueToBiome: null };
  }

  // 4. 3D ALPINE (Forested Mountainside Switchback Trail & Snowy Summit Multi-Boss Peak)
  if (category === '3d_alpine') {
    if (gen.alpine) {
      const av = gen.alpine;
      if (av.tfloor && av.tfloor.length >= N) {
        for (let i = 0; i < N; i++) L.v[i] = av.tfloor[i];
      }
      if (av.F?.H2) {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (L.t[i] === 1 && gen.lv) L.hgt[i] = gen.lv[i];
            else L.hgt[i] = Math.round(av.F.H2(x + 0.5, y + 0.5) * ALP_LV);
          }
        }
      }
      if (Array.isArray(av.look?.snow)) {
        base.grid.heightfield.snowLine = Math.round(av.look.snow[0] * ALP_LV);
      }
      if (av.look?.cloud?.y !== undefined) {
        base.grid.heightfield.cloudSeaY = round2(av.look.cloud.y);
      }
    }
    base.meta.lighting.dark = biomeId === 'mountainside' ? 0.05 : 0.12;

    if (gen.map?.mountain) {
      const mt = gen.map.mountain;
      const [stX, stY] = base.entities.start;
      base.architecture.rooms.push({
        id: 'r_mtn_foot',
        x: Math.max(1, Math.round(stX - 6)),
        y: Math.max(1, Math.round(stY - 6)),
        w: 12,
        h: 12,
        title: 'Forest Trailhead Foot',
        theme: null,
        floorLv: computeRectFloorLv(L, w, h, stX - 6, stY - 6, 12, 12),
      });
      (mt.camps || []).forEach((c, idx) => {
        base.architecture.rooms.push({
          id: `r_mtn_camp_${idx + 1}`,
          x: Math.max(1, Math.round(c[0] - 5)),
          y: Math.max(1, Math.round(c[1] - 5)),
          w: 10,
          h: 10,
          title: `Climbers' Camp ${idx + 1}`,
          theme: null,
          floorLv: computeRectFloorLv(L, w, h, c[0] - 5, c[1] - 5, 10, 10),
        });
      });
      if (mt.summit) {
        const [sx, sy] = mt.summit;
        base.architecture.rooms.push({
          id: 'r_mtn_summit',
          x: Math.max(1, Math.round(sx - 9)),
          y: Math.max(1, Math.round(sy - 9)),
          w: 18,
          h: 18,
          title: 'Slate Pass Summit',
          theme: null,
          floorLv: computeRectFloorLv(L, w, h, sx - 9, sy - 9, 18, 18),
        });
        setBossZone(sx - 8, sy - 7, 16, 16, 'Mountainside Warden Arena');
        const mainWarden = base.entities.spawns.find((s) => s.rank === 'boss');
        if (mainWarden) {
          mainWarden.castKey = 'summit_warden';
          mainWarden.name = 'The Summit Warden';
          mainWarden.swap = 'frost';
        }
        for (let bi = 1; bi < bossCount; bi++) {
          pushSpawn({
            id: `sp_mtn_boss_${bi + 1}`,
            castKey: `summit_warden_${bi + 1}`,
            x: sx + (bi % 2 ? -3.5 : 3.5),
            y: sy + 2.0,
            arch: bi === 1 ? 'gargoyle' : 'knight',
            rank: 'boss',
            n: 1,
            swap: 'rime',
            name: bi === 1 ? 'Frostbound Crag Sentinel' : 'Keeper of Slate Pass',
          });
        }
      }
    } else if (gen.map?.summit) {
      const sm = gen.map.summit;
      (sm.nodes || []).forEach((nd, idx) => {
        const nr = Math.max(4, Math.round(nd.r || 6));
        const label = idx === 0 ? 'Arrival Ridge Camp' : nd.kind === 'peak' ? 'Summit Shrine Peak' : nd.kind === 'plateau' ? `Gated Plateau ${idx}` : `Ridge Saddle ${idx}`;
        base.architecture.rooms.push({
          id: `r_sum_node_${idx}`,
          x: Math.max(1, Math.round(nd.x - nr)),
          y: Math.max(1, Math.round(nd.y - nr)),
          w: nr * 2,
          h: nr * 2,
          title: label,
          theme: null,
          floorLv: computeRectFloorLv(L, w, h, nd.x - nr, nd.y - nr, nr * 2, nr * 2),
        });
      });
      if (sm.peak) {
        const pk = sm.peak, pr = Math.max(7, Math.round(pk.r || 9));
        setBossZone(pk.x - pr + 1, pk.y - pr + 1, pr * 2 - 2, pr * 2 - 2, 'Summit Shrine Boss Arena');
        const bossPool = gen.bosses || [];
        for (let bi = 0; bi < Math.min(bossCount, Math.max(1, bossPool.length)); bi++) {
          const b = bossPool[(seed + bi * 2) % bossPool.length] || { art: null, tpl: 'rimehydra', title: 'Crown of the Glacier' };
          const bName = prettyArtName(b.art) || 'Summit Guardian';
          pushSpawn({
            id: `sp_summit_boss_${bi + 1}`,
            castKey: bi === 0 ? 'summit_warden' : `summit_warden_${bi + 1}`,
            x: pk.x + (bi === 0 ? 0 : (bi % 2 ? -3.2 : 3.2)),
            y: pk.y - 1.5 + bi * 1.5,
            arch: b.tpl || 'rimehydra',
            rank: bi === 0 ? 'raid' : 'boss',
            n: 1,
            art: b.art || null,
            swap: 'frost',
            scale: bi === 0 ? 2.3 : 1.9,
            hpK: bossCount === 1 ? 0.85 : 0.6,
            name: b.title ? `${bName}, ${b.title}` : bName,
            arenaRect: { x: pk.x - pr, y: pk.y - pr, w: pr * 2, h: pr * 2, cx: pk.x, cy: pk.y },
          });
        }
      }
    }
  }

  // 5. AIRSHIP BATTLE (Placed Flagship, Boarding Skiffs & Grappling Hook Choreography)
  if (category === 'airship') {
    base.grid.airship ||= { flagship: 'THE BLACK SCOURGE', flagshipSub: 'Pirate Dreadnought', vessels: [], knights: [], waves: [], gauntlet: null };
    base.grid.airship.vessels = [
      {
        id: 'air_flagship',
        castKey: 'enemy_flagship',
        kind: 'galleon',
        name: 'The Black Scourge (Flagship)',
        x: SKY_OX - 15.2,
        y: SKY_OY + 0.6,
        lv: 6,
        rampDown: false,
        crewCount: 5,
        captainId: 'ap_admiral_veyl',
        hooks: 0,
        startHidden: true,
      },
      {
        id: 'air_skiff_fore',
        castKey: 'skiff_fore',
        kind: 'cutter',
        name: 'Bow Boarding Cutter',
        x: SKY_OX - 8.2,
        y: SKY_OY - 6,
        lv: 12,
        rampDown: true,
        crewCount: 4,
        captainId: '',
        hooks: 0,
        startHidden: false,
      },
      {
        id: 'air_skiff_mid',
        castKey: 'skiff_mid',
        kind: 'hauler',
        name: 'Midship Iron Hauler',
        x: SKY_OX - 8.8,
        y: SKY_OY + 3,
        lv: 12,
        rampDown: true,
        crewCount: 4,
        captainId: 'ap_brass_beak',
        hooks: 0,
        startHidden: true,
      },
    ];
    setBossZone(SKY_OX - 5, SKY_OY - 6, 11, 14, 'Main Deck Boarding Zone');
    base.cutscenes.push({
      id: 'cine_flagship_hooks',
      name: 'Flagship & Grappling Hooks',
      allowFastForward: true,
      steps: [
        { id: 'fh_1', type: 'sky_flagship', action: 'arrive', dur: 3.0, captainA: 'ap_admiral_veyl', captainB: 'ap_red_gale_corsair', wait: false },
        { id: 'fh_2', type: 'cam', mode: 'fit', actors: ['hero', 'flagship'], zoom: 1.0, dur: 1.6, ease: 'out', wait: true },
        { id: 'fh_3', type: 'sky_volley', action: 'flagship_volley', count: 4, wait: true },
        { id: 'fh_4', type: 'card', title: 'GRAPPLING HOOKS', sub: 'The ships are lashed together', dur: 2.4, block: false },
        { id: 'fh_5', type: 'sky_hooks', action: 'throw_and_lash', count: 4, wait: true },
        { id: 'fh_6', type: 'sky_volley', action: 'captain_leap', captainId: 'ap_admiral_veyl', castKey: 'admiral_veyl', dz: -1.2, wait: false },
        { id: 'fh_7', type: 'sky_volley', action: 'captain_swing', captainId: 'ap_red_gale_corsair', castKey: 'red_gale', dz: 2.4, wait: true },
        { id: 'fh_8', type: 'cam', mode: 'return_hero', dur: 0.9, wait: true },
      ],
    });
    base.triggers.push({
      id: 'trig_middeck_hooks',
      name: 'Mid-Deck Flagship & Grappling Ambush',
      enabled: true,
      event: 'onEnterZone',
      once: true,
      requireCombatClear: false,
      zoneId: 'z_boss_approach',
      runCutscene: 'cine_flagship_hooks',
    });
  }

  // Fit default Boss Approach Zone to actual baked Raid Arena or Exit Portal on all other map types
  if (!bossZoneSet) {
    if (gen.raid && gen.raid.w && gen.raid.h) {
      setBossZone(gen.raid.x, gen.raid.y, gen.raid.w, gen.raid.h, 'Raid Boss Arena');
    } else if (base.entities.exit) {
      setBossZone(base.entities.exit.x - 6, base.entities.exit.y - 5, 12, 10, 'Boss Approach Zone');
    }
  }

  // Refresh Objectives to match materialized Bosses
  const bossSpawns = base.entities.spawns.filter((s) => s.rank === 'boss' || s.rank === 'raid');
  if (bossSpawns.length) {
    base.entities.exit.unsealOn = 'boss_killed';
    const mainBoss = bossSpawns[bossSpawns.length - 1];
    base.objectives = [{
      id: 'obj_slay_boss',
      kind: 'kill_bosses',
      text: bossSpawns.length > 1
        ? `Defeat all ${bossSpawns.length} Stage Bosses (final: ${mainBoss.name || mainBoss.arch})`
        : `Defeat ${mainBoss.name || 'the Guardian'}`,
    }];
  }

  // Ensure arrival cutscene mark sits near actual baked start
  if (base.entities.marks?.[0]) {
    base.entities.marks[0].x = round2(base.entities.start[0]);
    base.entities.marks[0].y = round2(Math.max(2, base.entities.start[1] - 2));
  }

  return base;
}

// ------------------------------------------------------------------ Reachability & Scenario Diagnostics
export function computeReachabilityMask(doc) {
  const { w, h, layers, traversal } = doc.grid || {};
  const reach = new Uint8Array((w || 0) * (h || 0));
  if (!w || !h || !layers?.t) return reach;
  const [sx, sy] = doc.entities?.start || [0, 0];
  const tx = Math.floor(sx), ty = Math.floor(sy);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return reach;
  const startIdx = ty * w + tx;
  if (layers.t[startIdx] !== 1 || layers.block[startIdx]) return reach;

  const climb = traversal?.climb ?? 4, drop = traversal?.drop ?? 10;
  const hasHgt = layers.hgt && layers.hgt.some((v) => v !== 0);

  // Build spatial lookup for intra-map Passage teleports
  const links = [];
  for (const psg of doc.entities?.passages || []) {
    if (Array.isArray(psg.from) && Array.isArray(psg.to)) {
      links.push({ ax: psg.from[0], ay: psg.from[1], bx: psg.to[0], by: psg.to[1], used: false });
      if (psg.bidirectional) {
        links.push({ ax: psg.to[0], ay: psg.to[1], bx: psg.from[0], by: psg.from[1], used: false });
      }
    }
  }

  const enqueueLanding = (lx, ly, q) => {
    const [nx, ny] = findNearestWalkable(layers, w, h, lx, ly, 3);
    const ix = Math.floor(nx), iy = Math.floor(ny);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return;
    const ni = iy * w + ix;
    if (!reach[ni] && layers.t[ni] === 1 && !layers.block[ni]) {
      reach[ni] = 1;
      q.push(ni);
    }
  };

  const q = [startIdx];
  reach[startIdx] = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi], cx = cur % w, cy = (cur / w) | 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (reach[ni] || layers.t[ni] !== 1 || layers.block[ni]) continue;
      if (hasHgt) {
        const d = layers.hgt[ni] - layers.hgt[cur];
        if (d > climb || -d > drop) continue;
      }
      reach[ni] = 1;
      q.push(ni);
    }
    for (const lk of links) {
      if (!lk.used && Math.hypot(cx + 0.5 - lk.ax, cy + 0.5 - lk.ay) <= 2.4) {
        lk.used = true;
        enqueueLanding(lk.bx, lk.by, q);
      }
    }
  }
  return reach;
}

export function validateScenarioDoc(doc) {
  const issues = [];
  if (!doc || doc.format !== SCENARIO_FORMAT) {
    return [{ level: 'error', code: 'FORMAT', msg: 'Invalid scenario document format.' }];
  }
  const { w, h, layers } = doc.grid || {};
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

  // BFS reachability from start (traversing climb/drop steps AND intra-map Passage teleports!)
  if (walkable(sx, sy)) {
    const reach = computeReachabilityMask(doc);
    const skipReach = doc.meta?.category === 'naval' || doc.meta?.biomeId === 'deep_mines';
    if (ex && walkable(ex.x, ex.y) && !skipReach) {
      const ei = Math.floor(ex.y) * w + Math.floor(ex.x);
      if (!reach[ei]) {
        issues.push({ level: 'warn', code: 'EXIT_UNREACHABLE', msg: 'Exit Portal cannot be reached by walking/hopping or Passage Links from Player Start.', at: [ex.x, ex.y] });
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
