// Map sizes (Round 13, M9 part 1). Normal is the map the game has always had (RULES.map and
// friends). A size changes the grid, how many rivals fit, the continent layout, how far apart
// civs start, and the caps on villages and huts (their counts already follow the land area;
// the caps keep a big map from filling up, or a small one from going empty). Resources follow
// the tile count on their own (a chance per tile). `victoryPct` scales the culture and gold
// goals so a game still ends around turn 200–250 (100 = the goals in victory.ts).

import { BARBARIANS, HUTS } from './barbarians';
import { RULES } from './rules';
import { VICTORY } from './victory';

export type MapSizeId = 'small' | 'normal' | 'large' | 'huge' | 'epic';

export interface MapSizeDef {
  id: MapSizeId;
  name: string;
  /** A few words for the setup screen. */
  summary: string;
  width: number;
  height: number;
  /** AI rivals allowed (1..maxRivals). */
  maxRivals: number;
  /** Rivals when you pick this size (the setup screen's starting value). */
  defaultRivals: number;
  /** Map shape: the continent layout (RULES.map with these changes). */
  shape: Partial<typeof RULES.map>;
  /** Start positions at least this far apart (Chebyshev) when possible. */
  minStartDistance: number;
  villages: { min: number; max: number };
  huts: { min: number; max: number };
  victoryPct: number;
  /**
   * Round 14: techs cost this much more (percent; 0 = as on Normal). On the biggest maps every
   * civ has more cities and more science, and games ended by the spaceship ~20 turns early.
   */
  techCostPct: number;
  /**
   * Round 14: offered everywhere, but the setup screen notes on a touch device that it runs
   * best on a computer (its computer turns are slow on an iPad).
   */
  bestOnComputer?: boolean;
}

export const MAP_SIZES: Record<MapSizeId, MapSizeDef> = {
  small: {
    id: 'small',
    name: 'Small',
    summary: '24×18 · up to 3 rivals · a quicker game',
    width: 24,
    height: 18,
    maxRivals: 3,
    defaultRivals: 3,
    shape: { continentsMin: 2, continentsMax: 3, continentSpacing: 8, minStartLandmass: 14 },
    minStartDistance: 6,
    villages: { min: 2, max: 5 },
    huts: { min: 3, max: 8 },
    victoryPct: 100,
    techCostPct: 0,
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    summary: '32×24 · up to 4 rivals · the usual map',
    width: RULES.mapWidth,
    height: RULES.mapHeight,
    maxRivals: RULES.defaultPlayers - 1,
    defaultRivals: RULES.defaultPlayers - 1,
    shape: {},
    minStartDistance: RULES.minStartDistance,
    villages: { min: BARBARIANS.minVillages, max: BARBARIANS.maxVillages },
    huts: { min: HUTS.minHuts, max: HUTS.maxHuts },
    victoryPct: 100,
    techCostPct: 0,
  },
  large: {
    id: 'large',
    name: 'Large',
    summary: '44×32 · up to 5 rivals · more room, longer turns',
    width: 44,
    height: 32,
    maxRivals: 5,
    defaultRivals: 5,
    shape: { continentsMin: 4, continentsMax: 5, continentSpacing: 10 },
    minStartDistance: 8,
    villages: { min: 5, max: 13 },
    huts: { min: 6, max: 20 },
    // More civs and more cities make culture and gold faster: without this, Large games ended
    // around turn 169 in the sim (Normal: ~195).
    victoryPct: 125,
    techCostPct: 0,
  },
  // Round 14 (Dan: "Large looked kind of small overall"): a few big continents of different
  // sizes (continentWeight) plus chains of small islands in the open sea.
  huge: {
    id: 'huge',
    name: 'Huge',
    summary: '64×44 · up to 5 rivals · big continents and island chains',
    width: 64,
    height: 44,
    maxRivals: 5,
    defaultRivals: 5,
    shape: { continentsMin: 5, continentsMax: 6, continentSpacing: 14, continentWeight: 6, channelWidth: 3.5, channelDepth: 0.7, islandChains: 5, minStartLandmass: 30 },
    minStartDistance: 11,
    villages: { min: 8, max: 20 },
    huts: { min: 10, max: 30 },
    // Calibrated in the sim (Round 14, 8 games each): with Large's ×1.25 and no tech change,
    // Huge games ended around turn 185 and Epic ones around 181, sooner than Normal (~192): every
    // civ has more cities, so more culture, gold, and science. These bring them to about 200.
    victoryPct: 165,
    techCostPct: 35,
  },
  epic: {
    id: 'epic',
    name: 'Epic',
    summary: '80×56 · up to 5 rivals · the biggest world, the longest turns',
    width: 80,
    height: 56,
    maxRivals: 5,
    defaultRivals: 5,
    shape: { continentsMin: 6, continentsMax: 7, continentSpacing: 16, continentWeight: 7, channelWidth: 3.5, channelDepth: 0.7, islandChains: 8, minStartLandmass: 36 },
    minStartDistance: 13,
    villages: { min: 10, max: 26 },
    huts: { min: 12, max: 38 },
    victoryPct: 150,
    techCostPct: 25,
    bestOnComputer: true,
  },
};

export const MAP_SIZE_IDS: MapSizeId[] = ['small', 'normal', 'large', 'huge', 'epic'];

export const DEFAULT_MAP_SIZE: MapSizeId = 'normal';

/** RULES.map with the size's changes. */
export function mapShape(size: MapSizeId): typeof RULES.map {
  return { ...RULES.map, ...MAP_SIZES[size].shape };
}

/** The culture and gold goals on this map size (VICTORY's, scaled by `victoryPct`, rounded to 50). */
export function victoryGoals(size: MapSizeId | undefined): { culture: number; gold: number } {
  const pct = MAP_SIZES[size ?? DEFAULT_MAP_SIZE].victoryPct;
  const scale = (n: number) => Math.round((n * pct) / 100 / 50) * 50;
  return { culture: scale(VICTORY.cultureGoal), gold: scale(VICTORY.goldGoal) };
}
