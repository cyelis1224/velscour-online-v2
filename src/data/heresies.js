// Heresies (docs/ENDGAME.md): the difficulty modifiers chosen at the Altar of Heresy once Velscour has fallen. Each has
// a rank; the ranks on add up, and the rank raises the rewards of every level built with them (heresyMods). What each
// one does is wired in game/heresies.js.
export const HERESIES = [
  { id: 'twins', name: 'Twinned Packs', rank: 3, color: '#ff8040', desc: 'Every pack of monsters spawns twice its number.' },
  { id: 'crowned', name: 'Crowned Champions', rank: 2, color: '#4a8aff', desc: 'Champions carry two extra affixes, uniques one more.' },
  { id: 'thirst', name: 'Dry Throat', rank: 3, color: '#c04040', desc: 'No potions of any kind.' },
  { id: 'fifth', name: 'The Fifth Phase', rank: 2, color: '#ff6030', desc: 'BOSS ROOM bosses fight one phase longer and roll one more modifier.' },
  { id: 'legion', name: 'The Legion Follows', rank: 3, color: '#ff4010', desc: "Velscour's Legion of the Pit tears open a hellgate near you every so often, wherever you are." },
  { id: 'iron', name: 'Iron Hide', rank: 2, color: '#a0a0b0', desc: 'Monsters have 50% more life.' },
  { id: 'cruel', name: 'Cruel Hand', rank: 3, color: '#ff3050', desc: 'Monsters hit 30% harder.' },
  { id: 'ambush', name: 'Ambush Weather', rank: 1, color: '#c0a060', desc: 'Ambushes come three times as often.' },
  { id: 'omens', name: 'Affix Cascade', rank: 1, color: '#a060ff', desc: 'Every depth carries at least one random affix, and a Nemesis may return at any depth.' },
  { id: 'glass', name: 'Glass Cannon', rank: 2, color: '#ffd060', desc: 'You have 25% less life and deal 15% more damage.' },
  { id: 'hunger', name: 'Hunger of the Abyss', rank: 2, color: '#60c0a0', desc: 'No orbs of any kind drop, and your life does not regenerate.' },
  { id: 'gaze', name: "Velscour's Gaze", rank: 2, color: '#ff2000', desc: 'Monsters notice you from far away and never lose you.' },
  // The listed row ranks total 73. These two high-impact defenses gain one
  // rank each so the rank-75 cap and final milestone are actually reachable.
  { id: 'unholy_resilience', name: 'Unholy Resilience', rank: 4, color: '#8c70b0', desc: 'Monsters regenerate 1% of maximum life per second while not suppressed by damage.' },
  { id: 'relentless_assault', name: 'Relentless Assault', rank: 3, color: '#d85040', desc: 'Monsters attack 25% faster.' },
  { id: 'swift_pursuit', name: 'Swift Pursuit', rank: 2, color: '#e0a050', desc: 'Monsters move 30% faster.' },
  { id: 'arcane_tax', name: 'Arcane Tax', rank: 2, color: '#9c64d8', desc: 'Abilities cost 25% more mana and class resources.' },
  { id: 'shattered_armor', name: 'Shattered Armor', rank: 3, color: '#a0a8b0', desc: 'Your armor is reduced by 20%.' },
  { id: 'elemental_frailty', name: 'Elemental Frailty', rank: 3, color: '#60b8c0', desc: 'Your elemental and magical resistances are reduced by 15 percentage points.' },
  { id: 'mortal_wounds', name: 'Mortal Wounds', rank: 3, color: '#c06060', desc: 'Healing received is reduced by 40%.' },
  { id: 'death_echo', name: "Death's Echo", rank: 3, color: '#8870a0', desc: 'Some slain monsters return once with a portion of their life.' },
  { id: 'unstable_remains', name: 'Unstable Remains', rank: 2, color: '#d07840', desc: 'Some slain monsters erupt after a visible warning.' },
  { id: 'infernal_ground', name: 'Infernal Ground', rank: 3, color: '#dc5030', desc: 'Telegraphed infernal ground effects periodically threaten nearby ground.' },
  { id: 'champions_dominion', name: "Champion's Dominion", rank: 3, color: '#e0aa40', desc: 'Champion packs appear more often.' },
  { id: 'rare_convergence', name: 'Rare Convergence', rank: 3, color: '#c070d0', desc: 'Unique monster packs appear more often.' },
  { id: 'blood_frenzy', name: 'Blood Frenzy', rank: 2, color: '#c83040', desc: 'Wounded monsters deal 25% more damage below half life.' },
  { id: 'arcane_suppression', name: 'Arcane Suppression', rank: 2, color: '#7060b8', desc: 'Ability cooldowns are 20% longer.' },
  { id: 'hostile_terrain', name: 'Hostile Terrain', rank: 2, color: '#9c6848', desc: 'Environmental traps cycle 25% faster.' },
  { id: 'hollow_sanctuary', name: 'Hollow Sanctuary', rank: 2, color: '#8a8060', desc: 'Shrine blessing durations are reduced by 50%.' },
  { id: 'final_defiance', name: 'Final Defiance', rank: 3, color: '#e07040', desc: 'Bosses deal 25% more damage below 25% life.' },
  { id: 'infernal_fortification', name: 'Infernal Fortification', rank: 4, color: '#804050', desc: 'Monsters take 20% less damage.' },
];
export const HERESY_BY_ID = Object.fromEntries(HERESIES.map((h) => [h.id, h]));
export const HERESY_MAX_RANK = HERESIES.reduce((s, h) => s + h.rank, 0);
/** The rank of a set of Heresy ids. */
export const heresyRank = (ids) => (ids || []).reduce((s, id) => s + ((HERESY_BY_ID[id] && HERESY_BY_ID[id].rank) || 0), 0);
/** Reward curve retains the established per-rank values through 26 and continues at the same slope. */
export function heresyMods(rank) {
  rank = Math.min(HERESY_MAX_RANK, Math.max(0, rank | 0));
  // Linear extension avoids a reward cliff when the new ranks are enabled.
  return { mf: 4 * rank, gold: 1 + 0.04 * rank, loot: 1 + 0.02 * rank, xp: 1 + 0.02 * rank, sigil: 1 + 0.05 * rank, relic: 1 + 0.04 * rank };
}
/** The milestones a rank reaches. */
export const HERESY_MILESTONES = [
  { rank: 10, icon: '⚿', name: 'Abyssal Key eligibility', text: 'Abyssal Keys may drop from BOSS ROOM bosses past Depth 600 (three open Velscour Unbound).' },
  { rank: 20, icon: '✦', name: 'Infernal Mark', text: '+1 Infernal Mark per eligible endgame depth cleared.' },
  { rank: 30, icon: '♜', name: "Heresy's Bounty", text: '15% chance for a Heretical Treasure Chest after an eligible Boss Room boss.' },
  { rank: 40, icon: '⚔', name: 'The Heretical Hunt', text: '20% chance to encounter a named Heretical Champion in each eligible dungeon.' },
  { rank: 50, icon: '⌑', name: 'Forbidden Sanctums', text: '10% chance to reveal a voluntary, separate challenge portal.' },
  { rank: 60, icon: '♨', name: "Velscour's Retribution", text: '5% chance for one infernal miniboss invasion per eligible dungeon.' },
  { rank: HERESY_MAX_RANK, icon: '♛', name: 'The Throne of Damnation', text: 'Unlock the Throne challenge after the campaign and endgame are complete.' },
];
export const KEYS_RANK = 10, MARKS_RANK = 20;
