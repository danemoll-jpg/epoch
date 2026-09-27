// Round 22: fixes from Dan's playtest (2026-09-26/27).

import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game/actions';
import { tileOwner } from '../src/game/borders';
import { aiUpgrade, upgradableUnits, upgradeError } from '../src/game/upgrades';
import { addCity, addUnit, makeState } from './helpers';

// ---- item 1: upgrades anywhere inside your borders ------------------------------------------

describe('Round 22 item 1: upgrades inside your borders', () => {
  // Your city Ur at (2, 1) on the coast (column 0 is water), a rival's Taxila at (7, 1).
  function coast() {
    const s = makeState(['cgggggggg', 'cgggggggg', 'cgggggggg']);
    addCity(s, 0, 2, 1, { name: 'Ur' });
    addCity(s, 1, 7, 1, { name: 'Taxila' });
    const p = s.players[0]!;
    p.techs = ['bronze_working', 'map_making', 'seafaring', 'astronomy', 'navigation'];
    p.gold = 500;
    return s;
  }

  it('borders reach the water next to the coast', () => {
    const s = coast();
    expect(tileOwner(s, 1, 1)).toBe(0);
    expect(s.map.tiles[1 * 9 + 1]!.terrain).toBe('grassland');
    // Column 0 is two tiles from Ur: outside radius 1 until the city grows its borders.
    s.cities[0]!.culture = 25;
    expect(tileOwner(s, 0, 1)).toBe(0);
    expect(s.map.tiles[1 * 9 + 0]!.terrain).toBe('coast');
  });

  it('a land unit in the field inside your borders upgrades there', () => {
    const s = coast();
    const w = addUnit(s, 'warrior', 0, 3, 2);
    expect(upgradeError(s, w)).toBeUndefined();
    expect(applyAction(s, { type: 'upgrade', unitId: w.id }).ok).toBe(true);
    expect(w.type).toBe('spearman');
  });

  it('a ship at sea inside your borders upgrades there; one outside can\'t', () => {
    const s = coast();
    s.cities[0]!.culture = 25;
    const g = addUnit(s, 'galley', 0, 0, 1);
    expect(upgradeError(s, g)).toBeUndefined();
    const far = addUnit(s, 'galley', 0, 0, 2);
    s.cities[0]!.culture = 0;
    expect(upgradeError(s, far)).toBe('Only inside your borders');
    s.cities[0]!.culture = 25;
    expect(applyAction(s, { type: 'upgrade', unitId: g.id }).ok).toBe(true);
    expect(g.type).toBe('caravel');
  });

  it('not in a rival\'s borders or neutral land, not aboard a ship; cargo and moves still checked', () => {
    const s = coast();
    expect(upgradeError(s, addUnit(s, 'warrior', 0, 6, 1))).toBe('Only inside your borders');
    expect(upgradeError(s, addUnit(s, 'warrior', 0, 4, 1))).toBe('Only inside your borders');
    s.cities[0]!.culture = 25;
    const g = addUnit(s, 'galley', 0, 0, 1);
    const aboard = addUnit(s, 'warrior', 0, 0, 1, { carriedBy: g.id });
    expect(upgradeError(s, aboard)).toBe('Not while aboard a ship');
    expect(upgradeError(s, addUnit(s, 'warrior', 0, 3, 1, { movesLeft: 0 }))).toBe('It has already used its turn');
    s.players[0]!.techs.push('magnetism', 'iron_working', 'steam_engine', 'industrialization');
    const f = addUnit(s, 'frigate', 0, 0, 0);
    for (let i = 0; i < 3; i++) addUnit(s, 'warrior', 0, 0, 0, { carriedBy: f.id });
    s.map.tiles[0]!.terrain = 'coast';
    expect(upgradeError(s, f)).toBe('Unload its cargo first');
  });

  it('Upgrade all and the AI see units anywhere in their borders', () => {
    const s = coast();
    const w = addUnit(s, 'warrior', 0, 3, 2);
    addUnit(s, 'warrior', 0, 5, 1); // outside
    expect(upgradableUnits(s, 0).map((x) => x.unit.id)).toEqual([w.id]);
    const ai = addUnit(s, 'warrior', 1, 6, 2);
    s.players[1]!.techs = ['bronze_working'];
    s.players[1]!.gold = 100;
    s.currentPlayer = 1;
    expect(aiUpgrade(s, 1, 0)).toBe(1);
    expect(ai.type).toBe('spearman');
  });
});

