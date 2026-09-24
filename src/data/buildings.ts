// Building table. Every building is available without techs until Milestone 3, which adds
// tech requirements. Costs and effect numbers are placeholders; there's no upkeep yet.

export type BuildingId = 'granary' | 'barracks' | 'walls' | 'library' | 'marketplace' | 'temple';

export interface BuildingEffects {
  /** Percent of the food box kept after the city grows. */
  foodKeptPct?: number;
  /** Units built in this city start as veterans (used by combat in Milestone 4). */
  veteranUnits?: boolean;
  /** Defense bonus for units in this city (used by combat in Milestone 4). */
  defenseBonusPct?: number;
  sciencePct?: number;
  goldPct?: number;
  /** Placeholder until contentment/culture exist (Milestone 6/7). No effect yet. */
  culture?: number;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  cost: number;
  /** One-line player-facing summary of the effect. */
  summary: string;
  effects: BuildingEffects;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  granary: {
    id: 'granary', name: 'Granary', cost: 40,
    summary: 'Keeps half the food box after growth',
    effects: { foodKeptPct: 50 },
  },
  barracks: {
    id: 'barracks', name: 'Barracks', cost: 30,
    summary: 'New units start as veterans',
    effects: { veteranUnits: true },
  },
  walls: {
    id: 'walls', name: 'Walls', cost: 40,
    summary: 'Stronger city defense (from combat on)',
    effects: { defenseBonusPct: 100 },
  },
  library: {
    id: 'library', name: 'Library', cost: 60,
    summary: '+50% science',
    effects: { sciencePct: 50 },
  },
  marketplace: {
    id: 'marketplace', name: 'Marketplace', cost: 60,
    summary: '+50% gold',
    effects: { goldPct: 50 },
  },
  temple: {
    id: 'temple', name: 'Temple', cost: 30,
    summary: 'Culture (effect comes later)',
    effects: { culture: 1 },
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

/** Order the AI works through buildings once its cities are defended and it has expanded. */
export const AI_BUILDING_ORDER: BuildingId[] = ['granary', 'library', 'marketplace', 'temple', 'barracks', 'walls'];

/** How many cities an AI tries to reach with settlers before switching to buildings. */
export const AI_TARGET_CITIES = 4;
