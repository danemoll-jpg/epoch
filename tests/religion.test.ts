// Religion (Round 12): founding (first only, one per civ, the limit, naming), passive spread
// (seeded), Missionaries (charges and targets), the holy city and follower effects, the
// diplomacy opinion, Henry VIII's national church, the Great Artist, the AI, and the v10 → v11
// migration.

import { describe, expect, it } from 'vitest';
import { FOUNDING_TECHS, RELIGION, RELIGION_NAMES } from '../src/data/religion';
import { TECHS } from '../src/data/techs';
import { applyAction } from '../src/game/actions';
import { attitude, opinionOf } from '../src/game/diplomacy';
import { buildChoiceError, processCities } from '../src/game/production';
import {
  aiMissionaryBuild,
  checkFoundings,
  conversionChancePct,
  faithOpinion,
  foundReligion,
  foundingOpen,
  nationalChurchError,
  playMissionary,
  religionCityCulture,
  religionCityGold,
  religionNameError,
  religionPressure,
  spreadError,
  spreadReligions,
  spreadTargets,
  suggestReligionName,
} from '../src/game/religion';
import { deserializeGame, serializeGame } from '../src/game/save';
import { learnTech } from '../src/game/tech';
import { STATE_VERSION, type City, type GameState } from '../src/game/types';
import { cityCulture, cityScienceGold } from '../src/game/yields';
import { createGame } from '../src/game/newGame';
import { moveUnitToward } from '../src/game/movement';
import { runAiTurn } from '../src/game/ai';
import { endTurn, playComputerTurn } from '../src/game/turn';
import { addCity, addUnit, makeState } from './helpers';

const LAND = Array.from({ length: 12 }, () => 'g'.repeat(20));

/** Two civs at peace and met, each with a capital; player 0 human. */
function world(players = 2): { s: GameState; a: City; b: City } {
  const s = makeState(LAND, { players, peace: true });
  const a = addCity(s, 0, 3, 5, { name: 'A', capitalOf: 0, size: 3, build: { kind: 'unit', id: 'warrior' } });
  const b = addCity(s, 1, 12, 5, { name: 'B', capitalOf: 1, size: 3, build: { kind: 'unit', id: 'warrior' } });
  for (let p = 2; p < players; p++) addCity(s, p, 3 + p * 3, 10, { name: `C${p}`, capitalOf: p, build: { kind: 'unit', id: 'warrior' } });
  return { s, a, b };
}

