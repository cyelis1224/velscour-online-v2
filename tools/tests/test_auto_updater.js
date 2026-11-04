const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8124';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, headers: res.headers, raw: data }); }
      });
    }).on('error', reject);
  });
}

function fetchHeaders(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'GET',
      headers,
    }, (res) => {
      let length = 0;
      res.on('data', chunk => length += chunk.length);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, length }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('--- Testing Auto-Updater & Differential Android OTA System ---');

  // 1. Verify /api/version
  console.log('1. Checking GET /api/version...');
  const verRes = await fetchJson(`${BASE_URL}/api/version`);
  if (verRes.status !== 200 || !verRes.body || !verRes.body.version || !verRes.body.manifestHash) {
    throw new Error(`Failed /api/version test. Status: ${verRes.status}`);
  }
  console.log('✓ /api/version response:', {
    version: verRes.body.version,
    manifestHash: verRes.body.manifestHash,
    totalFiles: verRes.body.totalFiles,
    inGameUpdateSupported: verRes.body.inGameUpdateSupported,
  });

  // 1b. Verify /api/update-manifest
  console.log('1b. Checking GET /api/update-manifest...');
  const manRes = await fetchJson(`${BASE_URL}/api/update-manifest`);
  if (manRes.status !== 200 || !manRes.body || !manRes.body.files || !manRes.body.manifestHash) {
    throw new Error(`Failed /api/update-manifest test. Status: ${manRes.status}`);
  }
  console.log('✓ /api/update-manifest verified:', {
    manifestHash: manRes.body.manifestHash,
    totalFiles: manRes.body.totalFiles,
    sampleEntry: manRes.body.files['src/ui/updater.js'],
  });

  // 2. Verify /download portal page
  console.log('2. Checking GET /download portal...');
  const portalRes = await fetchHeaders(`${BASE_URL}/download`);
  if (portalRes.status !== 200 || !portalRes.headers['content-type'].includes('text/html')) {
    throw new Error(`/download portal failed with status ${portalRes.status}`);
  }
  console.log('✓ /download portal returned 200 OK HTML');

  // 3. Launch browser to test In-Game Title Screen Update Button, Differential Android Patcher & Dialog
  console.log('3. Launching browser to test in-game Android differential updater UI...');
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();

    await page.addInitScript(() => {
      window.VELSCOUR_TEST_MENU = true;
      window.VELSCOUR_TEST_ANDROID = true;
      window.VELSCOUR_NO_RELOAD_ON_UPDATE = true;
    });
    await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));

    // A) Verify button is hidden when client is on latest version & manifest hash
    const initiallyHidden = await page.evaluate(() => {
      const btn = document.getElementById('title-update-btn');
      return !btn || btn.classList.contains('hidden') || window.getComputedStyle(btn).display === 'none';
    });
    console.log('✓ Title update button initially hidden when up to date:', initiallyHidden);
    if (!initiallyHidden) throw new Error('Update button should be hidden when client is on latest version');

    // B) Simulate update available
    console.log('Simulating update available...');
    await page.evaluate(async () => {
      window.VELSCOUR_TEST_UPDATE = true;
      const { checkForUpdates } = await import('/src/ui/updater.js');
      await checkForUpdates({ force: true });
    });

    await page.waitForSelector('#title-update-btn:not(.hidden)', { state: 'visible', timeout: 5000 });
    console.log('✓ Title update button revealed with update pulse animation');

    // C) Click update button to open dialog and verify Android Differential Patch calculation
    console.log('Clicking title update button...');
    await page.click('#title-update-btn');

    await page.waitForSelector('.update-dialog-content', { state: 'visible', timeout: 5000 });
    await page.waitForFunction(() => {
      const badge = document.getElementById('update-delta-badge');
      return badge && badge.innerText.includes('files');
    }, { timeout: 5000 });

    const modalInfo = await page.evaluate(() => {
      const modal = document.querySelector('.update-dialog-content');
      if (!modal) return null;
      const title = modal.querySelector('div[style*="font-family"]')?.innerText;
      const updateBtn = modal.querySelector('[data-update]');
      const apkBtn = modal.querySelector('[data-download-apk]');
      const deltaBadge = modal.querySelector('#update-delta-badge');
      return {
        title,
        hasUpdateBtn: !!updateBtn,
        updateBtnText: updateBtn ? updateBtn.innerText.trim() : null,
        hasApkFallbackBtn: !!apkBtn,
        deltaBadgeText: deltaBadge ? deltaBadge.innerText.trim() : null,
      };
    });

    console.log('✓ Velscour Android Differential Updater Modal verified:', modalInfo);
    if (!modalInfo || !modalInfo.hasUpdateBtn || !modalInfo.updateBtnText.includes('Update In-Game')) {
      throw new Error('Update dialog missing in-game update button');
    }

    // D) Trigger in-game differential file update and verify progress bar reaches 100%
    console.log('Clicking Update In-Game to download & verify differential files...');
    await page.click('.update-dialog-content [data-update]');

    await page.waitForFunction(() => {
      const pct = document.getElementById('update-progress-pct');
      return pct && pct.innerText.trim() === '100%';
    }, { timeout: 10000 });

    const progressState = await page.evaluate(() => {
      return {
        pct: document.getElementById('update-progress-pct')?.innerText.trim(),
        text: document.getElementById('update-progress-text')?.innerText.trim(),
        status: document.getElementById('update-action-status')?.innerText.trim(),
        savedLiveManifest: JSON.parse(localStorage.getItem('Velscour_live_updated_files') || 'null'),
      };
    });
    console.log('✓ In-game differential update completed:', {
      pct: progressState.pct,
      text: progressState.text,
      status: progressState.status,
      updatedFiles: Object.keys(progressState.savedLiveManifest?.files || {}),
    });

    // Close modal
    await page.click('.update-dialog-content [data-cancel]');
    await page.waitForSelector('.update-dialog-content', { state: 'detached', timeout: 5000 });
    console.log('✓ Modal dismissed successfully');

    // E) Test Settings Screen "Check for Updates"
    console.log('Testing Settings dialog updater row...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.title-menu button'));
      const settingsBtn = btns.find(b => b.innerText.includes('Settings'));
      if (settingsBtn) settingsBtn.click();
    });

    await page.waitForSelector('.settings-grid [data-check-update]', { state: 'visible', timeout: 5000 });
    const versionLabel = await page.evaluate(() => {
      const ub = document.querySelector('[data-check-update]');
      const container = ub?.parentElement;
      return container ? container.innerText.trim() : null;
    });
    console.log('✓ Settings version row verified:', versionLabel);

    console.log('ALL AUTO-UPDATER & DIFFERENTIAL ANDROID OTA TESTS PASSED!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
