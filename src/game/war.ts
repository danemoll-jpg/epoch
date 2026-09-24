// Who is at war with whom. Symmetric table in state. New games start with nobody at war:
// civs meet at peace and war is declared on purpose (Milestone 5, see diplomacy.ts).

import type { GameState } from './types';

/** A war table for `n` players with everyone at war (the Milestone 4 rule; tests use it). */
export function allAtWar(n: number): boolean[][] {
  return Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => a !== b));
}

/** A war table for `n` players with nobody at war. */
export function noWars(n: number): boolean[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => false));
}

export function atWar(state: GameState, a: number, b: number): boolean {
  return a !== b && state.atWar[a]?.[b] === true;
}
