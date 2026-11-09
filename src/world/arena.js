// Arena Map Generator for Dedicated Player-vs-Player Duels
// A grand octagonal stone coliseum with perimeter torch sconces, stone pillars, and duel spawn gates.

import { TileMap } from './map.js';
import { BIOME_BY_ID } from '../data/biomes.js';
import { biomeTileSet, keepTileSets } from '../core/assets.js';
import { torchAtWallSegment } from './dungeon.js';
import { World } from '../game/world.js';

export function createArenaWorld(duelData = {}) {
  const W = 32, H = 32;
  const map = new TileMap(W, H);
  const cx = 16, cy = 16, r = 11;

  // Carve circular arena floor
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) {
        map.t[y * W + x] = 1;
        // Tile visual variation for arena floor
        map.v[y * W + x] = ((x ^ y) % 3 === 0) ? 1 : 0;
      }
    }
  }

  // Four corner pillars (obstacles) for tactical line-of-sight and kiting
  const pillarSpots = [
    [11, 11],
    [21, 11],
    [11, 21],
    [21, 21],
  ];

  for (const [px, py] of pillarSpots) {
    if (map.t[py * W + px]) {
      map.block[py * W + px] = 1;
    }
  }

  const biome = BIOME_BY_ID.castle_keep || BIOME_BY_ID.catacombs;
  const tileset = biomeTileSet(biome);
  keepTileSets(tileset);

  // Build walls, segments and edges
  map.buildWalls(tileset);

  // Perimeter torches along the arena walls
  const torches = [];
  if (Array.isArray(map.segments)) {
    let torchIdx = 0;
    for (const s of map.segments) {
      if (!s.front && (torchIdx++ % 3 === 0)) {
        torches.push(torchAtWallSegment(s));
      }
    }
  }

  // Scatter props for pillars
  const props = [];
  const col = tileset.scatter?.find((e) => e.name?.includes('pillar') || e.name?.includes('obelisk')) || tileset.scatter?.[0];
  if (col) {
    for (const [px, py] of pillarSpots) {
      props.push({
        kind: 'scatter',
        x: px + 0.5,
        y: py + 0.5,
        spr: col,
        k: tileset.k || 1,
      });
    }
  }

  const world = new World('arena', {
    map,
    tileset,
    biome,
    depth: 0,
    torches,
    props,
    wallHangings: [],
    p1Spawn: [16, 7],
    p2Spawn: [16, 25],
    center: [16, 16],
    radius: r,
    duelId: duelData?.duelId || null,
  });

  return world;
}

