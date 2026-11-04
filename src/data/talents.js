// Passive Talent Trees (opened with T).
// Uses the hero's dedicated talentPoints pool (+1 Talent Point awarded every 5 hero levels). Each of the 9 active classes has 3 branches matching its 3 skill trees.
// Within each branch:
//   Row 0 (Tier 1, Lv 1):  Foundation passive (5 ranks)
//   Row 1 (Tier 2, Lv 10): Mutually Exclusive Branch Augment Choice A vs Choice B (3 ranks, requires 3 ranks in Row 0)
//   Row 2 (Tier 3, Lv 24): Synergy Mastery passive (5 ranks, requires 1 rank in Row 1 A or B)
//   Row 3 (Tier 4, Lv 40): Mutually Exclusive Keystone Choice A vs Choice B (1 rank, requires 3 ranks in Row 2)

import { CLASSES } from './classes.js';

export const TALENT_ROW_LEVELS = [1, 10, 24, 40];

/**
 * Node definition format:
 * {
 *   id: 'barbarian.0.leap_aoe',
 *   classId: 'barbarian',
 *   branch: 0,
 *   row: 1,
 *   choice: 'A' | 'B' | null, // if 'A' or 'B', mutually exclusive with the other choice on the same branch & row
 *   maxRank: 3,
 *   reqLevel: 10,
 *   name: 'Seismic Impact',
 *   icon: 'earth' | 'sword' | 'crow' | ...,
 *   el: 'phys' | 'fire' | 'shadow' | ...,
 *   desc: (rank) => string,
 *   stats: { dmgPct: 8, ... }, // per-rank stat bonuses added in Player.recompute()
 *   mod: 'barb_leap_aoe',      // active skill augment key stored in player.st.talents[mod] = rank
 *   skillMult: { tree: 0, kind: 'leap', pct: 35 }, // optional per-rank % damage multiplier for matching skills
 * }
 */

