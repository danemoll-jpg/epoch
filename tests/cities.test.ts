import { describe, expect, it } from 'vitest';
import { RULES, growthThreshold, rushBuyCost } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import { applyAction } from '../src/game/actions';
import { aiCityTarget, chooseBuild, runAiTurn } from '../src/game/ai';
import { foundCity } from '../src/game/city';
import { tileIndex } from '../src/game/grid';
import { eventsVisibleTo } from '../src/game/log';
import { createGame } from '../src/game/newGame';
import {
  buyCost,
  buyError,
  processCities,
  rushBuy,
  setBuild,
  setFocus,
  setScienceRate,
} from '../src/game/production';
import { deserializeGame, serializeGame } from '../src/game/save';
import { endTurn } from '../src/game/turn';
import { cityScienceGold, cityYields, empireIncome, foodSurplus, refreshWorkedTiles } from '../src/game/yields';
import { resolveTap } from '../src/ui/tap';
import { addCity, addUnit, makeState } from './helpers';

const idx = (s: { map: { width: number } }, x: number, y: number) => y * s.map.width + x;

describe('city growth', () => {
  it('surplus food fills the box and the city grows when it is full', () => {
    // Grassland center: 2 + 1 bonus = 3 food; works one grassland (2). Eats 2 → +3.
    const s = makeState(['ggg', 'ggg', 'ggg']);
    const c = addCity(s, 0, 1, 1);
    expect(foodSurplus(s, c)).toBe(3);
    const threshold = growthThreshold(1);
    c.food = threshold - 3;
    processCities(s, 0);
    expect(c.size).toBe(2);
    expect(c.food).toBe(0); // no Granary: nothing kept
  });

  it('does not grow before the box is full', () => {
    const s = makeState(['ggg', 'ggg', 'ggg']);
    const c = addCity(s, 0, 1, 1);
    processCities(s, 0);
    expect([c.size, c.food]).toEqual([1, 3]);
  });

  it('a Granary keeps part of the food box after growth', () => {
    const s = makeState(['ggg', 'ggg', 'ggg']);
    const c = addCity(s, 0, 1, 1, { buildings: ['granary'] });
    const threshold = growthThreshold(1);
    c.food = threshold - 1;
    processCities(s, 0);
    expect(c.size).toBe(2);
    expect(c.food).toBe(Math.floor(threshold * 0.5));
  });

  it('a food deficit empties the box, and the city shrinks when it runs out', () => {
    // Desert everywhere: center 0 + 1 = 1 food. Size 3 eats 6 → deficit 5.
    const s = makeState(['ddd', 'ddd', 'ddd']);
    const c = addCity(s, 0, 1, 1, { size: 3, food: 7 });
    expect(foodSurplus(s, c)).toBe(-5);
    processCities(s, 0);
    expect([c.size, c.food]).toEqual([3, 2]);
    processCities(s, 0);
    expect([c.size, c.food]).toEqual([2, 0]);
  });

  it('a size-1 city never shrinks below 1', () => {
    const s = makeState(['ddd', 'ddd', 'ddd']);
    const c = addCity(s, 0, 1, 1);
    processCities(s, 0);
    expect([c.size, c.food]).toEqual([1, 0]);
  });

  it('thresholds come from data', () => {
    expect(growthThreshold(1)).toBe(RULES.growthBase + RULES.growthPerSize);
    expect(growthThreshold(3)).toBeGreaterThan(growthThreshold(2));
  });
});

