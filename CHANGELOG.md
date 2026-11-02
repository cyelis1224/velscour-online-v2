# Dagyr Online - Changelog

All notable changes to Dagyr Online are documented in this file.

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
- **Endgame Expansion**: Heresies of the Hollow, Abyssal Rifts, Dagyr Unbound, and Infernal Marks.
- **Level Cap 3000 & Endless Torment**: Progression extended up to Depth 6600 with uncapped Infernal Marks.
- **Skill Macros**: 5 customizable skill macro slots per hero with automatic buff recast.
- **Thorns Scaling & Weapon Base Display**: Normalized weapon damage and fortitude-scaled thorns.
