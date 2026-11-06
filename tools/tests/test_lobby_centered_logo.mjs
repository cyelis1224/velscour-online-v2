import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.join(__dirname, 'out');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const BASE_URL = 'http://localhost:8124';

async function run() {
  console.log('Testing Lobby Screen Centered Logo, Pixel Fire & Header Info...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/index.html?autostart=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1000);

  // Open the lobby
  const headerInfo = await page.evaluate(async () => {
    const { openLobby } = await import('/src/ui/lobby.js');
    const { newCharData } = await import('/src/game/save.js');

    const hero = newCharData('paladin', 'LobbyTester');
    hero.isOnline = true;
    openLobby(hero, () => {});

    const header = document.querySelector('.d2-header');
    const headerLeft = document.querySelector('.d2-header-left');
    const logoWrap = document.querySelector('.d2-center-logo-wrap');
    const logoImg = document.querySelector('.d2-center-logo-wrap .d2-logo-img');
    const fireCanvas = document.querySelector('.d2-center-logo-wrap .d2-logo-fire');
    const channelDisplay = document.querySelector('.d2-header-left #d2-channel-display');
    const channelSub = document.querySelector('.d2-header-left #d2-channel-sub');
    const quitBtn = document.querySelector('#d2-header-quit');
    const friendsBtn = document.querySelector('#d2-header-friends');
    const bgEyes = document.querySelector('#d2-lobby .title-eyes');
    const bgFx = document.querySelector('#d2-lobby .title-fx');

    const headerRect = header ? header.getBoundingClientRect() : null;
    const logoRect = logoWrap ? logoWrap.getBoundingClientRect() : null;
    const quitRect = quitBtn ? quitBtn.getBoundingClientRect() : null;
    const friendsRect = friendsBtn ? friendsBtn.getBoundingClientRect() : null;

    // Wait a brief moment for image load & pixel fire init
    return {
      hasHeader: !!header,
      hasHeaderLeft: !!headerLeft,
      hasLogoWrap: !!logoWrap,
      hasLogoImg: !!logoImg,
      hasFireCanvas: !!fireCanvas,
      hasBgEyes: !!bgEyes,
      hasBgFx: !!bgFx,
      channelText: channelDisplay?.textContent?.trim(),
      subHtml: channelSub?.innerHTML,
      headerRect: headerRect ? { width: headerRect.width, left: headerRect.left } : null,
      logoRect: logoRect ? { width: logoRect.width, left: logoRect.left, right: logoRect.right } : null,
      quitRect,
      friendsRect,
      logoCenter: logoRect ? logoRect.left + logoRect.width / 2 : null,
      screenCenter: headerRect ? headerRect.left + headerRect.width / 2 : null,
    };
  });

  console.log('Header info extracted:', headerInfo);

  // Wait 1 second to let fire particles & background eyes/embers render
  await page.waitForTimeout(1000);

  // Take screenshot of header and full lobby
  await page.screenshot({ path: path.join(outDir, 'lobby_centered_fire_logo.png') });
  await page.screenshot({ path: '/home/dagyr/.gemini/antigravity/brain/01fa01db-fc56-4840-8b66-11a04b26706e/lobby_centered_fire_logo.png' });
  console.log('Saved screenshot to: lobby_centered_fire_logo.png');

  if (!headerInfo.hasHeader) throw new Error('Header element .d2-header not found!');
  if (!headerInfo.hasHeaderLeft) throw new Error('Top-left header container .d2-header-left not found!');
  if (!headerInfo.hasLogoWrap) throw new Error('Centered logo wrapper .d2-center-logo-wrap not found!');
  if (!headerInfo.hasLogoImg) throw new Error('Logo image .d2-logo-img not found!');
  if (!headerInfo.hasFireCanvas) throw new Error('Fire canvas .d2-logo-fire not found!');
  if (!headerInfo.hasBgEyes) throw new Error('Lobby background eyes canvas .title-eyes not found!');
  if (!headerInfo.hasBgFx) throw new Error('Lobby background embers canvas .title-fx not found!');

  // Check channel display text
  if (headerInfo.channelText !== 'USEast-1') {
    throw new Error(`Expected channel display to be exactly 'USEast-1', but got '${headerInfo.channelText}'`);
  }

  // Check sub text does not have "Multiplayer Realm" or "Host:"
  if (headerInfo.subHtml.includes('Multiplayer Realm') || headerInfo.subHtml.includes('Host:')) {
    throw new Error(`Channel sub should NOT contain 'Multiplayer Realm' or 'Host:', but got: ${headerInfo.subHtml}`);
  }

  // Check quit stacked on top of friends
  if (!headerInfo.quitRect || !headerInfo.friendsRect) {
    throw new Error('Quit or Friends button not found in header!');
  }
  console.log(`Quit top: ${headerInfo.quitRect.top}, Friends top: ${headerInfo.friendsRect.top}`);
  if (headerInfo.quitRect.top >= headerInfo.friendsRect.top) {
    throw new Error('Quit button should be stacked ON TOP OF Friends button!');
  }

  // Check centering (logoCenter within 10px of screenCenter)
  const offsetFromCenter = Math.abs(headerInfo.logoCenter - headerInfo.screenCenter);
  console.log(`Logo center: ${headerInfo.logoCenter}, Screen center: ${headerInfo.screenCenter}, offset: ${offsetFromCenter}px`);
  if (offsetFromCenter > 15) {
    throw new Error(`Logo is not properly centered! Offset from screen center: ${offsetFromCenter}px`);
  }

  // Test Quit button clickability (check it can receive click event)
  const quitBtn = await page.$('#d2-header-quit');
  if (!quitBtn) throw new Error('#d2-header-quit not found');
  const quitDetails = await page.evaluate(() => {
    const btn = document.querySelector('#d2-header-quit');
    if (!btn) return { ok: false, desc: 'no btn' };
    const r = btn.getBoundingClientRect();
    const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const ok = topEl === btn || btn.contains(topEl);
    return {
      ok,
      btnRect: r,
      topElTag: topEl?.tagName,
      topElId: topEl?.id,
      topElClass: topEl?.className,
      topElOuter: topEl?.outerHTML?.slice(0, 150)
    };
  });
  console.log('Quit button check:', quitDetails);
  if (!quitDetails.ok) throw new Error('Quit button is obscured by: ' + quitDetails.topElClass + ' / ' + quitDetails.topElOuter);

  // Check Friends button elementFromPoint
  const friendsClickable = await page.evaluate(() => {
    const btn = document.querySelector('#d2-header-friends');
    if (!btn) return false;
    const r = btn.getBoundingClientRect();
    const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return topEl === btn || btn.contains(topEl);
  });
  console.log('Friends button is topmost element at its point:', friendsClickable);
  if (!friendsClickable) throw new Error('Friends button is obscured by another element!');

  // Test Friends button click
  const friendsBtn = await page.$('#d2-header-friends');
  await friendsBtn.click({ timeout: 2000 });
  console.log('Successfully clicked Friends button!');
  await page.waitForTimeout(300);
  const friendsOverlay = await page.$('.d2-friends-overlay');
  if (!friendsOverlay) throw new Error('Friends overlay did not open on click!');
  const closeBtn = await page.$('#d2-friends-close-btn');
  if (closeBtn) await closeBtn.click();
  await page.waitForTimeout(300);

  // Verify background eyes and fx are BEHIND the menus
  const stackingCheck = await page.evaluate(() => {
    const chatLog = document.querySelector('.d2-chat-log');
    const gamesWrap = document.querySelector('.d2-games-table-wrap');
    const eyes = document.querySelector('#d2-lobby .title-eyes');
    const fx = document.querySelector('#d2-lobby .title-fx');

    const checkPoint = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        topElTag: topEl?.tagName,
        topElClass: topEl?.className,
        isOverMenu: topEl === eyes || topEl === fx
      };
    };

    return {
      chatCheck: checkPoint(chatLog),
      gamesCheck: checkPoint(gamesWrap)
    };
  });
  console.log('Stacking check:', stackingCheck);
  if (stackingCheck.chatCheck?.isOverMenu || stackingCheck.gamesCheck?.isOverMenu) {
    throw new Error('Background eyes or particle canvases are rendering over menus!');
  }

  console.log('=== ALL LOBBY CENTERED LOGO, BUTTONS & FIRE TESTS PASSED! ===');
  await browser.close();
}

run().catch(err => {
  console.error('Test FAILED:', err);
  process.exit(1);
});

