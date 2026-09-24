// Milestone 6 (Round 7): culture, wonders, the four victories, near-win warnings, Keep
// playing, the AI's victory goals and gold spending, and the v5 → v6 save migration.

import { describe, expect, it } from 'vitest';
import { RULES } from '../src/data/rules';
import { VICTORY } from '../src/data/victory';
import { WONDERS, WONDER_LIST } from '../src/data/wonders';
import { applyAction } from '../src/game/actions';
import { chooseBuild, runAiTurn } from '../src/game/ai';
import { aiVictoryGoal } from '../src/game/aiGoals';
import { captureCity } from '../src/game/conquest';
import { buildOptions, buyError, processCities, setBuild } from '../src/game/production';
import { deserializeGame, serializeGame } from '../src/game/save';
import { endTurn } from '../src/game/turn';
import { STATE_VERSION, type GameState } from '../src/game/types';
import {
  capitalsHeld,
  checkVictory,
  dominationWon,
  issueWarnings,
  launchError,
  victoryWarnings,
} from '../src/game/victory';
import { cityCulture, cityScienceGold, cityYields, empireCulture } from '../src/game/yields';
import { addCity, addUnit, makeState } from './helpers';

const row = (n: number) => 'g'.repeat(n);

/** Two civs at peace on a strip of grassland, each with a capital. */
function twoCapitals(players = 2): GameState {
  const s = makeState([row(24), row(24), row(24)], { players, peace: true });
  for (let p = 0; p < players; p++) {
    addCity(s, p, 1 + p * 6, 1, { name: `Cap${p}`, capitalOf: p, size: 3, build: { kind: 'unit', id: 'warrior' } });
    addUnit(s, 'warrior', p, 1 + p * 6, 1, { fortified: true });
  }
  return s;
}

const cap = (s: GameState, p: number) => s.cities.find((c) => c.capitalOf === p)!;

describe('culture', () => {
  it('a Temple makes culture every turn, and it adds up per civ', () => {
    const s = twoCapitals();
    const c = cap(s, 0);
    expect(cityCulture(s, c)).toBe(0);
    c.buildings.push('temple');
    expect(cityCulture(s, c)).toBe(1);
    processCities(s, 0);
    processCities(s, 0);
    expect(s.players[0]!.culture).toBe(2);
    expect(s.players[1]!.culture).toBe(0);
  });

  it('wonders add their culture, and the empire total sums every city', () => {
    const s = twoCapitals();
    const c = cap(s, 0);
    c.buildings.push('temple');
    c.wonders.push('oracle');
    const second = addCity(s, 0, 4, 2, { buildings: ['temple'] });
    expect(cityCulture(s, c)).toBe(1 + WONDERS.oracle.effects.culture!);
    expect(empireCulture(s, 0)).toBe(cityCulture(s, c) + cityCulture(s, second));
  });
});

