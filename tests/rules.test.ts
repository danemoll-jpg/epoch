import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game/actions';
import { foundCity, foundCityError } from '../src/game/city';
import { isExplored, visibleTiles } from '../src/game/fog';
import { tileIndex } from '../src/game/grid';
import { findPath, moveUnit, moveUnitToward, reachableThisTurn } from '../src/game/movement';
import { createGame } from '../src/game/newGame';
import { endTurn, runUntilHuman } from '../src/game/turn';
import { addCity, addUnit, makeState } from './helpers';

describe('movement', () => {
  it('moves one tile (including diagonally) and spends movement', () => {
    const s = makeState(['ggg', 'ggg', 'ggg']);
    const w = addUnit(s, 'warrior', 0, 1, 1);
    expect(moveUnit(s, w.id, { x: 2, y: 2 }).ok).toBe(true);
    expect([w.x, w.y, w.movesLeft]).toEqual([2, 2, 0]);
  });

  it('cannot move without movement points left', () => {
    const s = makeState(['ggg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    moveUnit(s, w.id, { x: 1, y: 0 });
    const res = moveUnit(s, w.id, { x: 2, y: 0 });
    expect(res).toEqual({ ok: false, reason: 'No moves left' });
    expect(w.x).toBe(1);
  });

  it('cannot move onto ocean, coast, or mountains', () => {
    const s = makeState(['gom', 'gcg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(moveUnit(s, w.id, { x: 1, y: 0 }).ok).toBe(false);
    expect(moveUnit(s, w.id, { x: 1, y: 1 }).ok).toBe(false);
    const w2 = addUnit(s, 'warrior', 0, 2, 1);
    expect(moveUnit(s, w2.id, { x: 2, y: 0 }).ok).toBe(false);
    expect(w2.movesLeft).toBe(1);
  });

  it('cannot jump more than one tile per step', () => {
    const s = makeState(['ggg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(moveUnit(s, w.id, { x: 2, y: 0 }).reason).toBe('Not adjacent');
  });

  it('pays terrain cost; a full-move unit can still enter costly terrain', () => {
    const s = makeState(['gfh']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(moveUnit(s, w.id, { x: 1, y: 0 }).ok).toBe(true); // forest costs 2, warrior has 1
    expect(w.movesLeft).toBe(0);
  });

  it('a partly-spent unit cannot enter terrain costing more than it has left', () => {
    const s = makeState(['gfh']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    w.movesLeft = 0.5; // e.g. a future unit type with fractional moves left
    expect(moveUnit(s, w.id, { x: 1, y: 0 }).reason).toBe('Not enough moves left');
  });

  it("is blocked by another player's unit or city (moving in to capture is covered in combat tests)", () => {
    const s = makeState(['ggg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    addUnit(s, 'warrior', 1, 1, 0);
    expect(moveUnit(s, w.id, { x: 1, y: 0 }).reason).toBe('Tile is impassable');
    s.units = s.units.filter((u) => u.owner === 0);
    addCity(s, 1, 1, 0, { name: 'X' });
    // A settler can't capture (0 attack), so the enemy city blocks it.
    const settler = addUnit(s, 'settler', 0, 0, 0);
    expect(moveUnit(s, settler.id, { x: 1, y: 0 }).ok).toBe(false);
  });

  it('can stack with own units', () => {
    const s = makeState(['gg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    addUnit(s, 'settler', 0, 1, 0);
    expect(moveUnit(s, w.id, { x: 1, y: 0 }).ok).toBe(true);
  });

  it("can't move another player's unit or out of turn", () => {
    const s = makeState(['gg']);
    const enemy = addUnit(s, 'warrior', 1, 0, 0);
    expect(moveUnit(s, enemy.id, { x: 1, y: 0 }).reason).toBe('Not your turn');
  });

  it('pathfinds around obstacles and stops when moves run out', () => {
    const s = makeState(['gmg', 'ggg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(findPath(s, w, { x: 2, y: 0 })).toEqual([{ x: 1, y: 1 }, { x: 2, y: 0 }]);
    expect(moveUnitToward(s, w.id, { x: 2, y: 0 }).ok).toBe(true);
    expect([w.x, w.y]).toEqual([1, 1]);
  });

  it('plans into unexplored tiles without using hidden terrain', () => {
    // A mountain wall hides in the fog; the plan goes straight through it anyway.
    const s = makeState(['gmg', 'ggg'], { exploreAll: false });
    s.players[0]!.explored[tileIndex(s.map, 0, 0)] = 1;
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(findPath(s, w, { x: 2, y: 0 })).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    // Actually walking into it fails once the real terrain is known.
    expect(moveUnitToward(s, w.id, { x: 2, y: 0 }).reason).toBe('Tile is impassable');
    expect([w.x, w.y]).toEqual([0, 0]);
  });

  it('refuses a known-impassable destination', () => {
    const s = makeState(['gm']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(moveUnitToward(s, w.id, { x: 1, y: 0 }).reason).toBe("Can't reach that tile");
  });

  it('reports the tiles reachable this turn', () => {
    const s = makeState(['gmg', 'ggo']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    const r = reachableThisTurn(s, w).map((c) => `${c.x},${c.y}`).sort();
    expect(r).toEqual(['0,1', '1,1']);
  });
});

describe('founding cities', () => {
  it('a settler founds a named city and is used up', () => {
    const s = makeState(['ggg', 'ggg', 'ggg']);
    const settler = addUnit(s, 'settler', 0, 1, 1);
    const res = foundCity(s, settler.id);
    expect(res.ok).toBe(true);
    expect(s.cities).toHaveLength(1);
    expect(s.cities[0]).toMatchObject({ name: 'Babylon', owner: 0, x: 1, y: 1 });
    expect(s.units.find((u) => u.id === settler.id)).toBeUndefined();
  });

  it('uses the next name from the civ list for later cities', () => {
    const s = makeState(['gggggggg']);
    foundCity(s, addUnit(s, 'settler', 0, 0, 0).id);
    foundCity(s, addUnit(s, 'settler', 0, 4, 0).id);
    expect(s.cities.map((c) => c.name)).toEqual(['Babylon', 'Ur']);
  });

  it('a warrior cannot found a city', () => {
    const s = makeState(['g']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(foundCityError(s, w.id)).toBe('Only settlers can found cities');
    expect(foundCity(s, w.id).ok).toBe(false);
  });

  it('cannot found too close to another city', () => {
    const s = makeState(['gggg']);
    addCity(s, 1, 0, 0, { name: 'X' });
    const settler = addUnit(s, 'settler', 0, 2, 0);
    expect(foundCityError(s, settler.id)).toBe('Too close to another city');
    settler.x = 3;
    expect(foundCityError(s, settler.id)).toBeUndefined();
  });

  it('cannot found on invalid terrain', () => {
    const s = makeState(['m']);
    const settler = addUnit(s, 'settler', 0, 0, 0);
    expect(foundCityError(s, settler.id)).toBe("Can't build a city on this terrain");
  });

  it('cannot found with no moves left', () => {
    const s = makeState(['gg']);
    const settler = addUnit(s, 'settler', 0, 0, 0);
    moveUnit(s, settler.id, { x: 1, y: 0 });
    expect(foundCityError(s, settler.id)).toBe('No moves left');
  });
});

describe('turn cycle', () => {
  it('advances through players, then increments the turn', () => {
    const s = makeState(['ggg'], { players: 3 });
    endTurn(s);
    expect([s.currentPlayer, s.turn]).toEqual([1, 1]);
    endTurn(s);
    expect([s.currentPlayer, s.turn]).toEqual([2, 1]);
    endTurn(s);
    expect([s.currentPlayer, s.turn]).toEqual([0, 2]);
  });

  it('skips dead players', () => {
    const s = makeState(['ggg'], { players: 3 });
    s.players[1]!.alive = false;
    endTurn(s);
    expect(s.currentPlayer).toBe(2);
  });

  it('movement resets at the start of each turn', () => {
    const s = makeState(['ggggg', 'ggggg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    moveUnit(s, w.id, { x: 1, y: 0 });
    expect(w.movesLeft).toBe(0);
    applyAction(s, { type: 'endTurn' });
    expect(s.currentPlayer).toBe(0);
    expect(s.turn).toBe(2);
    expect(w.movesLeft).toBe(1);
  });

  it('End Turn runs the AI and returns control to the human', () => {
    const s = createGame({ seed: 11 });
    applyAction(s, { type: 'endTurn' });
    expect(s.currentPlayer).toBe(0);
    expect(s.turn).toBe(2);
  });
});

describe('fog of war', () => {
  it('starts with only the area around your units explored', () => {
    const s = createGame({ seed: 21 });
    const explored = s.players[0]!.explored.filter((v) => v === 1).length;
    expect(explored).toBe(9); // settler + warrior stacked, sight 1 => 3x3
  });

  it('moving reveals new tiles, which stay explored after leaving', () => {
    const s = makeState(['ggggg'], { exploreAll: false });
    const w = addUnit(s, 'warrior', 0, 0, 0);
    s.players[0]!.explored[tileIndex(s.map, 1, 0)] = 1;
    moveUnit(s, w.id, { x: 1, y: 0 });
    expect(isExplored(s, 0, 2, 0)).toBe(true);
    expect(isExplored(s, 0, 3, 0)).toBe(false);
    const vis = visibleTiles(s, 0);
    expect(vis[tileIndex(s.map, 0, 0)]).toBe(true);
  });

  it('cities see farther than units', () => {
    const s = makeState(['ggggggg'], { exploreAll: false });
    foundCity(s, addUnit(s, 'settler', 0, 3, 0).id);
    const vis = visibleTiles(s, 0);
    expect(vis[tileIndex(s.map, 1, 0)]).toBe(true);
    expect(vis[tileIndex(s.map, 0, 0)]).toBe(false);
  });
});

describe('minimal AI', () => {
  it('founds a city and explores using normal actions', () => {
    const s = createGame({ seed: 5 });
    const aiWarrior = s.units.find((u) => u.owner === 1 && u.type === 'warrior')!;
    const before = s.players[1]!.explored.filter((v) => v === 1).length;
    for (let t = 0; t < 10; t++) applyAction(s, { type: 'endTurn' });
    expect(s.cities.some((c) => c.owner === 1)).toBe(true);
    expect(s.units.some((u) => u.owner === 1 && u.type === 'settler')).toBe(false);
    expect(s.players[1]!.explored.filter((v) => v === 1).length).toBeGreaterThan(before + 10);
    expect(s.units.find((u) => u.id === aiWarrior.id)).toBeDefined();
  });

  it('AI turns are deterministic for the same seed', () => {
    const a = createGame({ seed: 8, playerCount: 5 });
    const b = createGame({ seed: 8, playerCount: 5 });
    for (let t = 0; t < 8; t++) {
      applyAction(a, { type: 'endTurn' });
      applyAction(b, { type: 'endTurn' });
    }
    expect(b).toEqual(a);
  });

  it('runs all four AI rivals in a 5-player game', () => {
    const s = createGame({ seed: 13, playerCount: 5 });
    applyAction(s, { type: 'endTurn' });
    runUntilHuman(s);
    for (let p = 1; p < 5; p++) expect(s.cities.some((c) => c.owner === p)).toBe(true);
  });
});
