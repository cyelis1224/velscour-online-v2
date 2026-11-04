const { openGame } = require('./harness');
const path = require('path');
const fs = require('fs');

async function run() {
  const { browser, page, shot } = await openGame({ width: 1280, height: 800 });
  const artifactDir = '/home/dagyr/.gemini/antigravity/brain/12f4836d-bde5-47f7-883a-b8c5863f737c';

  await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    await game.newChar('lancer', 'JewelLord');

    const { JewelBox } = await import('/src/ui/jewelbox.js');
    const { makeGem } = await import('/src/data/items.js');

    const c = G.char;
    c.jewelBox = Array(300).fill(null);

    // Populate jewel box with various gems & sigils
    const gemsToStore = [
      makeGem('ruby', 4), makeGem('ruby', 2), makeGem('emerald', 3),
      makeGem('sapphire', 5), makeGem('topaz', 1), makeGem('amethyst', 4),
      makeGem('prism', 2), makeGem('sig', 5), makeGem('sig', 1),
      makeGem('sig', 12), makeGem('ruby', 0)
    ];

    gemsToStore.forEach((g, idx) => {
      g.count = (idx % 4) + 1;
      c.jewelBox[idx] = g;
    });

    JewelBox.open();
  });

  await new Promise(r => setTimeout(r, 200));

  const jewelBoxShotPath = path.join(artifactDir, 'jewelbox_inventory_screen.png');
  await page.screenshot({ path: jewelBoxShotPath });
  console.log('Saved Jewel Box screenshot to:', jewelBoxShotPath);

  // Now open Settings -> Loot Filter Dialog
  await page.evaluate(async () => {
    const { lootFilterDialog } = await import('/src/ui/screens.js');
    const { UI } = await import('/src/ui/ui.js');
    UI.closeAll();
    lootFilterDialog();
  });

  await new Promise(r => setTimeout(r, 200));

  const lootFilterShotPath = path.join(artifactDir, 'loot_filter_gem_grade.png');
  await page.screenshot({ path: lootFilterShotPath });
  console.log('Saved Loot Filter screenshot to:', lootFilterShotPath);

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