describe('worked tiles', () => {
  // Row 0: forest (1/2/0), row 1: grassland (2/0/1) with the city on plains, row 2: coast (1/0/2).
  const rows = ['fff', 'gpg', 'ccc'];

  it('works the center plus one tile per citizen inside the radius', () => {
    const s = makeState(rows);
    const c = addCity(s, 0, 1, 1, { size: 3 });
    expect(c.worked).toHaveLength(3);
    expect(c.worked).not.toContain(idx(s, 1, 1));
    for (const k of c.worked) {
      const x = k % s.map.width;
      const y = Math.floor(k / s.map.width);
      expect(Math.max(Math.abs(x - 1), Math.abs(y - 1))).toBeLessThanOrEqual(RULES.cityWorkRadius);
    }
  });

  it('picks tiles by focus', () => {
    const s = makeState(rows);
    const c = addCity(s, 0, 1, 1, { size: 1 });
    const pick = (focus: 'food' | 'production' | 'trade') => {
      setFocus(s, c.id, focus);
      return s.map.tiles[c.worked[0]!]!.terrain;
    };
    expect(pick('food')).toBe('grassland');
    expect(pick('production')).toBe('forest');
    expect(pick('trade')).toBe('coast');
  });

  it("a production focus still won't starve the city while food is available", () => {
    const s = makeState(rows);
    const c = addCity(s, 0, 1, 1, { size: 3, focus: 'production' });
    refreshWorkedTiles(s);
    expect(foodSurplus(s, c)).toBeGreaterThanOrEqual(0);
  });

  it('two cities never work the same tile', () => {
    const s = makeState(['ggggggg', 'ggggggg', 'ggggggg']);
    const a = addCity(s, 0, 1, 1, { size: 8 });
    const b = addCity(s, 1, 4, 1, { size: 8 });
    const all = [...a.worked, ...b.worked];
    expect(new Set(all).size).toBe(all.length);
    // Neither works a city center.
    expect(all).not.toContain(idx(s, 1, 1));
    expect(all).not.toContain(idx(s, 4, 1));
    // The shared column (x = 2..3) was split, not grabbed entirely by the older city.
    expect(b.worked.length).toBeGreaterThan(3);
  });

  it('citizens with no free tile become specialists', () => {
    const s = makeState(['ggg', 'ggg', 'ggg']);
    const c = addCity(s, 0, 1, 1, { size: 10 });
    expect(c.worked).toHaveLength(8);
    // 8 grassland worked: 16 food + 3 center.
    expect(cityYields(s, c).food).toBe(19 + 2 * RULES.specialistYields.food);
  });
});

describe('production', () => {
  it('accumulates and finishes the item, carrying the overflow', () => {
    const s = makeState(['fff', 'fpf', 'fff']);
    const c = addCity(s, 0, 1, 1, { build: { kind: 'unit', id: 'warrior' } });
    const perTurn = cityYields(s, c).production; // plains center 1 + bonus, forest 2
    expect(perTurn).toBe(1 + RULES.cityCenterBonus.production + 2);
    c.production = UNITS.warrior.cost - 1;
    processCities(s, 0);
    expect(s.units.filter((u) => u.type === 'warrior')).toHaveLength(1);
    expect(c.production).toBe(perTurn - 1);
  });

  it('keeps a unit selected after it finishes, and asks again after a building', () => {
    const s = makeState(['fff', 'fpf', 'fff']);
    const c = addCity(s, 0, 1, 1, { build: { kind: 'unit', id: 'warrior' }, production: 10 });
    processCities(s, 0);
    expect(c.build).toEqual({ kind: 'unit', id: 'warrior' });
    s.players[0]!.techs.push('ceremonial_burial'); // Temple needs it
    setBuild(s, c.id, { kind: 'building', id: 'temple' });
    c.production = 30;
    processCities(s, 0);
    expect(c.buildings).toEqual(['temple']);
    expect(c.build).toBeNull();
  });

  it('stores production while nothing is chosen', () => {
    const s = makeState(['fff', 'fpf', 'fff']);
    const c = addCity(s, 0, 1, 1);
    processCities(s, 0);
    expect(c.production).toBe(1 + RULES.cityCenterBonus.production + 2);
  });

  it("can't build a building twice", () => {
    const s = makeState(['ggg']);
    const c = addCity(s, 0, 1, 0, { buildings: ['library'] });
    expect(setBuild(s, c.id, { kind: 'building', id: 'library' }).reason).toBe('Already built');
  });

  it('new units start as veterans only with Barracks', () => {
    const s = makeState(['fff', 'fpf', 'fff']);
    const plain = addCity(s, 0, 1, 1, { build: { kind: 'unit', id: 'warrior' }, production: 10 });
    processCities(s, 0);
    expect(s.units.find((u) => u.x === plain.x)!.veteran).toBe(false);
    plain.buildings.push('barracks');
    plain.production = 10;
    processCities(s, 0);
    expect(s.units.filter((u) => u.veteran)).toHaveLength(1);
  });

  it('rush-buy cost follows the data formula on the production still missing', () => {
    expect(rushBuyCost(10)).toBe(Math.ceil(10 * 2 + 100 / 20));
    expect(rushBuyCost(0)).toBe(0);
    const s = makeState(['ggg']);
    const c = addCity(s, 0, 1, 0, { build: { kind: 'building', id: 'library' }, production: 20 });
    expect(buyCost(c)).toBe(rushBuyCost(40));
  });

  it('rush-buying spends gold and the item appears at the end of the turn', () => {
    const s = makeState(['ggg', 'ggg']);
    const c = addCity(s, 0, 1, 0, { build: { kind: 'building', id: 'walls' } });
    const cost = buyCost(c)!;
    expect(buyError(s, c)).toBe(`Needs ${cost} gold`);
    s.players[0]!.gold = cost + 5;
    expect(rushBuy(s, c.id).ok).toBe(true);
    expect(s.players[0]!.gold).toBe(5);
    expect(buyCost(c)).toBeUndefined();
    expect(rushBuy(s, c.id).ok).toBe(false);
    processCities(s, 0);
    expect(c.buildings).toContain('walls');
  });
});

