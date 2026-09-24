import { describe, expect, it } from 'vitest';
import { BUILDINGS, BUILDING_IDS } from '../src/data/buildings';
import { ERAS, FINAL_TECH, TECHS, TECH_IDS, TECH_LIST, techCostFor, type TechId } from '../src/data/techs';
import { UNITS, UNIT_IDS } from '../src/data/units';
import { WONDERS } from '../src/data/wonders';
import { applyAction } from '../src/game/actions';
import { runAiTurn } from '../src/game/ai';
import { createGame } from '../src/game/newGame';
import { buildChoiceError, buildOptions, processCities, setBuild } from '../src/game/production';
import { deserializeGame, serializeGame } from '../src/game/save';
import {
  availableTechs,
  chooseAiResearch,
  playerEra,
  processResearch,
  researchError,
  setResearch,
  techCost,
  techUnlocks,
  turnsToLearn,
} from '../src/game/tech';
import { endTurn } from '../src/game/turn';
import type { BuildItem } from '../src/game/types';
import { empireIncome } from '../src/game/yields';
import { addCity, makeState } from './helpers';

const names = (items: BuildItem[]) => items.map((i) => i.id);

describe('tech tree data', () => {
  it('has 40–50 techs across the four eras, with unique ids and names', () => {
    expect(TECH_LIST.length).toBeGreaterThanOrEqual(40);
    expect(TECH_LIST.length).toBeLessThanOrEqual(50);
    expect(new Set(TECH_IDS).size).toBe(TECH_LIST.length);
    expect(new Set(TECH_LIST.map((t) => t.name)).size).toBe(TECH_LIST.length);
    for (const era of ERAS) expect(TECH_LIST.filter((t) => t.era === era.id).length).toBeGreaterThanOrEqual(8);
    for (const t of TECH_LIST) expect(t.description.length).toBeGreaterThan(5);
  });

  it('every prerequisite exists, and a tech is never in an earlier era than its prerequisites', () => {
    const eraIdx = (id: TechId) => ERAS.findIndex((e) => e.id === TECHS[id].era);
    for (const t of TECH_LIST) {
      for (const p of t.prereqs) {
        expect(TECHS[p], `${t.id} needs unknown ${p}`).toBeDefined();
        expect(eraIdx(p)).toBeLessThanOrEqual(eraIdx(t.id));
      }
    }
  });

  it('tiers are the depth in the tree (1 + deepest prerequisite)', () => {
    for (const t of TECH_LIST) {
      const expected = 1 + Math.max(0, ...t.prereqs.map((p) => TECHS[p].tier));
      expect(t.tier, t.id).toBe(expected);
    }
  });

  it('has no cycles', () => {
    const state = new Map<TechId, 'visiting' | 'done'>();
    const visit = (id: TechId, path: TechId[]): void => {
      if (state.get(id) === 'done') return;
      if (state.get(id) === 'visiting') throw new Error(`cycle: ${[...path, id].join(' → ')}`);
      state.set(id, 'visiting');
      for (const p of TECHS[id].prereqs) visit(p, [...path, id]);
      state.set(id, 'done');
    };
    for (const id of TECH_IDS) expect(() => visit(id, [])).not.toThrow();
  });

  it('every tech is reachable from a fresh start, ending at the spaceship tech', () => {
    const p = makeState(['g']).players[0]!;
    for (let guard = 0; guard < 100; guard++) {
      const next = availableTechs(p);
      if (next.length === 0) break;
      p.techs.push(...next);
    }
    expect([...p.techs].sort()).toEqual([...TECH_IDS].sort());
    expect(TECHS[FINAL_TECH]).toBeDefined();
    // Nothing needs the final tech (it's the end of the tree).
    expect(TECH_LIST.some((t) => t.prereqs.includes(FINAL_TECH))).toBe(false);
  });

  it('every unit, building, and wonder requirement is a real tech', () => {
    for (const id of UNIT_IDS) if (UNITS[id].requires) expect(TECHS[UNITS[id].requires!]).toBeDefined();
    for (const id of BUILDING_IDS) if (BUILDINGS[id].requires) expect(TECHS[BUILDINGS[id].requires!]).toBeDefined();
    for (const w of WONDERS) expect(TECHS[w.requires]).toBeDefined();
  });

  it('the M2 buildings are tied to sensible techs', () => {
    expect(BUILDINGS.granary.requires).toBe('pottery');
    expect(BUILDINGS.library.requires).toBe('writing');
    expect(BUILDINGS.marketplace.requires).toBe('currency');
    expect(BUILDINGS.barracks.requires).toBe('bronze_working');
    expect(BUILDINGS.walls.requires).toBe('masonry');
    expect(BUILDINGS.temple.requires).toBe('ceremonial_burial');
    expect(techUnlocks('writing').buildings).toEqual(['library']);
    expect(techUnlocks('archery').units).toEqual(['archer']);
  });
});

