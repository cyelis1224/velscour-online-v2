// VELSCOUR Level & Scenario Studio — Main Orchestrator
// Connects the 1:1 live engine renderer (renderWorld + Three.js 3D scenes + Cine cutscenes)
// with Asset Manager palettes, 2D/3D brushes, Cutscene Director, Seed Baker & F5 Playtest.
import { G } from '../../src/state.js';
import { A, loadAssets, biomeTileSet, mixedTileSet } from '../../src/core/assets.js';
import { camera, isoX, isoY } from '../../src/core/view.js';
import { clamp } from '../../src/core/util.js';
import { Cine } from '../../src/game/cinema.js';
import { renderWorld, dropBakes } from '../../src/game/render.js';
import { lights, addLight, updateVfx } from '../../src/gfx/vfx.js';
import { BESTIARY } from '../../src/data/bestiary.js';
import { TOWNSFOLK } from '../../src/data/townsfolk.js';
import { VENDORS } from '../../src/world/town.js';
import { TOWN_BIOME } from '../../src/data/biomes.js';

import {
  SCENARIO_CATEGORIES,
  CATEGORY_BY_ID,
  allEditorBiomes,
  resolveBiome,
  variantsFor,
  slugifyId,
  createBlankScenarioDoc,
  serializeScenarioDoc,
  deserializeScenarioDoc,
  bakeGeneratedToDoc,
  validateScenarioDoc,
} from '../../src/world/scenariocodec.js';
import {
  loadScenarioIndex,
  fetchScenarioDoc,
  loadCustomScenarioArt,
  buildCustomScenarioWorld,
} from '../../src/world/customscenario.js';

// Built-in procedural generators for the "Bake from Seed" modal
import { generateDungeon } from '../../src/world/dungeon.js';
import { generateTown } from '../../src/world/town.js';
import { generateAct2Town } from '../../src/world/act2town.js';
import { generateOverworld } from '../../src/world/overworld.js';
import { generateCastle } from '../../src/world/castleworld.js';
import { generateDarkForest } from '../../src/world/darkforest.js';
import { generateCaverns } from '../../src/world/caverns.js';
import { generateTower } from '../../src/world/tower.js';
import { generateMountain } from '../../src/world/mountain.js';
import { generateSummit } from '../../src/world/summit.js';
import { generateDunes } from '../../src/world/dunes.js';
import { generateSkyship } from '../../src/world/skyship.js';
import { generateSeaship, joinDecks, mapChanged as seaMapChanged } from '../../src/world/seaship.js';
import { seaPlank } from '../../src/gfx/seabattle3d.js';
import { generateGhostTrain } from '../../src/world/ghosttrain.js';
import { generateSiege } from '../../src/world/siege.js';
import { generateMines } from '../../src/world/mines.js';
import { generateHunt } from '../../src/world/hunt.js';
import { generateBreach } from '../../src/world/breach.js';
import { loadBaked } from '../../src/gfx/castle3dart.js';

// Studio modules
import {
  PALETTE_CATEGORIES,
  loadAssetManagerCatalog,
  applyManifestThumb,
  drawSpriteThumb,
  getPaletteItems,
  swapNames,
} from './catalog.js';
import {
  CommandStack,
  paintFloorBrush,
  paintShapeRegion,
  floodFillTiles,
  stampThemedRoom,
  paintSplinePath,
  snapWallMount,
  placeOpeningAt,
  pickSceneObjectAt,
  drawEditorOverlays,
} from './tools2d.js';
import {
  SCULPT_MODES,
  applySculptBrush,
  applyRampGrade,
  drawWalkabilityHeatmap,
  Plan2DView,
  Orbit3DController,
} from './tools3d.js';
import { renderModeBanner, appendSpecialModeSettings, bakeAllNavalDecks } from './tower_vehicles.js';
import { CutsceneEditorController } from './cutscene_editor.js';
import { PlaytestController } from './playtest.js';

const LAYER_DEFS = [
  { id: 'terrain', label: 'Floors, Walls & 3D Terrain' },
  { id: 'props', label: 'Props, Trees & Buildings' },
  { id: 'entities', label: 'Monsters, Bosses & NPCs' },
  { id: 'cutscenes', label: 'Zones, Rooms & Cine Marks' },
];

class VelscourStudio {
  constructor() {
    this.canvas = document.getElementById('studio-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.planView = new Plan2DView(document.getElementById('plan-canvas'));
    this.minimap = document.getElementById('studio-minimap');
    this.orbit = new Orbit3DController();
    this.cineEditor = new CutsceneEditorController(this);
    this.playtest = new PlaytestController(this);
    this.history = new CommandStack(50, () => this.syncUndoButtons());

    this.doc = null;
    this.world = null;
    this.paletteTab = 'floors';
    this.activePaletteItem = null;
    this.vpMode = 'live'; // 'live' | 'plan' | 'split'
    this.plankMode = false;
    this.plankStart = null;
    this.rampAnchor = null;
    this._rebuildTimer = null;

    this.state = {
      tool: 'select',
      brushSize: 2,
      autoPave: true,
      sculptMode: 'raise',
      sculptStrength: 2,
      sculptTargetLv: 12,
      waterDepth: 1,
      splineWidth: 3,
      splinePts: [],
      showGrid: true,
      showHeatmap: false,
      showLighting: true,
      layers: { terrain: true, props: true, entities: true, cutscenes: true },
      locks: { terrain: false, props: false, entities: false, cutscenes: false },
      hoverTile: null,
      dragStart: null,
      draggingObject: false,
      painting: false,
      panning: false,
      panOrigin: [0, 0],
      camOrigin: [0, 0],
      spaceDown: false,
      selected: null,
      selectedCineStep: null,
    };

    this.fps = 60;
    this._lastT = performance.now();
  }

  async init() {
    // Configure engine globals for Studio viewport
    G.settings = Object.assign({
      zoom: 1,
      shake: true,
      glow: true,
      particles: true,
      outlines: true,
      heldGear: true,
      sfx: 0.7,
      music: 0,
    }, G.settings || {});
    G.dpr = Math.min(2, window.devicePixelRatio || 1);

    this.toast('Loading Velscour art packs & Asset Manager catalog…');
    await Promise.all([
      loadAssets().catch((e) => console.warn('[Studio] Partial core asset load:', e)),
      loadAssetManagerCatalog(),
    ]);

    this.bindTopBar();
    this.bindDocks();
    this.bindRibbon();
    this.bindViewportEvents();
    this.bindKeyboard();
    this.cineEditor.bindToolbar();
    this.renderLayerList();

    // Load initial scenario (?id=... or sanctum_of_echoes fallback to blank dungeon)
    const urlId = new URLSearchParams(window.location.search).get('id');
    let initialDoc = null;
    for (const candidate of [urlId, 'sanctum_of_echoes'].filter(Boolean)) {
      try {
        initialDoc = await fetchScenarioDoc(candidate, true);
        break;
      } catch {}
    }
    if (!initialDoc) {
      initialDoc = createBlankScenarioDoc({
        id: 'catacombs_sanctum',
        name: 'Sanctum of Echoes',
        category: 'dungeon',
        biomeId: 'catacombs',
      });
    }

    await this.loadDocument(initialDoc, { center: true });
    this.toast(`Loaded "${this.doc.meta.name}"`);
    requestAnimationFrame((t) => this.frame(t));
  }

  toast(msg) {
    const el = document.getElementById('studio-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('on'), 2800);
  }

  syncUndoButtons() {
    const u = document.getElementById('btn-undo');
    const r = document.getElementById('btn-redo');
    if (u) u.disabled = !this.history.undoStack.length;
    if (r) r.disabled = !this.history.redoStack.length;
  }

  // ------------------------------------------------------------------ Document Lifecycle & World Sync
  async openById(id) {
    const doc = await fetchScenarioDoc(id, true);
    await this.loadDocument(doc, { center: true });
    return doc;
  }

  async loadDocument(doc, { center = true } = {}) {
    if (this.playtest.active) await this.playtest.stop();
    this.cineEditor.stopPreview();
    this.doc = doc;
    this.history.undoStack.length = 0;
    this.history.redoStack.length = 0;
    this.syncUndoButtons();
    this.state.selected = null;
    this.state.selectedCineStep = doc.cutscenes?.[0]?.steps?.[0] || null;
    this.cineEditor.activeCineId = doc.cutscenes?.[0]?.id || null;

    // Auto-enable Split 2D+3D view on Serpentine Tower so creator sees both unrolled strip & 3D helix
    if (doc.meta.category === '3d_tower' && this.vpMode === 'live') {
      this.setViewportMode('split');
    }

    this.syncTopSelectors();
    await this.rebuildWorld({ keepCamera: !center });
    if (center) this.centerCameraOnStart();
    this.planView.fitToDoc(doc);
    this.renderPalette();
    this.renderOutliner();
    this.renderScenarioSettings();
    this.cineEditor.renderAll();
    this.renderInspector();
    this.refreshValidation();
  }

  async rebuildWorld({ keepCamera = true } = {}) {
    if (!this.doc) return;
    const prevCam = { x: camera.x, y: camera.y, zoom: camera.zoom };
    const world = await buildCustomScenarioWorld(this.doc, {
      depth: this.doc.meta.publish?.pinnedDepth || 10,
      revealAll: true,
      skipArrival: true,
      freezeAI: true,
      isEditor: true,
      isEditorPreview: true,
      keepAllTileSets: true,
    });
    if (!this.state.showLighting) world.darkK = 0;
    this.world = world;
    G.world = world;
    if (keepCamera && (prevCam.x || prevCam.y)) {
      camera.x = prevCam.x;
      camera.y = prevCam.y;
      camera.zoom = prevCam.zoom;
    }
    this.refreshBanner();
  }

  /** Fast incremental sync for 2D/2.5D tile edits without tearing down WebGL contexts. */
  syncFastMapEdit({ rebuildWalls = true, schedule3D = false } = {}) {
    const { doc, world } = this;
    if (!doc || !world) return;
    const { w, h, layers } = doc.grid;
    const N = w * h;
    const map = world.map;
    map.t.set(layers.t.subarray(0, N));
    if (map.v.length === N) map.v.set(layers.v.subarray(0, N));
    map.block.set(layers.block.subarray(0, N));
    if (map.hgt) map.hgt.set(layers.hgt.subarray(0, N));
    if (map.wet) map.wet.set(layers.wet.subarray(0, N));
    if (map.under) map.under.set(layers.under.subarray(0, N));

    const cat = doc.meta.category;
    if (rebuildWalls && (cat === 'dungeon' || (cat === 'town_arena' && doc.meta.variantId === 'pvp_arena') || doc.meta.biomeId === 'deep_mines')) {
      map.buildWalls(world.tileset, () => 0.5, doc.architecture.openings || []);
    }
    map.seen.fill(1);
    map._stepMask = null;
    world.floorChunks = null;
    world.floorChunksFlux = null;
    dropBakes();

    if (schedule3D && ['3d_caverns', '3d_alpine', '3d_dunes', 'breach'].includes(cat)) {
      clearTimeout(this._rebuildTimer);
      this._rebuildTimer = setTimeout(() => this.rebuildWorld({ keepCamera: true }), 180);
    }
  }

  centerCameraOnStart() {
    if (!this.doc) return;
    this.resizeCanvases();
    const [sx, sy] = this.doc.entities.start || [this.doc.grid.w / 2, this.doc.grid.h / 2];
    if (this.world?.tower) {
      const g = this.world.tower.g;
      if (sx < g.XR) this.world.tower.setClimbTurn('roof');
      else this.world.tower.setClimbTurn(clamp(g.s(sx) / g.L, 0, 1));
    }
    camera.zoom = 1.35;
    camera.x = isoX(sx, sy);
    camera.y = isoY(sx, sy) - 18;
  }

  refreshBanner() {
    renderModeBanner(document.getElementById('mode-banner'), this.doc, this.world, this);
  }

  // ------------------------------------------------------------------ Top Studio Bar & Context Selectors
  bindTopBar() {
    const selCat = document.getElementById('sel-category');
    const selBiome = document.getElementById('sel-biome');
    const selVar = document.getElementById('sel-variant');
    const selMix = document.getElementById('sel-mix');

    if (selCat) {
      selCat.innerHTML = SCENARIO_CATEGORIES.map((c) => `<option value="${c.id}">${c.icon} ${c.short}</option>`).join('');
      selCat.addEventListener('change', async () => {
        const nextCat = selCat.value;
        const catDef = CATEGORY_BY_ID[nextCat];
        const nextBiome = catDef.biomes.includes(this.doc.meta.biomeId) ? this.doc.meta.biomeId : catDef.biomes[0];
        const nextDoc = createBlankScenarioDoc({
          id: `${nextBiome}_custom`,
          name: `Custom ${resolveBiome(nextBiome).name}`,
          category: nextCat,
          biomeId: nextBiome,
        });
        await this.loadDocument(nextDoc, { center: true });
      });
    }

    selBiome?.addEventListener('change', async () => {
      this.history.snapshot(this.doc, 'Change Biome');
      this.doc.meta.biomeId = selBiome.value;
      const vars = variantsFor(this.doc.meta.category, this.doc.meta.biomeId);
      this.doc.meta.variantId = vars[0]?.id || 'default';
      this.syncTopSelectors();
      await this.rebuildWorld({ keepCamera: true });
      this.renderPalette();
      this.renderScenarioSettings();
    });

    selVar?.addEventListener('change', async () => {
      this.history.snapshot(this.doc, 'Change Variant');
      this.doc.meta.variantId = selVar.value;
      if (this.doc.meta.category === '3d_tower') {
        const nextDoc = createBlankScenarioDoc({
          id: this.doc.meta.id,
          name: this.doc.meta.name,
          category: '3d_tower',
          biomeId: this.doc.meta.biomeId,
          variantId: selVar.value,
        });
        await this.loadDocument(nextDoc, { center: true });
        return;
      }
      await this.rebuildWorld({ keepCamera: true });
    });

    selMix?.addEventListener('change', async () => {
      this.history.snapshot(this.doc, 'Change Mix Biome');
      this.doc.meta.mixBiomeId = selMix.value || null;
      await this.rebuildWorld({ keepCamera: true });
      this.renderPalette();
    });

    document.getElementById('btn-new')?.addEventListener('click', () => this.openNewScenarioModal());
    document.getElementById('btn-open')?.addEventListener('click', () => this.openLoadScenarioModal());
    document.getElementById('btn-save')?.addEventListener('click', () => this.saveScenarioToServer());
    document.getElementById('btn-export')?.addEventListener('click', () => this.exportScenarioJson());
    document.getElementById('file-import')?.addEventListener('change', (e) => this.importScenarioJson(e));

    document.getElementById('btn-undo')?.addEventListener('click', () => {
      if (this.history.undo(this.doc)) {
        this.rebuildWorld({ keepCamera: true });
        this.renderOutliner();
        this.cineEditor.renderAll();
        this.renderInspector();
        this.refreshValidation();
      }
    });
    document.getElementById('btn-redo')?.addEventListener('click', () => {
      if (this.history.redo(this.doc)) {
        this.rebuildWorld({ keepCamera: true });
        this.renderOutliner();
        this.cineEditor.renderAll();
        this.renderInspector();
        this.refreshValidation();
      }
    });

    document.getElementById('btn-validate')?.addEventListener('click', () => {
      this.switchBottomTab('validation');
      const bd = document.getElementById('bottom-dock');
      bd?.classList.remove('collapsed');
    });

    document.getElementById('btn-playtest')?.addEventListener('click', () => this.togglePlaytest());
    document.getElementById('modal-close')?.addEventListener('click', () => this.closeModal());
    document.getElementById('modal-scrim')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-scrim') this.closeModal();
    });
  }

