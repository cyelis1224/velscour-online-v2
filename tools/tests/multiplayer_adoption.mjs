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

import { fixEndgame } from '../../src/game/endgame.js';

test('Legacy v0 Velscour Online Infernal Marks are preserved and migrated without ever resetting to 0', () => {
  const migrated = fixEndgame({
    unlocked: 1700000000000,
    marks: { pts: 1755, xp: 1234, spent: { life: 439, crit: 439, mf: 439, rift: 438 } },
  });
  assert.equal(migrated.marks.pts, 1755, 'Legacy v0 pts must never be zeroed');
  assert.equal(migrated.marks.spent.vitality, 439);
  assert.equal(migrated.marks.spent.crit, 439);
  assert.equal(migrated.marks.spent.haste, 438);
  assert.equal(migrated.marks.spentValue, 439 + 439 + 438);
  assert.equal(migrated.marks.pts - migrated.marks.spentValue, 439, 'Removed Fortune (mf) ranks are refunded as free Marks');
});


test('Phase 2A: Non-destructive 500->100 live save migration, skill refund, class weapon migration, 55/15/30 Smart Loot & Account Heirlooms', async () => {
  const { FINAL_DEPTH, ENDGAME_START_DEPTH, depthLevel, endgameScaling, endgameBaseLevel } = await import('../../src/data/depth.js');
  assert.equal(FINAL_DEPTH, 100);
  assert.equal(ENDGAME_START_DEPTH, 101);
  assert.equal(endgameBaseLevel(depthLevel(200), 200), 100, 'endgameBaseLevel anchors base monster stats at level 100');
  assert.equal(endgameBaseLevel(depthLevel(200) + 2, 200), 102, 'endgameBaseLevel preserves boss +2 rank offset');
  assert.ok(endgameScaling(125).health > 1.15 && endgameScaling(125).health < 1.19, '+17% HP per 25 depths');

  // 1. Non-destructive online migration preserves level, marks, gold, gear and remaps depths 500->100
  const { migrate, mapLegacyDepth } = await import('../../src/game/save.js');
  assert.equal(mapLegacyDepth(500), 100);
  assert.equal(mapLegacyDepth(250), 50);
  assert.equal(mapLegacyDepth(1), 1);

  const legacyHero = {
    id: 'legacy_hero_1',
    name: 'Veteran',
    classId: 'rogue',
    level: 88,
    xp: 45000,
    gold: 999999,
    depth: 500,
    deepest: 500,
    cleared: { 50: true, 250: true, 500: true },
    attrs: { str: 20, dex: 120, int: 20, vit: 80 },
    skillPoints: 5,
    skills: { 'rogue.0.0': 10 },
    granted: { 'rogue.0.0': true },
    marks: { pts: 42, xp: 100, spent: { ferocity: 5 } },
    equip: {
      weapon: { uid: 'w1', type: 'gear', slot: 'weapon', base: 'hammer', ilvl: 80, rarity: 4, affixes: [], gems: [] },
      offhand: null,
    },
    bag: Array(60).fill(null),
    stash: Array(60).fill(null),
    gemBag: Array(30).fill(null),
    jewelBox: Array(30).fill(null),
  };
  migrate(legacyHero);
  assert.equal(legacyHero.campaignOverhaulV2, true);
  assert.equal(legacyHero.level, 88, 'Hero level is never reduced');
  assert.equal(legacyHero.gold, 999999, 'Gold is preserved');
  assert.equal(legacyHero.marks.pts, 42, 'Infernal Marks are preserved');
  assert.equal(legacyHero.depth, 100, 'Depth 500 remaps to 100');
  assert.equal(legacyHero.deepest, 100, 'Deepest 500 remaps to 100');
  assert.equal(legacyHero.cleared[100], true, 'Velscour defeat preserved on Depth 100');
  assert.equal(legacyHero.velscourDefeated, true, 'Endgame victory flag set');
  assert.equal(legacyHero.visitedAct2Town, true);
  assert.equal(legacyHero.visitedAct4Town, true);
  assert.equal(legacyHero.skillRespecV1, true);
  assert.equal(legacyHero.skillPoints, 88, 'One-time free skill point refund matches hero level');
  assert.equal(legacyHero.equip.weapon, null, 'Incompatible Rogue hammer unequipped safely');
  assert.equal(legacyHero.bag[0]?.uid, 'w1', 'Displaced weapon moved safely into bag without deletion');

  // 2. Lighter multiplayer Smart Loot weighting (~55% primary / ~15% secondary / ~30% off-class)
  const { smartLootWeaponBase, WEAPON_PROFICIENCY, WEAPONS, SMART_LOOT_WEIGHTS } = await import('../../src/data/items.js');
  assert.equal(SMART_LOOT_WEIGHTS.offClass, 0.30);
  let seed = 1234567;
  const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const palAllowed = new Set(Object.entries(WEAPONS).filter(([, w]) => w.classes.includes('paladin')).map(([k]) => k));
  let prim = 0, sec = 0, off = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const b = smartLootWeaponBase('paladin', rng);
    if (WEAPON_PROFICIENCY.paladin.primary.includes(b)) prim++;
    else if (WEAPON_PROFICIENCY.paladin.secondary.includes(b)) sec++;
    else if (!palAllowed.has(b)) off++;
  }
  const offRate = off / N, primRate = prim / N, secRate = sec / N;
  assert.ok(offRate > 0.25 && offRate < 0.35, `Expected ~30% off-class weapons for trading, got ${(offRate * 100).toFixed(1)}%`);
  assert.ok(primRate > 0.50 && primRate < 0.60, `Expected ~55% primary weapons, got ${(primRate * 100).toFixed(1)}%`);
  assert.ok(secRate > 0.11 && secRate < 0.19, `Expected ~15% secondary weapons, got ${(secRate * 100).toFixed(1)}%`);

  // 3. Account Heirlooms & Level-Scaled Covenants
  const { makeHeirloom, makeCovenant, PIECE_BY_ID } = await import('../../src/data/relics.js');
  const heir = makeHeirloom(80, { id: 'verdict' });
  assert.equal(heir.rarity, 0, 'Account Heirloom copy is Tier 1');
  assert.equal(heir.req, 1, 'Account Heirloom copy requires level 1');
  const firstPiece = Object.keys(PIECE_BY_ID)[0];
  const covLow = makeCovenant(20, { depth: 20, pieceId: firstPiece });
  assert.ok(covLow && covLow.relic === 'cov' && covLow.rarity <= 1, 'Level-scaled Covenant respects drop depth quality');
});

