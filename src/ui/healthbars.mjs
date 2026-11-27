// Shared health-bar preferences, classification and low-allocation canvas renderer.
// Static frame, emblem and fill artwork is loaded once and reused by overhead bars,
// the target banner and the settings preview.
import { G } from '../state.js';
import { isPlayerTargetable } from '../game/targeting.js';

export const HEALTH_BAR_CLASSES = Object.freeze([
  { id: 'normal', label: 'Normal Monster', color: '#c52b20', fill: 'red', fillAsset: 'fill-red', icon: 'normal' },
  { id: 'champion', label: 'Champion', color: '#2679df', fill: 'blue', fillAsset: 'fill-blue', icon: 'champion' },
  { id: 'unique', label: 'Unique Monster', color: '#d99916', fill: 'gold', fillAsset: 'fill-gold', icon: 'unique' },
  { id: 'boss', label: 'Boss', color: '#c51e16', fill: 'crimson', fillAsset: 'fill-crimson', icon: 'boss' },
  { id: 'nemesis', label: 'Nemesis', color: '#8d35d5', fill: 'purple', fillAsset: 'fill-purple', icon: 'nemesis' },
  { id: 'imp', label: 'Treasure Imp', color: '#128d36', fill: 'emerald', fillAsset: 'fill-emerald', icon: 'imp' },
  { id: 'companion', label: 'Companion / Summon', color: '#14939b', fill: 'teal', fillAsset: 'fill-teal', icon: 'companion' },
]);
// Boss frame uses a horizontal nine-slice. Its usable aperture is not a fixed
// percentage of the full bar: the side caps scale with the rendered frame
// height, while the center stretches to the configured width. These source
// pixels are the outer alpha boundaries of the open health channel in
// frame-boss.webp (2172 x 724), measured across the channel's vertical span.
const BOSS_FRAME_ART = Object.freeze({
  width: 2172, height: 724, sliceLeft: 0.23, sliceRight: 0.88,
  apertureLeft: 574, apertureRight: 1906,
});

/** Return the artwork channel bounds after nine-slicing, keeping the fill clear of the emblem. */
export function bossFrameTrackBounds(frameWidth, frameHeight, minLeft = 0) {
  const art = BOSS_FRAME_ART;
  const sourceLeft = art.width * art.sliceLeft;
  const sourceRight = art.width * art.sliceRight;
  const sourceCenterWidth = sourceRight - sourceLeft;
  let leftCap = frameHeight * sourceLeft / art.height;
  let rightCap = frameHeight * (art.width - sourceRight) / art.height;
  if (leftCap + rightCap > frameWidth) {
    const scale = frameWidth / (leftCap + rightCap);
    leftCap *= scale;
    rightCap *= scale;
  }
  const centerWidth = Math.max(0, frameWidth - leftCap - rightCap);
  const mapSourceX = (sourceX) => leftCap + (sourceX - sourceLeft) * centerWidth / sourceCenterWidth;
  return { left: Math.max(minLeft, mapSourceX(art.apertureLeft)), right: mapSourceX(art.apertureRight) };
}

// Shared proportions for the boss frame, emblem, name, and vertical bar layout.
// The live track's horizontal bounds are calculated from the frame artwork at
// its actual rendered size; these percentage values are only CSS fallbacks.
export const BOSS_HEALTH_LAYOUT = Object.freeze({
  frameTop: 18 / 178, frameHeight: 160 / 178,
  trackLeft: 0.224, trackRight: 0.084,
  trackTop: 18 / 178 + 0.33 * (160 / 178), trackHeight: 0.13 * (160 / 178),
  // Keep the skull over the left frame cap. Its right edge clears the health track.
  emblemCenterX: 0.14, emblemCenterY: 18 / 178 + 0.395 * (160 / 178), emblemWidth: 0.134, emblemHeight: 0.62 * (160 / 178),
  nameLeft: 0.224, nameRight: 0.084, nameTop: 0.005, nameHeight: 0.09,
  summaryTop: 18 / 178 + 0.70 * (160 / 178), extraTop: 18 / 178 + 0.83 * (160 / 178),
});
const PLAYER_BAR_CLASS = Object.freeze({ id: 'player', label: 'Player', color: '#c52b20', fill: 'red', fillAsset: 'fill-red', icon: null });

