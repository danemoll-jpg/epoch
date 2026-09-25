// Unit table. Attack and defense feed combat (src/game/combat.ts); a unit with 0 attack
// can't attack. `requires` is the tech that unlocks the unit (none = available from the
// start). Costs and strengths are placeholders until the balance pass.
//
// Ships (Round 8) move only on water (and into their own coastal cities), carry `cargo`
// land units, and are built only in coastal cities. See src/game/naval.ts.
//
// Aircraft (Round 10, see src/game/air.ts) are based in a friendly city or on a Carrier.
// Each turn one either strikes a target within `range` tiles and returns to its base, or
// rebases to another city or Carrier within range. They never stand on open map tiles, so
// there's no fuel or crash rule. The Helicopter is different: it `hover`s, moving like a land
// unit over any terrain (water too) at 1 move a tile, and can end its turn anywhere.

import type { TechId } from './techs';

export type UnitTypeId =
  | 'settler' | 'warrior' | 'archer' | 'spearman' | 'horseman' | 'chariot' | 'legion'
  | 'catapult' | 'pikeman' | 'knight' | 'musketman' | 'cannon' | 'rifleman' | 'artillery'
  | 'tank'
  // Ships (Round 8)
  | 'galley' | 'caravel' | 'frigate' | 'ironclad' | 'transport' | 'destroyer' | 'battleship'
  | 'submarine' | 'carrier'
  // Aircraft (Round 10)
  | 'fighter' | 'bomber' | 'jet_fighter' | 'stealth_bomber' | 'helicopter'
  // Religion (Round 12)
  | 'missionary';

/** Land units walk; sea units sail (Round 8); air units fly from a base (Round 10). */
export type UnitDomain = 'land' | 'sea' | 'air';

export interface UnitDef {
  id: UnitTypeId;
  name: string;
  /** Short glyph (1–2 letters): the fallback drawn while (or if) its icon can't be shown. */
  glyph: string;
  /**
   * The unit's icon: a file `src/assets/icons/<icon>.svg`, credited in icons.ts (Round 7,
   * Dan's picks from game-icons.net; ships from his round 8 picks).
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
  /** A second tech it also needs (the Stealth Bomber: Advanced Flight and Computers). */
  alsoRequires?: TechId;
  /** Aircraft (Round 10): how far (tiles) it can strike or rebase from its base. */
  range?: number;
  /**
   * Aircraft: its strength against other aircraft (intercepting a strike, or attacking a
   * Helicopter). 0 or absent = it can't intercept (bombers).
   */
  airAttack?: number;
  /** Aircraft: interceptors fighting it lose this much strength (the Stealth Bomber). */
  evadePct?: number;
  /** Aircraft a ship carries (the Carrier). */
  airCargo?: number;
  /** The Helicopter: moves like a land unit over any terrain and water, 1 move a tile; can't capture. */
  hover?: boolean;
  /** Round 11 (leader bonuses): a unit on horseback (Charlemagne), or a siege weapon or bomber (Kim Jong Un). */
  mounted?: boolean;
  siege?: boolean;
  /**
   * Round 12: the Missionary. It carries the religion of the city that built it (which must
   * follow one) and can spread it `charges` times (src/game/religion.ts). Buildable with its
   * `requires` tech (Monotheism) or by a civ that knows its city's religion's founding tech.
   */
  spreadsReligion?: boolean;
  /** Round 12: its icon is still being picked (letters until then; the icon test allows it). */
  iconPending?: boolean;
}

function unit(
  id: UnitTypeId, name: string, glyph: string, icon: string, cost: number,
  attack: number, defense: number, moves: number, requires?: TechId, extra: Partial<UnitDef> = {},
): UnitDef {
  return { id, name, glyph, icon, domain: 'land', cargo: 0, cost, moves, sight: 1, attack, defense, canFoundCity: false, popCost: 0, requires, ...extra };
}

function ship(
  id: UnitTypeId, name: string, glyph: string, cost: number,
  attack: number, defense: number, moves: number, sight: number, cargo: number, requires: TechId,
  extra: Partial<UnitDef> = {},
): UnitDef {
  return { id, name, glyph, domain: 'sea', cargo, cost, moves, sight, attack, defense, canFoundCity: false, popCost: 0, requires, ...extra };
}

