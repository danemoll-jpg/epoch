// Round 18: the next unit brought into view (1), Wake and the Units list (2), and tapping your
// own units from a distance (3).

import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game/actions';
import { findPath, pathTurns } from '../src/game/movement';
import { centerInRect, tileComfortablyVisible, worldToScreen, type Camera } from '../src/render/camera';
import { resolveTap } from '../src/ui/tap';
import { filterCounts, listUnits, unitStatus, unitWhere } from '../src/ui/unitsList';
import { addCity, addUnit, makeState } from './helpers';

const row = (n: number, ch = 'g') => ch.repeat(n);

describe('Round 18 item 1: is the tile comfortably in view, and where to pan', () => {
  // A 1000 × 800 screen, 50 px tiles, centered on (10, 10): tiles 0..19 across, 2..17 down.
  const cam: Camera = { cx: 10, cy: 10, tileSize: 50 };
  const topBar = { left: 0, top: 0, right: 600, bottom: 80 };
  const unitPanel = { left: 0, top: 650, right: 500, bottom: 800 };

  it('a tile in the middle is in view; the map is left alone', () => {
    expect(tileComfortablyVisible(cam, 1000, 800, 10, 10, [topBar, unitPanel], 25)).toBe(true);
  });

  it('off screen, or too close to an edge, is not', () => {
    expect(tileComfortablyVisible(cam, 1000, 800, 25, 10, [], 25)).toBe(false);
    expect(tileComfortablyVisible(cam, 1000, 800, 19, 10, [], 25)).toBe(false); // flush with the right edge
    expect(tileComfortablyVisible(cam, 1000, 800, 18, 10, [], 25)).toBe(true);
  });

  it('under the top bar or the unit panel is not', () => {
    // Tile (3, 2) sits at y 100..150 (inside the screen); with the margin it touches the top bar.
    expect(tileComfortablyVisible(cam, 1000, 800, 3, 3, [], 25)).toBe(true);
    expect(tileComfortablyVisible(cam, 1000, 800, 3, 3, [topBar], 25)).toBe(false);
    expect(tileComfortablyVisible(cam, 1000, 800, 3, 15, [unitPanel], 25)).toBe(false);
    expect(tileComfortablyVisible(cam, 1000, 800, 15, 15, [unitPanel], 25)).toBe(true);
  });

  it('the pan target puts the tile in the middle of the uncovered part', () => {
    const safe = { left: 0, top: 80, right: 1000, bottom: 650 };
    const t = centerInRect(cam, 1000, 800, 30, 4, safe);
    const p = worldToScreen({ ...cam, cx: t.cx, cy: t.cy }, 1000, 800, 30.5, 4.5);
    expect(p.x).toBeCloseTo(500);
    expect(p.y).toBeCloseTo((80 + 650) / 2);
  });
});

describe('Round 18 item 1: what ends a unit\'s turn (so the next one is selected)', () => {
  it('boarding a ship at sea uses up the land unit\'s moves and puts it aboard', () => {
    const s = makeState(['ggo', 'ggo']);
    const w = addUnit(s, 'horseman', 0, 1, 0);
    const ship = addUnit(s, 'galley', 0, 2, 0);
    expect(resolveTap(s, 0, w.id, 2, 0)).toEqual({ kind: 'move', unitId: w.id });
    expect(applyAction(s, { type: 'move', unitId: w.id, to: { x: 2, y: 0 } }).ok).toBe(true);
    expect(w.carriedBy).toBe(ship.id);
    expect(w.movesLeft).toBe(0);
    expect(unitStatus(w)).toBe('aboard');
  });

  it('boarding a ship docked in a city uses up the moves too', () => {
    const s = makeState(['ggo']);
    addCity(s, 0, 1, 0);
    const w = addUnit(s, 'warrior', 0, 1, 0);
    const ship = addUnit(s, 'galley', 0, 1, 0);
    expect(applyAction(s, { type: 'board', unitId: w.id, shipId: ship.id }).ok).toBe(true);
    expect(w.movesLeft).toBe(0);
  });

  it("a move that stops short (the way on turns out to be blocked) keeps the unit's moves", () => {
    // The plan crosses unexplored tiles (assumed passable); the second one is water.
    const s = makeState(['ggogg']);
    const h = addUnit(s, 'horseman', 0, 0, 0);
    s.players[0]!.explored = s.players[0]!.explored.map((_, k) => (k < 2 ? 1 : 0));
    expect(findPath(s, h, { x: 4, y: 0 })).toBeDefined();
    expect(applyAction(s, { type: 'move', unitId: h.id, to: { x: 4, y: 0 } }).ok).toBe(true);
    expect([h.x, h.movesLeft]).toEqual([1, 1]);
    expect(unitStatus(h)).toBe('ready');
  });
});

