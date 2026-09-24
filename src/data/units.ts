// Unit table. Combat values are carried now but unused until Milestone 4. Costs are
// placeholders until the balance pass.

export type UnitTypeId = 'settler' | 'warrior';

export interface UnitDef {
  id: UnitTypeId;
  name: string;
  /** One-letter placeholder glyph drawn on the map until the art pass. */
  glyph: string;
  /** Production needed to build one. */
  cost: number;
  moves: number;
  sight: number;
  attack: number;
  defense: number;
  canFoundCity: boolean;
  /**
   * Population the city loses when this unit is finished. The city must be at least one
   * bigger than this to finish it (it waits otherwise).
   */
  popCost: number;
}

export const UNITS: Record<UnitTypeId, UnitDef> = {
  settler: {
    id: 'settler', name: 'Settler', glyph: 'S', cost: 30,
    moves: 1, sight: 1, attack: 0, defense: 1, canFoundCity: true, popCost: 1,
  },
  warrior: {
    id: 'warrior', name: 'Warrior', glyph: 'W', cost: 10,
    moves: 1, sight: 1, attack: 1, defense: 1, canFoundCity: false, popCost: 0,
  },
};

export const UNIT_IDS = Object.keys(UNITS) as UnitTypeId[];
