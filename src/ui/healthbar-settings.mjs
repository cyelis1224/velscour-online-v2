import { G, saveSettings } from '../state.js';
import { UI } from './ui.js';
import { BOSS_HEALTH_LAYOUT, drawHealthBarCanvas, HEALTH_BAR_CLASSES, healthBarCanvasLayout, healthBarSummaryText, healthBarValueText, normalizeHealthBarSettings, preloadHealthBarArt } from './healthbars.mjs';

const VISIBILITY = [
  ['always', 'Always Visible'], ['damaged', 'Only When Damaged'], ['combat', 'Only During Combat'],
  ['targeted', 'Only When Targeted or Hovered'], ['hidden', 'Hidden'],
];
const APPEARANCE = [
  ['width', 'Width', 60, 160, 1], ['height', 'Height', 60, 160, 1], ['opacity', 'Opacity', 15, 100, 1],
  ['verticalOffset', 'Vertical Offset', -60, 60, 1],
];
const CLASS_TOGGLES = [
  ['normal', 'Normal Monsters'], ['champion', 'Champions'], ['unique', 'Unique Monsters'], ['boss', 'Bosses'],
  ['nemesis', 'Nemesis Enemies'], ['imp', 'Treasure Imps'], ['companion', 'Companions / Summons'], ['player', 'Player (Overhead)'],
];
const INFO_TOGGLES = [
  ['showEnemyName', 'Show Enemy Name'], ['showEnemyLevel', 'Show Enemy Level'], ['showHealthPercentage', 'Show Health Percentage'],
  ['showNumericalHealth', 'Show Numerical Health'], ['showAffixIcons', 'Show Affix Icons'], ['showStatusEffectIcons', 'Show Status Effect Icons'],
  ['showClassificationIconsOverhead', 'Show Classification Icons (Overhead)'],
];

const previewEntity = (entry, fraction) => ({
  name: entry.id === 'imp' ? 'Treasure Imp' : entry.label === 'Normal Monster' ? 'Sandstalker' : entry.label === 'Unique Monster' ? "Zahir's Sandstalker" : `${entry.label} Sandstalker`,
  rank: ['normal', 'champion', 'unique', 'boss'].includes(entry.id) ? entry.id : 'normal',
  nemesis: entry.id === 'nemesis', goblin: entry.id === 'imp', summon: entry.id === 'companion',
  team: entry.id === 'companion' ? 'player' : 'enemy', isPlayer: false, hp: 68 * fraction, maxHp: 68, level: 84,
  affixes: ['strong', 'vampiric'], status: { burn: { t: 2 }, chill: { t: 0 } },
});