export const DEFAULT_HEALTH_BAR_SETTINGS = Object.freeze({
  theme: 'velscour',
  overhead: Object.freeze({ width: 60, height: 100, opacity: 100, verticalOffset: 0, decorativeBorders: true, smoothHealthDepletion: true, visibility: 'always' }),
  target: Object.freeze({ width: 100, height: 100, opacity: 100, verticalOffset: 0, decorativeBorders: true, smoothHealthDepletion: true, visibility: 'always' }),
  classes: Object.freeze({ normal: true, champion: true, unique: true, boss: true, nemesis: true, imp: true, companion: true, player: false }),
  info: Object.freeze({ showEnemyName: false, showEnemyLevel: false, showHealthPercentage: false, showNumericalHealth: false, showAffixIcons: true, showStatusEffectIcons: true, showClassificationIconsOverhead: false }),
});

const VISIBILITY = new Set(['always', 'damaged', 'combat', 'targeted', 'hidden']);
const STATUS_COLORS = [['burn', '#ff7040'], ['poison', '#83d64d'], ['bleed', '#bd2028'], ['chill', '#8eeaff'], ['freeze', '#b2f6ff'], ['stun', '#ffdc65'], ['fear', '#bd80ef']];
const STATUS_LABELS = [['burn', 'Burn'], ['poison', 'Poison'], ['bleed', 'Bleed'], ['chill', 'Chill'], ['freeze', 'Freeze'], ['stun', 'Stun'], ['fear', 'Fear']];
const AFFIX_LABELS = Object.freeze({ strong: 'Strong', fast: 'Fast', tough: 'Stone Skin', fiery: 'Fire', frozen: 'Cold', shocking: 'Lightning', vampiric: 'Vampiric', teleport: 'Teleport', multishot: 'Multishot', thorns: 'Thorns', regen: 'Regeneration' });
const AFFIX_GLYPHS = Object.freeze({ strong: 'S', fast: 'F', tough: 'T', fiery: 'F', frozen: 'C', shocking: 'L', vampiric: 'V', teleport: 'T', multishot: 'M', thorns: 'R', regen: '+' });
const OVERHEAD_DRAW_OPTIONS = Object.freeze({ system: 'overhead' });
const OVERHEAD_TINTED_CAP_CLASSES = new Set(['normal', 'champion', 'nemesis', 'imp', 'companion']);
const ASSET_ROOT = 'assets/ui/healthbars/';
const ART = Object.create(null);
let settingsRef = null;
let artPreloaded = false;
function image(name) {
  if (!ART[name] && typeof Image !== 'undefined') {
    const img = ART[name] = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (typeof document !== 'undefined') {
        document.querySelector('[data-hb-preview]')?.dispatchEvent(new Event('healthbarartready'));
        document.dispatchEvent(new Event('healthbarartready'));
      }
    };
    img.src = `${ASSET_ROOT}${name}.webp`;
  }
  const img = ART[name];
  return img && img.complete && img.naturalWidth ? img : null;
}
export function preloadHealthBarArt() {
  if (artPreloaded) return;
  artPreloaded = true;
  image('frame');
  image('frame-target');
  image('frame-boss');
  for (const part of ['overhead-frame-left', 'overhead-frame-tile', 'overhead-frame-right', 'overhead-empty', 'overhead-boss-left', 'overhead-boss-right']) image(part);
  for (const id of ['normal', 'champion', 'nemesis', 'imp', 'companion']) {
    image(`overhead-frame-${id}-left`); image(`overhead-frame-${id}-right`);
  }
  for (const c of HEALTH_BAR_CLASSES) { image(c.icon); image(`fill-${c.fill}`); }
}

