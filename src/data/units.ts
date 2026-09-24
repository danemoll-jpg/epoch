// Unit table. Attack and defense feed combat (src/game/combat.ts); a unit with 0 attack
// can't attack. `requires` is the tech that unlocks the unit (none = available from the
// start). Costs and strengths are placeholders until the balance pass.

import type { TechId } from './techs';

export type UnitTypeId =
  | 'settler' | 'warrior' | 'archer' | 'spearman' | 'horseman' | 'chariot' | 'legion'
  | 'catapult' | 'pikeman' | 'knight' | 'musketman' | 'cannon' | 'rifleman' | 'artillery'
  | 'tank';

export interface UnitDef {
  id: UnitTypeId;
  name: string;
  /** Short glyph (1–2 letters): the fallback drawn while (or if) its icon can't be shown. */
  glyph: string;
  /**
   * The unit's icon: a file `src/assets/icons/<icon>.svg`, credited in icons.ts (Round 7,
   * Dan's picks from game-icons.net).
   */
  icon: string;
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
  id: UnitTypeId, name: string, glyph: string, icon: string, cost: number,
  attack: number, defense: number, moves: number, requires?: TechId,
): UnitDef {
  return { id, name, glyph, icon, cost, moves, sight: 1, attack, defense, canFoundCity: false, popCost: 0, requires };
}

export const UNITS: Record<UnitTypeId, UnitDef> = {
  settler: {
    id: 'settler', name: 'Settler', glyph: 'S', icon: 'old-wagon', cost: 30,
    moves: 1, sight: 1, attack: 0, defense: 1, canFoundCity: true, popCost: 1,
  },
  //                   name          glyph icon              cost att def mv  tech
  warrior: unit('warrior', 'Warrior', 'W', 'caveman', 10, 1, 1, 1),
  archer: unit('archer', 'Archer', 'Ar', 'bowman', 20, 3, 2, 1, 'archery'),
  spearman: unit('spearman', 'Spearman', 'Sp', 'spartan', 20, 1, 3, 1, 'bronze_working'),
  horseman: unit('horseman', 'Horseman', 'Ho', 'horse-head', 20, 2, 1, 2, 'horseback_riding'),
  chariot: unit('chariot', 'Chariot', 'Ch', 'chariot', 30, 3, 1, 2, 'the_wheel'),
  legion: unit('legion', 'Legion', 'Lg', 'centurion-helmet', 30, 4, 2, 1, 'iron_working'),
  catapult: unit('catapult', 'Catapult', 'Ca', 'catapult', 40, 6, 1, 1, 'mathematics'),
  pikeman: unit('pikeman', 'Pikeman', 'Pk', 'pikeman', 30, 1, 4, 1, 'feudalism'),
  knight: unit('knight', 'Knight', 'Kn', 'mounted-knight', 40, 4, 2, 2, 'chivalry'),
  musketman: unit('musketman', 'Musketman', 'Mu', 'blunderbuss', 40, 3, 6, 1, 'gunpowder'),
  cannon: unit('cannon', 'Cannon', 'Cn', 'cannon', 50, 8, 1, 1, 'metallurgy'),
  rifleman: unit('rifleman', 'Rifleman', 'Ri', 'lee-enfield', 50, 5, 8, 1, 'conscription'),
  artillery: unit('artillery', 'Artillery', 'At', 'mortar', 60, 10, 2, 1, 'machine_tools'),
  tank: unit('tank', 'Tank', 'Tk', 'tank', 80, 12, 8, 3, 'automobile'),
};

export const UNIT_IDS = Object.keys(UNITS) as UnitTypeId[];
