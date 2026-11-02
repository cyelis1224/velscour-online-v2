# Mountainside: the height-mapped overworld

An expanded 80 x 80 climb from the foot of a mountain (the bottom-left edge of the screen, southwest) to its summit (the top-right, northeast).
It is part of the active overworld rotation (guaranteed in the overworld cycle alongside Castle, Sea of Sand, and Dark Forest).
It can also be reached directly through Dagyr's skull button beside the minimap by sending the message `mountain` (any case), or selected on the HAIL DAGYR! list ("Mountainside · Overworld").
Test: `node tools/tests/mountain.js [shots|noshots] [auto|noauto]`.

## Height
- `map.hgt` (Int16Array) holds a level per tile; a level is `HS` = 4 world px (`src/gfx/terrain.js`).
- A body hops **up** at most `map.climb` = 4 levels (16 px) and **drops** at most `map.drop` = 10 levels (40 px).
  Taller steps are walls one way, the tallest both ways. Monsters can jump down on the hero where he cannot climb.
- `TileMap` (`src/world/map.js`) checks the rule in `stepOk`/`stepsOk`; `circleFree(x, y, r, from)` needs the centre to
  be a legal hop or drop from `from` and no corner to hang over too deep a drop. `move`, `findPath`, `buildFlow`,
  `flowStep`, `losWide` and `los` (ground more than a hop above both ends blocks sight) all use it. A diagonal needs
  all four tiles round the corner within a hop. Flat maps leave `hgt` null and pay nothing.
- Auto-play's own distance field (`Auto.buildNav`/`pathTo`) follows the same rule.

## Projection and drawing
- `setElevation(elev, pick)` in `src/core/view.js` lifts the ground plane: `isoY(x, y)` subtracts the tile's height,
  so creatures, spells, lights, labels and loot all stand on the terrain with no per-system code. `pick` turns a screen
  point back into the lifted tile under it (mouse and touch). `game.setWorld` calls `useTerrain(map)`.
- `drawTerrain` bakes columns into the floor chunks back to front: the tile top lifted by its height, and on the two
  faces the camera sees (SW toward +y, SE toward +x) an earth bank of the tile's own ground over procedural granite,
  darker toward the foot, with a turf lip and tufts. Faces over the void (the foot and the east precipice) run down to
  `map.baseLevel` and fade into haze. Higher ground behind a tile shades it.
- Sorting: on a height map every sorted item keys on the tile it stands on (`standKey`), and a column that rises toward
  the camera over a tile behind it (`occluders`) is drawn again over anyone standing behind it.
- `hopZ` gives each creature a short hop arc when it steps up and a fall when it drops (render.js case 6).
- A sky gradient with two ranges of far peaks is drawn behind the mountain (`drawSky`); the minimap is shaded by height.

## The map (`src/world/mountain.js`)
- Uphill is `v = 79 - y`. Base slope 0.65 levels a row, seven cliff bands (9-15 levels) at v = 10, 20, 30, 40, 50, 60, 69,
  each broken by one ramp (a stair of ~2 levels a tile) alternating east and west (x = 60, 18, 62, 16, 64, 18, 62),
  so the trail switchbacks up across the entire mountain face. A hop-high terrace (3-4 levels) crosses each band between cliffs.
- Playable bounds are strictly enforced (`X_MIN = 4`, `X_MAX = 74`, `Y_MIN = 4`, `Y_MAX = 75`): the west ridge (`x < 4`)
  and eastern precipice (`x > 74`) are void (`map.t = 0`) and blocked (`map.block = 1`), preventing any monster spawns,
  ambushes, or minions outside the playable map.
- Landmark set pieces:
  - **Glacial Tarn**: a high mountain pool on Tier 3 with shallow water, gravel wash, and stepping stones.
  - **Climbers' Base Camp**: on Tier 2 with campfire, supply crates, bedrolls, and a loot chest.
  - **High Alpine Outpost**: on Tier 6 overlooking the cloud precipice with ancient standing stones and an elite chest.
  - **Secret Hop Ledges**: 5-6 elevated rock shelves across the mountain, each exactly 1 hop high with a treasure chest.
  - **The Frozen Summit**: spacious snow plateau with cairn monoliths, ancient shrine, and the Summit Warden arena.
- Ground across 8 zones: valley meadow at the foot, pine forest floor, alpine terraces, glacial tarn moss and wash,
  scree slopes, frost crags, ruined watchtower, and summit snow. Props: town firs, pines, cedars, junipers and frost firs,
  Dark Forest spire pines, moss firs, boulders, shrubs, flowers, cairns, and shrines.
- About 38-40 monster packs (champions higher up) and the Summit Warden (a golem boss) on the peak. Generation is ~200 ms;
  a seed whose trail fails retries (most build first time).

## Run (`src/game/mountain.js`)
Live from the start: climb to the summit, defeat the Warden, and the exit on the peak opens (+1 skill point the first
time). `objective` points auto-play at the summit; the Quest Log shows the altitude reached.

## Status
- Fully integrated into the active overworld depth rotation (`OVERWORLD_BIOME_IDS`).
- Features ambient snow flurries (`type: 'snow'`), Summit Warden boss encounter, and altitude tracking in the quest log.
