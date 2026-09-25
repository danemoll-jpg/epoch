// Aircraft (Round 10): the new techs, the base-and-strike model (range, one strike a turn, the
// automatic return), rebasing to cities and Carriers, interception (and stealth), no capture
// from the air, aircraft never defending and being lost with their city or Carrier, the
// Helicopter, the Airport (veterans, the airlift), the AI's air power, and the v8 → v9 save.

import { describe, expect, it } from 'vitest';
import { RULES } from '../src/data/rules';
import { TECHS, TECH_LIST } from '../src/data/techs';
import { UNITS } from '../src/data/units';
import { applyAction } from '../src/game/actions';
import { airBuild, bestStrike, runAiAir } from '../src/game/aiAir';
import { chooseBuild, runAiTurn } from '../src/game/ai';
import { airliftTargets, rebaseTargets } from '../src/game/air';
import { attackError, combatOdds, formArmyError, interception, overallChance, pickDefender } from '../src/game/combat';
import { distance } from '../src/game/grid';
import { reachableThisTurn } from '../src/game/movement';
import { createGame } from '../src/game/newGame';
import { buildChoiceError, processCities } from '../src/game/production';
import { deserializeGame, serializeGame } from '../src/game/save';
import { techUnlocks } from '../src/game/tech';
import { STATE_VERSION, type GameState, type Unit } from '../src/game/types';
import { addCity, addUnit, makeState } from './helpers';

// A 12×7 island ringed by coast, with open ocean on the right: (0..9 land-ish), cities placed by each test.
const MAP = [
  'cccccccccccc',
  'cggggggggggc',
  'cggggggggggc',
  'cggggggggggc',
  'cggggggggggc',
  'cggggggggggc',
  'cccccccccccc',
];

/** You (0) and a rival (1), at war, everyone knowing Flight; your city at (2, 3), theirs at (9, 3). */
function field(): { s: GameState; home: ReturnType<typeof addCity>; enemy: ReturnType<typeof addCity> } {
  const s = makeState(MAP);
  for (const p of s.players) p.techs = ['flight'];
  const home = addCity(s, 0, 2, 3, { name: 'Home' });
  const enemy = addCity(s, 1, 9, 3, { name: 'Enemy' });
  addUnit(s, 'rifleman', 0, 2, 3, { fortified: true });
  addUnit(s, 'rifleman', 1, 9, 3, { fortified: true });
  return { s, home, enemy };
}

