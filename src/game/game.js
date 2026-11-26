// Game flow: characters, town, dungeon depths, death, victory.
import { G } from '../state.js';
import { input } from '../core/input.js';
import { camera } from '../core/view.js';
import { sfx, playMusic, stopMusic, setAmbience, stopAmbience, footsteps } from '../core/audio.js';
import { rand, pick, randi, escapeHtml, dist, dist2, RNG, makeCanvas, fmtInt, swapKey, hexToRgb, clamp, shuffle, chance } from '../core/util.js';
import { biomeTileSet, loadBiomeArt, mixedTileSet, keepTileSets } from '../core/assets.js';
import { loadArtFor, loadEnemySheets, enemyImage, markArtCaches, trimArtCaches } from '../core/enemyart.js';
import { findMimicSpawn } from './mimic.mjs';
import { loadClassArt } from '../core/classart.js';
import { preloadSkillSheets } from '../ui/icons.js';
import { loadGearArt } from '../core/gearart.js';
import { loadHeld } from '../gfx/heldart.js';
import { preloadBarFx } from '../gfx/artfx.js';
import { SKILLS } from '../data/skills.js';
import { setClassItems, setRingContext, SEAL_GAP, shownEquip } from '../data/items.js';
import { BREACH_BIOME, BREACH_WALLS } from '../data/biomes.js';
import { BIOMES, BETA_BIOMES, BIOME_BY_ID, TOWN_BIOME, ACT2_TOWN_BIOME, drawBiome, biomeChoices, biomesForDepth, takeBiome, mixPartner, recordBiomeVisit } from '../data/biomes.js';
import { CLASSES } from '../data/classes.js';
import { generateDungeon, isRaidDepth } from '../world/dungeon.js';
import { FINAL_DEPTH, depthLevel, blockStart, isSuperbossDepth, superbossForDepth, getActForDepth, ACTS } from '../data/depth.js';
import { addDefiance, clearDefiance, defianceText, tickBlessing } from './defiance.js';
import { DUNGEON_AFFIX_BY_ID, DUNGEON_AFFIX_CONFIG, rollDungeonAffixesForDepth, normalizeDungeonAffixIds, applyDungeonAffix } from '../data/dungeonaffixes.js';
import { rollTreasureChest } from '../data/treasurechests.js';
import { setupHappenings, announceDungeonAffixes, happeningsTick, eventImpsTick, townHappening, townTick, recordDepth, markNemesis } from './happenings.js';
import { setupWorldObjects, worldObjectsTick, clearWorldObjectBuffs } from './worldobjects.js';
import { setupDungeonEvent, dungeonEventTick } from './dungeonevents.js';
import { resolveLevelCheatName } from './velscourcheats.js';
import { EXTRA_AFFIX_HAZARDS } from './affixcatalogruntime.js';
import { greedOf, greedPacks, greedWorld, greedCleared, greedDeath } from './greed.js';
import { spectateTick } from './spectate.js';
import { toggleSmite, getUltimate, executeUltimate } from './smite.js';
import { hearthTick, useHearth, hearthPortalActive, closeHearthPortals, getActiveHearth, returnFromHearth } from './hearth.js';
import { generateTown, makeTownTiles, rollTownWeather } from '../world/town.js';
import { generateAct2Town, makeAct2TownTiles, ACT2_TOWN_NAME } from '../world/act2town.js';
import { createArenaWorld } from '../world/arena.js';
import { generateOverworld } from '../world/overworld.js';
import { createOverworldScenario } from './overworld.js';
import { addWanderers } from './wanderers.js';
import { createSeaOfSandScenario } from './seaofsand.js';
import { loadSeaOfSandPack, releaseSeaOfSandPack } from '../gfx/seaofsand.js';
import { createDarkForestRun } from './darkforest.js';
import { generateDarkForest } from '../world/darkforest.js';
import { loadDarkForestTrees } from '../gfx/darkforest.js';
import { generateBreach } from '../world/breach.js';
import { createBreachRun, chestAt, breachMonster } from './breach.js';
import { breachDepth, breachLevel, BREACH_ART, BREACH_ARCHS, wyrmVariant, breachCycle, MAX_BREACH_FLOOR } from '../data/breach.js';
import { useAlpine } from './alpine.js';
import { castle3dTick } from './castle3d.js';
import { useTerrain, terrainOf } from '../gfx/terrain.js';
import { generateTower } from '../world/tower.js';
import { createTowerRun, useTower } from './tower.js';
import { loadTower3D, tower3dReady } from '../gfx/tower3d.js';
import { generateCaverns, CAVE_VARIANTS } from '../world/caverns.js';
import { createCaveRun, useCaverns } from './caverns.js';
import { loadCave3D, cave3dReady } from '../gfx/cave3d.js';
import { generateDunes } from '../world/dunes.js';
import { createDuneRun, useDunes } from './dunes.js';
import { loadDunes3D, dunes3dReady } from '../gfx/dunes3d.js';
import { DUNE_VARIANTS } from '../data/dunes.js';
import { buildCustomScenarioWorld, fetchScenarioDoc, resolvePublishedScenarioForDepth, listSkullScenarios } from '../world/customscenario.js';
import { loadCastlePack, releaseCastlePack } from '../gfx/castle.js';
import { loadCastle3D, releaseCastle3D, loadBaked, castle3dState, warmBaked } from '../gfx/castle3dart.js';
import { CASTLE_VARIANTS } from '../data/castles.js';
import { addCastleStory } from './castlestory.js';
import { generateSkyship } from '../world/skyship.js';
import { warmSky } from '../gfx/skyship.js';
import { createSkyBattle } from './skybattle.js';
import { SKY_ALL } from '../data/skybattle.js';
import { generateSeaship } from '../world/seaship.js';
import { createSeaBattle, useSea, pickSeaVariant } from './seabattle.js';
import { loadFleet, sea3dReady } from '../gfx/seabattle3d.js';
import { SEA_VARIANTS } from '../data/seabattle.js';
import { TOWNSFOLK } from '../data/townsfolk.js';
const TOWNSFOLK_KNIGHTS = TOWNSFOLK.filter((q) => q.knight).map((q) => q.spriteId);
import { Cine, CINE_FAST } from './cinema.js';
import { lights, updateVfx } from '../gfx/vfx.js';
import { World } from './world.js';
import { Player } from './player.js';
import { makeMonster, makeElite, Monster } from './monster.js';
import { clearRims } from './creature.js';
import { Delayed, Area, Projectile } from './hazards.js';
import { applyTrait, rollTrait, ambushTick, madnessTick, unleashMadness, enter } from './mayhem.js';
import { hit, kill } from './combat.js';
import { makeRaidBoss, RAID_BOSSES } from './raid.js';
import { dropChest, GroundItem } from './loot.js';
import { renderWorld, drawMinimap, preloadTownSheets, releaseTownSheets, propReach } from './render.js';
import { controls } from './controls.js';
import { Auto } from './autoplay.js';
import { writeSave, newCharData, migrate } from './save.js';
import { grantDeathGift, DEATH_PHRASE } from './deathgift.js';
import { clearVfx, floatText, sparkle, addEffect, Ring, Bolt, Column } from '../gfx/vfx.js';
import { Meter } from './dpsmeter.js';
import { UI } from '../ui/ui.js';
import { initTrade } from '../ui/trade.js';
import { initDuel, DuelManager } from './duel.js';
import { HUD } from '../ui/hud.js';
import { TouchUI } from '../ui/touch.js';
import { Vendor } from '../ui/vendor.js';
import { Stash } from '../ui/stash.js';
import { JewelBox } from '../ui/jewelbox.js';
import { startTownLife } from './townlife.js';
import { toggleInventory, toggleCharacter } from '../ui/inventory.js';
import { toggleTree, toggleBook } from '../ui/skills.js';
import { toggleFriends } from '../ui/friends.js';
import { toggleTalents } from '../ui/talents.js';
import { toggleQuest } from '../ui/quest.js';
import { setupVelscour } from './velscour.js';
import { loadVelscourThrone } from '../gfx/velscourthrone.js';
import { offerCommissions, setupCommissions, commissionClear, wantedBiomes, LINE_BY_ID, commState } from './commissions.js';
import { titleScreen, onlineCharSelectScreen, hide as hideScreen, deathScreen, victoryScreen, pauseMenu, helpDialog } from '../ui/screens.js';
import { openLobby } from '../ui/lobby.js';
import { net, serializeShownGear, gearSignature } from '../net/network.js';
import { saveOnlineCharacter, flushOnlineSave, flushOnlineSaveUnload } from '../net/online.js';
import { RemotePlayer } from '../net/remoteplayer.js';
import { updateAutomapPartyRoster } from '../ui/partyroster.js';
import { GameChat } from '../ui/chat.js';
import { LoadingScreen } from '../ui/loading.js';
// the Endgame (docs/ENDGAME.md): Heresies, Abyssal Rifts, Velscour Unbound, Infernal Marks
import { endgameUnlocked, unlockEndgame, endgame, adoptEndgame } from './endgame.js';
import { heresySpawns, heresyWorld, heresyBegin, heresyTick, heresiesOf, heresyRank, worldRank, MARKS_RANK } from './heresies.js';
import { createRiftRun, riftTick, riftOpen, riftDepth, riftLevel, fmtTime, riftLeave, activatePylon, riftDeathPenalty, RIFT_QUOTA, RIFT_DENSITY } from './rifts.js';
import { PYLONS } from '../data/rifts.js';
import { unboundReady, spendKeys, keysOf, canEnterUnbound, spendUnboundKey, unboundWaypoints, MAX_UNBOUND_DEPTH, isUnboundCheckpointFloor, unboundDepth } from './unbound.js';
import { grantMarks, saveMarkXp } from './marks.js';
import { Heresies } from '../ui/heresies.js';
import { Rifts } from '../ui/rifts.js';
import { Marks } from '../ui/marks.js';
import { MacrosUI } from '../ui/macros.js';
import { REGIONS, regionOf, parseRegionWord, regionNeeds, rollRegionVariant, findVariant } from './regions.js';
import './regions/index.js';
import { Macros } from './macros.js';
import { buildKeep, keepArrive, KEEP_BIOME } from './keepgame.js';
import { warmKeepHeroes } from './keepfolk.js';
import { keepgateSpot } from '../gfx/keepgate.js';
import { keepClear, keepDeath, keepState } from './keep.js';
import { releaseKeepArt, KEEP_DIR } from '../gfx/keepart.js';
import { KEEP_NAME } from '../data/keep.js';

const PICK_WAIT = 8; // seconds auto-play gives the player to choose a portal down (portalChoice)

const STEP_SURFACE = { sunken: 'water', plague: 'water', sewers: 'water', serpent: 'water', library: 'wood', gilded: 'wood', sea_of_sand: 'sand', dark_forest: 'wood', skyship: 'wood', pirate_seas: 'wood', mountainside: 'dirt' };   // footstep sounds; default stone

const VELSCOUR_TAUNT_STARTS = [
  'WHY ARE YOU TRYING TO CONTACT VELSCOUR', 'WHAT MADE YOU THINK VELSCOUR WANTS TO HEAR FROM YOU',
  'DID YOU REALLY EXPECT VELSCOUR TO ANSWER', 'WHO TOLD YOU VELSCOUR TAKES MESSAGES',
  'IS THIS HOW YOU PLAN TO CHALLENGE VELSCOUR', 'DO YOU HAVE A DEATH WISH OR JUST POOR MANNERS',
  'WHY SUMMON A DEMON LORD WHEN YOU CAN BOTHER ANYONE ELSE', 'DID THE GRAVEYARD RECOMMEND THIS CONTACT METHOD',
  'ARE YOU LOST OR JUST COMMITTED TO MAKING THINGS WORSE', 'WHAT PART OF DOOM DID YOU MISTAKE FOR CUSTOMER SERVICE',
  'DO YOU THINK HELL HAS A RECEPTION DESK', 'HOW MANY BAD DECISIONS FIT IN ONE SHORT MESSAGE',
  'ARE YOU TRYING TO NEGOTIATE WITH THE END OF YOU', 'DID YOUR COMMON SENSE DIE BEFORE YOU GOT HERE',
  'WHAT COULD POSSIBLY GO WRONG THIS TIME', 'WHY ASK THE ABYSS TO NOTICE YOU',
  'IS THIS BRAVERY OR A VERY SPECIFIC KIND OF STUPID', 'DID YOU THINK THE DEMON LORD WAS BETWEEN APPOINTMENTS',
];
const VELSCOUR_TAUNT_ENDS = [
  'He is busy polishing the thing that will end your adventure.', 'The abyss has a strict no refunds policy.',
  'Your courage is adorable. Your odds are not.', 'Hell called; it said to stop making it awkward.',
  'Please leave a message after the screaming.', 'The last visitor left as a cautionary stain.',
  'He read your aura and marked it spam.', 'Your odds are somewhere beneath the floor.',
  'This conversation may be recorded for the inquest.', 'Even the skeletons are embarrassed for you.',
  'Your message will be delivered by a very nervous imp.', 'There is no safe word in the terms of service.',
  'Somewhere, a lich just sighed at your decision.', 'The abyss knows your name and still declined.',
  'This is why the dead keep their phones on silent.', 'Try again when your survival instinct returns.',
  'Your next of kin may appreciate the initiative.',
];
const VELSCOUR_TAUNTS = VELSCOUR_TAUNT_STARTS.flatMap((start) => VELSCOUR_TAUNT_ENDS.map((end) => `${start}? ${end}`));

let townCache = null, townTiles = null;
let act2TownCache = null, act2TownTiles = null;
let saveT = 0;
let automapCanvas = null;

// Give the loading overlay a couple of paint opportunities before expensive synchronous setup begins.
function yieldForLoadingPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && !document.hidden) {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    } else setTimeout(resolve, 0);
  });
}

// Build the level's monster sprites (palette swap, hit flash, corpse shade) behind the loading screen: each swap reads
// pixels back from the GPU, and doing that on a monster's first hit or death stalled the frame (worst on phones).
// Yields every ~40 ms so the loading screen keeps painting (not while hidden: a hidden page's chained timers can wait a minute).
async function warmLevelArt(w) {
  const seen = new Set();
  if (w.map.hgt) terrainOf(w.map); // a height map's draw order and occluders (the Castle's 100k columns): behind the loading screen, not the first frame
  warmSky(w); // the Sky Battle's clouds
  if (w.seaState && w.seaState.warm) w.seaState.warm(); // the Pirate Seas' Lampwardens (recoloured townsfolk sheets)
  if (w.map.c3struct || w.sky) warmBaked(G.ctx); // the baked 3D pages (the Castle's masonry, the airships)
  let t = performance.now();
  markArtCaches();
  if (w.chests?.some((chest) => chest.chestType === 'mimic')) {
    await loadEnemySheets(['special/mimic']).catch(() => {});
    if (G.world !== w) return;
    const key = 'chest_mimic|' + swapKey(null);
    seen.add(key);
    if (enemyImage('chest_mimic')) { enemyImage('chest_mimic', null, 'flash'); enemyImage('chest_mimic', null, 'dark'); }
  }
  for (const c of w.creatures) {
    if (!c.art || G.world !== w) continue;
    const k = c.art + '|' + swapKey(c.swap);
    if (seen.has(k)) continue;
    seen.add(k);
    if (enemyImage(c.art, c.swap)) { enemyImage(c.art, c.swap, 'flash'); enemyImage(c.art, c.swap, 'dark'); }
    if (performance.now() - t > 40 && !document.hidden) { await new Promise((r) => setTimeout(r, 0)); t = performance.now(); }
  }
  // and the looks the level has chosen for what arrives later (waves, ambushes, summons), so their first frame
  // doesn't build them
  for (const l of (w.looks && w.looks.all ? w.looks.all() : [])) {
    if (!l || !l.art || G.world !== w) continue;
    const k = l.art + '|' + swapKey(l.swap);
    if (seen.has(k)) continue;
    seen.add(k);
    if (enemyImage(l.art, l.swap)) { enemyImage(l.art, l.swap, 'flash'); enemyImage(l.art, l.swap, 'dark'); }
    if (performance.now() - t > 40 && !document.hidden) { await new Promise((r) => setTimeout(r, 0)); t = performance.now(); }
  }
  // what earlier levels built and this one never asked for goes (a long run carried every level's sprites)
  if (G.world === w) { trimArtCaches(); clearRims(); }
}

// Let go of the art the level being built doesn't use: the Castle (~120 MB decoded) and Sea of Sand packs,
// townsfolk sheets. Called by the level-entry flows once the new level's art is in (never on the way through town:
// a hero going back to the same biome keeps its pack); buildDungeon alone keeps everything, for tests and tools.
// A run through many biomes kept all of it, plus every level's monster sprites, rims and silhouettes (~590 MB of
// images and canvases after 30 levels, ~290 MB now). Everything reloads from the HTTP cache when needed.
// (The painted biome packs stay: there are only a few, and fetching one again decoded a second copy while the
// browser still held the first, which cost more renderer memory than it saved.)
function releaseLevelArt(biome) {
  if (biome?.id !== 'castle' && !regionOf(biome)?.castleArt) releaseCastlePack(); // (a region drawn with its masonry keeps it)
  if (biome?.id !== 'castle' && biome?.id !== 'skyship') releaseCastle3D();
  releaseKeepArt(); // Tessariel's Keep's decor, and its hold on the baked hall (left by the Waygate)
  if (biome?.id !== 'sea_of_sand') releaseSeaOfSandPack(); // loadArtFor fetches it again for ss_ monsters elsewhere
  if (!biome?.overworld && biome?.id !== 'town') releaseTownSheets();
}

let hudCine = false;
let netSyncT = 0;
let monSyncT = 0;
/** A world during a cut scene: the scene's actors (leaps, scripted walks), townsfolk, effects and the director move;
 * nobody fights and nobody takes input. */
function cineTick(w, dt) {
  w.time += dt;
  lights.length = 0;
  for (const c of w.creatures) {
    if (c.dead) continue;
    if (c.entering) c.update(dt);
    else if (c.spawnT < 1) c.spawnT += dt;
  }
  for (const n of w.npcs) n.update && n.update(dt);
  if (w.overworldScenario) w.overworldScenario.update(dt);
  updateVfx(dt, w);
}

export const isSharedMonsterIdx = (idx) => typeof idx === 'number' && idx > 0 && idx < 2000;
export const isValidKilledId = (id) => (typeof id === 'string' && id.length > 0) || isSharedMonsterIdx(id);

export function recordKilledMonster(depth, netId, idx, world = G.world) {
  const validNetId = typeof netId === 'string' && netId.length > 0 ? netId : null;
  const validIdx = isSharedMonsterIdx(idx) ? idx : (isSharedMonsterIdx(netId) ? netId : null);
  if (!validNetId && validIdx == null) return;
  if (G.room && depth > 0) {
    if (!G.room.killedMonsters) G.room.killedMonsters = new Map();
    let set = G.room.killedMonsters.get(depth);
    if (!set) { set = new Set(); G.room.killedMonsters.set(depth, set); }
    if (validNetId) set.add(validNetId);
    if (validIdx != null) set.add(validIdx);
  }
  if (world && world.kind === 'dungeon' && world.depth === depth) {
    if (!world.killedMonsterIds) world.killedMonsterIds = new Set();
    if (validNetId) world.killedMonsterIds.add(validNetId);
    if (validIdx != null) world.killedMonsterIds.add(validIdx);
  }
}

export function isMonsterKilled(world, depth, netId, idx) {
  const d = depth || world?.depth || G.room?.depth || 0;
  const roomSet = (G.room && G.room.killedMonsters && d > 0) ? G.room.killedMonsters.get(d) : null;
  const worldSet = (world && world.kind === 'dungeon' && (!d || world.depth === d)) ? world.killedMonsterIds : null;
  if (typeof netId === 'string' && netId.length > 0) {
    if ((worldSet && worldSet.has(netId)) || (roomSet && roomSet.has(netId))) return true;
  } else if (isSharedMonsterIdx(netId)) {
    if ((worldSet && worldSet.has(netId)) || (roomSet && roomSet.has(netId))) return true;
  }
  if (isSharedMonsterIdx(idx)) {
    if ((worldSet && worldSet.has(idx)) || (roomSet && roomSet.has(idx))) return true;
  }
  return false;
}

export function purgeKilledMonstersFromWorld(world) {
  if (!world || world.kind !== 'dungeon' || !Array.isArray(world.creatures)) return;
  const d = world.depth;
  if (G.room && G.room.killedMonsters) {
    const roomSet = G.room.killedMonsters.get(d);
    if (roomSet && roomSet.size > 0) {
      if (!world.killedMonsterIds) world.killedMonsterIds = new Set();
      for (const id of roomSet) {
        if (isValidKilledId(id)) world.killedMonsterIds.add(id);
      }
    }
  }
  if (!world.killedMonsterIds || world.killedMonsterIds.size === 0) return;
  world.creatures = world.creatures.filter((c) => {
    if (c.team !== 'enemy' || c.dead) return true;
    return !isMonsterKilled(world, d, c.netId, c.idx);
  });
}

let netListenersAttached = false;

export function isSameWorld(remoteStateOrRp, targetWorld = G.world) {
  if (!targetWorld || !remoteStateOrRp) return false;
  if (targetWorld.keep) return false; // Tessariel's Keep is a personal per-player instance
  const state = remoteStateOrRp._lastState || remoteStateOrRp;
  const remoteKind = state.worldKind || (state.world ? state.world.kind : null);
  if (!remoteKind || remoteKind === 'keep' || state.townId === 'keep') return false;

  const targetKind = targetWorld.kind || 'town';
  if (remoteKind !== targetKind) return false;

  if (targetKind === 'dungeon') {
    const remoteDepth = typeof state.depth === 'number' ? state.depth : 0;
    const targetDepth = typeof targetWorld.depth === 'number' ? targetWorld.depth : 0;
    if (remoteDepth !== targetDepth) return false;
    const remoteUnbound = !!state.unbound;
    const targetUnbound = !!targetWorld.unbound;
    if (remoteUnbound !== targetUnbound) return false;
    return true;
  }

  if (targetKind === 'town') {
    const remoteTown = state.townId || 'act1';
    const targetTown = targetWorld.townId || 'act1';
    return remoteTown === targetTown;
  }

  if (targetKind === 'arena') {
    return state.duelId === targetWorld.duelId;
  }

  return true;
}

