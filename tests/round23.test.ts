// Round 23: the Drone (a reusable spy in the sky, then a one-shot strike that's hard to catch),
// fighter escort groups, and air cover. (Items 1–3 are in round18.test.ts, combat.test.ts and
// calendar.test.ts; item 1 is UI only.)

import { describe, expect, it } from 'vitest';
import { AIR } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import { applyAction } from '../src/game/actions';
import { airBuild, bestStrike, runAiAir } from '../src/game/aiAir';
import { rebaseError, rebaseTargets } from '../src/game/air';
import { attackError, combatOdds, fortifyError, interception, overallChance } from '../src/game/combat';
import { addEscortError, airCover, escortsOf, groupRange } from '../src/game/escorts';
import { removeUnit } from '../src/game/naval';
import { deserializeGame } from '../src/game/save';
import { hasIntel } from '../src/game/spies';
import { STATE_VERSION, type GameState } from '../src/game/types';
import { addCity, addUnit, makeState } from './helpers';

// A 16×9 island ringed by coast.
const MAP = [
  'cccccccccccccccc',
  'cggggggggggggggc',
  'cggggggggggggggc',
  'cggggggggggggggc',
  'cggggggggggggggc',
  'cggggggggggggggc',
  'cggggggggggggggc',
  'cggggggggggggggc',
  'cccccccccccccccc',
];

/** You (0) at (2, 4) and a rival (1) at (12, 4), at war, both knowing the air techs. */
function sky(): GameState {
  const s = makeState(MAP);
  for (const p of s.players) p.techs = ['flight', 'advanced_flight', 'computers'];
  addCity(s, 0, 2, 4, { name: 'Ur' });
  addCity(s, 1, 12, 4, { name: 'Kish' });
  addUnit(s, 'rifleman', 0, 2, 4, { fortified: true });
  addUnit(s, 'rifleman', 1, 12, 4, { fortified: true });
  addUnit(s, 'warrior', 0, 11, 4); // eyes on Kish
  return s;
}

/** Finds dice for which `check` holds on a fresh state. */
function withDice(build: () => GameState, check: (s: GameState) => boolean): GameState {
  for (let i = 0; i < 3000; i++) {
    const dice = (4242 + i * 0x9e3779b9) >>> 0;
    const trial = build();
    trial.rngState = dice;
    if (check(trial)) {
      const s = build();
      s.rngState = dice;
      return s;
    }
  }
  throw new Error('no dice');
}

const KISH = { x: 12, y: 4 };

describe('Round 23 item 4: the Drone scouts (and investigates) again and again', () => {
  it('scouting next to a rival city opens its report, and the Drone is back next turn', () => {
    const s = sky();
    const drone = addUnit(s, 'drone', 0, 2, 4);
    expect(applyAction(s, { type: 'recon', unitId: drone.id, at: { x: 11, y: 5 } }).ok).toBe(true);
    const kish = s.cities.find((c) => c.name === 'Kish')!;
    expect(hasIntel(s, 0, kish.id)).toBe(true);
    expect(s.units.includes(drone)).toBe(true);
    s.turn += AIR.droneIntelTurns;
    expect(hasIntel(s, 0, kish.id)).toBe(true);
    s.turn++;
    expect(hasIntel(s, 0, kish.id)).toBe(false);
  });

  it('scouting far from any city investigates nothing', () => {
    const s = sky();
    const drone = addUnit(s, 'drone', 0, 2, 4);
    expect(applyAction(s, { type: 'recon', unitId: drone.id, at: { x: 7, y: 1 } }).ok).toBe(true);
    expect(s.players[0]!.intel ?? []).toEqual([]);
  });
});

