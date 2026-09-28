// Round 21 (item 4): drag to move. Pure (reads state, changes nothing) so the gesture's rules
// can be unit-tested without a DOM; input.ts tells a unit drag from a pan, app.ts draws and acts.
//
// The rules:
// - A press on the selected unit's own tile (yours, with moves left) grabs it: dragging then
//   moves the unit instead of the map. A press anywhere else pans the map, as always; a press
//   that never moves past the drag threshold is still a tap.
// - While dragging, the tile under the finger shows what a release would do: the path and
//   "N turns" for a move (Round 17's preview), the target alone for an attack or a capture.
// - Releasing does what a tap on that tile would (move, board, attack with the odds panel,
//   capture, an aircraft's strike or rebase), except that a drag onto your own city or your own
//   units from afar moves there (the path it showed) instead of opening the city or selecting.
//   "Tap twice to move" doesn't apply: the drag is its own confirmation.
// - Releasing on the unit's own tile, off the map, over a panel, or on a tile where a tap
//   wouldn't do anything for the unit cancels. A second finger cancels too (it becomes a pinch).
// - Near an edge of the visible map the view scrolls, faster the closer to the edge.

import { findPath, findUnit, pathTurns } from '../game/movement';
import { isAir } from '../game/naval';
import type { Coord, GameState } from '../game/types';
import type { ScreenRect } from '../render/camera';
import { unitDisc } from '../render/unitDisc';
import { resolveTap, type TapResult } from './tap';

/**
 * Round 23 follow-up: how far (in tiles) outside the unit's drawn disc a press still grabs it.
 * In a city the disc sits small in the tile's lower-left corner, right on the tile's edge (and the
 * city's name label covers the top of the tile below), so a finger on it often lands just past the
 * edge; that used to pan the map instead.
 */
export const GRAB_SLOP = 0.2;

/**
 * Does a press at map point (wx, wy) (in tiles; fractions allowed) grab the selected unit for a
 * drag? Anywhere on its tile, or on its drawn disc give or take GRAB_SLOP.
 */
export function dragGrabsUnit(state: GameState, viewer: number, selectedUnitId: number | undefined, wx: number, wy: number): boolean {
  if (selectedUnitId === undefined || state.currentPlayer !== viewer) return false;
  const u = findUnit(state, selectedUnitId);
  if (!u || u.owner !== viewer || u.movesLeft <= 0) return false;
  if (Math.floor(wx) === u.x && Math.floor(wy) === u.y) return true;
  const inCity = state.cities.some((c) => c.x === u.x && c.y === u.y) || state.villages.some((v) => v.x === u.x && v.y === u.y);
  const d = unitDisc(inCity);
  return Math.hypot(wx - (u.x + d.cx), wy - (u.y + d.cy)) <= d.r + GRAB_SLOP;
}

/** What releasing the dragged unit on (tx, ty) does: a tap's result, or undefined to cancel. */
export function dropResult(state: GameState, viewer: number, unitId: number, tx: number, ty: number): TapResult | undefined {
  const u = findUnit(state, unitId);
  if (!u || tx < 0 || ty < 0 || tx >= state.map.width || ty >= state.map.height) return undefined;
  if (u.x === tx && u.y === ty) return undefined;
  const r = resolveTap(state, viewer, unitId, tx, ty);
  switch (r.kind) {
    case 'move':
    case 'attack':
    case 'capture':
    case 'recon':
      return r.unitId === unitId ? r : undefined;
    case 'openCity':
    case 'select':
      // From afar, onto your own city or units: the drag meant "go there".
      return r.moveUnitId === unitId ? { kind: 'move', unitId } : undefined;
    default:
      return undefined;
  }
}

/** The preview while dragging over (tx, ty): the path to draw and its turns, or undefined (nothing there, or no way). */
export function dragPreview(state: GameState, viewer: number, unitId: number, tx: number, ty: number): { path: Coord[]; turns: number } | undefined {
  const r = dropResult(state, viewer, unitId, tx, ty);
  const u = findUnit(state, unitId);
  if (!r || !u) return undefined;
  const goal = [{ x: tx, y: ty }];
  if (r.kind !== 'move' || isAir(u)) return { path: goal, turns: 1 };
  const path = findPath(state, u, { x: tx, y: ty });
  // No way there: nothing to show (letting go says why, as a tap would).
  return path ? { path, turns: pathTurns(state, u, path) } : undefined;
}

/** Is the screen point inside the rectangle? */
export function inRect(r: ScreenRect, x: number, y: number): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/**
 * How far (CSS px) to scroll the view this frame while a unit is dragged to (x, y): nothing
 * away from the edges; up to `max` px toward whichever edges of `safe` (the visible map) the
 * finger is within `margin` of, or past. Positive dx scrolls the view right (east).
 */
export function edgeScroll(x: number, y: number, safe: ScreenRect, margin: number, max: number): { dx: number; dy: number } {
  const push = (d: number) => (d >= margin ? 0 : Math.min(1, (margin - d) / margin) * max);
  const dx = push(safe.right - x) - push(x - safe.left);
  const dy = push(safe.bottom - y) - push(y - safe.top);
  return { dx: Math.round(dx * 100) / 100, dy: Math.round(dy * 100) / 100 };
}

/** The edge band and top speed for `edgeScroll` (CSS px, px per frame). */
export const DRAG_EDGE = { margin: 48, maxSpeed: 12 };
