// Airship-Style Cutscene Director UI: Multi-Track Visual Timeline, Declarative Step Inspector,
// Procedural Blip-Voice Auditioner, Live Viewport Preview, and Party Lock-and-Play Trigger Manager.
import { G } from '../../src/state.js';
import { Cine } from '../../src/game/cinema.js';
import { auditionVoice } from '../../src/game/cutscenerunner.js';
import { camera } from '../../src/core/view.js';
import { Player } from '../../src/game/player.js';
import { newCharData } from '../../src/game/save.js';
import { AIR_CAPTAINS } from '../../src/data/airpirates.js';

const TRIGGER_EVENTS = [
  { id: 'onArrival', label: '🚪 On Floor Arrival' },
  { id: 'onEnterZone', label: '⚡ On Player Enter Zone' },
  { id: 'onExitZone', label: '↩ On Player Exit Zone' },
  { id: 'onInteract', label: '🖐️ On Interact (NPC / Shrine / Chest)' },
  { id: 'onBossAwake', label: '👁️ On Boss / Cast Awakened' },
  { id: 'onBossHpBelow', label: '🩸 On Boss HP Below %' },
  { id: 'onEntityDeath', label: '💀 On Cast Entity Slain' },
  { id: 'onScenarioWin', label: '🏆 On Objectives Completed' },
];

const OBJECTIVE_KINDS = [
  { id: 'kill_bosses', label: 'Slay All Bosses' },
  { id: 'kill_cast', label: 'Slay Specific @castKey' },
  { id: 'kill_all', label: 'Clear All Hostiles' },
  { id: 'reach_zone', label: 'Reach Spatial Zone' },
];

const STEP_TYPE_OPTIONS = [
  ['cam', '🎥 Camera Shot / Framing'],
  ['say', '💬 Dialogue Line & Voice'],
  ['card', '🪧 Title / Chapter Card'],
  ['walk', '🚶 Actor Walk / Move'],
  ['vfx', '✨ Visual Effect (Ring / Column / Sparkle)'],
  ['shake', '📳 Camera Screen Shake'],
  ['door', '🚪 Open Door / Unseal Exit'],
  ['spawn', '⚔️ Spawn Ambush Pack'],
  ['emote', '😠 Overhead Actor Emote'],
  ['sfx', '🔊 Sound Effect'],
  ['music', '🎵 Change Music Track'],
  ['wait', '⏱️ Timed Pause (Wait)'],
  ['until_arrived', '⏳ Wait Until Walks Finish'],
  ['until_cleared', '⏳ Wait Until Hostiles Cleared'],
  ['sky_skiff', '🛥️ Airship: Boarding Skiff / Rope-Drop'],
  ['sky_flagship', '🚢 Airship: Enemy Flagship Arrival / Exit'],
  ['sky_hooks', '🪝 Airship: Grappling Hooks & Lash Ships'],
  ['sky_volley', '💥 Airship: Broadside Volley / Captain Boards'],
];

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function describeStepKeyframe(st) {
  const type = st?.type || 'wait';
  if (type === 'cam') {
    const modeTitle = st.mode === 'return_hero'
      ? 'Return Hero'
      : st.mode === 'actor'
        ? `@${st.who || 'hero'} (${st.zoom ?? 1.4}×)`
        : st.mode === 'fit'
          ? `Fit ${(st.actors || ['hero']).join(',')}`
          : st.markId ? `📍 ${st.markId}` : `(${st.x ?? 0}, ${st.y ?? 0})`;
    const dur = Number(st.dur ?? 1.2) || 1.2;
    return { cls: 'cam', icon: '🎥', title: modeTitle, sub: `${dur.toFixed(1)}s · ${st.ease || 'io'}`, dur, blocks: st.wait !== false };
  }
  if (type === 'say') {
    const raw = (st.text || '…').trim();
    const est = Math.max(1.4, Math.min(5.2, raw.length * 0.045));
    return { cls: 'say', icon: '💬', title: st.customName || `@${st.who || 'hero'}`, sub: raw, dur: est, blocks: true };
  }
  if (type === 'card') {
    const dur = Number(st.dur ?? 2.6) || 2.6;
    return { cls: 'card', icon: '🪧', title: st.title || 'TITLE CARD', sub: `${st.sub ? `${st.sub} · ` : ''}${dur.toFixed(1)}s`, dur, blocks: !!st.block };
  }
  if (type === 'walk') {
    const dur = Number(st.dur ?? 1.4) || 1.4;
    const dest = st.markId ? `📍${st.markId}` : `(${st.x ?? 0},${st.y ?? 0})`;
    return { cls: 'walk', icon: '🚶', title: `@${st.who || 'hero'}`, sub: `→ ${dest} · ${dur.toFixed(1)}s`, dur, blocks: st.wait !== false };
  }
  if (type === 'wait' || type === 'until_arrived' || type === 'until_cleared') {
    const dur = type === 'wait' ? (Number(st.dur ?? 1.0) || 1.0) : 0.8;
    const title = type === 'wait' ? 'Wait' : type === 'until_arrived' ? 'Until Arrived' : 'Until Cleared';
    const sub = type === 'wait' ? `${dur.toFixed(1)}s pause` : 'Hold sequence';
    return { cls: 'wait', icon: type === 'wait' ? '⏱️' : '⏳', title, sub, dur, blocks: true };
  }
  if (type === 'sky_skiff') {
    const kindLbl = st.boatKind === 'flyover' ? 'Gasbag Rope-Drop' : `${st.boatKind || 'cutter'} (${st.dock || 'auto'})`;
    return { cls: 'act', icon: '🛥️', title: `Skiff: ${kindLbl}`, sub: `${st.count ?? 4}× boarders`, dur: st.wait !== false ? 3.2 : 0.4, blocks: st.wait !== false };
  }
  if (type === 'sky_flagship') {
    const act = st.action || 'arrive';
    const dur = Number(st.dur) || 3.2;
    return { cls: 'act', icon: '🚢', title: act === 'depart' ? 'Flagship Sinks' : 'Flagship Alongside', sub: act === 'arrive' ? `${dur.toFixed(1)}s approach` : act, dur: st.wait !== false && act === 'arrive' ? dur : 0.5, blocks: st.wait !== false && act === 'arrive' };
  }
  if (type === 'sky_hooks') {
    const act = st.action || 'throw_and_lash';
    const cnt = Number(st.count ?? 4);
    return { cls: 'act', icon: '🪝', title: act === 'release' ? 'Unhook Chains' : 'Grapple & Lash', sub: act === 'release' ? 'Drop chains' : `${cnt}× iron chains`, dur: st.wait !== false && act !== 'release' ? 1.5 : 0.4, blocks: st.wait !== false && act !== 'release' };
  }
  if (type === 'sky_volley') {
    const act = st.action || 'flagship_volley';
    const title = act === 'captain_swing' ? 'Captain Swings!' : act === 'captain_leap' ? 'Captain Leaps!' : act === 'ironclad_volley' ? 'Return Broadside' : 'Flagship Volley';
    const sub = act.startsWith('captain_') ? (st.captainId || 'ap_admiral_veyl').replace(/^ap_/, '') : `${st.count ?? 4}× cannon shots`;
    return { cls: 'act', icon: act.startsWith('captain_') ? '⚔️' : '💥', title, sub, dur: st.wait ? 1.6 : 0.5, blocks: !!st.wait };
  }
  const actMap = {
    vfx: ['✨', `VFX: ${st.vfx || 'ring'}`, st.who ? `@${st.who}` : `(${st.x ?? 0},${st.y ?? 0})`],
    shake: ['📳', 'Screen Shake', `${st.px ?? 7}px`],
    sfx: ['🔊', `SFX: ${st.sound || 'boss'}`, 'Audio cue'],
    music: ['🎵', `Music: ${st.music || 'boss'}`, 'Switch BGM'],
    door: ['🚪', st.target === 'exit' ? 'Unseal Exit' : `Door #${st.doorIndex ?? 0}`, 'Portal / Gate'],
    spawn: ['⚔️', `Spawn ${st.n ?? 3}× ${st.arch || 'foe'}`, `(${st.x ?? 0},${st.y ?? 0})`],
    emote: ['😠', `Emote: ${st.emotion || 'alert'}`, `@${st.who || 'hero'}`],
  };
  const [icon, title, sub] = actMap[type] || ['🎭', type, 'Stage cue'];
  return { cls: 'act', icon, title, sub, dur: Number(st.dur ?? 0.4) || 0.4, blocks: false };
}