// ---- item 7: a nation with no cities is eliminated -------------------------------------------

import { RULES } from '../src/data/rules';
import { captureCity } from '../src/game/conquest';
import { endTurn, playComputerTurn } from '../src/game/turn';
import { deserializeGame } from '../src/game/save';
import { capitalsHeld } from '../src/game/victory';

describe('Round 22 item 7: losing the last city', () => {
  // Your capital Ur at (1, 1); France-like rival (player 1) with one city, Metz, at (6, 1).
  function lastCity() {
    const s = makeState(['ggggggggg', 'ggggggggg', 'ggggggggg', 'ccccccccc']);
    addCity(s, 0, 1, 1, { name: 'Ur', capitalOf: 0 });
    const metz = addCity(s, 1, 6, 1, { name: 'Metz', capitalOf: 1 });
    s.players[0]!.citiesFounded = 1;
    s.players[1]!.citiesFounded = 1;
    return { s, metz };
  }

  it('with no Settler: eliminated at once, its leftover units (a ship, a spy) disbanded', () => {
    const { s, metz } = lastCity();
    addUnit(s, 'galley', 1, 4, 3);
    addUnit(s, 'spy', 1, 2, 2);
    captureCity(s, metz, 0);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.units.some((u) => u.owner === 1)).toBe(false);
    const e = s.log.find((x) => x.kind === 'eliminated')!;
    expect(e.text).toMatch(/been eliminated; its last 2 units were disbanded/);
    expect(e.publicText).toBe(e.text);
    // Domination counts it as held.
    expect(capitalsHeld(s, 0)).toEqual({ held: 1, of: 1 });
  });

  it(`with a Settler: ${RULES.homelessTurns} turns to found a city, then eliminated`, () => {
    const { s, metz } = lastCity();
    const settler = addUnit(s, 'settler', 1, 3, 2);
    addUnit(s, 'warrior', 1, 3, 2);
    captureCity(s, metz, 0);
    expect(s.players[1]!.alive).toBe(true);
    expect(s.players[1]!.homelessSince).toBe(s.turn);
    expect(s.log.some((x) => x.kind === 'homeless' && /no cities left; its settlers are looking for new land/.test(x.publicText ?? ''))).toBe(true);
    // Keep the Settler from founding: it sits aboard nothing, we just move the clock.
    settler.movesLeft = 0;
    s.turn += RULES.homelessTurns - 1;
    captureCity(s, s.cities[0]!, 0); // any check: still inside the time
    expect(s.players[1]!.alive).toBe(true);
    s.turn += 1;
    // The once-a-turn check at the start of a game turn.
    s.currentPlayer = 1;
    endTurn(s);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.units.some((u) => u.owner === 1)).toBe(false);
  });

  it('founding a new city in time keeps the nation; the AI\'s Settler founds one', () => {
    const s = makeState(['gggggggggggggg', 'gggggggggggggg', 'gggggggggggggg', 'cccccccccccccc']);
    addCity(s, 0, 1, 1, { name: 'Ur', capitalOf: 0 });
    const metz = addCity(s, 1, 6, 1, { name: 'Metz', capitalOf: 1 });
    s.players[0]!.citiesFounded = 1;
    s.players[1]!.citiesFounded = 1;
    addUnit(s, 'settler', 1, 11, 1);
    captureCity(s, metz, 0);
    s.currentPlayer = 1;
    playComputerTurn(s, 1);
    expect(s.cities.some((c) => c.owner === 1)).toBe(true);
    endTurn(s);
    endTurn(s);
    expect(s.players[1]!.alive).toBe(true);
    expect(s.players[1]!.homelessSince ?? null).toBeNull();
  });

  it('losing its last Settler while homeless eliminates it', () => {
    const { s, metz } = lastCity();
    const settler = addUnit(s, 'settler', 1, 3, 2);
    captureCity(s, metz, 0);
    expect(s.players[1]!.alive).toBe(true);
    const legion = addUnit(s, 'legion', 0, 2, 2);
    s.rngState = 7;
    expect(applyAction(s, { type: 'attack', unitId: legion.id, at: { x: settler.x, y: settler.y } }).ok).toBe(true);
    expect(s.units.some((u) => u.id === settler.id)).toBe(false);
    expect(s.players[1]!.alive).toBe(false);
  });

  it('a nation that never had a city (the game\'s start) isn\'t touched', () => {
    const s = makeState(['ggggg', 'ggggg']);
    addUnit(s, 'settler', 1, 3, 1);
    addUnit(s, 'settler', 0, 1, 1);
    s.turn = 30;
    s.currentPlayer = 1;
    endTurn(s);
    expect(s.players[1]!.alive).toBe(true);
    expect(s.players[1]!.homelessSince ?? null).toBeNull();
  });

  it('a v15 save migrates: a cityless nation with no Settler is eliminated, one with a Settler gets its turns', () => {
    const s = makeState(['ggggggggg', 'ggggggggg', 'ggggggggg', 'ccccccccc'], { players: 3 });
    addCity(s, 0, 1, 1, { name: 'Ur', capitalOf: 0 });
    const metz = addCity(s, 1, 6, 1, { name: 'Metz', capitalOf: 1 });
    for (const p of s.players) p.citiesFounded = 1;
    // The old rule: Metz fell, but a ship kept player 1 alive; player 2 kept a Settler.
    metz.owner = 0;
    addUnit(s, 'galley', 1, 4, 3);
    addUnit(s, 'settler', 2, 4, 0);
    (s as unknown as { version: number }).version = 15;
    const res = deserializeGame(JSON.stringify({ saveVersion: 15, savedAt: 1, state: s }));
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.state.players[1]!.alive).toBe(false);
    expect(res.state.units.some((u) => u.owner === 1)).toBe(false);
    expect(res.state.players[2]!.alive).toBe(true);
    expect(res.state.players[2]!.homelessSince).toBe(s.turn);
  });
});

