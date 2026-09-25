// Building table. `requires` is the tech that unlocks each building, and `needs` a building the
// city must already have. Costs and effect numbers are placeholders; there's no upkeep yet.
// Round 11 added the mid/late set (Courthouse to Stock Exchange) that several leader bonuses
// refer to. Building icons stay text until M9.

import type { TechId } from './techs';

export type BuildingId =
  | 'granary' | 'barracks' | 'walls' | 'library' | 'marketplace' | 'temple' | 'harbor' | 'airport'
  // Round 11
  | 'courthouse' | 'cathedral' | 'colosseum' | 'university' | 'bank' | 'factory' | 'power_plant'
  | 'research_lab' | 'stock_exchange';

export interface BuildingEffects {
  /** Percent of the food box kept after the city grows. */
  foodKeptPct?: number;
  /** Units built in this city start as veterans (not aircraft: see veteranAircraft). */
  veteranUnits?: boolean;
  /** Aircraft built here start as veterans, and a land unit can be airlifted from here once a turn (the Airport, Round 10). */
  veteranAircraft?: boolean;
  airlift?: boolean;
  /** Defense bonus (percent) for units in this city against land attacks. */
  defenseBonusPct?: number;
  sciencePct?: number;
  goldPct?: number;
  /** Percent more production in this city (Round 11). */
  productionPct?: number;
  /** Gold per turn (Round 11: the Courthouse). */
  gold?: number;
  /** Culture per turn (Milestone 6): it adds up toward the culture victory. */
  culture?: number;
  /** Extra food on every water tile the city works (the Harbor, Round 8). */
  waterFood?: number;
  /** Extra food in a city its owner took from another civ, so it regrows faster (the Courthouse). */
  capturedFood?: number;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  cost: number;
  /** One-line player-facing summary of the effect. */
  summary: string;
  effects: BuildingEffects;
  /** Tech needed to build it. */
  requires?: TechId;
  /** A building the city must already have (Round 11: a University needs a Library). */
  needs?: BuildingId;
  /** Only a coastal city (next to water) can build it. */
  coastal?: boolean;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  granary: {
    id: 'granary', name: 'Granary', cost: 40, requires: 'pottery',
    summary: 'Keeps half the food box after growth',
    effects: { foodKeptPct: 50 },
  },
  barracks: {
    id: 'barracks', name: 'Barracks', cost: 30, requires: 'bronze_working',
    summary: 'New units start as veterans',
    effects: { veteranUnits: true },
  },
  walls: {
    id: 'walls', name: 'Walls', cost: 40, requires: 'masonry',
    summary: '+100% defense in this city against land attacks',
    effects: { defenseBonusPct: 100 },
  },
  library: {
    id: 'library', name: 'Library', cost: 60, requires: 'writing',
    summary: '+100% science',
    effects: { sciencePct: 100 },
  },
  marketplace: {
    id: 'marketplace', name: 'Marketplace', cost: 60, requires: 'currency',
    summary: '+50% gold',
    effects: { goldPct: 50 },
  },
  temple: {
    id: 'temple', name: 'Temple', cost: 30, requires: 'ceremonial_burial',
    summary: '1 culture per turn',
    effects: { culture: 1 },
  },
  harbor: {
    id: 'harbor', name: 'Harbor', cost: 60, requires: 'seafaring', coastal: true,
    summary: '+1 food on every water tile the city works (coastal cities only)',
    effects: { waterFood: 1 },
  },
  airport: {
    id: 'airport', name: 'Airport', cost: 80, requires: 'flight',
    summary: 'Aircraft built here start as veterans; once a turn, fly one land unit to another city with an Airport',
    effects: { veteranAircraft: true, airlift: true },
  },
  // ---- Round 11 ----
  courthouse: {
    id: 'courthouse', name: 'Courthouse', cost: 50, requires: 'code_of_laws',
    summary: '+1 gold; +1 food in a city you captured, so it regrows faster',
    effects: { gold: 1, capturedFood: 1 },
  },
  cathedral: {
    id: 'cathedral', name: 'Cathedral', cost: 80, requires: 'monotheism',
    summary: '3 culture per turn',
    effects: { culture: 3 },
  },
  colosseum: {
    id: 'colosseum', name: 'Colosseum', cost: 70, requires: 'construction',
    summary: '2 culture per turn',
    effects: { culture: 2 },
  },
  university: {
    id: 'university', name: 'University', cost: 120, requires: 'university', needs: 'library',
    summary: '+50% science (needs a Library)',
    effects: { sciencePct: 50 },
  },
  bank: {
    id: 'bank', name: 'Bank', cost: 100, requires: 'banking', needs: 'marketplace',
    summary: '+50% gold (needs a Marketplace)',
    effects: { goldPct: 50 },
  },
  factory: {
    id: 'factory', name: 'Factory', cost: 140, requires: 'industrialization',
    summary: '+50% production',
    effects: { productionPct: 50 },
  },
  power_plant: {
    id: 'power_plant', name: 'Power Plant', cost: 120, requires: 'electricity', needs: 'factory',
    summary: '+25% production (needs a Factory)',
    effects: { productionPct: 25 },
  },
  research_lab: {
    id: 'research_lab', name: 'Research Lab', cost: 150, requires: 'computers', needs: 'university',
    summary: '+50% science (needs a University)',
    effects: { sciencePct: 50 },
  },
  stock_exchange: {
    id: 'stock_exchange', name: 'Stock Exchange', cost: 140, requires: 'corporation', needs: 'bank',
    summary: '+50% gold (needs a Bank)',
    effects: { goldPct: 50 },
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

/** Buildings that make culture (Temple, Cathedral, Colosseum): Mansa Musa's cheaper rush-buy. */
export function isCultureBuilding(id: BuildingId): boolean {
  return (BUILDINGS[id].effects.culture ?? 0) > 0;
}

/** Order the AI works through buildings once its cities are defended and it has expanded. */
export const AI_BUILDING_ORDER: BuildingId[] = [
  'granary', 'library', 'harbor', 'marketplace', 'temple', 'courthouse', 'barracks', 'walls', 'university', 'bank',
  'colosseum', 'cathedral', 'factory', 'power_plant', 'stock_exchange', 'research_lab', 'airport',
];
