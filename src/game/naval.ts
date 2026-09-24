// Ships and cargo (Round 8). Pure helpers shared by movement, combat, capture, production,
// and the AI; the move rules themselves live in movement.ts.
//
// - Ships move only on water, and can dock in their own coastal cities. A Galley can't
//   leave the coast (it can't enter deep ocean).
// - A ship carries up to `cargo` land units (an army counts as one). Three ships of one type
//   can merge into a fleet (Dan's call, after Round 8): ×3 strength, ×3 cargo. Cargo stands on the
//   ship's tile with `carriedBy` set, moves with it, can't attack, and dies with it.
// - Only coastal cities (next to water) build ships and Harbors.
// - Round 10: what kind of unit something is lives here too (ship, based aircraft, hovering
//   Helicopter), since every rule file needs it. A Carrier carries aircraft (`airCargo`), not
//   land units; `cargoOf` is the land cargo and `aircraftOf` the aircraft aboard.

import { BUILDINGS, type BuildingId } from '../data/buildings';
import { RULES } from '../data/rules';
import { TERRAIN } from '../data/terrain';
import { UNITS, type UnitTypeId } from '../data/units';
import { neighbors, tileAt } from './grid';
import type { City, Coord, GameState, Unit } from './types';

export function isShipType(type: UnitTypeId): boolean {
  return UNITS[type].domain === 'sea';
}

export function isShip(u: Unit): boolean {
  return isShipType(u.type);
}

/** A based aircraft (Round 10): Fighter, Bomber, Jet Fighter, Stealth Bomber. Not the Helicopter. */
export function isAirType(type: UnitTypeId): boolean {
  return UNITS[type].domain === 'air';
}

export function isAir(u: Unit): boolean {
  return isAirType(u.type);
}

/** The Helicopter: moves like a land unit over any terrain and water, and can't capture. */
export function hovers(u: Unit): boolean {
  return !!UNITS[u.type].hover;
}

/** Anything that flies: based aircraft and the Helicopter (both can be intercepted). */
export function isAircraftType(type: UnitTypeId): boolean {
  return isAirType(type) || !!UNITS[type].hover;
}

export function isAircraft(u: Unit): boolean {
  return isAircraftType(u.type);
}

/** Only land units that walk take cities and villages (not ships, aircraft, or Helicopters). */
export function canCapture(u: Unit): boolean {
  return UNITS[u.type].domain === 'land' && !hovers(u);
}

export function isWaterAt(state: GameState, x: number, y: number): boolean {
  const t = tileAt(state.map, x, y);
  return !!t && TERRAIN[t.terrain].isWater;
}

/** Next to water: can build ships and Harbors, and ships can dock there. */
export function isCoastal(state: GameState, c: Coord): boolean {
  return neighbors(state.map, c).some((n) => isWaterAt(state, n.x, n.y));
}

export function cityAt(state: GameState, x: number, y: number): City | undefined {
  return state.cities.find((c) => c.x === x && c.y === y);
}

/**
 * Can a unit of this type (and owner) ever stand on this tile's terrain, ignoring who else is
 * there? Land units: walkable land. Ships: water (coast only for a Galley), or their own
 * coastal city.
 */
export function terrainAllows(state: GameState, type: UnitTypeId, owner: number, x: number, y: number): boolean {
  const t = tileAt(state.map, x, y);
  if (!t) return false;
  const def = UNITS[type];
  const terrain = TERRAIN[t.terrain];
  // Based aircraft never walk or sail (they rebase, air.ts); the Helicopter goes anywhere.
  if (def.domain === 'air') return false;
  if (def.hover) return true;
  if (def.domain === 'land') return terrain.landPassable;
  if (terrain.isWater) return !def.coastOnly || t.terrain === 'coast';
  const city = cityAt(state, x, y);
  return !!city && city.owner === owner && isCoastal(state, city);
}

