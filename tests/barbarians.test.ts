// Round 9 (Milestone 7): the barbarian faction, villages (flags, spawning, taking one:
// destroy or settle), ancient artifacts, map resources, exploration huts, Great People, the
// AI's use of all of them, and the v7 → v8 save migration.

import { describe, expect, it } from 'vitest';
import { ARTIFACTS, BARBARIANS, HUTS, VILLAGE_REWARDS } from '../src/data/barbarians';
import { GREAT_PEOPLE_RULES as GPR } from '../src/data/greatPeople';
import { RESOURCES, RESOURCE_RULES } from '../src/data/resources';
import { RULES } from '../src/data/rules';
import { TECHS } from '../src/data/techs';
import { applyAction } from '../src/game/actions';
import { runAiTurn } from '../src/game/ai';
import { advanceVillage, barbarianId, civPlayers, raidError, worldEra } from '../src/game/barbarians';
import { attackStrength, combatOdds, defenseStrength } from '../src/game/combat';
import { checkEliminations } from '../src/game/conquest';
import { declareWarError, metCivs, updateContacts, warScore } from '../src/game/diplomacy';
import { distance, tileIndex, tilesInRadius } from '../src/game/grid';
import {
  addGreatPerson,
  checkGreatPeople,
  greatPersonThreshold,
  useGreatPerson,
} from '../src/game/greatPeople';
import { moveUnit } from '../src/game/movement';
import { createGame } from '../src/game/newGame';
import { processCities } from '../src/game/production';
import { visibleResource } from '../src/game/resources';
import { deserializeGame, serializeGame } from '../src/game/save';
import { endTurn, playComputerTurn } from '../src/game/turn';
import { STATE_VERSION, type GameState, type Village } from '../src/game/types';
import { capitalsHeld, victoryFor } from '../src/game/victory';
import { chooseVillage, enterHut, pendingVillage } from '../src/game/villages';
import { atWar } from '../src/game/war';
import { cityCulture, cityScienceGold, cityYields, tileYields } from '../src/game/yields';
import { addCity, addUnit, addVillage, makeState } from './helpers';

const row = (n: number, t = 'g') => t.repeat(n);
const FAIR = (12345 + 2 * 0x6d2b79f5) >>> 0;

/** A 12×7 grassland field with a civ (player 0), a rival (1), and the barbarians (2). */
function field(): GameState {
  const s = makeState(Array.from({ length: 7 }, () => row(12)), { peace: true, barbarians: true });
  addCity(s, 0, 1, 3, { name: 'Home', capitalOf: 0, build: { kind: 'unit', id: 'warrior' } });
  addUnit(s, 'warrior', 0, 1, 3, { fortified: true });
  addCity(s, 1, 10, 3, { name: 'Far', capitalOf: 1, build: { kind: 'unit', id: 'warrior' } });
  addUnit(s, 'warrior', 1, 10, 3, { fortified: true });
  s.players[0]!.citiesFounded = 1;
  s.players[1]!.citiesFounded = 1;
  s.rngState = FAIR;
  return s;
}

/** Your Warrior next to an empty village at (5, 3). */
function atVillage(extra: Partial<Village> = {}): { s: GameState; v: Village; unitId: number } {
  const s = field();
  const v = addVillage(s, 5, 3, extra, null);
  const u = addUnit(s, 'warrior', 0, 4, 3);
  return { s, v, unitId: u.id };
}

function takeAndChoose(s: GameState, unitId: number, choice: 'destroy' | 'settle') {
  expect(moveUnit(s, unitId, { x: 5, y: 3 }).ok).toBe(true);
  const v = pendingVillage(s, 0)!;
  expect(v).toBeDefined();
  return chooseVillage(s, v.id, choice);
}

