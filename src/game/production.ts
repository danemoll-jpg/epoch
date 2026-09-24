// City management actions (build choice, focus, rush-buy) and the per-turn city update:
// growth/starvation, production, and trade into science and gold.
//
// Production rules: a city builds one item at a time. Production accumulates every turn
// (even with nothing chosen), and an item appears once it's paid for, with the overflow
// carried over. After a unit, the same unit stays selected; after a building the city asks
// for a new choice (build = null). A unit with a population cost (Settler) waits until the
// city is big enough, then takes the population when it's finished.

import { BUILDINGS, BUILDING_IDS } from '../data/buildings';
import { CITY_FOCUSES, RULES, growthThreshold, rushBuyCost, type CityFocus } from '../data/rules';
import { TECHS, type TechId } from '../data/techs';
import { UNITS, UNIT_IDS } from '../data/units';
import { addLog } from './log';
import { hasTech } from './tech';
import { cityScienceGold, cityYields, foodSurplus, refreshWorkedTiles } from './yields';
import type { ActionResult, BuildItem, City, GameState, Unit } from './types';

export function findCity(state: GameState, cityId: number): City | undefined {
  return state.cities.find((c) => c.id === cityId);
}

export function itemCost(item: BuildItem): number {
  return item.kind === 'unit' ? UNITS[item.id].cost : BUILDINGS[item.id].cost;
}

export function itemName(item: BuildItem): string {
  return item.kind === 'unit' ? UNITS[item.id].name : BUILDINGS[item.id].name;
}

export function sameItem(a: BuildItem | null, b: BuildItem | null): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}

/** The tech an item needs, if any. */
export function itemRequires(item: BuildItem): TechId | undefined {
  return item.kind === 'unit' ? UNITS[item.id]?.requires : BUILDINGS[item.id]?.requires;
}

/** Why the city can't choose this item at all, or undefined if it can. */
export function buildChoiceError(state: GameState, city: City, item: BuildItem): string | undefined {
  if (item.kind === 'building') {
    if (!BUILDINGS[item.id]) return 'Unknown building';
    if (city.buildings.includes(item.id)) return 'Already built';
  } else if (!UNITS[item.id]) {
    return 'Unknown unit';
  }
  const requires = itemRequires(item);
  if (!hasTech(state.players[city.owner]!, requires)) return `Needs ${TECHS[requires!].name}`;
  return undefined;
}

/** Everything the city could be set to build right now (only what's unlocked), units first. */
export function buildOptions(state: GameState, city: City): BuildItem[] {
  const units: BuildItem[] = UNIT_IDS.map((id) => ({ kind: 'unit', id }));
  const buildings: BuildItem[] = BUILDING_IDS.map((id) => ({ kind: 'building', id }));
  return [...units, ...buildings].filter((item) => !buildChoiceError(state, city, item));
}

/** Why the finished item would have to wait (e.g. a Settler in a size-1 city). */
export function completionBlocker(city: City, item: BuildItem): string | undefined {
  if (item.kind === 'unit') {
    const pop = UNITS[item.id].popCost;
    if (pop > 0 && city.size <= pop) return `Needs size ${pop + 1}`;
  }
  return undefined;
}

function ownedCity(state: GameState, cityId: number): City | string {
  const city = findCity(state, cityId);
  if (!city) return 'No such city';
  if (city.owner !== state.currentPlayer) return 'Not your turn';
  return city;
}

export function setBuild(state: GameState, cityId: number, item: BuildItem): ActionResult {
  const city = ownedCity(state, cityId);
  if (typeof city === 'string') return { ok: false, reason: city };
  const err = buildChoiceError(state, city, item);
  if (err) return { ok: false, reason: err };
  // Switching keeps stored production (no penalty in this milestone).
  city.build = item.kind === 'unit' ? { kind: 'unit', id: item.id } : { kind: 'building', id: item.id };
  return { ok: true };
}

export function setFocus(state: GameState, cityId: number, focus: CityFocus): ActionResult {
  const city = ownedCity(state, cityId);
  if (typeof city === 'string') return { ok: false, reason: city };
  if (!CITY_FOCUSES.includes(focus)) return { ok: false, reason: 'Unknown focus' };
  city.focus = focus;
  refreshWorkedTiles(state);
  return { ok: true };
}

export function setScienceRate(state: GameState, rate: number): ActionResult {
  const player = state.players[state.currentPlayer];
  if (!player) return { ok: false, reason: 'No such player' };
  if (!Number.isInteger(rate) || rate < 0 || rate > 100 || rate % RULES.scienceRateStep !== 0) {
    return { ok: false, reason: 'Invalid rate' };
  }
  player.scienceRate = rate;
  return { ok: true };
}

