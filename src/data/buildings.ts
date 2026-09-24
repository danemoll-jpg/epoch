// Building table. `requires` is the tech that unlocks each building. Costs and effect
// numbers are placeholders; there's no upkeep yet.

import type { TechId } from './techs';

export type BuildingId = 'granary' | 'barracks' | 'walls' | 'library' | 'marketplace' | 'temple';

export interface BuildingEffects {
  /** Percent of the food box kept after the city grows. */
  foodKeptPct?: number;
  /** Units built in this city start as veterans. */
  veteranUnits?: boolean;
  /** Defense bonus (percent) for units in this city against land attacks. */
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
  /** Tech needed to build it. */
  requires?: TechId;
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
    summary: 'Culture (effect comes later)',
    effects: { culture: 1 },
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

/** Order the AI works through buildings once its cities are defended and it has expanded. */
export const AI_BUILDING_ORDER: BuildingId[] = ['granary', 'library', 'marketplace', 'temple', 'barracks', 'walls'];