describe('research', () => {
  it('nobody starts with a tech or a research choice', () => {
    const s = createGame({ seed: 3, playerCount: 5 });
    for (const p of s.players) expect([p.techs, p.researching]).toEqual([[], null]);
  });

  it('enforces prerequisites', () => {
    const s = makeState(['g']);
    const p = s.players[0]!;
    expect(researchError(p, 'writing')).toBe('Needs Alphabet');
    expect(setResearch(s, 'writing')).toEqual({ ok: false, reason: 'Needs Alphabet' });
    expect(researchError(p, 'mathematics')).toBe('Needs Alphabet and Masonry');
    expect(applyAction(s, { type: 'setResearch', tech: 'alphabet' }).ok).toBe(true);
    expect(p.researching).toBe('alphabet');
    p.techs.push('alphabet');
    expect(setResearch(s, 'alphabet')).toEqual({ ok: false, reason: 'Already known' });
    expect(setResearch(s, 'writing').ok).toBe(true);
    // Only roots are available at the start.
    const fresh = makeState(['g']).players[0]!;
    expect(availableTechs(fresh).every((t) => TECHS[t].prereqs.length === 0)).toBe(true);
  });

  it('cost rises with the number of techs known (formula in data)', () => {
    expect(techCostFor(0, 1)).toBe(16);
    expect(techCostFor(1, 1)).toBe(27); // 16 + 10 + 0.6
    expect(techCostFor(10, 1)).toBe(176); // 16 + 100 + 60
    expect(techCostFor(10, 3)).toBe(184); // + 4 per tier above 1
    const p = makeState(['g']).players[0]!;
    expect(techCost(p, 'alphabet')).toBe(16);
    p.techs.push('bronze_working');
    expect(techCost(p, 'alphabet')).toBe(27);
    let last = 0;
    for (let k = 0; k < TECH_LIST.length; k++) {
      const c = techCostFor(k, 1);
      expect(c).toBeGreaterThan(last);
      last = c;
    }
  });

  it('learns the tech when the pool covers it, and the overflow carries over', () => {
    const s = makeState(['g']);
    const p = s.players[0]!;
    p.researching = 'pottery';
    p.science = 15; // one short
    processResearch(s, 0);
    expect(p.techs).toEqual([]);
    p.science = 16 + 7;
    processResearch(s, 0);
    expect(p.techs).toEqual(['pottery']);
    expect(p.science).toBe(7);
    expect(p.researching).toBeNull();
    expect(s.log.at(-1)!.text).toBe('Learned Pottery');
  });

  it('with nothing chosen, science banks until a tech is picked', () => {
    const s = makeState(['ggg', 'ggg', 'ggg'], { players: 1 });
    addCity(s, 0, 1, 1, { build: { kind: 'unit', id: 'warrior' } });
    const p = s.players[0]!;
    let earned = 0;
    for (let i = 0; i < 20; i++) {
      earned += empireIncome(s, 0).science;
      endTurn(s);
    }
    expect(earned).toBeGreaterThan(16);
    expect(p.techs).toEqual([]);
    expect(p.science).toBe(earned); // nothing spent
    setResearch(s, 'alphabet');
    earned += empireIncome(s, 0).science;
    endTurn(s);
    expect(p.techs).toEqual(['alphabet']);
    expect(p.science).toBe(earned - 16);
  });

  it('learns at most one tech per turn even with a big pool', () => {
    const s = makeState(['g'], { players: 1 });
    const p = s.players[0]!;
    p.science = 1000;
    setResearch(s, 'alphabet');
    endTurn(s);
    expect(p.techs).toEqual(['alphabet']);
    expect(p.researching).toBeNull();
    endTurn(s);
    expect(p.techs).toEqual(['alphabet']); // waits for a choice
    expect(p.science).toBe(1000 - 16);
  });

  it('switching research keeps the pool', () => {
    const s = makeState(['g']);
    const p = s.players[0]!;
    setResearch(s, 'pottery');
    p.science = 10;
    setResearch(s, 'masonry');
    expect(p.science).toBe(10);
    expect(p.researching).toBe('masonry');
  });

  it('turns to learn uses the pool and the current science income', () => {
    const s = makeState(['ggg', 'ggg', 'ggg'], { players: 1 });
    addCity(s, 0, 1, 1);
    const p = s.players[0]!;
    const perTurn = empireIncome(s, 0).science; // 2 at 60%
    expect(perTurn).toBe(2);
    expect(turnsToLearn(s, 0, 'alphabet')).toBe(8); // 16 / 2
    p.science = 15;
    expect(turnsToLearn(s, 0, 'alphabet')).toBe(1);
    p.science = 30;
    expect(turnsToLearn(s, 0, 'alphabet')).toBe(1); // already covered: next end of turn
    p.scienceRate = 0;
    p.science = 0;
    expect(turnsToLearn(s, 0, 'alphabet')).toBeUndefined();
  });
});