/** Why a ship can't go onto this terrain, for messages. */
export function shipTerrainError(state: GameState, type: UnitTypeId, x: number, y: number): string {
  const t = tileAt(state.map, x, y);
  const def = UNITS[type];
  if (t && TERRAIN[t.terrain].isWater && def.coastOnly) return `A ${def.name} can’t leave the coast`;
  return 'Ships stay on water (they can dock in your coastal cities)';
}

/** The land units aboard this ship (not aircraft on a Carrier: see aircraftOf). */
export function cargoOf(state: GameState, ship: Unit): Unit[] {
  return state.units.filter((u) => u.carriedBy === ship.id && !isAir(u));
}

/** Everything aboard this ship: land cargo and aircraft. It all moves and sinks with it. */
export function carriedBy(state: GameState, ship: Unit): Unit[] {
  return state.units.filter((u) => u.carriedBy === ship.id);
}

/** The aircraft aboard this Carrier (Round 10). */
export function aircraftOf(state: GameState, ship: Unit): Unit[] {
  return state.units.filter((u) => u.carriedBy === ship.id && isAir(u));
}

/** How many aircraft this ship can carry (a Carrier fleet carries three Carriers' worth). */
export function airCapacity(ship: Unit): number {
  return (UNITS[ship.type].airCargo ?? 0) * (ship.army ? RULES.combat.armySize : 1);
}

/** Free aircraft places on this ship. */
export function airRoom(state: GameState, ship: Unit): number {
  return airCapacity(ship) - aircraftOf(state, ship).length;
}

/** The owner's Carrier on this tile with room for one more aircraft (oldest first), if any. */
export function carrierWithRoom(state: GameState, owner: number, x: number, y: number, except?: number): Unit | undefined {
  return state.units
    .filter((u) => u.owner === owner && u.x === x && u.y === y && isShip(u) && u.id !== except && airRoom(state, u) > 0)
    .sort((a, b) => a.id - b.id)[0];
}

/** How many land units this ship can carry: a fleet (a naval army, Dan's call) carries three ships' worth. */
export function cargoCapacity(ship: Unit): number {
  return UNITS[ship.type].cargo * (ship.army ? RULES.combat.armySize : 1);
}

/** Free cargo places on this ship. */
export function cargoRoom(state: GameState, ship: Unit): number {
  return cargoCapacity(ship) - cargoOf(state, ship).length;
}

/** What three of a kind merged into one are called: a fleet at sea, an army on land. */
export function armyWord(type: UnitTypeId): 'fleet' | 'army' {
  return isShipType(type) ? 'fleet' : 'army';
}

/** The owner's ship on this tile with room for one more (oldest first), if any. */
export function shipWithRoom(state: GameState, owner: number, x: number, y: number, except?: number): Unit | undefined {
  return state.units
    .filter((u) => u.owner === owner && u.x === x && u.y === y && isShip(u) && u.id !== except && cargoRoom(state, u) > 0)
    .sort((a, b) => a.id - b.id)[0];
}

/**
 * Units that could defend this tile: ships (and a hovering Helicopter) at sea; on land, land
 * units not aboard a ship. Ships in port and aircraft (Round 10) never defend.
 */
export function defendsTile(state: GameState, u: Unit): boolean {
  if (isAir(u)) return false;
  if (isWaterAt(state, u.x, u.y)) return isShip(u) || hovers(u);
  return !isShip(u) && u.carriedBy === null;
}

/** Removes a unit; a ship takes its cargo down with it. Returns every unit removed. */
export function removeUnit(state: GameState, unitId: number): Unit[] {
  const gone = state.units.filter((u) => u.id === unitId || u.carriedBy === unitId);
  const ids = new Set(gone.map((u) => u.id));
  state.units = state.units.filter((u) => !ids.has(u.id));
  return gone;
}

/** Why this city can't build this item for being inland, or undefined. */
export function coastalError(state: GameState, city: City, item: { kind: string; id: string }): string | undefined {
  const needsCoast =
    (item.kind === 'unit' && isShipType(item.id as UnitTypeId)) ||
    (item.kind === 'building' && BUILDINGS[item.id as BuildingId]?.coastal);
  if (needsCoast && !isCoastal(state, city)) return 'Needs a coastal city';
  return undefined;
}
