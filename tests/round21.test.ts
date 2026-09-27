// Round 21 (items 1–3): an enemy Spy in your city no longer blocks your own units (the tap and
// the path search follow combat's defender rule), and a military unit stepping onto an enemy
// Spy catches it; a Spy in a city that changes hands is caught by the new owner.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game/actions';
import { attackError, hasVisibleDefender } from '../src/game/combat';
import { captureCity, transferCity } from '../src/game/conquest';
import { unitVisibleTo } from '../src/game/fog';
import { findPath, pathTurns } from '../src/game/movement';
import { opinionOf } from '../src/game/diplomacy';
import { SPIES } from '../src/data/spies';
import { UNITS } from '../src/data/units';
import { resolveTap } from '../src/ui/tap';
import { addCity, addUnit, makeState } from './helpers';

// Your city Oxford at (3, 1) with a Courthouse (so a rival spy next to or in it is seen), an
// enemy (player 1) Spy inside, and grassland all round.
function oxford(opts: { peace?: boolean } = {}) {
  const state = makeState(['gggggggg', 'gggggggg', 'gggggggg'], opts.peace ? { peace: true } : undefined);
  const city = addCity(state, 0, 3, 1, { name: 'Oxford', buildings: ['courthouse'] });
  addCity(state, 1, 7, 2, { name: 'Babylon', capitalOf: 1 });
  const spy = addUnit(state, 'spy', 1, 3, 1);
  return { state, city, spy };
}

const log = (s: ReturnType<typeof oxford>['state']) => s.log.map((e) => e.text);

describe('Round 21 item 1: an enemy spy in your city', () => {
  it('reproduces the setup: the spy is visible and nobody there would fight', () => {
    const { state, city, spy } = oxford();
    const legion = addUnit(state, 'legion', 0, 2, 1);
    expect(unitVisibleTo(state, 0, spy)).toBe(true);
    expect(hasVisibleDefender(state, city, 0, legion)).toBe(false);
    expect(attackError(state, legion, city)).toBe('Nothing to attack there');
  });

  it('from next door, the tap is a move (not an attack) and the unit gets in', () => {
    for (const peace of [false, true]) {
      const { state, city } = oxford({ peace });
      const legion = addUnit(state, 'legion', 0, 2, 1);
      expect(resolveTap(state, 0, legion.id, city.x, city.y)).toEqual({ kind: 'move', unitId: legion.id });
      expect(applyAction(state, { type: 'move', unitId: legion.id, to: city }).ok).toBe(true);
      expect(legion).toMatchObject({ x: city.x, y: city.y });
    }
  });

  it('from afar, the tap opens the city with "Move … here", and the move gets there (full moves)', () => {
    const { state, city } = oxford();
    const horse = addUnit(state, 'horseman', 0, 0, 1); // 2 moves, 3 tiles away
    const tap = resolveTap(state, 0, horse.id, city.x, city.y);
    expect(tap).toEqual({ kind: 'openCity', cityId: city.id, moveUnitId: horse.id });
    const path = findPath(state, horse, city)!;
    expect(path.at(-1)).toEqual({ x: city.x, y: city.y });
    expect(pathTurns(state, horse, path)).toBe(2);
    expect(applyAction(state, { type: 'move', unitId: horse.id, to: city }).ok).toBe(true);
    expect(horse).toMatchObject({ x: 2, movesLeft: 0 }); // one tile short
    // Next turn it carries on and gets in.
    horse.movesLeft = UNITS.horseman.moves;
    expect(applyAction(state, { type: 'move', unitId: horse.id, to: city }).ok).toBe(true);
    expect(horse).toMatchObject({ x: city.x, y: city.y });
  });

  it('two tiles away with full moves, it walks straight in', () => {
    const { state, city } = oxford();
    const horse = addUnit(state, 'horseman', 0, 1, 1);
    expect(resolveTap(state, 0, horse.id, city.x, city.y)).toMatchObject({ kind: 'openCity', moveUnitId: horse.id });
    expect(applyAction(state, { type: 'move', unitId: horse.id, to: city }).ok).toBe(true);
    expect(horse).toMatchObject({ x: city.x, y: city.y });
  });

  it('with almost no moves left, it says it can set off next turn (and does)', () => {
    const { state, city } = oxford();
    const legion = addUnit(state, 'legion', 0, 1, 1);
    legion.movesLeft = 1 / 3; // not enough for grassland off the road
    expect(resolveTap(state, 0, legion.id, city.x, city.y)).toMatchObject({ kind: 'openCity', moveUnitId: legion.id });
    const res = applyAction(state, { type: 'move', unitId: legion.id, to: city });
    expect(res).toEqual({ ok: false, reason: 'Not enough moves left this turn for the first tile: it can set off next turn' });
    legion.movesLeft = 1;
    expect(applyAction(state, { type: 'move', unitId: legion.id, to: city }).ok).toBe(true);
    legion.movesLeft = 1;
    expect(applyAction(state, { type: 'move', unitId: legion.id, to: city }).ok).toBe(true);
    expect(legion).toMatchObject({ x: city.x, y: city.y });
  });

  it('a unit already next to it with a sliver of moves still steps in (a unit with full moves may always move)', () => {
    const { state, city } = oxford();
    const legion = addUnit(state, 'legion', 0, 2, 1);
    expect(applyAction(state, { type: 'move', unitId: legion.id, to: city }).ok).toBe(true);
  });

  it('a real defender next door is still an attack, and an enemy on open ground too', () => {
    const { state, city } = oxford();
    addUnit(state, 'warrior', 1, 4, 1);
    const legion = addUnit(state, 'legion', 0, 3, 0);
    expect(resolveTap(state, 0, legion.id, 4, 1)).toEqual({ kind: 'attack', unitId: legion.id });
    expect(resolveTap(state, 0, legion.id, city.x, city.y)).toEqual({ kind: 'move', unitId: legion.id });
  });

  it('an aircraft never gets told to strike a lone spy', () => {
    const { state, city } = oxford();
    state.players[0]!.techs.push('flight');
    const bomber = addUnit(state, 'bomber', 0, 0, 0);
    // The spy sits in Oxford; tapping Oxford is a rebase, not a strike.
    expect(resolveTap(state, 0, bomber.id, city.x, city.y)).toEqual({ kind: 'move', unitId: bomber.id });
  });
});

