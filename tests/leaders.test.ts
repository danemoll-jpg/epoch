// Round 11 (Milestone 8): Dan's 12 leaders. The roster, starting techs, every bonus and
// drawback (each checked against a legacy civ with no bonuses, in the same state), the unique
// actions and projects, the new buildings, choosing your civ, rivals, portraits,
// personalities, and the v9 → v10 migration.

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { CIVS, PLAYABLE_CIVS, findCiv, leaderInitials } from '../src/data/civs';
import { LEADER_BONUSES, UNIQUE_RULES } from '../src/data/leaders';
import { RULES, rushBuyCost } from '../src/data/rules';
import { TECHS, type TechId } from '../src/data/techs';
import { UNITS } from '../src/data/units';
import { BARBARIAN_CIV } from '../src/data/barbarians';
import { applyAction } from '../src/game/actions';
import { aiVictoryGoal, aiVictoryScores } from '../src/game/aiGoals';
import { attackStrength, defenseStrength } from '../src/game/combat';
import { captureCity } from '../src/game/conquest';
import { attitude, declareWar, makePeace, peaceDesire, techPrice, tradeableTechs, updateContacts, warScore } from '../src/game/diplomacy';
import { greatPersonThresholdFor, greatPersonThreshold } from '../src/game/greatPeople';
import { activeBonuses, capitalLost, effects, empirePct, leaderBonuses, willingnessToward } from '../src/game/leaders';
import { createGame, drawCivs } from '../src/game/newGame';
import { buildChoiceError, buildOptions, buyCost, buyError, itemCost, processCities } from '../src/game/production';
import { hashSeed } from '../src/game/rng';
import { deserializeGame, serializeGame } from '../src/game/save';
import { availableTechs, chooseAiResearch, learnTech, researchError, techCost } from '../src/game/tech';
import { STATE_VERSION, type City, type GameState } from '../src/game/types';
import { cityCulture, cityScienceGold, cityYields, empireCulture, empireIncome, tileYields } from '../src/game/yields';
import { raidCity } from '../src/game/barbarians';
import { tileIndex } from '../src/game/grid';
import { portraitCrop, SMALL_PORTRAIT } from '../src/ui/portraits';
import { addBarbarians, addCity, addUnit, makeState } from './helpers';
import portraitsDoc from '../docs/PORTRAITS.md?raw';
import portraitsPage from '../docs/portraits.html?raw';

// The bundled portraits, read through Vite as the game bundles them (as data: URLs here).
const PORTRAIT_FILES = import.meta.glob<string>('../src/assets/portraits/*.{png,webp}', { query: '?inline', import: 'default', eager: true });
const bytesOf = (dataUrl: string): Uint8Array => Uint8Array.from(atob(dataUrl.split(',')[1]!), (c) => c.charCodeAt(0));

const ERA: Record<'ancient' | 'medieval' | 'industrial' | 'modern', TechId[]> = {
  ancient: [],
  medieval: ['monarchy'],
  industrial: ['gunpowder'],
  modern: ['electronics'],
};

const ROWS = ['ggggggggg', 'ggggggggg', 'ggggggggg', 'ggggggggg', 'ggggggggg', 'ggggggggg'];

/** Player 0 plays `civ` knowing `techs`, with a size-4 capital; player 1 (Maurya, legacy) has a city far off. */
function world(civ: string, techs: TechId[] = [], opts: { peace?: boolean; rows?: string[]; city?: Partial<City> } = {}): { s: GameState; city: City } {
  const s = makeState(opts.rows ?? ROWS, { players: 2, peace: opts.peace ?? true });
  s.players[0]!.civId = civ;
  s.players[0]!.techs = [...techs];
  const city = addCity(s, 0, 2, 2, { name: 'Cap', capitalOf: 0, size: 4, ...opts.city });
  addCity(s, 1, s.map.width - 2, s.map.height - 2, { name: 'Far', capitalOf: 1, size: 2 });
  return { s, city };
}

/** The same measurement for the leader and for Babylon (a legacy civ: no bonuses). */
function vs<T>(civ: string, techs: TechId[], measure: (w: { s: GameState; city: City }) => T, opts: Parameters<typeof world>[2] = {}): [T, T] {
  return [measure(world(civ, techs, opts)), measure(world('babylon', techs, opts))];
}

const cost = (w: { s: GameState; city: City }, item: Parameters<typeof itemCost>[2]) => itemCost(w.s, w.city, item);
const gold = (w: { s: GameState }) => empireIncome(w.s, 0).gold;
const science = (w: { s: GameState }) => empireIncome(w.s, 0).science;
const culture = (w: { s: GameState }) => empireCulture(w.s, 0);

describe('the roster (A1)', () => {
  it("has Dan's 12, with unique ids and colors, grammar, names, a lean, and a starting tech", () => {
    expect(PLAYABLE_CIVS.map((c) => c.leader)).toEqual([
      'Hatshepsut', 'Caligula', 'Charlemagne', 'Mansa Musa', 'Henry VIII', 'Louis XIV',
      'Peter the Great', 'Simón Bolívar', 'John F. Kennedy', 'Viktor Yushchenko', 'Angela Merkel', 'Kim Jong Un',
    ]);
    const ids = CIVS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const colors = [...CIVS.map((c) => c.color.toLowerCase()), BARBARIAN_CIV.color.toLowerCase()];
    expect(new Set(colors).size).toBe(colors.length);
    for (const c of PLAYABLE_CIVS) {
      expect(c.cityNames.length, c.id).toBeGreaterThanOrEqual(12);
      expect(new Set(c.cityNames).size, c.id).toBe(c.cityNames.length);
      expect(c.adjective.length, c.id).toBeGreaterThan(0);
      expect(c.lean, c.id).toBeDefined();
      expect(c.lean!.primary).not.toBe(c.lean!.secondary);
      expect(TECHS[c.startTech!], c.id).toBeDefined();
      expect(c.aggression).toBeGreaterThanOrEqual(1);
      expect(c.aggression).toBeLessThanOrEqual(5);
      expect(c.tradeWillingness).toBeGreaterThanOrEqual(1);
      expect(c.tradeWillingness).toBeLessThanOrEqual(5);
      expect(LEADER_BONUSES[c.id], c.id).toBeDefined();
    }
    // No city name is used by two civs.
    const all = PLAYABLE_CIVS.flatMap((c) => c.cityNames);
    expect(new Set(all).size).toBe(all.length);
  });

  it("matches Dan's table: starting techs and leans", () => {
    const table: Record<string, [string, string, TechId]> = {
      egypt: ['economic', 'culture', 'masonry'], rome: ['domination', 'culture', 'bronze_working'],
      franks: ['domination', 'culture', 'horseback_riding'], mali: ['economic', 'culture', 'currency'],
      england: ['culture', 'economic', 'ceremonial_burial'], france: ['culture', 'economic', 'mysticism'],
      russia: ['technology', 'domination', 'map_making'], gran_colombia: ['culture', 'domination', 'code_of_laws'],
      usa: ['technology', 'culture', 'writing'], ukraine: ['technology', 'culture', 'pottery'],
      germany: ['economic', 'technology', 'the_wheel'], north_korea: ['domination', 'technology', 'archery'],
    };
    for (const c of PLAYABLE_CIVS) expect([c.lean!.primary, c.lean!.secondary, c.startTech], c.id).toEqual(table[c.id]);
  });

  it('reads right in messages: "the Franks", "the United States"', async () => {
    const { civName, CivName, civVerb } = await import('../src/game/conquest');
    const s = makeState(['gg'], { players: 2 });
    s.players[0]!.civId = 'usa';
    s.players[1]!.civId = 'franks';
    expect(CivName(s, 0)).toBe('The United States');
    expect(civVerb(s, 0, 'has', 'have')).toBe('has');
    expect(civName(s, 1)).toBe('the Franks');
    expect(civVerb(s, 1, 'has', 'have')).toBe('have');
  });

  it('keeps the legacy civs for old saves only: no bonuses, never drawn', () => {
    for (const id of ['babylon', 'maurya', 'inca']) {
      expect(findCiv(id)?.legacy).toBe(true);
      expect(leaderBonuses(id)).toBeUndefined();
    }
    for (let seed = 1; seed <= 25; seed++) {
      const g = createGame({ seed, playerCount: 5 });
      for (const p of g.players) if (p.kind !== 'barbarian') expect(findCiv(p.civId)?.legacy, `seed ${seed}`).toBeFalsy();
    }
  });
});

