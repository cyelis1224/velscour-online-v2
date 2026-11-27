import { ACTS } from '../data/depth.js';

export const ACT_TOWN_NAMES = Object.freeze({
  1: 'Herrington Hollow',
  2: 'Sunscorch Oasis',
  3: 'Bellmourn',
  4: "Tessariel's Keep",
});

/** Act II opens only after Depth 25 has actually been cleared. */
export function act2Unlocked(character) {
  return Number(character?.deepest || 0) >= 25 || !!character?.cleared?.[25] || !!character?.visitedAct2Town;
}

/** A fresh character is sent to Act II exactly once, on its first Depth 25 clear. */
export function shouldAutoTravelToAct2(character, depth, firstClear) {
  return Number(depth) === 25 && !!firstClear && !character?.act2AutoTravelDone && !act2Unlocked(character);
}

/** Act III (Bellmourn, City State Phobos & Castle Velscour) opens after Depth 50 or once Bellmourn is unlocked. */
export function act3Unlocked(character) {
  return Number(character?.deepest || 0) >= 50 || !!character?.cleared?.[50] || !!character?.phobos?.bell;
}

/** Mark Bellmourn unlocked once when clearing Depth 50 for the first time. */
export function shouldAutoTravelToAct3(character, depth, firstClear) {
  return Number(depth) === 50 && !!firstClear && !character?.act3AutoTravelDone && !act3Unlocked(character);
}

/** Act IV opens after the Act III finale at Depth 75; old endgame saves are already unlocked. */
export function act4Unlocked(character) {
  return Number(character?.deepest || 0) >= 75 || !!character?.cleared?.[75] || !!character?.visitedAct4Town;
}

/** Send a newly progressing character to the Keep once, immediately after their first Depth 75 clear. */
export function shouldAutoTravelToAct4(character, depth, firstClear) {
  return Number(depth) === 75 && !!firstClear && !character?.act4AutoTravelDone && !act4Unlocked(character);
}

export function actSelectionRows(character) {
  return ACTS.map((act) => {
    const implemented = act.act >= 1 && act.act <= 4;
    const unlocked = implemented && (
      act.act === 1
      || (act.act === 2 && act2Unlocked(character))
      || (act.act === 3 && act3Unlocked(character))
      || (act.act === 4 && act4Unlocked(character))
    );
    return {
      ...act,
      town: ACT_TOWN_NAMES[act.act],
      implemented,
      unlocked,
      status: implemented ? (unlocked ? 'Available' : 'Locked') : 'Coming Soon',
      requirement: act.act === 2 ? 'Defeat Ossuarch and complete Depth 25 to unlock Act 2.'
        : act.act === 3 ? 'Complete the Act II finale at Depth 50 to unlock Bellmourn.'
          : act.act === 4 ? 'Complete the Act III finale at Depth 75 to unlock Tessariel’s Keep.' : '',
    };
  });
}