describe('settlers cost population', () => {
  it('a size-1 city waits; at size 2 the settler appears and the city shrinks', () => {
    const s = makeState(['fff', 'fpf', 'fff']);
    const c = addCity(s, 0, 1, 1, { build: { kind: 'unit', id: 'settler' }, production: 29 });
    processCities(s, 0);
    expect(s.units).toHaveLength(0);
    expect(c.production).toBeGreaterThanOrEqual(UNITS.settler.cost);
    c.size = 2;
    processCities(s, 0);
    expect(s.units.map((u) => u.type)).toEqual(['settler']);
    expect(c.size).toBe(1);
  });

  it("can't rush-buy a settler the city is too small to finish", () => {
    const s = makeState(['ggg']);
    const c = addCity(s, 0, 1, 0, { build: { kind: 'unit', id: 'settler' } });
    s.players[0]!.gold = 999;
    expect(buyError(s, c)).toBe('Needs size 2');
  });

  it('the population cost lives in the unit data', () => {
    expect(UNITS.settler.popCost).toBe(1);
    expect(UNITS.warrior.popCost).toBe(0);
  });
});

describe('trade, science, and gold', () => {
  it('splits trade by the empire-wide rate', () => {
    // Coast all round: plains center trade 1+2 = 3, works one coast (2) → 5 trade.
    const s = makeState(['ccc', 'cpc', 'ccc']);
    const c = addCity(s, 0, 1, 1, { focus: 'trade' });
    refreshWorkedTiles(s);
    expect(cityYields(s, c).trade).toBe(5);
    expect(cityScienceGold(s, c)).toEqual({ science: 3, gold: 2 }); // 60% of 5 = 3
    setScienceRate(s, 100);
    expect(cityScienceGold(s, c)).toEqual({ science: 5, gold: 0 });
    setScienceRate(s, 0);
    expect(cityScienceGold(s, c)).toEqual({ science: 0, gold: 5 });
  });

  it('rates move in 10% steps only', () => {
    const s = makeState(['g']);
    expect(setScienceRate(s, 55).ok).toBe(false);
    expect(setScienceRate(s, 110).ok).toBe(false);
    expect(setScienceRate(s, 70).ok).toBe(true);
    expect(s.players[0]!.scienceRate).toBe(70);
  });

  it('Library and Marketplace add their percentages', () => {
    const s = makeState(['ccc', 'cpc', 'ccc']);
    const c = addCity(s, 0, 1, 1, { size: 4, focus: 'trade' });
    refreshWorkedTiles(s);
    setScienceRate(s, 40);
    const base = cityScienceGold(s, c); // trade 3 + 8 = 11 → 4 / 7
    expect(base).toEqual({ science: 4, gold: 7 });
    c.buildings.push('library', 'marketplace');
    expect(cityScienceGold(s, c)).toEqual({ science: 8, gold: 10 }); // Library +100%, Marketplace +50% rounded down
  });

  it('end of turn adds science and gold to the empire', () => {
    const s = makeState(['ccc', 'cpc', 'ccc']);
    addCity(s, 0, 1, 1, { focus: 'trade' });
    const income = empireIncome(s, 0);
    processCities(s, 0);
    expect(s.players[0]!.science).toBe(income.science);
    expect(s.players[0]!.gold).toBe(income.gold);
  });
});