function collectCastOptions(doc) {
  const out = [{ key: 'hero', label: 'Hero (Player Paperdoll)' }];
  if (doc?.meta?.category === 'airship') {
    for (const av of doc.grid?.airship?.vessels || []) {
      if (av.castKey) out.push({ key: av.castKey, label: `⛵ @${av.castKey} (${av.name || av.kind})` });
    }
    out.push(
      { key: 'flagship', label: '🚢 @flagship (Active Flagship)' },
      { key: 'skiff', label: '🛥️ @skiff (Latest Boarding Skiff)' },
      { key: 'gate', label: '🚪 @gate (Ironclad Bridge Gate)' },
    );
  }
  for (const s of doc.entities?.spawns || []) {
    if (s.castKey) out.push({ key: s.castKey, label: `@${s.castKey} (${s.name || s.arch})` });
  }
  for (const n of doc.entities?.npcs || []) {
    if (n.castKey) out.push({ key: n.castKey, label: `@${n.castKey} (${n.name || n.role})` });
  }
  return out;
}

export class CutsceneEditorController {
  constructor(studio) {
    this.studio = studio;
    this.activeCineId = null;
    this.previewing = false;
    this.savedCam = null;
    this.tempHero = null;
  }

  currentCutscene(doc) {
    if (!doc?.cutscenes?.length) return null;
    let c = doc.cutscenes.find((x) => x.id === this.activeCineId);
    if (!c) {
      c = doc.cutscenes[0];
      this.activeCineId = c.id;
    }
    return c;
  }

  syncSelectedStepRef(cine) {
    const cur = this.studio.state.selectedCineStep;
    if (!cur || !cine?.steps?.length) return null;
    if (cine.steps.includes(cur)) return cur;
    const match = cur.id ? cine.steps.find((s) => s.id === cur.id) : null;
    this.studio.state.selectedCineStep = match || null;
    return this.studio.state.selectedCineStep;
  }

  bindToolbar() {
    const { studio } = this;
    document.getElementById('sel-cutscene')?.addEventListener('change', (e) => {
      this.activeCineId = e.target.value;
      studio.state.selectedCineStep = null;
      this.renderAll();
      studio.renderInspector();
    });

    document.getElementById('btn-add-cine')?.addEventListener('click', () => {
      const doc = studio.doc;
      studio.history.snapshot(doc, 'Add Cutscene');
      const idx = (doc.cutscenes?.length || 0) + 1;
      const id = `cine_scene_${idx}_${Date.now().toString(36).slice(-3)}`;
      const bossCast = (doc.entities.spawns || []).find((s) => s.castKey)?.castKey || 'hero';
      const created = {
        id,
        name: `Cutscene #${idx}`,
        allowFastForward: true,
        steps: [
          { id: `st_${Date.now()}_1`, type: 'cam', mode: 'actor', who: bossCast, zoom: 2.0, dur: 1.1, ease: 'io', push: 0.02, wait: true },
          { id: `st_${Date.now()}_2`, type: 'say', who: bossCast, text: 'You dare cross into my domain, {hero}?', autoFrame: true, voice: { pitch: 0.72, wave: 'sawtooth' } },
          { id: `st_${Date.now()}_3`, type: 'cam', mode: 'return_hero', dur: 0.8, wait: true },
        ],
      };
      doc.cutscenes.push(created);
      this.activeCineId = id;
      studio.state.selectedCineStep = created.steps[1];
      this.renderAll();
      studio.renderInspector();
      studio.refreshValidation();
    });

    document.getElementById('btn-del-cine')?.addEventListener('click', () => {
      const doc = studio.doc;
      if (!doc.cutscenes?.length) return;
      studio.history.snapshot(doc, 'Delete Cutscene');
      const idx = doc.cutscenes.findIndex((c) => c.id === this.activeCineId);
      if (idx >= 0) doc.cutscenes.splice(idx, 1);
      this.activeCineId = doc.cutscenes[0]?.id || null;
      studio.state.selectedCineStep = null;
      this.renderAll();
      studio.renderInspector();
      studio.refreshValidation();
    });

    document.getElementById('btn-cine-play')?.addEventListener('click', () => this.playPreview());
    document.getElementById('btn-preview-cine')?.addEventListener('click', () => this.playPreview());
    document.getElementById('btn-cine-stop')?.addEventListener('click', () => this.stopPreview());
  }

  addStep(kind) {
    const doc = this.studio.doc;
    let cine = this.currentCutscene(doc);
    this.studio.history.snapshot(doc, `Add ${kind} Keyframe`);
    if (!cine) {
      cine = { id: 'cine_main', name: 'Main Cutscene', allowFastForward: true, steps: [] };
      doc.cutscenes.push(cine);
      this.activeCineId = cine.id;
    }
    const id = `st_${Date.now().toString(36)}_${(cine.steps.length + 1)}`;
    const [sx, sy] = doc.entities.start || [28, 28];
    let step;
    if (kind === 'cam') {
      step = { id, type: 'cam', mode: 'actor', who: 'hero', zoom: 1.8, dur: 1.1, ease: 'io', push: 0.02, wait: true };
    } else if (kind === 'say') {
      step = { id, type: 'say', who: 'hero', text: 'Stand ready — something stirs ahead.', autoFrame: true, voice: { pitch: 1.0, wave: 'square' } };
    } else if (kind === 'card') {
      step = { id, type: 'card', title: doc.meta.name.toUpperCase(), sub: 'Act Set-Piece', dur: 2.6, block: false };
    } else if (kind === 'walk') {
      const mk = doc.entities.marks?.[0];
      step = { id, type: 'walk', who: 'hero', markId: mk?.id || '', x: Math.round(sx), y: Math.round(sy - 3), dur: 1.4, pathfind: true, wait: true };
    } else if (kind === 'vfx') {
      step = { id, type: 'vfx', vfx: 'ring', who: 'hero', x: Math.round(sx), y: Math.round(sy), radius: 3.5, dur: 0.9, color: '#ffb060' };
    } else if (kind === 'sky_skiff') {
      step = { id, type: 'sky_skiff', boatKind: 'cutter', dock: 'mid', count: 4, rank: 'normal', captainId: '', wait: true };
    } else if (kind === 'sky_flagship') {
      step = { id, type: 'sky_flagship', action: 'arrive', dur: 3.2, captainA: 'ap_admiral_veyl', captainB: 'ap_red_gale_corsair', wait: true };
    } else if (kind === 'sky_hooks') {
      step = { id, type: 'sky_hooks', action: 'throw_and_lash', count: 4, wait: true };
    } else if (kind === 'sky_volley') {
      step = { id, type: 'sky_volley', action: 'flagship_volley', count: 4, captainId: 'ap_admiral_veyl', castKey: 'flagship_captain', dz: 0, wait: true };
    } else {
      step = { id, type: 'wait', dur: 1.0 };
    }

    const curIdx = cine.steps.indexOf(this.studio.state.selectedCineStep);
    if (curIdx >= 0) cine.steps.splice(curIdx + 1, 0, step);
    else cine.steps.push(step);

    this.studio.state.selected = null;
    this.studio.state.selectedCineStep = step;
    this.renderAll();
    this.studio.renderInspector();
    this.studio.refreshValidation();

    const newIdx = cine.steps.indexOf(step);
    const nodeEl = document.querySelector(`#cine-tracks .ckf-node[data-stepidx="${newIdx}"]`);
    nodeEl?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }

  playPreview() {
    const { studio } = this;
    if (studio.playtest?.active) {
      const cine = this.currentCutscene(studio.doc);
      if (cine) studio.world?.customDirector?.playCutscene(cine.id);
      return;
    }
    const cine = this.currentCutscene(studio.doc);
    if (!cine || !studio.world) {
      studio.toast('No cutscene steps to preview.');
      return;
    }
    this.stopPreview();

    this.savedCam = { x: camera.x, y: camera.y, zoom: camera.zoom };
    const spd = Number(document.getElementById('sel-cine-speed')?.value) || 1;
    Cine.speed = spd;

    // Spawn a temporary Hero actor at Player Start so @hero portraits, framing & walks execute live!
    if (!studio.world.player) {
      const ch = newCharData('paladin', 'Hero');
      G.char = ch;
      const p = new Player(ch);
      [p.x, p.y] = studio.doc.entities.start || [28, 28];
      studio.world.player = p;
      studio.world.add(p);
      G.player = p;
      this.tempHero = p;
    }
    this.previewing = true;
    studio.world.skyDirector?.syncPlacedVessels?.({ inEditor: false });
    const ok = studio.world.customDirector?.playCutscene(cine.id, {
      forceNormalSpeed: spd < 20,
      onEnd: () => this.cleanupAfterPreview(),
    });
    if (!ok) {
      this.cleanupAfterPreview();
      studio.toast('Cutscene has no active steps.');
    } else if (spd === 20) {
      Cine.speed = 1;
      Cine.fast = true;
    }
  }

  stopPreview() {
    if (!this.previewing && !G.cine) return;
    Cine.abort();
    Cine.speed = 1;
    this.cleanupAfterPreview();
  }

