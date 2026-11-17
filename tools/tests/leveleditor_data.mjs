// Headless Node verification for Velscour Scenario Codec (.velscen.json), all 11 Scenario Categories,
// RLE64 TypedArray round-trips, Procedural Seed Baking, Reachability Validator, and Studio Index Builder.
import assert from 'node:assert/strict';
import {
  SCENARIO_CATEGORIES,
  encodeTypedArray,
  decodeTypedArray,
  createBlankScenarioDoc,
  serializeScenarioDoc,
  deserializeScenarioDoc,
  bakeGeneratedToDoc,
  validateScenarioDoc,
  computeReachabilityMask,
  resolveBiome,
} from '../../src/world/scenariocodec.js';
import { generateCaverns } from '../../src/world/caverns.js';
import { generateTower } from '../../src/world/tower.js';
import { generateGhostTrain } from '../../src/world/ghosttrain.js';
import { generateSeaship } from '../../src/world/seaship.js';
import { generateSkyship } from '../../src/world/skyship.js';
import { rebuildScenarioIndex } from '../leveleditor/server.mjs';

// 1. TypedArray RLE64 lossless round-trips
for (const [ArrType, sample] of [
  [Uint8Array, [0, 0, 0, 1, 1, 1, 1, 255, 0, 42]],
  [Uint16Array, [0, 512, 512, 512, 1024, 65535, 0]],
  [Int16Array, [-40, -40, -40, 0, 0, 12, 36, 36, -8]],
  [Float32Array, [0, 0, 0.45, 0.45, 3.25, -1.5, 0]],
]) {
  const src = new ArrType(sample);
  const enc = encodeTypedArray(src);
  const dec = decodeTypedArray(enc, ArrType, src.length);
  assert.deepEqual(Array.from(dec), Array.from(src), `Round-trip mismatch for ${ArrType.name}`);
}

// 2. All 11 Scenario Categories blank doc creation + serialize/deserialize + validation
assert.equal(SCENARIO_CATEGORIES.length, 11, 'Expected all 11 scenario categories');
for (const cat of SCENARIO_CATEGORIES) {
  const doc = createBlankScenarioDoc({
    id: `test_${cat.id}`,
    name: `Test ${cat.name}`,
    category: cat.id,
    biomeId: cat.biomes[0],
  });
  const json = JSON.parse(JSON.stringify(serializeScenarioDoc(doc)));
  const roundTrip = deserializeScenarioDoc(json);
  assert.equal(roundTrip.meta.category, cat.id);
  assert.equal(roundTrip.grid.layers.t.length, roundTrip.grid.w * roundTrip.grid.h);

  const issues = validateScenarioDoc(roundTrip);
  const errors = issues.filter((i) => i.level === 'error');
  assert.equal(errors.length, 0, `Category ${cat.id} had validation errors: ${JSON.stringify(errors)}`);

  const reach = computeReachabilityMask(roundTrip);
  const reachableTiles = reach.reduce((a, b) => a + b, 0);
  assert.ok(reachableTiles > 10, `Category ${cat.id} should have walkable reachable tiles from start (got ${reachableTiles})`);
}

// 3. Seed-to-Document Baker across complex 3D & vehicle generators
const bakedTests = [
  ['3d_caverns', 'depths_edge', () => generateCaverns(12, resolveBiome('depths_edge'), 4242)],
  ['3d_tower', 'serpentine_tower', () => generateTower(18, resolveBiome('serpentine_tower'), 4242)],
  ['3d_train', 'ghost_train', () => generateGhostTrain(18, resolveBiome('ghost_train'), 4242)],
  ['naval', 'pirate_seas', () => generateSeaship(16, resolveBiome('pirate_seas'), 4242)],
  ['airship', 'skyship', () => generateSkyship(16, resolveBiome('skyship'), 4242, null)],
];

for (const [catId, biomeId, fn] of bakedTests) {
  const gen = fn();
  const doc = bakeGeneratedToDoc(gen, { category: catId, biomeId, seed: 4242 });
  const rt = deserializeScenarioDoc(JSON.parse(JSON.stringify(serializeScenarioDoc(doc))));
  const errs = validateScenarioDoc(rt).filter((i) => i.level === 'error');
  assert.equal(errs.length, 0, `Baked ${catId} had errors: ${JSON.stringify(errs)}`);
}

// 4. Scenario Index builder
const idx = rebuildScenarioIndex();
assert.ok(Array.isArray(idx.scenarios) && idx.scenarios.some((s) => s.id === 'sanctum_of_echoes'), 'sanctum_of_echoes should be indexed');

console.log(`PASS (${SCENARIO_CATEGORIES.length} categories, ${bakedTests.length} seed bakes, ${idx.scenarios.length} indexed scenario(s))`);