describe('the barbarian faction', () => {
  it('is the last player in a new game, always at war, never met, not a civ', () => {
    const s = createGame({ seed: 4 });
    const b = barbarianId(s);
    expect(b).toBe(s.players.length - 1);
    expect(civPlayers(s)).toHaveLength(RULES.defaultPlayers);
    for (const p of civPlayers(s)) expect(atWar(s, p.id, b)).toBe(true);
    // Civs start at peace with each other.
    expect(atWar(s, 0, 1)).toBe(false);
    // Seeing them never counts as meeting them; they're not in diplomacy.
    const v = s.villages[0]!;
    addUnit(s, 'warrior', 0, v.x, v.y - 1 >= 0 ? v.y - 1 : v.y + 1);
    updateContacts(s);
    expect(metCivs(s, 0)).not.toContain(b);
    expect(declareWarError(s, 0, b)).toBeDefined();
  });

  it("can't win, doesn't count for domination, and is never eliminated", () => {
    const s = field();
    const b = barbarianId(s);
    expect(capitalsHeld(s, 0).of).toBe(1); // only the rival
    expect(victoryFor(s, b)).toBeUndefined();
    s.units = s.units.filter((u) => u.owner !== b);
    checkEliminations(s, 0, { x: 0, y: 0 });
    expect(s.players[b]!.alive).toBe(true);
  });

  it("isn't a war for the AI: barbarians don't block a war or put an AI on a war footing", () => {
    const s = field();
    s.turn = 40;
    s.players[1]!.techs = ['bronze_working', 'iron_working'];
    for (let i = 0; i < 3; i++) addUnit(s, 'legion', 1, 9, 3);
    // Being "at war" with the barbarians doesn't count as already being in a war.
    expect(warScore(s, 1, 0)).toBeGreaterThan(0);
    s.atWar[1]![barbarianId(s)] = false;
    s.atWar[barbarianId(s)]![1] = false;
    const without = warScore(s, 1, 0);
    s.atWar[1]![barbarianId(s)] = true;
    s.atWar[barbarianId(s)]![1] = true;
    expect(warScore(s, 1, 0)).toBe(without);
  });
});

describe('villages: flags and spawning', () => {
  const base = () => {
    const s = field();
    s.turn = BARBARIANS.graceTurns;
    const v = addVillage(s, 5, 3);
    return { s, v };
  };

  it(`gains a flag every ${BARBARIANS.turnsPerFlag} turns and sends a unit out at ${BARBARIANS.flagsToSpawn}`, () => {
    const { s, v } = base();
    const spawned: number[] = [];
    for (let t = 1; t <= BARBARIANS.turnsPerFlag * BARBARIANS.flagsToSpawn; t++) {
      if (advanceVillage(s, v)) spawned.push(t);
    }
    expect(spawned).toEqual([BARBARIANS.turnsPerFlag * BARBARIANS.flagsToSpawn]);
    expect(v.flags).toBe(0);
    const out = s.units.filter((u) => u.home === v.id && !(u.x === v.x && u.y === v.y));
    expect(out).toHaveLength(1);
    expect(distance(out[0]!, v)).toBe(1);
    expect(out[0]!.movesLeft).toBe(0);
  });

  it('gains no flags in the first turns, nor once the world reaches the late era', () => {
    const { s, v } = base();
    s.turn = BARBARIANS.graceTurns - 1;
    for (let i = 0; i < 20; i++) advanceVillage(s, v);
    expect(v.flags).toBe(0);
    s.turn = BARBARIANS.graceTurns;
    // Most civs in the Industrial era: the world's era, and no more flags.
    for (const p of civPlayers(s)) p.techs = ['gunpowder'];
    expect(worldEra(s)).toBe('industrial');
    for (let i = 0; i < 20; i++) advanceVillage(s, v);
    expect(v.flags).toBe(0);
  });

  it('keeps at most a few units out; its flags wait at the cap', () => {
    const { s, v } = base();
    for (let i = 0; i < 200; i++) advanceVillage(s, v);
    expect(s.units.filter((u) => u.home === v.id)).toHaveLength(BARBARIANS.maxUnitsOut + 1);
    expect(v.flags).toBe(BARBARIANS.flagsToSpawn);
  });

  it('spawned units stay near home, and a village is a strong defensive spot', () => {
    const s = field();
    s.turn = 30;
    const v = addVillage(s, 5, 3, { flags: BARBARIANS.flagsToSpawn });
    const b = barbarianId(s);
    for (let t = 0; t < 30; t++) {
      s.currentPlayer = b;
      for (const u of s.units) if (u.owner === b) u.movesLeft = 1;
      playComputerTurn(s, b);
      for (const u of s.units.filter((x) => x.home === v.id)) expect(distance(u, v)).toBeLessThanOrEqual(BARBARIANS.homeRadius);
    }
    const garrison = s.units.find((u) => u.x === v.x && u.y === v.y && u.owner === b)!;
    expect(defenseStrength(s, garrison).mods.map((m) => m.label)).toEqual(['Barbarian village', 'Fortified']);
  });
});

