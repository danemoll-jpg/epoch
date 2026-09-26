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
import { PROJECTS, PROJECT_IDS } from '../data/victory';
import { WONDERS, WONDER_IDS } from '../data/wonders';
import { CITY_FOCUSES, RULES, growthThreshold, rushBuyCost, type CityFocus } from '../data/rules';
import { TECHS, type TechId } from '../data/techs';
import { UNITS, UNIT_IDS } from '../data/units';
import { addLog } from './log';
import { isObsolete, replacementOf } from './upgrades';
import { addCityCulture } from './borders';
import { CivName } from './conquest';
import { hasTech } from './tech';
import { addSpaceshipPart, spaceshipError, victoryWonderBlocker } from './victory';
import { completeWonder, wonderError } from './wonders';
import { coastalError, isAircraftType } from './naval';
import { effectsOf, firstEffect, leaderCost, rushBuyPct, uniqueBuildError, wonderBuyMult } from './leaders';
import { UNIQUE_RULES } from '../data/leaders';
import { cityCulture, cityYields, empireIncome, empireWonderEffect, foodSurplus, refreshWorkedTiles, settled } from './yields';
import type { ActionResult, BuildItem, City, GameState, Unit } from './types';
import { missionaryBuildError } from './religion';
import { RELIGION } from '../data/religion';
import { upgradeRails } from './roads';

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

/** The item's cost in the data table, before any leader bonus. */
export function baseCost(item: BuildItem): number {
  return itemDef(item)!.cost;
}

/** What the item costs this city's owner: the data cost with their leader bonuses (Round 11). */
export function itemCost(state: GameState, city: City, item: BuildItem): number {
  return leaderCost(state, city.owner, item, baseCost(item));
}

/** Gold due when this item is finished (Round 11: JFK's spaceship parts), or 0. */
export function itemGold(state: GameState, city: City, item: BuildItem): number {
  if (item.kind !== 'project' || item.id !== 'spaceship') return 0;
  return effectsOf(state, city.owner, 'spaceshipGold').reduce((s, e) => s + e.gold, 0);
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
  // Round 11: some buildings need another first (a University needs a Library).
  const needs = item.kind === 'building' ? BUILDINGS[item.id].needs : undefined;
  if (needs && !city.buildings.includes(needs)) return `Needs a ${BUILDINGS[needs].name}`;
  // Round 12: a Missionary needs a religion in the city (and Monotheism or its founding tech).
  if (item.kind === 'unit' && UNITS[item.id].spreadsReligion) return missionaryBuildError(state, city);
  const requires = itemRequires(item);
  if (!hasTech(state.players[city.owner]!, requires)) return `Needs ${TECHS[requires!].name}`;
  // Round 19 (item 8): a unit whose replacement this civ can build is out of date.
  if (item.kind === 'unit' && isObsolete(state.players[city.owner]!, item.id)) return `Replaced by the ${UNITS[replacementOf(state.players[city.owner]!, item.id)!].name}`;
  // A second tech (the Stealth Bomber, Round 10).
  const also = item.kind === 'unit' ? UNITS[item.id].alsoRequires : undefined;
  if (!hasTech(state.players[city.owner]!, also)) return `Needs ${TECHS[also!].name}`;
  const coast = coastalError(state, city, item);
  if (coast) return coast;
  // Round 11: a leader's own wonder or project.
  const unique = uniqueBuildError(state, city, item);
  if (unique) return unique;
  if (item.kind === 'wonder') return wonderError(state, city, item.id);
  if (item.kind === 'project' && item.id === 'spaceship') return spaceshipError(state, city);
  return undefined;
}

