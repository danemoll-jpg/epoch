// Roads and railroads (Round 12): cost and path, movement on roads and rails, the Railroad
// upgrade, road trade and rail production, ownership (everyone uses them), the Merkel and
// Hatshepsut hooks, and the AI (deterministic).

import { describe, expect, it } from 'vitest';
import { ROADS } from '../src/data/roads';
import { applyAction } from '../src/game/actions';
import { findPath, reachableThisTurn, stepCost } from '../src/game/movement';
import { processCities } from '../src/game/production';
import { aiBuyRoads, buyRoadError, nearestCityOwner, roadAt, roadOption, roadPath, roadStepCost, roadTargets, upgradeRails } from '../src/game/roads';
import { learnTech } from '../src/game/tech';
import type { GameState } from '../src/game/types';
import { cityScienceGold, workedTileYields, centerYields, tileYields } from '../src/game/yields';
import { tileIndex } from '../src/game/grid';
import { addCity, addUnit, makeState } from './helpers';

/** 16×9 grassland with a mountain wall and a lake to route around. */
const MAP = [
  'gggggggggggggggg',
  'gggggggggggggggg',
  'gggggggggggggggg',
  'gggggggmgggggggg',
  'gggggggmgggggggg',
  'gggggggmgggggggg',
  'ggggggggcggggggg',
  'gggggggggggggggg',
  'gggggggggggggggg',
];

function world(peace = true): GameState {
  const s = makeState(MAP, { players: 2, peace });
  addCity(s, 0, 2, 4, { name: 'West', capitalOf: 0, size: 3, build: { kind: 'unit', id: 'warrior' } });
  addCity(s, 0, 12, 4, { name: 'East', size: 3, build: { kind: 'unit', id: 'warrior' } });
  addCity(s, 1, 12, 8, { name: 'Rival', capitalOf: 1, build: { kind: 'unit', id: 'warrior' } });
  s.players[0]!.gold = 500;
  return s;
}

const city = (s: GameState, name: string) => s.cities.find((c) => c.name === name)!;
const road = (s: GameState, x: number, y: number, kind: 'road' | 'rail' = 'road') => (s.map.tiles[tileIndex(s.map, x, y)]!.road = kind);

describe('buying roads (C1)', () => {
  it('costs gold per tile without a road, laid at once along a land path (no water, no mountains)', () => {
    const s = world();
    const opt = roadOption(s, 0, city(s, 'West'), city(s, 'East'))!;
    for (const c of opt.path) {
      const t = s.map.tiles[tileIndex(s.map, c.x, c.y)]!.terrain;
      expect(t === 'mountains' || t === 'coast').toBe(false);
    }
    expect(opt.newTiles).toBe(opt.path.length);
    expect(opt.cost).toBe(opt.newTiles * ROADS.goldPerTile);
    const res = applyAction(s, { type: 'buyRoad', fromCityId: city(s, 'West').id, toCityId: city(s, 'East').id });
    expect(res.ok).toBe(true);
    expect(s.players[0]!.gold).toBe(500 - opt.cost);
    for (const c of opt.path) expect(roadAt(s, c.x, c.y)).toBe('road');
    expect(buyRoadError(s, city(s, 'West').id, city(s, 'East').id)).toBe('Already joined by road');
  });

  it('only pays for the tiles that still need a road, and runs straight when it can', () => {
    const s = makeState(['gggggggggg'], { players: 1 });
    const a = addCity(s, 0, 0, 0, { name: 'A' });
    const b = addCity(s, 0, 6, 0, { name: 'B' });
    road(s, 2, 0);
    road(s, 3, 0);
    const opt = roadOption(s, 0, a, b)!;
    expect(opt.path.map((c) => c.x)).toEqual([1, 2, 3, 4, 5]);
    expect(opt.newTiles).toBe(3);
  });

  it('cities count as road; the path only uses explored tiles; a far city or no land path is refused', () => {
    const s = world();
    expect(roadAt(s, 2, 4)).toBe('road');
    s.players[0]!.explored.fill(0);
    for (const c of s.cities) s.players[0]!.explored[tileIndex(s.map, c.x, c.y)] = 1;
    expect(roadPath(s, 0, city(s, 'West'), city(s, 'East'))).toBeUndefined();
    const island = makeState(['ggcgg'], { players: 1 });
    const a = addCity(island, 0, 0, 0);
    const b = addCity(island, 0, 4, 0);
    island.players[0]!.gold = 100;
    expect(buyRoadError(island, a.id, b.id)).toBe('No land path (roads can’t cross water or mountains)');
  });

  it('lists your other cities and friendly ones, nearest first; not a civ at war', () => {
    const s = world();
    expect(roadTargets(s, city(s, 'East')).map((o) => o.city.name)).toEqual(['Rival', 'West']);
    const w = world(false);
    expect(roadTargets(w, city(w, 'East')).map((o) => o.city.name)).toEqual(['West']);
  });

  it('needs the gold, and your own city to build from', () => {
    const s = world();
    s.players[0]!.gold = 5;
    expect(buyRoadError(s, city(s, 'West').id, city(s, 'East').id)).toMatch(/^Needs \d+ gold$/);
    expect(buyRoadError(s, city(s, 'Rival').id, city(s, 'East').id)).toBe('Not your city');
  });
});