describe('wonders', () => {
  it('one per world: once built, nobody else can start it', () => {
    const s = twoCapitals();
    for (const p of s.players) p.techs = ['masonry'];
    const mine = cap(s, 0);
    mine.build = { kind: 'wonder', id: 'pyramids' };
    mine.production = WONDERS.pyramids.cost;
    processCities(s, 0);
    expect(mine.wonders).toEqual(['pyramids']);
    s.currentPlayer = 1;
    expect(setBuild(s, cap(s, 1).id, { kind: 'wonder', id: 'pyramids' })).toEqual({ ok: false, reason: 'Already built by Babylon' });
    expect(buildOptions(s, cap(s, 1)).some((i) => i.id === 'pyramids')).toBe(false);
    // World news for anyone who has met the builder.
    expect(s.log.some((e) => e.kind === 'wonder' && e.publicText === 'Babylon completed the Pyramids in Cap0')).toBe(true);
  });

  it('the race: a rival finishing first sends your city back to choose, production kept', () => {
    const s = twoCapitals();
    for (const p of s.players) p.techs = ['bronze_working'];
    const mine = cap(s, 0);
    const theirs = cap(s, 1);
    mine.build = { kind: 'wonder', id: 'colossus' };
    mine.production = 50;
    theirs.build = { kind: 'wonder', id: 'colossus' };
    theirs.production = WONDERS.colossus.cost;
    processCities(s, 1);
    expect(theirs.wonders).toEqual(['colossus']);
    expect(mine.build).toBeNull();
    expect(mine.production).toBe(50);
    const note = s.log.find((e) => e.player === 0)!;
    expect(note.text).toContain('Maurya finished the Colossus first');
    // And had it been paid for already, it still wouldn't be built twice.
    mine.build = { kind: 'wonder', id: 'colossus' };
    mine.production = 500;
    processCities(s, 0);
    expect(mine.wonders).toEqual([]);
    expect(mine.build).toBeNull();
  });

  it("wonders can't be bought", () => {
    const s = twoCapitals();
    s.players[0]!.techs = ['masonry'];
    s.players[0]!.gold = 5000;
    cap(s, 0).build = { kind: 'wonder', id: 'pyramids' };
    expect(buyError(s, cap(s, 0))).toBe("Wonders can't be bought");
  });

  it('effects: city production and food, empire science, free Walls, veteran units', () => {
    const s = twoCapitals();
    const c = cap(s, 0);
    const base = cityYields(s, c);
    c.wonders.push('pyramids', 'hanging_gardens');
    const y = cityYields(s, c);
    expect(y.production).toBe(base.production + Math.floor((base.production * 25) / 100));
    expect(y.food).toBe(base.food + 2);

    const other = addCity(s, 0, 4, 2);
    const sciBefore = cityScienceGold(s, other).science;
    c.wonders.push('global_network');
    expect(cityScienceGold(s, other).science).toBe(sciBefore + Math.floor((sciBefore * 50) / 100));

    s.players[0]!.techs = ['construction'];
    c.build = { kind: 'wonder', id: 'great_wall' };
    c.production = WONDERS.great_wall.cost;
    processCities(s, 0);
    expect(c.buildings).toContain('walls');
    expect(other.buildings).toContain('walls');
    expect(cap(s, 1).buildings).not.toContain('walls');

    c.wonders.push('war_academy');
    other.build = { kind: 'unit', id: 'warrior' };
    other.production = 100;
    processCities(s, 0);
    expect(s.units.filter((u) => u.owner === 0 && u.x === other.x && u.y === other.y).every((u) => u.veteran)).toBe(true);
  });

  it('a captured city takes its wonders to the new owner', () => {
    const s = twoCapitals(3);
    const c = cap(s, 1);
    c.wonders.push('grand_bazaar');
    captureCity(s, c, 0);
    expect(c.wonders).toEqual(['grand_bazaar']);
    expect(cityScienceGold(s, cap(s, 0)).gold).toBeGreaterThanOrEqual(0);
  });

  it('every wonder names a real effect and at most two win the game', () => {
    expect(WONDER_LIST.length).toBeGreaterThanOrEqual(12);
    expect(WONDER_LIST.filter((w) => w.victory).map((w) => w.victory).sort()).toEqual(['culture', 'economic']);
    for (const w of WONDER_LIST) expect(Object.keys(w.effects).length, w.id).toBeGreaterThan(0);
  });
});

describe('domination', () => {
  it('holding every rival capital wins; one short does not', () => {
    const s = twoCapitals(3);
    captureCity(s, cap(s, 1), 0);
    expect(capitalsHeld(s, 0)).toEqual({ held: 1, of: 2 });
    expect(dominationWon(s, 0)).toBe(false);
    checkVictory(s);
    expect(s.victory).toBeNull();
    captureCity(s, cap(s, 2), 0);
    expect(dominationWon(s, 0)).toBe(true);
    checkVictory(s);
    expect(s.victory).toMatchObject({ winner: 0, kind: 'domination' });
  });

  it('an eliminated rival counts for its capital (the old "everyone eliminated" win)', () => {
    const s = twoCapitals(3);
    s.players[1]!.alive = false;
    expect(capitalsHeld(s, 0)).toEqual({ held: 1, of: 2 });
    s.players[2]!.alive = false;
    expect(dominationWon(s, 0)).toBe(true);
  });

  it('a rival can win it too, and then you lose', () => {
    const s = twoCapitals(3);
    captureCity(s, cap(s, 0), 2);
    captureCity(s, cap(s, 1), 2);
    checkVictory(s);
    expect(s.victory).toMatchObject({ winner: 2, kind: 'domination' });
  });
});