const RAW_TALENTS = {
  paladin: [
    // Branch 0: Holy Wrath
    {
      name: 'Holy Wrath',
      el: 'holy',
      nodes: [
        {
          key: 'radiant_fervor', row: 0, choice: null, maxRank: 5, el: 'holy', fx: 'light',
          name: 'Radiant Fervor',
          stats: { holyPct: 7, castSpeed: 3, manaMax: 12 },
          desc: (r) => `+${r * 7}% Holy Damage, +${r * 3}% Cast Speed, and +${r * 12} Maximum Mana.`,
        },
        {
          key: 'blessed_vortex', row: 1, choice: 'A', maxRank: 3, el: 'holy', fx: 'hammer',
          name: 'Blessed Vortex',
          mod: 'pal_hammer_vortex',
          stats: { areaPct: 8, holyPct: 6 },
          skillMult: { tree: 0, kind: 'orbit', pct: 22 },
          desc: (r) => `<b>Augment (Hammers & Orbits):</b> Blessed Hammer, Hammerstorm, and Wheel of Hammers summon +${r} extra orbiting hammer${r > 1 ? 's' : ''}, pull nearby foes inward, and deal +${r * 22}% damage.`,
        },
        {
          key: 'heavens_judgment', row: 1, choice: 'B', maxRank: 3, el: 'holy', fx: 'lightning',
          name: "Heavens' Judgment",
          mod: 'pal_strike_nova',
          stats: { critChance: 3, holyPct: 6 },
          skillMult: { tree: 0, kind: 'strike', pct: 25 },
          desc: (r) => `<b>Augment (Smite & Heavens):</b> Smite, Divine Strike, and Fist of the Heavens call down an extra bolt of holy lightning on impact and deal +${r * 25}% damage (+${r * 3}% Crit Chance).`,
        },
        {
          key: 'sanctified_mind', row: 2, choice: null, maxRank: 5, el: 'holy', fx: 'holy',
          name: 'Sanctified Mind',
          stats: { cdr: 4, critDmg: 10, manaRegenPct: 10 },
          desc: (r) => `+${r * 4}% Cooldown Reduction, +${r * 10}% Critical Damage, and +${r * 10}% Mana Regeneration.`,
        },
        {
          key: 'archon_ascendant', row: 3, choice: 'A', maxRank: 1, el: 'holy', fx: 'star',
          name: 'Archon Ascendant',
          mod: 'pal_archon_key',
          stats: { holyPct: 25, allStats: 10 },
          desc: () => `<b>Keystone:</b> +25% Holy Damage and +10 to All Attributes. Holy Wrath skills release a purifying nova every time they critically strike.`,
        },
        {
          key: 'seraphic_conduit', row: 3, choice: 'B', maxRank: 1, el: 'holy', fx: 'laser',
          name: 'Seraphic Conduit',
          mod: 'pal_seraph_key',
          stats: { cdr: 15, lifeSteal: 5, castSpeed: 12 },
          desc: () => `<b>Keystone:</b> +15% Cooldown Reduction, +12% Cast Speed, and Holy skills leech 5% of damage dealt as Life.`,
        },
      ],
    },
    // Branch 1: Bulwark
    {
      name: 'Bulwark',
      el: 'phys',
      nodes: [
        {
          key: 'iron_faith', row: 0, choice: null, maxRank: 5, el: 'phys', fx: 'shield',
          name: 'Iron Faith',
          stats: { armorPct: 8, lifePct: 4, block: 2 },
          desc: (r) => `+${r * 8}% Armor, +${r * 4}% Maximum Life, and +${r * 2}% Block Chance.`,
        },
        {
          key: 'ricochet_aegis', row: 1, choice: 'A', maxRank: 3, el: 'holy', fx: 'pshield',
          name: 'Ricochet Aegis',
          mod: 'pal_shield_ricochet',
          stats: { physPct: 8, holyPct: 8 },
          skillMult: { tree: 1, pct: 20 },
          desc: (r) => `<b>Augment (Shield & Charge):</b> Shield Throw ricochets to +${r + 1} additional foes, and Shield Bash & Charge trigger a blinding holy blast on impact (+${r * 20}% Bulwark skill damage).`,
        },
        {
          key: 'sanctified_bastion', row: 1, choice: 'B', maxRank: 3, el: 'holy', fx: 'aura',
          name: 'Sanctified Bastion',
          mod: 'pal_aura_ward',
          stats: { block: 4, resAll: 5, lifeRegen: 8 },
          desc: (r) => `<b>Augment (Auras & Shields):</b> Casting any Bulwark Aura or Holy Shield grants a barrier for 15% Max Life and pulses healing to nearby allies (+${r * 4}% Block, +${r * 5}% All Resistances).`,
        },
        {
          key: 'templar_resilience', row: 2, choice: null, maxRank: 5, el: 'phys', fx: 'shield',
          name: 'Templar Resilience',
          stats: { reduce: 2, resAll: 4, thorns: 15 },
          desc: (r) => `+${r * 2}% Damage Reduction, +${r * 4}% All Resistances, and +${r * 15} Thorns.`,
        },
        {
          key: 'unbreakable_wall', row: 3, choice: 'A', maxRank: 1, el: 'holy', fx: 'shield',
          name: 'Unbreakable Citadel',
          mod: 'pal_citadel_key',
          stats: { block: 12, reduce: 8, armorPct: 25 },
          desc: () => `<b>Keystone:</b> +12% Block Chance, +8% Damage Reduction, and +25% Armor. Blocking an attack unleashes a holy shockwave around you.`,
        },
        {
          key: 'martyrs_retribution', row: 3, choice: 'B', maxRank: 1, el: 'fire', fx: 'explosion',
          name: "Martyr's Retribution",
          mod: 'pal_martyr_key',
          stats: { lifePct: 18, dmgPct: 20, thorns: 80 },
          desc: () => `<b>Keystone:</b> +18% Maximum Life and +20% Damage. Bulwark slams and novas deal bonus damage equal to 8% of your Maximum Life.`,
        },
      ],
    },
    // Branch 2: Crusade
    {
      name: 'Crusade',
      el: 'phys',
      nodes: [
        {
          key: 'zealous_arms', row: 0, choice: null, maxRank: 5, el: 'phys', fx: 'slash',
          name: 'Zealous Arms',
          stats: { dmgPct: 6, atkSpeed: 4, critChance: 2 },
          desc: (r) => `+${r * 6}% Weapon & Skill Damage, +${r * 4}% Attack Speed, and +${r * 2}% Critical Chance.`,
        },
        {
          key: 'zealous_cleave', row: 1, choice: 'A', maxRank: 3, el: 'holy', fx: 'blade',
          name: 'Blades of Conviction',
          mod: 'pal_zeal_waves',
          stats: { atkSpeed: 4, holyPct: 8 },
          skillMult: { tree: 2, kind: 'melee', pct: 20 },
          desc: (r) => `<b>Augment (Zeal & Melee):</b> Zealous Strike, Zeal, and Crusader's Flurry launch ${r} piercing wave${r > 1 ? 's' : ''} of holy light forward on cast and deal +${r * 20}% melee damage.`,
        },
        {
          key: 'blood_crusader', row: 1, choice: 'B', maxRank: 3, el: 'blood', fx: 'slash',
          name: 'Crimson Inquisition',
          mod: 'pal_blood_martyr',
          stats: { lifeSteal: 3, critDmg: 16 },
          skillMult: { tree: 2, pct: 18 },
          desc: (r) => `<b>Augment (Crusade Strikes):</b> Sacrifice, Vengeance, and Final Judgment gain +${r * 3}% Life Steal, +${r * 16}% Critical Damage, and cause bleeding on every hit.`,
        },
        {
          key: 'righteous_momentum', row: 2, choice: null, maxRank: 5, el: 'holy', fx: 'wind',
          name: 'Righteous Momentum',
          stats: { moveSpeed: 3, critDmg: 10, physPct: 5 },
          desc: (r) => `+${r * 3}% Move Speed, +${r * 10}% Critical Damage, and +${r * 5}% Physical Damage.`,
        },
        {
          key: 'grand_crusader', row: 3, choice: 'A', maxRank: 1, el: 'holy', fx: 'blade',
          name: 'Grand Crusader',
          mod: 'pal_crusader_key',
          stats: { atkSpeed: 15, dmgPct: 20, critChance: 6 },
          desc: () => `<b>Keystone:</b> +15% Attack Speed, +20% Damage, and +6% Critical Chance. Crusade melee skills strike an additional time.`,
        },
        {
          key: 'judgment_executioner', row: 3, choice: 'B', maxRank: 1, el: 'holy', fx: 'pillar',
          name: 'Sword of Reckoning',
          mod: 'pal_reckoning_key',
          stats: { critDmg: 45, bossDmg: 25, pierce: 1 },
          desc: () => `<b>Keystone:</b> +45% Critical Damage and +25% Boss Damage. Crusade skills deal +35% damage to enemies below 50% Life.`,
        },
      ],
    },
  ],

  ranger: [
    // Branch 0: Marksmanship
    {
      name: 'Marksmanship',
      el: 'phys',
      nodes: [
        {
          key: 'eagle_eye', row: 0, choice: null, maxRank: 5, el: 'phys', fx: 'arrow',
          name: 'Eagle Eye',
          stats: { dmgPct: 6, critChance: 3, atkSpeed: 3 },
          desc: (r) => `+${r * 6}% Damage, +${r * 3}% Critical Chance, and +${r * 3}% Attack Speed.`,
        },
        {
          key: 'splintering_volley', row: 1, choice: 'A', maxRank: 3, el: 'phys', fx: 'arrow',
          name: 'Splintering Volley',
          mod: 'rng_arrow_split',
          stats: { pierce: 1, atkSpeed: 4 },
          skillMult: { tree: 0, kind: 'proj', pct: 16 },
          desc: (r) => `<b>Augment (Bow Projectiles):</b> Quick Shot, Multishot, Frost Volley, and bow projectile skills fire +${r} additional arrow${r > 1 ? 's' : ''}, gain +${r} Pierce, and deal +${r * 16}% damage.`,
        },
        {
          key: 'snipers_mark', row: 1, choice: 'B', maxRank: 3, el: 'phys', fx: 'arrow',
          name: "Sniper's Mark",
          mod: 'rng_sniper_crit',
          stats: { critDmg: 18, bossDmg: 10 },
          skillMult: { tree: 0, pct: 22 },
          desc: (r) => `<b>Augment (Precision & Rain):</b> Guided Arrow, Piercing Arrow, Dead Eye, and Rain of Arrows deal +${r * 22}% damage and Mark enemies on hit to take +25% increased damage.`,
        },
        {
          key: 'windrunner', row: 2, choice: null, maxRank: 5, el: 'phys', fx: 'wind',
          name: 'Windrunner',
          stats: { moveSpeed: 4, critDmg: 10, dex: 4 },
          desc: (r) => `+${r * 4}% Move Speed, +${r * 10}% Critical Damage, and +${r * 4} Dexterity.`,
        },
        {
          key: 'storm_archery', row: 3, choice: 'A', maxRank: 1, el: 'light', fx: 'lightning',
          name: 'Tempest Quiver',
          mod: 'rng_tempest_key',
          stats: { atkSpeed: 18, lightPct: 25, pierce: 2 },
          desc: () => `<b>Keystone:</b> +18% Attack Speed, +25% Lightning Damage, and +2 Pierce. Arrow hits chain lightning to nearby enemies.`,
        },
        {
          key: 'heartseeker', row: 3, choice: 'B', maxRank: 1, el: 'phys', fx: 'arrow',
          name: 'Heartseeker',
          mod: 'rng_heartseeker_key',
          stats: { critChance: 10, critDmg: 45, lifeSteal: 4 },
          desc: () => `<b>Keystone:</b> +10% Critical Chance, +45% Critical Damage, and +4% Life Steal. Critical arrow hits always pierce and inflict Bleed.`,
        },
      ],
    },
    // Branch 1: The Wilds
    {
      name: 'The Wilds',
      el: 'poison',
      nodes: [
        {
          key: 'primal_bond', row: 0, choice: null, maxRank: 5, el: 'poison', fx: 'wolf',
          name: 'Primal Bond',
          stats: { summonPct: 10, lifePct: 4, poisonPct: 6 },
          desc: (r) => `+${r * 10}% Companion Damage & Life, +${r * 4}% Hero Maximum Life, and +${r * 6}% Poison Damage.`,
        },
        {
          key: 'alpha_pack', row: 1, choice: 'A', maxRank: 3, el: 'phys', fx: 'wolf',
          name: 'Alpha Pack',
          mod: 'rng_pack_alpha',
          stats: { summonPct: 18, lifeRegen: 6 },
          desc: (r) => `<b>Augment (Beast Companions):</b> Hawks, Wolves, and Bears gain +${r * 50}% Maximum Life, ${r * 12}% Damage Reduction, +${r * 18}% Damage, and leech life to you on hit.`,
        },
        {
          key: 'venomous_briars', row: 1, choice: 'B', maxRank: 3, el: 'poison', fx: 'thorn',
          name: 'Venomous Briars',
          mod: 'rng_poison_thorn',
          stats: { poisonPct: 14, areaPct: 8 },
          skillMult: { tree: 1, pct: 22 },
          desc: (r) => `<b>Augment (Thorns & Venom):</b> Poison Arrow, Plague Arrow, Briar Patch, and Gale deal +${r * 22}% damage, poison enemies, and slow their movement by 40%.`,
        },
        {
          key: 'oakheart', row: 2, choice: null, maxRank: 5, el: 'phys', fx: 'shield',
          name: 'Oakheart',
          stats: { resAll: 4, armorPct: 6, vit: 5 },
          desc: (r) => `+${r * 4}% All Resistances, +${r * 6}% Armor, and +${r * 5} Vitality.`,
        },
        {
          key: 'beastlord', row: 3, choice: 'A', maxRank: 1, el: 'phys', fx: 'bear',
          name: 'Sovereign of the Wild',
          mod: 'rng_beastlord_key',
          stats: { summonPct: 45, reduce: 6, atkSpeed: 12 },
          desc: () => `<b>Keystone:</b> +45% Companion Damage & Life, +6% Hero Damage Reduction, and +12% Attack Speed. Summon skills call +1 extra companion.`,
        },
        {
          key: 'toxic_hurricane', row: 3, choice: 'B', maxRank: 1, el: 'poison', fx: 'wind',
          name: 'Blightwind',
          mod: 'rng_blightwind_key',
          stats: { poisonPct: 30, cdr: 15, areaPct: 20 },
          desc: () => `<b>Keystone:</b> +30% Poison Damage, +15% Cooldown Reduction, and +20% Area. Nature and Wind skills erupt with poison spores on hit.`,
        },
      ],
    },
    // Branch 2: Traps & Tricks
    {
      name: 'Traps & Tricks',
      el: 'fire',
      nodes: [
        {
          key: 'saboteur', row: 0, choice: null, maxRank: 5, el: 'fire', fx: 'mine',
          name: 'Saboteur',
          stats: { cdr: 4, firePct: 6, physPct: 6 },
          desc: (r) => `+${r * 4}% Cooldown Reduction and +${r * 6}% Fire & Physical Damage.`,
        },
        {
          key: 'cluster_munitions', row: 1, choice: 'A', maxRank: 3, el: 'fire', fx: 'bomb',
          name: 'Cluster Munitions',
          mod: 'rng_trap_cluster',
          stats: { areaPct: 10, cdr: 3 },
          skillMult: { tree: 2, kind: 'trap', pct: 25 },
          desc: (r) => `<b>Augment (Traps & Sentries):</b> Trap skills deploy +${r} additional trap${r > 1 ? 's' : ''} per cast, deal +${r * 25}% trap damage, and Sentries gain +${r * 40}% Life & Duration.`,
        },
        {
          key: 'shadow_stalker', row: 1, choice: 'B', maxRank: 3, el: 'shadow', fx: 'smoke',
          name: 'Shadow Stalker',
          mod: 'rng_shadow_ambush',
          stats: { critChance: 4, moveSpeed: 4, lifeSteal: 2 },
          skillMult: { tree: 2, pct: 18 },
          desc: (r) => `<b>Augment (Deception):</b> Tumble, Vanish, and Smoke Bomb leave a detonation trap behind and grant +${r * 4}% Critical Chance, +${r * 4}% Move Speed, and +${r * 2}% Life Steal.`,
        },
        {
          key: 'lethal_contraptions', row: 2, choice: null, maxRank: 5, el: 'phys', fx: 'spike',
          name: 'Lethal Contraptions',
          stats: { critDmg: 10, areaPct: 5, lightPct: 6 },
          desc: (r) => `+${r * 10}% Critical Damage, +${r * 5}% Area of Effect, and +${r * 6}% Lightning Damage.`,
        },
        {
          key: 'master_trapper', row: 3, choice: 'A', maxRank: 1, el: 'fire', fx: 'mine',
          name: 'Grand Artificer',
          mod: 'rng_trapper_key',
          stats: { cdr: 15, summonPct: 35, firePct: 25 },
          desc: () => `<b>Keystone:</b> +15% Cooldown Reduction, +35% Sentry Power, and +25% Fire Damage. Traps arm instantly and detonate twice.`,
        },
        {
          key: 'nightblade_assassin', row: 3, choice: 'B', maxRank: 1, el: 'shadow', fx: 'clone',
          name: 'Phantom Assassin',
          mod: 'rng_phantom_key',
          stats: { critChance: 8, critDmg: 35, reduce: 8 },
          desc: () => `<b>Keystone:</b> +8% Critical Chance, +35% Critical Damage, and +8% Damage Reduction. Shadow Clones last 50% longer and deal +40% damage.`,
        },
      ],
    },
  ],

  wizard: [
    // Branch 0: Fire
    {
      name: 'Fire',
      el: 'fire',
      nodes: [
        {
          key: 'pyromancy', row: 0, choice: null, maxRank: 5, el: 'fire', fx: 'fireball',
          name: 'Pyromancy',
          stats: { firePct: 8, int: 4, manaMax: 12 },
          desc: (r) => `+${r * 8}% Fire Damage, +${r * 4} Intelligence, and +${r * 12} Maximum Mana.`,
        },
        {
          key: 'cataclysmic_impact', row: 1, choice: 'A', maxRank: 3, el: 'fire', fx: 'meteor',
          name: 'Cataclysmic Impact',
          mod: 'wiz_fire_meteor',
          stats: { areaPct: 10, firePct: 8 },
          skillMult: { tree: 0, pct: 22 },
          desc: (r) => `<b>Augment (Fireball & Meteor):</b> Fireball, Combustion, and Meteor leave a burning magma crater for 4s on impact and deal +${r * 22}% Fire skill damage.`,
        },
        {
          key: 'serpent_conflagration', row: 1, choice: 'B', maxRank: 3, el: 'fire', fx: 'hydra',
          name: 'Serpent Conflagration',
          mod: 'wiz_fire_hydra',
          stats: { castSpeed: 5, summonPct: 20 },
          skillMult: { tree: 0, pct: 18 },
          desc: (r) => `<b>Augment (Hydra & Beams):</b> Hydra summons +1 extra Hydra and lasts +${r * 3}s longer; Fire Bolt, Flame Spiral, and Fire beams fire +${r} bonus firebolt${r > 1 ? 's' : ''}.`,
        },
        {
          key: 'searing_ash', row: 2, choice: null, maxRank: 5, el: 'fire', fx: 'fire',
          name: 'Searing Ash',
          stats: { critChance: 2.5, critDmg: 12, firePct: 5 },
          desc: (r) => `+${(r * 2.5).toFixed(1)}% Critical Chance, +${r * 12}% Critical Damage, and +${r * 5}% Fire Damage.`,
        },
        {
          key: 'solar_avatar', row: 3, choice: 'A', maxRank: 1, el: 'fire', fx: 'sun',
          name: 'Solar Avatar',
          mod: 'wiz_solar_key',
          stats: { firePct: 30, areaPct: 20, bossDmg: 20 },
          desc: () => `<b>Keystone:</b> +30% Fire Damage, +20% Area, and +20% Boss Damage. Fire spells always Ignite enemies and explode on kill.`,
        },
        {
          key: 'phoenix_blood', row: 3, choice: 'B', maxRank: 1, el: 'fire', fx: 'fire',
          name: 'Phoenix Bloodline',
          mod: 'wiz_phoenix_key',
          stats: { lifeSteal: 5, lifePct: 15, cdr: 12 },
          desc: () => `<b>Keystone:</b> +5% Spell Life Steal, +15% Maximum Life, and +12% Cooldown Reduction. Fire spells heal you on every cast.`,
        },
      ],
    },
    // Branch 1: Frost
    {
      name: 'Frost',
      el: 'cold',
      nodes: [
        {
          key: 'cryomancy', row: 0, choice: null, maxRank: 5, el: 'cold', fx: 'shard',
          name: 'Cryomancy',
          stats: { coldPct: 8, armorPct: 6, manaRegenPct: 8 },
          desc: (r) => `+${r * 8}% Cold Damage, +${r * 6}% Armor, and +${r * 8}% Mana Regeneration.`,
        },
        {
          key: 'shatterfrost', row: 1, choice: 'A', maxRank: 3, el: 'cold', fx: 'frost',
          name: 'Shatterfrost',
          mod: 'wiz_cold_shatter',
          stats: { critDmg: 15, coldPct: 8 },
          skillMult: { tree: 1, pct: 22 },
          desc: (r) => `<b>Augment (Frost Spells):</b> Ice Shards, Glacial Spike, Frozen Orb, and Blizzard deal +${r * 22}% damage and fire +${r} extra ice shard${r > 1 ? 's' : ''} when cast.`,
        },
        {
          key: 'glacial_bulwark', row: 1, choice: 'B', maxRank: 3, el: 'cold', fx: 'shield',
          name: 'Glacial Bulwark',
          mod: 'wiz_cold_armor',
          stats: { reduce: 4, lifePct: 6, resAll: 6 },
          desc: (r) => `<b>Augment (Frost Ward & Golem):</b> Frozen Armor, Shiver Armor, and Ice Golem grant +${r * 4}% Damage Reduction, +${r * 6}% Max Life, and release a freezing nova when cast.`,
        },
        {
          key: 'permafrost', row: 2, choice: null, maxRank: 5, el: 'cold', fx: 'ice',
          name: 'Permafrost',
          stats: { cdr: 4, pierce: 1, coldPct: 5 },
          desc: (r) => `+${r * 4}% Cooldown Reduction, +${r} Projectile Pierce, and +${r * 5}% Cold Damage.`,
        },
        {
          key: 'lord_of_winter', row: 3, choice: 'A', maxRank: 1, el: 'cold', fx: 'blizzard',
          name: 'Heart of Winter',
          mod: 'wiz_winter_key',
          stats: { coldPct: 30, critChance: 8, areaPct: 20 },
          desc: () => `<b>Keystone:</b> +30% Cold Damage, +8% Critical Chance, and +20% Area. Cold spells have a high chance to Freeze enemies solid.`,
        },
        {
          key: 'crystalline_aegis', row: 3, choice: 'B', maxRank: 1, el: 'cold', fx: 'shield',
          name: 'Crystalline Aegis',
          mod: 'wiz_crystal_key',
          stats: { armorPct: 35, resAll: 15, summonPct: 50 },
          desc: () => `<b>Keystone:</b> +35% Armor, +15% All Resistances, and Ice Golem gains +100% Life, Taunt, and a chilling aura.`,
        },
      ],
    },
    // Branch 2: Storm
    {
      name: 'Storm',
      el: 'light',
      nodes: [
        {
          key: 'electromancy', row: 0, choice: null, maxRank: 5, el: 'light', fx: 'spark',
          name: 'Electromancy',
          stats: { lightPct: 8, castSpeed: 4, critChance: 2 },
          desc: (r) => `+${r * 8}% Lightning Damage, +${r * 4}% Cast Speed, and +${r * 2}% Critical Chance.`,
        },
        {
          key: 'arc_conductor', row: 1, choice: 'A', maxRank: 3, el: 'light', fx: 'lightning',
          name: 'Arc Conductor',
          mod: 'wiz_light_chain',
          stats: { lightPct: 8, castSpeed: 4 },
          skillMult: { tree: 2, pct: 20 },
          desc: (r) => `<b>Augment (Chain & Bolts):</b> Charged Bolt, Spark, and Chain Lightning fire +${r} extra bolt${r > 1 ? 's' : ''}/chain${r > 1 ? 's' : ''} and deal +${r * 20}% Storm skill damage.`,
        },
        {
          key: 'tempest_surge', row: 1, choice: 'B', maxRank: 3, el: 'light', fx: 'storm',
          name: 'Aether Blink',
          mod: 'wiz_light_teleport',
          stats: { cdr: 5, moveSpeed: 5, resAll: 4 },
          desc: (r) => `<b>Augment (Teleport & Novas):</b> Teleport, Static Field, and Energy Shield trigger a Lightning Nova at your destination and grant +${r * 5}% Cooldown Reduction & Move Speed.`,
        },
        {
          key: 'high_voltage', row: 2, choice: null, maxRank: 5, el: 'light', fx: 'lightning',
          name: 'High Voltage',
          stats: { critDmg: 12, manaMax: 15, lightPct: 5 },
          desc: (r) => `+${r * 12}% Critical Damage, +${r * 15} Maximum Mana, and +${r * 5}% Lightning Damage.`,
        },
        {
          key: 'archmage_of_storms', row: 3, choice: 'A', maxRank: 1, el: 'light', fx: 'pillar',
          name: 'Storm Sovereign',
          mod: 'wiz_storm_key',
          stats: { lightPct: 30, castSpeed: 15, critChance: 6 },
          desc: () => `<b>Keystone:</b> +30% Lightning Damage, +15% Cast Speed, and +6% Crit Chance. Every Storm spell calls down a bonus lightning strike on a nearby foe.`,
        },
        {
          key: 'mana_ward', row: 3, choice: 'B', maxRank: 1, el: 'arcane', fx: 'shield',
          name: 'Aetherial Sanctuary',
          mod: 'wiz_aether_key',
          stats: { reduce: 10, manaRegenPct: 40, lifePct: 15 },
          desc: () => `<b>Keystone:</b> +10% Damage Reduction, +40% Mana Regeneration, and +15% Maximum Life. Tesla Coils and Thunderstorms fire twice as fast.`,
        },
      ],
    },
  ],

  necromancer: [
    // Branch 0: Bone & Blood
    {
      name: 'Bone & Blood',
      el: 'blood',
      nodes: [
        {
          key: 'ossuary_scholar', row: 0, choice: null, maxRank: 5, el: 'phys', fx: 'bone',
          name: 'Ossuary Rite',
          stats: { physPct: 7, shadowPct: 7, castSpeed: 3 },
          desc: (r) => `+${r * 7}% Physical & Shadow/Blood Damage and +${r * 3}% Cast Speed.`,
        },
        {
          key: 'splintering_ossuary', row: 1, choice: 'A', maxRank: 3, el: 'phys', fx: 'spear',
          name: 'Splintering Ossuary',
          mod: 'nec_bone_shatter',
          stats: { pierce: 1, critDmg: 14 },
          skillMult: { tree: 0, kind: 'proj', pct: 22 },
          desc: (r) => `<b>Augment (Bone Projectiles):</b> Bone Spike, Teeth, Bone Spear, and Bone Spirit fire +${r} additional projectile${r > 1 ? 's' : ''}, gain +${r} Pierce, and deal +${r * 22}% damage.`,
        },
        {
          key: 'crimson_siphon', row: 1, choice: 'B', maxRank: 3, el: 'blood', fx: 'blood',
          name: 'Crimson Siphon',
          mod: 'nec_blood_leech',
          stats: { lifeSteal: 4, lifePct: 6 },
          skillMult: { tree: 0, pct: 20 },
          desc: (r) => `<b>Augment (Blood & Corpses):</b> Blood Drain, Blood Nova, Corpse Explosion, and Exsanguinate leech +${r * 4}% Life, deal +${r * 20}% damage, and have +${r * 12}% larger radius.`,
        },
        {
          key: 'ivory_carapace', row: 2, choice: null, maxRank: 5, el: 'phys', fx: 'bone',
          name: 'Ivory Carapace',
          stats: { armorPct: 8, critChance: 2.5, int: 4 },
          desc: (r) => `+${r * 8}% Armor, +${(r * 2.5).toFixed(1)}% Critical Chance, and +${r * 4} Intelligence.`,
        },
        {
          key: 'bone_sovereign', row: 3, choice: 'A', maxRank: 1, el: 'phys', fx: 'bone',
          name: 'Spear of the Ossuary',
          mod: 'nec_bone_key',
          stats: { critDmg: 45, physPct: 25, castSpeed: 12 },
          desc: () => `<b>Keystone:</b> +45% Critical Damage, +25% Physical Damage, and +12% Cast Speed. Bone spells shatter into bone shards on impact.`,
        },
        {
          key: 'sanguine_lord', row: 3, choice: 'B', maxRank: 1, el: 'blood', fx: 'blood',
          name: 'Sanguine Sovereign',
          mod: 'nec_blood_key',
          stats: { lifePct: 20, lifeSteal: 6, shadowPct: 25 },
          desc: () => `<b>Keystone:</b> +20% Maximum Life, +6% Life Steal, and +25% Blood/Shadow Damage. Blood skills release a Blood Nova on cast.`,
        },
      ],
    },
    // Branch 1: Summoning
    {
      name: 'Summoning',
      el: 'shadow',
      nodes: [
        {
          key: 'grave_dominion', row: 0, choice: null, maxRank: 5, el: 'shadow', fx: 'skeleton',
          name: 'Grave Dominion',
          stats: { summonPct: 12, lifePct: 4, manaMax: 10 },
          desc: (r) => `+${r * 12}% Minion Damage & Life, +${r * 4}% Hero Maximum Life, and +${r * 10} Maximum Mana.`,
        },
        {
          key: 'undying_legion', row: 1, choice: 'A', maxRank: 3, el: 'phys', fx: 'skeleton',
          name: 'Undying Legion',
          mod: 'nec_summon_fort',
          stats: { summonPct: 20, armorPct: 8 },
          desc: (r) => `<b>Augment (Fortified Undead):</b> All Skeletons, Golems, and Skeletal Legion minions gain +${r * 60}% Maximum Life, ${r * 12}% Damage Reduction, and +1 max minion cap.`,
        },
        {
          key: 'soul_frenzy', row: 1, choice: 'B', maxRank: 3, el: 'shadow', fx: 'wraith',
          name: 'Soul Frenzy',
          mod: 'nec_summon_frenzy',
          stats: { summonPct: 25, atkSpeed: 5 },
          desc: (r) => `<b>Augment (Ravenous Undead):</b> All Undead minions attack +${r * 12}% faster, deal +${r * 25}% more damage, and leech ${r * 4}% of their damage as Life to both themselves and you.`,
        },
        {
          key: 'lord_of_the_crypt', row: 2, choice: null, maxRank: 5, el: 'shadow', fx: 'golem',
          name: 'Crypt Commander',
          stats: { summonPct: 10, cdr: 4, resAll: 4 },
          desc: (r) => `+${r * 10}% Minion Damage & Life, +${r * 4}% Cooldown Reduction, and +${r * 4}% All Resistances.`,
        },
        {
          key: 'dread_overlord', row: 3, choice: 'A', maxRank: 1, el: 'shadow', fx: 'skeleton',
          name: 'Archlich Overlord',
          mod: 'nec_overlord_key',
          stats: { summonPct: 50, reduce: 8, allStats: 10 },
          desc: () => `<b>Keystone:</b> +50% Minion Damage & Life, +8% Hero Damage Reduction, and +10 All Attributes. Summon skills raise +1 additional minion per cast.`,
        },
        {
          key: 'death_pact_key', row: 3, choice: 'B', maxRank: 1, el: 'fire', fx: 'golem',
          name: 'Volatile Reanimation',
          mod: 'nec_volatile_key',
          stats: { summonPct: 40, firePct: 25, shadowPct: 25 },
          desc: () => `<b>Keystone:</b> +40% Minion Power and +25% Fire & Shadow Damage. Minions pulse dark fire around themselves and explode violently if slain.`,
        },
      ],
    },
    // Branch 2: Curses & Plague
    {
      name: 'Curses & Plague',
      el: 'poison',
      nodes: [
        {
          key: 'malediction', row: 0, choice: null, maxRank: 5, el: 'poison', fx: 'sigil',
          name: 'Malediction',
          stats: { poisonPct: 8, shadowPct: 6, cdr: 3 },
          desc: (r) => `+${r * 8}% Poison Damage, +${r * 6}% Shadow Damage, and +${r * 3}% Cooldown Reduction.`,
        },
        {
          key: 'pandemic_hex', row: 1, choice: 'A', maxRank: 3, el: 'shadow', fx: 'sigil',
          name: 'Doomed Hexes',
          mod: 'nec_curse_blast',
          stats: { areaPct: 12, shadowPct: 10 },
          skillMult: { tree: 2, kind: 'curse', pct: 30 },
          desc: (r) => `<b>Augment (Curses):</b> Amplify Damage, Weaken, Decrepify, and all Curses erupt with a shadow blast on cast, cover +${r * 15}% wider area, and last +${r * 25}% longer.`,
        },
        {
          key: 'necrotic_blight', row: 1, choice: 'B', maxRank: 3, el: 'poison', fx: 'poison',
          name: 'Necrotic Blight',
          mod: 'nec_poison_nova',
          stats: { poisonPct: 14, lifeSteal: 3 },
          skillMult: { tree: 2, pct: 22 },
          desc: (r) => `<b>Augment (Plague & Venom):</b> Poison Dagger, Poison Nova, Plague Cloud, and Contagion deal +${r * 22}% damage, leech +${r * 3}% Life, and shred enemy resistances.`,
        },
        {
          key: 'withering_aura', row: 2, choice: null, maxRank: 5, el: 'poison', fx: 'plague',
          name: 'Withering Presence',
          stats: { areaPct: 5, reduce: 2, poisonPct: 6 },
          desc: (r) => `+${r * 5}% Area of Effect, +${r * 2}% Damage Reduction, and +${r * 6}% Poison Damage.`,
        },
        {
          key: 'harbinger_of_doom', row: 3, choice: 'A', maxRank: 1, el: 'shadow', fx: 'sigil',
          name: 'Harbinger of Doom',
          mod: 'nec_doom_key',
          stats: { cdr: 15, shadowPct: 30, bossDmg: 25 },
          desc: () => `<b>Keystone:</b> +15% Cooldown Reduction, +30% Shadow Damage, and +25% Boss Damage. Cursed enemies take +20% more damage from all sources.`,
        },
        {
          key: 'apocalyptic_plague', row: 3, choice: 'B', maxRank: 1, el: 'poison', fx: 'acid',
          name: 'Plague Lord',
          mod: 'nec_plague_key',
          stats: { poisonPct: 35, areaPct: 20, lifeRegen: 25 },
          desc: () => `<b>Keystone:</b> +35% Poison Damage, +20% Area, and +25 Life Regen. Poisoned enemies release a Poison Nova when slain.`,
        },
      ],
    },
  ],

  barbarian: [
    // Branch 0: Rage
    {
      name: 'Rage',
      el: 'phys',
      nodes: [
        {
          key: 'berserker_blood', row: 0, choice: null, maxRank: 5, el: 'phys', fx: 'slash',
          name: 'Berserker Blood',
          stats: { physPct: 7, atkSpeed: 4, str: 4 },
          desc: (r) => `+${r * 7}% Physical Damage, +${r * 4}% Attack Speed, and +${r * 4} Strength.`,
        },
        {
          key: 'seismic_impact', row: 1, choice: 'A', maxRank: 3, el: 'phys', fx: 'smash',
          name: 'Seismic Impact',
          mod: 'barb_leap_aoe',
          stats: { areaPct: 12, physPct: 8 },
          skillMult: { tree: 0, kind: 'leap', pct: 35 },
          desc: (r) => `<b>Augment (Leap & Charge):</b> Leap and Leap Attack unleash a massive shockwave ring and tectonic eruption on landing, dealing +${r * 35}% Leap damage in a +${r * 25}% wider area and stunning enemies.`,
        },
        {
          key: 'blood_funnel', row: 1, choice: 'B', maxRank: 3, el: 'blood', fx: 'blade',
          name: 'Blood Funnel',
          mod: 'barb_whirl_leech',
          stats: { lifeSteal: 3, moveSpeed: 4 },
          skillMult: { tree: 0, kind: 'whirl', pct: 22 },
          desc: (r) => `<b>Augment (Whirlwind & Frenzy):</b> Whirlwind, Rampage, and Eternal Whirlwind pull enemies in from a +${r * 20}% wider radius, grant +${r * 3}% Life Steal, and deal +${r * 22}% damage.`,
        },
        {
          key: 'unrelenting_savagery', row: 2, choice: null, maxRank: 5, el: 'phys', fx: 'axe',
          name: 'Unrelenting Savagery',
          stats: { critChance: 3, critDmg: 12, lifePct: 3 },
          desc: (r) => `+${r * 3}% Critical Chance, +${r * 12}% Critical Damage, and +${r * 3}% Maximum Life.`,
        },
        {
          key: 'meteoric_crash', row: 3, choice: 'A', maxRank: 1, el: 'fire', fx: 'meteor',
          name: 'Skybreaker Leap',
          mod: 'barb_skybreaker_key',
          stats: { physPct: 25, firePct: 25, cdr: 15 },
          desc: () => `<b>Keystone:</b> +25% Physical & Fire Damage and +15% Cooldown Reduction. Leap skills leave a burning crater for 4s and generate 25 Rage on landing.`,
        },
        {
          key: 'crimson_tempest', row: 3, choice: 'B', maxRank: 1, el: 'blood', fx: 'blade',
          name: 'Eye of the Bloodstorm',
          mod: 'barb_bloodstorm_key',
          stats: { lifeSteal: 6, atkSpeed: 15, critDmg: 35 },
          desc: () => `<b>Keystone:</b> +6% Life Steal, +15% Attack Speed, and +35% Critical Damage. Spinning with Whirlwind or Rampage periodically hurls bleeding axe blades outward.`,
        },
      ],
    },
    // Branch 1: Warcries
    {
      name: 'Warcries',
      el: 'phys',
      nodes: [
        {
          key: 'iron_lungs', row: 0, choice: null, maxRank: 5, el: 'phys', fx: 'shout',
          name: 'Iron Lungs',
          stats: { lifePct: 5, armorPct: 7, cdr: 3 },
          desc: (r) => `+${r * 5}% Maximum Life, +${r * 7}% Armor, and +${r * 3}% Cooldown Reduction.`,
        },
        {
          key: 'thunderous_lung', row: 1, choice: 'A', maxRank: 3, el: 'light', fx: 'sonic',
          name: 'Thunderous Lung',
          mod: 'barb_shout_nova',
          stats: { reduce: 4, areaPct: 10 },
          skillMult: { tree: 1, pct: 25 },
          desc: (r) => `<b>Augment (Warcries):</b> All Warcries (Howl, Shout, Battle Cry, Battle Orders, Battle Command) unleash a damaging sonic shockwave around you and grant +${r * 4}% Damage Reduction.`,
        },
        {
          key: 'bloodhowl', row: 1, choice: 'B', maxRank: 3, el: 'blood', fx: 'shout',
          name: 'Bloodhowl',
          mod: 'barb_shout_frenzy',
          stats: { atkSpeed: 5, moveSpeed: 4, lifeRegen: 10 },
          desc: (r) => `<b>Augment (Warcries & Ancients):</b> Casting any Warcry instantly heals you for ${r * 5}% of Max Life, grants +${r * 8} Rage, and boosts Ancients' Damage & Life by +${r * 35}%.`,
        },
        {
          key: 'warlord_presence', row: 2, choice: null, maxRank: 5, el: 'phys', fx: 'shield',
          name: "Warlord's Presence",
          stats: { resAll: 5, lifePct: 4, summonPct: 10 },
          desc: (r) => `+${r * 5}% All Resistances, +${r * 4}% Maximum Life, and +${r * 10}% Ancient Companion Power.`,
        },
        {
          key: 'voice_of_the_mountain', row: 3, choice: 'A', maxRank: 1, el: 'phys', fx: 'sonic',
          name: 'Voice of the Mountain',
          mod: 'barb_voice_key',
          stats: { cdr: 18, reduce: 8, lifePct: 18 },
          desc: () => `<b>Keystone:</b> +18% Cooldown Reduction, +8% Damage Reduction, and +18% Max Life. Warcries stun nearby enemies and last 50% longer.`,
        },
        {
          key: 'ancestral_warchief', row: 3, choice: 'B', maxRank: 1, el: 'light', fx: 'ancient',
          name: 'Ancestral Warchief',
          mod: 'barb_ancients_key',
          stats: { summonPct: 60, dmgPct: 20, allStats: 10 },
          desc: () => `<b>Keystone:</b> +60% Ancient Companion Power, +20% Hero Damage, and +10 All Attributes. Call of the Ancients summons +1 additional Ancient.`,
        },
      ],
    },
    // Branch 2: Earthshaker
    {
      name: 'Earthshaker',
      el: 'fire',
      nodes: [
        {
          key: 'tectonic_force', row: 0, choice: null, maxRank: 5, el: 'phys', fx: 'earth',
          name: 'Tectonic Force',
          stats: { physPct: 6, firePct: 6, areaPct: 5 },
          desc: (r) => `+${r * 6}% Physical & Fire Damage and +${r * 5}% Area of Effect.`,
        },
        {
          key: 'molten_crater', row: 1, choice: 'A', maxRank: 3, el: 'fire', fx: 'eruption',
          name: 'Molten Crater',
          mod: 'barb_slam_crater',
          stats: { firePct: 12, areaPct: 8 },
          skillMult: { tree: 2, pct: 22 },
          desc: (r) => `<b>Augment (Slams & Quakes):</b> Ground Slam, Stomp, Fissure, and Earthquake ignite the ground with molten magma for 4s and deal +${r * 22}% Earthshaker skill damage.`,
        },
        {
          key: 'sundered_earth', row: 1, choice: 'B', maxRank: 3, el: 'phys', fx: 'rock',
          name: 'Sundered Earth',
          mod: 'barb_slam_sunder',
          stats: { critDmg: 16, bossDmg: 10 },
          skillMult: { tree: 2, pct: 20 },
          desc: (r) => `<b>Augment (Boulders & Fissures):</b> Rock Throw, Boulder Toss, and Seismic Slam sunder enemy armor on hit (target takes +25% damage) and deal +${r * 20}% damage.`,
        },
        {
          key: 'granite_bones', row: 2, choice: null, maxRank: 5, el: 'phys', fx: 'shield',
          name: 'Granite Bones',
          stats: { armorPct: 9, vit: 5, thorns: 15 },
          desc: (r) => `+${r * 9}% Armor, +${r * 5} Vitality, and +${r * 15} Thorns.`,
        },
        {
          key: 'volcanic_cataclysm', row: 3, choice: 'A', maxRank: 1, el: 'fire', fx: 'eruption',
          name: 'Volcanic Cataclysm',
          mod: 'barb_volcano_key',
          stats: { firePct: 30, physPct: 20, areaPct: 20 },
          desc: () => `<b>Keystone:</b> +30% Fire Damage, +20% Physical Damage, and +20% Area. Earthshaker skills trigger secondary volcanic eruptions around your target.`,
        },
        {
          key: 'colossus_might', row: 3, choice: 'B', maxRank: 1, el: 'phys', fx: 'earth',
          name: 'Titan of the Peaks',
          mod: 'barb_titan_key',
          stats: { armorPct: 35, reduce: 8, critDmg: 40 },
          desc: () => `<b>Keystone:</b> +35% Armor, +8% Damage Reduction, and +40% Critical Damage. Fissure skills tear 2 additional fault lines through the earth.`,
        },
      ],
    },
  ],

  carrion_witch: [
    // Branch 0: Plague
    {
      name: 'Plague',
      el: 'poison',
      nodes: [
        {
          key: 'putrid_alchemy', row: 0, choice: null, maxRank: 5, el: 'poison', fx: 'blob',
          name: 'Putrid Alchemy',
          stats: { poisonPct: 8, lifePct: 4, int: 4 },
          desc: (r) => `+${r * 8}% Poison Damage, +${r * 4}% Maximum Life, and +${r * 4} Intelligence.`,
        },
        {
          key: 'virulent_contagion', row: 1, choice: 'A', maxRank: 3, el: 'poison', fx: 'plague',
          name: 'Virulent Contagion',
          mod: 'witch_plague_burst',
          stats: { poisonPct: 12, areaPct: 10 },
          skillMult: { tree: 0, pct: 22 },
          desc: (r) => `<b>Augment (Plague & Rot):</b> Rot Bolt, Blight, Plague Cloud, and Toxic Rain deal +${r * 22}% damage, cover +${r * 10}% larger area, and cause poisoned foes to burst in a toxic nova on death.`,
        },
        {
          key: 'leeching_miasma', row: 1, choice: 'B', maxRank: 3, el: 'blood', fx: 'locust',
          name: 'Ravenous Swarm',
          mod: 'witch_plague_leech',
          stats: { lifeSteal: 4, summonPct: 18 },
          skillMult: { tree: 0, kind: 'cyclone', pct: 25 },
          desc: (r) => `<b>Augment (Locusts & Brood):</b> Locust Swarm, Swarm Storm, and Blood Flies spawn +${r} extra swarm${r > 1 ? 's' : ''}, leech +${r * 4}% Life on hit, and boost Plague Bearer & Hive Mother Life by +${r * 45}%.`,
        },
        {
          key: 'festering_spores', row: 2, choice: null, maxRank: 5, el: 'poison', fx: 'poison',
          name: 'Festering Spores',
          stats: { cdr: 4, resAll: 4, poisonPct: 5 },
          desc: (r) => `+${r * 4}% Cooldown Reduction, +${r * 4}% All Resistances, and +${r * 5}% Poison Damage.`,
        },
        {
          key: 'black_plague_key', row: 3, choice: 'A', maxRank: 1, el: 'poison', fx: 'plague',
          name: 'Harbinger of Pestilence',
          mod: 'witch_pestilence_key',
          stats: { poisonPct: 35, areaPct: 20, reduce: 8 },
          desc: () => `<b>Keystone:</b> +35% Poison Damage, +20% Area, and +8% Damage Reduction. Poisoned enemies deal 20% less damage and take +25% more damage.`,
        },
        {
          key: 'hive_sovereign', row: 3, choice: 'B', maxRank: 1, el: 'poison', fx: 'hive',
          name: 'Broodmother',
          mod: 'witch_brood_key',
          stats: { summonPct: 50, lifeSteal: 5, lifePct: 18 },
          desc: () => `<b>Keystone:</b> +50% Summon Power, +5% Life Steal, and +18% Max Life. Plague skills periodically spawn homing Blood Flies.`,
        },
      ],
    },
    // Branch 1: Murder of Crows
    {
      name: 'Murder of Crows',
      el: 'shadow',
      nodes: [
        {
          key: 'carrion_flock', row: 0, choice: null, maxRank: 5, el: 'shadow', fx: 'crow',
          name: 'Carrion Flock',
          stats: { shadowPct: 7, summonPct: 10, castSpeed: 3 },
          desc: (r) => `+${r * 7}% Shadow Damage, +${r * 10}% Raven & Summon Power, and +${r * 3}% Cast Speed.`,
        },
        {
          key: 'murder_crows', row: 1, choice: 'A', maxRank: 3, el: 'shadow', fx: 'bird',
          name: 'Murder Crows',
          mod: 'witch_murder_crows',
          stats: { lifeSteal: 4, summonPct: 22 },
          skillMult: { tree: 1, pct: 20 },
          desc: (r) => `<b>Augment (Murder Crows):</b> All Crow & Raven skills gain +${r * 5}% Lifesteal for you and themselves. Summoned Ravens (Raven Familiar, Raven Flock, Unkindness) gain +${r * 65}% Maximum Life and ${r * 15}% Damage Reduction, making them much harder to kill.`,
        },
        {
          key: 'razor_feathers', row: 1, choice: 'B', maxRank: 3, el: 'phys', fx: 'feather',
          name: 'Razor Feathers',
          mod: 'witch_crow_bleed',
          stats: { critChance: 3, critDmg: 15, pierce: 1 },
          skillMult: { tree: 1, kind: 'proj', pct: 22 },
          desc: (r) => `<b>Augment (Flock Barrage):</b> Crow Swarm, Crow Storm, Feather Blades, and Soul Crows launch +${r} additional projectile${r > 1 ? 's' : ''}, pierce foes, and inflict heavy Bleed.`,
        },
        {
          key: 'nightwing_shroud', row: 2, choice: null, maxRank: 5, el: 'shadow', fx: 'feather',
          name: 'Nightwing Shroud',
          stats: { moveSpeed: 4, critChance: 2.5, shadowPct: 5 },
          desc: (r) => `+${r * 4}% Move Speed, +${(r * 2.5).toFixed(1)}% Critical Chance, and +${r * 5}% Shadow Damage.`,
        },
        {
          key: 'unkindness_sovereign', row: 3, choice: 'A', maxRank: 1, el: 'shadow', fx: 'crow',
          name: 'Queen of the Murder',
          mod: 'witch_queen_key',
          stats: { summonPct: 55, lifeSteal: 6, shadowPct: 25 },
          desc: () => `<b>Keystone:</b> +55% Raven Power, +6% Life Steal, and +25% Shadow Damage. Raven summons call +2 extra Murder Crows and cleave dark feathers on every attack.`,
        },
        {
          key: 'eclipse_tempest', row: 3, choice: 'B', maxRank: 1, el: 'shadow', fx: 'crow',
          name: 'Nevermore Tempest',
          mod: 'witch_nevermore_key',
          stats: { critDmg: 45, castSpeed: 15, cdr: 12 },
          desc: () => `<b>Keystone:</b> +45% Critical Damage, +15% Cast Speed, and +12% Cooldown Reduction. Murder of Crows and Dark Murder summon +2 extra crow cyclones.`,
        },
      ],
    },
    // Branch 2: Hexes
    {
      name: 'Hexes',
      el: 'shadow',
      nodes: [
        {
          key: 'eldritch_malice', row: 0, choice: null, maxRank: 5, el: 'shadow', fx: 'rune',
          name: 'Eldritch Malice',
          stats: { shadowPct: 7, cdr: 3, manaRegenPct: 8 },
          desc: (r) => `+${r * 7}% Shadow Damage, +${r * 3}% Cooldown Reduction, and +${r * 8}% Mana Regeneration.`,
        },
        {
          key: 'soul_shackle', row: 1, choice: 'A', maxRank: 3, el: 'shadow', fx: 'sigil',
          name: 'Soul Shackle',
          mod: 'witch_hex_doom',
          stats: { areaPct: 12, bossDmg: 10 },
          skillMult: { tree: 2, pct: 24 },
          desc: (r) => `<b>Augment (Curses & Hexes):</b> Voodoo Doll, Withering, Hag's Curse, and Doom Hex detonate for instant Shadow burst damage on cast and last +${r * 25}% longer.`,
        },
        {
          key: 'coven_conduit', row: 1, choice: 'B', maxRank: 3, el: 'shadow', fx: 'totem',
          name: 'Coven Conduit',
          mod: 'witch_hex_totem',
          stats: { summonPct: 22, castSpeed: 5 },
          desc: (r) => `<b>Augment (Totems & Coven):</b> Cauldron, Bone Totem, Spirit Lantern, Effigy, and Coven witches gain +${r * 50}% Life & Damage and grant you +${r * 5}% Cast Speed.`,
        },
        {
          key: 'blood_rite', row: 2, choice: null, maxRank: 5, el: 'blood', fx: 'drain',
          name: 'Blood Rite',
          stats: { lifePct: 4, resAll: 4, critDmg: 10 },
          desc: (r) => `+${r * 4}% Maximum Life, +${r * 4}% All Resistances, and +${r * 10}% Critical Damage.`,
        },
        {
          key: 'grand_hexer', row: 3, choice: 'A', maxRank: 1, el: 'shadow', fx: 'rune',
          name: 'Doomweaver',
          mod: 'witch_doom_key',
          stats: { shadowPct: 30, cdr: 15, lifeSteal: 5 },
          desc: () => `<b>Keystone:</b> +30% Shadow Damage, +15% Cooldown Reduction, and +5% Life Steal. Hexed enemies take +25% increased damage and heal you when struck.`,
        },
        {
          key: 'coven_matriarch', row: 3, choice: 'B', maxRank: 1, el: 'shadow', fx: 'witch',
          name: 'Matriarch of the Coven',
          mod: 'witch_matriarch_key',
          stats: { summonPct: 50, reduce: 8, allStats: 12 },
          desc: () => `<b>Keystone:</b> +50% Totem & Coven Power, +8% Damage Reduction, and +12 All Attributes. Summoning a Totem, Cauldron, or Coven Witch unleashes a Hex Nova.`,
        },
      ],
    },
  ],

  bard: [
    // Branch 0: Songs
    {
      name: 'Songs',
      el: 'holy',
      nodes: [
        {
          key: 'harmonic_voice', row: 0, choice: null, maxRank: 5, el: 'holy', fx: 'note',
          name: 'Harmonic Voice',
          stats: { dmgPct: 6, cdr: 3, manaRegenPct: 10 },
          desc: (r) => `+${r * 6}% All Damage, +${r * 3}% Cooldown Reduction, and +${r * 10}% Mana Regeneration.`,
        },
        {
          key: 'resonant_chorus', row: 1, choice: 'A', maxRank: 3, el: 'holy', fx: 'note',
          name: 'Resonant Aria',
          mod: 'bard_song_pulse',
          stats: { areaPct: 12, lifeRegen: 10 },
          skillMult: { tree: 0, pct: 22 },
          desc: (r) => `<b>Augment (Ballads & Hymns):</b> Performing any Song buff or Requiem releases a damaging & healing harmonic nova around you and increases Song duration by +${r * 25}%.`,
        },
        {
          key: 'virtuoso_ensemble', row: 1, choice: 'B', maxRank: 3, el: 'arcane', fx: 'clone',
          name: 'Virtuoso Ensemble',
          mod: 'bard_chorus_fort',
          stats: { summonPct: 24, castSpeed: 5 },
          desc: (r) => `<b>Augment (Chorus & Orchestra):</b> Chorus and Orchestra clones gain +${r * 55}% Maximum Life & Damage, ${r * 12}% Damage Reduction, and +1 extra singer.`,
        },
        {
          key: 'golden_cadence', row: 2, choice: null, maxRank: 5, el: 'holy', fx: 'light',
          name: 'Golden Cadence',
          stats: { resAll: 4, lifePct: 4, holyPct: 6 },
          desc: (r) => `+${r * 4}% All Resistances, +${r * 4}% Maximum Life, and +${r * 6}% Holy & Arcane Damage.`,
        },
        {
          key: 'maestro_of_light', row: 3, choice: 'A', maxRank: 1, el: 'holy', fx: 'note',
          name: 'Grand Maestro',
          mod: 'bard_maestro_key',
          stats: { cdr: 18, dmgPct: 22, reduce: 8 },
          desc: () => `<b>Keystone:</b> +18% Cooldown Reduction, +22% Damage, and +8% Damage Reduction. Song buffs grant an additional +15% Attack, Cast, and Move Speed.`,
        },
        {
          key: 'symphonic_host', row: 3, choice: 'B', maxRank: 1, el: 'arcane', fx: 'clone',
          name: 'Immortal Orchestra',
          mod: 'bard_orchestra_key',
          stats: { summonPct: 50, castSpeed: 15, critChance: 6 },
          desc: () => `<b>Keystone:</b> +50% Clone Power, +15% Cast Speed, and +6% Crit Chance. Plucked Note and Crescendo fire from your active Chorus clones as well.`,
        },
      ],
    },
    // Branch 1: Sonic Arts
    {
      name: 'Sonic Arts',
      el: 'phys',
      nodes: [
        {
          key: 'acoustic_force', row: 0, choice: null, maxRank: 5, el: 'phys', fx: 'sonic',
          name: 'Acoustic Force',
          stats: { physPct: 7, castSpeed: 4, critChance: 2 },
          desc: (r) => `+${r * 7}% Physical & Sonic Damage, +${r * 4}% Cast Speed, and +${r * 2}% Critical Chance.`,
        },
        {
          key: 'reverb_shockwave', row: 1, choice: 'A', maxRank: 3, el: 'phys', fx: 'sonic',
          name: 'Reverb Shockwave',
          mod: 'bard_sonic_echo',
          stats: { pierce: 1, areaPct: 10 },
          skillMult: { tree: 1, pct: 22 },
          desc: (r) => `<b>Augment (Chords & Bass):</b> Sound Wave, Power Chord, Echo, and Bass Drop launch +${r} additional sonic wave${r > 1 ? 's' : ''}, gain +${r} Pierce, and deal +${r * 22}% damage.`,
        },
        {
          key: 'overdriven_amp', row: 1, choice: 'B', maxRank: 3, el: 'light', fx: 'drum',
          name: 'Overdriven Amp',
          mod: 'bard_sonic_amp',
          stats: { summonPct: 22, critDmg: 15 },
          skillMult: { tree: 1, pct: 18 },
          desc: (r) => `<b>Augment (Drums & Amps):</b> Thunder Drum and Amplifier gain +${r * 50}% Life & Damage, pull enemies inward on every beat, and shock targets.`,
        },
        {
          key: 'thundering_crescendo', row: 2, choice: null, maxRank: 5, el: 'light', fx: 'sonic',
          name: 'Thundering Crescendo',
          stats: { critDmg: 12, lightPct: 6, physPct: 5 },
          desc: (r) => `+${r * 12}% Critical Damage, +${r * 6}% Lightning Damage, and +${r * 5}% Physical Damage.`,
        },
        {
          key: 'wall_of_sound_key', row: 3, choice: 'A', maxRank: 1, el: 'phys', fx: 'sonic',
          name: 'Shattering Fortissimo',
          mod: 'bard_fortissimo_key',
          stats: { critDmg: 45, physPct: 25, areaPct: 20 },
          desc: () => `<b>Keystone:</b> +45% Critical Damage, +25% Physical Damage, and +20% Area. Sonic Arts skills detonate in a concussive blast on hit.`,
        },
        {
          key: 'electric_virtuoso', row: 3, choice: 'B', maxRank: 1, el: 'light', fx: 'lightning',
          name: 'Electric Virtuoso',
          mod: 'bard_electric_key',
          stats: { castSpeed: 18, lightPct: 30, lifeSteal: 5 },
          desc: () => `<b>Keystone:</b> +18% Cast Speed, +30% Lightning Damage, and +5% Life Steal. Notes chain lightning between up to 3 enemies.`,
        },
      ],
    },
    // Branch 2: Trickery
    {
      name: 'Trickery',
      el: 'arcane',
      nodes: [
        {
          key: 'rogues_rhythm', row: 0, choice: null, maxRank: 5, el: 'phys', fx: 'wind',
          name: "Rogue's Rhythm",
          stats: { critChance: 3, moveSpeed: 3, dex: 4 },
          desc: (r) => `+${r * 3}% Critical Chance, +${r * 3}% Move Speed, and +${r * 4} Dexterity.`,
        },
        {
          key: 'loaded_deck', row: 1, choice: 'A', maxRank: 3, el: 'fire', fx: 'firework',
          name: 'Pyrotechnic Flourish',
          mod: 'bard_trick_volley',
          stats: { critDmg: 15, firePct: 10 },
          skillMult: { tree: 2, kind: 'proj', pct: 22 },
          desc: (r) => `<b>Augment (Note Volley & Fireworks):</b> Sharp Note, Fan of Notes, Juggler's Toss, and Deadly Sonata fire +${r + 1} extra notes and explode in fireworks on hit.`,
        },
        {
          key: 'phantom_encore', row: 1, choice: 'B', maxRank: 3, el: 'shadow', fx: 'smoke',
          name: 'Phantom Encore',
          mod: 'bard_trick_clone',
          stats: { block: 4, summonPct: 20, lifeSteal: 3 },
          desc: (r) => `<b>Augment (Illusions & Dash):</b> Misdirection, Mirror Images, Grand Illusion, and Swashbuckle spawn an extra Illusion clone and grant +${r * 4}% Block/Dodge & +${r * 3}% Life Steal.`,
        },
        {
          key: 'lucky_cadence', row: 2, choice: null, maxRank: 5, el: 'arcane', fx: 'star',
          name: 'Daring Tempo',
          stats: { cdr: 4, atkSpeed: 4, critDmg: 10 },
          desc: (r) => `+${r * 4}% Cooldown Reduction, +${r * 4}% Attack & Cast Speed, and +${r * 10}% Critical Damage.`,
        },
        {
          key: 'showstopper_key', row: 3, choice: 'A', maxRank: 1, el: 'fire', fx: 'firework',
          name: 'Grand Showstopper',
          mod: 'bard_showstopper_key',
          stats: { critChance: 8, critDmg: 40, dmgPct: 20 },
          desc: () => `<b>Keystone:</b> +8% Critical Chance, +40% Critical Damage, and +20% All Damage. Every 4th Trickery cast unleashes a ring of 8 explosive notes.`,
        },
        {
          key: 'shadow_harlequin', row: 3, choice: 'B', maxRank: 1, el: 'shadow', fx: 'clone',
          name: 'Shadow Harlequin',
          mod: 'bard_harlequin_key',
          stats: { reduce: 10, moveSpeed: 15, lifeSteal: 6 },
          desc: () => `<b>Keystone:</b> +10% Damage Reduction, +15% Move Speed, and +6% Life Steal. Bladestorm Waltz and Swashbuckle leave behind a trail of exploding notes.`,
        },
      ],
    },
  ],

  lancer: [
    // Branch 0: Energy Lance
    {
      name: 'Energy Lance',
      el: 'light',
      nodes: [
        {
          key: 'spear_mastery', row: 0, choice: null, maxRank: 5, el: 'light', fx: 'thrust',
          name: 'Astral Spear',
          stats: { dmgPct: 7, atkSpeed: 4, critChance: 2 },
          desc: (r) => `+${r * 7}% All Lance Damage, +${r * 4}% Attack Speed, and +${r * 2}% Critical Chance.`,
        },
        {
          key: 'volt_piercer', row: 1, choice: 'A', maxRank: 3, el: 'light', fx: 'laser',
          name: 'Tempest Impaler',
          mod: 'lnc_lance_bolt',
          stats: { critDmg: 16, lightPct: 10 },
          skillMult: { tree: 0, pct: 22 },
          desc: (r) => `<b>Augment (Thrusts & Beams):</b> Lance Thrust, Thunder Lance, Storm Lance, and Sunspear fire ${r} piercing lightning bolt${r > 1 ? 's' : ''} down the lance line and deal +${r * 22}% damage.`,
        },
        {
          key: 'juggernaut_charge', row: 1, choice: 'B', maxRank: 3, el: 'fire', fx: 'charge',
          name: 'Comet Breaker',
          mod: 'lnc_charge_quake',
          stats: { areaPct: 12, lifeSteal: 3 },
          skillMult: { tree: 0, kind: 'dash', pct: 30 },
          desc: (r) => `<b>Augment (Lance Charges):</b> Lance Charge, Inferno Charge, Comet Charge, and Omni-Charge trigger a massive elemental explosion on impact, deal +${r * 30}% damage, and leech +${r * 3}% Life.`,
        },
        {
          key: 'elemental_reach', row: 2, choice: null, maxRank: 5, el: 'arcane', fx: 'spear',
          name: 'Prismatic Reach',
          stats: { critDmg: 10, firePct: 6, coldPct: 6 },
          desc: (r) => `+${r * 10}% Critical Damage and +${r * 6}% Fire & Cold Damage.`,
        },
        {
          key: 'spear_of_destiny', row: 3, choice: 'A', maxRank: 1, el: 'light', fx: 'laser',
          name: 'Spear of Destiny',
          mod: 'lnc_destiny_key',
          stats: { dmgPct: 25, critChance: 8, atkSpeed: 15 },
          desc: () => `<b>Keystone:</b> +25% Damage, +8% Critical Chance, and +15% Attack Speed. Energy Lance attacks have +25% longer reach and always chain lightning on crit.`,
        },
        {
          key: 'unstoppable_momentum', row: 3, choice: 'B', maxRank: 1, el: 'fire', fx: 'charge',
          name: 'Starfall Vanguard',
          mod: 'lnc_vanguard_key',
          stats: { cdr: 18, reduce: 8, critDmg: 35 },
          desc: () => `<b>Keystone:</b> +18% Cooldown Reduction, +8% Damage Reduction, and +35% Critical Damage. Dashing or Leaping grants a barrier and leaves a burning trail.`,
        },
      ],
    },
    // Branch 1: Bulwark
    {
      name: 'Bulwark',
      el: 'phys',
      nodes: [
        {
          key: 'tower_training', row: 0, choice: null, maxRank: 5, el: 'phys', fx: 'tshield',
          name: 'Tower Guard',
          stats: { armorPct: 9, block: 2, lifePct: 4 },
          desc: (r) => `+${r * 9}% Armor, +${r * 2}% Block Chance, and +${r * 4}% Maximum Life.`,
        },
        {
          key: 'orbiting_phalanx', row: 1, choice: 'A', maxRank: 3, el: 'light', fx: 'tshield',
          name: 'Orbiting Phalanx',
          mod: 'lnc_shield_orbit',
          stats: { areaPct: 10, dmgPct: 8 },
          skillMult: { tree: 1, kind: 'orbit', pct: 25 },
          desc: (r) => `<b>Augment (Tower Shields):</b> Tower Shield, Storm Bulwark, Burning Aegis, and Frost Rampart summon +${r} extra orbiting shield${r > 1 ? 's' : ''} and deal +${r * 25}% damage.`,
        },
        {
          key: 'immovable_bastion', row: 1, choice: 'B', maxRank: 3, el: 'phys', fx: 'shield',
          name: 'Immovable Bastion',
          mod: 'lnc_shield_fort',
          stats: { block: 4, reduce: 3, thorns: 25 },
          desc: (r) => `<b>Augment (Shield Stances & Slams):</b> Shield Wall, Brace, Unbreakable, and Bulwark Slam grant +${r * 4}% Block, +${r * 3}% Damage Reduction, and erupt with a shockwave when cast.`,
        },
        {
          key: 'fortress_plate', row: 2, choice: null, maxRank: 5, el: 'phys', fx: 'shield',
          name: 'Fortress Plate',
          stats: { resAll: 5, lifeRegen: 8, vit: 5 },
          desc: (r) => `+${r * 5}% All Resistances, +${r * 8} Life Regeneration, and +${r * 5} Vitality.`,
        },
        {
          key: 'aegis_hurricane', row: 3, choice: 'A', maxRank: 1, el: 'holy', fx: 'tshield',
          name: 'Bastion of Eternity',
          mod: 'lnc_bastion_key',
          stats: { dmgPct: 22, cdr: 15, armorPct: 25 },
          desc: () => `<b>Keystone:</b> +22% Damage, +15% Cooldown Reduction, and +25% Armor. Orbiting Tower Shields last 50% longer and knock enemies back.`,
        },
        {
          key: 'iron_juggernaut', row: 3, choice: 'B', maxRank: 1, el: 'phys', fx: 'shield',
          name: 'Living Citadel',
          mod: 'lnc_citadel_key',
          stats: { block: 12, reduce: 10, lifePct: 20 },
          desc: () => `<b>Keystone:</b> +12% Block Chance, +10% Damage Reduction, and +20% Maximum Life. Your Shield Slams deal bonus damage based on your Armor.`,
        },
      ],
    },
    // Branch 2: Knight Order
    {
      name: 'Knight Order',
      el: 'holy',
      nodes: [
        {
          key: 'chivalric_code', row: 0, choice: null, maxRank: 5, el: 'holy', fx: 'knight',
          name: 'Chivalric Order',
          stats: { summonPct: 12, lifePct: 4, str: 4 },
          desc: (r) => `+${r * 12}% Knight & Banner Power, +${r * 4}% Maximum Life, and +${r * 4} Strength.`,
        },
        {
          key: 'royal_vanguard', row: 1, choice: 'A', maxRank: 3, el: 'holy', fx: 'knight',
          name: 'Royal Vanguard',
          mod: 'lnc_knight_fort',
          stats: { summonPct: 24, armorPct: 8 },
          desc: (r) => `<b>Augment (Knight Retinue):</b> Squire, Lance, Flame, Frost, and Round Table Knights gain +${r * 65}% Maximum Life, ${r * 14}% Damage Reduction, and cleave on hit.`,
        },
        {
          key: 'consecrated_standard', row: 1, choice: 'B', maxRank: 3, el: 'holy', fx: 'banner',
          name: 'Consecrated Standard',
          mod: 'lnc_banner_aura',
          stats: { dmgPct: 8, cdr: 4, lifeRegen: 12 },
          skillMult: { tree: 2, pct: 20 },
          desc: (r) => `<b>Augment (Banners & Rally):</b> War Banner, Battle Standard, and Banner of Kings pulse a holy nova on placement, heal allies, and grant +${r * 8}% Hero Damage.`,
        },
        {
          key: 'high_command', row: 2, choice: null, maxRank: 5, el: 'holy', fx: 'aura',
          name: 'High Command',
          stats: { summonPct: 10, atkSpeed: 3, resAll: 4 },
          desc: (r) => `+${r * 10}% Knight Power, +${r * 3}% Attack Speed, and +${r * 4}% All Resistances.`,
        },
        {
          key: 'lord_commander', row: 3, choice: 'A', maxRank: 1, el: 'holy', fx: 'knight',
          name: 'Grand Commander',
          mod: 'lnc_commander_key',
          stats: { summonPct: 55, allStats: 12, reduce: 8 },
          desc: () => `<b>Keystone:</b> +55% Knight Power, +12 All Attributes, and +8% Damage Reduction. Maximum active Knights in the field increased from 4 to 6.`,
        },
        {
          key: 'king_of_lances', row: 3, choice: 'B', maxRank: 1, el: 'holy', fx: 'banner',
          name: 'Sovereign Standard',
          mod: 'lnc_standard_key',
          stats: { dmgPct: 25, critDmg: 35, lifeSteal: 5 },
          desc: () => `<b>Keystone:</b> +25% Damage, +35% Critical Damage, and +5% Life Steal. Valiant Leap and Glorious Charge automatically plant a War Banner where you land.`,
        },
      ],
    },
  ],

  gunner: [
    // Branch 0: Firearms
    {
      name: 'Firearms',
      el: 'phys',
      nodes: [
        {
          key: 'marksman_trigger', row: 0, choice: null, maxRank: 5, el: 'phys', fx: 'bullet',
          name: 'Hair Trigger',
          stats: { physPct: 6, atkSpeed: 4, critChance: 2.5 },
          desc: (r) => `+${r * 6}% Physical Damage, +${r * 4}% Attack Speed, and +${(r * 2.5).toFixed(1)}% Critical Chance.`,
        },
        {
          key: 'full_metal_barrage', row: 1, choice: 'A', maxRank: 3, el: 'phys', fx: 'bullet',
          name: 'Full Metal Salvo',
          mod: 'gun_bullet_salvo',
          stats: { pierce: 1, atkSpeed: 4 },
          skillMult: { tree: 0, kind: 'proj', pct: 18 },
          desc: (r) => `<b>Augment (Firearm Salvos):</b> Pistol Shot, Buckshot, Double Tap, and Gatling Barrage fire +${r} additional round${r > 1 ? 's' : ''}, gain +${r} Pierce, and deal +${r * 18}% damage.`,
        },
        {
          key: 'high_caliber_rounds', row: 1, choice: 'B', maxRank: 3, el: 'fire', fx: 'laser',
          name: 'High-Caliber Rounds',
          mod: 'gun_bullet_crit',
          stats: { critDmg: 18, bossDmg: 10 },
          skillMult: { tree: 0, pct: 22 },
          desc: (r) => `<b>Augment (Sniper & Railgun):</b> Sniper Shot, Armor Piercer, Rail Gun, and Hand Cannon deal +${r * 22}% damage, +${r * 18}% Critical Damage, and trigger an explosive impact.`,
        },
        {
          key: 'gunpowder_tempest', row: 2, choice: null, maxRank: 5, el: 'phys', fx: 'bullet',
          name: 'Rifled Barrels',
          stats: { critDmg: 12, dex: 4, moveSpeed: 3 },
          desc: (r) => `+${r * 12}% Critical Damage, +${r * 4} Dexterity, and +${r * 3}% Move Speed.`,
        },
        {
          key: 'desperado', row: 3, choice: 'A', maxRank: 1, el: 'phys', fx: 'bullet',
          name: 'Gunslinger Virtuoso',
          mod: 'gun_desperado_key',
          stats: { atkSpeed: 20, critChance: 8, lifeSteal: 5 },
          desc: () => `<b>Keystone:</b> +20% Attack Speed, +8% Critical Chance, and +5% Life Steal. Firearm skills ricochet to 1 additional nearby enemy.`,
        },
        {
          key: 'anti_materiel', row: 3, choice: 'B', maxRank: 1, el: 'light', fx: 'laser',
          name: 'Orbital Marksman',
          mod: 'gun_orbital_key',
          stats: { critDmg: 50, dmgPct: 20, pierce: 2 },
          desc: () => `<b>Keystone:</b> +50% Critical Damage, +20% Damage, and +2 Pierce. Critical Firearm hits call down a searing laser beam on the target.`,
        },
      ],
    },
    // Branch 1: Explosives
    {
      name: 'Explosives',
      el: 'fire',
      nodes: [
        {
          key: 'demolitionist', row: 0, choice: null, maxRank: 5, el: 'fire', fx: 'bomb',
          name: 'Demolitionist',
          stats: { firePct: 8, areaPct: 5, cdr: 2 },
          desc: (r) => `+${r * 8}% Fire Damage, +${r * 5}% Explosion Area, and +${r * 2}% Cooldown Reduction.`,
        },
        {
          key: 'thermobaric_payload', row: 1, choice: 'A', maxRank: 3, el: 'fire', fx: 'explosion',
          name: 'Thermobaric Payload',
          mod: 'gun_bomb_napalm',
          stats: { areaPct: 12, firePct: 10 },
          skillMult: { tree: 1, pct: 22 },
          desc: (r) => `<b>Augment (Napalm & Nukes):</b> Grenade, Frag Grenade, Rocket, and Nitro Charge leave a burning napalm pool for 4s, have +${r * 12}% blast radius, and deal +${r * 22}% damage.`,
        },
        {
          key: 'mirv_warheads', row: 1, choice: 'B', maxRank: 3, el: 'fire', fx: 'rocket',
          name: 'MIRV Warheads',
          mod: 'gun_bomb_cluster',
          stats: { cdr: 4, critDmg: 15 },
          skillMult: { tree: 1, kind: 'proj', pct: 20 },
          desc: (r) => `<b>Augment (Cluster & Rockets):</b> Cluster Bomb, Firebomb Barrage, Rocket, and Rocket Barrage launch +${r} extra ordinance and split into mini-bombs on impact.`,
        },
        {
          key: 'shockwave_ordnance', row: 2, choice: null, maxRank: 5, el: 'fire', fx: 'mine',
          name: 'Concussive Ordnance',
          stats: { critChance: 2.5, firePct: 6, physPct: 6 },
          desc: (r) => `+${(r * 2.5).toFixed(1)}% Critical Chance and +${r * 6}% Fire & Physical Damage.`,
        },
        {
          key: 'hellfire_command', row: 3, choice: 'A', maxRank: 1, el: 'fire', fx: 'nuke',
          name: 'Scorched Earth',
          mod: 'gun_scorched_key',
          stats: { firePct: 35, areaPct: 25, bossDmg: 20 },
          desc: () => `<b>Keystone:</b> +35% Fire Damage, +25% Explosion Radius, and +20% Boss Damage. Explosives sunder enemy Fire & Physical Resistance by 25%.`,
        },
        {
          key: 'mad_bomber', row: 3, choice: 'B', maxRank: 1, el: 'fire', fx: 'bomb',
          name: 'Artillery Barrage',
          mod: 'gun_artillery_key',
          stats: { cdr: 18, atkSpeed: 12, lifePct: 15 },
          desc: () => `<b>Keystone:</b> +18% Cooldown Reduction, +12% Attack Speed, and +15% Maximum Life. Landmines and Cluster Traps deploy 2 extra mines per cast.`,
        },
      ],
    },
    // Branch 2: Engineering
    {
      name: 'Engineering',
      el: 'light',
      nodes: [
        {
          key: 'machinist', row: 0, choice: null, maxRank: 5, el: 'light', fx: 'turret',
          name: 'Master Machinist',
          stats: { summonPct: 12, armorPct: 6, lightPct: 6 },
          desc: (r) => `+${r * 12}% Turret & Drone Power, +${r * 6}% Hero Armor, and +${r * 6}% Lightning Damage.`,
        },
        {
          key: 'fortified_automata', row: 1, choice: 'A', maxRank: 3, el: 'phys', fx: 'turret',
          name: 'Fortified Automata',
          mod: 'gun_turret_fort',
          stats: { summonPct: 24, reduce: 3 },
          desc: (r) => `<b>Augment (Armored Turrets & Mechs):</b> Gun Turrets, Flame Turrets, Rocket Turrets, Drones, and Death Machine gain +${r * 65}% Life, ${r * 14}% Damage Reduction, and +${r * 15}% Attack Speed.`,
        },
        {
          key: 'overclocked_grid', row: 1, choice: 'B', maxRank: 3, el: 'light', fx: 'tesla',
          name: 'Overclocked Grid',
          mod: 'gun_turret_tesla',
          stats: { cdr: 5, lightPct: 12 },
          skillMult: { tree: 2, pct: 20 },
          desc: (r) => `<b>Augment (Tesla & Shield Grid):</b> Deploying any Turret, Drone, or Tesla Coil releases an arc lightning nova and grants you +${r * 5}% Cooldown Reduction and +${r * 12}% Lightning Damage.`,
        },
        {
          key: 'titanium_plating', row: 2, choice: null, maxRank: 5, el: 'phys', fx: 'shield',
          name: 'Titanium Plating',
          stats: { resAll: 4, lifePct: 4, summonPct: 8 },
          desc: (r) => `+${r * 4}% All Resistances, +${r * 4}% Maximum Life, and +${r * 8}% Turret & Drone Power.`,
        },
        {
          key: 'prime_architect', row: 3, choice: 'A', maxRank: 1, el: 'fire', fx: 'mech',
          name: 'Ironclad Architect',
          mod: 'gun_architect_key',
          stats: { summonPct: 55, armorPct: 30, reduce: 8 },
          desc: () => `<b>Keystone:</b> +55% Turret & Mech Power, +30% Armor, and +8% Damage Reduction. Maximum active Turrets & Drones increased by +1.`,
        },
        {
          key: 'hyper_overdrive', row: 3, choice: 'B', maxRank: 1, el: 'light', fx: 'laser',
          name: 'Hyper Overdrive',
          mod: 'gun_overdrive_key',
          stats: { cdr: 18, atkSpeed: 15, lightPct: 25 },
          desc: () => `<b>Keystone:</b> +18% Cooldown Reduction, +15% Attack Speed, and +25% Lightning Damage. Turrets and Drones fire chain lightning rounds.`,
        },
      ],
    },
  ],

  monk: [
    // Branch 0: Martial Arts
    {
      name: 'Martial Arts',
      el: 'phys',
      nodes: [
        {
          key: 'iron_body', row: 0, choice: null, maxRank: 5, el: 'phys', fx: 'smash',
          name: 'Iron Body',
          stats: { physPct: 7, armor: 15, lifeMax: 16 },
          desc: (r) => `+${r * 7}% Physical Damage, +${r * 15} Armor, and +${r * 16} Maximum Life.`,
        },
        {
          key: 'thousand_fists', row: 1, choice: 'A', maxRank: 3, el: 'phys', fx: 'smash',
          name: 'Thousand Fists',
          mod: 'monk_punch_flurry',
          stats: { atkSpeed: 5, physPct: 8 },
          skillMult: { tree: 0, kind: 'melee', pct: 24 },
          desc: (r) => `<b>Augment (Hand Strikes):</b> Fist of Fury, Hundred Fists, Iron Palm, and Thousand Lotus Flurry strike with +${r * 5}% Attack Speed and deal +${r * 24}% damage.`,
        },
        {
          key: 'flying_crane', row: 1, choice: 'B', maxRank: 3, el: 'phys', fx: 'charge',
          name: 'Flying Crane',
          mod: 'monk_kick_burst',
          stats: { areaPct: 10, moveSpeed: 4 },
          skillMult: { tree: 0, kind: 'dash', pct: 30 },
          desc: (r) => `<b>Augment (Kicks & Dashes):</b> Flying Kick, Vaulting Leap, Spinning Crane Kick, and Wind Walker deal +${r * 30}% damage with +${r * 10}% Area of Effect and +${r * 4}% Move Speed.`,
        },
        {
          key: 'zen_focus', row: 2, choice: null, maxRank: 5, el: 'phys', fx: 'smash',
          name: 'Zen Focus',
          stats: { critChance: 3, atkSpeed: 4, dex: 4 },
          desc: (r) => `+${r * 3}% Critical Chance, +${r * 4}% Attack Speed, and +${r * 4} Dexterity.`,
        },
        {
          key: 'asura_wrath', row: 3, choice: 'A', maxRank: 1, el: 'phys', fx: 'smash',
          name: 'Asura Incarnate',
          mod: 'monk_asura_key',
          stats: { atkSpeed: 25, critChance: 8, lifeSteal: 5 },
          desc: () => `<b>Keystone:</b> +25% Attack Speed, +8% Critical Chance, and +5% Life Steal. Melee strikes unleash shockwaves that tear through lines of foes.`,
        },
        {
          key: 'crane_momentum', row: 3, choice: 'B', maxRank: 1, el: 'phys', fx: 'wind',
          name: 'Flowing Wind',
          mod: 'monk_momentum_key',
          stats: { moveSpeed: 20, reduce: 10, dmgPct: 20 },
          desc: () => `<b>Keystone:</b> +20% Move Speed, +10% Damage Reduction, and +20% All Damage. Dashing and leaping creates cyclones that pull enemies inward.`,
        },
      ],
    },
    // Branch 1: Spirit & Mantras
    {
      name: 'Spirit & Mantras',
      el: 'holy',
      nodes: [
        {
          key: 'inner_light', row: 0, choice: null, maxRank: 5, el: 'holy', fx: 'light',
          name: 'Inner Radiance',
          stats: { holyPct: 7, castSpeed: 4, manaMax: 14 },
          desc: (r) => `+${r * 7}% Holy Damage, +${r * 4}% Cast Speed, and +${r * 14} Maximum Mana.`,
        },
        {
          key: 'temple_bell', row: 1, choice: 'A', maxRank: 3, el: 'holy', fx: 'shock',
          name: 'Resonant Temple Bells',
          mod: 'monk_bell_resonate',
          stats: { areaPct: 12, holyPct: 8 },
          skillMult: { tree: 1, kind: 'aoe', pct: 25 },
          desc: (r) => `<b>Augment (Bells & Shockwaves):</b> Radiant Bell, Sanctified Bell, and Pillar of Nirvana deal +${r * 25}% damage with +${r * 12}% Area of Effect, stunning foes for 1.5 seconds.`,
        },
        {
          key: 'ascetic_shield', row: 1, choice: 'B', maxRank: 3, el: 'holy', fx: 'shield',
          name: 'Ascetic Bastion',
          mod: 'monk_mantra_shield',
          stats: { armorPct: 8, resAll: 4 },
          desc: (r) => `<b>Augment (Mantras & Wards):</b> Activating any Mantra grants +${r * 8}% Armor, +${r * 4}% All Resistances, and reflects +${r * 20}% damage back to attackers.`,
        },
        {
          key: 'serene_mind', row: 2, choice: null, maxRank: 5, el: 'holy', fx: 'light',
          name: 'Serene Mind',
          stats: { cdr: 4, holyPct: 6, int: 4 },
          desc: (r) => `+${r * 4}% Cooldown Reduction, +${r * 6}% Holy Damage, and +${r * 4} Intellect.`,
        },
        {
          key: 'nirvana_resonance', row: 3, choice: 'A', maxRank: 1, el: 'holy', fx: 'holy',
          name: 'Echoing Divinity',
          mod: 'monk_divinity_key',
          stats: { holyPct: 35, cdr: 12, areaPct: 20 },
          desc: () => `<b>Keystone:</b> +35% Holy Damage, +12% Cooldown Reduction, and +20% Area of Effect. Bell strikes trigger an immediate secondary holy tremor.`,
        },
        {
          key: 'transcendent_soul', row: 3, choice: 'B', maxRank: 1, el: 'holy', fx: 'aura',
          name: 'Transcendent Soul',
          mod: 'monk_transcendent_key',
          stats: { reduce: 12, lifeRegen: 8, dmgPct: 20 },
          desc: () => `<b>Keystone:</b> +12% Damage Reduction, +8 Life Regen, and +20% All Damage. Being hit below 40% Life unleashes a full cleansing burst of healing light.`,
        },
      ],
    },
    // Branch 2: Dragon & Tiger
    {
      name: 'Dragon & Tiger',
      el: 'fire',
      nodes: [
        {
          key: 'dragon_ferocity', row: 0, choice: null, maxRank: 5, el: 'fire', fx: 'fireball',
          name: 'Draconic Ferocity',
          stats: { firePct: 8, critDmg: 10 },
          desc: (r) => `+${r * 8}% Fire Damage and +${r * 10}% Critical Damage.`,
        },
        {
          key: 'blazing_claws', row: 1, choice: 'A', maxRank: 3, el: 'fire', fx: 'flame',
          name: 'Blazing Claws',
          mod: 'monk_fire_palm',
          stats: { firePct: 12, critChance: 3 },
          skillMult: { tree: 2, pct: 22 },
          desc: (r) => `<b>Augment (Dragon Techniques):</b> Dragon Strike, Blazing Palm, Twin Dragons, and Inferno Palm deal +${r * 22}% damage and ignite foes for severe burning over 4 seconds.`,
        },
        {
          key: 'tiger_pounce_leap', row: 1, choice: 'B', maxRank: 3, el: 'fire', fx: 'charge',
          name: 'Apex Pounce',
          mod: 'monk_tiger_pounce',
          stats: { areaPct: 14, lifeSteal: 3 },
          skillMult: { tree: 2, kind: 'leap', pct: 28 },
          desc: (r) => `<b>Augment (Tiger Techniques):</b> Tiger Pounce, Tiger Roar, and Tiger Pounce Storm deal +${r * 28}% damage, knock enemies down, and leech +${r * 3}% Life.`,
        },
        {
          key: 'primal_vigor', row: 2, choice: null, maxRank: 5, el: 'fire', fx: 'flame',
          name: 'Primal Vigor',
          stats: { dmgPct: 6, vit: 4, lifeSteal: 2 },
          desc: (r) => `+${r * 6}% All Damage, +${r * 4} Vitality, and +${r * 2}% Life Steal.`,
        },
        {
          key: 'avatar_of_the_dragon', row: 3, choice: 'A', maxRank: 1, el: 'fire', fx: 'fireball',
          name: 'Avatar of the Dragon',
          mod: 'monk_dragon_key',
          stats: { firePct: 40, critDmg: 50, dmgPct: 15 },
          desc: () => `<b>Keystone:</b> +40% Fire Damage, +50% Critical Damage, and +15% All Damage. Fire skills have a chance to summon spiralling flaming wyrms.`,
        },
        {
          key: 'white_tiger_strike', row: 3, choice: 'B', maxRank: 1, el: 'phys', fx: 'smash',
          name: 'Wrath of the White Tiger',
          mod: 'monk_tiger_key',
          stats: { critChance: 12, atkSpeed: 20, bossDmg: 25 },
          desc: () => `<b>Keystone:</b> +12% Critical Chance, +20% Attack Speed, and +25% Damage to Champions and Bosses. Critical hits strike twice.`,
        },
      ],
    },
  ],
};

