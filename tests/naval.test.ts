// Round 8: ships, sea techs, transports, naval combat, Harbors, landmasses, and the AI at sea.

import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { RULES } from '../src/data/rules';
import { TECHS, TECH_LIST } from '../src/data/techs';
import { UNITS, UNIT_IDS } from '../src/data/units';
import { landmassStats } from '../src/dev/landmass';
import { applyAction } from '../src/game/actions';
import { buildContext, runAiTurn } from '../src/game/ai';
import { findOverseasSite } from '../src/game/aiNaval';
import { attackError, combatOdds, formArmyError, fortifyError } from '../src/game/combat';
import { capturableCity } from '../src/game/conquest';
import { unitVisibleTo } from '../src/game/fog';
import { landmassAt } from '../src/game/mapgen';
import { findPath, reachableThisTurn } from '../src/game/movement';
import { cargoCapacity, cargoOf, isCoastal } from '../src/game/naval';
import { buildOptions } from '../src/game/production';
import { deserializeGame, serializeGame } from '../src/game/save';
import { chooseAiResearch } from '../src/game/tech';
import { endTurn } from '../src/game/turn';
import { STATE_VERSION, type GameState } from '../src/game/types';
import { foodSurplus, workedTileYields } from '../src/game/yields';
import { resolveTap } from '../src/ui/tap';
import { addCity, addUnit, makeState } from './helpers';

// Two islands with a coast channel between (columns 3–4 are coast), ocean all around.
//        0123456789
const CHANNEL = [
  'oooooooooo',
  'occcccccco',
  'ocgcccgpco',
  'ocgcccggco',
  'ocgcccggco',
  'occcccccco',
  'oooooooooo',
];
// Same, but with deep ocean in the middle (columns 4–5): a Galley can't cross.
const OPEN_SEA = [
  'oooooooooooo',
  'occcooooccco',
  'ocgcooooocgc',
  'ocgcooooocgc',
  'occcooooccco',
  'oooooooooooo',
];

const move = (s: GameState, unitId: number, x: number, y: number) => applyAction(s, { type: 'move', unitId, to: { x, y } });

describe('sea techs and ship data', () => {
  it('adds Map Making, Seafaring, Navigation, and Magnetism with sensible places in the tree', () => {
    expect(TECHS.map_making).toMatchObject({ era: 'ancient', prereqs: ['alphabet'] });
    expect(TECHS.seafaring).toMatchObject({ era: 'medieval', prereqs: ['pottery', 'map_making'] });
    expect(TECHS.navigation).toMatchObject({ era: 'medieval', prereqs: ['seafaring', 'astronomy'] });
    expect(TECHS.magnetism).toMatchObject({ era: 'medieval', prereqs: ['navigation', 'iron_working'] });
    expect(TECH_LIST).toHaveLength(54);
    // Tiers are still the depth in the tree.
    for (const t of ['map_making', 'seafaring', 'navigation', 'magnetism'] as const) {
      const depth = 1 + Math.max(0, ...TECHS[t].prereqs.map((p) => TECHS[p].tier));
      expect(TECHS[t].tier, t).toBe(depth);
    }
  });

  it('has 9 ships, each needing a tech that exists, with cargo and sight in data', () => {
    const ships = UNIT_IDS.filter((id) => UNITS[id].domain === 'sea');
    expect(ships).toEqual(['galley', 'caravel', 'frigate', 'ironclad', 'transport', 'destroyer', 'battleship', 'submarine', 'carrier']);
    for (const id of ships) {
      expect(TECHS[UNITS[id].requires!], id).toBeDefined();
      expect(UNITS[id].sight).toBeGreaterThanOrEqual(1);
    }
    expect(UNITS.galley).toMatchObject({ cargo: 2, coastOnly: true, requires: 'map_making' });
    expect(UNITS.caravel).toMatchObject({ cargo: 3, requires: 'navigation' });
    expect(UNITS.transport).toMatchObject({ attack: 0, cargo: 8 });
    expect(UNITS.submarine.stealth).toBe(true);
    expect(UNITS.submarine.attack).toBeGreaterThan(UNITS.submarine.defense * 3);
    // Land units carry nothing and sail nowhere.
    for (const id of UNIT_IDS.filter((x) => UNITS[x].domain === 'land')) expect(UNITS[id].cargo).toBe(0);
  });
});