function bounded(n, min, max, fallback) {
  n = Number(n);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
export function normalizeHealthBarSettings(value, legacyLifeBars = true) {
  const src = value && typeof value === 'object' ? value : {};
  const out = {
    theme: src.theme === 'classic' ? 'classic' : 'velscour',
    overhead: { ...DEFAULT_HEALTH_BAR_SETTINGS.overhead, ...(src.overhead || {}) },
    target: { ...DEFAULT_HEALTH_BAR_SETTINGS.target, ...(src.target || {}) },
    classes: { ...DEFAULT_HEALTH_BAR_SETTINGS.classes, ...(src.classes || {}) },
    info: { ...DEFAULT_HEALTH_BAR_SETTINGS.info, ...(src.info || {}) },
  };
  // An old player's explicit preference is retained as the new overhead display mode.
  if (!Object.hasOwn(src, 'overhead') && legacyLifeBars === false) out.overhead.visibility = 'damaged';
  for (const key of ['overhead', 'target']) {
    const a = out[key];
    a.width = bounded(a.width, 60, 160, 100);
    a.height = bounded(a.height, 60, 160, 100);
    a.opacity = bounded(a.opacity, 15, 100, 100);
    a.verticalOffset = bounded(a.verticalOffset, -60, 60, 0);
    a.decorativeBorders = a.decorativeBorders !== false;
    a.smoothHealthDepletion = a.smoothHealthDepletion !== false;
    a.visibility = VISIBILITY.has(a.visibility) ? a.visibility : 'always';
  }
  for (const key of Object.keys(DEFAULT_HEALTH_BAR_SETTINGS.classes)) out.classes[key] = out.classes[key] !== false;
  for (const key of Object.keys(DEFAULT_HEALTH_BAR_SETTINGS.info)) out.info[key] = out.info[key] !== false;
  // This is a newly added optional display feature; existing saves without the
  // field must inherit OFF, while an explicit player choice remains intact.
  out.info.showClassificationIconsOverhead = src.info?.showClassificationIconsOverhead === true;
  return out;
}
export function healthBarSettings() {
  const st = G.settings || {};
  // Normalize once per saved-settings object, never via deep comparison during each creature draw.
  if (!st.healthBars || st.healthBars !== settingsRef) {
    st.healthBars = normalizeHealthBarSettings(st.healthBars, st.lifeBars !== false);
    settingsRef = st.healthBars;
  }
  return st.healthBars;
}

export function healthBarClass(entity) {
  if (!entity) return HEALTH_BAR_CLASSES[0];
  if (entity.team === 'player' && entity.summon) return HEALTH_BAR_CLASSES[6];
  if (entity.isPlayer) return PLAYER_BAR_CLASS;
  if (entity.nemesis || entity.rank === 'nemesis') return HEALTH_BAR_CLASSES[4];
  if (entity.goblin || entity.treasureImp || entity.impVariant || entity.rank === 'imp') return HEALTH_BAR_CLASSES[5];
  if (entity.isRaid || entity.rank === 'raid' || entity.rank === 'boss' || entity === entity.world?.boss) return HEALTH_BAR_CLASSES[3];
  return HEALTH_BAR_CLASSES.find((entry) => entry.id === entity.rank) || HEALTH_BAR_CLASSES[0];
}

/** All variant IDs share the same imp classification, even when their rank or targeting state differs. */
export function isTreasureImpEntity(entity) {
  return !!(entity && (entity.goblin === true || entity.treasureImp === true || entity.impVariant || entity.rank === 'imp'));
}

function combatIsActive(entity) {
  const world = entity?.world || G.world;
  if (world && Number(world._audioCombatUntil) > Number(world.time || 0)) return true;
  return !!(entity && (entity.awake || entity.aggro || entity.state === 'act'));
}
function currentlyTargeted(entity) {
  const player = G.player;
  return entity === G.hover || entity === G.lastHit || entity === player?.attackTarget?.target;
}
export function healthBarVisible(entity, system = 'overhead') {
  if (!entity || entity.dead || entity.hidden || entity.alpha === 0) return false;
  const s = healthBarSettings(), isPlayer = !!entity.isPlayer;
  if (isPlayer && (system !== 'overhead' || !s.classes.player)) return false;
  const category = healthBarClass(entity).id;
  if (!s.classes[category] || (isPlayer && !s.classes.player)) return false;
  const mode = s[system]?.visibility || 'always';
  if (mode === 'hidden') return false;
  if (mode === 'damaged' && entity.hp >= entity.maxHp) return false;
  if (mode === 'combat' && !combatIsActive(entity)) return false;
  if (mode === 'targeted' && !currentlyTargeted(entity)) return false;
  return true;
}

/** Health UI follows visible hostile state; Treasure Imps remain eligible even if a variant disables targeting while fleeing. */
export function overheadHealthBarEligible(entity) {
  if (!entity) return false;
  if (entity.isPlayer) return true;
  if (entity.team === 'player' && entity.summon) return true;
  // Imp variants can temporarily become untargetable while fleeing. Their
  // dedicated family marker is authoritative for overhead health display.
  if (isTreasureImpEntity(entity)) return entity.team !== 'player' && !entity.dungeonEventImpEscaped;
  return isPlayerTargetable(entity);
}

export function healthBarText(entity, s = healthBarSettings()) {
  const info = s.info, hp = Math.max(0, Number(entity?.hp) || 0), max = Math.max(0, Number(entity?.maxHp) || 0);
  const level = entity?.level ? `Lv. ${entity.level}` : '';
  const pct = max ? Math.round(hp / max * 100) : 0;
  const bits = [];
  if (info.showEnemyLevel && level) bits.push(level);
  if (entity?.isPlayer) bits.push('Player');
  else bits.push(healthBarClass(entity).label);
  if (info.showHealthPercentage) bits.push(`${pct}%`);
  if (info.showNumericalHealth) bits.push(`${Math.ceil(hp).toLocaleString()} / ${Math.ceil(max).toLocaleString()}`);
  if (entity?.ward > 0 && entity.ward < 1) bits.push('Ward');
  return bits.join('  ·  ');
}

/** Concise information placed below the boss banner; health values live inside its track. */
export function healthBarSummaryText(entity, s = healthBarSettings()) {
  const bits = [];
  if (s.info.showEnemyLevel && entity?.level) bits.push(`Lv. ${entity.level}`);
  bits.push(healthBarClass(entity).label);
  if (entity?.ward > 0 && entity.ward < 1) bits.push('Ward');
  return bits.join('  ·  ');
}

/** Health values for the boss track, independently controlled by the existing display options. */
export function healthBarValueText(entity, s = healthBarSettings()) {
  const hp = Math.max(0, Number(entity?.hp) || 0), max = Math.max(0, Number(entity?.maxHp) || 0);
  const bits = [];
  if (s.info.showHealthPercentage) bits.push(`${max ? Math.round(hp / max * 100) : 0}%`);
  if (s.info.showNumericalHealth) bits.push(`${Math.ceil(hp).toLocaleString()} / ${Math.ceil(max).toLocaleString()}`);
  return bits.join('  ·  ');
}

export function healthBarAffixText(entity) {
  if (!healthBarSettings().info.showAffixIcons) return '';
  const names = entity?.affixes || []; let text = '';
  for (const id of names) text += `${text ? '  ·  ' : ''}${AFFIX_LABELS[id] || id}`;
  return text;
}
export function healthBarStatusText(entity) {
  if (!healthBarSettings().info.showStatusEffectIcons) return '';
  let text = '';
  for (const [id, label] of STATUS_LABELS) if (entity?.status?.[id]?.t > 0) text += `${text ? '  ·  ' : ''}${label}`;
  return text;
}

function drawFallback(ctx, x, y, w, h, fraction, color) {
  ctx.fillStyle = '#120c08'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * fraction, h);
  ctx.fillStyle = 'rgba(255,230,160,.5)'; ctx.fillRect(x, y, w * fraction, Math.max(1, h * 0.22));
  ctx.strokeStyle = '#9a7340'; ctx.lineWidth = Math.max(1, h * 0.08); ctx.strokeRect(x, y, w, h);
}