function attachNetListeners() {
  if (netListenersAttached) return;
  netListenersAttached = true;

  initTrade();
  initDuel();

  net.on('player_joined_room', (p) => {
    if (G.world && p.id !== net.myId) {
      // Clean up any existing remote player with the same ID or name before adding the new one
      if (G.remotePlayers) {
        for (const [existingId, oldRp] of G.remotePlayers.entries()) {
          if (existingId === p.id || (p.name && oldRp.name === p.name)) {
            oldRp.destroy();
            if (G.world.creatures) {
              const idx = G.world.creatures.indexOf(oldRp);
              if (idx !== -1) G.world.creatures.splice(idx, 1);
            }
            G.remotePlayers.delete(existingId);
          }
        }
      }
      if (G.world.creatures) {
        for (let i = G.world.creatures.length - 1; i >= 0; i--) {
          const c = G.world.creatures[i];
          if (c.isRemotePlayer && (c.id === p.id || (p.name && c.name === p.name))) {
            c.destroy && c.destroy();
            G.world.creatures.splice(i, 1);
          }
        }
      }
      const rp = new RemotePlayer(p);
      if (!G.remotePlayers) G.remotePlayers = new Map();
      G.remotePlayers.set(p.id, rp);
      if (isSameWorld(p, G.world)) {
        let sx = G.player.x + 1, sy = G.player.y + 1;
        if (G.world.kind === 'town' && townCache?.portal) {
          const P = townCache.portal, C = townCache.center, l = Math.hypot(C.x - P.x, C.y - P.y) || 1;
          sx = P.x + ((C.x - P.x) / l) * 3.2;
          sy = P.y + ((C.y - P.y) / l) * 3.2;
        } else if (G.world.portals?.[0]) {
          sx = G.world.portals[0].x;
          sy = G.world.portals[0].y;
        }
        rp.x = sx; rp.y = sy;
        rp.targetX = sx; rp.targetY = sy;
        rp.world = G.world;
        G.world.add(rp);
      }
      UI.log(`<b style="color:#7ab8ff">${escapeHtml(p.name)}</b> (Lv ${p.level} ${CLASSES[p.classId]?.name || ''}) joined the room.`, '#ffd860');
      sfx('portal');
      game._lastSentGearKey = null; // (module function: `this` is undefined here)
      if (G.player && G.player.classId === 'bard' && G.char?.tabs) {
        net.sendBardTabs(G.char.tabs, G.char.tabAt);
      }
    }
  });

  net.on('player_left_room', (data) => {
    const toRemove = [];
    if (G.remotePlayers) {
      for (const [id, rp] of G.remotePlayers.entries()) {
        if (id === data.playerId || (data.playerName && rp.name === data.playerName)) {
          toRemove.push([id, rp]);
        }
      }
    }
    for (const [id, rp] of toRemove) {
      rp.destroy();
      if (G.world && G.world.creatures) {
        const idx = G.world.creatures.indexOf(rp);
        if (idx !== -1) G.world.creatures.splice(idx, 1);
      }
      G.remotePlayers.delete(id);
    }
    if (G.world && G.world.creatures) {
      for (let i = G.world.creatures.length - 1; i >= 0; i--) {
        const c = G.world.creatures[i];
        if (c.isRemotePlayer && (c.id === data.playerId || (data.playerName && c.name === data.playerName))) {
          c.destroy && c.destroy();
          G.world.creatures.splice(i, 1);
        }
      }
    }
    UI.log(`<b style="color:#7ab8ff">${escapeHtml(data.playerName || 'A player')}</b> left the room.`, '#a8977c');
  });

  net.on('player_disconnected', (data) => {
    if (G.remotePlayers) {
      for (const [id, rp] of G.remotePlayers.entries()) {
        if (id === data.playerId || (data.playerName && rp.name === data.playerName)) {
          rp.alpha = 0.5;
        }
      }
    }
    UI.log(`<b style="color:#7ab8ff">${escapeHtml(data.playerName || 'A player')}</b> lost connection (waiting for reconnect...).`, '#ffd860');
  });

  net.on('player_reconnected', (data) => {
    if (G.remotePlayers) {
      for (const [id, rp] of G.remotePlayers.entries()) {
        if (id === data.playerId || (data.playerName && rp.name === data.playerName)) {
          rp.alpha = 1.0;
        }
      }
    }
    UI.log(`<b style="color:#7ab8ff">${escapeHtml(data.playerName || 'A player')}</b> reconnected!`, '#48e868');
  });

  net.on('room_reconnected', (data) => {
    const roomData = data?.room || data;
    if (roomData && roomData.name) {
      const oldUnsealed = G.room?.unsealedDepths;
      const oldKilled = G.room?.killedMonsters;
      G.room = roomData;
      if (Array.isArray(roomData.unsealedDepths)) {
        G.room.unsealedDepths = new Set(roomData.unsealedDepths);
      } else if (oldUnsealed) {
        G.room.unsealedDepths = oldUnsealed;
      } else {
        G.room.unsealedDepths = new Set();
      }
      G.room.killedMonsters = oldKilled instanceof Map ? oldKilled : new Map();
      if (Array.isArray(roomData.killed) && roomData.depth > 0) {
        for (const kId of roomData.killed) {
          recordKilledMonster(roomData.depth, kId, typeof kId === 'number' ? kId : null, G.world);
        }
      }
      if (G.world?.kind === 'dungeon') {
        purgeKilledMonstersFromWorld(G.world);
        if (net.connected) net.requestDungeonState(G.world.depth);
      }
      UI.log(`Link restored to room <b style="color:#ffd860">${escapeHtml(roomData.name)}</b>!`, '#48e868');
    }
  });

  net.on('host_migrated', (data) => {
    if (G.room && data?.hostId) {
      G.room.hostId = data.hostId;
      if (data.hostName) G.room.hostName = data.hostName;
      if (G.world?.kind === 'dungeon') {
        purgeKilledMonstersFromWorld(G.world);
      }
    }
  });

  net.on('game_player_state', (state) => {
    if (!G.world || state.id === net.myId) return;
    if (!G.remotePlayers) G.remotePlayers = new Map();
    let rp = G.remotePlayers.get(state.id);
    if (!rp) {
      // Clean up any stale remote player with this same name
      for (const [oldId, oldRp] of G.remotePlayers.entries()) {
        if (state.name && oldRp.name === state.name) {
          oldRp.destroy();
          if (G.world.creatures) {
            const idx = G.world.creatures.indexOf(oldRp);
            if (idx !== -1) G.world.creatures.splice(idx, 1);
          }
          G.remotePlayers.delete(oldId);
        }
      }
      rp = new RemotePlayer({ id: state.id, name: state.name || 'Hero', classId: state.classId || 'paladin', level: state.level || 1, gear: state.gear, banner: state.banner });
      G.remotePlayers.set(state.id, rp);
    }
    rp._lastState = state;
    rp.worldKind = state.worldKind;
    rp.depth = state.depth;
    rp.townId = state.townId;
    rp.unbound = !!state.unbound;
    rp.duelId = state.duelId;
    // the room roster (party list, room previews) was only written on join: keep its level current too
    if (typeof state.level === 'number') {
      for (const roster of [G.room?.players, net.currentRoom?.players]) {
        const entry = roster && roster.find((e) => e.id === state.id || (state.name && e.name === state.name));
        if (entry) entry.level = state.level;
      }
    }

    const sameWorld = isSameWorld(state, G.world);
    if (sameWorld) {
      if (rp.world !== G.world || !G.world.creatures.includes(rp)) {
        rp.x = typeof state.x === 'number' ? state.x : rp.x;
        rp.y = typeof state.y === 'number' ? state.y : rp.y;
        rp.targetX = rp.x;
        rp.targetY = rp.y;
        rp.world = G.world;
        G.world.add(rp);
      }
      rp.updateFromNetwork(state);
      if (Array.isArray(state.summons)) {
        rp.syncSummons(state.summons);
      }
      if (state.loading) {
        rp.isLoading = true;
        rp.targetable = false;
        rp.invuln = 1e9;
        rp.alpha = 0;
      } else if (rp.isLoading) {
        rp.isLoading = false;
        rp.targetable = true;
        rp.invuln = 2.0;
        rp.alpha = 1;
        if (rp.world) {
          addEffect(new Ring(rp.x, rp.y, 0.2, 2.5, 0.8, '#40a0ff', 4));
          sfx('portal');
        }
      }
    } else {
      if (rp.world === G.world || G.world.creatures.includes(rp)) {
        G.world.remove(rp);
        rp.world = null;
        rp.destroySummons();
        rp.destroySig();
      }
      if (typeof state.hp === 'number') rp.hp = state.hp;
      if (typeof state.maxHp === 'number') rp.maxHp = state.maxHp;
      if (typeof state.mana === 'number') rp.mana = state.mana;
      if (typeof state.maxMana === 'number') rp.maxMana = state.maxMana;
      if (state.gear || state.banner !== undefined) rp.updateFromNetwork({ gear: state.gear, banner: state.banner, level: state.level, classId: state.classId });
      rp.dead = (rp.hp <= 0);
    }
  });

  net.on('game_player_gear', (data) => {
    if (!data || data.id === net.myId) return;
    const rp = G.remotePlayers?.get(data.id);
    if (rp) {
      rp.updateFromNetwork({ gear: data.gear, banner: data.banner, level: data.level });
    }
  });

  net.on('game_player_banner', (data) => {
    if (!data || data.id === net.myId) return;
    const rp = G.remotePlayers?.get(data.id);
    if (rp) {
      rp.updateFromNetwork({ banner: data.banner });
    }
  });

  const handleRemoteUltimate = (data) => {
    if (!G.world || data.playerId === net.myId) return;
    const rp = G.remotePlayers?.get(data.playerId);
    const same = (data.worldKind ? isSameWorld(data, G.world) : false) || (rp && isSameWorld(rp, G.world));
    if (!same) return;

    const cls = data.classId || rp?.classId || 'paladin';
    const ultId = data.ultId || getUltimate(cls)?.id;
    const x = typeof data.x === 'number' ? data.x : (rp ? rp.x : G.player?.x || 0);
    const y = typeof data.y === 'number' ? data.y : (rp ? rp.y : G.player?.y || 0);
    if (rp) {
      if (rp.world === G.world && G.world.creatures.includes(rp)) {
        rp.onCastUltimate(cls, ultId, x, y);
      }
    } else {
      const ult = getUltimate(cls);
      executeUltimate(ult, x, y, G.world, null, { classId: cls, name: data.playerName || 'Teammate' }, true);
    }
  };

  net.on('game_skill_cast', (data) => {
    if (!G.world || data.playerId === net.myId) return;
    if (data.isUltimate) {
      handleRemoteUltimate(data);
      return;
    }
    const rp = G.remotePlayers?.get(data.playerId) || (G.remotePlayers && Array.from(G.remotePlayers.values()).find(p => String(p.id) === String(data.playerId)));
    if (!rp) return;

    const same = (data.worldKind ? isSameWorld(data, G.world) : false) || isSameWorld(rp, G.world);
    if (!same) return;

    if (rp.world !== G.world || !G.world.creatures.includes(rp)) {
      if (!isSameWorld(rp, G.world)) return;
      rp.world = G.world;
      G.world.add(rp);
    }
    rp.dead = false;
    rp.onCastSkill(data.skillId, data.x, data.y, data.targetId, data.level, data.extra);
  });

  net.on('game_ultimate_cast', (data) => {
    handleRemoteUltimate(data);
  });

  net.on('game_bard_tabs', (data) => {
    if (data.playerId === net.myId) return;
    const rp = G.remotePlayers?.get(data.playerId);
    if (rp) {
      rp.setBardTabs(data.tabs, data.tabAt);
    }
  });

  net.on('game_monster_hit', (data) => {
    if (!data || data.sourceId === net.myId) return;
    if (G.room && data.killed && data.depth > 0) {
      recordKilledMonster(data.depth, data.netId, data.monsterIdx, G.world);
      if (data.isBoss || data.rank === 'boss') {
        if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
        G.room.unsealedDepths.add(data.depth);
      }
      const hearthWorld = G.char?.hearth?.dungeonWorld;
      if (hearthWorld && hearthWorld !== G.world && hearthWorld.depth === data.depth) {
        recordKilledMonster(data.depth, data.netId, data.monsterIdx, hearthWorld);
        purgeKilledMonstersFromWorld(hearthWorld);
      }
    }
    if (!G.world) return;
    if (data.worldKind && data.worldKind !== G.world.kind) return;
    if (data.depth && data.depth !== G.world.depth) return;
    if (G.world.creatures) {
      let m = null;
      if (data.netId) {
        m = G.world.creatures.find(c => c.team === 'enemy' && !c.dead && c.netId === data.netId);
      }
      if (!m && isSharedMonsterIdx(data.monsterIdx)) {
        m = G.world.creatures.find(c => c.team === 'enemy' && !c.dead && c.idx === data.monsterIdx);
      }
      if (!m && !data.netId && !isSharedMonsterIdx(data.monsterIdx) && data.x != null && data.y != null) {
        m = G.world.creatures.find(c => c.team === 'enemy' && !c.dead && Math.hypot(c.x - data.x, c.y - data.y) < 2.0);
      }
      if (m) {
        const rp = G.remotePlayers?.get(data.sourceId) || null;
        hit(rp, m, data.dmg, data.elem || 'phys', { fromNetwork: true, crit: !!data.isCrit });
        if (data.killed && !m.dead) {
          kill(m, rp, { el: data.elem || 'phys', crit: !!data.isCrit, fromNetwork: true });
        }
      }
      if (data.killed && (data.isBoss || data.rank === 'boss' || (m && m === G.world.boss) || (G.world.boss && (G.world.boss.netId === data.netId || (isSharedMonsterIdx(data.monsterIdx) && G.world.boss.idx === data.monsterIdx))))) {
        if (G.room) {
          if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
          G.room.unsealedDepths.add(G.world.depth);
        }
        game.unsealDungeonExit(G.world, G.world.boss?.name);
      }
    }
  });

  net.on('game_floor_unsealed', (data) => {
    if (!G.room) return;
    if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
    G.room.unsealedDepths.add(data.depth);

    if (G.world && G.world.kind === 'dungeon' && G.world.depth === data.depth) {
      if (G.world.biome?.overworld) {
        const exit = G.world.portals?.find(p => p.type === 'exit');
        if (exit && !exit.active) {
          exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
          const c = G.char;
          if (c) {
            const first = !c.cleared[G.world.depth];
            c.cleared[G.world.depth] = true;
            c.deepest = Math.max(c.deepest || 0, G.world.depth);
            game.brokeThrough(G.world.depth);
            if (first) {
              game.awardFloorClear(G.world.depth);
            }
            game.autosave();
          }
          addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
          sfx('gate'); UI.refresh();
        }
      } else {
        game.unsealDungeonExit(G.world, data.bossName);
      }
    }
  });

  net.on('game_ambush_spawn', (data) => {
    if (!G.world || !G.world.creatures) return;
    if (data.depth != null && data.depth !== G.world.depth) return;
    if (game.isDungeonAuthority(G.world.depth)) return;

    let spawnedAny = false;
    for (const mon of data.monsters || []) {
      if (isMonsterKilled(G.world, G.world.depth, mon.netId, mon.idx)) continue;
      let existing = G.world.creatures.find(c => c.team === 'enemy' && (c.netId === mon.netId || (isSharedMonsterIdx(mon.idx) && c.idx === mon.idx)));
      if (existing) {
        existing.ambusher = true;
        continue;
      }

      const m = makeMonster(G.world, mon.arch || 'ghoul', G.world.biome, mon.lvl || 1, mon.rank || 'normal', mon.x, mon.y, 0, mon.look);
      m.netId = mon.netId;
      if (isSharedMonsterIdx(mon.idx)) m.idx = mon.idx;
      m.fromNetwork = true;
      if (mon.name) m.name = mon.name;
      if (mon.maxHp) { m.maxHp = mon.maxHp; m.hp = mon.maxHp; }
      if (mon.dmg) m.dmg = mon.dmg;
      if (mon.scale) m.scale = mon.scale;
      if (mon.affixes) m.affixes = [...mon.affixes];
      if (mon.aura) m.aura = mon.aura;
      if (mon.trait) applyTrait(m, mon.trait);
      m.awake = true; m.hunter = true; m.ambusher = true;
      G.world.add(m);
      spawnedAny = true;

      if (mon.delay > 0) {
        m.targetable = false; m.alpha = 0; let d = mon.delay;
        m.entering = (dt) => { if ((d -= dt) <= 0) enter(m, data.kind, mon.from); };
      } else {
        enter(m, data.kind, mon.from);
      }
    }

    if (!spawnedAny) return;
    const msg = {
      drop: 'They fall from above!',
      teleport: 'Something tears through the veil!',
      burrow: 'The ground splits open!',
      wall: 'The walls come alive!'
    }[data.kind];
    const targetX = data.tx ?? G.world.player?.x;
    const targetY = data.ty ?? G.world.player?.y;
    if (msg && targetX != null && targetY != null) {
      floatText(targetX, targetY, 90, msg, '#ff8060', 14, { life: 1.8 });
      sfx('roar', 0.5);
    }
  });

  net.on('game_monster_spawn', (data) => {
    if (!G.world || !G.world.creatures) return;
    if (data.worldKind && data.worldKind !== G.world.kind) return;
    if (data.depth != null && data.depth !== G.world.depth) return;
    if (game.isDungeonAuthority(G.world.depth)) return;
    if (isMonsterKilled(G.world, G.world.depth, data.netId, data.idx)) return;

    let existing = G.world.creatures.find(c => c.team === 'enemy' && (c.netId === data.netId || (isSharedMonsterIdx(data.idx) && c.idx === data.idx)));
    if (existing) return;

    let m = null;
    if (data.isWard || data.vk) {
      const color = data.color || data.aura || '#b080ff';
      const rgb = hexToRgb(color);
      m = new Monster({
        x: data.x, y: data.y, team: 'enemy', ai: data.ai || 'ward',
        static: data.static ?? true, fly: !!data.fly, sprite: data.sprite || 'crystal',
        art: data.art || 'va_crystal', artH: data.artH || 42,
        swap: { tint: [...rgb, 0.75] },
        pal: { a: color, c: color, w: '#ffffff', m: '#4a4650' },
        px: 3, r: 0.45,
        maxHp: data.maxHp || 100, hp: data.hp || data.maxHp || 100,
        level: data.level || 1, dmg: data.dmg || 10, xp: 0,
        name: data.name || (data.isWard ? 'Warding Crystal' : 'Crystal'),
        rank: data.rank || 'champion', aura: color, awake: true,
        el: data.el || 'fire', res: {}, goreType: 'spark', atkCd: 3, isWard: !!data.isWard,
      });
      m.vk = data.vk;
      m.isWard = !!data.isWard;
      if (data.isWard && G.world.raid) {
        G.world.raid.wards.push(m);
        m.wardTick = (dt) => {
          m.moving = false;
          const bm = G.world.boss;
          if (bm && bm.dead) { m.dead = true; return; }
          if ((m.beamT = (m.beamT || 0) - dt) <= 0) {
            m.beamT = 0.12;
            if (bm) addEffect(new Bolt(m.x, m.y, 44, bm.x, bm.y, 70, color, 0.13, 2));
          }
        };
      }
      const velBoss = G.world.velscour || G.world.Velscour;
      if (data.vk && velBoss) {
        velBoss.parts.push(m);
        if (data.vk === 'shard') {
          const bm = G.world.boss;
          m.onDeath = () => {
            if (!bm || bm.dead) return;
            const cut = bm.maxHp * 0.05;
            bm.hp = Math.max(bm.maxHp * 0.3, bm.hp - cut);
            const vb = G.world.velscour || G.world.Velscour;
            if (vb) vb.lastHp = bm.hp;
            addEffect(new Column(m.x, m.y, '#ff3050', 1, 60, 300));
            floatText(m.x, m.y, 80, '-5% VELSCOUR', '#ff6080', 16, { life: 1.6 });
            sfx('explode');
          };
        }
      }
    } else {
      m = makeMonster(G.world, data.arch || 'ghoul', G.world.biome, data.level || 1, data.rank || 'normal', data.x, data.y, 0, data.look);
      if (data.name) m.name = data.name;
      if (data.maxHp) { m.maxHp = data.maxHp; m.hp = data.hp ?? data.maxHp; }
      if (data.dmg) m.dmg = data.dmg;
      if (data.scale) m.scale = data.scale;
      if (data.affixes) m.affixes = Array.isArray(data.affixes) ? [...data.affixes] : [data.affixes];
      if (data.aura || data.color) m.aura = data.aura || data.color;
      m.awake = data.awake !== undefined ? !!data.awake : true;
      if (data.traits) {
        for (const tr of (Array.isArray(data.traits) ? data.traits : [data.traits])) {
          applyTrait(m, tr);
        }
      }
      if (data.ambusher) {
        m.ambusher = true;
        m.hunter = true;
      }
      if (G.world.raid && (data.name?.includes('Royal Guard') || data.arch?.includes('colossus') || data.isRaidAdd)) {
        G.world.raid.minions.push(m);
      }
    }

    m.netId = data.netId;
    if (isSharedMonsterIdx(data.idx)) m.idx = data.idx;
    if (data.ambusher) {
      m.ambusher = true;
      m.hunter = true;
    }
    m.fromNetwork = true;
    G.world.add(m);
    if (data.fromStateSync) m.spawnT = 1;

    if (data.enteringKind) {
      enter(m, data.enteringKind, data.enteringFrom);
    }
  });

  net.on('game_monsters_state', (data) => {
    if (!G.world || !G.world.creatures || G.world.kind !== 'dungeon') return;
    if (data.depth && data.depth !== G.world.depth) return;
    if (game.isDungeonAuthority(G.world.depth)) return;

    // Record any newly killed IDs reported by authority/server and purge all known dead monsters
    if (Array.isArray(data.killed) && data.killed.length > 0) {
      for (const kId of data.killed) {
        recordKilledMonster(G.world.depth, kId, typeof kId === 'number' ? kId : null, G.world);
      }
    }
    purgeKilledMonstersFromWorld(G.world);
    if (G.world.boss && isMonsterKilled(G.world, G.world.depth, G.world.boss.netId, G.world.boss.idx)) {
      if (G.room) {
        if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
        G.room.unsealedDepths.add(G.world.depth);
      }
      game.unsealDungeonExit(G.world, G.world.boss?.name);
    }

    for (const s of data.monsters || []) {
      if (isMonsterKilled(G.world, G.world.depth, s.id, s.idx)) continue;
      let m = G.world.creatures.find(c => c.team === 'enemy' && !c.dead && (
        c.netId === s.id ||
        (isSharedMonsterIdx(s.idx) && c.idx === s.idx) ||
        (isSharedMonsterIdx(s.id) && c.idx === s.id)
      ));
      if (!m && s.id && s.hp > 0 && (s.arch || s.isWard || s.vk)) {
        net.emit('game_monster_spawn', {
          netId: s.id,
          idx: isSharedMonsterIdx(s.idx) ? s.idx : null,
          worldKind: G.world.kind,
          depth: G.world.depth,
          x: s.x,
          y: s.y,
          hp: s.hp,
          maxHp: s.maxHp || s.hp,
          level: s.lvl || 1,
          rank: s.rank || 'normal',
          arch: s.arch,
          name: s.name,
          isWard: s.isWard,
          vk: s.vk,
          static: s.static,
          fly: s.fly,
          color: s.color,
          affixes: s.affixes,
          awake: !!s.a,
          ambusher: !!s.ambusher,
          fromStateSync: true,
        });
        m = G.world.creatures.find(c => c.team === 'enemy' && !c.dead && (
          c.netId === s.id ||
          (isSharedMonsterIdx(s.idx) && c.idx === s.idx) ||
          (isSharedMonsterIdx(s.id) && c.idx === s.id)
        ));
      }
      if (m) {
        if (s.hp <= 0) {
          if (!m.dead) kill(m, null, { el: 'phys', fromNetwork: true });
        } else {
          if (s.maxHp && m.maxHp !== s.maxHp) m.maxHp = s.maxHp;
          m.hp = Math.min(m.maxHp, s.hp);
          if (s.name && m.name !== s.name) m.name = s.name;
          if (s.rank && m.rank !== s.rank) m.rank = s.rank;
          if (s.color && !m.aura) m.aura = s.color;
          if (s.affixes && (!m.affixes || m.affixes.length !== s.affixes.length)) m.affixes = [...s.affixes];
          if (s.a) {
            if (!m.awake) {
              m.awake = true;
              if (m.raid && !m.raid.announced) m.raid.wake();
              else if (m === G.world.boss && G.world.onBossAwake) G.world.onBossAwake(m);
            }
          }
          if (s.f !== undefined) m.facing = s.f;
          m.netTargetX = s.x;
          m.netTargetY = s.y;
          const d2 = dist2(m.x, m.y, s.x, s.y);
          if (d2 > 16) {
            m.x = s.x;
            m.y = s.y;
          }
        }
      }
    }
  });

  net.on('dungeon_killed_sync', (data) => {
    if (!G.room || !data) return;
    for (const id of data.killed || []) {
      recordKilledMonster(data.depth, id, typeof id === 'number' ? id : null, G.world);
    }

    const hearthWorld = G.char?.hearth?.dungeonWorld;
    if (hearthWorld && hearthWorld !== G.world && hearthWorld.depth === data.depth) {
      for (const id of data.killed || []) {
        recordKilledMonster(data.depth, id, typeof id === 'number' ? id : null, hearthWorld);
      }
      purgeKilledMonstersFromWorld(hearthWorld);
    }

    if (data.unsealed || (data.unsealedDepths && data.unsealedDepths.includes(data.depth))) {
      if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
      G.room.unsealedDepths.add(data.depth);
    }

    if (G.world && G.world.kind === 'dungeon' && G.world.depth === data.depth) {
      purgeKilledMonstersFromWorld(G.world);
      const bossDead = (G.world.boss && isMonsterKilled(G.world, data.depth, G.world.boss.netId, G.world.boss.idx)) ||
        (G.room && G.room.unsealedDepths && G.room.unsealedDepths.has(data.depth));

      if (bossDead) {
        if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
        G.room.unsealedDepths.add(data.depth);
        game.unsealDungeonExit(G.world, G.world.boss?.name);
      }
    }
  });

  net.on('room_depth_sync', (data) => {
    if (G.room) {
      if (typeof data.depth === 'number' && data.depth > 0) {
        const d = clamp(data.depth, 1, FINAL_DEPTH);
        G.room.depth = d;
        if (G.char) {
          if (d > 1) {
            G.char.cleared[d - 1] = true;
            G.char.deepest = Math.max(G.char.deepest || 0, d - 1);
          }
          if (G.world?.kind === 'town' || G.char.depth < d) {
            G.char.depth = d;
          }
          game.autosave();
        }
      }
      if (data.biome && data.biome !== 'town') {
        G.room.biome = data.biome;
        if (G.char && G.world?.kind === 'town') {
          G.char.nextBiome = data.biome;
        }
      }
      if (data.seed) G.room.dungeonSeed = data.seed;
      if (data.mixId !== undefined) G.room.mixId = data.mixId;
      if (data.scenarioId !== undefined) G.room.scenarioId = data.scenarioId || null;
      if (Array.isArray(data.heresies)) G.room.heresies = data.heresies;
      if (!G.room.floors) G.room.floors = new Map();
      if (data.depth > 0 && data.seed && data.biome && data.biome !== 'town') {
        G.room.floors.set(data.depth, {
          depth: data.depth,
          biome: data.biome,
          seed: data.seed,
          mixId: data.mixId || null,
          scenarioId: data.scenarioId || null,
          heresies: data.heresies || [],
        });
      }
      if (Array.isArray(data.killed) && data.depth > 0) {
        for (const kId of data.killed) {
          recordKilledMonster(data.depth, kId, typeof kId === 'number' ? kId : null, G.world);
        }
        if (G.world?.kind === 'dungeon' && G.world.depth === data.depth) {
          purgeKilledMonstersFromWorld(G.world);
        }
      }
      if (data.unsealed || (data.unsealedDepths && data.unsealedDepths.includes(data.depth))) {
        if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
        G.room.unsealedDepths.add(data.depth);
        if (G.world && G.world.kind === 'dungeon' && G.world.depth === data.depth) {
          game.unsealDungeonExit(G.world);
        }
      }
      if (net.currentRoom) {
        net.currentRoom.depth = G.room.depth;
        net.currentRoom.biome = G.room.biome;
        net.currentRoom.dungeonSeed = G.room.dungeonSeed;
        net.currentRoom.mixId = G.room.mixId;
        net.currentRoom.heresies = G.room.heresies;
      }
    }
    // If local player had the exit portal choice dialog open on previous floor, refresh it with the selected choice!
    if (G.world?.kind === 'dungeon' && G.world.depth < FINAL_DEPTH && data.depth === G.world.depth + 1 && document.querySelector('.portal-choice')) {
      const wasAuto = !!(game.pick && game.pick.t != null) || (typeof Auto !== 'undefined' && Auto.on);
      UI.closeAllDialogs();
      game.pick = null;
      game.portalChoice(G.world, { auto: wasAuto });
    }
    if (G.world?.kind === 'town') {
      if (document.querySelector('.floor-pick-dialog')) {
        UI.closeAllDialogs();
        game.confirmDungeon();
      }
      if (data.depth) UI.log(`Portal in town updated to Depth ${data.depth}!`, '#ffd860');
    }
  });

  net.on('game_town_transition', (data) => {
    if (G.room && data && typeof data.depth === 'number') {
      G.room.depth = data.depth;
    }
  });

  net.on('game_cine_trigger', (msg) => {
    if (!msg || !msg.triggerId) return;
    const w = G.world;
    if (!w || !w.customDirector) return;
    if (msg.depth > 0 && w.depth !== msg.depth) return;
    w.customDirector.fireTriggerById(msg.triggerId, true, !!msg.allSeen);
  });

  net.on('game_hearth_portal', (data) => {
    if (G.room) {
      if (!G.room.hearthPortals) G.room.hearthPortals = new Map();
      if (data.active) {
        G.room.hearthPortals.set(data.depth, data);
        if (data.depth > 0 && data.seed && data.biome) {
          if (!G.room.floors) G.room.floors = new Map();
          G.room.floors.set(data.depth, {
            depth: data.depth,
            biome: data.biome,
            seed: data.seed,
            mixId: null,
            heresies: [],
          });
        }
      } else {
        G.room.hearthPortals.delete(data.depth);
      }
    }
  });

  net.on('dungeon_state_response', (data) => {
    if (G.room && data && data.depth > 0) {
      if (!G.room.floors) G.room.floors = new Map();
      if (data.seed && data.biome) {
        G.room.floors.set(data.depth, {
          depth: data.depth,
          biome: data.biome,
          seed: data.seed,
          mixId: data.mixId || null,
          heresies: data.heresies || [],
        });
      }
      if (G.world?.kind === 'dungeon' && G.world.depth === data.depth) {
        if (data.biome && G.room.biome !== data.biome) G.room.biome = data.biome;
        if (data.seed && G.room.dungeonSeed !== data.seed) G.room.dungeonSeed = data.seed;
      }
    }
  });

  net.on('game_dungeon_transition', (data) => {
    if (G.room && data) {
      if (typeof data.depth === 'number' && data.depth > 0) {
        const d = clamp(data.depth, 1, FINAL_DEPTH);
        G.room.depth = d;
        if (G.char) {
          if (d > 1) {
            G.char.cleared[d - 1] = true;
            G.char.deepest = Math.max(G.char.deepest || 0, d - 1);
          }
          if (G.world?.kind === 'town' || G.char.depth < d) {
            G.char.depth = d;
          }
          game.autosave();
        }
      }
      if (data.biome) G.room.biome = data.biome;
      if (data.seed) G.room.dungeonSeed = data.seed;
      if (data.mixId) G.room.mixId = data.mixId;
    }
  });

  net.on('game_loot_spawn', (data) => {
    if (!G.world || !G.world.loot) return;
    if (data.worldKind && G.world.kind !== data.worldKind) return;
    if (data.worldKind === 'dungeon' && data.depth != null && G.world.depth !== data.depth) return;
    if (G.world.loot.some(l => l.lootId && l.lootId === data.lootId)) return;

    const g = new GroundItem(data.x, data.y, data.kind, {
      item: data.item,
      amount: data.amount,
      lootId: data.lootId,
      droppedBy: data.droppedBy,
    });
    g.t = 0.4;
    g.vx = 0; g.vy = 0; g.vz = 0;
    G.world.addLoot(g);
    if (data.droppedBy) {
      UI.log(`<b style="color:#7ab8ff">${escapeHtml(data.droppedBy)}</b> dropped <span style="color:${g.color}">${g.label}</span>`, '#a8977c');
    }
  });

  net.on('game_loot_pickup', (data) => {
    if (!G.world || !G.world.loot) return;
    const idx = G.world.loot.findIndex(l => l.lootId && l.lootId === data.lootId);
    if (idx !== -1) {
      const g = G.world.loot[idx];
      G.world.loot.splice(idx, 1);
      if (G.player && G.player.lootTarget === g) {
        G.player.lootTarget = null;
      }
      sparkle(g.x, g.y, 16, g.color || '#ffd34a', 12, 0.4);
      if (data.pickerName && data.pickerId !== net.myId) {
        UI.log(`<b style="color:#7ab8ff">${escapeHtml(data.pickerName)}</b> picked up <span style="color:${g.color}">${g.label}</span>`, '#a8977c');
      }
    }
  });

  net.on('game_ground_loot_sync', (data) => {
    if (!G.world || !G.world.loot) return;
    for (const item of data.loot || []) {
      if (item.worldKind && G.world.kind !== item.worldKind) continue;
      if (item.worldKind === 'dungeon' && item.depth != null && G.world.depth !== item.depth) continue;
      if (G.world.loot.some(l => l.lootId && l.lootId === item.lootId)) continue;
      const g = new GroundItem(item.x, item.y, item.kind, {
        item: item.item,
        amount: item.amount,
        lootId: item.lootId,
        droppedBy: item.droppedBy,
      });
      g.t = 0.4;
      g.vx = 0; g.vy = 0; g.vz = 0;
      G.world.addLoot(g);
    }
  });

  net.on('game_loot_pickup_reject', (data) => {
    if (G.char && G.char.bag) {
      const idx = G.char.bag.findIndex(b => b && b._lootId === data.lootId);
      if (idx !== -1) {
        G.char.bag[idx] = null;
        if (G.player) G.player.recompute();
        UI.refresh();
        UI.log('Someone else already grabbed that item!', '#ff8080');
      }
    }
  });
}

const DUNGEON_ELEMENTAL_HAZARDS = {
  wildfire: { el: 'fire', radius: 1.6, damage: 0.07, interval: [11, 17], fx: 'fire' },
  blizzard: { el: 'cold', radius: 2.3, damage: 0.045, interval: [12, 18], fx: 'frost', o: { slow: true } },
  acid_rain: { el: 'acid', radius: 3.2, damage: 0.04, interval: [9, 14], fx: 'poison', area: true, duration: 3, o: { poison: true } },
  lava_pools: { el: 'fire', radius: 1.8, damage: 0.055, interval: [10, 16], fx: 'fire', area: true, duration: 4 },
  frozen_ground: { el: 'cold', radius: 2.1, damage: 0.025, interval: [12, 19], fx: 'frost', area: true, duration: 5, o: { slow: true } },
  chain_lightning: { el: 'light', radius: 2, damage: 0.06, interval: [8, 13], fx: 'storm', o: { stun: true } },
  toxic_fog: { el: 'poison', radius: 2.2, damage: 0.035, interval: [11, 16], fx: 'poison', area: true, duration: 5, o: { poison: true } },
  meteor_shower: { el: 'fire', radius: 1.8, damage: 0.09, interval: [12, 19], fx: 'meteor', warning: 1.25 },
  arcane_storm: { el: 'arcane', radius: 2.1, damage: 0.06, interval: [10, 16], fx: 'nova' },
  electrified_ground: { el: 'light', radius: 2.4, damage: 0.04, interval: [12, 18], fx: 'storm', area: true, duration: 3, o: { stun: true } },
  inferno: { el: 'fire', radius: 2, damage: 0.035, interval: [10, 15], fx: 'explosion' },
  hailstorm: { el: 'cold', radius: 1.8, damage: 0.05, interval: [9, 15], fx: 'frost', o: { slow: true } },
  elemental_chaos: { randomElement: true, radius: 2, damage: 0.055, interval: [10, 16], fx: 'nova' },
  unstable_elements: { randomElement: true, radius: 1.8, damage: 0.05, interval: [8, 14], fx: 'explosion' },
};
const DUNGEON_ENVIRONMENT_HAZARDS = {
  earthquake: { el: 'phys', radius: 3, damage: 0.055, interval: [12, 18], fx: 'earth', o: { stun: true } },
  falling_debris: { el: 'phys', radius: 1.7, damage: 0.075, interval: [9, 14], fx: 'meteor', warning: 1.1 },
  collapsing_ground: { el: 'phys', radius: 2.4, damage: 0.06, interval: [13, 20], fx: 'earth', area: true, duration: 3 },
  spike_traps: { el: 'phys', radius: 1.3, damage: 0.08, interval: [8, 14], fx: 'spike', warning: 0.8 },
  cursed_totems: { el: 'shadow', radius: 2.2, damage: 0.04, interval: [14, 20], fx: 'void', area: true, duration: 4 },
  explosive_barrels: { el: 'fire', radius: 2.1, damage: 0.1, interval: [13, 20], fx: 'explosion', warning: 1.2 },
  haunted_grounds: { el: 'shadow', radius: 2.2, damage: 0.055, interval: [12, 18], fx: 'void', area: true, duration: 3 },
  blood_pools: { el: 'phys', radius: 1.9, damage: 0.04, interval: [12, 19], fx: 'blood', area: true, duration: 5, o: { bleed: true, slow: true } },
  unstable_rifts: { el: 'arcane', radius: 2.4, damage: 0.07, interval: [14, 20], fx: 'nova' },
  gravity_wells: { el: 'arcane', radius: 2.5, damage: 0.035, interval: [15, 22], fx: 'void', area: true, duration: 4 },
  corrupted_shrines: { el: 'shadow', radius: 2.1, damage: 0.05, interval: [16, 23], fx: 'void', area: true, duration: 3 },
  arcane_mines: { el: 'arcane', radius: 1.6, damage: 0.085, interval: [9, 15], fx: 'nova', warning: 1.25 },
  living_dungeon: { el: 'shadow', radius: 2.2, damage: 0.06, interval: [15, 22], fx: 'void' },
};
const DUNGEON_CHAOS_HAZARDS = {
  wild_magic: { randomElement: true, radius: 1.9, damage: 0.06, interval: [10, 16], fx: 'nova' },
  chaos_orbs: { el: 'arcane', radius: 1.4, damage: 0.04, interval: [8, 13], fx: 'nova', area: true, duration: 4 },
  unstable_reality: { randomElement: true, radius: 2.2, damage: 0.045, interval: [11, 17], fx: 'void', area: true, duration: 3 },
  cataclysm: { randomElement: true, radius: 3.4, damage: 0.12, interval: [18, 26], fx: 'meteor', warning: 1.35, spread: 8, log: 'A cataclysmic force gathers nearby.' },
  velscour_s_wrath: { el: 'shadow', radius: 2.5, damage: 0.09, interval: [16, 24], fx: 'void', warning: 1.1 },
};