describe('the starting tech rule (A1, Q22)', () => {
  it('is known on turn 1 without its prerequisites, which stay researchable', () => {
    const g = createGame({ seed: 4, playerCount: 5, civ: 'russia' });
    const p = g.players[0]!;
    expect(p.techs).toEqual(['map_making']);
    expect(researchError(p, 'alphabet')).toBeUndefined();
    // Everything else still needs its prerequisites.
    expect(researchError(p, 'seafaring')).toBe('Needs Pottery');
    expect(availableTechs(p)).not.toContain('writing');
    // The AI picks a legal tech.
    const pick = chooseAiResearch(p)!;
    expect(researchError(p, pick)).toBeUndefined();
  });

  it('can be traded only to a civ that knows its prerequisites', () => {
    const { s } = world('russia', ['map_making']);
    expect(tradeableTechs(s, 0, 1)).toEqual([]);
    s.players[1]!.techs = ['alphabet'];
    expect(tradeableTechs(s, 0, 1)).toEqual(['map_making']);
    // ...and the other way, Russia can still be taught Alphabet.
    expect(tradeableTechs(s, 1, 0)).toEqual(['alphabet']);
  });
});

describe('leader bonuses are applied through one place (A2)', () => {
  it("every civ's active bonuses follow its era: start and Ancient at once, later eras when reached, drawback always", () => {
    for (const c of PLAYABLE_CIVS) {
      const b = LEADER_BONUSES[c.id]!;
      const s = makeState(['g']);
      const p = s.players[0]!;
      p.civId = c.id;
      const names = () => activeBonuses(p).map((x) => x.name);
      expect(names()).toEqual([b.start.name, b.eras.ancient.name, ...(b.drawback ? [b.drawback.name] : [])]);
      p.techs = ['electronics'];
      expect(names()).toEqual([b.start.name, b.eras.ancient.name, b.eras.medieval.name, b.eras.industrial.name, b.eras.modern.name, ...(b.drawback ? [b.drawback.name] : [])]);
      expect(effects(p).length).toBeGreaterThan(0);
    }
  });

  it('entering an era turns its bonus on with a toast (log entry)', () => {
    const { s } = world('rome', ['alphabet', 'ceremonial_burial', 'code_of_laws']);
    learnTech(s, 0, 'monarchy', 'Learned Monarchy');
    expect(s.log.some((e) => e.kind === 'leader' && e.text === `Medieval bonus: Legions. ${LEADER_BONUSES.rome!.eras.medieval.text}`)).toBe(true);
  });
});

describe('Hatshepsut (Egypt)', () => {
  it('start: wonders cost 15% less', () => {
    expect(vs('egypt', [], (w) => cost(w, { kind: 'wonder', id: 'pyramids' }))).toEqual([77, 90]);
  });
  it('ancient: meeting a civ brings 30 gold; +1 gold a turn per met civ (max 5)', () => {
    const s = makeState(ROWS, { players: 2, met: false });
    s.players[0]!.civId = 'egypt';
    addUnit(s, 'warrior', 0, 2, 2);
    addUnit(s, 'warrior', 1, 3, 2);
    updateContacts(s);
    expect(s.players[0]!.gold).toBe(30);
    expect(s.players[1]!.gold).toBe(0);
    const [e, b] = vs('egypt', [], gold);
    expect(e - b).toBe(1);
  });
  it('medieval: each wonder in her cities makes +3 culture and +2 gold there', () => {
    const [e, b] = vs('egypt', ERA.medieval, (w) => [cityCulture(w.s, w.city), cityScienceGold(w.s, w.city).gold], { city: { wonders: ['oracle'] } });
    expect(e[0]! - b[0]!).toBe(3);
    expect(e[1]! - b[1]!).toBe(2);
  });
  it('industrial: Harbors and Marketplaces cost half', () => {
    expect(vs('egypt', ERA.industrial, (w) => cost(w, { kind: 'building', id: 'marketplace' }))).toEqual([30, 60]);
    expect(vs('egypt', ERA.industrial, (w) => cost(w, { kind: 'building', id: 'library' }))).toEqual([60, 60]);
  });
  it('modern: +25% gold; drawback: land units cost 10% more (not Settlers or ships)', () => {
    const [e, b] = vs('egypt', ERA.modern, gold);
    expect(e).toBe(b + Math.floor(b * 0.25) + 1); // +1: one civ met
    expect(vs('egypt', [], (w) => cost(w, { kind: 'unit', id: 'spearman' }))).toEqual([22, 20]);
    expect(vs('egypt', [], (w) => cost(w, { kind: 'unit', id: 'settler' }))).toEqual([30, 30]);
    expect(vs('egypt', [], (w) => cost(w, { kind: 'unit', id: 'galley' }))).toEqual([30, 30]);
  });
});

