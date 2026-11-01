// E2E: desktop in-game chat docks in the pickup log's (#log) spot, hides #log while visible,
// has a pushpin instead of minimize, and fades translucent -> gone after 5 s idle.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8145;
const BASE_URL = `http://localhost:${PORT}`;
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${url}/api/version`);
      if (r.ok) return;
    } catch (e) { }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Server did not start in time');
}

(async () => {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dagyr-chat-test-'));
  const serverProc = spawn('node', ['server.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, PORT: String(PORT), DAGYR_DATA_DIR: tmpDataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser = null;
  try {
    await waitForServer(BASE_URL);
    browser = await chromium.launch({ headless: true, executablePath: CHROMIUM_PATH });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    page.on('pageerror', e => console.error('[pageerror]', e.message));

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.title-screen', { timeout: 10000 });
    await page.evaluate(() => document.querySelector('.title-screen')?.classList.add('title-ready'));
    await page.click('#title-singleplayer-btn');
    await page.waitForSelector('.class-screen', { timeout: 5000 });
    await page.fill('.class-screen .name-input', 'ChatTester');
    await page.click('.class-screen button.btn.big');
    await page.waitForFunction(() => window.GameChat !== undefined || true);
    await page.waitForTimeout(2500);

    // Bring up the chat as if in an online room, with a short fade delay for testing
    const st = () => page.evaluate(() => {
      const c = document.getElementById('game-chat');
      const log = document.getElementById('log');
      const cs = getComputedStyle(c);
      return {
        cls: c.className,
        opacity: parseFloat(cs.opacity),
        visibility: cs.visibility,
        logVisibility: getComputedStyle(log).visibility,
        chatRect: c.getBoundingClientRect().toJSON(),
        logRect: log.getBoundingClientRect().toJSON(),
        toggleTitle: document.getElementById('gc-btn-toggle').title,
      };
    });

    await page.evaluate(async () => {
      const { GameChat } = await import('/src/ui/chat.js');
      localStorage.removeItem('Dagyr_chat_pinned');
      GameChat.init();
      GameChat.isPinned = false;
      GameChat.FADE_DELAY_MS = 1200;
      GameChat.show();
    });
    await page.waitForTimeout(1000);

    let s = await st();
    assert(s.cls.includes('gc-desktop'), 'Chat is in desktop docked mode');
    assert(s.cls.includes('gc-faded') && s.visibility === 'hidden', 'Chat starts faded out on desktop (unpinned)');
    assert(s.logVisibility === 'visible', 'Pickup log visible while chat faded');
    assert(Math.abs(s.chatRect.left - s.logRect.left) < 2 && Math.abs(s.chatRect.bottom - s.logRect.bottom) < 2 && Math.abs(s.chatRect.width - s.logRect.width) < 2,
      `Chat docks in exact #log spot (chat ${JSON.stringify(s.chatRect)} vs log ${JSON.stringify(s.logRect)})`);
    assert(s.toggleTitle.includes('Pin'), 'Toggle button is a pushpin on desktop');

    // Open the chat with Enter
    await page.mouse.move(900, 200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    s = await st();
    assert(!s.cls.includes('gc-faded') && s.opacity === 1, 'Enter opens chat fully');
    assert(s.logVisibility === 'hidden', 'Pickup log hidden while chat open');

    // Minimize must be impossible on desktop
    await page.evaluate(async () => { const { GameChat } = await import('/src/ui/chat.js'); GameChat.toggleMinimize(true); });
    s = await st();
    assert(!s.cls.includes('minimized'), 'Chat cannot be minimized on desktop');

    // Close with Escape -> translucent, then gone after delay
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    s = await st();
    assert(s.cls.includes('gc-fading') && s.opacity < 0.6 && s.opacity > 0.2, `Closed chat is translucent (opacity ${s.opacity})`);
    assert(s.logVisibility === 'hidden', 'Pickup log still hidden during translucent phase');
    await page.waitForTimeout(2000);
    s = await st();
    assert(s.cls.includes('gc-faded') && s.visibility === 'hidden', 'Chat fully faded after idle delay');
    assert(s.logVisibility === 'visible', 'Pickup log returns after chat fades');

    // Hover during translucent phase keeps it alive
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const r = (await st()).chatRect;
    await page.mouse.move(r.left + r.width / 2, r.top + r.height / 2);
    await page.waitForTimeout(2000);
    s = await st();
    assert(!s.cls.includes('gc-faded') && s.opacity === 1, 'Hovering keeps chat visible');
    await page.mouse.move(900, 200);
    await page.waitForTimeout(2500);
    s = await st();
    assert(s.cls.includes('gc-faded'), 'Leaving hover lets chat fade out again');

    // Pushpin keeps it open indefinitely
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.click('#gc-btn-toggle');
    await page.mouse.move(900, 200);
    await page.waitForTimeout(2500);
    s = await st();
    assert(s.cls.includes('gc-pinned') && !s.cls.includes('gc-faded') && !s.cls.includes('gc-fading') && s.opacity === 1, 'Pinned chat stays fully visible');
    assert(s.logVisibility === 'hidden', 'Pickup log hidden while pinned chat visible');
    const pinnedStored = await page.evaluate(() => localStorage.getItem('Dagyr_chat_pinned'));
    assert(pinnedStored === '1', 'Pin state persisted');

    // Unpin -> fades
    await page.click('#gc-btn-toggle');
    await page.mouse.move(900, 200);
    await page.waitForTimeout(2500);
    s = await st();
    assert(s.cls.includes('gc-faded') && s.logVisibility === 'visible', 'Unpinned chat fades and log returns');

    console.log('ALL DESKTOP CHAT DOCK TESTS PASSED!');
  } finally {
    if (browser) await browser.close();
    serverProc.kill('SIGTERM');
    try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch (e) { }
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

