/** Class-specific mana liquid tint. These are separate from CLASSES.color, which is
 * used by portraits, class accents and other interface artwork. */
export const MANA_POOL_COLORS = Object.freeze({
  paladin: '#FFD860',
  ranger: '#228B22',
  wizard: '#4169E1',
  necromancer: '#A070FF',
  barbarian: '#B87333',
  dragoon: '#0088CC',
  totem_master: '#40E0D0',
  death_knight: '#A5E8FF',
  arcane_sorcerer: '#302B80', // Astronomer; retained class id is used by saves.
  carrion_witch: '#9BAE32',
  bard: '#FF6A9D',
  slime_lord: '#7FFF00',
  boomerang_knight: '#00A86B',
  lancer: '#C0C0D0',
  dragon_knight: '#FF4500',
  gunner: '#708090',
  monk: '#FFE4B5',
  rogue: '#800020',
  ninja: '#49275E',
});

export const manaPoolColor = (classId) => MANA_POOL_COLORS[classId] || MANA_POOL_COLORS.wizard;
