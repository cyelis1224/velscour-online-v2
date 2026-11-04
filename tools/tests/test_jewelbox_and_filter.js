const { openGame } = require('./harness');

async function run() {
  const { browser, page, errors } = await openGame({ width: 1280, height: 800 });

  const results = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    await game.newChar('lancer', 'JewelLord');

    const { Auto } = await import('/src/game/autoplay.js');
    const { JewelBox, addToJewelBox, sortJewelBox } = await import('/src/ui/jewelbox.js');
    const { Stash } = await import('/src/ui/stash.js');
    const { makeGem, rollItem } = await import('/src/data/items.js');
    const { addToBag } = await import('/src/game/player.js');
    const { lootFilter, filterPasses } = await import('/src/game/lootfilter.js');

    const c = G.char;
    c.jewelBox = Array(300).fill(null);
    c.stash = Array(300).fill(null);
    c.gemBag = Array(30).fill(null);
    c.bag = Array(60).fill(null);

    const testRes = {};

    // 1. Test JewelBox storage & restriction
    const chippedRuby = makeGem('ruby', 0); // tier 0 Chipped
    const flawedRuby = makeGem('ruby', 1);  // tier 1 Flawed
    const flawlessRuby = makeGem('ruby', 3); // tier 3 Flawless
    const sword = rollItem(20, { slot: 'weapon', base: 'spear', rarity: 2 });
    const sigilAsh = makeGem('sig', 1);

    // Storing a sword into JewelBox should fail
    c.bag[0] = sword;
    const swordStoreResult = JewelBox.store(0, 'bag');
    testRes.swordRejectedByJewelBox = swordStoreResult === false && c.bag[0] === sword;

    // Storing gems into JewelBox
    c.gemBag[0] = chippedRuby;
    c.gemBag[1] = sigilAsh;
    const rubyStoreResult = JewelBox.store(0, 'gemBag');
    const sigilStoreResult = JewelBox.store(1, 'gemBag');
    testRes.rubyStoredInJewelBox = rubyStoreResult === true && c.jewelBox.includes(chippedRuby);
    testRes.sigilStoredInJewelBox = sigilStoreResult === true && c.jewelBox.includes(sigilAsh);

    // Stacking in JewelBox
    const ruby2 = makeGem('ruby', 0);
    ruby2.count = 5;
    c.gemBag[0] = ruby2;
    JewelBox.store(0, 'gemBag');
    const stackedRuby = c.jewelBox.find(b => b && b.gem === 'ruby' && b.tier === 0);
    testRes.jewelBoxStacked = stackedRuby && stackedRuby.count === 6;

    // Taking from JewelBox -> goes to c.gemBag
    const idxInJewelBox = c.jewelBox.indexOf(stackedRuby);
    JewelBox.take(idxInJewelBox);
    testRes.takenGemInGemBag = c.gemBag.some(b => b && b.gem === 'ruby' && b.tier === 0);
    testRes.takenGemRemovedFromJewelBox = c.jewelBox[idxInJewelBox] === null;

    // 2. Test Autoplay visiting both boxes
    // Put gems in gemBag and gear in bag
    c.gemBag[0] = flawlessRuby;
    c.bag[0] = sword;
    sword.autoStash = true;

    const townSteps = Auto.townPlan();
    const jewelBoxStep = townSteps.find(s => s.jewelBox && s.label.includes('jewel box'));
    const stashStep = townSteps.find(s => s.stash && s.label.includes('storage chest'));

    testRes.townPlanHasJewelBoxStep = !!jewelBoxStep;
    testRes.townPlanHasStashStep = !!stashStep;
    testRes.jewelBoxStepWanted = jewelBoxStep ? Auto.wants(jewelBoxStep.want) : false;
    testRes.stashStepWanted = stashStep ? Auto.wants(stashStep.want) : false;

    // Run stashJewels()
    Auto.stashJewels();
    testRes.stashJewelsEmptiedGemBag = c.gemBag[0] === null;
    testRes.stashJewelsPutInJewelBox = c.jewelBox.some(b => b && b.gem === 'ruby' && b.tier === 3);

    // Run stashExtras()
    Auto.stashExtras();
    testRes.stashExtrasPutGearInStash = c.stash.some(b => b && b.slot === 'weapon');

    // 3. Test Town NPC placement
    const worldNpcs = G.world?.npcs || [];
    const jewelNpc = worldNpcs.find(n => n.jewelBox);
    const stashNpc = worldNpcs.find(n => n.stash && !n.reliquary && !n.jewelBox);
    const relNpc = worldNpcs.find(n => n.reliquary);
    testRes.townHasJewelBoxNpc = !!jewelNpc;
    testRes.townHasStashNpc = !!stashNpc;
    testRes.townHasReliquaryNpc = !!relNpc;

    // 4. Test Loot Filter Gem Grade selection
    const f = lootFilter();
    f.on = true;
    f.gems = 3; // Flawless (tier 3) or higher

    testRes.filterRejectsChipped = filterPasses(chippedRuby) === false; // tier 0
    testRes.filterRejectsFlawed = filterPasses(flawedRuby) === false;   // tier 1
    testRes.filterAcceptsFlawless = filterPasses(flawlessRuby) === true; // tier 3
    testRes.filterAcceptsSigil = filterPasses(sigilAsh) === true;       // runes pass

    f.gems = -1; // None
    testRes.filterNoneRejectsAll = filterPasses(flawlessRuby) === false && filterPasses(sigilAsh) === false;

    return testRes;
  });

  console.log('JewelBox and Filter Test Results:', results);

  let failed = 0;
  for (const [k, v] of Object.entries(results)) {
    if (!v) {
      console.error(`FAILED Assertion: ${k}`);
      failed++;
    }
  }

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log('ALL JEWEL BOX & LOOT FILTER TESTS PASSED!');
  }

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

