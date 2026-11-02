import assert from 'assert';
import { G } from '../../src/state.js';
import {
  useHearth,
  hearthTick,
  hearthOf,
  hearthReady,
  hearthChanneling,
  cancelHearth,
  closeHearthPortals,
  HEARTH_FILL
} from '../../src/game/hearth.js';

// Setup fake window / audio / UI mocks if needed
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { querySelector: () => null, getElementById: () => null };

console.log('--- TEST 1: Hearthstone readiness and idle in town ---');
G.char = { hearth: 1, depth: 3, name: 'Hero' };
G.player = { x: 10, y: 10, dead: false, moving: false };
G.world = { kind: 'town', portals: [], map: { walkable: () => true, randomNear: (x, y) => [x + 1, y] } };

assert.strictEqual(hearthReady(), false, 'Hearthstone should not be ready in town');
assert.strictEqual(useHearth(), false, 'useHearth in town returns false');
assert.strictEqual(G.char.hearth, 1, 'Hearthstone charge not consumed in town');

console.log('--- TEST 2: Movement cancels channel and preserves charge ---');
const dungeonWorld = {
  kind: 'dungeon',
  depth: 3,
  portals: [],
  creatures: [],
  map: { walkable: () => true, randomNear: (x, y) => [x + 1, y] }
};
G.world = dungeonWorld;
assert.strictEqual(hearthReady(), true, 'Hearthstone is ready in dungeon with full charge');

const used = useHearth();
assert.strictEqual(used, true, 'useHearth succeeds in dungeon');
assert.strictEqual(hearthChanneling(), true, 'hearthChanneling is true while invoking');
assert.strictEqual(G.char.hearth, 1, 'Charge is NOT consumed immediately upon starting channel');

// Tick slightly without moving
hearthTick(0.5);
assert.strictEqual(hearthChanneling(), true, 'Still channeling after 0.5s standing still');
assert.strictEqual(G.char.hearth, 1, 'Charge still preserved');

// Player moves!
G.player.moving = true;
G.player.x += 1;
hearthTick(0.016);
assert.strictEqual(hearthChanneling(), false, 'Channel should be cancelled when player moves');
assert.strictEqual(G.char.hearth, 1, 'Charge MUST be preserved when cancelled by moving');
assert.strictEqual(G.world.kind, 'dungeon', 'Player is still in the dungeon');
assert.strictEqual(dungeonWorld.portals.length, 0, 'No portals opened on cancel');

console.log('--- TEST 3: Successful channel opens portals in dungeon & town, and return closes them ---');
G.player.moving = false;
G.player.x = 25.5;
G.player.y = 30.5;

let enteredTownCalled = false;
const townWorld = {
  kind: 'town',
  portals: [],
  creatures: [],
  map: { walkable: () => true, randomNear: (x, y) => [x + 1, y] }
};

G.game = {
  enterTown() {
    enteredTownCalled = true;
    G.world = townWorld;
  },
  setWorld(w, [x, y], old) {
    G.world = w;
    G.player.x = x;
    G.player.y = y;
  }
};

const startOk = useHearth();
assert.strictEqual(startOk, true, 'Channel started again');
assert.strictEqual(hearthChanneling(), true);

// Channel for 1.7 seconds without moving
hearthTick(1.7);
assert.strictEqual(hearthChanneling(), false, 'Channel finished');
assert.strictEqual(G.char.hearth, 0, 'Charge consumed upon successful completion');
assert.strictEqual(enteredTownCalled, true, 'enterTown called');
assert.strictEqual(G.world.kind, 'town', 'Player is now in town');

// Check dungeon portal
const dPortal = dungeonWorld.portals.find(p => p.hearth);
assert.ok(dPortal, 'Dungeon has a Hearthstone portal');
assert.strictEqual(dPortal.x, 25.5, 'Dungeon portal is at origin x');
assert.strictEqual(dPortal.y, 30.5, 'Dungeon portal is at origin y');

// Check town portal
const tPortal = townWorld.portals.find(p => p.hearth);
assert.ok(tPortal, 'Town has a Hearthstone portal');
assert.strictEqual(tPortal.active, true);
assert.strictEqual(tPortal.label, 'Portal — Depth 3');

// Step through the town portal to return to depths
console.log('--- TEST 4: Return through town portal ---');
tPortal.use();
assert.strictEqual(G.world, dungeonWorld, 'Player returned to original dungeon world');
assert.strictEqual(G.player.x, 25.5, 'Player returned to origin x');
assert.strictEqual(G.player.y, 30.5, 'Player returned to origin y');

// Portals must be closed!
assert.strictEqual(dungeonWorld.portals.find(p => p.hearth), undefined, 'Dungeon portal is closed');
assert.strictEqual(townWorld.portals.find(p => p.hearth), undefined, 'Town portal is closed');

console.log('--- TEST 5: Death during channel cancels and preserves charge ---');
G.char.hearth = 1;
G.player.dead = false;
G.world = dungeonWorld;
assert.strictEqual(useHearth(), true);
assert.strictEqual(hearthChanneling(), true);

G.player.dead = true;
hearthTick(0.1);
assert.strictEqual(hearthChanneling(), false, 'Channel cancelled on death');
assert.strictEqual(G.char.hearth, 1, 'Charge preserved on death');

console.log('--- TEST 6: Entering another dungeon closes old Hearthstone portals ---');
G.player.dead = false;
G.char.hearth = 1;
useHearth();
hearthTick(1.7);
assert.strictEqual(townWorld.portals.some(p => p.hearth), true, 'Town portal is open');
assert.strictEqual(dungeonWorld.portals.some(p => p.hearth), true, 'Dungeon portal is open');

// Player enters a DIFFERENT dungeon (e.g. Depth 4)
const newDungeonWorld = {
  kind: 'dungeon',
  depth: 4,
  portals: [],
  creatures: [],
  map: { walkable: () => true, randomNear: (x, y) => [x + 1, y] }
};
G.world = newDungeonWorld;
hearthTick(0.1);

assert.strictEqual(dungeonWorld.portals.some(p => p.hearth), false, 'Old dungeon portal closed');
assert.strictEqual(townWorld.portals.some(p => p.hearth), false, 'Old town portal closed');

console.log('ALL UNIT AND INTEGRATION TESTS PASSED SUCCESSFULLY!');