  syncTopSelectors() {
    if (!this.doc) return;
    const cat = CATEGORY_BY_ID[this.doc.meta.category] || SCENARIO_CATEGORIES[0];
    const allB = allEditorBiomes();
    const selCat = document.getElementById('sel-category');
    const selBiome = document.getElementById('sel-biome');
    const selVar = document.getElementById('sel-variant');
    const selMix = document.getElementById('sel-mix');
    const wrapMix = document.getElementById('wrap-mix');

    if (selCat) selCat.value = cat.id;
    if (selBiome) {
      selBiome.innerHTML = cat.biomes.map((bid) => {
        const b = allB.find((x) => x.id === bid) || resolveBiome(bid);
        return `<option value="${bid}" ${bid === this.doc.meta.biomeId ? 'selected' : ''}>${b.name}</option>`;
      }).join('');
    }
    const vars = variantsFor(cat.id, this.doc.meta.biomeId);
    if (selVar) {
      selVar.innerHTML = vars.map((v) => `<option value="${v.id}" ${v.id === this.doc.meta.variantId ? 'selected' : ''}>${v.name}</option>`).join('');
    }
    if (wrapMix) wrapMix.hidden = !cat.supportsMix;
    if (selMix && cat.supportsMix) {
      selMix.innerHTML = `<option value="">(None)</option>` + cat.biomes.map((bid) => {
        const b = resolveBiome(bid);
        return `<option value="${bid}" ${bid === this.doc.meta.mixBiomeId ? 'selected' : ''}>${b.name}</option>`;
      }).join('');
    }
  }

  async togglePlaytest(force) {
    const next = force !== undefined ? !!force : !this.playtest.active;
    const btn = document.getElementById('btn-playtest');
    if (next) {
      await this.playtest.start(this.doc);
      btn?.classList.add('active');
      if (btn) btn.textContent = '⏹ Stop (F5)';
    } else {
      await this.playtest.stop();
      btn?.classList.remove('active');
      if (btn) btn.textContent = '▶ Playtest (F5)';
    }
    this.refreshBanner();
  }

