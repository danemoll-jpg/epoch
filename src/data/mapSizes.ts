// Map sizes (Round 13, M9 part 1). Normal is the map the game has always had (RULES.map and
// friends). A size changes the grid, how many rivals fit, the continent layout, how far apart
// civs start, and the caps on villages and huts (their counts already follow the land area;
// the caps keep a big map from filling up, or a small one from going empty). Resources follow
// the tile count on their own (a chance per tile). `victoryPct` scales the culture and gold
// goals so a game still ends around turn 200–250 (100 = the goals in victory.ts).

import { BARBARIANS, HUTS } from './barbarians';
import { RULES } from './rules';
import { VICTORY } from './victory';

export type MapSizeId = 'small' | 'normal' | 'large';

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
  },
};

export const MAP_SIZE_IDS: MapSizeId[] = ['small', 'normal', 'large'];

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
