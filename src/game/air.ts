// Aircraft (Round 10): rebasing and the airlift. Strikes and interception are fights, so they
// live in combat.ts; what kind of unit something is lives in naval.ts (isAir, hovers...).
//
// The "base and strike" model (Q17, chosen so nothing crashes by accident on a touchscreen):
// - Every aircraft except the Helicopter is based in one of its owner's cities, or aboard one
//   of its Carriers (`carriedBy` = the Carrier, and it moves and sinks with it). It never
//   stands on an open map tile, so there's no fuel or crash rule.
// - Once a turn it either strikes a tile within its `range` (combat.ts: it fights the best
//   defender there, and afterwards is back at its base), or rebases: flies to another of its
//   owner's cities, or onto a Carrier with room, within range. Either one uses up its turn.
// - Aircraft don't defend the tile they're on, and ground units and ships can't attack them.
//   They're lost with their city when it's captured, or with their Carrier when it sinks.
// - No air armies (Q16).
//
// The airlift (the Airport): once a turn, one land unit in a city with an Airport can fly to
// another of its owner's cities that has an Airport. It uses up the unit's moves.

import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { distance } from './grid';
import { carrierWithRoom, cityAt, hovers, isAir, isShip } from './naval';
import type { ActionResult, City, Coord, GameState, Unit } from './types';

/** How far (tiles) this aircraft can strike or rebase. 0 for anything that isn't a based aircraft. */
export function airRange(u: Unit): number {
  return isAir(u) ? (UNITS[u.type].range ?? 0) : 0;
}

/** The tiles within `r` of `c` (Chebyshev), on the map. */
export function tilesWithin(state: GameState, c: Coord, r: number): Coord[] {
  const out: Coord[] = [];
  for (let y = Math.max(0, c.y - r); y <= Math.min(state.map.height - 1, c.y + r); y++) {
    for (let x = Math.max(0, c.x - r); x <= Math.min(state.map.width - 1, c.x + r); x++) out.push({ x, y });
  }
  return out;
}

/** Why this aircraft can't rebase to `to`, or undefined if it can. */
export function rebaseError(state: GameState, unit: Unit, to: Coord): string | undefined {
  if (state.currentPlayer !== unit.owner) return 'Not your turn';
  if (!isAir(unit)) return 'Only aircraft rebase';
  if (unit.movesLeft <= 0) return 'Already flew this turn';
  const d = distance(unit, to);
  if (d > airRange(unit)) return `Out of range (${airRange(unit)} tiles)`;
  const city = cityAt(state, to.x, to.y);
  const ownCity = city && city.owner === unit.owner;
  if (d === 0) {
    // Same tile: between a city and a Carrier docked there.
    if (unit.carriedBy === null) return carrierWithRoom(state, unit.owner, to.x, to.y) ? undefined : 'Already based here';
    return ownCity ? undefined : 'Already aboard';
  }
  if (ownCity) return undefined;
  if (carrierWithRoom(state, unit.owner, to.x, to.y, unit.carriedBy ?? undefined)) return undefined;
  const carrier = state.units.find((u) => u.x === to.x && u.y === to.y && u.owner === unit.owner && isShip(u) && (UNITS[u.type].airCargo ?? 0) > 0);
  if (carrier) return `The ${UNITS[carrier.type].name} is full`;
  return 'Aircraft land only in your cities or on your Carriers';
}

/**
 * Flies an aircraft to one of its owner's cities, or onto a Carrier with room, within range.
 * A city wins over a Carrier docked in it, except on the tile it's already on (then it boards
 * the Carrier, or leaves it for the city). Uses up its turn.
 */
export function rebase(state: GameState, unitId: number, to: Coord): ActionResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return { ok: false, reason: 'No such unit' };
  const err = rebaseError(state, unit, to);
  if (err) return { ok: false, reason: err };
  const city = cityAt(state, to.x, to.y);
  const ownCity = !!city && city.owner === unit.owner;
  const same = unit.x === to.x && unit.y === to.y;
  let carrier: Unit | undefined;
  if (same) carrier = unit.carriedBy === null ? carrierWithRoom(state, unit.owner, to.x, to.y) : undefined;
  else if (!ownCity) carrier = carrierWithRoom(state, unit.owner, to.x, to.y, unit.carriedBy ?? undefined);
  unit.x = to.x;
  unit.y = to.y;
  unit.carriedBy = carrier ? carrier.id : null;
  unit.movesLeft = 0;
  unit.fortified = false;
  return { ok: true, message: carrier ? `onto the ${UNITS[carrier.type].name}` : city ? `to ${city.name}` : undefined };
}

/** Where this aircraft could rebase to this turn (other tiles only): its cities and Carriers with room, in range. */
export function rebaseTargets(state: GameState, unit: Unit): Coord[] {
  if (!isAir(unit) || unit.movesLeft <= 0) return [];
  return tilesWithin(state, unit, airRange(unit)).filter((c) => (c.x !== unit.x || c.y !== unit.y) && !rebaseError(state, unit, c));
}

// ---- the airlift -----------------------------------------------------------------------------

export function hasAirlift(city: City): boolean {
  return city.buildings.some((b) => BUILDINGS[b].effects.airlift);
}

/** Why `unit` can't be airlifted right now at all (before picking a city), or undefined. */
export function airliftSourceError(state: GameState, unit: Unit): string | undefined {
  if (state.currentPlayer !== unit.owner) return 'Not your turn';
  if (UNITS[unit.type].domain !== 'land' || hovers(unit)) return 'Only land units are airlifted';
  if (unit.carriedBy !== null) return 'Go ashore first';
  const from = cityAt(state, unit.x, unit.y);
  if (!from || from.owner !== unit.owner) return 'Airlifts leave from a city with an Airport';
  if (!hasAirlift(from)) return `${from.name} has no Airport`;
  if (from.airliftTurn === state.turn) return `${from.name} has already airlifted a unit this turn`;
  if (unit.movesLeft <= 0) return 'No moves left';
  return undefined;
}

/** Why `unit` can't be airlifted to this city, or undefined if it can. */
export function airliftError(state: GameState, unit: Unit, cityId: number): string | undefined {
  const err = airliftSourceError(state, unit);
  if (err) return err;
  const to = state.cities.find((c) => c.id === cityId);
  if (!to || to.owner !== unit.owner) return 'Airlifts land only in your own cities';
  if (to.x === unit.x && to.y === unit.y) return 'Already there';
  if (!hasAirlift(to)) return `${to.name} has no Airport`;
  return undefined;
}

/** The cities this unit could be airlifted to now. */
export function airliftTargets(state: GameState, unit: Unit): City[] {
  return state.cities.filter((c) => c.owner === unit.owner && !airliftError(state, unit, c.id)).sort((a, b) => a.id - b.id);
}

/** Flies a land unit from its city's Airport to another city with one. Once a turn per city. */
export function airlift(state: GameState, unitId: number, cityId: number): ActionResult {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return { ok: false, reason: 'No such unit' };
  const err = airliftError(state, unit, cityId);
  if (err) return { ok: false, reason: err };
  const from = cityAt(state, unit.x, unit.y)!;
  const to = state.cities.find((c) => c.id === cityId)!;
  from.airliftTurn = state.turn;
  unit.x = to.x;
  unit.y = to.y;
  unit.movesLeft = 0;
  unit.fortified = false;
  return { ok: true, message: `Airlifted to ${to.name}` };
}