describe('Round 18 item 2: Wake', () => {
  it('wakes a fortified unit: no bonus, back in Next Unit, moves untouched', () => {
    const s = makeState([row(3)]);
    const w = addUnit(s, 'warrior', 0, 0, 0, { fortified: true });
    expect(applyAction(s, { type: 'wake', unitId: w.id }).ok).toBe(true);
    expect(w.fortified).toBe(false);
    expect(w.movesLeft).toBe(1);
    expect(unitStatus(w)).toBe('ready');
  });

  it('a unit fortified this turn wakes with no moves: ready again next turn', () => {
    const s = makeState([row(3)]);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(applyAction(s, { type: 'fortify', unitId: w.id }).ok).toBe(true);
    expect(w.movesLeft).toBe(0);
    expect(applyAction(s, { type: 'wake', unitId: w.id }).ok).toBe(true);
    expect([w.fortified, w.movesLeft]).toEqual([false, 0]);
    expect(unitStatus(w)).toBe('done');
  });

  it('a ship staying put wakes the same way', () => {
    const s = makeState(['ooo']);
    const g = addUnit(s, 'galley', 0, 1, 0, { fortified: true });
    expect(applyAction(s, { type: 'wake', unitId: g.id }).ok).toBe(true);
    expect(g.fortified).toBe(false);
  });

  it('refuses a unit that isn\'t fortified, or someone else\'s turn', () => {
    const s = makeState([row(3)]);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(applyAction(s, { type: 'wake', unitId: w.id })).toEqual({ ok: false, reason: 'Not fortified' });
    const r = addUnit(s, 'warrior', 1, 2, 0, { fortified: true });
    expect(applyAction(s, { type: 'wake', unitId: r.id })).toEqual({ ok: false, reason: 'Not your turn' });
  });
});

describe('Round 18 item 2: the Units list', () => {
  it('statuses, filters, counts, and order (ready, fortified, aboard, done)', () => {
    const s = makeState(['gggo']);
    const c = addCity(s, 0, 0, 0);
    const done = addUnit(s, 'warrior', 0, 1, 0, { movesLeft: 0 });
    const fort = addUnit(s, 'warrior', 0, 0, 0, { fortified: true });
    const ship = addUnit(s, 'galley', 0, 3, 0);
    const aboard = addUnit(s, 'warrior', 0, 3, 0, { carriedBy: ship.id });
    const ready = addUnit(s, 'warrior', 0, 2, 0);
    addUnit(s, 'warrior', 1, 2, 0);
    expect(listUnits(s, 0, 'all').map((u) => u.id)).toEqual([ship.id, ready.id, fort.id, aboard.id, done.id]);
    expect(listUnits(s, 0, 'fortified').map((u) => u.id)).toEqual([fort.id]);
    expect(listUnits(s, 0, 'aboard').map((u) => u.id)).toEqual([aboard.id]);
    expect(filterCounts(s, 0)).toEqual({ all: 5, ready: 2, fortified: 1, aboard: 1 });
    expect(unitWhere(s, 0, fort)).toBe(`in ${c.name}`);
    expect(unitWhere(s, 0, ready)).toBe(`2 tiles from ${c.name}`);
    expect(unitWhere(s, 0, done)).toBe(`1 tile from ${c.name}`);
  });

  it('an aircraft on a Carrier isn\'t "aboard" cargo', () => {
    const s = makeState(['ooo']);
    const carrier = addUnit(s, 'carrier', 0, 1, 0);
    const f = addUnit(s, 'fighter', 0, 1, 0, { carriedBy: carrier.id });
    expect(unitStatus(f)).toBe('ready');
  });
});