describe('Round 23 item 4: the Drone strikes once (self-destruct)', () => {
  it('is almost as strong as the Stealth Bomber', () => {
    expect(UNITS.drone.attack).toBeGreaterThanOrEqual(UNITS.stealth_bomber.attack - 3);
    expect(UNITS.drone.oneShot).toBe(true);
  });

  it('is used up when it wins', () => {
    const s = withDice(sky, (t) => {
      const d = addUnit(t, 'drone', 0, 2, 4);
      return applyAction(t, { type: 'attack', unitId: d.id, at: KISH }).combat?.attackerWon === true;
    });
    const drone = addUnit(s, 'drone', 0, 2, 4);
    const res = applyAction(s, { type: 'attack', unitId: drone.id, at: KISH });
    expect(res.combat?.attackerWon).toBe(true);
    expect(res.combat?.oneShot).toBe(true);
    expect(s.units.some((u) => u.id === drone.id)).toBe(false);
    expect(s.cities.find((c) => c.name === 'Kish')!.owner).toBe(1);
  });

  it('is used up when it loses', () => {
    const s = withDice(sky, (t) => {
      const d = addUnit(t, 'drone', 0, 2, 4);
      return applyAction(t, { type: 'attack', unitId: d.id, at: KISH }).combat?.attackerWon === false;
    });
    const drone = addUnit(s, 'drone', 0, 2, 4);
    expect(applyAction(s, { type: 'attack', unitId: drone.id, at: KISH }).combat?.attackerWon).toBe(false);
    expect(s.units.some((u) => u.id === drone.id)).toBe(false);
  });

  it('fighters catch it half the time or less, even a veteran Jet over its own land', () => {
    const s = sky();
    const drone = addUnit(s, 'drone', 0, 2, 4);
    addUnit(s, 'jet_fighter', 1, 12, 4, { veteran: true });
    const i = interception(s, drone, KISH)!;
    expect(i.slip).toBe(0.5);
    expect(i.attack.mods.map((m) => m.label)).toContain('Over its own land');
    expect(i.total).toBeLessThanOrEqual(0.5);
  });

  it('can slip past: then no fight with the fighter happens', () => {
    const build = () => {
      const t = sky();
      addUnit(t, 'fighter', 1, 12, 4);
      return t;
    };
    const s = withDice(build, (t) => {
      const d = addUnit(t, 'drone', 0, 2, 4);
      return !!applyAction(t, { type: 'attack', unitId: d.id, at: KISH }).combat?.interception?.slipped;
    });
    const drone = addUnit(s, 'drone', 0, 2, 4);
    const res = applyAction(s, { type: 'attack', unitId: drone.id, at: KISH });
    expect(res.combat?.interception?.fighterWon).toBe(false);
    expect(s.units.some((u) => u.type === 'fighter')).toBe(true);
  });

  it('the AI keeps its Drone for a key target and scouts otherwise', () => {
    const s = sky();
    s.currentPlayer = 1;
    const eyes = s.units.find((u) => u.owner === 0 && u.x === 11)!;
    removeUnit(s, eyes.id);
    const drone = addUnit(s, 'drone', 1, 12, 4);
    // A lone Warrior of yours in the open, far from Kish (their Warrior next to it sees it): not a key target.
    addUnit(s, 'warrior', 0, 6, 1);
    addUnit(s, 'warrior', 1, 6, 2);
    expect(attackError(s, drone, { x: 6, y: 1 })).toBeUndefined();
    expect(bestStrike(s, drone, null)).toBeUndefined();
    // Next to one of its cities it is.
    addUnit(s, 'warrior', 0, 11, 4);
    expect(bestStrike(s, drone, null)).toEqual({ x: 11, y: 4 });
  });
});

