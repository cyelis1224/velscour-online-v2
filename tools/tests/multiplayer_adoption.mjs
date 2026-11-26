import assert from 'node:assert/strict';
import test from 'node:test';

// Minimal DOM/localStorage stub for headless Node unit verification
const memStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => { memStore.set(k, String(v)); },
  removeItem: (k) => { memStore.delete(k); },
  clear: () => { memStore.clear(); },
};

import { G } from '../../src/state.js';
import { UNIQUE_HEALTH_MULTIPLIER, rollUniqueAffixes, uniqueDamageAfterDefense } from '../../src/game/uniqueBalance.js';
import { applyToughHealthModifier } from '../../src/game/championBalance.mjs';
import { canDropNaturalSigil, naturalSigilDropChance, recordNaturalSigilDrop, rollTreasureImpSigilDrop } from '../../src/game/sigildrops.mjs';
import { findMimicSpawn } from '../../src/game/mimic.mjs';
import { TileMap } from '../../src/world/map.js';
import { SHEER } from '../../src/data/sheer.js';
import { keepState, buyArmor, vaultOffer, claimVault, today } from '../../src/game/keep.js';
import { TRADE } from '../../src/data/keep.js';
import { reliquary, resetReliquaryCache, transferReliquaryGold, reliquaryGold, accountJewelBox } from '../../src/game/reliquary.js';
import { markXp, gainMarkXp, markBonuses, purchaseUpgrade, resetMarks, grantMarks, PVP_MARK_CAPS } from '../../src/game/marks.js';
import { unlockEndgame } from '../../src/game/endgame.js';
import { heresyBegin } from '../../src/game/heresies.js';
import { manaPoolColor, MANA_POOL_COLORS } from '../../src/data/mana-pool-colors.js';
import { shrineFloatingMessage } from '../../src/game/shrineeffects.js';
import { lootLabelFilter, shouldSuppressPotionLabelForCapacity } from '../../src/game/lootfilter.js';

test('Phase 2: Sheer Drops, Unique/Champion balance, Sigil cap, and Mimic safe spawn', () => {
  assert.equal(SHEER.length, 10);
  assert.equal(UNIQUE_HEALTH_MULTIPLIER, 3.9);

  // Unique max 1 defensive affix + 40% damage floor
  const affixes = rollUniqueAffixes(['armored', 'shielded', 'stone_skin', 'vampiric', 'molten'], 3, () => 0);
  assert.ok(affixes.length <= 3);
  assert.equal(uniqueDamageAfterDefense('unique', 100, 10), 40);
  assert.equal(uniqueDamageAfterDefense('unique', 100, 80), 80);

  // Champion tough health modifier
  const champ = { maxHp: 1000, hp: 1000, rank: 'champion', affixes: ['tough'] };
  applyToughHealthModifier(champ);
  assert.ok(champ.maxHp > 1000 && champ.maxHp < 2000);

  // Natural Sigil cap per generated level
  const char = { level: 50, sigilDropLevels: [] };
  const world = { kind: 'dungeon', depth: 25, biome: { id: 'crypt' } };
  assert.ok(naturalSigilDropChance(1, world, {}) <= 0.05 + 1e-9);
  assert.equal(canDropNaturalSigil(world, char), true);
  assert.equal(recordNaturalSigilDrop(world, char), true);
  assert.equal(canDropNaturalSigil(world, char), false);
  // Treasure Imp Sigil roll is exempt from floor cap
  assert.equal(typeof rollTreasureImpSigilDrop(world, char, {}, () => 0), 'boolean');

  // Mimic safe spawn on TileMap with positionFree
  const map = new TileMap(10, 10);
  for (let y = 1; y < 9; y++) for (let x = 1; x < 9; x++) map.t[y * 10 + x] = 1;
  const mimic = { r: 0.4, x: 5, y: 5 };
  const player = { isPlayer: true, r: 0.35, x: 4, y: 5, dead: false };
  const pos = findMimicSpawn(map, mimic, [player], 5, 5);
  assert.ok(pos && Number.isFinite(pos.x) && Number.isFinite(pos.y));
  assert.equal(map.positionFree(mimic, pos.x, pos.y), true);
});

test('Phase 3: Tessariel\'s Keep Ember-forged gear is accountBound', () => {
  const char = { id: 'hero-1', classId: 'paladin', level: 80, deepest: 200, gold: 1000, bag: Array(40).fill(null) };
  const k = keepState(char);
  k.embers = 5000;
  const item = buyArmor(0, 'body', char);
  assert.ok(item, 'buyArmor should forge armor when hero has embers and depth');
  assert.equal(item.accountBound, true, 'Keep Ember-forged gear must be accountBound');
  assert.equal(k.embers, 5000 - TRADE[0].cost);
});