// ---- items 3 and 4: the Diplomacy overview and the met count -------------------------------

import { everMet, metCivs } from '../src/game/diplomacy';
import { declareWar } from '../src/game/diplomacy';
import { historyWith, metSummary, progressLine, relationText } from '../src/ui/diploOverview';

describe('Round 22 items 3 and 4: Diplomacy overview and the met count', () => {
  function five() {
    const s = makeState(['ggggggggggggggg', 'ggggggggggggggg', 'ggggggggggggggg'], { players: 5, peace: true });
    addCity(s, 0, 1, 1, { name: 'Ur', capitalOf: 0 });
    for (let p = 1; p < 5; p++) {
      addCity(s, p, p * 3, 1, { name: `C${p}`, capitalOf: p });
      s.players[p]!.citiesFounded = 1;
    }
    s.players[0]!.citiesFounded = 1;
    return s;
  }

  it('counts eliminated nations you met: "Met 4 of 4 nations (2 eliminated)"', () => {
    const s = five();
    for (const p of [3, 4]) {
      captureCity(s, s.cities.find((c) => c.owner === p)!, 0);
      expect(s.players[p]!.alive).toBe(false);
    }
    expect(metCivs(s, 0)).toEqual([1, 2]);
    expect(everMet(s, 0)).toEqual([1, 2, 3, 4]);
    expect(metSummary(s, 0)).toMatchObject({ met: 4, of: 4, eliminated: 2, text: 'Met 4 of 4 nations (2 eliminated)' });
    expect(relationText(s, 0, 3)).toBe(`Eliminated on turn ${s.turn}`);
  });

  it('an unmet nation doesn\'t count; no "(0 eliminated)"', () => {
    const s = five();
    s.diplomacy.met[0]![4] = false;
    s.diplomacy.met[4]![0] = false;
    expect(metSummary(s, 0).text).toBe('Met 3 of 4 nations');
  });

  it('relation: at war for how long, or at peace', () => {
    const s = five();
    expect(relationText(s, 0, 1)).toMatch(/^At peace/);
    s.currentPlayer = 0;
    declareWar(s, 0, 1);
    s.turn += 5;
    expect(relationText(s, 0, 1)).toBe(`At war for 5 turns (since turn ${s.turn - 5})`);
  });

  it('progress in a line, and recent history involving them, newest first', () => {
    const s = five();
    expect(progressLine(s, 1)).toMatch(/^Culture \d+% · Gold \d+% · Capitals 0 of 4 · Spaceship not started$/);
    s.currentPlayer = 0;
    declareWar(s, 0, 2);
    captureCity(s, s.cities.find((c) => c.owner === 2)!, 0);
    const h = historyWith(s, 0, 2);
    expect(h.length).toBeGreaterThanOrEqual(2);
    expect(h[0]!.kind).toBe('eliminated');
    expect(h.every((e) => e.player === 2 || e.other === 2)).toBe(true);
    expect(historyWith(s, 0, 1)).toEqual([]);
  });
});

