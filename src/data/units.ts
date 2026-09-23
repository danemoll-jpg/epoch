// Unit table. Combat values are carried now but unused until Milestone 4.

export type UnitTypeId = 'settler' | 'warrior';

export interface UnitDef {
  id: UnitTypeId;
  name: string;
  /** One-letter placeholder glyph drawn on the map until the art pass. */
  glyph: string;
  moves: number;
  sight: number;
  attack: number;
  defense: number;
  canFoundCity: boolean;
}

export const UNITS: Record<UnitTypeId, UnitDef> = {
  settler: {
    id: 'settler', name: 'Settler', glyph: 'S',
    moves: 1, sight: 1, attack: 0, defense: 1, canFoundCity: true,
  },
  warrior: {
    id: 'warrior', name: 'Warrior', glyph: 'W',
    moves: 1, sight: 1, attack: 1, defense: 1, canFoundCity: false,
  },
};
