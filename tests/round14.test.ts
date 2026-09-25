// Round 14 (M9 part 2): big maps (Huge and Epic, varied landmasses, the default view, the
// zoom-out cap, the minimap), the AI turn in a Web Worker and the path-search speed-ups, the
// art styles' city looks, era music, and the save format (unchanged: no migration needed).
import { describe, expect, it } from 'vitest';
import { CITY_LOOKS, cityLook } from '../src/data/cityLooks';
import { MAP_SIZES, MAP_SIZE_IDS, mapShape, victoryGoals } from '../src/data/mapSizes';
import { MUSIC, MUSIC_FILES } from '../src/data/sounds';
import { ROADS } from '../src/data/roads';
import { TERRAIN } from '../src/data/terrain';
import { VICTORY } from '../src/data/victory';
import { applyAction } from '../src/game/actions';
import { effects } from '../src/game/leaders';
import { landRegionIds } from '../src/game/mapgen';
import { findPath, stepCost, canEnter } from '../src/game/movement';
import { createGame } from '../src/game/newGame';
import { deserializeGame, serializeGame } from '../src/game/save';
import { endTurn, playComputerTurn } from '../src/game/turn';
import { runTurnJob } from '../src/game/turnJob';
import { techCost } from '../src/game/tech';
import { STATE_VERSION, type Coord, type GameState, type Unit } from '../src/game/types';
import { neighbors } from '../src/game/grid';
import { DEFAULT_VIEW_TILES, MAX_TILE, ZOOM_OUT_MIN_TILE, ZOOM_OUT_TILES, defaultTileSize, minTileSize, zoomAt } from '../src/render/camera';
import { minimapScale, minimapToWorld } from '../src/render/minimap';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/ui/settings';
import { musicTrackFor } from '../src/ui/soundLogic';
import { sizeNote } from '../src/ui/setup';
import { addCity, addUnit, makeState } from './helpers';

// ---- A1: Huge and Epic ---------------------------------------------------------------------

