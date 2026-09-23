// Minimal AI (Milestone 1). It doesn't need to be smart: settlers found a city (right away
// for the capital, otherwise at a decent nearby spot) and warriors walk toward unexplored
// territory. It only uses the same action functions the human player uses, and only looks
// at tiles it has explored.

import { RULES } from '../data/rules';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { distance, neighbors, tileIndex } from './grid';
import { foundCity, foundCityError } from './city';
import { siteScore } from './mapgen';
import { findUnit, isEnterable, moveUnitToward } from './movement';
import { nextFloat } from './rng';
import type { Coord, GameState, Unit } from './types';

/** Breadth-first step distances over explored, enterable tiles. */
function reachable(state: GameState, unit: Unit, maxSteps: number): Map<number, number> {
  const { map } = state;
  const explored = state.players[unit.owner]!.explored;
  const dist = new Map<number, number>([[tileIndex(map, unit.x, unit.y), 0]]);
  const queue: Coord[] = [{ x: unit.x, y: unit.y }];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(tileIndex(map, cur.x, cur.y))!;
    if (d >= maxSteps) continue;
    for (const n of neighbors(map, cur)) {
      const k = tileIndex(map, n.x, n.y);
      if (dist.has(k) || explored[k] !== 1) continue;
      if (!isEnterable(state, unit.owner, n.x, n.y)) continue;
      dist.set(k, d + 1);
      queue.push(n);
    }
  }
  return dist;
}

function coordOf(state: GameState, k: number): Coord {
  return { x: k % state.map.width, y: Math.floor(k / state.map.width) };
}

function isValidCitySite(state: GameState, c: Coord): boolean {
  const t = state.map.tiles[tileIndex(state.map, c.x, c.y)]!;
  if (!TERRAIN[t.terrain].canFoundCity) return false;
  return state.cities.every((city) => distance(city, c) >= RULES.minCityDistance);
}

function playSettler(state: GameState, unit: Unit): void {
  const hasCity = state.cities.some((c) => c.owner === unit.owner);
  if (!foundCityError(state, unit.id)) {
    // Capital goes down immediately; later cities only on a decent site.
    if (!hasCity || siteScore(state.map, unit) >= 20) {
      foundCity(state, unit.id);
      return;
    }
  }
  let best: { k: number; value: number } | undefined;
  for (const [k, steps] of reachable(state, unit, 8)) {
    const c = coordOf(state, k);
    if (!isValidCitySite(state, c)) continue;
    const value = siteScore(state.map, c) - steps * 3 + nextFloat(state);
    if (!best || value > best.value) best = { k, value };
  }
  if (best) {
    const target = coordOf(state, best.k);
    if (target.x === unit.x && target.y === unit.y) foundCity(state, unit.id);
    else moveUnitToward(state, unit.id, target);
    // Arrived with moves to spare? Settle now rather than waste a turn.
    const after = findUnit(state, unit.id);
    if (after && after.x === target.x && after.y === target.y && !foundCityError(state, unit.id)) {
      foundCity(state, unit.id);
    }
  } else if (!foundCityError(state, unit.id)) {
    foundCity(state, unit.id);
  }
}

function playWarrior(state: GameState, unit: Unit): void {
  const { map } = state;
  const explored = state.players[unit.owner]!.explored;
  // Frontier: explored tiles we can reach that border unexplored ones. Go to the nearest.
  let best: { k: number; value: number } | undefined;
  for (const [k, steps] of reachable(state, unit, 40)) {
    if (steps === 0) continue;
    const c = coordOf(state, k);
    const unknown = neighbors(map, c).filter((n) => explored[tileIndex(map, n.x, n.y)] !== 1).length;
    if (unknown === 0) continue;
    const value = unknown - steps * 2 + nextFloat(state) * 2;
    if (!best || value > best.value) best = { k, value };
  }
  if (best) {
    moveUnitToward(state, unit.id, coordOf(state, best.k));
    return;
  }
  // Nothing left to explore nearby: wander to a random passable neighbor.
  const options = neighbors(map, unit).filter((n) => isEnterable(state, unit.owner, n.x, n.y));
  if (options.length) {
    const choice = options[Math.floor(nextFloat(state) * options.length)]!;
    moveUnitToward(state, unit.id, choice);
  }
}

export function runAiTurn(state: GameState, playerId: number): void {
  const mine = state.units.filter((u) => u.owner === playerId).map((u) => u.id);
  for (const id of mine) {
    const unit = findUnit(state, id);
    if (!unit || unit.movesLeft <= 0) continue;
    if (UNITS[unit.type].canFoundCity) playSettler(state, unit);
    else playWarrior(state, unit);
  }
}
