/** Resolve the background music identity for a world without changing its ambience. */
export function locationMusicKind(world) {
  const biomeId = world?.biome?.id;
  if (world?.townId === 'act2_town' || biomeId === 'act2_town' || biomeId === 'sea_of_sand' || biomeId === 'scorpion_king_pyramid') {
    return 'sea_of_sand';
  }
  return world?.kind === 'town' ? 'town' : 'wilds';
}