describe('raids: barbarians never capture', () => {
  function raidSetup() {
    const s = field();
    const b = barbarianId(s);
    const city = s.cities.find((c) => c.owner === 0)!;
    city.size = 3;
    s.units = s.units.filter((u) => !(u.owner === 0 && u.x === city.x && u.y === city.y));
    s.players[0]!.gold = 100;
    const raider = addUnit(s, 'archer', b, 2, 3);
    s.currentPlayer = b;
    return { s, b, city, raider };
  }

  it("can't walk into a city; on its turn it raids it: gold and 1 population, the city stays", () => {
    const { s, b, city, raider } = raidSetup();
    expect(moveUnit(s, raider.id, city).ok).toBe(false);
    playComputerTurn(s, b);
    expect(city.owner).toBe(0);
    expect(city.size).toBe(2);
    expect(s.players[0]!.gold).toBe(75);
    expect(raidError(s, city)).toBe('Raided recently');
    expect(s.log.at(-1)!.kind).toBe('raid');
  });

  it("winning against a city's last defender raids it instead of taking it; never below size 1", () => {
    const { s, city, raider } = raidSetup();
    city.size = 1;
    addUnit(s, 'warrior', 0, city.x, city.y);
    // Dice where the Archer wins.
    for (let i = 0; i < 50; i++) {
      const t = JSON.parse(JSON.stringify(s)) as GameState;
      t.rngState = (FAIR + i * 0x9e3779b9) >>> 0;
      const res = applyAction(t, { type: 'attack', unitId: raider.id, at: city });
      if (!res.combat?.attackerWon) continue;
      expect(res.combat.raided).toBe(true);
      const c = t.cities.find((x) => x.id === city.id)!;
      expect(c.owner).toBe(0);
      expect(c.size).toBe(1);
      expect(t.units.find((u) => u.id === raider.id)).toMatchObject({ x: 2, y: 3 });
      return;
    }
    throw new Error('no winning dice');
  });
});

