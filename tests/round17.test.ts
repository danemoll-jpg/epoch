// Round 17: the city panel's arrows (A1), tapping your own city with a unit selected (B1), and
// "Tap twice to move" (B2).

import { describe, expect, it } from 'vitest';
import { findPath, pathTurns } from '../src/game/movement';
import { cityOrder, cityPlace, cycleCity, otherIdleCities } from '../src/ui/cityCycle';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/ui/settings';
import { confirmMove, resolveTap } from '../src/ui/tap';
import { learnedTech } from '../src/ui/text';
import { addCity, addUnit, makeState } from './helpers';

const row = (n: number, ch = 'g') => ch.repeat(n);

describe('Round 17 B1: tapping your own city with a unit selected', () => {
  it('a unit far from the city: the tap opens the city and offers the move, and moves nobody', () => {
    const s = makeState([row(8)]);
    const c = addCity(s, 0, 6, 0);
    const legion = addUnit(s, 'legion', 0, 2, 0);
    expect(resolveTap(s, 0, legion.id, 6, 0)).toEqual({ kind: 'openCity', cityId: c.id, moveUnitId: legion.id });
    expect([legion.x, legion.y]).toEqual([2, 0]);
  });

  it('a unit right next to the city moves in with one tap (diagonals count as next to it)', () => {
    const s = makeState([row(4), row(4)]);
    addCity(s, 0, 2, 0);
    const w = addUnit(s, 'warrior', 0, 1, 0);
    const d = addUnit(s, 'warrior', 0, 3, 1);
    expect(resolveTap(s, 0, w.id, 2, 0)).toEqual({ kind: 'move', unitId: w.id });
    expect(resolveTap(s, 0, d.id, 2, 0)).toEqual({ kind: 'move', unitId: d.id });
  });

  it("a unit that can't get there: the city opens without an offer", () => {
    const s = makeState(['ggogg']);
    const c = addCity(s, 0, 4, 0);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(resolveTap(s, 0, w.id, 4, 0)).toEqual({ kind: 'openCity', cityId: c.id });
  });

  it('other tiles move exactly as before, near or far', () => {
    const s = makeState([row(8)]);
    addCity(s, 0, 7, 0);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(resolveTap(s, 0, w.id, 1, 0)).toEqual({ kind: 'move', unitId: w.id });
    expect(resolveTap(s, 0, w.id, 5, 0)).toEqual({ kind: 'move', unitId: w.id });
  });

  it('an enemy next to the unit is still an attack, and an enemy city is not "your city"', () => {
    const s = makeState([row(8)]);
    const w = addUnit(s, 'warrior', 0, 2, 0);
    addUnit(s, 'warrior', 1, 3, 0);
    expect(resolveTap(s, 0, w.id, 3, 0)).toEqual({ kind: 'attack', unitId: w.id });
    addCity(s, 1, 6, 0);
    expect(resolveTap(s, 0, w.id, 6, 0).kind).not.toBe('openCity');
  });

  it('aircraft are unchanged: a city of yours in range is a rebase', () => {
    const s = makeState([row(10)]);
    s.players[0]!.techs.push('flight');
    addCity(s, 0, 0, 0);
    const far = addCity(s, 0, 3, 0);
    const plane = addUnit(s, 'fighter', 0, 0, 0);
    expect(resolveTap(s, 0, plane.id, far.x, far.y)).toEqual({ kind: 'move', unitId: plane.id });
  });

  it('with nothing selected, or the unit already in the city, the tap opens it as before', () => {
    const s = makeState([row(4)]);
    const c = addCity(s, 0, 2, 0);
    const w = addUnit(s, 'warrior', 0, 2, 0);
    expect(resolveTap(s, 0, undefined, 2, 0)).toEqual({ kind: 'openCity', cityId: c.id });
    expect(resolveTap(s, 0, w.id, 2, 0)).toEqual({ kind: 'openCity', cityId: c.id });
  });
});

