// Round 19: Dan's playtest bundle. Part A: victory warnings at every step (9), the new-era card's
// data (1), builds and wonders in the log (2), the news log and the log's running count (3),
// the city on a new unit (4), and wins after "Keep playing" (10).

import { describe, expect, it } from 'vitest';
import { ERAS } from '../src/data/techs';
import { VICTORY } from '../src/data/victory';
import { WONDERS } from '../src/data/wonders';
import { RULES } from '../src/data/rules';
import { applyAction } from '../src/game/actions';
import { addLog, entriesSince } from '../src/game/log';
import { createGame } from '../src/game/newGame';
import { deserializeGame, migrationSummary } from '../src/game/save';
import { eraUnlocks } from '../src/game/tech';
import { STATE_VERSION, type GameState } from '../src/game/types';
import { checkVictory, issueWarnings, turnsToVictory, victoryWarnings, warningAdvice } from '../src/game/victory';
import { cityYields } from '../src/game/yields';
import { DEFAULT_SETTINGS, toastMs } from '../src/ui/settings';
import { addCity, addUnit, makeState } from './helpers';

const row = (n: number, ch = 'g') => ch.repeat(n);
const MAP = Array.from({ length: 12 }, () => row(16));

/** You (0) and a rival (1) at peace, both with a capital; the rival builds the Global Exchange. */
function rivalBuilding(opts: { met?: boolean; turns?: number } = {}): GameState {
  const s = makeState(MAP, { peace: true, met: opts.met !== false });
  addCity(s, 0, 2, 2, { name: 'Babylon', capitalOf: 0 });
  const london = addCity(s, 1, 12, 8, { name: 'London', capitalOf: 1, size: 3 });
  const p = s.players[1]!;
  p.techs = ['economics'];
  p.gold = VICTORY.goldGoal;
  london.build = { kind: 'wonder', id: 'global_exchange' };
  const perTurn = cityYields(s, london).production;
  london.production = WONDERS.global_exchange.cost - perTurn * (opts.turns ?? 8);
  return s;
}
const warningsTo = (s: GameState, viewer = 0) => s.log.filter((e) => e.kind === 'warning' && e.other === viewer);

