const { openGame, report } = require('./harness');
const path = require('path');
const fs = require('fs');

(async () => {
  const { browser, page, errors } = await openGame({ width: 1280, height: 800 });
  const artifactDir = '/home/dagyr/.gemini/antigravity/brain/12f4836d-bde5-47f7-883a-b8c5863f737c';

  const testResults = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    await game.newChar('lancer', 'GemMaster');
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));

    const { makeGem, rollItem } = await import('/src/data/items.js');
    const { addToBag } = await import('/src/game/player.js');
    const { migrate } = await import('/src/game/save.js');
    const { toggleInventory, socketGem, sortGemBag, sortBag } = await import('/src/ui/inventory.js');

    const c = G.char;
    const results = {};

    // 1. Initial Gem Bag state
    results.gemBagCreated = Array.isArray(c.gemBag) && c.gemBag.length === 30;
    results.regularBagLength = Array.isArray(c.bag) && c.bag.length === 60;

    // 2. Test addToBag routing:
    // Adding a gem should go to gemBag
    const ruby1 = makeGem('ruby', 2);
    const ruby2 = makeGem('ruby', 2);
    const sigilAsh = makeGem('sig', 1);
    const sword = rollItem(20, { slot: 'weapon', base: 'spear', rarity: 2 });
    sword.sockets = 2;
    sword.gems = [];

    const okRuby = addToBag(c, ruby1);
    const okSigil = addToBag(c, sigilAsh);
    const okSword = addToBag(c, sword);

    results.rubyInGemBag = c.gemBag.includes(ruby1);
    results.rubyNotInBag = !c.bag.includes(ruby1);
    results.sigilInGemBag = c.gemBag.includes(sigilAsh);
    results.swordInBag = c.bag.includes(sword);
    results.swordNotInGemBag = !c.gemBag.includes(sword);

    // Test stacking: adding another ruby of same tier
    addToBag(c, ruby2);
    const foundRuby = c.gemBag.find(b => b && b.gem === 'ruby' && b.tier === 2);
    results.rubyStacked = foundRuby && foundRuby.count === 2;

    // 3. Test migration of old save with gems in regular bag
    const mockOldChar = {
      level: 10,
      equip: {},
      bag: [
        makeGem('sapphire', 1),
        rollItem(10, { slot: 'head' }),
        makeGem('topaz', 3),
        null
      ]
    };
    migrate(mockOldChar);
    results.migrationMovedGems =
      mockOldChar.gemBag.some(g => g && g.gem === 'sapphire') &&
      mockOldChar.gemBag.some(g => g && g.gem === 'topaz') &&
      !mockOldChar.bag.some(b => b && b.type === 'gem') &&
      mockOldChar.bag.some(b => b && b.type === 'gear');

    // 4. Test UI rendering
    toggleInventory();
    await wait(300);

    const invPanel = document.querySelector('.panel[data-panel="inventory"]');
    const bagSlots = document.querySelectorAll('.inv-bag .bag:not(.gem-bag) .bslot');
    const gemSlots = document.querySelectorAll('.inv-bag .gem-bag .gem-slot');
    const gemTitle = document.querySelector('.gem-bag-title');

    results.renderedBagSlots = bagSlots.length === 60;
    results.renderedGemSlots = gemSlots.length === 30;
    results.renderedGemTitle = !!gemTitle && gemTitle.textContent.includes('Gem Bag');

    // 5. Test socketing directly from gemBag
    const swordBagIdx = c.bag.indexOf(sword);
    const rubyGemIdx = c.gemBag.indexOf(foundRuby);
    const socketed = socketGem(rubyGemIdx, { where: 'bag', idx: swordBagIdx }, 'gemBag');
    results.socketFromGemBagOk = socketed && sword.gems.length === 1 && sword.gems[0].gem === 'ruby';

    // 6. Test Gem Bag sorting
    addToBag(c, makeGem('emerald', 0));
    addToBag(c, makeGem('sig', 5));
    addToBag(c, makeGem('prism', 1));
    sortGemBag();
    // Sigils should come first (tier 5 then tier 1), then special gem prism, then regular gems
    results.sortGemBagWorks =
      c.gemBag[0] && c.gemBag[0].gem === 'sig' && c.gemBag[0].tier === 5 &&
      c.gemBag[1] && c.gemBag[1].gem === 'sig' && c.gemBag[1].tier === 1 &&
      c.gemBag[2] && c.gemBag[2].gem === 'prism' &&
      c.gemBag[3] && c.gemBag[3].gem === 'ruby' &&
      c.gemBag[4] && c.gemBag[4].gem === 'emerald';

    return results;
  });

  console.log('Gem Bag Test Results:', testResults);

  // Take screenshot of desktop inventory with the new Gem Bag section
  const shotPath = path.join(artifactDir, 'desktop_gem_bag_inventory.png');
  await page.screenshot({ path: shotPath });
  console.log('Saved desktop inventory with Gem Bag screenshot to:', shotPath);

  // Take mobile screenshot as well
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    document.body.classList.add('touch');
    const { UI } = window.VELSCOUR;
    UI.refresh();
  });
  await page.waitForTimeout(300);
  const mobileShotPath = path.join(artifactDir, 'mobile_gem_bag_inventory.png');
  await page.screenshot({ path: mobileShotPath });
  console.log('Saved mobile inventory with Gem Bag screenshot to:', mobileShotPath);

  const checks = Object.entries(testResults).map(([k, v]) => [k, v === true]);
  report(errors);

  await browser.close();
})();
