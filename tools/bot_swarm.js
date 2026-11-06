#!/usr/bin/env node
/**
 * Velscour Online - Multi-Bot Swarm & Server Stress Tester
 *
 * Spawns 34 bots total (exactly 2 bots for each of the 17 playable classes)
 * with randomized levels (5-60) and fully rolled gear (weapons, armor, rings).
 *
 * Dispersal:
 *  - Even dispersal with natural variance between Lobby bots (~16-18) and Game bots (~16-18).
 *  - Game bots create multiple rooms (2-4 players each) and join each other to auto-play.
 *  - Lobby bots stay in the lobby, chatting and clicking the gem.
 *
 * Usage:
 *   node tools/bot_swarm.js [options]
 *   npm run bots
 *   npm run bots:headed
 *
 * Options:
 *   --per-class <n>  Bots per class (default: 2, total = 17 * 2 = 34 bots)
 *   --server <url>   Server URL (default: http://localhost:8124)
 *   --headed         Launch visible Chromium windows (default: headless)
 *   --duration <sec> Auto-stop after N seconds (default: 0 = run indefinitely)
 *   --help           Show help
 */

const { chromium } = require('playwright');
const fs = require('fs');

// ---------------------------------------------------------------- All 17 Classes
const ALL_CLASSES = [
  'paladin',          'ranger',
  'wizard',           'necromancer',
  'barbarian',        'dragoon',
  'totem_master',     'death_knight',
  'arcane_sorcerer',  'carrion_witch',
  'bard',             'slime_lord',
  'boomerang_knight', 'lancer',
  'dragon_knight',    'gunner',
  'monk'
];

// ---------------------------------------------------------------- CLI Argument Parsing
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}
const hasFlag = (flag) => args.includes(flag);

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
Velscour Online - Multi-Bot Swarm & Stress Tester

Usage:
  node tools/bot_swarm.js [options]