describe('where ships go', () => {
  it('ships move only on water; land units never walk onto water', () => {
    const s = makeState(CHANNEL);
    const ship = addUnit(s, 'caravel', 0, 3, 3);
    const w = addUnit(s, 'warrior', 0, 2, 3);
    expect(move(s, ship.id, 2, 2).ok).toBe(false);
    expect(move(s, ship.id, 4, 3).ok).toBe(true);
    expect(move(s, w.id, 3, 2).reason).toBe('Land units need a ship to cross water');
  });

  it('a Galley stays on coast tiles; a Caravel crosses open ocean', () => {
    const s = makeState(OPEN_SEA);
    const galley = addUnit(s, 'galley', 0, 3, 2);
    const caravel = addUnit(s, 'caravel', 0, 3, 3);
    expect(move(s, galley.id, 4, 2).reason).toBe('A Galley can’t leave the coast');
    expect(findPath(s, galley, { x: 8, y: 2 })).toBeUndefined();
    expect(reachableThisTurn(s, galley).every((c) => s.map.tiles[c.y * s.map.width + c.x]!.terrain === 'coast')).toBe(true);
    expect(move(s, caravel.id, 6, 3).ok).toBe(true);
  });

  it('a ship docks in its own coastal city, never in a rival city or inland', () => {
    const s = makeState(CHANNEL);
    addCity(s, 0, 2, 3);
    addCity(s, 1, 6, 3);
    const ship = addUnit(s, 'caravel', 0, 3, 3);
    expect(move(s, ship.id, 2, 3).ok).toBe(true);
    expect(ship).toMatchObject({ x: 2, y: 3 });
    const ship2 = addUnit(s, 'caravel', 0, 5, 3);
    expect(move(s, ship2.id, 6, 3).ok).toBe(false);
  });

  it('only coastal cities build ships and Harbors; the build list hides them elsewhere', () => {
    const s = makeState(['ggggggg', 'ggggggg', 'ggggggg', 'gggggcc', 'gggggcc']);
    s.players[0]!.techs = ['alphabet', 'map_making', 'pottery', 'seafaring'];
    const inland = addCity(s, 0, 1, 1);
    const port = addCity(s, 0, 4, 3);
    expect(isCoastal(s, inland)).toBe(false);
    expect(isCoastal(s, port)).toBe(true);
    const ids = (c: typeof port) => buildOptions(s, c).map((i) => i.id);
    expect(ids(inland)).not.toContain('galley');
    expect(ids(inland)).not.toContain('harbor');
    expect(ids(port)).toEqual(expect.arrayContaining(['galley', 'harbor']));
    expect(applyAction(s, { type: 'setBuild', cityId: inland.id, item: { kind: 'unit', id: 'galley' } }).reason).toBe('Needs a coastal city');
  });
});