describe('Caligula (Rome)', () => {
  it('start: rush-buying costs 25% less', () => {
    const [r, b] = vs('rome', ['writing'], (w) => {
      w.city.build = { kind: 'building', id: 'library' };
      return buyCost(w.s, w.city)!;
    });
    expect(b).toBe(rushBuyCost(60));
    expect(r).toBe(Math.ceil(b * 0.75));
  });
  it('ancient: every fight won brings 3 culture', () => {
    const [r, b] = vs('rome', [], (w) => {
      w.s.atWar = [[false, true], [true, false]];
      addUnit(w.s, 'legion', 0, 5, 4, { army: true });
      addUnit(w.s, 'warrior', 1, 6, 4);
      w.s.rngState = 7;
      const res = applyAction(w.s, { type: 'attack', unitId: w.s.units.find((u) => u.army)!.id, at: { x: 6, y: 4 } });
      return res.combat?.attackerWon ? w.s.players[0]!.culture : -1;
    });
    expect([r, b]).toEqual([3, 0]);
  });
  // Round 15 (B2): Ancient Triumphs also takes 15% off military units; Legions 20% more, and
  // armies fight at +25% from the Medieval era (+25% more in the Modern).
  it('ancient: military units cost 15% less; medieval: 20% more off, and armies +25%', () => {
    expect(vs('rome', [], (w) => cost(w, { kind: 'unit', id: 'legion' }))).toEqual([26, 30]);
    expect(vs('rome', ERA.medieval, (w) => cost(w, { kind: 'unit', id: 'legion' }))).toEqual([20, 30]);
    const [r, b] = vs('rome', ERA.medieval, (w) => attackStrength(addUnit(w.s, 'legion', 0, 5, 4, { army: true }), w.s).total);
    expect(r).toBeCloseTo(b * 1.25);
  });
  it('industrial: only he can rush-buy wonders, at twice the price (less his discount)', () => {
    const [r, b] = vs('rome', [...ERA.industrial, 'masonry'], (w) => {
      w.city.build = { kind: 'wonder', id: 'pyramids' };
      return [buyError(w.s, w.city), buyCost(w.s, w.city)];
    });
    expect(b).toEqual(["Wonders can't be bought", undefined]);
    expect(r[1]).toBe(Math.ceil(rushBuyCost(90) * 2 * 0.75));
    // Not before the Industrial era.
    expect(vs('rome', ['masonry'], (w) => ((w.city.build = { kind: 'wonder', id: 'pyramids' }), buyError(w.s, w.city)))[0]).toBe("Wonders can't be bought");
  });
  it('modern: armies and fleets fight at +25% more (+50% with Legions)', () => {
    const [r, b] = vs('rome', ERA.modern, (w) => {
      const a = addUnit(w.s, 'legion', 0, 5, 4, { army: true });
      return [attackStrength(a, w.s).total, defenseStrength(w.s, a).total];
    });
    expect(r[0]).toBeCloseTo(b[0]! * 1.5);
    expect(r[1]).toBeCloseTo(b[1]! * 1.5);
  });
  it('drawback: 5% less gold', () => {
    const [r, b] = vs('rome', [], gold);
    expect(r).toBe(b + Math.floor(-b * 0.05));
  });
});

describe('Charlemagne (the Franks)', () => {
  it('start: captured cities lose no population and keep every building (Walls too)', () => {
    const [f, b] = vs('franks', [], (w) => {
      const c = addCity(w.s, 1, 5, 2, { size: 4, buildings: ['walls', 'temple'] });
      captureCity(w.s, c, 0);
      return [c.size, c.buildings.length];
    });
    expect(f).toEqual([4, 2]);
    expect(b).toEqual([3, 1]);
  });
  it('ancient: mounted units start as veterans', () => {
    const [f, b] = vs('franks', ['horseback_riding'], (w) => {
      w.city.build = { kind: 'unit', id: 'horseman' };
      w.city.production = 100;
      processCities(w.s, 0);
      return w.s.units.find((u) => u.type === 'horseman')!.veteran;
    });
    expect([f, b]).toEqual([true, false]);
  });
  it('medieval: captured cities make +2 culture; industrial: 8+ cities give +1 production each', () => {
    const [f, b] = vs('franks', ERA.medieval, (w) => cityCulture(w.s, addCity(w.s, 0, 5, 2, { founder: 1 })));
    expect(f - b).toBe(2);
    const [fi, bi] = vs('franks', ERA.industrial, (w) => {
      for (let i = 0; i < 7; i++) addCity(w.s, 0, i + 1, 5, { size: 1 });
      return cityYields(w.s, w.city).production;
    });
    expect(fi - bi).toBe(1);
  });
  it('modern: every fight won brings 2 culture', () => {
    const { s } = world('franks', ERA.modern, { peace: false });
    s.rngState = 7;
    addUnit(s, 'tank', 0, 5, 4, { army: true });
    addUnit(s, 'warrior', 1, 6, 4);
    const res = applyAction(s, { type: 'attack', unitId: s.units.find((u) => u.army)!.id, at: { x: 6, y: 4 } });
    expect(res.combat?.attackerWon).toBe(true);
    expect(s.players[0]!.culture).toBe(2);
  });
});

describe('Mansa Musa (Mali)', () => {
  it('start: +1 gold on every worked tile with a resource', () => {
    const [m, b] = vs('mali', [], (w) => {
      w.s.map.tiles[tileIndex(w.s.map, 2, 2)]!.resource = 'cattle';
      return cityScienceGold(w.s, w.city).gold;
    });
    expect(m - b).toBe(1);
  });
  it('ancient: desert +1 trade, and Oasis and Gold count double', () => {
    const rows = ['ddd', 'ddd', 'ddd'];
    const s = makeState(rows, { players: 1 });
    s.players[0]!.civId = 'mali';
    const k = tileIndex(s.map, 1, 1);
    s.map.tiles[k]!.resource = 'oasis';
    const mali = tileYields(s, k, 0);
    s.players[0]!.civId = 'babylon';
    const plain = tileYields(s, k, 0);
    expect(mali.trade - plain.trade).toBe(1);
    expect(mali.food - plain.food).toBe(3);
  });
  it('medieval: culture buildings a third cheaper to rush-buy; the Pilgrimage once per game', () => {
    const [m, b] = vs('mali', [...ERA.medieval, 'ceremonial_burial'], (w) => {
      w.city.build = { kind: 'building', id: 'temple' };
      return buyCost(w.s, w.city)!;
    });
    expect(m).toBe(Math.ceil((b * 67) / 100));
    const { s } = world('mali', ERA.medieval);
    s.players[0]!.gold = 150;
    expect(applyAction(s, { type: 'pilgrimage' }).ok).toBe(false);
    s.players[0]!.gold = 300;
    expect(applyAction(s, { type: 'pilgrimage' }).ok).toBe(true);
    expect(s.players[0]!.culture).toBe(Math.floor(300 * UNIQUE_RULES.pilgrimage.culturePerGold));
    expect(s.diplomacy.opinion[1]![0]).toBe(UNIQUE_RULES.pilgrimage.opinion);
    expect(applyAction(s, { type: 'pilgrimage' }).ok).toBe(false);
    const early = world('mali', []);
    early.s.players[0]!.gold = 500;
    expect(applyAction(early.s, { type: 'pilgrimage' }).ok).toBe(false);
  });
  it('industrial: the capital +50% gold; modern: +25% gold everywhere', () => {
    const [m, b] = vs('mali', ERA.industrial, (w) => cityScienceGold(w.s, w.city).gold);
    expect(m).toBeGreaterThan(b);
    const [mm, bm] = vs('mali', ERA.modern, gold);
    expect(mm).toBeGreaterThan(bm);
  });
});