// ---- item 9: Rocketry's satellites map the whole world ---------------------------------------

import { TECH_LIST } from '../src/data/techs';
import { learnTech } from '../src/game/tech';

describe('Round 22 item 9: the map-revealing tech', () => {
  it('is Rocketry, and only Rocketry', () => {
    expect(TECH_LIST.filter((t) => t.revealsMap).map((t) => t.id)).toEqual(['rocketry']);
  });

  it('an AI learning it gets the whole map explored, with news for those who met it', () => {
    const s = makeState(['gggggggg', 'gggggggg'], { exploreAll: false });
    learnTech(s, 1, 'rocketry', 'Learned Rocketry');
    expect(s.players[1]!.explored.every((e) => e === 1)).toBe(true);
    expect(s.players[0]!.explored.every((e) => e === 0)).toBe(true);
    const e = s.log.find((x) => x.player === 1 && x.publicText?.includes('satellites'))!;
    expect(e.publicText).toBe("Maurya's satellites have mapped the whole world");
  });
});

// ---- item 2: roads go direct, and never through another nation's borders --------------------

import { aiBuyRoads, blockedRoadTargets, buyRoadError, roadOption, roadPath } from '../src/game/roads';
import { ROADS } from '../src/data/roads';
import { tileIndex } from '../src/game/grid';

describe('Round 22 item 2: bought roads', () => {
  // Dan's case: your Chernihiv (2, 2) and Oxford (8, 2), a rival's Nantes at (5, 8) with an old
  // road from Chernihiv to Nantes and from Nantes to Oxford.
  const OLD = [
    { x: 2, y: 3 }, { x: 3, y: 4 }, { x: 3, y: 5 }, { x: 4, y: 6 }, { x: 4, y: 7 },
    { x: 6, y: 7 }, { x: 6, y: 6 }, { x: 7, y: 5 }, { x: 7, y: 4 }, { x: 8, y: 3 },
  ];
  function dans() {
    const s = makeState(Array.from({ length: 10 }, () => 'gggggggggggg'), { peace: true });
    const chernihiv = addCity(s, 0, 2, 2, { name: 'Chernihiv' });
    const oxford = addCity(s, 0, 8, 2, { name: 'Oxford' });
    const nantes = addCity(s, 1, 5, 8, { name: 'Nantes' });
    for (const c of OLD) s.map.tiles[tileIndex(s.map, c.x, c.y)]!.road = 'road';
    s.players[0]!.gold = 500;
    return { s, chernihiv, oxford, nantes };
  }

  it('reproduces the cause: the old router took the old road through Nantes (0 new tiles, 12 steps vs 6)', () => {
    const { chernihiv, oxford } = dans();
    // The old road does join them, through Nantes; the direct line is 6 steps.
    expect(OLD.length + 2).toBeGreaterThan(Math.max(Math.abs(oxford.x - chernihiv.x), Math.abs(oxford.y - chernihiv.y)) + ROADS.maxDetour);
  });

  it('goes straight to Oxford instead, paying for the new tiles', () => {
    const { s, chernihiv, oxford } = dans();
    const path = roadPath(s, 0, chernihiv, oxford)!;
    expect(path).toEqual([3, 4, 5, 6, 7].map((x) => ({ x, y: 2 })));
    const opt = roadOption(s, 0, chernihiv, oxford)!;
    expect(opt).toMatchObject({ newTiles: 5, cost: 5 * ROADS.goldPerTile });
    expect(applyAction(s, { type: 'buyRoad', fromCityId: chernihiv.id, toCityId: oxford.id }).ok).toBe(true);
    for (let x = 3; x <= 7; x++) expect(s.map.tiles[tileIndex(s.map, x, 2)]!.road).toBe('road');
  });

  it('reuses old road when it adds at most a tile or two', () => {
    const { s, chernihiv, oxford } = dans();
    // An old road bowing one row south of the direct line: reused (7 steps, 0 new tiles).
    for (const c of [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 }, { x: 7, y: 3 }]) s.map.tiles[tileIndex(s.map, c.x, c.y)]!.road = 'road';
    const opt = roadOption(s, 0, chernihiv, oxford)!;
    expect(opt.newTiles).toBe(0);
    expect(opt.path.every((c) => c.y === 3)).toBe(true);
  });

  it('never passes through another nation\'s city or borders; says whose borders block it', () => {
    const s = makeState(['ggggggggg', 'ggggggggg', 'ggggggggg'], { peace: true });
    const a = addCity(s, 0, 0, 1, { name: 'Chernihiv' });
    const b = addCity(s, 0, 8, 1, { name: 'Oxford' });
    addCity(s, 1, 4, 1, { name: 'Nantes', culture: 120 });
    s.players[0]!.gold = 500;
    expect(roadPath(s, 0, a, b)).toBeUndefined();
    expect(buyRoadError(s, a.id, b.id)).toBe("Nantes's borders are in the way");
    expect(blockedRoadTargets(s, a).map((x) => x.reason)).toEqual(["Nantes's borders are in the way"]);
    expect(applyAction(s, { type: 'buyRoad', fromCityId: a.id, toCityId: b.id }).ok).toBe(false);
  });

  it('a road to a friendly nation\'s city may enter that nation\'s land, not a third nation\'s', () => {
    const s = makeState(['gggggggggg', 'gggggggggg', 'gggggggggg'], { players: 3, peace: true });
    const mine = addCity(s, 0, 0, 1, { name: 'Ur' });
    const theirs = addCity(s, 1, 6, 1, { name: 'Taxila' });
    expect(roadPath(s, 0, mine, theirs)).toBeDefined();
    addCity(s, 2, 3, 1, { name: 'Timbuktu', culture: 120 });
    expect(roadPath(s, 0, mine, theirs)).toBeUndefined();
  });

  it('the AI follows the same rule', () => {
    const { s, chernihiv, oxford } = dans();
    s.players[0]!.kind = 'ai';
    expect(aiBuyRoads(s, 0, 0)).toBe(true);
    for (let x = 3; x <= 7; x++) expect(s.map.tiles[tileIndex(s.map, x, 2)]!.road).toBe('road');
    expect(roadOption(s, 0, chernihiv, oxford)!.newTiles).toBe(0);
  });
});