describe('taking a village', () => {
  it('walking into an empty one asks its owner to choose; a held one is taken by winning the fight', () => {
    const { s, unitId } = atVillage();
    expect(moveUnit(s, unitId, { x: 5, y: 3 }).ok).toBe(true);
    expect(pendingVillage(s, 0)).toBeDefined();
    // Only the taker may choose.
    s.currentPlayer = 1;
    expect(chooseVillage(s, pendingVillage(s, 0)!.id, 'destroy').ok).toBe(false);
  });

  it('settling makes a size-1 city there with the next city name, even close to another city', () => {
    const s = field();
    const v = addVillage(s, 3, 3, {}, null); // 2 tiles from Home
    const u = addUnit(s, 'warrior', 0, 2, 2);
    expect(moveUnit(s, u.id, v).ok).toBe(true);
    const res = chooseVillage(s, v.id, 'settle');
    expect(res.ok).toBe(true);
    const city = s.cities.find((c) => c.id === res.village!.cityId)!;
    expect(city).toMatchObject({ owner: 0, size: 1, x: 3, y: 3, name: 'Ur' });
    expect(distance(city, s.cities[0]!)).toBeLessThan(RULES.minCityDistance);
    expect(s.villages).toHaveLength(0);
  });

  it('destroying pays a reward by the data weights: mostly gold (fixed seeds)', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const { s, unitId } = atVillage();
      s.rngState = (FAIR + i * 0x9e3779b9) >>> 0;
      const res = takeAndChoose(s, unitId, 'destroy');
      counts[res.village!.rewardKind!] = (counts[res.village!.rewardKind!] ?? 0) + 1;
    }
    const gold = (counts.gold30 ?? 0) + (counts.gold40 ?? 0) + (counts.gold50 ?? 0);
    expect(gold).toBeGreaterThan(200);
    expect(counts.horseman).toBeGreaterThan(20);
    expect(counts.settler).toBeGreaterThan(15);
    expect(counts.tech).toBeGreaterThan(10);
    // Inland: never a Galley.
    expect(counts.galley).toBeUndefined();
    expect(VILLAGE_REWARDS.find((r) => r.kind === 'galley')).toBeDefined();
  });

  it('a Galley only for a coastal village and a civ that knows Map Making', () => {
    const coastal = () => {
      const s = makeState([row(8), row(8), row(8, 'c')], { peace: true, barbarians: true });
      addCity(s, 0, 0, 0, { build: { kind: 'unit', id: 'warrior' } });
      const v = addVillage(s, 4, 1, {}, null);
      const u = addUnit(s, 'warrior', 0, 3, 1);
      return { s, v, u };
    };
    const kinds = (mapMaking: boolean) => {
      const seen = new Set<string>();
      for (let i = 0; i < 300; i++) {
        const { s, v, u } = coastal();
        if (mapMaking) s.players[0]!.techs = ['alphabet', 'map_making'];
        s.rngState = (FAIR + i * 0x9e3779b9) >>> 0;
        moveUnit(s, u.id, v);
        const res = chooseVillage(s, v.id, 'destroy');
        seen.add(res.village!.rewardKind!);
        if (res.village!.rewardKind === 'galley') expect(s.units.find((x) => x.type === 'galley')!.y).toBe(2);
      }
      return seen;
    };
    expect(kinds(false).has('galley')).toBe(false);
    expect(kinds(true).has('galley')).toBe(true);
  });

  it(`an artifact turns up about ${ARTIFACTS.chancePct}% of the time either way: 1 tech usually, rarely 2–3`, () => {
    for (const choice of ['destroy', 'settle'] as const) {
      let found = 0;
      const sizes: number[] = [];
      for (let i = 0; i < 500; i++) {
        const { s, unitId } = atVillage();
        s.players[0]!.techs = ['alphabet', 'bronze_working'];
        s.rngState = (FAIR + i * 0x9e3779b9) >>> 0;
        const known = s.players[0]!.techs.length;
        const res = takeAndChoose(s, unitId, choice);
        const a = res.village!.artifact;
        if (!a) continue;
        found++;
        sizes.push(a.techs.length);
        // Each tech it gave is really known now, and was learnable (prerequisites first).
        expect(s.players[0]!.techs.length).toBeGreaterThanOrEqual(known + a.techs.length);
        for (const t of a.techs) for (const pre of TECHS[t].prereqs) expect(s.players[0]!.techs.indexOf(pre)).toBeLessThan(s.players[0]!.techs.indexOf(t));
      }
      expect(found / 500).toBeGreaterThan(ARTIFACTS.chancePct / 100 - 0.06);
      expect(found / 500).toBeLessThan(ARTIFACTS.chancePct / 100 + 0.06);
      expect(sizes.filter((n) => n === 1).length).toBeGreaterThan(sizes.length * 0.6);
      expect(Math.max(...sizes)).toBeGreaterThan(1);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(3);
    }
  });

  it('the AI takes a village next to it and chooses at once, deterministically', () => {
    const play = () => {
      const s = field();
      s.players[1]!.kind = 'ai';
      addVillage(s, 7, 3, {}, null);
      addUnit(s, 'warrior', 1, 8, 3);
      addUnit(s, 'warrior', 1, 10, 3, { fortified: true });
      s.currentPlayer = 1;
      runAiTurn(s, 1);
      return s;
    };
    const s = play();
    expect(s.villages).toHaveLength(0);
    expect(s.log.some((e) => e.kind === 'village' && e.publicText?.includes('barbarian village'))).toBe(true);
    expect(play()).toEqual(s);
  });
});

