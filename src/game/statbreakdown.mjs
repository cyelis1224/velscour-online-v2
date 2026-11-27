import { AFFIXES, GEMS, LEGENDARY } from '../data/items.js';
import { CRIT_OVER } from '../data/statformulas.mjs';
import { POWERS } from '../data/relics.js';

const ATTRS = [
  ['str', 'Strength'], ['dex', 'Dexterity'], ['vit', 'Vitality'], ['int', 'Intelligence'],
];
const ELEMENTS = [['fire', 'Fire'], ['cold', 'Cold'], ['light', 'Lightning'], ['poison', 'Poison'], ['magic', 'Magic']];
const PCT = new Set(['dmgPct', 'atkSpeed', 'castSpeed', 'critChance', 'critDmg', 'lifePct', 'reduce', 'resFire', 'resCold', 'resLight', 'resPoison', 'resAll', 'manaSteal', 'lifeSteal', 'moveSpeed', 'goldFind', 'magicFind', 'block', 'physPct', 'firePct', 'coldPct', 'lightPct', 'poisonPct', 'arcanePct', 'holyPct', 'shadowPct', 'bloodPct', 'acidPct', 'armorPct', 'cdr', 'xpPct', 'bossDmg', 'manaRegenPct']);
const AFFIX_LABELS = new Map(AFFIXES.map((a) => [a.s, a.t.replace(/\{v\}/g, '').replace(/\s+/g, ' ').trim().replace(/^\+/, '').replace(/%$/, '').replace(/\s*$/, '')]));
export const EQUIPMENT_STAT_CATEGORIES = [
  { id: 'attributes', name: 'Primary Attributes', keys: ['str', 'dex', 'vit', 'int', 'allAttr'], metricKeys: ['str', 'dex', 'vit', 'int'] },
  { id: 'health', name: 'Health & Survivability', keys: ['life', 'lifePct'], metricKeys: ['maxHealth'] },
  { id: 'mana', name: 'Mana & Resource Management', keys: ['mana', 'manaRegen', 'manaRegenPct'], metricKeys: ['maxMana', 'manaRegen'] },
  { id: 'damage', name: 'Damage Bonuses', keys: ['dmgPct', 'flatDmg', 'physPct'], metricKeys: ['weaponBase', 'dmgPct', 'physPct'] },
  { id: 'elemental', name: 'Elemental Damage', keys: ['firePct', 'coldPct', 'lightPct', 'poisonPct', 'arcanePct', 'holyPct', 'shadowPct', 'bloodPct', 'acidPct'], metricKeys: ['firePct', 'coldPct', 'lightPct', 'poisonPct', 'arcanePct', 'holyPct', 'shadowPct', 'bloodPct', 'acidPct'] },
  { id: 'spell', name: 'Spell, Skill & Summon Bonuses', keys: ['skillsAll', 'skillTree0', 'skillTree1', 'skillTree2', 'skillTree3', 'summonPct', 'areaPct'], metricKeys: ['areaPct', 'summonPct', 'skillsAll', 'skillTree0', 'skillTree1', 'skillTree2', 'skillTree3'] },
  { id: 'critical', name: 'Critical Strike & Critical Damage', keys: ['critChance', 'critDmg'], metricKeys: ['critChance', 'critDmg'] },
  { id: 'speed', name: 'Attack & Casting Speed', keys: ['atkSpeed', 'castSpeed'], metricKeys: ['atkSpeed', 'castSpeed'] },
  { id: 'cooldown', name: 'Cooldown Reduction', keys: ['cdr'], metricKeys: ['cdr'] },
  { id: 'armor', name: 'Armor & Damage Reduction', keys: ['armor', 'baseArmor', 'armorPct', 'reduce'], metricKeys: ['armor', 'reduce'] },
  { id: 'resistances', name: 'Resistances', keys: ['resFire', 'resCold', 'resLight', 'resPoison', 'resAll'], metricKeys: ['resFire', 'resCold', 'resLightning', 'resPoison', 'resMagic'] },
  { id: 'block', name: 'Block, Dodge & Evasion', keys: ['block'], metricKeys: ['block'] },
  { id: 'mobility', name: 'Movement & Mobility', keys: ['moveSpeed'], metricKeys: ['moveSpeed'] },
  { id: 'recovery', name: 'Health & Mana Recovery', keys: ['lifeRegen'], metricKeys: ['lifeRegen'] },
  { id: 'onhit', name: 'Life Steal & On-Hit Effects', keys: ['lifeSteal', 'manaSteal', 'thorns'], metricKeys: ['lifeSteal', 'manaSteal', 'thorns'] },
  { id: 'loot', name: 'Loot & Magic Find', keys: ['goldFind', 'magicFind'], metricKeys: ['goldFind', 'magicFind', 'drops'] },
  { id: 'experience', name: 'Experience & Currency Bonuses', keys: ['xpPct'], metricKeys: ['xpPct'] },
  { id: 'conditional', name: 'Conditional & Special Bonuses', keys: ['bossDmg'], metricKeys: ['bossDmg'] },
  { id: 'projectiles', name: 'Projectile & Skill Behavior', keys: ['projSpeed', 'extraProj', 'pierce', 'chainPlus', 'splitChance', 'echoChance', 'homing', 'novaOnCast', 'orbitOnCast'], metricKeys: ['projSpeed', 'extraProj', 'pierce', 'chainPlus', 'splitChance', 'echoChance'] },
  { id: 'misc', name: 'Miscellaneous Bonuses', keys: [], metricKeys: [] },
];
const GROUPS = EQUIPMENT_STAT_CATEGORIES;
const EXTRA_LABELS = {
  allAttr: 'All Attributes', flatDmg: 'Flat Weapon Damage', life: 'Maximum Health', lifePct: 'Maximum Health %', mana: 'Maximum Mana',
  armor: 'Armor', baseArmor: 'Base Item Armor', armorPct: 'Armor %', manaRegen: 'Mana Regeneration', lifeRegen: 'Health Regeneration', manaRegenPct: 'Mana Regeneration %',
  extraProj: 'Extra Projectiles', pierce: 'Pierce', chainPlus: 'Chain / Bounce Count', splitChance: 'Projectile Split Chance',
  echoChance: 'Echo Chance', homing: 'Homing', novaOnCast: 'Nova on Cast', orbitOnCast: 'Orbit on Cast', summonPct: 'Summon Power',
  skillsAll: 'All Skill Ranks', skillTree0: 'Skill Tree 1 Ranks', skillTree1: 'Skill Tree 2 Ranks', skillTree2: 'Skill Tree 3 Ranks', skillTree3: 'Skill Tree 4 Ranks',
  resFire: 'Fire Resistance', resCold: 'Cold Resistance', resLight: 'Lightning Resistance', resPoison: 'Poison Resistance', resAll: 'All Resistances',
  magicFind: 'Magic Find', goldFind: 'Gold Find', xpPct: 'Experience Bonus', bossDmg: 'Boss Damage', critChance: 'Critical Chance', critDmg: 'Critical Damage',
  dmgPct: 'Damage Bonus', atkSpeed: 'Attack Speed', castSpeed: 'Cast Speed', moveSpeed: 'Movement Speed', cdr: 'Cooldown Reduction', reduce: 'Damage Reduction',
  block: 'Block Chance', lifeSteal: 'Life Steal', manaSteal: 'Mana Steal', splitChance: 'Projectile Split Chance', echoChance: 'Echo Chance', projSpeed: 'Projectile Speed',
  physPct: 'Physical Damage', firePct: 'Fire Damage', coldPct: 'Cold Damage', lightPct: 'Lightning Damage', poisonPct: 'Poison Damage', arcanePct: 'Arcane Damage', holyPct: 'Holy Damage', shadowPct: 'Shadow Damage', bloodPct: 'Blood Damage', acidPct: 'Acid Damage',
};

