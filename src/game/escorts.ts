// Round 23 (item 5): fighter escorts and air cover.
//
// Escort groups: in a city or aboard a Carrier, a bomber (`escortable`) can take up to
// AIR.maxEscorts fighters along ("Add escort", undone by "Split"). An escort keeps its own unit
// but points at its bomber (`Unit.escortOf`); it stands where the bomber is, rebases and strikes
// with it, and takes no orders of its own. The group flies as far as its shortest range. An
// interceptor going after the group must beat every escort in turn before it reaches the bomber
// (combat.ts, `interception`); escorts it beats are shot down. When the bomber is lost, its
// escorts are simply released (naval.ts `removeUnit`).
//
// Air cover: a tile within one of your fighters' range is under your air cover, and your units
// there defend against air strikes, Helicopters and Drones with the best such fighter's
// `airCoverPct` (the odds show it as "Air cover"). Fighters escorting a bomber cover too.

import { AIR } from '../data/rules';
import { UNITS } from '../data/units';
import { distance } from './grid';
import { isAir } from './naval';
import type { ActionResult, Coord, GameState, Unit } from './types';

/** A fighter: a based aircraft that can fight other aircraft (it intercepts, escorts, and covers). */
export function isFighter(u: Unit): boolean {
  return isAir(u) && (UNITS[u.type].airAttack ?? 0) > 0;
}

/** The fighters escorting this bomber, oldest first. */
export function escortsOf(state: GameState, bomber: Unit): Unit[] {
  return state.units.filter((u) => u.escortOf === bomber.id).sort((a, b) => a.id - b.id);
}

/** The bomber this unit escorts, if it's an escort. */
export function escortedBomber(state: GameState, u: Unit): Unit | undefined {
  return u.escortOf === undefined ? undefined : state.units.find((b) => b.id === u.escortOf);
}

/** "Escorting the Bomber: Split the group first", or undefined for a unit that's free to act. */
export function escortingError(state: GameState, u: Unit): string | undefined {
  const b = escortedBomber(state, u);
  return b ? `It’s escorting the ${UNITS[b.type].name}: select the ${UNITS[b.type].name} and Split first` : undefined;
}

/** How far the group flies: the shortest range among the bomber and its escorts. */
export function groupRange(state: GameState, u: Unit): number {
  const own = isAir(u) ? (UNITS[u.type].range ?? 0) : 0;
  return escortsOf(state, u).reduce((r, e) => Math.min(r, UNITS[e.type].range ?? 0), own);
}

/** The fighters on this bomber's base that could join it as escorts now, the one Add escort takes first. */
export function escortCandidates(state: GameState, bomber: Unit): Unit[] {
  if (!UNITS[bomber.type].escortable) return [];
  return state.units
    .filter(
      (u) =>
        u.owner === bomber.owner && u.x === bomber.x && u.y === bomber.y && u.carriedBy === bomber.carriedBy &&
        isFighter(u) && u.escortOf === undefined && u.movesLeft > 0,
    )
    // The best first, but a fighter told to stay on guard ("Stay") only once the others are taken.
    .sort(
      (a, b) =>
        Number(a.fortified) - Number(b.fortified) ||
        (UNITS[b.type].airAttack ?? 0) - (UNITS[a.type].airAttack ?? 0) || Number(b.veteran) - Number(a.veteran) || a.id - b.id,
    );
}

/** Why `escort` can't join `bomber` now, or undefined if it can. */
export function addEscortError(state: GameState, bomber: Unit, escort?: Unit): string | undefined {
  if (state.currentPlayer !== bomber.owner) return 'Not your turn';
  if (!UNITS[bomber.type].escortable) return 'Only Bombers and Stealth Bombers take escorts';
  if (escortsOf(state, bomber).length >= AIR.maxEscorts) return `A bomber takes at most ${AIR.maxEscorts} escorts`;
  if (!escort) return escortCandidates(state, bomber).length ? undefined : 'No fighter here with its turn left to escort it';
  if (escort.owner !== bomber.owner || !isFighter(escort)) return 'Only your Fighters and Jet Fighters escort';
  if (escort.x !== bomber.x || escort.y !== bomber.y || escort.carriedBy !== bomber.carriedBy) return 'The fighter must be based with the bomber';
  if (escort.escortOf !== undefined) return 'That fighter is already escorting';
  if (escort.movesLeft <= 0) return 'That fighter has already flown this turn';
  return undefined;
}

/** Adds a fighter (the best one there, unless `escortId` is given) to the bomber's escort. */
export function addEscort(state: GameState, bomberId: number, escortId?: number): ActionResult {
  const bomber = state.units.find((u) => u.id === bomberId);
  if (!bomber) return { ok: false, reason: 'No such unit' };
  const escort = escortId === undefined ? escortCandidates(state, bomber)[0] : state.units.find((u) => u.id === escortId);
  const err = addEscortError(state, bomber, escort);
  if (err) return { ok: false, reason: err };
  escort!.escortOf = bomber.id;
  escort!.fortified = false;
  escort!.exploring = false;
  return { ok: true, message: `${UNITS[escort!.type].name} escorts the ${UNITS[bomber.type].name}` };
}

/** Why the group can't be split, or undefined. */
export function splitEscortsError(state: GameState, bomber: Unit): string | undefined {
  if (state.currentPlayer !== bomber.owner) return 'Not your turn';
  if (!escortsOf(state, bomber).length) return 'It has no escorts';
  return undefined;
}

/** Releases every escort: each is its own unit again, with whatever turn it has left. */
export function splitEscorts(state: GameState, bomberId: number): ActionResult {
  const bomber = state.units.find((u) => u.id === bomberId);
  if (!bomber) return { ok: false, reason: 'No such unit' };
  const err = splitEscortsError(state, bomber);
  if (err) return { ok: false, reason: err };
  for (const e of escortsOf(state, bomber)) delete e.escortOf;
  return { ok: true };
}

/** Moves the escorts with their bomber (after it rebased or struck), and spends their turn. */
export function followBomber(state: GameState, bomber: Unit): void {
  for (const e of escortsOf(state, bomber)) {
    e.x = bomber.x;
    e.y = bomber.y;
    e.carriedBy = bomber.carriedBy;
    e.movesLeft = 0;
    e.fortified = false;
  }
}

/**
 * Player `p`'s air cover over `at`: the best `airCoverPct` among p's fighters whose range
 * reaches it (0 if none), and that fighter.
 */
export function airCover(state: GameState, p: number, at: Coord): { pct: number; fighter?: Unit } {
  let best: { pct: number; fighter?: Unit } = { pct: 0 };
  for (const f of state.units) {
    if (f.owner !== p || !isFighter(f)) continue;
    const pct = UNITS[f.type].airCoverPct ?? 0;
    if (pct <= best.pct || distance(f, at) > (UNITS[f.type].range ?? 0)) continue;
    best = { pct, fighter: f };
  }
  return best;
}
