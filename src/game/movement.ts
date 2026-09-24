// Unit movement rules. Land units can't enter water or mountains and pay the terrain's move
// cost. A unit with full movement points may always make one move, even into terrain that
// costs more than it has (so a 1-move unit can still enter forest or hills). Tiles holding
// another player's units or city are blocked, with one exception: stepping into an adjacent
// enemy city with no defenders in it captures it (see conquest.ts). Fighting is a separate
// action (combat.ts). Moving clears a unit's fortified state.
//
// Ships (Round 8, see naval.ts): they move on water (a Galley only along the coast) at 1 per
// tile and can dock in their own coastal cities. A land unit boards a ship by stepping onto
// its tile (next to it at sea, or in the same city), and goes ashore by stepping onto a land
// tile next to the ship; either one uses up the unit's moves. Cargo moves with its ship.
//
// Aircraft (Round 10, see air.ts) never walk: a 'move' order for one is a rebase. The
// Helicopter hovers: it goes onto any tile, water and mountains too, at 1 move a tile, never
// boards a ship, and never captures a city.

import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { capturableCity, captureCity } from './conquest';
import { distance, inBounds, neighbors, tileAt } from './grid';
import { civName } from './conquest';
import { updateContacts } from './diplomacy';
import { updateExplored } from './fog';
import { airRoom, cargoCapacity, cargoRoom, carriedBy, hovers, isAir, isShip, isWaterAt, shipTerrainError, shipWithRoom, terrainAllows } from './naval';
import { rebase, rebaseTargets } from './air';
import { atWar } from './war';
import { enterTile, pendingVillage } from './villages';
import type { ActionResult, Coord, GameState, Unit } from './types';

export function findUnit(state: GameState, unitId: number): Unit | undefined {
  return state.units.find((u) => u.id === unitId);
}

/** Can land units of `owner` ever stand on this tile (ignoring move points)? */
export function isEnterable(state: GameState, owner: number, x: number, y: number): boolean {
  const tile = tileAt(state.map, x, y);
  if (!tile || !TERRAIN[tile.terrain].landPassable) return false;
  return !occupiedByOthers(state, owner, x, y);
}

function occupiedByOthers(state: GameState, owner: number, x: number, y: number): boolean {
  if (state.units.some((u) => u.x === x && u.y === y && u.owner !== owner)) return true;
  return state.cities.some((c) => c.x === x && c.y === y && c.owner !== owner);
}

/** Can this unit ever stand on this tile by walking or sailing (not boarding), ignoring move points? */
export function canEnter(state: GameState, unit: Unit, x: number, y: number): boolean {
  if (!terrainAllows(state, unit.type, unit.owner, x, y)) return false;
  return !occupiedByOthers(state, unit.owner, x, y);
}

export function moveCost(state: GameState, x: number, y: number): number {
  const tile = tileAt(state.map, x, y);
  return tile ? TERRAIN[tile.terrain].moveCost : Infinity;
}

/** What a unit pays to step onto a tile: ships and Helicopters 1 a tile, land units the terrain's cost. */
function stepCost(state: GameState, unit: Unit, to: Coord): number {
  return isShip(unit) || hovers(unit) ? 1 : moveCost(state, to.x, to.y);
}

/** How a legal step happens: an ordinary move, boarding a ship there, or going ashore from one. */
type StepKind = { kind: 'move' } | { kind: 'board'; shipId: number } | { kind: 'ashore' };

function stepKind(state: GameState, unit: Unit, to: Coord): StepKind | string {
  if (isShip(unit)) {
    if (!terrainAllows(state, unit.type, unit.owner, to.x, to.y)) return shipTerrainError(state, unit.type, to.x, to.y);
    return { kind: 'move' };
  }
  // Aircraft rebase instead (air.ts); a Helicopter flies over anything.
  if (isAir(unit)) return 'Aircraft fly from a base: tap a target to strike, or a city or Carrier in range to rebase';
  if (hovers(unit)) return { kind: 'move' };
  if (isWaterAt(state, to.x, to.y)) {
    // Boarding another ship at sea (or from the shore). Enemy ships there: nothing to board.
    const ship = shipWithRoom(state, unit.owner, to.x, to.y, unit.carriedBy ?? undefined);
    if (ship) return { kind: 'board', shipId: ship.id };
    const own = state.units.find((u) => u.x === to.x && u.y === to.y && u.owner === unit.owner && isShip(u));
    if (own) return `The ${UNITS[own.type].name} is full (${cargoCapacity(own)}/${cargoCapacity(own)})`;
    return unit.carriedBy !== null ? 'Unload onto land' : 'Land units need a ship to cross water';
  }
  return unit.carriedBy !== null ? { kind: 'ashore' } : { kind: 'move' };
}

/** Why a single-step move is illegal, or undefined if it's legal. */
export function stepError(state: GameState, unit: Unit, to: Coord): string | undefined {
  if (state.currentPlayer !== unit.owner) return 'Not your turn';
  if (!inBounds(state.map, to.x, to.y)) return 'Off the map';
  if (distance(unit, to) !== 1) return 'Not adjacent';
  if (unit.movesLeft <= 0) return 'No moves left';
  const kind = stepKind(state, unit, to);
  if (typeof kind === 'string') {
    if (occupiedByOthers(state, unit.owner, to.x, to.y)) return blockedReason(state, unit, to);
    return kind;
  }
  if (occupiedByOthers(state, unit.owner, to.x, to.y) && !capturableCity(state, unit, to)) return blockedReason(state, unit, to);
  if (!isShip(unit) && !hovers(unit) && kind.kind !== 'board' && !TERRAIN[tileAt(state.map, to.x, to.y)!.terrain].landPassable) return 'Tile is impassable';
  if (kind.kind !== 'move') return undefined; // boarding and going ashore take whatever moves are left
  const cost = stepCost(state, unit, to);
  const full = UNITS[unit.type].moves;
  if (cost > unit.movesLeft && unit.movesLeft < full) return 'Not enough moves left';
  return undefined;
}

/** Why a tile holding someone else's units or city is blocked. */
function blockedReason(state: GameState, unit: Unit, to: Coord): string {
  const other =
    state.cities.find((c) => c.x === to.x && c.y === to.y && c.owner !== unit.owner)?.owner ??
    state.units.find((u) => u.x === to.x && u.y === to.y && u.owner !== unit.owner)?.owner;
  if (other !== undefined && !atWar(state, unit.owner, other)) return `You are at peace with ${civName(state, other)}`;
  if (hovers(unit) && state.cities.some((c) => c.x === to.x && c.y === to.y)) return 'Helicopters can’t capture cities';
  return 'Tile is impassable';
}

/** Moves a unit one tile. The same action is used by the player and the AI. */
export function moveUnit(state: GameState, unitId: number, to: Coord): ActionResult {
  const unit = findUnit(state, unitId);
  if (!unit) return { ok: false, reason: 'No such unit' };
  const err = stepError(state, unit, to);
  if (err) return { ok: false, reason: err };
  const kind = stepKind(state, unit, to) as StepKind;
  const captured = capturableCity(state, unit, to);
  // Everything aboard (land units, and aircraft on a Carrier) sails with the ship.
  const cargo = isShip(unit) ? carriedBy(state, unit) : [];
  unit.x = to.x;
  unit.y = to.y;
  unit.fortified = false;
  if (kind.kind === 'move') {
    unit.movesLeft = Math.max(0, unit.movesLeft - stepCost(state, unit, to));
  } else {
    unit.movesLeft = 0;
    unit.carriedBy = kind.kind === 'board' ? kind.shipId : null;
  }
  // Cargo sails with its ship.
  for (const c of cargo) {
    c.x = to.x;
    c.y = to.y;
  }
  updateExplored(state, unit.owner);
  updateContacts(state);
  if (captured) captureCity(state, captured, unit.owner);
  // A barbarian village or an exploration hut here (Round 9).
  else if (!isShip(unit) && unit.carriedBy === null) enterTile(state, unit);
  return { ok: true };
}

/**
 * Boards `unitId` onto the ship `shipId` on the same tile (a ship docked in the city the unit
 * is in). Uses up the unit's moves.
 */
export function boardShip(state: GameState, unitId: number, shipId: number): ActionResult {
  const unit = findUnit(state, unitId);
  const ship = findUnit(state, shipId);
  if (!unit || !ship) return { ok: false, reason: 'No such unit' };
  if (state.currentPlayer !== unit.owner) return { ok: false, reason: 'Not your turn' };
  if (isShip(unit)) return { ok: false, reason: 'Ships can’t board ships' };
  if (hovers(unit)) return { ok: false, reason: 'Helicopters fly: they don’t board ships' };
  if (!isShip(ship) || ship.owner !== unit.owner) return { ok: false, reason: 'That isn’t one of your ships' };
  if (unit.carriedBy === ship.id) return { ok: false, reason: 'Already aboard' };
  if (ship.x !== unit.x || ship.y !== unit.y) return { ok: false, reason: 'Move next to the ship, then tap it to board' };
  if (unit.movesLeft <= 0) return { ok: false, reason: 'No moves left' };
  // Aircraft land on a Carrier (Round 10); land units go in the hold.
  if (isAir(unit) ? airRoom(state, ship) <= 0 : cargoRoom(state, ship) <= 0) return { ok: false, reason: `The ${UNITS[ship.type].name} is full` };
  unit.carriedBy = ship.id;
  unit.movesLeft = 0;
  unit.fortified = false;
  return { ok: true };
}

/** A unit aboard a ship docked in a city goes ashore into the city. Uses up its moves. */
export function unloadHere(state: GameState, unitId: number): ActionResult {
  const unit = findUnit(state, unitId);
  if (!unit) return { ok: false, reason: 'No such unit' };
  if (state.currentPlayer !== unit.owner) return { ok: false, reason: 'Not your turn' };
  if (unit.carriedBy === null) return { ok: false, reason: 'Not aboard a ship' };
  if (isWaterAt(state, unit.x, unit.y)) return { ok: false, reason: 'Tap a land tile next to the ship to unload there' };
  if (unit.movesLeft <= 0) return { ok: false, reason: 'No moves left' };
  unit.carriedBy = null;
  unit.movesLeft = 0;
  return { ok: true };
}

/**
 * Cheapest path from the unit to `to` (excluding the start tile), or undefined.
 * The owner's knowledge limits the plan: unexplored tiles are assumed passable at cost 1,
 * so the path never leaks hidden terrain and the unit can head into the unknown.
 * moveUnitToward stops when the real terrain turns out to block it. A land unit's path may end
 * by boarding a ship on the goal tile; a unit aboard a ship starts by going ashore.
 */
export function findPath(state: GameState, unit: Unit, to: Coord): Coord[] | undefined {
  const { map } = state;
  if (!inBounds(map, to.x, to.y)) return undefined;
  const explored = state.players[unit.owner]?.explored;
  const known = (k: number) => !explored || explored[k] === 1;
  const key = (c: Coord) => c.y * map.width + c.x;
  if (isAir(unit)) return undefined;
  const boardGoal = !isShip(unit) && !hovers(unit) && !!shipWithRoom(state, unit.owner, to.x, to.y, unit.carriedBy ?? undefined);
  if (known(key(to)) && !canEnter(state, unit, to.x, to.y) && !boardGoal) return undefined;
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
      if (isKnown && !canEnter(state, unit, n.x, n.y) && !(k === goal && boardGoal)) continue;
      const nc = cost.get(cur)! + (isKnown && !isShip(unit) && !hovers(unit) ? moveCost(state, n.x, n.y) : 1);
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
  // An aircraft told to go somewhere rebases there (Round 10).
  if (isAir(unit)) return rebase(state, unitId, to);
  if (unit.movesLeft <= 0) return { ok: false, reason: 'No moves left' };
  // One step (capturing, boarding, going ashore, or just next door) goes straight there;
  // paths never go through enemy cities or onto ships.
  if (distance(unit, to) === 1 && !stepError(state, unit, to)) return moveUnit(state, unitId, to);
  const path = findPath(state, unit, to);
  if (!path) {
    // Next door, say why ("A Galley can't leave the coast", "The Galley is full"...).
    const why = distance(unit, to) === 1 ? stepError(state, unit, to) : undefined;
    return { ok: false, reason: why && why !== 'Tile is impassable' ? why : "Can't reach that tile" };
  }
  let moved = false;
  for (const step of path) {
    const res = moveUnit(state, unitId, step);
    if (!res.ok) return moved ? { ok: true } : res;
    moved = true;
    // Took a village on the way: stop there so its owner can choose (Round 9).
    if (pendingVillage(state, unit.owner)) break;
  }
  return { ok: true };
}

/** Tiles the unit could reach this turn with its remaining moves (for the UI highlight). */
export function reachableThisTurn(state: GameState, unit: Unit): Coord[] {
  if (unit.movesLeft <= 0) return [];
  const { map } = state;
  // Aircraft: the cities and Carriers they could rebase to.
  if (isAir(unit)) return rebaseTargets(state, unit);
  // Going ashore or boarding ends the unit's move, so those are one step away at most.
  if (!isShip(unit) && !hovers(unit)) {
    const extra = neighbors(map, unit).filter((n) => {
      if (stepError(state, unit, n)) return false;
      const k = stepKind(state, unit, n);
      return typeof k !== 'string' && k.kind !== 'move';
    });
    if (unit.carriedBy !== null) return extra;
    return dedupe([...walkable(state, unit), ...extra]);
  }
  return walkable(state, unit);
}

function dedupe(list: Coord[]): Coord[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = `${c.x},${c.y}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function walkable(state: GameState, unit: Unit): Coord[] {
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
      if (!canEnter(state, unit, n.x, n.y)) continue;
      const cost = stepCost(state, unit, n);
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
