import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:8124';

async function runTest() {
  console.log('Testing Chat Lobby Tab /l auto-prepend and channel selection...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const testResult = await page.evaluate(async () => {
    const { GameChat } = await import('/src/ui/chat.js');
    GameChat.init();

    const input = document.getElementById('party-chat-input');
    const lobbyTab = document.querySelector('.gc-tab[data-tab="lobby"]');
    const partyTab = document.querySelector('.gc-tab[data-tab="party"]');

    // 1. Initial state
    const initialVal = input.value;
    const initialChan = GameChat.activeChannel;

    // 2. Click Lobby tab
    lobbyTab.click();
    const afterLobbyClickVal = input.value;
    const afterLobbyChan = GameChat.activeChannel;
    const afterLobbyLabel = document.getElementById('gc-channel-label')?.textContent;

    // 3. User types a message while in lobby tab without typing /l
    input.value = 'hello everyone in tavern';
    // Test submit handling
    let sentPayload = null;
    const originalSendChat = (await import('/src/net/network.js')).net.sendChat;
    (await import('/src/net/network.js')).net.sendChat = (payload) => {
      sentPayload = payload;
    };

    GameChat.submit();

    // 4. Click Party tab
    partyTab.click();
    const afterPartyClickVal = input.value;
    const afterPartyChan = GameChat.activeChannel;
    const afterPartyLabel = document.getElementById('gc-channel-label')?.textContent;

    // Restore net.sendChat
    (await import('/src/net/network.js')).net.sendChat = originalSendChat;

    return {
      initialVal,
      initialChan,
      afterLobbyClickVal,
      afterLobbyChan,
      afterLobbyLabel,
      sentPayload,
      afterPartyClickVal,
      afterPartyChan,
      afterPartyLabel,
    };
  });

  console.log('Lobby chat prepend test results:', testResult);

  if (testResult.afterLobbyClickVal !== '/l ') {
    throw new Error(`Expected input value to be '/l ', but got '${testResult.afterLobbyClickVal}'`);
  }
  if (testResult.afterLobbyChan !== 'lobby') {
    throw new Error(`Expected activeChannel to be 'lobby', but got '${testResult.afterLobbyChan}'`);
  }
  if (testResult.afterLobbyLabel !== 'Lobby') {
    throw new Error(`Expected channel label to be 'Lobby', but got '${testResult.afterLobbyLabel}'`);
  }
  if (testResult.sentPayload !== '/l hello everyone in tavern') {
    throw new Error(`Expected sent payload to start with '/l ', but got '${testResult.sentPayload}'`);
  }
  if (testResult.afterPartyChan !== 'party') {
    throw new Error(`Expected activeChannel to revert to 'party', but got '${testResult.afterPartyChan}'`);
  }
  if (testResult.afterPartyLabel !== 'Party') {
    throw new Error(`Expected channel label to revert to 'Party', but got '${testResult.afterPartyLabel}'`);
  }

  console.log('=== ALL LOBBY CHAT PREPEND TESTS PASSED! ===');
  await browser.close();
}

runTest().catch((err) => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