test('Phase 2B: Ticker, Keyboard Rebinding (touch intact), Stat Breakdown, Portrait, Enemy History, Potion Buy Max, Gore & Perf Quality', async () => {
  const { tickerKind, TICKER_KINDS } = await import('../../src/ui/ticker.js');
  assert.equal(tickerKind('WARNING: Incoming beam!'), 'warn');
  assert.equal(tickerKind('Quest complete: Depth 5 cleared'), 'quest');
  assert.equal(tickerKind('Picked up 120 gold'), 'loot');
  assert.ok(TICKER_KINDS.length >= 5);

  const { input, KEY_BINDING_ACTIONS, getKeyBinding, setKeyBinding, resetKeyBindings, keyBindingLabel } = await import('../../src/core/input.js');
  assert.ok(KEY_BINDING_ACTIONS.length >= 20);
  assert.ok(input.joy && input.activeTouches instanceof Map, 'Touch joystick & pinch state preserved in input.js');
  assert.equal(getKeyBinding('inventory'), 'KeyI');
  setKeyBinding('inventory', 'KeyO');
  assert.equal(getKeyBinding('inventory'), 'KeyO');
  input.pressed.add('KeyO');
  assert.equal(input.consume('KeyI'), true, 'Rebound inventory key resolves via KeyI alias');
  assert.equal(keyBindingLabel('KeyO'), 'O');
  resetKeyBindings();
  assert.equal(getKeyBinding('inventory'), 'KeyI');

  const { potionPurchaseQuote, POTION_BELT_CAPACITY } = await import('../../src/game/potionpurchase.js');
  assert.equal(POTION_BELT_CAPACITY, 30);
  const q = potionPurchaseQuote(10, 5000, 100, 'max');
  assert.equal(q.quantity, 20);
  assert.equal(q.total, 2000);
  assert.equal(q.canBuy, true);

  const { appendEnemyHistory, ENEMY_HISTORY_LIMIT } = await import('../../src/ui/enemyhistory.js');
  const hist = [];
  for (let i = 0; i < ENEMY_HISTORY_LIMIT + 5; i++) appendEnemyHistory(hist, { key: `k${i}`, name: `Mob ${i}` });
  assert.equal(hist.length, ENEMY_HISTORY_LIMIT, 'Enemy history caps at 100 records');

  const { createCombatSoundGate } = await import('../../src/game/combat-sound-gate.mjs');
  const gate = createCombatSoundGate(0.05);
  const actor = {};
  assert.equal(gate(actor, 'hit', 1.0), true);
  assert.equal(gate(actor, 'hit', 1.01), false, 'Duplicate hit sound within window is coalesced');
  assert.equal(gate(actor, 'hit', 1.06), true, 'Sound plays again after cooldown window');

  const { goreLimit, GORE_PRESETS } = await import('../../src/gfx/goresettings.mjs');
  assert.equal(GORE_PRESETS.length, 10);
  assert.equal(goreLimit({ gore: 0 }), 0);
  assert.equal(goreLimit({ gore: 3 }), 150);
  assert.equal(goreLimit({ gore: 3, goreCustomEnabled: true, goreCustomLimit: 500 }), 500);

  const { performanceTier, particleBudget, allowParticleType } = await import('../../src/core/performancequality.mjs');
  assert.equal(performanceTier({ graphicsPreset: 'extreme' }), 2);
  assert.equal(particleBudget(false, 2), 700);
  assert.equal(allowParticleType('smoke', 1), false);
  assert.equal(allowParticleType('blood', 2), true);

  const { buildEquipmentStatReport } = await import('../../src/game/statbreakdown.mjs');
  assert.equal(typeof buildEquipmentStatReport, 'function');
  const { portraitResource } = await import('../../src/ui/characterportrait.js');
  assert.equal(portraitResource({ classId: 'barbarian' }, { rage: 45 }).current, 45);
  const { writeBoltGeometry } = await import('../../src/gfx/lightninggeometry.mjs');
  const seg = new Float32Array(18);
  assert.ok(writeBoltGeometry(seg, 0, 0, 100, 100) >= 2);
});

