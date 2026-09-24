// Unit table. Combat values (attack/defense) are stored and shown now but unused until
// Milestone 4. `requires` is the tech that unlocks the unit (none = available from the
// start). Costs and strengths are placeholders until the balance pass.

import type { TechId } from './techs';

export type UnitTypeId =
  | 'settler' | 'warrior' | 'archer' | 'spearman' | 'horseman' | 'chariot' | 'legion'
  | 'catapult' | 'pikeman' | 'knight' | 'musketman' | 'cannon' | 'rifleman' | 'artillery'
  | 'tank';

export interface UnitDef {
  id: UnitTypeId;
  name: string;
  /** Short placeholder glyph (1–2 letters) drawn on the map until the art pass. */
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
  /** Tech needed to build it. */
  requires?: TechId;
}

function unit(
  id: UnitTypeId, name: string, glyph: string, cost: number,
  attack: number, defense: number, moves: number, requires?: TechId,
): UnitDef {
  return { id, name, glyph, cost, moves, sight: 1, attack, defense, canFoundCity: false, popCost: 0, requires };
}

export const UNITS: Record<UnitTypeId, UnitDef> = {
  settler: {
    id: 'settler', name: 'Settler', glyph: 'S', cost: 30,
    moves: 1, sight: 1, attack: 0, defense: 1, canFoundCity: true, popCost: 1,
  },
  //                   name          glyph cost att def mv  tech
  warrior: unit('warrior', 'Warrior', 'W', 10, 1, 1, 1),
  archer: unit('archer', 'Archer', 'Ar', 20, 3, 2, 1, 'archery'),
  spearman: unit('spearman', 'Spearman', 'Sp', 20, 1, 3, 1, 'bronze_working'),
  horseman: unit('horseman', 'Horseman', 'Ho', 20, 2, 1, 2, 'horseback_riding'),
  chariot: unit('chariot', 'Chariot', 'Ch', 30, 3, 1, 2, 'the_wheel'),
  legion: unit('legion', 'Legion', 'Lg', 30, 4, 2, 1, 'iron_working'),
  catapult: unit('catapult', 'Catapult', 'Ca', 40, 6, 1, 1, 'mathematics'),
  pikeman: unit('pikeman', 'Pikeman', 'Pk', 30, 1, 4, 1, 'feudalism'),
  knight: unit('knight', 'Knight', 'Kn', 40, 4, 2, 2, 'chivalry'),
  musketman: unit('musketman', 'Musketman', 'Mu', 40, 3, 6, 1, 'gunpowder'),
  cannon: unit('cannon', 'Cannon', 'Cn', 50, 8, 1, 1, 'metallurgy'),
  rifleman: unit('rifleman', 'Rifleman', 'Ri', 50, 5, 8, 1, 'conscription'),
  artillery: unit('artillery', 'Artillery', 'At', 60, 10, 2, 1, 'machine_tools'),
  tank: unit('tank', 'Tank', 'Tk', 80, 12, 8, 3, 'automobile'),
};

export const UNIT_IDS = Object.keys(UNITS) as UnitTypeId[];
