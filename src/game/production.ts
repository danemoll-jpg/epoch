// City management actions (build choice, focus, rush-buy) and the per-turn city update:
// growth/starvation, production, and trade into science and gold.
//
// Production rules: a city builds one item at a time. Production accumulates every turn
// (even with nothing chosen), and an item appears once it's paid for, with the overflow
// carried over. After a unit, the same unit stays selected; after a building the city asks
// for a new choice (build = null). A unit with a population cost (Settler) waits until the
// city is big enough, then takes the population when it's finished. Wonders (one per world)
// and spaceship parts (Milestone 6) are built the same way; wonders can't be bought.

import { BUILDINGS, BUILDING_IDS } from '../data/buildings';
import { PROJECTS } from '../data/victory';
import { WONDERS, WONDER_IDS } from '../data/wonders';
import { CITY_FOCUSES, RULES, growthThreshold, rushBuyCost, type CityFocus } from '../data/rules';
import { TECHS, type TechId } from '../data/techs';
import { UNITS, UNIT_IDS } from '../data/units';
import { addLog } from './log';
import { hasTech } from './tech';
import { addSpaceshipPart, spaceshipError, victoryWonderBlocker } from './victory';
import { completeWonder, wonderError } from './wonders';
import { coastalError } from './naval';
import { cityCulture, cityScienceGold, cityYields, empireWonderEffect, foodSurplus, refreshWorkedTiles, settled } from './yields';
import type { ActionResult, BuildItem, City, GameState, Unit } from './types';

export function findCity(state: GameState, cityId: number): City | undefined {
  return state.cities.find((c) => c.id === cityId);
}

/** The data-table entry behind a build item (undefined if the id is unknown). */
function itemDef(item: BuildItem): { name: string; cost: number; requires?: TechId } | undefined {
  switch (item.kind) {
    case 'unit':
      return UNITS[item.id];
    case 'building':
      return BUILDINGS[item.id];
    case 'wonder':
      return WONDERS[item.id];
    case 'project':
      return PROJECTS[item.id];
  }
}

export function itemCost(item: BuildItem): number {
  return itemDef(item)!.cost;
}

export function itemName(item: BuildItem): string {
  return itemDef(item)!.name;
}

export function sameItem(a: BuildItem | null, b: BuildItem | null): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}

/** The tech an item needs, if any. */
export function itemRequires(item: BuildItem): TechId | undefined {
  return itemDef(item)?.requires;
}

/** Why the city can't choose this item at all, or undefined if it can. */
export function buildChoiceError(state: GameState, city: City, item: BuildItem): string | undefined {
  if (!itemDef(item)) return `Unknown ${item.kind}`;
  if (item.kind === 'building' && city.buildings.includes(item.id)) return 'Already built';
  const requires = itemRequires(item);
  if (!hasTech(state.players[city.owner]!, requires)) return `Needs ${TECHS[requires!].name}`;
  const coast = coastalError(state, city, item);
  if (coast) return coast;
  if (item.kind === 'wonder') return wonderError(state, city, item.id);
  if (item.kind === 'project') return spaceshipError(state, city);
  return undefined;
}

/** Everything the city could be set to build right now (only what's unlocked): units, buildings, wonders, then the spaceship. */
export function buildOptions(state: GameState, city: City): BuildItem[] {
  const units: BuildItem[] = UNIT_IDS.map((id) => ({ kind: 'unit', id }));
  const buildings: BuildItem[] = BUILDING_IDS.map((id) => ({ kind: 'building', id }));
  const wonders: BuildItem[] = WONDER_IDS.map((id) => ({ kind: 'wonder', id }));
  const projects: BuildItem[] = [{ kind: 'project', id: 'spaceship' }];
  return [...units, ...buildings, ...wonders, ...projects].filter((item) => !buildChoiceError(state, city, item));
}

/**
 * Why the finished item would have to wait (e.g. a Settler in a size-1 city, or the Global
 * Exchange when the treasury has dropped below the gold goal).
 */
export function completionBlocker(state: GameState, city: City, item: BuildItem): string | undefined {
  if (item.kind === 'unit') {
    const pop = UNITS[item.id].popCost;
    if (pop > 0 && city.size <= pop) return `Needs size ${pop + 1}`;
  }
  if (item.kind === 'wonder') return victoryWonderBlocker(state, city.owner, item.id);
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
  city.build = { kind: item.kind, id: item.id } as BuildItem;
  return { ok: true };
}

/** Builds nothing for now; production is stored until something is chosen. */
export function clearBuild(state: GameState, cityId: number): ActionResult {
  const city = ownedCity(state, cityId);
  if (typeof city === 'string') return { ok: false, reason: city };
  city.build = null;
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

/** Gold to finish the current item now, or undefined if there's nothing to buy (wonders can't be bought). */
export function buyCost(city: City): number | undefined {
  if (!city.build || city.build.kind === 'wonder') return undefined;
  const remaining = itemCost(city.build) - city.production;
  return remaining > 0 ? rushBuyCost(remaining) : undefined;
}

/** Why rush-buying isn't possible, or undefined if it is. */
export function buyError(state: GameState, city: City): string | undefined {
  if (!city.build) return 'Nothing to buy';
  if (city.build.kind === 'wonder') return "Wonders can't be bought";
  const cost = buyCost(city);
  if (cost === undefined) return 'Already paid for';
  const blocker = completionBlocker(state, city, city.build);
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
  // Barracks, a veteran wonder, or a Great General settled here (Round 9).
  const veteran =
    city.buildings.some((b) => BUILDINGS[b].effects.veteranUnits) ||
    empireWonderEffect(state, city.owner, 'veteranUnits') ||
    settled(city, 'general') > 0;
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
    carriedBy: null,
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
  if (city.production < cost || completionBlocker(state, city, item)) return;
  // A wonder someone else finished first, or a spaceship part no longer allowed (capital
  // lost, ship launched): the production stays, and the city asks for a new choice.
  if ((item.kind === 'wonder' || item.kind === 'project') && buildChoiceError(state, city, item)) {
    city.build = null;
    return;
  }
  city.production -= cost;
  if (item.kind === 'unit') {
    spawnUnit(state, city, item.id);
    city.size -= UNITS[item.id].popCost;
    // Units repeat: the same item stays selected.
    addLog(state, city.owner, `${city.name} built ${itemName(item)}`, city);
  } else if (item.kind === 'building') {
    city.buildings.push(item.id);
    city.build = null;
    addLog(state, city.owner, `${city.name} built ${itemName(item)}`, city);
  } else if (item.kind === 'wonder') {
    city.build = null;
    completeWonder(state, city, item.id);
  } else {
    city.build = null;
    addSpaceshipPart(state, city);
  }
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
    const culture = cityCulture(state, city);
    // Income first, so a Global Exchange finishing this turn counts this turn's gold.
    player.gold += gold;
    player.science += science;
    player.culture += culture;
    growCity(state, city);
    produce(state, city, production);
  }
  refreshWorkedTiles(state);
}