describe('movement on roads and rails (C2, C3)', () => {
  it('a road step costs 1/3 of a move: a 1-move unit covers 3 road tiles', () => {
    const s = world();
    for (let x = 3; x <= 6; x++) road(s, x, 1);
    const w = addUnit(s, 'warrior', 0, 3, 1);
    expect(roadStepCost(s, { x: 3, y: 1 }, { x: 4, y: 1 })).toBeCloseTo(1 / 3);
    expect(reachableThisTurn(s, w).some((c) => c.x === 6 && c.y === 1)).toBe(true);
    expect(applyAction(s, { type: 'move', unitId: w.id, to: { x: 6, y: 1 } }).ok).toBe(true);
    expect(w).toMatchObject({ x: 6, y: 1, movesLeft: 0 });
  });

  it('only from road to road: stepping onto or off a road costs the terrain', () => {
    const s = world();
    road(s, 4, 1);
    const w = addUnit(s, 'warrior', 0, 3, 1);
    expect(stepCost(s, w, w, { x: 4, y: 1 })).toBe(1);
    // Forest along a road is still a third.
    s.map.tiles[tileIndex(s.map, 5, 1)]!.terrain = 'forest';
    road(s, 5, 1);
    expect(stepCost(s, w, { x: 4, y: 1 }, { x: 5, y: 1 })).toBeCloseTo(1 / 3);
  });

  it('rails cost 1/10 of a move: 10 tiles a turn', () => {
    const s = makeState(['g'.repeat(14)], { players: 1 });
    for (let x = 1; x <= 12; x++) road(s, x, 0, 'rail');
    const w = addUnit(s, 'warrior', 0, 1, 0);
    expect(applyAction(s, { type: 'move', unitId: w.id, to: { x: 12, y: 0 } }).ok).toBe(true);
    expect(w.x).toBe(11);
    expect(w.movesLeft).toBe(0);
  });

  it('the pathfinder prefers the road', () => {
    const s = world();
    for (let x = 3; x <= 11; x++) road(s, x, 1);
    const w = addUnit(s, 'warrior', 0, 3, 1);
    const path = findPath(s, w, { x: 11, y: 1 })!;
    expect(path.every((c) => c.y === 1)).toBe(true);
  });

  it('roads belong to no one: an enemy moves on yours just as fast (C5)', () => {
    const s = world(false);
    for (let x = 3; x <= 6; x++) road(s, x, 1);
    s.currentPlayer = 1;
    const e = addUnit(s, 'warrior', 1, 3, 1);
    expect(applyAction(s, { type: 'move', unitId: e.id, to: { x: 6, y: 1 } }).ok).toBe(true);
    expect(e.x).toBe(6);
  });

  it('moves stay clean after thirds: no leftover sliver of a move', () => {
    const s = world();
    for (let x = 3; x <= 5; x++) road(s, x, 1);
    const h = addUnit(s, 'horseman', 0, 3, 1);
    applyAction(s, { type: 'move', unitId: h.id, to: { x: 5, y: 1 } });
    expect(h.movesLeft).toBeCloseTo(2 - 2 / 3, 5);
    applyAction(s, { type: 'move', unitId: h.id, to: { x: 5, y: 3 } });
    expect(Number.isFinite(h.movesLeft) && h.movesLeft >= 0).toBe(true);
  });
});

