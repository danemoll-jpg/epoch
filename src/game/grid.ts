// Square-grid helpers. Moves are 8-directional (diagonals allowed), so distance is Chebyshev.

import type { Coord, GameMap, Tile } from './types';

export const NEIGHBOR_OFFSETS: readonly Coord[] = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 },
];

export function inBounds(map: GameMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function tileIndex(map: GameMap, x: number, y: number): number {
  return y * map.width + x;
}

export function tileAt(map: GameMap, x: number, y: number): Tile | undefined {
  if (!inBounds(map, x, y)) return undefined;
  return map.tiles[tileIndex(map, x, y)];
}

export function distance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function neighbors(map: GameMap, c: Coord): Coord[] {
  const out: Coord[] = [];
  for (const o of NEIGHBOR_OFFSETS) {
    const x = c.x + o.x;
    const y = c.y + o.y;
    if (inBounds(map, x, y)) out.push({ x, y });
  }
  return out;
}

/** All in-bounds tiles within Chebyshev radius r of c (including c). */
export function tilesInRadius(map: GameMap, c: Coord, r: number): Coord[] {
  const out: Coord[] = [];
  for (let y = c.y - r; y <= c.y + r; y++) {
    for (let x = c.x - r; x <= c.x + r; x++) {
      if (inBounds(map, x, y)) out.push({ x, y });
    }
  }
  return out;
}