describe('resources', () => {
  it('a worked resource adds its bonus; the automatic tile picker counts it', () => {
    const s = makeState(['ggg', 'ggg', 'ggg'], { players: 1 });
    s.map.tiles[tileIndex(s.map, 2, 0)]!.terrain = 'plains';
    s.map.tiles[tileIndex(s.map, 2, 0)]!.resource = 'wheat';
    const city = addCity(s, 0, 1, 1, { focus: 'food' });
    expect(city.worked).toEqual([tileIndex(s.map, 2, 0)]);
    expect(tileYields(s, tileIndex(s.map, 2, 0), 0)).toEqual({ food: 3, production: 1, trade: 1 });
    expect(cityYields(s, city).food).toBe(2 + 1 + 3);
  });

  it('hidden ones give nothing until revealed: on the tile for everyone, or by tech for one civ', () => {
    const s = makeState(['hhh'], { players: 2 });
    const k = 1;
    s.map.tiles[k]!.resource = 'iron';
    expect(visibleResource(s, 0, k)).toBeUndefined();
    expect(tileYields(s, k, 0).production).toBe(2);
    s.players[0]!.techs = [RESOURCES.iron.revealedBy!];
    expect(visibleResource(s, 0, k)?.id).toBe('iron');
    expect(visibleResource(s, 1, k)).toBeUndefined();
    s.map.tiles[k]!.revealed = true;
    expect(visibleResource(s, 1, k)?.id).toBe('iron');
    expect(tileYields(s, k, 1).production).toBe(2 + RESOURCES.iron.bonus.production);
  });

  it('every civ starts with food or production resources nearby (40 seeds)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = createGame({ seed });
      for (const p of civPlayers(s)) {
        const start = s.units.find((u) => u.owner === p.id)!;
        const near = tilesInRadius(s.map, start, RESOURCE_RULES.startRadius).filter((c) => {
          const r = visibleResource(s, p.id, tileIndex(s.map, c.x, c.y));
          return r && r.bonus.food + r.bonus.production > 0 && (c.x !== start.x || c.y !== start.y);
        });
        expect(near.length, `seed ${seed} civ ${p.id}`).toBeGreaterThanOrEqual(RESOURCE_RULES.startMinimum);
      }
    }
  });

  it('resources, villages, and huts come from the seed', () => {
    const a = createGame({ seed: 11 });
    const b = createGame({ seed: 11 });
    expect(b.map).toEqual(a.map);
    expect(b.villages).toEqual(a.villages);
    expect(a.map.tiles.filter((t) => t.resource).length).toBeGreaterThan(15);
    expect(a.map.tiles.filter((t) => t.hut).length).toBeGreaterThanOrEqual(HUTS.minHuts);
    expect(a.villages.length).toBeGreaterThanOrEqual(BARBARIANS.minVillages);
    for (const p of civPlayers(a)) {
      const start = a.units.find((u) => u.owner === p.id)!;
      for (const v of a.villages) expect(distance(v, start)).toBeGreaterThanOrEqual(BARBARIANS.minDistanceFromStart);
    }
  });
});

