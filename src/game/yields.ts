// City yields and automatic worked-tile assignment (Civ Rev style: no manual tile picking).
// A city always works its center plus one tile per citizen inside its work radius. Tiles are
// chosen by the city's focus. Cities take turns picking one tile at a time (oldest city
// first each round), so no tile is ever worked twice and new cities aren't starved out.

import { BUILDINGS } from '../data/buildings';
import { RULES } from '../data/rules';
import { TERRAIN, type Yields } from '../data/terrain';
import { tileIndex, tilesInRadius } from './grid';
import type { City, GameState } from './types';

export function tileYields(state: GameState, index: number): Yields {
  const t = state.map.tiles[index]!;
  return { ...TERRAIN[t.terrain].yields };
}

export function centerYields(state: GameState, city: City): Yields {
  const y = tileYields(state, tileIndex(state.map, city.x, city.y));
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
        const score = tileScore(tileYields(state, k), c, food.get(c.id)!, c.worked.length);
        if (!best || score > best.score) best = { k, score };
      }
      if (!best) continue;
      taken.add(best.k);
      c.worked.push(best.k);
      food.set(c.id, food.get(c.id)! + tileYields(state, best.k).food);
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
    const y = tileYields(state, k);
    total.food += y.food;
    total.production += y.production;
    total.trade += y.trade;
  }
  const sp = specialists(city);
  total.food += sp * RULES.specialistYields.food;
  total.production += sp * RULES.specialistYields.production;
  total.trade += sp * RULES.specialistYields.trade;
  return total;
}

export function foodSurplus(state: GameState, city: City): number {
  return cityYields(state, city).food - city.size * RULES.foodPerCitizen;
}

function buildingPct(city: City, key: 'sciencePct' | 'goldPct'): number {
  return city.buildings.reduce((sum, b) => sum + (BUILDINGS[b].effects[key] ?? 0), 0);
}

/**
 * Splits the city's trade into science and gold by the owner's empire-wide rate, then
 * applies building bonuses (Library, Marketplace) to each part, rounding down.
 */
export function cityScienceGold(state: GameState, city: City): { science: number; gold: number } {
  const trade = cityYields(state, city).trade;
  const rate = state.players[city.owner]!.scienceRate;
  const baseScience = Math.round((trade * rate) / 100);
  const baseGold = trade - baseScience;
  const science = baseScience + Math.floor((baseScience * buildingPct(city, 'sciencePct')) / 100);
  const gold = baseGold + Math.floor((baseGold * buildingPct(city, 'goldPct')) / 100);
  return { science, gold };
}

/** What the player's empire earns per turn at current settings. */
export function empireIncome(state: GameState, playerId: number): { science: number; gold: number } {
  let science = 0;
  let gold = 0;
  for (const c of state.cities) {
    if (c.owner !== playerId) continue;
    const r = cityScienceGold(state, c);
    science += r.science;
    gold += r.gold;
  }
  return { science, gold };
}
