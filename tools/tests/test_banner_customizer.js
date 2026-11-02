const { openGame, report } = require('./harness');
const path = require('path');
const fs = require('fs');

(async () => {
  const { browser, page, errors } = await openGame({ width: 1280, height: 720 });
  const artifactDir = '/home/dagyr/.gemini/antigravity/brain/12f4836d-bde5-47f7-883a-b8c5863f737c';

  const res = await page.evaluate(async () => {
    const { G, game } = window.DAGYR;
    await game.newChar('lancer', 'Galahad');
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));

    const { openBannerCustomizer } = await import('/src/ui/bannercustomizer.js');

    // Open customizer
    openBannerCustomizer();
    await wait(400);

    const modal = document.querySelector('.banner-customizer-dialog');
    if (!modal) return { ok: false, error: 'Modal not found' };

    // Find emblem buttons
    const emblemButtons = modal.querySelectorAll('.emblem-group .banner-sel-btn');
    const foundEmblems = Array.from(emblemButtons).map(b => b.textContent.trim());

    // Click deathguard
    const deathguardBtn = Array.from(emblemButtons).find(b => b.textContent.includes('Abyssal Skull'));
    if (deathguardBtn) deathguardBtn.click();
    await wait(300);

    return {
      ok: true,
      foundEmblems,
      emblemCount: emblemButtons.length
    };
  });

  console.log('Customizer evaluation result (open):', res);

  // Take screenshot while modal is open with Abyssal Skull previewed
  const shotPath = path.join(artifactDir, 'banner_customizer_gothic.png');
  await page.screenshot({ path: shotPath });
  console.log('Saved customizer screenshot to:', shotPath);

  // Now click Apply Design
  const applyRes = await page.evaluate(async () => {
    const { G } = window.DAGYR;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const modal = document.querySelector('.banner-customizer-dialog');
    if (!modal) return { applied: false };
    const applyBtn = Array.from(modal.querySelectorAll('.row button')).find(b => b.textContent.includes('Apply Design'));
    if (applyBtn) applyBtn.click();
    await wait(300);
    return {
      applied: true,
      banner: G.char.banner
    };
  });

  console.log('Apply result:', applyRes);

  console.log('Errors:', errors);
  report(errors);

  await browser.close();
})();