describe('unlocks', () => {
  it('the build list only offers what is unlocked', () => {
    const s = makeState(['ggg', 'ggg', 'ggg']);
    const c = addCity(s, 0, 1, 1);
    expect(names(buildOptions(s, c))).toEqual(['settler', 'warrior']);
    s.players[0]!.techs.push('pottery', 'archery');
    expect(names(buildOptions(s, c))).toEqual(['settler', 'warrior', 'archer', 'granary']);
    // Another player's techs don't count.
    const rival = addCity(s, 1, 0, 0);
    expect(names(buildOptions(s, rival))).toEqual(['settler', 'warrior']);
  });

  it("a building that needs a tech can't be chosen without it", () => {
    const s = makeState(['ggg', 'ggg', 'ggg']);
    const c = addCity(s, 0, 1, 1);
    expect(setBuild(s, c.id, { kind: 'building', id: 'library' })).toEqual({ ok: false, reason: 'Needs Writing' });
    expect(setBuild(s, c.id, { kind: 'unit', id: 'knight' })).toEqual({ ok: false, reason: 'Needs Chivalry' });
    expect(c.build).toBeNull();
    s.players[0]!.techs.push('alphabet', 'writing');
    expect(setBuild(s, c.id, { kind: 'building', id: 'library' }).ok).toBe(true);
    expect(buildChoiceError(s, c, { kind: 'unit', id: 'warrior' })).toBeUndefined();
  });

  it('new units carry attack, defense, and moves in data and can be built', () => {
    const s = makeState(['ggg', 'ggg', 'ggg']);
    const c = addCity(s, 0, 1, 1);
    s.players[0]!.techs.push('horseback_riding');
    expect(UNITS.horseman).toMatchObject({ attack: 2, defense: 1, moves: 2 });
    setBuild(s, c.id, { kind: 'unit', id: 'horseman' });
    c.production = UNITS.horseman.cost;
    processCities(s, 0);
    expect(s.units.map((u) => u.type)).toEqual(['horseman']);
  });
});

describe('eras', () => {
  it('is the latest era among known techs', () => {
    const p = makeState(['g']).players[0]!;
    expect(playerEra(p)).toBe('ancient');
    p.techs.push('alphabet', 'writing');
    expect(playerEra(p)).toBe('ancient');
    p.techs.push('monarchy');
    expect(playerEra(p)).toBe('medieval');
    p.techs.push('electronics');
    expect(playerEra(p)).toBe('modern');
  });

  it('announces entering a new era', () => {
    const s = makeState(['g']);
    const p = s.players[0]!;
    p.techs.push('ceremonial_burial', 'alphabet', 'code_of_laws');
    p.researching = 'monarchy';
    p.science = 1000;
    processResearch(s, 0);
    expect(s.log.map((e) => e.text)).toEqual(['Learned Monarchy', 'Entered the Medieval era']);
  });
});

