/** Return the exact integer source rectangle shared by runtime rendering and atlas previews. */
export function trapAtlasFrameRect(width, height, columns, rows, column, row) {
  width = Math.max(0, Math.floor(Number(width) || 0));
  height = Math.max(0, Math.floor(Number(height) || 0));
  columns = Math.max(1, Math.floor(Number(columns) || 1));
  rows = Math.max(1, Math.floor(Number(rows) || 1));
  column = Number(column); row = Number(row);
  if (width < 1 || height < 1 || !Number.isInteger(column) || !Number.isInteger(row) || column < 0 || column >= columns || row < 0 || row >= rows) return null;
  const sx = Math.round(column * width / columns), sx1 = Math.round((column + 1) * width / columns);
  const sy = Math.round(row * height / rows), sy1 = Math.round((row + 1) * height / rows);
  return { sx, sy, sw: sx1 - sx, sh: sy1 - sy };
}

/** Falling icicles intentionally move through their frames; other trap art changes around a fixed ground pivot. */
export function trapAnchorFrame(trapKind, animationFrame) {
  return trapKind === 'icicle' ? animationFrame : 0;
}

/** Find the bottom-center contact of the substantial sprite base, ignoring isolated sparks and debris pixels. */
export function findTrapGroundAnchor(rgba, width, height, alphaThreshold = 16) {
  width = Math.max(0, Math.floor(Number(width) || 0));
  height = Math.max(0, Math.floor(Number(height) || 0));
  if (!rgba || width < 1 || height < 1) return null;
  const start = Math.floor(height * 0.55), counts = new Uint16Array(height);
  const bounds = Array.from({ length: height }, () => [width, -1]);
  let maxCount = 0;
  for (let y = start; y < height; y++) {
    const row = bounds[y];
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] <= alphaThreshold) continue;
      counts[y]++;
      row[0] = Math.min(row[0], x);
      row[1] = x;
    }
    maxCount = Math.max(maxCount, counts[y]);
  }
  if (!maxCount) return null;
  // Prefer the lowest row with a real base-width footprint. A lone ember,
  // crystal chip, or antialiased fragment below the floor base is not a foot.
  const minSpan = Math.max(2, Math.ceil(width * 0.12));
  const minPixels = Math.max(3, Math.ceil(minSpan * 0.12));
  for (let y = height - 1; y >= start; y--) {
    const [minX, maxX] = bounds[y];
    if (counts[y] >= minPixels && maxX - minX + 1 >= minSpan) return { x: (minX + maxX + 1) / 2, y: y + 1 };
  }
  // Very narrow fixture rows can lack a wide foot; use a significant share of
  // their dense lower silhouette rather than an isolated final pixel.
  const minContactPixels = Math.max(1, Math.ceil(maxCount * 0.35));
  for (let y = height - 1; y >= start; y--) {
    const [minX, maxX] = bounds[y];
    if (counts[y] >= minContactPixels && maxX >= minX) return { x: (minX + maxX + 1) / 2, y: y + 1 };
  }
  return null;
}

/** Corners of a one-by-one world tile. Isometric projection renders this square as a floor diamond. */
export function isometricTileCorners(tile) {
  const x = Number(tile?.x), y = Number(tile?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
  return [
    { x: x - 0.5, y: y - 0.5 },
    { x: x + 0.5, y: y - 0.5 },
    { x: x + 0.5, y: y + 0.5 },
    { x: x - 0.5, y: y + 0.5 },
  ];
}

/** Collision against the same one-by-one tile footprint shown by its warning diamond. */
export function pointInTrapTile(point, tile, padding = 0) {
  const x = Number(point?.x), y = Number(point?.y), tx = Number(tile?.x), ty = Number(tile?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(tx) || !Number.isFinite(ty)) return false;
  const pad = Math.max(0, Number(padding) || 0);
  return Math.abs(x - tx) <= 0.5 + pad && Math.abs(y - ty) <= 0.5 + pad;
}
