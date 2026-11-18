// Automated E2E & API Verification for Title Screen, Online Account Registration/Login,
// Multi-Character per Class, Global Character Name Uniqueness, & Server vs Browser Storage
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8144;
const BASE_URL = `http://localhost:${PORT}`;
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
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
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dagyr-online-test-'));
  console.log('[Test] Using isolated server data dir:', tmpDataDir);

  const serverProc = spawn('node', ['server.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, PORT: String(PORT), VELSCOUR_DATA_DIR: tmpDataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let browser = null;
  try {
    await waitForServer(BASE_URL);
    console.log('[Test] Server started on', BASE_URL);

    browser = await chromium.launch({ headless: true, executablePath: CHROMIUM_PATH });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // 1. Load Title Screen & verify Single Player + Online buttons
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.title-screen', { timeout: 10000 });

    // Awaken title screen
    await page.evaluate(() => {
      const s = document.querySelector('.title-screen');
      if (s) s.classList.add('title-ready');
    });

    const menuButtons = await page.locator('.title-menu button').allTextContents();
    console.log('[Test] Title screen buttons:', menuButtons);
    assert(menuButtons.some(t => t.includes('Single Player')), 'Title screen should have Single Player option');
    assert(menuButtons.some(t => t.includes('Online')), 'Title screen should have Online option');
    assert(!menuButtons.some(t => t.startsWith('Continue')), 'Title screen should not have Continue option');
    assert(!menuButtons.some(t => t.startsWith('Heroes')), 'Title screen should not have Heroes option');

    // 2. Click Online -> Verify Login Panel opens
    await page.click('#title-online-btn');
    await page.waitForSelector('#online-auth-form', { timeout: 5000 });
    const authTitle = await page.textContent('#online-auth-title');
    assert(authTitle.includes('LOGIN'), 'Clicking Online should open the Account Login panel');

    // 3. Switch to Create Account (Register) and register with email
    await page.click('#online-tab-register');
    await page.fill('#online-auth-email', 'hero1@dagyr.com');
    await page.fill('#online-auth-password', 'secret123');
    await page.fill('#online-auth-confirm', 'secret123');
    await page.click('#online-auth-submit');

    // Should land on Online Character Roster screen
    await page.waitForSelector('.online-char-screen', { timeout: 5000 });
    const acctEmailText = await page.textContent('.online-account-email');
    assert(acctEmailText.includes('hero1@dagyr.com'), 'Roster should show logged-in account email');
    const countText0 = await page.textContent('#online-char-count');
    assert(countText0.includes('0 Heroes'), 'New account should start with 0 Heroes');

    // 4. Create first Paladin ("SirValen")
    await page.click('#online-create-char-btn');
    await page.waitForSelector('.online-create-screen', { timeout: 5000 });
    await page.fill('#online-char-name-input', 'SirValen');
    await page.waitForFunction(() => {
      const el = document.querySelector('#online-name-status');
      return el && el.textContent.includes('is available');
    }, { timeout: 5000 });

    await page.click('#online-confirm-create-btn');
    await page.waitForSelector('.online-char-screen', { timeout: 5000 });

    const charCards1 = await page.locator('.online-char-card').count();
    assert(charCards1 === 1, 'Account should now have 1 online character');

    // 5. Create a SECOND character of the SAME class (Paladin, "LordAuron")
    await page.click('#online-create-char-btn');
    await page.waitForSelector('.online-create-screen', { timeout: 5000 });
    // Ensure Paladin is selected and enter "LordAuron"
    await page.click('.online-create-screen .class-card[data-id="paladin"]');
    await page.fill('#online-char-name-input', 'LordAuron');
    await page.waitForFunction(() => {
      const el = document.querySelector('#online-name-status');
      return el && el.textContent.includes('is available');
    }, { timeout: 5000 });

    await page.click('#online-confirm-create-btn');
    await page.waitForSelector('.online-char-screen', { timeout: 5000 });

    const charCards2 = await page.locator('.online-char-card').count();
    assert(charCards2 === 2, 'Player should be able to have multiple characters of the same class (2 Paladins)');
    const rosterText = await page.locator('.online-char-grid').textContent();
    assert(rosterText.includes('SirValen') && rosterText.includes('LordAuron'), 'Both Paladins should be shown on the roster');
    console.log('[Test] Verified multiple characters of the same class on roster (SirValen & LordAuron)');

    // 6. Attempt to create a character with a duplicate name ("sirvalen" case-insensitive)
    await page.click('#online-create-char-btn');
    await page.waitForSelector('.online-create-screen', { timeout: 5000 });
    await page.fill('#online-char-name-input', 'sirvalen');
    await page.waitForFunction(() => {
      const el = document.querySelector('#online-name-status');
      return el && el.textContent.includes('already taken');
    }, { timeout: 5000 });

    // Also try clicking Create Character and ensure it stays blocked
    await page.click('#online-confirm-create-btn');
    await page.waitForTimeout(300);
    const stillOnCreate = await page.locator('.online-create-screen').count();
    assert(stillOnCreate === 1, 'Duplicate character name creation must be rejected');
    const statusErr = await page.textContent('#online-name-status');
    assert(statusErr.includes('already taken'), 'Status should report that character name is already taken');
    console.log('[Test] Verified duplicate character name is blocked');

    // Return to roster
    await page.click('#online-cancel-create-btn');
    await page.waitForSelector('.online-char-screen', { timeout: 5000 });

    // 7. Log out, register a second account (hero2@dagyr.com), and verify "SirValen" is also taken globally
    await page.click('#online-logout-btn');
    await page.waitForSelector('#online-auth-form', { timeout: 5000 });
    await page.click('#online-tab-register');
    await page.fill('#online-auth-email', 'hero2@dagyr.com');
    await page.fill('#online-auth-password', 'password2');
    await page.fill('#online-auth-confirm', 'password2');
    await page.click('#online-auth-submit');
    await page.waitForSelector('.online-char-screen', { timeout: 5000 });

    const hero2Cards = await page.locator('.online-char-card').count();
    assert(hero2Cards === 0, 'Second account should have its own separate character list (0 chars)');

    await page.click('#online-create-char-btn');
    await page.waitForSelector('.online-create-screen', { timeout: 5000 });
    await page.fill('#online-char-name-input', 'SirValen');
    await page.waitForFunction(() => {
      const el = document.querySelector('#online-name-status');
      return el && el.textContent.includes('already taken');
    }, { timeout: 5000 });
    console.log('[Test] Verified character name uniqueness across different accounts');

    // Cancel and log back into hero1@dagyr.com
    await page.click('#online-cancel-create-btn');
    await page.waitForSelector('.online-char-screen', { timeout: 5000 });
    await page.click('#online-logout-btn');
    await page.waitForSelector('#online-auth-form', { timeout: 5000 });
    await page.fill('#online-auth-email', 'hero1@dagyr.com');
    await page.fill('#online-auth-password', 'secret123');
    await page.click('#online-auth-submit');
    await page.waitForSelector('.online-char-screen', { timeout: 5000 });

    const hero1CardsAgain = await page.locator('.online-char-card').count();
    assert(hero1CardsAgain === 2, 'Logging back into hero1@dagyr.com should restore its 2 characters from server');

    // 8. Delete one character ("LordAuron") and verify deletion + name release
    await page.click('#online-delete-char-btn');
    await page.waitForSelector('.dialog-box', { timeout: 5000 });
    await page.click('.dialog-box button.red');
    await page.waitForFunction(() => document.querySelectorAll('.online-char-card').length === 1, { timeout: 5000 });

    const checkFreed = await (await fetch(`${BASE_URL}/api/online/check-name?name=LordAuron`)).json();
    assert(checkFreed.available === true, 'Deleted character name should be freed and available again');
    console.log('[Test] Verified character deletion and name release');

    // 8b. Enter Lobby with "SirValen" and verify it connects to velscour.dagyr.me:8124 (not old Velscour.dagyr.me:8123 lobby)
    await page.click('#online-enter-lobby-btn');
    await page.waitForSelector('#d2-lobby', { timeout: 10000 });
    await page.waitForFunction(() => {
      const sub = document.querySelector('#d2-channel-sub');
      return sub && sub.textContent.includes('velscour.dagyr.me:8124');
    }, { timeout: 8000 });
    console.log('[Test] Verified lobby targets velscour.dagyr.me:8124');

    // 8c. Verify uniform character body sizing in lobby pedestal regardless of weapon size
    const sizingCheck = await page.evaluate(async () => {
      const { savedGearPreview } = await import('/src/core/gearart.js');
      const noWeaponArt = await savedGearPreview('paladin', null, null, null, null);
      const spearArt = await savedGearPreview(
        'paladin',
        { slot: 'body', type: 'gear', base: 'Plate Armor', rarity: 3, ilvl: 20 },
        { slot: 'head', type: 'gear', base: 'Great Helm', rarity: 3, ilvl: 20 },
        { slot: 'weapon', type: 'gear', base: 'Polearm', rarity: 3, ilvl: 20 },
        { slot: 'offhand', type: 'gear', base: 'Tower Shield', rarity: 3, ilvl: 20 }
      );
      return {
        noWeaponW: noWeaponArt.width,
        noWeaponH: noWeaponArt.height,
        noWeaponBodyH: noWeaponArt._bodyH,
        spearW: spearArt.width,
        spearH: spearArt.height,
        spearBodyH: spearArt._bodyH,
      };
    });
    assert(sizingCheck.noWeaponBodyH === 432 && sizingCheck.spearBodyH === 432, 'Both bare hero and spear+shield hero must report identical _bodyH (432px) so weapon size never shrinks the character');
    assert(sizingCheck.spearH >= sizingCheck.noWeaponH && sizingCheck.spearW > sizingCheck.noWeaponW, 'Equipped weapon/shield art canvas extends beyond bare hero canvas without changing _bodyH');
    console.log('[Test] Verified uniform lobby pedestal character body sizing independent of weapon size');

    // 8d. Verify duplicate character login kicks the already-online session offline and signs in on the new connection
    const { WebSocket: NodeWS } = require('ws');
    const wsUrl = BASE_URL.replace(/^http/, 'ws') + '/ws';
    const openSock = () => new Promise((resolve, reject) => {
      const s = new NodeWS(wsUrl);
      s.msgs = [];
      s.on('message', d => { try { s.msgs.push(JSON.parse(d.toString())); } catch (e) { } });
      s.on('open', () => resolve(s));
      s.on('error', reject);
    });
    const waitFor = (s, pred, ms = 5000) => new Promise((resolve, reject) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const m = s.msgs.find(pred);
        if (m) { clearInterval(iv); resolve(m); }
        else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error('Timed out waiting for WS message')); }
      }, 50);
    });
    const enter = { type: 'enter_lobby', name: 'SirValen', charId: 'kick-test-char', classId: 'paladin', level: 1, gear: {} };
    const sockA = await openSock();
    const closedA = new Promise(r => sockA.on('close', (code) => r(code)));
    sockA.send(JSON.stringify(enter));
    await waitFor(sockA, m => m.type === 'lobby_welcome');
    const sockB = await openSock();
    sockB.send(JSON.stringify(enter));
    const kickMsg = await waitFor(sockA, m => m.type === 'session_kicked');
    const closeCode = await Promise.race([closedA, new Promise(r => setTimeout(() => r(null), 3000))]);
    const welcomeB = await waitFor(sockB, m => m.type === 'lobby_welcome');
    sockB.close();
    assert(kickMsg.charName === 'SirValen', 'First session should receive session_kicked for SirValen');
    assert(closeCode === 4001, 'First session socket should be closed with code 4001');
    assert(welcomeB.players.filter(p => p.name === 'SirValen').length === 1, 'New connection should own SirValen with no duplicate lobby entry');
    console.log('[Test] Verified duplicate character login kicks existing online session offline');

    // Leave lobby back to Online Character Roster
    await page.click('#d2-header-quit');
    await page.waitForSelector('.online-char-screen', { timeout: 5000 });

    // 9. Verify storage separation: online characters are on the server, while browser localStorage Velscour_saves_v1 is empty until Single Player is played
    const localSavesBeforeSP = await page.evaluate(() => localStorage.getItem('Velscour_saves_v1'));
    assert(!localSavesBeforeSP || localSavesBeforeSP === '[]', 'Online characters must not be written into browser Single Player localStorage');

    // Test Single Player flow from Title Screen
    await page.click('#online-roster-back-btn');
    await page.waitForSelector('.title-screen', { timeout: 5000 });
    await page.evaluate(() => {
      const s = document.querySelector('.title-screen');
      if (s) s.classList.add('title-ready');
    });
    await page.click('#title-singleplayer-btn');
    await page.waitForSelector('.class-screen:not(.online-char-screen)', { timeout: 5000 });
    await page.fill('.class-screen .name-input', 'SoloKnight');
    await page.click('.class-screen button.btn.big');

    // Wait for Single Player game to enter town and autosave to localStorage
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('Velscour_saves_v1');
      if (!raw) return false;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length === 1 && arr[0].name === 'SoloKnight';
    }, { timeout: 15000 });
    console.log('[Test] Verified Single Player saves to browser localStorage (Velscour_saves_v1) independently of Online server characters');

    // 10. Verify dedicated Talent Point system (+1 Talent Point every 5 levels, separate from Skill Points)
    const talentTestResult = await page.evaluate(async () => {
      const { G } = await import('/src/state.js');
      const { CLASS_TALENTS, canLearnTalent, learnTalent, respecTalents } = await import('/src/data/talents.js');
      const c = G.char;
      const p = G.player;
      const firstNode = CLASS_TALENTS[c.classId][0].nodes[0];

      const lv1State = {
        level: c.level,
        skillPoints: c.skillPoints,
        talentPoints: c.talentPoints,
        canLearnAtLv1: canLearnTalent(c, firstNode),
      };

      // Level up from 1 -> 4 (levels 2, 3, 4)
      p.levelUp();
      p.levelUp();
      p.levelUp();
      const lv4State = {
        level: c.level,
        skillPoints: c.skillPoints,
        talentPoints: c.talentPoints,
      };

      // Level up to 5 -> should award 1 talentPoint and 1 skillPoint
      p.levelUp();
      const lv5State = {
        level: c.level,
        skillPoints: c.skillPoints,
        talentPoints: c.talentPoints,
        canLearnAtLv5: canLearnTalent(c, firstNode),
      };

      // Spend the talent point -> should decrement talentPoints and leave skillPoints untouched
      const learned = learnTalent(c, firstNode.id);
      const afterSpend = {
        learned,
        skillPoints: c.skillPoints,
        talentPoints: c.talentPoints,
        rank: c.talents[firstNode.id] || 0,
      };

      // Level up 5 more times to level 10 -> should award 1 more talentPoint
      for (let i = 0; i < 5; i++) p.levelUp();
      const lv10State = {
        level: c.level,
        skillPoints: c.skillPoints,
        talentPoints: c.talentPoints,
      };

      // Respec talents -> should refund into talentPoints, not skillPoints
      const refunded = respecTalents(c);
      const afterRespec = {
        refunded,
        skillPoints: c.skillPoints,
        talentPoints: c.talentPoints,
      };

      return { lv1State, lv4State, lv5State, afterSpend, lv10State, afterRespec };
    });

    assert(talentTestResult.lv1State.level === 1 && talentTestResult.lv1State.skillPoints === 1 && talentTestResult.lv1State.talentPoints === 0, 'Lv1 starts with 1 skillPoint and 0 talentPoints');
    assert(talentTestResult.lv1State.canLearnAtLv1 === false, 'Lv1 cannot spend skillPoints on the talent tree');
    assert(talentTestResult.lv4State.level === 4 && talentTestResult.lv4State.skillPoints === 4 && talentTestResult.lv4State.talentPoints === 0, 'Lv4 has 4 skillPoints and 0 talentPoints');
    assert(talentTestResult.lv5State.level === 5 && talentTestResult.lv5State.skillPoints === 5 && talentTestResult.lv5State.talentPoints === 1 && talentTestResult.lv5State.canLearnAtLv5 === true, 'Lv5 awards +1 talentPoint and +1 skillPoint');
    assert(talentTestResult.afterSpend.learned === true && talentTestResult.afterSpend.talentPoints === 0 && talentTestResult.afterSpend.skillPoints === 5 && talentTestResult.afterSpend.rank === 1, 'Learning a talent spends 1 talentPoint and keeps skillPoints untouched');
    assert(talentTestResult.lv10State.level === 10 && talentTestResult.lv10State.skillPoints === 10 && talentTestResult.lv10State.talentPoints === 1, 'Lv10 awards another +1 talentPoint');
    assert(talentTestResult.afterRespec.refunded === 1 && talentTestResult.afterRespec.talentPoints === 2 && talentTestResult.afterRespec.skillPoints === 10, 'Respeccing talents refunds into talentPoints, not skillPoints');
    console.log('[Test] Verified dedicated Talent Point system (+1 every 5 levels, separate from Skill Points)');

    console.log('ALL TESTS PASSED!');
  } finally {
    if (browser) await browser.close();
    serverProc.kill('SIGTERM');
    try {
      fs.rmSync(tmpDataDir, { recursive: true, force: true });
    } catch (e) { }
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