function aircraft(
  id: UnitTypeId, name: string, glyph: string, icon: string, cost: number,
  attack: number, defense: number, range: number, airAttack: number, requires: TechId,
  extra: Partial<UnitDef> = {},
): UnitDef {
  return { id, name, glyph, icon, domain: 'air', cargo: 0, cost, moves: 1, sight: 2, attack, defense, canFoundCity: false, popCost: 0, requires, range, airAttack, ...extra };
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
  horseman: unit('horseman', 'Horseman', 'Ho', 'horse-head', 20, 2, 1, 2, 'horseback_riding', { mounted: true }),
  chariot: unit('chariot', 'Chariot', 'Ch', 'chariot', 30, 3, 1, 2, 'the_wheel', { mounted: true }),
  legion: unit('legion', 'Legion', 'Lg', 'centurion-helmet', 30, 4, 2, 1, 'iron_working'),
  catapult: unit('catapult', 'Catapult', 'Ca', 'catapult', 40, 6, 1, 1, 'mathematics', { siege: true }),
  pikeman: unit('pikeman', 'Pikeman', 'Pk', 'pikeman', 30, 1, 4, 1, 'feudalism'),
  knight: unit('knight', 'Knight', 'Kn', 'mounted-knight', 40, 4, 2, 2, 'chivalry', { mounted: true }),
  musketman: unit('musketman', 'Musketman', 'Mu', 'blunderbuss', 40, 3, 6, 1, 'gunpowder'),
  cannon: unit('cannon', 'Cannon', 'Cn', 'cannon', 50, 8, 1, 1, 'metallurgy', { siege: true }),
  rifleman: unit('rifleman', 'Rifleman', 'Ri', 'lee-enfield', 50, 5, 8, 1, 'conscription'),
  artillery: unit('artillery', 'Artillery', 'At', 'mortar', 60, 10, 2, 1, 'machine_tools', { siege: true }),
  tank: unit('tank', 'Tank', 'Tk', 'tank', 80, 12, 8, 3, 'automobile'),
  // Ships (Round 8).   name          glyph cost att def mv sight cargo tech
  galley: ship('galley', 'Galley', 'Ga', 30, 1, 1, 3, 1, 2, 'map_making', { icon: 'drakkar', coastOnly: true }),
  caravel: ship('caravel', 'Caravel', 'Cv', 40, 1, 2, 3, 2, 3, 'navigation', { icon: 'caravel' }),
  frigate: ship('frigate', 'Frigate', 'Fr', 50, 4, 3, 4, 2, 2, 'magnetism', { icon: 'shooner-sailboat' }),
  ironclad: ship('ironclad', 'Ironclad', 'Ic', 60, 7, 5, 4, 1, 0, 'steam_engine', { icon: 'paddle-steamer' }),
  transport: ship('transport', 'Transport', 'Tr', 50, 0, 4, 5, 1, 8, 'industrialization', { icon: 'cargo-ship' }),
  destroyer: ship('destroyer', 'Destroyer', 'De', 60, 8, 6, 6, 2, 0, 'combustion', { icon: 'speed-boat' }),
  battleship: ship('battleship', 'Battleship', 'Bs', 120, 16, 12, 4, 2, 0, 'automobile', { icon: 'battleship' }),
  submarine: ship('submarine', 'Submarine', 'Su', 70, 14, 3, 4, 2, 0, 'combustion', { icon: 'submarine', stealth: true }),
  carrier: ship('carrier', 'Carrier', 'Cr', 100, 2, 14, 4, 2, 0, 'flight', { icon: 'carrier', airCargo: 3 }),
  // Aircraft (Round 10). Attack is a strike on land or sea; defense is its strength when
  // intercepted; airAttack is its strength against aircraft.
  //                  name              glyph icon             cost att def range airAtt tech
  fighter: aircraft('fighter', 'Fighter', 'Fi', 'biplane', 60, 4, 4, 4, 8, 'flight'),
  bomber: aircraft('bomber', 'Bomber', 'Bm', 'carpet-bombing', 80, 12, 3, 6, 0, 'flight', { siege: true }),
  jet_fighter: aircraft('jet_fighter', 'Jet Fighter', 'Jf', 'jet-fighter', 80, 8, 8, 6, 16, 'advanced_flight'),
  stealth_bomber: aircraft('stealth_bomber', 'Stealth Bomber', 'Sb', 'stealth-bomber', 120, 20, 6, 8, 0, 'advanced_flight', {
    alsoRequires: 'computers', evadePct: 50, siege: true,
  }),
  helicopter: {
    id: 'helicopter', name: 'Helicopter', glyph: 'He', icon: 'helicopter', domain: 'land', cargo: 0, cost: 70,
    moves: 5, sight: 2, attack: 10, defense: 4, canFoundCity: false, popCost: 0, requires: 'advanced_flight', hover: true,
  },
  // Round 12: no attack or defense (it can't fight or guard), two moves, 2 spreads.
  missionary: {
    id: 'missionary', name: 'Missionary', glyph: 'Mi', domain: 'land', cargo: 0, cost: 30,
    moves: 2, sight: 1, attack: 0, defense: 0, canFoundCity: false, popCost: 0, requires: 'monotheism',
    spreadsReligion: true, iconPending: true,
  },
};

export const UNIT_IDS = Object.keys(UNITS) as UnitTypeId[];