// Build indexed lookup tables
export const TALENTS = {};       // id -> node
export const CLASS_TALENTS = {}; // classId -> [ branch0, branch1, branch2 ]

for (const [cls, branches] of Object.entries(RAW_TALENTS)) {
  CLASS_TALENTS[cls] = branches.map((b, bIdx) => {
    const nodes = b.nodes.map((n) => {
      const id = `${cls}.${bIdx}.${n.key}`;
      const node = {
        ...n,
        id,
        classId: cls,
        branch: bIdx,
        reqLevel: TALENT_ROW_LEVELS[n.row] || 1,
      };
      TALENTS[id] = node;
      return node;
    });
    return {
      index: bIdx,
      name: b.name,
      el: b.el,
      nodes,
    };
  });
}

// Fallback for any disabled class so legacy saves never crash
for (const cls of Object.keys(CLASSES)) {
  if (!CLASS_TALENTS[cls]) CLASS_TALENTS[cls] = CLASS_TALENTS.paladin;
}

/** Return the hero's talent map { [nodeId]: rank }. */
export function getTalents(c) {
  if (!c) return {};
  if (!c.talents) c.talents = {};
  return c.talents;
}

/** Total talent points spent by hero c. */
export function talentPointsSpent(c) {
  const t = getTalents(c);
  let sum = 0;
  for (const v of Object.values(t)) sum += Number(v) || 0;
  return sum;
}

