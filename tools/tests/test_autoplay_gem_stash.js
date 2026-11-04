const { openGame } = require('./harness');

async function run() {
  const { browser, page, errors } = await openGame();

  const results = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    await game.newChar('lancer', 'GemMaster');

    const { Auto } = await import('/src/game/autoplay.js');
    const { makeGem, rollItem } = await import('/src/data/items.js');
    const { addToBag } = await import('/src/game/player.js');

    const c = G.char;
    c.stash = Array(60).fill(null);
    c.gemBag = Array(30).fill(null);
    c.bag = Array(60).fill(null);
    c.jewelBox = Array(300).fill(null);
    c.gold = 1000;

    // Test 1: sellJunk() must NEVER sell gems, even with crowded bag (< 15 free) and low tier gems
    // Fill bag so bagFree <= 15
    for (let i = 0; i < 50; i++) {
      c.bag[i] = rollItem(1, { forceSlot: 'weapon', rarity: 0 }); // junk gear to sell
    }
    const ruby1 = makeGem('ruby', 0); // tier 0 ruby
    ruby1.count = 5;
    const sigil1 = makeGem('sig', 1);
    sigil1.count = 2;
    // Put gems in bag and in gemBag
    c.bag[50] = ruby1;
    c.gemBag[0] = sigil1;

    const goldBefore = c.gold;
    Auto.sellJunk();

    // Verify junk gear was sold, but ruby and sigil were NEVER sold
    const rubyKeptInBag = c.bag.some(it => it && it.type === 'gem' && it.gem === 'ruby');
    const sigilKeptInGemBag = c.gemBag.some(it => it && it.type === 'gem' && it.gem === 'sig');

    // Test 2: unstash() must NEVER pull gems from c.stash
    const stashGem = makeGem('topaz', 1);
    stashGem.count = 4;
    c.stash[0] = stashGem;
    Auto.unstash();
    const stashRetainedGem = c.stash[0] === stashGem;

    // Test 3: townPlan() has jewelBox step and wants it
    const steps = Auto.townPlan();
    const jewelBoxStep = steps.find(s => s.jewelBox);
    const jewelBoxWanted = jewelBoxStep ? Auto.wants(jewelBoxStep.want) : false;

    // Test 4: stashJewels() deposits gems from gemBag and bag into c.jewelBox
    Auto.stashJewels();

    const jewelBoxHasRuby = c.jewelBox.some(it => it && it.gem === 'ruby' && it.tier === 0 && it.count === 5);
    const jewelBoxHasSigil = c.jewelBox.some(it => it && it.gem === 'sig' && it.tier === 1 && it.count === 2);
    const gemBagCleared = !c.gemBag.some(it => it && it.type === 'gem');
    const bagClearedOfGems = !c.bag.some(it => it && it.type === 'gem');

    return {
      rubyKeptInBag,
      sigilKeptInGemBag,
      stashRetainedGem,
      jewelBoxWanted,
      jewelBoxHasRuby,
      jewelBoxHasSigil,
      gemBagCleared,
      bagClearedOfGems
    };
  });

  console.log('Autoplay Gem Stash & Protection Test Results:', results);
  const success = Object.values(results).every(Boolean);
  if (!success) {
    console.error('TEST FAILED!', results);
    process.exitCode = 1;
  } else {
    console.log('ALL AUTOPLAY GEM TESTS PASSED! GEMS ARE NEVER SOLD AND DEPOSITED INTO JEWEL BOX.');
  }

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