describe('carrying land units', () => {
  function ferry() {
    const s = makeState(CHANNEL);
    const galley = addUnit(s, 'galley', 0, 3, 3);
    const settler = addUnit(s, 'settler', 0, 2, 3);
    const warrior = addUnit(s, 'warrior', 0, 2, 2);
    return { s, galley, settler, warrior };
  }

  it('boarding: tap the adjacent ship; the unit uses up its move', () => {
    const { s, galley, settler } = ferry();
    expect(move(s, settler.id, 3, 3).ok).toBe(true);
    expect(settler).toMatchObject({ carriedBy: galley.id, movesLeft: 0, x: 3, y: 3 });
    expect(cargoOf(s, galley)).toEqual([settler]);
  });

  it('a land unit can walk to a ship a few tiles off and board it at the end', () => {
    const s = makeState(['ggggc', 'ooooc']);
    const galley = addUnit(s, 'galley', 0, 4, 0);
    const w = addUnit(s, 'horseman', 0, 2, 0);
    const path = findPath(s, w, { x: 4, y: 0 });
    expect(path).toEqual([{ x: 3, y: 0 }, { x: 4, y: 0 }]);
    expect(move(s, w.id, 4, 0).ok).toBe(true);
    expect(w.carriedBy).toBe(galley.id);
  });

  it('cargo moves with the ship; capacity is enforced', () => {
    const { s, galley, settler, warrior } = ferry();
    move(s, settler.id, 3, 3);
    move(s, warrior.id, 3, 3);
    const third = addUnit(s, 'warrior', 0, 2, 4);
    expect(move(s, third.id, 3, 3).reason).toBe('The Galley is full (2/2)');
    expect(move(s, galley.id, 4, 3).ok).toBe(true);
    expect(settler).toMatchObject({ x: 4, y: 3 });
    expect(warrior).toMatchObject({ x: 4, y: 3 });
    expect(third.carriedBy).toBeNull();
  });

  it('unloading: tap an adjacent land tile; it costs the move, and not onto enemy units', () => {
    const { s, galley, settler, warrior } = ferry();
    move(s, settler.id, 3, 3);
    move(s, warrior.id, 3, 3);
    move(s, galley.id, 5, 3);
    applyAction(s, { type: 'endTurn' });
    addUnit(s, 'warrior', 1, 6, 2);
    expect(move(s, warrior.id, 6, 2).ok).toBe(false);
    expect(move(s, settler.id, 6, 3).ok).toBe(true);
    expect(settler).toMatchObject({ x: 6, y: 3, carriedBy: null, movesLeft: 0 });
  });

  it('a unit aboard can’t attack; land units can’t attack ships at sea', () => {
    const { s, galley, warrior } = ferry();
    move(s, warrior.id, 3, 3);
    applyAction(s, { type: 'endTurn' });
    addUnit(s, 'warrior', 1, 2, 4);
    expect(attackError(s, warrior, { x: 2, y: 4 })).toBe('Units can’t attack from a ship. Unload onto land first');
    const archer = addUnit(s, 'archer', 0, 2, 2);
    const enemyShip = addUnit(s, 'galley', 1, 3, 1);
    expect(attackError(s, archer, enemyShip)).toBe('Land units can’t attack ships at sea');
    expect(galley.carriedBy).toBeNull();
  });

  it('boarding and going ashore in a city are actions too', () => {
    const s = makeState(CHANNEL);
    addCity(s, 0, 2, 3);
    const ship = addUnit(s, 'caravel', 0, 2, 3);
    const w = addUnit(s, 'warrior', 0, 2, 3);
    expect(applyAction(s, { type: 'board', unitId: w.id, shipId: ship.id }).ok).toBe(true);
    expect(w.carriedBy).toBe(ship.id);
    applyAction(s, { type: 'endTurn' });
    expect(applyAction(s, { type: 'unload', unitId: w.id }).ok).toBe(true);
    expect(w).toMatchObject({ carriedBy: null, movesLeft: 0 });
  });

  it('tapping a ship’s tile selects the ship before its cargo', () => {
    const { s, galley, settler } = ferry();
    move(s, settler.id, 3, 3);
    expect(resolveTap(s, 0, undefined, 3, 3)).toEqual({ kind: 'select', unitId: galley.id });
  });
});

