// Unified Studio Asset & Entity Catalog: merges tools/assetmanager/manifest.json thumbnail sheets
// with live runtime biome tilesets, BESTIARY, RAID_BOSSES, TOWNSFOLK, ANIMALS, VENDORS, BIOME_ROOMS,
// 3D Cave/Dune baked props, and 3D Naval/Airship Fleet models.
import { A, biomeTileSet } from '../../src/core/assets.js';
import { BIOME_BY_ID } from '../../src/data/biomes.js';
import { BESTIARY, SWAPS } from '../../src/data/bestiary.js';
import { RAID_BOSSES } from '../../src/game/raid.js';
import { TOWNSFOLK, ANIMALS } from '../../src/data/townsfolk.js';
import { VENDORS, townObject } from '../../src/world/town.js';
import { overworldObject, EXTRA_TREES, SHRINES } from '../../src/gfx/overworldart.js';
import { darkForestTree, DARK_TREE_NAMES } from '../../src/gfx/darkforest.js';
import { THEMES, BIOME_ROOMS } from '../../src/data/biomerooms.js';
import { caveSprite } from '../../src/gfx/cave3d.js';
import { duneSprite } from '../../src/gfx/dunes3d.js';
import { castle3dState } from '../../src/gfx/castle3dart.js';

export const PALETTE_CATEGORIES = [
  { id: 'floors', label: 'Floors' },
  { id: 'walls', label: 'Walls & Doors' },
  { id: 'props', label: 'Props & Trees' },
  { id: 'monsters', label: 'Monsters & Bosses' },
  { id: 'npcs', label: 'NPCs & Vendors' },
  { id: 'interact', label: 'Portals & Chests' },
  { id: 'rooms', label: 'Room Stamps' },
  { id: '3d', label: '3D & Fleet' },
];

export const AIRSHIP_FLEET_KINDS = [
  { id: 'galleon', name: 'Pirate Flagship Galleon', spriteKey: 'galleon', tag: 'FLAGSHIP', defLv: 6 },
  { id: 'cutter', name: 'Swift Boarding Cutter', spriteKey: 'skiff_cutter_down', tag: 'SKIFF', defLv: 12 },
  { id: 'hauler', name: 'Armored Iron Hauler', spriteKey: 'skiff_hauler_down', tag: 'SKIFF', defLv: 12 },
  { id: 'gasbag', name: 'Gasbag Boarding Airship', spriteKey: 'skiff_gasbag_down', tag: 'AIRSHIP', defLv: 14 },
];

function skyshipBakedSprite(spriteKey) {
  const st = castle3dState();
  const sp = st?.sprites?.[spriteKey];
  if (!sp || !sp.f?.length || !st.imgs) return null;
  const f = sp.f[0];
  const img = st.imgs[f[0]];
  if (!img) return null;
  return { img, sx: f[1], sy: f[2], w: f[3], h: f[4] };
}

export const NAVAL_FLEET_KINDS = [
  { id: 'brig', name: 'Black Tide Gun-Brig', deck: true },
  { id: 'galleon', name: 'War Galleon', deck: true },
  { id: 'dreadnought', name: 'Iron Dreadnought', deck: true },
  { id: 'carrier', name: 'Sky-Fighter Carrier', deck: true },
  { id: 'hulk', name: 'Drowned Prison Hulk', deck: true },
  { id: 'cutter', name: 'Harpoon Cutter', deck: false },
  { id: 'longboat', name: 'Boarding Longboat', deck: false },
  { id: 'lightship', name: 'Lampwarden Lightship', deck: true },
  { id: 'tender', name: 'Supply Tender', deck: true },
  { id: 'reef', name: "Wrecker's Reef", deck: true },
  { id: 'wreck', name: 'Shattered Shipwreck', deck: true },
  { id: 'mine', name: 'Tethered Sea Mine', deck: false },
  { id: 'buoy', name: 'Signal Bell Buoy', deck: false },
];

const titleCase = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

