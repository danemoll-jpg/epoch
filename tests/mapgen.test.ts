import { describe, expect, it } from 'vitest';
import { RULES } from '../src/data/rules';
import { TERRAIN, type TerrainId } from '../src/data/terrain';
import { distance, neighbors, tileIndex } from '../src/game/grid';
import { landRegionSizes } from '../src/game/mapgen';
import { createGame } from '../src/game/newGame';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);

describe('seeded map generation', () => {
  it('same seed gives the same map and starts', () => {
    const a = createGame({ seed: 1234, playerCount: 5 });
    const b = createGame({ seed: 1234, playerCount: 5 });
    expect(b.map).toEqual(a.map);
    expect(b.units).toEqual(a.units);
    expect(b.players.map((p) => p.civId)).toEqual(a.players.map((p) => p.civId));
  });

  it('different seeds give different maps', () => {
    const a = createGame({ seed: 1 });
    const b = createGame({ seed: 2 });
    expect(b.map.tiles).not.toEqual(a.map.tiles);
  });

  it('uses the Milestone 1 size and every terrain type across seeds', () => {
    const seen = new Set<TerrainId>();
    for (const seed of SEEDS.slice(0, 10)) {
      const { map } = createGame({ seed });
      expect(map.width).toBe(32);
      expect(map.height).toBe(24);
      expect(map.tiles).toHaveLength(32 * 24);
      for (const t of map.tiles) seen.add(t.terrain);
    }
    expect([...seen].sort()).toEqual(Object.keys(TERRAIN).sort());
  });

  it('marks water next to land as coast, and open water as ocean', () => {
    const { map } = createGame({ seed: 77 });
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = map.tiles[tileIndex(map, x, y)]!.terrain;
        if (!TERRAIN[t].isWater) continue;
        const nearLand = neighbors(map, { x, y }).some(
          (n) => !TERRAIN[map.tiles[tileIndex(map, n.x, n.y)]!.terrain].isWater,
        );
        expect(t).toBe(nearLand ? 'coast' : 'ocean');
      }
    }
  });

  it('gives all 5 players a reasonable, spread-out start on many seeds', () => {
    for (const seed of SEEDS) {
      const state = createGame({ seed, playerCount: 5 });
      const regions = landRegionSizes(state.map);
      const starts = state.players.filter((p) => p.kind !== 'barbarian').map((p) => state.units.find((u) => u.owner === p.id)!);
      for (const s of starts) {
        const t = state.map.tiles[tileIndex(state.map, s.x, s.y)]!.terrain;
        expect(['grassland', 'plains', 'hills']).toContain(t);
        // Enough land to walk around and found more cities.
        expect(regions[tileIndex(state.map, s.x, s.y)]!).toBeGreaterThanOrEqual(15);
      }
      for (let i = 0; i < starts.length; i++) {
        for (let j = i + 1; j < starts.length; j++) {
          expect(distance(starts[i]!, starts[j]!)).toBeGreaterThanOrEqual(RULES.minCityDistance + 1);
        }
      }
    }
  });
});
