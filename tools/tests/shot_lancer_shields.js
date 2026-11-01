// Scratch: screenshot a Lancer with several tower-shield rings up, in a fight, and count live particles.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8152;
const BASE = `http://localhost:${PORT}`;
const OUT = process.argv[2] || '/tmp/lancer.png';

const evalG = (page, src) => page.evaluate(async (s) => { const { G } = await import('/src/state.js'); return (new Function('G', 'return ' + s))(G); }, src);
async function waitG(page, src, timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await evalG(page, `!!(${src})`)) return; await new Promise(r => setTimeout(r, 200)); }
  throw new Error('Timed out: ' + src);
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lancer-'));
  const srv = spawn('node', ['server.js'], { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, PORT: String(PORT), DAGYR_DATA_DIR: dir }, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 75; i++) { try { if ((await fetch(`${BASE}/api/version`)).ok) break; } catch (e) {} await new Promise(r => setTimeout(r, 200)); }
    browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium' });
    const page = await (await browser.newContext({ viewport: { width: 1100, height: 750 } })).newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.title-screen', { timeout: 15000 });
    await page.evaluate(async () => {
      const { G } = await import('/src/state.js');
      const { newCharData } = await import('/src/game/save.js');
      document.querySelector('.title-screen')?.remove();
      const c = newCharData('lancer', 'Shieldy');
      c.level = 40; c.deepest = 10;
      await G.game.loadClassPack('lancer');
      G.game.startChar(c, true, null);
    });
    await waitG(page, "G.mode === 'game' && G.world && G.world.kind === 'town'", 30000);
    await evalG(page, "(G.game.enterDungeonAt(8), true)");
    await waitG(page, "G.world && G.world.kind === 'dungeon' && document.getElementById('loading').classList.contains('hidden')", 40000);
    await page.waitForTimeout(800);
    const info = await page.evaluate(async () => {
      const { G } = await import('/src/state.js');
      const { SKILLS } = await import('/src/data/skills.js');
      const { castSkill } = await import('/src/game/skillrun.js');
      const p = G.player, w = G.world;
      // pull a pack of monsters around the hero and make them unkillable for the screenshot
      const foes = w.creatures.filter(m => m.team === 'enemy' && !m.dead).slice(0, 10);
      foes.forEach((m, i) => { const a = i / foes.length * 6.283; m.x = p.x + Math.cos(a) * 1.8; m.y = p.y + Math.sin(a) * 1.8; m.maxHp = m.hp = 1e9; m.awake = true; });
      const orbitSkills = Object.values(SKILLS).filter(s => s.classId === 'lancer' && s.kind === 'orbit');
      for (const sk of orbitSkills) { p.char.skills[sk.id] = 15; try { castSkill(p, sk, 15, p.x + 1, p.y); } catch (e) { return 'cast error ' + sk.name + ': ' + e.message; } }
      return { rings: orbitSkills.map(s => s.name), foes: foes.length };
    });
    console.log(JSON.stringify(info));
    await page.waitForTimeout(1500);
    const parts = await page.evaluate(async () => {
      const v = await import('/src/gfx/vfx.js');
      const by = {};
      for (const q of v.particles) { const k = (q.type || '?') + (q.add ? '+' : '') + ' ' + (q.color || '') + ' life' + (q.maxLife || q.life0 || 0).toFixed?.(1); by[k] = (by[k] || 0) + 1; }
      const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 12);
      return { particles: v.particles.length, effects: v.effects.length, top };
    });
    console.log('live:', JSON.stringify(parts));
    await page.screenshot({ path: OUT });
    if (errs.length) console.log('errors:', errs.slice(0, 3));
  } finally {
    if (browser) await browser.close();
    srv.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