describe('autosave', () => {
  it('round-trips a mid-game save exactly', () => {
    const s = createGame({ seed: 11 });
    for (let i = 0; i < 6; i++) applyAction(s, { type: 'endTurn' });
    const res = deserializeGame(serializeGame(s, 123));
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') {
      expect(res.state).toEqual(s);
      expect(res.savedAt).toBe(123);
    }
  });

  it('a resumed game continues identically to the original', () => {
    const a = createGame({ seed: 21, playerCount: 5 });
    const settler = a.units.find((u) => u.owner === 0 && u.type === 'settler')!;
    const city = foundCity(a, settler.id).city!;
    applyAction(a, { type: 'setBuild', cityId: city.id, item: { kind: 'unit', id: 'warrior' } });
    for (let i = 0; i < 5; i++) applyAction(a, { type: 'endTurn' });
    const res = deserializeGame(serializeGame(a, 0));
    if (res.kind !== 'ok') throw new Error('save failed to load');
    const b = res.state;
    for (let i = 0; i < 15; i++) {
      applyAction(a, { type: 'endTurn' });
      applyAction(b, { type: 'endTurn' });
    }
    expect(b).toEqual(a);
    expect(a.cities.length).toBeGreaterThan(1); // the AIs actually did something
  });

  it('refuses a save from another version instead of crashing', () => {
    const s = createGame({ seed: 1 });
    const old = JSON.parse(serializeGame(s, 0));
    old.saveVersion = 1;
    expect(deserializeGame(JSON.stringify(old)).kind).toBe('incompatible');
    // An M1-era state (version 1) with no saveVersion at all.
    expect(deserializeGame(JSON.stringify({ state: { ...s, version: 1 } })).kind).toBe('incompatible');
  });

  it('reports a damaged save as corrupt', () => {
    expect(deserializeGame('{not json').kind).toBe('corrupt');
    const s = createGame({ seed: 1 });
    const broken = JSON.parse(serializeGame(s, 0));
    broken.state.map.tiles = [];
    expect(deserializeGame(JSON.stringify(broken)).kind).toBe('corrupt');
  });
});

