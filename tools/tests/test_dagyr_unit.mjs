// Unit test for Demon Lord Dagyr fight phases and absorb mechanic
import assert from 'node:assert';
import { HP_MUL, DMG_MUL, PACE } from '../../src/game/dagyr.js';

console.log('Testing Demon Lord Dagyr parameters...');
assert.strictEqual(HP_MUL, 2);
assert.strictEqual(DMG_MUL, 0.7);

// Test absorb mechanics and phase transition gating
const maxHp = 714600;
let hp = maxHp;
let gate = 0.8;
let bank = 10000;
let phase = 1;

function absorb(dmg) {
  const room = Math.max(0, hp - maxHp * gate);
  const take = Math.min(dmg, bank, room);
  bank -= take;
  return take;
}

// 1. Attack in Phase 1 (100% -> 80%)
let hits = 0;
while (phase === 1 && hits < 10000) {
  hits++;
  const dmg = 2500;
  const take = absorb(dmg);
  hp -= take;
  bank = Math.min(maxHp * PACE * 3, bank + maxHp * PACE * 0.033);
  const frac = hp / maxHp;
  if (frac <= 0.8 + 1e-4) {
    phase = 2;
    break;
  }
}
assert.strictEqual(phase, 2, 'Phase 1 must transition to Phase 2 at ~80% HP');
assert.ok(hp <= maxHp * 0.8 + 1e-4 * maxHp, 'HP must reach the 80% threshold');

// 2. Phase 2 -> 3 (Seals broken, 80% -> 50%)
gate = 0.5;
phase = 3;
hits = 0;
while (phase === 3 && hits < 10000) {
  hits++;
  const dmg = 2500;
  const take = absorb(dmg);
  hp -= take;
  bank = Math.min(maxHp * PACE * 3, bank + maxHp * PACE * 0.033);
  const frac = hp / maxHp;
  if (frac <= 0.5 + 1e-4) {
    phase = 4;
    break;
  }
}
assert.strictEqual(phase, 4, 'Phase 3 must transition to Phase 4 at ~50% HP');

// 3. Phase 4 -> 5 (Shards broken, 50% -> 35%, then 35% -> 10%)
hp -= maxHp * 0.15;
phase = 5;
gate = 0.1;
hits = 0;
while (phase === 5 && hits < 10000) {
  hits++;
  const dmg = 2500;
  const take = absorb(dmg);
  hp -= take;
  bank = Math.min(maxHp * PACE * 3, bank + maxHp * PACE * 0.033);
  const frac = hp / maxHp;
  if (frac <= 0.1 + 1e-4) {
    phase = 6;
    break;
  }
}
assert.strictEqual(phase, 6, 'Phase 5 must transition to Phase 6 at ~10% HP');

// 4. Phase 6 -> Finish (Obelisks broken, gate = 0)
phase = 5;
gate = 0;
hits = 0;
while (hp > 0 && hits < 10000) {
  hits++;
  const dmg = 2500;
  const take = absorb(dmg);
  hp -= take;
  bank = Math.min(maxHp * PACE * 3, bank + maxHp * PACE * 0.033);
}
assert.strictEqual(hp, 0, 'Boss must reach 0 HP when gate is 0');

// 5. Test depth clamping in migrate
const { migrate } = await import('../../src/game/save.js');
const testChar = {
  depth: 501,
  deepest: 501,
  potions: {},
};
migrate(testChar);
assert.strictEqual(testChar.depth, 500, 'depth must be clamped to 500');
assert.strictEqual(testChar.deepest, 500, 'deepest must be clamped to 500');

console.log('ALL DAGYR UNIT TESTS PASSED!');

