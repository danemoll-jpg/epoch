// What a tap on a map tile means. Pure (reads state, changes nothing) so the rule can be
// unit-tested without a DOM.
//
// The rule, in order:
// 1. A unit is selected and has moves, and you tap a different tile:
//    - an adjacent tile with enemy units → attack (the UI shows the odds first and only
//      attacks on confirm; a unit that can't attack gets told why); but an enemy city whose
//      only units are ships in port or aircraft (nobody defends it) → capture (Round 20);
//    - your own city (Round 17): a unit on a tile next to it moves in with one tap (that's
//      almost always meant); from farther away, or if it can't get there at all, the tap
//      opens the city instead, and when the unit can get there the panel offers
//      "Move <unit> here" (`moveUnitId`), so tapping a city to look at it never moves anyone;
//    - a tile holding your own units (Round 18): the same idea as your own city. Next to it,
//      one tap moves in (stacking up, or boarding a ship there); from farther away the tap
//      selects a unit there instead (as in 2), and when the selected unit could get there the
//      unit panel offers "Move <unit> here" / "Board the <ship>" (`moveUnitId`), so tapping
//      another of your units never sends the selected one across the map;
//    - otherwise → move the unit there (or into an adjacent enemy city with nobody in it,
//      which captures it).
//    An aircraft (Round 10) instead: a visible enemy in range → attack (a strike); a city or
//    Carrier of yours it could rebase to → move (a rebase, as before Round 17); anything
//    else → as in 2.
//
// "Tap twice to move" (Round 17, B2, a setting, off by default) sits on top of this: a 'move'
// first only shows the path (`pendingMove`), and a second tap on the same tile moves.
// 2. You tap the selected unit's own tile, or nothing movable is selected:
//    - your own city → open the city (its panel lists the units inside to pick from);
//    - your own units → select one (a ship before its cargo); tapping the same stack again
//      cycles through it;
//    - anything else → inspect the tile (show its terrain and yields) and deselect.

import { airRange, rebaseError, reconError } from '../game/air';
import { capturableCity } from '../game/conquest';
import { unitVisibleTo } from '../game/fog';
import { distance } from '../game/grid';
import { isAir, isAirType } from '../game/naval';
import { findPath, findUnit } from '../game/movement';
import type { GameState } from '../game/types';
import { UNITS } from '../data/units';

export type TapResult =
  | { kind: 'move'; unitId: number }
  | { kind: 'attack'; unitId: number }
  /** Round 20: an adjacent enemy city with no defenders but ships in port (or aircraft): walking in takes it. */
  | { kind: 'capture'; unitId: number; cityId: number }
  /** `moveUnitId`: the selected unit could go there; the city panel offers "Move … here". */
  | { kind: 'openCity'; cityId: number; moveUnitId?: number }
  /** `moveUnitId` (Round 18): the unit selected before could go there; the unit panel offers "Move … here". */
  | { kind: 'select'; unitId: number; moveUnitId?: number }
  /** Round 19: a Drone scouts the tile. */
  | { kind: 'recon'; unitId: number }
  | { kind: 'inspect' }
  | { kind: 'none' };

export function resolveTap(
  state: GameState,
  viewer: number,
  selectedUnitId: number | undefined,
  tx: number,
  ty: number,
): TapResult {
  if (tx < 0 || ty < 0 || tx >= state.map.width || ty >= state.map.height) return { kind: 'none' };
  const sel = selectedUnitId === undefined ? undefined : findUnit(state, selectedUnitId);
  const myCity = state.cities.find((c) => c.x === tx && c.y === ty && c.owner === viewer);
  const onSelectedTile = !!sel && sel.x === tx && sel.y === ty;

  // An aircraft (Round 10) strikes a tile in range with an enemy you can see, or rebases to a
  // city or Carrier in range; any other tap works as if nothing were selected.
  if (sel && sel.owner === viewer && sel.movesLeft > 0 && isAir(sel) && !onSelectedTile) {
    const at = { x: tx, y: ty };
    const enemy = state.units.some((u) => u.x === tx && u.y === ty && u.owner !== viewer && unitVisibleTo(state, viewer, u));
    if (enemy && distance(sel, at) <= airRange(sel)) return { kind: 'attack', unitId: sel.id };
    if (!rebaseError(state, sel, at)) return { kind: 'move', unitId: sel.id };
    // Round 19: a Drone scouts anywhere else in range.
    if (!reconError(state, sel, at)) return { kind: 'recon', unitId: sel.id };
  } else if (sel && sel.owner === viewer && sel.movesLeft > 0 && !onSelectedTile) {
    // Round 19: only units you can see (not a hidden spy); a Spy never attacks, it walks in.
    const enemyThere = state.units.some((u) => u.x === tx && u.y === ty && u.owner !== viewer && unitVisibleTo(state, viewer, u));
    if (enemyThere && distance(sel, { x: tx, y: ty }) === 1 && !UNITS[sel.type].spy) {
      // Round 20 (item 8): an enemy city held only by ships in port (or aircraft) has nobody
      // to fight: walking in captures it.
      const city = capturableCity(state, sel, { x: tx, y: ty });
      if (city) return { kind: 'capture', unitId: sel.id, cityId: city.id };
      return { kind: 'attack', unitId: sel.id };
    }
    if (myCity) {
      const path = findPath(state, sel, { x: tx, y: ty });
      if (path && distance(sel, myCity) === 1) return { kind: 'move', unitId: sel.id };
      return path ? { kind: 'openCity', cityId: myCity.id, moveUnitId: sel.id } : { kind: 'openCity', cityId: myCity.id };
    }
    const mine = myUnitsAt(state, viewer, tx, ty);
    if (mine.length > 0 && distance(sel, { x: tx, y: ty }) > 1) {
      const path = findPath(state, sel, { x: tx, y: ty });
      return path ? { kind: 'select', unitId: mine[0]!.id, moveUnitId: sel.id } : { kind: 'select', unitId: mine[0]!.id };
    }
    return { kind: 'move', unitId: sel.id };
  }

  if (myCity) return { kind: 'openCity', cityId: myCity.id };

  const mine = myUnitsAt(state, viewer, tx, ty);
  if (mine.length > 0) {
    const i = mine.findIndex((u) => u.id === selectedUnitId);
    return { kind: 'select', unitId: mine[(i + 1) % mine.length]!.id };
  }
  return { kind: 'inspect' };
}

/** Your units on a tile: ships and units on their own feet first, then aircraft, then cargo (Rounds 8 and 10). */
function myUnitsAt(state: GameState, viewer: number, tx: number, ty: number) {
  const rank = (u: { carriedBy: number | null; type: Parameters<typeof isAirType>[0] }) => (u.carriedBy !== null ? 2 : isAirType(u.type) ? 1 : 0);
  return state.units.filter((u) => u.owner === viewer && u.x === tx && u.y === ty).sort((a, b) => rank(a) - rank(b));
}

/** Round 17 (B2): a destination shown but not yet moved to ("Tap twice to move"). */
export interface PendingMove {
  unitId: number;
  x: number;
  y: number;
}

/**
 * With "Tap twice to move" on: does this 'move' tap go ahead (the second tap on the tile already
 * shown for the same unit), or only show the path? Without the setting every move goes ahead.
 */
export function confirmMove(tapTwice: boolean, pending: PendingMove | undefined, unitId: number, tx: number, ty: number): boolean {
  if (!tapTwice) return true;
  return !!pending && pending.unitId === unitId && pending.x === tx && pending.y === ty;
}