/** Find the sibling choice node ('A' <-> 'B') on the same branch & row, if any. */
export function getSiblingChoice(node) {
  if (!node || !node.choice) return null;
  const branches = CLASS_TALENTS[node.classId];
  const b = branches && branches[node.branch];
  if (!b) return null;
  return b.nodes.find((n) => n.row === node.row && n.choice && n.choice !== node.choice) || null;
}

/** Check if a choice node is locked because points were invested in its mutually exclusive sibling. */
export function isTalentLockedByChoice(c, node) {
  const sib = getSiblingChoice(node);
  if (!sib) return false;
  const t = getTalents(c);
  return (t[sib.id] || 0) > 0;
}

/** Check prerequisite satisfaction for a talent node. */
export function isTalentPrereqMet(c, node) {
  if (!c || !node) return false;
  const branches = CLASS_TALENTS[node.classId];
  const b = branches && branches[node.branch];
  if (!b) return false;
  const t = getTalents(c);
  if (node.row === 0) return true;
  if (node.row === 1) {
    // Requires 3 ranks in Row 0 of the same branch
    const r0 = b.nodes.find((n) => n.row === 0);
    return r0 ? (t[r0.id] || 0) >= 3 : true;
  }
  if (node.row === 2) {
    // Requires at least 1 rank in either Row 1 Choice A or Row 1 Choice B
    const r1 = b.nodes.filter((n) => n.row === 1);
    return r1.some((n) => (t[n.id] || 0) >= 1);
  }
  if (node.row === 3) {
    // Requires 3 ranks in Row 2 of the same branch
    const r2 = b.nodes.find((n) => n.row === 2);
    return r2 ? (t[r2.id] || 0) >= 3 : true;
  }
  return true;
}

