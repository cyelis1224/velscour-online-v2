import assert from 'node:assert';
import { isSharedMonsterIdx, isValidKilledId, recordKilledMonster, isMonsterKilled, purgeKilledMonstersFromWorld } from '../../src/game/game.js';
import { G } from '../../src/state.js';
import { hit, kill } from '../../src/game/combat.js';

console.log('--- Running MP Monster Sync & Despawn Regression Test ---');

// 1. Verify ID validators
assert.strictEqual(isSharedMonsterIdx(1), true, 'idx 1 is shared');
assert.strictEqual(isSharedMonsterIdx(50), true, 'idx 50 is shared');
assert.strictEqual(isSharedMonsterIdx(1999), true, 'idx 1999 is shared');
assert.strictEqual(isSharedMonsterIdx(2000), false, 'idx 2000 is not shared');
assert.strictEqual(isSharedMonsterIdx(2001), false, 'idx 2001 is not shared');
assert.strictEqual(isSharedMonsterIdx(0), false, 'idx 0 is not shared');
assert.strictEqual(isSharedMonsterIdx(null), false, 'null is not shared');
assert.strictEqual(isSharedMonsterIdx('m_1_0'), false, 'string is not number');

assert.strictEqual(isValidKilledId('m_5_0'), true);
assert.strictEqual(isValidKilledId(42), true);
assert.strictEqual(isValidKilledId(2001), false);
assert.strictEqual(isValidKilledId(0), false);
assert.strictEqual(isValidKilledId(''), false);
console.log('✓ ID validators passed');

// 2. Setup mock G.room and G.world
G.room = {
  depth: 5,
  killedMonsters: new Map(),
  unsealedDepths: new Set(),
};

const mockWorld = {
  kind: 'dungeon',
  depth: 5,
  creatures: [],
  killedMonsterIds: new Set(),
  rewardedMonsterIds: new Set(),
};
G.world = mockWorld;

// Create 3 monsters in mockWorld:
// m1: netId = 'm_5_0', idx = 1
// m2: netId = 'm_5_1', idx = 2
// m3: dynamic monster netId = null, idx = 2001 (local sequence)
const m1 = {
  netId: 'm_5_0',
  idx: 1,
  team: 'enemy',
  hp: 100,
  maxHp: 100,
  dead: false,
  x: 10,
  y: 10,
};
const m2 = {
  netId: 'm_5_1',
  idx: 2,
  team: 'enemy',
  hp: 100,
  maxHp: 100,
  dead: false,
  x: 12,
  y: 10,
};
const m3 = {
  netId: null,
  idx: 2001,
  team: 'enemy',
  hp: 50,
  maxHp: 50,
  dead: false,
  x: 14,
  y: 10,
};

mockWorld.creatures = [m1, m2, m3];

// 3. Simulate killing m1 on Peer A
recordKilledMonster(5, 'm_5_0', 1, mockWorld);
assert.strictEqual(isMonsterKilled(mockWorld, 5, 'm_5_0', 1), true, 'm1 is marked killed');
assert.strictEqual(isMonsterKilled(mockWorld, 5, 'm_5_1', 2), false, 'm2 is not marked killed');

// 4. Purge mockWorld: m1 must be removed, m2 and m3 must remain!
purgeKilledMonstersFromWorld(mockWorld);
assert.strictEqual(mockWorld.creatures.includes(m1), false, 'm1 purged from world');
assert.strictEqual(mockWorld.creatures.includes(m2), true, 'm2 still in world');
assert.strictEqual(mockWorld.creatures.includes(m3), true, 'm3 still in world');
console.log('✓ Purge killed monsters passed');

// 5. Test local dynamic monster index collision safety
// Another client killed local creature 2001
recordKilledMonster(5, null, 2001, mockWorld); // Attempting to record local 2001 without netId
assert.strictEqual(isMonsterKilled(mockWorld, 5, null, 2001), false, 'local 2001 cannot pollute killedMonsters');
purgeKilledMonstersFromWorld(mockWorld);
assert.strictEqual(mockWorld.creatures.includes(m3), true, 'm3 was not falsely purged by 2001 collision');
console.log('✓ Dynamic idx 2000+ collision safety passed');

// 6. Test combat network damage application on Authority
const targetEnemy = {
  netId: 'm_5_99',
  idx: 99,
  team: 'enemy',
  hp: 100,
  maxHp: 100,
  dead: false,
  x: 20,
  y: 20,
  world: mockWorld,
};
mockWorld.creatures.push(targetEnemy);

const remotePlayer = {
  isRemotePlayer: true,
  id: 'remote_peer_1',
  name: 'Teammate',
  team: 'player',
  x: 19,
  y: 20,
};

// Hit from network (peer damaged monster on authority)
hit(remotePlayer, targetEnemy, 40, 'fire', { fromNetwork: true });
assert.strictEqual(targetEnemy.hp, 60, 'Target HP reduced by network hit');
assert.strictEqual(targetEnemy.dead, false, 'Target not dead yet');

// Lethal hit from network
hit(remotePlayer, targetEnemy, 70, 'phys', { fromNetwork: true });
assert.strictEqual(targetEnemy.hp, 0, 'Target HP reduced to 0');
assert.strictEqual(targetEnemy.dead, true, 'Target died');
assert.strictEqual(mockWorld.killedMonsterIds.has('m_5_99'), true, 'Killed netId recorded in world.killedMonsterIds');
console.log('✓ Remote player combat network hit passed');

// 7. Duplicate XP & Loot Reward Guard
let rewardCount = 0;
// Verify kill() with already rewarded monster doesn't re-reward
assert.strictEqual(mockWorld.rewardedMonsterIds.has('m_5_99'), true, 'Monster is marked rewarded');
// Call kill again on dead monster
kill(targetEnemy, null, { fromNetwork: true });
assert.strictEqual(mockWorld.rewardedMonsterIds.size, 1, 'rewardedMonsterIds size still 1');
console.log('✓ Duplicate reward guard passed');

// 8. Room Snapshot on Reconnect
const { getActiveRoomReconnectSnapshot } = await import('../../src/net/network.js');
G.mode = 'game';
G.room = {
  name: 'TestRoom',
  seed: 987654,
  townSeed: 987654,
  dungeonSeed: 123456,
  depth: 5,
  biome: 'catacombs',
  hostId: 'host_player_1',
  hostName: 'HostHero',
  killedMonsters: new Map([[5, new Set(['m_5_0', 'm_5_1'])]]),
  unsealedDepths: new Set([4]),
};
const snap = getActiveRoomReconnectSnapshot();
assert.strictEqual(snap.name, 'TestRoom');
assert.strictEqual(snap.depth, 5);
assert.strictEqual(snap.biome, 'catacombs');
assert.strictEqual(snap.hostId, 'host_player_1');
assert.deepStrictEqual(snap.killed, ['m_5_0', 'm_5_1']);
assert.deepStrictEqual(snap.unsealedDepths, [4]);
console.log('✓ Active room reconnect snapshot passed');

console.log('--- ALL MULTIPLAYER MONSTER SYNC UNIT TESTS PASSED ---');
process.exit(0);
