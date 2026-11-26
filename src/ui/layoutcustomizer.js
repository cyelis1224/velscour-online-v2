import { G, saveSettings } from '../state.js';
import { el, escapeHtml } from '../core/util.js';
import { UI } from './ui.js';
import {
  activeLayoutMap, characterLayoutId, clampUILayoutAnchor, cloneLayoutValue, createDefaultLayoutState, effectiveLayoutEntry, snapUILayoutPosition,
  exportLayoutProfile, importLayoutProfile, layoutEditorRect, layoutParentScale, migrateEnvironmentInfoLayout, migrateGroupedHudLayout, normalizeLayoutEntry, normalizeLayoutState,
  writableLayoutEntry,
} from './ui-layout.mjs';

const DEFINITIONS = [
  ['environment-info', 'Environment Information', '.hud-environment-info', .02, .04],
  ['character-portrait', 'Character portrait', '.character-portrait-hud', .02, .04],
  ['main-action-bar', 'Main Action Bar', '#hud-bar', .5, .84],
  ['class-resource', 'Class resource', '#gauge-box', .5, .75],
  ['special-actions', 'Special ability buttons', '#special-actions', .5, .68],
  ['buff-icons', 'Buff Icons', '#buff-row', .02, .53], ['debuff-icons', 'Debuff Icons', '#debuff-row', .02, .59], ['statistics', 'Character stats and damage meter', '#hero-stats', .02, .19],
  ['current-enemy', 'Current / previous enemy', '#target-box', .02, .36], ['minimap', 'Minimap and markers', '#minimap-row', .84, .03],
  ['boss-health', 'Boss health bar', '#boss-bar', .5, .03], ['quest-tracker', 'Objective and event tracker', '#sand-objective', .77, .28],
  ['rift-tracker', 'Rift tracker', '#rift-bar', .76, .2],
  ['notifications', 'Notifications and event announcements', '#center-msg', .5, .42], ['adventurers-log', "Adventurer's Log", '#game-chat', .02, .58],
  ['game-log', 'Combat and loot messages', '#log', .02, .69], ['hud-buttons', 'HUD menu buttons', '#hud-buttons', .96, .62],
  ['damage-numbers', 'Floating damage numbers', null, .5, .5, 'canvas'],
];
const DEFAULTS = new Map(DEFINITIONS.map(([id, label, selector, x, y, mode]) => [id, { id, label, selector, x, y, mode }]));
const clone = cloneLayoutValue;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const POSITION_STYLE_PROPS = ['position', 'left', 'top', 'right', 'bottom', 'translate', 'scale', 'width', 'height', 'transform', 'transform-origin', 'margin', 'box-sizing'];
const STYLE_PROPS = [...POSITION_STYLE_PROPS, 'opacity'];
const nativeStyles = new WeakMap();
const managedStyles = new WeakMap();
const appliedStyleText = new WeakMap();

function styleText(node) { return node?.getAttribute?.('style') || node?.style?.cssText || ''; }
function layoutStyleSnapshot(node) {
  return { text: styleText(node), properties: Object.fromEntries(POSITION_STYLE_PROPS.map((prop) => [prop, node.style.getPropertyValue(prop)])) };
}
function layoutStyleWasReset(node) {
  const previous = appliedStyleText.get(node);
  if (!previous) return true;
  const currentText = styleText(node);
  if (!currentText && previous.text) return true;
  return POSITION_STYLE_PROPS.some((prop) => node.style.getPropertyValue(prop) !== previous.properties[prop]);
}

function nativeStyle(node) {
  let original = nativeStyles.get(node);
  if (!original) {
    original = Object.fromEntries(STYLE_PROPS.map((prop) => [prop, { value: node.style.getPropertyValue(prop), priority: node.style.getPropertyPriority(prop) }]));
    nativeStyles.set(node, original);
  }
  return original;
}
function restoreStyle(node, prop, entry) {
  const value = entry?.value || '', priority = entry?.priority || '';
  if (node.style.getPropertyValue(prop) === value && node.style.getPropertyPriority(prop) === priority) return;
  if (value) node.style.setProperty(prop, value, priority);
  else node.style.removeProperty(prop);
}
function setManagedStyle(node, prop, value, enabled) {
  let managed = managedStyles.get(node);
  if (!managed) { managed = new Set(); managedStyles.set(node, managed); }
  if (enabled) {
    if (node.style.getPropertyValue(prop) !== value || node.style.getPropertyPriority(prop)) node.style.setProperty(prop, value);
    managed.add(prop);
  }
  else if (managed.has(prop)) { restoreStyle(node, prop, nativeStyle(node)[prop]); managed.delete(prop); }
}

function layoutState() {
  if (!G.settings.uiLayouts || typeof G.settings.uiLayouts !== 'object') G.settings.uiLayouts = createDefaultLayoutState();
  else G.settings.uiLayouts = normalizeLayoutState(G.settings.uiLayouts);
  const state = G.settings.uiLayouts;
  const migratedEnvironment = migrateEnvironmentInfoLayout(state), migratedHud = migrateGroupedHudLayout(state);
  if (migratedEnvironment || migratedHud) saveSettings();
  return state;
}

function stableProfileKey(name, source = layoutState()) {
  const base = String(name || 'Layout').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'layout';
  let key = base, n = 2; while (source.profiles[key]) key = `${base}-${n++}`;
  return key;
}

function fileName(name) { return String(name || 'velscour-ui-layout').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'velscour-ui-layout'; }

