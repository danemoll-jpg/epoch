// Seeded map generation: layered value noise for elevation and moisture, an edge falloff so
// the map reads as continents in an ocean, then percentile thresholds so land share and
// terrain mix are stable from seed to seed.

import { TERRAIN, yieldScore, type TerrainId } from '../data/terrain';
import { distance, inBounds, neighbors, tileIndex, tilesInRadius } from './grid';
import { nextFloat, type RngHolder } from './rng';
import type { Coord, GameMap } from './types';

export interface MapGenOptions {
  width: number;
  height: number;
  /** Fraction of tiles that are land (before coast marking). */
  landShare?: number;
}

function valueNoiseLayer(rng: RngHolder, w: number, h: number, spacing: number): number[] {
  const gw = Math.ceil(w / spacing) + 2;
  const gh = Math.ceil(h / spacing) + 2;
  const grid: number[] = [];
  for (let i = 0; i < gw * gh; i++) grid.push(nextFloat(rng));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const out: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / spacing;
      const gy = y / spacing;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const v00 = grid[y0 * gw + x0]!;
      const v10 = grid[y0 * gw + x0 + 1]!;
      const v01 = grid[(y0 + 1) * gw + x0]!;
      const v11 = grid[(y0 + 1) * gw + x0 + 1]!;
      const a = v00 + (v10 - v00) * tx;
      const b = v01 + (v11 - v01) * tx;
      out.push(a + (b - a) * ty);
    }
  }
  return out;
}

function fractalNoise(rng: RngHolder, w: number, h: number): number[] {
  const layers: Array<[number, number]> = [[8, 0.6], [4, 0.3], [2, 0.1]];
  const out = new Array<number>(w * h).fill(0);
  for (const [spacing, weight] of layers) {
    const layer = valueNoiseLayer(rng, w, h, spacing);
    for (let i = 0; i < out.length; i++) out[i]! += layer[i]! * weight;
  }
  return out;
}

/** Value at the given fraction (0..1) of the sorted list. */
function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * sorted.length)));
  return sorted[i]!;
}

export function generateMap(rng: RngHolder, opts: MapGenOptions): GameMap {
  const { width: w, height: h } = opts;
  const landShare = opts.landShare ?? 0.45;
  const elevation = fractalNoise(rng, w, h);
  const moisture = fractalNoise(rng, w, h);

  // Edge falloff: push the border toward ocean so land doesn't run off the map.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.min(x, w - 1 - x) / (w / 2);
      const dy = Math.min(y, h - 1 - y) / (h / 2);
      const edge = Math.min(dx, dy);
      const falloff = edge < 0.25 ? (0.25 - edge) * 1.6 : 0;
      elevation[y * w + x]! -= falloff;
    }
  }

  const seaLevel = percentile(elevation, 1 - landShare);
  const landIdx: number[] = [];
  for (let i = 0; i < w * h; i++) if (elevation[i]! > seaLevel) landIdx.push(i);
  const landElev = landIdx.map((i) => elevation[i]!);
  const landMoist = landIdx.map((i) => moisture[i]!);
  const mountainLine = percentile(landElev, 0.94);
  const hillLine = percentile(landElev, 0.82);
  const desertLine = percentile(landMoist, 0.12);
  const plainsLine = percentile(landMoist, 0.45);
  const forestLine = percentile(landMoist, 0.78);

  const terrain: TerrainId[] = new Array<TerrainId>(w * h).fill('ocean');
  for (const i of landIdx) {
    const e = elevation[i]!;
    const m = moisture[i]!;
    let t: TerrainId;
    if (e >= mountainLine) t = 'mountains';
    else if (e >= hillLine) t = 'hills';
    else if (m < desertLine) t = 'desert';
    else if (m < plainsLine) t = 'plains';
    else if (m < forestLine) t = 'grassland';
    else t = 'forest';
    terrain[i] = t;
  }

  const map: GameMap = { width: w, height: h, tiles: terrain.map((t) => ({ terrain: t })) };

  // Water next to land becomes coast.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = tileIndex(map, x, y);
      if (terrain[i] !== 'ocean') continue;
      const nearLand = neighbors(map, { x, y }).some(
        (n) => !TERRAIN[terrain[tileIndex(map, n.x, n.y)]!].isWater,
      );
      if (nearLand) map.tiles[i] = { terrain: 'coast' };
    }
  }
  return map;
}

/** Size of each land-passable connected region, keyed by tile index. */
export function landRegionSizes(map: GameMap): number[] {
  const sizes = new Array<number>(map.tiles.length).fill(0);
  const seen = new Array<boolean>(map.tiles.length).fill(false);
  for (let start = 0; start < map.tiles.length; start++) {
    if (seen[start] || !TERRAIN[map.tiles[start]!.terrain].landPassable) continue;
    const region: number[] = [];
    const stack = [start];
    seen[start] = true;
    while (stack.length) {
      const i = stack.pop()!;
      region.push(i);
      const c = { x: i % map.width, y: Math.floor(i / map.width) };
      for (const n of neighbors(map, c)) {
        const j = tileIndex(map, n.x, n.y);
        if (seen[j] || !TERRAIN[map.tiles[j]!.terrain].landPassable) continue;
        seen[j] = true;
        stack.push(j);
      }
    }
    for (const i of region) sizes[i] = region.length;
  }
  return sizes;
}

/** How good a spot is for a city: yields of the tiles around it. */
export function siteScore(map: GameMap, c: Coord): number {
  let score = 0;
  for (const t of tilesInRadius(map, c, 2)) {
    const def = TERRAIN[map.tiles[tileIndex(map, t.x, t.y)]!.terrain];
    score += def.id === 'ocean' ? 1 : yieldScore(def.yields);
  }
  return score;
}

const MIN_START_REGION = 15;

/**
 * Picks up to `count` start positions, spread out as far as the land allows. Returns fewer
 * than `count` only if the map truly has too few usable tiles; callers regenerate then.
 */
export function findStartPositions(
  map: GameMap,
  rng: RngHolder,
  count: number,
  minDistance: number,
): Coord[] {
  const regionSizes = landRegionSizes(map);
  const candidates: Array<{ c: Coord; score: number }> = [];
  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      const i = tileIndex(map, x, y);
      const t = map.tiles[i]!.terrain;
      if (t !== 'grassland' && t !== 'plains' && t !== 'hills') continue;
      if (regionSizes[i]! < MIN_START_REGION) continue;
      candidates.push({ c: { x, y }, score: siteScore(map, { x, y }) + nextFloat(rng) * 4 });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const chosen: Coord[] = [];
  let spacing = minDistance;
  while (chosen.length < count && spacing >= 3) {
    const next = candidates.find(
      (cand) => chosen.every((c) => distance(c, cand.c) >= spacing),
    );
    if (next) chosen.push(next.c);
    else spacing--;
  }
  return chosen.filter((c) => inBounds(map, c.x, c.y));
}