describe('Round 19 item 9: victory warnings at every step', () => {
  it('75%, the goal reached, and the wonder started each warn once', () => {
    const s = rivalBuilding();
    issueWarnings(s);
    expect(warningsTo(s).map((e) => e.ref?.step)).toEqual(['near', 'goal', 'building']);
    const building = warningsTo(s)[2]!;
    expect(building.otherText).toContain('in London: about 8 turns');
    expect(building.ref?.cityId).toBe(s.cities[1]!.id);
    issueWarnings(s);
    expect(warningsTo(s)).toHaveLength(3);
  });

  it('5 turns or less warns once, then every turn from 3', () => {
    const s = rivalBuilding({ turns: 5 });
    issueWarnings(s);
    expect(warningsTo(s).map((e) => e.ref?.step)).toContain('soon');
    issueWarnings(s);
    expect(warningsTo(s).filter((e) => e.ref?.step === 'soon')).toHaveLength(1);
    const london = s.cities[1]!;
    const perTurn = cityYields(s, london).production;
    london.production = WONDERS.global_exchange.cost - perTurn * 3;
    issueWarnings(s);
    expect(warningsTo(s).filter((e) => e.ref?.step === 'countdown')).toHaveLength(1);
    issueWarnings(s); // same turn: nothing new
    expect(warningsTo(s).filter((e) => e.ref?.step === 'countdown')).toHaveLength(1);
    s.turn++;
    london.production += perTurn;
    issueWarnings(s);
    const counts = warningsTo(s).filter((e) => e.ref?.step === 'countdown');
    expect(counts).toHaveLength(2);
    expect(counts[1]!.ref?.turns).toBe(2);
  });

  it('a civ you have not met still warns for the goal and the wonder, without its name', () => {
    const s = rivalBuilding({ met: false });
    issueWarnings(s);
    const steps = warningsTo(s).map((e) => e.ref?.step);
    expect(steps).toEqual(['goal', 'building']);
    for (const e of warningsTo(s)) {
      expect(e.otherText).toContain('An unknown civilization');
      expect(e.otherText).not.toContain('London');
      expect(e.ref?.cityId).toBeUndefined();
    }
  });

  it('an AI switching the wonder to another city warns again', () => {
    const s = rivalBuilding();
    issueWarnings(s);
    const york = addCity(s, 1, 12, 3, { name: 'York', size: 3 });
    s.cities[1]!.build = { kind: 'unit', id: 'warrior' };
    york.build = { kind: 'wonder', id: 'global_exchange' };
    issueWarnings(s);
    const building = warningsTo(s).filter((e) => e.ref?.step === 'building');
    expect(building).toHaveLength(2);
    expect(building[1]!.otherText).toContain('in York');
  });

  it('a spaceship: launched once, then a countdown every turn from 5', () => {
    const s = rivalBuilding();
    s.players[1]!.gold = 0;
    s.cities[1]!.build = null;
    s.players[1]!.space = { parts: 3, launchedTurn: 1, arrivesTurn: 1 + VICTORY.spaceship.travelTurns };
    issueWarnings(s);
    expect(warningsTo(s).map((e) => e.ref?.step)).toEqual(['launched']);
    s.turn = 1 + VICTORY.spaceship.travelTurns - 5;
    issueWarnings(s);
    s.turn++;
    issueWarnings(s);
    expect(warningsTo(s).filter((e) => e.ref?.step === 'countdown').map((e) => e.ref?.turns)).toEqual([5, 4]);
  });

  it('turnsToVictory: the wonder in progress, or the ship in flight', () => {
    const s = rivalBuilding({ turns: 6 });
    expect(turnsToVictory(s, 1)).toBe(6);
    s.players[1]!.gold = 0; // the goal isn't met any more: it can't finish
    expect(turnsToVictory(s, 1)).toBeUndefined();
    s.players[1]!.space = { parts: 3, launchedTurn: 1, arrivesTurn: 4 };
    expect(turnsToVictory(s, 1)).toBe(3);
    expect(turnsToVictory(s, 0)).toBeUndefined();
  });

  it('the advice says what you can do: take the city, declare war, or race them', () => {
    const s = rivalBuilding();
    s.players[0]!.gold = Math.floor(VICTORY.goldGoal * 0.62);
    const london = s.cities[1]!.id;
    const peace = warningAdvice(s, 0, 1, 'economic', london);
    expect(peace).toContain('Declare war and capture London');
    expect(peace).toContain("you're at 62% of the gold goal");
    s.atWar[0]![1] = s.atWar[1]![0] = true;
    expect(warningAdvice(s, 0, 1, 'economic', london)).toContain('You are at war with them: capture London');
    s.diplomacy.met[0]![1] = s.diplomacy.met[1]![0] = false;
    expect(warningAdvice(s, 0, 1, 'economic')).toContain('Explore to find them');
  });

  it('no warnings once the game is decided', () => {
    const s = rivalBuilding();
    s.victory = { winner: 1, kind: 'economic', turn: 1 };
    issueWarnings(s);
    expect(warningsTo(s)).toHaveLength(0);
    expect(victoryWarnings(s, 1).length).toBeGreaterThan(0);
  });
});

describe('Round 19 item 10: wins after "Keep playing"', () => {
  function decided(): GameState {
    const s = makeState(MAP, { peace: true, players: 3 });
    addCity(s, 0, 2, 2, { name: 'Babylon', capitalOf: 0 });
    addCity(s, 1, 12, 8, { name: 'London', capitalOf: 1 });
    addCity(s, 2, 12, 2, { name: 'Niani', capitalOf: 2 });
    s.victory = { winner: 1, kind: 'economic', turn: 150 };
    s.keepPlaying = true;
    return s;
  }

  it('a spaceship still arrives: recorded once, with the plain words', () => {
    const s = decided();
    s.turn = 160;
    s.players[0]!.space = { parts: 3, launchedTurn: 148, arrivesTurn: 160 };
    checkVictory(s);
    expect(s.victory).toEqual({ winner: 1, kind: 'economic', turn: 150 });
    expect(s.laterWins).toEqual([{ winner: 0, kind: 'technology', turn: 160 }]);
    const e = s.log.at(-1)!;
    expect(e.text.startsWith('Your spaceship reached Alpha Centauri! ')).toBe(true);
    expect(e.text).toContain('won on turn 150; this doesn\'t change the result.');
    expect(e.publicText).toContain('(the game was already decided)');
    checkVictory(s);
    expect(s.laterWins).toHaveLength(1);
  });

  it('culture, economic and domination too, and a rival\'s later win is news', () => {
    const s = decided();
    s.cities[0]!.wonders.push('world_council');
    s.cities[2]!.owner = 0; // Niani
    s.cities[1]!.wonders.push('global_exchange'); // the winner's own win isn't counted again
    checkVictory(s);
    expect(s.laterWins.map((w) => w.kind).sort()).toEqual(['culture']);
    s.cities[1]!.owner = 0; // London too: every rival capital
    checkVictory(s);
    expect(s.laterWins.map((w) => w.kind).sort()).toEqual(['culture', 'domination', 'economic']);
    // A rival's: its spaceship lands.
    const t = decided();
    t.players[2]!.space = { parts: 3, launchedTurn: 1, arrivesTurn: 1 };
    checkVictory(t);
    expect(t.laterWins).toEqual([{ winner: 2, kind: 'technology', turn: 1 }]);
    expect(t.log.at(-1)!.publicText).toMatch(/spaceship reached Alpha Centauri \(the game was already decided\)$/);
  });

  it('without Keep playing nothing more is recorded (the game is over)', () => {
    const s = decided();
    s.keepPlaying = false;
    s.players[0]!.space = { parts: 3, launchedTurn: 1, arrivesTurn: 1 };
    checkVictory(s);
    expect(s.laterWins).toEqual([]);
  });
});