describe('huts', () => {
  function hut(result?: (typeof HUTS.results)[number]['kind'], turn = 30) {
    const s = field();
    s.turn = turn;
    const u = addUnit(s, 'warrior', 0, 4, 3);
    const tile = s.map.tiles[tileIndex(s.map, 5, 3)]!;
    tile.hut = true;
    if (result) tile.hutResult = result;
    return { s, u };
  }

  it('each result does what it says', () => {
    const g = hut('gold');
    moveUnit(g.s, g.u.id, { x: 5, y: 3 });
    expect(g.s.players[0]!.gold).toBeGreaterThanOrEqual(HUTS.goldMin);
    expect(g.s.players[0]!.gold).toBeLessThanOrEqual(HUTS.goldMax);
    expect(g.s.map.tiles[tileIndex(g.s.map, 5, 3)]!.hut).toBeUndefined();

    const m = hut('map');
    m.s.players[0]!.explored.fill(0);
    moveUnit(m.s, m.u.id, { x: 5, y: 3 });
    expect(m.s.players[0]!.explored.filter((e) => e === 1).length).toBe(tilesInRadius(m.s.map, { x: 5, y: 3 }, HUTS.mapRadius).length);

    const un = hut('unit');
    const before = un.s.units.filter((x) => x.owner === 0).length;
    moveUnit(un.s, un.u.id, { x: 5, y: 3 });
    expect(un.s.units.filter((x) => x.owner === 0).length).toBe(before + 1);

    const t = hut('tech');
    moveUnit(t.s, t.u.id, { x: 5, y: 3 });
    expect(t.s.players[0]!.techs).toHaveLength(1);

    const b = hut('barbarians');
    const barbs = b.s.units.filter((x) => x.owner === barbarianId(b.s)).length;
    moveUnit(b.s, b.u.id, { x: 5, y: 3 });
    expect(b.s.units.filter((x) => x.owner === barbarianId(b.s)).length).toBe(barbs + HUTS.barbarianCount);
  });

  it(`never barbarians before turn ${HUTS.barbariansFromTurn}, and never an artifact`, () => {
    for (let i = 0; i < 300; i++) {
      const { s, u } = hut(undefined, HUTS.barbariansFromTurn - 1);
      s.rngState = (FAIR + i * 0x9e3779b9) >>> 0;
      const res = enterHut(s, u);
      expect(res.kind).not.toBe('barbarians');
      expect(s.log.some((e) => e.kind === 'artifact')).toBe(false);
    }
  });
});