/** Small, emblem-free overhead bar built from cached hand-painted pieces. */
function drawCompactOverhead(ctx, x, y, w, h, fraction, classification, theme, decorativeBorders) {
  ctx.save();
  try {
    // The Classic theme deliberately keeps its simple, original presentation.
    if (theme === 'classic') {
      drawFallback(ctx, x, y + h * 0.18, w, Math.max(2, h * 0.64), fraction, classification.color);
      return;
    }
    if (!decorativeBorders) {
      const empty = image('overhead-empty'), fill = image(classification.fillAsset);
      const trackY = y + h * 0.29, trackH = Math.max(2, h * 0.42);
      if (empty) ctx.drawImage(empty, x, trackY, w, trackH);
      else { ctx.fillStyle = '#120c08'; ctx.fillRect(x, trackY, w, trackH); }
      if (fill && fraction > 0) ctx.drawImage(fill, 0, 0, Math.max(1, fill.naturalWidth * fraction), fill.naturalHeight, x, trackY, w * fraction, trackH);
      else if (fraction > 0) { ctx.fillStyle = classification.color; ctx.fillRect(x, trackY, w * fraction, trackH); }
      return;
    }
    const boss = classification.id === 'boss';
    const hasTintedCaps = OVERHEAD_TINTED_CAP_CLASSES.has(classification.id);
    const left = image(boss ? 'overhead-boss-left' : hasTintedCaps ? `overhead-frame-${classification.id}-left` : 'overhead-frame-left');
    const center = image('overhead-frame-tile');
    const right = image(boss ? 'overhead-boss-right' : hasTintedCaps ? `overhead-frame-${classification.id}-right` : 'overhead-frame-right');
    const empty = image('overhead-empty');
    const fill = image(classification.fillAsset);
    if (!left || !center || !right || !empty) {
      drawFallback(ctx, x, y + h * 0.18, w, Math.max(2, h * 0.64), fraction, classification.color);
      return;
    }

    // Caps retain their own proportions while the rail between them stretches to fit.
    let leftW = h * left.naturalWidth / left.naturalHeight;
    let rightW = h * right.naturalWidth / right.naturalHeight;
    const capScale = Math.min(1, w * 0.43 / Math.max(1, leftW + rightW));
    leftW *= capScale; rightW *= capScale;
    const railX = x + leftW * 0.55, railRight = x + w - rightW * 0.55;
    const railW = Math.max(1, railRight - railX);
    const trackInset = boss ? 0.52 : 0.66;
    const trackX = x + leftW * trackInset, trackRight = x + w - rightW * trackInset;
    const trackW = Math.max(1, trackRight - trackX);
    const trackY = y + h * 0.29, trackH = Math.max(2, h * 0.42);

    // Repeat the center strip at native aspect ratio so settings and creature width
    // changes never stretch its etched details or textured metal.
    const tileW = h * center.naturalWidth / center.naturalHeight;
    for (let dx = railX; dx < railRight; dx += tileW) {
      const pieceW = Math.min(tileW, railRight - dx);
      ctx.drawImage(center, 0, 0, Math.max(1, center.naturalWidth * pieceW / tileW), center.naturalHeight, dx, y, pieceW, h);
    }
    ctx.drawImage(empty, trackX, trackY, trackW, trackH);
    if (fill && fraction > 0) {
      // Existing preloaded fill art contains the class texture, bevel and highlights.
      // Crop at the health fraction so the artwork remains detailed as the fill shrinks.
      ctx.drawImage(fill, 0, 0, Math.max(1, fill.naturalWidth * fraction), fill.naturalHeight, trackX, trackY, trackW * fraction, trackH);
    } else if (fraction > 0) {
      ctx.fillStyle = classification.color; ctx.fillRect(trackX, trackY, trackW * fraction, trackH);
    }

    // Cached cap variants carry subtle class accents; no per-frame glow/filter work.
    ctx.drawImage(left, x, y, leftW, h);
    ctx.drawImage(right, x + w - rightW, y, rightW, h);
  } finally { ctx.restore(); }
}

