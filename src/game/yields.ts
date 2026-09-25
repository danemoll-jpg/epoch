// City yields and automatic worked-tile assignment (Civ Rev style: no manual tile picking).
// A city always works its center plus one tile per citizen inside its work radius. Tiles are
// chosen by the city's focus. Cities take turns picking one tile at a time (oldest city
// first each round), so no tile is ever worked twice and new cities aren't starved out.

import { BUILDINGS } from '../data/buildings';
import { GREAT_PEOPLE_RULES as GP, type GreatPersonKind } from '../data/greatPeople';
import { WONDERS, type WonderDef, type WonderEffects } from '../data/wonders';
import { RULES } from '../data/rules';
import { TERRAIN, type Yields } from '../data/terrain';
import { tileIndex, tilesInRadius } from './grid';
import { resourceBonus } from './resources';
import { applyPct, empireFlat, empirePct, leaderCityCulture, leaderCityGold, leaderCityPct, leaderProductionFlat, leaderProductionPct, resourceDoubled, terrainBonus, wasCaptured } from './leaders';
import type { City, GameState } from './types';

/**
 * What the tile gives: its terrain, plus its resource (Round 9) when `viewer` can see and use
 * it (hidden ones need revealing), plus the viewer's leader bonuses for it (Round 11). Without
 * a viewer, the terrain alone.
 */
export function tileYields(state: GameState, index: number, viewer?: number): Yields {
  const t = state.map.tiles[index]!;
  const y = { ...TERRAIN[t.terrain].yields };
  if (viewer === undefined) return y;
  const bonus = resourceBonus(state, viewer, index);
  if (bonus) {
    const times = resourceDoubled(state, viewer, index) ? 2 : 1;
    y.food += bonus.food * times;
    y.production += bonus.production * times;
    y.trade += bonus.trade * times;
  }
  const extra = terrainBonus(state, viewer, index);
  y.food += extra.food;
  y.trade += extra.trade;
  return y;
}

/** What a tile gives when this city works it: its terrain and resource, plus the Harbor's food on water (Round 8). */
export function workedTileYields(state: GameState, city: City, index: number): Yields {
  const y = tileYields(state, index, city.owner);
  if (TERRAIN[state.map.tiles[index]!.terrain].isWater) {
    for (const b of city.buildings) y.food += BUILDINGS[b].effects.waterFood ?? 0;
  }
  return y;
}

export function centerYields(state: GameState, city: City): Yields {
  const y = tileYields(state, tileIndex(state.map, city.x, city.y), city.owner);
  const b = RULES.cityCenterBonus;
  return { food: y.food + b.food, production: y.production + b.production, trade: y.trade + b.trade };
}

/** Tile indices inside the city's work radius, excluding its own center, in a fixed order. */
export function workRadiusTiles(state: GameState, city: City): number[] {
  return tilesInRadius(state.map, city, RULES.cityWorkRadius)
    .filter((c) => c.x !== city.x || c.y !== city.y)
    .map((c) => tileIndex(state.map, c.x, c.y));
}

function tileScore(y: Yields, city: City, foodSoFar: number, picked: number): number {
  const w = RULES.focusWeights[city.focus];
  let score = y.food * w.food + y.production * w.production + y.trade * w.trade;
  // Starvation guard: if what we've picked so far doesn't feed everyone, lean on food.
  const eaten = (picked + 1) * RULES.foodPerCitizen;
  if (foodSoFar < eaten) score += y.food * RULES.starvationGuardWeight;
  return score;
}

/** Reassigns every city's worked tiles. Deterministic: depends only on state. */
export function refreshWorkedTiles(state: GameState): void {
  const cities = [...state.cities].sort((a, b) => a.id - b.id);
  const taken = new Set<number>();
  for (const c of state.cities) taken.add(tileIndex(state.map, c.x, c.y));
  const food = new Map<number, number>();
  for (const c of cities) {
    c.worked = [];
    food.set(c.id, centerYields(state, c).food);
  }
  let placing = true;
  while (placing) {
    placing = false;
    for (const c of cities) {
      if (c.worked.length >= c.size) continue;
      let best: { k: number; score: number } | undefined;
      for (const k of workRadiusTiles(state, c)) {
        if (taken.has(k)) continue;
        const score = tileScore(workedTileYields(state, c, k), c, food.get(c.id)!, c.worked.length);
        if (!best || score > best.score) best = { k, score };
      }
      if (!best) continue;
      taken.add(best.k);
      c.worked.push(best.k);
      food.set(c.id, food.get(c.id)! + workedTileYields(state, c, best.k).food);
      placing = true;
    }
  }
}

/** Citizens with no tile to work (all nearby tiles taken or off the map). */
export function specialists(city: City): number {
  return Math.max(0, city.size - city.worked.length);
}

/** Total food / production / trade the city makes this turn (before feeding citizens). */
export function cityYields(state: GameState, city: City): Yields {
  const total = centerYields(state, city);
  for (const k of city.worked) {
    const y = workedTileYields(state, city, k);
    total.food += y.food;
    total.production += y.production;
    total.trade += y.trade;
  }
  const sp = specialists(city);
  total.food += sp * RULES.specialistYields.food;
  total.production += sp * RULES.specialistYields.production;
  total.trade += sp * RULES.specialistYields.trade;
  // Wonders (Milestone 6): extra food in their city, and production bonuses.
  for (const w of cityWonderDefs(city)) total.food += w.effects.food ?? 0;
  // Round 11: a Courthouse in a captured city helps it regrow; a leader's flat production.
  if (wasCaptured(city)) for (const b of city.buildings) total.food += BUILDINGS[b].effects.capturedFood ?? 0;
  total.production += leaderProductionFlat(state, city);
  const buildingProd = city.buildings.reduce((sum, b) => sum + (BUILDINGS[b].effects.productionPct ?? 0), 0);
  // Versailles: wonders built in its city go faster.
  const wonderProd = city.build?.kind === 'wonder' ? cityWonderDefs(city).reduce((sum, w) => sum + (w.effects.wonderProductionPct ?? 0), 0) : 0;
  const prodPct =
    cityWonderPct(city, 'productionPct') + empireWonderPct(state, city.owner, 'productionPct') + settled(city, 'engineer') * GP.engineerProductionPct +
    buildingProd + wonderProd + leaderProductionPct(state, city);
  total.production += Math.floor((total.production * prodPct) / 100);
  return total;
}

