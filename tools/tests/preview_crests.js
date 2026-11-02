const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

  // Navigate to server
  await page.goto('http://127.0.0.1:8124/index.html');
  await page.waitForLoadState('domcontentloaded');

  const artifactDir = '/home/dagyr/.gemini/antigravity/brain/12f4836d-bde5-47f7-883a-b8c5863f737c';

  const emblems = ['vanguard', 'templar', 'deathguard', 'citadel', 'warlances', 'sunburst', 'wyvern', 'crown'];

  // Evaluate in page to render all 8 banners on an HTML canvas
  const dataUrl = await page.evaluate(async (emblems) => {
    const { createBannerCanvas, BANNER_EMBLEMS } = await import('./src/gfx/bannergen.js');

    const total = emblems.length;
    const cardW = 120;
    const cardH = 240;
    const padding = 20;
    const cols = 4;
    const rows = Math.ceil(total / cols);

    const canvas = document.createElement('canvas');
    canvas.width = cols * cardW + (cols + 1) * padding;
    canvas.height = rows * cardH + (rows + 1) * padding;
    const ctx = canvas.getContext('2d');

    // Dark gothic background
    ctx.fillStyle = '#0e0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < total; i++) {
      const emblemId = emblems[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padding + col * (cardW + padding);
      const y = padding + row * (cardH + padding);

      // Card frame
      ctx.fillStyle = '#161822';
      ctx.strokeStyle = '#32364a';
      ctx.lineWidth = 1;
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeRect(x, y, cardW, cardH);

      // Render banner
      const bannerCanvas = createBannerCanvas({
        shape: 'pointed',
        color: 'azure',
        pattern: 'none',
        patternColor: 'silver',
        emblem: emblemId,
        emblemColor: 'gold'
      });

      // Draw banner pixelated/crisp 2x scaled (48x96 -> 96x192)
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bannerCanvas, x + (cardW - 96) / 2, y + 12, 96, 192);

      // Label
      const info = BANNER_EMBLEMS[emblemId];
      ctx.fillStyle = '#f2e2b0';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(info ? info.name : emblemId, x + cardW / 2, y + cardH - 12);
    }

    return canvas.toDataURL('image/png');
  }, emblems);

  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  const outPath = path.join(artifactDir, 'preview_gothic_crests.png');
  fs.writeFileSync(outPath, base64Data, 'base64');
  console.log('Saved crests preview to', outPath);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