describe('Round 17 B1: the turns the "Move … here" button shows', () => {
  it('a Legion (1 move) 4 grassland tiles away takes 4 turns; a Horseman (2 moves) takes 2', () => {
    const s = makeState([row(8)]);
    const legion = addUnit(s, 'legion', 0, 0, 0);
    const horse = addUnit(s, 'horseman', 0, 0, 0);
    const to = { x: 4, y: 0 };
    expect(pathTurns(s, legion, findPath(s, legion, to)!)).toBe(4);
    expect(pathTurns(s, horse, findPath(s, horse, to)!)).toBe(2);
  });

  it('counts moves already spent this turn', () => {
    const s = makeState([row(8)]);
    const horse = addUnit(s, 'horseman', 0, 0, 0);
    horse.movesLeft = 1;
    // 1 step this turn, then 2 a turn: 3 steps take 2 turns, 4 take 3... here 3.
    expect(pathTurns(s, horse, findPath(s, horse, { x: 3, y: 0 })!)).toBe(2);
    expect(pathTurns(s, horse, findPath(s, horse, { x: 4, y: 0 })!)).toBe(3);
  });

  it('a unit with full moves always makes one step, even onto hills', () => {
    const s = makeState(['ghhg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(pathTurns(s, w, findPath(s, w, { x: 3, y: 0 })!)).toBe(3);
  });

  it('a one-step move is one turn', () => {
    const s = makeState([row(3)]);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(pathTurns(s, w, findPath(s, w, { x: 1, y: 0 })!)).toBe(1);
  });
});

describe('Round 17 A1: cycling through your cities', () => {
  function fiveCities() {
    const s = makeState([row(20)]);
    const a = addCity(s, 0, 0, 0);
    const cap = addCity(s, 0, 4, 0, { capitalOf: 0 });
    const b = addCity(s, 0, 8, 0);
    addCity(s, 1, 12, 0); // a rival's: never in the list
    const c = addCity(s, 0, 16, 0);
    for (const x of s.cities) x.build = { kind: 'unit', id: 'warrior' };
    return { s, a, cap, b, c };
  }

  it('the capital first, then founding order; rivals left out', () => {
    const { s, a, cap, b, c } = fiveCities();
    expect(cityOrder(s, 0).map((x) => x.id)).toEqual([cap.id, a.id, b.id, c.id]);
    expect(cityPlace(s, 0, cap.id)).toEqual({ index: 1, count: 4 });
    expect(cityPlace(s, 0, c.id)).toEqual({ index: 4, count: 4 });
  });

  it('next and previous wrap around', () => {
    const { s, a, cap, c } = fiveCities();
    expect(cycleCity(s, 0, cap.id, 1)).toBe(a.id);
    expect(cycleCity(s, 0, c.id, 1)).toBe(cap.id);
    expect(cycleCity(s, 0, cap.id, -1)).toBe(c.id);
  });

  it('with one city there is nowhere to go (the arrows are hidden)', () => {
    const s = makeState([row(4)]);
    const only = addCity(s, 0, 1, 0, { capitalOf: 0 });
    expect(cycleCity(s, 0, only.id, 1)).toBeUndefined();
    expect(cityPlace(s, 0, only.id)).toEqual({ index: 1, count: 1 });
  });

  it('a city lost mid-cycle: the arrows go on from where it was', () => {
    const { s, a, cap, b, c } = fiveCities();
    b.owner = 1; // captured while its panel was open
    expect(cycleCity(s, 0, b.id, 1)).toBe(c.id);
    expect(cycleCity(s, 0, b.id, -1)).toBe(a.id);
    c.owner = 1;
    expect(cycleCity(s, 0, c.id, 1)).toBe(cap.id); // wraps past the end (the lowest id first)
    expect(cycleCity(s, 0, cap.id, 1)).toBe(a.id);
  });

  it('the dot counts other cities with nothing to build', () => {
    const { s, a, cap, b } = fiveCities();
    a.build = null;
    b.build = null;
    expect(otherIdleCities(s, 0, cap.id)).toBe(2);
    expect(otherIdleCities(s, 0, a.id)).toBe(1);
  });
});

describe('Round 17 B2: "Tap twice to move"', () => {
  it('off by default; kept when on', () => {
    expect(DEFAULT_SETTINGS.tapTwice).toBe(false);
    expect(normalizeSettings({}).tapTwice).toBe(false);
    expect(normalizeSettings({ tapTwice: true }).tapTwice).toBe(true);
    expect(normalizeSettings({ tapTwice: 'yes' }).tapTwice).toBe(false);
  });

  it('the second tap on the same tile for the same unit moves; anything else only shows the path', () => {
    const pending = { unitId: 5, x: 3, y: 4 };
    expect(confirmMove(false, undefined, 5, 3, 4)).toBe(true);
    expect(confirmMove(true, undefined, 5, 3, 4)).toBe(false);
    expect(confirmMove(true, pending, 5, 3, 4)).toBe(true);
    expect(confirmMove(true, pending, 5, 3, 5)).toBe(false);
    expect(confirmMove(true, pending, 6, 3, 4)).toBe(false);
  });
});

describe('Round 17: tech news gets its tech icon', () => {
  it('finds the tech in every way the game words a learned tech', () => {
    expect(learnedTech('Learned Writing')).toBe('writing');
    expect(learnedTech('Traded with the Franks: learned Currency')).toBe('currency');
    expect(learnedTech('Tribute from Mali: learned The Wheel')).toBe('the_wheel');
    expect(learnedTech('Learned Mathematics from the hut')).toBe('mathematics');
    expect(learnedTech('Learned Advanced Flight')).toBe('advanced_flight');
    expect(learnedTech('Learned Space Flight')).toBe('space_flight');
    expect(learnedTech('Learned Flight')).toBe('flight');
    expect(learnedTech('Babylon grew to size 3')).toBeUndefined();
  });
});