export const UILayoutCustomizer = {
  dialog: null, stage: null, toolbox: null, working: null, original: null, selected: 'character-portrait', visibilityObserver: null,
  undoStack: [], redoStack: [], overlayNodes: new Map(), observedElements: new Map(), guides: null, pointer: null, toolboxDrag: null, pauseScreen: null,
  get state() { return this.working || layoutState(); },
  get map() { return activeLayoutMap(this.state, characterLayoutId(G.char)); },

  registerElement({ id, label, selector = null, x = .5, y = .5, mode = 'dom' } = {}) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(String(id || ''))) throw new TypeError('UI layout elements need a short, stable identifier.');
    const descriptor = { id: String(id), label: String(label || id), selector, x: clamp(Number(x) || 0, 0, 1), y: clamp(Number(y) || 0, 0, 1), mode };
    DEFAULTS.set(descriptor.id, descriptor);
    const index = DEFINITIONS.findIndex((entry) => entry[0] === descriptor.id);
    const tuple = [descriptor.id, descriptor.label, descriptor.selector, descriptor.x, descriptor.y, descriptor.mode];
    if (index < 0) DEFINITIONS.push(tuple); else DEFINITIONS[index] = tuple;
    const node = selector ? document.querySelector(selector) : null;
    if (node) { this.trackElementNode(descriptor.id, node); this.applyElement(descriptor.id, node); }
    if (this.dialog) { this.renderAll(); this.renderSelection(); }
    return descriptor.id;
  },
  hasElement(id) { return DEFAULTS.has(id); },

  entry(id) { const state = this.state; return writableLayoutEntry(state, id, characterLayoutId(G.char)); },
  effective(id, state = this.state) { return effectiveLayoutEntry(state, id, characterLayoutId(G.char)) || normalizeLayoutEntry(); },
  hasSavedPosition(id, state = this.state) { const entry = this.effective(id, state); return entry.x != null || entry.y != null; },
  node(id) { const def = DEFAULTS.get(id); return def?.selector ? document.querySelector(def.selector) : null; },
  trackElementNode(id, node) {
    if (!node) return false;
    const changed = this.observedElements.get(id) !== node;
    this.observedElements.set(id, node);
    this.visibilityObserver?.observe(node, { attributes: true, attributeFilter: ['class', 'style'] });
    return changed;
  },
  recordPosition(id, node = this.node(id), includeSize = false) {
    if (!node || this.working) return;
    const rect = node.getBoundingClientRect(); if (!rect || !rect.width || !rect.height) return;
    const entry = this.entry(id); entry.x = clamp(rect.left / innerWidth, 0, 1); entry.y = clamp(rect.top / innerHeight, 0, 1);
    if (includeSize) {
      const scale = entry.scale / 100, parentScale = this.parentScale(node);
      entry.width = rect.width / scale / parentScale.x; entry.height = rect.height / scale / parentScale.y;
    }
    saveSettings(); this.applyElement(id, node);
  },
  resetElementPosition(id) {
    const entry = this.map[id]; if (entry) { entry.x = null; entry.y = null; if (!this.working) saveSettings(); }
    this.applyElement(id);
    if (this.dialog) { this.renderAll(); this.renderSelection(); }
  },
  resetElementSize(id) {
    const entry = this.map[id]; if (entry) { entry.width = null; entry.height = null; if (!this.working) saveSettings(); }
    this.applyElement(id);
    if (this.dialog) { this.renderAll(); this.renderSelection(); }
  },
  baseRect(node) {
    if (!node) return null;
    const style = node.style, saved = Object.fromEntries(STYLE_PROPS.map((prop) => [prop, { value: style.getPropertyValue(prop), priority: style.getPropertyPriority(prop) }]));
    const original = nativeStyle(node);
    for (const prop of managedStyles.get(node) || []) restoreStyle(node, prop, original[prop]);
    const rect = node.getBoundingClientRect();
    for (const prop of STYLE_PROPS) restoreStyle(node, prop, saved[prop]);
    return rect;
  },
  parentScale(node) {
    const parent = node?.parentElement;
    if (!parent) return { x: 1, y: 1 };
    return layoutParentScale(parent.getBoundingClientRect(), parent.offsetWidth, parent.offsetHeight);
  },
  editorRect(node) {
    if (!node) return null;
    let rect = layoutEditorRect(node.getBoundingClientRect());
    if (rect) return rect;
    // Persistent HUD elements can be intentionally hidden while their editor outline is
    // still useful. Reveal only for this synchronous measurement, then restore every bit
    // of the element's state before the browser can paint.
    const hadHidden = node.classList.contains('hidden'), hadLayoutHidden = node.classList.contains('ui-layout-hidden');
    const display = { value: node.style.getPropertyValue('display'), priority: node.style.getPropertyPriority('display') };
    const visibility = { value: node.style.getPropertyValue('visibility'), priority: node.style.getPropertyPriority('visibility') };
    node.classList.remove('hidden', 'ui-layout-hidden');
    if (display.value === 'none') node.style.removeProperty('display');
    node.style.setProperty('visibility', 'hidden', 'important');
    if (getComputedStyle(node).display === 'none') node.style.setProperty('display', 'block', 'important');
    rect = layoutEditorRect(node.getBoundingClientRect());
    if (hadHidden) node.classList.add('hidden');
    if (hadLayoutHidden) node.classList.add('ui-layout-hidden');
    if (display.value) node.style.setProperty('display', display.value, display.priority); else node.style.removeProperty('display');
    if (visibility.value) node.style.setProperty('visibility', visibility.value, visibility.priority); else node.style.removeProperty('visibility');
    return rect;
  },
  applyElement(id, node = this.node(id)) {
    const state = this.state, def = DEFAULTS.get(id), entry = this.effective(id, state), configured = !!effectiveLayoutEntry(state, id, characterLayoutId(G.char));
    if (!def) return;
    if (def.mode === 'canvas') {
      G.settings.uiFloatingText = configured ? { scale: entry.scale, opacity: entry.opacity, visible: entry.visible } : null;
      return;
    }
    if (!node) return;
    this.trackElementNode(id, node);
    nativeStyle(node);
    node.classList.toggle('ui-layout-hidden', !entry.visible);
    if (id === 'environment-info') node.style.textAlign = entry?.textAlign || 'left';
    if (id === 'buff-icons' || id === 'debuff-icons') {
      const anchor = entry?.anchor || 'left';
      node.dataset.anchor = anchor;
      node.style.justifyContent = ({ left: 'flex-start', right: 'flex-end', center: 'center' })[anchor];
    }
    const rect = this.baseRect(node);
    if (!rect || !rect.width || !rect.height) { appliedStyleText.set(node, layoutStyleSnapshot(node)); return; }
    const k = entry.scale / 100, parentScale = this.parentScale(node);
    let w = Math.min(entry.width || rect.width / parentScale.x, innerWidth / (k * parentScale.x));
    let h = Math.min(entry.height || rect.height / parentScale.y, innerHeight / (k * parentScale.y));
    if (id === 'main-action-bar') {
      const ratio = (rect.width / parentScale.x) / (rect.height / parentScale.y);
      if (entry.width && !entry.height) h = w / ratio;
      else if (entry.height && !entry.width) w = h * ratio;
      else if (entry.width && entry.height) h = w / ratio;
    }
    const positioned = entry.x != null || entry.y != null;
    const anchor = clampUILayoutAnchor(entry.x == null ? rect.left : entry.x * innerWidth, entry.y == null ? rect.top : entry.y * innerHeight,
      w * parentScale.x, h * parentScale.y, k, { width: innerWidth, height: innerHeight });
    const targetX = anchor.x, targetY = anchor.y;
    // A saved position is a viewport anchor. Detach it from the element's former grid/flex slot and CSS centering
    // transform so changing content, classes, sibling heights, or parent layout cannot shift that anchor.
    setManagedStyle(node, 'position', 'fixed', positioned);
    setManagedStyle(node, 'left', positioned ? `${targetX}px` : '', positioned);
    setManagedStyle(node, 'top', positioned ? `${targetY}px` : '', positioned);
    setManagedStyle(node, 'right', 'auto', positioned);
    setManagedStyle(node, 'bottom', 'auto', positioned);
    setManagedStyle(node, 'translate', 'none', positioned);
    setManagedStyle(node, 'transform', 'none', positioned);
    setManagedStyle(node, 'transform-origin', positioned ? 'top left' : 'center center', positioned || entry.scale !== 100);
    setManagedStyle(node, 'margin', '0', positioned);
    setManagedStyle(node, 'box-sizing', 'border-box', positioned && !!(entry.width || entry.height));
    setManagedStyle(node, 'scale', String(k), entry.scale !== 100);
    setManagedStyle(node, 'opacity', String(entry.opacity / 100), entry.opacity !== 100);
    const sized = id === 'main-action-bar' ? !!(entry.width || entry.height) : false;
    setManagedStyle(node, 'width', `${w}px`, !!entry.width || sized);
    setManagedStyle(node, 'height', `${h}px`, !!entry.height || sized);
    appliedStyleText.set(node, layoutStyleSnapshot(node));
  },
  applyAll() { for (const [id] of DEFINITIONS) this.applyElement(id); },

  open() {
    if (this.dialog) return;
    this.original = clone(layoutState()); this.working = clone(this.original); this.undoStack = []; this.redoStack = [];
    this.selected = 'character-portrait';
    this.pauseScreen = UI.screensEl?.querySelector('.pause-dialog')?.closest('.screen') || null;
    this.pauseScreen?.classList.add('ui-layout-pause-hidden');
    const d = UI.dialog({ title: '', html: '<div class="ui-layout-stage" aria-label="UI layout preview"></div><aside class="ui-layout-toolbox"><div class="ui-layout-toolbox-content"></div><footer class="ui-layout-toolbox-actions"><div class="ui-layout-toolbox-actions-secondary"><button type="button" data-editor-action="undo">Undo</button><button type="button" data-editor-action="redo">Redo</button><button type="button" data-editor-action="reset-selected">Reset Selected</button><button type="button" data-editor-action="reset-all">Reset All</button></div><div class="ui-layout-toolbox-actions-primary"><button type="button" class="ui-layout-save" data-editor-action="save">Save &amp; Apply</button><button type="button" class="ui-layout-cancel" data-editor-action="cancel">Cancel</button></div></footer></aside>', cls: 'ui-layout-dialog', closable: false });
    this.dialog = d; d.wrap.classList.add('ui-layout-screen');
    d.box.querySelector(':scope > .row')?.remove();
    d.box.setAttribute('role', 'application'); d.box.setAttribute('aria-label', 'Customize UI');
    this.stage = d.box.querySelector('.ui-layout-stage'); this.toolbox = d.box.querySelector('.ui-layout-toolbox');
    this.toolboxContent = this.toolbox.querySelector('.ui-layout-toolbox-content');
    const actions = { save: () => this.save(), cancel: () => this.cancel(), undo: () => this.undo(), redo: () => this.redo(), 'reset-selected': () => this.resetSelected(), 'reset-all': () => this.confirmResetAll() };
    this.toolbox.querySelectorAll('[data-editor-action]').forEach((button) => { button.onclick = actions[button.dataset.editorAction]; });
    this.guides = el('div', 'ui-layout-guides'); this.stage.appendChild(this.guides);
    this.bind(); this.applyAll(); this.renderAll(); this.renderSelection(); this.restoreToolboxPosition();
    const escape = (e) => { if (e.key !== 'Escape') return; e.preventDefault(); e.stopImmediatePropagation(); this.cancel(); };
    d.wrap.addEventListener('keydown', escape, true); d.box.tabIndex = -1; d.box.focus(); this.escapeHandler = escape;
    this.resizeHandler = () => { this.applyAll(); this.renderAll(); this.clampToolbox(); };
    window.addEventListener('resize', this.resizeHandler);
    this.toolboxPointerMove = (event) => this.moveToolbox(event);
    this.toolboxPointerEnd = (event) => this.endToolboxDrag(event);
    window.addEventListener('pointermove', this.toolboxPointerMove);
    window.addEventListener('pointerup', this.toolboxPointerEnd);
    window.addEventListener('pointercancel', this.toolboxPointerEnd);
    window.addEventListener('blur', this.toolboxPointerEnd);
    return d;
  },

  close(cleanup = true) {
    if (!this.dialog) return;
    if (cleanup) {
      window.removeEventListener('resize', this.resizeHandler);
      this.dialog.wrap.removeEventListener('keydown', this.escapeHandler, true);
      this.stage?.removeEventListener('pointerdown', this.stageDown);
      window.removeEventListener('pointermove', this.pointerMove);
      window.removeEventListener('pointerup', this.pointerUp);
      window.removeEventListener('pointercancel', this.pointerUp);
      window.removeEventListener('blur', this.pointerUp);
      window.removeEventListener('pointermove', this.toolboxPointerMove);
      window.removeEventListener('pointerup', this.toolboxPointerEnd);
      window.removeEventListener('pointercancel', this.toolboxPointerEnd);
      window.removeEventListener('blur', this.toolboxPointerEnd);
      this.applyAll();
    }
    this.dialog.close(); this.dialog = this.stage = this.toolbox = this.toolboxContent = this.guides = null;
    this.pauseScreen?.classList.remove('ui-layout-pause-hidden');
    this.pauseScreen = null;
    this.working = this.original = null; this.pointer = this.toolboxDrag = null;
    for (const node of this.overlayNodes.values()) node.remove();
    this.overlayNodes.clear();
  },

  bind() {
    this.stageDown = (event) => {
      const item = event.target.closest('[data-layout-id]'); if (!item || !this.stage.contains(item)) return;
      event.preventDefault(); event.stopPropagation();
      const id = item.dataset.layoutId; this.selected = id; this.renderSelection();
      for (const [otherId, box] of this.overlayNodes) box.classList.toggle('selected', otherId === id);
      if (DEFAULTS.get(id)?.mode === 'canvas') return;
      if (this.effective(id).locked) { this.renderAll(); this.renderSelection(); return; }
      if (event.target.closest('.ui-layout-resize')) {
        const r = item.getBoundingClientRect(), entry = this.entry(id), scale = entry.scale / 100, parentScale = this.parentScale(this.node(id));
        this.pointer = { id, mode: 'resize', pointerId: event.pointerId, x: event.clientX, y: event.clientY, width: r.width / scale / parentScale.x, height: r.height / scale / parentScale.y, parentScale, before: clone(this.state), changed: false };
      } else {
        const r = item.getBoundingClientRect();
        this.pointer = { id, mode: 'move', pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: r.left, top: r.top, before: clone(this.state), changed: false };
      }
      item.setPointerCapture?.(event.pointerId);
    };
    this.pointerMove = (event) => {
      const p = this.pointer; if (!p || p.pointerId !== event.pointerId) return;
      if (event.buttons !== undefined && (event.buttons & 1) === 0) { this.finishPointer(event); return; }
      if (!p.changed && (event.clientX !== p.x || event.clientY !== p.y)) { this.pushUndo(p.before); p.changed = true; }
      const entry = this.entry(p.id), def = DEFAULTS.get(p.id), node = this.node(p.id), rect = node && this.baseRect(node);
      if (p.mode === 'move') {
        const width = this.overlayNodes.get(p.id)?.offsetWidth || (rect?.width || 180) * entry.scale / 100;
        const height = this.overlayNodes.get(p.id)?.offsetHeight || (rect?.height || 54) * entry.scale / 100;
        let x = p.left + event.clientX - p.x, y = p.top + event.clientY - p.y;
        ({ x, y } = this.snap(x, y, width, height, p.id));
        entry.x = clamp(x / innerWidth, 0, Math.max(0, innerWidth - Math.min(width, innerWidth)) / innerWidth);
        entry.y = clamp(y / innerHeight, 0, Math.max(0, innerHeight - Math.min(height, innerHeight)) / innerHeight);
      } else {
        let width = clamp(p.width + (event.clientX - p.x) / p.parentScale.x, 80, innerWidth / (entry.scale / 100) / p.parentScale.x);
        let height = clamp(p.height + (event.clientY - p.y) / p.parentScale.y, 28, innerHeight / (entry.scale / 100) / p.parentScale.y);
        if (p.id === 'main-action-bar') {
          const ratio = p.width / p.height;
          if (Math.abs(event.clientX - p.x) >= Math.abs(event.clientY - p.y)) height = width / ratio;
          else width = height * ratio;
        }
        entry.width = width; entry.height = height;
      }
      this.applyElement(p.id); this.updateOverlay(p.id, false); this.renderGuides();
    };
    this.pointerUp = (event) => this.finishPointer(event);
    this.stage.addEventListener('pointerdown', this.stageDown);
    window.addEventListener('pointermove', this.pointerMove); window.addEventListener('pointerup', this.pointerUp); window.addEventListener('pointercancel', this.pointerUp);
    window.addEventListener('blur', this.pointerUp);
  },

  finishPointer(event) {
    if (!this.pointer || (event?.pointerId != null && this.pointer.pointerId !== event.pointerId)) return;
    this.pointer = null;
    this.renderAll(); this.renderSelection();
  },

  startToolboxDrag(event) {
    if (event.button !== 0 || event.target.closest('button, input, select, a')) return;
    const r = this.toolbox.getBoundingClientRect();
    this.toolboxDrag = { pointerId: event.pointerId, x: event.clientX - r.left, y: event.clientY - r.top };
    this.toolbox.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  },
  moveToolbox(event) {
    const drag = this.toolboxDrag; if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.buttons !== undefined && (event.buttons & 1) === 0) { this.endToolboxDrag(event); return; }
    const width = this.toolbox.offsetWidth, height = this.toolbox.offsetHeight;
    const left = clamp(event.clientX - drag.x, 8, Math.max(8, innerWidth - width - 8));
    const top = clamp(event.clientY - drag.y, 8, Math.max(8, innerHeight - height - 8));
    Object.assign(this.toolbox.style, { left: `${left}px`, top: `${top}px`, right: 'auto', transform: 'none' });
  },
  restoreToolboxPosition() {
    const position = G.settings.uiLayoutEditorPosition;
    if (!this.toolbox || !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return;
    const left = clamp(position.x * innerWidth, 8, Math.max(8, innerWidth - this.toolbox.offsetWidth - 8));
    const top = clamp(position.y * innerHeight, 8, Math.max(8, innerHeight - this.toolbox.offsetHeight - 8));
    Object.assign(this.toolbox.style, { left: `${left}px`, top: `${top}px`, right: 'auto', transform: 'none' });
  },
  clampToolbox() {
    if (!this.toolbox || this.toolbox.style.left === '') return;
    const width = this.toolbox.offsetWidth, height = this.toolbox.offsetHeight;
    const left = clamp(parseFloat(this.toolbox.style.left) || 0, 8, Math.max(8, innerWidth - width - 8));
    const top = clamp(parseFloat(this.toolbox.style.top) || 0, 8, Math.max(8, innerHeight - height - 8));
    Object.assign(this.toolbox.style, { left: `${left}px`, top: `${top}px` });
  },
  endToolboxDrag(event) {
    if (!this.toolboxDrag || (event?.pointerId != null && this.toolboxDrag.pointerId !== event.pointerId)) return;
    this.toolboxDrag = null;
    if (this.toolbox) {
      const rect = this.toolbox.getBoundingClientRect();
      G.settings.uiLayoutEditorPosition = { x: clamp(rect.left / innerWidth, 0, 1), y: clamp(rect.top / innerHeight, 0, 1) };
      saveSettings();
    }
  },

  snap(x, y, width, height, id) {
    const s = this.state, neighbors = [];
    for (const [otherId, node] of this.overlayNodes) if (otherId !== id) {
      const r = node.getBoundingClientRect(); neighbors.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    }
    const result = snapUILayoutPosition(x, y, width, height, { width: innerWidth, height: innerHeight }, s, neighbors);
    if (this.guides) this.guides.innerHTML = result.guides.map((g) => `<i class="${g.axis === 'horizontal' ? 'x' : 'y'}" style="${g.axis === 'horizontal' ? 'top' : 'left'}:${g.position}px"></i>`).join('');
    return result;
  },

  updateOverlay(id, refresh = false) {
    if (!this.stage) return null;
    const tuple = DEFINITIONS.find((entry) => entry[0] === id); if (!tuple) return null;
    const [, label, selector, , , mode] = tuple;
    const node = selector ? document.querySelector(selector) : null, entry = this.effective(id);
    if (refresh && node) this.applyElement(id, node);
    const rect = node && this.editorRect(node);
    const present = !!(rect && !node.classList.contains('hidden') && !node.classList.contains('ui-layout-hidden') && entry.visible && getComputedStyle(node).display !== 'none');
    let box = this.overlayNodes.get(id);
    if ((!node && mode !== 'canvas') || (mode === 'canvas' && !node) || !rect) { box?.remove(); this.overlayNodes.delete(id); return null; }
    if (!this.state.showHidden && !present) { box?.remove(); this.overlayNodes.delete(id); return null; }
    if (!box) {
      box = el('button', 'ui-layout-item'); box.type = 'button'; box.dataset.layoutId = id;
      this.stage.appendChild(box); this.overlayNodes.set(id, box);
    }
    box.className = `ui-layout-item${id === this.selected ? ' selected' : ''}${!present ? ' placeholder' : ''}${entry.locked ? ' locked' : ''}${mode === 'canvas' ? ' world-positioned' : ''}`;
    box.title = `${label}${entry.locked ? ' (locked)' : ''}`;
    const contentKey = `${label}|${mode}|${present}|${entry.locked}`;
    if (box.dataset.contentKey !== contentKey) {
      box.innerHTML = `<span>${escapeHtml(label)}${mode === 'canvas' ? ' (world-positioned)' : present ? '' : ' (placeholder)'}</span>${entry.locked ? '<b class="ui-layout-lock-mark">LOCK</b>' : ''}${mode === 'canvas' ? '' : '<i class="ui-layout-resize" aria-label="Resize"></i>'}`;
      box.dataset.contentKey = contentKey;
    }
    Object.assign(box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, opacity: String(entry.opacity / 100) });
    return box;
  },

  renderAll(refresh = true) {
    if (!this.stage) return;
    const active = new Set();
    for (const [id] of DEFINITIONS) { this.updateOverlay(id, refresh); if (this.overlayNodes.has(id)) active.add(id); }
    for (const [id, box] of this.overlayNodes) if (!active.has(id)) { box.remove(); this.overlayNodes.delete(id); }
    this.renderGuides();
  },

  renderGuides() {
    if (!this.guides) return;
    const selected = this.overlayNodes.get(this.selected); if (!selected) return;
    const r = selected.getBoundingClientRect(), xs = [r.left, r.right, r.left + r.width / 2], ys = [r.top, r.bottom, r.top + r.height / 2];
    this.guides.innerHTML = `<i class="x" style="top:${ys[2]}px"></i><i class="y" style="left:${xs[2]}px"></i>`;
  },

  renderSelection() {
    if (!this.toolboxContent) return;
    const entry = this.effective(this.selected), selected = DEFAULTS.get(this.selected), profile = this.state.profiles[this.state.activeProfile];
    const options = Object.entries(this.state.profiles).map(([key, p]) => `<option value="${escapeHtml(key)}" ${key === this.state.activeProfile ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
    this.toolboxContent.innerHTML = `
      <header class="ui-layout-toolbox-title"><b>Customize UI</b><button type="button" data-layout-close aria-label="Close">×</button></header>
      <label>Layout profile<select data-profile>${options}</select></label>
      <div class="ui-layout-profile-actions"><button data-profile-action="create">New</button><button data-profile-action="rename">Rename</button><button data-profile-action="duplicate">Duplicate</button><button data-profile-action="delete" ${this.state.activeProfile === 'default' ? 'disabled' : ''}>Delete</button></div>
      <label class="ui-layout-check"><input type="checkbox" data-character ${this.state.characterSpecific ? 'checked' : ''}> Character-specific override</label>
      <label>Element<select data-element>${DEFINITIONS.map(([id, name]) => `<option value="${id}" ${id === this.selected ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label>
      <div class="ui-layout-selected">${escapeHtml(selected?.label || this.selected)}</div>
      ${this.selected === 'environment-info' ? `<label>Text alignment<select data-custom-field="textAlign"><option value="left" ${entry.textAlign === 'left' ? 'selected' : ''}>Left aligned</option><option value="center" ${entry.textAlign === 'center' ? 'selected' : ''}>Center aligned</option><option value="right" ${entry.textAlign === 'right' ? 'selected' : ''}>Right aligned</option></select></label>` : ''}
      ${this.selected === 'buff-icons' || this.selected === 'debuff-icons' ? `<label>Icon anchor<select data-custom-field="anchor"><option value="left" ${entry.anchor === 'left' ? 'selected' : ''}>Left — grow right</option><option value="right" ${entry.anchor === 'right' ? 'selected' : ''}>Right — grow left</option><option value="center" ${entry.anchor === 'center' ? 'selected' : ''}>Center — expand outward</option></select></label>` : ''}
      <label>Scale <output data-out="scale">${entry.scale}%</output><input type="range" data-field="scale" min="50" max="200" step="5" value="${entry.scale}"></label>
      <label>Opacity <output data-out="opacity">${entry.opacity}%</output><input type="range" data-field="opacity" min="10" max="100" step="5" value="${entry.opacity}"></label>
      ${selected?.mode === 'canvas' ? '<p class="ui-layout-world-note">World-positioned text follows its target. Its scale, opacity and visibility are customizable here.</p>' : `<div class="ui-layout-dimensions"><label>Width <input type="number" data-field="width" min="80" max="2400" value="${entry.width || ''}" placeholder="Auto"></label><label>Height <input type="number" data-field="height" min="28" max="1600" value="${entry.height || ''}" placeholder="Auto"></label></div>`}
      <label class="ui-layout-check"><input type="checkbox" data-field="visible" ${entry.visible ? 'checked' : ''}> Show element</label>
      <label class="ui-layout-check"><input type="checkbox" data-field="locked" ${entry.locked ? 'checked' : ''}> Lock position</label>
      <hr><label class="ui-layout-check"><input type="checkbox" data-setting="snapGrid" ${this.state.snapGrid ? 'checked' : ''}> Snap to grid</label>
      <label>Grid size <input type="range" data-setting="grid" min="4" max="64" step="4" value="${this.state.grid}"></label>
      <label class="ui-layout-check"><input type="checkbox" data-setting="snapEdges" ${this.state.snapEdges ? 'checked' : ''}> Snap to screen edges</label>
      <label class="ui-layout-check"><input type="checkbox" data-setting="snapNeighbors" ${this.state.snapNeighbors ? 'checked' : ''}> Snap to neighbors</label>
      <label class="ui-layout-check"><input type="checkbox" data-setting="showHidden" ${this.state.showHidden ? 'checked' : ''}> Show hidden placeholders</label>
      <div class="ui-layout-profile-actions"><button data-profile-action="export">Export</button><button data-profile-action="import">Import</button><button data-profile-action="default">Restore Default Profile</button></div>
      <input type="file" data-layout-file accept="application/json,.json" hidden>
      <small>Drag an outline to move it. Drag its corner to resize. Positions adapt to the current screen.</small>`;
    const titlebar = this.toolboxContent.querySelector('.ui-layout-toolbox-title');
    titlebar.onpointerdown = (event) => this.startToolboxDrag(event);
    this.toolboxContent.querySelector('[data-layout-close]').onclick = () => this.cancel();
    this.toolboxContent.querySelector('[data-profile]').onchange = (e) => { this.pushUndo(); this.state.activeProfile = e.target.value; this.selected = 'character-portrait'; this.renderAll(); this.applyAll(); this.renderSelection(); };
    this.toolboxContent.querySelector('[data-element]').onchange = (e) => { this.selected = e.target.value; this.renderAll(); this.renderSelection(); };
    this.toolboxContent.querySelector('[data-character]').onchange = (e) => { this.pushUndo(); this.state.characterSpecific = e.target.checked; this.renderAll(); this.applyAll(); this.renderSelection(); };
    this.toolboxContent.querySelectorAll('[data-field]').forEach((control) => control.addEventListener('input', () => {
      if (!control.dataset.undoStarted) { this.pushUndo(); control.dataset.undoStarted = '1'; }
      const field = control.dataset.field, value = control.type === 'checkbox' ? control.checked : control.type === 'number' && control.value === '' ? null : Number(control.value);
      const entry = this.entry(this.selected); entry[field] = value;
      if (this.selected === 'main-action-bar' && (field === 'width' || field === 'height')) {
        const node = this.node(this.selected), rect = node && this.baseRect(node), ratio = rect?.height ? rect.width / rect.height : 1;
        if (value == null) { entry.width = null; entry.height = null; }
        else if (field === 'width') entry.height = value / ratio;
        else entry.width = value * ratio;
      }
      const output = this.toolboxContent.querySelector(`[data-out="${field}"]`); if (output) output.textContent = `${value}%`;
      this.applyElement(this.selected); this.renderAll(false);
    }));
    this.toolboxContent.querySelectorAll('[data-field]').forEach((control) => control.addEventListener('change', () => { delete control.dataset.undoStarted; this.renderAll(); this.renderSelection(); }));
    this.toolboxContent.querySelectorAll('[data-custom-field]').forEach((control) => control.onchange = () => {
      this.pushUndo(); const field = control.dataset.customField, entry = this.entry(this.selected); entry[field] = control.value;
      if (field === 'anchor') {
        const node = this.node(this.selected);
        if (node) { node.dataset.anchor = control.value; node.style.justifyContent = ({ left: 'flex-start', right: 'flex-end', center: 'center' })[control.value]; }
      } else if (field === 'textAlign' && this.selected === 'environment-info') {
        const node = this.node(this.selected); if (node) node.style.textAlign = control.value;
      }
      this.applyElement(this.selected); this.renderAll(); this.renderSelection();
    });
    this.toolboxContent.querySelectorAll('[data-setting]').forEach((control) => control.onchange = () => {
      const key = control.dataset.setting; this.state[key] = control.type === 'checkbox' ? control.checked : Number(control.value); this.renderAll(); this.renderSelection();
    });
    this.toolboxContent.querySelectorAll('[data-profile-action]').forEach((button) => button.onclick = () => this.profileAction(button.dataset.profileAction));
    this.toolboxContent.querySelector('[data-layout-file]').onchange = (e) => this.importFile(e.target.files?.[0]);
    this.clampToolbox();
  },

  pushUndo(snapshot = this.state) { this.undoStack.push(clone(snapshot)); if (this.undoStack.length > 40) this.undoStack.shift(); this.redoStack.length = 0; },
  undo() { if (!this.undoStack.length) return; this.redoStack.push(clone(this.state)); this.working = this.undoStack.pop(); this.applyAll(); this.renderAll(); this.renderSelection(); },
  redo() { if (!this.redoStack.length) return; this.undoStack.push(clone(this.state)); this.working = this.redoStack.pop(); this.applyAll(); this.renderAll(); this.renderSelection(); },
  resetSelected() {
    const node = this.node(this.selected), map = this.map; this.pushUndo(); delete map[this.selected];
    if (node) node.classList.remove('ui-layout-hidden');
    this.applyAll(); this.renderAll(); this.renderSelection();
  },
  confirmResetAll() {
    UI.confirm('Reset interface layout?', 'Reset every element in this profile to its defaults? This will discard its customized positions, sizes, scale, opacity, visibility and locks.', () => {
      this.pushUndo(); const p = this.state.profiles[this.state.activeProfile];
      if (this.state.characterSpecific) p.characterOverrides[characterLayoutId(G.char)] = {}; else p.layouts = {};
      this.applyAll(); this.renderAll(); this.renderSelection();
    }, 'Reset All');
  },
  save() {
    G.settings.uiLayouts = normalizeLayoutState(this.working); saveSettings(); this.close();
    UI.dialog({ title: 'Layout Saved', html: '<p>Your interface layout has been saved and applied.</p>', buttons: [{ label: 'Done' }] });
  },
  cancel() { this.working = clone(this.original || layoutState()); this.applyAll(); this.close(); },
  profileAction(action) {
    const state = this.state, active = state.activeProfile, profile = state.profiles[active];
    if (['create', 'rename', 'duplicate', 'delete'].includes(action)) this.pushUndo();
    if (action === 'create') { const name = prompt('Name the new UI layout profile:'); if (!name?.trim()) return; const key = stableProfileKey(name, state); state.profiles[key] = { name: name.trim().slice(0,32), layouts: {}, characterOverrides: {} }; state.activeProfile = key; }
    else if (action === 'rename') { const name = prompt('Rename this UI layout profile:', profile.name); if (!name?.trim()) return; profile.name = name.trim().slice(0,32); }
    else if (action === 'duplicate') { const key = stableProfileKey(`${profile.name} copy`, state); state.profiles[key] = clone(profile); state.profiles[key].name = `${profile.name} Copy`.slice(0,32); state.activeProfile = key; }
    else if (action === 'delete') { if (active === 'default' || !confirm(`Delete the “${profile.name}” layout profile?`)) return; delete state.profiles[active]; state.activeProfile = 'default'; }
    else if (action === 'default') {
      UI.confirm('Restore default layout?', 'This will reset the Default profile and all of its customized interface elements.', () => {
        this.pushUndo(); state.activeProfile = 'default'; state.characterSpecific = false; state.profiles.default = { name: 'Default', layouts: {}, characterOverrides: {} };
        this.applyAll(); this.renderAll(); this.renderSelection();
      }, 'Restore Default');
      return;
    }
    else if (action === 'export') { const data = JSON.stringify(exportLayoutProfile(state, active), null, 2); const url = URL.createObjectURL(new Blob([data], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `${fileName(profile.name)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0); return; }
    else if (action === 'import') { this.toolboxContent.querySelector('[data-layout-file]').click(); return; }
    this.applyAll(); this.renderAll(); this.renderSelection();
  },
  async importFile(file) {
    if (!file) return;
    try {
      const profile = importLayoutProfile(await file.text());
      const key = stableProfileKey(profile.name, this.state); this.pushUndo(); this.state.profiles[key] = profile; this.state.activeProfile = key; this.applyAll(); this.renderAll(); this.renderSelection();
    } catch (error) { UI.dialog({ title: 'Could not import layout', html: `<p>${escapeHtml(error.message || 'The selected file could not be read.')}</p>`, buttons: [{ label: 'OK' }] }); }
  },
};

export function openCustomizeUI() { return UILayoutCustomizer.open(); }

let initialized = false;
export function applyUILayoutSettings() {
  G.uiLayoutCustomizer = UILayoutCustomizer;
  UILayoutCustomizer.applyAll();
  if (!initialized) {
    initialized = true;
    window.addEventListener('resize', () => UILayoutCustomizer.applyAll());
    UILayoutCustomizer.visibilityObserver = new MutationObserver((records) => {
      const insertedNodes = [];
      const changedRows = new Set();
      const changedRoots = new Map();
      let refreshAll = false;
      for (const record of records) {
        if (record.type === 'attributes') {
          if (record.target === document.body) { refreshAll = true; continue; }
          const id = DEFINITIONS.find(([, , selector]) => selector && record.target.matches(selector))?.[0];
          if (id) {
            // Applying a layout also changes the style attribute. Ignore that follow-up
            // record when the current inline style matches the manager's last result.
            if (record.attributeName !== 'style' || layoutStyleWasReset(record.target)) changedRoots.set(id, record.target);
            continue;
          }
          // Parent HUD classes and styles can change a child's base rectangle. Reapply
          // only the registered elements inside that specific changed container.
          for (const [childId, , selector] of DEFINITIONS) {
            const child = selector ? document.querySelector(selector) : null;
            if (child && record.target.contains?.(child)) changedRoots.set(childId, child);
          }
          continue;
        }
        if (record.type === 'childList' && (record.target?.id === 'buff-row' || record.target?.id === 'debuff-row')) {
          changedRows.add(record.target.id === 'buff-row' ? 'buff-icons' : 'debuff-icons');
        }
        for (const node of record.addedNodes) insertedNodes.push(node);
      }
      if (refreshAll) UILayoutCustomizer.applyAll();
      else for (const [id, node] of changedRoots) UILayoutCustomizer.applyElement(id, node);
      // These persistent HUD roots can be empty during startup. Reapply their saved
      // coordinates when their first/last icon changes, without replacing the roots.
      for (const id of changedRows) UILayoutCustomizer.applyElement(id);
      if (insertedNodes.length) for (const [id, , selector] of DEFINITIONS) {
        if (!selector) continue;
        const node = document.querySelector(selector);
        const reinserted = node && insertedNodes.some((added) => added === node || (added.nodeType === 1 && added.contains(node)));
        if (node && (UILayoutCustomizer.trackElementNode(id, node) || reinserted)) UILayoutCustomizer.applyElement(id, node);
      }
    });
    const app = document.querySelector('#app') || document.body;
    UILayoutCustomizer.visibilityObserver.observe(app, { childList: true, subtree: true });
    if (app !== document.body) UILayoutCustomizer.visibilityObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    for (const [id, , selector] of DEFINITIONS) {
      const node = selector ? document.querySelector(selector) : null;
      if (node) UILayoutCustomizer.trackElementNode(id, node);
    }
  }
}