describe('naval combat', () => {
  it('ships fight ships with the usual odds; a sunk ship takes its cargo with it', () => {
    const s = makeState(OPEN_SEA);
    const galley = addUnit(s, 'galley', 1, 3, 2);
    addUnit(s, 'settler', 1, 3, 2, { carriedBy: galley.id });
    addUnit(s, 'warrior', 1, 3, 2, { carriedBy: galley.id });
    const frigate = addUnit(s, 'frigate', 0, 4, 2);
    const odds = combatOdds(s, frigate, galley)!;
    expect(odds.defender.id).toBe(galley.id);
    expect(odds.chance).toBeCloseTo(4 / 5);
    s.rngState = (12345 + 2 * 0x6d2b79f5) >>> 0; // first roll ≈ 0.48: a win
    const res = applyAction(s, { type: 'attack', unitId: frigate.id, at: galley });
    expect(res.combat).toMatchObject({ attackerWon: true, cargoLost: 2 });
    expect(s.units.filter((u) => u.owner === 1)).toHaveLength(0);
    expect(frigate).toMatchObject({ x: 4, y: 2 });
  });

  it('bombard: the defender dies, the ship never moves in; Walls don’t count against ships', () => {
    const s = makeState(CHANNEL);
    const city = addCity(s, 1, 6, 3, { buildings: ['walls'] });
    addCity(s, 1, 7, 2);
    addUnit(s, 'warrior', 1, 6, 3);
    const frigate = addUnit(s, 'frigate', 0, 5, 3);
    const odds = combatOdds(s, frigate, city)!;
    expect(odds.defense.mods.map((m) => m.label)).toEqual(['In a city']);
    s.rngState = (12345 + 2 * 0x6d2b79f5) >>> 0;
    const res = applyAction(s, { type: 'attack', unitId: frigate.id, at: city });
    expect(res.combat).toMatchObject({ attackerWon: true, bombard: true });
    expect(frigate).toMatchObject({ x: 5, y: 3 });
    expect(city.owner).toBe(1);
  });

  it('a lost bombard sinks the ship', () => {
    const s = makeState(CHANNEL);
    addUnit(s, 'rifleman', 1, 6, 3, { fortified: true });
    const galley = addUnit(s, 'galley', 0, 5, 3);
    const res = applyAction(s, { type: 'attack', unitId: galley.id, at: { x: 6, y: 3 } });
    expect(res.combat!.attackerWon).toBe(false);
    expect(s.units.some((u) => u.id === galley.id)).toBe(false);
  });

  it('ships in a city don’t defend it: land units can walk in, and the ships and cargo are lost', () => {
    const s = makeState(CHANNEL);
    const city = addCity(s, 1, 6, 3);
    addCity(s, 1, 7, 2);
    const ship = addUnit(s, 'frigate', 1, 6, 3);
    addUnit(s, 'warrior', 1, 6, 3, { carriedBy: ship.id });
    const legion = addUnit(s, 'legion', 0, 6, 4);
    expect(capturableCity(s, legion, city)).toBe(city);
    expect(move(s, legion.id, 6, 3).ok).toBe(true);
    expect(city.owner).toBe(0);
    expect(s.units.filter((u) => u.owner === 1)).toHaveLength(0);
    expect(s.log.some((e) => e.text.includes('lost a ship and 1 unit aboard'))).toBe(true);
  });

  it('amphibious capture: unloading into an empty enemy city takes it', () => {
    const s = makeState(CHANNEL);
    const city = addCity(s, 1, 6, 3);
    addCity(s, 1, 7, 2);
    const galley = addUnit(s, 'galley', 0, 5, 3);
    const legion = addUnit(s, 'legion', 0, 5, 3, { carriedBy: galley.id });
    expect(move(s, legion.id, 6, 3).ok).toBe(true);
    expect(city.owner).toBe(0);
    expect(legion.carriedBy).toBeNull();
  });

  it('three ships of a type form a fleet: ×3 strength, ×3 cargo, and it keeps their cargo', () => {
    const s = makeState(OPEN_SEA);
    const ships = [0, 1, 2].map(() => addUnit(s, 'galley', 0, 2, 1));
    addUnit(s, 'warrior', 0, 2, 1, { carriedBy: ships[1]!.id });
    addUnit(s, 'settler', 0, 2, 1, { carriedBy: ships[2]!.id });
    expect(formArmyError(s, ships[0]!)).toBeUndefined();
    expect(applyAction(s, { type: 'formArmy', unitId: ships[0]!.id }).ok).toBe(true);
    const fleet = ships[0]!;
    expect(fleet.army).toBe(true);
    expect(s.units.filter((u) => u.type === 'galley')).toHaveLength(1);
    expect(cargoOf(s, fleet)).toHaveLength(2);
    expect(cargoCapacity(fleet)).toBe(6);
    const enemy = addUnit(s, 'frigate', 1, 3, 1);
    expect(combatOdds(s, enemy, fleet)!.defense.base).toBe(3);
    expect(s.log.some((e) => e.text.includes('formed a fleet'))).toBe(true);
  });

  it('ships only "stay" (no fortify bonus)', () => {
    const s = makeState(OPEN_SEA);
    const ships = [0, 1, 2].map(() => addUnit(s, 'frigate', 0, 5, 2));
    expect(fortifyError(s, ships[0]!)).toBeUndefined();
    applyAction(s, { type: 'fortify', unitId: ships[0]!.id });
    const enemy = addUnit(s, 'frigate', 1, 6, 2);
    expect(combatOdds(s, enemy, ships[0]!)!.defense.mods).toEqual([]);
  });

  it('a submarine is seen only by units right next to it', () => {
    const s = makeState(OPEN_SEA);
    const sub = addUnit(s, 'submarine', 1, 6, 2);
    addUnit(s, 'destroyer', 0, 8, 2); // sight 2: the tile is in view, the sub isn't
    expect(unitVisibleTo(s, 0, sub)).toBe(false);
    addUnit(s, 'galley', 0, 7, 1);
    expect(unitVisibleTo(s, 0, sub)).toBe(true);
    const plain = addUnit(s, 'frigate', 1, 6, 3);
    expect(unitVisibleTo(s, 0, plain)).toBe(true);
  });
});

describe('Harbor', () => {
  it('adds +1 food to each worked water tile, in coastal cities', () => {
    const s = makeState(['ccc', 'cgc', 'ccc']);
    const city = addCity(s, 0, 1, 1, { size: 3 });
    const before = foodSurplus(s, city);
    const k = city.worked[0]!;
    expect(workedTileYields(s, city, k).food).toBe(1);
    city.buildings.push('harbor');
    expect(workedTileYields(s, city, k).food).toBe(1 + BUILDINGS.harbor.effects.waterFood!);
    expect(foodSurplus(s, city)).toBe(before + 3);
  });
});