let assetManifest = null;
const thumbById = new Map();

export async function loadAssetManagerCatalog() {
  if (assetManifest) return assetManifest;
  try {
    const res = await fetch('tools/assetmanager/manifest.json', { cache: 'no-cache' });
    if (res.ok) {
      assetManifest = await res.json();
      for (const it of assetManifest.items || []) {
        if (it.t) thumbById.set(it.id, it.t);
      }
    }
  } catch (e) {
    console.warn('[Studio] Could not load Asset Manager manifest.json:', e.message);
  }
  return assetManifest;
}

/** Apply an Asset Manager thumbnail sprite-sheet crop onto `el` if available. */
export function applyManifestThumb(el, manifestItemId) {
  if (!assetManifest || !thumbById.has(manifestItemId)) return false;
  const [sIdx, cellIdx] = thumbById.get(manifestItemId);
  const sh = assetManifest.sheets?.[sIdx];
  if (!sh) return false;
  const c = cellIdx % sh.c, r = Math.floor(cellIdx / sh.c);
  el.style.backgroundImage = `url(tools/assetmanager/${sh.f})`;
  el.style.backgroundSize = `${sh.c * 100}% ${sh.r * 100}%`;
  el.style.backgroundPosition = `${sh.c > 1 ? (c / (sh.c - 1)) * 100 : 0}% ${sh.r > 1 ? (r / (sh.r - 1)) * 100 : 0}%`;
  return true;
}

/** Render a cropped sprite `{img, sx, sy, w, h}` onto a crisp thumbnail canvas. */
export function drawSpriteThumb(spr, maxW = 64, maxH = 54) {
  if (!spr || !spr.img) return null;
  const sw = spr.w || spr.img.naturalWidth || spr.img.width || 64;
  const sh = spr.h || spr.img.naturalHeight || spr.img.height || 64;
  if (!sw || !sh) return null;
  const c = document.createElement('canvas');
  const scale = Math.min(maxW / sw, maxH / sh, 1.5);
  c.width = Math.max(1, Math.round(sw * scale));
  c.height = Math.max(1, Math.round(sh * scale));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(spr.img, spr.sx || 0, spr.sy || 0, sw, sh, 0, 0, c.width, c.height);
  return c;
}

export function swapNames() {
  return ['', ...Object.keys(SWAPS || {})];
}

/**
 * Build palette items for the given `tabId`, dynamically scoped to `world` & `doc` when `biomeOnly` is checked.
 */