/** Paint a horizontally nine-sliced frame so width adjustments do not squash its emblems or end caps. */
export function drawHealthBarFrame(ctx, classification, x, y, w, h, system = 'overhead') {
  const bossFrame = classification?.id === 'boss';
  const frame = image(bossFrame ? 'frame-boss' : system === 'target' ? 'frame-target' : 'frame');
  if (!frame) return false;
  const sw = frame.naturalWidth, sh = frame.naturalHeight;
  const leftFraction = bossFrame ? (system === 'target' ? 0.23 : 0.24) : system === 'target' ? 0.12 : 0.201;
  const rightFraction = bossFrame ? 0.12 : system === 'target' ? 0.09 : 0.12;
  const sourceLeft = sw * leftFraction, sourceRight = sw * (1 - rightFraction);
  let left = h * sourceLeft / sh, right = h * (sw - sourceRight) / sh;
  if (left + right > w) { const scale = w / (left + right); left *= scale; right *= scale; }
  ctx.drawImage(frame, 0, 0, sourceLeft, sh, x, y, left, h);
  ctx.drawImage(frame, sourceLeft, 0, sourceRight - sourceLeft, sh, x + left, y, Math.max(0, w - left - right), h);
  ctx.drawImage(frame, sourceRight, 0, sw - sourceRight, sh, x + w - right, y, right, h);
  return true;
}

