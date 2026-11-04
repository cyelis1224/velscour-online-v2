// Scratch: screenshot the portrait touch HUD in a dungeon (optionally with a boss bar showing)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8149;
const BASE_URL = `http://localhost:${PORT}`;
const OUT = process.argv[2] || '/tmp/portrait.png';

const evalG = (page, src) => page.evaluate(async (s) => { const { G } = await import('/src/state.js'); return (new Function('G', 'return ' + s))(G); }, src);
async function waitG(page, src, timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await evalG(page, `!!(${src})`)) return; await new Promise(r => setTimeout(r, 200)); }
  throw new Error('Timed out: ' + src);
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portrait-'));
  const srv = spawn('node', ['server.js'], { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, PORT: String(PORT), VELSCOUR_DATA_DIR: dir }, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 75; i++) { try { if ((await fetch(`${BASE_URL}/api/version`)).ok) break; } catch (e) { } await new Promise(r => setTimeout(r, 200)); }
    browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium' });
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.title-screen', { timeout: 10000 });
    await page.evaluate(() => document.querySelector('.title-screen')?.classList.add('title-ready'));
    await page.tap('#title-singleplayer-btn');
    await page.waitForSelector('.class-screen', { timeout: 5000 });
    await page.fill('.class-screen .name-input', 'Portraiter');
    await page.tap('.class-screen button.btn.big');
    await waitG(page, "G.mode === 'game' && G.char && G.player && G.world && G.world.kind === 'town'", 30000);
    // barbarian-style rage bar visible for layout checks
    await evalG(page, "(G.char.deepest = 5, G.game.enterDungeonAt(1), true)");
    await waitG(page, "G.world && G.world.kind === 'dungeon' && document.getElementById('loading').classList.contains('hidden')", 40000);
    await page.waitForTimeout(800);
    // show the rage gauge and a boss bar so their placement can be checked
    await page.evaluate(() => {
      document.getElementById('barbarian-rage')?.classList.remove('hidden');
      document.getElementById('barbarian-rage-fill').style.width = '60%';
      document.getElementById('barbarian-rage-text').textContent = 'Rage 60%';
      const bb = document.getElementById('boss-bar');
      bb.classList.remove('hidden');
      document.getElementById('boss-name').textContent = 'The Flesh Warden';
      document.getElementById('boss-fill').style.width = '72%';
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT });
    const rects = await page.evaluate(() => {
      const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), disp: getComputedStyle(e).display }; };
      return { hearth: r('#hearth-btn'), madness: r('#madness-btn'), smite: r('#smite-btn'), atk: r('#touch-buttons .tbtn'), rage: r('#barbarian-rage'), gauge: r('#gauge-box'), slots: r('#hud-slots'), bar: r('#hud-bar'), boss: r('#boss-bar') };
    });
    console.log(JSON.stringify(rects), errs);
  } finally {
    if (browser) await browser.close();
    srv.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