  // ------------------------------------------------------------------ Save / Export / Import / Modals
  async saveScenarioToServer() {
    if (!this.doc) return;
    this.doc.meta.id = slugifyId(this.doc.meta.id || this.doc.meta.name);
    const payload = serializeScenarioDoc(this.doc);
    try {
      const res = await fetch(`api/studio/scenarios/${encodeURIComponent(this.doc.meta.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const out = await res.json();
      await loadScenarioIndex(true);
      this.toast(`Saved "${this.doc.meta.name}" → ${out.path || out.file}`);
    } catch (e) {
      localStorage.setItem(`velscour_studio_draft_${this.doc.meta.id}`, JSON.stringify(payload));
      this.toast(`Saved draft locally (run "npm run studio" for disk write to assets/scenarios/).`);
      console.warn('[Studio] Disk save unavailable:', e.message);
    }
  }

  exportScenarioJson() {
    if (!this.doc) return;
    const payload = JSON.stringify(serializeScenarioDoc(this.doc), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slugifyId(this.doc.meta.id || this.doc.meta.name)}.velscen.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.toast(`Exported ${a.download}`);
  }

  async importScenarioJson(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const doc = deserializeScenarioDoc(raw);
      await this.loadDocument(doc, { center: true });
      this.toast(`Imported "${doc.meta.name}"`);
    } catch (err) {
      this.toast(`Import failed: ${err.message}`);
    }
  }

  openModal(title, renderFn) {
    const scrim = document.getElementById('modal-scrim');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    if (!scrim || !bodyEl) return;
    titleEl.textContent = title;
    bodyEl.innerHTML = '';
    renderFn(bodyEl);
    scrim.hidden = false;
  }

  closeModal() {
    const scrim = document.getElementById('modal-scrim');
    if (scrim) scrim.hidden = true;
  }

  openNewScenarioModal() {
    let mode = 'blank'; // 'blank' | 'bake'
    let selCatId = this.doc?.meta?.category || 'dungeon';
    let selBiomeId = this.doc?.meta?.biomeId || 'catacombs';
    let selVarId = 'default';
    let seed = Math.floor(Math.random() * 900000) + 100000;

    this.openModal('Create New Scenario or Bake Procedural Seed', (body) => {
      const redraw = () => {
        const cat = CATEGORY_BY_ID[selCatId] || SCENARIO_CATEGORIES[0];
        if (!cat.biomes.includes(selBiomeId)) selBiomeId = cat.biomes[0];
        const vars = variantsFor(cat.id, selBiomeId);
        if (!vars.some((v) => v.id === selVarId)) selVarId = vars[0]?.id || 'default';
        const biomeName = resolveBiome(selBiomeId).name;

        body.innerHTML = `
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <button class="sbtn ${mode === 'blank' ? 'gold' : ''}" data-nmode="blank">✨ Blank Playable Canvas</button>
            <button class="sbtn ${mode === 'bake' ? 'gold' : ''}" data-nmode="bake">🎲 Bake Existing Game Generator Seed</button>
          </div>
          <div class="dim-lbl">1. Select Scenario Architecture (2D, 2.5D, Vehicle, or Live Three.js 3D):</div>
          <div class="cat-cards">
            ${SCENARIO_CATEGORIES.map((c) => `
              <button class="cat-card ${c.id === selCatId ? 'active' : ''}" data-ncat="${c.id}">
                <b>${c.icon} ${c.name}</b>
                <small>${c.blurb}</small>
              </button>
            `).join('')}
          </div>
          <div class="fg-row" style="grid-template-columns: 1.2fr 1fr 1fr ${mode === 'bake' ? '0.8fr' : ''}">
            <div class="fg">
              <label>Scenario Title</label>
              <input id="nw-name" type="text" value="${mode === 'bake' ? `${biomeName} (Seed ${seed})` : `Custom ${biomeName}`}">
            </div>
            <div class="fg">
              <label>Biome &amp; Art Pack</label>
              <select id="nw-biome">
                ${cat.biomes.map((bid) => `<option value="${bid}" ${bid === selBiomeId ? 'selected' : ''}>${resolveBiome(bid).name}</option>`).join('')}
              </select>
            </div>
            <div class="fg">
              <label>Variant / Weather</label>
              <select id="nw-var">
                ${vars.map((v) => `<option value="${v.id}" ${v.id === selVarId ? 'selected' : ''}>${v.name}</option>`).join('')}
              </select>
            </div>
            ${mode === 'bake' ? `
              <div class="fg">
                <label>Generator Seed</label>
                <input id="nw-seed" type="number" value="${seed}">
              </div>
            ` : ''}
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
            <button id="nw-cancel" class="sbtn quiet">Cancel</button>
            <button id="nw-go" class="sbtn gold">${mode === 'bake' ? '🎲 Generate & Bake onto Canvas' : '✨ Create Scenario'}</button>
          </div>
        `;

        body.querySelectorAll('[data-nmode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.nmode; redraw(); }));
        body.querySelectorAll('[data-ncat]').forEach((b) => b.addEventListener('click', () => { selCatId = b.dataset.ncat; redraw(); }));
        body.querySelector('#nw-biome')?.addEventListener('change', (e) => { selBiomeId = e.target.value; redraw(); });
        body.querySelector('#nw-var')?.addEventListener('change', (e) => { selVarId = e.target.value; });
        body.querySelector('#nw-seed')?.addEventListener('change', (e) => { seed = Number(e.target.value) || 1337; });
        body.querySelector('#nw-cancel')?.addEventListener('click', () => this.closeModal());
        body.querySelector('#nw-go')?.addEventListener('click', async () => {
          const title = body.querySelector('#nw-name')?.value?.trim() || `Custom ${biomeName}`;
          const sVal = Number(body.querySelector('#nw-seed')?.value) || seed;
          this.closeModal();
          if (mode === 'blank') {
            const doc = createBlankScenarioDoc({
              id: slugifyId(title),
              name: title,
              category: selCatId,
              biomeId: selBiomeId,
              variantId: selVarId,
            });
            await this.loadDocument(doc, { center: true });
          } else {
            await this.bakeSeedScenario({ title, category: selCatId, biomeId: selBiomeId, variantId: selVarId, seed: sVal });
          }
        });
      };
      redraw();
    });
  }

  async bakeSeedScenario({ title, category, biomeId, variantId, seed }) {
    const resolvedBiomeId = biomeId || CATEGORY_BY_ID[category]?.biomes?.[0] || 'catacombs';
    this.toast(`Baking ${resolvedBiomeId} (seed ${seed})…`);
    const biome = resolveBiome(resolvedBiomeId);
    const dummyDoc = createBlankScenarioDoc({ category, biomeId: resolvedBiomeId, variantId });
    await loadCustomScenarioArt(dummyDoc);
    const ts = biomeTileSet(biome.overworld && !biome.packArt ? TOWN_BIOME : biome);

    let gen;
    if (category === 'town_arena') {
      gen = resolvedBiomeId === 'act2_town' || variantId === 'town_act2' ? generateAct2Town(ts, seed) : generateTown(ts, seed);
    } else if (category === '3d_caverns') {
      gen = generateCaverns(12, biome, seed);
    } else if (category === '3d_tower') {
      gen = generateTower(18, biome, seed);
    } else if (category === '3d_alpine') {
      gen = resolvedBiomeId === 'snowy_summit' ? generateSummit(24, biome, seed) : generateMountain(20, biome, seed);
    } else if (category === '3d_dunes') {
      gen = generateDunes(22, biome, seed, resolvedBiomeId === 'scorpion_king_pyramid' ? 1 : null);
    } else if (category === 'airship') {
      const baked = await loadBaked('assets/tiles/skyship/').catch(() => null);
      gen = generateSkyship(16, biome, seed, baked);
    } else if (category === 'naval') {
      gen = generateSeaship(16, biome, seed);
    } else if (category === '3d_train') {
      gen = generateGhostTrain(18, biome, seed);
    } else if (category === 'breach') {
      gen = generateBreach(1, biome, ts, ts, seed);
    } else if (category === 'overworld') {
      if (resolvedBiomeId === 'castle') gen = generateCastle(15, biome, seed, variantId);
      else if (resolvedBiomeId === 'dark_forest') gen = generateDarkForest(14, biome, ts, seed);
      else if (resolvedBiomeId === 'endless_siege') gen = generateSiege(16, biome, seed, variantId);
      else if (resolvedBiomeId === 'deep_mines') gen = generateMines(14, biome, seed);
      else if (resolvedBiomeId === 'great_hunt') gen = generateHunt(14, biome, seed, variantId);
      else gen = generateOverworld(10, biome, seed);
    } else {
      const dDepth = variantId === 'raid_arena' ? 10 : variantId === 'throne_gauntlet' ? 500 : 7;
      const dBiome = variantId === 'throne_gauntlet' ? resolveBiome('throne') : biome;
      const dTs = variantId === 'throne_gauntlet' ? biomeTileSet(dBiome) : ts;
      gen = generateDungeon(dDepth, dBiome, dTs, seed, variantId === 'castle_keep_layout' ? { castleKeep: true } : {});
    }

    const doc = bakeGeneratedToDoc(gen, {
      id: slugifyId(title),
      name: title,
      category,
      biomeId: resolvedBiomeId,
      variantId,
      seed,
    });
    await this.loadDocument(doc, { center: true });
    this.toast(`Baked "${title}" (${doc.grid.w}×${doc.grid.h}, ${doc.entities.spawns.length} spawns).`);
  }

  async openLoadScenarioModal() {
    let list = [];
    try {
      const r = await fetch('api/studio/scenarios', { cache: 'no-cache' });
      if (r.ok) list = (await r.json()).scenarios || [];
    } catch {}
    if (!list.length) {
      list = (await loadScenarioIndex(true)).scenarios || [];
    }

    this.openModal('Open Authored Scenario', (body) => {
      if (!list.length) {
        body.innerHTML = '<div class="dim-lbl">No saved scenarios found in <code>assets/scenarios/</code> yet.</div>';
        return;
      }
      body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">
          ${list.map((s) => `
            <div class="tcard">
              <div class="tcard-head">
                <b style="color:var(--gold-b)">${s.name}</b>
                <span class="coop-tag">${s.category}</span>
              </div>
              <span class="dim-lbl">${s.biomeId} · ${s.size?.[0] || '?'}×${s.size?.[1] || '?'} · ${s.cutscenes || 0} cine(s)</span>
              <p style="margin:4px 0;font-size:12px;color:var(--text)">${s.blurb || ''}</p>
              <div style="display:flex;gap:6px;margin-top:auto">
                <button class="mini-btn gold" data-open-id="${s.id}">Open in Studio</button>
                <button class="mini-btn danger" data-del-id="${s.id}">Delete</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      body.querySelectorAll('[data-open-id]').forEach((b) => b.addEventListener('click', async () => {
        const id = b.dataset.openId;
        this.closeModal();
        const doc = await fetchScenarioDoc(id, true);
        await this.loadDocument(doc, { center: true });
      }));
      body.querySelectorAll('[data-del-id]').forEach((b) => b.addEventListener('click', async () => {
        const id = b.dataset.delId;
        await fetch(`api/studio/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
        this.openLoadScenarioModal();
      }));
    });
  }

  // ------------------------------------------------------------------ Docks: Palette, Outliner, Settings, Layers, Inspector
  bindDocks() {
    // Left dock tabs
    document.querySelectorAll('[data-ltab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-ltab]').forEach((x) => x.classList.toggle('active', x === btn));
        ['palette', 'outliner', 'settings'].forEach((id) => {
          const p = document.getElementById(`ltab-${id}`);
          if (p) p.hidden = id !== btn.dataset.ltab;
        });
        if (btn.dataset.ltab === 'outliner') this.renderOutliner();
        if (btn.dataset.ltab === 'settings') this.renderScenarioSettings();
      });
    });

    // Bottom dock tabs & collapse
    document.querySelectorAll('[data-btab]').forEach((btn) => {
      btn.addEventListener('click', () => this.switchBottomTab(btn.dataset.btab));
    });
    document.getElementById('btn-toggle-bottom')?.addEventListener('click', () => {
      const bd = document.getElementById('bottom-dock');
      bd?.classList.toggle('collapsed');
    });

    // Palette search & filter
    document.getElementById('pal-q')?.addEventListener('input', () => this.renderPalette());
    document.getElementById('pal-biome-only')?.addEventListener('change', () => this.renderPalette());

    document.getElementById('btn-frame-start')?.addEventListener('click', () => this.centerCameraOnStart());
    document.getElementById('btn-fit-map')?.addEventListener('click', () => this.centerCameraOnStart());

    // Minimap click-to-pan
    this.minimap?.addEventListener('pointerdown', (e) => {
      if (!this.doc) return;
      const rect = this.minimap.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const tx = clamp(nx * this.doc.grid.w, 0, this.doc.grid.w);
      const ty = clamp(ny * this.doc.grid.h, 0, this.doc.grid.h);
      camera.x = isoX(tx, ty);
      camera.y = isoY(tx, ty);
    });
  }

  switchBottomTab(tabId) {
    document.querySelectorAll('[data-btab]').forEach((x) => x.classList.toggle('active', x.dataset.btab === tabId));
    ['cutscenes', 'triggers', 'validation'].forEach((id) => {
      const p = document.getElementById(`btab-${id}`);
      if (p) p.hidden = id !== tabId;
    });
    const cineTools = document.getElementById('cine-toolbar');
    if (cineTools) cineTools.hidden = tabId !== 'cutscenes';
  }

  renderPalette() {
    const catsEl = document.getElementById('pal-cats');
    const subEl = document.getElementById('pal-subbar');
    const gridEl = document.getElementById('pal-grid');
    if (!catsEl || !gridEl || !this.doc) return;

    catsEl.innerHTML = PALETTE_CATEGORIES.map((c) => `
      <button class="pcat ${this.paletteTab === c.id ? 'active' : ''}" data-pcat="${c.id}">${c.label}</button>
    `).join('');
    catsEl.querySelectorAll('[data-pcat]').forEach((b) => b.addEventListener('click', () => {
      this.paletteTab = b.dataset.pcat;
      this.renderPalette();
    }));

    const query = document.getElementById('pal-q')?.value || '';
    const biomeOnly = document.getElementById('pal-biome-only')?.checked ?? true;
    const items = getPaletteItems(this.paletteTab, { world: this.world, doc: this.doc, biomeOnly, query });

    if (subEl) {
      subEl.innerHTML = `<span>${items.length} item(s)</span><span>${resolveBiome(this.doc.meta.biomeId).name}</span>`;
    }

    gridEl.innerHTML = '';
    if (!this.activePaletteItem && items.length) this.activePaletteItem = items[0];

    for (const it of items) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `pitem ${this.activePaletteItem?.uid === it.uid ? 'active' : ''}`;
      card.title = it.name;

      const th = document.createElement('div');
      th.className = 'pth';
      let hasThumb = false;
      if (it.spr) {
        const cv = drawSpriteThumb(it.spr, 64, 54);
        if (cv) { th.appendChild(cv); hasThumb = true; }
      }
      if (!hasThumb && it.manifestId) {
        hasThumb = applyManifestThumb(th, it.manifestId);
      }
      if (!hasThumb) {
        th.innerHTML = `<span style="font-size:20px;color:var(--gold)">${it.kind === 'room_recipe' ? '🏛️' : '◆'}</span>`;
      }

      const nm = document.createElement('div');
      nm.className = 'pnm';
      nm.textContent = it.name;

      const tag = document.createElement('span');
      tag.className = 'ptag';
      tag.textContent = it.tag || '';

      card.append(th, nm, tag);
      card.addEventListener('click', () => {
        this.activePaletteItem = it;
        gridEl.querySelectorAll('.pitem').forEach((x) => x.classList.toggle('active', x === card));
        if (it.kind === 'room_recipe') {
          this.setTool('roomstamp');
        } else if (it.kind === 'autopave' || it.kind === 'floor') {
          this.state.autoPave = it.kind === 'autopave';
          if (!['brush', 'rect', 'ellipse', 'fill', 'spline'].includes(this.state.tool)) this.setTool('brush');
          else this.renderToolOptions();
        } else {
          this.setTool('brush');
        }
      });
      gridEl.appendChild(card);
    }
  }

  renderOutliner() {
    const listEl = document.getElementById('outliner-list');
    if (!listEl || !this.doc) return;
    const doc = this.doc;
    const rows = [];

    const pushGroup = (title, arr) => {
      if (!arr.length) return;
      rows.push(`<div class="out-group">${title} (${arr.length})</div>`);
      rows.push(...arr);
    };

    const mkRow = (type, idx, label, x, y) => {
      const isSel = this.state.selected && this.state.selected.type === type && this.state.selected._idx === idx;
      return `<button class="out-row ${isSel ? 'active' : ''}" data-otype="${type}" data-oidx="${idx}" data-ox="${x}" data-oy="${y}"><span>${label}</span><small>${x.toFixed(0)},${y.toFixed(0)}</small></button>`;
    };

    pushGroup('Anchors & Portals', [
      mkRow('start', 0, '🟢 Player Start', doc.entities.start[0], doc.entities.start[1]),
      ...(doc.entities.exit ? [mkRow('exit', 0, '🔵 Exit Portal', doc.entities.exit.x, doc.entities.exit.y)] : []),
      ...(doc.entities.townPortal ? [mkRow('townPortal', 0, '🌀 Town Portal', doc.entities.townPortal[0], doc.entities.townPortal[1])] : []),
    ]);

    pushGroup('Monsters & Bosses', (doc.entities.spawns || []).map((s, i) =>
      mkRow('spawn', i, `${s.rank === 'boss' || s.rank === 'raid' ? '👑' : '⚔️'} ${s.name || s.arch}${s.castKey ? ` (@${s.castKey})` : ''}`, s.x, s.y)
    ));
    pushGroup('NPCs & Vendors', (doc.entities.npcs || []).map((n, i) =>
      mkRow('npc', i, `🧑 ${n.name} (@${n.castKey || n.id})`, n.x, n.y)
    ));
    pushGroup('Trigger Zones & Marks', [
      ...(doc.entities.zones || []).map((z, i) => mkRow('zone', i, `⚡ ${z.name || z.id}`, z.x, z.y)),
      ...(doc.entities.marks || []).map((m, i) => mkRow('mark', i, `📍 ${m.name || m.id}`, m.x, m.y)),
    ]);
    pushGroup('Rooms', (doc.architecture.rooms || []).map((r, i) =>
      mkRow('room', i, `🏛️ ${r.title || r.theme || r.id}`, r.x + r.w / 2, r.y + r.h / 2)
    ));

    listEl.innerHTML = rows.join('');
    listEl.querySelectorAll('[data-otype]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.otype;
        const idx = Number(btn.dataset.oidx);
        const ox = Number(btn.dataset.ox), oy = Number(btn.dataset.oy);
        let obj = null;
        if (type === 'start') obj = doc.entities.start;
        else if (type === 'exit') obj = doc.entities.exit;
        else if (type === 'townPortal') obj = doc.entities.townPortal;
        else if (type === 'spawn') obj = doc.entities.spawns[idx];
        else if (type === 'npc') obj = doc.entities.npcs[idx];
        else if (type === 'zone') obj = doc.entities.zones[idx];
        else if (type === 'mark') obj = doc.entities.marks[idx];
        else if (type === 'room') obj = doc.architecture.rooms[idx];
        if (obj) {
          this.state.selectedCineStep = null;
          this.state.selected = { type, obj, _idx: idx };
          camera.x = isoX(ox, oy);
          camera.y = isoY(ox, oy) - 16;
          this.renderOutliner();
          this.renderInspector();
        }
      });
    });
  }

  renderScenarioSettings() {
    const wrap = document.getElementById('scenario-settings-form');
    if (!wrap || !this.doc) return;
    const { meta, grid } = this.doc;
    const pub = (meta.publish ||= { skullPortal: true, campaignPool: false, pinnedDepth: null });
    const lgt = (meta.lighting ||= { dark: 0.75, fog: '#0b0706', rain: 0, night: false });

    wrap.innerHTML = `
      <div class="fg"><label>Scenario ID (assets/scenarios/&lt;id&gt;.velscen.json)</label><input id="sc-id" type="text" value="${meta.id}"></div>
      <div class="fg"><label>Display Title</label><input id="sc-name" type="text" value="${meta.name}"></div>
      <div class="fg"><label>Description / Lore Blurb</label><textarea id="sc-blurb">${meta.blurb || ''}</textarea></div>
      <div class="fg-row">
        <div class="fg"><label>Grid Width</label><input id="sc-w" type="number" min="16" max="360" value="${grid.w}"></div>
        <div class="fg"><label>Grid Height</label><input id="sc-h" type="number" min="16" max="360" value="${grid.h}"></div>
      </div>
      <button id="sc-resize" class="mini-btn">↔ Resize Tile Grid</button>

      <div class="insp-sec">In-Game Publish Targets (Option A)</div>
      <label class="chk-line"><input id="pub-skull" type="checkbox" ${pub.skullPortal !== false ? 'checked' : ''}> 💀 Velscour Skull Menu ("HAIL VELSCOUR!")</label>
      <label class="chk-line"><input id="pub-pool" type="checkbox" ${pub.campaignPool ? 'checked' : ''}> 🎲 Eligible in Biome Rotation Pool</label>
      <div class="fg">
        <label>📌 Override Specific Campaign Depth (1–500, blank = off)</label>
        <input id="pub-depth" type="number" min="1" max="500" placeholder="e.g. 25" value="${pub.pinnedDepth ?? ''}">
      </div>

      <div class="insp-sec">Atmosphere &amp; Dynamic Lighting</div>
      <div class="fg-row">
        <div class="fg"><label>Darkness (0–1)</label><input id="lg-dark" type="number" step="0.05" min="0" max="1" value="${lgt.dark ?? 0.75}"></div>
        <div class="fg"><label>Ambient Fog Hex</label><input id="lg-fog" type="text" value="${lgt.fog || '#0b0706'}"></div>
      </div>
      <div style="display:flex;gap:12px">
        <label class="chk-line"><input id="lg-night" type="checkbox" ${lgt.night ? 'checked' : ''}> Night Sky</label>
        <label class="chk-line"><input id="lg-rain" type="checkbox" ${(lgt.rain || 0) > 0.5 ? 'checked' : ''}> Rain</label>
      </div>
    `;

    wrap.querySelector('#sc-id')?.addEventListener('change', (e) => { meta.id = slugifyId(e.target.value); e.target.value = meta.id; });
    wrap.querySelector('#sc-name')?.addEventListener('change', (e) => { meta.name = e.target.value; });
    wrap.querySelector('#sc-blurb')?.addEventListener('change', (e) => { meta.blurb = e.target.value; });
    wrap.querySelector('#pub-skull')?.addEventListener('change', (e) => { pub.skullPortal = e.target.checked; });
    wrap.querySelector('#pub-pool')?.addEventListener('change', (e) => { pub.campaignPool = e.target.checked; });
    wrap.querySelector('#pub-depth')?.addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      pub.pinnedDepth = Number.isFinite(v) && v >= 1 && v <= 500 ? v : null;
    });
    wrap.querySelector('#lg-dark')?.addEventListener('change', (e) => {
      lgt.dark = clamp(Number(e.target.value) || 0, 0, 1);
      if (this.world && this.state.showLighting) this.world.darkK = lgt.dark;
    });
    wrap.querySelector('#lg-fog')?.addEventListener('change', (e) => {
      lgt.fog = e.target.value;
      if (this.world) this.world.ambientFog = lgt.fog;
    });
    wrap.querySelector('#lg-night')?.addEventListener('change', (e) => { lgt.night = e.target.checked; if (this.world) this.world.night = lgt.night; });
    wrap.querySelector('#lg-rain')?.addEventListener('change', (e) => { lgt.rain = e.target.checked ? 1 : 0; if (this.world) this.world.raining = e.target.checked; });

    wrap.querySelector('#sc-resize')?.addEventListener('click', async () => {
      const nw = clamp(parseInt(wrap.querySelector('#sc-w').value, 10) || grid.w, 16, 360);
      const nh = clamp(parseInt(wrap.querySelector('#sc-h').value, 10) || grid.h, 16, 360);
      if (nw === grid.w && nh === grid.h) return;
      this.history.snapshot(this.doc, 'Resize Grid');
      const ow = grid.w, oh = grid.h;
      const rebuf = (ArrType, src) => {
        const dst = new ArrType(nw * nh);
        for (let y = 0; y < Math.min(oh, nh); y++) {
          for (let x = 0; x < Math.min(ow, nw); x++) dst[y * nw + x] = src[y * ow + x];
        }
        return dst;
      };
      grid.layers = {
        t: rebuf(Uint8Array, grid.layers.t),
        v: rebuf(Uint16Array, grid.layers.v),
        block: rebuf(Uint8Array, grid.layers.block),
        hgt: rebuf(Int16Array, grid.layers.hgt),
        wet: rebuf(Uint8Array, grid.layers.wet),
        waterLevel: rebuf(Float32Array, grid.layers.waterLevel),
        under: rebuf(Int16Array, grid.layers.under),
        flags: rebuf(Uint8Array, grid.layers.flags),
        deck: rebuf(Uint8Array, grid.layers.deck),
      };
      grid.w = nw; grid.h = nh;
      await this.rebuildWorld({ keepCamera: true });
      this.planView.fitToDoc(this.doc);
    });

    appendSpecialModeSettings(wrap, this.doc, this);
  }

  renderLayerList() {
    const el = document.getElementById('layer-list');
    if (!el) return;
    el.innerHTML = LAYER_DEFS.map((l) => `
      <div class="lrow">
        <button class="${this.state.layers[l.id] ? '' : 'off'}" data-lvis="${l.id}" title="Toggle Visibility">👁️</button>
        <button class="${this.state.locks[l.id] ? '' : 'off'}" data-llock="${l.id}" title="Lock Layer">🔒</button>
        <span class="lnm">${l.label}</span>
      </div>
    `).join('');
    el.querySelectorAll('[data-lvis]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.lvis;
      this.state.layers[id] = !this.state.layers[id];
      this.renderLayerList();
    }));
    el.querySelectorAll('[data-llock]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.llock;
      this.state.locks[id] = !this.state.locks[id];
      this.renderLayerList();
    }));
  }

  renderInspector() {
    const body = document.getElementById('insp-body');
    const title = document.getElementById('insp-title');
    if (!body || !title || !this.doc) return;

    if (this.state.selectedCineStep) {
      if (this.cineEditor.renderStepInspector(body, title, this.doc, this.state.selectedCineStep)) return;
    }

    const sel = this.state.selected;
    if (!sel || !sel.obj) {
      title.textContent = 'Inspector';
      body.innerHTML = `
        <div class="dim-lbl" style="line-height:1.5">
          Click any Monster, Boss, NPC, Prop, Portal, Trigger Zone, Room, or Cutscene Clip to edit its properties.<br><br>
          <b>Quick Shortcuts:</b><br>
          • <b>V</b> Select / Drag · <b>B</b> Brush · <b>E</b> Void<br>
          • <b>R</b> Rect · <b>O</b> Chamber · <b>H</b> Sculpt 3D<br>
          • <b>Z</b> Trigger Zone · <b>C</b> Cine Mark<br>
          • <b>Space+Drag</b> / Middle-Drag Pan · <b>Wheel</b> Zoom<br>
          • <b>F5</b> Spawn Hero &amp; Live Playtest
        </div>
      `;
      return;
    }

    const { type, obj } = sel;
    title.textContent = `Inspect: ${type.toUpperCase()}`;

    if (type === 'spawn') {
      const swaps = swapNames();
      body.innerHTML = `
        <div class="form-stack">
          <div class="fg"><label>Custom Name (Boss / Unique Title)</label><input id="in-name" type="text" placeholder="Default bestiary name" value="${obj.name || ''}"></div>
          <div class="fg"><label>Cutscene @castKey Handle</label><input id="in-cast" type="text" placeholder="e.g. sanctum_guardian" value="${obj.castKey || ''}"></div>
          <div class="fg-row">
            <div class="fg"><label>Archetype</label><input id="in-arch" type="text" value="${obj.arch || 'skeleton'}"></div>
            <div class="fg">
              <label>Rank</label>
              <select id="in-rank">
                ${['normal', 'champion', 'unique', 'boss', 'raid'].map((r) => `<option value="${r}" ${obj.rank === r ? 'selected' : ''}>${r}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="fg-row">
            <div class="fg"><label>Pack Count</label><input id="in-n" type="number" min="1" max="20" value="${obj.n ?? 1}"></div>
            <div class="fg">
              <label>Palette Swap</label>
              <select id="in-swap">${swaps.map((s) => `<option value="${s}" ${(obj.swap || '') === s ? 'selected' : ''}>${s || '(Default)'}</option>`).join('')}</select>
            </div>
          </div>
          <div class="fg-row">
            <div class="fg"><label>Tile X</label><input id="in-x" type="number" step="0.5" value="${obj.x}"></div>
            <div class="fg"><label>Tile Y</label><input id="in-y" type="number" step="0.5" value="${obj.y}"></div>
          </div>
          <button id="in-del" class="mini-btn danger">✕ Delete Spawn</button>
        </div>
      `;
      const apply = async () => {
        obj.name = body.querySelector('#in-name').value.trim();
        obj.castKey = slugifyId(body.querySelector('#in-cast').value).replace(/^custom_scenario$/, '');
        if (!body.querySelector('#in-cast').value.trim()) obj.castKey = '';
        obj.arch = body.querySelector('#in-arch').value.trim() || 'skeleton';
        obj.rank = body.querySelector('#in-rank').value;
        obj.n = Math.max(1, Number(body.querySelector('#in-n').value) || 1);
        obj.swap = body.querySelector('#in-swap').value || null;
        obj.x = Number(body.querySelector('#in-x').value);
        obj.y = Number(body.querySelector('#in-y').value);
        await this.rebuildWorld({ keepCamera: true });
        this.renderOutliner();
        this.refreshValidation();
      };
      body.querySelectorAll('input, select').forEach((el) => el.addEventListener('change', apply));
      body.querySelector('#in-del')?.addEventListener('click', async () => {
        this.history.snapshot(this.doc, 'Delete Spawn');
        const idx = this.doc.entities.spawns.indexOf(obj);
        if (idx >= 0) this.doc.entities.spawns.splice(idx, 1);
        this.state.selected = null;
        await this.rebuildWorld({ keepCamera: true });
        this.renderOutliner();
        this.renderInspector();
      });
    } else if (type === 'npc') {
      body.innerHTML = `
        <div class="form-stack">
          <div class="fg"><label>NPC Display Name</label><input id="in-name" type="text" value="${obj.name || ''}"></div>
          <div class="fg"><label>Cutscene @castKey Handle</label><input id="in-cast" type="text" value="${obj.castKey || ''}"></div>
          <div class="fg">
            <label>Role / Shop Vendor</label>
            <select id="in-role">
              <option value="villager" ${obj.role === 'villager' ? 'selected' : ''}>Villager / Story Actor</option>
              ${VENDORS.map((v) => `<option value="${v.id}" ${obj.role === v.id ? 'selected' : ''}>Shop: ${v.name} (${v.title})</option>`).join('')}
            </select>
          </div>
          <div class="fg">
            <label>Sprite Sheet</label>
            <select id="in-spr">
              ${TOWNSFOLK.map((f) => `<option value="${f.spriteId}" ${obj.spriteId === f.spriteId ? 'selected' : ''}>${f.name} (${f.spriteId})</option>`).join('')}
            </select>
          </div>
          <div class="fg"><label>Ambient Speech Lines (one per line)</label><textarea id="in-lines">${(obj.lines || []).join('\n')}</textarea></div>
          <button id="in-del" class="mini-btn danger">✕ Delete NPC</button>
        </div>
      `;
      const apply = async () => {
        obj.name = body.querySelector('#in-name').value.trim();
        obj.castKey = body.querySelector('#in-cast').value.trim();
        obj.role = body.querySelector('#in-role').value;
        obj.spriteId = body.querySelector('#in-spr').value;
        obj.lines = body.querySelector('#in-lines').value.split('\n').map((s) => s.trim()).filter(Boolean);
        await this.rebuildWorld({ keepCamera: true });
        this.renderOutliner();
      };
      body.querySelectorAll('input, select, textarea').forEach((el) => el.addEventListener('change', apply));
      body.querySelector('#in-del')?.addEventListener('click', async () => {
        const idx = this.doc.entities.npcs.indexOf(obj);
        if (idx >= 0) this.doc.entities.npcs.splice(idx, 1);
        this.state.selected = null;
        await this.rebuildWorld({ keepCamera: true });
        this.renderOutliner();
        this.renderInspector();
      });
    } else if (type === 'zone' || type === 'room') {
      const isZone = type === 'zone';
      body.innerHTML = `
        <div class="form-stack">
          <div class="fg"><label>${isZone ? 'Zone ID' : 'Room Title'}</label><input id="in-title" type="text" value="${(isZone ? obj.name || obj.id : obj.title) || ''}"></div>
          <div class="fg-row">
            <div class="fg"><label>X</label><input id="in-x" type="number" value="${obj.x}"></div>
            <div class="fg"><label>Y</label><input id="in-y" type="number" value="${obj.y}"></div>
          </div>
          <div class="fg-row">
            <div class="fg"><label>Width</label><input id="in-w" type="number" min="1" value="${obj.w || 6}"></div>
            <div class="fg"><label>Height</label><input id="in-h" type="number" min="1" value="${obj.h || 6}"></div>
          </div>
          <button id="in-del" class="mini-btn danger">✕ Delete ${isZone ? 'Zone' : 'Room'}</button>
        </div>
      `;
      body.querySelectorAll('input').forEach((el) => el.addEventListener('change', () => {
        if (isZone) obj.name = body.querySelector('#in-title').value;
        else obj.title = body.querySelector('#in-title').value;
        obj.x = Number(body.querySelector('#in-x').value);
        obj.y = Number(body.querySelector('#in-y').value);
        obj.w = Math.max(1, Number(body.querySelector('#in-w').value));
        obj.h = Math.max(1, Number(body.querySelector('#in-h').value));
        this.cineEditor.renderAll();
      }));
      body.querySelector('#in-del')?.addEventListener('click', () => {
        const arr = isZone ? this.doc.entities.zones : this.doc.architecture.rooms;
        const idx = arr.indexOf(obj);
        if (idx >= 0) arr.splice(idx, 1);
        this.state.selected = null;
        this.renderOutliner();
        this.renderInspector();
      });
    } else if (type === 'mark') {
      body.innerHTML = `
        <div class="form-stack">
          <div class="fg"><label>Mark ID</label><input id="in-id" type="text" value="${obj.id}"></div>
          <div class="fg"><label>Display Label</label><input id="in-name" type="text" value="${obj.name || ''}"></div>
          <div class="fg-row">
            <div class="fg"><label>Tile X</label><input id="in-x" type="number" step="0.5" value="${obj.x}"></div>
            <div class="fg"><label>Tile Y</label><input id="in-y" type="number" step="0.5" value="${obj.y}"></div>
          </div>
          <button id="in-del" class="mini-btn danger">✕ Delete Mark</button>
        </div>
      `;
      body.querySelectorAll('input').forEach((el) => el.addEventListener('change', () => {
        obj.id = slugifyId(body.querySelector('#in-id').value);
        obj.name = body.querySelector('#in-name').value;
        obj.x = Number(body.querySelector('#in-x').value);
        obj.y = Number(body.querySelector('#in-y').value);
        this.cineEditor.renderAll();
      }));
      body.querySelector('#in-del')?.addEventListener('click', () => {
        const idx = this.doc.entities.marks.indexOf(obj);
        if (idx >= 0) this.doc.entities.marks.splice(idx, 1);
        this.state.selected = null;
        this.renderOutliner();
        this.renderInspector();
      });
    } else if (type === 'exit') {
      const allB = allEditorBiomes();
      body.innerHTML = `
        <div class="form-stack">
          <label class="chk-line"><input id="ex-seal" type="checkbox" ${obj.sealed ? 'checked' : ''}> Sealed until Win / Boss Slain</label>
          <div class="fg">
            <label>Continue To Biome (optional multi-stage link)</label>
            <select id="ex-next">
              <option value="">(Standard Descent / Complete)</option>
              ${allB.map((b) => `<option value="${b.id}" ${obj.continueToBiome === b.id ? 'selected' : ''}>${b.name} (${b.id})</option>`).join('')}
            </select>
          </div>
          <div class="fg-row">
            <div class="fg"><label>Tile X</label><input id="ex-x" type="number" step="0.5" value="${obj.x}"></div>
            <div class="fg"><label>Tile Y</label><input id="ex-y" type="number" step="0.5" value="${obj.y}"></div>
          </div>
        </div>
      `;
      body.querySelectorAll('input, select').forEach((el) => el.addEventListener('change', async () => {
        obj.sealed = body.querySelector('#ex-seal').checked;
        obj.continueToBiome = body.querySelector('#ex-next').value || null;
        obj.x = Number(body.querySelector('#ex-x').value);
        obj.y = Number(body.querySelector('#ex-y').value);
        await this.rebuildWorld({ keepCamera: true });
      }));
    } else if (type === 'prop') {
      body.innerHTML = `
        <div class="form-stack">
          <div class="fg"><label>Prop Sprite</label><input type="text" value="${obj.name || obj.caveProp || ''}" disabled></div>
          <div class="fg-row">
            <div class="fg"><label>Scale (k)</label><input id="pr-k" type="number" step="0.05" min="0.1" max="2.5" value="${obj.k ?? 0.4}"></div>
            <div class="fg"><label>Light Radius</label><input id="pr-lgt" type="number" step="0.5" min="0" max="12" value="${obj.light ?? 0}"></div>
          </div>
          <label class="chk-line"><input id="pr-flip" type="checkbox" ${obj.flip ? 'checked' : ''}> Horizontal Flip</label>
          <button id="in-del" class="mini-btn danger">✕ Delete Prop</button>
        </div>
      `;
      body.querySelectorAll('input').forEach((el) => el.addEventListener('change', async () => {
        obj.k = Number(body.querySelector('#pr-k').value) || 0.4;
        obj.light = Number(body.querySelector('#pr-lgt').value) || 0;
        obj.flip = body.querySelector('#pr-flip').checked;
        await this.rebuildWorld({ keepCamera: true });
      }));
      body.querySelector('#in-del')?.addEventListener('click', async () => {
        const idx = this.doc.entities.props.indexOf(obj);
        if (idx >= 0) this.doc.entities.props.splice(idx, 1);
        this.state.selected = null;
        await this.rebuildWorld({ keepCamera: true });
        this.renderInspector();
      });
    } else {
      body.innerHTML = `<div class="dim-lbl">Selected <b>${type}</b>. Drag on the viewport to reposition.</div>`;
    }
    void BESTIARY;
  }

  refreshValidation() {
    if (!this.doc) return;
    const issues = validateScenarioDoc(this.doc);
    const cntEl = document.getElementById('val-count');
    const diagEl = document.getElementById('diag-badge');
    const btnVal = document.getElementById('btn-validate');
    const panel = document.getElementById('validation-panel');

    if (cntEl) cntEl.textContent = String(issues.length);
    if (diagEl) diagEl.textContent = String(issues.length);
    if (btnVal) {
      btnVal.classList.toggle('has-err', issues.some((i) => i.level === 'error'));
      btnVal.classList.toggle('has-warn', !issues.some((i) => i.level === 'error') && issues.some((i) => i.level === 'warn'));
    }
    if (panel) {
      panel.innerHTML = issues.length
        ? issues.map((it, idx) => `
            <div class="vcard ${it.level}">
              <div class="tcard-head">
                <b>${it.level === 'error' ? '⛔ Error' : it.level === 'warn' ? '⚠️ Warning' : 'ℹ️ Hint'} · ${it.code}</b>
                ${it.at ? `<button class="mini-btn" data-goto="${idx}">⌖ Frame</button>` : ''}
              </div>
              <span style="font-size:12.5px">${it.msg}</span>
            </div>
          `).join('')
        : '<div class="vcard info"><b>✓ All Checks Passed</b><span>Player Start is walkable, Exit is reachable, and all Cutscene/Trigger references are valid.</span></div>';

      panel.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
        const at = issues[Number(b.dataset.goto)]?.at;
        if (at) { camera.x = isoX(at[0], at[1]); camera.y = isoY(at[0], at[1]); }
      }));
    }
  }

  // ------------------------------------------------------------------ Ribbon Tools & Sub-Options
  bindRibbon() {
    document.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
    });

    document.querySelectorAll('#vp-mode-btns button').forEach((btn) => {
      btn.addEventListener('click', () => this.setViewportMode(btn.dataset.vpmode));
    });

    document.getElementById('btn-orbit3d')?.addEventListener('click', (e) => {
      const on = this.orbit.toggle(this.world);
      e.currentTarget.classList.toggle('active', on);
      const hint = document.getElementById('orbit-hint');
      if (hint) hint.hidden = !on;
    });
    document.getElementById('btn-grid')?.addEventListener('click', (e) => {
      this.state.showGrid = !this.state.showGrid;
      e.currentTarget.classList.toggle('active', this.state.showGrid);
    });
    document.getElementById('btn-heatmap')?.addEventListener('click', (e) => {
      this.state.showHeatmap = !this.state.showHeatmap;
      e.currentTarget.classList.toggle('active', this.state.showHeatmap);
    });
    document.getElementById('btn-lighting')?.addEventListener('click', (e) => {
      this.state.showLighting = !this.state.showLighting;
      e.currentTarget.classList.toggle('active', this.state.showLighting);
      if (this.world) this.world.darkK = this.state.showLighting ? (this.doc.meta.lighting?.dark ?? 0.75) : 0;
    });

    this.renderToolOptions();
  }

  setViewportMode(mode) {
    this.vpMode = mode;
    document.querySelectorAll('#vp-mode-btns button').forEach((b) => b.classList.toggle('active', b.dataset.vpmode === mode));
    const planPane = document.getElementById('plan-pane');
    const scenePane = document.getElementById('scene-pane');
    if (planPane) {
      planPane.hidden = mode === 'live';
      planPane.style.flex = mode === 'plan' ? '1 1 100%' : '0 0 42%';
    }
    if (scenePane) scenePane.hidden = mode === 'plan';
    this.resizeCanvases();
    if (mode !== 'live') this.planView.fitToDoc(this.doc);
  }

  setTool(toolId) {
    this.state.tool = toolId;
    this.state.splinePts = [];
    this.rampAnchor = null;
    document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === toolId));
    this.renderToolOptions();
  }