export const game = {
  // ------------------------------------------------------------ characters
  // Start Single Player directly without connecting to lobby or multiplayer server
  async startSinglePlayer(charInfo, fresh = false) {
    if (net && (net.connected || net.ws || net.simulated)) {
      net.disconnect();
    }
    G.room = null;
    G.remotePlayers = null;
    const classId = charInfo.classId;
    await this.loadClassPack(classId);
    const c = fresh ? newCharData(classId, charInfo.name) : migrate(charInfo);
    c.isOnline = false;
    delete c.accountId;
    G.selectedChar = c;
    this.startChar(c, fresh, null);
  },

  // Enter the Diablo II Battle.net lobby instead of immediately going solo
  async selectAndEnterLobby(charInfo, fresh = false, onBack = () => { }) {
    const classId = charInfo.classId;
    await this.loadClassPack(classId);
    const c = fresh ? newCharData(classId, charInfo.name) : migrate(charInfo);
    if (charInfo && charInfo.isOnline) c.isOnline = true;
    if (charInfo.marks || c.marks) {
      adoptEndgame({ marks: charInfo.marks || c.marks });
    }
    c.marks = JSON.parse(JSON.stringify(endgame().marks));
    G.selectedChar = c;
    if (c.isOnline) {
      import('../net/online.js').then(({ fetchOnlineReliquary }) => fetchOnlineReliquary().catch(() => { })).catch(() => { });
    }
    openLobby(c, onBack);
  },

  startMultiplayerGame(c, room) {
    G.room = room;
    if (Array.isArray(room.unsealedDepths)) {
      G.room.unsealedDepths = new Set(room.unsealedDepths);
    } else if (!G.room.unsealedDepths) {
      G.room.unsealedDepths = new Set();
    }
    G.room.killedMonsters = new Map();
    if (Array.isArray(room.killed) && room.depth > 0) {
      for (const kId of room.killed) {
        recordKilledMonster(room.depth, kId, typeof kId === 'number' ? kId : null, G.world);
      }
    }
    if (room.mixId !== undefined) G.room.mixId = room.mixId;
    if (Array.isArray(room.heresies)) G.room.heresies = room.heresies;

    G.room.floors = new Map();
    if (Array.isArray(room.floors)) {
      for (const fl of room.floors) {
        if (fl && fl.depth > 0) G.room.floors.set(fl.depth, fl);
      }
    }
    if (room.depth > 0 && room.dungeonSeed && room.biome && room.biome !== 'town') {
      G.room.floors.set(room.depth, {
        depth: room.depth,
        biome: room.biome,
        seed: room.dungeonSeed,
        mixId: room.mixId || null,
        heresies: room.heresies || [],
      });
    }

    G.room.hearthPortals = new Map();
    if (Array.isArray(room.hearthPortals)) {
      for (const hp of room.hearthPortals) {
        if (hp && hp.depth > 0) G.room.hearthPortals.set(hp.depth, hp);
      }
    }

    G.remotePlayers = new Map();
    attachNetListeners();

    // Preserve the permanent town seed for the room
    const townSeed = room.townSeed || room.seed;
    if (townSeed) {
      G.room.townSeed = townSeed;
      c.townSeed = townSeed;
    }

    if (room.depth > 0) {
      G.room.depth = room.depth;
    }
    if (room.dungeonSeed) {
      G.room.dungeonSeed = room.dungeonSeed;
    }
    if (room.dungeonBiome) {
      G.room.dungeonBiome = room.dungeonBiome;
    }

    if (c?.classId) {
      loadGearArt(c.classId, true).catch(() => { });
    }

    if (c?.isOnline) {
      import('../net/online.js').then(({ fetchOnlineReliquary }) => fetchOnlineReliquary().catch(() => { })).catch(() => { });
    }

    this.startChar(c, false, room);

    if (c.classId === 'bard' && c.tabs) {
      net.sendBardTabs(c.tabs, c.tabAt);
    }

    // Register other players already in the room
    if (room.players && G.world) {
      for (const p of room.players) {
        if (p.id !== net.myId && !G.remotePlayers.has(p.id)) {
          const rp = new RemotePlayer(p);
          G.remotePlayers.set(p.id, rp);
          if (isSameWorld(p, G.world)) {
            const [sx, sy] = G.world.map ? (G.world.map.randomNear(G.player.x, G.player.y, 2) || [G.player.x + 1, G.player.y + 1]) : [G.player.x + 1, G.player.y + 1];
            rp.x = sx; rp.y = sy;
            rp.targetX = sx; rp.targetY = sy;
            rp.world = G.world;
            G.world.add(rp);
          }
        }
      }
    }
  },

  // async: the class's art pack (if it has one) loads first, because it names the class's catalog items
  async newChar(classId, name) {
    await this.loadClassPack(classId);
    const c = newCharData(classId, name);
    this.startChar(c, true);
  },
  async loadChar(c) {
    await this.loadClassPack(c.classId, c);
    this.startChar(migrate(c), false);
  },
  async loadClassPack(classId, char = null) {
    LoadingScreen.show({
      title: 'HERO AWAKENING',
      subtitle: classId ? classId.toUpperCase() : 'HERO',
      text: 'Preparing hero equipment…',
      progress: 30
    });
    const [meta] = await Promise.all([loadClassArt(classId), loadGearArt(classId), loadHeld(classId, char), preloadSkillSheets(classId)]);
    LoadingScreen.setProgress(100, 'Hero ready');
    await LoadingScreen.hide();
    setClassItems(classId, meta);
  },

  startChar(c, fresh, room = null) {
    Macros.reset();
    hideScreen();
    if (Auto.on) Auto.toggle(false);
    if (c.marks) {
      adoptEndgame({ marks: c.marks });
    }
    c.marks = JSON.parse(JSON.stringify(endgame().marks));
    G.char = c;
    preloadSkillSheets(c.classId);
    setRingContext(c.classId, c.skills);
    const p = new Player(c);
    G.player = p;
    p.applyGrants();
    if (!c.bar[0]) c.bar[0] = `${c.classId}.0.0`;
    p.recompute();
    p.hp = p.maxHp; p.mana = p.maxMana;
    G.mode = 'game';
    HUD.show(true);
    if (room) {
      GameChat.init();
      GameChat.show();
    } else {
      GameChat.hide();
    }
    if (G.touch) TouchUI.show(true);
    UI.refresh();
    Vendor.restock();
    this.enterTown(true);
    if (fresh) {
      setTimeout(() => {
        if (G.world && G.world.kind !== 'town') return;   // (a test or the skull has already taken the hero elsewhere)
        UI.centerMsg('HERRINGTON HOLLOW', 'The last town above the abyss', 3.5);
        UI.log(`Welcome, ${escapeHtml(c.name)}. Visit the vendors, then step into the <b style="color:#ff8050">portal</b> at the edge of town.`, '#ffe2a0');
        UI.log('You have <b>1 skill point</b> — open the Skill Tree (K) to learn your first ability.', '#ffd860');
        if (!G.touch) UI.log('Left-click to move/attack, right-click, ` 1–9 0 - = for skills, Z X C V for potions, Q for the quest log.');
        else UI.log('Left thumb moves, tap to attack, skill buttons on the right.');
      }, 400);
    }
    this.autosave();
  },

  autosaveSoon(delayMs = 1500) {
    if (!G.char) return;
    if (this._saveSoonTimer) return;
    this._saveSoonTimer = setTimeout(() => {
      this._saveSoonTimer = null;
      if (G.char) this.autosave();
    }, delayMs);
  },

  async autosave({ periodic = false } = {}) {
    if (this._saveSoonTimer) {
      clearTimeout(this._saveSoonTimer);
      this._saveSoonTimer = null;
    }
    if (!G.char) return false;
    saveT = 0;
    saveMarkXp(); // XP towards the next Infernal Mark (game/marks.js)
    if (G.char.isOnline) {
      G.char.marks = JSON.parse(JSON.stringify(endgame().marks));
      return await saveOnlineCharacter(G.char, { onlyIfChanged: periodic });
    }
    writeSave(G.char);
    return true;
  },

  flushUnloadSave() {
    if (this._saveSoonTimer) {
      clearTimeout(this._saveSoonTimer);
      this._saveSoonTimer = null;
    }
    const c = G.char || (G.mode === 'lobby' ? G.selectedChar : null);
    if (!c) return false;
    if (G.char) saveMarkXp();
    if (c.isOnline) {
      try { c.marks = JSON.parse(JSON.stringify(endgame().marks)); } catch (e) { }
      return flushOnlineSaveUnload(c);
    }
    writeSave(c);
    return true;
  },

  async quitToTitle(toLobby = !!G.room) {
    if (this._saveSoonTimer) {
      clearTimeout(this._saveSoonTimer);
      this._saveSoonTimer = null;
    }
    if (Auto.on) Auto.toggle(false);
    if (G.room) {
      net.leaveRoom();
      if (!toLobby) net.disconnect();
      G.room = null;
      if (G.remotePlayers) {
        for (const rp of G.remotePlayers.values()) rp.destroy();
      }
      G.remotePlayers = null;
    }
    const c = G.char;
    if (c) {
      c.marks = JSON.parse(JSON.stringify(endgame().marks));
      try {
        await this.autosave();
        await flushOnlineSave();
      } catch (e) {
        console.warn('[Velscour Online] Error saving before exit:', e);
      }
    }
    UI.closeAll();
    G.world = null; G.player = null; G.char = null;
    if (!toLobby) G.selectedChar = null;
    setClassItems(null);
    HUD.show(false); TouchUI.show(false); GameChat.hide();
    clearVfx();
    stopMusic(); stopAmbience();
    if (toLobby && c) {
      this.selectAndEnterLobby(c, false, () => c.isOnline ? onlineCharSelectScreen(c.id) : titleScreen());
    } else {
      if (c && c.isOnline) {
        onlineCharSelectScreen(c.id);
      } else {
        G.mode = 'title';
        titleScreen();
      }
    }
  },

  reconcileDungeonWorld(world) {
    if (!world || world.kind !== 'dungeon') return;
    purgeKilledMonstersFromWorld(world);
  },

  isDungeonAuthority(depth) {
    if (!G.room || !G.world || G.world.kind !== 'dungeon' || G.world.depth !== depth) return false;
    const myId = net.myId;
    if (!myId) return true;
    const hostId = G.room.hostId || G.room.players?.[0]?.id;
    if (hostId === myId) return true;
    // If the room host is present at this dungeon depth, host is always the authority
    if (G.remotePlayers && hostId) {
      const hostRp = G.remotePlayers.get(hostId);
      const st = hostRp?._lastState;
      if (st && st.worldKind === 'dungeon' && st.depth === depth) {
        return false;
      }
    }
    // Host is not present at this depth; fallback to lowest ID among players at this depth
    let lowestId = myId;
    if (G.remotePlayers) {
      for (const [id, rp] of G.remotePlayers.entries()) {
        const st = rp._lastState;
        if (st && st.worldKind === 'dungeon' && st.depth === depth) {
          if (id < lowestId) lowestId = id;
        }
      }
    }
    return lowestId === myId;
  },

  // ------------------------------------------------------------ worlds
  carrySummons(oldWorld) {
    if (!oldWorld) return [];
    return oldWorld.creatures.filter((c) => c.summon && !c.dead && !c.life && c.owner === G.player && !c.static);
  },

  setWorld(world, start, oldWorld) {
    const p = G.player;
    if (oldWorld && oldWorld.rift && oldWorld !== world) riftLeave(oldWorld); // walking out of an unfinished rift is a fail
    const keep = this.carrySummons(oldWorld);
    clearVfx();
    UI.closeAll();
    const loadingActive = !!(this.isLoading || G.loading);
    if (p) {
      p.x = start[0]; p.y = start[1]; p.z = 0;
      p.channel = null; p.path = null; p.moveTarget = null; p.attackTarget = null; p.interact = null; p.lootTarget = null;
      p.status = {}; p.dead = false; p.kbx = p.kby = 0; p.castLock = 0;
      if (loadingActive) {
        p.spawned = false;
        p.targetable = false;
        p.invuln = 1e9;
        p.alpha = 0;
      } else {
        p.spawned = true;
        p.targetable = true;
        p.alpha = 1;
      }
      world.player = p;
      world.add(p);
      for (const s of keep) {
        const [x, y] = world.map.randomNear(p.x, p.y, 1.5);
        s.x = x; s.y = y; s.world = world; s.aggro = null; s.foe = null; s.nav = null; s.fol = null;
        if (loadingActive) {
          s.spawned = false;
          s.targetable = false;
          s.invuln = 1e9;
          s.alpha = 0;
        } else {
          s.spawned = true;
          s.targetable = true;
          s.alpha = 1;
        }
        world.add(s);
      }
    }
    world._generatingDungeon = false;
    if (G.remotePlayers) {
      for (const rp of G.remotePlayers.values()) {
        if (rp.destroySummons) rp.destroySummons();
        if (rp.destroySig) rp.destroySig();
        const rpState = rp._lastState;
        const sameWorld = isSameWorld(rpState || rp, world);
        if (sameWorld) {
          const px = p ? p.x : start[0];
          const py = p ? p.y : start[1];
          const rx = (rpState && typeof rpState.x === 'number') ? rpState.x : (world.map.randomNear(px, py, 1.8)?.[0] || px + 1);
          const ry = (rpState && typeof rpState.y === 'number') ? rpState.y : (world.map.randomNear(px, py, 1.8)?.[1] || py + 1);
          rp.x = rx; rp.y = ry; rp.targetX = rx; rp.targetY = ry;
          rp.world = world;
          world.add(rp);
        } else {
          rp.world = null;
          if (world.creatures) {
            const idx = world.creatures.indexOf(rp);
            if (idx !== -1) world.creatures.splice(idx, 1);
          }
        }
      }
    }
    G.world = world;
    if (typeof document !== 'undefined') document.body.classList.toggle('in-keep', !!world.keep); // no Velscour's skull in Tessariel's hall (T never near V)
    if (p) p.recompute(); // the Heresies in force read the level the hero stands in (game/heresies.js)
    Cine.abort(); // a cut scene belongs to the world it played in
    useTerrain(world.map); // a height map lifts the ground plane (gfx/terrain.js); flat maps clear it
    useTower(world); // the Serpentine Tower lays the grid onto its spiral stair (game/tower.js)
    useCaverns(world); // the Depth's Edge Caverns lift everything onto their smooth height field (game/caverns.js)
    useDunes(world); // so do the Sea of Sand's dunes and pyramids (game/dunes.js)
    useAlpine(world); // and the mountains: the Mountainside and the Snowy Summit (game/alpine.js)
    useSea(world); // the Pirate Seas' three.js scene goes when the hero leaves the Dawnwake (game/seabattle.js)
    camera.computeZoom();
    if (p) {
      camera.follow(p.x, p.y, 0, true);
      world.map.reveal(p.x, p.y, 12);
      preloadBarFx(p, SKILLS);
    }
    world.map.stepMask(); // the steps every path search reads (map.js), worked out here rather than mid fight
    propReach(world); // and the props' culling box (render.js), once the ground's heights are set
    if (G.room && net.connected) {
      net.sendLootRequest(world.kind, world.depth || 0);
    }
  },

  spawnPlayer(world = G.world, start = null) {
    const p = G.player;
    if (!p) return;
    if (start && Array.isArray(start)) {
      p.x = start[0];
      p.y = start[1];
    }
    p.spawned = true;
    p.targetable = true;
    p.invuln = Math.max(p.invuln === 1e9 ? 0 : (p.invuln || 0), 2.0);
    p.alpha = 1;
    p.dead = false;

    if (world && world.creatures) {
      for (const c of world.creatures) {
        if (c.summon && c.owner === p && !c.dead) {
          c.spawned = true;
          c.targetable = true;
          c.invuln = Math.max(c.invuln === 1e9 ? 0 : (c.invuln || 0), 2.0);
          c.alpha = 1;
        }
      }
    }

    addEffect(new Ring(p.x, p.y, 0.2, 2.5, 0.8, '#40a0ff', 4));
    sfx('portal');

    if (G.room && net.connected) {
      net.sendPlayerState({
        name: G.char?.name || 'Hero',
        classId: p.classId,
        level: G.char?.level || 1,
        x: p.x,
        y: p.y,
        z: Math.round(p.z || 0),
        vx: p.vx || 0,
        vy: p.vy || 0,
        facing: p.facing || 0,
        moving: !!p.moving,
        animT: p.animT || 0,
        flip: !!p.flip,
        hp: Math.round(p.hp),
        maxHp: Math.round(p.maxHp),
        mana: Math.round(p.mana),
        maxMana: Math.round(p.maxMana),
        worldKind: world?.keep ? 'keep' : (world?.kind || 'town'),
        townId: world?.keep ? 'keep' : (world?.townId || 'act1'),
        depth: (world?.kind === 'dungeon' ? world.depth : 0) || 0,
        unbound: !!world?.unbound,
        duelId: world?.duelId || null,
        loading: false,
      });
    }
  },

  enterTown(fromNetwork = false) {
    clearWorldObjectBuffs();
    const old = G.world;
    const c = G.char;
    if (c) {
      const highest = Math.min(FINAL_DEPTH, Math.max(c.depth || 1, this.maxPortalFloor(c)));
      c.depth = Math.max(c.depth || 1, highest);
      if (highest > 1) {
        c.cleared[highest - 1] = true;
        c.deepest = Math.max(c.deepest || 0, highest - 1);
      }
      this.autosave();
    }
    const tileset = biomeTileSet(TOWN_BIOME);
    if (old && old.keep) { releaseCastle3D(); releaseKeepArt(); } // the keep's baked hall (~50 MB decoded): it reloads from the cache
    keepTileSets(null); // the last dungeon's recoloured set: rebuilt behind the loading screen if we go back
    if (!townTiles) townTiles = makeTownTiles();
    // every hero has a town of their own: the layout is rolled from c.townSeed
    if (G.room) {
      const townSeed = G.room.townSeed || G.room.seed;
      if (townSeed) {
        G.room.townSeed = townSeed;
        c.townSeed = townSeed;
      }
    }
    if (!townCache || townCache.seed !== c.townSeed) townCache = generateTown(tileset, c.townSeed);
    const t = townCache;
    t.map.seen.fill(0);
    const world = new World('town', { map: t.map, tileset, biome: TOWN_BIOME, depth: 0, townTiles, buildings: t.buildings, props: t.props, wallHangings: t.wallHangings });
    world.raining = G.room ? ((G.room.seed % 4) === 0) : rollTownWeather();
    world.npcs = t.npcs.map((n) => ({ vendor: n.vendor, x: n.x, y: n.y, reach: 1.8, flip: n.flip, use: () => Vendor.open(n.vendor.id) }));
    // the storage chest, beside the well
    {
      let [x, y] = [t.start[0] + 1.5, t.start[1] - 0.5];
      if (!t.map.walkable(x, y)) [x, y] = t.map.randomNear(t.start[0], t.start[1], 2.5);
      world.npcs.push({ stash: true, name: 'Storage Chest', x, y, reach: 1.6, flip: false, use: () => Stash.open() });
      // the Reliquary, the vault every hero shares (ui/reliquary.js), on the well's other side
      let [rx, ry] = [t.start[0] - 1.5, t.start[1] - 0.5];
      if (!t.map.walkable(rx, ry) || Math.hypot(rx - x, ry - y) < 1.5) [rx, ry] = t.map.randomNear(t.start[0] - 1, t.start[1], 2.5);
      world.npcs.push({ stash: true, reliquary: true, name: 'The Reliquary', x: rx, y: ry, reach: 1.6, flip: false, use: () => G.ui.reliquary.open() });
      // the Jewel Box, dedicated vault for gems & runes (ui/jewelbox.js)
      let [jx, jy] = [t.start[0], t.start[1] - 1.6];
      if (!t.map.walkable(jx, jy) || Math.hypot(jx - x, jy - y) < 1.2 || Math.hypot(jx - rx, jy - ry) < 1.2) [jx, jy] = t.map.randomNear(t.start[0], t.start[1] - 1, 2.5);
      world.npcs.push({ stash: true, jewelBox: true, name: 'Jewel Box', x: jx, y: jy, reach: 1.6, flip: false, use: () => JewelBox.open() });
    }
    // the Altar of Heresy (ui/heresies.js), a dark obelisk at the plaza's edge: the Endgame's door (docs/ENDGAME.md)
    if (t.altar) world.npcs.push({ altar: true, name: 'Altar of Heresy', x: t.altar.x, y: t.altar.y, reach: t.altar.solid > 0 ? 2.4 : 1.7, viewH: 120, flip: false, use: () => Heresies.open() });   // (its dais blocks the 3 x 3 under it: world/town.js)
    const visitSeed = G.room ? (G.room.seed >>> 0) : ((c.townVisitCount = (c.townVisitCount || 0) + 1));
    offerCommissions(c); // Town Commissions (game/commissions.js)
    // the townsfolk, visiting adventurers, little set pieces and (about one visit in four) a special event
    const life = startTownLife(world, t, c, visitSeed);
    void preloadTownSheets(life.agents.map((a) => a.townsfolkSpriteId));
    world.portals = [{
      x: t.portal.x, y: t.portal.y, active: true, color: '#ff5020', reach: 2.2,
      get label() {
        const highest = Math.min(FINAL_DEPTH, Math.max(G.char?.depth || 1, G.game?.maxPortalFloor?.(G.char) || 1));
        const d = clamp((G.room && G.room.depth != null) ? G.room.depth : highest, 1, FINAL_DEPTH);
        return `Portal — Depth ${d}`;
      },
      use: () => this.confirmDungeon(),
    }];
    // THE ETERNAL BREACH's purple portal (game.confirmBreach, docs/ETERNAL_BREACH.md)
    if (t.breach) world.portals.push({ x: t.breach.x, y: t.breach.y, active: true, breach: true, color: '#a040ff', reach: 2.2, label: 'THE ETERNAL BREACH', use: () => this.confirmBreach() });
    // the Abyssal Rift gate (game.confirmRift): lit once the Endgame is open
    if (t.rift) world.portals.push({ x: t.rift.x, y: t.rift.y, rift: true, color: '#20e0ff', reach: 1.7, get active() { return endgameUnlocked(); }, set active(v) { }, get label() { return endgameUnlocked() ? `Abyssal Rift — Tier ${riftOpen()}` : 'Abyssal Rift (sealed)'; }, use: () => this.confirmRift() });
    // the portal to TESSARIEL'S KEEP (game/keepgame.js, docs/TESSARIELS_KEEP.md), off the square on one side of the portal road
    const kg = t.keepgate || (t.keepgate = keepgateSpot(t));
    if (kg) world.portals.push({ x: kg.x, y: kg.y, active: true, keepGate: true, color: '#c8f060', reach: 1.8, label: KEEP_NAME, use: () => this.enterKeep() });
    // Waypoint Portal to Sunscorch Oasis (Act II Town) once visited or reached Act 2
    if (c?.visitedAct2Town || c?.depth >= 101) {
      world.portals.push({
        x: t.center.x + 3.8,
        y: t.center.y - 3.8,
        active: true,
        color: '#f3c778',
        reach: 2.0,
        label: 'Waypoint — Sunscorch Oasis (Act II)',
        use: () => {
          sfx('portal');
          this.enterAct2Town();
        },
      });
    }
    // the hero steps out of the portal, a little way down its road toward the square
    const P = t.portal, C = t.center, l = Math.hypot(C.x - P.x, C.y - P.y) || 1;
    let arrive = [P.x + ((C.x - P.x) / l) * 3.2, P.y + ((C.y - P.y) / l) * 3.2];
    // roads bend, so the straight line can end on the grass beside it: take the nearest paved tile (floor variant
    // 1..125; 0 is grass) 2 to 4.6 tiles from the portal
    const m = t.map;
    let best = null, bd = 9;
    for (let ty = Math.floor(arrive[1]) - 3; ty <= Math.floor(arrive[1]) + 3; ty++) for (let tx = Math.floor(arrive[0]) - 3; tx <= Math.floor(arrive[0]) + 3; tx++) {
      if (!m.walkableTile(tx, ty)) continue;
      const v = m.v[ty * m.w + tx], d = Math.hypot(tx + 0.5 - arrive[0], ty + 0.5 - arrive[1]);
      const fromPortal = Math.hypot(tx + 0.5 - P.x, ty + 0.5 - P.y);
      if (v > 0 && v < 126 && d < bd && fromPortal >= 2 && fromPortal <= 4.6) { bd = d; best = [tx + 0.5, ty + 0.5]; }
    }
    if (this._townReturnPos) {
      arrive = this._townReturnPos;
      this._townReturnPos = null;
    } else if (best) arrive = best;
    else if (!m.walkable(...arrive)) arrive = m.randomNear(arrive[0], arrive[1], 1.5) || t.start;
    this.setWorld(world, arrive, old);
    void warmLevelArt(world); // the hero's summons; trims the last level's monster sprites
    HUD.setArea('Herrington Hollow', 'Town — a safe haven');
    playMusic('town'); setAmbience('town');
    Vendor.restock();
    const p = G.player;
    if (p) this.spawnPlayer(world, arrive);
    townHappening(world); // a festival, a blessing, a gift (game/happenings.js)
    p.hp = p.maxHp; p.mana = p.maxMana;
    this.autosave();
  },

  enterArena(duelData, mySpawn) {
    const old = G.world;
    if (old && old.kind === 'town' && G.player) {
      this._townReturnPos = [G.player.x, G.player.y];
    }
    const world = createArenaWorld(duelData);
    const spawn = mySpawn || world.p1Spawn;
    this.setWorld(world, spawn, old);
    world.kind = 'arena';
    world.duelId = duelData?.duelId || null;
    HUD.setArea('The Grand Arena', 'Coliseum of Heresy — Sparring Grounds');
    playMusic('boss');
    setAmbience('cave');
    const p = G.player;
    if (p) {
      p.hp = p.maxHp;
      p.mana = p.maxMana;
      p.castLock = 3.5;
      p.moveVec = [0, 0];
      p.moveTarget = null;
    }
  },

  async enterAct2Town(fromCheat = false) {
    const old = G.world;
    const c = G.char;
    if (c) {
      c.visitedAct2Town = true;
      c.lastTown = 'act2';
      const highest = Math.min(FINAL_DEPTH, Math.max(c.depth || 1, this.maxPortalFloor(c)));
      c.depth = Math.max(c.depth || 1, highest);
      if (highest > 1) {
        c.cleared[highest - 1] = true;
        c.deepest = Math.max(c.deepest || 0, highest - 1);
      }
      this.autosave();
    }
    await loadSeaOfSandPack();
    if (old && old.keep) { releaseCastle3D(); releaseKeepArt(); } // the keep's baked hall
    const tileset = biomeTileSet(ACT2_TOWN_BIOME);
    keepTileSets(null);
    if (!act2TownTiles) act2TownTiles = makeAct2TownTiles();

    if (fromCheat || !c?.act2TownSeed) {
      if (c) c.act2TownSeed = Math.floor(Math.random() * 1e9) + 1;
    }
    if (G.room) {
      const townSeed = G.room.act2TownSeed || (fromCheat ? c?.act2TownSeed : G.room.townSeed) || G.room.seed;
      if (townSeed) {
        G.room.act2TownSeed = townSeed;
        if (c) c.act2TownSeed = townSeed;
      }
    }
    const seed = c?.act2TownSeed || 1337;
    if (!act2TownCache || act2TownCache.seed !== seed) {
      act2TownCache = generateAct2Town(tileset, seed);
    }
    const t = act2TownCache;
    t.map.seen.fill(0);
    const world = new World('town', {
      map: t.map,
      tileset,
      biome: ACT2_TOWN_BIOME,
      depth: 0,
      townTiles: act2TownTiles,
      townId: 'act2_town',
      buildings: t.buildings || [],
      props: t.props,
      wallHangings: t.wallHangings || [],
    });
    world.raining = false;
    world.ambientFx = { type: 'sand', color: '#f3c778' };
    world.npcs = t.npcs.map((n) => ({
      vendor: n.vendor,
      x: n.x,
      y: n.y,
      reach: 1.8,
      flip: n.flip,
      use: () => Vendor.open(n.vendor.id),
    }));

    // Storage Chest, Reliquary, Jewel Box
    let [x, y] = [t.start[0] + 1.5, t.start[1] - 0.5];
    if (!t.map.walkable(x, y)) [x, y] = t.map.randomNear(t.start[0], t.start[1], 2.5);
    world.npcs.push({ stash: true, name: 'Storage Chest', x, y, reach: 1.6, flip: false, use: () => Stash.open() });

    let [rx, ry] = [t.start[0] - 1.5, t.start[1] - 0.5];
    if (!t.map.walkable(rx, ry) || Math.hypot(rx - x, ry - y) < 1.5) [rx, ry] = t.map.randomNear(t.start[0] - 1, t.start[1], 2.5);
    world.npcs.push({ stash: true, reliquary: true, name: 'The Reliquary', x: rx, y: ry, reach: 1.6, flip: false, use: () => G.ui.reliquary.open() });

    let [jx, jy] = [t.start[0], t.start[1] - 1.6];
    if (!t.map.walkable(jx, jy) || Math.hypot(jx - x, jy - y) < 1.2 || Math.hypot(jx - rx, jy - ry) < 1.2) [jx, jy] = t.map.randomNear(t.start[0], t.start[1] - 1, 2.5);
    world.npcs.push({ stash: true, jewelBox: true, name: 'Jewel Box', x: jx, y: jy, reach: 1.6, flip: false, use: () => JewelBox.open() });

    if (t.altar) {
      world.npcs.push({ altar: true, name: 'Altar of Heresy', x: t.altar.x, y: t.altar.y, reach: t.altar.solid > 0 ? 2.4 : 1.7, viewH: 120, flip: false, use: () => Heresies.open() });
    }

    // Portals
    world.portals = [
      {
        x: t.portal.x,
        y: t.portal.y,
        active: true,
        color: '#ff6020',
        reach: 2.2,
        get label() {
          const highest = Math.min(FINAL_DEPTH, Math.max(G.char?.depth || 1, G.game?.maxPortalFloor?.(G.char) || 1));
          const d = clamp((G.room && G.room.depth != null) ? G.room.depth : highest, 1, FINAL_DEPTH);
          return `Portal — Depth ${d}`;
        },
        use: () => this.confirmDungeon(),
      },
    ];

    // Waypoint Portal to Herrington Hollow (Act 1 Town)
    if (t.act1Portal) {
      world.portals.push({
        x: t.act1Portal.x,
        y: t.act1Portal.y,
        active: true,
        color: '#38bdf8',
        reach: 2.2,
        label: 'Waypoint — Return to Herrington Hollow (Act I)',
        use: () => {
          if (c) c.lastTown = 'act1';
          sfx('portal');
          this.enterTown();
        },
      });
    }

    // The Eternal Breach Portal
    if (t.breach) {
      world.portals.push({
        x: t.breach.x,
        y: t.breach.y,
        active: true,
        breach: true,
        color: '#a040ff',
        reach: 2.2,
        label: 'THE ETERNAL BREACH',
        use: () => this.confirmBreach(),
      });
    }

    // Abyssal Rift Gate
    if (t.rift) {
      world.portals.push({
        x: t.rift.x,
        y: t.rift.y,
        rift: true,
        color: '#20e0ff',
        reach: 1.7,
        get active() { return endgameUnlocked(); },
        get label() { return endgameUnlocked() ? `Abyssal Rift — Tier ${riftOpen()}` : 'Abyssal Rift (sealed)'; },
        use: () => this.confirmRift(),
      });
    }

    // the portal to Tessariel's Keep from the Oasis too
    const kg2 = t.keepgate || (t.keepgate = keepgateSpot({ ...t, npcs: t.npcs || [], start: t.start || [t.center.x, t.center.y], portal: t.portal, center: t.center }));
    if (kg2) world.portals.push({ x: kg2.x, y: kg2.y, active: true, keepGate: true, color: '#c8f060', reach: 2.0, label: KEEP_NAME, use: () => { c.lastTown = 'act2'; return this.enterKeep(); } });

    const arrive = t.start || [t.center.x, t.center.y];
    this.setWorld(world, arrive, old);
    void warmLevelArt(world);
    HUD.setArea('Sunscorch Oasis', 'Act II Town — Desert Haven');
    playMusic('town');
    setAmbience('sea_of_sand');
    Vendor.restock();
    const p = G.player;
    if (p) this.spawnPlayer(world, arrive);
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    this.autosave();
    if (net.connected && G.room) {
      net.sendTownTransition(world.depth || 0);
    }
    UI.log('You step into <b style="color:#f3c778">Sunscorch Oasis</b>, haven of the Scorched Wastes!', '#ffe080');
  },

  getPlayersAwayFromPortal(portal) {
    if (!G.room || !net.connected) return [];
    if (!portal) return [];
    const maxDist = Math.max(portal.reach || 2.2, 3.0);
    const px = portal.x, py = portal.y;
    const away = [];

    // Check local player
    if (G.player && dist(G.player.x, G.player.y, px, py) > maxDist) {
      away.push(G.char?.name || G.player.name || 'You');
    }

    // Check room roster
    const checked = new Set();
    const roomPlayers = net.currentRoom?.players || G.room?.players || [];
    for (const p of roomPlayers) {
      if (p.id === net.myId) continue;
      checked.add(p.id);
      const rp = G.remotePlayers?.get(p.id);
      if (!rp) {
        away.push(p.name || 'Party Member');
      } else if (dist(rp.x, rp.y, px, py) > maxDist) {
        away.push(rp.name || p.name || 'Party Member');
      }
    }

    // Check active remote players in G.remotePlayers
    if (G.remotePlayers) {
      for (const [id, rp] of G.remotePlayers.entries()) {
        if (checked.has(id)) continue;
        if (dist(rp.x, rp.y, px, py) > maxDist) {
          away.push(rp.name || 'Party Member');
        }
      }
    }

    return [...new Set(away)];
  },

  getSharedRoomBiome(room, depth, fallbackBiomeId = null) {
    if (depth === FINAL_DEPTH) return BIOME_BY_ID.throne;
    if (room?.floors?.has(depth)) {
      const fl = room.floors.get(depth);
      if (fl?.biome && BIOME_BY_ID[fl.biome]) return BIOME_BY_ID[fl.biome];
    }
    if (room && room.biome && room.biome !== 'town' && BIOME_BY_ID[room.biome] && (!room.depth || room.depth === depth)) {
      return BIOME_BY_ID[room.biome];
    }
    if (room && room.dungeonBiome && room.dungeonBiome !== 'town' && BIOME_BY_ID[room.dungeonBiome] && (!room.depth || room.depth === depth)) {
      return BIOME_BY_ID[room.dungeonBiome];
    }
    if (room) {
      const eligible = biomesForDepth(depth).map((id) => BIOME_BY_ID[id]).filter((b) => b && !b.beta && b.id !== 'throne');
      const pool = eligible.length ? eligible : BIOMES.filter((b) => !b.overworld && !b.beta && b.id !== 'throne');
      const s = room.seed || room.townSeed || 1;
      const idx = Math.abs(((s * 31 + depth * 7919) ^ 0x5bd1e995) | 0);
      return pool[idx % pool.length] || BIOME_BY_ID.catacombs;
    }
    if (fallbackBiomeId && BIOME_BY_ID[fallbackBiomeId]) {
      return BIOME_BY_ID[fallbackBiomeId];
    }
    return BIOME_BY_ID.catacombs;
  },

  getSharedRoomDungeonSeed(room, depth) {
    if (room?.floors?.has(depth)) {
      const fl = room.floors.get(depth);
      if (fl?.seed) return fl.seed;
    }
    if (room && room.dungeonSeed && room.depth === depth) {
      return room.dungeonSeed;
    }
    const s = room?.seed || room?.townSeed || 1;
    return (((s * 31 + depth * 7919) ^ 0x41c64e6d) >>> 0) || 1234567;
  },

  /** Step through to TESSARIEL'S KEEP (game/keepgame.js): the hall built from its bake and the hero's own choices. */
  async enterKeep() {
    const old = G.world, c = G.char;
    if (!c) return;
    if (old && old.kind === 'town' && !old.keep && old.biome && old.biome.id === 'act2_town') c.lastTown = 'act2';
    else if (old && old.kind === 'town' && !old.keep) c.lastTown = 'act1';
    sfx('portal');
    LoadingScreen.show({ title: KEEP_NAME, subtitle: 'The hall of the Sacred Flame', text: "Crossing to Tessariel's Keep…", progress: 20 });
    try {
      LoadingScreen.setProgress(45, 'Kindling the Flame…');
      const { world, start } = await buildKeep(this);
      LoadingScreen.setProgress(80, 'Hanging the banners…');
      this.setWorld(world, start, old);
      await warmLevelArt(world);
      // your other heroes' looks (savedGearPreview: each class's atlases loaded and composed, one hero after another)
      // and their first draw and rim, here behind the loading screen: arriving in the hall, they made its first second
      // stutter, a missed frame a hero and a 125 ms hitch for the first. Capped, so a slow fetch never holds the door.
      const arts = world.keepFolk && world.keepFolk.arts, wait = (ms) => new Promise((r) => setTimeout(r, ms));
      if (arts && arts.length) {
        LoadingScreen.setProgress(90, 'Gathering your heroes…');
        await Promise.race([Promise.all(arts), wait(5000)]);
        warmKeepHeroes(world);   // and their rims, at this zoom (else each was baked at its first sight in the hall)
        await Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), wait(250)]);
      }
      HUD.setArea(KEEP_NAME, 'The hall of the Sacred Flame');
      playMusic('town'); setAmbience('tkeep');
      const p = G.player; p.hp = p.maxHp; p.mana = p.maxMana;
      keepArrive(world);
      const k = keepState(c);
      UI.log(`You step into <b style="color:#c8f060">${KEEP_NAME}</b>.${k.owed.length ? ` <b>${k.owed.length}</b> reward${k.owed.length > 1 ? 's' : ''} wait${k.owed.length > 1 ? '' : 's'} with the Castellan.` : ''}`, '#e0f0c0');
      LoadingScreen.setProgress(100, 'Arriving…');
    } catch (e) {
      console.warn(e);
      UI.log("The Keep's portal flickers and holds shut. Try again.", '#ff8060');
    } finally {
      await LoadingScreen.hide();
      this.autosave();
    }
  },

  /** The one-line "what to do here" blurb for a biome (the town portal's floor picker). */
  biomeBlurb(biome) {
    return biome.id === 'sea_of_sand' ? 'Follow the cliff maze and clear every marked scenario area to open the exit.' : biome.id === 'mountainside' ? 'Climb the switchback trail to the summit and defeat its Warden. Ledges a hop high can be climbed; taller cliffs cannot.' : biome.id === 'skyship' ? "Step out onto the heroes' airship. Hold the deck against the Air Pirates' boarding waves, their captains and their flagship; victory turns the gate into the exit." : biome.id === 'dark_forest' ? 'Find your way through the woods and labyrinths to the Heart of the Forest. Its trial opens the way on; the glades along the trails hold trials of their own, and their rewards.' : biome.tower ? 'Climb the spiral stair to the roof. Three waves of bosses hold it, and then their master comes on an airship.' : biome.cave ? 'Follow the passages and caverns to the underground lake. At the foot of its waterfall a passage climbs a long, spiralling shaft to the top of the falls, where its masters wait.' : biome.overworld ? 'Activate the scenario shrine and complete its trial to open the exit.' : 'Find the exit. It is sealed until its guardian is slain.';
  },

  /** The deepest floor the town portal can open on: any floor down to the one the hero has reached. */
  maxPortalFloor(c = G.char) {
    const roomDepth = (G.room && G.room.depth != null) ? G.room.depth : 0;
    const maxAllowed = (c.deepest || 0) >= FINAL_DEPTH ? FINAL_DEPTH : (c.deepest || 0) + 1;
    return clamp(Math.max(c.depth || 1, maxAllowed, roomDepth), 1, FINAL_DEPTH);
  },

  /**
   * The town portal's floor picker: a slider (1 .. deepest reached) kept in sync with a number box
   * (typing, its arrow spinners, ArrowUp/Down, PageUp/Down, Home/End) and -/+ steppers.
   */
  confirmDungeon(initialTab = 'campaign') {
    const c = G.char;
    const maxFloor = Math.min(FINAL_DEPTH, Math.max(c.depth || 1, this.maxPortalFloor(c)));
    const targetDepth = (G.room && G.room.depth != null) ? clamp(G.room.depth, 1, FINAL_DEPTH) : maxFloor;
    const current = targetDepth;
    c.depth = targetDepth;
    if (regionNeeds(BIOME_BY_ID[c.nextBiome], c.level)) c.nextBiome = drawBiome(c, c.depth); // a region above his level (game/regions.js)
    const currentBiome = this.getSharedRoomBiome(G.room, current, c.nextBiome);
    if (G.room) c.nextBiome = currentBiome.id;

    let mode = initialTab === 'unbound' && endgameUnlocked(c) ? 'unbound' : 'campaign';
    const canUnbound = endgameUnlocked(c);
    const keysCount = keysOf(c);
    const hearthActive = hearthPortalActive();
    const unboundMax = Math.min(MAX_UNBOUND_DEPTH, Math.max(1, c.unboundExploration?.deepest || 1));
    const waypoints = unboundWaypoints(c);
    let unboundValue = Math.min(unboundMax, c.unboundExploration?.currentFloor || unboundMax);

    const describe = (d) => {
      const act = getActForDepth(d);
      const isSuper = isSuperbossDepth(d);
      let tail = '';
      if (d === FINAL_DEPTH) {
        tail = '<br><b style="color:#ff2000">CAMPAIGN CLIMAX: Demon Lord Velscour awaits on his throne.</b>';
      } else if (isSuper) {
        const sId = superbossForDepth(d);
        const sTpl = sId ? RAID_BOSSES.find((b) => b.id === sId) : null;
        const sName = sTpl ? `${sTpl.name}, ${sTpl.title}` : 'A Legendary Superboss';
        tail = `<br><b style="color:#ff4020">${d % 100 === 0 ? 'ACT FINALE SUPERBOSS' : 'SUPERBOSS'}: ${escapeHtml(sName)} awaits.</b>`;
      } else if (isRaidDepth(d)) {
        tail = '<br><b style="color:#ff6030">A BOSS ROOM lies at the end of this depth.</b>';
      }

      const peerNames = [];
      if (G.remotePlayers) {
        for (const rp of G.remotePlayers.values()) {
          if (rp.worldKind === 'dungeon' && rp.depth === d) {
            peerNames.push(rp.name || 'Party Member');
          }
        }
      }
      const activeH = getActiveHearth();
      const myHearthHere = activeH && activeH.depth === d;
      let peerTail = '';
      if (peerNames.length > 0) {
        peerTail = `<br><span style="color:#7fd8ff">● <b>${escapeHtml(peerNames.join(', '))}</b> ${peerNames.length > 1 ? 'are' : 'is'} exploring this floor. You will join their active expedition!</span>`;
      } else if (myHearthHere) {
        peerTail = '<br><span style="color:#7fd8ff">● Your <b>Hearthstone portal</b> is active here. You will return to where you left off.</span>';
      }

      const actHeader = `<div style="color:#ffd880;font-size:12px;font-weight:bold;margin-bottom:4px;letter-spacing:0.5px;">ACT ${act.act}: ${act.name.toUpperCase()}</div>`;
      if (d === current) {
        return `${actHeader}<p>The portal hums. Beyond lies <b style="color:#ffb070">${escapeHtml(currentBiome.name)}</b>.</p><p class="dim">${this.biomeBlurb(currentBiome)}${tail}${peerTail}</p>`;
      }
      return `${actHeader}<p>The portal's glow shifts. A fresh path will be drawn into <b style="color:#ffb070">Depth ${d}</b>.</p><p class="dim">Monsters, loot and the biome are rolled for this depth when you step through.${tail}${peerTail}</p>`;
    };

    const describeUnbound = (f) => {
      const d = unboundDepth(f);
      let note = '';
      if (f === MAX_UNBOUND_DEPTH) {
        note = '<br><b style="color:#ff2000">CLIMAX: Demon Lord Velscour Unbound & The Court of the Abyss await.</b>';
      } else if (isUnboundCheckpointFloor(f)) {
        note = `<br><b style="color:#20e0ff">CHECKPOINT MILESTONE: Victory unlocks waypoint F${f} and creates a portal back to town.</b>`;
      } else {
        note = `<br><b style="color:#ffa060">INTERMEDIATE FLOOR: Portals plunge directly down to Floor ${f + 1} with no return to town. Use Hearthstone (H) to escape.</b>`;
      }
      return `<div style="color:#8fe0ff;font-size:12px;font-weight:bold;margin-bottom:4px;">UNBOUND FLOOR ${f} (Hardmode Depth ${d})</div>` +
        `<p class="dim" style="font-size:12px;margin:4px 0;">Hardmode endgame dive. Enemies hit harder, move faster, and drop high-tier spoils.${note}</p>`;
    };

    const roomNote = G.room ? '<p class="dim floor-pick-note">Your whole party follows you to the floor you choose.</p>' : '';
    const actPillsHtml = `
      <div class="floor-pick-acts" style="display:flex;gap:5px;justify-content:center;margin-bottom:10px;flex-wrap:wrap;">
        ${ACTS.map((a) => {
          const unlocked = maxFloor >= a.start;
          return `<button type="button" class="btn act-pill" data-act="${a.act}" data-start="${a.start}" style="font-size:11px;padding:3px 8px;min-width:58px;${unlocked ? '' : 'opacity:0.35;'}" ${unlocked ? '' : 'disabled'} title="${escapeHtml(a.name)}">Act ${a.act}</button>`;
        }).join('')}
      </div>`;

    const wpPillsHtml = `
      <div class="floor-pick-wps" style="display:flex;gap:5px;justify-content:center;margin-bottom:10px;flex-wrap:wrap;">
        ${waypoints.map((f) => `<button type="button" class="btn unbound-wp-pill" data-floor="${f}" style="font-size:11px;padding:3px 8px;min-width:44px;">F${f}</button>`).join('')}
      </div>`;

    const dialog = UI.dialog({
      title: 'Portal to the Depths',
      cls: 'floor-pick-dialog',
      html: `
        <div class="floor-pick">
          <div class="portal-mode-tabs" style="display:flex;gap:8px;justify-content:center;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:10px;">
            <button type="button" class="btn portal-tab-btn tab-campaign" data-mode="campaign" style="flex:1;padding:6px 12px;font-size:12px;font-weight:bold;">Campaign (1–500)</button>
            <button type="button" class="btn portal-tab-btn tab-unbound" data-mode="unbound" style="flex:1;padding:6px 12px;font-size:12px;font-weight:bold;${canUnbound ? '' : 'opacity:0.4;'}" ${canUnbound ? '' : 'disabled title="Complete Depth 500 Campaign to unlock"'}><span style="color:#20e0ff;">✦</span> Unbound Exploration (1–100)</button>
          </div>

          <div class="portal-pane portal-campaign-pane">
            ${actPillsHtml}
            <div class="floor-pick-head">
              <span class="floor-pick-label">Depth</span>
              <div class="floor-pick-num">
                <button type="button" class="btn floor-pick-step" data-step="-1" title="Previous floor">&#8722;</button>
                <input type="number" class="floor-pick-input" min="1" max="${maxFloor}" step="1" value="${current}" inputmode="numeric" aria-label="Depth to enter">
                <button type="button" class="btn floor-pick-step" data-step="1" title="Next floor">+</button>
              </div>
              <span class="floor-pick-max">of ${maxFloor}</span>
            </div>
            <input type="range" class="floor-pick-range" min="1" max="${maxFloor}" step="1" value="${current}" aria-label="Depth slider" ${maxFloor <= 1 ? 'disabled' : ''}>
            <div class="floor-pick-ticks"><span>1</span><span>Deepest reached: ${maxFloor}</span></div>
            <div class="floor-pick-desc"></div>
            ${roomNote}
          </div>

          <div class="portal-pane portal-unbound-pane" style="display:none;">
            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(32,224,255,0.08);border:1px solid rgba(32,224,255,0.25);border-radius:6px;padding:6px 12px;margin-bottom:10px;font-size:12px;">
              <span>Keys: <b style="color:#20e0ff;">${keysCount} Abyssal Key${keysCount === 1 ? '' : 's'}</b></span>
              <span>Cost: <b style="color:#ffd880;">${hearthActive ? 'FREE (Hearthstone)' : '1 Key per Run'}</b></span>
            </div>
            ${hearthActive ? '<div style="color:#7fd8ff;font-size:11px;margin-bottom:8px;padding:4px 8px;background:rgba(127,216,255,0.12);border:1px solid #7fd8ff;border-radius:4px;text-align:center;">✦ Hearthstone Recall Portal is active in town — return to where you left off for free!</div>' : ''}
            <div style="color:#8fe0ff;font-size:11px;font-weight:bold;margin-bottom:4px;letter-spacing:0.5px;">CHECKPOINT WAYPOINTS</div>
            ${wpPillsHtml}
            <div class="floor-pick-head">
              <span class="floor-pick-label" style="color:#20e0ff;">Floor</span>
              <div class="floor-pick-num">
                <button type="button" class="btn unbound-floor-step" data-step="-1" title="Previous floor">&#8722;</button>
                <input type="number" class="unbound-floor-input" min="1" max="${unboundMax}" step="1" value="${unboundValue}" inputmode="numeric" aria-label="Unbound Floor to enter">
                <button type="button" class="btn unbound-floor-step" data-step="1" title="Next floor">+</button>
              </div>
              <span class="floor-pick-max">of ${unboundMax}</span>
            </div>
            <input type="range" class="unbound-floor-range" min="1" max="${unboundMax}" step="1" value="${unboundValue}" aria-label="Unbound Floor slider" ${unboundMax <= 1 ? 'disabled' : ''}>
            <div class="floor-pick-ticks"><span>1</span><span>Deepest reached: Floor ${unboundMax}</span></div>
            <div class="unbound-floor-desc"></div>
          </div>
        </div>`,
      buttons: [
        { label: 'Cancel' },
        { label: 'Enter', cls: 'red floor-pick-go', fn: () => {
          if (mode === 'unbound') this.enterUnboundExploration(unboundValue);
          else this.enterDungeonAt(value);
        } },
      ],
    });

    const box = dialog.box;
    const tabCampaign = box.querySelector('.tab-campaign');
    const tabUnbound = box.querySelector('.tab-unbound');
    const paneCampaign = box.querySelector('.portal-campaign-pane');
    const paneUnbound = box.querySelector('.portal-unbound-pane');

    const range = box.querySelector('.floor-pick-range');
    const num = box.querySelector('.floor-pick-input');
    const desc = box.querySelector('.floor-pick-desc');
    const goBtn = box.querySelector('.floor-pick-go');
    const actPills = box.querySelectorAll('.act-pill');

    const unboundRange = box.querySelector('.unbound-floor-range');
    const unboundNum = box.querySelector('.unbound-floor-input');
    const unboundDesc = box.querySelector('.unbound-floor-desc');
    const wpPills = box.querySelectorAll('.unbound-wp-pill');

    let value = current;

    const setMode = (m) => {
      mode = m;
      if (mode === 'campaign') {
        tabCampaign.classList.add('sel');
        tabCampaign.style.borderColor = '#ffb070';
        tabUnbound.classList.remove('sel');
        tabUnbound.style.borderColor = '';
        paneCampaign.style.display = '';
        paneUnbound.style.display = 'none';
        set(value);
      } else {
        tabUnbound.classList.add('sel');
        tabUnbound.style.borderColor = '#20e0ff';
        tabCampaign.classList.remove('sel');
        tabCampaign.style.borderColor = '';
        paneCampaign.style.display = 'none';
        paneUnbound.style.display = '';
        setUnbound(unboundValue);
      }
    };

    tabCampaign.addEventListener('click', () => { sfx('ui'); setMode('campaign'); });
    if (canUnbound) tabUnbound.addEventListener('click', () => { sfx('ui'); setMode('unbound'); });

    const set = (v, fromTyping = false) => {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n)) return;
      value = clamp(n, 1, maxFloor);
      range.value = value;
      if (!fromTyping || String(value) !== num.value) num.value = value;
      range.style.setProperty('--pct', maxFloor > 1 ? `${((value - 1) / (maxFloor - 1)) * 100}%` : '100%');
      desc.innerHTML = describe(value);
      if (mode === 'campaign') {
        if (goBtn) {
          goBtn.disabled = false;
          goBtn.textContent = `Enter Depth ${value}`;
        }
      }
      const curAct = getActForDepth(value);
      actPills.forEach((p) => {
        p.classList.toggle('sel', Number(p.dataset.act) === curAct.act);
        if (Number(p.dataset.act) === curAct.act) p.style.borderColor = '#ffb070';
        else p.style.borderColor = '';
      });
    };

    const setUnbound = (v, fromTyping = false) => {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n)) return;
      unboundValue = clamp(n, 1, unboundMax);
      unboundRange.value = unboundValue;
      if (!fromTyping || String(unboundValue) !== unboundNum.value) unboundNum.value = unboundValue;
      unboundRange.style.setProperty('--pct', unboundMax > 1 ? `${((unboundValue - 1) / (unboundMax - 1)) * 100}%` : '100%');
      unboundDesc.innerHTML = describeUnbound(unboundValue);
      if (mode === 'unbound') {
        const canEnter = canEnterUnbound(c);
        if (goBtn) {
          if (!canEnter) {
            goBtn.disabled = true;
            goBtn.textContent = '1 Abyssal Key Required';
          } else {
            goBtn.disabled = false;
            goBtn.textContent = `Enter Unbound Floor ${unboundValue} ${hearthActive ? '(Free)' : '(1 Key)'}`;
          }
        }
      }
      wpPills.forEach((p) => {
        const pf = Number(p.dataset.floor);
        p.classList.toggle('sel', pf === unboundValue);
        if (pf === unboundValue) p.style.borderColor = '#20e0ff';
        else p.style.borderColor = '';
      });
    };

    actPills.forEach((p) => p.addEventListener('click', () => {
      sfx('ui');
      const start = Number(p.dataset.start);
      if (maxFloor >= start) set(Math.min(maxFloor, start));
    }));
    range.addEventListener('input', () => set(range.value));
    num.addEventListener('input', () => { if (num.value !== '') set(num.value, true); });
    num.addEventListener('change', () => set(num.value === '' ? value : num.value));
    num.addEventListener('blur', () => set(num.value === '' ? value : num.value));
    box.querySelectorAll('.floor-pick-step').forEach((b) => b.addEventListener('click', () => { sfx('ui'); set(value + Number(b.dataset.step)); }));

    wpPills.forEach((p) => p.addEventListener('click', () => {
      sfx('ui');
      const fl = Number(p.dataset.floor);
      setUnbound(fl);
    }));
    unboundRange.addEventListener('input', () => setUnbound(unboundRange.value));
    unboundNum.addEventListener('input', () => { if (unboundNum.value !== '') setUnbound(unboundNum.value, true); });
    unboundNum.addEventListener('change', () => setUnbound(unboundNum.value === '' ? unboundValue : unboundNum.value));
    unboundNum.addEventListener('blur', () => setUnbound(unboundNum.value === '' ? unboundValue : unboundNum.value));
    box.querySelectorAll('.unbound-floor-step').forEach((b) => b.addEventListener('click', () => { sfx('ui'); setUnbound(unboundValue + Number(b.dataset.step)); }));

    // keyboard: keep keys out of the game while the picker is up; arrows/Page/Home/End step the floor; Enter goes, Escape cancels
    box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
      if (step && (e.target === num || e.target === range || e.target === box || e.target === unboundNum || e.target === unboundRange)) {
        e.preventDefault();
        if (mode === 'unbound') setUnbound(unboundValue + step);
        else set(value + step);
      }
      else if (e.key === 'Home') { e.preventDefault(); if (mode === 'unbound') setUnbound(1); else set(1); }
      else if (e.key === 'End') { e.preventDefault(); if (mode === 'unbound') setUnbound(unboundMax); else set(maxFloor); }
      else if (e.key === 'Enter') { e.preventDefault(); goBtn?.click(); }
      else if (e.key === 'Escape') { e.preventDefault(); dialog.close(); }
    });
    setMode(mode);
    setTimeout(() => { if (mode === 'unbound') { unboundNum.focus(); unboundNum.select(); } else { num.focus(); num.select(); } }, 30);
  },

  /** Step through the town portal onto a chosen floor (1 .. deepest reached). */
  enterDungeonAt(depth) {
    const c = G.char;
    const current = (G.room && G.room.depth != null) ? G.room.depth : (c.depth || 1);
    depth = clamp(depth | 0, 1, Math.min(FINAL_DEPTH, this.maxPortalFloor(c)));

    const peerOnFloor = G.remotePlayers && Array.from(G.remotePlayers.values()).find(rp => rp.worldKind === 'dungeon' && rp.depth === depth);
    const activeH = getActiveHearth();
    const myHearth = activeH && activeH.depth === depth;
    const roomHearth = G.room?.hearthPortals?.has ? G.room.hearthPortals.has(depth) : false;
    const existingFloor = G.room?.floors?.get ? G.room.floors.get(depth) : null;
    const preserve = (peerOnFloor || myHearth || roomHearth) && existingFloor;

    if (depth !== current || !preserve) {
      c.depth = depth;
      if (preserve) {
        c.nextBiome = existingFloor.biome;
        if (G.room) {
          G.room.depth = depth;
          G.room.biome = existingFloor.biome;
          G.room.dungeonSeed = existingFloor.seed;
          G.room.mixId = existingFloor.mixId || null;
          G.room.heresies = existingFloor.heresies || [];
        }
      } else {
        // a different floor than the one the portal was set to: draw it a fresh biome and forget the old omen
        delete c.nextOmen;
        c.nextBiome = depth === FINAL_DEPTH ? 'throne' : drawBiome(c, depth);
        if (G.room) {
          G.room.depth = depth;
          G.room.biome = null;
          G.room.dungeonSeed = null;
          G.room.mixId = null;
          G.room.floors?.delete(depth);
        }
      }
    } else {
      c.depth = depth;
      if (existingFloor && G.room) {
        G.room.biome = existingFloor.biome;
        G.room.dungeonSeed = existingFloor.seed;
        G.room.mixId = existingFloor.mixId || null;
        G.room.heresies = existingFloor.heresies || [];
      }
    }
    this.enterDungeon();
  },

  openVelscourContact() {
    const taunt = VELSCOUR_TAUNTS[(Math.random() * VELSCOUR_TAUNTS.length) | 0];
    const dialog = UI.dialog({
      title: 'WHY ARE YOU TRYING TO CONTACT VELSCOUR',
      cls: 'velscour-contact-dialog',
      html: `<p class="velscour-taunt">${escapeHtml(taunt)}</p><label class="velscour-message-label" for="velscour-message">Send a message into the abyss</label><div class="velscour-message-row"><input id="velscour-message" class="name-input" type="text" maxlength="50" autocomplete="off" placeholder="50 characters, tops"><span id="velscour-message-count">0 / 50</span></div>`,
      buttons: [
        { label: 'Close' },
        { label: 'Send', cls: 'red', keepOpen: true, fn: (close) => {
          const message = document.getElementById('velscour-message')?.value || '';
          if (['HAIL VELSCOUR!', '13', '65', '69', '666', '6669'].includes(message)) {
            close();
            this.openVelscourTeleport();
          } else if (message === DEATH_PHRASE) { // exact, case sensitive
            close();
            if (Auto.on) Auto.toggle(false);
            grantDeathGift();
            if (G.world?.kind !== 'town') this.enterTown(); // the town portal now opens on Depth 500
            else this.autosave();
          } else if (parseRegionWord(message)) {
            const { region, want } = parseRegionWord(message);
            close();
            if (want) (G.regionWant ||= {})[region.id] = want; // 'train 3': that variant
            this.teleportToBiome(BIOME_BY_ID[region.id]); // a new region (game/regions.js; the mountains too)
          } else if (/^(seas?|naval|dawnwake)(\s|$)/i.test(message.trim())) {
            // the Pirate Seas; 'sea fog', 'sea redwater'... picks its battle
            const want = message.trim().toLowerCase().split(/\s+/)[1];
            G.char.seaVariant = SEA_VARIANTS.find((v) => v.id === want || v.weather === want || v.name.toLowerCase().includes(want || '#'))?.id;
            close();
            this.teleportToBiome(BIOME_BY_ID.pirate_seas);
          } else if (/^(sky|airship|air|pirates?)(\s|$)/i.test(message.trim())) {
            // the Sky Battle; 'sky storm', 'sky night'... picks its scenario
            const want = message.trim().toLowerCase().split(/\s+/)[1];
            G.char.skyVariant = SKY_ALL.find((v) => v.id === want || v.weather.toLowerCase().includes(want || '#') || v.name.toLowerCase().includes(want || '#'))?.id;
            close();
            this.teleportToBiome(BIOME_BY_ID.skyship);
          } else if (['final boss', 'finalboss', 'velscour'].includes(message.trim().toLowerCase())) {
            close();
            this.finalBoss(); // straight into Velscour's arena, scaled to this depth
          } else if (['unbound', 'velscour unbound'].includes(message.trim().toLowerCase())) {
            close();
            this.enterUnbound(); // the rematch, for three Abyssal Keys (docs/ENDGAME.md)
          } else if (['heresy', 'heresies', 'altar'].includes(message.trim().toLowerCase())) { close(); Heresies.open(); }
          else if (['marks', 'infernal marks'].includes(message.trim().toLowerCase())) { close(); Marks.open(); }
          else if (['macro', 'macros'].includes(message.trim().toLowerCase())) { close(); MacrosUI.open(); }
          else if (['rift', 'rifts', 'abyssal rift'].includes(message.trim().toLowerCase())) { close(); this.confirmRift(); }
          else if (message.trim().toLowerCase() === 'tower') {
            close();
            this.teleportToBiome(BIOME_BY_ID.serpentine_tower);
          } else if (['caverns', 'caves', 'cave', 'depths edge', "depth's edge"].includes(message.trim().toLowerCase())) {
            close();
            this.teleportToBiome(BIOME_BY_ID.depths_edge);
          } else if (['pyramid', 'pyramids', 'dunes', 'tomb'].includes(message.trim().toLowerCase())) {
            close();
            G.sandVariant = 1 + Math.floor(Math.random() * DUNE_VARIANTS.length);   // one of the dune variants, not the flat maze
            this.teleportToBiome(BIOME_BY_ID.sea_of_sand).finally(() => { G.sandVariant = undefined; });
          } else if (['actiitown', 'act2town', 'act2_town', 'act 2 town', 'act ii town', 'deserttown', 'desert_town'].includes(message.trim().toLowerCase())) {
            close();
            this.enterAct2Town(true);
          } else if (/^scen(?:ario)?\s+([a-z0-9_-]+)$/i.test(message.trim())) {
            const scenId = message.trim().split(/\s+/)[1].toLowerCase();
            close();
            this.enterCustomScenario(scenId);
          }
        } },
      ],
    });
    const inputEl = dialog.box.querySelector('#velscour-message');
    const countEl = dialog.box.querySelector('#velscour-message-count');
    inputEl?.addEventListener('input', () => { countEl.textContent = `${inputEl.value.length} / 50`; });
  },

  async openVelscourTeleport() {
    const skullScens = await listSkullScenarios().catch(() => []);
    const scenOptions = skullScens.map((s) => `<option value="scen:${escapeHtml(s.id)}">📜 Authored: ${escapeHtml(s.name)} (${escapeHtml(s.biomeId)})</option>`).join('');
    const options = scenOptions
      + `<option value="act2_town">Sunscorch Oasis (Act II Town)</option>`
      + [...BETA_BIOMES, ...BIOMES].map((biome) => { const need = regionNeeds(biome, G.char?.level); return `<option value="${escapeHtml(biome.id)}"${need ? ' disabled' : ''}>${escapeHtml(biome.name)}${biome.overworld ? ' · Overworld' : ''}${biome.beta ? ' (Beta)' : ''}${need ? ` · Reach level ${need}` : ''}</option>`; }).join('')
      + Object.values(REGIONS).flatMap((r) => { const b = BIOME_BY_ID[r.id], need = regionNeeds(b, G.char?.level); return (r.variants || []).map((v) => `<option value="${escapeHtml(r.id)}:${escapeHtml(v.id)}"${need ? ' disabled' : ''}>${escapeHtml(b.name)}: ${escapeHtml(v.name)}${need ? ` · Reach level ${need}` : ''}</option>`); }).join('')
      + SKY_ALL.map((v) => `<option value="skyship:${v.id}">${escapeHtml(BIOME_BY_ID.skyship.name)}: ${escapeHtml(v.name)} (${escapeHtml(v.weather)})</option>`).join('')
      + SEA_VARIANTS.map((v) => `<option value="pirate_seas:${v.id}">${escapeHtml(BIOME_BY_ID.pirate_seas.name)}: ${escapeHtml(v.name)} (${escapeHtml(v.weatherName)})</option>`).join('');
    const dialog = UI.dialog({
      title: 'CHOOSE YOUR DOOM',
      cls: 'velscour-teleport-dialog',
      html: `<p>Select a biome or authored scenario. Your current depth will be reforged with a fresh path.</p><label class="velscour-message-label" for="velscour-biome">Destination</label><select id="velscour-biome" class="velscour-biome-select">${options}</select>`,
      buttons: [
        { label: 'Cancel' },
        { label: 'Teleport', cls: 'red', fn: () => {
          let id = dialog.box.querySelector('#velscour-biome').value;
          if (id.startsWith('scen:')) { this.enterCustomScenario(id.slice(5)); return; }
          if (id === 'act2_town') { this.enterAct2Town(true); return; }
          if (id.startsWith('skyship:')) { G.char.skyVariant = id.slice(8); id = 'skyship'; }
          if (id.startsWith('pirate_seas:')) { G.char.seaVariant = id.slice(12); id = 'pirate_seas'; }
          if (REGIONS[id.split(':')[0]] && id.includes(':')) { (G.regionWant ||= {})[id.split(':')[0]] = id.split(':')[1]; id = id.split(':')[0]; } // a region's variant
          const biome = BIOME_BY_ID[id];
          if (biome) this.teleportToBiome(biome);
        } },
      ],
    });
  },

  async enterCustomScenario(scenarioId, depthOverride = null, fromNetwork = false) {
    const c = G.char;
    if (!c || !scenarioId) return;
    if (Auto.on) Auto.toggle(false);
    const depth = clamp(depthOverride || (G.world?.kind === 'dungeon' ? G.world.depth : c.depth || 1), 1, FINAL_DEPTH);
    c.depth = depth;
    LoadingScreen.show({
      title: 'AUTHORED SCENARIO',
      subtitle: `Depth ${depth}`,
      text: `Loading scenario "${scenarioId}"…`,
      progress: 15,
    });
    sfx('portal');
    try {
      const doc = await fetchScenarioDoc(scenarioId);
      const seed = (G.room && G.room.dungeonSeed) ? G.room.dungeonSeed : (Math.floor(Math.random() * 1e9) + 1);
      if (G.room) {
        G.room.depth = depth;
        G.room.biome = doc.meta.biomeId;
        G.room.dungeonSeed = seed;
        G.room.scenarioId = doc.meta.id;
        G.room.heresies = G.room.heresies || heresiesOf(c);
        if (!G.room.floors) G.room.floors = new Map();
        G.room.floors.set(depth, {
          depth,
          biome: doc.meta.biomeId,
          seed,
          mixId: doc.meta.mixBiomeId || null,
          scenarioId: doc.meta.id,
          heresies: G.room.heresies,
        });
        if (net.connected && !fromNetwork) {
          net.sendRoomDepthUpdate(depth, doc.meta.biomeId, seed, doc.meta.mixBiomeId || null, G.room.heresies, doc.meta.id);
        }
      }
      LoadingScreen.setProgress(50, `Forging ${doc.meta.name}…`);
      const old = G.world;
      const world = await buildCustomScenarioWorld(doc, {
        depth,
        seed,
        onWin: () => {
          const first = !c.cleared[depth];
          c.cleared[depth] = true;
          c.deepest = Math.max(c.deepest || 0, depth);
          this.brokeThrough(depth);
          if (first) this.awardFloorClear(depth, `clearing ${doc.meta.name}`);
          if (G.room && net.connected) net.sendFloorUnsealed(depth);
          this.autosave();
        },
        onExitUsed: (w, exit) => {
          if (doc.entities?.exit?.continueToBiome) this.continueTo(doc.entities.exit.continueToBiome);
          else this.portalChoice(w);
        },
      });
      this.setWorld(world, doc.entities.start, old);
      HUD.setArea(`Depth ${depth}`, `${doc.meta.name} · ${world.biome.name}`);
      playMusic(doc.meta.audio?.music || 'wilds', { delay: 2 });
      setAmbience(doc.meta.audio?.ambience || world.biome.id);
      await warmLevelArt(world);
      LoadingScreen.setProgress(100, 'Arriving…');
    } catch (e) {
      console.warn('[Scenario] Failed to enter custom scenario:', e);
      UI.log(`Could not load scenario "${scenarioId}".`, '#ff8060');
    } finally {
      await LoadingScreen.hide();
      this.spawnPlayer(G.world);
      this._enteringDungeon = false;
      this.autosave();
    }
  },

  /** The skull's "final boss": Velscour's throne at the hero's depth, the hero set down inside his arena. */
  async finalBoss() {
    await this.teleportToBiome(BIOME_BY_ID.throne);
    const w = G.world, p = G.player;
    const vBoss = w && (w.velscour || w.Velscour);
    if (!w || !vBoss || !p) return;
    const [x, y] = w.map.nudge(22.5, 26.5, 0.4);
    p.x = x; p.y = y; p.path = null; p.moveTarget = null; p.attackTarget = null;
    for (const s of w.creatures) if (s.team === 'player' && s !== p) [s.x, s.y] = w.map.randomNear(x, y, 1.5);
    w.map.reveal(x, y, 30);
    camera.follow(x, y, 0, true);
    UI.log(`<b style="color:#ff4020">Velscour answers.</b> ${w.practice ? `This is a practice fight at Depth ${w.depth}: no victory, no relic hoard, but every phase of the real one.` : 'This is the real thing.'}`, '#ffb0a0');
  },

  async teleportToBiome(biome) {
    const c = G.char;
    if (!c || !biome) return;
    const need = regionNeeds(biome, c.level); // a region's level gate (game/regions.js)
    if (need) {
      UI.dialog({ title: 'VELSCOUR SAYS NO', cls: 'velscour-contact-dialog', html: `<p class="velscour-taunt">LEVEL ${c.level}? ADORABLE. Come back at level ${need}. ${escapeHtml(biome.name)} does not hunt snacks.</p>`, buttons: [{ label: 'Close' }] });
      return;
    }
    if (Auto.on) Auto.toggle(false);
    const depth = clamp(Math.max(1, G.world?.kind === 'dungeon' ? G.world.depth : c.depth || 1), 1, FINAL_DEPTH);
    c.depth = depth;
    c.nextBiome = biome.id;
    delete c.nextOmen;
    if (biome.id === 'sea_of_sand') {
      c.seaOfSandRuns ||= {};
      delete c.seaOfSandRuns[depth];
    }
    if (biome.id === 'dark_forest' && c.darkForestRuns) delete c.darkForestRuns[depth];
    if (c.mountainRuns) delete c.mountainRuns[depth];   // the mountains keep their maps per depth: a teleport forges new ones
    if (c.summitRuns) delete c.summitRuns[depth];
    LoadingScreen.show({
      title: (biome.name || 'ABYSSAL REALM').toUpperCase(),
      subtitle: `Depth ${depth}`,
      text: `Answering Velscour — Depth ${depth} · ${biome.name}…`,
      progress: 10
    });
    try {
      let dungeonSeed = Math.floor(Math.random() * 1e9) + 1;
      const reg = regionOf(biome);
      if (G.room) {
        if (reg && G.regionWant?.[reg.id] && reg.variants?.length) {
          const wv = findVariant(reg, G.regionWant[reg.id]);
          const vi = wv ? reg.variants.indexOf(wv) : -1;
          if (vi >= 0) dungeonSeed = (Math.floor(Math.random() * 1e7) + 1) * reg.variants.length + vi;
        }
        G.room.depth = depth;
        G.room.biome = biome.id;
        G.room.dungeonSeed = dungeonSeed;
        G.room.heresies = heresiesOf(c);
      }
      const mix = G.room ? (dungeonSeed ? mixPartner(biome, () => new RNG(dungeonSeed ^ 0x3d17a892).next()) : null) : mixPartner(biome);
      if (G.room) {
        G.room.mixId = mix ? mix.id : null;
        if (net.connected) net.sendRoomDepthUpdate(depth, biome.id, dungeonSeed, G.room.mixId, G.room.heresies);
      }
      LoadingScreen.setProgress(30, `Summoning ${biome.name}…`);
      await this.loadLevelArt(biome, mix);
      LoadingScreen.setProgress(55, 'Forging realm…');
      this.buildDungeon(depth, biome, mix);
      const w = G.world;
      LoadingScreen.setProgress(75, 'Awakening entities…');
      await loadArtFor([...w.creatures.map((m) => m.art), ...(w.looks ? w.looks.ids() : [])], true).catch((e) => console.warn(e));
      LoadingScreen.setProgress(90, 'Warming the flame…');
      await warmLevelArt(w);
      releaseLevelArt(biome);
      LoadingScreen.setProgress(100, 'Arriving…');
    } catch (e) {
      console.warn(e);
      UI.log('The abyss rejected that destination. Try the skull again.', '#ff8060');
    } finally {
      await LoadingScreen.hide();
      this.spawnPlayer(G.world);
      this.autosave();
    }
  },

  /**
   * Straight on into a follow-on region at the same depth (the Mountainside's summit into the Snowy Summit): the loot
   * lying round the hero comes along, auto-play stays on, and a trip to town comes back to it (c.nextBiome).
   */
  async continueTo(id) {
    const c = G.char, old = G.world, biome = BIOME_BY_ID[id];
    if (!c || !old || !biome || this._continuing) return;
    this._continuing = true;
    const p = G.player, depth = old.depth, carry = p && Array.isArray(old.loot) ? old.loot.filter((l) => Math.hypot(l.x - p.x, l.y - p.y) < 14) : [];
    c.nextBiome = id;
    if (id === 'snowy_summit' && c.summitRuns) delete c.summitRuns[depth];   // a fresh range above a fresh summit
    if (G.room && G.room.biome !== id) {
      G.room.depth = depth;
      G.room.biome = id;
      G.room.mixId = null;
      if (!G.room.dungeonSeed) G.room.dungeonSeed = Math.floor(Math.random() * 1e9) + 1;
      if (net.connected) net.sendRoomDepthUpdate(depth, id, G.room.dungeonSeed, null, G.room.heresies);
    }
    const loading = document.getElementById('loading');
    document.getElementById('loading-text').textContent = `Depth ${depth} — ${biome.name}…`;
    loading.classList.remove('hidden');
    sfx('portal');
    try {
      await this.loadLevelArt(biome, null);
      this.buildDungeon(depth, biome, null);
      const w = G.world;
      for (const l of carry) { const [x, y] = w.map.randomNear(p.x, p.y, 1.8); l.x = x; l.y = y; l.z = 0; l.vx = l.vy = 0; l.vz = 40; w.addLoot(l); }
      if (carry.length) UI.log('The spoils of the summit came with you.', '#ffe2a0');
      await loadArtFor([...w.creatures.map((m) => m.art), ...(w.looks ? w.looks.ids() : [])], true).catch((e) => console.warn(e));
      await warmLevelArt(w);
      releaseLevelArt(biome);
    } catch (e) {
      console.warn(e);
    } finally {
      this._continuing = false;
      loading.classList.add('hidden');
      this.autosave();
    }
  },

  /** Pre-build the current level's monster sprites (what the loading screen does after buildDungeon; for tests). */
  warmArt() { return warmLevelArt(G.world); },

  // the art a level of this biome needs before it can be generated (the portal and Velscour's level select share it)
  loadLevelArt(biome, mix = null) {
    if (regionOf(biome)) { rollRegionVariant(regionOf(biome)); return regionOf(biome).load(biome); } // a new region and its variant (game/regions.js)
    if (biome.id === 'scorpion_king_pyramid') {
      return loadDunes3D().catch((e) => { console.warn(e); return loadSeaOfSandPack(); });
    }
    if (biome.id === 'sea_of_sand') { // the flat cliff maze (0) or one of the ten dune variants with their pyramids (src/data/dunes.js), never the one seen last
      if (G.room) {
        const s = G.room.dungeonSeed || G.room.seed || 1;
        G.sandNext = Math.abs(s) % (DUNE_VARIANTS.length + 1);
      } else {
        const c = G.char, kept = c?.seaOfSandRuns?.[c.depth], n = DUNE_VARIANTS.length + 1, last = c?.lastSand ?? -1;
        const k = Math.floor(Math.random() * (n - (last >= 0 ? 1 : 0)));
        G.sandNext = G.sandVariant ?? (kept ? kept.dunes || 0 : last >= 0 && k >= last ? k + 1 : k);
      }
      if (G.sandNext > 0) return loadDunes3D().catch((e) => { console.warn(e); G.sandNext = 0; return loadSeaOfSandPack(); });
      return loadSeaOfSandPack();
    }
    if (biome.id === 'castle') { // one of the castles (src/data/castles.js), never the one seen last; the first if its bake won't load
      if (G.room) {
        const s = G.room.dungeonSeed || G.room.seed || 1;
        G.castleNext = Math.abs(s) % CASTLE_VARIANTS.length;
      } else {
        const last = CASTLE_VARIANTS.findIndex((v) => v.id === G.char?.lastCastle), k = Math.floor(Math.random() * (CASTLE_VARIANTS.length - (last >= 0 ? 1 : 0)));
        G.castleNext = G.castleVariant ?? (last >= 0 && k >= last ? k + 1 : k);
      }
      return Promise.all([loadCastlePack(), loadCastle3D(G.castleNext).catch((e) => { console.warn(e); G.castleNext = 0; return loadCastle3D(0); }), loadDarkForestTrees()]);
    }
    if (biome.id === 'dark_forest') return Promise.all([loadBiomeArt(biome), loadDarkForestTrees()]);
    if (biome.challenge) return loadBiomeArt(biome); // the Breach's two packs (pack, wallPack, moreFloors/morePacks)
    if (biome.id === 'skyship') return Promise.all([loadBaked('assets/tiles/skyship/'), preloadTownSheets(TOWNSFOLK_KNIGHTS)]); // the baked ironclad, boats and galleon; the sky-knights
    if (biome.sea) {   // the scenario is picked now, so its fleet's models and its own monsters' art load with the rest
      const c = G.char;
      let sc;
      if (G.room && !c?.seaVariant) {
        const s = Math.abs(G.room.dungeonSeed || G.room.seed || 1);
        const nonFin = SEA_VARIANTS.filter((v) => !v.finale);
        sc = nonFin[s % nonFin.length] || SEA_VARIANTS[0];
      } else {
        sc = pickSeaVariant(c?.seaVariant, c?.lastSeaVariant, c?.seaSeen || {});
      }
      G.seaNext = sc.id;
      return Promise.all([loadFleet([...(sc.fleet || []), 'longboat', 'cutter', 'brig']), preloadTownSheets(['05_road_guard', '25_royal_heir', '41_friar']), sc.art ? loadArtFor(sc.art) : null]);
    }
    if (biome.tower) return loadTower3D(); // three.js and the tower's textures
    if (biome.cave) {
      G.caveNext = G.room ? (Math.abs(G.room.dungeonSeed || G.room.seed || 1) % CAVE_VARIANTS.length) : (G.caveVariant ?? Math.floor(Math.random() * CAVE_VARIANTS.length));
      return loadCave3D(G.caveNext);
    } // three.js and this cave's textures
    if (biome.id === 'throne') return Promise.all([loadBiomeArt(biome), loadVelscourThrone()]); // his recoloured throne
    if (!biome.overworld) return Promise.all([loadBiomeArt(biome), mix && loadBiomeArt(mix)]);
    return Promise.resolve();
  },

  enterDungeon(fromNetwork = false) {
    if (this._enteringDungeon) return;
    this._enteringDungeon = true;
    const c = G.char;
    const depth = clamp((G.room && G.room.depth != null) ? G.room.depth : (c.depth || 1), 1, FINAL_DEPTH);
    c.depth = depth;
    if (depth > 1) {
      c.cleared[depth - 1] = true;
      c.deepest = Math.max(c.deepest || 0, depth - 1);
    }
    this.autosave();

    const activeH = getActiveHearth();
    if (!fromNetwork && activeH && activeH.depth === depth && activeH.dungeonWorld) {
      this._enteringDungeon = false;
      returnFromHearth();
      return;
    }

    if (G.room) G.room.depth = depth;
    if (depth !== FINAL_DEPTH && (!c.nextBiome || c.nextBiome === 'throne' || regionNeeds(BIOME_BY_ID[c.nextBiome], c.level))) c.nextBiome = drawBiome(c, depth);
    const biome = this.getSharedRoomBiome(G.room, depth, c.nextBiome);
    if (G.room) c.nextBiome = biome.id;
    if (G.room && G.room.scenarioId && G.room.depth === depth) {
      this._enteringDungeon = false;
      this.enterCustomScenario(G.room.scenarioId, depth, fromNetwork);
      return;
    }
    let dungeonSeed = G.room ? this.getSharedRoomDungeonSeed(G.room, depth) : (Math.floor(Math.random() * 1e9) + 1);
    const scenRollRng = new RNG((dungeonSeed ^ 0x5c3e1099) >>> 0);
    if (G.room) {
      let floor = G.room.floors?.get ? G.room.floors.get(depth) : null;
      const peerOnFloor = G.remotePlayers && Array.from(G.remotePlayers.values()).find(rp => rp.worldKind === 'dungeon' && rp.depth === depth);
      const hasHearth = (activeH && activeH.depth === depth) || (G.room.hearthPortals?.has ? G.room.hearthPortals.has(depth) : false);
      const preserveFloor = (peerOnFloor || hasHearth) && floor;

      if (preserveFloor) {
        dungeonSeed = floor.seed;
        G.room.dungeonSeed = dungeonSeed;
        G.room.biome = floor.biome;
        G.room.mixId = floor.mixId;
        G.room.heresies = floor.heresies || heresiesOf(c);
      } else {
        const isNew = (!G.room.dungeonSeed || G.room.depth !== depth || G.room.biome !== biome.id);
        G.room.dungeonSeed = dungeonSeed;
        G.room.depth = depth;
        G.room.biome = biome.id;
        // If room heresies haven't been established for this depth, adopt the portal activator's heresies
        if (!G.room.heresies || isNew) {
          G.room.heresies = heresiesOf(c);
        }
        const mix = G.room.mixId ? BIOME_BY_ID[G.room.mixId] : (dungeonSeed ? mixPartner(biome, () => new RNG(dungeonSeed ^ 0x3d17a892).next()) : null);
        G.room.mixId = mix ? mix.id : null;
        if (!G.room.floors) G.room.floors = new Map();
        G.room.floors.set(depth, {
          depth,
          biome: biome.id,
          seed: dungeonSeed,
          mixId: G.room.mixId,
          heresies: G.room.heresies,
        });
      }
      if (net.connected && !fromNetwork) {
        net.sendRoomDepthUpdate(depth, G.room.biome, dungeonSeed, G.room.mixId, G.room.heresies);
      }
    }
    const mix = G.room ? (G.room.mixId ? BIOME_BY_ID[G.room.mixId] : (dungeonSeed ? mixPartner(biome, () => new RNG(dungeonSeed ^ 0x3d17a892).next()) : null)) : mixPartner(biome);
    LoadingScreen.show({
      title: (biome.name || 'THE DEPTHS').toUpperCase(),
      subtitle: `Depth ${depth}`,
      text: `Descending to Depth ${depth} — ${biome.name}…`,
      progress: 10
    });
    sfx('portal');
    // fetch this biome's art first (about 1 MB); if that fails the default set stands in
    setTimeout(async () => {
      try {
        const pubScen = await resolvePublishedScenarioForDepth(depth, biome.id, () => scenRollRng.next()).catch(() => null);
        if (pubScen) {
          await this.enterCustomScenario(pubScen.id, depth, fromNetwork);
          return;
        }
        if (G.room && net.connected) {
          net.requestDungeonState(depth);
        }
        LoadingScreen.setProgress(25, `Loading ${biome.name} assets…`);
        await yieldForLoadingPaint();
        await this.loadLevelArt(biome, mix);
      } catch (e) { console.warn(e); }
      try {
        if (G.room && net.connected) {
          net.requestDungeonState(depth);
        }
        LoadingScreen.setProgress(40, `Mapping ${biome.name}…`);
        await yieldForLoadingPaint();
        LoadingScreen.setProgress(50, 'Forging labyrinth…');
        await yieldForLoadingPaint();
        this.buildDungeon(depth, biome, mix);
        // the level's monster art (set 2 sheets load per level); a failed sheet falls back to pixel sprites
        const w = G.world;
        LoadingScreen.setProgress(75, 'Loading inhabitants…');
        await yieldForLoadingPaint();
        await loadArtFor([...w.creatures.map((m) => m.art), ...(w.looks ? w.looks.ids() : [])], true).catch((e) => console.warn(e));
        LoadingScreen.setProgress(90, 'Preparing the veil…');
        await yieldForLoadingPaint();
        await warmLevelArt(w);
        releaseLevelArt(biome);
        LoadingScreen.setProgress(100, 'Arriving…');
      } finally {
        await LoadingScreen.hide();
        this.spawnPlayer(G.world);
        this._enteringDungeon = false;
      }
    }, 40);
  },

  buildDungeon(depth, biome, mix = null) {
    const c = G.char || (G.char = newCharData('barbarian', 'Hero'));
    c.depth = depth;
    if (G.room) G.room.depth = depth;
    if (biome.tower && !tower3dReady()) { UI.log('Clouds hide the Serpentine Tower today (three.js could not be loaded).', '#a0a0a0'); biome = BIOME_BY_ID.overworld; }
    if (regionOf(biome) && regionOf(biome).ready && !regionOf(biome).ready()) { UI.log(`The way to ${biome.name} is closed today (its art could not be loaded).`, '#a0a0a0'); biome = BIOME_BY_ID.overworld; }
    if (biome.cave && !cave3dReady()) { UI.log("A rockfall seals the Depth's Edge Caverns today (three.js could not be loaded).", '#a0a0a0'); biome = BIOME_BY_ID.overworld; }
    if (biome.sea && !sea3dReady()) { UI.log('A storm keeps the Dawnwake in harbour today (three.js could not be loaded).', '#a0a0a0'); biome = BIOME_BY_ID.overworld; }
    const old = G.world;
    const forest = biome.id === 'dark_forest';
    c.seaOfSandRuns ||= {}; c.darkForestRuns ||= {};
    // the two overworlds that save their progress per depth rebuild the same map after a town trip
    const reg = regionOf(biome);
    const kept = biome.id === 'sea_of_sand' ? c.seaOfSandRuns[depth] : forest ? c.darkForestRuns[depth] : reg && reg.kept ? reg.kept(c, depth) : null;
    const seed = (G.room && G.room.dungeonSeed) ? G.room.dungeonSeed : (kept ? kept.seed : (G.room?.seed ? (G.room.seed + depth * 7919) | 0 : (Math.random() * 1e9) | 0));
    const tileset = forest ? biomeTileSet(biome) : biome.overworld ? biomeTileSet(TOWN_BIOME) : mix ? mixedTileSet(biome, mix, G.room ? ((seed % 2) === 0) : Math.random() < 0.5) : biomeTileSet(biome);
    keepTileSets(tileset);
    const sky = biome.id === 'skyship', sea = !!biome.sea;
    const towerVar = G.room ? (seed % 3) : G.towerVariant;
    const caveVar = G.room ? (seed % CAVE_VARIANTS.length) : (G.caveVariant ?? G.caveNext);
    const sandVar = G.room ? (Math.abs(seed) % (DUNE_VARIANTS.length + 1)) : (G.sandVariant ?? G.sandNext);
    const castleVar = G.room ? (Math.abs(seed) % CASTLE_VARIANTS.length) : (G.castleVariant ?? G.castleNext);
    const gen = reg ? reg.generate(depth, biome, seed) : forest ? generateDarkForest(depth, biome, tileset, seed)
      : sky ? generateSkyship(depth, biome, seed, castle3dState())
      : sea ? generateSeaship(depth, biome, seed, SEA_VARIANTS.find((q) => q.id === (G.seaNext || c.seaVariant))?.size)
      : biome.tower ? generateTower(depth, biome, seed, towerVar)
      : biome.cave ? generateCaverns(depth, biome, seed, caveVar)
      : biome.id === 'scorpion_king_pyramid' && dunes3dReady() ? generateDunes(depth, biome, seed, 1)
      : biome.id === 'sea_of_sand' && sandVar > 0 && dunes3dReady() ? generateDunes(depth, biome, seed, sandVar - 1)
      : biome.overworld ? generateOverworld(depth, biome, seed, biome.id === 'castle' ? castleVar : null) : generateDungeon(depth, biome, tileset, seed);
    if (biome.id === 'sea_of_sand') { c.lastSand = gen.dunes ? 1 + DUNE_VARIANTS.indexOf(gen.variant) : 0; if (gen.dunes) c.seaOfSandRuns[depth] = { seed, dunes: c.lastSand }; }
    const world = new World('dungeon', { map: gen.map, tileset, biome, depth, props: gen.props, torches: gen.torches, wallHangings: gen.wallHangings, looks: gen.looks, townTiles: gen.townTiles || null, buildings: gen.buildings || [] });
    world._generatingDungeon = true;
    if (gen.layoutId) { world.layoutId = gen.layoutId; world.layoutName = gen.layoutName; }
    world.rooms = gen.rooms || [];
    const isStarterDepth = depth === 1;
    const chestRng = new RNG((seed ^ 0x7a3ea51d) >>> 0);
    world.chests = gen.chests.map((ch, index) => {
      const rolled = rollTreasureChest(chestRng);
      if (isStarterDepth && index === gen.chests.length - 1) {
        rolled.chestType = 'standard'; rolled.tint = null;
        rolled.label = `${rolled.label.split(' ')[0]} Starter Chest`;
      }
      return {
        ...ch, ...rolled, opened: false, reach: 1.3,
        use() {
          if (this.opened) return;
          this.opened = true;
          sfx('chest');
          if (this.chestType === 'mimic') {
            const arch = pick(world.roster || biome.roster || []);
            const mimic = arch && makeMonster(world, arch, biome, depthLevel(depth), 'champion', this.x, this.y, 0,
              { art: 'chest_mimic', swap: null });
            const spawn = mimic && findMimicSpawn(world.map, mimic, world.creatures, this.x, this.y);
            if (mimic && spawn) {
              const rewardChest = this;
              const chestIndex = world.chests.indexOf(rewardChest);
              if (chestIndex !== -1) world.chests.splice(chestIndex, 1);
              mimic.x = spawn.x; mimic.y = spawn.y;
              mimic.name = 'Mimic';
              mimic.chestMimic = true;
              mimic.awake = true;
              mimic.targetable = true;
              mimic.aura = '#b84c2f';
              mimic.onDeath = () => {
                sfx('gold');
                dropChest(world, rewardChest, depth);
                sparkle(mimic.x, mimic.y, 20, '#ffd060', 24, 0.6);
              };
              world.add(mimic);
              addEffect(new Ring(spawn.x, spawn.y, 0.18, 1.15, 0.42, '#c84b32', 3, { z: 3 }));
              sparkle(spawn.x, spawn.y, 22, '#d98c48', 12, 0.45);
              floatText(spawn.x, spawn.y, 48, 'MIMIC!', '#ffd060', 12);
              sfx('boss');
              return;
            }
            // If no usable archetype or safe spawn exists, fall through and open as a normal chest.
          }
          if (this.chestType === 'explosive') {
            floatText(this.x, this.y, 34, 'TRAP!', '#ff7040', 11);
            const source = world.creatures.find((creature) => creature.team === 'enemy') || {
              team: 'enemy', world, level: depthLevel(depth), dmg: 0, rank: 'normal',
            };
            world.addHazard(new Delayed({
              world, src: source, team: 'enemy', x: this.x, y: this.y, r: 1.45,
              delay: 1.15, dmg: [G.player.maxHp * 0.08, G.player.maxHp * 0.12],
              el: 'fire', fx: 'explosion', o: { falloff: true },
            }));
          }
          sfx('gold');
          dropChest(world, this, depth);
          sparkle(this.x, this.y, 20, this.tint || '#ffd060', 20, 0.5);
        },
      };
    });
    const [sx, sy] = gen.start;
    let tp = gen.townPortal || [sx + 1.6, sy - 0.6];
    if (!gen.map.walkable(tp[0], tp[1])) tp = gen.map.randomNear(sx, sy, 2);
    const unboundFloor = G.unboundExplorationFloor;
    G.unboundExplorationFloor = null;
    const isUnboundCheckpoint = unboundFloor ? isUnboundCheckpointFloor(unboundFloor) : false;
    const isAlreadyUnsealed = (G.room && G.room.unsealedDepths && G.room.unsealedDepths.has(depth)) ||
      (G.room && G.room.killedMonsters && (
        (world.boss?.netId && G.room.killedMonsters.get(depth)?.has(world.boss.netId)) ||
        (world.boss?.idx != null && G.room.killedMonsters.get(depth)?.has(world.boss.idx))
      ));
    let exitLabel = 'Sealed Exit';
    if (isAlreadyUnsealed) {
      if (unboundFloor) {
        exitLabel = isUnboundCheckpoint ? `Unbound Checkpoint (Floor ${unboundFloor})` : `Descend to Floor ${unboundFloor + 1}`;
      } else if (world.unbound || depth >= FINAL_DEPTH || biome.id === 'throne') {
        exitLabel = 'Exit — to town';
      } else {
        exitLabel = 'Exit — continue';
      }
    }
    const exit = {
      x: gen.exit[0], y: gen.exit[1], type: 'exit',
      active: !!isAlreadyUnsealed,
      color: isAlreadyUnsealed ? '#40a0ff' : '#5a5a60',
      reach: 1.6,
      label: exitLabel,
      skygate: sky,
      seagate: sea,
      use: () => this.useExit(world, exit),
    };
    if (unboundFloor && !isUnboundCheckpoint) {
      world.portals = [exit];
    } else {
      world.portals = [
        { x: tp[0], y: tp[1], type: 'town', active: true, color: '#3a8aff', reach: 1.6, label: 'Town Portal', use: () => this.useTownPortal() },
        exit,
      ];
    }
    if (unboundFloor) {
      world.unboundExploration = { floor: unboundFloor, active: true };
    }
    // monsters
    const lvl = depthLevel(depth);
    world.unbound = biome.id === 'throne' && !!G.unboundNext; G.unboundNext = false; // Velscour Unbound (game/unbound.js)
    world.practice = biome.id === 'throne' && depth !== FINAL_DEPTH && !world.unbound; // "final boss" from the skull: Velscour at this depth
    const heresies = G.room ? (G.room.heresies || []) : heresyBegin(world, c);
    if (G.room) {
      world.heresy = { ids: heresies, rank: heresyRank(heresies) };
    }
    const monRng = G.room ? new RNG(seed ^ 0x5bf03641) : null;
    const rndVal = () => (monRng ? monRng.next() : Math.random());
    let monsterSeq = 1;
    const rawSpawns = heresySpawns(greedPacks(gen.spawns, G.room ? 0 : greedOf(c)), heresies);
    for (let si = 0; si < rawSpawns.length; si++) {
      const s = rawSpawns[si];
      if (s.rank === 'raid') {
        const superbossId = superbossForDepth(depth);
        const tpl = superbossId ? RAID_BOSSES.find((b) => b.id === superbossId) : undefined;
        const m = makeRaidBoss(world, gen.raid, depth, lvl + 3, { rnd: rndVal, tpl });
        m.netId = `raid_${si}`;
        m.idx = monsterSeq++;
        world.add(m);
        world.boss = m;
        world.raid = m.raid;
        continue;
      }
      if (s.rank === 'boss') {
        const m = makeMonster(world, s.arch, biome, lvl + 2, 'boss', s.x, s.y, 0, s.look, rndVal);
        m.netId = `boss_${si}`;
        m.idx = monsterSeq++;
        if (biome.id === 'mountainside') {
          m.name = 'The Summit Warden';
          m.title = 'Guardian of the Peak';
        }
        world.add(m);
        world.boss = m;
        if (world.dungeonAffixes && world.dungeonAffixes.includes('twin_guardians') && !world.boss.raid) {
          const twin = makeMonster(world, world.boss.arch, biome, lvl + 2, 'boss', s.x + 2, s.y + 2, 0, s.look, rndVal);
          if (twin) {
            twin.netId = `boss_${si}_twin`;
            twin.idx = monsterSeq++;
            twin.name = `${world.boss.name} (Twin)`;
            twin.isTwinGuardian = true;
            world.add(twin);
          }
        }
        if (m.isVelscour) setupVelscour(world, m, gen); // his five-phase last stand (game/dagyr.js)
        continue;
      }
      const n = s.n;
      const variant = rndVal() < Math.min(0.5, 0.2 + depth * 0.005) ? 1 : 0;
      const trait = rollTrait(world, depth, false, rndVal) || (s.trait ? rollTrait(world, depth, true, rndVal) : null);
      for (let i = 0; i < n; i++) {
        const [x, y] = i === 0 ? [s.x, s.y] : gen.map.randomNear(s.x, s.y, 1.6, rndVal);
        const rank = s.rank === 'unique' ? (i === 0 ? 'unique' : 'normal') : s.rank;
        const m = makeMonster(world, s.arch, biome, lvl + (rank === 'normal' ? 0 : 1), rank, x, y, variant, s.look, rndVal);
        m.netId = `m_${si}_${i}`;
        m.idx = monsterSeq++;
        if (s.rank === 'unique' && i > 0) { m.affixes = []; m.name = m.name + ' Minion'; }
        // tanks and bullet-hell casters lead their pack; hunters, phasers and burrowers come as a pack
        if (trait && (i === 0 || ['hunter', 'phaser', 'burrower'].includes(trait))) applyTrait(m, trait);
        if (s.champ && i === 0) makeElite(m, 'champion', depth, world, rndVal);
        world.add(m);
      }
    }
    purgeKilledMonstersFromWorld(world);
    if ((world.boss && (
      (world.boss.netId && isMonsterKilled(world, depth, world.boss.netId, world.boss.idx)) ||
      (world.boss.idx != null && isMonsterKilled(world, depth, world.boss.netId, world.boss.idx))
    )) || (G.room?.unsealedDepths && G.room.unsealedDepths.has(depth))) {
      if (!exit.active) {
        exit.active = true;
        exit.color = '#40a0ff';
        exit.label = (world.unbound || world.depth >= FINAL_DEPTH || world.boss?.isVelscour || biome.id === 'throne') ? 'Exit — to town' : 'Exit — continue';
      }
    }
    world.roster = [...new Set(gen.spawns.filter((s) => s.arch && !['raid', 'boss'].includes(s.rank)).map((s) => s.arch))];
    world.dungeonAffixes = normalizeDungeonAffixIds(c.nextAffixes ?? c.dungeonAffixes);
    if (world.dungeonAffixes.includes('bloodmoon')) {
      world.redMoon = true;
      world.ambientFog = '#300808';
      world.darkK = Math.max(world.darkK || 0, DUNGEON_AFFIX_CONFIG.bloodmoon?.darkness ?? 0.3);
    }
    if (world.dungeonAffixes.includes('golden')) world.goldMul = (world.goldMul || 1) * DUNGEON_AFFIX_CONFIG.golden.goldMultiplier;
    if (world.dungeonAffixes.includes('treasure_hoard')) world.goldMul = (world.goldMul || 1) * 1.25;
    if (world.dungeonAffixes.includes('champions_bounty')) world.lootMul = (world.lootMul || 1) * 1.2;
    if (world.dungeonAffixes.includes('cursed_fortune')) world.lootMul = (world.lootMul || 1) * 1.2;
    if (world.dungeonAffixes.includes('legendary_hunt')) world.lootMul = (world.lootMul || 1) * 1.25;
    if (world.dungeonAffixes.includes('gemstone_infusion')) world.gemDropMul = 1.5;
    if (world.dungeonAffixes.includes('darkness')) world.darkK = Math.max(world.darkK || 0, DUNGEON_AFFIX_CONFIG.darkness.darkness);
    if (world.dungeonAffixes.includes('dense_fog')) world.darkK = Math.max(world.darkK || 0, DUNGEON_AFFIX_CONFIG.darkness.darkness + 0.2);
    for (const monster of world.creatures) for (const id of world.dungeonAffixes) applyDungeonAffix(monster, id);
    announceDungeonAffixes(world.dungeonAffixes);
    if (HUD.setAreaAffixes) HUD.setAreaAffixes(world.dungeonAffixes);
    if (!sky && !sea && biome.id !== 'throne') setupHappenings(world, gen.start, gen); // omens, shrines, treasure imps, cursed chests (game/happenings.js)
    setupCommissions(world, gen.start); // this depth's Town Commission objectives (game/commissions.js)
    greedWorld(world, c); // the Greed lever and its Hoard multiply the omen's loot dials
    heresyWorld(world, c); // the Heresies' rank pays on top (none in Unbound)
    tickBlessing(c);
    world.onBossAwake = (m) => {
      UI.centerMsg(m.name, m.isVelscour ? 'The Demon Lord rises' : m.raid ? `${m.title}${m.raid.mods.length ? ' · ' + m.raid.modText() : ''}` : 'Guardian of the Exit', 3);
      sfx('boss');
    };
    world.onBossKilled = (m) => {
      if (biome.overworld) return;
      if (m.raid && m.raid.court) return; // one of Velscour Unbound's court: not the fight's end
      if (world.dungeonAffixes && world.dungeonAffixes.includes('twin_guardians') && world.creatures.some((enemy) => enemy.team === 'enemy' && enemy.rank === 'boss' && !enemy.dead)) return;
      if (G.room) {
        if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
        G.room.unsealedDepths.add(depth);
        if (net.connected) {
          net.sendFloorUnsealed(depth, m.netId || m.idx, m.name);
        }
      }
      this.unsealDungeonExit(world, m.name, m.isVelscour, !!m.raid);
    };
    const syncOverworldUnseal = (label) => {
      if (G.room) {
        if (!G.room.unsealedDepths) G.room.unsealedDepths = new Set();
        G.room.unsealedDepths.add(depth);
        if (net.connected) net.sendFloorUnsealed(depth, null, label || biome.name);
      }
    };
    if (sky) {   // the Sky Battle (game/skybattle.js): one of eight weathers or thirty stories, never the last one twice
      const skyVar = (G.room && !c.skyVariant) ? SKY_ALL[Math.abs(seed) % SKY_ALL.length]?.id : c.skyVariant;
      world.overworldScenario = createSkyBattle(world, gen, biome, depth, { variant: skyVar, last: c.lastSkyVariant, seen: c.skySeen || {} }, () => {
        exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
        syncOverworldUnseal(biome.name);
        const first = !c.cleared[depth];
        c.cleared[depth] = true;
        c.deepest = Math.max(c.deepest || 0, depth);
        this.brokeThrough(depth);
        if (first) this.awardFloorClear(depth, 'winning the Sky Battle');
        sfx('gate'); UI.refresh(); this.autosave();
      });
      c.lastSkyVariant = world.sky.v.id; delete c.skyVariant;
    } else if (sea) {   // the Pirate Seas (game/seabattle.js): a battle the hero hasn't won, never the last one twice
      createSeaBattle(world, gen, biome, depth, { variant: G.seaNext || c.seaVariant, last: c.lastSeaVariant, seen: c.seaSeen || {} }, () => {
        exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
        syncOverworldUnseal(biome.name);
        const first = !c.cleared[depth];
        c.cleared[depth] = true;
        c.deepest = Math.max(c.deepest || 0, depth);
        this.brokeThrough(depth);
        const bell = world.seaRun.bell ? ` Brother Tolland has rung <b style="color:#ffe0a0">${world.seaRun.bell} bell${world.seaRun.bell > 1 ? 's' : ''}</b> on the Shattered Coast.` : '';
        if (first) this.awardFloorClear(depth, 'holding the Dawnwake');
        else if (bell) UI.log(`The Dawnwake is held.${bell}`, '#ffd860');
        sfx('gate'); UI.refresh(); this.autosave();
      });
      c.lastSeaVariant = world.seaRun.variant.id; delete c.seaVariant; G.seaNext = undefined;
    } else if (reg) {   // a new region (game/regions.js)
      world.overworldScenario = reg.createRun(world, gen, biome, depth, () => {
        exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
        syncOverworldUnseal(biome.name);
        const first = !c.cleared[depth];
        c.cleared[depth] = true;
        c.deepest = Math.max(c.deepest || 0, depth);
        this.brokeThrough(depth);
        if (first) this.awardFloorClear(depth, reg.winText ? null : `clearing Depth ${depth}`);
        addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
        sfx('gate'); UI.refresh(); this.autosave();
      }) || world.overworldScenario;
    } else if (gen.dunes) createDuneRun(world, gen, biome, () => {
      exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
      syncOverworldUnseal(gen.variant?.pyramid?.name || biome.name);
      const first = !c.cleared[depth];
      c.cleared[depth] = true;
      c.deepest = Math.max(c.deepest || 0, depth);
      this.brokeThrough(depth);
      if (first) this.awardFloorClear(depth, `winning ${gen.variant?.pyramid?.name || 'the Pyramid'}`);
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    else if (biome.id === 'sea_of_sand') world.overworldScenario = createSeaOfSandScenario(world, gen, biome, () => {
      exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
      syncOverworldUnseal(biome.name);
      const first = !c.cleared[depth];
      c.cleared[depth] = true;
      c.deepest = Math.max(c.deepest || 0, depth);
      this.brokeThrough(depth);
      if (first) this.awardFloorClear(depth, 'completing the Sea of Sand route');
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    else if (forest) world.overworldScenario = createDarkForestRun(world, gen, biome, () => {
      exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
      syncOverworldUnseal(biome.name);
      const first = !c.cleared[depth];
      c.cleared[depth] = true;
      c.deepest = Math.max(c.deepest || 0, depth);
      greedCleared(world, c);
      if (first) this.awardFloorClear(depth, 'stilling the Heart of the Forest');
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    else if (biome.tower) createTowerRun(world, gen, biome, () => {
      exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
      syncOverworldUnseal(biome.name);
      const first = !c.cleared[depth];
      c.cleared[depth] = true;
      c.deepest = Math.max(c.deepest || 0, depth);
      this.brokeThrough(depth);
      if (first) this.awardFloorClear(depth, 'taking the tower');
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    else if (biome.cave) createCaveRun(world, gen, biome, () => {
      exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
      syncOverworldUnseal(biome.name);
      const first = !c.cleared[depth];
      c.cleared[depth] = true;
      c.deepest = Math.max(c.deepest || 0, depth);
      this.brokeThrough(depth);
      if (first) this.awardFloorClear(depth, 'taking the top of the falls');
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    else if (biome.overworld) world.overworldScenario = createOverworldScenario(world, gen, biome, () => {
      exit.active = true; exit.color = '#40a0ff'; exit.label = 'Exit — continue';
      syncOverworldUnseal(biome.name);
      const first = !c.cleared[depth];
      c.cleared[depth] = true;
      c.deepest = Math.max(c.deepest || 0, depth);
      this.brokeThrough(depth);
      if (first) this.awardFloorClear(depth, 'completing the overworld scenario');
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    world._generatingDungeon = false;
    this.setWorld(world, gen.start, old);
    announceDungeonAffixes(world);
    if (biome.id === 'castle') { addCastleStory(world, gen); world.ambientFx = gen.variant?.look?.ambient || null; c.lastCastle = gen.variant?.id; }
    if (biome.overworld && !sky && !sea && !biome.cave && !gen.dunes && (!reg || reg.wilds)) {
      // townsfolk on the road: reachable landmarks to walk between (game/wanderers.js)
      const spots = [], map = gen.map;
      for (let i = 0; i < 60 && spots.length < 9; i++) {
        const x = 3 + Math.random() * (map.w - 6), y = 3 + Math.random() * (map.h - 6);
        if (map.walkable(x, y) && map.findPath(gen.start[0], gen.start[1], x, y, 9000)) spots.push([x, y]);
      }
      if (spots.length >= 2 && !biome.beta && !biome.tower) addWanderers(world, spots, biome.id === 'castle' ? 6 : forest ? 4 : 5);
      const look = gen.variant?.look || {};   // a castle variant has its own odds of rain and of night
      // in a room every client rolls the weather from the shared dungeon seed, so the party sees the same sky
      // (rolled per client, one player could get nightfall while the other stood in daylight)
      const wxRng = G.room ? new RNG((seed ^ 0x2f6b1d3c) >>> 0) : null;
      const wxRoll = () => (wxRng ? wxRng.next() : Math.random());
      world.raining = biome.id !== 'sea_of_sand' && !biome.tower && wxRoll() < (look.rain ?? 0.3); // a wet day in the Wilds or on the walls
      if (!biome.tower && wxRoll() < (look.night ?? 0.25)) { world.darkK = biome.id === 'sea_of_sand' ? 0.45 : 0.6; world.night = true; } // nightfall: torches, spells and portals glow
    }
    if (!biome.beta) recordBiomeVisit(c, biome, depth); // a beta biome leaves the overworld guarantee alone
    c.lastBiome = biome.id;
    const uFloor = world.unboundExploration?.floor;
    HUD.setArea(
      world.unbound ? 'Velscour Unbound' :
      uFloor ? `Unbound Floor ${uFloor}` :
      `Depth ${depth}${depth > FINAL_DEPTH ? ' — Endless Torment' : ''}`,
      (biome.overworld ? `${gen.variant ? gen.variant.name : biome.name} · ${world.overworldScenario.title}` : gen.raid ? `${biome.name} · Boss Room` : biome.name) + (worldRank(world) ? ` · Heresy ${worldRank(world)}` : '')
    );
    playMusic('wilds', { delay: 4 + Math.random() * 20 }); setAmbience(sky ? world.sky.v.amb : sea ? world.seaRun.variant.amb : reg?.amb || biome.id);
    const kin = tileset.mixed && BIOME_BY_ID[tileset.mixed];
    if (uFloor) {
      UI.centerMsg(`UNBOUND FLOOR ${uFloor}`, isUnboundCheckpointFloor(uFloor) ? 'CHECKPOINT MILESTONE' : `Direct Descent · Hardmode Depth ${depth}`, 2.6);
    } else if (!sky && !sea) {
      UI.centerMsg((gen.variant ? gen.variant.name : biome.name).toUpperCase(), `Depth ${depth}${kin ? ` · bleeding into the ${kin.name}` : ''}`, 2.4);
    }
    if (world.night) UI.log(world.raining ? 'Night has fallen, and the rain with it.' : 'Night has fallen over the land.', '#a0b0d0');
    if (reg) { const t = reg.intro && reg.intro(world, gen); if (t) UI.log(t, '#ffe2a0'); }
    else if (gen.dunes) UI.log(`${gen.variant.name}: ${gen.variant.intro} ${gen.dunes.camps.length} waystones stand between you and its door.`, '#ffe2a0');
    else if (biome.id === 'sea_of_sand') UI.log(`Secure ${gen.scenarioCount} marked scenario area${gen.scenarioCount === 1 ? '' : 's'} to open the exit. Rewards improve with each clear.`, '#ffe2a0');
    else if (sky) UI.log(`${world.sky.v.name}: ${world.sky.v.story ? world.sky.v.blurb + ' Hold the deck.' : 'hold the deck against the Air Pirates\' boarding waves.'} ${world.sky.v.hazardText || ''}`, '#ffe2a0');
    else if (sea) UI.log(`${world.seaRun.variant.name}: ${world.seaRun.variant.blurb} Hold the Dawnwake's deck against the Black Tide's boarders.`, '#ffe2a0');
    else if (biome.tower) UI.log(`${gen.variant.name}: ${gen.variant.epithet}. Climb the stair; things wait on the floors above, and some will not wait.`, '#ffe2a0');
    else if (biome.cave) UI.log(`${gen.variant.name}: ${gen.variant.epithet}. The passages lead down to a lake under a great waterfall; the way on is a long climb to its top.`, '#ffe2a0');
    else if (forest) UI.log(`The Dark Forest closes in. The Heart lies deep in the north-east labyrinth; ${gen.glades.length} glades hold trials and treasure along the way.`, '#c8f0a0');
    else if (biome.overworld) {
      if (biome.id === 'castle' && gen.variant?.story?.intro) UI.log(gen.variant.story.intro, '#e8d0a8');
      UI.log('Activate the glowing shrine and complete its objective to open the exit.', '#ffe2a0');
    }
    else if (!c.tips.dungeon) { c.tips.dungeon = true; setTimeout(() => UI.log('Find the exit portal. It stays sealed until the depth\'s guardian is slain. The blue portal returns you to town.', '#ffe2a0'), 1500); }
    this.autosave();
  },

  useTownPortal() {
    const w = G.world;
    UI.dialog({
      title: 'Return to Town?',
      html: `<p>You will return to Herrington Hollow. ${w?.breach ? `Floor ${w.breach.floor} of the Eternal Breach` : w?.rift ? `The Rift (Tier ${w.rift.tier}) collapses behind you; it` : w?.unbound ? 'Velscour Unbound' : `Depth ${w?.depth || G.char.depth}`} will be re-forged when you come back.</p>`,
      buttons: [{ label: 'Stay' }, {
        label: 'Return', fn: () => {
          sfx('portal');
          if (G.world && G.world.depth) {
            G.char.depth = G.world.depth;
            if (G.world.depth > 1) {
              G.char.cleared[G.world.depth - 1] = true;
              G.char.deepest = Math.max(G.char.deepest || 0, G.world.depth - 1);
            }
            if (G.room) G.room.depth = G.world.depth;
            this.autosave();
          }
          this.enterTown();
        }
      }],
    });
  },

  awardFloorClear(depth, customContext = '') {
    const c = G.char;
    if (!c) return;
    const isBoss = (depth % 5 === 0) || depth === FINAL_DEPTH;
    if (isBoss) {
      c.skillPoints++;
      UI.log(customContext ? `Bonus skill point for ${customContext}!` : `Bonus skill point for defeating the Depth ${depth} Boss!`, '#ffd860');
    } else {
      grantMarks(1, `for clearing Depth ${depth}`);
    }
  },

  unsealDungeonExit(world, bossName = null, isVelscour = false, isRaid = false) {
    if (!world || world.kind !== 'dungeon' || world.biome?.overworld) return;
    const exit = world.portals?.find(p => p.type === 'exit');
    if (!exit) return;
    if (exit.active) return; // already unsealed

    exit.active = true;
    exit.color = '#40a0ff';
    exit.label = (world.unbound || world.depth >= FINAL_DEPTH || isVelscour || world.biome?.id === 'throne') ? 'Exit — to town' : 'Exit — continue';

    const c = G.char;
    if (c) {
      if (world.unbound) {
        c.unbound.wins = (c.unbound.wins || 0) + 1;
        UI.centerMsg('VELSCOUR UNBOUND HAS FALLEN', `${c.unbound.wins} time${c.unbound.wins > 1 ? 's' : ''} · the exit is open`, 4);
      } else {
        const first = !c.cleared[world.depth];
        c.cleared[world.depth] = true;
        c.deepest = Math.max(c.deepest || 0, world.depth);
        this.brokeThrough(world.depth);
        const isEvery5Boss = (world.depth % 5 === 0) || isRaid || isVelscour || world.depth === FINAL_DEPTH;
        if (first) {
          this.awardFloorClear(world.depth);
          recordDepth(world, world.depth);
        }
        const rewardText = first
          ? (isEvery5Boss ? '+1 bonus skill point · the exit is open' : '+1 Infernal Mark · the exit is open')
          : 'The exit is open';
        UI.centerMsg(bossName ? `${bossName} DEFEATED` : isRaid ? 'BOSS DEFEATED' : 'GUARDIAN SLAIN', rewardText, 3.5);
      }
      this.autosave();
    }

    addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#40a0ff', 5));
    sfx('gate');
    UI.refresh();

    if (isVelscour && !world.practice) {
      if (unlockEndgame()) UI.log('<b style="color:#20e0ff">The Endgame opens.</b> The Altar of Heresy and the Abyssal Rift gate in Herrington Hollow answer to every hero now.', '#a0f0ff');
      setTimeout(() => victoryScreen(() => { }), 3200);
    }
  },

  useExit(world, exit) {
    const c = G.char;
    if (!exit.active) {
      const isBossDead = !world.boss || world.boss.dead ||
        (world.killedMonsterIds && (
          (world.boss.netId && world.killedMonsterIds.has(world.boss.netId)) ||
          (world.boss.idx != null && world.killedMonsterIds.has(world.boss.idx))
        )) ||
        (G.room?.unsealedDepths && G.room.unsealedDepths.has(world.depth));
      if (world.kind === 'dungeon' && !world.breach && !world.rift && !world.overworldScenario && isBossDead) {
        this.unsealDungeonExit(world, world.boss?.name);
        return;
      }
      floatText(exit.x, exit.y, 70, world.breach ? 'Sealed — the Breach Heart still beats!' : world.rift ? 'Sealed — the Guardian still stands!' : world.overworldScenario ? 'Sealed — complete the shrine trial!' : 'Sealed — slay the guardian!', '#ff6040', 13, { life: 1.6 });
      sfx('error');
      return;
    }
    if (world.breach) this.breachExit(world);
    else if (world.rift) this.riftExit(world);
    else if (world.unboundExploration && world.unboundExploration.floor < MAX_UNBOUND_DEPTH) this.unboundExit(world);
    else if (world.unbound || world.depth >= FINAL_DEPTH || world.boss?.isVelscour || world.biome?.id === 'throne') {
      UI.dialog({
        title: world.unbound ? 'Velscour Unbound Defeated' : 'Demon Lord Velscour Defeated',
        html: `<p>Demon Lord Velscour has fallen. The descent is complete!</p><p class="dim">The portal behind the throne leads back to town.</p>`,
        closable: true,
        cls: 'portal-choice throne-portal-choice',
        buttons: [
          {
            label: 'Return to Town',
            cls: 'red',
            fn: () => {
              sfx('portal');
              if (c) {
                c.depth = Math.min(FINAL_DEPTH, c.depth || FINAL_DEPTH);
                c.deepest = Math.min(FINAL_DEPTH, Math.max(c.deepest || 0, FINAL_DEPTH));
              }
              if (G.room) {
                G.room.depth = Math.min(FINAL_DEPTH, G.room.depth || FINAL_DEPTH);
                if (net.connected) {
                  net.sendTownTransition(G.room.depth);
                }
              }
              this.enterTown();
            }
          },
          { label: 'Stay in Throne Room' }
        ],
      });
    } else {
      if (c.mountainRuns) delete c.mountainRuns[world.depth];   // the mountains of a depth left behind are done with
      if (c.summitRuns) delete c.summitRuns[world.depth];
      this.portalChoice(world);
    }
  },

  /**
   * A cleared exit: up to three portals down, each a biome and (where one can stir) the omen waiting there. Pick one,
   * then descend or go to town first (the town portal leads to it). With auto-play on the player has PICK_WAIT seconds
   * to choose (or to tap a portal for it) before auto-play takes its own pick; opts.auto/opts.town come from
   * auto-play's leaveLevel (town: it means to shop first).
   */
  portalChoice(world, opts = {}) {
    if (this.pick) return;
    if (world.depth >= FINAL_DEPTH || world.biome?.id === 'throne' || world.boss?.isVelscour) {
      const c = G.char;
      if (c) {
        c.depth = Math.min(FINAL_DEPTH, c.depth || FINAL_DEPTH);
        c.deepest = Math.min(FINAL_DEPTH, Math.max(c.deepest || 0, FINAL_DEPTH));
      }
      if (G.room) {
        G.room.depth = Math.min(FINAL_DEPTH, G.room.depth || FINAL_DEPTH);
        if (net.connected) {
          net.sendTownTransition(G.room.depth);
        }
      }
      UI.dialog({
        title: world.unbound ? 'Velscour Unbound Defeated' : 'Demon Lord Velscour Defeated',
        html: `<p>Demon Lord Velscour has fallen. The descent is complete!</p><p class="dim">The portal behind the throne leads back to town.</p>`,
        closable: true,
        cls: 'portal-choice throne-portal-choice',
        buttons: [
          {
            label: 'Return to Town',
            cls: 'red',
            fn: () => {
              sfx('portal');
              this.enterTown();
            }
          },
          { label: 'Stay in Throne Room' }
        ],
      });
      return;
    }
    const c = G.char, next = Math.min(FINAL_DEPTH, world.depth + 1);
    if (c) {
      c.cleared[world.depth] = true;
      c.deepest = Math.max(c.deepest || 0, world.depth);
      c.depth = next;
      this.brokeThrough(world.depth);
      this.autosave();
    }

    // When one player makes a selection at the exit portal, make it the default choice so other players enter the same map
    if (G.room && G.room.depth === next && G.room.biome && G.room.dungeonSeed) {
      const chosenBiome = BIOME_BY_ID[G.room.biome] || BIOME_BY_ID.catacombs;
      const go = (town) => {
        this.pick = null;
        c.cleared[world.depth] = true;
        c.deepest = Math.max(c.deepest || 0, world.depth);
        c.depth = next;
        c.nextBiome = chosenBiome.id;
        takeBiome(c, chosenBiome.id);
        this.autosave();
        if (Auto.on) Auto.transitT = 3;
        if (town) {
          if (opts.auto) UI.log('Auto-play heads back to town to trade.', '#8fe0ff');
          sfx('portal');
          this.enterTown();
        } else {
          this.enterDungeon();
        }
      };
      const d = UI.dialog({
        title: `Depth ${world.depth} Cleared`,
        html: `<p>A party member has chosen the way forward to Depth ${next}: <b style="color:#ffb070">${escapeHtml(chosenBiome.name)}</b>.</p><p class="dim">Descend to join the party or return to town.</p><p class="pc-auto"></p>`,
        closable: false,
        cls: 'portal-choice',
        buttons: [
          { label: 'Return to Town', fn: () => go(true) },
          { label: `Descend to Depth ${next}`, cls: 'red', fn: () => go(false) },
        ],
      });
      this.pick = {
        t: opts.auto ? 2.0 : PICK_WAIT,
        el: d.box.querySelector('.pc-auto'),
        last: '',
        choose: () => {
          d.close();
          go(opts.auto ? opts.town : Auto.needTown());
        },
        name: () => chosenBiome.name,
      };
      return;
    }

    const ids = biomeChoices(c, next, 3);
    // a Town Commission waiting for a biome: its portal turns up among the three more often (game/commissions.js)
    const eligible = new Set(biomesForDepth(next));
    const want = wantedBiomes(c).filter((id) => eligible.has(id) && BIOME_BY_ID[id] && !ids.includes(id) && id !== c.lastBiome);
    if (want.length && ids.length && next !== FINAL_DEPTH && Math.random() < 0.4) ids[ids.length - 1] = want[Math.floor(Math.random() * want.length)];
    const cards = ids.map((id) => {
      const biome = BIOME_BY_ID[id] || BIOME_BY_ID.catacombs;
      const comm = commState(c).open.find((e) => { const ch = LINE_BY_ID[e.id] && LINE_BY_ID[e.id].chapters[e.ch]; return ch && ch.biome === biome.id; });
      return { id: biome.id, biome, affixes: rollDungeonAffixesForDepth(next, Math.random, c && c.affixStartDepth || 1, heresiesOf(c).includes('omens')), comm: comm && LINE_BY_ID[comm.id].name };
    });
    let sel = 0, chosen = false;
    const tag = (cd) => (cd.biome.id === 'throne' ? (next === FINAL_DEPTH ? '<b style="color:#ff4020">Demon Lord Velscour awaits</b>' : 'Guardian') : cd.biome.id === 'skyship' ? 'Sky battle' : cd.biome.sea ? 'Sea battle' : cd.biome.id === 'dark_forest' ? 'Guardian · Optional labyrinths' : cd.biome.id === 'castle' ? 'Castle Guardian' : cd.biome.id === 'overworld' ? 'Forsaken Guardian' : cd.biome.overworld ? 'Overworld trial' : isRaidDepth(next) ? '<b style="color:#ff6030">BOSS ROOM</b>' : 'Dungeon');
    const affixLine = (cd) => `<span class="pc-affixes"><b>Affixes</b>${cd.affixes.length ? cd.affixes.map((id) => {
      const affix = DUNGEON_AFFIX_BY_ID[id];
      return affix ? `<span title="${escapeHtml(affix.description)}"><b>${escapeHtml(affix.name)}</b><small class="pc-affix-description">${escapeHtml(String(affix.description || '').trim())}</small></span>` : '';
    }).join('') : '<i>No affixes</i>'}</span>`;
    const html = `<p class="dim">${cards.length > 1 ? `Depth ${next} lies beyond ${['', 'one', 'two', 'three'][cards.length]} portals. Choose your way down.` : `The way down opens onto Depth ${next}.`}</p>
      <div class="pc-row">${cards.map((cd, i) => `<button type="button" class="pc-card${i === sel ? ' sel' : ''}" data-i="${i}" style="--pc:${cd.biome.torch || '#ff8040'}"><i class="pc-swirl"></i><b class="pc-name">${escapeHtml(cd.biome.name)}</b><span class="pc-tag">${tag(cd)}</span>${cd.comm ? `<span class="pc-commission" style="color:#8fe0ff"><b>Commission</b>${escapeHtml(cd.comm)}</span>` : ''}${affixLine(cd)}</button>`).join('')}</div>
      <p class="pc-auto"></p>`;
    const go = (town) => {
      this.pick = null;
      const cd = cards[sel];
      c.cleared[world.depth] = true;
      c.deepest = Math.max(c.deepest || 0, world.depth);
      c.depth = next; c.nextBiome = cd.id; takeBiome(c, cd.id, next);
      c.dungeonAffixes = normalizeDungeonAffixIds(cd.affixes);
      c.nextAffixes = [...c.dungeonAffixes];
      this.autosave();
      let dungeonSeed = Math.floor(Math.random() * 1e9) + 1;
      const mix = mixPartner(cd.biome, () => new RNG(dungeonSeed ^ 0x3d17a892).next());
      const mixId = mix ? mix.id : null;
      if (G.room) {
        G.room.depth = next;
        G.room.biome = cd.id;
        G.room.dungeonSeed = dungeonSeed;
        G.room.mixId = mixId;
        G.room.heresies = heresiesOf(c);
        G.room.dungeonAffixes = c.dungeonAffixes;
        if (net.connected) {
          net.sendRoomDepthUpdate(next, cd.id, dungeonSeed, mixId, G.room.heresies);
        }
      }
      if (Auto.on) Auto.transitT = 3;
      if (town) {
        if (opts.auto) UI.log('Auto-play heads back to town to trade.', '#8fe0ff');
        sfx('portal');
        this.enterTown();
      } else {
        this.enterDungeon();
      }
    };
    const d = UI.dialog({
      title: `Depth ${world.depth} Cleared`, html, closable: false, cls: 'portal-choice',
      buttons: [{ label: 'Return to Town', fn: () => go(true) }, { label: `Descend to Depth ${next}`, cls: 'red', fn: () => go(false) }],
    });
    const btns = [...d.box.querySelectorAll('.pc-card')];
    btns.forEach((b) => b.addEventListener('click', () => {
      sel = +b.dataset.i; chosen = true; sfx('ui');
      btns.forEach((x) => x.classList.toggle('sel', x === b));
      if (this.pick) this.pick.t = Math.min(this.pick.t, 3); // auto-play goes where it was told, after a moment
    }));
    // auto-play's own pick: a portal with a commission, else any
    const autoPick = () => { const k = cards.findIndex((cd) => cd.comm); if (k >= 0) return k; return Math.floor(Math.random() * cards.length); };
    this.pick = {
      t: opts.auto ? 2.0 : PICK_WAIT, el: d.box.querySelector('.pc-auto'), last: '',
      choose: () => { d.close(); if (!chosen) sel = autoPick(); go(opts.auto ? opts.town : Auto.needTown()); },
      name: () => (chosen ? cards[sel].biome.name : null),
    };
  },

  /** The portal choice's auto-play countdown (runs while the dialog pauses the world). */
  tickPick(dt) {
    const pk = this.pick;
    if (!pk) return;
    if (!pk.el || !pk.el.isConnected) {
      if (Auto.on) {
        pk.choose();
      } else {
        this.pick = null;
      }
      return;
    }
    let txt = '';
    if (Auto.on && G.char) {
      pk.t -= dt;
      if (pk.t <= 0) { pk.choose(); return; }
      const nm = pk.name();
      txt = nm ? `Auto-play takes the portal to ${escapeHtml(nm)} in ${Math.ceil(pk.t)}…` : `Auto-play picks a portal in ${Math.ceil(pk.t)}… tap one to choose for it.`;
    }
    if (txt !== pk.last) { pk.last = txt; pk.el.innerHTML = txt; }
  },

  /** A cleared depth: if it ends the Defiance block, the stacks are spent (and say so). */
  brokeThrough(depth) {
    const c = G.char, had = c.defiance && c.defiance.n;
    commissionClear(G.world);
    keepClear(G.world); // Tessariel's Keep's counters: clears, BOSS ROOMs, trials, times (game/keep.js)
    greedCleared(G.world, c); // the Greed lever pays into the Hoard (game/greed.js)
    if (worldRank(G.world) >= MARKS_RANK && !G.world.markPaid) { G.world.markPaid = true; grantMarks(1, `for a depth cleared at Heresy rank ${worldRank(G.world)}`); } // (docs/ENDGAME.md)
    if (!clearDefiance(c, depth)) return;
    if (G.player) G.player.recompute();
    UI.log(`The wall is broken. <b style="color:#ff6a3a">Defiance ${had}</b> fades — Velscour takes note.`, '#ffb080');
  },

  onPlayerDeath(src) {
    const c = G.char;
    const w = G.world;
    keepDeath();
    if (w && w.breach) return this.breachDeath(src);
    if (w && w.rift) return this.riftDeath(src);
    if (w && (w.unbound || w.unboundExploration)) return this.unboundDeath(src);
    c.deaths = (c.deaths || 0) + 1;
    const depth = clamp(w && w.kind === 'dungeon' ? w.depth : (c.depth || 1), 1, FINAL_DEPTH);
    const n = addDefiance(c, depth);
    markNemesis(c, src, depth); // the killer comes back as a unique (game/happenings.js)
    greedDeath(c); // the Hoard is lost and the Greed lever drops (game/greed.js)
    G.smiteArmed = false;
    delete c.nextOmen;
    const killer = src ? (src.owner ? src.owner.name : src.name) : null;
    stopMusic();
    this.autosave();
    setTimeout(() => {
      deathScreen(depth, killer, () => {
        // back to the start of this five-depth block (BOSS ROOMs are checkpoints), a Defiance stack stronger
        if (G.room) {
          c.depth = clamp(G.room.depth || depth, 1, FINAL_DEPTH);
          if (G.room.depth > FINAL_DEPTH) G.room.depth = FINAL_DEPTH;
          c.nextBiome = G.room.biome || c.nextBiome;
        } else {
          c.depth = clamp(blockStart(depth), 1, FINAL_DEPTH);
          c.nextBiome = drawBiome(c, c.depth);
        }
        delete c.mountainRuns; delete c.summitRuns;   // the mountains' checkpoints don't outlive a death
        const p = G.player;
        p.dead = false;
        p.buffs = [];
        p.recompute();
        p.hp = p.maxHp; p.mana = p.maxMana;
        this.enterTown();
        UI.log(`You awaken in Herrington Hollow. The descent begins anew at Depth ${c.depth}.`, '#ff8060');
        UI.log(`<b style="color:#ff6a3a">Defiance ${n}</b>: ${defianceText(n)} until you break past Depth ${c.defiance.block + 4}.`, '#ffb080');
      });
    }, 1700);
  },

  // ------------------------------------------------------------ THE ETERNAL BREACH (docs/ETERNAL_BREACH.md)
  /** The highest Breach floor the hero may enter: one past the best floor beaten (capped at MAX_BREACH_FLOOR 50). */
  breachOpen() { const b = G.char?.breach; return Math.min(MAX_BREACH_FLOOR, (b?.best || 0) + 1); },

  /** The purple portal: pick a floor (any up to one past the best beaten, max 50) and step in. */
  confirmBreach(floor) {
    const portal = G.world?.portals?.find((p) => p.breach);
    const away = this.getPlayersAwayFromPortal(portal);
    if (away.length > 0) {
      sfx('error');
      UI.dialog({
        title: 'Party Not Ready',
        html: `<p>All players must gather at the breach portal to enter together.</p><p style="color:#ffd860;margin-top:10px;">Waiting for: <b>${away.map(escapeHtml).join(', ')}</b></p>`,
        buttons: [{ label: 'OK' }],
      });
      return;
    }
    const c = G.char, top = this.breachOpen(), pick = Math.min(top, Math.max(1, floor || top));
    const opt = (n) => {
      const L = breachLevel(n), won = c.breach?.cleared?.[n] || 0;
      const v = wyrmVariant(n);
      const isApex = n >= MAX_BREACH_FLOOR;
      const cycle = breachCycle(n);
      const wyrmLabel = isApex ? 'APEX WYRM (The Void Convergence)' : `Cycle ${cycle}: ${v.name} (${v.el.toUpperCase()})`;
      return `<option value="${n}"${n === pick ? ' selected' : ''}>Floor ${n} · ${wyrmLabel} — Depth ${breachDepth(n)} (Lvl ${L})${won ? ` · beaten ${won}x` : n === top ? ' · new' : ''}</option>`;
    };
    const floors = [];
    for (let n = top; n >= 1; n--) floors.push(opt(n));
    const d = UI.dialog({
      title: 'THE ETERNAL BREACH', cls: 'breach-dialog',
      html: `<p>The purple portal opens on <b style="color:#c080ff">a broken world floating in the void</b>: sixteen islands joined by walkways, held by the Breach's own monsters.</p>
        <p class="dim">Slay the 7 Elemental Wyrms across 7 Ascensions (Floors 1–49) to face the Apex Ethereal Wyrm at Floor 50. Floor N is as deadly as Depth 10&times;N. Falling here costs no Defiance and leaves your campaign descent untouched.</p>
        <label class="Velscour-message-label" for="breach-floor">Floor</label><select id="breach-floor" class="Velscour-biome-select">${floors.join('')}</select>
        <p class="breach-warn" id="breach-warn"></p>`,
      buttons: [{ label: 'Not yet' }, { label: 'Enter the Breach', cls: 'red', fn: () => this.enterBreach(+d.box.querySelector('#breach-floor').value) }],
    });
    const sel = d.box.querySelector('#breach-floor'), warn = d.box.querySelector('#breach-warn');
    const upd = () => { const L = breachLevel(+sel.value); warn.innerHTML = L > c.level + 4 ? `<b style="color:#ff6050">Monsters there are level ${L}; you are level ${c.level}. Expect to die.</b>` : ''; };
    sel.addEventListener('change', upd); upd();
    return d;
  },

  enterBreach(floor) {
    const c = G.char;
    floor = Math.max(1, Math.min(this.breachOpen(), floor | 0 || 1));
    c.breach ||= { best: 0, cleared: {} };
    c.breach.floor = floor;
    LoadingScreen.show({
      title: 'THE ETERNAL BREACH',
      subtitle: `Floor ${floor}`,
      text: `Into the Eternal Breach — Floor ${floor}…`,
      progress: 10
    });
    sfx('portal');
    setTimeout(async () => {
      try {
        LoadingScreen.setProgress(30, 'Unsealing breach wards…');
        await this.loadLevelArt(BREACH_BIOME);
      } catch (e) { console.warn(e); }
      try {
        LoadingScreen.setProgress(55, 'Forging the shattered rift…');
        this.buildBreach(floor);
        const w = G.world;
        LoadingScreen.setProgress(75, 'Summoning breach horrors…');
        await loadArtFor(BREACH_ART.map((a) => a.id), true).catch((e) => console.warn(e)); // the Breach's six atlases (~1.6 MB)
        LoadingScreen.setProgress(90, 'Stabilizing dimensions…');
        await warmLevelArt(w);
        releaseLevelArt(BREACH_BIOME);
        LoadingScreen.setProgress(100, 'Arriving…');
      } finally {
        await LoadingScreen.hide();
        this.spawnPlayer(G.world);
      }
    }, 40);
  },

  buildBreach(floor, seed = G.breachSeed ?? (Math.random() * 1e9) | 0) { // G.breachSeed: tests
    const c = G.char, old = G.world, B = BREACH_BIOME, depth = breachDepth(floor), lvl = breachLevel(floor);
    c.breach ||= { best: 0, cleared: {} };
    const a = biomeTileSet(B), b = biomeTileSet(BREACH_WALLS);
    // the Eternal Breach's floors and scatter, and both packs' walls, arches and doors for the ruins
    const tileset = { ...a, walls: { ...a.walls, ...b.walls }, families: [...a.families, ...b.families], arches: { ...a.arches, ...b.arches }, doors: { ...a.doors, ...b.doors }, parts: [a, b] };
    keepTileSets(tileset);
    const gen = generateBreach(floor, B, tileset, null, seed);
    const world = new World('dungeon', { map: gen.map, tileset, biome: B, depth, props: gen.props, torches: [], wallHangings: [], looks: gen.looks, townTiles: null, buildings: [] });
    world.breach = { floor, seed }; world.breachBridges = gen.bridges; world.rooms = [];
    world.chests = gen.chests.map((ch) => chestAt(world, ch.x, ch.y, ch.rare, depth));
    const [sx, sy] = gen.start;
    let tp = [sx + 1.4, sy - 1.2];
    if (!gen.map.walkable(tp[0], tp[1])) tp = gen.map.randomNear(sx, sy, 2);
    const exit = { x: gen.exit[0], y: gen.exit[1], type: 'exit', active: false, color: '#4a3a5a', reach: 2, label: 'Sealed — the Breach Heart', use: () => this.useExit(world, exit) };
    world.portals = [{ x: tp[0], y: tp[1], type: 'town', active: true, color: '#3a8aff', reach: 1.6, label: 'Town Portal', use: () => this.useTownPortal() }]; // the exit appears when the Heart is won
    for (const s of heresySpawns(gen.spawns, heresyBegin(world, c))) { // Twinned Packs reach the Breach too (game/heresies.js)
      for (let i = 0; i < s.n; i++) {
        const [x, y] = i === 0 ? [s.x, s.y] : gen.map.randomNear(s.x, s.y, 1.6);
        const rank = i === 0 ? s.rank : 'normal';
        const m = makeMonster(world, s.arch, B, lvl + (rank === 'normal' ? 0 : 1), rank, x, y, Math.random() < 0.25 ? 1 : 0, gen.looks.pick(s.arch));
        breachMonster(m);
        world.add(m);
      }
    }
    world.roster = BREACH_ARCHS;
    heresyWorld(world, c);
    world.onBossAwake = () => { };
    world.onBossKilled = () => { };
    world.overworldScenario = createBreachRun(world, gen, B, floor, () => {
      exit.active = true; exit.color = '#c050ff'; exit.label = 'Exit — onward or home';
      world.portals.push(exit);
      addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#c050ff', 5));
      sfx('gate'); UI.refresh(); this.autosave();
    });
    world._generatingDungeon = false;
    this.setWorld(world, gen.start, old);
    world.night = true;
    HUD.setArea('The Eternal Breach', `Floor ${floor} · as deadly as Depth ${depth}${worldRank(world) ? ` · Heresy ${worldRank(world)}` : ''}`);   // (the floor in the name ran under a phone's boss bar)
    playMusic('wilds', { delay: 3 + Math.random() * 10 }); setAmbience('eternal_breach');
    UI.centerMsg('THE ETERNAL BREACH', `Floor ${floor} · as deadly as Depth ${depth}`, 3);
    UI.log(`Floor ${floor} of the Eternal Breach: win the shrines on the medium and large islands to lift the wards on the walkways, then face the keeper of the <b style="color:#ff70d0">Breach Heart</b>.`, '#d8b0ff');
    this.autosave();
  },

  /** The exit on a beaten floor: on to the next floor, or home. opts.auto: auto-play's call (opts.town: it wants to shop). */
  breachExit(world, opts = {}) {
    const next = world.breach.floor + 1;
    if (Auto.on) Auto.transitT = 3;
    if (opts.auto) {
      if (opts.town || !Auto.breachReady(next)) { UI.log(opts.town ? 'Auto-play heads back to town to trade.' : `Auto-play judges Floor ${next} too deadly for now and heads home.`, '#8fe0ff'); sfx('portal'); this.enterTown(); }
      else this.enterBreach(next);
      return;
    }
    UI.dialog({
      title: `Breach Floor ${world.breach.floor} Sealed`,
      html: `<p>The Heart is still. Deeper in the Breach lies <b style="color:#c080ff">Floor ${next}</b>, as deadly as Depth ${breachDepth(next)} (monster level ${breachLevel(next)}).</p>`,
      buttons: [{ label: 'Return to Town', fn: () => { sfx('portal'); this.enterTown(); } }, { label: `On to Floor ${next}`, cls: 'red', fn: () => this.enterBreach(next) }],
    });
  },

  /** Death in the Breach: back to town with no Defiance, the descent untouched. */
  breachDeath(src) {
    const c = G.char, floor = G.world.breach.floor;
    c.deaths = (c.deaths || 0) + 1;
    c.breach.deaths = (c.breach.deaths || 0) + 1;
    G.smiteArmed = false;
    const killer = src ? (src.owner ? src.owner.name : src.name) : null;
    stopMusic();
    if (Auto.on) Auto.breachDied();
    this.autosave();
    setTimeout(() => {
      deathScreen(breachDepth(floor), killer, () => {
        const p = G.player;
        p.dead = false; p.buffs = []; p.recompute(); p.hp = p.maxHp; p.mana = p.maxMana;
        this.enterTown();
        UI.log(`The Breach casts you out. Floor ${floor} waits beyond the purple portal; your descent still stands at Depth ${c.depth}.`, '#c890ff');
      }, { where: `on Floor ${floor} of the Eternal Breach`, note: 'Your gear, levels and skills endure, and the Breach takes no toll on your descent. Grow stronger and try the floor again.' });
    }, 1700);
  },

  // ------------------------------------------------------------ ABYSSAL RIFTS (docs/ENDGAME.md)
  /** The rift gate: pick a tier (ui/rifts.js) and step in. Refused until the Endgame is open. */
  confirmRift(tier) {
    if (!endgameUnlocked()) { UI.log('<b style="color:#20e0ff">The Abyssal Rift</b> is sealed: Velscour still sits his throne. Slay him at Depth 500 and it opens for every hero.', '#a0f0ff'); sfx('error'); return null; }
    return Rifts.open(tier);
  },
  enterRift(tier) {
    const c = G.char;
    if (!endgameUnlocked() || this.riftLoading) return; // one rift at a time (auto-play may step on the gate again while it loads)
    tier = Math.max(1, Math.min(riftOpen(c), tier | 0 || 1));
    const pool = BIOMES.filter((b) => !b.overworld && !b.beta && !b.challenge && !b.tower && !b.cave && b.id !== 'throne' && b.id !== c.lastRift);
    const biome = pick(pool.length ? pool : BIOMES.filter((b) => !b.overworld)) || BIOME_BY_ID.catacombs;
    c.lastRift = biome.id;
    const mix = mixPartner(biome);
    LoadingScreen.show({
      title: 'ABYSSAL RIFT',
      subtitle: `Tier ${tier}`,
      text: `Into the Abyssal Rift — Tier ${tier}…`,
      progress: 10
    });
    sfx('portal');
    this.riftLoading = true;
    setTimeout(async () => {
      try {
        LoadingScreen.setProgress(30, 'Breaching dimensional folds…');
        await this.loadLevelArt(biome, mix);
      } catch (e) { console.warn(e); }
      try {
        this.riftLoading = false;
        LoadingScreen.setProgress(55, 'Weaving rift chaos…');
        this.buildRift(tier, biome, mix);
        const w = G.world;
        LoadingScreen.setProgress(75, 'Empowering champions…');
        await loadArtFor([...w.creatures.map((m) => m.art), ...(w.looks ? w.looks.ids() : [])], true).catch((e) => console.warn(e));
        LoadingScreen.setProgress(90, 'Igniting the beacon…');
        await warmLevelArt(w);
        releaseLevelArt(biome);
        LoadingScreen.setProgress(100, 'Arriving…');
      } finally {
        await LoadingScreen.hide();
        this.spawnPlayer(G.world);
      }
    }, 40);
  },
  /** A rift level: a small maze and a BOSS ROOM arena of a standard biome, as deadly as depth 500 + 10 T, no boss until the quota. */
  buildRift(tier, biome = BIOME_BY_ID.catacombs, mix = null, seed = G.riftSeed ?? (Math.random() * 1e9) | 0) {
    const c = G.char, old = G.world, depth = riftDepth(tier), lvl = riftLevel(tier);
    const tileset = mix ? mixedTileSet(biome, mix, Math.random() < 0.5) : biomeTileSet(biome);
    keepTileSets(tileset);
    const gen = generateDungeon(depth, biome, tileset, seed, { rift: true, raid: true, small: true, density: RIFT_DENSITY });
    const world = new World('dungeon', { map: gen.map, tileset, biome, depth, props: gen.props, torches: gen.torches, wallHangings: gen.wallHangings, looks: gen.looks, townTiles: null, buildings: [] });
    world.rooms = gen.rooms || [];
    world.riftHold = true; // rift monsters keep the old Endless Torment life (data/depth.js riftHold)
    world.chests = gen.chests.map((ch) => ({ ...ch, opened: false, reach: 1.3, use() { if (this.opened) return; this.opened = true; sfx('chest'); sfx('gold'); dropChest(world, this, depth); sparkle(this.x, this.y, 20, '#ffd060', 20, 0.5); } }));
    // Spawn 1-2 Pylons in rooms away from the start (a room's middle in tiles: its cx/cy are the maze chunk's index,
    // which put every pylon in the map's top corner, often in the wall, and auto-play walked at it for good)
    const pylonRooms = shuffle((gen.rooms || []).filter((r) => r.mx > 0 && Math.hypot(r.mx - gen.start[0], r.my - gen.start[1]) > 8));
    const chosenPylons = shuffle(PYLONS.slice()).slice(0, 2);
    for (let pi = 0; pi < chosenPylons.length && pi < pylonRooms.length; pi++) {
      const pdef = chosenPylons[pi];
      const pr = pylonRooms[pi];
      const [px, py] = gen.map.walkable(pr.mx, pr.my) && gen.map.circleFree(pr.mx, pr.my, 0.3) ? [pr.mx, pr.my] : gen.map.randomNear(pr.mx, pr.my, 2.5);
      if (!gen.map.walkable(px, py)) continue;
      world.chests.push({
        x: px, y: py, opened: false, reach: 1.5, dot: pdef.color, pylon: true,
        label: pdef.name,
        use() {
          if (this.opened) return;
          this.opened = true;
          this.label = `${pdef.name} (Spent)`;
          activatePylon(world, pdef);
        },
      });
    }
    const [sx, sy] = gen.start;
    let tp = gen.townPortal || [sx + 1.6, sy - 0.6];
    if (!gen.map.walkable(tp[0], tp[1])) tp = gen.map.randomNear(sx, sy, 2);
    const exit = { x: gen.exit[0], y: gen.exit[1], type: 'exit', active: false, color: '#5a5a60', reach: 1.6, label: 'Sealed Exit', use: () => this.useExit(world, exit) };
    world.portals = [{ x: tp[0], y: tp[1], type: 'town', active: true, color: '#3a8aff', reach: 1.6, label: 'Town Portal', use: () => this.useTownPortal() }, exit];
    for (const s of gen.spawns) {
      if (s.rank === 'raid' || s.rank === 'boss') continue; // the Guardian stirs at the quota (game/rifts.js)
      const variant = Math.random() < 0.4 ? 1 : 0, trait = rollTrait(world, Math.min(depth, 500));
      for (let i = 0; i < s.n; i++) {
        const [x, y] = i === 0 ? [s.x, s.y] : gen.map.randomNear(s.x, s.y, 1.6);
        const rank = s.rank === 'unique' ? (i === 0 ? 'unique' : 'normal') : s.rank;
        const m = makeMonster(world, s.arch, biome, lvl + (rank === 'normal' ? 0 : 1), rank, x, y, variant, s.look);
        if (s.rank === 'unique' && i > 0) { m.affixes = []; m.name = m.name + ' Minion'; }
        if (trait && (i === 0 || ['hunter', 'phaser', 'burrower'].includes(trait))) applyTrait(m, trait);
        world.add(m);
      }
    }
    world.roster = [...new Set(gen.spawns.filter((s) => s.arch && !['raid', 'boss'].includes(s.rank)).map((s) => s.arch))];
    world.rift = createRiftRun(world, gen, tier, {
      onWin: () => { exit.active = true; exit.color = '#20e0ff'; exit.label = 'Exit — onward or home'; addEffect(new Ring(exit.x, exit.y, 0.2, 3, 1, '#20e0ff', 5)); sfx('gate'); UI.refresh(); this.autosave(); },
      onFail: () => this.autosave(),
      onBack: () => { if (G.world === world) { stopMusic(); this.enterTown(); UI.log(`The Rift threw you back into Herrington Hollow. Tier ${tier} waits at the gate.`, '#a0f0ff'); } },
    });
    c.rifts.runs = (c.rifts.runs || 0) + 1;
    world.onBossAwake = (m) => { UI.centerMsg(m.name, `${m.title}${m.raid && m.raid.mods.length ? ' · ' + m.raid.modText() : ''}`, 3); sfx('boss'); };
    world.onBossKilled = () => { }; // riftWin handles it
    world._generatingDungeon = false;
    this.setWorld(world, gen.start, old);
    world.darkK = Math.max(world.darkK || 0, 0.25);
    HUD.setArea('Abyssal Rift', `Tier ${tier} · ${biome.name} · as deadly as Depth ${depth}`);
    playMusic('wilds', { delay: 2 }); setAmbience(biome.id);
    UI.centerMsg('ABYSSAL RIFT', `Tier ${tier} · ${fmtTime(world.rift.limit)} on the clock`, 3);
    UI.log(`<b style="color:#20e0ff">Abyssal Rift Tier ${tier}</b> (${biome.name}, as deadly as Depth ${depth}): slay ${Math.round(100 * RIFT_QUOTA)}% of the rift's monsters to wake the Guardian in the arena, and slay it before the clock runs out. Faster wins open more tiers.`, '#a0f0ff');
    this.autosave();
  },
  /** The exit of a closed rift: on to the next tier, or home. opts.auto: auto-play's call (opts.town: it wants to shop). */
  riftExit(world, opts = {}) {
    const R = world.rift, next = Math.min(riftOpen(), R.result ? R.result.next : R.tier + 1);
    if (Auto.on) Auto.transitT = 3;
    if (opts.auto) { // on to the next tier, or the highest open one it is ready for when that is still a climb; else home
      const go = Auto.riftReady(next) ? next : Auto.riftTier();
      if (opts.town || go <= R.tier) { UI.log(opts.town ? 'Auto-play heads back to town to trade.' : `Auto-play judges Tier ${next} too deadly for now and heads home.`, '#8fe0ff'); sfx('portal'); this.enterTown(); }
      else this.enterRift(go);
      return;
    }
    Rifts.results(R, { onNext: () => this.enterRift(next), onTown: () => { sfx('portal'); this.enterTown(); }, next });
  },
  /** Death in a rift: back to town with no Defiance, the descent untouched. */
  riftDeath(src) {
    const c = G.char, R = G.world?.rift;
    c.deaths = (c.deaths || 0) + 1;
    if (c.rifts) c.rifts.deaths = (c.rifts.deaths || 0) + 1;
    if (R) riftDeathPenalty(G.world);
    if (!R || R.left <= 0) {
      if (R && !R.done) R.failed = true;
      G.smiteArmed = false;
      const killer = src ? (src.owner ? src.owner.name : src.name) : null;
      stopMusic();
      this.autosave();
      setTimeout(() => {
        deathScreen(R ? riftDepth(R.tier) : 500, killer, () => {
          const p = G.player;
          p.dead = false; p.buffs = []; p.recompute(); p.hp = p.maxHp; p.mana = p.maxMana;
          this.enterTown();
          UI.log(`The Rift collapsed. Tier ${R ? R.tier : 1} waits at the gate.`, '#a0f0ff');
        }, { where: `in Abyssal Rift Tier ${R ? R.tier : 1}`, note: 'The timer ran out from death penalties. Try the tier again, or a lower one.' });
      }, 1500);
      return;
    }
    // Time remaining: respawn at start with brief invulnerability
    const p = G.player;
    setTimeout(() => {
      p.dead = false; p.buffs = []; p.recompute(); p.hp = p.maxHp; p.mana = p.maxMana;
      if (G.world?.gen?.start) {
        p.x = G.world.gen.start[0];
        p.y = G.world.gen.start[1];
      }
      p.invuln = 4;
      UI.centerMsg('RESPAWNED', 'Return to the fight before the timer expires', 2.0);
    }, 1500);
  },

  // ------------------------------------------------------------ VELSCOUR UNBOUND & UNBOUND EXPLORATION (docs/ENDGAME.md)
  /** 1 Abyssal Key (or free when reached via descent / Hearthstone): the rematch on his throne at Floor 100 with the Court of the Abyss. */
  async enterUnbound(floor = 100, costKey = true) {
    const c = G.char;
    if (costKey && !unboundReady(c)) { UI.log(`<b style="color:#20e0ff">Velscour Unbound</b> needs 1 Abyssal Key (you hold ${keysOf(c)})${endgameUnlocked(c) ? '' : ' and Velscour slain at Depth 500'}. Keys drop from Abyssal Rift Guardians and high Bosses.`, '#a0f0ff'); sfx('error'); return false; }
    if (costKey) spendUnboundKey(c);
    if (costKey && hearthPortalActive()) closeHearthPortals();
    const depth = 500, biome = BIOME_BY_ID.throne;
    LoadingScreen.show({
      title: 'VELSCOUR UNBOUND',
      subtitle: 'Unbound Climax · Floor 100',
      text: 'Velscour Unbound — Floor 100…',
      progress: 10
    });
    try {
      LoadingScreen.setProgress(30, 'Unsealing the throne room…');
      await this.loadLevelArt(biome);
      G.unboundNext = true;
      LoadingScreen.setProgress(55, 'Rebuilding the court…');
      this.buildDungeon(depth, biome);
      const w = G.world;
      w.unboundExploration = { floor: 100, active: true };
      LoadingScreen.setProgress(75, 'Awakening the demon lord…');
      await loadArtFor([...w.creatures.map((m) => m.art), ...(w.looks ? w.looks.ids() : []), ...(w.Velscour ? w.Velscour.courtArt || [] : [])], true).catch((e) => console.warn(e)); // (his court steps in later)
      LoadingScreen.setProgress(90, 'Preparing the battleground…');
      await warmLevelArt(w);
      releaseLevelArt(biome);
      const p = G.player;
      if (w.Velscour && p) {
        const [x, y] = w.map.nudge(22.5, 26.5, 0.4);
        p.x = x; p.y = y; p.path = null; p.moveTarget = null; p.attackTarget = null;
        for (const s of w.creatures) if (s.team === 'player' && s !== p) [s.x, s.y] = w.map.randomNear(x, y, 1.5);
        w.map.reveal(x, y, 30);
        camera.follow(x, y, 0, true);
      }
      UI.log('<b style="color:#ff4020">Velscour Unbound.</b> The key turns; the Demon Lord rises with his court at his side. There is no practice here.', '#ffb0a0');
      LoadingScreen.setProgress(100, 'Arriving…');
    } catch (e) {
      console.warn(e); G.unboundNext = false;
      if (costKey) c.keys = (c.keys || 0) + 1; // the key comes back
      UI.log('The abyss rejected the key. Try again.', '#ff8060');
    } finally {
      await LoadingScreen.hide();
      this.spawnPlayer(G.world);
      this.autosave();
    }
    return true;
  },

  /** Step into an Unbound Exploration floor (1..100). costKey is true only when starting or re-entering from town. */
  async enterUnboundExploration(floor = 1, costKey = true) {
    const c = G.char;
    floor = clamp(floor | 0, 1, MAX_UNBOUND_DEPTH);
    if (floor === MAX_UNBOUND_DEPTH) {
      return this.enterUnbound(100, costKey);
    }
    if (costKey && !canEnterUnbound(c)) {
      UI.log(`<b style="color:#20e0ff">Unbound Exploration</b> requires 1 Abyssal Key (you hold ${keysOf(c)}). Keys drop from Abyssal Rift Guardians and high Bosses.`, '#a0f0ff');
      sfx('error');
      return false;
    }

    if (costKey) spendUnboundKey(c);
    if (costKey && hearthPortalActive()) closeHearthPortals();

    const depth = unboundDepth(floor);
    const biome = drawBiome(c, depth);
    const mix = mixPartner(biome);

    if (this._enteringDungeon) return;
    this._enteringDungeon = true;
    if (this.unsealSfxTimer) { clearTimeout(this.unsealSfxTimer); this.unsealSfxTimer = null; }

    LoadingScreen.show({
      title: 'UNBOUND EXPLORATION',
      subtitle: `Floor ${floor} · Hardmode Depth ${depth}`,
      text: `Descending into Unbound Floor ${floor} — ${biome.name}…`,
      progress: 10
    });
    sfx('portal');

    setTimeout(async () => {
      try {
        LoadingScreen.setProgress(25, `Mapping ${biome.name}…`);
        await this.loadLevelArt(biome, mix);
      } catch (e) { console.warn(e); }
      try {
        LoadingScreen.setProgress(50, 'Forging abyssal labyrinth…');
        G.unboundExplorationFloor = floor;
        this.buildDungeon(depth, biome, mix);
        const w = G.world;
        LoadingScreen.setProgress(75, 'Summoning inhabitants…');
        await loadArtFor([...w.creatures.map((m) => m.art), ...(w.looks ? w.looks.ids() : [])], true).catch((e) => console.warn(e));
        LoadingScreen.setProgress(90, 'Preparing the veil…');
        await warmLevelArt(w);
        releaseLevelArt(biome);
        LoadingScreen.setProgress(100, 'Arrived.');
      } catch (e) {
        console.warn(e);
        G.unboundExplorationFloor = null;
        if (costKey) c.keys = (c.keys || 0) + 1;
        UI.log('The abyss rejected your passage.' + (costKey ? ' Key refunded.' : ''), '#ff8060');
      } finally {
        await LoadingScreen.hide();
        this.spawnPlayer(G.world);
        this._enteringDungeon = false;
        this.autosave();
      }
    }, 40);
    return true;
  },

  /** Cleared exit in Unbound Exploration: advance to next floor directly, or offer checkpoint town return */
  unboundExit(world) {
    const floor = world.unboundExploration?.floor || 1;
    const c = G.char;
    const next = floor + 1;
    if (c.unboundExploration) {
      c.unboundExploration.currentFloor = next;
      c.unboundExploration.deepest = Math.max(c.unboundExploration.deepest || 1, next);
    }
    this.autosave();

    if (isUnboundCheckpointFloor(floor)) {
      UI.dialog({
        title: `Unbound Checkpoint: Floor ${floor} Cleared`,
        html: `<p>A resonant checkpoint awakens! Your progress to <b style="color:#20e0ff">Floor ${next}</b> is secured.</p><p class="dim">You may return to town freely or press deeper into the Unbound Depths without spending a key.</p>`,
        closable: false,
        cls: 'portal-choice',
        buttons: [
          {
            label: 'Return to Town',
            fn: () => {
              sfx('portal');
              this.enterTown();
            }
          },
          {
            label: next === MAX_UNBOUND_DEPTH ? 'Face Velscour Unbound (Floor 100)' : `Descend to Floor ${next}`,
            cls: 'red',
            fn: () => this.enterUnboundExploration(next, false)
          }
        ]
      });
    } else {
      sfx('gate');
      UI.log(`<b style="color:#20e0ff">Unbound Floor ${floor} Cleared.</b> Descending directly to Floor ${next}…`, '#a0f0ff');
      this.enterUnboundExploration(next, false);
    }
  },

  /** Death in Velscour Unbound / Unbound Exploration: back to town; no Defiance, key is spent. */
  unboundDeath(src) {
    const c = G.char;
    c.deaths = (c.deaths || 0) + 1;
    G.smiteArmed = false;
    const killer = src ? (src.owner ? src.owner.name : src.name) : null;
    stopMusic();
    this.autosave();
    const w = G.world;
    const isExploration = !!w?.unboundExploration && w?.unboundExploration?.floor < MAX_UNBOUND_DEPTH;
    const floor = w?.unboundExploration?.floor || 100;
    setTimeout(() => {
      deathScreen(w ? w.depth : FINAL_DEPTH, killer, () => {
        const p = G.player;
        p.dead = false; p.buffs = []; p.recompute(); p.hp = p.maxHp; p.mana = p.maxMana;
        this.enterTown();
        if (isExploration) {
          UI.log(`You fell in Unbound Exploration Floor ${floor}. Return to your last reached checkpoint (or use an active Hearthstone portal) with an Abyssal Key.`, '#ffb0a0');
        } else {
          UI.log('Velscour Unbound keeps his throne. An Abyssal Key buys another try.', '#ffb0a0');
        }
      }, {
        where: isExploration ? `in Unbound Exploration Floor ${floor}` : "on Velscour's throne",
        note: isExploration
          ? 'Your gear, levels and skills endure. Return to your last reached checkpoint milestone (or use an active Hearthstone portal) with an Abyssal Key.'
          : 'Your gear, levels and skills endure, and your descent is untouched. The Abyssal Key is spent.'
      });
    }, 1700);
  },

  hudAction(act) {
    switch (act) {
      case 'inventory': toggleInventory(); break;
      case 'stats': case 'character': toggleCharacter(); break;
      case 'skills': toggleTree(); break;
      case 'talents': toggleTalents(); break;
      case 'friends': case 'book': toggleFriends(); break;
      case 'quest': toggleQuest(); break;
      case 'menu': pauseMenu(); break;
      case 'auto': Auto.toggle(); break;
    }
  },

  tickDungeonAffixWorld(w, dt) {
    const p = G.player;
    const active = Array.isArray(w.dungeonAffixes) ? new Set(w.dungeonAffixes) : null;
    if (!active || !active.size || !p || p.dead || w.kind !== 'dungeon') return;

    w.affixElapsed = (w.affixElapsed || 0) + dt;
    w.affixTimers ||= {};
    w.affixFields ||= [];
    w.affixEchoes ||= [];
    w.affixSpawnQueue ||= [];

    if (active.has('corruption')) {
      if (w.affixCorruptionX === undefined) {
        w.affixCorruptionX = p.x;
        w.affixCorruptionY = p.y;
        w.affixCorruptionT = 0;
      }
      const moved = dist2(p.x, p.y, w.affixCorruptionX, w.affixCorruptionY) > 0.16;
      if (moved) {
        w.affixCorruptionT = 0;
        w.affixCorruptionStacks = 0;
        w.affixCorruptionX = p.x;
        w.affixCorruptionY = p.y;
      } else {
        w.affixCorruptionT = (w.affixCorruptionT || 0) + dt;
        if (w.affixCorruptionT >= 2) {
          w.affixCorruptionT -= 2;
          w.affixCorruptionStacks = Math.min(8, (w.affixCorruptionStacks || 0) + 1);
          const damage = p.maxHp * (0.01 + w.affixCorruptionStacks * 0.005);
          hit(null, p, damage, 'shadow', { dot: true, crit: false });
          floatText(p.x, p.y, 30, 'CORRUPTION', '#9b65c8', 9);
        }
      }
    }

    const safePoint = (radius = 5) => {
      for (let i = 0; i < 8; i++) {
        const [x, y] = w.map.randomNear(p.x, p.y, rand(2, radius));
        if (w.map.isFloor(x, y)) return [x, y];
      }
      return [p.x, p.y];
    };
    const pulse = (id, spec) => {
      if (!active.has(id)) return;
      w.affixTimers[id] = (w.affixTimers[id] ?? rand(6, 11)) - dt;
      if (w.affixTimers[id] > 0) return;
      w.affixTimers[id] = rand(spec.interval[0], spec.interval[1]);
      const [x, y] = safePoint(spec.spread || 6);
      const baseDamage = id === 'inferno' ? Math.min(0.12, 0.035 + w.affixElapsed * 0.00025) : spec.damage;
      const el = spec.randomElement ? pick(['fire', 'cold', 'light', 'poison', 'arcane', 'shadow']) : spec.el;
      if (spec.area) {
        w.addHazard(new Area({ src: null, team: 'enemy', affixCatalog: true, affixId: id, x, y, r: spec.radius, dur: spec.duration || 4, tick: 0.6,
          dmg: [p.maxHp * spec.damage, p.maxHp * spec.damage], el, fx: spec.fx || el,
          mode: ['gravity_wells', 'chaos_orbs', 'death_s_pursuit'].includes(id) ? 'cyclone' : 'zone',
          vx: Math.cos(rand(0, Math.PI * 2)), vy: Math.sin(rand(0, Math.PI * 2)),
          heal: !!spec.heal, o: { ...(spec.o || {}), team: 'enemy', dot: true, crit: false, affixStatus: true, affixId: id } }));
      } else {
        w.addHazard(new Delayed({ src: null, team: 'enemy', affixCatalog: true, affixId: id, x, y, r: spec.radius, delay: spec.warning || 0.9,
          dmg: p.maxHp * baseDamage * (w.affixSurgeUntil > w.time && w.affixSurgeId === id ? 1.25 : 1), el, fx: spec.fx || 'explosion',
          o: { ...(spec.o || {}), team: 'enemy', crit: false, affixStatus: true, affixId: id } }));
      }
      if (spec.log) UI.log(spec.log, spec.color || '#ffc080');
      if (id === 'corrupted_shrines') p.heal(p.maxHp * 0.03);
      if (id === 'unstable_elements' && chance(0.35)) {
        const extra = pick(['fire', 'cold', 'light', 'poison']);
        w.addHazard(new Delayed({ src: null, team: 'enemy', x, y, r: 1.5, delay: 0.65,
          dmg: p.maxHp * 0.04, el: extra, fx: extra, o: { team: 'enemy', crit: false, slow: extra === 'cold', burn: extra === 'fire', poison: extra === 'poison' } }));
      }
    };

    // Apply the selected environmental hazards for this dungeon.
    for (const id in DUNGEON_ELEMENTAL_HAZARDS) pulse(id, DUNGEON_ELEMENTAL_HAZARDS[id]);
    for (const id in DUNGEON_ENVIRONMENT_HAZARDS) pulse(id, DUNGEON_ENVIRONMENT_HAZARDS[id]);
    for (const id in DUNGEON_CHAOS_HAZARDS) pulse(id, DUNGEON_CHAOS_HAZARDS[id]);

    // New catalog hazards use the same telegraphed area and impact classes as existing affixes.
    for (const [id, spec] of Object.entries(EXTRA_AFFIX_HAZARDS)) {
      if (!active.has(id)) continue;
      w.affixTimers[id] = (w.affixTimers[id] ?? rand(5, 9)) - dt;
      if (w.affixTimers[id] > 0) continue;
      w.affixTimers[id] = rand(spec.interval[0], spec.interval[1]);
      if ((w.hazards || []).filter((hazard) => hazard.affixCatalog).length >= 12) continue;
      const [x, y] = safePoint(spec.spread || 6);
      const el = spec.randomElement ? pick(['fire', 'cold', 'light', 'poison', 'arcane', 'shadow']) : spec.el;
      const damage = p.maxHp * spec.damage;
      if (spec.area) {
        const createArea = () => w.addHazard(new Area({ src: null, team: 'enemy', affixCatalog: true, affixId: id, x, y, r: spec.radius,
          dur: spec.duration || 4, tick: 0.7, dmg: [damage, damage], el, fx: spec.fx,
          mode: spec.cyclone ? 'cyclone' : 'zone',
          vx: Math.cos(rand(0, Math.PI * 2)), vy: Math.sin(rand(0, Math.PI * 2)),
          heal: !!spec.heal, o: { ...(spec.o || {}), team: 'enemy', dot: true, crit: false, affixStatus: true, affixId: id } }));
        w.addHazard(new Delayed({ src: null, team: 'enemy', x, y, r: spec.radius,
          delay: spec.warning || 0.75, dmg: [0, 0], el, fx: spec.fx, o: { team: 'enemy' }, onImpact: createArea }));
      } else {
        w.addHazard(new Delayed({ src: null, team: 'enemy', affixCatalog: true, affixId: id, x, y, r: spec.radius,
          delay: spec.warning || 1, dmg: [damage, damage], el, fx: spec.fx,
          o: { ...(spec.o || {}), team: 'enemy', crit: false, affixStatus: true, affixId: id } }));
      }
    }

    if (active.has('arcane_overload')) {
      w.affixOverloadT = (w.affixOverloadT ?? rand(7, 11)) - dt;
      if (w.affixOverloadT <= 0) {
        w.affixOverloadT = rand(7, 11);
        w.addHazard(new Delayed({ src: null, team: 'enemy', x: p.x, y: p.y, r: 1.8, delay: 0.7, dmg: p.maxHp * 0.045, el: 'arcane', fx: 'nova', o: { team: 'enemy', crit: false } }));
      }
    }

    if (active.has('temporal_distortion') && (w.affixTimers.temporal_distortion ?? 0) <= 0) {
      w.affixTimers.temporal_distortion = rand(11, 18);
      p.status.slow = { t: 1.8, amt: 0.25 };
      for (const m of w.creatures) if (m.team === 'enemy' && !m.dead) m.affixTemporalT = 2;
    }
    if (active.has('unstable_reality') && chance(dt * 0.015)) p.status.slow = { t: 1.2, amt: 0.2 };
    if (active.has('doom_clock')) w.affixDoomMul = Math.min(1.5, 1 + w.affixElapsed * 0.0002);
    if (active.has('coordinated_assault')) {
      w.affixCoordinatedT = (w.affixCoordinatedT || 0) - dt;
      if (w.affixCoordinatedT <= 0) w.affixCoordinatedT = rand(7, 12);
      if (w.affixCoordinatedT < 1.5) w.affixCoordinatedUntil = w.time + 1.5;
    }
    if (active.has('chaos_surge')) {
      w.affixChaosSurgeT = (w.affixChaosSurgeT || 0) - dt;
      if (w.affixChaosSurgeT <= 0) {
        w.affixChaosSurgeT = 60;
        w.affixSurgeId = pick([...active]);
        w.affixSurgeUntil = w.time + 12;
        UI.log('Chaos Surge: one affix grows stronger for a short time.', '#d58cff');
      }
    }
    if (active.has('elemental_roulette')) {
      w.affixRouletteT = (w.affixRouletteT || 0) - dt;
      if (w.affixRouletteT <= 0) {
        w.affixRouletteT = 18;
        const elements = ['fire', 'cold', 'light', 'poison', 'arcane', 'shadow'];
        for (const m of w.creatures) if (m.team === 'enemy' && !m.dead) m.el = pick(elements);
        floatText(p.x, p.y, 48, 'Elements shift!', '#c890ff', 12);
      }
    }
    if (active.has('death_s_pursuit')) pulse('death_s_pursuit', { el: 'shadow', radius: 1.5, damage: 0.045, interval: [4, 6], fx: 'void', area: true, duration: 2, spread: 2 });
    for (let i = w.affixFields.length - 1; i >= 0; i--) {
      const field = w.affixFields[i];
      field.t -= dt;
      field.tickT = (field.tickT || 0) - dt;
      if (field.t <= 0) { w.affixFields.splice(i, 1); continue; }
      if ((field.delayT || 0) > 0) { field.delayT -= dt; continue; }
      if (field.tickT <= 0) {
        field.tickT = field.interval || 0.65;
        if (dist2(p.x, p.y, field.x, field.y) <= field.radius * field.radius) {
          hit(field.src || null, p, field.damage || p.maxHp * 0.025, field.el || 'shadow', { ...(field.o || {}), team: 'enemy', dot: true, crit: false });
          if (field.id === 'cursed_totems') p.affixRemainsT = Math.max(p.affixRemainsT || 0, 4);
          floatText(p.x, p.y, 26, field.label || '!', field.color || '#d080ff', 9, { life: 0.35 });
        }
      }
    }
    for (let i = w.affixEchoes.length - 1; i >= 0; i--) {
      const echo = w.affixEchoes[i];
      echo.t -= dt;
      if (echo.t <= 0) {
        w.affixEchoes.splice(i, 1);
        if (echo.target && !echo.target.dead) hit(echo.src, echo.target, echo.damage, echo.el, { ...(echo.o || {}), dot: true, crit: false });
      }
    }
    for (let i = w.affixSpawnQueue.length - 1; i >= 0; i--) {
      const event = w.affixSpawnQueue[i];
      event.t = (event.t ?? 0) - dt;
      if (event.t > 0) continue;
      w.affixSpawnQueue.splice(i, 1);
      const arch = pick(w.roster || []);
      if (!arch || w.creatures.filter((m) => m.team === 'enemy' && !m.dead).length >= DUNGEON_AFFIX_CONFIG.summons.maxExtraEnemies + 18) continue;
      const [x, y] = w.map.randomNear(event.x ?? p.x, event.y ?? p.y, 2.5);
      const spirit = makeMonster(w, arch, w.biome, depthLevel(w.depth || 1), 'normal', x, y);
      if (spirit) {
        spirit.awake = true; spirit.affixSpawned = true;
        if (event.id === 'vengeful_spirits') spirit.el = 'shadow';
        addEffect(new Ring(spirit.x, spirit.y, 0.12, 1.15, 0.36, event.id === 'vengeful_spirits' ? '#9b62d4' : '#d0c0ff', 2.5));
        w.add(spirit);
      }
    }
    for (let i = w.affixProjectileBursts?.length - 1; i >= 0; i--) {
      const burst = w.affixProjectileBursts[i];
      burst.delayT = (burst.delayT || 0) - dt;
      if (burst.delayT > 0) continue;
      w.affixProjectileBursts.splice(i, 1);
      for (let n = 0; n < burst.count; n++) {
        w.addHazard(new Projectile({ src: null, team: 'enemy', x: burst.x, y: burst.y,
          ang: n / burst.count * Math.PI * 2, speed: burst.speed, range: burst.range, fx: burst.fx,
          el: burst.el, dmg: burst.damage, o: { team: 'enemy', crit: false } }));
      }
    }
    if (w.affixCorpseMarkers) {
      for (const marker of w.affixCorpseMarkers) marker.t -= dt;
      w.affixCorpseMarkers = w.affixCorpseMarkers.filter((marker) => marker.t > 0);
    }

    // Reinforcement affixes add bounded waves selected from the current dungeon roster.
    const spawnPulse = {
      endless_horde: [18, 28, 2, 'normal'], necromantic_ritual: [22, 32, 1, 'normal'],
      demonic_portals: [20, 31, 2, 'champion'], broodmother: [18, 26, 1, 'normal'],
      shadow_clones: [19, 28, 1, 'normal'], swarm_infestation: [14, 21, 3, 'normal'],
      bone_legion: [22, 34, 2, 'normal'], infernal_invasion: [20, 30, 2, 'champion'],
      elemental_convergence: [19, 29, 1, 'normal'], reinforced_packs: [24, 34, 3, 'normal'],
      doppelgangers: [24, 36, 1, 'champion'], swarming: [18, 28, 2, 'normal'],
      summoning_bosses: [18, 28, 2, 'normal'], double_champions: [22, 34, 2, 'champion'], elite_reinforcements: [20, 32, 1, 'champion'], haunted_grounds: [21, 32, 1, 'normal'], unstable_rifts: [18, 28, 1, 'normal'],
      ambushing: [20, 30, 1, 'normal'], living_dungeon: [22, 34, 1, 'normal'],
    };
    let enemies = w.creatures.filter((m) => m.team === 'enemy' && !m.dead).length;
    for (const [id, [lo, hi, count, rank]] of Object.entries(spawnPulse)) {
      if (!active.has(id) || enemies >= DUNGEON_AFFIX_CONFIG.summons.maxExtraEnemies + 18) continue;
      w.affixSpawnTimers ||= {};
      w.affixSpawnTimers[id] = (w.affixSpawnTimers[id] ?? rand(lo, hi)) - dt;
      if (w.affixSpawnTimers[id] > 0) continue;
      w.affixSpawnTimers[id] = rand(lo, hi);
      for (let n = 0; n < count && enemies < DUNGEON_AFFIX_CONFIG.summons.maxExtraEnemies + 18; n++) {
        const arch = pick(w.roster || []);
        if (!arch) break;
        const [x, y] = safePoint(8);
        const m = makeMonster(w, arch, w.biome, depthLevel(w.depth || 1), rank, x, y);
        if (!m) continue;
        enemies++;
        m.awake = true;
        m.affixSpawned = true;
        if (id === 'shadow_clones') { m.scale *= 0.7; m.maxHp *= 0.45; m.hp = m.maxHp; }
        const portalColor = id.includes('bone') || id.includes('necromantic') ? '#c8d8d8' :
          id.includes('infernal') || id.includes('demonic') ? '#ff6430' :
          id.includes('swarm') || id.includes('brood') ? '#9aca42' :
          id.includes('shadow') || id.includes('haunted') || id.includes('rift') ? '#a65fe0' : '#d4a8ff';
        addEffect(new Ring(x, y, 0.12, 1.1, 0.36, portalColor, 2.5));
        w.add(m);
      }
      if (id === 'demonic_portals' || id === 'infernal_invasion') floatText(p.x, p.y, 68, 'Portal opens', '#e03030', 12);
    }

    // New defensive affixes reuse the same capped shield and ring feedback as existing guardian affixes.
    if (active.has('barrier')) {
      w.affixTimers.barrier = (w.affixTimers.barrier ?? 1) - dt;
      if (w.affixTimers.barrier <= 0) {
        w.affixTimers.barrier = 7;
        for (const m of w.creatures) if (m.team === 'enemy' && !m.dead) {
          m.affixShieldT = 3; m.affixShield = 0.2;
          addEffect(new Ring(m.x, m.y, 0.45, 1.0, 0.24, '#8feaff', 2));
        }
      }
    }
    if (active.has('elemental_resistance')) {
      w.affixTimers.elemental_resistance = (w.affixTimers.elemental_resistance ?? 4) - dt;
      if (w.affixTimers.elemental_resistance <= 0) {
        w.affixTimers.elemental_resistance = 7;
        for (const m of w.creatures) if (m.team === 'enemy' && !m.dead && m.affixElementalRes) {
          m.affixElementalResBonus = Math.min(0.4, (m.affixElementalResBonus || 0.25) + 0.05);
          m.res ||= {};
          m.res[m.affixElementalRes] = (m.res[m.affixElementalRes] || 0) + 0.05;
          const color = { fire: '#ff7040', cold: '#8feaff', light: '#d8e8ff', poison: '#8bd24a' }[m.affixElementalRes] || '#d8b080';
          addEffect(new Ring(m.x, m.y, 0.35, 0.85, 0.2, color, 2));
        }
      }
    }
    if (active.has('protective_aura')) {
      w.affixTimers.protective_aura = (w.affixTimers.protective_aura ?? 2) - dt;
      if (w.affixTimers.protective_aura <= 0) {
        w.affixTimers.protective_aura = 6;
        for (const elite of w.creatures) if (elite.team === 'enemy' && !elite.dead && ['champion', 'unique', 'elite', 'boss'].includes(elite.rank)) {
          for (const ally of w.query(elite.x, elite.y, 5, (m) => m.team === 'enemy' && !m.dead)) {
            ally.affixShieldT = 3; ally.affixShield = Math.max(ally.affixShield || 0, 0.15);
            addEffect(new Ring(ally.x, ally.y, 0.3, 0.72, 0.2, '#c18dff', 1.8));
          }
        }
      }
    }

    // Guardian spirits grant short, periodically refreshed shields to nearby enemies.
    if (active.has('guardian_spirits')) {
      w.affixTimers.guardian_spirits = (w.affixTimers.guardian_spirits ?? 0) - dt;
      if (w.affixTimers.guardian_spirits <= 0) {
        w.affixTimers.guardian_spirits = rand(7, 11);
        for (const m of w.creatures) if (m.team === 'enemy' && !m.dead && dist2(m.x, m.y, p.x, p.y) < 12 * 12) {
          m.affixShieldT = 4;
          m.affixShield = 0.25;
          addEffect(new Ring(m.x, m.y, 0.7, 1.45, 0.3, '#8feaff', 2));
        }
      }
    }
    if (active.has('guardian_shield') && w.boss && !w.boss.dead) {
      w.affixTimers.guardian_shield = (w.affixTimers.guardian_shield ?? 3) - dt;
      if (w.affixTimers.guardian_shield <= 0) {
        w.affixTimers.guardian_shield = rand(8, 12);
        w.boss.affixShieldT = 4;
        w.boss.affixShield = 0.35;
        addEffect(new Ring(w.boss.x, w.boss.y, 0.7, 1.8, 0.36, '#8feaff', 3));
        floatText(w.boss.x, w.boss.y, 70, 'GUARDIAN SHIELD', '#8feaff', 11);
      }
    }

    // Movement affixes teleport enemies to valid nearby floor tiles.
    if (active.has('teleporting') || active.has('blink_strike') || active.has('boss_teleportation')) {
      const movement = DUNGEON_AFFIX_CONFIG.enemyMovement;
      for (const m of w.creatures) {
        if (m.team !== 'enemy' || m.dead) continue;
        m.dungeonTeleportT = (m.dungeonTeleportT ?? rand(...movement.teleportInitial)) - dt;
        const d2 = dist2(m.x, m.y, p.x, p.y);
        if (m.dungeonTeleportT > 0 || d2 <= movement.minDistance ** 2 || d2 >= movement.maxDistance ** 2) continue;
        let [x, y] = safePoint(movement.nearPlayerRadius);
        if (active.has('blink_strike')) {
          const bx = p.x - Math.cos(p.facing || 0) * 1.3;
          const by = p.y - Math.sin(p.facing || 0) * 1.3;
          if (w.map.isFloor(bx, by)) [x, y] = [bx, by];
        }
        if (w.map.isFloor(x, y)) {
          addEffect(new Ring(m.x, m.y, 0.1, 0.8, 0.24, '#bd82ff', 2));
          m.x = x; m.y = y;
          addEffect(new Ring(x, y, 0.1, 1.05, 0.3, '#bd82ff', 2.5));
        }
        m.dungeonTeleportT = rand(...movement.teleportRepeat);
      }
    }
    if (active.has('unstable_bosses') && w.boss && !w.boss.dead) {
      pulse('unstable_bosses', { randomElement: true, radius: 2.4, damage: 0.08, interval: [9, 14], fx: 'explosion', spread: 5 });
    }
    for (const m of w.creatures) if (m.affixShieldT > 0) {
      m.affixShieldT -= dt;
      if (m.affixShieldT <= 0) { m.affixShieldT = 0; m.affixShield = 0; }
    }

    // A guardian shield is a temporary damage reduction, not a permanent change to enemy stats.
    for (const m of w.creatures) if (m.affixShieldT > 0) {
      m.affixShieldT -= dt;
      if (m.affixShieldT <= 0) { m.affixShieldT = 0; m.affixShield = 0; }
    }

    // Thunderstorm marks the strike area, then sends a visible lightning bolt into it.
    if (active.has('thunderstorm')) {
      const storm = DUNGEON_AFFIX_CONFIG.thunderstorm;
      w.affixStormT = (w.affixStormT ?? rand(...storm.initialDelay)) - dt;
      if (w.affixStormT <= 0) {
        const x = p.x + rand(-3, 3), y = p.y + rand(-3, 3);
        w.addHazard(new Delayed({
          src: null, team: 'enemy', x, y, r: storm.radius, delay: storm.warningSeconds,
          dmg: p.maxHp * storm.damageFraction, el: 'light', fx: 'lightning',
          o: { team: 'enemy', crit: false },
          onImpact: () => addEffect(new Bolt(x, y, 220, x, y, 0, '#a8ccff', 0.28, 6)),
        }));
        w.affixStormT = rand(...storm.repeatDelay) + storm.warningSeconds;
        UI.log('A storm gathers. Move out of the marked lightning strike.', '#8feaff');
      }
    }

    // Global player curses tick independently of the visual hazard loop.
    if (active.has('cursed_blood')) {
      w.affixTimers.cursed_blood = (w.affixTimers.cursed_blood ?? 8) - dt;
      if (w.affixTimers.cursed_blood <= 0) {
        w.affixTimers.cursed_blood = 8;
        hit(null, p, p.maxHp * DUNGEON_AFFIX_CONFIG.playerCurses.damageFraction, 'blood', { dot: true, crit: false });
      }
    }
    if (active.has('resource_drain') && w.nearestHostile('player', p.x, p.y, 9)) {
      p.mana = Math.max(0, p.mana - Math.max(1, p.maxMana * 0.004 * dt));
      if (p.rage !== undefined && p.rage > 0) p.rage = Math.max(0, p.rage - 4 * dt);
    }

  },

  // ------------------------------------------------------------ frame
  update(dt) {
    const w = G.world, p = G.player;
    if (!w || !p) return;
    const ui = UI;
    if (!ui.modal) {
      if (input.consume('KeyI')) toggleInventory();
      if (input.consume('KeyC') || input.consume('KeyU')) toggleCharacter();
      if (input.consume('KeyK')) toggleTree();
      if (input.consume('KeyT')) toggleTalents();
      if (input.consume('KeyB')) toggleFriends();
      if (input.consume('KeyQ')) toggleQuest();
      if (input.consume('KeyP') && (input.alt || input.down('AltLeft') || input.down('AltRight'))) Auto.toggle();
      if (input.consume('KeyG')) unleashMadness();
      if (input.consume('KeyF')) toggleSmite();
      if (input.consume('KeyH')) useHearth(); // the Hearthstone (game/hearth.js)
      if (input.consume('Tab') || input.consume('KeyM')) G.showAutomap = !G.showAutomap;
      if (input.consume('Escape')) {
        if (G.smiteArmed) G.smiteArmed = false;
        else if (ui.anyOpen()) ui.closeAll();
        else if (G.showAutomap) G.showAutomap = false;
        else pauseMenu();
      }
    } else if (input.consume('Escape')) {
      const top = UI.screensEl.lastElementChild;
      if (top && top.querySelector('.dialog-box')) top.dispatchEvent(new PointerEvent('pointerdown'));
    }
    this.tickPick(dt);
    Auto.tickDest(dt); // auto-play's Standard/Breach menu in town
    if (Auto.on) Auto.handleScreens(dt); // auto-interact with dialogs (portals, altars, monoliths, waves)
    const pauseMenus = !G.room && G.settings.pauseMenus !== false && w.kind === 'dungeon' && ui.anyOpen();
    G.paused = !G.room && (ui.modal || pauseMenus);
    Cine.update(G.paused ? 0 : dt);
    if (G.cine && !G.paused && (!G.room || w.customDirector)) {   // a cut scene (game/cinema.js): no input, no auto-play, no monster thinks; the scene's actors move
      input.endFrame();
      cineTick(w, dt);
      // a scene this hero has seen plays at 20x (Cine.fast; Settings > "Don't skip cutscenes" keeps it at 1x)
      for (let i = 1; i < CINE_FAST && Cine.fast && G.cine && G.world === w; i++) { G.time += dt; Cine.update(dt); cineTick(w, dt); }
    } else if (!G.paused) {
      // Decay legacy hit-stop without suspending simulation (prevents repeated crits causing slow-motion)
      if (G.hitStop > 0) G.hitStop = Math.max(0, G.hitStop - dt);
      if (this.isLoading || G.loading || (p && p.spawned === false)) {
        // Skip player input and auto-play while loading screen is active
      } else {
        Auto.noteInput();
        controls.update(dt);
        Auto.update(dt);
      }
      // auto-play (or a click) may have taken the hero through a portal: the world he left stops here, or its rules run on
      // him in the new one (the Breach's wards put him back at his last Breach spot, off the edge of town: a black town)
      if (G.world !== w) return;
      w.update(dt);
      if (G.world !== w) return;
      if (w.overworldScenario) w.overworldScenario.update(dt);
      if (w.map.c3struct && !w.map.sky) castle3dTick(w, dt);
      if (!G.room || this.isDungeonAuthority(w?.depth)) {
        ambushTick(w, dt);
      }
      if (w.kind === 'town') {
        townTick(w, dt);
      } else if (!w.sky && !w.seaRun) {
        happeningsTick(w, dt);
        this.tickDungeonAffixWorld(w, dt);
        worldObjectsTick(w, dt);
        dungeonEventTick(w, dt);
      }
      if (w.sky || w.seaRun) eventImpsTick(w, dt);
      DuelManager.update(dt);
      if (w.rift) riftTick(w, dt); // the Abyssal Rift's clock (game/rifts.js)
      if (w.heresy) heresyTick(w, dt); // the Heresies as monsters appear, the Legion's hellgates (game/heresies.js; the Breach has no happenings tick)
      madnessTick(dt);
      hearthTick(dt); // the Hearthstone's 10 minute refill (game/hearth.js)
      spectateTick(w, dt); // gilded critters, the SMITE reticle (game/spectate.js)
      footsteps(p, w.kind === 'town' ? 'dirt' : STEP_SURFACE[w.biome && w.biome.id] || STEP_SURFACE[w.biome && w.biome.base] || 'stone');
      Meter.tick(dt);
      if (w.kind === 'dungeon' && G.char) G.char.sealT = (G.char.sealT ?? SEAL_GAP) + dt; // the sealed treasure clock (loot.js)
      if (G.room && p && !p.dead) {
        netSyncT += dt;
        if (netSyncT >= 0.05) {
          netSyncT = 0;
          const mySummons = [];
          if (w && w.creatures) {
            for (const c of w.creatures) {
              if (c.summon && c.owner === p && !c.dead) {
                if (!c.summonId) c.summonId = `${net.myId || 'local'}_s_${Math.random().toString(36).substr(2, 9)}`;
                mySummons.push({
                  id: c.summonId,
                  key: c.summonKey,
                  name: c.name,
                  x: Math.round(c.x * 100) / 100,
                  y: Math.round(c.y * 100) / 100,
                  vx: Math.round((c.vx || 0) * 100) / 100,
                  vy: Math.round((c.vy || 0) * 100) / 100,
                  facing: Math.round((c.facing || 0) * 100) / 100,
                  moving: !!c.moving,
                  animT: Math.round((c.animT || 0) * 100) / 100,
                  attackAnimT: Math.round((c.attackAnimT || 0) * 100) / 100,
                  lunge: Math.round((c.lunge || 0) * 100) / 100,
                  flip: !!c.flip,
                  hp: Math.round(c.hp),
                  maxHp: Math.round(c.maxHp),
                  scale: c.scale || 1,
                  fly: !!c.fly,
                  static: !!c.static,
                  alpha: c.alpha !== undefined ? c.alpha : 1,
                  aura: c.aura || null,
                  summonEl: c.summonEl || null,
                  art: c.art || null,
                  artH: c.artH || null,
                  artRef: c.artRef || null,
                  swap: c.swap || null,
                  sprite: c.sprite || null,
                  pal: c.pal || null,
                  px: c.px || null,
                  classId: c.classId || null,
                  slime: c.slime ? {
                    kind: c.slime.kind,
                    set: c.slime.set,
                    h: c.slime.h,
                    mini: !!c.slime.mini,
                    anim: c.slime.anim,
                    animT: Math.round((c.slime.animT || 0) * 100) / 100,
                    z: Math.round((c.slime.z || 0) * 100) / 100,
                    tilt: Math.round((c.slime.tilt || 0) * 100) / 100,
                  } : null,
                });
              }
            }
          }
          const gearObj = serializeShownGear(G.char);
          const gearKey = gearSignature(gearObj);
          const gearChanged = (!this._lastSentGearKey || this._lastSentGearKey !== gearKey || (this._gearHeartbeatT = (this._gearHeartbeatT || 0) + 0.05) > 3.0);
          if (gearChanged) {
            this._lastSentGearKey = gearKey;
            this._gearHeartbeatT = 0;
          }
          const gearPayload = gearChanged ? gearObj : null;

          const bannerKeyStr = G.char?.banner ? JSON.stringify(G.char.banner) : '';
          const bannerChanged = (!this._lastSentBannerKey || this._lastSentBannerKey !== bannerKeyStr || gearChanged);
          if (bannerChanged) {
            this._lastSentBannerKey = bannerKeyStr;
          }
          const bannerPayload = bannerChanged ? (G.char?.banner || null) : undefined;

          net.sendPlayerState({
            name: G.char?.name || 'Hero',
            classId: p.classId,
            level: G.char?.level || 1,
            gear: gearPayload,
            banner: bannerPayload,
            x: p.x,
            y: p.y,
            z: Math.round(p.z || 0),
            vx: p.vx || 0,
            vy: p.vy || 0,
            facing: p.facing || 0,
            moving: !!p.moving,
            animT: p.animT || 0,
            flip: !!p.flip,
            hp: Math.round(p.hp),
            maxHp: Math.round(p.maxHp),
            mana: Math.round(p.mana),
            maxMana: Math.round(p.maxMana),
            summons: mySummons,
            worldKind: w?.keep ? 'keep' : (w?.kind || 'town'),
            townId: w?.keep ? 'keep' : (w?.townId || 'act1'),
            duelId: w?.duelId || null,
            depth: (w?.kind === 'dungeon' ? w.depth : 0) || 0,
            unbound: !!w?.unbound,
            loading: !!(G.loading || this.isLoading || (p && p.spawned === false)),
          });
        }
      }
      if (G.room && w.kind === 'dungeon' && p && !p.dead && !(this.isLoading || G.loading || (p && p.spawned === false))) {
        if (this.isDungeonAuthority(w.depth)) {
          monSyncT += dt;
          if (monSyncT >= 0.08) {
            monSyncT = 0;
            const monSync = [];
            const activePlayers = [{ x: p.x, y: p.y }];
            if (G.remotePlayers) {
              for (const rp of G.remotePlayers.values()) {
                if (!rp.dead && (rp.world === w || (rp.worldKind === w.kind && rp.depth === w.depth))) {
                  activePlayers.push({ x: rp.x, y: rp.y });
                }
              }
            }
            const maxSyncDistSq = 32 * 32;
            for (const m of w.creatures) {
              if (m.team === 'enemy' && !m.dead) {
                if (isMonsterKilled(w, w.depth, m.netId, m.idx)) continue;
                const isSpecial = m.awake || m.isRaid || m.rank === 'boss' || m === w.boss || m.rank === 'champion' || m.rank === 'unique';
                const nearAnyPlayer = activePlayers.some(pl => dist2(m.x, m.y, pl.x, pl.y) < maxSyncDistSq);
                if (isSpecial || nearAnyPlayer) {
                  monSync.push({
                    id: m.netId || m.idx,
                    idx: isSharedMonsterIdx(m.idx) ? m.idx : undefined,
                    x: Math.round(m.x * 100) / 100,
                    y: Math.round(m.y * 100) / 100,
                    hp: Math.round(m.hp),
                    f: m.facing ? 1 : 0,
                    a: m.awake ? 1 : 0,
                    arch: m.arch,
                    name: m.name,
                    isWard: !!m.isWard,
                    vk: m.vk,
                    static: !!m.static,
                    fly: !!m.fly,
                    maxHp: Math.round(m.maxHp),
                    lvl: m.level,
                    rank: m.rank,
                    color: m.aura || (m.pal ? m.pal.a : null),
                    affixes: m.affixes ? [...m.affixes] : null,
                    ambusher: !!m.ambusher,
                  });
                }
              }
            }
            if (monSync.length > 0 || (w.killedMonsterIds && w.killedMonsterIds.size > 0)) {
              net.sendMonstersState(monSync, w.depth, Array.from(w.killedMonsterIds || []));
            }
          }
        }
      }
    } else {
      input.endFrame();
    }
    if (!G.cine) camera.follow(p.x, p.y, dt);
    camera.update(dt);
    if (!!G.cine !== hudCine) {
      hudCine = !!G.cine;
      HUD.show(!hudCine);
      if (G.touch) TouchUI.show(!hudCine);
      if (G.gameChat) {
        if (hudCine) G.gameChat.hide();
        else G.gameChat.show();
      }
    }
    if (G.hurtFlash > 0) G.hurtFlash = Math.max(0, G.hurtFlash - dt * 2.5);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 3.5);
    HUD.update(dt);
    if (G.touch) TouchUI.update();
    // hovering things -> cursor
    G.canvas.style.cursor = G.hover ? 'pointer' : '';
    saveT += dt;
    if (saveT > 30) this.autosave({ periodic: true });
  },

  render() {
    const w = G.world;
    if (!w) return;
    renderWorld(G.ctx, w);
    if (G.showAutomap) {
      const W = G.W * G.dpr, H = G.H * G.dpr;
      if (!automapCanvas || automapCanvas.width !== W || automapCanvas.height !== H) automapCanvas = makeCanvas(W, H);
      drawMinimap(w, 0, automapCanvas, true);
      const ctx = G.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.9; ctx.drawImage(automapCanvas, 0, 0); ctx.globalAlpha = 1;
      updateAutomapPartyRoster();
    }
  },
};

export { Monster, CLASSES, fmtInt, randi };
