// E2E: town portal floor picker (slider 1..deepest reached + number box w/ arrows) -> enters chosen depth
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8147;
const BASE_URL = `http://localhost:${PORT}`;
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;
const SHOT = process.env.SHOT || null;


async function waitG(page, fnSrc, timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ok = await page.evaluate(async (src) => { const { G } = await import('/src/state.js'); return !!(new Function('G', 'return ' + src))(G); }, fnSrc);
    if (ok) return;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Timed out waiting for: ' + fnSrc);
}

function assert(cond, msg) { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); }

(async () => {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dagyr-floor-test-'));
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
    await page.fill('.class-screen .name-input', 'FloorPicker');
    await page.click('.class-screen button.btn.big');
    await waitG(page, "G.mode === 'game' && G.char && G.player && G.world && G.world.kind === 'town' && G.world.portals && G.world.portals.length", 30000);

    // Hero has cleared depth 37 and the portal is currently set to depth 12
    await page.evaluate(async () => {
      const { G } = await import('/src/state.js');
      G.char.deepest = 37;
      G.char.depth = 12;
      G.world.portals[0].use();
    });
    await page.waitForSelector('.floor-pick-dialog', { timeout: 5000 });

    const read = () => page.evaluate(() => ({
      range: document.querySelector('.floor-pick-range').value,
      rangeMax: document.querySelector('.floor-pick-range').max,
      num: document.querySelector('.floor-pick-input').value,
      numMax: document.querySelector('.floor-pick-input').max,
      go: document.querySelector('.floor-pick-go').textContent,
      desc: document.querySelector('.floor-pick-desc').textContent,
      focused: document.activeElement?.className,
    }));

    let s = await read();
    assert(s.rangeMax === '38' && s.numMax === '38', `Slider/number max is deepest reached (38), got ${s.rangeMax}/${s.numMax}`);
    assert(s.range === '12' && s.num === '12', 'Starts on the portal\'s current depth');
    assert(s.go.includes('12'), 'Go button shows current depth');
    assert(s.focused.includes('floor-pick-input'), 'Number box is focused');
    if (SHOT) await page.screenshot({ path: SHOT });

    // Arrow keys in number box
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    s = await read();
    assert(s.num === '15' && s.range === '15', `ArrowUp x3 -> 15 (num ${s.num}, range ${s.range})`);
    await page.keyboard.press('ArrowDown');
    s = await read();
    assert(s.num === '14' && s.range === '14', 'ArrowDown -> 14');
    await page.keyboard.press('PageUp');
    s = await read();
    assert(s.num === '24', 'PageUp -> +10');
    await page.keyboard.press('End');
    s = await read();
    assert(s.num === '38', 'End -> deepest');
    await page.keyboard.press('ArrowUp');
    s = await read();
    assert(s.num === '38', 'Cannot go past deepest reached');
    await page.keyboard.press('Home');
    s = await read();
    assert(s.num === '1' && s.range === '1', 'Home -> 1');

    // Typing a number syncs slider; typing over max clamps
    await page.fill('.floor-pick-input', '27');
    s = await read();
    assert(s.range === '27' && s.go.includes('27'), 'Typing 27 moves slider & button');
    await page.fill('.floor-pick-input', '999');
    await page.locator('.floor-pick-input').blur();
    s = await read();
    assert(s.num === '38' && s.range === '38', 'Typing over max clamps to deepest');

    // -/+ steppers
    await page.click('.floor-pick-step[data-step="-1"]');
    s = await read();
    assert(s.num === '37', 'Minus button steps down');

    // Dragging the slider
    const box = await page.locator('.floor-pick-range').boundingBox();
    await page.mouse.click(box.x + 4, box.y + box.height / 2);
    s = await read();
    assert(parseInt(s.num, 10) <= 2, `Clicking slider far left picks ~1 (got ${s.num})`);
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    s = await read();
    const mid = parseInt(s.num, 10);
    assert(mid >= 16 && mid <= 22 && s.range === s.num, `Dragging slider to middle -> ~19 and box follows (got ${s.num})`);

    // Cancel closes without entering
    await page.click('.floor-pick-dialog button:has-text("Cancel")');
    await page.waitForSelector('.floor-pick-dialog', { state: 'detached', timeout: 3000 });
    const stillTown = await page.evaluate(async () => { const { G } = await import('/src/state.js'); return { kind: G.world.kind, depth: G.char.depth }; });
    assert(stillTown.kind === 'town' && stillTown.depth === 12, 'Cancel stays in town with depth unchanged');

    // Reopen, choose 30, Enter key descends
    await page.evaluate(async () => { const { G } = await import('/src/state.js'); G.world.portals[0].use(); });
    await page.waitForSelector('.floor-pick-dialog', { timeout: 5000 });
    await page.fill('.floor-pick-input', '30');
    await page.keyboard.press('Enter');
    await waitG(page, "G.world && G.world.kind === 'dungeon' && document.getElementById('loading').classList.contains('hidden')", 40000);
    const after = await page.evaluate(async () => { const { G } = await import('/src/state.js'); return { depth: G.world.depth, cdepth: G.char.depth, deepest: G.char.deepest }; });
    assert(after.depth === 30 && after.cdepth === 30, `Entered chosen Depth 30 (world ${after.depth}, char ${after.cdepth})`);
    assert(after.deepest === 37, 'Deepest progress is not reduced by choosing a shallower floor');
    assert(!errs.length, 'No page errors: ' + errs.join(' | '));

    console.log('ALL FLOOR PICKER TESTS PASSED!');
  } finally {
    if (browser) await browser.close();
    serverProc.kill('SIGTERM');
    try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch (e) {}
  }
})().catch(err => { console.error(err); process.exit(1); });