/** Return true if hero c can currently invest a point into `node`. */
export function canLearnTalent(c, node) {
  if (!c || !node) return false;
  if ((c.talentPoints || 0) <= 0) return false;
  if ((c.level || 1) < node.reqLevel) return false;
  const cur = getTalents(c)[node.id] || 0;
  if (cur >= node.maxRank) return false;
  if (isTalentLockedByChoice(c, node)) return false;
  if (!isTalentPrereqMet(c, node)) return false;
  return true;
}

/** Spend 1 talentPoint to learn 1 rank of `nodeId`. Returns true if learned. */
export function learnTalent(c, nodeId) {
  const node = TALENTS[nodeId];
  if (!canLearnTalent(c, node)) return false;
  const t = getTalents(c);
  t[node.id] = (t[node.id] || 0) + 1;
  c.talentPoints = Math.max(0, (c.talentPoints || 0) - 1);
  return true;
}

/** Refund all spent talent points back into `c.talentPoints`. */
export function respecTalents(c) {
  if (!c) return 0;
  const spent = talentPointsSpent(c);
  if (spent <= 0) return 0;
  c.talents = {};
  c.talentPoints = (c.talentPoints || 0) + spent;
  return spent;
}

/**
 * Aggregate all active talent bonuses for hero `c`:
 * - `stats`: flat/percentage stat map to apply in `Player.recompute()`
 * - `mods`: `{ [modKey]: rank }` for active skill augments
 * - `skillMults`: array of `{ tree, kind, pct }` for `Player.skillDamage()`
 */
export function computeTalentBonuses(c) {
  const stats = {};
  const mods = {};
  const skillMults = [];
  if (!c || !c.talents) return { stats, mods, skillMults };
  for (const [id, rank] of Object.entries(c.talents)) {
    const r = Number(rank) || 0;
    if (r <= 0) continue;
    const node = TALENTS[id];
    if (!node) continue;
    if (node.stats) {
      for (const [k, v] of Object.entries(node.stats)) {
        stats[k] = (stats[k] || 0) + v * r;
      }
    }
    if (node.mod) {
      mods[node.mod] = r;
    }
    if (node.skillMult) {
      skillMults.push({
        tree: node.skillMult.tree,
        kind: node.skillMult.kind || null,
        pct: node.skillMult.pct * r,
      });
    }
  }
  return { stats, mods, skillMults };
}