export function getPaletteItems(tabId, { world, doc, biomeOnly = true, query = '' }) {
  const q = String(query || '').trim().toLowerCase();
  const match = (text) => !q || String(text).toLowerCase().includes(q);
  const items = [];
  const ts = world?.tileset;
  const biome = world?.biome;
  const cat = doc?.meta?.category || 'dungeon';

  if (tabId === 'floors') {
    const floorList = world?.townTiles || ts?.floors || [];
    items.push({
      uid: 'floor_autopave',
      kind: 'autopave',
      name: 'Auto-Pave Material',
      tag: 'AUTO',
      search: 'auto pave seamless smart floor',
      spr: floorList[ts?.bases?.[0] || 0] || floorList[0] || null,
    });
    floorList.forEach((fl, idx) => {
      const nm = fl.name ? titleCase(fl.name) : `Floor Variant #${idx + 1}`;
      if (!match(`${nm} ${idx}`)) return;
      items.push({
        uid: `floor_${idx}`,
        kind: 'floor',
        variant: idx,
        name: nm,
        tag: fl.seamless ? 'BASE' : 'FEAT',
        spr: fl,
      });
    });
  } else if (tabId === 'walls') {
    items.push({
      uid: 'wall_torch',
      kind: 'torch',
      name: 'Wall Torch Sconce',
      tag: 'LIGHT',
      manifestId: 'torch_1_0',
    });
    items.push({
      uid: 'wall_hanging',
      kind: 'hanging',
      design: 0,
      name: 'Biome Wall Hanging',
      tag: 'DECOR',
      manifestId: 'hang_tattered_banner',
    });
    if (ts?.arches) {
      for (const des of Object.keys(ts.arches)) {
        if (!match(des)) continue;
        const sl = Object.values(ts.arches[des])[0]?.[0];
        items.push({
          uid: `arch_${des}`,
          kind: 'opening',
          openKind: 'arch',
          design: des,
          span: ts.archSpan?.[des] || 3,
          name: `Arch: ${titleCase(des)}`,
          tag: 'ARCH',
          spr: sl,
        });
      }
    }
    if (ts?.doors) {
      for (const des of Object.keys(ts.doors)) {
        if (!match(des)) continue;
        const sl = Object.values(ts.doors[des])[0]?.closed?.[0];
        items.push({
          uid: `door_${des}`,
          kind: 'opening',
          openKind: 'door',
          design: des,
          span: 2,
          name: `Door: ${titleCase(des)}`,
          tag: 'DOOR',
          spr: sl,
        });
      }
    }
  } else if (tabId === 'props') {
    if (ts?.scatter) {
      for (const s of ts.scatter) {
        const nm = titleCase(s.name);
        if (!match(nm)) continue;
        items.push({
          uid: `prop_${s.name}`,
          kind: 'prop',
          propName: s.name,
          block: !!s.block,
          name: nm,
          tag: s.block ? 'SOLID' : 'WALK',
          spr: s,
        });
      }
    }
    if (biome?.id === 'mountainside' || biome?.id === 'dark_forest' || !biomeOnly) {
      for (const tn of DARK_TREE_NAMES()) {
        const nm = titleCase(tn);
        if (!match(nm)) continue;
        const spr = darkForestTree(tn);
        if (spr) {
          items.push({
            uid: `dftree_${tn}`,
            kind: 'prop',
            propName: tn,
            block: true,
            tree: true,
            name: nm,
            tag: 'PINE',
            spr,
          });
        }
      }
      if (biome?.id === 'mountainside') {
        for (const extraId of ['dark_forest', 'snowy_summit']) {
          const extraTs = BIOME_BY_ID[extraId] ? biomeTileSet(BIOME_BY_ID[extraId]) : null;
          for (const s of extraTs?.scatter || []) {
            const nm = titleCase(s.name);
            if (!match(nm)) continue;
            items.push({
              uid: `mtn_${extraId}_${s.name}`,
              kind: 'prop',
              propName: s.name,
              block: !!s.block,
              name: nm,
              tag: extraId === 'snowy_summit' ? 'SUMMIT' : 'TRAIL',
              spr: s,
            });
          }
        }
      }
    }
    // Town & Overworld buildings, trees, and shrines when outdoor or when "Biome" filter is unchecked
    if ((!biomeOnly || biome?.overworld || cat === 'town_arena') && A.town?.meta?.objects) {
      for (const key of Object.keys(A.town.meta.objects)) {
        const isBld = key.startsWith('b_');
        const nm = titleCase(isBld ? key.slice(2) : key.replace(/^t_/, 'tree_'));
        if (!match(nm)) continue;
        const spr = townObject(key);
        if (isBld) {
          items.push({
            uid: `bld_${key}`,
            kind: 'building',
            bldKind: key,
            name: `Building: ${nm}`,
            tag: '3x3',
            spr,
          });
        } else {
          items.push({
            uid: `townprop_${key}`,
            kind: 'prop',
            propName: key,
            block: key.startsWith('t_') || /barrel|crate|well|forge|anvil|table|bench|fence/.test(key),
            tree: key.startsWith('t_'),
            name: nm,
            tag: key.startsWith('t_') ? 'TREE' : 'TOWN',
            spr,
          });
        }
      }
      for (const key of [...(EXTRA_TREES || []), ...Object.keys(SHRINES || {})]) {
        const nm = titleCase(key);
        if (!match(nm)) continue;
        const spr = overworldObject(key);
        if (spr) {
          items.push({
            uid: `ow_${key}`,
            kind: 'prop',
            propName: key,
            block: true,
            tree: key.includes('tree') || key.includes('oak') || key.includes('pine'),
            name: nm,
            tag: 'WILDS',
            spr,
          });
        }
      }
    }
  } else if (tabId === 'monsters') {
    const rosterSet = new Set(biome?.roster || []);
    for (const m of BESTIARY) {
      const inRoster = !biomeOnly || !rosterSet.size || rosterSet.has(m.arch) || (m.also && m.also.some((a) => rosterSet.has(a))) ||
        (cat === '3d_caverns' && m.id.startsWith('de_')) ||
        ((cat === 'airship' || cat === 'naval' || cat === '3d_tower') && m.id.startsWith('ap_'));
      if (!inRoster) continue;
      if (!match(`${m.name} ${m.arch} ${m.id}`)) continue;
      items.push({
        uid: `mon_${m.id}`,
        kind: 'spawn',
        arch: m.arch,
        art: m.id,
        rank: m.boss || m.lone ? 'boss' : 'normal',
        n: m.boss || m.lone ? 1 : 3,
        name: m.name,
        tag: m.boss || m.lone ? 'BOSS' : m.arch.slice(0, 5),
        manifestId: m.id,
      });
      if (items.length >= 240 && !q) break;
    }
    for (const rb of RAID_BOSSES) {
      if (!match(`${rb.name} ${rb.title} raid boss`)) continue;
      items.push({
        uid: `raid_${rb.id}`,
        kind: 'spawn',
        arch: rb.id,
        art: rb.art?.[0] || null,
        rank: 'raid',
        n: 1,
        name: `${rb.name} (${rb.title})`,
        tag: 'RAID',
        manifestId: `raid_${rb.id}`,
      });
    }
  } else if (tabId === 'npcs') {
    for (const v of VENDORS) {
      if (!match(`${v.name} ${v.title} ${v.id}`)) continue;
      items.push({
        uid: `vend_${v.id}`,
        kind: 'npc',
        role: v.id,
        spriteId: '01_blacksmith_apprentice',
        npcName: v.name,
        name: `${v.name} (${v.title})`,
        tag: 'SHOP',
        manifestId: v.id === 'upgrade' ? 'npc_homunculus' : `npc_${v.id}`,
      });
    }
    for (const tf of TOWNSFOLK) {
      if (!match(`${tf.name} ${tf.role} ${tf.spriteId}`)) continue;
      items.push({
        uid: `folk_${tf.spriteId}`,
        kind: 'npc',
        role: tf.role || 'villager',
        spriteId: tf.spriteId,
        npcName: tf.name,
        name: `${tf.name} (${tf.role})`,
        tag: 'NPC',
        manifestId: `folk_${tf.spriteId}`,
      });
    }
    for (const an of ANIMALS) {
      if (!match(`${an.name} ${an.species}`)) continue;
      items.push({
        uid: `anim_${an.spriteId}`,
        kind: 'npc',
        role: an.species || 'animal',
        spriteId: an.spriteId,
        npcName: an.name,
        name: `${an.name} (${an.species})`,
        tag: 'PET',
        manifestId: `animal_${an.spriteId}`,
      });
    }
  } else if (tabId === 'interact') {
    const specials = [
      { uid: 'pt_start', kind: 'marker_start', name: 'Player Start Point', tag: 'START', manifestId: 'ui_icon' },
      { uid: 'pt_exit', kind: 'marker_exit', name: 'Exit / Descent Gate', tag: 'EXIT', manifestId: 'fx_portals' },
      { uid: 'pt_town', kind: 'marker_town', name: 'Town Portal', tag: 'PORTAL', manifestId: 'fx_portals' },
      { uid: 'pt_passage', kind: 'marker_passage', name: 'Passage / Teleport Link (2-Click)', tag: 'LINK', manifestId: 'fx_portals' },
      { uid: 'ch_std', kind: 'interactable', subType: 'standard', name: 'Treasure Chest', tag: 'CHEST', manifestId: 'chest_closed' },
      { uid: 'ch_rare', kind: 'interactable', subType: 'rare', name: 'Rare Gilded Chest', tag: 'RARE', manifestId: 'chest_rareClosed' },
      { uid: 'ch_shrine', kind: 'interactable', subType: 'shrine', name: 'Interactive Shrine / Plaque', tag: 'USE', manifestId: 'va_crystal' },
    ];
    for (const sp of specials) {
      if (match(sp.name)) items.push(sp);
    }
  } else if (tabId === 'rooms') {
    const biomeList = BIOME_ROOMS[biome?.id] || [];
    const seen = new Set();
    for (const [themeKey, roomTitle] of biomeList) {
      if (!THEMES[themeKey]) continue;
      seen.add(themeKey);
      if (!match(`${themeKey} ${roomTitle}`)) continue;
      items.push({
        uid: `theme_${themeKey}`,
        kind: 'room_recipe',
        theme: themeKey,
        roomTitle,
        name: `${roomTitle} (${titleCase(themeKey)})`,
        tag: 'BIOME',
      });
    }
    for (const themeKey of Object.keys(THEMES)) {
      if (seen.has(themeKey)) continue;
      if (biomeOnly && biomeList.length) continue;
      if (!match(themeKey)) continue;
      items.push({
        uid: `theme_${themeKey}`,
        kind: 'room_recipe',
        theme: themeKey,
        roomTitle: `The ${titleCase(themeKey)}`,
        name: `Recipe: ${titleCase(themeKey)}`,
        tag: 'THEME',
      });
    }
  } else if (tabId === '3d') {
    const pushAirships = () => {
      for (const ak of AIRSHIP_FLEET_KINDS) {
        if (match(`${ak.name} airship skyship skiff flagship`)) {
          items.push({
            uid: `airship_${ak.id}`,
            kind: 'sky_vessel',
            vesselKind: ak.id,
            defLv: ak.defLv,
            name: ak.name,
            tag: ak.tag,
            spr: skyshipBakedSprite(ak.spriteKey),
            manifestId: ak.id === 'galleon' ? 'sea_galleon' : 'sea_cutter',
          });
        }
      }
    };
    if (cat === 'airship') pushAirships();

    // 3D Cave baked stalagmites / columns
    for (const [ck, label] of [['mite', 'Stalagmite Spire'], ['cluster', 'Stalagmite Cluster'], ['column', 'Cavern Pillar'], ['tite', 'Hanging Stalactite'], ['boulder', '3D Cave Boulder']]) {
      if (match(label)) {
        items.push({
          uid: `cave3d_${ck}`,
          kind: 'caveProp',
          caveProp: ck,
          name: label,
          tag: 'CAVE 3D',
          spr: caveSprite(ck, 0),
        });
      }
    }
    // 3D Dunes baked tomb props
    for (const [dk, label] of [['obelisk', 'Gilded Obelisk'], ['pillar', 'Lotus Column'], ['urn', 'Canopic Urn'], ['sarcophagus', 'Royal Sarcophagus']]) {
      if (match(label)) {
        items.push({
          uid: `dune3d_${dk}`,
          kind: 'caveProp',
          caveProp: dk,
          name: label,
          tag: 'TOMB 3D',
          spr: duneSprite(dk, 0),
        });
      }
    }
    if (cat !== 'airship') pushAirships();
    // 3D Naval Fleet
    for (const fk of NAVAL_FLEET_KINDS) {
      if (match(fk.name)) {
        items.push({
          uid: `ship_${fk.id}`,
          kind: 'naval_ship',
          shipKind: fk.id,
          walkableDeck: fk.deck,
          name: fk.name,
          tag: fk.deck ? 'DECK 3D' : 'SHIP 3D',
          manifestId: `sea_${fk.id}`,
        });
      }
    }
  }

  return items;
}