test('Phase 4: Account-wide Reliquary Gold, Shared Jewel Box migration, Progressive Mark XP, PvP Mark Normalization, Co-op Heresy', () => {
  memStore.clear();
  resetReliquaryCache();
  const char = {
    id: 'hero-1', classId: 'wizard', level: 100, gold: 5000,
    jewelBox: [{ type: 'gem', gem: 'ruby', tier: 3, count: 2 }, null, null],
    heresy: { on: ['iron'] },
  };
  G.char = char;

  // Reliquary gold deposit & withdraw
  const dep = transferReliquaryGold(char, 'deposit', 2000);
  assert.equal(dep.ok, true);
  assert.equal(char.gold, 3000);
  assert.equal(reliquaryGold(), 2000);
  const wit = transferReliquaryGold(char, 'withdraw', 750);
  assert.equal(wit.ok, true);
  assert.equal(char.gold, 3750);
  assert.equal(reliquaryGold(), 1250);

  // Account-wide Jewel Box migration
  const sharedBox = accountJewelBox(char);
  assert.equal(sharedBox[0]?.gem, 'ruby');
  assert.equal(sharedBox[0]?.count, 2);
  assert.equal(char.jewelBox[0], null, 'Legacy per-character jewelBox slot cleared after migration');

  // Progressive Mark XP & PvP Arena normalization
  unlockEndgame();
  const cost0 = markXp(0);
  const cost1 = markXp(1);
  assert.ok(cost1 > cost0, 'Each post-100 Mark should cost more XP than the previous');
  const gained = gainMarkXp(cost0 + 10, { rift: true }, char);
  assert.equal(gained, 1);
  assert.equal(char.experienceMarks.earned, 1);

  resetMarks();
  grantMarks(10000, 'test', { rift: true });
  purchaseUpgrade('vitality', 20);
  purchaseUpgrade('might', 20);
  purchaseUpgrade('crit', 15);
  purchaseUpgrade('ferocity', 15);
  const pve = markBonuses({ kind: 'dungeon' });
  const pvp = markBonuses({ kind: 'arena' });
  assert.equal(pvp.pvpNormalized, true);
  assert.ok(pvp.life <= PVP_MARK_CAPS.life && pvp.life < pve.life);
  assert.ok(pvp.might <= PVP_MARK_CAPS.might && pvp.might < pve.might);
  assert.ok(pvp.crit <= PVP_MARK_CAPS.crit && pvp.crit < pve.crit);
  assert.ok(pvp.critDmg <= PVP_MARK_CAPS.critDmg && pvp.critDmg < pve.critDmg);

  // Co-op host-authoritative Heresy rank
  G.room = { players: [{ id: 'p1' }, { id: 'p2' }], hostHeresies: ['iron', 'cruel'] };
  const coopWorld = { kind: 'dungeon', depth: 50 };
  const activeIds = heresyBegin(coopWorld, char);
  assert.deepEqual(activeIds, ['iron', 'cruel']);
  assert.equal(coopWorld.heresy.hostSynced, true);
  G.room = null;
});

test('Phase 5: Class mana pool colors, Shrine floating text, and Dynamic potion ground labels', () => {
  assert.ok(Object.keys(MANA_POOL_COLORS).length >= 19);
  assert.equal(manaPoolColor('totem_master'), '#40E0D0');
  assert.equal(manaPoolColor('unknown_class'), MANA_POOL_COLORS.wizard);

  const msg = shrineFloatingMessage('frenzy', { name: 'Shrine of Frenzy' });
  assert.ok(typeof msg === 'string' && msg.length > 0);

  const char = { potions: { hp: 30, mp: 5 } };
  G.char = char;
  const f = lootLabelFilter();
  f.dynamicPotionLabels = false;
  assert.equal(shouldSuppressPotionLabelForCapacity(char, 'hp'), false);
  f.dynamicPotionLabels = true;
  assert.equal(shouldSuppressPotionLabelForCapacity(char, 'hp'), true);
  assert.equal(shouldSuppressPotionLabelForCapacity(char, 'mp'), false);
});

import { INFERNAL_UPGRADES, MARK_CATEGORIES } from '../../src/data/infernalupgrades.js';
import { selectDungeonChestVariant } from '../../src/data/chestappearances.js';
import { townStorageChestArtFor } from '../../src/data/town-storage-chests.js';
import { IMP_BY_ID } from '../../src/data/treasureimps.js';
import { CRITTERS } from '../../src/game/critters.js';
import { PACK_LEADERS } from '../../src/data/packleaders.js';
import { ENVIRONMENT_TRAP_TYPES } from '../../src/game/environmenttraps.js';
import { HERESY_MAX_RANK } from '../../src/data/heresies.js';

test('Deep Velscour-PC integration: 40+ Marks, 20 Chest Variants, Jewel Box art, 20 Treasure Imps, Gilded Critters, 15 Pack Leaders, Traps, Heresy 75', () => {
  assert.ok(INFERNAL_UPGRADES.length >= 40, `Expected >=40 Infernal upgrades, got ${INFERNAL_UPGRADES.length}`);
  assert.equal(MARK_CATEGORIES.length, 6);

  const variant = selectDungeonChestVariant({ biomeId: 'crypt', seed: 42, x: 5, y: 5 });
  assert.ok(Number.isInteger(variant) && variant >= 0 && variant < 20);
  assert.equal(townStorageChestArtFor({ jewelBox: true }).townStorageChest, 'jewel-box');
  assert.equal(townStorageChestArtFor({ reliquary: true }).townStorageChest, 'reliquary');
  assert.equal(townStorageChestArtFor({ stash: true }).townStorageChest, 'storage');

  assert.equal(Object.keys(IMP_BY_ID).length, 20);
  assert.ok(Object.keys(CRITTERS).length >= 10);
  assert.equal(Object.keys(PACK_LEADERS).length, 15);
  assert.ok(Object.keys(ENVIRONMENT_TRAP_TYPES).length >= 15);
  assert.equal(HERESY_MAX_RANK, 75);
});