describe('culture and economic victories', () => {
  it('the World Council needs the culture goal first; finishing it wins', () => {
    const s = twoCapitals();
    const c = cap(s, 0);
    s.players[0]!.techs = ['philosophy'];
    expect(setBuild(s, c.id, { kind: 'wonder', id: 'world_council' }).reason).toBe(`Needs ${VICTORY.cultureGoal} culture (you have 0)`);
    s.players[0]!.culture = VICTORY.cultureGoal;
    expect(setBuild(s, c.id, { kind: 'wonder', id: 'world_council' }).ok).toBe(true);
    c.production = WONDERS.world_council.cost;
    expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
    expect(s.victory).toMatchObject({ winner: 0, kind: 'culture' });
  });

  it('the Global Exchange waits while the treasury is below the goal, then wins', () => {
    const s = twoCapitals();
    const c = cap(s, 0);
    s.players[0]!.techs = ['economics'];
    s.players[0]!.gold = VICTORY.goldGoal;
    expect(setBuild(s, c.id, { kind: 'wonder', id: 'global_exchange' }).ok).toBe(true);
    c.production = WONDERS.global_exchange.cost;
    s.players[0]!.gold = 10; // spent it
    processCities(s, 0);
    expect(c.wonders).toEqual([]);
    expect(c.build).toEqual({ kind: 'wonder', id: 'global_exchange' });
    checkVictory(s);
    expect(s.victory).toBeNull();
    s.players[0]!.gold = VICTORY.goldGoal;
    processCities(s, 0);
    checkVictory(s);
    expect(s.victory).toMatchObject({ winner: 0, kind: 'economic' });
  });
});

describe('technology victory: the spaceship', () => {
  function spaceReady(): GameState {
    const s = twoCapitals(3);
    s.players[0]!.techs = [VICTORY.spaceship.requires];
    return s;
  }

  it('parts are built only in the capital, and launching needs all of them', () => {
    const s = spaceReady();
    const other = addCity(s, 0, 4, 2);
    expect(setBuild(s, other.id, { kind: 'project', id: 'spaceship' }).reason).toBe('Only in your capital');
    const c = cap(s, 0);
    expect(setBuild(s, c.id, { kind: 'project', id: 'spaceship' }).ok).toBe(true);
    for (let i = 0; i < VICTORY.spaceship.parts; i++) {
      expect(launchError(s, 0)).toContain('Needs all');
      c.build = { kind: 'project', id: 'spaceship' };
      c.production = VICTORY.spaceship.partCost;
      processCities(s, 0);
    }
    expect(s.players[0]!.space.parts).toBe(VICTORY.spaceship.parts);
    expect(setBuild(s, c.id, { kind: 'project', id: 'spaceship' }).ok).toBe(false);
    expect(launchError(s, 0)).toBeUndefined();
    // Parts can be bought (unlike wonders).
    expect(applyAction(s, { type: 'launchSpaceship' }).ok).toBe(true);
    expect(s.players[0]!.space.arrivesTurn).toBe(s.turn + VICTORY.spaceship.travelTurns);
    expect(s.log.some((e) => e.kind === 'space' && e.publicText?.includes('launched a spaceship'))).toBe(true);
  });

  it('it arrives, and wins, at the start of the arrival turn, not before', () => {
    const s = spaceReady();
    const sp = s.players[0]!.space;
    sp.parts = VICTORY.spaceship.parts;
    sp.launchedTurn = s.turn;
    sp.arrivesTurn = s.turn + 2;
    // One player at a time; AIs play in between via endTurn (no runAiTurn here, so nothing else changes).
    while (s.turn < sp.arrivesTurn) {
      expect(s.victory).toBeNull();
      endTurn(s);
    }
    expect(s.victory).toMatchObject({ winner: 0, kind: 'technology', turn: sp.arrivesTurn });
  });

  it('capturing the capital before arrival loses the ship', () => {
    const s = spaceReady();
    const sp = s.players[0]!.space;
    Object.assign(sp, { parts: VICTORY.spaceship.parts, launchedTurn: s.turn, arrivesTurn: s.turn + 1 });
    captureCity(s, cap(s, 0), 1);
    expect(s.players[0]!.space).toEqual({ parts: 0, launchedTurn: null, arrivesTurn: null });
    for (let i = 0; i < 6; i++) endTurn(s);
    expect(s.victory).toBeNull();
  });

  it('parts cost gold to buy like any build, in the capital only', () => {
    const s = spaceReady();
    s.players[0]!.gold = 10_000;
    const c = cap(s, 0);
    c.build = { kind: 'project', id: 'spaceship' };
    expect(buyError(s, c)).toBeUndefined();
  });
});

