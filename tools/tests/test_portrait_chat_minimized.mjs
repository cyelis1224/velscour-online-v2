// Test Portrait Chat Starts Out Minimized on Mobile
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.join(__dirname, 'out');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function run() {
  console.log('Testing Mobile Portrait Chat Initial Minimized State...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
  });

  const page = await context.newPage();
  await page.addInitScript(() => { window.DAGYR_TEST_MENU = true; });

  try {
    await page.goto('http://localhost:8124/index.html?touch=1&autostart=1', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => !!window.DAGYR && document.querySelector('#loading')?.classList.contains('hidden'), null, { timeout: 15000 });

    // 1. Enter game as a hero and start multiplayer game room to trigger GameChat.init() & GameChat.show()
    const initCheck = await page.evaluate(async () => {
      const { G, game } = window.DAGYR;
      const { newCharData } = await import('/src/game/save.js');
      const { GameChat } = await import('/src/ui/chat.js');

      G.char = newCharData('barbarian', 'PortraitChatBot');
      G.char.isOnline = true;
      const testRoom = {
        name: 'ChatTestRoom',
        seed: 12345,
        depth: 0,
        players: [{ id: 'mock-p1', name: 'PortraitChatBot' }]
      };

      game.startMultiplayerGame(G.char, testRoom);

      const chat = document.getElementById('game-chat');
      const toggle = document.getElementById('gc-btn-toggle');
      return {
        exists: !!chat,
        isMinimized: chat?.classList.contains('minimized'),
        toggleText: toggle?.textContent?.trim(),
        chatHeight: chat?.getBoundingClientRect().height,
      };
    });

    console.log('1. Direct startup in portrait check:', initCheck);
    if (!initCheck.exists) throw new Error('GameChat element does not exist!');
    if (!initCheck.isMinimized) throw new Error('GameChat did NOT start out minimized in portrait view!');
    if (initCheck.chatHeight > 45) throw new Error(`GameChat height should be ~34px, but got ${initCheck.chatHeight}`);
    if (initCheck.toggleText !== '▲') throw new Error(`GameChat toggle icon should be ▲, but got ${initCheck.toggleText}`);

    // Screenshot 1: Portrait chat minimized
    await page.screenshot({ path: path.join(outDir, 'chat_starts_minimized.png') });

    // 2. Expand chat
    await page.evaluate(() => {
      document.getElementById('gc-btn-toggle')?.click();
    });
    await page.waitForTimeout(350);

    const expandedCheck = await page.evaluate(() => {
      const chat = document.getElementById('game-chat');
      const toggle = document.getElementById('gc-btn-toggle');
      return {
        isMinimized: chat?.classList.contains('minimized'),
        toggleText: toggle?.textContent?.trim(),
        chatHeight: chat?.getBoundingClientRect().height,
      };
    });

    console.log('2. Expanded chat check:', expandedCheck);
    if (expandedCheck.isMinimized) throw new Error('GameChat failed to expand!');
    if (expandedCheck.chatHeight < 250) throw new Error(`Expanded chat height too small: ${expandedCheck.chatHeight}`);
    if (expandedCheck.toggleText !== '▼') throw new Error(`GameChat toggle icon should be ▼, but got ${expandedCheck.toggleText}`);

    // Screenshot 2: Portrait chat expanded
    await page.screenshot({ path: path.join(outDir, 'chat_expanded.png') });

    // 3. Test GameChat.show() re-call (e.g. zone change / room load)
    const reShowCheck = await page.evaluate(async () => {
      const { GameChat } = await import('/src/ui/chat.js');
      GameChat.show();
      const chat = document.getElementById('game-chat');
      const toggle = document.getElementById('gc-btn-toggle');
      return {
        isMinimized: chat?.classList.contains('minimized'),
        toggleText: toggle?.textContent?.trim(),
        chatHeight: chat?.getBoundingClientRect().height,
      };
    });

    console.log('3. GameChat.show() re-invocation check:', reShowCheck);
    if (!reShowCheck.isMinimized) throw new Error('GameChat.show() failed to minimize in portrait mobile!');

    // 4. Test rotating from landscape to portrait
    console.log('4. Testing rotation from landscape to portrait...');
    // Rotate to landscape
    await page.setViewportSize({ width: 915, height: 412 });
    await page.waitForTimeout(400);

    const landCheck = await page.evaluate(async () => {
      const { GameChat } = await import('/src/ui/chat.js');
      GameChat.updateMode();
      const chat = document.getElementById('game-chat');
      return {
        isLandscapeMobile: GameChat.isLandscapeMobile(),
        isPortraitMobile: GameChat.isPortraitMobile(),
      };
    });
    console.log('Landscape mode check:', landCheck);

    // Rotate back to portrait
    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForTimeout(400);

    const portRotateCheck = await page.evaluate(async () => {
      const { GameChat } = await import('/src/ui/chat.js');
      GameChat.updateMode();
      const chat = document.getElementById('game-chat');
      const toggle = document.getElementById('gc-btn-toggle');
      return {
        isPortraitMobile: GameChat.isPortraitMobile(),
        isMinimized: chat?.classList.contains('minimized'),
        toggleText: toggle?.textContent?.trim(),
        chatHeight: chat?.getBoundingClientRect().height,
      };
    });

    console.log('Rotate back to portrait check:', portRotateCheck);
    if (!portRotateCheck.isMinimized) throw new Error('GameChat did NOT minimize when rotating back to portrait!');
    if (portRotateCheck.chatHeight > 45) throw new Error(`GameChat height should be ~34px, but got ${portRotateCheck.chatHeight}`);

    console.log('=== ALL PORTRAIT CHAT MINIMIZE TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Test FAILED:', err);
  process.exit(1);
});