Options:
  --per-class <n>   Bots per class (default: 2 -> 34 bots total across all 17 classes)
  --server <url>    Server URL (default: http://localhost:8124)
  --headed          Launch visible Chromium windows (default: headless)
  --duration <sec>  Auto-stop after N seconds (default: 0 = run indefinitely until Ctrl+C)
  --help            Show this help screen
`);
  process.exit(0);
}

const BOTS_PER_CLASS = Math.max(1, parseInt(getArg('--per-class', '2'), 10));
const SERVER_URL = getArg('--server', 'http://localhost:8124').replace(/\/+$/, '');
const HEADED = hasFlag('--headed');
const DURATION_SEC = parseInt(getArg('--duration', '0'), 10);

const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

// ---------------------------------------------------------------- Fantasy Name & Chat Pools
const BOT_NAMES = [
  'Valerius', 'Morrigan', 'Balthazar', 'Seraphina', 'Kaelen', 'Vaelin', 'Isolde', 'Drakon',
  'Thorne', 'Elira', 'Zephyrus', 'Rowan', 'Ignis', 'Cassian', 'Lyra', 'Garrick',
  'Tiberius', 'Sylvia', 'Fenris', 'Brann', 'Vespera', 'Aethelred', 'Morgana', 'Corvus',
  'Caelum', 'Elowen', 'Althea', 'Roland', 'Sariel', 'Xander', 'Gwen', 'Merrick',
  'Darius', 'Maeve', 'Finnick', 'Leona', 'Torin', 'Astrid', 'Varek', 'Nyx',
  'Bram', 'Evander', 'Kaelith', 'Theron', 'Selene', 'Orion', 'Eldrin', 'Kallisto',
  'Alden', 'Beren', 'Caspian', 'Dorian', 'Faelan', 'Gideon', 'Hadrian', 'Ilyas',
  'Jareth', 'Korin', 'Lorcan', 'Malakor', 'Nazir', 'Oren', 'Perrin', 'Rhydian',
  'Soren', 'Talon', 'Ulric', 'Varis', 'Wyn', 'Yvaine', 'Zarek', 'Alaric', 'Vance'
];

const ROOM_NAME_PREFIXES = [
  'Catacombs', 'IronMire', 'Barrow', 'AbyssalCrypt', 'DarkKeep', 'RiftGate', 'BoneHollow', 'HellForge',
  'DuneRift', 'DragonLair', 'AlpinePeak', 'SeaSpire'
];

const LOBBY_CHAT_PHRASES = [
  'Anyone down for a Catacombs run?',
  'LF2M breach floor 12+ need bard or healer',
  'Selling [Grand Crusader Plate] with 3 sockets, whisper offers',
  'Just found a legendary ring in the Mines!',
  'Need 1 DPS for boss rush',
  'Watch out for the butcher in depth 4...',
  'Anyone have spare amethyst or ruby gems?',
  'gg on that last boss, that quake attack almost got us',
  'brb grabbing health and mana potions from town',
  'Looking for an active party for deep depths',
  'What is the best talent build for necromancer right now?',
  'Need help with the skeleton lord if anyone is free',
  'USEast ping looking smooth today',
  'Trading fury potions for mana crystals',
  'Don’t stand in the poison pools on depth 2!',
  'Who is holding the hearthstone?',
  'Can a paladin buff us before the rift?',
  'This dungeon layout is wild today',
  'Heading down to depth 10, wish me luck!',
  'Finally completed my 4-piece armor set',
  'Is the travelling merchant in town right now?',
  'The plucked lute music in Bellmourn is so good',
  'That was a close one, barely drank my rejuv pot in time',
  'Selling high tier spears and shields',
  'Anyone running Heresies tonight?'
];

const PARTY_CHAT_PHRASES = [
  "I've got the flank!",
  'Focus the champion first!',
  'Watch out for the ground hazard!',
  'Downed another wave of skeletons!',
  'Mana is holding up, pushing forward!',
  'Check that chest over there!',
  'Found the exit portal for this floor.',
  'Nice teamwork everyone!',
  'Healing up with a potion.',
  'Deeper we go!',
  'Elite pack dead, grab the loot!',
  'Keep up, portal is unsealed!'
];

// Helpers
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randi = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Unique Name Allocator
const usedNames = new Set();
function getUniqueName() {
  for (let tries = 0; tries < 200; tries++) {
    const candidate = pick(BOT_NAMES);
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }
  const fallback = pick(BOT_NAMES) + '_' + randi(10, 99);
  usedNames.add(fallback);
  return fallback;
}

// ---------------------------------------------------------------- Swarm Engine
class BotSwarm {
  constructor() {
    this.browser = null;
    this.lobbyBots = [];
    this.gameBots = [];
    this.rooms = [];
    this.running = true;
    this.startTime = Date.now();
  }

  async init() {
    const totalBots = ALL_CLASSES.length * BOTS_PER_CLASS;
    console.log('\n============================================================');
    console.log('       🗡️  VELSCOUR ONLINE - MULTI-BOT SWARM & STRESS TEST ⚔️');
    console.log('============================================================');
    console.log(` Target Server : ${SERVER_URL}`);
    console.log(` Total Classes : ${ALL_CLASSES.length} unique classes`);
    console.log(` Bots Per Class: ${BOTS_PER_CLASS} (${totalBots} total bots)`);
    console.log(` Mode          : ${HEADED ? 'Headed (visible windows)' : 'Headless (ultra-lightweight)'}`);
    if (DURATION_SEC > 0) console.log(` Auto-Stop     : ${DURATION_SEC}s`);
    else console.log(' Auto-Stop     : Indefinite (Press Ctrl+C to stop)');
    console.log('============================================================\n');

    // Launch single high-performance Chromium process
    const launchArgs = [
      '--mute-audio',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--no-sandbox',
    ];
    this.browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: !HEADED,
      args: launchArgs,
    });

    // Graceful cleanup handler
    const shutdown = async () => {
      if (!this.running) return;
      this.running = false;
      console.log('\n[Swarm] Gracefully disconnecting all 34 bots and shutting down...');
      try {
        if (this.browser) await this.browser.close();
      } catch (e) {}
      console.log('[Swarm] All bot sessions cleanly closed. Server stress test finished.\n');
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // 1. Prepare Bot Roster: 2 of each class = 34 bots
    const botRoster = [];
    for (const classId of ALL_CLASSES) {
      for (let i = 0; i < BOTS_PER_CLASS; i++) {
        botRoster.push({
          name: getUniqueName(),
          classId,
          level: randi(10, 60),
        });
      }
    }

    // Shuffle roster
    const shuffledRoster = shuffle(botRoster);

    // 2. Dispersal: pretty even but not exact (~16-18 game, ~16-18 lobby)
    const targetGameCount = Math.floor(totalBots / 2) + randi(-1, 2);
    const gameRoster = shuffledRoster.slice(0, targetGameCount);
    const lobbyRoster = shuffledRoster.slice(targetGameCount);

    console.log(`[Swarm] Dispersal Plan: ${lobbyRoster.length} Lobby Bots, ${gameRoster.length} Game Bots across multiple rooms.`);

    // 3. Boot Lobby Bots
    await this.bootLobbyBots(lobbyRoster);

    // 4. Boot Game Bots across multiple rooms
    await this.bootGameBots(gameRoster);

    // 5. Start background activity & telemetry loops
    this.startLobbyChatLoop();
    this.startGameChatLoop();
    this.startDashboardMonitor();

    if (DURATION_SEC > 0) {
      console.log(`[Swarm] All bots deployed. Running stress test for ${DURATION_SEC}s...`);
      setTimeout(() => {
        console.log(`\n[Swarm] Reached test duration limit of ${DURATION_SEC}s.`);
        shutdown();
      }, DURATION_SEC * 1000);
    }
  }

  async createBotPage(name, classId, level) {
    const context = await this.browser.newContext({
      viewport: { width: 480, height: 320 }, // Minimal viewport for low RAM usage
    });
    const page = await context.newPage();

    page.on('pageerror', (err) => {
      // Suppress minor WebGL or detach warnings
      if (!err.message.includes('WebGL') && !err.message.includes('detached')) {
        // console.error(`[${name} Error]`, err.message);
      }
    });

    const parsedServer = new URL(SERVER_URL).host;
    await page.goto(`${SERVER_URL}/?server=${parsedServer}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.title-screen', { timeout: 25000 });

    // Initialize character and open lobby
    const charSummary = await page.evaluate(async ({ name, classId, level }) => {
      const { newCharData } = await import('/src/game/save.js');
      const { openLobby } = await import('/src/ui/lobby.js');
      const { rollItem } = await import('/src/data/items.js');
      const { CLASSES } = await import('/src/data/classes.js');
      const { net } = await import('/src/net/network.js');
      const { G } = await import('/src/state.js');

      // Guarantee Auto does not prompt dialogs in town
      G.autoDest = 'standard';
      window.VELSCOUR_TEST_MENU = true;

      const c = newCharData(classId, name);
      c.level = level;
      c.id = 'bot-' + name.toLowerCase();

      // Allocate stats based on class archetype
      const C = CLASSES[classId] || {};
      const statBudget = (level - 1) * 5;
      if (C.base) {
        if (C.base.str >= C.base.dex && C.base.str >= C.base.int) {
          c.attrs.str += Math.floor(statBudget * 0.5);
          c.attrs.vit += Math.floor(statBudget * 0.3);
          c.attrs.dex += Math.floor(statBudget * 0.2);
        } else if (C.base.dex >= C.base.int) {
          c.attrs.dex += Math.floor(statBudget * 0.5);
          c.attrs.vit += Math.floor(statBudget * 0.3);
          c.attrs.str += Math.floor(statBudget * 0.2);
        } else {
          c.attrs.int += Math.floor(statBudget * 0.5);
          c.attrs.vit += Math.floor(statBudget * 0.3);
          c.attrs.dex += Math.floor(statBudget * 0.2);
        }
      }

      // Roll complete set of gear with balanced rarities (magic, rare, epic, legendary)
      const r = () => Math.min(4, Math.floor(Math.random() * 3) + 1);
      if (C.weapon) c.equip.weapon = rollItem(level, { slot: 'weapon', base: C.weapon, rarity: r() });
      if (C.offhand) c.equip.offhand = rollItem(level, { slot: 'offhand', base: C.offhand, rarity: r() });
      c.equip.head = rollItem(level, { slot: 'head', rarity: r() });
      c.equip.body = rollItem(level, { slot: 'body', rarity: r() });
      c.equip.hands = rollItem(level, { slot: 'hands', rarity: r() });
      c.equip.legs = rollItem(level, { slot: 'legs', rarity: r() });
      c.equip.feet = rollItem(level, { slot: 'feet', rarity: r() });
      c.equip.ring1 = rollItem(level, { slot: 'ring', rarity: r() });
      c.equip.ring2 = rollItem(level, { slot: 'ring', rarity: r() });

      // Potions
      c.potions = { hp: 12, mp: 8, rejuv: 4, fury: 4 };

      // Transition to lobby
      document.querySelector('.title-screen')?.remove();
      openLobby(c, () => {});

      // Wait for socket connection
      for (let i = 0; i < 70; i++) {
        if (net.connected && net.myId) break;
        await new Promise((res) => setTimeout(res, 100));
      }

      return {
        name: c.name,
        classId: c.classId,
        className: C.name || classId,
        level: c.level,
        weapon: c.equip.weapon?.baseName || 'Weapon',
        connected: net.connected,
      };
    }, { name, classId, level });

    return { page, charSummary };
  }

  async bootLobbyBots(roster) {
    console.log(`\n[Swarm] Booting ${roster.length} Lobby Chatter Bots...`);

    for (let i = 0; i < roster.length; i++) {
      const { name, classId, level } = roster[i];

      try {
        const { page, charSummary } = await this.createBotPage(name, classId, level);
        this.lobbyBots.push({
          name,
          classId,
          className: charSummary.className,
          level,
          page,
          lastChat: Date.now() + randi(1000, 6000),
        });
        console.log(`  ✓ [Lobby Bot ${i + 1}/${roster.length}] ${name} (Lvl ${level} ${charSummary.className}) connected`);
      } catch (err) {
        console.error(`  ✗ [Lobby Bot ${i + 1}] Failed to connect:`, err.message);
      }

      // Small stagger to prevent socket stampede
      await new Promise((r) => setTimeout(r, 200));
    }
    console.log(`[Swarm] ${this.lobbyBots.length} Lobby Bots active.\n`);
  }

  async bootGameBots(roster) {
    console.log(`[Swarm] Booting ${roster.length} Game Bots across rooms (2-4 players each)...`);

    // Divide roster into rooms of 2 to 4 players
    const roomGroups = [];
    let rem = [...roster];
    while (rem.length > 0) {
      // Pick room size: 3-4 players, or remaining if <= 4
      const size = rem.length <= 4 ? rem.length : (rem.length === 5 ? 3 : randi(3, 4));
      roomGroups.push(rem.slice(0, size));
      rem = rem.slice(size);
    }

    for (let r = 0; r < roomGroups.length; r++) {
      const group = roomGroups[r];
      const roomName = `${pick(ROOM_NAME_PREFIXES)}_${randi(10, 99)}`;
      const roomBots = [];

      console.log(`\n--- Setting up Room ${r + 1}/${roomGroups.length}: "${roomName}" (${group.length} players) ---`);

      for (let p = 0; p < group.length; p++) {
        const isHost = (p === 0);
        const { name, classId, level } = group[p];

        try {
          const { page, charSummary } = await this.createBotPage(name, classId, level);
          const botObj = {
            name,
            classId,
            className: charSummary.className,
            level,
            page,
            isHost,
            roomName,
            status: 'Initializing',
          };
          this.gameBots.push(botObj);
          roomBots.push(botObj);

          if (isHost) {
            console.log(`  👑 [Host] ${name} (Lvl ${level} ${charSummary.className}) creating room "${roomName}"...`);
            await page.evaluate(async ({ roomName, level }) => {
              const { net } = await import('/src/net/network.js');
              net.createRoom({
                name: roomName,
                depth: Math.max(1, Math.min(10, Math.floor(level / 5))),
                maxPlayers: 4,
              });
            }, { roomName, level });

            await page.waitForFunction(async () => {
              const { G } = await import('/src/state.js');
              return G.mode === 'game' && G.world && G.player && document.getElementById('loading').classList.contains('hidden');
            }, null, { timeout: 25000 });
            console.log(`     ✓ Host ${name} entered game world!`);
          } else {
            console.log(`  ⚔️  [Joiner] ${name} (Lvl ${level} ${charSummary.className}) joining room "${roomName}"...`);
            await page.evaluate(async ({ roomName }) => {
              const { net } = await import('/src/net/network.js');
              net.joinRoom(roomName);
            }, { roomName });

            await page.waitForFunction(async () => {
              const { G } = await import('/src/state.js');
              return G.mode === 'game' && G.world && G.player && document.getElementById('loading').classList.contains('hidden');
            }, null, { timeout: 25000 });
            console.log(`     ✓ Joiner ${name} joined game world!`);
          }
        } catch (err) {
          console.error(`     ✗ Failed to setup bot in room:`, err.message);
        }

        // Small stagger
        await new Promise((r) => setTimeout(r, 200));
      }

      // Descend all party members into Dungeon and turn on Auto-Play
      if (roomBots.length > 0) {
        console.log(`  🚪 Descending all heroes in "${roomName}" into the Dungeon and enabling Auto-Play...`);

        for (const bot of roomBots) {
          try {
            await bot.page.evaluate(async () => {
              const { G } = await import('/src/state.js');
              const { Auto } = await import('/src/game/autoplay.js');

              G.autoDest = 'standard';

              // If in town, plunge directly into the dungeon depth
              if (G.world && G.world.kind === 'town') {
                G.game.enterDungeon();
              }

              // Turn on Auto mode
              Auto.toggle(true);
            });
            console.log(`     ✓ ${bot.name} is running in Auto mode!`);
          } catch (err) {
            console.error(`     ✗ Error enabling autoplay for ${bot.name}:`, err.message);
          }
        }
      }

      this.rooms.push({ roomName, bots: roomBots });
    }

    console.log(`\n[Swarm] All ${this.gameBots.length} Game Bots active in ${this.rooms.length} room(s).\n`);
  }

  startLobbyChatLoop() {
    if (this.lobbyBots.length === 0) return;

    const tick = async () => {
      if (!this.running) return;

      try {
        const bot = pick(this.lobbyBots);
        if (bot && bot.page && !bot.page.isClosed()) {
          // Occasionally click gem
          if (Math.random() < 0.12) {
            await bot.page.evaluate(async () => {
              const { net } = await import('/src/net/network.js');
              net.clickGem();
            }).catch(() => {});
            console.log(`💎 [LOBBY GEM] ${bot.name} touched the chat gem!`);
          } else {
            const msg = pick(LOBBY_CHAT_PHRASES);
            await bot.page.evaluate(async (text) => {
              const { net } = await import('/src/net/network.js');
              net.sendChat(text);
            }, msg).catch(() => {});
            const timeStr = new Date().toLocaleTimeString();
            console.log(`💬 [LOBBY ${timeStr}] ${bot.name} (Lvl ${bot.level} ${bot.className}): "${msg}"`);
          }
        }
      } catch (err) {}

      // Fast, lively chat intervals for 34-bot stress test (3-6s)
      const nextDelay = randi(3000, 6000);
      setTimeout(tick, nextDelay);
    };

    setTimeout(tick, 2000);
  }

  startGameChatLoop() {
    if (this.gameBots.length === 0) return;

    const tick = async () => {
      if (!this.running) return;

      try {
        const bot = pick(this.gameBots);
        if (bot && bot.page && !bot.page.isClosed()) {
          const phrase = pick(PARTY_CHAT_PHRASES);
          await bot.page.evaluate(async (text) => {
            const { net } = await import('/src/net/network.js');
            net.sendPartyChat(text);
          }, phrase).catch(() => {});
          const timeStr = new Date().toLocaleTimeString();
          console.log(`⚔️  [PARTY ${timeStr} | ${bot.roomName}] ${bot.name} (Lvl ${bot.level} ${bot.className}): "${phrase}"`);
        }
      } catch (err) {}

      // Party chat interval (8-16s)
      const nextDelay = randi(8000, 16000);
      setTimeout(tick, nextDelay);
    };

    setTimeout(tick, 5000);
  }

  startDashboardMonitor() {
    setInterval(async () => {
      if (!this.running || this.gameBots.length === 0) return;

      console.log('\n================== 📊 SWARM LIVE TELEMETRY ==================');
      console.log(` Active Lobby Bots: ${this.lobbyBots.length} | Active Game Bots: ${this.gameBots.length} | Rooms: ${this.rooms.length}`);
      console.log('-------------------------------------------------------------');

      for (const bot of this.gameBots) {
        if (!bot.page || bot.page.isClosed()) continue;

        try {
          const stats = await bot.page.evaluate(async () => {
            const { G } = await import('/src/state.js');
            const { Auto } = await import('/src/game/autoplay.js');
            if (!G || !G.player || !G.world) return null;

            // Resilience: Always keep auto-play engaged without modal prompts
            G.autoDest = 'standard';
            if (!G.autoplayOn) {
              Auto.toggle(true);
            }

            // If bot respawned in town or late-joined, plunge into dungeon
            if (G.world.kind === 'town') {
              G.game.enterDungeon();
            }

            return {
              hp: `${Math.round(G.player.hp)}/${Math.round(G.player.maxHp)}`,
              depth: G.world.depth ?? 0,
              biome: G.world.biome?.id || G.world.kind,
              status: Auto.status || 'Fighting',
              kills: G.char?.kills || 0,
              pos: `(${G.player.x.toFixed(0)}, ${G.player.y.toFixed(0)})`,
            };
          });

          if (stats) {
            console.log(
              `  [${bot.roomName.padEnd(14)}] ${bot.name.padEnd(12)} (${(bot.className + ' ' + bot.level).padEnd(16)}) | HP: ${stats.hp.padEnd(10)} | Depth ${stats.depth} (${stats.biome.padEnd(10)}) | ${stats.status}`
            );
          }
        } catch (e) {}
      }
      console.log('=============================================================\n');
    }, 15000);
  }
}

// ---------------------------------------------------------------- Main Entry Point
(async () => {
  try {
    const swarm = new BotSwarm();
    await swarm.init();
  } catch (err) {
    console.error('Fatal error running bot swarm:', err);
    process.exit(1);
  }
})();