describe('the first win, and Keep playing', () => {
  it('the civ whose turn it is is checked first; later wins never replace the first', () => {
    const s = twoCapitals(3);
    s.players[1]!.space = { parts: 3, launchedTurn: 1, arrivesTurn: 1 };
    s.players[2]!.space = { parts: 3, launchedTurn: 1, arrivesTurn: 1 };
    s.currentPlayer = 2;
    checkVictory(s);
    expect(s.victory!.winner).toBe(2);
    s.currentPlayer = 1;
    checkVictory(s);
    expect(s.victory!.winner).toBe(2);
  });

  it('Keep playing stops the checks and needs a win first', () => {
    const s = twoCapitals(3);
    expect(applyAction(s, { type: 'keepPlaying' }).ok).toBe(false);
    s.players[1]!.space = { parts: 3, launchedTurn: 1, arrivesTurn: 1 };
    checkVictory(s);
    expect(s.victory!.winner).toBe(1);
    expect(applyAction(s, { type: 'keepPlaying' }).ok).toBe(true);
    s.victory = null; // even with the record cleared, nothing new is recorded
    captureCity(s, cap(s, 1), 0);
    captureCity(s, cap(s, 2), 0);
    checkVictory(s);
    expect(s.victory).toBeNull();
  });
});

describe('near-win warnings', () => {
  const pct = (p: number) => Math.ceil((VICTORY.cultureGoal * p) / 100);

  it(`culture and gold warn at ${VICTORY.warnPct}% of the goal, not below`, () => {
    const s = twoCapitals();
    s.players[1]!.culture = pct(VICTORY.warnPct) - 1;
    expect(victoryWarnings(s, 1)).toEqual([]);
    s.players[1]!.culture = pct(VICTORY.warnPct);
    expect(victoryWarnings(s, 1).map((w) => w.kind)).toEqual(['culture']);
    s.players[1]!.gold = Math.ceil((VICTORY.goldGoal * VICTORY.warnPct) / 100);
    expect(victoryWarnings(s, 1).map((w) => w.kind)).toEqual(['culture', 'economic']);
  });

  it('a launch and all capitals but one warn too', () => {
    const s = twoCapitals(3);
    s.players[1]!.space = { parts: 3, launchedTurn: 5, arrivesTurn: 17 };
    expect(victoryWarnings(s, 1)[0]!.text).toBe('Maurya launched a spaceship! It arrives on turn 17. Capture Cap1, their capital, before then to stop it.');
    captureCity(s, cap(s, 2), 1);
    expect(victoryWarnings(s, 1).map((w) => w.kind)).toContain('domination');
  });

  it('each is told once, only about civs you have met, as a panel entry aimed at you', () => {
    const s = twoCapitals(3);
    s.diplomacy.met[0]![2] = false;
    s.diplomacy.met[2]![0] = false;
    s.players[1]!.culture = pct(90);
    s.players[2]!.culture = pct(90);
    issueWarnings(s);
    issueWarnings(s);
    const w = s.log.filter((e) => e.kind === 'warning');
    expect(w).toHaveLength(1);
    expect([w[0]!.player, w[0]!.other]).toEqual([1, 0]);
  });
});