const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const round = (v, digits = 1) => Math.round((Number(v) || 0) * 10 ** digits) / 10 ** digits;

function sumBySlot(audit, keys, weights = {}) {
  let total = 0;
  for (const source of Object.values(audit?.bySlot || {})) {
    for (const key of keys) total += n(source.stats?.[key]) * (weights[key] ?? 1);
  }
  for (const source of audit?.specialSources || []) for (const [key, value] of source.stats || []) if (keys.includes(key)) total += n(value) * (weights[key] ?? 1);
  for (const key of keys) total += n(audit?.setStats?.[key]) * (weights[key] ?? 1);
  return total;
}

function capResult(raw, cap, effective, note = '') {
  const excess = cap == null ? 0 : Math.max(0, raw - cap);
  const capState = cap == null ? 'uncapped' : excess > 0.001 ? 'over' : effective >= cap - 0.001 ? 'at' : raw >= cap * 0.9 ? 'approaching' : 'below';
  return { cap, excess, capState, note, diminishing: 'None', effective };
}

/**
 * Builds the Character & Stats report from the same live `Player.st` and recompute audit
 * consumed by combat. It deliberately reports no diminishing-return stage: the player stat
 * formulas use linear additions, conversions and hard caps, not DR curves.
 */
export function buildEquipmentStatReport(player, character) {
  const st = player?.st || {}, audit = st.equipmentAudit || {}, eq = audit.stats || {};
  const formula = audit.formulaInputs || {};
  const rows = [];
  const add = (key, label, rawEquipment, combined, effective, cap = null, note = '', unit = '%') => {
    const raw = n(combined);
    rows.push({ key, label, rawEquipment: n(rawEquipment), combined: raw, effective: n(effective), ...capResult(raw, cap, n(effective), note), unit });
  };

  for (const [key, label] of ATTRS) add(key, label, sumBySlot(audit, [key, 'allAttr']), st[key], st[key], null, 'Character attributes and equipment bonuses are added directly.', '');
  add('maxHealth', 'Maximum Health', 0, player?.maxHp, player?.maxHp, null, 'Derived from level, Vitality, flat Life, Life %, Fortitude and permanent bonuses.', '');
  rows[rows.length - 1].rawEquipmentText = `+${round(n(eq.life))} Life; +${round(n(eq.lifePct))}% Life; +${round(sumBySlot(audit, ['vit', 'allAttr']) * 6)} Life from Vitality`;
  add('maxMana', 'Maximum Mana', sumBySlot(audit, ['mana']) + sumBySlot(audit, ['int', 'allAttr']) * 2, player?.maxMana, player?.maxMana, null, 'Derived from level, Intelligence, flat Mana and permanent bonuses.', '');
  rows[rows.length - 1].rawEquipmentText = `+${round(n(eq.mana))} Mana; +${round(sumBySlot(audit, ['int', 'allAttr']) * 2)} Mana from Intelligence`;
  add('armor', 'Armor', n(audit.armor) + n(eq.armor) + n(eq.str) + n(eq.allAttr), st.armor, st.armor, null, 'No fixed armor cap. Physical mitigation is armor / (armor + attacker-level divisor), so effective reduction depends on the attacker.', '');
  rows[rows.length - 1].diminishing = 'Level formula';
  add('lifeRegen', 'Health Regeneration', sumBySlot(audit, ['lifeRegen']), st.lifeRegen, st.lifeRegen, null, 'Includes natural/town regeneration, equipment, buffs and regeneration bonuses.', '/s');
  add('manaRegen', 'Mana Regeneration', sumBySlot(audit, ['manaRegen']), st.manaRegen, st.manaRegen, null, 'Includes level/Intelligence base, flat equipment regeneration and percentage sources.', '/s');
  rows[rows.length - 1].rawEquipmentText = `+${round(n(eq.manaRegen))}/s flat; +${round(n(eq.manaRegenPct))}%`;

  for (const [el, label] of ELEMENTS) {
    const field = el === 'light' ? 'light' : el;
    const gearKey = ({ fire: ['resFire', 'resAll'], cold: ['resCold', 'resAll'], light: ['resLight', 'resAll'], poison: ['resPoison', 'resAll'], magic: ['resAll'] })[el];
    const combined = n(st.res?.[field]);
    const effective = Math.max(-100, Math.min(75, combined));
    add(`res${label}`, `${label} Resistance`, sumBySlot(audit, gearKey), combined, effective, 75, 'Combat clamps resistance to −100% through 75% after all resistance sources. Excess above 75% does not reduce damage further.');
  }
  const critRaw = n(formula.critChance?.raw ?? st.rawCritChance ?? st.critChance);
  const critConverted = n(formula.critChance?.convertedOverflow ?? st.critOver);
  add('critChance', 'Critical Chance', sumBySlot(audit, ['critChance']) + sumBySlot(audit, ['dex', 'allAttr']) * 0.1, critRaw, st.critChance, 75, `Hard cap is applied after the chance formula. ${round(critConverted)} percentage points from non-Mark overflow convert to +${round(critConverted * CRIT_OVER)}% critical damage; remaining overflow (including chance-only Mark bonuses) is wasted.`);
  rows[rows.length - 1].overCapText = `${round(rows[rows.length - 1].excess)}% over cap: ${round(critConverted)}% converts to +${round(critConverted * CRIT_OVER)}% critical damage; ${round(Math.max(0, rows[rows.length - 1].excess - critConverted))}% is wasted`;
  rows[rows.length - 1].wasted = Math.max(0, rows[rows.length - 1].excess - critConverted);
  rows[rows.length - 1].diminishing = 'Overflow conversion';
  add('critDmg', 'Critical Damage', sumBySlot(audit, ['critDmg']), st.critDmg, st.critDmg, null, `Includes the 50% base, equipment, buffs, Marks, and converted chance overflow (+${round(critConverted * CRIT_OVER)}%).`);
  add('atkSpeed', 'Attack Speed', sumBySlot(audit, ['atkSpeed']) + sumBySlot(audit, ['dex', 'allAttr']) * 0.3, formula.atkSpeed ?? st.atkSpeed, st.atkSpeed, 150, 'Hard cap is 150%; qualifying dual-wield loadouts add 12 percentage points before the cap. No diminishing-return curve is applied.');
  add('castSpeed', 'Cast Speed', sumBySlot(audit, ['castSpeed']) + sumBySlot(audit, ['int', 'allAttr']) * 0.1, formula.castSpeed ?? st.castSpeed, st.castSpeed, 150, 'Hard cap is 150%; no diminishing-return curve is applied.');
  add('moveSpeed', 'Movement Speed', sumBySlot(audit, ['moveSpeed']), formula.moveSpeed ?? st.moveSpeed, st.moveSpeed, 80, 'Hard cap is 80%; no diminishing-return curve is applied.');
  add('block', 'Block Chance', sumBySlot(audit, ['block']), formula.block ?? st.block, Math.max(0, Math.min(60, n(st.block))), 60, 'Hard cap is 60% in the stat calculation and damage handler.');
  add('reduce', 'Damage Reduction', sumBySlot(audit, ['reduce']), formula.reduce ?? st.reduce, Math.max(0, Math.min(60, n(st.reduce))), 60, 'Combat clamps damage reduction to 0–60%; no diminishing-return curve is applied.');
  add('cdr', 'Cooldown Reduction', sumBySlot(audit, ['cdr']), formula.cdr ?? st.cdr, st.cdr, 60, 'Hard cap is 60%; cooldowns use the remaining fraction after this value.');
  const weaponItems = Object.values(audit.bySlot || {}).filter((source) => Array.isArray(source.weapon)).map((source) => source.weapon);
  if (weaponItems.length) {
    rows.push({ key: 'weaponBase', label: 'Weapon Base Damage', rawEquipment: 0, rawEquipmentText: weaponItems.map((dmg) => `${round(dmg[0])}–${round(dmg[1])}`).join(' + '), combined: round(((st.weapon?.[0] || 0) + (st.weapon?.[1] || 0)) / 2), effective: round(((st.weapon?.[0] || 0) + (st.weapon?.[1] || 0)) / 2), effectiveText: `${round(st.weapon?.[0])}–${round(st.weapon?.[1])}`, cap: null, excess: 0, note: 'Uses the equipped weapon range, upgrades, dual-wield rule and flat weapon damage. Skill damage then applies the existing class, attribute and skill formulas.', unit: '' });
  }

  const simple = [
    ['dmgPct', 'Damage Bonus', ['dmgPct'], st.dmgPct, `${round(st.dmgPct)}%`, 'No cap. Skill damage applies the game’s existing 35% weight to this bonus.'],
    ['physPct', 'Physical Damage', ['physPct'], st.physPct, `${round(n(st.physPct) * 0.25)}% effective contribution`, 'No cap. The damage formula applies its existing 25% weight.'],
    ...[['fire', 'Fire'], ['cold', 'Cold'], ['light', 'Lightning'], ['poison', 'Poison'], ['arcane', 'Arcane'], ['holy', 'Holy'], ['shadow', 'Shadow'], ['blood', 'Blood'], ['acid', 'Acid']].map(([e, name]) => [`${e}Pct`, `${name} Damage`, [`${e}Pct`], st.elemPct?.[e], `${round(n(st.elemPct?.[e]) * 0.25)}% effective contribution`, 'No cap. The damage formula applies its existing 25% weight.']),
    ['lifeSteal', 'Life Steal', ['lifeSteal'], st.lifeSteal, `${round(st.lifeSteal)}%`, 'No hard cap in the player stat calculation.'],
    ['manaSteal', 'Mana Steal', ['manaSteal'], st.manaSteal, `${round(st.manaSteal)}%`, 'No hard cap in the player stat calculation.'],
    ['goldFind', 'Gold Find', ['goldFind'], st.goldFind, `${round(st.goldFind)}%`, 'No hard cap in the player stat calculation.'],
    ['magicFind', 'Magic Find', ['magicFind'], st.magicFind, `${round(st.magicFind)}%`, 'No hard cap in the player stat calculation.'],
    ['xpPct', 'Experience Bonus', ['xpPct'], st.xpPct, `${round(st.xpPct)}%`, 'No hard cap in the player stat calculation.'],
    ['bossDmg', 'Boss Damage', ['bossDmg'], st.bossDmg, `${round(st.bossDmg)}%`, 'No hard cap in the player stat calculation.'],
    ['drops', 'Equipment Quantity (Infernal Marks)', [], st.drops, `${round(st.drops)}%`, 'Provided by Infernal Marks, not equipment.'],
    ['flatDmg', 'Flat Weapon Damage', ['flatDmg'], eq.flatDmg, `${round(eq.flatDmg)}`, 'Added to the equipped weapon range; no cap.'],
    ['thorns', 'Thorns', ['thorns'], st.thorns, `${round(st.thorns)}`, 'Includes equipment, buffs and the current level scaling.'],
    ['areaPct', 'Area of Effect', ['areaPct'], st.areaPct, `${round(st.areaPct)}%`, 'No hard cap in the player stat calculation.'],
    ['projSpeed', 'Projectile Speed', ['projSpeed'], st.projSpeed, `${round(st.projSpeed)}%`, 'No hard cap in the player stat calculation.'],
    ['extraProj', 'Extra Projectiles', ['extraProj'], st.extraProj, `${round(st.extraProj)}`, 'No hard cap in the player stat calculation.'],
    ['pierce', 'Pierce', ['pierce'], st.pierce, `${round(st.pierce)}`, 'No hard cap in the player stat calculation.'],
    ['chainPlus', 'Chain / Bounce Count', ['chainPlus'], st.chainPlus, `${round(st.chainPlus)}`, 'No hard cap in the player stat calculation.'],
    ['splitChance', 'Projectile Split Chance', ['splitChance'], st.splitChance, `${round(st.splitChance)}%`, 'No hard cap in the player stat calculation.'],
    ['echoChance', 'Echo Chance', ['echoChance'], st.echoChance, `${round(st.echoChance)}%`, 'No hard cap in the player stat calculation.'],
    ['skillsAll', 'All Skill Ranks', ['skillsAll'], st.skillsAll, `${round(st.skillsAll)}`, 'Actual skill ranks also respect their individual skill limits.'],
    ...[0, 1, 2, 3].map((i) => [`skillTree${i}`, `Skill Tree ${i + 1} Ranks`, [`skillTree${i}`], st[`skillTree${i}`], `${round(st[`skillTree${i}`])}`, 'Actual skill ranks also respect their individual skill limits.']),
  ];
  for (const [key, label, keys, combined, effective, note] of simple) {
    add(key, label, sumBySlot(audit, keys), combined, typeof effective === 'string' ? n(combined) : effective, null, note, '');
    const row = rows[rows.length - 1];
    row.effectiveText = effective;
    row.unit = '';
    if (key === 'dmgPct') row.diminishing = '0.35× skill formula';
    else if (key === 'physPct' || key.endsWith('Pct')) row.diminishing = '0.25× damage formula';
  }

  const buckets = GROUPS.map((group) => ({ ...group, keys: [...group.keys] }));
  const known = new Set(buckets.flatMap((group) => group.keys));
  const fallbackBucket = () => buckets.find((group) => group.id === 'misc');
  const powerStatKeys = (P) => [...(P?.stats || []).map(([key]) => key), ...(P?.legs || []).flatMap((flag) => (LEGENDARY[flag]?.stats || []).map(([key]) => key))];
  const allEquipmentKeys = [
    ...AFFIXES.map((a) => a.s),
    ...Object.values(GEMS).flatMap((gem) => (gem.stats || []).map(([key]) => key)),
    ...Object.values(LEGENDARY).flatMap((power) => (power.stats || []).map(([key]) => key)),
    ...Object.values(POWERS).flatMap(powerStatKeys),
    ...Object.keys(eq),
  ];
  for (const key of allEquipmentKeys) if (!known.has(key)) { fallbackBucket(key).keys.push(key); known.add(key); }
  const affixRows = buckets.map((group) => ({ ...group, rows: [...new Set(group.keys)].map((key) => {
    const raw = n(eq[key]);
    const sources = Object.entries(audit.bySlot || {}).flatMap(([slot, item]) => n(item.stats?.[key]) ? [{ slot, name: item.name, value: n(item.stats[key]) }] : []);
    for (const source of audit.specialSources || []) {
      const value = (source.stats || []).filter(([stat]) => stat === key).reduce((sum, line) => sum + n(line[1]), 0);
      if (value) sources.push({ slot: 'bonus', name: source.name, value });
    }
    const setSources = audit.setSources || [];
    for (const set of setSources) {
      const value = (set.stats || []).filter(([stat]) => stat === key).reduce((sum, line) => sum + n(line[1]), 0);
      if (value) sources.push({ slot: 'set', name: `${set.name} (${set.pieces} pieces)`, value });
    }
    if (!setSources.length && n(audit.setStats?.[key])) sources.push({ slot: 'set', name: 'Covenant set bonuses', value: n(audit.setStats[key]) });
    const def = AFFIXES.find((a) => a.s === key);
    return { key, label: EXTRA_LABELS[key] || (def ? AFFIX_LABELS.get(key) : key), raw, sources, combined: raw, unit: PCT.has(key) ? '%' : '' };
  }) }));
  const categoryByKey = new Map(affixRows.flatMap((group) => [...group.keys, ...(group.metricKeys || [])].map((key) => [key, group.id])));
  const metricGroups = affixRows.map((group) => ({
    id: group.id, name: group.name, metrics: rows.filter((row) => categoryByKey.get(row.key) === group.id), modifiers: group.rows,
  }));
  return { rows, metricGroups, affixRows, audit, attributes: character?.attrs || {} };
}
