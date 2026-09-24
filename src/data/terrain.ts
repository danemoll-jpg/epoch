// Terrain table. Yields and movement costs are placeholders until the balance pass
// (Milestone 6+); keep every number here so tuning never touches logic.

export type TerrainId =
  | 'grassland'
  | 'plains'
  | 'forest'
  | 'hills'
  | 'mountains'
  | 'desert'
  | 'coast'
  | 'ocean';

export interface Yields {
  food: number;
  production: number;
  trade: number;
}

export interface TerrainDef {
  id: TerrainId;
  name: string;
  yields: Yields;
  /** Movement points a land unit spends to enter this tile. */
  moveCost: number;
  /** False means land units can never enter (mountains, water). */
  landPassable: boolean;
  isWater: boolean;
  /** Can a city be founded here? */
  canFoundCity: boolean;
  /** Bonus (percent) for a unit defending on this tile. */
  defensePct: number;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  grassland: {
    id: 'grassland', name: 'Grassland',
    yields: { food: 2, production: 0, trade: 1 },
    moveCost: 1, landPassable: true, isWater: false, canFoundCity: true, defensePct: 0,
  },
  plains: {
    id: 'plains', name: 'Plains',
    yields: { food: 1, production: 1, trade: 1 },
    moveCost: 1, landPassable: true, isWater: false, canFoundCity: true, defensePct: 0,
  },
  forest: {
    id: 'forest', name: 'Forest',
    yields: { food: 1, production: 2, trade: 0 },
    moveCost: 2, landPassable: true, isWater: false, canFoundCity: true, defensePct: 25,
  },
  hills: {
    id: 'hills', name: 'Hills',
    yields: { food: 1, production: 2, trade: 0 },
    moveCost: 2, landPassable: true, isWater: false, canFoundCity: true, defensePct: 50,
  },
  mountains: {
    id: 'mountains', name: 'Mountains',
    yields: { food: 0, production: 1, trade: 0 },
    moveCost: 3, landPassable: false, isWater: false, canFoundCity: false, defensePct: 0,
  },
  desert: {
    id: 'desert', name: 'Desert',
    yields: { food: 0, production: 1, trade: 0 },
    moveCost: 1, landPassable: true, isWater: false, canFoundCity: true, defensePct: 0,
  },
  coast: {
    id: 'coast', name: 'Coast',
    yields: { food: 1, production: 0, trade: 2 },
    moveCost: 1, landPassable: false, isWater: true, canFoundCity: false, defensePct: 0,
  },
  ocean: {
    id: 'ocean', name: 'Ocean',
    yields: { food: 1, production: 0, trade: 1 },
    moveCost: 1, landPassable: false, isWater: true, canFoundCity: false, defensePct: 0,
  },
};

export function yieldScore(y: Yields): number {
  return y.food * 2 + y.production + y.trade;
}