describe('the AI and victory', () => {
  it('each leader leans toward a victory, deterministically', () => {
    const s = makeState([row(10)], { players: 5, peace: true });
    const goals = s.players.map((p) => aiVictoryGoal(s, p.id));
    // babylon (Hammurabi), maurya (Ashoka), mali (Mansa Musa), inca (Pachacuti), franks (Charlemagne)
    expect(goals).toEqual(['technology', 'culture', 'economic', 'domination', 'domination']);
    expect(s.players.map((p) => aiVictoryGoal(s, p.id))).toEqual(goals);
  });

  it('progress pulls the lean along', () => {
    const s = makeState([row(10)], { players: 1 });
    expect(aiVictoryGoal(s, 0)).toBe('technology');
    s.players[0]!.gold = VICTORY.goldGoal;
    expect(aiVictoryGoal(s, 0)).toBe('economic');
  });

  it('builds a victory wonder as soon as it can, and spaceship parts in its capital', () => {
    const s = twoCapitals();
    const c = cap(s, 1);
    addUnit(s, 'warrior', 1, c.x, c.y, { fortified: true });
    s.players[1]!.explored.fill(0); // not expanding
    s.players[1]!.techs = ['philosophy', VICTORY.spaceship.requires];
    s.players[1]!.culture = VICTORY.cultureGoal;
    expect(chooseBuild(s, c)).toEqual({ kind: 'wonder', id: 'world_council' });
    s.players[1]!.culture = 0;
    expect(chooseBuild(s, c)).toEqual({ kind: 'project', id: 'spaceship' });
  });

  it('launches a finished spaceship at once', () => {
    const s = twoCapitals();
    s.players[1]!.techs = [VICTORY.spaceship.requires];
    s.players[1]!.space.parts = VICTORY.spaceship.parts;
    s.currentPlayer = 1;
    runAiTurn(s, 1);
    expect(s.players[1]!.space.launchedTurn).toBe(s.turn);
  });

  it('spends piled-up gold: all science when rich, rush-buys, and back to normal later', () => {
    const s = twoCapitals();
    s.currentPlayer = 0;
    s.players[0]!.kind = 'ai'; // Babylon: goes for technology
    s.players[0]!.gold = 600;
    s.players[0]!.techs = ['writing', 'alphabet'];
    s.players[0]!.explored.fill(0); // nowhere to settle, so it builds rather than expands
    addUnit(s, 'warrior', 0, cap(s, 0).x, cap(s, 0).y, { fortified: true }); // defended, too
    runAiTurn(s, 0);
    expect(aiVictoryGoal(s, 0)).toBe('technology');
    expect(s.players[0]!.scienceRate).toBe(RULES.ai.victory.richScienceRate);
    // It bought something (the Library it chose), so gold went down.
    expect(s.players[0]!.gold).toBeLessThan(600);
    s.players[0]!.gold = RULES.ai.victory.poorGold;
    runAiTurn(s, 0);
    expect(s.players[0]!.scienceRate).toBe(RULES.defaultScienceRate);
  });

  it('an AI going for the economic win saves: low science, no spending below the goal', () => {
    const s = twoCapitals(3);
    s.currentPlayer = 2; // Mali (Mansa Musa)
    s.players[2]!.gold = 1000;
    s.players[2]!.techs = ['writing', 'alphabet'];
    runAiTurn(s, 2);
    expect(aiVictoryGoal(s, 2)).toBe('economic');
    expect(s.players[2]!.scienceRate).toBe(RULES.ai.victory.economicScienceRate);
    expect(s.players[2]!.gold).toBe(1000);
  });
});

describe('save migration v5 → v6', () => {
  function v5Save(): string {
    const s = twoCapitals();
    const raw = JSON.parse(serializeGame(s, 0));
    raw.saveVersion = 5;
    raw.state.version = 5;
    for (const p of raw.state.players) {
      delete p.culture;
      delete p.space;
    }
    for (const c of raw.state.cities) delete c.wonders;
    delete raw.state.victory;
    delete raw.state.keepPlaying;
    delete raw.state.warned;
    return JSON.stringify(raw);
  }

  it('culture starts at 0, no wonders, no spaceship, nobody has won', () => {
    const res = deserializeGame(v5Save());
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    const s = res.state;
    expect(s.version).toBe(STATE_VERSION);
    expect(res.migratedFrom).toBe(5);
    expect(s.players.map((p) => p.culture)).toEqual([0, 0]);
    expect(s.players[0]!.space).toEqual({ parts: 0, launchedTurn: null, arrivesTurn: null });
    expect(s.cities.every((c) => c.wonders.length === 0)).toBe(true);
    expect([s.victory, s.keepPlaying, s.warned]).toEqual([null, false, []]);
    expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
  });

  it('a v2 save still comes all the way forward', () => {
    const raw = JSON.parse(v5Save());
    raw.saveVersion = 2;
    raw.state.version = 2;
    delete raw.state.atWar;
    delete raw.state.diplomacy;
    delete raw.state.aiPlans;
    for (const p of raw.state.players) delete p.techs;
    expect(deserializeGame(JSON.stringify(raw)).kind).toBe('ok');
  });
});
