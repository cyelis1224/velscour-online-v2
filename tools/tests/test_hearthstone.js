// E2E: Hearthstone special button — returns to town from the dungeon, then refills over 10 min in the dungeon
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8148;
const BASE_URL = `http://localhost:${PORT}`;
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;
const SHOT = process.env.SHOT || null;

function assert(cond, msg) { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); }
async function waitG(page, src, timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ok = await page.evaluate(async (s) => { const { G } = await import('/src/state.js'); return !!(new Function('G', 'return ' + s))(G); }, src);
    if (ok) return;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Timed out waiting for: ' + src);
}
const evalG = (page, src) => page.evaluate(async (s) => { const { G } = await import('/src/state.js'); return (new Function('G', 'return ' + s))(G); }, src);

(async () => {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dagyr-hearth-test-'));
  const serverProc = spawn('node', ['server.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, PORT: String(PORT), DAGYR_DATA_DIR: tmpDataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser = null;
  try {
    for (let i = 0; i < 75; i++) { try { if ((await fetch(`${BASE_URL}/api/version`)).ok) break; } catch (e) {} await new Promise(r => setTimeout(r, 200)); }
    browser = await chromium.launch({ headless: true, executablePath: CHROMIUM_PATH });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.title-screen', { timeout: 10000 });
    await page.evaluate(() => document.querySelector('.title-screen')?.classList.add('title-ready'));
    await page.click('#title-singleplayer-btn');
    await page.waitForSelector('.class-screen', { timeout: 5000 });
    await page.fill('.class-screen .name-input', 'Hearthling');
    await page.click('.class-screen button.btn.big');
    await waitG(page, "G.mode === 'game' && G.char && G.player && G.world && G.world.kind === 'town'", 30000);

    const btn = () => page.evaluate(() => {
      const b = document.getElementById('hearth-btn');
      const r = b.getBoundingClientRect();
      return { cls: b.className, status: b.querySelector('.special-status').textContent, w: r.width, visible: r.width > 0 && getComputedStyle(b).display !== 'none' };
    });

    let b = await btn();
    assert(b.visible, 'Hearth button visible in HUD');
    assert(b.status === 'READY' && b.cls.includes('idle'), `New hero: stone full but idle in town (${b.cls} / ${b.status})`);

    // H in town does nothing
    await page.keyboard.press('KeyH');
    await page.waitForTimeout(300);
    assert(await evalG(page, "G.world.kind === 'town' && (G.char.hearth ?? 1) === 1"), 'H in town does not consume the stone');

    // Into the dungeon
    await evalG(page, "(G.char.deepest = Math.max(G.char.deepest || 0, 5), G.game.enterDungeonAt(3), true)");
    await waitG(page, "G.world && G.world.kind === 'dungeon' && document.getElementById('loading').classList.contains('hidden')", 40000);
    await page.waitForTimeout(500);
    b = await btn();
    assert(b.cls.includes('ready') && b.status === 'READY', 'Stone ready in dungeon');
    if (SHOT) await page.screenshot({ path: SHOT });

    // Use it via the button
    await page.click('#hearth-btn', { force: true });
    await page.waitForTimeout(200);
    b = await btn();
    assert(b.cls.includes('casting'), 'Button shows casting while channelling');
    await waitG(page, "G.world && G.world.kind === 'town'", 15000);
    const afterUse = await evalG(page, "({ hearth: G.char.hearth, depth: G.char.depth })");
    assert(afterUse.hearth < 0.01, 'Stone emptied after use');
    assert(afterUse.depth === 3, 'Depth remembered (re-forged on return) like the Town Portal');
    await page.waitForTimeout(300);
    b = await btn();
    assert(/^(10:00|9:5\d)$/.test(b.status) && b.cls.includes('charging'), `Shows ~10:00 cooldown (${b.status})`);

    // Does not refill in town
    await page.waitForTimeout(1500);
    assert(await evalG(page, "G.char.hearth < 0.01"), 'No refill while in town');

    // Back to dungeon: refills over time there; H while cold does nothing
    await evalG(page, "(G.char.deepest = Math.max(G.char.deepest || 0, 5), G.game.enterDungeonAt(3), true)");
    await waitG(page, "G.world && G.world.kind === 'dungeon' && document.getElementById('loading').classList.contains('hidden')", 40000);
    const h0 = await evalG(page, "G.char.hearth");
    await page.keyboard.press('KeyH');
    await page.waitForTimeout(2000);
    const h1 = await evalG(page, "G.char.hearth");
    assert(await evalG(page, "G.world.kind === 'dungeon'"), 'Cold stone does not teleport');
    const rate = (h1 - h0) / 2;
    assert(rate > 1 / 600 * 0.5 && rate < 1 / 600 * 1.6, `Refill rate ~1/600 per second (got ${rate})`);

    // Nearly full -> becomes ready, H key works
    await evalG(page, "(G.char.hearth = 0.9995, true)");
    await waitG(page, "G.char.hearth >= 1", 5000);
    await page.keyboard.press('KeyH');
    await waitG(page, "G.world && G.world.kind === 'town'", 15000);
    assert(!errs.length, 'No page errors: ' + errs.join(' | '));

    console.log('ALL HEARTHSTONE TESTS PASSED!');
  } finally {
    if (browser) await browser.close();
    serverProc.kill('SIGTERM');
    try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch (e) {}
  }
})().catch(err => { console.error(err); process.exit(1); });

