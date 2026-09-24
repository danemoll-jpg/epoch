// What a tap on a map tile means. Pure (reads state, changes nothing) so the rule can be
// unit-tested without a DOM.
//
// The rule, in order:
// 1. A unit is selected and has moves, and you tap a different tile:
//    - an adjacent tile with enemy units → attack (the UI shows the odds first and only
//      attacks on confirm; a unit that can't attack gets told why);
//    - if it's your own city and the unit can't get there at all → open the city;
//    - otherwise → move the unit there (even onto a tile holding your own units or city, or
//      into an adjacent enemy city with nobody in it, which captures it).
// 2. You tap the selected unit's own tile, or nothing movable is selected:
//    - your own city → open the city (its panel lists the units inside to pick from);
//    - your own units → select one; tapping the same stack again cycles through it;
//    - anything else → inspect the tile (show its terrain and yields) and deselect.

import { distance } from '../game/grid';
import { findPath, findUnit } from '../game/movement';
import type { GameState } from '../game/types';

export type TapResult =
  | { kind: 'move'; unitId: number }
  | { kind: 'attack'; unitId: number }
  | { kind: 'openCity'; cityId: number }
  | { kind: 'select'; unitId: number }
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

  if (sel && sel.owner === viewer && sel.movesLeft > 0 && !onSelectedTile) {
    const enemyThere = state.units.some((u) => u.x === tx && u.y === ty && u.owner !== viewer);
    if (enemyThere && distance(sel, { x: tx, y: ty }) === 1) return { kind: 'attack', unitId: sel.id };
    if (myCity && !findPath(state, sel, { x: tx, y: ty })) return { kind: 'openCity', cityId: myCity.id };
    return { kind: 'move', unitId: sel.id };
  }

  if (myCity) return { kind: 'openCity', cityId: myCity.id };

  const mine = state.units.filter((u) => u.owner === viewer && u.x === tx && u.y === ty);
  if (mine.length > 0) {
    const i = mine.findIndex((u) => u.id === selectedUnitId);
    return { kind: 'select', unitId: mine[(i + 1) % mine.length]!.id };
  }
  return { kind: 'inspect' };
}
