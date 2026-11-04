import { chromium } from 'playwright';

async function testLoadingScreenAndSpawn() {
  console.log('Testing Gothic Loading Screen & Player Spawn Deferral...');

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.VELSCOUR_TEST_MENU = true;
  });

  await page.goto('http://127.0.0.1:8124', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.VELSCOUR && !!window.LoadingScreen);

  // 1. Verify LoadingScreen UI elements exist in DOM
  const elementsCheck = await page.evaluate(() => {
    const el = document.getElementById('loading');
    const outerSigil = document.querySelector('.loading-sigil-outer');
    const innerSigil = document.querySelector('.loading-sigil-inner');
    const core = document.querySelector('.loading-sigil-core');
    const title = document.getElementById('loading-title');
    const sub = document.getElementById('loading-sub');
    const bar = document.getElementById('loading-bar');
    const fill = document.getElementById('loading-fill');
    const percent = document.getElementById('loading-percent');
    const text = document.getElementById('loading-text');
    const tip = document.getElementById('loading-tip-text');

    return {
      hasLoading: !!el,
      hasOuterSigil: !!outerSigil,
      hasInnerSigil: !!innerSigil,
      hasCore: !!core,
      hasTitle: !!title,
      hasSub: !!sub,
      hasBar: !!bar,
      hasFill: !!fill,
      hasPercent: !!percent,
      hasText: !!text,
      hasTip: !!tip
    };
  });

  console.log('1. Loading Screen DOM Structure:', elementsCheck);
  for (const [key, val] of Object.entries(elementsCheck)) {
    if (!val) throw new Error(`Missing expected loading element: ${key}`);
  }

  // 2. Test LoadingScreen API (show, setProgress, hide)
  console.log('2. Testing LoadingScreen show / setProgress / hide...');
  const apiCheck = await page.evaluate(async () => {
    const LS = window.LoadingScreen;
    LS.show({
      title: 'INTO THE ABYSS',
      subtitle: 'Depth 42',
      text: 'Forging dungeon geometry...',
      progress: 35
    });

    const titleText = document.getElementById('loading-title').textContent;
    const subText = document.getElementById('loading-sub').textContent;
    const pctText = document.getElementById('loading-percent').textContent;
    const fillWidth = document.getElementById('loading-fill').style.width;
    const isVisible = !document.getElementById('loading').classList.contains('hidden');
    const tipNotEmpty = !!document.getElementById('loading-tip-text').textContent.trim();

    LS.setProgress(72, 'Summoning fiends...');
    const pctText2 = document.getElementById('loading-percent').textContent;
    const fillWidth2 = document.getElementById('loading-fill').style.width;

    await LS.hide();
    const isHiddenAfter = document.getElementById('loading').classList.contains('hidden');

    return {
      titleText,
      subText,
      pctText,
      fillWidth,
      pctText2,
      fillWidth2,
      isVisible,
      tipNotEmpty,
      isHiddenAfter
    };
  });

  console.log('API check result:', apiCheck);
  if (apiCheck.titleText !== 'INTO THE ABYSS') throw new Error('Title text mismatch');
  if (apiCheck.pctText !== '35%') throw new Error('Progress percent 1 mismatch');
  if (apiCheck.pctText2 !== '72%') throw new Error('Progress percent 2 mismatch');
  if (!apiCheck.isVisible) throw new Error('Loading screen should be visible after show()');
  if (!apiCheck.tipNotEmpty) throw new Error('Tip text should not be empty');
  if (!apiCheck.isHiddenAfter) throw new Error('Loading screen should be hidden after hide()');

  // 3. Test In-Game Character Creation & Spawn Protection
  console.log('3. Starting a character and testing spawn state...');
  await page.evaluate(async () => {
    await window.VELSCOUR.game.newChar('barbarian', 'TestHero');
  });

  const heroSpawnedCheck = await page.evaluate(() => {
    const p = window.VELSCOUR.G.player;
    return {
      hasPlayer: !!p,
      spawned: p ? p.spawned : false,
      targetable: p ? p.targetable : false,
      alpha: p ? p.alpha : 0,
      invuln: p ? p.invuln : 0
    };
  });
  console.log('Player after town spawn:', heroSpawnedCheck);
  if (!heroSpawnedCheck.spawned) throw new Error('Hero should be spawned in town');
  if (heroSpawnedCheck.alpha !== 1) throw new Error('Hero alpha should be 1');

  // 4. Test Loading Protection during Dungeon Descent
  console.log('4. Testing spawn protection during descent...');
  const descentCheck = await page.evaluate(async () => {
    const G = window.VELSCOUR.G;
    const game = window.VELSCOUR.game;
    const LS = window.LoadingScreen;

    // Trigger loading state manually to inspect player protection
    LS.show({ title: 'DESCENT', subtitle: 'Depth 1' });
    const duringLoading = {
      isLoading: G.loading,
      playerSpawned: G.player.spawned,
      playerTargetable: G.player.targetable,
      playerAlpha: G.player.alpha,
      playerInvuln: G.player.invuln
    };

    // Now complete the hide & spawn sequence
    await LS.hide();
    game.spawnPlayer(G.world);

    const afterSpawn = {
      isLoading: G.loading,
      playerSpawned: G.player.spawned,
      playerTargetable: G.player.targetable,
      playerAlpha: G.player.alpha,
      playerInvuln: G.player.invuln
    };

    return { duringLoading, afterSpawn };
  });

  console.log('Descent protection check:', descentCheck);
  if (descentCheck.duringLoading.playerSpawned !== false) throw new Error('Player must be unspawned while loading');
  if (descentCheck.duringLoading.playerTargetable !== false) throw new Error('Player must be untargetable while loading');
  if (descentCheck.duringLoading.playerAlpha !== 0) throw new Error('Player alpha must be 0 while loading');
  if (descentCheck.duringLoading.playerInvuln < 1e8) throw new Error('Player must have invulnerability while loading');

  if (descentCheck.afterSpawn.playerSpawned !== true) throw new Error('Player must be spawned after loading');
  if (descentCheck.afterSpawn.playerTargetable !== true) throw new Error('Player must be targetable after spawn');
  if (descentCheck.afterSpawn.playerAlpha !== 1) throw new Error('Player alpha must be 1 after spawn');
  if (descentCheck.afterSpawn.playerInvuln < 1.0) throw new Error('Player must receive arrival invulnerability');

  // 5. Test Remote Player Loading Protection Sync
  console.log('5. Testing remote player loading protection sync...');
  const remoteSyncCheck = await page.evaluate(() => {
    const G = window.VELSCOUR.G;
    const p = G.player;
    // Test that unspawned / alpha 0 creature does not draw
    let drawCalls = 0;
    const mockCtx = new Proxy({}, {
      get: () => () => { drawCalls++; }
    });

    const origSpawned = p.spawned;
    const origAlpha = p.alpha;

    // When spawned = false, draw should return early immediately without calling ctx methods
    p.spawned = false;
    p.alpha = 0;
    p.draw(mockCtx);
    const unspawnedDrawCalls = drawCalls;

    // Restore
    p.spawned = origSpawned;
    p.alpha = origAlpha;

    return {
      unspawnedDrawCalls,
      suppressed: unspawnedDrawCalls === 0
    };
  });
  console.log('Rendering suppression check for unspawned player:', remoteSyncCheck);
  if (!remoteSyncCheck.suppressed) throw new Error('Unspawned player should suppress all draw calls');

  await browser.close();
  console.log('=== ALL LOADING SCREEN & SPAWN DEFERRAL TESTS PASSED! ===');
}

testLoadingScreenAndSpawn().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
