const { openGame } = require('./harness');

async function run() {
  const { browser, page, errors } = await openGame();

  const results = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    await game.newChar('lancer', 'HotkeyTester');

    const { UI } = await import('/src/ui/ui.js');
    const { input } = await import('/src/core/input.js');

    const isOpenBefore = UI.isOpen('character');

    // Simulate pressing KeyC without shift
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', bubbles: true }));
    game.update(0.016);

    const isOpenAfterC = UI.isOpen('character');

    // Press KeyC again to toggle close
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', bubbles: true }));
    game.update(0.016);

    const isOpenAfterC2 = UI.isOpen('character');

    // Test KeyR for rejuv potion
    G.char.potions.rejuv = 5;
    G.player.hp = 50;
    G.player.maxHp = 1000;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', bubbles: true }));
    // In update, controls.update handles potions
    const { controls } = await import('/src/game/controls.js');
    controls.update(0.016);
    const rejuvUsed = G.char.potions.rejuv < 5;

    return {
      isOpenBefore,
      isOpenAfterC,
      isOpenAfterC2,
      rejuvUsed
    };
  });

  console.log('Hotkey C & R Test Results:', results);
  const success = !results.isOpenBefore && results.isOpenAfterC && !results.isOpenAfterC2 && results.rejuvUsed;
  if (!success) {
    console.error('TEST FAILED!', results);
    process.exitCode = 1;
  } else {
    console.log('HOTKEY C & R TEST PASSED! C TOGGLES CHARACTER SHEET DIRECTLY AND R DRINKS REJUV.');
  }

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