describe('Henry VIII (England)', () => {
  it('start: Great People 20% sooner; ancient: Temples and Cathedrals +1 culture', () => {
    const [e, b] = vs('england', [], (w) => greatPersonThresholdFor(w.s, 0, 2));
    expect(b).toBe(greatPersonThreshold(2));
    expect(e).toBe(Math.round(b * 0.8));
    const [ec, bc] = vs('england', [], culture, { city: { buildings: ['temple', 'cathedral'] } });
    expect(ec - bc).toBe(2);
  });
  it('medieval: the Dissolution: 40 gold per church, their culture halved for 20 turns, once', () => {
    const { s } = world('england', ERA.medieval, { city: { buildings: ['temple', 'cathedral'] } });
    expect(culture({ s })).toBe(6);
    expect(applyAction(s, { type: 'dissolution' }).ok).toBe(true);
    expect(s.players[0]!.gold).toBe(80);
    expect(culture({ s })).toBe(3);
    s.turn += UNIQUE_RULES.dissolution.turns;
    expect(culture({ s })).toBe(6);
    expect(applyAction(s, { type: 'dissolution' }).ok).toBe(false);
  });
  it('industrial: gold gifts count double, and peace comes easier', () => {
    const [e, b] = vs('england', ERA.industrial, (w) => {
      w.s.players[0]!.gold = 50;
      applyAction(w.s, { type: 'giveGold', target: 1, amount: 50 });
      return w.s.diplomacy.opinion[1]![0]!;
    });
    expect(e).toBe(b * 2);
    const [pe, pb] = vs('england', ERA.industrial, (w) => ((w.s.atWar = [[false, true], [true, false]]), peaceDesire(w.s, 1, 0).value), { peace: false });
    expect(pe - pb).toBeCloseTo(1.5);
  });
  it('modern: +25% culture; drawback: breaking a treaty cools everyone', () => {
    const [e, b] = vs('england', ERA.modern, culture, { city: { buildings: ['temple', 'cathedral', 'colosseum'] } });
    expect(e).toBe((b + 2) + Math.floor(((b + 2) * 25) / 100));
    const [he, hb] = vs('england', [], (w) => {
      w.s.diplomacy.peaceTurn = [[null, 1], [1, null]];
      w.s.turn = 40;
      declareWar(w.s, 0, 1);
      return w.s.diplomacy.opinion[1]![0]!;
    });
    expect(he - hb).toBe(-2);
  });
});

describe('Louis XIV (France)', () => {
  it('start: wonders +25% culture; ancient: luxuries worked give +1 culture', () => {
    const [f, b] = vs('france', [], (w) => cityCulture(w.s, w.city), { city: { wonders: ['oracle'] } });
    expect(f).toBe(b + Math.floor(b / 4));
    const [fl, bl] = vs('france', [], (w) => {
      w.s.map.tiles[tileIndex(w.s.map, 2, 2)]!.resource = 'gems';
      return cityCulture(w.s, w.city);
    });
    expect(fl - bl).toBe(1);
  });
  it('medieval: the capital +1 culture and +1 gold per wonder in it', () => {
    const [f, b] = vs('france', ERA.medieval, (w) => cityScienceGold(w.s, w.city).gold, { city: { wonders: ['oracle', 'colossus'] } });
    expect(f - b).toBe(2);
  });
  it('industrial: Versailles, France only, capital only, once', () => {
    const { s, city } = world('france', [...ERA.industrial, 'economics']);
    const v = { kind: 'wonder', id: 'versailles' } as const;
    expect(buildChoiceError(s, city, v)).toBeUndefined();
    const other = addCity(s, 0, 5, 2);
    expect(buildChoiceError(s, other, v)).toBe('Capital only');
    const rome = world('rome', [...ERA.industrial, 'economics']);
    expect(buildChoiceError(rome.s, rome.city, v)).toBe('Only France can build it');
    city.build = v;
    city.production = 999;
    processCities(s, 0);
    expect(city.wonders).toContain('versailles');
    expect(s.players[0]!.uniquesUsed).toContain('versailles');
    expect(buildOptions(s, city).some((i) => i.id === 'versailles')).toBe(false);
  });
  it('modern: +25% culture; drawback: culture halved while a rival holds his capital', () => {
    const { s, city } = world('france', [], { city: { buildings: ['temple', 'cathedral', 'colosseum'] } });
    addCity(s, 0, 5, 2, { buildings: ['temple', 'cathedral'] });
    const before = culture({ s });
    captureCity(s, city, 1);
    expect(capitalLost(s, 0)).toBe(true);
    expect(culture({ s })).toBe(Math.floor(4 / 2));
    expect(before).toBe(10);
  });
});

describe('Peter the Great (Russia)', () => {
  it('start: techs a met civ knows cost 35% less', () => {
    const [r, b] = vs('russia', ['map_making'], (w) => ((w.s.players[1]!.techs = ['alphabet']), techCost(w.s, 0, 'alphabet')));
    expect(r).toBe(Math.round(b * 0.65));
  });
  it('ancient: ships in coastal cities +25% production; medieval: first ship of each type half price', () => {
    const rows = ['ccccccccc', 'cgggggggc', 'cgggggggc', 'cgggggggc', 'cgggggggc', 'ccccccccc'];
    const [r, b] = vs('russia', ['map_making'], (w) => ((w.city.build = { kind: 'unit', id: 'galley' }), cityYields(w.s, w.city).production), { rows, city: { size: 1 } });
    expect(r).toBe(b + Math.floor(b / 4));
    const { s, city } = world('russia', [...ERA.medieval, 'map_making'], { rows, city: { size: 1 } });
    expect(itemCost(s, city, { kind: 'unit', id: 'galley' })).toBe(15);
    s.players[0]!.shipsBuilt.push('galley');
    expect(itemCost(s, city, { kind: 'unit', id: 'galley' })).toBe(30);
  });
  it('industrial: +4 science per met civ; modern: +25% science while behind', () => {
    const [r, b] = vs('russia', ERA.industrial, science);
    expect(r - b).toBe(4);
    const [rm, bm] = vs('russia', ERA.modern, (w) => ((w.s.players[1]!.techs = ['alphabet', 'writing', 'bronze_working']), science(w)));
    expect(rm).toBeGreaterThan(bm + 2);
  });
});