describe('AI cities', () => {
  it('builds a defender first, then settlers, then a second defender, then buildings', () => {
    const s = makeState(['ggggggggggg', 'ggggggggggg', 'ggggggggggg'], { peace: true });
    const c = addCity(s, 1, 1, 1, { size: 2 });
    expect(chooseBuild(s, c)).toEqual({ kind: 'unit', id: 'warrior' });
    addUnit(s, 'warrior', 1, 1, 1);
    // One defender is enough while expanding.
    expect(chooseBuild(s, c)).toEqual({ kind: 'unit', id: 'settler' });
    // Two cities plus a settler in the field reaches this small map's target of 3.
    addCity(s, 1, 4, 1);
    addUnit(s, 'settler', 1, 8, 2);
    expect(aiCityTarget(s)).toBe(3);
    // Done expanding: a second defender, then buildings (none unlocked yet), then a few attackers.
    expect(chooseBuild(s, c)).toEqual({ kind: 'unit', id: 'warrior' });
    addUnit(s, 'warrior', 1, 1, 1);
    s.players[1]!.techs.push('pottery', 'alphabet', 'writing');
    expect(chooseBuild(s, c)).toEqual({ kind: 'building', id: 'granary' });
    c.buildings.push('granary');
    expect(chooseBuild(s, c)).toEqual({ kind: 'building', id: 'library' });
  });

  it(`only ${RULES.ai.settlersAtOnce} settlers are under way at once`, () => {
    const s = makeState(Array.from({ length: 6 }, () => 'g'.repeat(25)), { peace: true });
    const a = addCity(s, 1, 1, 1, { build: { kind: 'unit', id: 'settler' } });
    const b = addCity(s, 1, 5, 1);
    addUnit(s, 'warrior', 1, a.x, a.y);
    addUnit(s, 'warrior', 1, b.x, b.y);
    expect(RULES.ai.settlersAtOnce).toBe(2);
    expect(chooseBuild(s, b)).toEqual({ kind: 'unit', id: 'settler' });
    addUnit(s, 'settler', 1, 9, 1);
    expect(chooseBuild(s, b)).not.toEqual({ kind: 'unit', id: 'settler' });
  });

  it('AI players found more cities and fill their build queues over time (deterministic)', () => {
    const play = () => {
      const s = createGame({ seed: 8, playerCount: 5 });
      for (let i = 0; i < 40; i++) applyAction(s, { type: 'endTurn' });
      return s;
    };
    const a = play();
    const b = play();
    expect(b).toEqual(a);
    for (const p of a.players.filter((p) => p.kind === 'ai')) {
      expect(a.cities.filter((c) => c.owner === p.id).length).toBeGreaterThanOrEqual(2);
    }
    // They moved on to buildings too.
    expect(a.cities.some((c) => c.owner !== 0 && c.buildings.length > 0)).toBe(true);
    // A city that just finished a building shows build: null until its owner's next turn;
    // after the AI's own turn, every one of its cities has something chosen, unless there's
    // nothing it wants (then production is stored).
    for (const p of a.players.filter((p) => p.kind === 'ai')) {
      a.currentPlayer = p.id;
      runAiTurn(a, p.id);
      expect(a.cities.filter((c) => c.owner === p.id).every((c) => c.build !== null || chooseBuild(a, c) === null)).toBe(true);
    }
    // Every AI city ended up defended or is building its defender.
    for (const c of a.cities.filter((c) => c.owner !== 0)) {
      const military = (id: string) => id !== 'settler';
      const defended = a.units.some((u) => u.owner === c.owner && u.x === c.x && u.y === c.y && military(u.type));
      expect(defended || (c.build?.kind === 'unit' && military(c.build.id))).toBe(true);
    }
  });
});

describe('event messages respect fog', () => {
  it("shows the viewer's own events and only rival events on tiles they can see", () => {
    const s = makeState(['g'.repeat(20)]);
    addUnit(s, 'warrior', 0, 0, 0); // sees x 0..1
    s.log.push(
      { turn: 1, player: 0, text: 'mine' },
      { turn: 1, player: 1, text: 'near', x: 1, y: 0 },
      { turn: 1, player: 1, text: 'far', x: 15, y: 0 },
      { turn: 1, player: 1, text: 'nowhere' },
    );
    expect(eventsVisibleTo(s, 0, s.log).map((e) => e.text)).toEqual(['mine', 'near']);
  });

  it('a rival founding a city out of sight is logged with its location but not shown', () => {
    const s = makeState(['g'.repeat(20)], { exploreAll: false });
    addUnit(s, 'warrior', 0, 0, 0);
    s.currentPlayer = 1;
    const settler = addUnit(s, 'settler', 1, 15, 0);
    foundCity(s, settler.id);
    const entry = s.log.at(-1)!;
    expect([entry.x, entry.y]).toEqual([15, 0]);
    expect(eventsVisibleTo(s, 0, s.log)).toHaveLength(0);
  });
});

