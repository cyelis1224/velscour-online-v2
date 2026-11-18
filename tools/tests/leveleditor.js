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

    // 2. Single-Track Keyframe Timeline: Click-to-Inspect & Drag-to-Reorder + Live Preview
    const kfCheck = await page.evaluate(() => {
      const nodes = document.querySelectorAll('#cine-tracks .ckf-node');
      const oldLanes = document.querySelectorAll('#cine-tracks .ctrack');
      return { count: nodes.length, oldLanes: oldLanes.length };
    });
    check(kfCheck.count >= 3 && kfCheck.oldLanes === 0, `Expected single-track keyframe nodes (>=3, 0 old lanes), got ${JSON.stringify(kfCheck)}`);

    // Click Keyframe #2 -> verify Right Sidebar opens Keyframe #2 parameters
    await page.click('#cine-tracks .ckf-node[data-stepidx="1"]');
    const inspTitle2 = await page.textContent('#insp-title');
    check(inspTitle2 && inspTitle2.includes('Keyframe #2'), `Expected Right Inspector to open Keyframe #2, got "${inspTitle2}"`);

    // Drag Keyframe #1 past Keyframe #2 to reorder -> verify order flips and Undo restores
    const beforeIds = await page.evaluate(() => window.__STUDIO__.cineEditor.currentCutscene(window.__STUDIO__.doc).steps.map((s) => s.id));
    const box0 = await page.locator('#cine-tracks .ckf-node[data-stepidx="0"]').boundingBox();
    const box1 = await page.locator('#cine-tracks .ckf-node[data-stepidx="1"]').boundingBox();
    await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
    await page.mouse.down();
    await page.mouse.move(box1.x + box1.width * 0.85, box1.y + box1.height / 2, { steps: 8 });
    await page.mouse.up();
    const afterIds = await page.evaluate(() => window.__STUDIO__.cineEditor.currentCutscene(window.__STUDIO__.doc).steps.map((s) => s.id));
    check(afterIds[0] === beforeIds[1] && afterIds[1] === beforeIds[0], `Expected keyframe drag-reorder to swap #1 & #2: before=${beforeIds} after=${afterIds}`);
    await page.click('#btn-undo');
    const restoredIds = await page.evaluate(() => window.__STUDIO__.cineEditor.currentCutscene(window.__STUDIO__.doc).steps.map((s) => s.id));
    check(restoredIds[0] === beforeIds[0] && restoredIds[1] === beforeIds[1], 'Undo did not restore keyframe order');

    await page.screenshot({ path: path.join(OUT, 'leveleditor_dungeon_overview.png') });

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

    // 4b. Bake 3D Sea of Sand & Pyramid -> verify multi-boss tomb encounters, 3D torches, Stage Jumper, Depth Slice & Passage Teleport!
    const dunesReport = await page.evaluate(async () => {
      const st = window.__STUDIO__;
      st.setViewportMode('live');
      await st.bakeSeedScenario({
        title: 'Baked Golden Pyramid',
        category: '3d_dunes',
        biomeId: 'sea_of_sand',
        variantId: 'golden',
        seed: 4242,
        bossCount: 2,
      });
      const doc = st.doc;
      const midBoss = doc.entities.spawns.find((s) => s.castKey === 'tomb_warden');
      const finalBoss = doc.entities.spawns.find((s) => s.castKey === 'pyramid_pharaoh');
      const chamberRoom = doc.architecture.rooms.find((r) => r.id === 'r_burial_chamber');
      const bossZone = doc.entities.zones.find((z) => z.id === 'z_boss_approach');
      const plazaRoom = doc.architecture.rooms.find((r) => r.id === 'r_pyramid_plaza');
      if (plazaRoom) st.focusCameraAtTile(plazaRoom.x + plazaRoom.w / 2, plazaRoom.y + plazaRoom.h / 2, { lv: plazaRoom.floorLv });
      return {
        spawns: doc.entities.spawns.length,
        rooms: doc.architecture.rooms.length,
        torches3d: doc.grid.dunes?.torches3d?.length || 0,
        passages: doc.entities.passages.length,
        hasMidBoss: !!midBoss && midBoss.rank === 'raid',
        hasFinalBoss: !!finalBoss && finalBoss.rank === 'raid',
        zoneFitsChamber: !!(chamberRoom && bossZone && bossZone.x >= chamberRoom.x && bossZone.y >= chamberRoom.y && bossZone.floorLv === chamberRoom.floorLv),
      };
    });
    check(dunesReport.spawns >= 35, `Expected full Pyramid & Camp spawns (>=35), got ${dunesReport.spawns}`);
    check(dunesReport.torches3d >= 20, `Expected 3D Tomb/Plaza torches (>=20), got ${dunesReport.torches3d}`);
    check(dunesReport.passages >= 1, `Expected Pyramid Door <-> Tomb passage link`);
    check(dunesReport.hasMidBoss && dunesReport.hasFinalBoss, `Expected both Mid-Tomb Warden & Burial Chamber Final Boss: ${JSON.stringify(dunesReport)}`);
    check(dunesReport.zoneFitsChamber, `Expected Boss Zone anchored flush inside Burial Chamber: ${JSON.stringify(dunesReport)}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'leveleditor_3d_dunes_exterior.png') });

    // Jump via Stage Jumper to Mid-Tomb Warden's Hall & Burial Chamber (-189 lv) with Depth Lock + Slice
    const tombNav = await page.evaluate(async () => {
      const st = window.__STUDIO__;
      const sel = document.getElementById('dp-stage-sel');
      const opts = Array.from(sel?.options || []);
      const midIdx = opts.findIndex((o) => o.textContent.includes('Mid-Boss'));
      if (midIdx >= 0) {
        sel.value = String(midIdx);
        sel.dispatchEvent(new Event('change'));
      }
      return {
        inside: !!st.world?.cave?.inside,
        lockDepth: !!st.state.lockDepth,
        sliceMode: !!st.state.sliceMode,
        depthLv: st.state.depthLv,
      };
    });
    check(tombNav.inside && tombNav.lockDepth && tombNav.sliceMode, `Stage Jumper to Tomb Mid-Boss did not activate Tomb + Depth Lock + Slice: ${JSON.stringify(tombNav)}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'leveleditor_3d_dunes_midboss.png') });

    const chamberNav = await page.evaluate(async () => {
      const st = window.__STUDIO__;
      const sel = document.getElementById('dp-stage-sel');
      const opts = Array.from(sel?.options || []);
      const chIdx = opts.findIndex((o) => o.textContent.includes('Burial Chamber'));
      if (chIdx >= 0) {
        sel.value = String(chIdx);
        sel.dispatchEvent(new Event('change'));
      }
      return { inside: !!st.world?.cave?.inside, depthLv: st.state.depthLv };
    });
    check(chamberNav.inside && chamberNav.depthLv < -100, `Burial Chamber jump expected deep negative lv, got ${JSON.stringify(chamberNav)}`);
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(OUT, 'leveleditor_3d_dunes_burial_chamber.png') });

    // Test Playtest Passage teleport through Pyramid Door -> Entrance Hall!
    const pyramidPlaytestOk = await page.evaluate(async () => {
      const st = window.__STUDIO__;
      await st.togglePlaytest(true);
      const p = st.world?.player;
      const psg = st.doc.entities.passages[0];
      if (p && psg) {
        p.x = psg.from[0];
        p.y = psg.from[1];
        for (let k = 0; k < 6; k++) st.playtest.update(0.05);
      }
      const arrivedInside = !!(st.world?.cave?.inside && p && p.x >= (st.doc.grid.dunes?.oxi || 198) - 2);
      await st.togglePlaytest(false);
      return arrivedInside;
    });
    check(pyramidPlaytestOk, 'Stepping onto Pyramid Door passage during Playtest did not teleport Hero into the Interior Tomb');

    // 4c. Bake Forested Mountainside Switchback Climb (from Overworld -> Mountainside) & verify grass/dirt floors + pine trees!
    const mtnReport = await page.evaluate(async () => {
      const st = window.__STUDIO__;
      await st.bakeSeedScenario({
        title: 'Baked Mountainside Climb',
        category: 'overworld',
        biomeId: 'mountainside',
        seed: 1337,
        bossCount: 2,
      });
      return {
        cat: st.doc.meta.category,
        biome: st.doc.meta.biomeId,
        snowLine: st.doc.grid.heightfield.snowLine,
        floorCount: st.world?.townTiles?.length || 0,
        propCount: st.doc.entities.props.length,
        bosses: st.doc.entities.spawns.filter((s) => s.rank === 'boss' || s.rank === 'raid').length,
      };
    });
    check(mtnReport.cat === '3d_alpine' && mtnReport.snowLine > 100 && mtnReport.floorCount >= 30 && mtnReport.propCount > 80 && mtnReport.bosses >= 2, `Mountainside bake check failed: ${JSON.stringify(mtnReport)}`);
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(OUT, 'leveleditor_3d_mountainside.png') });

    // Verify Naval Fleet 3D scene still loads cleanly
    await page.selectOption('#sel-category', 'naval');
    await page.waitForFunction(() => window.__STUDIO__.doc.meta.category === 'naval' && !!window.__STUDIO__.world?.cave?.sea, null, { timeout: 15000 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, 'leveleditor_naval_3d.png') });

    // 4d. Verify Airship full Ironclad hull slices, 3D & Fleet Airship palette, sky placement/drag & Grappling Hooks!
    await page.selectOption('#sel-category', 'airship');
    await page.waitForFunction(() => window.__STUDIO__.doc.meta.category === 'airship' && !!window.__STUDIO__.world?.skyDirector, null, { timeout: 15000 });
    await page.click('[data-pcat="3d"]');
    await page.waitForTimeout(250);
    const airReport = await page.evaluate(async () => {
      const st = window.__STUDIO__;
      const mapTCount = st.world.map.t.reduce((s, v) => s + v, 0);
      const docDeckCount = st.doc.grid.layers.t.reduce((s, v) => s + v, 0);
      const airCards = Array.from(document.querySelectorAll('#pal-grid .pitem')).filter((el) => /Flagship|Cutter|Hauler|Gasbag/i.test(el.textContent));
      // Place a Flagship Galleon and a Boarding Cutter from the palette, lash 4 grappling hooks, and drag the Cutter!
      const galItem = { kind: 'sky_vessel', vesselKind: 'galleon', defLv: 6, name: 'Pirate Flagship Galleon' };
      const cutItem = { kind: 'sky_vessel', vesselKind: 'cutter', defLv: 12, name: 'Swift Boarding Cutter' };
      await st.placePaletteEntityAt(14.0, 34.0, galItem);
      st.doc.grid.airship.vessels[0].hooks = 4;
      await st.placePaletteEntityAt(20.5, 27.0, cutItem);
      st.setTool('select');
      st.handleToolDown(20.5, 27.0);
      st.handleToolMove(21.0, 26.5);
      await st.handleToolUp();
      // Select the Flagship so its Vessel Inspector & grappling chains show cleanly
      st.state.selected = { type: 'sky_vessel', obj: st.doc.grid.airship.vessels[0] };
      st.world.skyDirector.syncPlacedVessels({ inEditor: true });
      st.renderInspector();
      st.refreshBanner();
      const cam = (await import('/src/core/view.js')).camera;
      cam.zoom = 0.62;
      cam.x = (22 - 34) * 32;
      cam.y = (22 + 34) * 16 - 40;
      return {
        mapTCount,
        docDeckCount,
        airCards: airCards.length,
        vessels: st.doc.grid.airship.vessels.length,
        liveHooks: st.world.sky.hooks.length,
      };
    });
    check(airReport.mapTCount > airReport.docDeckCount + 100, `Expected full Ironclad baked hull/spire tiles (> deck + 100), got ${JSON.stringify(airReport)}`);
    check(airReport.airCards >= 4 && airReport.vessels === 2 && airReport.liveHooks === 4, `Airship fleet/hooks check failed: ${JSON.stringify(airReport)}`);
    await page.click('#sky-add-hook-cine');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, 'leveleditor_airship_fleet.png') });

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
