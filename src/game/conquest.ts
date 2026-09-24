// City capture and elimination (Milestone 4).
//
// A city with no units in it can be captured by an enemy land unit with attack > 0 moving
// in (see stepError in movement.ts). The captured city changes owner, loses 1 population
// (never below 1; cities are never destroyed), loses its Walls, and starts its production
// over with nothing chosen. A civ with no cities and no units is eliminated.

import { CIVS } from '../data/civs';
import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { updateExplored } from './fog';
import { addLog } from './log';
import { atWar } from './war';
import { refreshWorkedTiles } from './yields';
import type { City, Coord, GameState, Unit } from './types';

export function civName(state: GameState, playerId: number): string {
  const civId = state.players[playerId]?.civId;
  return CIVS.find((c) => c.id === civId)?.name ?? 'A civ';
}

export function civAdjective(state: GameState, playerId: number): string {
  const civId = state.players[playerId]?.civId;
  return CIVS.find((c) => c.id === civId)?.adjective ?? 'Foreign';
}

/** The enemy city `unit` would capture by stepping onto `to`, if it can. */
export function capturableCity(state: GameState, unit: Unit, to: Coord): City | undefined {
  const city = state.cities.find((c) => c.x === to.x && c.y === to.y);
  if (!city || city.owner === unit.owner) return undefined;
  if (!atWar(state, unit.owner, city.owner)) return undefined;
  if (UNITS[unit.type].attack <= 0) return undefined;
  if (state.units.some((u) => u.x === to.x && u.y === to.y)) return undefined;
  return city;
}

/** Hands the city to `newOwner` (the capturing unit is already standing in it). */
export function captureCity(state: GameState, city: City, newOwner: number): void {
  const oldOwner = city.owner;
  city.owner = newOwner;
  city.size = Math.max(1, city.size - 1);
  city.buildings = city.buildings.filter((b) => !BUILDINGS[b].effects.defenseBonusPct);
  city.production = 0;
  city.build = null;
  refreshWorkedTiles(state);
  updateExplored(state, newOwner);
  const who = civName(state, newOwner);
  const text =
    city.capitalOf === oldOwner
      ? `${who} captured ${city.name}, the ${civAdjective(state, oldOwner)} capital!`
      : `${who} captured ${city.name} from ${civName(state, oldOwner)}`;
  addLog(state, newOwner, text, city, oldOwner);
  checkEliminations(state, newOwner, city);
}

/** Marks every living civ with no cities and no units as eliminated. */
export function checkEliminations(state: GameState, by: number, at: Coord): void {
  for (const p of state.players) {
    if (!p.alive) continue;
    const hasCity = state.cities.some((c) => c.owner === p.id);
    const hasUnit = state.units.some((u) => u.owner === p.id);
    if (hasCity || hasUnit) continue;
    p.alive = false;
    p.researching = null;
    addLog(state, p.id, `${civName(state, p.id)} has been eliminated`, at, by);
  }
}