describe('Simón Bolívar (Gran Colombia)', () => {
  it('start: liberating a city someone else founded: 100 culture, 50 gold, it keeps its size', () => {
    const [g, b] = vs('gran_colombia', [], (w) => {
      const c = addCity(w.s, 1, 5, 2, { size: 4, founder: 0 });
      captureCity(w.s, c, 0);
      return [c.size, w.s.players[0]!.culture, w.s.players[0]!.gold];
    });
    expect(g).toEqual([4, 100, 50]);
    expect(b).toEqual([3, 0, 0]);
    // A city its owner founded isn't a liberation.
    const { s } = world('gran_colombia');
    const own = addCity(s, 1, 5, 2, { size: 4 });
    captureCity(s, own, 0);
    expect([own.size, s.players[0]!.culture]).toEqual([3, 0]);
  });
  it('ancient: +25% attack against civs with more cities', () => {
    const [g, b] = vs('gran_colombia', [], (w) => {
      addCity(w.s, 1, 7, 1);
      return attackStrength(addUnit(w.s, 'legion', 0, 5, 4), w.s, false, 1).total;
    });
    expect(g).toBeCloseTo(b * 1.25);
  });
  it('medieval: return a liberated city: 150 culture, peace, a friend (only that turn)', () => {
    const s = makeState(ROWS, { players: 3, peace: true });
    s.players[0]!.civId = 'gran_colombia';
    s.players[0]!.techs = [...ERA.medieval];
    addCity(s, 0, 1, 1, { capitalOf: 0 });
    addCity(s, 2, 7, 5, { capitalOf: 2 });
    s.atWar = [[false, true, false], [true, false, false], [false, false, false]];
    const c = addCity(s, 1, 4, 3, { founder: 2 });
    captureCity(s, c, 0);
    expect(applyAction(s, { type: 'returnCity', cityId: c.id }).ok).toBe(true);
    expect(c.owner).toBe(2);
    expect(attitude(s, 2, 0)).toBe('friendly');
    const c2 = addCity(s, 1, 7, 1, { founder: 2 });
    captureCity(s, c2, 0);
    s.turn++;
    expect(applyAction(s, { type: 'returnCity', cityId: c2.id })).toEqual({ ok: false, reason: 'Only on the turn you take it' });
  });
  it('industrial: captured cities +2 culture; modern: +25% culture; drawback: −5% gold per captured city beyond 3', () => {
    const [g, b] = vs('gran_colombia', ERA.industrial, (w) => cityCulture(w.s, addCity(w.s, 0, 5, 2, { founder: 1 })));
    expect(g - b).toBe(2);
    const [gm, bm] = vs('gran_colombia', ERA.modern, culture, { city: { buildings: ['temple', 'cathedral'] } });
    expect(gm).toBe(bm + 1);
    const [gp, bp] = vs('gran_colombia', [], (w) => {
      for (let i = 0; i < 5; i++) addCity(w.s, 0, i + 1, 5, { founder: 1 });
      return gold(w);
    });
    expect(gp).toBe(bp + Math.floor((-bp * 10) / 100));
  });
});

describe('John F. Kennedy (the United States)', () => {
  it('start: +10% science; ancient: Libraries and Universities 25% cheaper', () => {
    const [u, b] = vs('usa', [], science, { city: { size: 6 } });
    expect(u).toBe(b + Math.floor(b / 10));
    expect(vs('usa', [], (w) => cost(w, { kind: 'building', id: 'library' }))).toEqual([45, 60]);
  });
  it('medieval: first into an era brings 50 culture (not when someone got there first)', () => {
    const { s } = world('usa', ['alphabet', 'ceremonial_burial', 'code_of_laws', 'writing', 'literacy', 'monarchy']);
    learnTech(s, 0, 'banking', 'x');
    expect(s.players[0]!.culture).toBe(0); // still Medieval
    s.players[0]!.techs.push('university', 'astronomy', 'mysticism', 'mathematics', 'masonry', 'philosophy');
    learnTech(s, 0, 'physics', 'x');
    expect(s.players[0]!.culture).toBe(50);
    const late = world('usa', ['monarchy']);
    late.s.players[1]!.techs = ['gunpowder'];
    learnTech(late.s, 0, 'physics', 'x');
    expect(late.s.players[0]!.culture).toBe(0);
  });
  it('industrial: the National Challenge: +50% science toward one tech, a new one only once learned', () => {
    const { s } = world('usa', ERA.industrial, { city: { size: 6 } });
    s.players[0]!.researching = 'physics';
    const before = science({ s });
    expect(applyAction(s, { type: 'setChallenge', tech: 'physics' }).ok).toBe(true);
    expect(science({ s })).toBeGreaterThan(before);
    expect(applyAction(s, { type: 'setChallenge', tech: 'economics' }).ok).toBe(false);
    learnTech(s, 0, 'physics', 'x');
    expect(s.players[0]!.challenge).toBeNull();
    expect(applyAction(s, { type: 'setChallenge', tech: 'economics' }).ok).toBe(true);
    const nope = world('usa', ERA.medieval);
    expect(applyAction(nope.s, { type: 'setChallenge', tech: 'physics' }).ok).toBe(false);
  });
  it('modern: the Moonshot (200 culture, +25% science), and spaceship parts at 25% less that cost 100 gold', () => {
    const { s, city } = world('usa', [...ERA.modern, 'rocketry'], { city: { size: 6 } });
    const m = { kind: 'project', id: 'moonshot' } as const;
    expect(buildChoiceError(s, city, m)).toBeUndefined();
    const before = science({ s });
    city.build = m;
    city.production = 999;
    processCities(s, 0);
    expect(s.players[0]!.uniquesUsed).toContain('moonshot');
    expect(s.players[0]!.culture).toBeGreaterThanOrEqual(UNIQUE_RULES.moonshot.culture);
    expect(science({ s })).toBeGreaterThan(before);
    expect(buildChoiceError(s, city, m)).toBe('Already built');
    const rome = world('rome', [...ERA.modern, 'rocketry']);
    expect(buildChoiceError(rome.s, rome.city, m)).toBe('Only United States can build it');
    expect(vs('usa', ERA.modern, (w) => cost(w, { kind: 'project', id: 'spaceship' }))).toEqual([135, 180]);
  });
});