describe('Round 18 item 3: tapping your own units with a unit selected', () => {
  it('from afar: selects a unit there and offers the move; nobody moves', () => {
    const s = makeState([row(8)]);
    const legion = addUnit(s, 'legion', 0, 0, 0);
    const other = addUnit(s, 'legion', 0, 4, 0);
    expect(resolveTap(s, 0, legion.id, 4, 0)).toEqual({ kind: 'select', unitId: other.id, moveUnitId: legion.id });
    expect([legion.x, legion.y]).toEqual([0, 0]);
    expect(pathTurns(s, legion, findPath(s, legion, other)!)).toBe(4);
  });

  it('next to it (diagonals too): one tap moves in, as before', () => {
    const s = makeState([row(4), row(4)]);
    const w = addUnit(s, 'warrior', 0, 1, 0);
    const d = addUnit(s, 'warrior', 0, 3, 1);
    addUnit(s, 'warrior', 0, 2, 0);
    expect(resolveTap(s, 0, w.id, 2, 0)).toEqual({ kind: 'move', unitId: w.id });
    expect(resolveTap(s, 0, d.id, 2, 0)).toEqual({ kind: 'move', unitId: d.id });
  });

  it("can't get there: selects without an offer", () => {
    const s = makeState(['ggogg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    const far = addUnit(s, 'warrior', 0, 4, 0);
    expect(resolveTap(s, 0, w.id, 4, 0)).toEqual({ kind: 'select', unitId: far.id });
  });

  it('a ship from afar: the ship is selected, with a Board offer the path can reach', () => {
    const s = makeState(['gggoo']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    const ship = addUnit(s, 'galley', 0, 3, 0);
    expect(resolveTap(s, 0, w.id, 3, 0)).toEqual({ kind: 'select', unitId: ship.id, moveUnitId: w.id });
    const path = findPath(s, w, ship)!;
    expect(path.at(-1)).toEqual({ x: 3, y: 0 });
    expect(pathTurns(s, w, path)).toBe(3);
    // Following the offer: it walks and, on the last turn, boards.
    expect(applyAction(s, { type: 'move', unitId: w.id, to: { x: 3, y: 0 } }).ok).toBe(true);
    expect(w.x).toBe(1);
  });

  it('ships: one of your ships far off is selected; one next door is joined with one tap', () => {
    const s = makeState([row(6, 'c')]);
    const a = addUnit(s, 'galley', 0, 0, 0);
    const b = addUnit(s, 'galley', 0, 5, 0);
    const c = addUnit(s, 'galley', 0, 1, 0);
    expect(resolveTap(s, 0, a.id, 5, 0)).toEqual({ kind: 'select', unitId: b.id, moveUnitId: a.id });
    expect(resolveTap(s, 0, a.id, 1, 0)).toEqual({ kind: 'move', unitId: a.id });
    expect(c).toBeDefined();
  });

  it('a stack from afar: a ship or unit on its own feet is picked before cargo', () => {
    const s = makeState(['ggggo']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    const ship = addUnit(s, 'galley', 0, 4, 0);
    addUnit(s, 'warrior', 0, 4, 0, { carriedBy: ship.id });
    expect(resolveTap(s, 0, w.id, 4, 0)).toMatchObject({ kind: 'select', unitId: ship.id });
  });

  it('a selected unit with no moves left just selects, as before', () => {
    const s = makeState([row(6)]);
    const w = addUnit(s, 'warrior', 0, 0, 0, { movesLeft: 0 });
    const o = addUnit(s, 'warrior', 0, 4, 0);
    expect(resolveTap(s, 0, w.id, 4, 0)).toEqual({ kind: 'select', unitId: o.id });
  });

  it('aircraft are unchanged: a Carrier of yours in range is a rebase', () => {
    const s = makeState(['goooo']);
    s.players[0]!.techs.push('flight', 'advanced_flight');
    addCity(s, 0, 0, 0);
    const f = addUnit(s, 'fighter', 0, 0, 0);
    addUnit(s, 'carrier', 0, 3, 0);
    expect(resolveTap(s, 0, f.id, 3, 0)).toEqual({ kind: 'move', unitId: f.id });
  });

  it('your own city is still Round 17\'s rule (opens, with Move here)', () => {
    const s = makeState([row(8)]);
    const c = addCity(s, 0, 6, 0);
    const legion = addUnit(s, 'legion', 0, 2, 0);
    addUnit(s, 'warrior', 0, 6, 0);
    expect(resolveTap(s, 0, legion.id, 6, 0)).toEqual({ kind: 'openCity', cityId: c.id, moveUnitId: legion.id });
  });
});