describe('the map has several landmasses', () => {
  it('most games split the civs across 2+ landmasses, often with empty islands, and every start has room', () => {
    const st = landmassStats(40);
    expect(st.allTogether).toBeLessThanOrEqual(8); // was 76% before Round 8
    expect(st.emptyIsland).toBeGreaterThanOrEqual(12);
    expect(RULES.map.minStartLandmass).toBeGreaterThanOrEqual(20);
  });
});

describe('the AI at sea', () => {
  // Maurya (1) on a 3×3 island with a Galley and a Settler; open land across a coast channel.
  function boxedIn(): GameState {
    const s = makeState(
      [
        'oooooooooooo',
        'occcccccccco',
        'ocgggccggggc',
        'ocgggccggggc',
        'ocgggccggggc',
        'occccccgpggc',
        'oooooocccccc',
      ],
      { players: 2, peace: true },
    );
    addCity(s, 1, 4, 3, { capitalOf: 1, build: { kind: 'building', id: 'granary' } });
    addUnit(s, 'warrior', 1, 4, 3, { fortified: true });
    addUnit(s, 'galley', 1, 4, 3);
    addUnit(s, 'settler', 1, 4, 3);
    addUnit(s, 'warrior', 1, 3, 3);
    s.players[1]!.techs = ['alphabet', 'map_making', 'pottery'];
    s.currentPlayer = 1;
    return s;
  }

  it('boxed in, it researches Map Making first', () => {
    const s = boxedIn();
    s.players[1]!.techs = ['alphabet'];
    expect(buildContext(s, 1).boxedIn).toBe(true);
    expect(chooseAiResearch(s.players[1]!, ['map_making'])).toBe('map_making');
  });

  it('ferries a Settler and an escort to another landmass and founds a city (deterministically)', () => {
    const run = () => {
      const s = boxedIn();
      expect(findOverseasSite(s, 1, 'galley')).toBeDefined();
      const home = landmassAt(s.map, { x: 4, y: 3 });
      for (let i = 0; i < 8; i++) {
        runAiTurn(s, 1);
        endTurn(s); // to you (you do nothing)
        endTurn(s); // and back to Maurya
      }
      return { s, home };
    };
    const { s, home } = run();
    const overseas = s.cities.filter((c) => c.owner === 1 && landmassAt(s.map, c) !== home);
    expect(overseas).toHaveLength(1);
    expect(serializeGame(run().s, 0)).toBe(serializeGame(s, 0));
  });

  it('builds ships only in coastal cities', () => {
    const s = boxedIn();
    s.units = s.units.filter((u) => u.type !== 'galley');
    s.currentPlayer = 1;
    runAiTurn(s, 1);
    const city = s.cities.find((c) => c.owner === 1)!;
    expect(city.build).toEqual({ kind: 'unit', id: 'galley' });
  });
});

describe('save migration v6 → v7', () => {
  function v6Save(): string {
    const s = makeState(['ggg', 'ccc']);
    addCity(s, 0, 1, 0);
    addUnit(s, 'warrior', 0, 0, 0);
    const raw = JSON.parse(serializeGame(s, 0));
    raw.saveVersion = 6;
    raw.state.version = 6;
    for (const u of raw.state.units) delete u.carriedBy;
    delete raw.state.aiFerries;
    return JSON.stringify(raw);
  }

  it('no unit is aboard a ship, no AI has a sea plan, and the sea techs are unknown', () => {
    const res = deserializeGame(v6Save());
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.migratedFrom).toBe(6);
    expect(res.state.version).toBe(STATE_VERSION);
    expect(res.state.units.every((u) => u.carriedBy === null)).toBe(true);
    expect(res.state.aiFerries).toEqual([null, null]);
    expect(res.state.players[0]!.techs).not.toContain('map_making');
    expect(applyAction(res.state, { type: 'endTurn' }).ok).toBe(true);
  });

  it('a v2 save still comes all the way forward', () => {
    const raw = JSON.parse(v6Save());
    raw.saveVersion = 2;
    raw.state.version = 2;
    delete raw.state.atWar;
    delete raw.state.diplomacy;
    delete raw.state.aiPlans;
    for (const p of raw.state.players) delete p.techs;
    expect(deserializeGame(JSON.stringify(raw)).kind).toBe('ok');
  });
});
