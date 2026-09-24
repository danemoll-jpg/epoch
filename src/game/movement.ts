// Unit movement rules. Land units can't enter water or mountains and pay the terrain's move
// cost. A unit with full movement points may always make one move, even into terrain that
// costs more than it has (so a 1-move unit can still enter forest or hills). Tiles holding
// another player's units or city are blocked, with one exception: stepping into an adjacent
// enemy city with no units in it captures it (see conquest.ts). Fighting is a separate
// action (combat.ts). Moving clears a unit's fortified state.

import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { capturableCity, captureCity } from './conquest';
import { distance, inBounds, neighbors, tileAt } from './grid';
import { civName } from './conquest';
import { updateContacts } from './diplomacy';
import { updateExplored } from './fog';
import { atWar } from './war';
import type { ActionResult, Coord, GameState, Unit } from './types';

export function findUnit(state: GameState, unitId: number): Unit | undefined {
  return state.units.find((u) => u.id === unitId);
}

/** Can units of `owner` ever stand on this tile (ignoring move points)? */
export function isEnterable(state: GameState, owner: number, x: number, y: number): boolean {
  const tile = tileAt(state.map, x, y);
  if (!tile || !TERRAIN[tile.terrain].landPassable) return false;
  if (state.units.some((u) => u.x === x && u.y === y && u.owner !== owner)) return false;
  if (state.cities.some((c) => c.x === x && c.y === y && c.owner !== owner)) return false;
  return true;
}

export function moveCost(state: GameState, x: number, y: number): number {
  const tile = tileAt(state.map, x, y);
  return tile ? TERRAIN[tile.terrain].moveCost : Infinity;
}

/** Why a single-step move is illegal, or undefined if it's legal. */
export function stepError(state: GameState, unit: Unit, to: Coord): string | undefined {
  if (state.currentPlayer !== unit.owner) return 'Not your turn';
  if (!inBounds(state.map, to.x, to.y)) return 'Off the map';
  if (distance(unit, to) !== 1) return 'Not adjacent';
  if (unit.movesLeft <= 0) return 'No moves left';
  if (!isEnterable(state, unit.owner, to.x, to.y) && !capturableCity(state, unit, to)) {
    // Say why when it's a civ we're at peace with.
    const other =
      state.cities.find((c) => c.x === to.x && c.y === to.y && c.owner !== unit.owner)?.owner ??
      state.units.find((u) => u.x === to.x && u.y === to.y && u.owner !== unit.owner)?.owner;
    if (other !== undefined && !atWar(state, unit.owner, other)) return `You are at peace with ${civName(state, other)}`;
    return 'Tile is impassable';
  }
  const cost = moveCost(state, to.x, to.y);
  const full = UNITS[unit.type].moves;
  if (cost > unit.movesLeft && unit.movesLeft < full) return 'Not enough moves left';
  return undefined;
}

/** Moves a unit one tile. The same action is used by the player and the AI. */
export function moveUnit(state: GameState, unitId: number, to: Coord): ActionResult {
  const unit = findUnit(state, unitId);
  if (!unit) return { ok: false, reason: 'No such unit' };
  const err = stepError(state, unit, to);
  if (err) return { ok: false, reason: err };
  const cost = moveCost(state, to.x, to.y);
  const captured = capturableCity(state, unit, to);
  unit.x = to.x;
  unit.y = to.y;
  unit.movesLeft = Math.max(0, unit.movesLeft - cost);
  unit.fortified = false;
  updateExplored(state, unit.owner);
  updateContacts(state);
  if (captured) captureCity(state, captured, unit.owner);
  return { ok: true };
}

/**
 * Cheapest land path from the unit to `to` (excluding the start tile), or undefined.
 * The owner's knowledge limits the plan: unexplored tiles are assumed passable at cost 1,
 * so the path never leaks hidden terrain and the unit can head into the unknown.
 * moveUnitToward stops when the real terrain turns out to block it.
 */
