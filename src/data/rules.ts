// Tunable rule constants. Placeholders until the balance pass (Milestone 6+); keep every
// number here so tuning never touches logic.

import type { Yields } from './terrain';
import type { UnitTypeId } from './units';

export type CityFocus = 'balanced' | 'food' | 'production' | 'trade';

export const CITY_FOCUSES: CityFocus[] = ['balanced', 'food', 'production', 'trade'];

export const RULES = {
  mapWidth: 32,
  mapHeight: 24,
  /** Civs per full game (1 human + 4 AI). */
  maxPlayers: 5,
  /** Default players when the URL doesn't say (human + 1 AI) until Milestone 5. */
  milestone1Players: 2,
  startingUnits: ['settler', 'warrior'] as UnitTypeId[],
  /** No city may be founded within this many tiles (Chebyshev) of another city. */
  minCityDistance: 3,
  citySight: 2,
  /** Start positions must be at least this far apart (Chebyshev) when possible. */
  minStartDistance: 7,
  /** Oldest event-log entries are dropped past this many, so saves stay small. */
  maxLogEntries: 200,

  // ---- cities (Milestone 2) ----
  /** Chebyshev radius of tiles a city can work. 1 = the 8 surrounding tiles. */
  cityWorkRadius: 1,
  /** Extra yield on the city's own center tile, on top of its terrain. */
  cityCenterBonus: { food: 1, production: 2, trade: 1 } as Yields,
  /** Citizens with no free tile to work still eat; they yield this instead. */
  specialistYields: { food: 0, production: 0, trade: 1 } as Yields,
  foodPerCitizen: 2,
  /** Food box size to grow from `size` to `size + 1`. */
  growthBase: 10,
  growthPerSize: 5,
  /** Share of the food box kept after growing (0–100). Granary raises it. */
  foodKeptAfterGrowthPct: 0,
  /** Tile-picking weights per focus: score = food*f + production*p + trade*t. */
  focusWeights: {
    balanced: { food: 2, production: 2, trade: 1 },
    food: { food: 6, production: 1, trade: 1 },
    production: { food: 1, production: 6, trade: 1 },
    trade: { food: 1, production: 1, trade: 6 },
  } as Record<CityFocus, Yields>,
  /**
   * While a city's picks so far don't feed its citizens, each point of food on a candidate
   * tile scores this much extra. It's large on purpose: food comes first until everyone is
   * fed, then the focus decides. So no focus starves a city while food is available.
   */
  starvationGuardWeight: 100,

  // ---- empire economy ----
  /** Percent of trade that becomes science; the rest is gold. Empire-wide, 10% steps. */
  defaultScienceRate: 60,
  scienceRateStep: 10,
  startingGold: 0,

  // ---- rush-buying ----
  /** Gold to finish an item = remaining * goldPerShield + remaining² / squareDivisor. */
  rushBuy: { goldPerShield: 2, squareDivisor: 20 },

  // ---- combat (Milestone 4) ----
  // Terrain defense bonuses are in terrain.ts and the Walls bonus is in buildings.ts.
  // Bonuses add up (e.g. hills +50% and fortified +50% = +100%, so strength × 2).
  combat: {
    fortifiedPct: 50,
    /** For either side. */
    veteranPct: 50,
    /** Any unit defending in a city. */
    cityDefensePct: 25,
    /** An army's attack and defense are its unit type's × this. */
    armyMultiplier: 3,
    /** Units of one type on one tile needed to form an army. */
    armySize: 3,
    /** Chance (percent) that the winner of a fight becomes a veteran. */
    veteranChancePct: 50,
    /** The AI attacks only when its win chance is at least this (percent). */
    aiAttackMinChancePct: 60,
  },
};

/** Food needed in the box for a city of this size to grow. */
export function growthThreshold(size: number): number {
  return RULES.growthBase + RULES.growthPerSize * size;
}

/** Gold to rush-buy an item with this much production still missing. */
export function rushBuyCost(remaining: number): number {
  if (remaining <= 0) return 0;
  const { goldPerShield, squareDivisor } = RULES.rushBuy;
  return Math.ceil(remaining * goldPerShield + (remaining * remaining) / squareDivisor);
}