describe('Great People', () => {
  const settledCity = (kind: 'scientist' | 'artist' | 'merchant' | 'engineer' | 'general') => {
    const s = makeState(['ggg', 'gfg', 'ggg'], { players: 1 });
    const city = addCity(s, 0, 1, 1, { size: 3, build: { kind: 'unit', id: 'warrior' } });
    s.players[0]!.scienceRate = 50;
    const gp = addGreatPerson(s, 0, kind);
    return { s, city, gp };
  };

  it('thresholds rise, and one arrives each time culture passes the next', () => {
    const t = [0, 1, 2, 3].map(greatPersonThreshold);
    expect(t[0]).toBe(GPR.first);
    for (let i = 1; i < t.length; i++) expect(t[i]! - t[i - 1]!).toBeGreaterThan(t[i - 1]! - (t[i - 2] ?? 0) - 1);
    const s = makeState(['ggg'], { players: 1 });
    addCity(s, 0, 1, 0, { buildings: ['temple'] });
    s.players[0]!.culture = t[0]! - 1;
    expect(checkGreatPeople(s, 0)).toHaveLength(0);
    processCities(s, 0);
    expect(checkGreatPeople(s, 0)).toHaveLength(1);
    expect(s.players[0]!.greatPeople).toBe(1);
    // Culture from before the upgrade (the migration's starting point) doesn't count.
    s.players[0]!.greatPeopleCultureBase = 10_000;
    s.players[0]!.culture = 10_000 + t[1]! - 1;
    expect(checkGreatPeople(s, 0)).toHaveLength(0);
  });

  it('settled: science, culture, gold, production, and veterans in that city', () => {
    const sci = settledCity('scientist');
    const before = cityScienceGold(sci.s, sci.city);
    useGreatPerson(sci.s, sci.gp.id, { mode: 'settle', cityId: sci.city.id });
    expect(cityScienceGold(sci.s, sci.city).science).toBe(before.science + Math.floor((before.science * GPR.scientistSciencePct) / 100));

    const art = settledCity('artist');
    useGreatPerson(art.s, art.gp.id, { mode: 'settle', cityId: art.city.id });
    expect(cityCulture(art.s, art.city)).toBe(GPR.artistCulture);

    const mer = settledCity('merchant');
    const g0 = cityScienceGold(mer.s, mer.city).gold;
    useGreatPerson(mer.s, mer.gp.id, { mode: 'settle', cityId: mer.city.id });
    expect(cityScienceGold(mer.s, mer.city).gold).toBe(g0 + Math.floor((g0 * GPR.merchantGoldPct) / 100));

    const eng = settledCity('engineer');
    const p0 = cityYields(eng.s, eng.city).production;
    useGreatPerson(eng.s, eng.gp.id, { mode: 'settle', cityId: eng.city.id });
    expect(cityYields(eng.s, eng.city).production).toBe(p0 + Math.floor((p0 * GPR.engineerProductionPct) / 100));

    const gen = settledCity('general');
    useGreatPerson(gen.s, gen.gp.id, { mode: 'settle', cityId: gen.city.id });
    gen.city.production = 10;
    processCities(gen.s, 0);
    expect(gen.s.units.at(-1)!.veteran).toBe(true);
    const army = addUnit(gen.s, 'legion', 0, 1, 1, { army: true });
    expect(attackStrength(army, gen.s).mods.map((m) => m.label)).toContain('Great General');
    expect(defenseStrength(gen.s, army).mods.map((m) => m.label)).toContain('Great General');
  });

  it('used once: a tech, culture, gold, a finished wonder, a stack of veterans', () => {
    const sci = settledCity('scientist');
    sci.s.players[0]!.researching = 'alphabet';
    expect(useGreatPerson(sci.s, sci.gp.id, { mode: 'use' }).ok).toBe(true);
    expect(sci.s.players[0]!.techs).toEqual(['alphabet']);

    const art = settledCity('artist');
    useGreatPerson(art.s, art.gp.id, { mode: 'use' });
    expect(art.s.players[0]!.culture).toBe(GPR.artistCultureBurst);

    const mer = settledCity('merchant');
    useGreatPerson(mer.s, mer.gp.id, { mode: 'use' });
    expect(mer.s.players[0]!.gold).toBe(GPR.merchantGoldBase);

    const eng = settledCity('engineer');
    eng.s.players[0]!.techs = ['masonry'];
    eng.city.build = { kind: 'unit', id: 'warrior' };
    expect(useGreatPerson(eng.s, eng.gp.id, { mode: 'use', cityId: eng.city.id }).ok).toBe(false); // a unit, not a wonder
    eng.city.build = { kind: 'wonder', id: 'pyramids' };
    expect(useGreatPerson(eng.s, eng.gp.id, { mode: 'use', cityId: eng.city.id }).ok).toBe(true);
    processCities(eng.s, 0);
    expect(eng.city.wonders).toContain('pyramids');

    const gen = settledCity('general');
    addUnit(gen.s, 'warrior', 0, 0, 0);
    addUnit(gen.s, 'archer', 0, 0, 0);
    addUnit(gen.s, 'warrior', 0, 2, 2);
    useGreatPerson(gen.s, gen.gp.id, { mode: 'use', at: { x: 0, y: 0 } });
    expect(gen.s.units.filter((u) => u.x === 0 && u.y === 0).every((u) => u.veteran)).toBe(true);
    expect(gen.s.units.find((u) => u.x === 2 && u.y === 2)!.veteran).toBe(false);
  });

  it('the AI uses its own at once: an Engineer finishes the wonder it is building', () => {
    const s = makeState(['ggg', 'ggg'], { players: 2 });
    const city = addCity(s, 1, 1, 0, { build: { kind: 'wonder', id: 'pyramids' } });
    s.players[1]!.techs = ['masonry'];
    s.currentPlayer = 1;
    addGreatPerson(s, 1, 'engineer');
    expect(s.greatPeople).toHaveLength(0);
    expect(city.production).toBeGreaterThanOrEqual(90);
    // Otherwise it settles it (deterministic).
    const t = makeState(['ggg'], { players: 2 });
    const c2 = addCity(t, 1, 1, 0, { build: { kind: 'unit', id: 'warrior' } });
    t.currentPlayer = 1;
    addGreatPerson(t, 1, 'artist');
    expect(c2.greatPeople.length + (t.players[1]!.culture > 0 ? 1 : 0)).toBe(1);
  });

  it('shows up in a real game: several per civ by turn 150 (sim: npm run sim)', () => {
    const s = createGame({ seed: 8 });
    for (const p of s.players) if (p.kind === 'human') p.kind = 'ai';
    while (s.turn <= 150) {
      playComputerTurn(s, s.currentPlayer);
      endTurn(s);
    }
    const civs = civPlayers(s);
    expect(civs.reduce((n, p) => n + p.greatPeople, 0)).toBeGreaterThan(civs.length);
    expect(s.greatPeople).toHaveLength(0); // the AI never leaves one waiting
  }, 60_000);
});

