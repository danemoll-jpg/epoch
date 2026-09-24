// Who is at war with whom. Until diplomacy arrives (Milestone 5) every civ is at war with
// every other civ; the table lives in state so peace can be added later without a new shape.

import type { GameState } from './types';

/** The starting war table for `n` players: everyone at war with everyone else. */
export function allAtWar(n: number): boolean[][] {
  return Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => a !== b));
}

export function atWar(state: GameState, a: number, b: number): boolean {
  return a !== b && state.atWar[a]?.[b] === true;
}