describe('Viktor Yushchenko (Ukraine)', () => {
  it('start: Plains +1 food', () => {
    const s = makeState(['ppp'], { players: 1 });
    s.players[0]!.civId = 'ukraine';
    const u = tileYields(s, 1, 0).food;
    s.players[0]!.civId = 'babylon';
    expect(u - tileYields(s, 1, 0).food).toBe(1);
  });
  it('ancient: a traded tech brings 20 science, and AIs trade more willingly', () => {
    const { s } = world('ukraine', ['alphabet']);
    s.players[1]!.techs = ['alphabet', 'writing'];
    s.players[0]!.gold = 1000;
    const res = applyAction(s, { type: 'tradeTech', partner: 1, get: 'writing', give: null });
    expect(res.answer?.accepted).toBe(true);
    expect(s.players[0]!.science).toBe(20);
    expect(willingnessToward(s, 3, 0)).toBe(4);
    const [u, b] = vs('ukraine', ['alphabet'], (w) => ((w.s.players[1]!.techs = ['writing', 'alphabet']), techPrice(w.s, 1, 0, 'writing')));
    expect(u).toBeLessThan(b);
  });
  it('medieval: +2 science per met civ ahead; industrial: +4% per civ at peace; modern: resilience', () => {
    const [u, b] = vs('ukraine', ERA.medieval, (w) => ((w.s.players[1]!.techs = ['alphabet', 'pottery', 'archery']), science(w)));
    expect(u - b).toBe(2);
    expect(vs('ukraine', ERA.industrial, (w) => empirePct(w.s, 0, 'science'))).toEqual([4, 0]);
    const { s } = world('ukraine', ERA.modern, { peace: false });
    makePeace(s, 0, 1);
    expect(s.players[0]!.culture).toBe(50);
    captureCity(s, s.cities.find((c) => c.owner === 0)!, 1);
    expect(s.players[0]!.culture).toBe(100);
  });
});

describe('Angela Merkel (Germany)', () => {
  it('start: buildings 10% cheaper; ancient: her cities defend at +25%', () => {
    expect(vs('germany', [], (w) => cost(w, { kind: 'building', id: 'granary' }))).toEqual([36, 40]);
    const [g, b] = vs('germany', [], (w) => defenseStrength(w.s, addUnit(w.s, 'spearman', 0, 2, 2)).total);
    expect(g).toBeCloseTo((b / 1.25) * 1.5);
  });
  it('medieval: raids steal half as much, and cities never starve smaller', () => {
    const [g, b] = vs('germany', ERA.medieval, (w) => {
      addBarbarians(w.s);
      w.s.players[0]!.gold = 200;
      const raider = addUnit(w.s, 'warrior', 2, 3, 2);
      return raidCity(w.s, raider, w.city).gold;
    });
    expect(g).toBe(Math.floor(b / 2));
    expect(b).toBeGreaterThan(0);
    const starving = ['ddddddddd', 'ddddddddd', 'ddddddddd', 'ddddddddd', 'ddddddddd', 'ddddddddd'];
    const [gs, bs] = vs('germany', ERA.medieval, (w) => {
      w.city.food = 0;
      processCities(w.s, 0);
      return w.city.size;
    }, { rows: starving, city: { size: 4 } });
    expect([gs, bs]).toEqual([4, 3]);
  });
  it('industrial: Factories +2 gold and +10% production; modern: +25% science with a Factory', () => {
    const [g, b] = vs('germany', ERA.industrial, (w) => cityScienceGold(w.s, w.city).gold, { city: { buildings: ['factory'] } });
    expect(g - b).toBe(2);
    const [gp, bp] = vs('germany', ERA.industrial, (w) => cityYields(w.s, w.city).production, { city: { size: 8 } });
    expect(gp).toBeGreaterThanOrEqual(bp);
    const [gm, bm] = vs('germany', ERA.modern, (w) => cityScienceGold(w.s, w.city).science, { city: { size: 8, buildings: ['factory'] } });
    expect(gm).toBeGreaterThan(bm);
  });
});

describe('Kim Jong Un (North Korea)', () => {
  it('start: techs that unlock fighting units cost 25% less', () => {
    const [k, b] = vs('north_korea', [], (w) => [techCost(w.s, 0, 'bronze_working'), techCost(w.s, 0, 'pottery')]);
    expect(k[0]).toBe(Math.round(b[0]! * 0.75));
    expect(k[1]).toBe(b[1]);
  });
  it('ancient: city defenders +25%; medieval: military units 15% cheaper; industrial: siege and bombers +25%', () => {
    const [k, b] = vs('north_korea', [], (w) => defenseStrength(w.s, addUnit(w.s, 'spearman', 0, 2, 2)).total);
    expect(k).toBeCloseTo((b / 1.25) * 1.5);
    expect(vs('north_korea', ERA.medieval, (w) => cost(w, { kind: 'unit', id: 'catapult' }))).toEqual([34, 40]);
    const [ks, bs] = vs('north_korea', ERA.industrial, (w) => [attackStrength(addUnit(w.s, 'cannon', 0, 5, 4), w.s).total, attackStrength(addUnit(w.s, 'legion', 0, 5, 4), w.s).total]);
    expect(ks[0]).toBeCloseTo(bs[0]! * 1.25);
    expect(ks[1]).toBeCloseTo(bs[1]!);
  });
  it('modern: Deterrence lowers AI war scores against him', () => {
    const [k, b] = vs('north_korea', ERA.modern, (w) => {
      w.s.players[1]!.civId = 'rome';
      w.s.players[1]!.techs = ['bronze_working', 'iron_working'];
      w.s.turn = 40;
      for (let i = 0; i < 3; i++) addUnit(w.s, 'legion', 1, 7, 4, { army: true });
      addUnit(w.s, 'warrior', 0, 2, 2);
      return warScore(w.s, 1, 0);
    });
    expect(b - k).toBeCloseTo(10);
  });
  it('drawback: −10% science and gold; AIs half as willing to trade with him', () => {
    const [ks, bs] = vs('north_korea', [], science, { city: { size: 8 } });
    expect(ks).toBe(bs + Math.floor((-bs * 10) / 100));
    const [kg, bg] = vs('north_korea', [], gold, { city: { size: 8 } });
    expect(kg).toBe(bg + Math.floor((-bg * 10) / 100));
    const { s } = world('north_korea');
    expect(willingnessToward(s, 4, 0)).toBe(2);
  });
});