describe('Round 23 item 5: escort groups', () => {
  function base(): { s: GameState; bomber: ReturnType<typeof addUnit> } {
    const s = sky();
    const bomber = addUnit(s, 'bomber', 0, 2, 4);
    return { s, bomber };
  }

  it('a bomber takes up to two fighters based with it; Split lets them go', () => {
    const { s, bomber } = base();
    const f1 = addUnit(s, 'fighter', 0, 2, 4);
    const f2 = addUnit(s, 'jet_fighter', 0, 2, 4);
    const f3 = addUnit(s, 'fighter', 0, 2, 4);
    expect(applyAction(s, { type: 'addEscort', unitId: bomber.id }).ok).toBe(true);
    // The best fighter first.
    expect(f2.escortOf).toBe(bomber.id);
    expect(applyAction(s, { type: 'addEscort', unitId: bomber.id, escortId: f1.id }).ok).toBe(true);
    expect(addEscortError(s, bomber, f3)).toBe(`A bomber takes at most ${AIR.maxEscorts} escorts`);
    expect(escortsOf(s, bomber).map((u) => u.id)).toEqual([f1.id, f2.id]);
    expect(applyAction(s, { type: 'splitEscorts', unitId: bomber.id }).ok).toBe(true);
    expect(escortsOf(s, bomber)).toEqual([]);
    expect(f1.escortOf).toBeUndefined();
  });

  it('only bombers take escorts, only fighters escort, and only from the same base', () => {
    const { s, bomber } = base();
    const drone = addUnit(s, 'drone', 0, 2, 4);
    const f = addUnit(s, 'fighter', 0, 2, 4);
    const away = addUnit(s, 'fighter', 0, 11, 4);
    expect(addEscortError(s, drone, f)).toBe('Only Bombers and Stealth Bombers take escorts');
    expect(addEscortError(s, bomber, drone)).toBe('Only your Fighters and Jet Fighters escort');
    expect(addEscortError(s, bomber, away)).toBe('The fighter must be based with the bomber');
  });

  it('an escort takes no orders of its own; the group flies as far as its shortest range', () => {
    const { s, bomber } = base();
    const f = addUnit(s, 'fighter', 0, 2, 4);
    applyAction(s, { type: 'addEscort', unitId: bomber.id });
    expect(groupRange(s, bomber)).toBe(UNITS.fighter.range);
    expect(attackError(s, f, KISH)).toMatch(/escorting the Bomber/);
    expect(fortifyError(s, f)).toMatch(/escorting the Bomber/);
    expect(rebaseError(s, f, { x: 3, y: 4 })).toMatch(/escorting the Bomber/);
    addCity(s, 0, 8, 4, { name: 'Far' }); // 6 tiles: the Bomber's range, not the Fighter's
    expect(rebaseError(s, bomber, { x: 8, y: 4 })).toBe(`Out of range (${UNITS.fighter.range} tiles with its escorts)`);
    addCity(s, 0, 6, 4, { name: 'Near' });
    expect(rebaseTargets(s, bomber).some((c) => c.x === 8)).toBe(false);
    expect(applyAction(s, { type: 'rebase', unitId: bomber.id, to: { x: 6, y: 4 } }).ok).toBe(true);
    expect([f.x, f.y, f.movesLeft]).toEqual([6, 4, 0]);
  });

  it('rebasing onto a Carrier needs room for the whole group', () => {
    const { s, bomber } = base();
    s.map.tiles[4 * 16 + 1]!.terrain = 'coast';
    addUnit(s, 'fighter', 0, 2, 4);
    addUnit(s, 'fighter', 0, 2, 4);
    applyAction(s, { type: 'addEscort', unitId: bomber.id });
    applyAction(s, { type: 'addEscort', unitId: bomber.id });
    const carrier = addUnit(s, 'carrier', 0, 1, 4);
    addUnit(s, 'fighter', 0, 1, 4, { carriedBy: carrier.id });
    expect(rebaseError(s, bomber, { x: 1, y: 4 })).toBe('The Carrier is full');
  });

  it('an interceptor must get past each escort first: two protect more than one', () => {
    const odds = (n: number) => {
      const { s, bomber } = base();
      for (let i = 0; i < n; i++) addUnit(s, 'jet_fighter', 0, 2, 4);
      for (let i = 0; i < n; i++) applyAction(s, { type: 'addEscort', unitId: bomber.id });
      addUnit(s, 'jet_fighter', 1, 12, 4);
      return interception(s, bomber, KISH)!;
    };
    const [none, one, two] = [odds(0), odds(1), odds(2)];
    expect(none.escorts).toEqual([]);
    expect(two.escorts).toHaveLength(2);
    expect(one.total).toBeLessThan(none.total);
    expect(two.total).toBeLessThan(one.total);
    expect(two.total).toBeCloseTo(two.escorts[0]!.chance * two.escorts[1]!.chance * two.chance, 10);
  });

  it('an escort can shoot the interceptor down (the strike goes ahead), or be shot down itself', () => {
    const build = () => {
      const t = sky();
      addCity(t, 0, 9, 4, { name: 'Front' });
      const b = addUnit(t, 'bomber', 0, 9, 4);
      addUnit(t, 'fighter', 0, 9, 4);
      applyAction(t, { type: 'addEscort', unitId: b.id });
      addUnit(t, 'fighter', 1, 12, 4);
      return t;
    };
    const bomberOf = (t: GameState) => t.units.find((u) => u.type === 'bomber')!;
    const won = withDice(build, (t) => !!applyAction(t, { type: 'attack', unitId: bomberOf(t).id, at: KISH }).combat?.interception?.escortWon);
    const r1 = applyAction(won, { type: 'attack', unitId: bomberOf(won).id, at: KISH });
    expect(r1.combat?.interception?.escortWon).toBe(true);
    expect(won.units.some((u) => u.owner === 1 && u.type === 'fighter')).toBe(false);
    expect(won.units.some((u) => u.owner === 0 && u.type === 'fighter')).toBe(true);

    const lost = withDice(build, (t) => applyAction(t, { type: 'attack', unitId: bomberOf(t).id, at: KISH }).combat?.interception?.escortsLost === 1);
    applyAction(lost, { type: 'attack', unitId: bomberOf(lost).id, at: KISH });
    expect(lost.units.some((u) => u.owner === 0 && u.type === 'fighter')).toBe(false);
  });

  it('a lost bomber releases its escorts', () => {
    const { s, bomber } = base();
    const f = addUnit(s, 'fighter', 0, 2, 4);
    applyAction(s, { type: 'addEscort', unitId: bomber.id });
    removeUnit(s, bomber.id);
    expect(f.escortOf).toBeUndefined();
  });

  it('the AI takes escorts when the enemy has fighters, and lets them go after', () => {
    const s = sky();
    s.currentPlayer = 1;
    const b = addUnit(s, 'bomber', 1, 12, 4);
    const f = addUnit(s, 'fighter', 1, 12, 4);
    addUnit(s, 'fighter', 0, 2, 4);
    // Something worth striking next to Kish.
    addUnit(s, 'warrior', 0, 10, 4);
    runAiAir(s, 1, null);
    expect(b.movesLeft === 0 || !s.units.includes(b)).toBe(true);
    expect(f.escortOf).toBeUndefined();
    expect(f.movesLeft).toBe(0);
  });
});