/** Finds dice for which `check` holds on a fresh state (for rolls we need one way). */
function withDice(build: () => GameState, check: (s: GameState) => boolean): GameState {
  for (let i = 0; i < 2000; i++) {
    const dice = (777 + i * 0x9e3779b9) >>> 0;
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

const find = (s: GameState, id: number): Unit => s.units.find((u) => u.id === id)!;

describe('techs and data', () => {
  it('Flight unlocks the Fighter, the Bomber, and the Airport; Advanced Flight the Jet Fighter and Helicopter', () => {
    const flight = techUnlocks('flight');
    expect(flight.units).toEqual(expect.arrayContaining(['fighter', 'bomber', 'carrier']));
    expect(flight.buildings).toContain('airport');
    const adv = techUnlocks('advanced_flight');
    expect(adv.units).toEqual(expect.arrayContaining(['jet_fighter', 'helicopter', 'stealth_bomber']));
    expect(TECHS.advanced_flight).toMatchObject({ era: 'modern', prereqs: ['flight', 'machine_tools'] });
    // Tier = depth in the tree.
    const tier = Math.max(...TECHS.advanced_flight.prereqs.map((t) => TECHS[t].tier)) + 1;
    expect(TECHS.advanced_flight.tier).toBe(tier);
    expect(TECH_LIST).toHaveLength(56); // Round 12 added Theology
  });

  it('the Stealth Bomber needs Advanced Flight and Computers', () => {
    const { s, home } = field();
    const item = { kind: 'unit', id: 'stealth_bomber' } as const;
    s.players[0]!.techs = ['flight', 'advanced_flight'];
    expect(buildChoiceError(s, home, item)).toBe('Needs Computers');
    expect(techUnlocks('computers').units).toContain('stealth_bomber');
    s.players[0]!.techs.push('computers');
    expect(buildChoiceError(s, home, item)).toBeUndefined();
  });

  it('every aircraft has a range; the Carrier carries 3; no air armies', () => {
    for (const id of ['fighter', 'bomber', 'jet_fighter', 'stealth_bomber'] as const) {
      expect(UNITS[id].domain).toBe('air');
      expect(UNITS[id].range).toBeGreaterThan(0);
    }
    expect(UNITS.helicopter).toMatchObject({ domain: 'land', hover: true });
    expect(UNITS.carrier.airCargo).toBe(3);
    const { s } = field();
    for (let i = 0; i < 3; i++) addUnit(s, 'fighter', 0, 2, 3);
    expect(formArmyError(s, s.units.find((u) => u.type === 'fighter')!)).toBe('Aircraft can’t form armies');
  });
});

describe('strikes', () => {
  it('reach any visible target within range, and nothing beyond it', () => {
    const { s } = field();
    const bomber = addUnit(s, 'bomber', 0, 2, 3);
    const near = addUnit(s, 'warrior', 1, 4, 3);
    const far = { x: 9, y: 3 }; // 7 tiles: out of a Bomber's 6
    expect(attackError(s, bomber, near)).toBeUndefined();
    expect(attackError(s, bomber, far)).toBe(`Out of range (${UNITS.bomber.range} tiles)`);
    // In range but unseen: no strike.
    const hidden = addUnit(s, 'warrior', 1, 7, 5);
    expect(distance(bomber, hidden)).toBeLessThanOrEqual(UNITS.bomber.range!);
    expect(attackError(s, bomber, hidden)).toBe('You can’t see anything to strike there');
  });

  it('one strike a turn, and the aircraft is back at its base afterwards', () => {
    const { s } = field();
    const bomber = addUnit(s, 'bomber', 0, 2, 3);
    addUnit(s, 'warrior', 1, 4, 3);
    addUnit(s, 'warrior', 1, 4, 4);
    const res = applyAction(s, { type: 'attack', unitId: bomber.id, at: { x: 4, y: 3 } });
    expect(res.ok).toBe(true);
    const after = find(s, bomber.id);
    if (after) {
      expect({ x: after.x, y: after.y, movesLeft: after.movesLeft }).toEqual({ x: 2, y: 3, movesLeft: 0 });
      expect(attackError(s, after, { x: 4, y: 4 })).toBe('Already flew this turn');
    }
    expect(res.combat!.airStrike).toBe(true);
  });

  it('never captures: killing a city’s last defender leaves it empty and theirs', () => {
    const build = () => {
      const { s } = field();
      addCity(s, 1, 5, 3, { name: 'Near' });
      addUnit(s, 'warrior', 1, 5, 3);
      addUnit(s, 'bomber', 0, 2, 3);
      addUnit(s, 'warrior', 0, 4, 2); // a spotter
      return s;
    };
    const s = withDice(build, (t) => !!applyAction(t, { type: 'attack', unitId: t.units.find((u) => u.type === 'bomber')!.id, at: { x: 5, y: 3 } }).combat?.attackerWon);
    const bomber = s.units.find((u) => u.type === 'bomber')!;
    const res = applyAction(s, { type: 'attack', unitId: bomber.id, at: { x: 5, y: 3 } });
    expect(res.combat!.attackerWon).toBe(true);
    expect(res.combat!.capturedCityId).toBeUndefined();
    expect(s.cities.find((c) => c.name === 'Near')!.owner).toBe(1);
    expect({ x: bomber.x, y: bomber.y }).toEqual({ x: 2, y: 3 });
  });

  it('Walls don’t help against aircraft', () => {
    const { s, enemy } = field();
    enemy.buildings.push('walls');
    const bomber = addUnit(s, 'bomber', 0, 5, 3, {});
    addCity(s, 0, 5, 3, { name: 'Forward' });
    addUnit(s, 'warrior', 0, 8, 3); // a spotter
    const odds = combatOdds(s, bomber, enemy)!;
    expect(odds.defense.mods.map((m) => m.label)).not.toContain('Walls');
  });
});

describe('aircraft on the ground and at sea', () => {
  it('don’t defend a city: ground units can’t attack them, and walk in to take the city', () => {
    const { s } = field();
    addCity(s, 1, 5, 3, { name: 'Airbase' });
    const fighter = addUnit(s, 'fighter', 1, 5, 3);
    const legion = addUnit(s, 'legion', 0, 4, 3);
    expect(pickDefender(s, { x: 5, y: 3 }, 0)).toBeUndefined();
    expect(attackError(s, legion, { x: 5, y: 3 })).toBe('Nothing to attack there');
    expect(applyAction(s, { type: 'move', unitId: legion.id, to: { x: 5, y: 3 } }).ok).toBe(true);
    expect(s.cities.find((c) => c.name === 'Airbase')!.owner).toBe(0);
    // Lost with the city.
    expect(find(s, fighter.id)).toBeUndefined();
    expect(s.log.some((e) => e.text.includes('an aircraft on the ground'))).toBe(true);
  });

  it('are lost with their Carrier when it sinks', () => {
    const build = () => {
      const { s } = field();
      const carrier = addUnit(s, 'carrier', 1, 11, 2);
      addUnit(s, 'fighter', 1, 11, 2, { carriedBy: carrier.id });
      addUnit(s, 'battleship', 0, 11, 1);
      return s;
    };
    const s = withDice(build, (t) => !!applyAction(t, { type: 'attack', unitId: t.units.find((u) => u.type === 'battleship')!.id, at: { x: 11, y: 2 } }).combat?.attackerWon);
    const res = applyAction(s, { type: 'attack', unitId: s.units.find((u) => u.type === 'battleship')!.id, at: { x: 11, y: 2 } });
    expect(res.combat).toMatchObject({ attackerWon: true, cargoLost: 1 });
    expect(s.units.some((u) => u.type === 'fighter')).toBe(false);
  });

  it('rebase to a city or a Carrier in range, using the turn; the Carrier holds 3', () => {
    const { s, home } = field();
    const other = addCity(s, 0, 5, 1, { name: 'Other' });
    const carrier = addUnit(s, 'carrier', 0, 0, 3);
    const planes = [0, 1, 2, 3].map(() => addUnit(s, 'fighter', 0, home.x, home.y));
    const targets = reachableThisTurn(s, planes[0]!);
    expect(targets).toContainEqual({ x: other.x, y: other.y });
    expect(targets).toContainEqual({ x: carrier.x, y: carrier.y });
    // Enemy cities and open tiles aren't bases.
    expect(applyAction(s, { type: 'rebase', unitId: planes[0]!.id, to: { x: 4, y: 4 } }).reason).toBe('Aircraft land only in your cities or on your Carriers');
    expect(applyAction(s, { type: 'rebase', unitId: planes[0]!.id, to: { x: 9, y: 3 } }).ok).toBe(false);
    expect(applyAction(s, { type: 'move', unitId: planes[0]!.id, to: other }).ok).toBe(true);
    expect({ x: planes[0]!.x, y: planes[0]!.y, movesLeft: planes[0]!.movesLeft }).toEqual({ x: 5, y: 1, movesLeft: 0 });
    expect(applyAction(s, { type: 'move', unitId: planes[0]!.id, to: home }).reason).toBe('Already flew this turn');
    for (const p of planes.slice(1)) expect(applyAction(s, { type: 'rebase', unitId: p.id, to: carrier }).ok).toBe(true);
    for (const p of planes.slice(1)) expect(p.carriedBy).toBe(carrier.id);
    // Full: a fourth can't land.
    const fourth = addUnit(s, 'fighter', 0, home.x, home.y);
    expect(applyAction(s, { type: 'rebase', unitId: fourth.id, to: carrier }).reason).toBe('The Carrier is full');
    // Out of range.
    const far = addUnit(s, 'fighter', 0, 9, 1);
    s.cities.push({ ...other, id: 999, name: 'Far', x: 9, y: 1 });
    expect(rebaseTargets(s, far).some((c) => c.x === home.x && c.y === home.y)).toBe(false);
  });

  it('can strike from a Carrier, and land on one in port or leave it for the city', () => {
    const { s, home } = field();
    const carrier = addUnit(s, 'carrier', 0, home.x, home.y);
    const fighter = addUnit(s, 'fighter', 0, home.x, home.y);
    expect(applyAction(s, { type: 'board', unitId: fighter.id, shipId: carrier.id }).ok).toBe(true);
    expect(fighter.carriedBy).toBe(carrier.id);
    fighter.movesLeft = 1;
    expect(applyAction(s, { type: 'unload', unitId: fighter.id }).ok).toBe(true);
    expect(fighter.carriedBy).toBeNull();
    fighter.movesLeft = 1;
    fighter.carriedBy = carrier.id;
    addUnit(s, 'warrior', 1, 4, 3);
    expect(attackError(s, fighter, { x: 4, y: 3 })).toBeUndefined();
  });
});

describe('interception', () => {
  function raid(stealth = false) {
    const { s } = field();
    const bomber = addUnit(s, stealth ? 'stealth_bomber' : 'bomber', 0, 2, 3);
    const target = addUnit(s, 'musketman', 1, 6, 3);
    addUnit(s, 'warrior', 0, 5, 2); // a spotter
    return { s, bomber, target };
  }

  it('the defender’s best fighter in range intercepts; one out of range, or a bomber, doesn’t', () => {
    const { s, bomber, target } = raid();
    expect(interception(s, bomber, target)).toBeUndefined();
    addUnit(s, 'bomber', 1, 9, 3); // bombers don't intercept
    expect(interception(s, bomber, target)).toBeUndefined();
    const far = addUnit(s, 'fighter', 1, 11, 5); // 5 from the target, range 4
    expect(distance(far, target)).toBeGreaterThan(UNITS.fighter.range!);
    expect(interception(s, bomber, target)).toBeUndefined();
    const f1 = addUnit(s, 'fighter', 1, 9, 3);
    const f2 = addUnit(s, 'fighter', 1, 9, 3, { veteran: true });
    const icpt = interception(s, bomber, target)!;
    expect(icpt.fighter.id).toBe(f2.id); // the veteran has the better chance
    expect(icpt.chance).toBeCloseTo((8 * 1.5) / (8 * 1.5 + UNITS.bomber.defense), 5);
    expect(f1).toBeDefined();
    // The odds rule the AI and the panel use: not stopped × winning.
    expect(overallChance(s, bomber, target)).toBeCloseTo((1 - icpt.chance) * combatOdds(s, bomber, target)!.chance, 5);
  });

  it('a Stealth Bomber is harder to intercept', () => {
    const plain = raid(false);
    addUnit(plain.s, 'fighter', 1, 9, 3);
    const stealth = raid(true);
    addUnit(stealth.s, 'fighter', 1, 9, 3);
    const a = interception(plain.s, plain.bomber, plain.target)!;
    const b = interception(stealth.s, stealth.bomber, stealth.target)!;
    expect(b.attack.mods).toContainEqual({ label: 'Stealth', pct: -UNITS.stealth_bomber.evadePct! });
    expect(b.attack.total).toBe(UNITS.fighter.airAttack! * (1 - UNITS.stealth_bomber.evadePct! / 100));
    expect(b.chance).toBeLessThan(a.chance);
  });

  it('a fighter that wins stops the strike; one that loses is lost and the strike goes ahead', () => {
    const build = () => {
      const r = raid();
      addUnit(r.s, 'fighter', 1, 9, 3);
      return r.s;
    };
    const go = (t: GameState) => applyAction(t, { type: 'attack', unitId: t.units.find((u) => u.type === 'bomber')!.id, at: { x: 6, y: 3 } });
    const stopped = withDice(build, (t) => !!go(t).combat?.interception?.fighterWon);
    const r1 = go(stopped);
    expect(r1.combat!.attackerWon).toBe(false);
    expect(stopped.units.some((u) => u.type === 'bomber')).toBe(false);
    expect(stopped.units.some((u) => u.type === 'musketman')).toBe(true);
    expect(stopped.units.some((u) => u.type === 'fighter')).toBe(true);
    const through = withDice(build, (t) => go(t).combat?.interception?.fighterWon === false);
    const r2 = go(through);
    expect(through.units.some((u) => u.type === 'fighter' && u.owner === 1)).toBe(false);
    // The strike happened: one of the bomber and the musketman is gone.
    expect(r2.combat!.defenderType).toBe('musketman');
    expect(through.log.filter((e) => e.kind === 'intercept')).toHaveLength(1);
  });

  it('Helicopters can be intercepted too; ground attacks can’t', () => {
    const { s } = field();
    const heli = addUnit(s, 'helicopter', 0, 5, 3);
    const legion = addUnit(s, 'legion', 0, 5, 4);
    const target = addUnit(s, 'musketman', 1, 6, 3);
    addUnit(s, 'fighter', 1, 9, 3);
    expect(interception(s, heli, target)).toBeDefined();
    expect(interception(s, legion, target)).toBeUndefined();
  });
});

describe('the Helicopter', () => {
  it('flies over water and mountains at 1 a tile, ends its turn anywhere, and never boards', () => {
    const s = makeState(['gmmoooog', 'gggggggg']);
    s.players[0]!.techs = ['flight', 'advanced_flight'];
    const heli = addUnit(s, 'helicopter', 0, 0, 0);
    expect(applyAction(s, { type: 'move', unitId: heli.id, to: { x: 5, y: 0 } }).ok).toBe(true);
    expect({ x: heli.x, y: heli.y, movesLeft: heli.movesLeft }).toEqual({ x: 5, y: 0, movesLeft: 0 });
    expect(heli.carriedBy).toBeNull();
    // Over water, it's still a unit on the map: it defends its tile.
    const frigate = addUnit(s, 'frigate', 1, 6, 0);
    expect(pickDefender(s, { x: 5, y: 0 }, 1)!.id).toBe(heli.id);
    expect(frigate).toBeDefined();
  });

  it('attacks but never captures a city', () => {
    const { s } = field();
    addCity(s, 1, 5, 3, { name: 'Target' });
    const heli = addUnit(s, 'helicopter', 0, 4, 3);
    expect(applyAction(s, { type: 'move', unitId: heli.id, to: { x: 5, y: 3 } }).reason).toBe('Helicopters can’t capture cities');
    expect(s.cities.find((c) => c.name === 'Target')!.owner).toBe(1);
  });
});

describe('the Airport', () => {
  it('aircraft built there start as veterans (Barracks doesn’t do it, and land units don’t get it)', () => {
    const { s, home } = field();
    const make = (item: 'fighter' | 'rifleman') => {
      home.build = { kind: 'unit', id: item };
      home.production = 999;
      s.currentPlayer = 0;
      processCities(s, 0);
      return s.units[s.units.length - 1]!;
    };
    home.buildings = ['barracks'];
    expect(make('fighter').veteran).toBe(false);
    home.buildings = ['airport'];
    expect(make('fighter').veteran).toBe(true);
    expect(make('rifleman').veteran).toBe(false);
  });

  it('airlifts one land unit a turn to another city with an Airport', () => {
    const { s, home } = field();
    home.buildings.push('airport');
    const other = addCity(s, 0, 6, 5, { name: 'Other', buildings: ['airport'] });
    addCity(s, 0, 6, 1, { name: 'NoAirport' });
    const a = addUnit(s, 'rifleman', 0, home.x, home.y);
    const b = addUnit(s, 'rifleman', 0, home.x, home.y);
    const f = addUnit(s, 'fighter', 0, home.x, home.y);
    expect(airliftTargets(s, a).map((c) => c.name)).toEqual(['Other']);
    expect(airliftTargets(s, f)).toEqual([]);
    expect(applyAction(s, { type: 'airlift', unitId: a.id, cityId: other.id }).ok).toBe(true);
    expect({ x: a.x, y: a.y, movesLeft: a.movesLeft }).toEqual({ x: 6, y: 5, movesLeft: 0 });
    expect(applyAction(s, { type: 'airlift', unitId: b.id, cityId: other.id }).reason).toBe('Home has already airlifted a unit this turn');
    // Next turn it works again.
    for (let i = 0; i < 2; i++) applyAction(s, { type: 'endTurn' });
    s.currentPlayer = 0;
    b.movesLeft = 1;
    expect(applyAction(s, { type: 'airlift', unitId: b.id, cityId: other.id }).ok).toBe(true);
  });
});

describe('the AI in the air', () => {
  it('strikes the best target that clears the odds rule, and is deterministic', () => {
    const build = () => {
      const { s } = field();
      s.currentPlayer = 1;
      addUnit(s, 'bomber', 1, 9, 3);
      addUnit(s, 'musketman', 0, 6, 3);
      addUnit(s, 'warrior', 1, 7, 3); // a spotter
      return s;
    };
    const a = build();
    const bomber = a.units.find((u) => u.type === 'bomber')!;
    expect(bestStrike(a, bomber, null)).toEqual({ x: 6, y: 3 });
    runAiAir(a, 1, null);
    const b = build();
    runAiAir(b, 1, null);
    expect(serializeGame(a, 0)).toBe(serializeGame(b, 0));
    expect(a.log.some((e) => e.kind === 'strike')).toBe(true);
  });

  it('holds back when a fighter makes the odds too long', () => {
    const { s } = field();
    s.currentPlayer = 1;
    const bomber = addUnit(s, 'bomber', 1, 9, 3);
    addUnit(s, 'musketman', 0, 6, 3);
    addUnit(s, 'warrior', 1, 7, 3);
    addUnit(s, 'jet_fighter', 0, 2, 3, { veteran: true });
    expect(overallChance(s, bomber, { x: 6, y: 3 }) * 100).toBeLessThan(RULES.ai.air.strikeMinChancePct);
    expect(bestStrike(s, bomber, null)).toBeUndefined();
  });

  it('rebases toward the war plan’s target', () => {
    const { s, enemy } = field();
    s.currentPlayer = 1;
    const fwd = addCity(s, 1, 6, 5, { name: 'Forward' });
    const back = addCity(s, 1, 10, 5, { name: 'Back' });
    const bomber = addUnit(s, 'bomber', 1, back.x, back.y);
    const plan = { target: 0, cityId: s.cities.find((c) => c.owner === 0)!.id, stagingCityId: null, phase: 'gather' as const, since: 1 };
    runAiAir(s, 1, plan);
    expect({ x: bomber.x, y: bomber.y }).toEqual({ x: fwd.x, y: fwd.y });
    expect(enemy).toBeDefined();
  });

  it('builds a fighter for a coastal city once it has Flight, and bombers at war', () => {
    const { s } = field();
    const enemy = addCity(s, 1, 10, 1, { name: 'Port' });
    addUnit(s, 'rifleman', 1, 10, 1);
    const air = airBuild(s, enemy, false);
    expect(air.fighter).toBe('fighter');
    expect(air.bomber).toBeUndefined();
    s.aiPlans[1] = { target: 0, cityId: s.cities[0]!.id, stagingCityId: enemy.id, phase: 'gather', since: 1 };
    expect(airBuild(s, enemy, true).bomber).toBe('bomber');
    // With one fighter home, the city doesn't want another.
    addUnit(s, 'fighter', 1, enemy.x, enemy.y);
    expect(airBuild(s, enemy, false).fighter).toBeUndefined();
    expect(chooseBuild(s, enemy)).not.toEqual({ kind: 'unit', id: 'fighter' });
  });

  it('a whole AI turn with aircraft is the same twice over', () => {
    const build = () => {
      const s = createGame({ seed: 13, playerCount: 3 });
      for (const p of s.players) if (p.kind === 'human') p.kind = 'ai';
      for (const p of s.players) if (p.kind === 'ai') p.techs = [...TECH_LIST.map((t) => t.id)];
      const c = s.cities[0];
      if (!c) {
        const settler = s.units.find((u) => u.owner === 0 && UNITS[u.type].canFoundCity)!;
        applyAction(s, { type: 'foundCity', unitId: settler.id });
      }
      const city = s.cities.find((x) => x.owner === 0)!;
      addUnit(s, 'bomber', 0, city.x, city.y);
      addUnit(s, 'fighter', 0, city.x, city.y);
      return s;
    };
    const a = build();
    const b = build();
    runAiTurn(a, 0);
    runAiTurn(b, 0);
    expect(serializeGame(a, 0)).toBe(serializeGame(b, 0));
  });
});

describe('save migration v8 → v9', () => {
  it('loads a v8 game unchanged: no aircraft, Advanced Flight unknown, and it plays on', () => {
    const s = createGame({ seed: 21 });
    const raw = JSON.parse(serializeGame(s, 0));
    raw.saveVersion = 8;
    raw.state.version = 8;
    const res = deserializeGame(JSON.stringify(raw));
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.migratedFrom).toBe(8);
    expect(res.state.version).toBe(STATE_VERSION);
    expect(STATE_VERSION).toBeGreaterThanOrEqual(9);
    expect(res.state.units.some((u) => UNITS[u.type].domain === 'air')).toBe(false);
    expect(res.state.players.every((p) => !p.techs.includes('advanced_flight'))).toBe(true);
    for (let i = 0; i < 3; i++) expect(applyAction(res.state, { type: 'endTurn' }).ok).toBe(true);
    expect(deserializeGame(serializeGame(res.state, 0)).kind).toBe('ok');
  });
});