describe('Round 19 item 3: the log keeps a running count', () => {
  it('new entries are found even when the log is full (the old length check found none)', () => {
    const s = makeState(MAP);
    for (let i = 0; i < RULES.maxLogEntries + 20; i++) addLog(s, 0, `old ${i}`);
    expect(s.log).toHaveLength(RULES.maxLogEntries);
    const mark = s.logCount;
    const lengthBefore = s.log.length;
    addLog(s, 0, 'new 1');
    addLog(s, 0, 'new 2');
    expect(s.log.slice(lengthBefore)).toEqual([]); // the old way
    expect(entriesSince(s, mark).map((e) => e.text)).toEqual(['new 1', 'new 2']);
  });

  it('End Turn: a building and a unit are logged with their city (and the unit)', () => {
    const s = makeState(MAP, { peace: true });
    const ur = addCity(s, 0, 3, 3, { name: 'Ur', size: 3, build: { kind: 'unit', id: 'warrior' } });
    ur.production = 100;
    addUnit(s, 'warrior', 0, 3, 3);
    addCity(s, 1, 12, 8, { name: 'Taxila' });
    const mark = s.logCount;
    applyAction(s, { type: 'endTurn' });
    const built = entriesSince(s, mark).find((e) => e.kind === 'built' && e.player === 0)!;
    const unit = s.units.find((u) => u.id === built.ref?.unitId)!;
    expect(unit.type).toBe('warrior');
    expect(built.ref).toMatchObject({ cityId: ur.id, item: { kind: 'unit', id: 'warrior' } });
  });

  it('toasts stay longer the more they say, up to 12 seconds', () => {
    expect(toastMs(DEFAULT_SETTINGS, 0)).toBe(4000);
    expect(toastMs(DEFAULT_SETTINGS, 100)).toBe(9000);
    expect(toastMs(DEFAULT_SETTINGS, 1000)).toBe(12000);
    expect(toastMs({ ...DEFAULT_SETTINGS, animationSpeed: 'fast' }, 0)).toBeLessThan(4000);
  });
});

describe('Round 19 item 1: the new-era card', () => {
  it('every era has its flavor line and color', () => {
    for (const e of ERAS) {
      expect(e.flavor.length).toBeGreaterThan(20);
      expect(e.tint).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('what comes with an era: its units, buildings and wonders, not another civ\'s own wonder', () => {
    const med = eraUnlocks('medieval', 'rome');
    expect(med.units).toContain('pikeman');
    expect(med.buildings).toContain('university');
    expect(med.wonders.map((w) => w.id)).toContain('great_library');
    const ind = eraUnlocks('industrial', 'rome');
    expect(ind.wonders.map((w) => w.id)).not.toContain('versailles');
    expect(eraUnlocks('industrial', 'france').wonders.map((w) => w.id)).toContain('versailles');
  });

  it('the era entry carries the era', () => {
    const s = makeState(MAP);
    addCity(s, 0, 3, 3, { name: 'Ur' });
    const p = s.players[0]!;
    p.techs = ['alphabet', 'code_of_laws', 'ceremonial_burial'];
    p.researching = 'monarchy';
    p.science = 100000;
    const mark = s.logCount;
    applyAction(s, { type: 'endTurn' });
    expect(entriesSince(s, mark).find((e) => e.kind === 'era' && e.player === 0)?.ref?.era).toBe('medieval');
  });
});

describe('Round 19 Part A: the save', () => {
  it('a v12 save migrates: no later wins, and the count starts at the log it has', () => {
    const s = createGame({ seed: 5 }) as unknown as Record<string, unknown>;
    delete s.laterWins;
    delete s.logCount;
    (s.log as unknown[]).push({ turn: 1, player: 0, text: 'x' }, { turn: 1, player: 0, text: 'y' });
    s.version = 12;
    const res = deserializeGame(JSON.stringify({ saveVersion: 12, savedAt: 1, state: s }));
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.state.version).toBe(STATE_VERSION);
    expect(res.state.laterWins).toEqual([]);
    expect(res.state.logCount).toBe(res.state.log.length);
    expect(migrationSummary(12)).toContain('victory warnings');
  });
});
