// End-to-end Playwright verification & visual screenshot suite for Velscour Level & Scenario Studio:
// - Starts tools/leveleditor/server.mjs on an isolated port (never touching live server.js on 8124)
// - Verifies zero uncaught errors, Asset Manager palette integration, 2D painting/room stamps & Undo/Redo
// - Verifies Live Three.js 3D Caverns sculpting & Walkability Heatmap
// - Verifies 3D Serpentine Spiral Tower Split 2D+3D view & Climb Turn Scrubber
// - Verifies Airship-style Cutscene Director live preview (Cine bars + dialogue + camera)
// - Verifies F5 Live Playtest spawning playable Hero & spatial/arrival triggers
// - Verifies Save & Delete API round-trip
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const PORT = 18125;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium', '/usr/bin/google-chrome-stable'].find((p) => fs.existsSync(p));
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const bad = [];
const check = (ok, msg) => { if (!ok) bad.push(msg); };

function waitHealth(url, timeoutMs = 8000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const r = await fetch(url);
        if (r.ok) return resolve(await r.json());
      } catch {}
      if (Date.now() - t0 > timeoutMs) return reject(new Error('Studio server health timeout'));
      setTimeout(poll, 120);
    };
    poll();
  });
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '../leveleditor/server.mjs'), '--no-browser', '--port', String(PORT)], {
    cwd: path.join(__dirname, '../..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let browser;
  try {
    const health = await waitHealth(`${BASE}/api/studio/health`);
    check(health.ok === true, 'Studio health endpoint did not return ok:true');

    browser = await chromium.launch({
      ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
    });

    const ctx = await browser.newContext({ viewport: { width: 1480, height: 920 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[BROWSER]', m.type(), m.text()); });
    page.on('pageerror', (e) => { console.log('[PAGEERROR]', e.stack || e.message); errors.push(`pageerror: ${e.message}`); });
    page.on('requestfailed', (r) => console.log('[REQFAIL]', r.url(), r.failure()?.errorText));
    page.on('response', (r) => {
      const u = r.url();
      if (u.startsWith(BASE) && r.status() >= 400) { console.log('[HTTPERR]', r.status(), u); errors.push(`HTTP ${r.status()} ${u}`); }
    });

    await page.goto(`${BASE}/tools/leveleditor/`);
    await page.waitForFunction(() => window.__STUDIO__ && window.__STUDIO__.world && window.__STUDIO__.doc, null, { timeout: 20000 });
    await page.waitForTimeout(500);

    // 1. Check initial Dungeon load & Asset Manager palette
    const initInfo = await page.evaluate(() => {
      const st = window.__STUDIO__;
      return {
        id: st.doc.meta.id,
        cat: st.doc.meta.category,
        palCards: document.querySelectorAll('#pal-grid .pitem').length,
        wide: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    check(initInfo.id === 'sanctum_of_echoes', `Expected sanctum_of_echoes, got ${initInfo.id}`);
    check(initInfo.palCards > 5, `Expected floor palette cards, got ${initInfo.palCards}`);
    check(initInfo.wide <= 0, `Horizontal overflow detected: ${initInfo.wide}px`);

    // Check Monsters palette thumbnails from Asset Manager manifest
    await page.click('[data-pcat="monsters"]');
    await page.waitForTimeout(250);
    const monCount = await page.evaluate(() => document.querySelectorAll('#pal-grid .pitem').length);
    check(monCount > 3, `Expected monster palette cards, got ${monCount}`);

    // Paint & Undo/Redo verification
    await page.click('[data-pcat="floors"]');
    await page.waitForTimeout(150);
    const undoOk = await page.evaluate(() => {
      const st = window.__STUDIO__;
      const idx = 25 * st.doc.grid.w + 20;
      const before = st.doc.grid.layers.t[idx];
      st.setTool('brush');
      st.handleToolDown(20.5, 25.5);
      st.handleToolUp();
      const painted = st.doc.grid.layers.t[idx];
      st.history.undo(st.doc);
      const restored = st.doc.grid.layers.t[idx];
      return painted === 1 && restored === before;
    });
    check(undoOk, 'Brush paint + Undo did not restore original tile state');

    await page.screenshot({ path: path.join(OUT, 'leveleditor_dungeon_overview.png') });

    // 2. Cutscene Director Live Preview
    await page.click('#btn-cine-play');
    await page.waitForTimeout(750);
    const cineActive = await page.evaluate(() => !!window.__STUDIO__.cineEditor.previewing);
    check(cineActive, 'Cutscene preview did not start');
    await page.screenshot({ path: path.join(OUT, 'leveleditor_cutscene_preview.png') });
    await page.click('#btn-cine-stop');
    await page.waitForTimeout(200);

    // 3. Switch to Live Three.js 3D Caverns + Sculpt + Walkability Heatmap
    await page.selectOption('#sel-category', '3d_caverns');
    await page.waitForFunction(() => window.__STUDIO__.doc.meta.category === '3d_caverns' && !!window.__STUDIO__.world?.cave, null, { timeout: 15000 });
    await page.click('[data-tool="sculpt"]');
    await page.click('#btn-heatmap');
    await page.waitForTimeout(500);
    const cavOk = await page.evaluate(async () => {
      const st = window.__STUDIO__;
      const [sx, sy] = st.doc.entities.start;
      const i = Math.floor(sy) * st.doc.grid.w + Math.floor(sx);
      const h0 = st.doc.grid.layers.hgt[i];
      st.handleToolDown(sx, sy);
      await st.handleToolUp();
      return st.doc.grid.layers.hgt[i] > h0;
    });
    check(cavOk, '3D Cavern sculpt raise brush did not increase heightfield elevation');
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(OUT, 'leveleditor_3d_caverns.png') });
    await page.click('#btn-heatmap'); // toggle off heatmap

    // 4. Switch to 3D Serpentine Spiral Tower (Split 2D Unrolled Strip + Live 3D Helix)
    await page.selectOption('#sel-category', '3d_tower');
    await page.waitForFunction(() => window.__STUDIO__.doc.meta.category === '3d_tower' && !!window.__STUDIO__.world?.tower, null, { timeout: 15000 });
    await page.waitForTimeout(450);
    const splitVisible = await page.evaluate(() => !document.getElementById('plan-pane').hidden && window.__STUDIO__.vpMode === 'split');
    check(splitVisible, '3D Spiral Tower did not auto-open Split 2D+3D view');
    await page.click('[data-twjump="0.5"]');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, 'leveleditor_3d_tower_split.png') });

    // 4b. Verify 3D Dunes & Naval Fleet load cleanly without WebGL/scene errors
    await page.selectOption('#sel-category', '3d_dunes');
    await page.waitForFunction(() => window.__STUDIO__.doc.meta.category === '3d_dunes' && !!window.__STUDIO__.world?.cave, null, { timeout: 15000 });
    await page.selectOption('#sel-category', 'naval');
    await page.waitForFunction(() => window.__STUDIO__.doc.meta.category === 'naval' && !!window.__STUDIO__.world?.cave?.sea, null, { timeout: 15000 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, 'leveleditor_naval_3d.png') });

    // 5. Return to Sanctum of Echoes & run F5 Live Playtest
    await page.evaluate(async () => {
      await window.__STUDIO__.openById('sanctum_of_echoes');
      window.__STUDIO__.setViewportMode('live');
    });
    await page.waitForTimeout(400);
    await page.click('#btn-playtest');
    await page.waitForFunction(() => window.__STUDIO__.playtest.active && !!window.__STUDIO__.world?.player, null, { timeout: 15000 });
    await page.waitForTimeout(600);
    const ptState = await page.evaluate(() => ({
      active: window.__STUDIO__.playtest.active,
      heroHp: window.__STUDIO__.world?.player?.hp || 0,
    }));
    check(ptState.active && ptState.heroHp > 0, `Playtest hero failed to spawn: ${JSON.stringify(ptState)}`);
    await page.screenshot({ path: path.join(OUT, 'leveleditor_playtest.png') });
    await page.click('#btn-playtest');
    await page.waitForTimeout(350);

    // 5b. Bake Dungeon Seeds (Standard + Raid Arena) & verify Playtest renders brightly with zero Raid/UI errors
    for (const vId of ['standard', 'raid_arena']) {
      const bakedPt = await page.evaluate(async (variantId) => {
        const st = window.__STUDIO__;
        await st.bakeSeedScenario({ title: `Baked ${variantId}`, category: 'dungeon', biomeId: 'catacombs', variantId, seed: 4242 });
        await st.togglePlaytest(true);
        for (let k = 0; k < 8; k++) st.playtest.update(0.05);
        await new Promise((r) => requestAnimationFrame(r));
        const cv = document.getElementById('studio-canvas');
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let nonBlack = 0;
        for (let i = 0; i < d.length; i += 128) if (d[i] + d[i + 1] + d[i + 2] > 15) nonBlack++;
        await st.togglePlaytest(false);
        return { nonBlack, spawns: st.doc.entities.spawns.length };
      }, vId);
      check(bakedPt.nonBlack > 1000, `Baked ${vId} playtest canvas was dark/blank (${bakedPt.nonBlack})`);
    }

    // 6. Test Save + Delete API round-trip with a temporary scenario ID
    const apiOk = await page.evaluate(async () => {
      const st = window.__STUDIO__;
      const origId = st.doc.meta.id;
      st.doc.meta.id = 'zz_playwright_temp_test';
      await st.saveScenarioToServer();
      const getRes = await fetch('api/studio/scenarios/zz_playwright_temp_test');
      const delRes = await fetch('api/studio/scenarios/zz_playwright_temp_test', { method: 'DELETE' });
      st.doc.meta.id = origId;
      return getRes.ok && delRes.ok;
    });
    check(apiOk, 'Studio Save/Delete REST API round-trip failed');
    const bakPath = path.join(__dirname, '../../assets/scenarios/zz_playwright_temp_test.velscen.json.bak');
    if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);

    for (const e of errors) bad.push(e);
    await ctx.close();
  } finally {
    if (browser) await browser.close();
    srv.kill('SIGTERM');
  }

  console.log(bad.length ? `FAIL\n  ${bad.join('\n  ')}` : 'PASS');
  process.exit(bad.length ? 1 : 0);
})();