/** Everything the city could be set to build right now (only what's unlocked): units, buildings, wonders, then the spaceship. */
export function buildOptions(state: GameState, city: City): BuildItem[] {
  const units: BuildItem[] = UNIT_IDS.map((id) => ({ kind: 'unit', id }));
  const buildings: BuildItem[] = BUILDING_IDS.map((id) => ({ kind: 'building', id }));
  const wonders: BuildItem[] = WONDER_IDS.map((id) => ({ kind: 'wonder', id }));
  const projects: BuildItem[] = PROJECT_IDS.map((id) => ({ kind: 'project', id }));
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
  const gold = itemGold(state, city, item);
  if (gold > 0 && state.players[city.owner]!.gold < gold) return `Needs ${gold} gold`;
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

/**
 * Gold to finish the current item now, or undefined if there's nothing to buy. Wonders can't
 * be bought, except by a leader whose bonus allows it (Caligula, at a higher price). Leader
 * bonuses change the price (Round 11).
 */
export function buyCost(state: GameState, city: City): number | undefined {
  if (!city.build) return undefined;
  let mult = 1;
  if (city.build.kind === 'wonder') {
    const m = wonderBuyMult(state, city.owner);
    if (m === undefined) return undefined;
    mult = m;
  }
  const remaining = itemCost(state, city, city.build) - city.production;
  if (remaining <= 0) return undefined;
  const pct = rushBuyPct(state, city.owner, city.build);
  return Math.max(1, Math.ceil((rushBuyCost(remaining) * mult * (100 + pct)) / 100));
}

/** Why rush-buying isn't possible, or undefined if it is. */
export function buyError(state: GameState, city: City): string | undefined {
  if (!city.build) return 'Nothing to buy';
  if (city.build.kind === 'wonder' && wonderBuyMult(state, city.owner) === undefined) return "Wonders can't be bought";
  const cost = buyCost(state, city);
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
  state.players[city.owner]!.gold -= buyCost(state, city)!;
  city.production = itemCost(state, city, city.build!);
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
  const remaining = itemCost(state, city, city.build) - city.production;
  if (remaining <= 0) return 1;
  const perTurn = cityYields(state, city).production;
  return perTurn > 0 ? Math.ceil(remaining / perTurn) : undefined;
}

function spawnUnit(state: GameState, city: City, type: Unit['type']): Unit {
  // Barracks (an Airport for aircraft, Round 10), a veteran wonder, or a Great General settled here (Round 9).
  const air = isAircraftType(type);
  const veteran =
    city.buildings.some((b) => (air ? BUILDINGS[b].effects.veteranAircraft : BUILDINGS[b].effects.veteranUnits)) ||
    empireWonderEffect(state, city.owner, 'veteranUnits') ||
    settled(city, 'general') > 0 ||
    // Round 11: Charlemagne's mounted units.
    (!!UNITS[type].mounted && !!firstEffect(state, city.owner, 'veteranMounted'));
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
  // Round 12: a Missionary carries its city's religion.
  if (UNITS[type].spreadsReligion && city.religion !== null) {
    unit.religion = city.religion;
    unit.charges = RELIGION.missionaryCharges;
  }
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
    // Round 11: Merkel's cities never shrink from starvation.
    if (city.size > 1 && !firstEffect(state, city.owner, 'noStarvation')) {
      city.size--;
      addLog(state, city.owner, `${city.name} is starving and shrank to size ${city.size}`, city);
    }
  }
}

function produce(state: GameState, city: City, production: number): void {
  city.production += production;
  const item = city.build;
  if (!item) return;
  const cost = itemCost(state, city, item);
  if (city.production < cost || completionBlocker(state, city, item)) return;
  // A wonder someone else finished first, or a spaceship part no longer allowed (capital
  // lost, ship launched): the production stays, and the city asks for a new choice.
  if ((item.kind === 'wonder' || item.kind === 'project') && buildChoiceError(state, city, item)) {
    city.build = null;
    return;
  }
  city.production -= cost;
  state.players[city.owner]!.gold -= itemGold(state, city, item);
  if (item.kind === 'unit') {
    const unit = spawnUnit(state, city, item.id);
    city.size -= UNITS[item.id].popCost;
    const built = state.players[city.owner]!.shipsBuilt;
    if (UNITS[item.id].domain === 'sea' && built && !built.includes(item.id)) built.push(item.id);
    // Units repeat: the same item stays selected.
    addLog(state, city.owner, `${city.name} built ${itemName(item)}`, city, undefined, { kind: 'built', ref: { cityId: city.id, unitId: unit.id, item } });
  } else if (item.kind === 'building') {
    city.buildings.push(item.id);
    city.build = null;
    addLog(state, city.owner, `${city.name} built ${itemName(item)}`, city, undefined, { kind: 'built', ref: { cityId: city.id, item } });
  } else if (item.kind === 'wonder') {
    city.build = null;
    completeWonder(state, city, item.id);
    if (WONDERS[item.id].civ) state.players[city.owner]!.uniquesUsed.push(item.id as 'versailles');
  } else if (item.id === 'moonshot') {
    city.build = null;
    completeMoonshot(state, city);
  } else {
    city.build = null;
    addSpaceshipPart(state, city);
  }
}

/** JFK's Moonshot (Round 11): culture now, and more science from then on (leaders.ts). */
function completeMoonshot(state: GameState, city: City): void {
  const p = state.players[city.owner]!;
  p.uniquesUsed.push('moonshot');
  p.culture += UNIQUE_RULES.moonshot.culture;
  addLog(state, city.owner, `${city.name} completed the Moonshot! +${UNIQUE_RULES.moonshot.culture} culture and +${UNIQUE_RULES.moonshot.sciencePct}% science from now on`, city, undefined, {
    publicText: `${CivName(state, city.owner)} landed a mission on the Moon`,
    kind: 'leader',
  });
}

/**
 * End-of-turn update for every city the player owns, in city id order: food and growth,
 * production and completion, then trade into science and gold.
 */
export function processCities(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  if (!player) return;
  // Round 12: with Railroad, roads near its cities (new ones, captured ones) become rails.
  upgradeRails(state, playerId);
  refreshWorkedTiles(state);
  const mine = state.cities.filter((c) => c.owner === playerId).sort((a, b) => a.id - b.id);
  // Income first, so a Global Exchange finishing this turn counts this turn's gold. Round 11:
  // the empire's total, since leader bonuses add percents and per-turn amounts on top.
  const income = empireIncome(state, playerId);
  player.gold += income.gold;
  player.science += income.science;
  player.culture += income.culture;
  // Read this turn's production before anything changes a city's size.
  const production = new Map(mine.map((c) => [c.id, cityYields(state, c).production]));
  for (const city of mine) {
    // Round 19 (item 7): its culture adds up, and its borders grow with it.
    addCityCulture(city, cityCulture(state, city));
    growCity(state, city);
    produce(state, city, production.get(city.id)!);
  }
  refreshWorkedTiles(state);
}