export function openHealthBarSettings() {
  preloadHealthBarArt();
  const current = normalizeHealthBarSettings(G.settings.healthBars, G.settings.lifeBars !== false);
  G.settings.healthBars = current;
  const bossClassIndex = HEALTH_BAR_CLASSES.findIndex((entry) => entry.id === 'boss');
  let selectedSystem = 'overhead', selectedClass = 0, lastOverheadClass = 0, previewFraction = 1;
  const html = `<div class="healthbar-settings">
    <div class="healthbar-preview-card">
      <div class="healthbar-preview-heading"><b>Preview</b><div data-hb-class-nav><button type="button" class="btn small" data-hb-class-prev aria-label="Previous creature type">‹</button><span data-hb-class-name>Normal Monster</span><button type="button" class="btn small" data-hb-class-next aria-label="Next creature type">›</button></div></div>
      <div class="healthbar-preview-wrap"><canvas data-hb-preview width="980" height="300" aria-label="Health bar preview"></canvas></div>
      <div class="healthbar-preview-controls"><label>Preview bar<select data-hb-system><option value="overhead">Overhead Creature Bar</option><option value="target">Boss Health Bar</option></select></label><label>Preview health<select data-hb-fraction><option value="1">Full</option><option value="0.5">Partial</option><option value="0.08">Nearly Depleted</option></select></label></div>
    </div>
    <div class="healthbar-settings-columns">
      <section class="healthbar-settings-section"><h3>Theme</h3><label class="healthbar-control-row">Health bar theme<select data-hb-theme><option value="velscour">Velscour (Default)</option><option value="classic">Classic</option></select></label>
        <label class="healthbar-control-row">Configure appearance for<select data-hb-system-select><option value="overhead">Overhead Bars</option><option value="target">Boss Health Bar</option></select></label>
        <div class="healthbar-slider-list">${APPEARANCE.map(([key, label, min, max, step]) => `<label class="healthbar-control-row">${label}<span class="healthbar-range"><input type="range" min="${min}" max="${max}" step="${step}" data-hb-appearance="${key}"><output data-hb-output="${key}"></output></span></label>`).join('')}</div>
        <label class="healthbar-check-row"><input type="checkbox" data-hb-appearance="decorativeBorders"> Decorative Borders</label>
        <label class="healthbar-check-row"><input type="checkbox" data-hb-appearance="smoothHealthDepletion"> Smooth Health Depletion</label>
        <label class="healthbar-control-row">Overhead visibility<select data-hb-visibility="overhead">${VISIBILITY.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></label>
        <label class="healthbar-control-row">Boss health bar visibility<select data-hb-visibility="target">${VISIBILITY.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></label>
      </section>
      <section class="healthbar-settings-section"><h3>Creature Visibility</h3><div class="healthbar-toggle-grid">${CLASS_TOGGLES.map(([key, label]) => `<label><input type="checkbox" data-hb-class="${key}"> ${label}</label>`).join('')}</div>
        <h3>Additional Information</h3><div class="healthbar-toggle-grid">${INFO_TOGGLES.map(([key, label]) => `<label><input type="checkbox" data-hb-info="${key}"> ${label}</label>`).join('')}</div>
        <p class="dim healthbar-settings-help">Overhead and boss health bar sizes are independent. Visibility changes affect presentation only; enemy health and targeting are unchanged.</p>
      </section>
    </div>
    <div class="healthbar-settings-actions"><button type="button" class="btn small" data-hb-reset>Reset to Defaults</button></div>
  </div>`;
  const dialog = UI.dialog({ title: 'Health Bars', html, cls: 'healthbar-dialog', buttons: [{ label: 'Apply', cls: 'gold', fn: () => { saveSettings(); } }] });
  const box = dialog.box;
  const canvas = box.querySelector('[data-hb-preview]'), ctx = canvas.getContext('2d');
  canvas.addEventListener('healthbarartready', () => { if (canvas.isConnected) renderPreview(); });
  const set = (obj, key, val) => { obj[key] = val; G.settings.healthBars = normalizeHealthBarSettings(G.settings.healthBars); saveSettings(); };
  const appearanceFor = () => G.settings.healthBars[selectedSystem];
  const renderPreview = () => {
    const s = G.settings.healthBars, entry = HEALTH_BAR_CLASSES[selectedClass], entity = previewEntity(entry, previewFraction);
    const bossTarget = selectedSystem === 'target' && entry.id === 'boss';
    const barW = (selectedSystem === 'target' ? 760 : 560) * s[selectedSystem].width / 100;
    const barH = (selectedSystem === 'target' ? (bossTarget ? 178 : 155) : 42) * s[selectedSystem].height / 100;
    const y = selectedSystem === 'target' ? 34 : 168;
    const previewWidth = Math.max(980, Math.ceil(barW + 220));
    const previewHeight = Math.max(300, Math.ceil(y + barH + (selectedSystem === 'target' ? 80 : 65)));
    if (canvas.width !== previewWidth) canvas.width = previewWidth;
    if (canvas.height !== previewHeight) canvas.height = previewHeight;
    const w = canvas.width, h = canvas.height, x = (w - barW) * 0.5;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8,5,4,.7)'; ctx.fillRect(0, 0, w, h);
    drawHealthBarCanvas(ctx, entity, x, y, barW, barH, { system: selectedSystem, forceFraction: previewFraction });
    const info = s.info;
    const layout = selectedSystem === 'target' ? healthBarCanvasLayout(entry, x, y, barW, barH, selectedSystem) : null;
    const targetTrackCenterX = layout ? layout.track.x + layout.track.width / 2 : x + barW * 0.5;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillStyle = entry.id === 'boss' ? '#ffd29a' : entry.color;
    ctx.font = `700 ${bossTarget ? 14 : selectedSystem === 'target' ? 30 : 24}px Cinzel, Georgia, serif`;
    const name = bossTarget || info.showEnemyName ? entity.name : '';
    if (name) {
      const nameX = selectedSystem === 'target' ? targetTrackCenterX : x + barW * 0.5;
      const nameY = bossTarget ? y + barH * (BOSS_HEALTH_LAYOUT.nameTop + BOSS_HEALTH_LAYOUT.nameHeight / 2) : y + (selectedSystem === 'target' ? barH * 0.28 : -18);
      ctx.fillText(name, nameX, nameY, barW * (bossTarget ? 1 - BOSS_HEALTH_LAYOUT.trackLeft - BOSS_HEALTH_LAYOUT.trackRight : 0.8));
    }
    if (selectedSystem === 'target') {
      const values = healthBarValueText(entity, s);
      if (values) {
        ctx.fillStyle = '#fff0d4'; ctx.font = '700 15px Georgia, serif';
        const valueX = targetTrackCenterX;
        const valueY = layout.track.y + layout.track.height / 2;
        ctx.fillText(values, valueX, valueY, barW * (bossTarget ? 1 - BOSS_HEALTH_LAYOUT.trackLeft - BOSS_HEALTH_LAYOUT.trackRight : 0.62));
      }
    }
    ctx.fillStyle = '#ead9ba'; ctx.font = `${selectedSystem === 'target' ? 18 : 13}px Georgia, serif`;
    const sub = selectedSystem === 'target' ? healthBarSummaryText(entity, s) : (info.showEnemyLevel ? `Lv. ${entity.level}` : '');
    if (sub) ctx.fillText(sub, selectedSystem === 'target' ? targetTrackCenterX : x + barW * 0.5, y + barH * (bossTarget ? BOSS_HEALTH_LAYOUT.summaryTop : 0.76), barW * 0.75);
    ctx.shadowBlur = 0;
    // Target bars already render cached affix/status badges inside the track;
    // keep the overhead-only annotation below its sample rather than over art.
    if (selectedSystem === 'overhead' && s.info.showAffixIcons && entity.affixes.length) {
      ctx.fillStyle = '#dbc5f2'; ctx.font = '13px Georgia, serif'; ctx.fillText('✦ Strong  ·  ✦ Vampiric', w * 0.5, y + barH + 25);
    }
  };
  const refreshControls = () => {
    const s = G.settings.healthBars;
    box.querySelector('[data-hb-theme]').value = s.theme;
    box.querySelector('[data-hb-system-select]').value = selectedSystem;
    for (const [key] of APPEARANCE) {
      const input = box.querySelector(`[data-hb-appearance="${key}"]`); input.value = String(s[selectedSystem][key]);
      box.querySelector(`[data-hb-output="${key}"]`).textContent = key === 'verticalOffset' ? `${s[selectedSystem][key]} px` : `${s[selectedSystem][key]}%`;
    }
    for (const key of ['decorativeBorders', 'smoothHealthDepletion']) box.querySelector(`[data-hb-appearance="${key}"]`).checked = s[selectedSystem][key];
    box.querySelectorAll('[data-hb-visibility]').forEach((control) => control.value = s[control.dataset.hbVisibility].visibility);
    box.querySelectorAll('[data-hb-class]').forEach((control) => control.checked = !!s.classes[control.dataset.hbClass]);
    box.querySelectorAll('[data-hb-info]').forEach((control) => control.checked = !!s.info[control.dataset.hbInfo]);
    box.querySelector('[data-hb-class-name]').textContent = HEALTH_BAR_CLASSES[selectedClass].label;
    box.querySelector('[data-hb-class-nav]').hidden = selectedSystem === 'target';
    renderPreview();
  };
  const setPreviewSystem = (next) => {
    if (next === selectedSystem) return;
    if (selectedSystem === 'overhead') lastOverheadClass = selectedClass;
    selectedSystem = next;
    selectedClass = next === 'target' ? bossClassIndex : lastOverheadClass;
    box.querySelector('[data-hb-system]').value = selectedSystem;
    box.querySelector('[data-hb-system-select]').value = selectedSystem;
    refreshControls();
  };
  box.querySelector('[data-hb-theme]').onchange = (e) => { set(G.settings.healthBars, 'theme', e.target.value); renderPreview(); };
  box.querySelector('[data-hb-system-select]').onchange = (e) => setPreviewSystem(e.target.value);
  box.querySelector('[data-hb-system]').onchange = (e) => setPreviewSystem(e.target.value);
  box.querySelector('[data-hb-fraction]').onchange = (e) => { previewFraction = Number(e.target.value); renderPreview(); };
  box.querySelector('[data-hb-class-prev]').onclick = () => { selectedClass = (selectedClass + HEALTH_BAR_CLASSES.length - 1) % HEALTH_BAR_CLASSES.length; lastOverheadClass = selectedClass; refreshControls(); };
  box.querySelector('[data-hb-class-next]').onclick = () => { selectedClass = (selectedClass + 1) % HEALTH_BAR_CLASSES.length; lastOverheadClass = selectedClass; refreshControls(); };
  box.querySelectorAll('[data-hb-appearance]').forEach((control) => {
    const update = () => {
      const key = control.dataset.hbAppearance, value = control.type === 'checkbox' ? control.checked : Number(control.value);
      set(appearanceFor(), key, value);
      const output = box.querySelector(`[data-hb-output="${key}"]`);
      if (output) output.textContent = key === 'verticalOffset' ? `${value} px` : `${value}%`;
      renderPreview();
    };
    control.oninput = control.onchange = update;
  });
  box.querySelectorAll('[data-hb-visibility]').forEach((control) => control.onchange = () => {
    const s = G.settings.healthBars[control.dataset.hbVisibility]; set(s, 'visibility', control.value);
  });
  box.querySelectorAll('[data-hb-class]').forEach((control) => control.onchange = () => {
    set(G.settings.healthBars.classes, control.dataset.hbClass, control.checked);
  });
  box.querySelectorAll('[data-hb-info]').forEach((control) => control.onchange = () => {
    set(G.settings.healthBars.info, control.dataset.hbInfo, control.checked); renderPreview();
  });
  box.querySelector('[data-hb-reset]').onclick = () => {
    G.settings.healthBars = normalizeHealthBarSettings(null, true); saveSettings(); refreshControls();
  };
  refreshControls();
  return dialog;
}
