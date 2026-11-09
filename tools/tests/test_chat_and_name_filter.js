// Integration test: Chat and Name Filter against running server instance
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { WebSocket } = require('ws');

const PORT = 8155;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'velscour-filter-test-'));

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/version`);
      if (res.ok) return;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Server did not start in time');
}

async function runTests() {
  console.log('[Test] Starting server on port', PORT);
  const serverProc = spawn('node', ['server.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, PORT: String(PORT), VELSCOUR_DATA_DIR: tmpDataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProc.stderr.on('data', d => process.stderr.write(`[Server Error] ${d}`));

  try {
    await waitForServer(BASE_URL);
    console.log('[Test] Server online.');

    // 1. Test GET /api/online/check-name
    console.log('\n--- 1. Testing GET /api/online/check-name ---');
    const checkValid = await (await fetch(`${BASE_URL}/api/online/check-name?name=Sir_Galahad`)).json();
    console.log('Sir_Galahad check:', checkValid);
    assert(checkValid.available === true, 'Sir_Galahad should be available');

    const checkBad1 = await (await fetch(`${BASE_URL}/api/online/check-name?name=Bitch`)).json();
    console.log('Bitch check:', checkBad1);
    assert(checkBad1.available === false, 'Bitch should be unavailable');
    assert(checkBad1.error.includes('inappropriate') || checkBad1.error.includes('prohibited'), 'Error should mention inappropriate language');

    const checkBad2 = await (await fetch(`${BASE_URL}/api/online/check-name?name=Lord_Asshole`)).json();
    console.log('Lord_Asshole check:', checkBad2);
    assert(checkBad2.available === false, 'Lord_Asshole should be unavailable');

    const checkBad3 = await (await fetch(`${BASE_URL}/api/online/check-name?name=b1tch`)).json();
    console.log('b1tch check:', checkBad3);
    assert(checkBad3.available === false, 'b1tch should be unavailable');

    const checkInnocentSubstr = await (await fetch(`${BASE_URL}/api/online/check-name?name=Assassin`)).json();
    console.log('Assassin check:', checkInnocentSubstr);
    assert(checkInnocentSubstr.available === true, 'Assassin should be available');

    const checkFantasy = await (await fetch(`${BASE_URL}/api/online/check-name?name=Hellfire`)).json();
    console.log('Hellfire check:', checkFantasy);
    assert(checkFantasy.available === true, 'Hellfire should be available');

    // 2. Register account & test POST /api/online/characters
    console.log('\n--- 2. Testing POST /api/online/characters ---');
    const regRes = await (await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'filtertester@velscour.com', password: 'testPassword123!' }),
    })).json();
    assert(regRes.ok, 'Account registration should succeed');
    const token = regRes.token;

    // Try creating profane character
    const createBadRes = await fetch(`${BASE_URL}/api/online/characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'SuperBitch', classId: 'paladin' }),
    });
    const createBadData = await createBadRes.json();
    console.log('Create SuperBitch response status:', createBadRes.status, createBadData);
    assert(!createBadData.ok, 'Creating character with profane name should fail');
    assert(createBadRes.status === 400, 'Status should be 400 Bad Request');

    // Try creating valid character
    const createGoodRes = await fetch(`${BASE_URL}/api/online/characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'LordAuron', classId: 'paladin' }),
    });
    const createGoodData = await createGoodRes.json();
    console.log('Create LordAuron response:', createGoodData);
    assert(createGoodData.ok === true, 'Creating character with clean name should succeed');

    // 3. Test WebSocket Chat Censoring
    console.log('\n--- 3. Testing WebSocket Chat Censoring ---');
    const regRes2 = await (await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'filtertester2@velscour.com', password: 'testPassword123!' }),
    })).json();
    assert(regRes2.ok, 'Second account registration should succeed');
    const token2 = regRes2.token;

    await new Promise((resolve, reject) => {
      const wsUrl1 = `ws://127.0.0.1:${PORT}/ws?token=${token}`;
      const wsUrl2 = `ws://127.0.0.1:${PORT}/ws?token=${token2}`;
      const ws1 = new WebSocket(wsUrl1);
      const ws2 = new WebSocket(wsUrl2);

      let ws1Ready = false;
      let ws2Ready = false;

      function checkReady() {
        if (ws1Ready && ws2Ready) {
          ws1.send(JSON.stringify({ type: 'enter_lobby', charId: createGoodData.character.id, name: 'LordAuron', classId: 'paladin' }));
          ws2.send(JSON.stringify({ type: 'enter_lobby', charId: 'guest_char', name: 'AdventurerTwo', classId: 'sorceress' }));

          setTimeout(() => {
            // Send profane chat message from ws1
            console.log('[Test] Sending profane chat message: "What the fuck is this bullshit?"');
            ws1.send(JSON.stringify({
              type: 'chat',
              text: 'What the fuck is this bullshit?',
            }));
          }, 300);
        }
      }

      ws1.on('open', () => { ws1Ready = true; checkReady(); });
      ws2.on('open', () => { ws2Ready = true; checkReady(); });

      ws2.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'chat' && msg.kind === 'channel' && msg.from === 'LordAuron') {
            console.log('[Test] ws2 received chat:', msg);
            assert(msg.text.includes('What the **** is this ********?'), `Text should be censored. Got: "${msg.text}"`);

            // Now test whisper censoring
            console.log('[Test] Testing whisper censoring...');
            ws1.send(JSON.stringify({
              type: 'chat',
              text: '/w AdventurerTwo you are an asshole bitch',
            }));
          } else if (msg.type === 'chat' && msg.kind === 'whisper') {
            console.log('[Test] ws2 received whisper:', msg);
            assert(msg.text.includes('you are an ******* *****'), `Whisper text should be censored. Got: "${msg.text}"`);

            // Test room creation rejection for profane name
            console.log('[Test] Testing profane room creation rejection...');
            ws1.send(JSON.stringify({
              type: 'create_room',
              name: 'ShitShow',
              maxPlayers: 4,
            }));
          } else if (msg.type === 'room_error') {
            console.log('[Test] Received room error:', msg);
            assert(msg.message.includes('inappropriate'), 'Room error should cite inappropriate language');

            ws1.close();
            ws2.close();
            resolve();
          }
        } catch (e) {
          ws1.close();
          ws2.close();
          reject(e);
        }
      });

      // Also listen on ws1 for room_error
      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'room_error') {
          console.log('[Test] ws1 received room_error:', msg);
          assert(msg.message.includes('inappropriate'), 'Room error should cite inappropriate language');
          ws1.close();
          ws2.close();
          resolve();
        }
      });
    });

    console.log('\n=======================================');
    console.log('All chat and name filter tests PASSED!');
    console.log('=======================================');
  } finally {
    serverProc.kill('SIGTERM');
    try {
      fs.rmSync(tmpDataDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

runTests().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