  renderToolOptions() {
    const el = document.getElementById('tool-options');
    if (!el) return;
    const t = this.state.tool;

    if (t === 'brush' || t === 'erase') {
      el.innerHTML = `
        <label>Size <input id="to-bsize" type="range" min="1" max="12" value="${this.state.brushSize}"> <b>${this.state.brushSize}</b></label>
        ${t === 'brush' ? `<label><input id="to-auto" type="checkbox" ${this.state.autoPave ? 'checked' : ''}> Auto-Pave</label>` : ''}
      `;
      el.querySelector('#to-bsize')?.addEventListener('input', (e) => {
        this.state.brushSize = Number(e.target.value);
        el.querySelector('b').textContent = String(this.state.brushSize);
      });
      el.querySelector('#to-auto')?.addEventListener('change', (e) => { this.state.autoPave = e.target.checked; });
    } else if (t === 'sculpt') {
      el.innerHTML = `
        <select id="to-smode">
          ${SCULPT_MODES.map((m) => `<option value="${m.id}" ${this.state.sculptMode === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}
        </select>
        <label>Radius <input id="to-bsize" type="number" min="1" max="20" value="${Math.max(2, this.state.brushSize)}" style="width:48px"></label>
        <label>Power <input id="to-spow" type="number" min="1" max="12" value="${this.state.sculptStrength}" style="width:46px"></label>
        <label>Lv <input id="to-slv" type="number" min="-80" max="160" value="${this.state.sculptTargetLv}" style="width:52px"></label>
      `;
      el.querySelector('#to-smode')?.addEventListener('change', (e) => { this.state.sculptMode = e.target.value; this.rampAnchor = null; });
      el.querySelector('#to-bsize')?.addEventListener('change', (e) => { this.state.brushSize = Number(e.target.value) || 4; });
      el.querySelector('#to-spow')?.addEventListener('change', (e) => { this.state.sculptStrength = Number(e.target.value) || 2; });
      el.querySelector('#to-slv')?.addEventListener('change', (e) => { this.state.sculptTargetLv = Number(e.target.value) || 0; });
    } else if (t === 'spline') {
      el.innerHTML = `
        <label>Width <input id="to-sw" type="number" min="1" max="10" value="${this.state.splineWidth}" style="width:48px"></label>
        <button id="to-scommit" class="mini-btn gold">✓ Carve Path (Enter)</button>
        <button id="to-sclear" class="mini-btn">Cancel</button>
      `;
      el.querySelector('#to-sw')?.addEventListener('change', (e) => { this.state.splineWidth = Number(e.target.value) || 3; });
      el.querySelector('#to-scommit')?.addEventListener('click', () => this.commitSpline());
      el.querySelector('#to-sclear')?.addEventListener('click', () => { this.state.splinePts = []; });
    } else if (t === 'roomstamp') {
      el.innerHTML = `<span>Drag a rectangle on canvas to stamp &amp; auto-furnish <b>${this.activePaletteItem?.roomTitle || 'Sanctum Chamber'}</b></span>`;
    } else {
      el.innerHTML = `<span class="dim-lbl">${t === 'select' ? 'Click object to inspect · Drag to move · Right-drag to pan' : 'Click or drag on canvas'}</span>`;
    }
  }

  commitSpline() {
    if (this.state.splinePts.length < 2) return;
    this.history.snapshot(this.doc, 'Carve Spline Path');
    paintSplinePath(this.doc, this.world, this.state.splinePts, {
      width: this.state.splineWidth,
      variant: this.activePaletteItem?.variant || 0,
      autoPave: this.state.autoPave,
    });
    this.state.splinePts = [];
    this.syncFastMapEdit({ rebuildWalls: true, schedule3D: true });
    this.refreshValidation();
  }

  // ------------------------------------------------------------------ Viewport Pointer & Keyboard Handling
  bindViewportEvents() {
    const attachCanvas = (cv, isPlan) => {
      if (!cv) return;
      cv.addEventListener('contextmenu', (e) => e.preventDefault());

      const toTile = (e) => {
        const r = cv.getBoundingClientRect();
        const sx = e.clientX - r.left, sy = e.clientY - r.top;
        return isPlan ? this.planView.screenToTile(sx, sy) : camera.screenToTile(sx, sy);
      };

      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        if (isPlan) {
          this.planView.ppu = clamp(this.planView.ppu * factor, 1.5, 36);
        } else {
          camera.zoom = clamp(camera.zoom * factor, 0.32, 3.6);
        }
      }, { passive: false });

      cv.addEventListener('pointerdown', (e) => {
        cv.focus();
        const [tx, ty] = toTile(e);
        this.state.hoverTile = [tx, ty];

        if (!isPlan && this.playtest.active) {
          this.playtest.onPointerDown(e, tx, ty);
          return;
        }

        // 3D Orbit drag on Live Scene
        if (!isPlan && this.orbit.enabled && e.button === 0) {
          this.state.panning = 'orbit';
          this.state.panOrigin = [e.clientX, e.clientY];
          cv.setPointerCapture(e.pointerId);
          return;
        }

        // Pan camera on Middle-Click, Right-Click, or Space + Left-Click
        if (e.button === 1 || e.button === 2 || this.state.spaceDown) {
          this.state.panning = isPlan ? 'plan' : 'iso';
          this.state.panOrigin = [e.clientX, e.clientY];
          this.state.camOrigin = isPlan ? [this.planView.cx, this.planView.cy] : [camera.x, camera.y];
          cv.setPointerCapture(e.pointerId);
          return;
        }

        if (e.button !== 0 || !this.doc) return;
        cv.setPointerCapture(e.pointerId);
        this.handleToolDown(tx, ty);
      });

      cv.addEventListener('pointermove', (e) => {
        const [tx, ty] = toTile(e);
        this.state.hoverTile = [tx, ty];
        this.updateStatusBar(tx, ty);

        if (!isPlan && this.playtest.active) {
          this.playtest.onPointerMove(tx, ty);
          return;
        }

        if (this.state.panning === 'orbit') {
          const dx = e.clientX - this.state.panOrigin[0];
          const dy = e.clientY - this.state.panOrigin[1];
          this.state.panOrigin = [e.clientX, e.clientY];
          this.orbit.rotateByPixels(dx, dy, this.world);
          return;
        }
        if (this.state.panning === 'iso') {
          const dx = (e.clientX - this.state.panOrigin[0]) / camera.zoom;
          const dy = (e.clientY - this.state.panOrigin[1]) / camera.zoom;
          camera.x = this.state.camOrigin[0] - dx;
          camera.y = this.state.camOrigin[1] - dy;
          return;
        }
        if (this.state.panning === 'plan') {
          const dx = (e.clientX - this.state.panOrigin[0]) / this.planView.ppu;
          const dy = (e.clientY - this.state.panOrigin[1]) / this.planView.ppu;
          this.planView.cx = this.state.camOrigin[0] - dx;
          this.planView.cy = this.state.camOrigin[1] - dy;
          return;
        }

        this.handleToolMove(tx, ty);
      });

      cv.addEventListener('pointerup', () => {
        if (!isPlan && this.playtest.active) {
          this.playtest.onPointerUp();
          return;
        }
        if (this.state.panning) {
          this.state.panning = false;
          return;
        }
        this.handleToolUp();
      });

      cv.addEventListener('dblclick', () => {
        if (this.state.tool === 'spline') this.commitSpline();
      });
    };

    attachCanvas(this.canvas, false);
    attachCanvas(document.getElementById('plan-canvas'), true);
    window.addEventListener('resize', () => this.resizeCanvases());
  }

  handleToolDown(tx, ty) {
    const doc = this.doc;
    const t = this.state.tool;

    // 2-Click Naval Boarding Plank mode
    if (this.plankMode && doc.meta.category === 'naval') {
      if (!this.plankStart) {
        this.plankStart = [Math.round(tx * 10) / 10, Math.round(ty * 10) / 10];
        this.toast('Plank start set — click destination ship deck tile.');
      } else {
        this.history.snapshot(doc, 'Add Boarding Plank');
        const to = [Math.round(tx * 10) / 10, Math.round(ty * 10) / 10];
        doc.grid.naval.planks.push({ from: this.plankStart, to, w: 1.4 });
        seaPlank(this.plankStart, to, 1.4);
        joinDecks(this.world.map, this.plankStart, to, 2, 1);
        seaMapChanged(this.world.map);
        doc.grid.layers.t.set(this.world.map.t);
        doc.grid.layers.block.set(this.world.map.block);
        if (this.world.map.hgt) doc.grid.layers.hgt.set(this.world.map.hgt);
        this.plankMode = false;
        this.plankStart = null;
        this.refreshBanner();
        this.toast('Boarding plank linked!');
      }
      return;
    }

    if (t === 'select') {
      const hit = pickSceneObjectAt(doc, tx, ty);
      this.state.selectedCineStep = null;
      this.state.selected = hit;
      this.state.draggingObject = !!hit;
      if (hit) this.history.snapshot(doc, `Move ${hit.type}`);
      this.renderOutliner();
      this.renderInspector();
      return;
    }

    if (t === 'mark') {
      this.history.snapshot(doc, 'Place Mark');
      const idx = (doc.entities.marks?.length || 0) + 1;
      const mk = { id: `mk_${idx}`, name: `Mark ${idx}`, x: Math.round(tx * 10) / 10, y: Math.round(ty * 10) / 10 };
      doc.entities.marks.push(mk);
      this.state.selected = { type: 'mark', obj: mk };
      this.renderOutliner();
      this.renderInspector();
      return;
    }

    if (t === 'spline') {
      this.state.splinePts.push([tx, ty]);
      return;
    }

    if (['rect', 'ellipse', 'roomstamp', 'zone'].includes(t)) {
      this.state.dragStart = [tx, ty];
      return;
    }

    if (t === 'fill') {
      if (this.state.locks.terrain) return;
      this.history.snapshot(doc, 'Flood Fill');
      if (floodFillTiles(doc, this.world, tx, ty, { variant: this.activePaletteItem?.variant || 0, autoPave: this.state.autoPave })) {
        this.syncFastMapEdit({ rebuildWalls: true, schedule3D: true });
        this.refreshValidation();
      }
      return;
    }

    if (t === 'sculpt') {
      if (this.state.locks.terrain) return;
      if (this.state.sculptMode === 'ramp') {
        if (!this.rampAnchor) {
          this.rampAnchor = [tx, ty];
          this.toast('Ramp start anchored — click second point to grade slope.');
        } else {
          this.history.snapshot(doc, 'Grade 3D Ramp');
          applyRampGrade(doc, this.rampAnchor, [tx, ty], { width: Math.max(2, this.state.brushSize) });
          this.rampAnchor = null;
          this.rebuildWorld({ keepCamera: true });
          this.refreshValidation();
        }
        return;
      }
      this.history.snapshot(doc, `Sculpt ${this.state.sculptMode}`);
      this.state.painting = true;
      if (applySculptBrush(doc, tx, ty, {
        mode: this.state.sculptMode,
        radius: Math.max(2, this.state.brushSize),
        strength: this.state.sculptStrength,
        targetLv: this.state.sculptTargetLv,
        waterDepth: this.state.waterDepth,
      })) {
        this.syncFastMapEdit({ rebuildWalls: false, schedule3D: true });
      }
      return;
    }

    if (t === 'erase') {
      if (this.state.locks.terrain) return;
      this.history.snapshot(doc, 'Carve Void');
      this.state.painting = true;
      if (paintFloorBrush(doc, this.world, tx, ty, { radius: this.state.brushSize, erase: true })) {
        this.syncFastMapEdit({ rebuildWalls: true, schedule3D: true });
      }
      return;
    }

    if (t === 'brush') {
      const it = this.activePaletteItem;
      if (!it || it.kind === 'floor' || it.kind === 'autopave') {
        if (this.state.locks.terrain) return;
        this.history.snapshot(doc, 'Paint Floor');
        this.state.painting = true;
        if (paintFloorBrush(doc, this.world, tx, ty, {
          radius: this.state.brushSize,
          variant: it?.variant || 0,
          autoPave: it ? it.kind === 'autopave' || this.state.autoPave : true,
        })) {
          this.syncFastMapEdit({ rebuildWalls: true, schedule3D: true });
        }
        return;
      }
      this.placePaletteEntityAt(tx, ty, it);
    }
  }

  async placePaletteEntityAt(tx, ty, it) {
    const doc = this.doc;
    const rx = Math.round(tx * 2) / 2, ry = Math.round(ty * 2) / 2;
    this.history.snapshot(doc, `Place ${it.name}`);

    if (it.kind === 'torch' || it.kind === 'hanging') {
      if (!snapWallMount(doc, this.world, tx, ty, it)) {
        this.toast('Click closer to a back-facing dungeon wall segment.');
        return;
      }
    } else if (it.kind === 'opening') {
      placeOpeningAt(doc, tx, ty, it);
    } else if (it.kind === 'prop' || it.kind === 'caveProp') {
      doc.entities.props.push({
        id: `pr_${Date.now().toString(36)}`,
        kind: it.kind === 'caveProp' ? 'caveProp' : 'scatter',
        name: it.propName || it.caveProp,
        caveProp: it.caveProp || null,
        m: 0,
        x: rx,
        y: ry,
        z: 0,
        k: it.kind === 'caveProp' ? 1 : (this.world?.tileset?.k || 0.4),
        flip: false,
        light: /brazier|candel|torch|lantern|censer|fire/.test(it.propName || '') ? 3.2 : 0,
        tree: !!it.tree,
      });
      if (it.block) {
        const ix = clamp(Math.floor(rx), 0, doc.grid.w - 1), iy = clamp(Math.floor(ry), 0, doc.grid.h - 1);
        doc.grid.layers.block[iy * doc.grid.w + ix] = 1;
      }
    } else if (it.kind === 'building') {
      doc.architecture.buildings.push({
        id: `bld_${Date.now().toString(36)}`,
        kind: it.bldKind,
        x: Math.floor(tx) - 1,
        y: Math.floor(ty) - 1,
        w: 3,
        h: 3,
        flip: false,
      });
    } else if (it.kind === 'spawn') {
      const sp = {
        id: `sp_${Date.now().toString(36)}`,
        castKey: it.rank === 'boss' || it.rank === 'raid' ? slugifyId(it.name).slice(0, 24) : '',
        x: rx,
        y: ry,
        arch: it.arch,
        rank: it.rank,
        n: it.n || 1,
        art: it.art || null,
        swap: null,
        name: it.rank === 'boss' || it.rank === 'raid' ? it.name.replace(/\s*\(.*\)$/, '') : '',
      };
      doc.entities.spawns.push(sp);
      this.state.selected = { type: 'spawn', obj: sp };
    } else if (it.kind === 'npc') {
      const np = {
        id: `npc_${Date.now().toString(36)}`,
        castKey: slugifyId(it.npcName).slice(0, 20),
        role: it.role,
        spriteId: it.spriteId,
        name: it.npcName,
        x: rx,
        y: ry,
        lines: [],
      };
      doc.entities.npcs.push(np);
      this.state.selected = { type: 'npc', obj: np };
    } else if (it.kind === 'marker_start') {
      doc.entities.start = [rx, ry];
    } else if (it.kind === 'marker_exit') {
      doc.entities.exit.x = rx; doc.entities.exit.y = ry;
    } else if (it.kind === 'marker_town') {
      doc.entities.townPortal = [rx, ry];
    } else if (it.kind === 'interactable') {
      doc.entities.interactables.push({
        id: `ch_${Date.now().toString(36)}`,
        kind: 'chest',
        subType: it.subType || 'standard',
        x: rx,
        y: ry,
        label: it.subType === 'shrine' ? 'Ancient Plaque' : '',
      });
    } else if (it.kind === 'naval_ship') {
      if (doc.meta.category !== 'naval') {
        this.toast('Switch Scenario Type to "Naval Battle (Pirate Seas)" to place 3D fleet ships.');
        return;
      }
      doc.grid.naval ||= { ships: [], planks: [] };
      doc.grid.naval.ships.push({
        id: `ship_${Date.now().toString(36)}`,
        kind: it.shipKind,
        x: Math.round(tx * 10) / 10,
        y: Math.round(ty * 10) / 10,
        heading: 0,
        walkableDeck: !!it.walkableDeck,
        autoBake: true,
      });
    }

    await this.rebuildWorld({ keepCamera: true });
    if (doc.meta.category === 'naval' && it.kind === 'naval_ship' && it.walkableDeck) {
      bakeAllNavalDecks(doc, this.world);
    }
    this.renderOutliner();
    this.renderInspector();
    this.refreshValidation();
  }

  handleToolMove(tx, ty) {
    const doc = this.doc;
    if (!doc) return;

    if (this.state.draggingObject && this.state.selected) {
      const { type, obj } = this.state.selected;
      const rx = Math.round(tx * 2) / 2, ry = Math.round(ty * 2) / 2;
      if (type === 'start' || type === 'townPortal') { obj[0] = rx; obj[1] = ry; }
      else if (type === 'zone' || type === 'room') { obj.x = Math.floor(tx - (obj.w || 4) / 2); obj.y = Math.floor(ty - (obj.h || 4) / 2); }
      else if (obj && typeof obj.x === 'number') { obj.x = rx; obj.y = ry; }
      return;
    }

    if (!this.state.painting) return;
    const t = this.state.tool;
    if (t === 'brush') {
      const it = this.activePaletteItem;
      if (paintFloorBrush(doc, this.world, tx, ty, {
        radius: this.state.brushSize,
        variant: it?.variant || 0,
        autoPave: it ? it.kind === 'autopave' || this.state.autoPave : true,
      })) {
        this.syncFastMapEdit({ rebuildWalls: true });
      }
    } else if (t === 'erase') {
      if (paintFloorBrush(doc, this.world, tx, ty, { radius: this.state.brushSize, erase: true })) {
        this.syncFastMapEdit({ rebuildWalls: true });
      }
    } else if (t === 'sculpt') {
      if (applySculptBrush(doc, tx, ty, {
        mode: this.state.sculptMode,
        radius: Math.max(2, this.state.brushSize),
        strength: this.state.sculptStrength,
        targetLv: this.state.sculptTargetLv,
        waterDepth: this.state.waterDepth,
      })) {
        this.syncFastMapEdit({ rebuildWalls: false, schedule3D: true });
      }
    }
  }

  async handleToolUp() {
    if (this.state.draggingObject) {
      this.state.draggingObject = false;
      await this.rebuildWorld({ keepCamera: true });
      this.renderOutliner();
      this.renderInspector();
      this.refreshValidation();
      return;
    }

    if (this.state.painting) {
      this.state.painting = false;
      if (['3d_caverns', '3d_alpine', '3d_dunes', 'breach'].includes(this.doc?.meta?.category)) {
        clearTimeout(this._rebuildTimer);
        await this.rebuildWorld({ keepCamera: true });
      }
      this.refreshValidation();
      return;
    }

    if (this.state.dragStart && this.state.hoverTile) {
      const p0 = this.state.dragStart, p1 = this.state.hoverTile;
      this.state.dragStart = null;
      const t = this.state.tool;
      const x0 = Math.floor(Math.min(p0[0], p1[0])), y0 = Math.floor(Math.min(p0[1], p1[1]));
      const rw = Math.max(1, Math.ceil(Math.max(p0[0], p1[0])) - x0);
      const rh = Math.max(1, Math.ceil(Math.max(p0[1], p1[1])) - y0);

      if (t === 'rect' || t === 'ellipse') {
        this.history.snapshot(this.doc, t === 'ellipse' ? 'Carve Chamber' : 'Carve Rect');
        paintShapeRegion(this.doc, this.world, p0, p1, {
          ellipse: t === 'ellipse',
          variant: this.activePaletteItem?.variant || 0,
          autoPave: this.state.autoPave,
        });
        this.syncFastMapEdit({ rebuildWalls: true, schedule3D: true });
      } else if (t === 'roomstamp') {
        this.history.snapshot(this.doc, 'Stamp Themed Room');
        stampThemedRoom(this.doc, this.world, { x: x0, y: y0, w: Math.max(5, rw), h: Math.max(5, rh) }, {
          theme: this.activePaletteItem?.theme || 'chapel',
          title: this.activePaletteItem?.roomTitle || 'Sanctum Chamber',
        });
        await this.rebuildWorld({ keepCamera: true });
        this.renderOutliner();
      } else if (t === 'zone') {
        this.history.snapshot(this.doc, 'Create Trigger Zone');
        const idx = (this.doc.entities.zones?.length || 0) + 1;
        const z = { id: `z_zone_${idx}`, name: `Trigger Zone #${idx}`, shape: 'rect', x: x0, y: y0, w: Math.max(2, rw), h: Math.max(2, rh), color: '#ff9a40' };
        this.doc.entities.zones.push(z);
        this.state.selected = { type: 'zone', obj: z };
        this.cineEditor.renderAll();
        this.renderOutliner();
        this.renderInspector();
      }
      this.refreshValidation();
    }
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'F5') {
        e.preventDefault();
        this.togglePlaytest();
        return;
      }

      if (this.playtest.active && !typing) {
        if (this.playtest.onKeyDown(e)) e.preventDefault();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveScenarioToServer();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        document.getElementById('btn-undo')?.click();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        document.getElementById('btn-redo')?.click();
        return;
      }

      if (typing) return;

      if (e.key === ' ') { this.state.spaceDown = true; e.preventDefault(); return; }
      if (e.key === 'Enter' && this.state.tool === 'spline') { this.commitSpline(); return; }
      if (e.key === 'Escape') {
        this.plankMode = false; this.plankStart = null; this.rampAnchor = null;
        this.state.splinePts = [];
        this.cineEditor.stopPreview();
        this.closeModal();
        this.refreshBanner();
        return;
      }

      const keyTool = {
        v: 'select', b: 'brush', e: 'erase', r: 'rect', o: 'ellipse',
        f: 'fill', l: 'spline', m: 'roomstamp', h: 'sculpt', z: 'zone', c: 'mark',
      }[e.key.toLowerCase()];
      if (keyTool) this.setTool(keyTool);
      if (e.key.toLowerCase() === 'g') document.getElementById('btn-grid')?.click();
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') this.state.spaceDown = false;
      if (this.playtest.active) this.playtest.onKeyUp(e);
    });
  }

  updateStatusBar(tx, ty) {
    if (!this.doc) return;
    const { w, h, layers } = this.doc.grid;
    const ix = clamp(Math.floor(tx), 0, w - 1), iy = clamp(Math.floor(ty), 0, h - 1);
    const i = iy * w + ix;
    document.getElementById('st-coords').textContent = `Tile: (${tx.toFixed(1)}, ${ty.toFixed(1)})`;
    document.getElementById('st-elev').textContent = `Elev: ${layers.hgt[i]} lv`;
    document.getElementById('st-tileinfo').textContent = layers.wet[i]
      ? `Water (${layers.wet[i] === 2 ? 'Deep' : 'Shallow'})`
      : layers.t[i] ? `Floor #${layers.v[i]}${layers.block[i] ? ' [Blocked]' : ''}` : 'Void';
    document.getElementById('st-counts').textContent = `Spawns: ${this.doc.entities.spawns.length} · Props: ${this.doc.entities.props.length}`;
    document.getElementById('st-zoom').textContent = `Zoom: ${Math.round(camera.zoom * 100)}%`;
  }

  // ------------------------------------------------------------------ Render Loop & Minimap
  resizeCanvases() {
    const cv = this.canvas;
    if (!cv || cv.offsetParent === null) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(64, cv.clientWidth || 800);
    const ch = Math.max(64, cv.clientHeight || 500);
    G.W = cw;
    G.H = ch;
    G.dpr = dpr;
    const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
  }

  drawStudioMinimap() {
    const cv = this.minimap;
    const doc = this.doc;
    if (!cv || !doc) return;
    const c = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    c.fillStyle = '#070504';
    c.fillRect(0, 0, W, H);

    const { w, h, layers } = doc.grid;
    const sx = W / w, sy = H / h;
    const step = Math.max(1, Math.floor(Math.max(w, h) / 140));
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = y * w + x;
        if (!layers.t[i] && !layers.wet[i]) continue;
        c.fillStyle = layers.wet[i] ? '#2e72a8' : layers.block[i] ? '#6b2f24' : '#7a654a';
        c.fillRect(x * sx, y * sy, Math.max(1.2, sx * step), Math.max(1.2, sy * step));
      }
    }
    const dot = (tx, ty, col, r = 3) => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(tx * sx, ty * sy, r, 0, Math.PI * 2);
      c.fill();
    };
    for (const s of doc.entities.spawns) dot(s.x, s.y, s.rank === 'boss' ? '#ff9a2e' : '#e04030', s.rank === 'boss' ? 3.2 : 2);
    dot(doc.entities.start[0], doc.entities.start[1], '#7fd36a', 3.5);
    if (doc.entities.exit) dot(doc.entities.exit.x, doc.entities.exit.y, '#40a0ff', 3.5);

    const [cx, cy] = camera.screenToTile(G.W / 2, G.H / 2);
    c.strokeStyle = '#ffe2a0';
    c.lineWidth = 1.2;
    c.strokeRect(cx * sx - 10, cy * sy - 7, 20, 14);
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, Math.max(0.001, (now - this._lastT) / 1000));
    this._lastT = now;
    this.fps = this.fps * 0.9 + (1 / dt) * 0.1;
    G.dt = dt;
    G.time = (G.time || 0) + dt;
    G.frame = (G.frame || 0) + 1;

    try {
      if (G.frame % 20 === 0) {
        const fpsEl = document.getElementById('st-fps');
        if (fpsEl) fpsEl.textContent = `${Math.round(this.fps)} FPS`;
        this.drawStudioMinimap();
      }

      if (this.vpMode !== 'live') {
        this.planView.render(this.doc, this.world, this.state);
      }

      if (this.vpMode !== 'plan' && this.world) {
        this.resizeCanvases();

        if (this.playtest.active) {
          this.playtest.update(dt);
          renderWorld(this.ctx, this.world);
          this.playtest.drawPlaytestHud(this.ctx);
        } else {
          // Editor preview tick (lights, torches, 3D water/flames, and optional Cine preview)
          G.hurtFlash = 0;
          if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 3.5);
          lights.length = 0;
          this.world.ambientLights();
          if (this.state.showLighting) {
            const [cx, cy] = camera.screenToTile(G.W / 2, G.H / 2);
            addLight(cx, cy, 11, '#ffe4c0', 0.85, 28);
          }
          Cine.update(dt);
          camera.update(dt);
          if (G.cine) this.world.customDirector?.tickScripted(dt);
          updateVfx(dt);
          this.world.cave?.frame?.(dt);
          this.world.tower?.frame?.(dt);

          renderWorld(this.ctx, this.world);

          if (!G.cine) {
            if (this.state.showHeatmap) drawWalkabilityHeatmap(this.ctx, this.doc);
            drawEditorOverlays(this.ctx, this.doc, this.world, this.state);
          }
        }
      }
    } catch (err) {
      if ((this._errLogCnt = (this._errLogCnt || 0) + 1) <= 5) {
        console.error('[Studio Frame Error]', err);
      }
    }
  }
}

const studio = new VelscourStudio();
window.__STUDIO__ = studio;
studio.init().catch((err) => {
  console.error('[Studio] Fatal initialization error:', err);
});
