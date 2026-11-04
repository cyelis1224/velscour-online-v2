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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-lvl-'));
  const srv = spawn('node', ['server.js'], { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, PORT: String(PORT), VELSCOUR_DATA_DIR: dir }, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 75; i++) { try { if ((await fetch(`${BASE}/api/version`)).ok) break; } catch (e) { } await new Promise(r => setTimeout(r, 200)); }
    browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
    const A = await boot(browser, 'Alpha', 'paladin');
    const B = await boot(browser, 'Bravo', 'carrion_witch');
    await evalG(A.page, "(net.createRoom({ name: 'LvlTest', maxPlayers: 4, depth: 1 }), true)");
    await waitG(A.page, "G.mode === 'game' && G.world && G.player && document.getElementById('loading').classList.contains('hidden')", 40000, 'A in game');
    await evalG(B.page, "(net.joinRoom('LvlTest'), true)");
    await waitG(B.page, "G.mode === 'game' && G.world && G.player && document.getElementById('loading').classList.contains('hidden')", 40000, 'B in game');
    await waitG(A.page, "G.remotePlayers && G.remotePlayers.size >= 1", 15000, 'A sees B');
    await A.page.waitForTimeout(1000);
    const look = () => A.page.evaluate(async () => {
      const { G } = await import('/src/state.js');
      const { getPartyPlayers } = await import('/src/ui/partyroster.js');
      const { net } = await import('/src/net/network.js');
      const rp = [...G.remotePlayers.values()][0];
      const pp = getPartyPlayers().find(p => !p.isMe);
      const roomInfo = (G.room || net.currentRoom).players.find(p => p.name === 'Bravo');
      return { rpLevel: rp.level, partyLevel: pp && pp.level, roomLevel: roomInfo && roomInfo.level, inWorld: rp.world === G.world };
    });
    console.log('before:', JSON.stringify(await look()));
    await evalG(B.page, "(G.player.levelUp(), G.player.levelUp(), G.player.levelUp(), G.char.level)");
    await A.page.waitForTimeout(1500);
    console.log('after B +3 levels:', JSON.stringify(await look()), 'B char level', await evalG(B.page, 'G.char.level'));
    await evalG(A.page, "(G.settings.alwaysShowParty = true, G.showAutomap = false, true)");
    await A.page.waitForTimeout(500);
    const roster = await A.page.evaluate(() => {
      const r = document.getElementById('party-roster'), hs = document.getElementById('hero-stats');
      return { visible: !r.classList.contains('hidden'), w: r.offsetWidth, heroW: hs.offsetWidth, text: r.innerText.replace(/\s+/g, ' ') };
    });
    console.log('roster:', JSON.stringify(roster));
    await A.page.screenshot({ path: process.env.SHOT || '/tmp/roster.png' });
    console.log('A errors:', A.errs.slice(0, 5)); console.log('B errors:', B.errs.slice(0, 5));
  } finally {
    if (browser) await browser.close();
    srv.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
