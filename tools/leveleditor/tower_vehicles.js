// Special Mode Context Banners & Deep Architecture Inspectors for:
// - 3D Serpentine Spiral Tower (Climb Turn Scrubber, Roof Switch, Helix Geometry)
// - 3D Desert Dunes & Pyramids (Exterior Desert <-> Interior Spiraling Tomb Switcher)
// - 3D Pirate Seas Naval (GPU bakeDeck One-Click Ship Deck Baker & 2-Click Boarding Plank Linker)
// - Sky Lanes Airship (Flagship & Weather Controls)
// - 3D Iron Express Train (Roof Cutaway Scrubber, Gorge Speed Preview & Car Consist Editor)
import { G } from '../../src/state.js';
import { camera, isoX, isoY } from '../../src/core/view.js';
import { CLASSES } from '../../src/data/classes.js';
import { clamp } from '../../src/core/util.js';
import { computeRectFloorLv } from '../../src/world/scenariocodec.js';
import { bakeDeck, seaPlank } from '../../src/gfx/seabattle3d.js';
import { applyDeck, joinDecks, mapChanged as seaMapChanged, SEA_LV, DAWNWAKE } from '../../src/world/seaship.js';
import { trainCutaway } from '../../src/gfx/ghosttrain3d.js';
import { NAVAL_FLEET_KINDS } from './catalog.js';

const TRAIN_CAR_KINDS = [
  'caboose', 'gondola', 'coach', 'flat', 'boxcar', 'armoury', 'prison', 'dining', 'sleeper', 'tender', 'engine',
];

/** Sync baked Naval ship decks from Three.js GPU `bakeDeck` directly into `doc.grid.layers` & `world.map`. */
export function bakeAllNavalDecks(doc, world, toast) {
  if (!world?.cave?.handles) return 0;
  const { w, h, layers } = doc.grid;
  const map = world.map;

  // Preserve Dawnwake (deck === DAWNWAKE), clear previously baked auxiliary ship decks (deck >= 2)
  for (let i = 0; i < w * h; i++) {
    if (layers.deck[i] >= 2) {
      layers.t[i] = 0;
      layers.block[i] = 0;
      layers.hgt[i] = SEA_LV;
      layers.deck[i] = 0;
    }
  }
  map.t.set(layers.t);
  map.block.set(layers.block);
  if (map.hgt) map.hgt.set(layers.hgt);
  if (map.deck) map.deck.set(layers.deck);

  let bakedCount = 0;
  let nextDeckId = 2;
  for (const sh of doc.grid?.naval?.ships || []) {
    if (sh.walkableDeck === false) continue;
    const rec = world.cave.handles.get(sh.id);
    if (!rec?.hdl) continue;
    const bk = bakeDeck(rec.hdl);
    if (bk) {
      applyDeck(map, bk, nextDeckId++, { levels: sh.levels || [0] });
      bakedCount++;
    }
  }
  for (const pl of doc.grid?.naval?.planks || []) {
    seaPlank(pl.from, pl.to, pl.w || 1.2);
    joinDecks(map, pl.from, pl.to, Math.max(1, Math.round(pl.w || 2)), 1);
  }
  seaMapChanged(map);

  // Copy resulting walkable decks & railings back into doc.grid.layers so they persist in .velscen.json!
  layers.t.set(map.t);
  layers.block.set(map.block);
  if (map.hgt) layers.hgt.set(map.hgt);
  if (map.deck) layers.deck.set(map.deck);

  if (toast) toast(`Baked ${bakedCount} 3D ship deck(s) & ${doc.grid?.naval?.planks?.length || 0} plank(s) to tile grid.`);
  return bakedCount;
}