// ---- item 6: Unload all ----------------------------------------------------------------------

import { unloadAll, unloadAllError } from '../src/game/movement';

describe('Round 22 item 6: Unload all', () => {
  // Water in column 0-1, land from column 2; a Galley at (1, 1).
  function beach() {
    const s = makeState(['ccgggg', 'ccgggg', 'ccgggg']);
    addCity(s, 0, 4, 1, { name: 'Ur' });
    const galley = addUnit(s, 'galley', 0, 1, 1);
    return { s, galley };
  }

  it('needs a land tile next to the ship at sea; stacks everyone there', () => {
    const { s, galley } = beach();
    const a = addUnit(s, 'warrior', 0, 1, 1, { carriedBy: galley.id });
    const b = addUnit(s, 'archer', 0, 1, 1, { carriedBy: galley.id });
    expect(unloadAll(s, galley.id).reason).toBe('Tap a land tile next to the ship to unload there');
    expect(unloadAll(s, galley.id, { x: 3, y: 1 }).reason).toBe('Pick a land tile next to the ship');
    expect(unloadAll(s, galley.id, { x: 0, y: 1 }).reason).toBe('Pick a land tile next to the ship');
    expect(unloadAll(s, galley.id, { x: 2, y: 2 })).toEqual({ ok: true, message: '2 units went ashore' });
    for (const u of [a, b]) expect(u).toMatchObject({ x: 2, y: 2, carriedBy: null, movesLeft: 0 });
  });

  it('those that can\'t go stay aboard with a reason; nothing to do says so', () => {
    const { s, galley } = beach();
    expect(unloadAllError(s, galley)).toBe('Nothing aboard');
    const w = addUnit(s, 'warrior', 0, 1, 1, { carriedBy: galley.id, movesLeft: 0 });
    expect(unloadAllError(s, galley)).toBe('Everyone aboard has used their moves');
    w.movesLeft = 1;
    // A rival unit on the beach (at peace): nobody can land there.
    s.atWar[0]![1] = false;
    s.atWar[1]![0] = false;
    addUnit(s, 'warrior', 1, 2, 1);
    const res = unloadAll(s, galley.id, { x: 2, y: 1 });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/^Nobody could go ashore \(Warrior: you are at peace with/);
    expect(w.carriedBy).toBe(galley.id);
  });

  it('works through applyAction, only on your turn and your ship', () => {
    const { s, galley } = beach();
    addUnit(s, 'warrior', 0, 1, 1, { carriedBy: galley.id });
    s.currentPlayer = 1;
    expect(applyAction(s, { type: 'unloadAll', shipId: galley.id, to: { x: 2, y: 1 } }).reason).toBe('Not your turn');
  });
});
