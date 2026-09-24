// Map resources (Round 9, Milestone 7): special tiles with extra yields. Bonuses only, never
// "needs Iron to build" rules (Civ Rev style, Q14). A city working the tile (or standing on
// it) gets the bonus on top of the terrain.
//
// Hidden resources (Iron, Aluminum, Rubber, Oil) aren't shown on the map and give nothing
// until they're revealed: on that tile for everyone, by destroying a barbarian village that
// stands on it; or everywhere, for a civ that learns the resource's `revealedBy` tech.
//
// Placement is seeded and fair (see src/game/resources.ts): every tile has a small chance of
// a resource its terrain allows, and every civ's start gets a few food or production ones
// nearby. Numbers are placeholders until the balance pass. Each resource has an `icon` (Dan's
// round 9 picks, wired in round 10; credited in icons.ts); its letters are the fallback.

import type { TechId } from './techs';
import type { TerrainId, Yields } from './terrain';

export type ResourceId =
  | 'wheat' | 'cattle' | 'game' | 'fish' | 'whales' | 'oasis' | 'spices' | 'silk' | 'wine'
  | 'gold' | 'gems' | 'iron' | 'aluminum' | 'rubber' | 'oil';

export interface ResourceDef {
  id: ResourceId;
  name: string;
  /** Fallback (1–2 letters) while (or if) its icon can't be drawn. */
  glyph: string;
  /** Its icon: a file `src/assets/icons/<icon>.svg`, credited in icons.ts (Dan's picks). */
  icon: string;
  /** Terrains it can sit on. */
  terrains: TerrainId[];
  /** Added to the tile's terrain yields. */
  bonus: Yields;
  /** Not shown, and no bonus, until revealed (a village destroyed on the tile, or the tech below). */
  hidden?: boolean;
  /** Learning this tech reveals every resource of this kind to that civ. */
  revealedBy?: TechId;
  /** How often it's picked among the resources a tile's terrain allows. */
  weight: number;
}

function res(id: ResourceId, name: string, glyph: string, icon: string, terrains: TerrainId[], food: number, production: number, trade: number, weight: number, extra: Partial<ResourceDef> = {}): ResourceDef {
  return { id, name, glyph, icon, terrains, bonus: { food, production, trade }, weight, ...extra };
}

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  //            name        glyph icon  terrains                     food prod trade weight
  wheat: res('wheat', 'Wheat', 'Wh', 'wheat', ['plains'], 2, 0, 0, 3),
  cattle: res('cattle', 'Cattle', 'Ct', 'cow', ['grassland'], 1, 1, 0, 3),
  game: res('game', 'Game', 'Ga', 'stag-head', ['forest'], 2, 0, 0, 3),
  fish: res('fish', 'Fish', 'Fi', 'circling-fish', ['coast'], 2, 0, 0, 3),
  whales: res('whales', 'Whales', 'Wl', 'sperm-whale', ['ocean', 'coast'], 1, 1, 1, 2),
  oasis: res('oasis', 'Oasis', 'Oa', 'oasis', ['desert'], 3, 0, 0, 3),
  spices: res('spices', 'Spices', 'Sp', 'chili-pepper', ['grassland'], 0, 0, 2, 2),
  silk: res('silk', 'Silk', 'Si', 'kimono', ['forest'], 0, 0, 2, 2),
  wine: res('wine', 'Wine', 'Wi', 'wine-bottle', ['plains'], 0, 0, 2, 2),
  gold: res('gold', 'Gold', 'Au', 'gold-bar', ['hills', 'mountains'], 0, 0, 3, 2),
  gems: res('gems', 'Gems', 'Ge', 'cut-diamond', ['hills', 'mountains'], 0, 1, 2, 2),
  // Hidden until revealed.
  iron: res('iron', 'Iron', 'Fe', 'anvil', ['hills'], 0, 3, 0, 3, { hidden: true, revealedBy: 'iron_working' }),
  aluminum: res('aluminum', 'Aluminum', 'Al', 'soda-can', ['hills', 'mountains'], 0, 3, 1, 2, { hidden: true, revealedBy: 'electricity' }),
  rubber: res('rubber', 'Rubber', 'Ru', 'car-wheel', ['forest'], 0, 2, 1, 2, { hidden: true, revealedBy: 'industrialization' }),
  oil: res('oil', 'Oil', 'Oi', 'oil-drum', ['desert'], 0, 3, 0, 3, { hidden: true, revealedBy: 'refining' }),
};

export const RESOURCE_IDS = Object.keys(RESOURCES) as ResourceId[];

export const RESOURCE_RULES = {
  /** Chance (percent) that a tile gets a resource its terrain allows. */
  tileChancePct: 6,
  /** No two resources closer than this (Chebyshev), so they spread out. */
  minSpacing: 2,
  /** Every civ start gets at least this many food or production resources within `startRadius`. */
  startMinimum: 2,
  startRadius: 2,
  /** A barbarian village sits on a hidden resource this often, when its terrain allows one. */
  villageHiddenPct: 40,
};
