// Test Infernal Marks storage expansions for Bag, Gem Bag, Stash, Jewel Box, Reliquary,
// and verify upstream PR 236 (rooted, auto-cast summons) & PR 237 (Pirate Seas).
const { openGame, report } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame();
  const fail = [];
  const ev = (f, a) => page.evaluate(f, a);

  // 1. Initialize character and grant Infernal Marks
  await ev(async () => {
    const { G, game } = window.DAGYR;
    await game.newChar('barbarian', 'MarkTester');
    const { endgame, saveEndgame } = await import('/src/game/endgame.js');
    const em = endgame();
    em.marks.pts = 35; // 35 free marks
    em.marks.spent = { life: 0, crit: 0, mf: 0, rift: 0 };
    saveEndgame();
  });

  const res = await ev(async () => {
    const { G } = window.DAGYR;
    const {
      bagRows, nextBagRowCost, canBuyBagRow, buyBagRow, fixBag,
      gemBagRows, nextGemBagRowCost, canBuyGemBagRow, buyGemBagRow, fixGemBag,
      stashRows, nextStashRowCost, canBuyStashRow, buyStashRow, fixStash,
      jewelBoxRows, nextJewelBoxRowCost, canBuyJewelBoxRow, buyJewelBoxRow, fixJewelBox,
      reliquaryTabRows, nextReliquaryRowCost, canBuyReliquaryRow, buyReliquaryRow,
    } = await import('/src/data/bag.js');
    const { marksFree, grantMarks } = await import('/src/game/marks.js');
    const { reliquary } = await import('/src/game/reliquary.js');
    const c = G.char;

    const out = {};
    out.startMarks = marksFree(); // 35

    // Check Bag (costs 10 marks)
    out.bagStartRows = bagRows(c); // 6
    out.bagCost = nextBagRowCost(c); // 10
    out.canBuyBag = canBuyBagRow(c); // true
    const bagBought = buyBagRow(c);
    out.bagBought = bagBought;
    out.bagAfterRows = bagRows(c); // 7
    out.bagAfterSlots = c.bag.length; // 70
    out.marksAfterBag = marksFree(); // 25

    // Check Gem Bag (costs 5 marks)
    out.gemBagStartRows = gemBagRows(c); // 3
    out.gemBagCost = nextGemBagRowCost(c); // 5
    out.canBuyGemBag = canBuyGemBagRow(c); // true
    const gemBagBought = buyGemBagRow(c);
    out.gemBagBought = gemBagBought;
    out.gemBagAfterRows = gemBagRows(c); // 4
    out.gemBagAfterSlots = c.gemBag.length; // 40
    out.marksAfterGemBag = marksFree(); // 20

    // Check Stash (costs 10 marks)
    out.stashStartRows = stashRows(c); // 30
    out.stashCost = nextStashRowCost(c); // 10
    const stashBought = buyStashRow(c);
    out.stashBought = stashBought;
    out.stashAfterRows = stashRows(c); // 31
    out.stashAfterSlots = c.stash.length; // 310
    out.marksAfterStash = marksFree(); // 10

    // Check Jewel Box (costs 5 marks)
    out.jewelBoxStartRows = jewelBoxRows(c); // 30
    out.jewelBoxCost = nextJewelBoxRowCost(c); // 5
    const jewelBoxBought = buyJewelBoxRow(c);
    out.jewelBoxBought = jewelBoxBought;
    out.jewelBoxAfterRows = jewelBoxRows(c); // 31
    out.jewelBoxAfterSlots = c.jewelBox.length; // 310
    out.marksAfterJewelBox = marksFree(); // 5

    // Try buying Reliquary row (costs 10 marks, but only 5 left -> should fail)
    out.reliquaryStartRows = reliquaryTabRows(0); // 8
    out.canBuyReliquaryPoor = canBuyReliquaryRow(0); // false
    const reliquaryPoorBought = buyReliquaryRow(0);
    out.reliquaryPoorBought = reliquaryPoorBought; // false
    out.marksStill5 = marksFree(); // 5

    // Grant 10 marks -> 15 free marks -> buy Reliquary row
    grantMarks(10);
    out.canBuyReliquaryRich = canBuyReliquaryRow(0); // true
    const reliquaryRichBought = buyReliquaryRow(0);
    out.reliquaryRichBought = reliquaryRichBought; // true
    out.reliquaryAfterRows = reliquaryTabRows(0); // 9
    out.reliquaryAfterSlots = reliquary().tabs[0].length; // 108 (96 + 12)
    out.finalMarks = marksFree(); // 5

    // Test fix/migrate persistence
    const { rollItem } = await import('/src/data/items.js');
    c.bag[69] = rollItem(10, { slot: 'ring' });
    fixBag(c);
    fixGemBag(c);
    fixStash(c);
    fixJewelBox(c);
    out.fixedBagSlots = c.bag.length; // 70
    out.fixedGemBagSlots = c.gemBag.length; // 40
    out.fixedStashSlots = c.stash.length; // 310
    out.fixedJewelBoxSlots = c.jewelBox.length; // 310

    // Test PR 236: rooted & autoSummon
    out.playerRootedDefined = typeof G.player?.rooted === 'boolean';
    out.autoSummonDefined = typeof G.player?.autoSummon === 'function';

    // Test PR 237: Pirate Seas biome & SeaBattle defined
    const { BIOME_BY_ID } = await import('/src/data/biomes.js');
    out.hasPirateSeasBiome = !!BIOME_BY_ID.pirate_seas;
    const { SEA_VARIANTS } = await import('/src/data/seabattle.js');
    out.seaVariantsCount = SEA_VARIANTS.length;

    return out;
  });

  console.log('Test results:', JSON.stringify(res, null, 2));

  if (res.startMarks !== 35) fail.push(`Expected 35 start marks, got ${res.startMarks}`);
  if (!res.bagBought || res.bagAfterSlots !== 70 || res.marksAfterBag !== 25) fail.push('Bag buy failed');
  if (!res.gemBagBought || res.gemBagAfterSlots !== 40 || res.marksAfterGemBag !== 20) fail.push('Gem bag buy failed');
  if (!res.stashBought || res.stashAfterSlots !== 310 || res.marksAfterStash !== 10) fail.push('Stash buy failed');
  if (!res.jewelBoxBought || res.jewelBoxAfterSlots !== 310 || res.marksAfterJewelBox !== 5) fail.push('Jewel box buy failed');
  if (res.reliquaryPoorBought !== false || res.marksStill5 !== 5) fail.push('Reliquary should not buy when poor');
  if (!res.reliquaryRichBought || res.reliquaryAfterSlots !== 108 || res.finalMarks !== 5) fail.push('Reliquary buy failed');
  if (res.fixedBagSlots !== 70 || res.fixedGemBagSlots !== 40 || res.fixedStashSlots !== 310) fail.push('Fix/migrate preserved failed');
  if (!res.playerRootedDefined) fail.push('PR 236 player.rooted not defined');
  if (!res.autoSummonDefined) fail.push('PR 236 player.autoSummon not defined');
  if (!res.hasPirateSeasBiome || res.seaVariantsCount !== 12) fail.push('PR 237 Pirate Seas not loaded correctly');

  // Test UI buttons in inventory
  await ev(async () => {
    const { toggleInventory } = await import('/src/ui/inventory.js');
    toggleInventory();
  });
  await page.waitForTimeout(300);

  const uiBtns = await ev(() => {
    const bagBtn = document.querySelector('.bag-buy:not(.gem-bag-buy)');
    const gemBagBtn = document.querySelector('.gem-bag-buy');
    return {
      bagBtnText: bagBtn ? bagBtn.textContent : null,
      gemBagBtnText: gemBagBtn ? gemBagBtn.textContent : null,
    };
  });
  console.log('UI Buttons (Inventory):', JSON.stringify(uiBtns, null, 2));

  if (!uiBtns.bagBtnText || !uiBtns.bagBtnText.includes('10 Marks')) fail.push('Bag buy button text wrong');
  if (!uiBtns.gemBagBtnText || !uiBtns.gemBagBtnText.includes('5 Marks')) fail.push('Gem bag buy button text wrong');

  // Test Stash UI button
  await ev(async () => {
    const { Stash } = await import('/src/ui/stash.js');
    Stash.open();
  });
  await page.waitForTimeout(300);
  const stashBtnText = await ev(() => {
    const btn = document.querySelector('.stash-panel .storage-toolbar button:last-child');
    return btn ? btn.textContent : null;
  });
  console.log('Stash button:', stashBtnText);
  if (!stashBtnText || !stashBtnText.includes('10 Marks')) fail.push('Stash buy button text wrong: ' + stashBtnText);

  // Test Jewel Box UI button
  await ev(async () => {
    const { JewelBox } = await import('/src/ui/jewelbox.js');
    JewelBox.open();
  });
  await page.waitForTimeout(300);
  const jewelBoxBtnText = await ev(() => {
    const btn = document.querySelector('.jewelbox-panel .storage-toolbar button:last-child');
    return btn ? btn.textContent : null;
  });
  console.log('Jewel Box button:', jewelBoxBtnText);
  if (!jewelBoxBtnText || !jewelBoxBtnText.includes('5 Marks')) fail.push('Jewel Box buy button text wrong: ' + jewelBoxBtnText);

  // Test Reliquary UI button
  await ev(async () => {
    const { Reliquary } = await import('/src/ui/reliquary.js');
    Reliquary.open();
  });
  await page.waitForTimeout(300);
  const reliquaryBtnText = await ev(() => {
    const btn = document.querySelector('.reliquary-panel .rel-header-row button');
    return btn ? btn.textContent : null;
  });
  console.log('Reliquary button:', reliquaryBtnText);
  if (!reliquaryBtnText || !reliquaryBtnText.includes('10 Marks')) fail.push('Reliquary buy button text wrong: ' + reliquaryBtnText);

  await page.screenshot({ path: '/home/dagyr/.gemini/antigravity/brain/f4476332-5409-4ff4-992e-23982487e8f3/test_storage_marks.png' });

  console.log(fail.length ? 'FAIL:\n' + fail.join('\n') : 'ALL TESTS PASSED!');
  report(errors);
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})();
