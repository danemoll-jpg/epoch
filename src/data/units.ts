// Unit table. Attack and defense feed combat (src/game/combat.ts); a unit with 0 attack
// can't attack. `requires` is the tech that unlocks the unit (none = available from the
// start). Costs and strengths are placeholders until the balance pass.
//
// Ships (Round 8) move only on water (and into their own coastal cities), carry `cargo`
// land units, and are built only in coastal cities. See src/game/naval.ts.

import type { TechId } from './techs';

export type UnitTypeId =
  | 'settler' | 'warrior' | 'archer' | 'spearman' | 'horseman' | 'chariot' | 'legion'
  | 'catapult' | 'pikeman' | 'knight' | 'musketman' | 'cannon' | 'rifleman' | 'artillery'
  | 'tank'
  // Ships (Round 8)
  | 'galley' | 'caravel' | 'frigate' | 'ironclad' | 'transport' | 'destroyer' | 'battleship'
  | 'submarine' | 'carrier';

/** Land units walk; sea units sail (Round 8). Air comes in round 10. */
export type UnitDomain = 'land' | 'sea';

export interface UnitDef {
  id: UnitTypeId;
  name: string;
  /** Short glyph (1–2 letters): the fallback drawn while (or if) its icon can't be shown. */
  glyph: string;
  /**
   * The unit's icon: a file `src/assets/icons/<icon>.svg`, credited in icons.ts (Round 7,
   * Dan's picks from game-icons.net). Ships have none yet (Dan picks them from the round 8
   * candidates page), so they show their letters.
   */
  icon?: string;
  domain: UnitDomain;
  /** Land units a ship can carry (an army counts as one). 0 = none. */
  cargo: number;
  /** A ship that can't leave the coast (the Galley): it can't enter deep ocean. */
  coastOnly?: boolean;
  /** Hidden from rivals unless one of their units or cities is right next to it (the Submarine). */
  stealth?: boolean;
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
  return { id, name, glyph, icon, domain: 'land', cargo: 0, cost, moves, sight: 1, attack, defense, canFoundCity: false, popCost: 0, requires };
}

function ship(
  id: UnitTypeId, name: string, glyph: string, cost: number,
  attack: number, defense: number, moves: number, sight: number, cargo: number, requires: TechId,
  extra: Partial<UnitDef> = {},
): UnitDef {
  return { id, name, glyph, domain: 'sea', cargo, cost, moves, sight, attack, defense, canFoundCity: false, popCost: 0, requires, ...extra };
}

export const UNITS: Record<UnitTypeId, UnitDef> = {
  settler: {
    id: 'settler', name: 'Settler', glyph: 'S', icon: 'old-wagon', domain: 'land', cargo: 0, cost: 30,
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
  // Ships (Round 8).   name          glyph cost att def mv sight cargo tech
  galley: ship('galley', 'Galley', 'Ga', 30, 1, 1, 3, 1, 2, 'map_making', { coastOnly: true }),
  caravel: ship('caravel', 'Caravel', 'Cv', 40, 1, 2, 3, 2, 3, 'navigation'),
  frigate: ship('frigate', 'Frigate', 'Fr', 50, 4, 3, 4, 2, 2, 'magnetism'),
  ironclad: ship('ironclad', 'Ironclad', 'Ic', 60, 7, 5, 4, 1, 0, 'steam_engine'),
  transport: ship('transport', 'Transport', 'Tr', 50, 0, 4, 5, 1, 8, 'industrialization'),
  destroyer: ship('destroyer', 'Destroyer', 'De', 60, 8, 6, 6, 2, 0, 'combustion'),
  battleship: ship('battleship', 'Battleship', 'Bs', 120, 16, 12, 4, 2, 0, 'automobile'),
  submarine: ship('submarine', 'Submarine', 'Su', 70, 14, 3, 4, 2, 0, 'combustion', { stealth: true }),
  carrier: ship('carrier', 'Carrier', 'Cr', 100, 2, 14, 4, 2, 0, 'flight'),
};

export const UNIT_IDS = Object.keys(UNITS) as UnitTypeId[];