/** Build an ordered list of navigable Stages / Rooms / Landmarks with exact floor elevations (`lv`). */
export function buildStageLandmarks(doc, world) {
  if (!doc) return [];
  const { w, h, layers } = doc.grid;
  const cat = doc.meta.category;
  const oxi = doc.grid.dunes?.oxi || 198;
  const lvAt = (tx, ty) => {
    const ix = clamp(Math.floor(tx), 0, w - 1), iy = clamp(Math.floor(ty), 0, h - 1);
    return layers.hgt?.[iy * w + ix] || 0;
  };

  const out = [];
  const [sx, sy] = doc.entities.start || [w / 2, h / 2];
  const rooms = doc.architecture?.rooms || [];

  const startCovered = rooms.some((r) => sx >= r.x && sy >= r.y && sx <= r.x + r.w && sy <= r.y + r.h);
  if (!startCovered) {
    out.push({
      id: 'lm_start',
      label: `🟢 Player Start (${lvAt(sx, sy)} lv)`,
      x: sx,
      y: sy,
      lv: lvAt(sx, sy),
      inside: cat === '3d_dunes' ? sx >= oxi - 2 : false,
      autoSlice: false,
    });
  }

  rooms.forEach((r, idx) => {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const flv = r.floorLv ?? computeRectFloorLv(layers, w, h, r.x, r.y, r.w, r.h);
    const isTomb = cat === '3d_dunes' && cx >= oxi - 2;
    const isRoof = cat === '3d_tower' && world?.tower?.g ? cx < world.tower.g.XR : false;
    const icon = isTomb ? (r.id?.includes('burial') || r.title?.includes('Mid-Boss') ? '👑' : '⚱️')
      : cat === '3d_dunes' ? '🏜️'
      : isRoof ? '☁️'
      : r.title?.toLowerCase().includes('boss') || r.title?.toLowerCase().includes('summit') ? '👑'
      : '🏛️';
    out.push({
      id: r.id || `lm_r_${idx}`,
      label: `${icon} ${r.title || r.id} (${flv >= 0 ? `+${flv}` : flv} lv)`,
      x: cx,
      y: cy,
      lv: flv,
      inside: isTomb,
      roof: isRoof,
      autoSlice: isTomb || (cat === '3d_caverns' && Math.abs(flv) >= 12),
    });
  });

  if (doc.entities.exit) {
    const ex = doc.entities.exit;
    const exitCovered = rooms.some((r) => ex.x >= r.x && ex.y >= r.y && ex.x <= r.x + r.w && ex.y <= r.y + r.h);
    if (!exitCovered) {
      const elv = lvAt(ex.x, ex.y);
      out.push({
        id: 'lm_exit',
        label: `🔵 Exit Portal (${elv >= 0 ? `+${elv}` : elv} lv)`,
        x: ex.x,
        y: ex.y,
        lv: elv,
        inside: cat === '3d_dunes' ? ex.x >= oxi - 2 : false,
        roof: cat === '3d_tower' && world?.tower?.g ? ex.x < world.tower.g.XR : false,
        autoSlice: cat === '3d_dunes' && ex.x >= oxi - 2,
      });
    }
  }
  return out;
}