// ---- wonders and culture (Milestone 6) ------------------------------------------------------

function cityWonderDefs(city: City): WonderDef[] {
  return city.wonders.map((w) => WONDERS[w]).filter(Boolean);
}

/** Every wonder in a city the player holds. */
export function empireWonders(state: GameState, owner: number): WonderDef[] {
  return state.cities.filter((c) => c.owner === owner).flatMap(cityWonderDefs);
}

function cityWonderPct(city: City, key: 'sciencePct' | 'goldPct' | 'productionPct'): number {
  return cityWonderDefs(city).reduce((sum, w) => sum + ((w.effects as WonderEffects)[key] ?? 0), 0);
}

function empireWonderPct(state: GameState, owner: number, key: 'sciencePct' | 'goldPct' | 'productionPct'): number {
  return empireWonders(state, owner).reduce((sum, w) => sum + (w.effects.empire?.[key] ?? 0), 0);
}

/** Does any wonder the player holds give this empire-wide effect (e.g. veteran units)? */
export function empireWonderEffect(state: GameState, owner: number, key: 'veteranUnits'): boolean {
  return empireWonders(state, owner).some((w) => w.effects.empire?.[key]);
}

/** How many Great People of this kind are settled in the city (Round 9). */
export function settled(city: City, kind: GreatPersonKind): number {
  return (city.greatPeople ?? []).filter((k) => k === kind).length;
}

/**
 * Culture the city makes per turn: its buildings (Temple), wonders, and settled Artists, with
 * its owner's leader bonuses (Round 11). The empire-wide percent comes on top (empireCulture).
 */
export function cityCulture(state: GameState, city: City): number {
  let building = 0;
  for (const b of city.buildings) building += BUILDINGS[b].effects.culture ?? 0;
  let wonder = 0;
  for (const w of cityWonderDefs(city)) wonder += w.effects.culture ?? 0;
  return settled(city, 'artist') * GP.artistCulture + leaderCityCulture(state, city, building, wonder);
}

/** Culture the player's empire makes per turn, with empire-wide leader percents. */
export function empireCulture(state: GameState, playerId: number): number {
  const sum = state.cities.filter((c) => c.owner === playerId).reduce((s, c) => s + cityCulture(state, c), 0);
  return Math.max(0, applyPct(sum, empirePct(state, playerId, 'culture')));
}

export function foodSurplus(state: GameState, city: City): number {
  return cityYields(state, city).food - city.size * RULES.foodPerCitizen;
}

/** Percent bonus from the city's buildings, wonders, and settled Great People, and the owner's empire-wide wonders. */
function buildingPct(state: GameState, city: City, key: 'sciencePct' | 'goldPct'): number {
  const buildings = city.buildings.reduce((sum, b) => sum + (BUILDINGS[b].effects[key] ?? 0), 0);
  const people = key === 'sciencePct' ? settled(city, 'scientist') * GP.scientistSciencePct : settled(city, 'merchant') * GP.merchantGoldPct;
  return buildings + people + cityWonderPct(city, key) + empireWonderPct(state, city.owner, key) + leaderCityPct(state, city, key);
}

/**
 * Splits the city's trade into science and gold by the owner's empire-wide rate, then
 * applies building and wonder bonuses (Library, Marketplace, ...) to each part, rounding down.
 */
export function cityScienceGold(state: GameState, city: City): { science: number; gold: number } {
  const trade = cityYields(state, city).trade;
  const rate = state.players[city.owner]!.scienceRate;
  const baseScience = Math.round((trade * rate) / 100);
  const baseGold = trade - baseScience;
  const science = baseScience + Math.floor((baseScience * buildingPct(state, city, 'sciencePct')) / 100);
  // Flat gold (the Courthouse, Round 11; leader bonuses) comes after the percents.
  const flat = city.buildings.reduce((sum, b) => sum + (BUILDINGS[b].effects.gold ?? 0), 0) + leaderCityGold(state, city);
  const gold = baseGold + Math.floor((baseGold * buildingPct(state, city, 'goldPct')) / 100) + flat;
  return { science, gold };
}

/**
 * What the player's empire earns per turn at current settings: its cities' science and gold,
 * then the empire-wide leader percents and per-turn amounts (Round 11), and its culture.
 */
export function empireIncome(state: GameState, playerId: number): { science: number; gold: number; culture: number } {
  let science = 0;
  let gold = 0;
  for (const c of state.cities) {
    if (c.owner !== playerId) continue;
    const r = cityScienceGold(state, c);
    science += r.science;
    gold += r.gold;
  }
  const flat = empireFlat(state, playerId);
  return {
    science: Math.max(0, applyPct(science, empirePct(state, playerId, 'science')) + flat.science),
    gold: Math.max(0, applyPct(gold, empirePct(state, playerId, 'gold')) + flat.gold),
    culture: empireCulture(state, playerId),
  };
}