test('Phase 3: 510 Sea of Sand monsters/humanoids, 60 Castle Creatures & 10 Castle Raids, Mimic still chestOnly', async () => {
  const { SAND_KIN, sandCreatures, sandBosses, sandMythics, isDesert } = await import('../../src/data/sandkin.js');
  assert.equal(SAND_KIN.length, 510, `Expected 510 Sea of Sand bestiary entries, got ${SAND_KIN.length}`);
  assert.ok(sandCreatures().length > 350);
  assert.ok(sandBosses().length >= 70);
  assert.equal(sandCreatures().length + sandBosses().length + sandMythics().length, SAND_KIN.length);
  assert.equal(isDesert({ id: 'sea_of_sand' }), true);

  const { SAND_KITS } = await import('../../src/game/sandkits.js');
  assert.ok(Object.keys(SAND_KITS).length >= 500, 'Every Sea of Sand entry has a combat kit');

  const { CASTLE_KIN } = await import('../../src/data/castlekin.js');
  assert.equal(CASTLE_KIN.length, 60, '60 Castle Creatures & Bosses loaded');
  const { CASTLE_RAIDS } = await import('../../src/game/castleraids.js');
  assert.equal(CASTLE_RAIDS.length, 10, '10 Castle Raid Bosses loaded');

  const { RAID_BOSSES } = await import('../../src/game/raid.js');
  assert.ok(RAID_BOSSES.some((b) => CASTLE_RAIDS.some((c) => c.id === b.id)), 'Castle raids pushed into RAID_BOSSES');

  const { ART_BY_ID, artPool, MIMIC_ART } = await import('../../src/data/bestiary.js');
  assert.ok(ART_BY_ID[SAND_KIN[0].id], 'Sand bestiary registered in ART_BY_ID');
  assert.ok(ART_BY_ID[CASTLE_KIN[0].id], 'Castle bestiary registered in ART_BY_ID');
  assert.equal(MIMIC_ART.chestOnly, true);
  assert.ok(!artPool('abomination').some((a) => a.chestOnly), 'Mimics stay excluded from normal monster pools');

  const fs = await import('node:fs');
  const sheets = JSON.parse(fs.readFileSync('assets/sprites/enemies/enemies.json', 'utf8'));
  assert.ok(sheets['special/mimic'], 'special/mimic preserved in enemies.json');
  assert.ok(sheets['castle/bosses'] && sheets['castle/creatures_1'], 'Castle atlases in enemies.json');
  assert.ok(sheets['sand/01_dune_hollows'] && sheets['sand2/01_linen_court'], 'Sea of Sand atlases in enemies.json');
});
