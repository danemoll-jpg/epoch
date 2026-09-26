// Founding cities. A settler founds on a valid land tile away from other cities and is used
// up. The name comes from the owner's civ name list in data. A new city starts at size 1
// with nothing chosen to build.

import { CIVS } from '../data/civs';
import { CivName } from './conquest';
import { RULES } from '../data/rules';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { distance, tileAt } from './grid';
import { updateContacts } from './diplomacy';
import { updateExplored } from './fog';
import { addLog } from './log';
import { bordersFoundError } from './borders';
import { findUnit } from './movement';
import { refreshWorkedTiles } from './yields';
import type { ActionResult, City, Coord, GameState } from './types';

/** Why this unit can't found a city right now, or undefined if it can. */
export function foundCityError(state: GameState, unitId: number): string | undefined {
  const unit = findUnit(state, unitId);
  if (!unit) return 'No such unit';
  if (state.currentPlayer !== unit.owner) return 'Not your turn';
  if (!UNITS[unit.type].canFoundCity) return 'Only settlers can found cities';
  if (unit.movesLeft <= 0) return 'No moves left';
  const tile = tileAt(state.map, unit.x, unit.y);
  if (!tile || !TERRAIN[tile.terrain].canFoundCity) return "Can't build a city on this terrain";
  if (state.cities.some((c) => distance(c, unit) < RULES.minCityDistance)) {
    return 'Too close to another city';
  }
  // Round 19 (item 7): not inside another civ's borders.
  return bordersFoundError(state, unit.owner, unit.x, unit.y);
}

export function cityNameFor(state: GameState, playerId: number): string {
  const player = state.players[playerId]!;
  const names = CIVS.find((c) => c.id === player.civId)?.cityNames ?? [];
  const n = player.citiesFounded;
  if (n < names.length) return names[n]!;
  const base = names[n % Math.max(1, names.length)];
  return base ? `New ${base}` : `City ${n + 1}`;
}

export function foundCity(state: GameState, unitId: number): ActionResult & { city?: City } {
  const err = foundCityError(state, unitId);
  if (err) return { ok: false, reason: err };
  const unit = findUnit(state, unitId)!;
  state.units = state.units.filter((u) => u.id !== unitId);
  const city = createCity(state, unit.owner, unit);
  addLog(state, unit.owner, `${CivName(state, unit.owner)} founded ${city.name}`, city);
  return { ok: true, city };
}

/**
 * A new size-1 city for `owner` on `at`, named from the civ's list (the first one is its
 * capital). Shared by settlers and settled barbarian villages (Round 9); the caller checks
 * the site and logs it.
 */
export function createCity(state: GameState, owner: number, at: Coord): City {
  const player = state.players[owner]!;
  const city: City = {
    id: state.nextId++,
    name: cityNameFor(state, owner),
    owner,
    x: at.x,
    y: at.y,
    foundedTurn: state.turn,
    size: 1,
    food: 0,
    production: 0,
    build: null,
    focus: 'balanced',
    buildings: [],
    wonders: [],
    // A civ's first city is its capital.
    capitalOf: player.citiesFounded === 0 ? owner : null,
    worked: [],
    greatPeople: [],
    founder: owner,
    religion: null,
    unrest: 0,
    culture: 0,
  };
  player.citiesFounded++;
  state.cities.push(city);
  refreshWorkedTiles(state);
  updateExplored(state, owner);
  updateContacts(state);
  return city;
}
