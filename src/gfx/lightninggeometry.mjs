/** Write a lightweight jagged bolt (at most eight segments) into reusable xy storage. */
export function writeBoltGeometry(out, ax, ay, bx, by, random = Math.random) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
  const n = Math.min(8, Math.max(3, Math.ceil(len / 24)));
  const nx = -dy / (len || 1), ny = dx / (len || 1), offset = Math.min(4.5, len * 0.06);
  out[0] = ax; out[1] = ay;
  for (let i = 1; i < n; i++) {
    const t = i / n, off = (random() * 2 - 1) * offset, at = i * 2;
    out[at] = ax + dx * t + nx * off;
    out[at + 1] = ay + dy * t + ny * off;
  }
  out[n * 2] = bx; out[n * 2 + 1] = by;
  return n + 1;
}

/** Append cached interleaved bolt points to the current path without temporary arrays. */
export function appendBoltGeometry(ctx, points, count) {
  if (count < 2) return;
  ctx.moveTo(points[0], points[1]);
  for (let i = 1; i < count; i++) ctx.lineTo(points[i * 2], points[i * 2 + 1]);
}
