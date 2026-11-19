import { TREE4_NAMES } from './skilltrees4.js';
// All 19 playable classes on the Character Select screen (16 core classes + Monk, Rogue, Ninja).
export const ACTIVE_CLASS_IDS = [
  'paladin', 'ranger', 'wizard', 'necromancer',
  'barbarian', 'dragoon', 'totem_master', 'death_knight',
  'arcane_sorcerer', 'carrion_witch', 'bard', 'slime_lord',
  'boomerang_knight', 'lancer', 'dragon_knight', 'gunner', 'monk',
  'rogue', 'ninja',
];
export const DISABLED_CLASS_IDS = [];

// primary: attribute that adds +1% damage to all of the class' skills per point.
export const CLASSES = {
  paladin: {
    name: 'Paladin', primary: 'str', base: { str: 24, dex: 14, vit: 24, int: 16 }, life: 95, mana: 40, lifeLvl: 18, manaLvl: 3,
    weapon: 'mace', offhand: 'shield', element: 'holy', color: '#ffd860',
    trees: ['Holy Wrath', 'Bulwark', 'Crusade'],
    desc: 'A templar sworn in blood and consecrated steel. Wields sanctified maces, warhammers, and an unyielding bulwark of light.',
  },
  ranger: {
    name: 'Ranger', primary: 'dex', base: { str: 16, dex: 28, vit: 18, int: 14 }, life: 78, mana: 40, lifeLvl: 14, manaLvl: 3.5,
    weapon: 'bow', offhand: 'quiver', element: 'phys', color: '#7ccf5a',
    trees: ['Marksmanship', 'The Wilds', 'Traps & Tricks'],
    desc: 'A relentless stalker of the borderlands. Commands longbows, war beasts, and lethal battlefield snares.',
  },
  wizard: {
    name: 'Wizard', primary: 'int', base: { str: 12, dex: 16, vit: 16, int: 32 }, life: 68, mana: 75, lifeLvl: 12, manaLvl: 6,
    weapon: 'staff', offhand: 'tome', element: 'fire', color: '#ff8a30',
    trees: ['Fire', 'Frost', 'Storm'],
    desc: 'A scholar of the primordial elements. Channels searing flame, glacial rime, and arcing tempests through runed staves and tomes.',
  },
  necromancer: {
    name: 'Necromancer', primary: 'int', base: { str: 14, dex: 16, vit: 18, int: 28 }, life: 72, mana: 70, lifeLvl: 13, manaLvl: 5.5,
    weapon: 'wand', offhand: 'orb', element: 'shadow', color: '#a070ff',
    trees: ['Bone & Blood', 'Summoning', 'Curses & Plague', 'Skeletal Legion'],
    desc: 'An ash-bound binder of the restless dead. Commands skeletal legions, serrated bone magic, and withering blood curses.',
  },
  barbarian: {
    name: 'Barbarian', primary: 'str', base: { str: 30, dex: 18, vit: 26, int: 8 }, life: 110, mana: 25, lifeLvl: 22, manaLvl: 2,
    weapon: 'axe', element: 'phys', color: '#d8853a',
    trees: ['Rage', 'Warcries', 'Earthshaker'],
    desc: 'A hardened warlord of the northern wastes. Cleaves through ranks with dual-wielded steel, earth-shattering leaps, and warcries.',
  },
  dragoon: {
    name: 'Dragoon', primary: 'str', base: { str: 24, dex: 22, vit: 22, int: 12 }, life: 88, mana: 35, lifeLvl: 16, manaLvl: 3,
    weapon: 'spear', offhand: 'shield', element: 'fire', color: '#6aa8ff',
    trees: ['Lancework', 'Sky Dive', 'Wyrmblood', 'Spearstorm'],
    desc: 'A lance-wielding knight who leaps from the heavens. Dragon dives, lance flurries and wyrm breath.',
  },
  totem_master: {
    name: 'Totem Master', primary: 'int', base: { str: 18, dex: 16, vit: 22, int: 24 }, life: 82, mana: 55, lifeLvl: 15, manaLvl: 4,
    weapon: 'staff', offhand: 'idol', element: 'light', color: '#5ac8a0',
    trees: ['Totems', 'Ancestors', 'Earth & Storm'],
    desc: 'A shaman who plants spirit totems that burn, shock and heal while ancestors fight at their side.',
  },
  death_knight: {
    name: 'Death Knight', primary: 'str', base: { str: 26, dex: 14, vit: 26, int: 14 }, life: 98, mana: 35, lifeLvl: 18, manaLvl: 3,
    weapon: 'sword', offhand: 'skull', element: 'cold', color: '#7ad0ff',
    trees: ['Frost', 'Unholy', 'Blood'],
    desc: 'A fallen champion bound by runic frost. Obliterating strikes, plague and life-stealing blood magic.',
  },
  arcane_sorcerer: {
    name: 'Astronomer', primary: 'int', base: { str: 12, dex: 16, vit: 16, int: 34 }, life: 68, mana: 80, lifeLvl: 12, manaLvl: 6,
    weapon: 'wand', offhand: 'orb', element: 'arcane', color: '#4aa8ff',
    trees: ['Starfire', 'Celestial Bodies', 'Gravity'],
    desc: 'A stargazer who wields the heavens. Swarms of star missiles, meteors, falling suns and black holes.',
  },
  carrion_witch: {
    name: 'Witch', primary: 'int', base: { str: 12, dex: 18, vit: 18, int: 30 }, life: 72, mana: 70, lifeLvl: 13, manaLvl: 5.5,
    weapon: 'staff', offhand: 'lantern', element: 'poison', color: '#9ac84a',
    trees: ['Plague', 'Murder of Crows', 'Hexes'],
    desc: 'A mire-born occultist of the black fens. Unleashes virulent plagues, ravenous murder crows, and soul-binding hexes.',
  },
  bard: {
    name: 'Bard', primary: 'dex', base: { str: 16, dex: 26, vit: 20, int: 18 }, life: 78, mana: 52, lifeLvl: 14, manaLvl: 4,
    weapon: 'lute', offhand: 'drum', element: 'arcane', color: '#ff6a8a',
    trees: ['Songs', 'Sonic Arts', 'Trickery'],
    desc: 'A battle-skald and blade-dancer. Weaves war-chants that bolster allies, resonant chords that fracture armor, and lethal daggers.',
  },
  slime_lord: {
    name: 'Slime Lord', primary: 'vit', base: { str: 18, dex: 14, vit: 32, int: 16 }, life: 105, mana: 45, lifeLvl: 20, manaLvl: 3.5,
    weapon: 'mace', offhand: 'jar', element: 'acid', color: '#4aa8ff',
    trees: ['Ooze', 'Spawn', 'Mutation'],
    desc: 'A crowned king of living ooze. Acid floods, endless slimeling broods and grotesque mutations.',
  },
  boomerang_knight: {
    name: 'Boomerang Knight', primary: 'dex', base: { str: 20, dex: 28, vit: 20, int: 12 }, life: 82, mana: 40, lifeLvl: 15, manaLvl: 3,
    weapon: 'boomerang', offhand: 'rang', element: 'phys', color: '#3ac8a8',
    trees: ['Throwing', 'Bladesmanship', 'Gale Knight'],
    desc: 'A dashing knight whose blades always come back. Ricochets, swirling sword storms and gale cyclones.',
  },
  lancer: {
    name: 'Lancer', primary: 'str', base: { str: 26, dex: 18, vit: 30, int: 8 }, life: 105, mana: 36, lifeLvl: 20, manaLvl: 2.5,
    weapon: 'spear', offhand: 'shield', element: 'light', color: '#c0c0d0',
    trees: ['Energy Lance', 'Bulwark', 'Knight Order'],
    desc: 'An ironclad vanguard commander. Drives storm-forged war lances through enemy lines behind a phalanx of tower shields.',
  },
  dragon_knight: {
    name: 'Dragon Knight', primary: 'str', base: { str: 26, dex: 18, vit: 24, int: 12 }, life: 92, mana: 40, lifeLvl: 17, manaLvl: 3,
    weapon: 'sword', offhand: 'shield', element: 'fire', color: '#ff5a2a',
    trees: ['Flame', 'Scale', 'Draconic'],
    desc: 'Blood of the wyrm runs hot. Fire breath, dragon-scale armor and the power to become a dragon.',
  },
  gunner: {
    name: 'Gunner', primary: 'dex', base: { str: 16, dex: 30, vit: 18, int: 16 }, life: 78, mana: 45, lifeLvl: 14, manaLvl: 3.5,
    weapon: 'pistol', offhand: 'bomb', element: 'fire', color: '#d0a060',
    trees: ['Firearms', 'Explosives', 'Engineering'],
    desc: 'A black-powder marksman and siege artificer. Commands flintlock repeaters, black-iron ordnance, and automated field turrets.',
  },
  monk: {
    name: 'Monk', primary: 'dex', base: { str: 22, dex: 28, vit: 24, int: 16 }, life: 86, mana: 50, lifeLvl: 16, manaLvl: 3.5,
    weapon: 'staff', offhand: 'tome', element: 'holy', color: '#ffaa30',
    trees: ['Martial Arts', 'Spirit & Mantras', 'Dragon & Tiger'],
    desc: 'A disciplined martial artist of the secluded monasteries. Harnesses inner chi through lightning-fast hand strikes, soaring kicks, and sacred defensive mantras.',
  },
  rogue: {
    // a dagger in each hand (items.js DUAL_WIELD); Combo Points and Stealth live in game/rogue.js
    name: 'Rogue', primary: 'dex', base: { str: 16, dex: 30, vit: 20, int: 12 }, life: 80, mana: 46, lifeLvl: 14.5, manaLvl: 3.5,
    weapon: 'dagger', element: 'blood', color: '#d8283c',
    trees: ['Assassination', 'Subtlety', 'Knives'],
    desc: 'A black-leather killer from the shuttered guilds. She lurks in the shadows, builds Combo Points with twin daggers and spends them on bloody finishers, while steel rains from the sky and bursts from the ground.',
  },
  ninja: {
    // katana in the right hand, nunchaku on the belt; the flips, shadows and the Unseen Cut live in game/ninja.js
    name: 'Ninja', primary: 'dex', base: { str: 18, dex: 30, vit: 20, int: 14 }, life: 82, mana: 48, lifeLvl: 15, manaLvl: 3.5,
    weapon: 'katana', offhand: 'nunchaku', element: 'shadow', color: '#6fd8ff',
    trees: ['Way of the Blade', 'Shadow Arts', 'Tools of War'],
    desc: 'A silent agent of the ruined moon temple. He somersaults through his foes behind a katana, his shadows repeat every cut, his hook drags them in, and the air fills with shuriken and caltrops.',
  },
};
for (const [c, name] of Object.entries(TREE4_NAMES)) if (CLASSES[c].trees.length === 3) CLASSES[c].trees.push(name);