describe('founding (B1)', () => {
  it('the first civ to learn a founding tech founds a religion in its capital, the holy city', () => {
    const { s, a, b } = world();
    learnTech(s, 0, 'mysticism', 'Learned');
    expect(s.religions).toHaveLength(1);
    expect(s.religions[0]).toMatchObject({ founder: 0, holyCityId: a.id, tech: 'mysticism' });
    expect(a.religion).toBe(s.religions[0]!.id);
    // The second civ to learn it founds nothing.
    learnTech(s, 1, 'mysticism', 'Learned');
    expect(s.religions).toHaveLength(1);
    expect(b.religion).toBeNull();
  });

  it('the founding techs are the five in data, Theology is new and Medieval', () => {
    expect(FOUNDING_TECHS).toEqual(['mysticism', 'astronomy', 'philosophy', 'monotheism', 'theology']);
    expect(TECHS.theology).toMatchObject({ era: 'medieval', prereqs: ['monotheism', 'feudalism'] });
  });

  it('one religion per civ: a founder leaves the next founding tech to the next civ that knows it', () => {
    const { s } = world();
    learnTech(s, 0, 'mysticism', 'Learned');
    learnTech(s, 0, 'astronomy', 'Learned');
    expect(s.religions).toHaveLength(1);
    expect(foundingOpen(s, 'astronomy')).toBe(true);
    learnTech(s, 1, 'astronomy', 'Learned');
    expect(s.religions.map((r) => [r.founder, r.tech])).toEqual([
      [0, 'mysticism'],
      [1, 'astronomy'],
    ]);
  });

  it('never more than maxReligions', () => {
    const { s, a } = world();
    for (let i = 0; i < RELIGION.maxReligions; i++) s.religions.push({ id: i, name: `R${i}`, founder: 1, holyCityId: -1, symbol: i, tech: FOUNDING_TECHS[i]!, foundedTurn: 1, named: true });
    s.religions[RELIGION.maxReligions - 1]!.tech = 'mysticism';
    // Every slot taken: even a still-unused tech founds nothing.
    s.religions[0]!.tech = 'astronomy';
    expect(foundingOpen(s, 'theology')).toBe(false);
    s.players[0]!.techs = ['theology'];
    expect(checkFoundings(s, 0)).toEqual([]);
    expect(a.religion).toBeNull();
  });

  it('a civ that knew a founding tech before it had a city founds once it has one (a starting tech)', () => {
    const s = makeState(LAND, { players: 2, peace: true });
    s.players[0]!.techs = ['mysticism'];
    expect(checkFoundings(s, 0)).toEqual([]);
    addCity(s, 0, 3, 5, { capitalOf: 0 });
    applyAction(s, { type: 'endTurn' });
    expect(s.religions).toHaveLength(1);
    expect(s.religions[0]!.founder).toBe(0);
  });

  it('a lapsed tech (known before religions came) founds nothing', () => {
    const { s } = world();
    s.religionTechsLapsed = ['mysticism'];
    learnTech(s, 0, 'mysticism', 'Learned');
    expect(s.religions).toEqual([]);
  });

  it('naming: the AI gets an invented name at once; the human names theirs (once, validated)', () => {
    const { s } = world();
    learnTech(s, 1, 'mysticism', 'Learned');
    const ai = s.religions[0]!;
    expect(ai.named).toBe(true);
    expect(RELIGION_NAMES).toContain(ai.name);
    learnTech(s, 0, 'astronomy', 'Learned');
    const mine = s.religions[1]!;
    expect(mine.named).toBe(false);
    expect(RELIGION_NAMES).toContain(mine.name);
    expect(religionNameError(s, mine.id, '   ')).toBe('Type a name');
    expect(religionNameError(s, mine.id, 'x'.repeat(RELIGION.maxNameLength + 1))).toMatch(/At most/);
    expect(religionNameError(s, mine.id, ai.name.toUpperCase())).toBe('Another religion has that name');
    expect(religionNameError(s, ai.id, 'Mine now')).toBe('Only its founder names it');
    expect(applyAction(s, { type: 'nameReligion', religionId: mine.id, name: 'Order of the Kettle' }).ok).toBe(true);
    expect(mine).toMatchObject({ name: 'Order of the Kettle', named: true });
    expect(applyAction(s, { type: 'nameReligion', religionId: mine.id, name: 'Again' }).ok).toBe(false);
  });

  it('Suggest gives invented names not yet taken, and different ones in turn', () => {
    const { s } = world();
    const names = [0, 1, 2, 3].map((n) => suggestReligionName(s, n));
    expect(new Set(names).size).toBe(4);
    for (const n of names) expect(RELIGION_NAMES).toContain(n);
    learnTech(s, 1, 'mysticism', 'Learned');
    expect(suggestReligionName(s)).not.toBe(s.religions[0]!.name);
  });

  it('every invented name steers clear of real-world religions', () => {
    const real = /christ|islam|muslim|jew|judai|hindu|buddh|sikh|shinto|tao|zoroast|catholic|orthodox|protestant|pagan|wicca|jain/i;
    for (const n of RELIGION_NAMES) expect(n).not.toMatch(real);
  });
});

