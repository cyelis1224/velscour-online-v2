const { openGame, report } = require('./harness');
const path = require('path');

(async () => {
  const { browser, page, errors } = await openGame({ width: 1280, height: 720 });
  const artifactDir = '/home/dagyr/.gemini/antigravity/brain/12f4836d-bde5-47f7-883a-b8c5863f737c';

  const res = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    await game.newChar('lancer', 'Tester');
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));

    const { toggleInventory, toggleCharacter } = await import('/src/ui/inventory.js');

    toggleCharacter();
    toggleInventory();
    await wait(300);

    const invPanel = document.querySelector('.panel[data-panel="inventory"]');
    const charPanel = document.querySelector('.panel[data-panel="character"]');
    const firstSlot = document.querySelector('.bag .bslot');

    return {
      invWidth: invPanel?.getBoundingClientRect().width,
      charWidth: charPanel?.getBoundingClientRect().width,
      slotSize: firstSlot?.getBoundingClientRect().width
    };
  });

  console.log('Panels open side by side:', res);

  const shotPath = path.join(artifactDir, 'desktop_char_and_bag_side_by_side.png');
  await page.screenshot({ path: shotPath });
  console.log('Saved screenshot to:', shotPath);

  await browser.close();
})();