describe('new buildings (B1)', () => {
  it('each needs its tech, and the chained ones need the building before', () => {
    const chain: [string, string][] = [['university', 'library'], ['bank', 'marketplace'], ['power_plant', 'factory'], ['research_lab', 'university'], ['stock_exchange', 'bank']];
    for (const [b, needs] of chain) {
      const def = BUILDINGS[b as keyof typeof BUILDINGS];
      const { s, city } = world('babylon', [def.requires!]);
      expect(buildChoiceError(s, city, { kind: 'building', id: def.id })).toBe(`Needs a ${BUILDINGS[needs as keyof typeof BUILDINGS].name}`);
      city.buildings.push(needs as never);
      expect(buildChoiceError(s, city, { kind: 'building', id: def.id })).toBeUndefined();
    }
    const { s, city } = world('babylon');
    for (const b of ['courthouse', 'cathedral', 'colosseum', 'factory'] as const) expect(buildChoiceError(s, city, { kind: 'building', id: b })).toBe(`Needs ${TECHS[BUILDINGS[b].requires!].name}`);
  });
  it('do what they say: Courthouse gold (and food when captured), culture, science, gold, production', () => {
    const measure = (b: string[]) => {
      const { s, city } = world('babylon', [], { city: { size: 6, buildings: b as never } });
      return { ...cityScienceGold(s, city), culture: cityCulture(s, city), production: cityYields(s, city).production, food: cityYields(s, city).food };
    };
    const none = measure([]);
    expect(measure(['courthouse']).gold - none.gold).toBe(1);
    expect(measure(['cathedral']).culture).toBe(3);
    expect(measure(['colosseum']).culture).toBe(2);
    expect(measure(['library', 'university']).science).toBeGreaterThan(measure(['library']).science);
    expect(measure(['marketplace', 'bank']).gold).toBeGreaterThan(measure(['marketplace']).gold);
    expect(measure(['factory']).production).toBe(none.production + Math.floor(none.production / 2));
    expect(measure(['factory', 'power_plant']).production).toBe(none.production + Math.floor((none.production * 75) / 100));
    const { s } = world('babylon');
    const taken = addCity(s, 0, 5, 2, { founder: 1, buildings: ['courthouse'] });
    const home = addCity(s, 0, 5, 5, { buildings: ['courthouse'] });
    expect(cityYields(s, taken).food - cityYields(s, { ...taken, buildings: [] }).food).toBe(1);
    expect(cityYields(s, home).food - cityYields(s, { ...home, buildings: [] }).food).toBe(0);
  });
  it('the AI builds them', async () => {
    const { AI_BUILDING_ORDER } = await import('../src/data/buildings');
    for (const b of ['courthouse', 'cathedral', 'colosseum', 'university', 'bank', 'factory', 'power_plant', 'research_lab', 'stock_exchange']) {
      expect(AI_BUILDING_ORDER).toContain(b);
    }
  });
});

describe('choosing your civ and drawing rivals (C1)', () => {
  it('the human gets the chosen civ; rivals are seeded, never repeated, from the rest', () => {
    const a = createGame({ seed: 77, playerCount: 5, civ: 'germany' });
    const b = createGame({ seed: 77, playerCount: 5, civ: 'germany' });
    const civs = (g: GameState) => g.players.filter((p) => p.kind !== 'barbarian').map((p) => p.civId);
    expect(civs(a)).toEqual(civs(b));
    expect(civs(a)[0]).toBe('germany');
    expect(new Set(civs(a)).size).toBe(5);
    expect(a.players[0]!.techs).toEqual(['the_wheel']);
    const c = createGame({ seed: 78, playerCount: 5, civ: 'germany' });
    expect(civs(c)).not.toEqual(civs(a));
    expect(() => createGame({ seed: 1, civ: 'babylon' })).toThrow();
  });
  it('rivals 1–4 (on a Normal map), and a random civ when none is chosen', () => {
    for (let rivals = 1; rivals <= RULES.defaultPlayers - 1; rivals++) {
      const g = createGame({ seed: 5, playerCount: rivals + 1 });
      expect(g.players.filter((p) => p.kind === 'ai')).toHaveLength(rivals);
    }
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) seen.add(createGame({ seed, playerCount: 2 }).players[0]!.civId);
    expect(seen.size).toBeGreaterThan(6);
  });
  it('drawCivs is pure and seeded', () => {
    const x = drawCivs({ rngState: hashSeed(3) }, 5).map((c) => c.id);
    expect(drawCivs({ rngState: hashSeed(3) }, 5).map((c) => c.id)).toEqual(x);
    expect(drawCivs({ rngState: hashSeed(3) }, 5, 'usa')[0]!.id).toBe('usa');
  });
});

