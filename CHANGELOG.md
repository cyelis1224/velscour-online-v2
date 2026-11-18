# Velscour Online - Changelog

All notable changes to Velscour Online are documented in this file.

---

## [0.2.8] - 2026-11-18

### Fixed
- **Single-Player vs. Online Character Save Isolation**:
  - Fixed a critical bug in `game.autosave()` / `game.flushUnloadSave()` where `(getOnlineToken() && char.id)` caused Single Player heroes to be misflagged with `isOnline = true` whenever an Online session token was stored in `localStorage`, preventing local `writeSave()` persistence and sending players to the Online Character Select screen upon Save & Quit.
  - Enforced `c.isOnline = false` in `startSinglePlayer()`, guarded `saveOnlineCharacter()` / `flushOnlineSaveUnload()` to require `char.isOnline === true`, and stripped any stray `isOnline` / `accountId` flags when reading local Single Player saves.

---

## [0.2.7] - 2026-11-18

### Added
- **Browser-Close & Tab-Exit Character Save Protection**:
  - Added synchronous `flushOnlineSaveUnload()` wired to both `beforeunload` and `pagehide` (as well as lobby `visibilitychange` on mobile) so closing the browser tab/window without clicking Save & Quit still persists character and reliquary progress.
  - Dual-channel unload flush writes directly to the open WebSocket (`save_character` / `save_reliquary`, bypassing the browser's 64 KB `keepalive` payload limit for large 300-slot stashes) while simultaneously queueing a CORS-safelisted `navigator.sendBeacon` / `fetch(..., { keepalive: true })` HTTP save fallback.
- **Loot Pickup & Change-Aware Periodic Autosaves**:
  - Picking up Abyssal Keys or Epic/Legendary/Mythic/Sealed items triggers an immediate character save; picking up standard gear or gems into the backpack/Gem Bag schedules a coalesced 1.5s debounced save (`autosaveSoon`).
  - Periodic 30s in-game and 60s lobby autosaves now fingerprint character state (ignoring `lastPlayed`) to skip redundant network/disk writes while idle in town or lobby.
- **Velscour Level & Cutscene Studio**:
  - Full 2D/3D scenario and cutscene authoring suite (`npm run studio`) with 3D camera depth/slice controls, single-track keyframe timeline, multi-boss and passage baking, and live Playtest across all 11 world categories.
  - Custom 3D world templates and choreography for Mountainside forested switchback trails, Snowy Summit peaks, and 3D Airship/Naval boarding skiff encounters with multiplayer cutscene trigger sync (`game_cine_trigger`).

### Fixed & Improved
- **Online HTTP/WebSocket Save Reliability**:
  - Enabled `keepalive: true` (with automatic >64 KB quota retry fallback) on online character and reliquary HTTP saves, exposed `window.net` so WebSocket save fallbacks actually fire when HTTP fails, and awaited `flushOnlineSave()` on Lobby Quit.
- **Mobile HUD, Town & Reliquary Polish**:
  - Added collapsible mobile HUD quest tracker toggle and cleared residual screen flashes/VFX on exiting Studio Playtest.
  - Aligned Act 2 Altar of Heresy collision to its marked base point, fixed auto-play town destination dialog dismissal, and limited Ancestral Reliquary random gem choices to 5 with auto-play selection support.

---

## [0.2.6] - 2026-11-17

### Added
- **257 Active Dungeon Affixes & Floor Encounter Systems**:
  - Implemented the complete 257 dungeon affix catalog with active mechanics across all campaign depths.
  - Covers enemy stat modifiers (Fortified, Swift, Frenzied, Vampiric, Colossal, Elusive, Berserking), on-death elemental bursts (Volcanic Death, Toxic Remains, Static Discharge, Frostburst, Corpse Explosion), environmental hazards, spell fatigue, mana droughts/surges, healing suppression, and unstable healing.
  - Replaced legacy omen selection with up to 5 real active dungeon affixes and dynamic biome selection (`biomesForDepth`) in the portal descent dialog.
  - Entering a dungeon depth announces all active floor affixes to the player and party in real time.
- **50 Interactive World Objects, Altars & Shrines**:
  - Added 50 author-placed interactive shrine and world encounters:
    - 10 Stat Blessings (Might, Fortitude, Swiftness, Sorcery, Fortune, Precision, Phoenix, Echoes, Colossus, Elements).
    - 8 Cursed Altars (Blood, Greed, Torment, Shadows, Chaos, Damned, Decay, Corruption).
    - 7 Recovery Fountains (Life, Mana, Rejuvenation, Purification, Renewal, Bloodspring, Unstable Fountain).
    - 7 Gambling Relics & Idols (Statue of Fortune, Dice of Fate, Wheel of Destiny, Gambler, Trickster, Oracle's Mirror, Coin of the Ancients).
    - 5 Blood & Transmutation Sacrifices.
    - 7 Wave Altars & Charged Power Monoliths with escalating ambush waves, active defense pylon fields, and reward chests upon completion.
- **6-Tier Specialized Treasure Chests**:
  - Added 6 chest rarity tiers (Common, Uncommon, Rare, Epic, Legendary, Mythic) with custom light beams and scaling loot multipliers.
  - Added specialized chest variants: Gilded chests guarantee large gold drops; Jeweled chests guarantee gems.
- **20-Tier Gear & 6-Act Campaign Rebalance**:
  - Expanded gear progression into 20 equipment tiers (10 core tiers + 10 ascendancy tiers) scaled smoothly for levels 1–100.
  - Structured campaign depths into 6 Act progression bands with proper quality caps and themed biomes.
  - Added live gear tooltip comparison differentials (+/- green/red stat changes) when inspecting weapons, armor, and jewelry against equipped items.
- **Rejuvenation & Fury Resource Orbs**:
  - Added Rejuvenation Orbs (`orb_rejuv`, restores 35% Max Life & Mana) and Fury Orbs (`orb_fury`, grants 15s haste, attack speed, and CDR blessing) to monster drops, clutter, and treasure chests.

### Fixed & Improved
- **Ground Orb Collection Lifecycle**:
  - Fixed orb pickup vacuum magnet bug where unhandled orbs stacked onto the player and followed them indefinitely.
  - Implemented `applyRejuvenation()` and `applyFury()` handlers on `Player` shared between potion consumption and orb pickup.
  - Fixed Hunger of the Abyss Heresy to properly suppress all orb drop variants (`orb_*`).
- **Auto-Play World Object & Orb Intelligence**:
  - Auto-play now automatically navigates to and selects options for wave altars, monoliths, and shrine dialogs.
  - Auto-play intelligently seeks out Rejuvenation and Fury orbs when injured or low on mana.
- **Paladin Blessed Shield Multiplayer Rendering**:
  - Fixed Paladin orbiting Blessed Shield visual effects so remote party members see orbiting shield animations in multiplayer.
- **Friendly Duel Self-Hit Immunity**:
  - Fixed duel combat registration to prevent self-inflicted damage.
- **Monk Armor & Gear Art Overhaul**:
  - Complete sprite overhaul for Monk armor across all rarity tiers (Common through Mythic) with updated isometric gear art and palettes.
- **NPC Rendering Crash**:
  - Resolved `ReferenceError: A is not defined` crash in `render.js`.
- **Lobby Form Compliance**:
  - Wrapped lobby room password inputs in `<form>` tags with autocomplete attributes for browser compliance.
- **Architecture & Cleanup**:
  - Removed legacy, unused `defense/` prototype directory, streamlining repository and eliminating dead code.
  - Updated package name to `velscour-online-v2`.

---

## [0.2.5] - 2026-11-08

### Added
- **1-Click 'Stash All' for Storage Chest & Reliquary**:
  - Added "Stash All" (backpack items) and "Stash Gems" (Gem Bag) to both the Town Storage Chest and Reliquary.
  - Added Reliquary Vault header controls: "Stash All", "Sort by type", and "Sort by rarity".
- **Shop & Vendor UI Polish**:
  - Relocated "Sell all" (gear) and "Sell gems" buttons to the top action header of Backpack and Gem Bag respectively next to the Sort buttons.
  - Added bulk gem selling confirmation with stack totals and gold payout.
- **Desktop Draggable & Resizable Chat Window**:
  - Interactable desktop chat can now be dragged anywhere on screen and resized horizontally and vertically with persistent layout saving.
- **HUD Live Network Latency (Ping)**:
  - Added real-time ping monitor to the multiplayer HUD.
- **Chat & Character Name Profanity Filter**:
  - Comprehensive multi-stage profanity filtering for public multiplayer chat and character creation.

### Fixed & Improved
- **Multiplayer Town Portal Floor Progression**:
  - Resolved floor tracking desync so transitioning between dungeon depths reliably updates town portals to reflect the highest cleared depth.
- **Macro Buff Proximity & Combat Gating**:
  - Fixed "Keep Up" macro buffs erroneously triggering after blinking or teleporting in multiplayer by strictly enforcing monster proximity.
- **Town Auto-Play Navigation Safety**:
  - Auto-play no longer runs ahead in town before a portal destination is selected.
- **Castle & Blackfen Hold Visuals**:
  - Fixed castle moat bridge texture disappearing when gates open.
  - Fixed doorway opening leaving behind wall top textures.
- **Caverns Waterfall Boss Soft-Lock**:
  - Fixed boss spawning trigger in Caverns so blinking or teleporting across the waterfall awakens the boss properly.
- **Loot Filter Resilience**:
  - Fixed `Cannot read properties of undefined (reading 'filter')` crash on custom loot filtering.
- **Cutscenes & Combat Clutter**:
  - Minions, pets, summons, and Death Knight flying swords freeze during cinematics and no longer target environmental clutter.
- **Dungeon Lighting**:
  - Prioritized active dungeon torches to prevent light source starvation.

---

## [0.2.4] - 2026-11-04

### Added
- **8 New Playable Classes (Expanding Roster to 17 Classes)**:
  - **Monk**: Disciplined martial warrior invoking the **Seven-Sided Strike** ultimate with radial spirit strikes, martial dash sweeps, and dynamic shockwaves.
  - **Dragoon**: High-flying aerial lancer executing **Skyfall Dive** — leaps high above the clouds before plummeting back in a thunderous lightning-infused meteor crater.
  - **Totem Master**: Primal animist summoning the **Grand Totemic Cataclysm** — channels quadruplet elemental spirit totems, violent elemental storms, and ancient ground glyphs.
  - **Death Knight**: Unholy juggernaut unleashing **Glacial Oblivion** — smashes the earth to tear open deep glacial rifts, erupting colossal frost spikes and freezing shockwaves.
  - **Arcane Sorcerer (Astronomer)**: Cosmic weaver triggering **Astral Collapse** — summons an astronomical void vortex pulling enemies inward before detonating in an arcane singularity.
  - **Slime Lord**: Gelatinous sovereign commanding **Royal Deluge** — erupts high-pressure caustic acid pools and toxic geysers to corrode entire hordes of fiends.
  - **Boomerang Knight**: Whirling bladesman releasing **Cyclone Tempest** — hurls an orbiting maelstrom of razor-sharp whirling crescent boomerangs.
  - **Dragon Knight**: Hellfire dragon champion breathing **Dragon's Inferno** — sets the arena ablaze with draconic hellfire runes and searing ancient dragon breath.
- **17 Bespoke Class Ultimates**:
  - Every hero class in the game now wields a bespoke, kill-charged Ultimate power move scaled dynamically off primary attributes (STR, DEX, INT, VIT).
  - Designed custom procedural 64x64 vector icons in `icons.js` and multi-phase canvas isometric animations in `ultimates_fx.js` for each ability.
- **Online Multiplayer Ultimate Skill Synchronization**:
  - Full real-time party replication across WebSockets (`game_ultimate_cast`).
  - All party members see teammate Ultimate casts in real time, complete with synchronized ground sigils, celestial meteors, vortex animations, screen shakes, and team combat log broadcasts.
- **New Upstream Regions & Biomes**:
  - **Castle Overworld Variants**: 10 procedural castle layouts with stone battlements, deep moats, functioning drawbridges, and rich story encounters.
  - **Sea of Sand Dune Variants & 3D Pyramids**: 10 rolling dune variants featuring massive 3D pyramid dungeon complexes and subterranean burial chamber raid encounters.
  - **Alpine / Mountainside Biome**: High-altitude rugged mountain terrain, snow drifts, peak shrines, mountain wildlife, and avalanche hazards.
  - **Serpentine Tower & Snowy Summit**: High-elevation vertical climb environments and freezing summits.
  - **Multiplayer Biome & Variant Synchronization**: Deterministic region generation ensuring seamless party synchronization.
- **Boss Arena Mid-Fight Join**:
  - Players who arrive at a sealed boss arena (Raid Boss or Demon Lord Velscour) after the encounter has begun can interact with or touch the entrance barrier to receive a confirmation prompt to enter the battle.
  - Upon accepting, players are teleported inside the arena past the barrier with arrival VFX and audio.
  - Arena boundaries remain locked so players cannot retreat until the boss is defeated.
  - Autoplay accounts for sealed gates and enters boss arenas smoothly.
- **Title Screen Retro Parallax Eyes**:
  - Restored retro pixelated blinking parallax eyes that gaze and react across the title screen background.

### Improved & Fixed
- **Demon Lord Velscour Boss Encounter**:
  - Fixed sprite resolution lookup error when summoning the Demon Lord Velscour boss encounter.
- **Mobile Touch Joystick Drag-to-Start & Tap Pass-Through**:
  - In portrait mode (lower half of screen) and landscape mode (left half of screen), the virtual analog joystick now initiates upon drag (`>= 10px` displacement) rather than locking the touch immediately on `pointerdown`.
  - Tapping without dragging seamlessly clicks on underlying objects (chests, NPCs, portals, sealed arena gates, ground loot, monsters, and destination tiles) instead of being captured and blocked by the joystick.
- **Combat Sustenance & Health Orb Overhaul**:
  - **Natural HP Regen Removed in Dungeons**: Passive natural life regeneration is now active only in town (where heroes rapidly recover to full health). In dungeons, survival hinges on active combat play, gear/buff bonuses, and health orbs.
  - **Health Orb Primary Recovery**:
    - Increased health orb restoration from 15% to 20% max HP, accompanied by floating life combat text.
    - Normal monsters now drop health orbs with a 30% base chance, elevated to 50% when the hero is below half health.
    - Champion monsters drop 1 guaranteed orb plus a 50% chance for a second orb.
    - Unique monsters drop 1 guaranteed orb plus a 75% chance for a second orb.
    - Dungeon chests now have a 75% chance to contain a health orb.
    - Bosses drop 2 to 4 health orbs upon defeat, and 2 orbs drop upon shattering raid crystal seals or surviving Demon Lord Velscour's phase transitions (Seals, Abyss).
- **Cutscene Presentation & Input Handling**:
  - Chat UI and landscape chat handles are automatically hidden during cutscenes and restored upon cinematic conclusion or skip.
  - Player speech bubbles and ambient dialogue bubbles are suppressed during cutscenes.
  - Player movement, input, and autoplay actions are strictly frozen during cinematics to prevent wandering off-camera or unintended actions.
- **Enemy Scaling & Monster Regeneration Balancing**:
  - Overhauled level progression curves, monster health scaling, and elite HP regeneration to prevent one-shotting high-depth bosses while ensuring monster durability feels balanced.

---

## [0.2.3] - 2026-11-02

### Added
- **Travelling Merchant (Malakor the Ash-Wanderer)**:
  - Added a new travelling merchant standing just off the town square with an authentic handcart and an ambient ember aura.
  - Sells **Sealed Chests** in exchange for unspent **Infernal Marks**:
    - **Sealed Mystery Casket** (1 Mark): Guaranteed level-scaled Epic+ gear.
    - **Sealed Armament Coffer** (2 Marks): Level-scaled Epic+ Weapon or Offhand.
    - **Sealed Armor Vault** (2 Marks): Level-scaled Epic+ Armor piece (Helm, Chest, Legs, Boots, Gloves).
    - **Sealed Abyssal Reliquary** (5 Marks): Guaranteed **Legendary or Mythic** ancient treasure.
  - Real-time display of unspent Infernal Marks within the vendor interface and quick-link to the Marks allocation sheet.
  - Sealed caskets open via the HUD "SEALED" button or right-clicking in inventory with full slot-reel reveal animations.
  - Added ambient shopping dialogues for townsfolk visiting the travelling merchant.
- **The Pirate Seas (Naval Warfare Expansion)**:
  - 12 unique scenario battlefields on Bellmourn's waters: *Flight Deck, Ninth Bell, The Lightless, Wrecker's Reef, Harpoon Weather, Lashed Together, Fire Below, Across the Plank, Three Chains, Red Tide, Sea Coming Over, Dawnwake*.
  - 3D vessel models, carriers, dreadnoughts, galleons, dawnwakes, and naval combat mechanics.
- **Diablo-Style Cast Lock & Auto-Cast Summons**:
  - Implemented responsive casting lock mechanics preventing ability sequence interruption.
  - Auto-cast logic for persistent summoner minion management and pet upkeep.
- **Infernal Marks Storage Expansions**:
  - Account-wide row expansions for Backpack, Gem Bag, Stash, Jewel Box, and Reliquary, unlockable using free Infernal Marks.
  - Persistent storage rows shared across all heroes on the account.
- **Fullscreen Loading & Transition Screen**:
  - Dedicated loading screen with gameplay tips carousel, progress bar, and smooth player/camera spawn stabilization.

### Improved & Fixed
- **Mountainside Biome Overworld Overhaul**:
  - Full overworld integration for high-altitude rugged terrain, snow drifts, mountain goats, peak shrines, and avalanche environmental hazards.
  - Optimized mobile rendering, memory footprints, and pathfinding on steep slopes.
- **Minimizable Portrait & Desktop Chat Dock**:
  - Compact dockable chat overlay with unread activity badges, customizable channel tabs, and mobile viewport optimizations.
- **Visual Polish**:
  - Improved tree fading, occlusion windows, map edge fades, and inventory/reliquary scrolling ergonomics.
  - Ensured `classSprite` supports vendor palette tints for class-based NPC sprites.

---

## [0.2.2] - 2026-11-02

### Added
- **Jewel Box Vault**: Dedicated town vault for storing gems, runes, and socketables.
- **Lancer 3D War Banner Customizer**: Tailor the cloth silhouette, field colors, heraldic patterns, and crest of the 3D War Banner.
- **Autoplay Gem Bag & Stash Management**: Automated storage of gems and high-tier materials during town visits.
- **Town Map Edge Fade**: Seamless camera bounds transition with atmospheric vignette.

---

## [0.2.1] - 2026-11-01

### Added
- **Bespoke Class Ultimates Animations**:
  - Multi-phase visual animations for all 9 class ultimates (*Paladin Divine Smite, Barbarian Cataclysm, Lancer Gungnir's Fall, Ranger Storm of Shafts, Gunner Siege Artillery, Bard Grand Crescendo, Wizard Supernova, Necromancer Grave Eruption, Carrion Witch Feast of Crows*).
  - Rotating ground sigils, celestial spears, subterranean magma fissures, falling arrow storms, artillery shells, musical staff spirals, cosmic singularities, and bone pikes.
- **Universal Gothic Fantasy Scrollbars**: Slim, stylistic scrollbars matching dark parchment and bronze aesthetics.
- **Lancer Orbiting Shield Visual Clarity**: Eliminated particle clutter and blinding fire bloom across all 7 Bulwark orbiting shield abilities.
- **Acoustic Plucked Lute Audio**: Redesigned Bard instrument sampler with warm acoustic string body resonance and harmonic damping.
- **In-Game Differential Android OTA Updater**: Checks per-file SHA-256 hashes and downloads only modified/new game files directly in-game.

---

## [0.2.0] - 2026-10-31

### Added
- **Endgame Expansion**: Heresies of the Hollow, Abyssal Rifts, Velscour Unbound, and Infernal Marks.
- **Level Cap 3000 & Endless Torment**: Progression extended up to Depth 6600 with uncapped Infernal Marks.
- **Skill Macros**: 5 customizable skill macro slots per hero with automatic buff recast.
- **Thorns Scaling & Weapon Base Display**: Normalized weapon damage and fortitude-scaled thorns.