  cleanupAfterPreview() {
    this.previewing = false;
    Cine.speed = 1;
    if (this.tempHero && this.studio.world) {
      this.studio.world.remove(this.tempHero);
      if (this.studio.world.player === this.tempHero) this.studio.world.player = null;
      if (G.player === this.tempHero) G.player = null;
      this.tempHero = null;
    }
    if (this.savedCam) {
      camera.x = this.savedCam.x;
      camera.y = this.savedCam.y;
      camera.zoom = this.savedCam.zoom;
      this.savedCam = null;
    }
    this.studio.world?.skyDirector?.restoreEditorPreview?.();
  }

  renderAll() {
    const doc = this.studio.doc;
    if (!doc) return;
    const sel = document.getElementById('sel-cutscene');
    const cine = this.currentCutscene(doc);
    if (sel) {
      sel.innerHTML = (doc.cutscenes || [])
        .map((c) => `<option value="${c.id}" ${c.id === cine?.id ? 'selected' : ''}>🎬 ${c.name} (${c.steps?.length || 0})</option>`)
        .join('') || '<option value="">(No Cutscenes)</option>';
    }
    this.renderTracks(cine);
    this.renderTriggersPanel(doc);
  }

  renderTracks(cine) {
    const host = document.getElementById('cine-tracks');
    if (!host) return;
    if (!cine) {
      host.innerHTML = '<div class="dim-lbl" style="padding:14px">No cutscene selected. Click <b>+ Scene</b> above to create one.</div>';
      return;
    }

    const steps = cine.steps || [];
    this.syncSelectedStepRef(cine);
    let cursorSec = 0;
    let totalEst = 0;
    const kfHtml = steps.map((st, idx) => {
      const info = describeStepKeyframe(st);
      const tStart = cursorSec;
      totalEst = Math.max(totalEst, tStart + info.dur);
      if (info.blocks) cursorSec += info.dur;
      const active = this.studio.state.selectedCineStep === st ? 'active' : '';
      const flowFlag = info.blocks ? '' : ' title="Non-blocking (runs concurrently with next keyframe)"';
      return `
        <div class="ckf-node ${info.cls} ${active}" data-stepidx="${idx}" tabindex="0" role="button" aria-label="Keyframe #${idx + 1} ${escapeHtml(info.title)}">
          <div class="ckf-top"${flowFlag}>
            <span class="ckf-stepnum">#${idx + 1}</span>
            <span>${tStart.toFixed(1)}s${info.blocks ? '' : '⚡'}</span>
          </div>
          <div class="ckf-pin-row">
            <div class="ckf-diamond"></div>
          </div>
          <div class="ckf-tag">
            <b>${info.icon} ${escapeHtml(info.title)}</b>
            <span>${escapeHtml(info.sub)}</span>
          </div>
        </div>
      `;
    }).join('');

    const isAirship = this.studio.doc?.meta?.category === 'airship';
    host.innerHTML = `
      <div class="ckf-meta-bar">
        <div class="ckf-add-bar">
          <span class="dim-lbl">+ Keyframe:</span>
          <button class="mini-btn" data-addstep="cam">🎥 Cam</button>
          <button class="mini-btn" data-addstep="say">💬 Say</button>
          <button class="mini-btn" data-addstep="card">🪧 Card</button>
          <button class="mini-btn" data-addstep="walk">🚶 Walk</button>
          <button class="mini-btn" data-addstep="vfx">✨ FX</button>
          <button class="mini-btn" data-addstep="wait">⏱️ Wait</button>
          ${isAirship ? `
            <span class="dp-sep"></span>
            <button class="mini-btn gold" data-addstep="sky_skiff" title="Sail an enemy skiff alongside & leap boarders">🛥️ Skiff</button>
            <button class="mini-btn gold" data-addstep="sky_flagship" title="Bring Enemy Flagship out of clouds alongside">🚢 Flagship</button>
            <button class="mini-btn gold" data-addstep="sky_hooks" title="Throw iron grappling hooks & lash ships together">🪝 Grapple</button>
            <button class="mini-btn gold" data-addstep="sky_volley" title="Broadside cannon volley or Captain leaps/rope-swings aboard">💥 Broadside</button>
          ` : ''}
        </div>
        <span class="dim-lbl" style="white-space:nowrap">${isAirship ? `${steps.length} kf (~${totalEst.toFixed(1)}s)` : `${steps.length} keyframe${steps.length === 1 ? '' : 's'} (~${totalEst.toFixed(1)}s) · Click ◆ to inspect · Drag ◆ to reorder`}</span>
      </div>
      <div class="ckf-timeline" id="ckf-scroll">
        <div class="ckf-rail-track" id="ckf-rail">
          ${kfHtml || '<span class="dim-lbl" style="padding:22px 12px;z-index:1">Timeline is empty — click a [+ Keyframe] button above to add events.</span>'}
          <div class="ckf-drop-line" id="ckf-drop-line" hidden></div>
        </div>
      </div>
    `;

    host.querySelectorAll('[data-addstep]').forEach((btn) => {
      btn.addEventListener('click', () => this.addStep(btn.dataset.addstep));
    });

    const scrollEl = host.querySelector('#ckf-scroll');
    const railEl = host.querySelector('#ckf-rail');
    const dropLine = host.querySelector('#ckf-drop-line');
    const nodeEls = Array.from(host.querySelectorAll('.ckf-node[data-stepidx]'));

    const getLiveSteps = () => {
      const lc = this.currentCutscene(this.studio.doc);
      return { lc, ls: lc?.steps || [] };
    };

    const selectKeyframeAt = (idx, resetScroll = true) => {
      const { ls } = getLiveSteps();
      const st = ls[idx];
      if (!st) return;
      const changed = this.studio.state.selectedCineStep !== st;
      this.studio.state.selected = null;
      this.studio.state.selectedCineStep = st;
      nodeEls.forEach((n, i) => n.classList.toggle('active', i === idx));
      this.studio.renderInspector();
      if (changed && resetScroll) {
        const inspBody = document.getElementById('insp-body');
        if (inspBody) inspBody.scrollTop = 0;
      }
    };

    const computeDropSlot = (clientX) => {
      for (let i = 0; i < nodeEls.length; i++) {
        const r = nodeEls[i].getBoundingClientRect();
        if (clientX < r.left + r.width * 0.5) return i;
      }
      return nodeEls.length;
    };

    const positionDropLine = (slot) => {
      if (!railEl || !dropLine || !nodeEls.length) return;
      const railRect = railEl.getBoundingClientRect();
      let xPx;
      if (slot <= 0) {
        xPx = nodeEls[0].getBoundingClientRect().left - railRect.left - 4;
      } else if (slot >= nodeEls.length) {
        xPx = nodeEls[nodeEls.length - 1].getBoundingClientRect().right - railRect.left + 4;
      } else {
        const prevR = nodeEls[slot - 1].getBoundingClientRect();
        const nextR = nodeEls[slot].getBoundingClientRect();
        xPx = ((prevR.right + nextR.left) * 0.5) - railRect.left;
      }
      dropLine.style.left = `${Math.round(xPx)}px`;
      dropLine.hidden = false;
    };

    nodeEls.forEach((el) => {
      const idx = Number(el.dataset.stepidx);

      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        el.focus({ preventScroll: true });
        selectKeyframeAt(idx, true);

        const startX = e.clientX;
        let dragging = false;
        let dropSlot = idx;

        const onMove = (ev) => {
          const { ls } = getLiveSteps();
          if (!dragging && Math.abs(ev.clientX - startX) >= 6 && ls.length > 1) {
            dragging = true;
            el.classList.add('is-dragging');
            railEl?.classList.add('reordering');
          }
          if (!dragging) return;

          if (scrollEl) {
            const sr = scrollEl.getBoundingClientRect();
            if (ev.clientX < sr.left + 36) scrollEl.scrollLeft -= 14;
            else if (ev.clientX > sr.right - 36) scrollEl.scrollLeft += 14;
          }
          dropSlot = computeDropSlot(ev.clientX);
          positionDropLine(dropSlot);
        };

        const finishDrag = (cancelled) => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onCancel);
          el.classList.remove('is-dragging');
          railEl?.classList.remove('reordering');
          if (dropLine) dropLine.hidden = true;

          if (!dragging || cancelled) return;
          const { lc, ls } = getLiveSteps();
          const toIdx = dropSlot > idx ? dropSlot - 1 : dropSlot;
          if (lc && toIdx !== idx && toIdx >= 0 && toIdx < ls.length) {
            this.studio.history.snapshot(this.studio.doc, 'Reorder Cutscene Keyframe');
            const [moved] = ls.splice(idx, 1);
            ls.splice(toIdx, 0, moved);
            this.studio.state.selectedCineStep = moved;
            this.renderTracks(lc);
            this.studio.renderInspector();
            this.studio.refreshValidation();
            host.querySelector(`.ckf-node[data-stepidx="${toIdx}"]`)?.focus({ preventScroll: true });
          }
        };
        const onUp = () => finishDrag(false);
        const onCancel = () => finishDrag(true);

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
      });

      el.addEventListener('keydown', (e) => {
        const { lc, ls } = getLiveSteps();
        if (!lc) return;
        if (e.key === 'ArrowLeft' && idx > 0) {
          e.preventDefault();
          if (e.altKey) {
            this.studio.history.snapshot(this.studio.doc, 'Move Keyframe Earlier');
            [ls[idx - 1], ls[idx]] = [ls[idx], ls[idx - 1]];
            this.renderTracks(lc);
            this.studio.renderInspector();
            host.querySelector(`.ckf-node[data-stepidx="${idx - 1}"]`)?.focus();
          } else {
            selectKeyframeAt(idx - 1, true);
            nodeEls[idx - 1]?.focus();
          }
        } else if (e.key === 'ArrowRight' && idx < ls.length - 1) {
          e.preventDefault();
          if (e.altKey) {
            this.studio.history.snapshot(this.studio.doc, 'Move Keyframe Later');
            [ls[idx + 1], ls[idx]] = [ls[idx], ls[idx + 1]];
            this.renderTracks(lc);
            this.studio.renderInspector();
            host.querySelector(`.ckf-node[data-stepidx="${idx + 1}"]`)?.focus();
          } else {
            selectKeyframeAt(idx + 1, true);
            nodeEls[idx + 1]?.focus();
          }
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          this.studio.history.snapshot(this.studio.doc, 'Delete Cutscene Keyframe');
          ls.splice(idx, 1);
          this.studio.state.selectedCineStep = ls[Math.max(0, idx - 1)] || null;
          this.renderAll();
          this.studio.renderInspector();
          this.studio.refreshValidation();
        }
      });
    });
  }

  renderTriggersPanel(doc) {
    const panel = document.getElementById('triggers-panel');
    const badge = document.getElementById('trig-badge');
    if (badge) badge.textContent = String((doc.triggers?.length || 0) + (doc.objectives?.length || 0));
    if (!panel) return;

    const cineOpts = `<option value="">(None)</option>` + (doc.cutscenes || []).map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
    const zoneOpts = `<option value="">(Any / None)</option>` + (doc.entities?.zones || []).map((z) => `<option value="${z.id}">${z.name || z.id}</option>`).join('');

    const trigCards = (doc.triggers || []).map((tr, idx) => `
      <div class="tcard">
        <div class="tcard-head">
          <input data-trname="${idx}" type="text" value="${tr.name || tr.id}" style="font-weight:700;font-size:12px;height:22px;background:var(--bg-deep);border:1px solid var(--line);border-radius:4px;padding:1px 6px;flex:1;min-width:0">
          <span class="coop-tag" title="Locks input/AI and plays simultaneously for all party members on this floor">🔒 Party Lock</span>
          <button class="mini-btn danger" data-deltrig="${idx}" title="Delete Trigger" style="height:20px;padding:0 6px">✕</button>
        </div>
        <div class="fg-row">
          <div class="fg">
            <label>When Event Fires</label>
            <select data-trev="${idx}">
              ${TRIGGER_EVENTS.map((ev) => `<option value="${ev.id}" ${tr.event === ev.id ? 'selected' : ''}>${ev.label}</option>`).join('')}
            </select>
          </div>
          <div class="fg">
            <label>Play Cutscene</label>
            <select data-trcine="${idx}">${cineOpts.replace(`value="${tr.runCutscene}"`, `value="${tr.runCutscene}" selected`)}</select>
          </div>
        </div>
        <div class="fg-row">
          <div class="fg">
            <label>Spatial Zone (if Zone Event)</label>
            <select data-trzone="${idx}">${zoneOpts.replace(`value="${tr.zoneId || ''}"`, `value="${tr.zoneId || ''}" selected`)}</select>
          </div>
          <div class="fg">
            <label>Target @castKey / ID ${tr.event === 'onBossHpBelow' ? 'or HP%' : ''}</label>
            <div style="display:flex;gap:4px">
              <input data-trkey="${idx}" type="text" placeholder="@castKey or chest id" value="${tr.targetKey || ''}">
              ${tr.event === 'onBossHpBelow' ? `<input data-trhp="${idx}" type="number" min="5" max="95" value="${tr.hpPct ?? 50}" style="width:54px" title="HP % threshold">` : ''}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:nowrap;align-items:center">
          <label class="chk-line"><input data-tronce="${idx}" type="checkbox" ${tr.once !== false ? 'checked' : ''}> Once</label>
          <label class="chk-line"><input data-trclear="${idx}" type="checkbox" ${tr.requireCombatClear ? 'checked' : ''}> Combat Clear</label>
          <label class="chk-line"><input data-trunseal="${idx}" type="checkbox" ${tr.unsealExit ? 'checked' : ''}> Unseal Exit</label>
        </div>
      </div>
    `).join('');

    const objCards = (doc.objectives || []).map((ob, idx) => `
      <div class="tcard tcard-obj" style="border-color:#4b3d22">
        <div class="tcard-head">
          <b style="color:var(--gold-b);font-size:12px">🏆 Objective #${idx + 1}</b>
          <button class="mini-btn danger" data-delobj="${idx}" style="height:20px;padding:0 6px">✕</button>
        </div>
        <div class="fg">
          <label>Condition</label>
          <select data-objkind="${idx}">
            ${OBJECTIVE_KINDS.map((k) => `<option value="${k.id}" ${ob.kind === k.id ? 'selected' : ''}>${k.label}</option>`).join('')}
          </select>
        </div>
        <div class="fg">
          <label>HUD Banner Text</label>
          <input data-objtxt="${idx}" type="text" value="${ob.text || ''}">
        </div>
      </div>
    `).join('');

    panel.innerHTML = `
      <div class="tcard tcard-intro" style="align-items:flex-start;background:var(--bg-deep);border-style:dashed">
        <b style="color:var(--gold-b);font-size:12.5px">⚡ Triggers &amp; Objectives</b>
        <span class="dim-lbl" style="line-height:1.25">Connect zones, NPCs, shrines, or boss HP phases to cutscenes &amp; exit gates.</span>
        <div style="display:flex;gap:6px;margin-top:2px;flex-wrap:wrap">
          <button id="btn-new-trig" class="mini-btn gold">+ Add Trigger</button>
          <button id="btn-new-obj" class="mini-btn">+ Objective</button>
        </div>
      </div>
      ${trigCards}
      ${objCards}
    `;

    if (!panel._horizWheelBound) {
      panel._horizWheelBound = true;
      panel.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && panel.scrollWidth > panel.clientWidth) {
          panel.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      }, { passive: false });
    }

    panel.querySelector('#btn-new-trig')?.addEventListener('click', () => {
      this.studio.history.snapshot(doc, 'Add Trigger');
      doc.triggers.push({
        id: `trig_${Date.now().toString(36)}`,
        name: 'Zone Cutscene Trigger',
        enabled: true,
        event: 'onEnterZone',
        once: true,
        requireCombatClear: false,
        zoneId: doc.entities.zones?.[0]?.id || '',
        targetKey: '',
        hpPct: 50,
        runCutscene: doc.cutscenes?.[0]?.id || '',
      });
      this.renderTriggersPanel(doc);
      panel.scrollLeft = panel.scrollWidth;
      this.studio.refreshValidation();
    });

    panel.querySelector('#btn-new-obj')?.addEventListener('click', () => {
      this.studio.history.snapshot(doc, 'Add Objective');
      doc.objectives.push({ id: `obj_${Date.now().toString(36)}`, kind: 'kill_bosses', text: 'Defeat the area boss' });
      this.renderTriggersPanel(doc);
      panel.scrollLeft = panel.scrollWidth;
    });

    panel.querySelectorAll('[data-deltrig]').forEach((b) => b.addEventListener('click', () => {
      this.studio.history.snapshot(doc, 'Delete Trigger');
      doc.triggers.splice(Number(b.dataset.deltrig), 1);
      this.renderTriggersPanel(doc);
      this.studio.refreshValidation();
    }));
    panel.querySelectorAll('[data-delobj]').forEach((b) => b.addEventListener('click', () => {
      this.studio.history.snapshot(doc, 'Delete Objective');
      doc.objectives.splice(Number(b.dataset.delobj), 1);
      this.renderTriggersPanel(doc);
    }));

    const bindField = (attr, fn) => panel.querySelectorAll(`[${attr}]`).forEach((el) => {
      el.addEventListener('change', () => { fn(Number(el.getAttribute(attr)), el); this.studio.refreshValidation(); });
    });
    bindField('data-trname', (i, el) => { doc.triggers[i].name = el.value; });
    bindField('data-trev', (i, el) => { doc.triggers[i].event = el.value; this.renderTriggersPanel(doc); });
    bindField('data-trcine', (i, el) => { doc.triggers[i].runCutscene = el.value; });
    bindField('data-trzone', (i, el) => { doc.triggers[i].zoneId = el.value || null; });
    bindField('data-trkey', (i, el) => { doc.triggers[i].targetKey = el.value.replace(/^@/, '') || null; });
    bindField('data-trhp', (i, el) => { doc.triggers[i].hpPct = Number(el.value) || 50; });
    bindField('data-tronce', (i, el) => { doc.triggers[i].once = el.checked; });
    bindField('data-trclear', (i, el) => { doc.triggers[i].requireCombatClear = el.checked; });
    bindField('data-trunseal', (i, el) => { doc.triggers[i].unsealExit = el.checked; });
    bindField('data-objkind', (i, el) => { doc.objectives[i].kind = el.value; });
    bindField('data-objtxt', (i, el) => { doc.objectives[i].text = el.value; });
  }

  /** Render Right-Dock Inspector when a Cutscene Keyframe is selected. */
  renderStepInspector(container, titleEl, doc, step) {
    const cine = this.currentCutscene(doc);
    if (!cine) return false;
    const resolved = this.syncSelectedStepRef(cine) || step;
    if (!resolved) return false;
    step = resolved;
    const idx = cine.steps.indexOf(step);
    if (idx < 0) return false;

    const kfInfo = describeStepKeyframe(step);
    titleEl.textContent = `${kfInfo.icon} Keyframe #${idx + 1} (${step.type.toUpperCase()})`;
    const castOpts = collectCastOptions(doc);
    const markOpts = `<option value="">(Use X, Y Coords)</option>` + (doc.entities.marks || []).map((m) => `<option value="${m.id}" ${step.markId === m.id ? 'selected' : ''}>📍 ${m.name || m.id} (${m.x.toFixed(0)}, ${m.y.toFixed(0)})</option>`).join('');

    let bodyHtml = `
      <div class="fg">
        <label>Cutscene Title</label>
        <input id="ci-cinename" type="text" value="${escapeHtml(cine.name || '')}">
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <button id="ci-prev" class="mini-btn" ${idx === 0 ? 'disabled' : ''}>◀ Earlier</button>
        <button id="ci-next" class="mini-btn" ${idx >= cine.steps.length - 1 ? 'disabled' : ''}>Later ▶</button>
        <button id="ci-dup" class="mini-btn">⧉ Duplicate</button>
        <button id="ci-del" class="mini-btn danger">✕ Delete</button>
      </div>
      <div class="insp-sec">Event Parameters</div>
      <div class="fg">
        <label>Event Type</label>
        <select id="ci-steptype">
          ${STEP_TYPE_OPTIONS.map(([k, lbl]) => `<option value="${k}" ${step.type === k ? 'selected' : ''}>${lbl}</option>`).join('')}
        </select>
      </div>
    `;

    if (step.type === 'cam') {
      bodyHtml += `
        <div class="fg">
          <label>Camera Mode</label>
          <select id="ci-cammode">
            <option value="actor" ${step.mode === 'actor' ? 'selected' : ''}>Follow Actor (@castKey / Hero)</option>
            <option value="tile" ${step.mode === 'tile' ? 'selected' : ''}>Pan to Fixed Tile / Mark</option>
            <option value="fit" ${step.mode === 'fit' ? 'selected' : ''}>Auto-Fit Multiple Actors</option>
            <option value="return_hero" ${step.mode === 'return_hero' ? 'selected' : ''}>Ease Back to Hero (1.0×)</option>
          </select>
        </div>
        ${step.mode === 'actor' ? `
          <div class="fg">
            <label>Subject Actor</label>
            <select id="ci-who">${castOpts.map((o) => `<option value="${o.key}" ${step.who === o.key ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
          </div>
        ` : ''}
        ${step.mode === 'fit' ? `
          <div class="fg">
            <label>Actors to Fit (comma-separated)</label>
            <input id="ci-fitactors" type="text" value="${escapeHtml((step.actors || ['hero']).join(', '))}">
          </div>
        ` : ''}
        ${step.mode === 'tile' ? `
          <div class="fg"><label>Waypoint Mark</label><select id="ci-mark">${markOpts}</select></div>
          <div class="fg-row">
            <div class="fg"><label>Tile X</label><input id="ci-x" type="number" step="0.5" value="${step.x ?? 28}"></div>
            <div class="fg"><label>Tile Y</label><input id="ci-y" type="number" step="0.5" value="${step.y ?? 28}"></div>
          </div>
          <button id="ci-capcam" class="mini-btn gold">🎯 Capture Current Viewport Center</button>
        ` : ''}
        <div class="fg-row">
          <div class="fg"><label>Zoom Multiplier</label><input id="ci-zoom" type="number" step="0.1" min="0.4" max="3.5" value="${step.zoom ?? 1.6}"></div>
          <div class="fg"><label>Duration (s)</label><input id="ci-dur" type="number" step="0.1" min="0.1" max="15" value="${step.dur ?? 1.2}"></div>
        </div>
        <div class="fg-row">
          <div class="fg">
            <label>Easing</label>
            <select id="ci-ease">
              <option value="io" ${step.ease === 'io' ? 'selected' : ''}>Smooth In-Out</option>
              <option value="out" ${step.ease === 'out' ? 'selected' : ''}>Cubic Out</option>
              <option value="in" ${step.ease === 'in' ? 'selected' : ''}>Quad In</option>
              <option value="lin" ${step.ease === 'lin' ? 'selected' : ''}>Linear</option>
            </select>
          </div>
          <div class="fg"><label>Slow Push-In (/s)</label><input id="ci-push" type="number" step="0.01" min="0" max="0.25" value="${step.push ?? 0}"></div>
        </div>
        <label class="chk-line"><input id="ci-wait" type="checkbox" ${step.wait !== false ? 'checked' : ''}> Hold timeline until camera arrives</label>
      `;
    } else if (step.type === 'say') {
      const len = (step.text || '').length;
      bodyHtml += `
        <div class="fg">
          <label>Speaker (@castKey or Hero)</label>
          <select id="ci-who">
            ${castOpts.map((o) => `<option value="${o.key}" ${step.who === o.key ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
        <div class="fg">
          <label>Custom Display Name Override (optional)</label>
          <input id="ci-cname" type="text" placeholder="Leave blank for actor's name" value="${escapeHtml(step.customName || '')}">
        </div>
        <div class="fg">
          <label style="display:flex;justify-content:space-between">
            <span>Dialogue Text</span>
            <span id="ci-charcnt" style="color:${len > 150 ? 'var(--amber)' : 'var(--faint)'}">${len} / 150 chars</span>
          </label>
          <textarea id="ci-text">${escapeHtml(step.text || '')}</textarea>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px">
            <button class="mini-btn" data-tok="{hero}">+ {hero}</button>
            <button class="mini-btn" data-tok="{class}">+ {class}</button>
            ${castOpts.filter((c) => c.key !== 'hero').slice(0, 2).map((c) => `<button class="mini-btn" data-tok="{@${c.key}}">+ {@${c.key}}</button>`).join('')}
          </div>
        </div>
        <div class="fg-row">
          <div class="fg">
            <label>Voice Pitch (${(step.voice?.pitch ?? 1).toFixed(2)}×)</label>
            <input id="ci-pitch" type="number" step="0.05" min="0.4" max="2.0" value="${step.voice?.pitch ?? 1.0}">
          </div>
          <div class="fg">
            <label>Oscillator Wave</label>
            <select id="ci-wave">
              ${['square', 'sawtooth', 'triangle', 'sine'].map((w) => `<option value="${w}" ${(step.voice?.wave || 'square') === w ? 'selected' : ''}>${w}</option>`).join('')}
            </select>
          </div>
        </div>
        <button id="ci-testvoice" class="sbtn gold" style="justify-content:center">🔊 Test Procedural Blip Voice</button>
        <div class="fg-row">
          <div class="fg"><label>Highlight Word</label><input id="ci-mword" type="text" placeholder="e.g. Velscour" value="${escapeHtml(step.markWord || '')}"></div>
          <div class="fg"><label>Name/Border Color</label><input id="ci-color" type="text" placeholder="#ffd9a0" value="${escapeHtml(step.color || '')}"></div>
        </div>
        <label class="chk-line"><input id="ci-autoframe" type="checkbox" ${step.autoFrame !== false ? 'checked' : ''}> Auto-frame camera onto speaker</label>
      `;
    } else if (step.type === 'card') {
      bodyHtml += `
        <div class="fg"><label>Card Main Title</label><input id="ci-title" type="text" value="${escapeHtml(step.title || '')}"></div>
        <div class="fg"><label>Subtitle Plate</label><input id="ci-sub" type="text" value="${escapeHtml(step.sub || '')}"></div>
        <div class="fg"><label>Display Duration (s)</label><input id="ci-dur" type="number" step="0.2" min="0.8" max="10" value="${step.dur ?? 2.6}"></div>
        <label class="chk-line"><input id="ci-block" type="checkbox" ${step.block ? 'checked' : ''}> Block next step until card finishes</label>
      `;
    } else if (step.type === 'walk') {
      const isVessel = (doc.grid?.airship?.vessels || []).some((v) => v.castKey && v.castKey === step.who);
      bodyHtml += `
        <div class="fg">
          <label>${isVessel ? 'Airship Vessel to Sail / Move' : 'Actor / Airship to Move'}</label>
          <select id="ci-who">${castOpts.map((o) => `<option value="${o.key}" ${step.who === o.key ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
        </div>
        <div class="fg"><label>Destination Mark</label><select id="ci-mark">${markOpts}</select></div>
        <div class="fg-row">
          <div class="fg"><label>Dest X</label><input id="ci-x" type="number" step="0.5" value="${step.x ?? 28}"></div>
          <div class="fg"><label>Dest Y</label><input id="ci-y" type="number" step="0.5" value="${step.y ?? 28}"></div>
        </div>
        ${isVessel ? `
          <div class="fg"><label>Target Sky Altitude (lv)</label><input id="ci-lv" type="number" step="1" min="-40" max="120" value="${step.lv ?? 8}"></div>
          <label class="chk-line"><input id="ci-fromclouds" type="checkbox" ${step.fromClouds ? 'checked' : ''}> Sail in from offscreen clouds</label>
        ` : ''}
        <button id="ci-capcam" class="mini-btn gold">🎯 Pick Current Viewport Center</button>
        <div class="fg"><label>Duration (s)</label><input id="ci-dur" type="number" step="0.1" min="0.2" max="15" value="${step.dur ?? 1.4}"></div>
        ${!isVessel ? `<label class="chk-line"><input id="ci-path" type="checkbox" ${step.pathfind ? 'checked' : ''}> Use A* Pathfinding around obstacles</label>` : ''}
        <label class="chk-line"><input id="ci-wait" type="checkbox" ${step.wait !== false ? 'checked' : ''}> Wait until arrival</label>
      `;
    } else if (step.type === 'vfx') {
      bodyHtml += `
        <div class="fg-row">
          <div class="fg">
            <label>VFX Style</label>
            <select id="ci-vfxkind">
              ${['ring', 'column', 'sparkle', 'text'].map((k) => `<option value="${k}" ${(step.vfx || 'ring') === k ? 'selected' : ''}>${k}</option>`).join('')}
            </select>
          </div>
          <div class="fg"><label>Color</label><input id="ci-color" type="text" value="${escapeHtml(step.color || '#ffb060')}"></div>
        </div>
        <div class="fg"><label>Anchor Actor</label><select id="ci-who"><option value="" ${!step.who ? 'selected' : ''}>(Use Tile X/Y)</option>${castOpts.map((o) => `<option value="${o.key}" ${step.who === o.key ? 'selected' : ''}>${o.label}</option>`).join('')}</select></div>
        <div class="fg-row">
          <div class="fg"><label>Tile X</label><input id="ci-x" type="number" step="0.5" value="${step.x ?? 28}"></div>
          <div class="fg"><label>Tile Y</label><input id="ci-y" type="number" step="0.5" value="${step.y ?? 28}"></div>
        </div>
        <button id="ci-capcam" class="mini-btn">🎯 Pick Current Viewport Center</button>
        <div class="fg-row">
          <div class="fg"><label>Radius</label><input id="ci-rad" type="number" step="0.5" min="0.5" max="20" value="${step.radius ?? 3.5}"></div>
          <div class="fg"><label>Duration (s)</label><input id="ci-dur" type="number" step="0.1" min="0.1" max="10" value="${step.dur ?? 0.9}"></div>
        </div>
        ${step.vfx === 'text' ? `<div class="fg"><label>Floating Text</label><input id="ci-vfxtxt" type="text" value="${escapeHtml(step.text || '')}"></div>` : ''}
      `;
    } else if (step.type === 'shake') {
      bodyHtml += `<div class="fg"><label>Shake Intensity (px)</label><input id="ci-px" type="number" min="1" max="18" value="${step.px ?? 7}"></div>`;
    } else if (step.type === 'sfx') {
      bodyHtml += `<div class="fg"><label>SFX Name (boss, gate, chest, door, hit)</label><input id="ci-sfx" type="text" value="${escapeHtml(step.sound || 'boss')}"></div>`;
    } else if (step.type === 'music') {
      bodyHtml += `<div class="fg"><label>Music Track (town, wilds, boss, victory)</label><input id="ci-music" type="text" value="${escapeHtml(step.music || 'boss')}"></div>`;
    } else if (step.type === 'door') {
      bodyHtml += `
        <div class="fg">
          <label>Target</label>
          <select id="ci-doortgt">
            <option value="exit" ${step.target === 'exit' ? 'selected' : ''}>Unseal Scenario Exit Portal</option>
            <option value="door" ${step.target !== 'exit' ? 'selected' : ''}>Toggle Dungeon Door</option>
          </select>
        </div>
        ${step.target !== 'exit' ? `<div class="fg"><label>Door Index (#)</label><input id="ci-dooridx" type="number" min="0" max="50" value="${step.doorIndex ?? 0}"></div>` : ''}
      `;
    } else if (step.type === 'spawn') {
      bodyHtml += `
        <div class="fg-row">
          <div class="fg"><label>Archetype</label><input id="ci-arch" type="text" value="${escapeHtml(step.arch || 'skeleton')}"></div>
          <div class="fg">
            <label>Rank</label>
            <select id="ci-srank">
              ${['normal', 'champion', 'unique', 'boss'].map((r) => `<option value="${r}" ${(step.rank || 'normal') === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="fg-row">
          <div class="fg"><label>Count</label><input id="ci-n" type="number" min="1" max="12" value="${step.n ?? 3}"></div>
          <div class="fg"><label>Tile X</label><input id="ci-x" type="number" step="0.5" value="${step.x ?? 28}"></div>
        </div>
        <div class="fg"><label>Tile Y</label><input id="ci-y" type="number" step="0.5" value="${step.y ?? 28}"></div>
        <button id="ci-capcam" class="mini-btn">🎯 Pick Current Viewport Center</button>
      `;
    } else if (step.type === 'emote') {
      bodyHtml += `
        <div class="fg"><label>Actor</label><select id="ci-who">${castOpts.map((o) => `<option value="${o.key}" ${step.who === o.key ? 'selected' : ''}>${o.label}</option>`).join('')}</select></div>
        <div class="fg"><label>Emotion (angry, shock, happy, alert)</label><input id="ci-emo" type="text" value="${escapeHtml(step.emotion || 'alert')}"></div>
      `;
    } else if (step.type === 'wait') {
      bodyHtml += `<div class="fg"><label>Wait Seconds</label><input id="ci-dur" type="number" step="0.1" min="0.1" max="30" value="${step.dur ?? 1.0}"></div>`;
    } else if (step.type === 'sky_skiff') {
      const capOpts = `<option value="">(No Captain — Crew Only)</option>` + AIR_CAPTAINS.map((c) => `<option value="${c.id}" ${step.captainId === c.id ? 'selected' : ''}>${c.name} (${c.title})</option>`).join('');
      bodyHtml += `
        <div class="fg-row">
          <div class="fg">
            <label>Skiff / Airboat Craft</label>
            <select id="ci-skboat">
              <option value="cutter" ${step.boatKind === 'cutter' ? 'selected' : ''}>🛥️ Swift Boarding Cutter</option>
              <option value="hauler" ${step.boatKind === 'hauler' ? 'selected' : ''}>🛡️ Armored Iron Hauler</option>
              <option value="gasbag" ${step.boatKind === 'gasbag' ? 'selected' : ''}>🎈 Gasbag Boarding Skiff</option>
              <option value="flyover" ${step.boatKind === 'flyover' ? 'selected' : ''}>🪂 Overhead Gasbag Rope-Drop</option>
            </select>
          </div>
          <div class="fg">
            <label>Port Dock Position</label>
            <select id="ci-skdock">
              <option value="fore" ${step.dock === 'fore' ? 'selected' : ''}>Bow Dock (z = -6)</option>
              <option value="mid" ${(step.dock || 'mid') === 'mid' ? 'selected' : ''}>Amidships Dock (z = +3)</option>
              <option value="aft" ${step.dock === 'aft' ? 'selected' : ''}>Quarterdeck Dock (z = +13.5)</option>
              <option value="auto" ${step.dock === 'auto' ? 'selected' : ''}>Auto Free Dock</option>
            </select>
          </div>
        </div>
        <div class="fg-row">
          <div class="fg"><label>Boarders (1–8)</label><input id="ci-n" type="number" min="0" max="8" value="${step.count ?? 4}"></div>
          <div class="fg">
            <label>Lead Rank</label>
            <select id="ci-srank">
              ${['normal', 'champion', 'unique'].map((r) => `<option value="${r}" ${(step.rank || 'normal') === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="fg"><label>Boarding Captain (optional)</label><select id="ci-skcap">${capOpts}</select></div>
        <label class="chk-line"><input id="ci-wait" type="checkbox" ${step.wait !== false ? 'checked' : ''}> Hold timeline until skiff docks alongside</label>
      `;
    } else if (step.type === 'sky_flagship') {
      const capOptsA = AIR_CAPTAINS.map((c) => `<option value="${c.id}" ${(step.captainA || 'ap_admiral_veyl') === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
      const capOptsB = AIR_CAPTAINS.map((c) => `<option value="${c.id}" ${(step.captainB || 'ap_red_gale_corsair') === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
      bodyHtml += `
        <div class="fg">
          <label>Flagship Maneuver</label>
          <select id="ci-flact">
            <option value="arrive" ${(step.action || 'arrive') === 'arrive' ? 'selected' : ''}>☁️ Emerge from Cloud Bank &amp; Sail Alongside</option>
            <option value="close" ${step.action === 'close' ? 'selected' : ''}>⚓ Snap Immediately Alongside</option>
            <option value="depart" ${step.action === 'depart' ? 'selected' : ''}>🔥 Cut Loose &amp; Sink into Clouds</option>
          </select>
        </div>
        <div class="fg"><label>Approach Duration (s)</label><input id="ci-dur" type="number" step="0.2" min="0.8" max="10" value="${step.dur ?? 3.2}"></div>
        <div class="fg-row">
          <div class="fg"><label>Rail Captain #1</label><select id="ci-flcapa">${capOptsA}</select></div>
          <div class="fg"><label>Rail Captain #2</label><select id="ci-flcapb">${capOptsB}</select></div>
        </div>
        <label class="chk-line"><input id="ci-wait" type="checkbox" ${step.wait !== false ? 'checked' : ''}> Hold timeline until Flagship reaches broadside</label>
      `;
    } else if (step.type === 'sky_hooks') {
      const vesselOpts = `<option value="">(Active Enemy Flagship)</option>` + (doc.grid?.airship?.vessels || []).map((v) => `<option value="${v.castKey || v.id}" ${step.vesselKey === (v.castKey || v.id) ? 'selected' : ''}>⛵ ${v.name || v.kind} (@${v.castKey || v.id})</option>`).join('');
      bodyHtml += `
        <div class="fg">
          <label>Grappling Action</label>
          <select id="ci-hkact">
            <option value="throw_and_lash" ${(step.action || 'throw_and_lash') === 'throw_and_lash' ? 'selected' : ''}>🪝 Throw Iron Hooks &amp; Haul Ships Taut</option>
            <option value="throw" ${step.action === 'throw' ? 'selected' : ''}>↗ Throw Grappling Hooks Only</option>
            <option value="taut" ${step.action === 'taut' ? 'selected' : ''}>⛓️ Haul Existing Chains Taut</option>
            <option value="release" ${step.action === 'release' ? 'selected' : ''}>✨ Unhook &amp; Drop All Chains</option>
          </select>
        </div>
        <div class="fg"><label>Target Airship</label><select id="ci-hkvessel">${vesselOpts}</select></div>
        <div class="fg"><label>Chain Count (2–6)</label><input id="ci-n" type="number" min="2" max="6" value="${step.count ?? 4}"></div>
        <label class="chk-line"><input id="ci-wait" type="checkbox" ${step.wait !== false ? 'checked' : ''}> Hold timeline until chains haul taut</label>
      `;
    } else if (step.type === 'sky_volley') {
      const capOpts = AIR_CAPTAINS.map((c) => `<option value="${c.id}" ${(step.captainId || 'ap_admiral_veyl') === c.id ? 'selected' : ''}>${c.name} (${c.title})</option>`).join('');
      const isCap = String(step.action || '').startsWith('captain_');
      bodyHtml += `
        <div class="fg">
          <label>Combat / Boarding Action</label>
          <select id="ci-vlact">
            <option value="flagship_volley" ${(step.action || 'flagship_volley') === 'flagship_volley' ? 'selected' : ''}>💥 Enemy Flagship Broadside Volley at Deck</option>
            <option value="ironclad_volley" ${step.action === 'ironclad_volley' ? 'selected' : ''}>🔥 Ironclad Return Broadside at Flagship</option>
            <option value="captain_leap" ${step.action === 'captain_leap' ? 'selected' : ''}>⚔️ Captain High-Leaps from Rail onto Deck</option>
            <option value="captain_swing" ${step.action === 'captain_swing' ? 'selected' : ''}>🪢 Captain Rope-Swings from Mainmast onto Deck</option>
          </select>
        </div>
        ${isCap ? `
          <div class="fg"><label>Boarding Captain</label><select id="ci-skcap">${capOpts}</select></div>
          <div class="fg-row">
            <div class="fg"><label>@castKey Handle</label><input id="ci-vcast" type="text" value="${escapeHtml(step.castKey || 'flagship_captain')}"></div>
            <div class="fg"><label>Deck Z Offset (-10..12)</label><input id="ci-vdz" type="number" step="0.5" value="${step.dz ?? 0}"></div>
          </div>
        ` : `
          <div class="fg"><label>Cannon Shots (1–8)</label><input id="ci-n" type="number" min="1" max="8" value="${step.count ?? 4}"></div>
        `}
        <label class="chk-line"><input id="ci-wait" type="checkbox" ${step.wait ? 'checked' : ''}> Hold timeline until ${isCap ? 'Captain lands on deck' : 'volley lands'}</label>
      `;
    } else {
      bodyHtml += `<div class="dim-lbl">Holds timeline progression until ${step.type === 'until_arrived' ? 'all scripted actor walks complete' : 'all awake hostiles are defeated'}.</div>`;
    }

    container.innerHTML = `<div class="form-stack">${bodyHtml}</div>`;

    // Wire actions
    const refresh = () => {
      this.renderAll();
      this.studio.refreshValidation();
    };
    container.querySelector('#ci-cinename')?.addEventListener('change', (e) => { cine.name = e.target.value; refresh(); });
    container.querySelector('#ci-prev')?.addEventListener('click', () => {
      if (idx <= 0) return;
      this.studio.history.snapshot(doc, 'Move Keyframe Earlier');
      [cine.steps[idx - 1], cine.steps[idx]] = [cine.steps[idx], cine.steps[idx - 1]];
      refresh(); this.studio.renderInspector();
    });
    container.querySelector('#ci-next')?.addEventListener('click', () => {
      if (idx >= cine.steps.length - 1) return;
      this.studio.history.snapshot(doc, 'Move Keyframe Later');
      [cine.steps[idx + 1], cine.steps[idx]] = [cine.steps[idx], cine.steps[idx + 1]];
      refresh(); this.studio.renderInspector();
    });
    container.querySelector('#ci-dup')?.addEventListener('click', () => {
      this.studio.history.snapshot(doc, 'Duplicate Keyframe');
      const copy = structuredClone(step);
      copy.id = `st_${Date.now().toString(36)}`;
      cine.steps.splice(idx + 1, 0, copy);
      this.studio.state.selectedCineStep = copy;
      refresh(); this.studio.renderInspector();
    });
    container.querySelector('#ci-del')?.addEventListener('click', () => {
      this.studio.history.snapshot(doc, 'Delete Keyframe');
      cine.steps.splice(idx, 1);
      this.studio.state.selectedCineStep = cine.steps[Math.max(0, idx - 1)] || null;
      refresh(); this.studio.renderInspector();
    });

    container.querySelector('#ci-steptype')?.addEventListener('change', (e) => {
      const nt = e.target.value;
      this.studio.history.snapshot(doc, 'Change Keyframe Event Type');
      const [sx, sy] = doc.entities.start || [28, 28];
      step.type = nt;
      if (nt === 'cam') { step.mode ||= 'actor'; step.who ||= 'hero'; step.zoom ??= 1.8; step.dur ??= 1.1; step.ease ||= 'io'; }
      else if (nt === 'say') { step.who ||= 'hero'; step.text ||= 'Stand ready.'; step.voice ||= { pitch: 1.0, wave: 'square' }; }
      else if (nt === 'card') { step.title ||= doc.meta.name.toUpperCase(); step.dur ??= 2.6; }
      else if (nt === 'walk') { step.who ||= 'hero'; step.x ??= Math.round(sx); step.y ??= Math.round(sy - 3); step.dur ??= 1.4; }
      else if (nt === 'vfx') { step.vfx ||= 'ring'; step.color ||= '#ffb060'; step.x ??= Math.round(sx); step.y ??= Math.round(sy); step.radius ??= 3.5; step.dur ??= 0.9; }
      else if (nt === 'sky_skiff') { step.boatKind ||= 'cutter'; step.dock ||= 'mid'; step.count ??= 4; step.rank ||= 'normal'; }
      else if (nt === 'sky_flagship') { step.action ||= 'arrive'; step.dur ??= 3.2; step.captainA ||= 'ap_admiral_veyl'; step.captainB ||= 'ap_red_gale_corsair'; }
      else if (nt === 'sky_hooks') { step.action ||= 'throw_and_lash'; step.count ??= 4; }
      else if (nt === 'sky_volley') { step.action ||= 'flagship_volley'; step.count ??= 4; step.captainId ||= 'ap_admiral_veyl'; }
      else if (nt === 'wait') { step.dur ??= 1.0; }
      refresh(); this.studio.renderInspector();
    });

    container.querySelector('#ci-cammode')?.addEventListener('change', (e) => { step.mode = e.target.value; refresh(); this.studio.renderInspector(); });
    container.querySelector('#ci-who')?.addEventListener('change', (e) => { step.who = e.target.value; refresh(); if (step.type === 'walk') this.studio.renderInspector(); });
    container.querySelector('#ci-fitactors')?.addEventListener('change', (e) => { step.actors = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); refresh(); });
    container.querySelector('#ci-mark')?.addEventListener('change', (e) => { step.markId = e.target.value; refresh(); });
    container.querySelector('#ci-x')?.addEventListener('change', (e) => { step.x = Number(e.target.value); refresh(); });
    container.querySelector('#ci-y')?.addEventListener('change', (e) => { step.y = Number(e.target.value); refresh(); });
    container.querySelector('#ci-capcam')?.addEventListener('click', () => {
      const [tx, ty] = camera.screenToTile(G.W / 2, G.H / 2);
      step.x = Math.round(tx * 10) / 10;
      step.y = Math.round(ty * 10) / 10;
      if ('markId' in step) step.markId = '';
      if (step.type === 'vfx') step.who = '';
      refresh(); this.studio.renderInspector();
    });
    container.querySelector('#ci-zoom')?.addEventListener('change', (e) => { step.zoom = Number(e.target.value); refresh(); });
    container.querySelector('#ci-dur')?.addEventListener('change', (e) => { step.dur = Number(e.target.value); refresh(); });
    container.querySelector('#ci-ease')?.addEventListener('change', (e) => { step.ease = e.target.value; refresh(); });
    container.querySelector('#ci-push')?.addEventListener('change', (e) => { step.push = Number(e.target.value); refresh(); });
    container.querySelector('#ci-wait')?.addEventListener('change', (e) => { step.wait = e.target.checked; refresh(); });
    container.querySelector('#ci-cname')?.addEventListener('change', (e) => { step.customName = e.target.value; refresh(); });

    const txtEl = container.querySelector('#ci-text');
    if (txtEl) {
      txtEl.addEventListener('input', () => {
        step.text = txtEl.value;
        const cnt = container.querySelector('#ci-charcnt');
        if (cnt) {
          cnt.textContent = `${txtEl.value.length} / 150 chars`;
          cnt.style.color = txtEl.value.length > 150 ? 'var(--amber)' : 'var(--faint)';
        }
        this.renderTracks(cine);
      });
      txtEl.addEventListener('change', refresh);
    }
    container.querySelectorAll('[data-tok]').forEach((b) => b.addEventListener('click', () => {
      if (!txtEl) return;
      txtEl.value = `${txtEl.value}${txtEl.value && !txtEl.value.endsWith(' ') ? ' ' : ''}${b.dataset.tok}`;
      step.text = txtEl.value;
      refresh(); this.studio.renderInspector();
    }));

    container.querySelector('#ci-pitch')?.addEventListener('change', (e) => {
      step.voice ||= { pitch: 1, wave: 'square' };
      step.voice.pitch = Number(e.target.value) || 1;
      refresh(); this.studio.renderInspector();
    });
    container.querySelector('#ci-wave')?.addEventListener('change', (e) => {
      step.voice ||= { pitch: 1, wave: 'square' };
      step.voice.wave = e.target.value;
      refresh();
    });
    container.querySelector('#ci-testvoice')?.addEventListener('click', () => {
      auditionVoice(step.text || 'Hear my words, mortal!', step.voice || { pitch: 1, wave: 'square' });
    });
    container.querySelector('#ci-mword')?.addEventListener('change', (e) => { step.markWord = e.target.value.trim(); refresh(); });
    container.querySelector('#ci-color')?.addEventListener('change', (e) => { step.color = e.target.value.trim(); refresh(); });
    container.querySelector('#ci-autoframe')?.addEventListener('change', (e) => { step.autoFrame = e.target.checked; refresh(); });
    container.querySelector('#ci-title')?.addEventListener('change', (e) => { step.title = e.target.value; refresh(); });
    container.querySelector('#ci-sub')?.addEventListener('change', (e) => { step.sub = e.target.value; refresh(); });
    container.querySelector('#ci-block')?.addEventListener('change', (e) => { step.block = e.target.checked; refresh(); });
    container.querySelector('#ci-path')?.addEventListener('change', (e) => { step.pathfind = e.target.checked; refresh(); });
    container.querySelector('#ci-vfxkind')?.addEventListener('change', (e) => { step.vfx = e.target.value; refresh(); this.studio.renderInspector(); });
    container.querySelector('#ci-rad')?.addEventListener('change', (e) => { step.radius = Number(e.target.value) || 3.5; refresh(); });
    container.querySelector('#ci-vfxtxt')?.addEventListener('change', (e) => { step.text = e.target.value; refresh(); });
    container.querySelector('#ci-px')?.addEventListener('change', (e) => { step.px = Number(e.target.value); refresh(); });
    container.querySelector('#ci-sfx')?.addEventListener('change', (e) => { step.sound = e.target.value.trim(); refresh(); });
    container.querySelector('#ci-music')?.addEventListener('change', (e) => { step.music = e.target.value.trim(); refresh(); });
    container.querySelector('#ci-doortgt')?.addEventListener('change', (e) => { step.target = e.target.value; refresh(); this.studio.renderInspector(); });
    container.querySelector('#ci-dooridx')?.addEventListener('change', (e) => { step.doorIndex = Number(e.target.value) || 0; refresh(); });
    container.querySelector('#ci-arch')?.addEventListener('change', (e) => { step.arch = e.target.value.trim(); refresh(); });
    container.querySelector('#ci-srank')?.addEventListener('change', (e) => { step.rank = e.target.value; refresh(); });
    container.querySelector('#ci-n')?.addEventListener('change', (e) => {
      const v = Number(e.target.value) || 3;
      if (step.type === 'spawn') step.n = v;
      else step.count = v;
      refresh();
    });
    container.querySelector('#ci-emo')?.addEventListener('change', (e) => { step.emotion = e.target.value.trim(); refresh(); });
    container.querySelector('#ci-lv')?.addEventListener('change', (e) => { step.lv = Number(e.target.value) || 0; refresh(); });
    container.querySelector('#ci-fromclouds')?.addEventListener('change', (e) => { step.fromClouds = e.target.checked; refresh(); });
    container.querySelector('#ci-skboat')?.addEventListener('change', (e) => { step.boatKind = e.target.value; refresh(); });
    container.querySelector('#ci-skdock')?.addEventListener('change', (e) => { step.dock = e.target.value; refresh(); });
    container.querySelector('#ci-skcap')?.addEventListener('change', (e) => { step.captainId = e.target.value; refresh(); });
    container.querySelector('#ci-flact')?.addEventListener('change', (e) => { step.action = e.target.value; refresh(); });
    container.querySelector('#ci-flcapa')?.addEventListener('change', (e) => { step.captainA = e.target.value; refresh(); });
    container.querySelector('#ci-flcapb')?.addEventListener('change', (e) => { step.captainB = e.target.value; refresh(); });
    container.querySelector('#ci-hkact')?.addEventListener('change', (e) => { step.action = e.target.value; refresh(); });
    container.querySelector('#ci-hkvessel')?.addEventListener('change', (e) => { step.vesselKey = e.target.value; refresh(); });
    container.querySelector('#ci-vlact')?.addEventListener('change', (e) => { step.action = e.target.value; refresh(); this.studio.renderInspector(); });
    container.querySelector('#ci-vcast')?.addEventListener('change', (e) => { step.castKey = e.target.value.trim(); refresh(); });
    container.querySelector('#ci-vdz')?.addEventListener('change', (e) => { step.dz = Number(e.target.value) || 0; refresh(); });

    return true;
  }
}
