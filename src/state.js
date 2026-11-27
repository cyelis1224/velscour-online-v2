// Global game state singleton. Modules import G and read fields at runtime.
import { GORE_PRESET_VERSION, normalizeGorePreset } from './gfx/goresettings.mjs';

export const G = {
  canvas: null,
  ctx: null,
  W: 0, // css pixels
  H: 0,
  dpr: 1,
  touch: false,
  assets: null,
  world: null,
  player: null,
  char: null, // persistent character record (saved)
  mode: 'loading', // loading | title | game
  paused: false, // simulation paused (menus on desktop keep running in town)
  critterTutorial: null, // the first gilded critter is held still until the player collects it
  time: 0,
  dt: 0,
  frame: 0,
  hitStop: 0,
  performanceQualityTier: 0,
  settings: {
    sfx: 0.6,
    music: 0.35,
    amb: 0.5,
    gore: 3, // 0 Off .. 9 Unlimited (src/gfx/goresettings.mjs)
    gorePresetVersion: GORE_PRESET_VERSION,
    goreCustomEnabled: false,
    goreCustomLimit: 150,
    graphicsPreset: 'standard', // 'standard' | 'extreme'
    adaptivePerformance: false,
    performanceRecommendationShown: false,
    dmgNumbers: true,
    shake: true,
    ticker: true, // messages, quests and WARNINGs crawl along a bar at the top (src/ui/ticker.js)
    tickerSize: 1,
    reduceFlashing: false, // reduce full-screen flashes, flashbangs, and rapid hit strobing
    flashWarning: true, // the photosensitivity warning after "Click to awaken" (its "Don't show this window again" box turns it off)
    zoom: 1,
    mobileSkillBar: false, // landscape phones: full 15-slot bar art (off: orbs + potions only, the touch buttons hold the skills)
    lockSkillBar: false, // auto-play only fills empty bar slots
    hideItemNames: false, // no item name labels on the ground (hover still shows one)
    allItemNames: false, // every drop nearby named, with no budget (game/loot.js drawLootLabels)
    autoSkillPoints: true, // auto-play spends skill points
    autoStatPoints: true, // auto-play spends attribute points
    autoGear: true, // auto-play equips, sells, buys, stashes and upgrades gear (off: hands off, potions only)
    outlines: true, // see-through rims round the hero, monsters and pets, over spells, walls and darkness
    minionCounts: true, // tiles in the buff row: how many of each summon are out
    lifeBars: true, // a life bar over every enemy, bosses too (off: only over a monster just hit)
    wallLines: false, // a line along the foot of the dungeon's walls, over the spells
    heldGear: true, // the hero holds his weapon and off-hand (src/gfx/heldart.js)
    heldFx: true, // their glows and particles, gem sparks and rarity sparkles on armor (with held gear on)
    autoSummon: true, // re-raise pets, totems and turrets on the skill bar the moment one is missing (Player.autoSummon)
    autoEquip: true, // equip received gear when a matching equipment slot is empty
    dkBlade: 'sprite', // the Death Knight's flying sword: 'sprite' (his sword as a 2D object), 'model' (live three.js), 'runeblade'
    noSkipCine: false, // "Don't skip cutscenes": Sky Battle scenes already seen play at 1x, not 20x
    skipCutscenes: false, // Automatically fast-forward scripted cutscenes and camera transitions
    fpsCap: 30, // frame rate cap: 0 none, 30 (phones run cooler over a long session)
    showHeroStats: true, // show/hide the #hero-stats div
    alwaysShowParty: false, // keep the party list up in online rooms (otherwise it shows with the automap: Tab/M)
    showTargetBox: true, // show/hide the #target-box div
    showTargetSprite: true, // choose if target-box shows the target sprite or not
    showChatBubbles: true, // player chat bubbles over heads (and offscreen edge pointers)
    chatInSideLog: true, // show player chat messages in left-hand notifications log
    characterPortrait: { visible: true, locked: false, size: 100, position: null },
    keybinds: {}, // player-configured keyboard actions; absent actions use the PC defaults
  },
};

export const SETTINGS_KEY = 'velscour_settings_v1';

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || localStorage.getItem('Velscour_settings_v1') || '{}');
    Object.assign(G.settings, s);
    // v1.0.7: landscape phones switched to the compact HUD by default; flip older saves over once
    if (!s.mobileHudV2) { G.settings.mobileSkillBar = false; G.settings.mobileHudV2 = true; }
    if (s.gorePresetVersion !== GORE_PRESET_VERSION) {
      if (Object.prototype.hasOwnProperty.call(s, 'gore')) {
        const old = Number(s.gore);
        // Previous settings used 0=Off, 1=Bloody, 2=Extreme.
        G.settings.gore = old === 0 ? 0 : old === 1 ? 3 : old === 2 ? 5 : normalizeGorePreset(old);
      }
      G.settings.gorePresetVersion = GORE_PRESET_VERSION;
    }
    G.settings.gore = normalizeGorePreset(G.settings.gore);
  } catch (e) { /* ignore */ }
}
export function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings)); } catch (e) { /* ignore */ }
}