/** Shared geometry for target bars and their settings preview labels and badges. */
export function healthBarCanvasLayout(classification, x, y, w, h, system = 'target') {
  const boss = system === 'target' && classification?.id === 'boss';
  const trackTop = boss ? BOSS_HEALTH_LAYOUT.trackTop : 0.365;
  const trackHeight = boss ? BOSS_HEALTH_LAYOUT.trackHeight : 0.27;
  const frame = boss
    ? { x, y: y + h * BOSS_HEALTH_LAYOUT.frameTop, width: w, height: h * BOSS_HEALTH_LAYOUT.frameHeight }
    : { x, y, width: w, height: h };
  const emblemSize = boss
    ? Math.min(w * BOSS_HEALTH_LAYOUT.emblemWidth, h * BOSS_HEALTH_LAYOUT.emblemHeight)
    : Math.min(w * 0.124, h * 0.62);
  const emblemCenter = boss
    ? { x: x + w * BOSS_HEALTH_LAYOUT.emblemCenterX, y: y + h * BOSS_HEALTH_LAYOUT.emblemCenterY }
    : { x: x + w * 0.066, y: y + h * 0.5 };
  const bossBounds = boss
    ? bossFrameTrackBounds(frame.width, frame.height, emblemCenter.x - x + emblemSize / 2)
    : null;
  const trackLeft = boss ? bossBounds.left : w * 0.14;
  const trackRight = boss ? bossBounds.right : w * 0.91;
  const track = {
    x: x + trackLeft,
    y: y + h * trackTop,
    width: trackRight - trackLeft,
    height: h * trackHeight,
  };
  return {
    boss,
    track,
    frame,
    emblem: {
      centerX: emblemCenter.x,
      centerY: emblemCenter.y,
      size: emblemSize,
    },
    // Reserve the icon lane inside the frame's track, clear of both decorative caps.
    badge: {
      centerX: track.x + track.width * 0.85,
      centerY: track.y + track.height * 0.5,
      radius: Math.max(1, h * 0.045),
    },
  };
}

