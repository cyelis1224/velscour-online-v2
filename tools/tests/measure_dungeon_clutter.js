// Measures dungeon prop clutter over many seeds: props per level, how many block, and how many sit in hallways.
// Usage: node tools/tests/measure_dungeon_clutter.js [label]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8151;
const BASE = `http://localhost:${PORT}`;
const LABEL = process.argv[2] || 'current';

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clutter-'));
  const srv = spawn('node', ['server.js'], { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, PORT: String(PORT), VELSCOUR_DATA_DIR: dir }, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 75; i++) { try { if ((await fetch(`${BASE}/api/version`)).ok) break; } catch (e) { } await new Promise(r => setTimeout(r, 200)); }
    browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium' });
    const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.title-screen', { timeout: 15000 });
    const res = await page.evaluate(async () => {
      const { G } = await import('/src/state.js');
      const { newCharData } = await import('/src/game/save.js');
      const { BIOMES } = await import('/src/data/biomes.js');
      G.char = newCharData('paladin', 'Measure');
      const pool = BIOMES.filter(b => !b.overworld && !b.tower && !b.cave && !b.beta && b.id !== 'throne' && b.id !== 'skyship' && b.id !== 'mountainside');
      const out = { biomes: [], levels: 0, props: 0, blocking: 0, hallway: 0, hallwayBlocking: 0 };
      for (const biome of pool) {
        try { await G.game.loadLevelArt(biome); } catch (e) { continue; }
        out.biomes.push(biome.id);
        for (let k = 0; k < 6; k++) {
          G.game.buildDungeon(5 + k * 7, biome);
          const w = G.world, m = w.map;
          const run = (x, y, dx, dy) => { let n = 1; for (let j = 1; j <= 3 && m.tile(x + dx * j, y + dy * j); j++) n++; for (let j = 1; j <= 3 && m.tile(x - dx * j, y - dy * j); j++) n++; return n; };
          const hall = (x, y) => run(x, y, 1, 0) <= 3 || run(x, y, 0, 1) <= 3;
          out.levels++;
          for (const p of w.props || []) {
            if (p.kind !== 'scatter' || p.throne) continue;
            const tx = Math.floor(p.x), ty = Math.floor(p.y);
            const blocks = !!m.block[ty * m.w + tx];
            out.props++; if (blocks) out.blocking++;
            if (hall(tx, ty)) { out.hallway++; if (blocks) out.hallwayBlocking++; }
          }
        }
      }
      return out;
    });
    const per = (n) => (n / res.levels).toFixed(1);
    console.log(`[${LABEL}] ${res.levels} levels across ${res.biomes.length} biomes`);
    console.log(`  props/level ${per(res.props)} | blocking/level ${per(res.blocking)} (${(100 * res.blocking / res.props).toFixed(0)}%) | in hallways/level ${per(res.hallway)} (blocking ${per(res.hallwayBlocking)})`);
    if (errs.length) console.log('errors:', errs.slice(0, 3));
  } finally {
    if (browser) await browser.close();
    srv.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });

