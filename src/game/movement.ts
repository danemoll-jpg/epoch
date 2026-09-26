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
//
// Roads (Round 12, see roads.ts): a land unit stepping from one road tile (or city) to another
// pays 1/3 of a move, 1/10 on rails, so moves can be fractional. Everyone uses every road.

import { ROADS } from '../data/roads';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { capturableCity, captureCity } from './conquest';
import { distance, inBounds, neighbors, tileAt } from './grid';
import { civName } from './conquest';
import { updateContacts } from './diplomacy';
import { updateExplored } from './fog';
import { airRoom, cargoCapacity, cargoRoom, carriedBy, hovers, isAir, isCoastal, isShip, isWaterAt, shipTerrainError, shipWithRoom, terrainAllows } from './naval';
import { rebase, rebaseTargets } from './air';
import { roadStepCost } from './roads';
import { atWar } from './war';
import { enterTile, pendingVillage } from './villages';
import { MinHeap } from './heap';
import type { ActionResult, City, Coord, GameState, RoadKind, Unit } from './types';

export function findUnit(state: GameState, unitId: number): Unit | undefined {
  return state.units.find((u) => u.id === unitId);
}

/** Can land units of `owner` ever stand on this tile (ignoring move points)? */
export function isEnterable(state: GameState, owner: number, x: number, y: number): boolean {
  const tile = tileAt(state.map, x, y);
  if (!tile || !TERRAIN[tile.terrain].landPassable) return false;
  return !occupiedByOthers(state, owner, x, y);
}

function occupiedByOthers(state: GameState, owner: number, x: number, y: number, mover?: Unit): boolean {
  // Round 19 (item 11): nobody is blocked by a spy (it's unseen), and a spy walks in among the
  // units and into the cities of civs it's at peace with.
  const spy = !!mover && !!UNITS[mover.type].spy;
  const blocks = (other: number) => !spy || atWar(state, owner, other);
  if (state.units.some((u) => u.x === x && u.y === y && u.owner !== owner && !UNITS[u.type].spy && blocks(u.owner))) return true;
  return state.cities.some((c) => c.x === x && c.y === y && c.owner !== owner && blocks(c.owner));
}

/** Can this unit ever stand on this tile by walking or sailing (not boarding), ignoring move points? */
export function canEnter(state: GameState, unit: Unit, x: number, y: number): boolean {
  if (!terrainAllows(state, unit.type, unit.owner, x, y)) return false;
  return !occupiedByOthers(state, unit.owner, x, y, unit);
}

export function moveCost(state: GameState, x: number, y: number): number {
  const tile = tileAt(state.map, x, y);
  return tile ? TERRAIN[tile.terrain].moveCost : Infinity;
}

/**
 * What a unit pays to step from `from` onto a neighbor: ships and Helicopters 1 a tile, land
 * units the terrain's cost, or less along a road (Round 12).
 */
export function stepCost(state: GameState, unit: Unit, from: Coord, to: Coord): number {
  if (isShip(unit) || hovers(unit)) return 1;
  const terrain = moveCost(state, to.x, to.y);
  const road = roadStepCost(state, from, to);
  return road === undefined ? terrain : Math.min(terrain, road);
}

/** Tiny leftovers from fractional road moves (1 − 3 × 1/3) count as nothing. */
const EPS = 1e-6;

function spend(left: number, cost: number): number {
  const after = left - cost;
  return after < EPS ? 0 : Math.round(after * 1e6) / 1e6;
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
    if (occupiedByOthers(state, unit.owner, to.x, to.y, unit)) return blockedReason(state, unit, to);
    return kind;
  }
  if (occupiedByOthers(state, unit.owner, to.x, to.y, unit) && !capturableCity(state, unit, to)) return blockedReason(state, unit, to);
  if (!isShip(unit) && !hovers(unit) && kind.kind !== 'board' && !TERRAIN[tileAt(state.map, to.x, to.y)!.terrain].landPassable) return 'Tile is impassable';
  if (kind.kind !== 'move') return undefined; // boarding and going ashore take whatever moves are left
  const cost = stepCost(state, unit, unit, to);
  const full = UNITS[unit.type].moves;
  if (cost > unit.movesLeft + EPS && unit.movesLeft < full) return 'Not enough moves left';
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
  const cost = stepCost(state, unit, unit, to);
  unit.x = to.x;
  unit.y = to.y;
  unit.fortified = false;
  if (kind.kind === 'move') {
    unit.movesLeft = spend(unit.movesLeft, cost);
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
  // Round 14: A* with a binary heap (it was Dijkstra re-sorting its whole frontier every step,
  // the slowest thing in a big map's AI turn). The estimate is the tiles left times the
  // cheapest step there can be (a rail, a road, or 1), so it never overestimates and the path
  // is still a cheapest one. Ties go to the tile queued first.
  const n = map.width * map.height;
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const cheapest = cheapestStep(state, unit);
  const gx = to.x;
  const gy = to.y;
  const estimate = (k: number) => Math.max(Math.abs((k % map.width) - gx), Math.abs(Math.floor(k / map.width) - gy)) * cheapest;
  // Who's where, looked up once per search instead of scanning every unit and city at every
  // step (canEnter and stepCost, done by hand with the same rules).
  const look = pathLookups(state, unit.owner);
  const walker = !isShip(unit) && !hovers(unit);
  const enter = (k: number) => {
    if (look.others[k]) return false;
    const x = k % map.width;
    const y = Math.floor(k / map.width);
    if (!isShip(unit)) return terrainAllows(state, unit.type, unit.owner, x, y);
    // A ship: water it may sail, or one of its owner's coastal cities.
    const city = look.city[k];
    if (city && !TERRAIN[map.tiles[k]!.terrain].isWater) return city.owner === unit.owner && isCoastal(state, city);
    return terrainAllows(state, unit.type, unit.owner, x, y);
  };
  const road = (k: number): RoadKind | undefined => {
    const city = look.city[k];
    if (city) return look.rail[city.owner] ? 'rail' : 'road';
    return map.tiles[k]!.road;
  };
  const step = (from: number, k: number): number => {
    const terrain = TERRAIN[map.tiles[k]!.terrain].moveCost;
    const a = road(from);
    const b = a ? road(k) : undefined;
    if (!a || !b) return terrain;
    return Math.min(terrain, a === 'rail' && b === 'rail' ? ROADS.railMoveCost : ROADS.roadMoveCost);
  };
  const heap = new MinHeap();
  let order = 0;
  cost[start] = 0;
  heap.push(estimate(start), order++, start);
  while (heap.size) {
    const cur = heap.pop();
    if (done[cur]) continue;
    done[cur] = 1;
    if (cur === goal) break;
    const c = { x: cur % map.width, y: Math.floor(cur / map.width) };
    for (const nb of neighbors(map, c)) {
      const k = key(nb);
      if (done[k]) continue;
      const isKnown = known(k);
      if (isKnown && !enter(k) && !(k === goal && boardGoal)) continue;
      const nc = cost[cur]! + (isKnown && walker ? step(cur, k) : 1);
      if (nc < cost[k]!) {
        cost[k] = nc;
        prev[k] = cur;
        heap.push(nc + estimate(k), order++, k);
      }
    }
  }
  if (goal === start || prev[goal] === -1) return undefined;
  const path: Coord[] = [];
  let k = goal;
  while (k !== start) {
    path.unshift({ x: k % map.width, y: Math.floor(k / map.width) });
    k = prev[k]!;
  }
  return path;
}

/**
 * Round 17: how many turns walking `path` (from findPath) takes, counting this one, spending
 * moves as moveUnit does (a unit with full moves may always make one step). Unexplored tiles
 * cost 1, as findPath assumes, so the count never leaks hidden terrain. Boarding or going
 * ashore uses whatever moves are left. A unit with no moves left starts next turn.
 */
export function pathTurns(state: GameState, unit: Unit, path: Coord[]): number {
  const full = UNITS[unit.type].moves;
  const explored = state.players[unit.owner]?.explored;
  let left = unit.movesLeft;
  let turns = 1;
  if (left <= EPS) {
    turns++;
    left = full;
  }
  let from: Coord = unit;
  let aboard = unit.carriedBy !== null && !isAir(unit);
  for (const step of path) {
    if (left <= EPS) {
      turns++;
      left = full;
    }
    const known = !explored || explored[step.y * state.map.width + step.x] === 1;
    const water = known && isWaterAt(state, step.x, step.y);
    const ends = !isShip(unit) && !hovers(unit) && (aboard ? !water : water);
    if (ends) {
      // Boarding or going ashore takes the rest of the turn's moves.
      left = 0;
      aboard = !aboard;
    } else {
      const cost = known ? stepCost(state, unit, from, step) : 1;
      if (cost > left + EPS && left < full) {
        turns++;
        left = full;
      }
      left = spend(left, cost);
    }
    from = step;
  }
  return turns;
}

/** For one path search: each tile's city, tiles holding other owners' units or cities, who knows Railroad. */
function pathLookups(state: GameState, owner: number): { city: (City | undefined)[]; others: Uint8Array; rail: boolean[] } {
  const n = state.map.width * state.map.height;
  const city: (City | undefined)[] = new Array(n);
  const others = new Uint8Array(n);
  for (const c of state.cities) {
    const k = c.y * state.map.width + c.x;
    city[k] = c;
    if (c.owner !== owner) others[k] = 1;
  }
  for (const u of state.units) if (u.owner !== owner) others[u.y * state.map.width + u.x] = 1;
  return { city, others, rail: state.players.map((p) => p.techs.includes(ROADS.railTech)) };
}

/** The cheapest single step a unit could ever take on this map now (for A*'s estimate). */
function cheapestStep(state: GameState, unit: Unit): number {
  if (isShip(unit) || hovers(unit)) return 1;
  // A city counts as road, and as rail once its owner knows Railroad.
  if (state.players.some((p) => p.techs.includes(ROADS.railTech)) || state.map.tiles.some((t) => t.road === 'rail')) return Math.min(ROADS.railMoveCost, 1);
  if (state.cities.length || state.map.tiles.some((t) => t.road)) return Math.min(ROADS.roadMoveCost, 1);
  return 1;
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
      const cost = stepCost(state, unit, cur, n);
      if (cost > left + EPS && left < full) continue;
      const after = spend(left, cost);
      const k = key(n);
      if ((best.get(k) ?? -1) >= after) continue;
      if (!best.has(k)) out.push(n);
      best.set(k, after);
      queue.push(n);
    }
  }
  return out;
}