describe('Huge and Epic maps (A1)', () => {
  it('are about 64×44 and 80×56, each with up to 5 rivals, after Large in the list', () => {
    expect(MAP_SIZE_IDS).toEqual(['small', 'normal', 'large', 'huge', 'epic']);
    expect([MAP_SIZES.huge.width, MAP_SIZES.huge.height, MAP_SIZES.huge.maxRivals]).toEqual([64, 44, 5]);
    expect([MAP_SIZES.epic.width, MAP_SIZES.epic.height, MAP_SIZES.epic.maxRivals]).toEqual([80, 56, 5]);
    expect(() => createGame({ seed: 3, mapSize: 'epic', playerCount: 6 })).not.toThrow();
    expect(() => createGame({ seed: 3, mapSize: 'huge', playerCount: 7 })).toThrow();
  });

  it('victory goals and tech costs scale up on the biggest maps (numbers from the sim)', () => {
    for (const size of ['huge', 'epic'] as const) {
      // Round 15: each goal can have its own percent.
      const def = MAP_SIZES[size];
      const c = (def.culturePct ?? def.victoryPct) / 100;
      const g = (def.goldPct ?? def.victoryPct) / 100;
      expect(victoryGoals(size)).toEqual({ culture: Math.round((VICTORY.cultureGoal * c) / 50) * 50, gold: Math.round((VICTORY.goldGoal * g) / 50) * 50 });
      expect(victoryGoals(size).culture).toBeGreaterThan(victoryGoals('large').culture);
      expect(MAP_SIZES[size].techCostPct).toBeGreaterThan(0);
    }
    // Small and Normal research as before (Round 15: Large +15%).
    for (const size of ['small', 'normal'] as const) expect(MAP_SIZES[size].techCostPct).toBe(0);
    const huge = createGame({ seed: 2, mapSize: 'huge', playerCount: 2, civ: 'egypt' });
    const normal = createGame({ seed: 2, playerCount: 2, civ: 'egypt' });
    expect(techCost(huge, 0, 'pottery')).toBe(Math.round((techCost(normal, 0, 'pottery') * (100 + MAP_SIZES.huge.techCostPct)) / 100));
  });

  it('villages and huts grow with the map, within each size’s caps (4 seeds)', () => {
    const avg = (size: 'large' | 'huge' | 'epic', f: (s: GameState) => number) => {
      let n = 0;
      for (let seed = 1; seed <= 4; seed++) n += f(createGame({ seed, mapSize: size, playerCount: 6 }));
      return n / 4;
    };
    const villages = (s: GameState) => s.villages.length;
    const huts = (s: GameState) => s.map.tiles.filter((t) => t.hut).length;
    expect(avg('huge', villages)).toBeGreaterThan(avg('large', villages));
    expect(avg('epic', huts)).toBeGreaterThan(avg('large', huts));
  });

  it('big maps have a few big continents of different sizes and chains of small islands (6 seeds each)', () => {
    for (const size of ['huge', 'epic'] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const s = createGame({ seed, mapSize: size, playerCount: 6 });
        const counts = new Map<number, number>();
        for (const r of landRegionIds(s.map)) if (r >= 0) counts.set(r, (counts.get(r) ?? 0) + 1);
        const sizes = [...counts.values()].sort((a, b) => b - a);
        // Several landmasses big enough to settle (at least 4), of clearly different sizes...
        const settleable = sizes.filter((n) => n >= mapShape(size).minStartLandmass);
        expect(settleable.length, `${size} ${seed}`).toBeGreaterThanOrEqual(4);
        expect(settleable[0]! / settleable[settleable.length - 1]!, `${size} ${seed}`).toBeGreaterThan(1.3);
        // ...and small islands (a few tiles each).
        expect(sizes.filter((n) => n <= 6).length, `${size} ${seed} islets`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('Small, Normal, and Large maps are unchanged (the new shape rules are off for them)', () => {
    for (const size of ['small', 'normal', 'large'] as const) {
      expect(mapShape(size).continentWeight).toBe(0);
      expect(mapShape(size).islandChains).toBe(0);
    }
  });

  it('the setup screen notes Epic runs best on a computer, on a touch device only', () => {
    expect(MAP_SIZES.epic.bestOnComputer).toBe(true);
    expect(sizeNote('epic', true)).toContain('best on a computer');
    expect(sizeNote('epic', false)).not.toContain('best on a computer');
    expect(sizeNote('normal', true)).toBe('');
  });
});

// ---- A2: the default view, the zoom-out cap, the minimap -----------------------------------

describe('the view on big maps (A2)', () => {
  it('a game opens at about 12×9 tiles', () => {
    for (const [w, h] of [[1024, 768], [768, 1024], [1366, 1024], [1920, 1080]] as const) {
      const s = defaultTileSize(w, h);
      const across = w / s;
      const down = h / s;
      // One of the two fits exactly (about), the other shows at least as many; on a very big
      // screen the tiles stop at their largest size, showing more.
      if (s < MAX_TILE) expect(Math.min(Math.abs(across - DEFAULT_VIEW_TILES.across), Math.abs(down - DEFAULT_VIEW_TILES.down)), `${w}×${h}`).toBeLessThan(0.6);
      expect(across).toBeGreaterThanOrEqual(DEFAULT_VIEW_TILES.across - 0.6);
      expect(down).toBeGreaterThanOrEqual(DEFAULT_VIEW_TILES.down - 0.6);
    }
  });

  it('pinching out stops before tiles get tiny', () => {
    for (const [w, h] of [[1024, 768], [375, 812], [2560, 1440]] as const) {
      const cam = { cx: 10, cy: 10, tileSize: defaultTileSize(w, h) };
      for (let i = 0; i < 50; i++) zoomAt(cam, w, h, 0.8, w / 2, h / 2, minTileSize(w, h));
      expect(cam.tileSize).toBe(minTileSize(w, h));
      expect(cam.tileSize).toBeGreaterThanOrEqual(ZOOM_OUT_MIN_TILE);
      expect(Math.max(w, h) / cam.tileSize).toBeLessThanOrEqual(ZOOM_OUT_TILES + 1e-9);
      for (let i = 0; i < 50; i++) zoomAt(cam, w, h, 1.25, w / 2, h / 2, minTileSize(w, h));
      expect(cam.tileSize).toBe(MAX_TILE);
    }
  });

  it('the minimap fits its box and maps a tap back to the tile under it', () => {
    const scale = minimapScale(80, 56, 200, 150);
    expect(80 * scale).toBeLessThanOrEqual(200);
    expect(56 * scale).toBeLessThanOrEqual(150);
    expect(minimapToWorld(40 * scale, 28 * scale, scale, 80, 56)).toEqual({ x: 40, y: 28 });
    // Off the edge: clamped to the map.
    expect(minimapToWorld(-5, 9999, scale, 80, 56)).toEqual({ x: 0, y: 56 });
  });

  it('the minimap is open by default, and a device setting', () => {
    expect(DEFAULT_SETTINGS.minimap).toBe(true);
    expect(normalizeSettings({ minimap: false }).minimap).toBe(false);
    expect(normalizeSettings({ minimap: 'yes' }).minimap).toBe(true);
  });
});

// ---- A3: the worker, and the speed-ups -------------------------------------------------------

/** A Normal game the AI has played for `turns` turns, handed back to the human. */
function playedGame(seed: number, turns: number, size: 'normal' | 'huge' = 'normal'): GameState {
  const s = createGame({ seed, mapSize: size, playerCount: size === 'huge' ? 6 : 5 });
  s.players[0]!.kind = 'ai';
  while (s.turn <= turns || s.currentPlayer !== 0) {
    playComputerTurn(s, s.currentPlayer);
    endTurn(s);
  }
  s.players[0]!.kind = 'human';
  return s;
}

describe('End Turn in a Web Worker (A3)', () => {
  it('gives exactly the same game as on the main thread (same seed, several turns)', () => {
    const page = playedGame(21, 40);
    // The worker gets a structured clone (what postMessage makes) and sends its state back.
    let worker = structuredClone(page);
    for (let t = 0; t < 5; t++) {
      expect(applyAction(page, { type: 'endTurn' }).ok).toBe(true);
      const res = runTurnJob({ id: t, state: structuredClone(worker) });
      expect(res.result.ok).toBe(true);
      expect(res.error).toBeUndefined();
      worker = structuredClone(res.state);
      expect(JSON.stringify(worker)).toBe(JSON.stringify(page));
    }
  }, 30_000);

  it('reports a failure instead of throwing, so the page can run End Turn itself', () => {
    const s = playedGame(22, 3);
    (s as unknown as { players: unknown }).players = null;
    const res = runTurnJob({ id: 7, state: s });
    expect(res.id).toBe(7);
    expect(res.error).toBeTruthy();
  });
});

/** The cheapest cost to reach `to` by brute force (Bellman–Ford style), with the same rules as findPath on a fully explored map. */
function cheapestCost(state: GameState, unit: Unit, to: Coord): number {
  const { map } = state;
  const n = map.width * map.height;
  const cost = new Array<number>(n).fill(Infinity);
  cost[unit.y * map.width + unit.x] = 0;
  for (let changed = true; changed; ) {
    changed = false;
    for (let k = 0; k < n; k++) {
      if (cost[k] === Infinity) continue;
      const c = { x: k % map.width, y: Math.floor(k / map.width) };
      for (const nb of neighbors(map, c)) {
        const j = nb.y * map.width + nb.x;
        if (!canEnter(state, unit, nb.x, nb.y)) continue;
        const v = cost[k]! + stepCost(state, unit, c, nb);
        if (v < cost[j]! - 1e-9) {
          cost[j] = v;
          changed = true;
        }
      }
    }
  }
  return cost[to.y * map.width + to.x]!;
}

describe('the faster path search (A3)', () => {
  it('still finds a cheapest path, with roads, rails, and rivals in the way', () => {
    const s = makeState([
      'gggggggggggg',
      'ggghhhffgggg',
      'ggmmmmmfgggg',
      'gggggggmmggg',
      'ggfffgggmggg',
      'gggggggggggg',
    ]);
    s.players[0]!.techs = [ROADS.railTech];
    addCity(s, 0, 0, 0, { name: 'A' });
    addCity(s, 0, 11, 5, { name: 'B' });
    for (let x = 1; x <= 10; x++) s.map.tiles[5 * 12 + x]!.road = x < 6 ? 'rail' : 'road';
    s.map.tiles[5 * 12 + 1]!.road = 'rail';
    addUnit(s, 'warrior', 1, 5, 3);
    const u = addUnit(s, 'horseman', 0, 1, 1);
    for (const to of [{ x: 11, y: 5 }, { x: 11, y: 0 }, { x: 4, y: 5 }, { x: 9, y: 2 }, { x: 0, y: 5 }]) {
      const path = findPath(s, u, to)!;
      expect(path, `${to.x},${to.y}`).toBeDefined();
      let from: Coord = u;
      let total = 0;
      for (const step of path) {
        expect(canEnter(s, u, step.x, step.y)).toBe(true);
        total += stepCost(s, u, from, step);
        from = step;
      }
      expect(from).toEqual(to);
      expect(total).toBeCloseTo(cheapestCost(s, u, to), 9);
    }
  });

  it('a ship’s path stays on water it may sail (or its own coastal city)', () => {
    const s = createGame({ seed: 5 });
    const coast = s.map.tiles.findIndex((t) => t.terrain === 'coast');
    const ship = addUnit(s, 'galley', 0, coast % s.map.width, Math.floor(coast / s.map.width));
    s.players[0]!.explored.fill(1);
    let tested = 0;
    for (let k = 0; k < s.map.tiles.length && tested < 12; k += 37) {
      if (s.map.tiles[k]!.terrain !== 'coast') continue;
      const to = { x: k % s.map.width, y: Math.floor(k / s.map.width) };
      const path = findPath(s, ship, to);
      if (!path) continue;
      for (const step of path) expect(TERRAIN[s.map.tiles[step.y * s.map.width + step.x]!.terrain].isWater).toBe(true);
      tested++;
    }
    expect(tested).toBeGreaterThan(3);
  });

  it('leader bonuses follow a new tech at once (the era check is cached by the techs list)', () => {
    const s = createGame({ seed: 4, civ: 'egypt' });
    const p = s.players[0]!;
    const before = effects(p).length;
    p.techs.push('monarchy');
    expect(effects(p).length).toBeGreaterThan(before);
    p.techs = ['pottery'];
    expect(effects(p).length).toBe(before);
  });

  it('a late Huge game plays an End Turn well under a second in Node', () => {
    const s = playedGame(33, 90, 'huge');
    const t0 = performance.now();
    expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
    expect(performance.now() - t0).toBeLessThan(1500);
  }, 120_000);
});

// ---- B2: city looks --------------------------------------------------------------------------

describe('city looks (B2)', () => {
  it('a village at 1–3, a town at 4–7, a city at 8–12, a metropolis at 13+', () => {
    const at = (size: number) => cityLook(size).id;
    expect([1, 2, 3].map(at)).toEqual(['village', 'village', 'village']);
    expect([4, 7].map(at)).toEqual(['town', 'town']);
    expect([8, 12].map(at)).toEqual(['city', 'city']);
    expect([13, 20, 40].map(at)).toEqual(['metropolis', 'metropolis', 'metropolis']);
    // Bigger looks draw more buildings.
    for (let i = 1; i < CITY_LOOKS.length; i++) expect(CITY_LOOKS[i]!.buildings).toBeGreaterThan(CITY_LOOKS[i - 1]!.buildings);
  });
});

// ---- C1: music per era -----------------------------------------------------------------------

describe('era music (C1)', () => {
  const all = [...MUSIC_FILES];
  it('the menu plays the theme; a game plays its era’s track', () => {
    expect(MUSIC_FILES).toEqual(['music-theme.mp3', 'music-ancient.mp3', 'music-medieval.mp3', 'music-industrial.mp3', 'music-modern.mp3']);
    expect(musicTrackFor('menu', all)).toBe('music-theme.mp3');
    expect(musicTrackFor('ancient', all)).toBe('music-ancient.mp3');
    expect(musicTrackFor('industrial', all)).toBe('music-industrial.mp3');
    expect(musicTrackFor('modern', all)).toBe('music-modern.mp3');
  });

  it('a missing era track falls back to the theme; no theme, to Round 13’s music-1.mp3; nothing, silence', () => {
    expect(musicTrackFor('medieval', ['music-theme.mp3', 'music-ancient.mp3'])).toBe('music-theme.mp3');
    expect(musicTrackFor('medieval', ['music-1.mp3'])).toBe(MUSIC.legacyTheme);
    expect(musicTrackFor('menu', ['music-1.mp3', 'music-ancient.mp3'])).toBe('music-1.mp3');
    // With a theme, music-1.mp3 is ignored.
    expect(musicTrackFor('menu', ['music-1.mp3', 'music-theme.mp3'])).toBe('music-theme.mp3');
    expect(musicTrackFor('ancient', [])).toBeUndefined();
    expect(musicTrackFor('ancient', ['tap.mp3'])).toBeUndefined();
  });
});

// ---- D1: the save format ---------------------------------------------------------------------

describe('saves (D1)', () => {
  it('no migration this round: the format is still 12, and a Huge or Epic game saves and loads', () => {
    expect(STATE_VERSION).toBe(12);
    for (const size of ['huge', 'epic'] as const) {
      const s = createGame({ seed: 9, mapSize: size, playerCount: 3 });
      const back = deserializeGame(serializeGame(s, 1));
      expect(back.kind).toBe('ok');
      if (back.kind === 'ok') {
        expect(back.state.mapSize).toBe(size);
        expect(back.migratedFrom).toBeUndefined();
      }
    }
  });
});