describe('save migration v7 → v8', () => {
  function v7Save(): { text: string; explored: number[] } {
    const s = createGame({ seed: 21, barbarians: false });
    // Dan has looked around: player 0 knows a patch of the map.
    const p = s.players[0]!;
    const start = s.units.find((u) => u.owner === 0)!;
    for (const c of tilesInRadius(s.map, start, 6)) p.explored[tileIndex(s.map, c.x, c.y)] = 1;
    p.culture = 123;
    const raw = JSON.parse(serializeGame(s, 0));
    raw.saveVersion = 7;
    raw.state.version = 7;
    for (const t of raw.state.map.tiles) {
      delete t.resource;
      delete t.hut;
    }
    delete raw.state.villages;
    delete raw.state.greatPeople;
    delete raw.state.greatPeopleNames;
    for (const q of raw.state.players) {
      delete q.greatPeople;
      delete q.greatPeopleCultureBase;
    }
    for (const c of raw.state.cities) delete c.greatPeople;
    return { text: JSON.stringify(raw), explored: [...p.explored] };
  }

  it('adds resources from the seed, the barbarians, and villages and huts only where nobody has looked', () => {
    const { text, explored } = v7Save();
    const res = deserializeGame(text);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    const s = res.state;
    expect(res.migratedFrom).toBe(7);
    expect(s.version).toBe(STATE_VERSION);
    const b = barbarianId(s);
    expect(b).toBe(s.players.length - 1);
    expect(s.atWar).toHaveLength(s.players.length);
    expect(s.diplomacy.met.every((r) => r.length === s.players.length)).toBe(true);
    for (const p of civPlayers(s)) expect(atWar(s, p.id, b)).toBe(true);
    expect(s.map.tiles.filter((t) => t.resource).length).toBeGreaterThan(15);
    expect(s.villages.length).toBeGreaterThan(0);
    for (const v of s.villages) expect(explored[tileIndex(s.map, v.x, v.y)]).toBe(0);
    s.map.tiles.forEach((t, i) => {
      if (t.hut) expect(explored[i]).toBe(0);
    });
    // Culture already earned doesn't count toward Great People.
    expect(s.players[0]!.greatPeopleCultureBase).toBe(123);
    expect(checkGreatPeople(s, 0)).toHaveLength(0);
    expect(s.cities.every((c) => Array.isArray(c.greatPeople))).toBe(true);
    // It plays on, barbarians and all.
    for (let i = 0; i < 5; i++) expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
    // And it saves and loads again as v8.
    expect(deserializeGame(serializeGame(s, 0)).kind).toBe('ok');
  });

  it('a very old save (v2) still comes all the way forward', () => {
    const s = makeState(['ggg']);
    addCity(s, 0, 1, 0);
    const raw = JSON.parse(serializeGame(s, 0));
    raw.saveVersion = 7;
    raw.state.version = 7;
    const res = deserializeGame(JSON.stringify(raw));
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') expect(barbarianId(res.state)).toBe(2);
  });
});

describe('combat odds with barbarians', () => {
  it("a village's defender: village and fortified bonuses listed by name", () => {
    const s = field();
    const v = addVillage(s, 5, 3);
    const legion = addUnit(s, 'legion', 0, 4, 3);
    s.currentPlayer = 0;
    const odds = combatOdds(s, legion, v)!;
    expect(odds.defense.total).toBe(1 * (1 + (BARBARIANS.villageDefensePct + RULES.combat.fortifiedPct) / 100));
  });
});