describe('spread (B2)', () => {
  function spreadWorld() {
    const { s, a } = world();
    a.size = 6;
    a.buildings = ['temple'];
    const r = foundReligion(s, 0, 'mysticism', a);
    const near = addCity(s, 0, 6, 5, { name: 'Near', build: { kind: 'unit', id: 'warrior' } });
    const far = addCity(s, 0, 18, 1, { name: 'Far', build: { kind: 'unit', id: 'warrior' } });
    return { s, a, r, near, far };
  }

  it('pressure: closer, bigger, holy, a Temple, and a road push harder; out of range, none', () => {
    const { s, r, near, far } = spreadWorld();
    // (radius 4 + 1 − distance 3) + size 6 / 3 + Temple 1, doubled for the holy city.
    expect(religionPressure(s, near, r)).toBe((RELIGION.spreadRadius + 1 - 3 + 2 + RELIGION.templePressure) * RELIGION.holyCityMult);
    expect(religionPressure(s, far, r)).toBe(0);
    const before = religionPressure(s, near, r);
    for (const x of [4, 5]) s.map.tiles[5 * 20 + x]!.road = 'road';
    expect(religionPressure(s, near, r)).toBe(before + RELIGION.roadPressure * RELIGION.holyCityMult);
    expect(conversionChancePct(s, near, r)).toBe(Math.min(RELIGION.maxChancePct, religionPressure(s, near, r) * RELIGION.pctPerPressure));
  });

  it('is seeded: the same state and dice convert the same cities', () => {
    const run = () => {
      const { s } = spreadWorld();
      for (let i = 0; i < 30; i++) spreadReligions(s);
      return Object.fromEntries(s.cities.map((c) => [c.name, c.religion]));
    };
    expect(run()).toEqual(run());
    // Over 30 turns at this chance, Near converts; Far, out of range, never does.
    const { Near, Far } = run();
    expect(Near).toBe(0);
    expect(Far).toBeNull();
  });

  it('holy cities never change faith; a follower switches only under much more pressure', () => {
    const { s, a, r, near } = spreadWorld();
    const other = foundReligion(s, 1, 'astronomy', s.cities.find((c) => c.owner === 1)!);
    expect(conversionChancePct(s, a, other)).toBe(0);
    near.religion = other.id;
    // Near follows `other` (no pressure from it nearby, so only its own weight holds it).
    const hold = religionPressure(s, near, other) + RELIGION.ownPressure;
    const push = religionPressure(s, near, r);
    const expected = push >= hold * RELIGION.switchPressureMult ? (Math.min(RELIGION.maxChancePct, push * RELIGION.pctPerPressure) * RELIGION.switchChanceSharePct) / 100 : 0;
    expect(conversionChancePct(s, near, r)).toBe(expected);
  });

  it('runs once a game turn, at End Turn', () => {
    const { s, near } = spreadWorld();
    s.rngState = 7;
    let turns = 0;
    while (near.religion === null && turns < 60) {
      applyAction(s, { type: 'endTurn' });
      turns++;
    }
    expect(near.religion).toBe(0);
    expect(s.log.some((e) => e.kind === 'religion' && e.text === `Near now follows ${s.religions[0]!.name}`)).toBe(true);
  });
});

describe('the Missionary (B2)', () => {
  function missionWorld() {
    const { s, a, b } = world();
    s.players[0]!.techs = ['mysticism'];
    const r = foundReligion(s, 0, 'mysticism', a);
    r.named = true;
    const m = addUnit(s, 'missionary', 0, 11, 5, { religion: r.id, charges: RELIGION.missionaryCharges });
    return { s, a, b, r, m };
  }

  it('is built only in a city that follows a religion, with Monotheism or that religion’s founding tech; it carries the religion', () => {
    const { s, a, b } = world();
    s.players[0]!.techs = ['monotheism'];
    expect(buildChoiceError(s, a, { kind: 'unit', id: 'missionary' })).toBe('A follows no religion');
    s.players[0]!.techs = [];
    const r = foundReligion(s, 1, 'mysticism', b);
    a.religion = r.id;
    expect(buildChoiceError(s, a, { kind: 'unit', id: 'missionary' })).toMatch(/Needs Monotheism/);
    s.players[0]!.techs = ['mysticism'];
    expect(buildChoiceError(s, a, { kind: 'unit', id: 'missionary' })).toBeUndefined();
    s.players[0]!.techs = ['monotheism'];
    expect(buildChoiceError(s, a, { kind: 'unit', id: 'missionary' })).toBeUndefined();
    a.build = { kind: 'unit', id: 'missionary' };
    a.production = 999;
    processCities(s, 0);
    const m = s.units.find((u) => u.type === 'missionary')!;
    expect(m).toMatchObject({ religion: r.id, charges: RELIGION.missionaryCharges, owner: 0 });
  });

  it('converts its own city or a met rival’s at peace, next to it or under it; never a holy city, at war, unmet, or far', () => {
    const { s, b, m } = missionWorld();
    expect(spreadTargets(s, m).map((c) => c.id)).toEqual([b.id]);
    s.atWar[0]![1] = s.atWar[1]![0] = true;
    expect(spreadError(s, m, b)).toBe('Not while you’re at war with them');
    s.atWar[0]![1] = s.atWar[1]![0] = false;
    s.diplomacy.met[0]![1] = false;
    expect(spreadError(s, m, b)).toBe('You haven’t met them');
    s.diplomacy.met[0]![1] = true;
    const holy = foundReligion(s, 1, 'astronomy', b);
    expect(spreadError(s, m, b)).toBe(`B is the holy city of ${holy.name}`);
    const far = addCity(s, 0, 17, 10);
    expect(spreadError(s, m, far)).toBe('Stand in or next to the city');
  });

  it('uses a charge and its moves; the last charge uses it up; the founder is paid for a rival’s city', () => {
    const { s, b, m } = missionWorld();
    const mine = addCity(s, 0, 10, 4, { name: 'Mine' });
    expect(applyAction(s, { type: 'spreadReligion', unitId: m.id, cityId: mine.id }).ok).toBe(true);
    expect(m.charges).toBe(1);
    expect(m.movesLeft).toBe(0);
    // Your own city: no reward.
    expect(s.players[0]!.gold).toBe(0);
    m.movesLeft = 2;
    expect(applyAction(s, { type: 'spreadReligion', unitId: m.id, cityId: b.id }).ok).toBe(true);
    expect(b.religion).toBe(0);
    expect(s.players[0]!.gold).toBe(RELIGION.conversionReward.gold);
    expect(s.players[0]!.culture).toBe(RELIGION.conversionReward.culture);
    expect(s.units.some((u) => u.id === m.id)).toBe(false);
  });

  it('a city already following it can’t be converted again', () => {
    const { s, b, m, r } = missionWorld();
    b.religion = r.id;
    expect(spreadError(s, m, b)).toBe(`B already follows ${r.name}`);
  });
});