describe('Round 23 item 5: air cover', () => {
  it('your units within a fighter\'s range defend better against aircraft; Jets more than Fighters', () => {
    const s = sky();
    const bomber = addUnit(s, 'bomber', 0, 7, 4);
    s.cities.push({ ...s.cities[0]!, id: 99, x: 7, y: 4, owner: 0, name: 'Mid' });
    const plain = combatOdds(s, bomber, KISH)!.defense;
    expect(plain.mods.some((m) => m.label === 'Air cover')).toBe(false);
    const f = addUnit(s, 'fighter', 1, 12, 4, { movesLeft: 0 });
    expect(airCover(s, 1, KISH).pct).toBe(UNITS.fighter.airCoverPct);
    expect(combatOdds(s, bomber, KISH)!.defense.mods).toContainEqual({ label: 'Air cover', pct: 25 });
    f.type = 'jet_fighter';
    expect(combatOdds(s, bomber, KISH)!.defense.mods).toContainEqual({ label: 'Air cover', pct: 50 });
    expect(overallChance(s, bomber, KISH)).toBeLessThan(combatOdds(s, bomber, KISH)!.chance);
  });

  it('only against aircraft: a land attack gets no air cover', () => {
    const s = sky();
    addUnit(s, 'jet_fighter', 1, 12, 4);
    const w = s.units.find((u) => u.owner === 0 && u.x === 11)!;
    expect(combatOdds(s, w, KISH)!.defense.mods.some((m) => m.label === 'Air cover')).toBe(false);
  });

  it('out of range there is no cover', () => {
    const s = sky();
    addUnit(s, 'fighter', 1, 12, 4);
    expect(airCover(s, 1, { x: 2, y: 4 }).pct).toBe(0);
  });

  it('the AI builds more fighters when an enemy flies bombers or Drones', () => {
    const s = sky();
    const kish = addCity(s, 1, 14, 4, { name: 'Lagash' }); // coastal: a city that keeps fighters
    addUnit(s, 'fighter', 1, 14, 4);
    expect(airBuild(s, kish, true).fighter).toBeUndefined();
    addUnit(s, 'drone', 0, 2, 4);
    expect(airBuild(s, kish, true).fighter).toBeDefined();
  });
});

describe('Round 23: the save', () => {
  it(`is version ${STATE_VERSION}, and a version 16 save loads with nothing escorting`, () => {
    expect(STATE_VERSION).toBe(17);
    const s = sky();
    addUnit(s, 'bomber', 0, 2, 4);
    (s as unknown as { version: number }).version = 16;
    const res = deserializeGame(JSON.stringify({ saveVersion: 16, savedAt: 1, state: s }));
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.state.units.every((u) => u.escortOf === undefined)).toBe(true);
  });
});