describe('AI research', () => {
  it('follows the priority list, then the shallowest available tech', () => {
    const p = makeState(['g']).players[0]!;
    expect(chooseAiResearch(p)).toBe('bronze_working');
    p.techs.push('bronze_working');
    expect(chooseAiResearch(p)).toBe('pottery');
    // With the whole list known except what's blocked, it falls back to tree order.
    p.techs = TECH_IDS.filter((t) => t !== 'archery' && t !== 'space_flight');
    expect(chooseAiResearch(p)).toBe('archery');
    p.techs = [...TECH_IDS];
    expect(chooseAiResearch(p)).toBeUndefined();
  });

  it('picks research through the same action as the player, deterministically', () => {
    const play = () => {
      const s = createGame({ seed: 8, playerCount: 5 });
      for (let i = 0; i < 40; i++) applyAction(s, { type: 'endTurn' });
      return s;
    };
    const a = play();
    expect(play()).toEqual(a);
    for (const p of a.players.filter((p) => p.kind === 'ai')) {
      expect(p.techs.length, `AI ${p.id} techs`).toBeGreaterThanOrEqual(1);
      // Every tech it learned was legal at the time: prerequisites come earlier in the list.
      p.techs.forEach((t, i) => {
        for (const pre of TECHS[t].prereqs) expect(p.techs.indexOf(pre)).toBeLessThan(i);
      });
      a.currentPlayer = p.id;
      runAiTurn(a, p.id);
      expect(p.researching).not.toBeNull();
    }
  });
});

describe('saves from Milestone 2', () => {
  /** A v2 save as Milestone 2 wrote it: no techs, no research; science was just a number. */
  function m2Save() {
    const s = createGame({ seed: 5, playerCount: 3 });
    const settler = s.units.find((u) => u.owner === 0 && u.type === 'settler')!;
    applyAction(s, { type: 'foundCity', unitId: settler.id });
    for (let i = 0; i < 12; i++) applyAction(s, { type: 'endTurn' });
    const raw = JSON.parse(serializeGame(s, 42));
    raw.saveVersion = 2;
    raw.state.version = 2;
    for (const p of raw.state.players) {
      delete p.techs;
      delete p.researching;
      p.science = 37;
    }
    const city = raw.state.cities.find((c: { owner: number }) => c.owner === 0);
    city.build = { kind: 'building', id: 'library' };
    city.production = 25;
    return { raw, cityId: city.id as number };
  }

  it('migrates forward instead of discarding the game', () => {
    const { raw, cityId } = m2Save();
    const res = deserializeGame(JSON.stringify(raw));
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.migratedFrom).toBe(2);
    expect(res.savedAt).toBe(42);
    const s = res.state;
    expect(s.version).toBe(3);
    for (const p of s.players) {
      expect(p.techs).toEqual([]);
      expect(p.researching).toBeNull();
      expect(p.science).toBe(37); // banked, ready to spend
    }
    // The Library now needs Writing: the city asks again, and keeps its production.
    const city = s.cities.find((c) => c.id === cityId)!;
    expect(city.build).toBeNull();
    expect(city.production).toBe(25);
    // It plays on normally, and re-saves as the current version.
    expect(applyAction(s, { type: 'setResearch', tech: 'pottery' }).ok).toBe(true);
    for (let i = 0; i < 3; i++) expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
    expect(s.players[0]!.techs).toContain('pottery'); // 37 banked covers it at once
    const again = deserializeGame(serializeGame(s, 0));
    expect(again.kind === 'ok' && again.migratedFrom).toBe(undefined);
  });

  it('a unit build that needs no tech survives the migration', () => {
    const { raw, cityId } = m2Save();
    raw.state.cities.find((c: { id: number }) => c.id === cityId).build = { kind: 'unit', id: 'warrior' };
    const res = deserializeGame(JSON.stringify(raw));
    if (res.kind !== 'ok') throw new Error(res.kind);
    expect(res.state.cities.find((c) => c.id === cityId)!.build).toEqual({ kind: 'unit', id: 'warrior' });
  });

  it('still refuses versions with no migration, and saves from the future', () => {
    const { raw } = m2Save();
    expect(deserializeGame(JSON.stringify({ ...raw, saveVersion: 1, state: { ...raw.state, version: 1 } })).kind).toBe(
      'incompatible',
    );
    expect(deserializeGame(JSON.stringify({ ...raw, saveVersion: 99, state: { ...raw.state, version: 99 } })).kind).toBe(
      'incompatible',
    );
  });
});