describe('effects (B3)', () => {
  it('the holy city: +3 culture, +2 gold, +1 gold per follower anywhere (capped); followers: Temple +1, Cathedral +2', () => {
    const { s, a, b } = world();
    const r = foundReligion(s, 0, 'mysticism', a);
    const H = RELIGION.holyCity;
    expect(religionCityCulture(s, a)).toBe(H.culture);
    expect(religionCityGold(s, a)).toBe(H.gold);
    b.religion = r.id;
    expect(religionCityGold(s, a)).toBe(H.gold + H.goldPerFollower);
    for (let i = 0; i < 12; i++) addCity(s, 1, 1 + i, 11, { religion: r.id });
    expect(religionCityGold(s, a)).toBe(H.gold + H.maxFollowerGold);
    b.buildings = ['temple', 'cathedral'];
    expect(religionCityCulture(s, b)).toBe(RELIGION.followerCulture.temple + RELIGION.followerCulture.cathedral);
    b.religion = null;
    expect(religionCityCulture(s, b)).toBe(0);
  });

  it('feeds the real culture and gold', () => {
    const { s, a } = world();
    const culture = cityCulture(s, a);
    const gold = cityScienceGold(s, a).gold;
    foundReligion(s, 0, 'mysticism', a);
    expect(cityCulture(s, a)).toBe(culture + RELIGION.holyCity.culture);
    expect(cityScienceGold(s, a).gold).toBe(gold + RELIGION.holyCity.gold);
  });

  it('capturing a holy city passes its income to the new owner; the founder stays for the name', () => {
    const { s, a } = world();
    const r = foundReligion(s, 0, 'mysticism', a);
    a.owner = 1;
    expect(r.founder).toBe(0);
    expect(religionCityGold(s, a)).toBe(RELIGION.holyCity.gold);
    // It's in its new owner's income now.
    expect(s.cities.filter((c) => c.owner === 1).some((c) => c.id === a.id)).toBe(true);
  });

  it('diplomacy (B3): capitals sharing a religion +2 opinion, different ones −1, none 0', () => {
    const { s, a, b } = world();
    expect(faithOpinion(s, 1, 0)).toBe(0);
    const r = foundReligion(s, 0, 'mysticism', a);
    expect(faithOpinion(s, 1, 0)).toBe(0);
    b.religion = r.id;
    expect(faithOpinion(s, 1, 0)).toBe(RELIGION.sharedFaithOpinion);
    s.diplomacy.opinion[1]![0] = 1;
    expect(opinionOf(s, 1, 0)).toBe(1 + RELIGION.sharedFaithOpinion);
    expect(attitude(s, 1, 0)).toBe('friendly');
    const other = addCity(s, 1, 16, 9);
    const r2 = foundReligion(s, 1, 'astronomy', other);
    b.religion = r2.id;
    expect(faithOpinion(s, 1, 0)).toBe(RELIGION.differentFaithOpinion);
    expect(attitude(s, 1, 0)).toBe('neutral');
  });
});