function getElevationRange(doc) {
  const { w, h, layers } = doc.grid;
  let lo = 0, hi = 0;
  for (let i = 0; i < w * h; i++) {
    if (!layers.t[i] && !layers.wet[i]) continue;
    const v = layers.hgt[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [Math.min(-40, lo - 12), Math.max(48, hi + 16)];
}

function bindDepthBarEvents(bannerEl, doc, world, studio, landmarks) {
  bannerEl.querySelector('#dp-stage-sel')?.addEventListener('change', (e) => {
    const idx = Number(e.target.value);
    if (Number.isFinite(idx) && landmarks[idx]) {
      studio.activeLandmarkIdx = idx;
      studio.jumpToLandmark(landmarks[idx]);
    }
  });
  bannerEl.querySelector('#dp-stage-prev')?.addEventListener('click', () => studio.stepLandmark(-1));
  bannerEl.querySelector('#dp-stage-next')?.addEventListener('click', () => studio.stepLandmark(1));

  bannerEl.querySelector('#dp-auto')?.addEventListener('click', () => {
    studio.setEditorDepth(studio.state.depthLv, { lock: false, slice: false });
  });
  bannerEl.querySelector('#dp-lock')?.addEventListener('click', () => {
    const nextLock = !studio.state.lockDepth;
    studio.setEditorDepth(studio.state.depthLv, { lock: nextLock, keepTile: true });
  });
  bannerEl.querySelector('#dp-scrub')?.addEventListener('input', (e) => {
    const lv = Number(e.target.value) || 0;
    studio.setEditorDepth(lv, { lock: true, keepTile: true, quietBanner: true });
    const numEl = bannerEl.querySelector('#dp-num');
    if (numEl) numEl.value = String(lv);
    const autoBtn = bannerEl.querySelector('#dp-auto');
    const lockBtn = bannerEl.querySelector('#dp-lock');
    autoBtn?.classList.remove('gold');
    lockBtn?.classList.add('gold');
  });
  bannerEl.querySelector('#dp-num')?.addEventListener('change', (e) => {
    const lv = Number(e.target.value) || 0;
    studio.setEditorDepth(lv, { lock: true, keepTile: true });
  });
  bannerEl.querySelector('#dp-slice')?.addEventListener('click', () => {
    const nextSlice = !studio.state.sliceMode;
    studio.state.sliceMode = nextSlice;
    if (nextSlice && !studio.state.lockDepth) {
      studio.setEditorDepth(studio.state.depthLv, { lock: true, slice: true, keepTile: true });
    } else {
      renderModeBanner(bannerEl, doc, world, studio);
    }
  });
  bannerEl.querySelector('#dp-band')?.addEventListener('change', (e) => {
    studio.state.sliceBand = Math.max(8, Number(e.target.value) || 24);
    renderModeBanner(bannerEl, doc, world, studio);
  });
  bannerEl.querySelector('#psg-cancel')?.addEventListener('click', () => {
    studio.passageMode = false;
    studio.passageStart = null;
    renderModeBanner(bannerEl, doc, world, studio);
  });
}

function renderDepthControlsHtml(doc, studio, landmarks) {
  const [minLv, maxLv] = getElevationRange(doc);
  const curLv = Math.round(studio.state.depthLv || 0);
  const locked = !!studio.state.lockDepth;
  const sliced = !!studio.state.sliceMode;
  const band = studio.state.sliceBand || 24;
  const lmIdx = clamp(studio.activeLandmarkIdx ?? 0, 0, Math.max(0, landmarks.length - 1));

  const stageHtml = landmarks.length ? `
    <span class="dp-group">
      <span class="dp-lbl">Stage:</span>
      <button id="dp-stage-prev" class="mini-btn icon-only" title="Previous Stage / Room ([)">◀</button>
      <select id="dp-stage-sel" class="mini-sel stage-sel" title="Jump Camera & Working Depth to Stage / Room">
        ${landmarks.map((lm, i) => `<option value="${i}" ${i === lmIdx ? 'selected' : ''}>${lm.label}</option>`).join('')}
      </select>
      <button id="dp-stage-next" class="mini-btn icon-only" title="Next Stage / Room (])">▶</button>
    </span>
  ` : '';

  const psgBanner = studio.passageMode ? `
    <span class="psg-pill">🚪 ${studio.passageStart ? 'Click Destination Tile…' : 'Click Entrance Tile…'} <button id="psg-cancel" class="mini-btn danger">Esc</button></span>
  ` : '';

  return `
    ${stageHtml}
    <span class="dp-sep"></span>
    <span class="dp-group" title="Camera & Mouse Raycast Height Plane (Alt+Click any tile on canvas to sample its height)">
      <span class="dp-lbl">Camera Depth:</span>
      <button id="dp-auto" class="mini-btn ${!locked ? 'gold' : ''}" title="Auto-follow ground elevation under camera">Auto Z</button>
      <button id="dp-lock" class="mini-btn ${locked ? 'gold' : ''}" title="Lock camera & mouse picking to a fixed Lv plane (prevents tall walls hijacking clicks)">🔒 Lock Lv</button>
      <input id="dp-scrub" type="range" min="${minLv}" max="${maxLv}" value="${clamp(curLv, minLv, maxLv)}" class="dp-range" title="Scrub Camera Height / Depth (${minLv}..${maxLv} lv)">
      <input id="dp-num" type="number" min="-260" max="240" value="${curLv}" class="dp-num" title="Working Elevation (lv)">
      <span class="dp-unit">lv</span>
    </span>
    <span class="dp-group">
      <button id="dp-slice" class="mini-btn ${sliced ? 'teal' : ''}" title="Dim grid, zones & spawns above/below working depth band">🔪 Slice</button>
      <select id="dp-band" class="mini-sel" title="Depth Slice Visibility Band (±lv)">
        ${[14, 24, 40, 64].map((b) => `<option value="${b}" ${band === b ? 'selected' : ''}>±${b} lv</option>`).join('')}
      </select>
    </span>
    ${psgBanner}
  `;
}

/** Render the `#mode-banner` above the viewport whenever Playtest or a specialized 3D/Vehicle mode is active. */
export function renderModeBanner(bannerEl, doc, world, studio) {
  if (!bannerEl || !doc) return;

  // 1. Live Playtest Banner takes top priority
  if (studio.playtest?.active) {
    bannerEl.hidden = false;
    bannerEl.className = 'mode-banner playtest';
    const pt = studio.playtest;
    const clsOpts = Object.entries(CLASSES)
      .map(([id, c]) => `<option value="${id}" ${pt.classId === id ? 'selected' : ''}>${c.name}</option>`)
      .join('');
    bannerEl.innerHTML = `
      <b>🎮 LIVE PLAYTEST</b>
      <span>WASD / Click Move · 1–4 / Right-Click Skills · E / Click Use Portal/Door/NPC</span>
      <span class="tool-spacer"></span>
      <label class="chk-line">Class <select id="pt-class" class="mini-sel">${clsOpts}</select></label>
      <label class="chk-line">Lv <input id="pt-level" type="number" min="1" max="100" value="${pt.level}" style="width:52px;height:24px;background:#09140b;border:1px solid #3f844e;color:#fff;border-radius:4px;padding:0 4px"></label>
      <label class="chk-line"><input id="pt-god" type="checkbox" ${pt.godMode ? 'checked' : ''}> God Mode</label>
      <button id="pt-respawn" class="mini-btn">↺ Restart</button>
      <button id="pt-stop" class="mini-btn danger">⏹ Exit Playtest (Esc)</button>
    `;
    bannerEl.querySelector('#pt-class')?.addEventListener('change', (e) => {
      pt.setHeroConfig({ classId: e.target.value });
    });
    bannerEl.querySelector('#pt-level')?.addEventListener('change', (e) => {
      pt.setHeroConfig({ level: Math.max(1, Math.min(100, Number(e.target.value) || 20)) });
    });
    bannerEl.querySelector('#pt-god')?.addEventListener('change', (e) => {
      pt.godMode = e.target.checked;
      G.godMode = pt.godMode;
      if (pt.godMode) G.hurtFlash = 0;
    });
    bannerEl.querySelector('#pt-respawn')?.addEventListener('click', () => pt.restart(doc));
    bannerEl.querySelector('#pt-stop')?.addEventListener('click', () => studio.togglePlaytest(false));
    return;
  }

  bannerEl.className = 'mode-banner';
  const cat = doc.meta.category;
  const landmarks = buildStageLandmarks(doc, world);
  const has3DDepth = ['3d_dunes', '3d_caverns', '3d_alpine', 'breach'].includes(cat) ||
    (cat === 'overworld' && doc.grid.layers?.hgt?.some((v) => v !== 0));

  if (cat === '3d_tower' && world?.tower) {
    bannerEl.hidden = false;
    const tw = world.tower, g = tw.g;
    const curVal = studio.towerTurnNorm ?? 0.05;
    bannerEl.innerHTML = `
      <b>🗼 Serpentine 3D Helix</b>
      <label style="display:inline-flex;align-items:center;gap:6px">
        <span>Climb:</span>
        <input id="tw-scrub" type="range" min="0" max="100" value="${Math.round(curVal * 100)}" style="width:120px;accent-color:var(--gold)">
        <span id="tw-pct">${tw.roof ? 'ROOF' : `${Math.round(curVal * 100)}%`}</span>
      </label>
      <button class="mini-btn ${!tw.roof && curVal < 0.2 ? 'gold' : ''}" data-twjump="0.04">Base</button>
      <button class="mini-btn ${!tw.roof && curVal >= 0.4 && curVal <= 0.6 ? 'gold' : ''}" data-twjump="0.5">Mid Stair</button>
      <button class="mini-btn ${!tw.roof && curVal > 0.85 ? 'gold' : ''}" data-twjump="0.94">Stairhead</button>
      <button class="mini-btn ${tw.roof ? 'gold' : ''}" data-twjump="roof">☁️ Rooftop Arena</button>
      ${landmarks.length ? `
        <span class="dp-sep"></span>
        <select id="dp-stage-sel" class="mini-sel stage-sel">
          ${landmarks.map((lm, i) => `<option value="${i}" ${i === (studio.activeLandmarkIdx || 0) ? 'selected' : ''}>${lm.label}</option>`).join('')}
        </select>
      ` : ''}
      <span class="tool-spacer"></span>
      <small style="color:var(--dim)">Use <b>Split 2D+3D</b> to paint unrolled strip + live 3D helix</small>
    `;
    const scrubTo = (norm) => {
      if (norm === 'roof') {
        tw.setClimbTurn('roof');
        camera.x = isoX(g.AX, g.AY);
        camera.y = isoY(g.AX, g.AY);
      } else {
        const v = Number(norm) || 0;
        studio.towerTurnNorm = v;
        tw.setClimbTurn(v);
        const tx = g.X1 - v * g.L, ty = g.YR + g.w / 2;
        camera.x = isoX(tx, ty);
        camera.y = isoY(tx, ty) - 18;
      }
      const lbl = bannerEl.querySelector('#tw-pct');
      if (lbl) lbl.textContent = norm === 'roof' ? 'ROOF' : `${Math.round((Number(norm) || 0) * 100)}%`;
    };
    bannerEl.querySelector('#tw-scrub')?.addEventListener('input', (e) => scrubTo(Number(e.target.value) / 100));
    bannerEl.querySelectorAll('[data-twjump]').forEach((b) => {
      b.addEventListener('click', () => {
        const j = b.dataset.twjump;
        scrubTo(j === 'roof' ? 'roof' : Number(j));
        renderModeBanner(bannerEl, doc, world, studio);
      });
    });
    bindDepthBarEvents(bannerEl, doc, world, studio, landmarks);
  } else if (cat === '3d_dunes' && world?.cave) {
    bannerEl.hidden = false;
    const inside = !!world.cave.inside;
    const oxi = doc.grid.dunes?.oxi || 198;
    bannerEl.innerHTML = `
      <b>🏜️ Dunes &amp; Pyramid</b>
      <button id="dn-ext" class="mini-btn ${!inside ? 'gold' : ''}" title="Switch to Exterior Dunes & 3D Pyramid">🏜️ Exterior</button>
      <button id="dn-int" class="mini-btn ${inside ? 'gold' : ''}" title="Switch to Interior Spiraling Tomb">⚱️ Tomb</button>
      <span class="dp-sep"></span>
      ${renderDepthControlsHtml(doc, studio, landmarks)}
      <span class="tool-spacer"></span>
      <small class="dp-hint">Alt+Click tile = Pick Depth · [ / ] Step Rooms</small>
    `;
    bannerEl.querySelector('#dn-ext')?.addEventListener('click', () => {
      const extLm = landmarks.find((l) => !l.inside);
      if (extLm) {
        studio.activeLandmarkIdx = landmarks.indexOf(extLm);
        studio.jumpToLandmark(extLm);
      } else {
        const [sx, sy] = doc.entities.start[0] < oxi ? doc.entities.start : [86, 96];
        studio.focusCameraAtTile(sx, sy, { lock: false, slice: false });
      }
    });
    bannerEl.querySelector('#dn-int')?.addEventListener('click', () => {
      const intLm = landmarks.find((l) => l.inside && l.id?.includes('burial')) || landmarks.find((l) => l.inside);
      if (intLm) {
        studio.activeLandmarkIdx = landmarks.indexOf(intLm);
        studio.jumpToLandmark(intLm);
      } else {
        studio.focusCameraAtTile(oxi + 56, 64, { lv: -20, lock: true, slice: true });
      }
    });
    bindDepthBarEvents(bannerEl, doc, world, studio, landmarks);
  } else if (has3DDepth) {
    bannerEl.hidden = false;
    const modeTitle = cat === '3d_caverns' ? '🕯️ 3D Caverns' : cat === '3d_alpine' ? '🏔️ 3D Alpine' : cat === 'breach' ? '🌌 2.5D Breach' : '🗺️ Elevated Wilds';
    bannerEl.innerHTML = `
      <b>${modeTitle}</b>
      ${renderDepthControlsHtml(doc, studio, landmarks)}
      <span class="tool-spacer"></span>
      <small class="dp-hint">Alt+Click = Pick Depth · [ / ] Step Stages</small>
    `;
    bindDepthBarEvents(bannerEl, doc, world, studio, landmarks);
  } else if (cat === 'naval') {
    bannerEl.hidden = false;
    const ships = doc.grid?.naval?.ships?.length || 0;
    const planks = doc.grid?.naval?.planks?.length || 0;
    const linking = !!studio.plankMode;
    bannerEl.innerHTML = `
      <b>⚓ Pirate Seas 3D Fleet</b>
      <span>Ships: <b>${ships}</b> · Planks: <b>${planks}</b></span>
      <button id="nv-bake" class="mini-btn gold" title="Run Three.js GPU height/railing pass on all placed 3D ships">⚡ Bake All Walkable Ship Decks</button>
      <button id="nv-plank" class="mini-btn ${linking ? 'gold' : ''}" title="Click two deck tiles to span a 3D boarding plank & walkable bridge">${linking ? '🪢 Click 2nd Deck Tile… (Esc cancel)' : '🪢 + Boarding Plank (2-Click)'}</button>
      <span class="tool-spacer"></span>
      <small style="color:var(--dim)">Place ships from <b>Palette → 3D &amp; Fleet</b>, then click Bake</small>
    `;
    bannerEl.querySelector('#nv-bake')?.addEventListener('click', () => {
      studio.history.snapshot(doc, 'Bake Naval Decks');
      bakeAllNavalDecks(doc, world, (m) => studio.toast(m));
    });
    bannerEl.querySelector('#nv-plank')?.addEventListener('click', () => {
      studio.plankMode = !studio.plankMode;
      studio.plankStart = null;
      renderModeBanner(bannerEl, doc, world, studio);
    });
  } else if (cat === '3d_train' && world?.cave) {
    bannerEl.hidden = false;
    const spd = world.cave.speed || 0;
    bannerEl.innerHTML = `
      <b>🚂 Iron Express 3D Consist</b>
      <label style="display:inline-flex;align-items:center;gap:5px">
        <span>Roof Cutaway X:</span>
        <input id="tr-cut" type="range" min="0" max="${doc.grid.w}" value="${Math.round(doc.entities.start[0])}" style="width:130px;accent-color:var(--gold)">
      </label>
      <label style="display:inline-flex;align-items:center;gap:5px">
        <span>Gorge Speed:</span>
        <input id="tr-spd" type="range" min="0" max="22" value="${spd}" style="width:85px;accent-color:var(--teal)">
      </label>
      <button class="mini-btn" data-trjump="8">Caboose</button>
      <button class="mini-btn" data-trjump="${Math.round(doc.grid.w / 2)}">Mid Consist</button>
      <button class="mini-btn" data-trjump="${doc.grid.w - 28}">Locomotive</button>
    `;
    bannerEl.querySelector('#tr-cut')?.addEventListener('input', (e) => {
      const x = Number(e.target.value);
      trainCutaway(x);
      world.cave.focus[0] = x;
    });
    bannerEl.querySelector('#tr-spd')?.addEventListener('input', (e) => {
      world.cave.speed = Number(e.target.value);
    });
    bannerEl.querySelectorAll('[data-trjump]').forEach((b) => {
      b.addEventListener('click', () => {
        const tx = Number(b.dataset.trjump), ty = doc.entities.start[1];
        trainCutaway(tx);
        world.cave.focus[0] = tx;
        camera.x = isoX(tx, ty);
        camera.y = isoY(tx, ty);
      });
    });
  } else if (cat === 'airship') {
    bannerEl.hidden = false;
    const vessels = doc.grid?.airship?.vessels || [];
    const totalHooks = vessels.reduce((s, v) => s + (Number(v.hooks) || 0), 0);
    const pv = world?.skyDirector?.stagePreview || {};
    bannerEl.innerHTML = `
      <b>⛵ Sky Lanes Fleet</b>
      <span>Ships: <b>${vessels.length}</b> · Chains: <b>${totalHooks}</b></span>
      <button id="sky-open-3d" class="mini-btn gold" title="Open 3D & Fleet Palette to place Galleons, Cutters, Haulers & Gasbags">+ Place Airships</button>
      <span class="dp-sep"></span>
      <button id="sky-add-skiff-cine" class="mini-btn" title="Create a Skiff Boarding Wave cutscene in the Cutscene Director">+ 🛥️ Skiff Boarding Scene</button>
      <button id="sky-add-hook-cine" class="mini-btn gold" title="Create a Flagship Broadside + Grappling Hooks + Captain Boarding cutscene">+ 🪝 Flagship &amp; Grapple Scene</button>
      <span class="dp-sep"></span>
      <button id="sky-pv-hooks" class="mini-btn ${pv.hooks ? 'teal' : ''}" title="Preview Enemy Flagship & Grappling Chains alongside Ironclad">👁️ Preview Lashed Flagship</button>
      <span class="tool-spacer"></span>
      <small class="dp-hint">Select &amp; drag ships in sky · Edit Altitude &amp; Grappling Chains in Right Inspector</small>
    `;
    bannerEl.querySelector('#sky-open-3d')?.addEventListener('click', () => {
      document.querySelector('[data-ltab="palette"]')?.click();
      document.querySelector('[data-pcat="3d"]')?.click();
      studio.toast('Click an Airship in 3D & Fleet, then click in the sky to place it!');
    });
    bannerEl.querySelector('#sky-pv-hooks')?.addEventListener('click', () => {
      const next = !pv.hooks;
      world?.skyDirector?.setStagePreview({ flagship: next, hooks: next });
      renderModeBanner(bannerEl, doc, world, studio);
    });
    bannerEl.querySelector('#sky-add-skiff-cine')?.addEventListener('click', () => {
      studio.history.snapshot(doc, 'Add Skiff Boarding Cutscene');
      const id = `cine_skiff_${Date.now().toString(36).slice(-4)}`;
      const created = {
        id,
        name: 'Skiff Boarding Wave',
        allowFastForward: true,
        steps: [
          { id: `${id}_1`, type: 'sky_skiff', boatKind: 'cutter', dock: 'mid', count: 4, rank: 'champion', captainId: '', wait: false },
          { id: `${id}_2`, type: 'cam', mode: 'fit', actors: ['hero', 'skiff'], zoom: 1.25, dur: 1.6, ease: 'out', wait: true },
          { id: `${id}_3`, type: 'wait', dur: 1.8 },
          { id: `${id}_4`, type: 'cam', mode: 'return_hero', dur: 0.9, wait: true },
        ],
      };
      doc.cutscenes.push(created);
      studio.cineEditor.activeCineId = id;
      studio.state.selectedCineStep = created.steps[0];
      studio.cineEditor.renderAll();
      studio.renderInspector();
      studio.toast('Added "Skiff Boarding Wave" cutscene — click [▶ Play] to preview!');
    });
    bannerEl.querySelector('#sky-add-hook-cine')?.addEventListener('click', () => {
      studio.history.snapshot(doc, 'Add Flagship & Grappling Cutscene');
      const id = `cine_grapple_${Date.now().toString(36).slice(-4)}`;
      const created = {
        id,
        name: 'Flagship & Grappling Hooks',
        allowFastForward: true,
        steps: [
          { id: `${id}_1`, type: 'sky_flagship', action: 'arrive', dur: 3.0, captainA: 'ap_admiral_veyl', captainB: 'ap_red_gale_corsair', wait: false },
          { id: `${id}_2`, type: 'cam', mode: 'fit', actors: ['hero', 'flagship'], zoom: 1.0, dur: 1.6, ease: 'out', wait: true },
          { id: `${id}_3`, type: 'sky_volley', action: 'flagship_volley', count: 4, wait: true },
          { id: `${id}_4`, type: 'card', title: 'GRAPPLING HOOKS', sub: 'The ships are lashed together', dur: 2.4, block: false },
          { id: `${id}_5`, type: 'sky_hooks', action: 'throw_and_lash', count: 4, wait: true },
          { id: `${id}_6`, type: 'sky_volley', action: 'captain_leap', captainId: 'ap_admiral_veyl', castKey: 'admiral_veyl', dz: -1.2, wait: false },
          { id: `${id}_7`, type: 'sky_volley', action: 'captain_swing', captainId: 'ap_red_gale_corsair', castKey: 'red_gale', dz: 2.4, wait: true },
          { id: `${id}_8`, type: 'cam', mode: 'return_hero', dur: 0.9, wait: true },
        ],
      };
      doc.cutscenes.push(created);
      studio.cineEditor.activeCineId = id;
      studio.state.selectedCineStep = created.steps[4];
      studio.cineEditor.renderAll();
      studio.renderInspector();
      studio.toast('Added "Flagship & Grappling Hooks" cutscene — click [▶ Play] to watch!');
    });
  } else if (studio.passageMode) {
    bannerEl.hidden = false;
    bannerEl.innerHTML = `
      <b>🚪 Passage / Teleport Linker</b>
      <span class="psg-pill">${studio.passageStart ? 'Click Destination Tile…' : 'Click Entrance Tile…'} <button id="psg-cancel" class="mini-btn danger">Cancel (Esc)</button></span>
    `;
    bindDepthBarEvents(bannerEl, doc, world, studio, landmarks);
  } else {
    bannerEl.hidden = true;
    bannerEl.innerHTML = '';
  }
}

/** Append mode-specific architecture controls into Left Dock → `⚙️ Scenario` settings panel. */
export function appendSpecialModeSettings(wrap, doc, studio) {
  const cat = doc.meta.category;

  if (cat === '3d_tower' && doc.grid.tower) {
    const tw = doc.grid.tower;
    const sec = document.createElement('div');
    sec.className = 'form-stack';
    sec.innerHTML = `
      <div class="insp-sec">3D Serpentine Helix Geometry</div>
      <div class="fg-row">
        <div class="fg"><label>Inner Radius (rIn)</label><input data-tw="rIn" type="number" step="0.5" min="6" max="24" value="${tw.rIn ?? 11}"></div>
        <div class="fg"><label>Stair Width (w)</label><input data-tw="w" type="number" step="1" min="4" max="12" value="${tw.w ?? 6}"></div>
      </div>
      <div class="fg-row">
        <div class="fg"><label>Turn Pitch</label><input data-tw="pitch" type="number" step="0.5" min="8" max="28" value="${tw.pitch ?? 14}"></div>
        <div class="fg"><label>Helix Turns</label><input data-tw="turns" type="number" step="0.25" min="1.5" max="6" value="${tw.turns ?? 3.25}"></div>
      </div>
      <button id="btn-rebuild-tower" class="sbtn gold">↻ Rebuild 3D Tower Mesh</button>
    `;
    sec.querySelector('#btn-rebuild-tower')?.addEventListener('click', () => {
      studio.history.snapshot(doc, 'Tower Geometry');
      sec.querySelectorAll('[data-tw]').forEach((inp) => {
        tw[inp.dataset.tw] = Number(inp.value);
      });
      studio.rebuildWorld();
    });
    wrap.appendChild(sec);
  }

  if (['3d_caverns', '3d_alpine', '3d_dunes', 'breach', 'overworld'].includes(cat)) {
    const tr = doc.grid.traversal;
    const hf = (doc.grid.heightfield ||= { subdiv: 2, waterfalls: [], snowLine: 28, cloudSeaY: -6 });
    const sec = document.createElement('div');
    sec.className = 'form-stack';
    sec.innerHTML = `
      <div class="insp-sec">3D Traversal &amp; Heightfield</div>
      <div class="fg-row">
        <div class="fg"><label>Max Climb (lv)</label><input data-tr="climb" type="number" min="1" max="16" value="${tr.climb ?? 4}"></div>
        <div class="fg"><label>Max Drop (lv)</label><input data-tr="drop" type="number" min="2" max="40" value="${tr.drop ?? 10}"></div>
      </div>
      <div class="fg-row">
        <div class="fg"><label>Smooth Walk Step</label><input data-tr="walkStep" type="number" min="1" max="12" value="${tr.walkStep ?? 3}"></div>
        <div class="fg"><label>Snow Line (lv)</label><input id="hf-snow" type="number" min="-40" max="120" value="${hf.snowLine ?? 28}"></div>
      </div>
      <label class="chk-line"><input id="tr-los" type="checkbox" ${tr.losCap !== false ? 'checked' : ''}> Foreground Rock LOS Cap (keep hero visible)</label>
      <button id="btn-apply-3d" class="sbtn">↻ Recompile 3D Terrain Mesh</button>
    `;
    sec.querySelector('#btn-apply-3d')?.addEventListener('click', () => {
      sec.querySelectorAll('[data-tr]').forEach((inp) => { tr[inp.dataset.tr] = Number(inp.value); });
      hf.snowLine = Number(sec.querySelector('#hf-snow').value) || 28;
      tr.losCap = sec.querySelector('#tr-los').checked;
      studio.rebuildWorld();
    });
    wrap.appendChild(sec);
  }

  if (cat === 'airship') {
    const air = (doc.grid.airship ||= { flagship: 'THE BLACK SCOURGE', flagshipSub: 'Pirate Dreadnought' });
    const sec = document.createElement('div');
    sec.className = 'form-stack';
    sec.innerHTML = `
      <div class="insp-sec">Airship Encounter</div>
      <div class="fg"><label>Enemy Flagship Name</label><input id="air-flag" type="text" value="${air.flagship || ''}"></div>
      <div class="fg"><label>Flagship Subtitle</label><input id="air-sub" type="text" value="${air.flagshipSub || ''}"></div>
    `;
    sec.querySelector('#air-flag')?.addEventListener('change', (e) => { air.flagship = e.target.value; studio.refreshBanner(); });
    sec.querySelector('#air-sub')?.addEventListener('change', (e) => { air.flagshipSub = e.target.value; });
    wrap.appendChild(sec);
  }

  if (cat === 'naval') {
    const nv = (doc.grid.naval ||= { ships: [], planks: [] });
    const sec = document.createElement('div');
    sec.className = 'form-stack';
    const shipRows = (nv.ships || []).map((sh, i) => `
      <div class="out-row">
        <span>⚓ ${sh.kind} (${sh.x.toFixed(0)}, ${sh.y.toFixed(0)})</span>
        <small>${sh.walkableDeck !== false ? 'DECK' : 'PROP'}</small>
        <button class="mini-btn danger" data-delship="${i}">✕</button>
      </div>
    `).join('') || '<div class="dim-lbl">No auxiliary 3D ships placed yet (select from Palette → 3D &amp; Fleet).</div>';
    sec.innerHTML = `
      <div class="insp-sec">Naval Fleet (${nv.ships?.length || 0} Ships · ${nv.planks?.length || 0} Planks)</div>
      ${shipRows}
      ${nv.planks?.length ? '<button id="nv-clear-planks" class="mini-btn danger">Clear Boarding Planks</button>' : ''}
    `;
    sec.querySelectorAll('[data-delship]').forEach((b) => {
      b.addEventListener('click', () => {
        studio.history.snapshot(doc, 'Remove Ship');
        nv.ships.splice(Number(b.dataset.delship), 1);
        studio.rebuildWorld();
      });
    });
    sec.querySelector('#nv-clear-planks')?.addEventListener('click', () => {
      studio.history.snapshot(doc, 'Clear Planks');
      nv.planks = [];
      studio.rebuildWorld();
    });
    void NAVAL_FLEET_KINDS;
    wrap.appendChild(sec);
  }

  if (cat === '3d_train' && doc.grid.train?.cars) {
    const cars = doc.grid.train.cars;
    const sec = document.createElement('div');
    sec.className = 'form-stack';
    sec.innerHTML = `
      <div class="insp-sec">Iron Express Consist (${cars.length} Cars)</div>
      <div style="display:flex;flex-direction:column;gap:4px;max-height:190px;overflow-y:auto">
        ${cars.map((c, idx) => `
          <div class="out-row" style="padding:3px 6px">
            <span style="font-size:11px;color:var(--faint)">#${idx + 1}</span>
            <select data-caridx="${idx}" style="flex:1;background:var(--bg-deep);border:1px solid var(--line);border-radius:4px;padding:2px 4px;font-size:12px">
              ${TRAIN_CAR_KINDS.map((k) => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>
    `;
    sec.querySelectorAll('[data-caridx]').forEach((sel) => {
      sel.addEventListener('change', () => {
        cars[Number(sel.dataset.caridx)].kind = sel.value;
        studio.toast('Updated car type in consist.');
      });
    });
    wrap.appendChild(sec);
  }
}
