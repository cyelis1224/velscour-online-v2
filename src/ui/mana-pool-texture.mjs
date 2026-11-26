import { MANA_POOL_COLORS, manaPoolColor } from '../data/mana-pool-colors.js';

// Orb centers/radii are taken from assets/ui/hud.json. Only blue pixels inside
// this liquid circle are transformed; frames, labels, and adjacent HUD art stay intact.
export const MANA_ART_GEOMETRY = Object.freeze({
  // Include the narrow blue edge visible around the glass, while staying inside
  // the gold bezel (aligned to assets/ui/hud.json: orbs[1] cx=1845, cy=144, r=93).
  'assets/ui/hud.webp': Object.freeze({ cx: 1845, cy: 144, radius: 97 }),
  'assets/ui/hud-orb-mana.webp': Object.freeze({ cx: 115, cy: 144, radius: 97 }),
});

const SOURCE_SATURATION = 0.7273; // Royal Blue #4169E1
const CACHE_LIMIT = 6;
const sourceImages = new Map();
const tintedTextures = new Map();
const generation = new WeakMap();

export function hsl(hex) {
  const parts = hex.slice(1).match(/.{2}/g);
  const [r, g, b] = (parts || ['00', '00', '00']).map((v) => parseInt(v, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hue = 0;
  if (d) {
    if (max === r) hue = 60 * (((g - b) / d) % 6);
    else if (max === g) hue = 60 * ((b - r) / d + 2);
    else hue = 60 * ((r - g) / d + 4);
  }
  if (hue < 0) hue += 360;
  const light = (max + min) / 2;
  return { hue, saturation: d ? d / (1 - Math.abs(2 * light - 1)) : 0, light };
}

function toRgb(hue, saturation, light) {
  const chroma = (1 - Math.abs(2 * light - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1)), offset = light - chroma / 2;
  let rgb;
  if (hue < 60) rgb = [chroma, x, 0];
  else if (hue < 120) rgb = [x, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, x];
  else if (hue < 240) rgb = [0, x, chroma];
  else if (hue < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return rgb.map((value) => Math.round(Math.max(0, Math.min(1, value + offset)) * 255));
}

/** Transform blue liquid pixels in place, preserving their per-pixel lightness and alpha. */
export function recolorManaPixels(data, width, height, color, { cx, cy, radius }) {
  const target = hsl(color), x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(height - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
    const index = (y * width + x) * 4, alpha = data[index + 3];
    if (!alpha) continue;
    const r = data[index] / 255, g = data[index + 1] / 255, b = data[index + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.015) continue; // preserve the white glints and neutral reflections
    let sourceHue = 0;
    if (max === r) sourceHue = 60 * (((g - b) / d) % 6);
    else if (max === g) sourceHue = 60 * ((b - r) / d + 2);
    else sourceHue = 60 * ((r - g) / d + 4);
    if (sourceHue < 0) sourceHue += 360;
    const light = (max + min) / 2, sourceSaturation = d / (1 - Math.abs(2 * light - 1));
    // The rim is much darker and less saturated than the liquid center, so use
    // a broader blue hue gate to catch it without touching the gold frame.
    if (sourceHue < 170 || sourceHue > 295 || sourceSaturation < 0.035) continue;
    const saturation = target.saturation * Math.max(0.7, Math.min(1.15, sourceSaturation / SOURCE_SATURATION));
    const [nr, ng, nb] = toRgb(target.hue, Math.min(1, saturation), light);
    data[index] = nr; data[index + 1] = ng; data[index + 2] = nb; data[index + 3] = alpha;
  }
  return data;
}

function loadSource(src) {
  if (sourceImages.has(src)) return sourceImages.get(src);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Mana artwork failed to load: ${src}`));
    image.src = src;
  });
  sourceImages.set(src, promise);
  promise.catch(() => sourceImages.delete(src));
  return promise;
}

function remember(key, url) {
  tintedTextures.set(key, url);
  while (tintedTextures.size > CACHE_LIMIT) {
    const [oldKey, oldUrl] = tintedTextures.entries().next().value;
    tintedTextures.delete(oldKey);
    if (![...document.images].some((image) => image.src === oldUrl)) URL.revokeObjectURL(oldUrl);
  }
}

/** Replace the image's blue liquid pixels with a cached, texture-preserving class variant. */
export async function applyManaTexture(imageElement, src, classId) {
  if (!imageElement || typeof Image === 'undefined') return false;
  const token = (generation.get(imageElement) || 0) + 1;
  generation.set(imageElement, token);
  imageElement.dataset.manaBaseSrc = src;
  const color = manaPoolColor(classId), key = `${src}|${color}`;
  if (color === MANA_POOL_COLORS.wizard) {
    imageElement.src = src;
    imageElement.dataset.manaTintClass = classId;
    return true;
  }
  const cached = tintedTextures.get(key);
  if (cached) {
    tintedTextures.delete(key); tintedTextures.set(key, cached);
    imageElement.src = cached;
    imageElement.dataset.manaTintClass = classId;
    return true;
  }
  const geometry = MANA_ART_GEOMETRY[src];
  if (!geometry) return false;
  try {
    const original = await loadSource(src);
    if (generation.get(imageElement) !== token) return false;
    const canvas = document.createElement('canvas');
    canvas.width = original.naturalWidth; canvas.height = original.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(original, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    recolorManaPixels(pixels.data, canvas.width, canvas.height, color, geometry);
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob || generation.get(imageElement) !== token) return false;
    const url = URL.createObjectURL(blob);
    remember(key, url);
    imageElement.src = url;
    imageElement.dataset.manaTintClass = classId;
    return true;
  } catch (error) {
    console.warn('[mana pool tint]', error);
    return false;
  }
}