describe('tap rule', () => {
  it('with a unit selected, tapping a tile holding your own units moves there', () => {
    const s = makeState(['ggg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    addUnit(s, 'settler', 0, 1, 0);
    expect(resolveTap(s, 0, w.id, 1, 0)).toEqual({ kind: 'move', unitId: w.id });
  });

  it('with nothing selected, tapping your units selects, and tapping again cycles the stack', () => {
    const s = makeState(['ggg']);
    const a = addUnit(s, 'warrior', 0, 1, 0);
    const b = addUnit(s, 'settler', 0, 1, 0);
    expect(resolveTap(s, 0, undefined, 1, 0)).toEqual({ kind: 'select', unitId: a.id });
    expect(resolveTap(s, 0, a.id, 1, 0)).toEqual({ kind: 'select', unitId: b.id });
  });

  it('a unit with no moves left does not move; the tap selects instead', () => {
    const s = makeState(['ggg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    w.movesLeft = 0;
    const other = addUnit(s, 'warrior', 0, 1, 0);
    expect(resolveTap(s, 0, w.id, 1, 0)).toEqual({ kind: 'select', unitId: other.id });
  });

  it("tapping the selected unit's own city opens the city", () => {
    const s = makeState(['ggg']);
    const c = addCity(s, 0, 1, 0);
    const w = addUnit(s, 'warrior', 0, 1, 0);
    expect(resolveTap(s, 0, w.id, 1, 0)).toEqual({ kind: 'openCity', cityId: c.id });
    expect(resolveTap(s, 0, undefined, 1, 0)).toEqual({ kind: 'openCity', cityId: c.id });
  });

  it('a selected unit elsewhere moves into your city when it can get there', () => {
    const s = makeState(['ggg']);
    addCity(s, 0, 2, 0);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(resolveTap(s, 0, w.id, 2, 0)).toEqual({ kind: 'move', unitId: w.id });
  });

  it("opens your city instead when the selected unit can't reach it", () => {
    const s = makeState(['gog']);
    const c = addCity(s, 0, 2, 0);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(resolveTap(s, 0, w.id, 2, 0)).toEqual({ kind: 'openCity', cityId: c.id });
  });

  it('tapping empty ground with nothing selected inspects it', () => {
    const s = makeState(['ggg']);
    expect(resolveTap(s, 0, undefined, 2, 0)).toEqual({ kind: 'inspect' });
    expect(resolveTap(s, 0, undefined, 9, 9)).toEqual({ kind: 'none' });
  });
});

describe('new-game state', () => {
  it('players start with the default science rate and an empty treasury', () => {
    const s = createGame({ seed: 4 });
    for (const p of s.players) {
      expect(p.scienceRate).toBe(RULES.defaultScienceRate);
      expect([p.gold, p.science]).toEqual([RULES.startingGold, 0]);
    }
  });

  it('a founded city starts at size 1, working one tile, with nothing chosen', () => {
    const s = makeState(['ggg', 'ggg', 'ggg']);
    const res = foundCity(s, addUnit(s, 'settler', 0, 1, 1).id);
    const c = res.city!;
    expect([c.size, c.food, c.production, c.build]).toEqual([1, 0, 0, null]);
    expect(c.worked).toHaveLength(1);
    expect(tileIndex(s.map, c.x, c.y)).not.toBe(c.worked[0]);
  });

  it('endTurn processes the ending player’s cities only', () => {
    const s = makeState(['ggggggg', 'ggggggg', 'ggggggg']);
    const mine = addCity(s, 0, 1, 1);
    const theirs = addCity(s, 1, 5, 1);
    endTurn(s);
    expect(mine.food).toBeGreaterThan(0);
    expect(theirs.food).toBe(0);
  });
});
