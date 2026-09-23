// Founding cities. A settler founds on a valid land tile away from other cities and is used
// up. The name comes from the owner's civ name list in data.

import { CIVS } from '../data/civs';
import { RULES } from '../data/rules';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { distance, tileAt } from './grid';
import { updateExplored } from './fog';
import { findUnit } from './movement';
import type { ActionResult, City, GameState } from './types';

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
  return undefined;
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
  const player = state.players[unit.owner]!;
  const city: City = {
    id: state.nextId++,
    name: cityNameFor(state, unit.owner),
    owner: unit.owner,
    x: unit.x,
    y: unit.y,
    foundedTurn: state.turn,
  };
  player.citiesFounded++;
  state.cities.push(city);
  state.units = state.units.filter((u) => u.id !== unitId);
  updateExplored(state, unit.owner);
  const civName = CIVS.find((c) => c.id === player.civId)?.name ?? 'A civ';
  state.log.push({ turn: state.turn, player: unit.owner, text: `${civName} founded ${city.name}` });
  return { ok: true, city };
}