/** Draw a reusable, image-backed Velscour bar. Coordinates are in the caller's current canvas space. */
export function drawHealthBarCanvas(ctx, entity, x, y, w, h, { system = 'overhead', forceClass = null, forceFraction = null } = {}) {
  const s = healthBarSettings(), appearance = s[system] || s.overhead;
  const classification = forceClass || healthBarClass(entity);
  let fraction = Math.min(1, Math.max(0, forceFraction == null ? (entity?.maxHp > 0 ? entity.hp / entity.maxHp : 0) : forceFraction));
  if (forceFraction == null && appearance.smoothHealthDepletion && entity) {
    if (!Number.isFinite(entity._healthBarDisplayHp)) entity._healthBarDisplayHp = fraction;
    const dt = Math.max(0, Math.min(0.1, Number(G.dt) || 1 / 60));
    entity._healthBarDisplayHp += (fraction - entity._healthBarDisplayHp) * (1 - Math.exp(-dt * 12));
    fraction = Math.min(1, Math.max(0, entity._healthBarDisplayHp));
  } else if (forceFraction == null && entity) entity._healthBarDisplayHp = fraction;
  const opacity = appearance.opacity / 100;
  ctx.save();
  try {
    ctx.globalAlpha *= opacity;
    if (system === 'overhead') {
      const icon = s.info.showClassificationIconsOverhead && classification.icon ? image(classification.icon) : null;
      if (icon) {
        // Center the combined icon + bar group over the creature. With the
        // option off the original bar geometry is untouched and leaves no gap.
        const gap = Math.max(1, h * 0.06), size = Math.min(h * 0.9, w * 0.16);
        const offset = (size + gap) / 2;
        ctx.drawImage(icon, x - offset, y + (h - size) / 2, size, size);
        drawCompactOverhead(ctx, x + offset, y, w, h, fraction, classification, s.theme, appearance.decorativeBorders);
      } else drawCompactOverhead(ctx, x, y, w, h, fraction, classification, s.theme, appearance.decorativeBorders);
      return;
    }
    if (s.theme === 'classic') {
      drawFallback(ctx, x, y, w, h, fraction, classification.color);
      return;
    }
    const bossFrame = classification.id === 'boss';
    const frame = image(bossFrame ? 'frame-boss' : system === 'target' ? 'frame-target' : 'frame'), fill = image(classification.fillAsset), emblem = classification.icon ? image(classification.icon) : null;
    if (!frame) { drawFallback(ctx, x, y, w, h, fraction, classification.color); return; }
    const target = system === 'target';
    const bossTarget = bossFrame && target;
    const targetLayout = target ? healthBarCanvasLayout(classification, x, y, w, h, system) : null;
    const leftFraction = bossFrame ? (target ? BOSS_HEALTH_LAYOUT.trackLeft : 0.24) : target ? 0.12 : 0.201;
    const rightFraction = bossFrame ? (target ? BOSS_HEALTH_LAYOUT.trackRight : 0.12) : target ? 0.09 : 0.12;
    const left = target ? targetLayout.track.x : x + h * frame.naturalWidth * leftFraction / frame.naturalHeight;
    const right = target ? targetLayout.track.x + targetLayout.track.width : x + w - h * frame.naturalWidth * rightFraction / frame.naturalHeight;
    const top = target ? targetLayout.track.y : y + h * (bossFrame ? 0.37 : 0.365);
    const innerW = Math.max(0, right - left);
    const innerH = target ? targetLayout.track.height : h * (bossFrame ? 0.21 : 0.305);
    ctx.fillStyle = '#110b08'; ctx.fillRect(left, top, innerW, innerH);
    if (fill && fraction > 0) ctx.drawImage(fill, 0, 0, Math.max(1, fill.naturalWidth * fraction), fill.naturalHeight, left, top, innerW * fraction, innerH);
    else if (fraction > 0) { ctx.fillStyle = classification.color; ctx.fillRect(left, top, innerW * fraction, innerH); }
    ctx.fillStyle = 'rgba(255,236,190,.38)'; ctx.fillRect(left, top, innerW * fraction, Math.max(1, innerH * 0.2));
    // The geometry is the frame's measured open aperture. Draw the frame over
    // the fill so its antialiased inner edge masks subpixel seams consistently.
    if (appearance.decorativeBorders && target) {
      drawHealthBarFrame(ctx, classification, targetLayout.frame.x, targetLayout.frame.y, targetLayout.frame.width, targetLayout.frame.height, system);
    }
    // Paint the emblem after the frame so both the icon and frame remain crisp.
    if (emblem) {
      const geom = target ? targetLayout.emblem : null;
      const size = geom?.size ?? h * 0.62;
      const centerX = geom?.centerX ?? x + h * frame.naturalWidth * (bossFrame ? 0.156 : 0.118) / frame.naturalHeight;
      const centerY = geom?.centerY ?? y + h * 0.5;
      ctx.drawImage(emblem, centerX - size / 2, centerY - size / 2, size, size);
    }
    let iconAt = 0;
    const activeStatuses = entity && s.info.showStatusEffectIcons
      ? STATUS_COLORS.filter(([id]) => entity.status?.[id]?.t > 0)
      : [];
    const affixCount = entity && s.info.showAffixIcons && Array.isArray(entity.affixes)
      ? Math.min(4, entity.affixes.length)
      : 0;
    const badgeCount = Math.min(4, affixCount + activeStatuses.length);
    const badgeX = (index, radius) => target
      ? targetLayout.badge.centerX + (index - (badgeCount - 1) / 2) * radius * 2.45
      : x + w * (0.895 + index * 0.019);
    if (entity && s.info.showAffixIcons && Array.isArray(entity.affixes)) {
      const r = target ? targetLayout.badge.radius : Math.max(1, h * 0.045);
      for (let i = 0; i < affixCount && iconAt < 4; i++, iconAt++) {
        const cx = badgeX(iconAt, r);
        const cy = target ? targetLayout.badge.centerY : y + h * 0.5;
        ctx.beginPath(); ctx.fillStyle = '#ffd678'; ctx.strokeStyle = '#3b1a0a'; ctx.lineWidth = Math.max(0.6, r * 0.45);
        ctx.arc(cx, cy, r * 1.65, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#281307'; ctx.font = `bold ${Math.max(6, r * 2.1)}px Georgia,serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(AFFIX_GLYPHS[entity.affixes[i]] || '?', cx, cy);
      }
    }
    if (entity && s.info.showStatusEffectIcons) {
      for (const [id, color] of activeStatuses) if (iconAt < 4) {
        const r = target ? targetLayout.badge.radius : Math.max(1, h * 0.045), at = iconAt++;
        const cx = badgeX(at, r);
        const cy = target ? targetLayout.badge.centerY : y + h * 0.5;
        ctx.beginPath(); ctx.fillStyle = color; ctx.strokeStyle = '#1a0d0a'; ctx.lineWidth = Math.max(0.6, r * 0.45);
        ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#170b07'; ctx.font = `bold ${Math.max(6, r * 1.8)}px Georgia,serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(id.slice(0, 1).toUpperCase(), cx, cy);
      }
    }
    if (system === 'overhead' && healthBarSettings().info.showHealthPercentage) {
      ctx.fillStyle = '#f2dfbf'; ctx.font = `bold ${Math.max(8, h * 0.25)}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${Math.round(fraction * 100)}%`, left + innerW * 0.5, top + innerH * 0.55);
    }
  } finally {
    ctx.restore();
  }
}

export function drawOverheadHealthBar(ctx, entity, x, y, w, h) {
  drawHealthBarCanvas(ctx, entity, x, y, w, h, OVERHEAD_DRAW_OPTIONS);
}