describe('Henry VIII’s national church (B4)', () => {
  function henry() {
    const { s, a, b } = world();
    s.players[0]!.civId = 'england';
    s.players[0]!.techs = ['alphabet', 'ceremonial_burial', 'code_of_laws', 'monarchy'];
    foundReligion(s, 1, 'mysticism', b);
    return { s, a };
  }

  it('from the Medieval era, with a Temple, once, even though someone else founded first', () => {
    const { s, a } = henry();
    expect(nationalChurchError(s, 0)).toBe('Build a Temple first');
    a.buildings = ['temple'];
    expect(nationalChurchError(s, 0)).toBeUndefined();
    const res = applyAction(s, { type: 'nationalChurch' });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/founded a church/);
    const r = s.religions[1]!;
    expect(r).toMatchObject({ founder: 0, tech: null, holyCityId: a.id, named: false });
    expect(a.religion).toBe(r.id);
    expect(nationalChurchError(s, 0)).toBe('Already founded (once per game)');
    expect(s.log.some((e) => e.kind === 'leader' && e.publicText?.includes('founded his own church'))).toBe(true);
  });

  it('only England, and only from the Medieval era; it counts as his one religion', () => {
    const { s, a } = henry();
    a.buildings = ['temple'];
    s.players[0]!.techs = [];
    expect(nationalChurchError(s, 0)).toBe('Only England, from the Medieval era');
    s.players[0]!.techs = ['alphabet', 'ceremonial_burial', 'code_of_laws', 'monarchy'];
    s.players[0]!.civId = 'france';
    expect(nationalChurchError(s, 0)).toBe('Only England, from the Medieval era');
    s.players[0]!.civId = 'england';
    applyAction(s, { type: 'nationalChurch' });
    learnTech(s, 0, 'astronomy', 'Learned');
    expect(s.religions).toHaveLength(2);
  });

  it('the Dissolution still works as before', () => {
    const { s, a } = henry();
    a.buildings = ['temple'];
    expect(applyAction(s, { type: 'dissolution' }).ok).toBe(true);
  });
});

describe('the Great Artist converts a city (B2)', () => {
  it('to its owner’s religion, a rival’s city at peace paying the founder', () => {
    const { s, a, b } = world();
    foundReligion(s, 0, 'mysticism', a);
    s.greatPeople.push({ id: 900, owner: 0, kind: 'artist', name: 'Test', turn: 1 });
    const res = applyAction(s, { type: 'useGreatPerson', gpId: 900, how: { mode: 'convert', cityId: b.id } });
    expect(res.ok).toBe(true);
    expect(b.religion).toBe(0);
    expect(s.players[0]!.gold).toBe(RELIGION.conversionReward.gold);
    // Only an Artist.
    s.greatPeople.push({ id: 901, owner: 0, kind: 'merchant', name: 'M', turn: 1 });
    expect(applyAction(s, { type: 'useGreatPerson', gpId: 901, how: { mode: 'convert', cityId: b.id } }).ok).toBe(false);
  });
});

