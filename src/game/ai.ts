// Minimal AI. It doesn't need to be smart: settlers found a city (right away for the
// capital, otherwise at a decent nearby spot), one warrior stays home in each city and the
// rest walk toward unexplored territory. Cities follow simple build rules (see
// chooseBuild). It only uses the same action functions the human player uses, and only
// looks at tiles it has explored.

import { AI_BUILDING_ORDER, AI_TARGET_CITIES } from '../data/buildings';
import { RULES } from '../data/rules';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { distance, neighbors, tileIndex } from './grid';
import { foundCity, foundCityError } from './city';
import { siteScore } from './mapgen';
import { findUnit, isEnterable, moveUnitToward } from './movement';
import { buyError, rushBuy, sameItem, setBuild, setFocus } from './production';
import { nextFloat } from './rng';
import type { BuildItem, City, Coord, GameState, Unit } from './types';

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
  } else {
    // No valid site in what we've seen yet: go and look.
    explore(state, unit);
  }
}

function cityAt(state: GameState, x: number, y: number): City | undefined {
  return state.cities.find((c) => c.x === x && c.y === y);
}

function isMilitary(u: Unit): boolean {
  return UNITS[u.type].defense > 0 && !UNITS[u.type].canFoundCity;
}

function defendersIn(state: GameState, city: City): Unit[] {
  return state.units.filter((u) => u.owner === city.owner && u.x === city.x && u.y === city.y && isMilitary(u));
}

/** A military unit of ours standing outside all of our cities. */
function hasExplorer(state: GameState, playerId: number): boolean {
  return state.units.some((u) => {
    if (u.owner !== playerId || !isMilitary(u)) return false;
    const c = cityAt(state, u.x, u.y);
    return !c || c.owner !== playerId;
  });
}

/**
 * Build rules, first match wins:
 * 1. No defender at home → Warrior.
 * 2. Fewer cities (counting settlers in the field and in production) than the target → Settler,
 *    from one city at a time. A size-1 city switches to Food focus so the Settler can finish.
 * 3. The next building in AI_BUILDING_ORDER it doesn't have.
 * 4. Warrior.
 */
export function chooseBuild(state: GameState, city: City): BuildItem {
  if (defendersIn(state, city).length === 0) return { kind: 'unit', id: 'warrior' };
  const owner = city.owner;
  const myCities = state.cities.filter((c) => c.owner === owner);
  const settlersOut = state.units.filter((u) => u.owner === owner && UNITS[u.type].canFoundCity).length;
  const settlerCities = myCities.filter((c) => c.id !== city.id && c.build?.kind === 'unit' && UNITS[c.build.id].canFoundCity);
  if (myCities.length + settlersOut + settlerCities.length < AI_TARGET_CITIES && settlerCities.length === 0) {
    return { kind: 'unit', id: 'settler' };
  }
  const next = AI_BUILDING_ORDER.find((b) => !city.buildings.includes(b));
  return next ? { kind: 'building', id: next } : { kind: 'unit', id: 'warrior' };
}

function manageCities(state: GameState, playerId: number): void {
  const mine = state.cities.filter((c) => c.owner === playerId).sort((a, b) => a.id - b.id);
  for (const city of mine) {
    const want = chooseBuild(state, city);
    if (!sameItem(city.build, want)) setBuild(state, city.id, want);
    // Grow toward size 2 before a Settler can finish; otherwise stay balanced.
    const focus = want.kind === 'unit' && UNITS[want.id].popCost >= city.size ? 'food' : 'balanced';
    if (city.focus !== focus) setFocus(state, city.id, focus);
    // An undefended city buys its warrior if the treasury allows.
    if (defendersIn(state, city).length === 0 && !buyError(state, city)) rushBuy(state, city.id);
  }
}

function playWarrior(state: GameState, unit: Unit): void {
  // The only defender in one of our cities stays put, once someone else is out exploring.
  // (The starting warrior explores; the capital builds its own defender.)
  const home = cityAt(state, unit.x, unit.y);
  if (home && home.owner === unit.owner && defendersIn(state, home).length === 1 && hasExplorer(state, unit.owner)) {
    return;
  }
  explore(state, unit);
}

/** Walk toward the nearest frontier of unexplored tiles, or wander if there is none. */
function explore(state: GameState, unit: Unit): void {
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
  // After moving, so a city founded this turn gets its first build choice right away.
  manageCities(state, playerId);
}
