// Repro: two clients in one room — does host A's camera keep following A after B joins? Any errors?
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8150;
const BASE = `http://localhost:${PORT}`;
const SHOT_DIR = process.env.SHOT_DIR || null;

const evalG = (page, src) => page.evaluate(async (s) => {
  const { G } = await import('/src/state.js');
  const { camera } = await import('/src/core/view.js');
  const { net } = await import('/src/net/network.js');
  return (new Function('G', 'camera', 'net', 'return ' + s))(G, camera, net);
}, src);
async function waitG(page, src, timeout, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await evalG(page, `!!(${src})`)) return; await new Promise(r => setTimeout(r, 250)); }
  throw new Error('Timed out: ' + (label || src));
}

async function boot(browser, name, classId) {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  await page.goto(`${BASE}/?server=localhost:${PORT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.title-screen', { timeout: 15000 });
  await page.evaluate(async ({ name, classId }) => {
    const { newCharData } = await import('/src/game/save.js');
    const { openLobby } = await import('/src/ui/lobby.js');
    const c = newCharData(classId, name);
    c.id = 'test-' + name;
    window.__char = c;
    document.querySelector('.title-screen')?.remove();
    openLobby(c, () => { });
  }, { name, classId });
  await waitG(page, 'net.connected && net.myId', 15000, name + ' connect');
  return { page, errs };
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-cam-'));
  const srv = spawn('node', ['server.js'], { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, PORT: String(PORT), VELSCOUR_DATA_DIR: dir }, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 75; i++) { try { if ((await fetch(`${BASE}/api/version`)).ok) break; } catch (e) { } await new Promise(r => setTimeout(r, 200)); }
    browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
    const A = await boot(browser, 'Alpha', 'paladin');
    const B = await boot(browser, 'Bravo', process.env.BCLASS || 'carrion_witch');

    await evalG(A.page, "(net.createRoom({ name: 'CamTest', maxPlayers: 4, depth: 1 }), true)");
    await waitG(A.page, "G.mode === 'game' && G.world && G.player && document.getElementById('loading').classList.contains('hidden')", 40000, 'A in game');
    await A.page.waitForTimeout(1500);
    if (process.env.DUNGEON) {
      await evalG(A.page, "(G.game.enterDungeon(), true)");
      await waitG(A.page, "G.world && G.world.kind === 'dungeon' && document.getElementById('loading').classList.contains('hidden')", 40000, 'A in dungeon');
      await A.page.waitForTimeout(1500);
    }

    const camState = (page) => evalG(page, `({
      px: +G.player.x.toFixed(2), py: +G.player.y.toFixed(2),
      cx: +(camera.tx ?? camera.x ?? 0).toFixed ? (camera.x ?? 0) : 0,
      cam: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(camera).filter(([k, v]) => typeof v === 'number')))),
      cine: !!G.cine, wplayerIsMe: G.world.player === G.player, gplayerRemote: !!G.player.isRemotePlayer,
      remotes: G.remotePlayers ? G.remotePlayers.size : 0, world: G.world.kind,
      darkK: G.world.darkK, night: !!G.world.night,
    })`);

    const before = await camState(A.page);
    console.log('A before B joins:', JSON.stringify(before));
    if (SHOT_DIR) await A.page.screenshot({ path: path.join(SHOT_DIR, 'mp_A_before.png') });

    await evalG(B.page, "(net.joinRoom('CamTest'), true)");
    await waitG(B.page, "G.mode === 'game' && G.world && G.player && document.getElementById('loading').classList.contains('hidden')", 40000, 'B in game');
    await waitG(A.page, "G.remotePlayers && G.remotePlayers.size >= 1", 15000, 'A sees B');
    await A.page.waitForTimeout(1500);

    const mid = await camState(A.page);
    console.log('A right after B joins:', JSON.stringify(mid));

    // move A a few tiles and see if the camera follows
    await evalG(A.page, "(G.player.moveTarget = null, G.player.path = null, true)");
    const moved = await evalG(A.page, `(() => {
      const p = G.player, m = G.world.map;
      for (let r = 4; r < 12; r++) for (let a = 0; a < 16; a++) {
        const x = p.x + Math.cos(a / 16 * 6.283) * r, y = p.y + Math.sin(a / 16 * 6.283) * r;
        if (m.walkable(x, y)) { p.x = x; p.y = y; return [x, y]; }
      }
      return null;
    })()`);
    await A.page.waitForTimeout(2000);
    const after = await camState(A.page);
    console.log('A teleported to', JSON.stringify(moved), '-> camera:', JSON.stringify(after));
    if (SHOT_DIR) await A.page.screenshot({ path: path.join(SHOT_DIR, 'mp_A_after.png') });
    if (SHOT_DIR) await B.page.screenshot({ path: path.join(SHOT_DIR, 'mp_B_after.png') });
    const bState = await camState(B.page);
    console.log('B:', JSON.stringify(bState));

    if (process.env.FOLLOW) {
      // B follows A into the same dungeon and fights on auto-play; track A's camera vs A's hero
      await evalG(B.page, "(G.game.enterDungeon(), true)");
      await waitG(B.page, "G.world && G.world.kind === 'dungeon' && document.getElementById('loading').classList.contains('hidden')", 40000, 'B in dungeon');
      await B.page.evaluate(async () => { const { Auto } = await import('/src/game/autoplay.js'); if (!Auto.on) Auto.toggle(true); });
      await A.page.evaluate(async () => { const { Auto } = await import('/src/game/autoplay.js'); if (!Auto.on) Auto.toggle(true); });
      if (process.env.SQUEEZE) {
        // force the remote witch's doll full on A's client: pin nearby foes and let her SQUEEZE
        const r = await A.page.evaluate(async () => {
          const { G } = await import('/src/state.js');
          const { sigOf, SIGNATURES } = await import('/src/game/signature.js');
          const rp = [...G.remotePlayers.values()][0];
          if (!rp || rp.world !== G.world) return 'remote not in world';
          const S = sigOf(rp);
          const foes = G.world.creatures.filter(c => c.team === 'enemy' && !c.dead).sort((a, b) => Math.hypot(a.x - rp.x, a.y - rp.y) - Math.hypot(b.x - rp.x, b.y - rp.y)).slice(0, 6);
          foes.forEach(f => { f.x = rp.x + (Math.random() - 0.5) * 2; f.y = rp.y + (Math.random() - 0.5) * 2; });
          S.s.pins = foes; S.s.rot = 6 - foes.length;
          return { pins: foes.length, cls: S.cls };
        });
        console.log('forced squeeze on remote witch:', JSON.stringify(r));
      }
      for (let i = 0; i < 15; i++) {
        await A.page.waitForTimeout(2000);
        const st = await A.page.evaluate(async () => {
          const { G } = await import('/src/state.js');
          const { camera, isoX, isoY } = await import('/src/core/view.js');
          const p = G.player;
          const wx = isoX(p.x, p.y) + camera.leadX, wy = isoY(p.x, p.y) - 24 + camera.leadY;
          const rp = G.remotePlayers && [...G.remotePlayers.values()][0];
          return {
            off: Math.round(Math.hypot(wx - camera.x, wy - camera.y)), me: [+p.x.toFixed(1), +p.y.toFixed(1)], rp: rp ? [+rp.x.toFixed(1), +rp.y.toFixed(1), rp.world === G.world] : null,
            cine: !!G.cine, zoom: +camera.zoom.toFixed(2), darkK: G.world.darkK, lead: [camera.leadX, camera.leadY], gp: G.player === G.world.player, auto: G.autoplayOn
          };
        });
        console.log('follow', JSON.stringify(st));
      }
      if (SHOT_DIR) await A.page.screenshot({ path: path.join(SHOT_DIR, 'mp_A_follow.png') });
    }
    if (process.env.WATCH) {
      for (let i = 0; i < 20; i++) {
        const st = await evalG(A.page, "({ t: +G.time.toFixed(1), biome: G.world.biome && G.world.biome.id, cine: !!G.cine, step: (window.__cineStep = null), sky: !!G.world.sky })");
        const cs = await A.page.evaluate(async () => { const { Cine } = await import('/src/game/cinema.js'); const s = Cine.steps[Cine.i]; return { i: Cine.i, n: Cine.steps.length, active: Cine.active, step: s ? Object.keys(s).filter(k => !k.startsWith('_')).join(',') + (s.until ? ' until:' + String(s.until).slice(0, 160) : '') : null, t: +Cine.t.toFixed(1) }; });
        console.log('watch', JSON.stringify(st), JSON.stringify(cs));
        await A.page.waitForTimeout(2000);
      }
    }
    console.log('A errors:', A.errs.slice(0, 8));
    console.log('B errors:', B.errs.slice(0, 8));
  } finally {
    if (browser) await browser.close();
    srv.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