/** Gold to finish the current item now, or undefined if there's nothing to buy. */
export function buyCost(city: City): number | undefined {
  if (!city.build) return undefined;
  const remaining = itemCost(city.build) - city.production;
  return remaining > 0 ? rushBuyCost(remaining) : undefined;
}

/** Why rush-buying isn't possible, or undefined if it is. */
export function buyError(state: GameState, city: City): string | undefined {
  if (!city.build) return 'Nothing to buy';
  const cost = buyCost(city);
  if (cost === undefined) return 'Already paid for';
  const blocker = completionBlocker(city, city.build);
  if (blocker) return blocker;
  if (state.players[city.owner]!.gold < cost) return `Needs ${cost} gold`;
  return undefined;
}

/** Pays gold to fill the remaining production. The item appears at the end of the turn. */
export function rushBuy(state: GameState, cityId: number): ActionResult {
  const city = ownedCity(state, cityId);
  if (typeof city === 'string') return { ok: false, reason: city };
  const err = buyError(state, city);
  if (err) return { ok: false, reason: err };
  state.players[city.owner]!.gold -= buyCost(city)!;
  city.production = itemCost(city.build!);
  return { ok: true };
}

/** Turns until the city grows (positive surplus) or shrinks (negative), else undefined. */
export function growthForecast(state: GameState, city: City): { grows: boolean; turns: number } | undefined {
  const surplus = foodSurplus(state, city);
  if (surplus > 0) {
    return { grows: true, turns: Math.max(1, Math.ceil((growthThreshold(city.size) - city.food) / surplus)) };
  }
  if (surplus < 0 && city.size > 1) return { grows: false, turns: Math.floor(city.food / -surplus) + 1 };
  return undefined;
}

/** Turns until the current item is paid for, or undefined if nothing is being built. */
export function turnsToFinish(state: GameState, city: City): number | undefined {
  if (!city.build) return undefined;
  const remaining = itemCost(city.build) - city.production;
  if (remaining <= 0) return 1;
  const perTurn = cityYields(state, city).production;
  return perTurn > 0 ? Math.ceil(remaining / perTurn) : undefined;
}

function spawnUnit(state: GameState, city: City, type: Unit['type']): Unit {
  const veteran = city.buildings.some((b) => BUILDINGS[b].effects.veteranUnits);
  const unit: Unit = {
    id: state.nextId++,
    type,
    owner: city.owner,
    x: city.x,
    y: city.y,
    // Units appear at the end of the owner's turn; they get moves at the next turn start.
    movesLeft: 0,
    veteran,
    fortified: false,
    army: false,
  };
  state.units.push(unit);
  return unit;
}

function foodKeptPct(city: City): number {
  return city.buildings.reduce(
    (pct, b) => Math.max(pct, BUILDINGS[b].effects.foodKeptPct ?? 0),
    RULES.foodKeptAfterGrowthPct,
  );
}

function growCity(state: GameState, city: City): void {
  const surplus = foodSurplus(state, city);
  city.food += surplus;
  const threshold = growthThreshold(city.size);
  if (city.food >= threshold) {
    const kept = Math.floor((threshold * foodKeptPct(city)) / 100);
    city.food = Math.min(kept, growthThreshold(city.size + 1) - 1);
    city.size++;
    addLog(state, city.owner, `${city.name} grew to size ${city.size}`, city);
  } else if (city.food < 0) {
    city.food = 0;
    if (city.size > 1) {
      city.size--;
      addLog(state, city.owner, `${city.name} is starving and shrank to size ${city.size}`, city);
    }
  }
}

function produce(state: GameState, city: City, production: number): void {
  city.production += production;
  const item = city.build;
  if (!item) return;
  const cost = itemCost(item);
  if (city.production < cost || completionBlocker(city, item)) return;
  city.production -= cost;
  if (item.kind === 'unit') {
    spawnUnit(state, city, item.id);
    city.size -= UNITS[item.id].popCost;
    // Units repeat: the same item stays selected.
  } else {
    city.buildings.push(item.id);
    city.build = null;
  }
  addLog(state, city.owner, `${city.name} built ${itemName(item)}`, city);
}

/**
 * End-of-turn update for every city the player owns, in city id order: food and growth,
 * production and completion, then trade into science and gold.
 */
export function processCities(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  if (!player) return;
  refreshWorkedTiles(state);
  const mine = state.cities.filter((c) => c.owner === playerId).sort((a, b) => a.id - b.id);
  for (const city of mine) {
    // Read this turn's yields before anything changes the city's size.
    const production = cityYields(state, city).production;
    const { science, gold } = cityScienceGold(state, city);
    growCity(state, city);
    produce(state, city, production);
    player.science += science;
    player.gold += gold;
  }
  refreshWorkedTiles(state);
}