describe('the Railroad upgrade (C3)', () => {
  it('learning Railroad turns the roads near your cities into rails, free; not a rival’s', () => {
    const s = world();
    road(s, 3, 4);
    road(s, 12, 7);
    learnTech(s, 0, 'railroad', 'Learned');
    expect(roadAt(s, 3, 4)).toBe('rail');
    expect(nearestCityOwner(s, tileIndex(s.map, 12, 7))).toBe(1);
    expect(roadAt(s, 12, 7)).toBe('road');
    // Its cities count as rail, a rival's as road.
    expect(roadAt(s, 2, 4)).toBe('rail');
    expect(roadAt(s, 12, 8)).toBe('road');
  });

  it('roads bought after Railroad are laid as rails; roads near a city it takes are upgraded at its next turn', () => {
    const s = world();
    s.players[0]!.techs = ['railroad'];
    applyAction(s, { type: 'buyRoad', fromCityId: city(s, 'West').id, toCityId: city(s, 'East').id });
    const opt = roadOption(s, 0, city(s, 'West'), city(s, 'East'))!;
    for (const c of opt.path) expect(roadAt(s, c.x, c.y)).toBe('rail');
    road(s, 12, 7);
    city(s, 'Rival').owner = 0;
    processCities(s, 0);
    expect(roadAt(s, 12, 7)).toBe('rail');
    expect(upgradeRails(s, 0)).toBe(0);
  });
});

describe('road trade and rail production (C4)', () => {
  it('a worked road tile +1 trade; a rail tile +1 trade and +1 production; not the city center', () => {
    const s = world();
    const west = city(s, 'West');
    const k = tileIndex(s.map, 3, 4);
    const base = workedTileYields(s, west, k);
    const bare = tileYields(s, k);
    road(s, 3, 4);
    expect(workedTileYields(s, west, k)).toEqual({ ...base, trade: base.trade + ROADS.roadTrade });
    road(s, 3, 4, 'rail');
    expect(workedTileYields(s, west, k)).toEqual({ ...base, trade: base.trade + ROADS.roadTrade, production: base.production + ROADS.railProduction });
    // The bare tile (as the map shows it) and the city's center don't change.
    expect(tileYields(s, k)).toEqual(bare);
    const center = centerYields(s, west);
    road(s, 2, 4);
    expect(centerYields(s, west)).toEqual(center);
  });
});

describe('leader hooks (C6)', () => {
  it('Merkel’s roads cost half the gold', () => {
    const s = world();
    const normal = roadOption(s, 0, city(s, 'West'), city(s, 'East'))!.cost;
    s.players[0]!.civId = 'germany';
    const merkel = roadOption(s, 0, city(s, 'West'), city(s, 'East'))!.cost;
    expect(merkel).toBe(Math.round(normal / 2));
  });

  it('Hatshepsut gets +1 gold on every worked road tile', () => {
    const s = world();
    const west = city(s, 'West');
    s.players[0]!.civId = 'egypt';
    s.players[0]!.techs = [];
    const before = cityScienceGold(s, west).gold;
    for (const k of west.worked) s.map.tiles[k]!.road = 'road';
    const n = west.worked.length;
    s.players[0]!.civId = 'babylon';
    const plain = cityScienceGold(s, west).gold;
    s.players[0]!.civId = 'egypt';
    // Her extra over a civ without the bonus, on the same roads: +1 per worked road tile.
    expect(cityScienceGold(s, west).gold - plain).toBe(n);
    expect(cityScienceGold(s, west).gold).toBeGreaterThan(before);
  });
});

describe('the AI buys roads (C7)', () => {
  it('links its nearby cities, cheapest first, with gold to spare; same state, same road', () => {
    const run = () => {
      const s = world();
      s.players[0]!.kind = 'ai';
      const a = addCity(s, 0, 2, 0, { name: 'North' });
      void a;
      aiBuyRoads(s, 0, 0);
      return s;
    };
    const s = run();
    // North–West (3 apart, 2 new tiles) is the cheapest link; West–East is 10 apart, past the link range.
    expect(roadAt(s, 2, 1)).toBe('road');
    expect(roadAt(s, 2, 3)).toBe('road');
    expect(JSON.stringify(run().map)).toBe(JSON.stringify(s.map));
  });

  it('keeps its reserve', () => {
    const s = world();
    addCity(s, 0, 2, 0, { name: 'North' });
    s.players[0]!.gold = 30;
    expect(aiBuyRoads(s, 0, 0)).toBe(false);
  });

  it('at war, lays a road toward its war target first', () => {
    const s = world(false);
    s.players[0]!.gold = 500;
    addCity(s, 0, 2, 0, { name: 'North' });
    s.aiPlans[0] = { target: 1, cityId: city(s, 'Rival').id, stagingCityId: city(s, 'East').id, phase: 'gather', since: 1 };
    expect(aiBuyRoads(s, 0, 0)).toBe(true);
    expect(roadAt(s, 12, 5)).toBe('road');
    expect(roadAt(s, 2, 1)).toBeUndefined();
  });
});