export function findPath(state: GameState, unit: Unit, to: Coord): Coord[] | undefined {
  const { map } = state;
  if (!inBounds(map, to.x, to.y)) return undefined;
  const explored = state.players[unit.owner]?.explored;
  const known = (k: number) => !explored || explored[k] === 1;
  const key = (c: Coord) => c.y * map.width + c.x;
  if (known(key(to)) && !isEnterable(state, unit.owner, to.x, to.y)) return undefined;
  const start = key(unit);
  const goal = key(to);
  const cost = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const done = new Set<number>();
  // Maps are small, so a plain Dijkstra over an array frontier is plenty fast.
  const frontier: number[] = [start];
  while (frontier.length) {
    frontier.sort((a, b) => cost.get(a)! - cost.get(b)!);
    const cur = frontier.shift()!;
    if (done.has(cur)) continue;
    done.add(cur);
    if (cur === goal) break;
    const c = { x: cur % map.width, y: Math.floor(cur / map.width) };
    for (const n of neighbors(map, c)) {
      const k = key(n);
      if (done.has(k)) continue;
      const isKnown = known(k);
      if (isKnown && !isEnterable(state, unit.owner, n.x, n.y)) continue;
      const nc = cost.get(cur)! + (isKnown ? moveCost(state, n.x, n.y) : 1);
      if (nc < (cost.get(k) ?? Infinity)) {
        cost.set(k, nc);
        prev.set(k, cur);
        frontier.push(k);
      }
    }
  }
  if (goal === start || !prev.has(goal)) return undefined;
  const path: Coord[] = [];
  let k = goal;
  while (k !== start) {
    path.unshift({ x: k % map.width, y: Math.floor(k / map.width) });
    k = prev.get(k)!;
  }
  return path;
}

/**
 * Moves the unit along the cheapest path toward `to` for as long as its moves last this
 * turn. Succeeds if it moved at least one step.
 */
export function moveUnitToward(state: GameState, unitId: number, to: Coord): ActionResult {
  const unit = findUnit(state, unitId);
  if (!unit) return { ok: false, reason: 'No such unit' };
  if (state.currentPlayer !== unit.owner) return { ok: false, reason: 'Not your turn' };
  if (unit.movesLeft <= 0) return { ok: false, reason: 'No moves left' };
  // Capturing is always a single step into the city (paths never go through enemy cities).
  if (distance(unit, to) === 1 && capturableCity(state, unit, to)) return moveUnit(state, unitId, to);
  const path = findPath(state, unit, to);
  if (!path) return { ok: false, reason: "Can't reach that tile" };
  let moved = false;
  for (const step of path) {
    const res = moveUnit(state, unitId, step);
    if (!res.ok) return moved ? { ok: true } : res;
    moved = true;
  }
  return { ok: true };
}

/** Tiles the unit could reach this turn with its remaining moves (for the UI highlight). */
export function reachableThisTurn(state: GameState, unit: Unit): Coord[] {
  if (unit.movesLeft <= 0) return [];
  const { map } = state;
  const full = UNITS[unit.type].moves;
  const key = (c: Coord) => c.y * map.width + c.x;
  const best = new Map<number, number>([[key(unit), unit.movesLeft]]);
  const queue: Coord[] = [{ x: unit.x, y: unit.y }];
  const out: Coord[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    const left = best.get(key(cur))!;
    if (left <= 0) continue;
    for (const n of neighbors(map, cur)) {
      if (!isEnterable(state, unit.owner, n.x, n.y)) continue;
      const cost = moveCost(state, n.x, n.y);
      if (cost > left && left < full) continue;
      const after = Math.max(0, left - cost);
      const k = key(n);
      if ((best.get(k) ?? -1) >= after) continue;
      if (!best.has(k)) out.push(n);
      best.set(k, after);
      queue.push(n);
    }
  }
  return out;
}