describe('the AI (B6)', () => {
  it('builds a Missionary when its religion has somewhere to go, at most two', () => {
    const { s, a } = world();
    s.players[0]!.kind = 'ai';
    s.players[0]!.techs = ['mysticism'];
    foundReligion(s, 0, 'mysticism', a);
    const err = (item: Parameters<typeof buildChoiceError>[2]) => buildChoiceError(s, a, item);
    expect(aiMissionaryBuild(s, a, err)).toEqual({ kind: 'unit', id: 'missionary' });
    addUnit(s, 'missionary', 0, 3, 5, { religion: 0, charges: 2 });
    addUnit(s, 'missionary', 0, 3, 5, { religion: 0, charges: 2 });
    expect(aiMissionaryBuild(s, a, err)).toBeUndefined();
  });

  it('prefers a friend’s capital and doesn’t go to a civ it dislikes', () => {
    const { s, a, b } = world();
    s.players[0]!.kind = 'ai';
    const r = foundReligion(s, 0, 'mysticism', a);
    const m = addUnit(s, 'missionary', 0, 11, 5, { religion: r.id, charges: 2 });
    s.diplomacy.opinion[0]![1] = -2;
    expect(playMissionary(s, m, (u, to) => moveUnitToward(s, u.id, to).ok)).toBe(false);
    expect(b.religion).toBeNull();
    s.diplomacy.opinion[0]![1] = 3;
    expect(playMissionary(s, m, (u, to) => moveUnitToward(s, u.id, to).ok)).toBe(true);
    expect(b.religion).toBe(r.id);
  });

  it('Henry’s AI founds his national church', () => {
    const { s, a, b } = world();
    s.currentPlayer = 0;
    s.players[0]!.kind = 'ai';
    s.players[0]!.civId = 'england';
    s.players[0]!.techs = ['alphabet', 'ceremonial_burial', 'code_of_laws', 'monarchy'];
    a.buildings = ['temple'];
    foundReligion(s, 1, 'mysticism', b);
    runAiTurn(s, 0);
    expect(s.religions.some((r) => r.founder === 0 && r.tech === null)).toBe(true);
  });

  it('is deterministic: two all-AI games from one seed found, spread, and build roads the same way', () => {
    const play = () => {
      const g = createGame({ seed: 77, playerCount: 3 });
      for (const p of g.players) if (p.kind === 'human') p.kind = 'ai';
      // A head start on the founding techs and some gold, so religion and roads happen early.
      for (const p of g.players) if (p.kind !== 'barbarian') p.techs.push('alphabet', 'ceremonial_burial', 'mysticism', 'monotheism');
      for (let i = 0; i < 70 * g.players.length; i++) {
        playComputerTurn(g, g.currentPlayer);
        endTurn(g);
      }
      return g;
    };
    const a = play();
    const b = play();
    expect(serializeGame(a, 0)).toBe(serializeGame(b, 0));
    expect(a.religions.length).toBeGreaterThan(0);
  }, 60_000);
});

describe('save migration v10 → v11 (D1)', () => {
  function v10Save(): string {
    const s = createGame({ seed: 41, playerCount: 5 });
    for (const p of s.players) if (p.kind !== 'barbarian') p.techs = p.id === 1 ? ['alphabet', 'ceremonial_burial', 'mysticism'] : ['alphabet'];
    for (let i = 0; i < 2; i++) applyAction(s, { type: 'endTurn' });
    const raw = JSON.parse(serializeGame(s, 0));
    raw.saveVersion = 10;
    raw.state.version = 10;
    delete raw.state.religions;
    delete raw.state.religionTechsLapsed;
    for (const c of raw.state.cities) delete c.religion;
    return JSON.stringify(raw);
  }

  it('no religions, no roads; a founding tech already known lapses, the next one can still be founded', () => {
    const res = deserializeGame(v10Save());
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    const s = res.state;
    expect(res.migratedFrom).toBe(10);
    expect(s.version).toBe(STATE_VERSION);
    expect(STATE_VERSION).toBe(11);
    expect(s.religions).toEqual([]);
    expect(s.religionTechsLapsed).toEqual(['mysticism']);
    expect(s.cities.every((c) => c.religion === null)).toBe(true);
    expect(s.map.tiles.some((t) => t.road)).toBe(false);
    expect(s.units.some((u) => u.type === 'missionary')).toBe(false);
    // Mysticism (known) founds nothing, even for someone who learns it now...
    learnTech(s, 0, 'mysticism', 'Learned');
    expect(s.religions).toEqual([]);
    // ...but Astronomy, which nobody knew, still can.
    const p = s.players[2]!;
    if (s.cities.some((c) => c.owner === 2)) {
      learnTech(s, 2, 'astronomy', 'Learned');
      expect(s.religions.map((r) => [r.founder, r.tech])).toEqual([[2, 'astronomy']]);
    }
    expect(p.alive).toBe(true);
    // It plays on.
    for (let i = 0; i < 3; i++) expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
  });

  it('keeps a backup-worthy summary of what changed', async () => {
    const { migrationSummary } = await import('../src/game/save');
    expect(migrationSummary(10)).toBe('religion, Missionaries, and roads');
  });
});