describe('Round 21 item 2: catching spies', () => {
  it('says "a Ukrainian spy" and "an English spy"', () => {
    const { state, city } = oxford();
    state.players[1]!.civId = 'ukraine';
    addUnit(state, 'spy', 1, 4, 1);
    const legion = addUnit(state, 'legion', 0, 5, 1);
    applyAction(state, { type: 'move', unitId: legion.id, to: { x: 4, y: 1 } });
    expect(log(state)).toContain('You caught a Ukrainian spy near Oxford');
    state.players[1]!.civId = 'england';
    const warrior = addUnit(state, 'warrior', 0, 2, 1);
    applyAction(state, { type: 'move', unitId: warrior.id, to: city });
    expect(log(state)).toContain('You caught an English spy in Oxford');
  });

  it('walking into your city catches the enemy spy: news for both sides and the opinion hit', () => {
    const { state, city, spy } = oxford();
    const before = opinionOf(state, 0, 1);
    const legion = addUnit(state, 'legion', 0, 2, 1);
    expect(applyAction(state, { type: 'move', unitId: legion.id, to: city }).ok).toBe(true);
    expect(state.units.some((u) => u.id === spy.id)).toBe(false);
    const entry = state.log.find((e) => e.text === 'You caught a Mauryan spy in Oxford')!;
    expect(entry).toMatchObject({ player: 0, other: 1, kind: 'spy', otherText: 'Your spy was caught by Babylon in Oxford' });
    expect(opinionOf(state, 0, 1)).toBe(before + SPIES.caughtOpinion);
  });

  it('catches it on the way through, from afar', () => {
    const { state, city, spy } = oxford();
    const horse = addUnit(state, 'horseman', 0, 1, 1);
    expect(applyAction(state, { type: 'move', unitId: horse.id, to: city }).ok).toBe(true);
    expect(state.units.some((u) => u.id === spy.id)).toBe(false);
  });

  it('a spy on open ground is caught too, at peace as well as at war', () => {
    for (const peace of [false, true]) {
      const { state } = oxford({ peace });
      const spy = addUnit(state, 'spy', 1, 5, 0);
      const legion = addUnit(state, 'legion', 0, 4, 0);
      expect(resolveTap(state, 0, legion.id, 5, 0).kind).toBe('move');
      expect(applyAction(state, { type: 'move', unitId: legion.id, to: { x: 5, y: 0 } }).ok).toBe(true);
      expect(legion).toMatchObject({ x: 5, y: 0 });
      expect(state.units.some((u) => u.id === spy.id)).toBe(false);
      expect(log(state)).toContain('You caught a Mauryan spy near Oxford');
    }
  });

  it('a Settler or a Spy does not catch anyone', () => {
    const { state, city, spy } = oxford();
    const settler = addUnit(state, 'settler', 0, 2, 1);
    expect(applyAction(state, { type: 'move', unitId: settler.id, to: city }).ok).toBe(true);
    const mySpy = addUnit(state, 'spy', 0, 2, 1);
    expect(applyAction(state, { type: 'move', unitId: mySpy.id, to: city }).ok).toBe(true);
    expect(state.units.some((u) => u.id === spy.id)).toBe(true);
  });

  it('the AI catches spies the same way (the same move action)', () => {
    const { state, city, spy } = oxford();
    city.owner = 1;
    spy.owner = 0;
    const ai = addUnit(state, 'legion', 1, 2, 1);
    state.currentPlayer = 1;
    expect(applyAction(state, { type: 'move', unitId: ai.id, to: city }).ok).toBe(true);
    expect(state.units.some((u) => u.id === spy.id)).toBe(false);
    expect(state.log.at(-1)).toMatchObject({ player: 1, other: 0, otherText: 'Your spy was caught by Maurya in Oxford' });
  });

  it('a city that changes hands: a rival spy inside is caught by the new owner', () => {
    // Captured: Oxford (player 0) taken by player 1 with a player-2 spy inside.
    const state = makeState(['gggggggg', 'gggggggg', 'gggggggg'], { players: 3 });
    const city = addCity(state, 0, 3, 1, { name: 'Oxford' });
    const spy = addUnit(state, 'spy', 2, 3, 1);
    const mine = addUnit(state, 'spy', 1, 3, 1);
    captureCity(state, city, 1);
    expect(state.units.some((u) => u.id === spy.id)).toBe(false);
    expect(state.units.some((u) => u.id === mine.id)).toBe(true);
    expect(log(state).some((t) => t.startsWith('You caught a') && t.endsWith('spy in Oxford'))).toBe(true);
    // Changed hands without a fight (a revolt or a culture flip): the same.
    const spy2 = addUnit(state, 'spy', 2, 3, 1);
    transferCity(state, city, 0);
    expect(state.units.some((u) => u.id === spy2.id)).toBe(false);
  });
});