describe('portraits (C2, C3)', () => {
  const name = (path: string) => path.split('/').pop()!;
  const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
  const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
  const size = (b: Uint8Array): [number, number] => {
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return [u32be(b, 16), u32be(b, 20)];
    // WebP (VP8X, VP8L, or VP8).
    const kind = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (kind === 'VP8X') return [1 + u24le(b, 24), 1 + u24le(b, 27)];
    if (kind === 'VP8L') {
      const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0;
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    return [(b[26]! | (b[27]! << 8)) & 0x3fff, (b[28]! | (b[29]! << 8)) & 0x3fff];
  };
  it('every portrait present is named for a civ, square, and at least 256 px', () => {
    const files = Object.entries(PORTRAIT_FILES);
    expect(files.length).toBeGreaterThan(0);
    for (const [path, url] of files) {
      const f = name(path);
      expect(findCiv(f.replace(/\.(png|webp)$/, '')), f).toBeDefined();
      const [w, h] = size(bytesOf(url));
      expect(w, f).toBe(h);
      expect(w, f).toBeGreaterThanOrEqual(256);
    }
  });
  it("all 12 of Dan's portraits are in place, and PORTRAITS.md lists their file names", () => {
    const names = Object.keys(PORTRAIT_FILES).map(name);
    for (const c of PLAYABLE_CIVS) {
      // Round 16: the game ships WebP; Dan's PNG masters stay in docs/portraits-master/.
      expect(names, c.id).toContain(`${c.id}.webp`);
      expect(names, c.id).not.toContain(`${c.id}.png`);
      expect(existsSync(`docs/portraits-master/${c.id}.png`), c.id).toBe(true);
      expect(portraitsDoc, c.id).toContain(`${c.id}.webp`);
    }
  });
  it('the face focus is sane, and small sizes zoom in on it', () => {
    for (const c of PLAYABLE_CIVS) {
      const f = c.portraitFocus!;
      expect(f.x).toBeGreaterThan(0);
      expect(f.x).toBeLessThan(1);
      expect(f.y).toBeGreaterThan(0);
      expect(f.y).toBeLessThan(1);
      expect(f.zoom).toBeGreaterThanOrEqual(1);
      expect(f.zoom).toBeLessThanOrEqual(3);
    }
    expect(portraitCrop({ x: 0.5, y: 0.25, zoom: 2 }, 96)).toEqual({ size: 'cover', position: '50% 50%' });
    expect(portraitCrop({ x: 0.5, y: 0.25, zoom: 2 }, SMALL_PORTRAIT)).toEqual({ size: '200%', position: '50.0% 0.0%' });
    expect(portraitCrop({ x: 0.5, y: 0.5, zoom: 2 }, 28)).toEqual({ size: '200%', position: '50.0% 50.0%' });
    expect(portraitCrop(undefined, 28)).toEqual({ size: 'cover', position: '50% 50%' });
  });
  it('placeholder initials read well', () => {
    const initials = Object.fromEntries(PLAYABLE_CIVS.map((c) => [c.id, leaderInitials(c)]));
    expect(initials).toMatchObject({ egypt: 'Ha', england: 'HVIII', france: 'LXIV', usa: 'JFK', north_korea: 'KJU', russia: 'PG' });
  });
  it('docs/portraits.html knows all 12 leaders with the same focus as the game', () => {
    const data = JSON.parse(portraitsPage.match(/<script id="leaders" type="application\/json">([\s\S]*?)<\/script>/)![1]!);
    expect(data).toEqual(PLAYABLE_CIVS.map((c) => ({ id: c.id, leader: c.leader, civ: c.name, color: c.color, focus: c.portraitFocus })));
  });
});

describe('personalities (D1)', () => {
  it("each AI starts on its primary lean, and the conquerors are Dan's", () => {
    const s = makeState(['g'], { players: 2 });
    for (const c of PLAYABLE_CIVS) {
      s.players[1]!.civId = c.id;
      expect(aiVictoryGoal(s, 1), c.id).toBe(c.lean!.primary);
    }
    const conquerors = PLAYABLE_CIVS.filter((c) => c.lean!.primary === 'domination').map((c) => c.leader);
    expect(conquerors).toEqual(['Caligula', 'Charlemagne', 'Kim Jong Un']);
    const second = PLAYABLE_CIVS.filter((c) => c.lean!.secondary === 'domination').map((c) => c.leader);
    expect(second).toEqual(['Peter the Great', 'Simón Bolívar']);
  });
  it("a conqueror doesn't drift to technology as its tech count grows", () => {
    const s = makeState(['g'], { players: 2 });
    s.players[1]!.civId = 'north_korea';
    s.players[1]!.techs = Object.keys(TECHS) as TechId[];
    expect(aiVictoryGoal(s, 1)).toBe('domination');
    const scores = aiVictoryScores(s, 1);
    expect(scores.domination).toBeGreaterThanOrEqual(scores.technology);
  });
  it('is deterministic: the same game plays out the same', () => {
    const a = createGame({ seed: 9, playerCount: 5 });
    const b = createGame({ seed: 9, playerCount: 5 });
    for (let i = 0; i < 30; i++) {
      applyAction(a, { type: 'endTurn' });
      applyAction(b, { type: 'endTurn' });
    }
    expect(serializeGame(a, 0)).toBe(serializeGame(b, 0));
  });
});

describe('save migration v9 → v10 (E1)', () => {
  function v9Save(civs?: string[]): string {
    const s = createGame({ seed: 31, playerCount: 5 });
    if (civs) s.players.forEach((p, i) => p.kind !== 'barbarian' && (p.civId = civs[i]!));
    // Take away the starting techs (a v9 game never had them) and move the game on a bit.
    for (const p of s.players) p.techs = p.kind === 'barbarian' ? p.techs : ['alphabet', 'writing'];
    for (let i = 0; i < 3; i++) applyAction(s, { type: 'endTurn' });
    const raw = JSON.parse(serializeGame(s, 0));
    raw.saveVersion = 9;
    raw.state.version = 9;
    for (const p of raw.state.players) {
      delete p.uniquesUsed;
      delete p.dissolvedUntil;
      delete p.challenge;
      delete p.shipsBuilt;
    }
    for (const c of raw.state.cities) {
      delete c.founder;
      delete c.capturedTurn;
    }
    return JSON.stringify(raw);
  }

  it('keeps every civ (legacy ones too), grants no starting tech, and adds the new fields', () => {
    const res = deserializeGame(v9Save(['babylon', 'maurya', 'mali', 'inca', 'franks']));
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.migratedFrom).toBe(9);
    expect(res.state.version).toBe(STATE_VERSION);
    expect(res.state.players.slice(0, 5).map((p) => p.civId)).toEqual(['babylon', 'maurya', 'mali', 'inca', 'franks']);
    for (const p of res.state.players) {
      expect(p.uniquesUsed).toEqual([]);
      expect(p.challenge).toBeNull();
      expect(p.dissolvedUntil).toBeNull();
      if (p.kind !== 'barbarian') expect(p.techs).toEqual(['alphabet', 'writing']);
    }
    for (const c of res.state.cities) expect(c.founder).toBe(c.capitalOf ?? c.owner);
    // Mali and the Franks get their bonuses; the legacy civs none.
    expect(activeBonuses(res.state.players[2]!).length).toBeGreaterThan(0);
    expect(activeBonuses(res.state.players[4]!).length).toBeGreaterThan(0);
    expect(activeBonuses(res.state.players[0]!)).toEqual([]);
    // Era bonuses already reached are on, with no payout: nobody's culture jumped.
    expect(res.state.players.every((p) => p.culture < 50)).toBe(true);
    // It plays on.
    for (let i = 0; i < 3; i++) expect(applyAction(res.state, { type: 'endTurn' }).ok).toBe(true);
  });

  it('a captured capital remembers whose it was', () => {
    const raw = JSON.parse(v9Save());
    const c = raw.state.cities.find((x: { capitalOf: number | null }) => x.capitalOf !== null);
    c.owner = (c.capitalOf + 1) % 5;
    const res = deserializeGame(JSON.stringify(raw));
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    const city = res.state.cities.find((x) => x.id === c.id)!;
    expect(city.founder).toBe(c.capitalOf);
    expect(city.founder).not.toBe(city.owner);
  });

  it('the new buildings show up by tech', () => {
    const res = deserializeGame(v9Save());
    if (res.kind !== 'ok') throw new Error('load failed');
    const s = res.state;
    const city = s.cities.find((c) => c.owner === 0) ?? addCity(s, 0, 1, 1);
    s.players[0]!.techs.push('code_of_laws');
    expect(buildChoiceError(s, city, { kind: 'building', id: 'courthouse' })).toBeUndefined();
  });
});

describe('the AI uses its unique actions', () => {
  it('Mansa makes his Pilgrimage when rich; JFK names his research as the Challenge', async () => {
    const { aiUseUniques } = await import('../src/game/uniques');
    const m = world('mali', ERA.medieval);
    m.s.players[1]!.civId = 'maurya';
    m.s.players[0]!.kind = 'ai';
    m.s.players[0]!.gold = 20;
    aiUseUniques(m.s, 0);
    expect(m.s.players[0]!.uniquesUsed).toEqual([]);
    const j = world('usa', ERA.industrial);
    j.s.players[0]!.kind = 'ai';
    j.s.players[0]!.researching = 'physics';
    aiUseUniques(j.s, 0);
    expect(j.s.players[0]!.challenge).toBe('physics');
  });
});

describe('unit data (Round 11 flags)', () => {
  it('mounted units and siege weapons are marked', () => {
    expect(Object.values(UNITS).filter((u) => u.mounted).map((u) => u.id)).toEqual(['horseman', 'chariot', 'knight']);
    expect(Object.values(UNITS).filter((u) => u.siege).map((u) => u.id)).toEqual(['catapult', 'cannon', 'artillery', 'bomber', 'stealth_bomber']);
  });
});