/**
 * Every class's damage multiplier at hero levels DMG_TUNE_AT (log-interpolated, held past the ends; Player.skillDamage
 * applies it, so minions, signatures and procs follow). Measured in play by tools/tests/tuning.js: the classes killed
 * up to ~8x faster or slower than each other (the Astronomer, Ranger and Wizard fastest, the Barbarian and Dragoon
 * slowest); this evens most of it out (the measured ratio ^0.85, noise kept from swinging it all the way), and the
 * melee classes keep ~15% more for standing in the crowd.
 */
// Past hero level 160 classes scale apart again: at depths 400-500 (heroes ~215-260, tools/tests/tuning.js, two runs each)
// the Dragoon killed a normal in 0.28x the mean time and the Boomerang Knight 0.34x, the Carrion Witch 2.4x and the
// Gunner 2.1x; level 300 takes half that gap (the square root of the ratio), every other class holds its level-160 value.
// Measured again (three runs): the Gunner 0.99x and the Witch 1.3x, the Dragoon 0.61x and the Boomerang Knight 0.49x, so
// those two took a second half-step.
export const DMG_TUNE_AT = [1, 25, 60, 100];
export const DMG_TUNE = {
  paladin: [1.05, 1.05, 1.05, 1.05],
  ranger: [0.96, 0.96, 0.96, 0.96],
  wizard: [0.98, 0.98, 0.98, 0.98],
  necromancer: [1.0, 1.0, 1.0, 1.0],
  barbarian: [1.1, 1.12, 1.12, 1.12],
  dragoon: [1.05, 1.05, 1.05, 1.05],
  totem_master: [1.0, 1.0, 1.0, 1.0],
  death_knight: [1.05, 1.05, 1.05, 1.05],
  arcane_sorcerer: [0.95, 0.95, 0.95, 0.95],
  carrion_witch: [1.0, 1.02, 1.04, 1.05],
  bard: [0.98, 1.0, 1.02, 1.02],
  slime_lord: [1.0, 1.0, 1.0, 1.0],
  boomerang_knight: [1.0, 1.0, 1.0, 1.0],
  lancer: [1.08, 1.1, 1.1, 1.1],
  dragon_knight: [1.05, 1.05, 1.05, 1.05],
  gunner: [0.96, 0.98, 0.98, 0.98],
  monk: [1.04, 1.05, 1.05, 1.05],
  rogue: [1.03, 1.04, 1.04, 1.04],
  ninja: [1.03, 1.04, 1.04, 1.04],
};

export const ATTRS = {
  str: { name: 'Strength', short: 'STR', desc: '+1% physical damage, +1 armor' },
  dex: { name: 'Dexterity', short: 'DEX', desc: '+0.3% attack speed, +0.1% crit chance (past the 75% cap: +0.2% crit damage)' },
  vit: { name: 'Vitality', short: 'VIT', desc: '+6 life, +0.08 life regen' },
  int: { name: 'Intellect', short: 'INT', desc: '+2 mana, +1% elemental damage' },
};
