const { openGame } = require('./harness');

async function run() {
  const { browser, page, errors } = await openGame({ width: 1280, height: 800 });

  const results = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    await game.newChar('lancer', 'ScrollTester');

    const { Stash } = await import('/src/ui/stash.js');
    const { Reliquary } = await import('/src/ui/reliquary.js');
    const { reliquary } = await import('/src/game/reliquary.js');
    const { rollItem } = await import('/src/data/items.js');

    const c = G.char;
    c.stash = Array(300).fill(null);
    c.bag = Array(60).fill(null);

    // Populate stash with 300 items so it scrolls
    for (let i = 0; i < 300; i++) {
      c.stash[i] = rollItem(20, { slot: 'weapon', base: 'spear', rarity: 1 });
    }

    // 1. Test Stash
    Stash.open();
    await new Promise(r => setTimeout(r, 60));

    let stashGrid = document.querySelector('.stash-panel .stash-grid');
    if (!stashGrid) throw new Error('Stash grid not found');

    // Scroll down to 300px
    stashGrid.scrollTop = 300;
    stashGrid.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 30));

    const initialStashScroll = stashGrid.scrollTop;

    // Take item from slot 60
    Stash.take(60);
    await new Promise(r => setTimeout(r, 60));

    stashGrid = document.querySelector('.stash-panel .stash-grid');
    const stashScrollAfterTake = stashGrid.scrollTop;

    // Store item back from bag[0]
    Stash.store(0, 'bag');
    await new Promise(r => setTimeout(r, 60));

    stashGrid = document.querySelector('.stash-panel .stash-grid');
    const stashScrollAfterStore = stashGrid.scrollTop;

    // 2. Test Reliquary
    const rData = reliquary();
    rData.tabs[0] = Array(96).fill(null);
    for (let i = 0; i < 96; i++) {
      rData.tabs[0][i] = rollItem(20, { slot: 'body', base: 'plate', rarity: 1 });
    }

    Reliquary.open();
    await new Promise(r => setTimeout(r, 60));

    let relGrid = document.querySelector('.reliquary-panel .rel-grid');
    if (!relGrid) throw new Error('Reliquary grid not found');

    // Scroll down to 60px
    relGrid.scrollTop = 60;
    relGrid.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 30));

    const initialRelScroll = relGrid.scrollTop;

    // Take item from slot 50
    Reliquary.take(50);
    await new Promise(r => setTimeout(r, 60));

    relGrid = document.querySelector('.reliquary-panel .rel-grid');
    const relScrollAfterTake = relGrid.scrollTop;

    // Store item back from bag[0]
    Reliquary.store(0, 'bag');
    await new Promise(r => setTimeout(r, 60));

    relGrid = document.querySelector('.reliquary-panel .rel-grid');
    const relScrollAfterStore = relGrid.scrollTop;

    return {
      initialStashScroll,
      stashScrollAfterTake,
      stashScrollAfterStore,
      stashTakeOk: Math.abs(stashScrollAfterTake - initialStashScroll) < 5 && stashScrollAfterTake > 150,
      stashStoreOk: Math.abs(stashScrollAfterStore - initialStashScroll) < 5 && stashScrollAfterStore > 150,
      initialRelScroll,
      relScrollAfterTake,
      relScrollAfterStore,
      relTakeOk: Math.abs(relScrollAfterTake - initialRelScroll) < 5 && relScrollAfterTake > 40,
      relStoreOk: Math.abs(relScrollAfterStore - initialRelScroll) < 5 && relScrollAfterStore > 40,
    };
  });

  console.log('Scroll Test Results:', results);

  const passed = results.stashTakeOk && results.stashStoreOk && results.relTakeOk && results.relStoreOk;
  if (!passed) {
    console.error('TEST FAILED!');
    process.exitCode = 1;
  } else {
    console.log('ALL STASH & RELIQUARY SCROLL TESTS PASSED!');
  }

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
