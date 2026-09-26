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

// ---- Part B: obsolete units and upgrades (item 8) ---------------------------------------------

import { UNITS, UNIT_IDS } from '../src/data/units';
import { DIFFICULTIES } from '../src/data/difficulty';
import { buildOptions } from '../src/game/production';
import { learnTech } from '../src/game/tech';
import { aiUpgrade, isObsolete, replacementOf, upgradableUnits, upgradeCost, upgradeError } from '../src/game/upgrades';

describe('Round 19 item 8: obsolete units and upgrades', () => {
  it('every line stays in its domain and never gets weaker', () => {
    for (const id of UNIT_IDS) {
      const to = UNITS[id].upgradesTo;
      if (!to) continue;
      expect(UNITS[to].domain).toBe(UNITS[id].domain);
      // The Transport is the cargo line's end: it carries more but doesn't fight.
      if (to === 'transport') expect(UNITS[to].cargo).toBeGreaterThan(UNITS[id].cargo);
      else expect(UNITS[to].attack).toBeGreaterThanOrEqual(UNITS[id].attack);
      expect(UNITS[to].defense).toBeGreaterThanOrEqual(UNITS[id].defense);
      expect(UNITS[to].cost).toBeGreaterThanOrEqual(UNITS[id].cost);
    }
    // A cargo ship is always there: the Galley's line ends in the Transport.
    expect(UNITS.caravel.upgradesTo).toBe('transport');
    expect(UNITS.transport.upgradesTo).toBeUndefined();
  });

  it('a unit leaves the build list once its replacement is known; the best of the line is the target', () => {
    const s = makeState(MAP);
    const c = addCity(s, 0, 3, 3, { name: 'Ur', size: 3 });
    const p = s.players[0]!;
    p.techs = ['bronze_working'];
    const ids = () => buildOptions(s, c).map((i) => i.id);
    expect(ids()).toContain('spearman');
    expect(ids()).not.toContain('warrior');
    expect(isObsolete(p, 'warrior')).toBe(true);
    p.techs.push('gunpowder'); // no Feudalism: the Pikeman is skipped
    expect(replacementOf(p, 'warrior')).toBe('musketman');
    expect(ids()).not.toContain('spearman');
    expect(ids()).toContain('musketman');
  });

  it('the Stealth Bomber needs both its techs before the Bomber is out of date', () => {
    const s = makeState(MAP);
    const p = s.players[0]!;
    p.techs = ['flight', 'advanced_flight'];
    expect(isObsolete(p, 'bomber')).toBe(false);
    p.techs.push('computers');
    expect(isObsolete(p, 'bomber')).toBe(true);
  });

  it('learning the tech switches a city building the old unit to the new one, keeping production', () => {
    const s = makeState(MAP);
    const c = addCity(s, 0, 3, 3, { name: 'Ur', build: { kind: 'unit', id: 'spearman' }, production: 12 });
    s.players[0]!.techs = ['bronze_working'];
    learnTech(s, 0, 'feudalism', 'Learned Feudalism');
    expect(c.build).toEqual({ kind: 'unit', id: 'pikeman' });
    expect(c.production).toBe(12);
  });

  it('cost: the production difference × 2, at least 10, an army ×3, Legendary dearer', () => {
    const s = makeState(MAP);
    addCity(s, 0, 3, 3, { name: 'Ur' });
    s.players[0]!.techs = ['bronze_working', 'feudalism'];
    const w = addUnit(s, 'warrior', 0, 3, 3);
    expect(upgradeCost(s, w)).toBe((30 - 10) * 2); // → Pikeman
    const sp = addUnit(s, 'spearman', 0, 3, 3);
    expect(upgradeCost(s, sp)).toBe(20);
    const army = addUnit(s, 'warrior', 0, 3, 3, { army: true });
    expect(upgradeCost(s, army)).toBe(120);
    s.difficulty = 'legendary';
    expect(upgradeCost(s, w)).toBe(Math.ceil((40 * DIFFICULTIES.legendary.upgradePct) / 100));
  });

  it('only in your own city, with moves left, gold, and cargo that still fits', () => {
    const s = makeState(MAP);
    addCity(s, 0, 3, 3, { name: 'Ur' });
    addCity(s, 1, 10, 3, { name: 'Taxila' });
    const p = s.players[0]!;
    p.techs = ['bronze_working', 'map_making', 'navigation', 'magnetism', 'steam_engine'];
    const w = addUnit(s, 'warrior', 0, 3, 3);
    expect(upgradeError(s, w)).toBe('Needs 20 gold');
    p.gold = 500;
    expect(upgradeError(s, w)).toBeUndefined();
    const out = addUnit(s, 'warrior', 0, 5, 5);
    expect(upgradeError(s, out)).toBe('Only in one of your cities');
    const theirs = addUnit(s, 'warrior', 0, 10, 3);
    expect(upgradeError(s, theirs)).toBe('Only in one of your cities');
    const frigate = addUnit(s, 'frigate', 0, 3, 3);
    addUnit(s, 'warrior', 0, 3, 3, { carriedBy: frigate.id });
    expect(upgradeError(s, frigate)).toBe('Unload its cargo first');
    const res = applyAction(s, { type: 'upgrade', unitId: w.id });
    expect(res.ok).toBe(true);
    expect(w.type).toBe('spearman');
    expect(upgradeError(s, w)).toBe('Nothing newer to upgrade to');
    const again = addUnit(s, 'warrior', 0, 3, 3, { movesLeft: 0 });
    expect(upgradeError(s, again)).toBe('It has already used its turn');
  });

  it('the AI upgrades from gold above its reserve, defenders first, a few a turn', () => {
    const s = makeState(MAP);
    s.currentPlayer = 1;
    addCity(s, 1, 10, 3, { name: 'Taxila' });
    const p = s.players[1]!;
    p.techs = ['bronze_working'];
    const roamer = addUnit(s, 'warrior', 1, 10, 3);
    const guard = addUnit(s, 'warrior', 1, 10, 3, { fortified: true });
    p.gold = 100 + 20; // one upgrade over a reserve of 100
    expect(aiUpgrade(s, 1, 100)).toBe(1);
    expect(guard.type).toBe('spearman');
    expect(roamer.type).toBe('warrior');
    expect(p.gold).toBe(100);
    expect(upgradableUnits(s, 1).map((x) => x.unit.id)).toEqual([roamer.id]);
  });
});

// ---- Part C: spies (item 11) -----------------------------------------------------------------

import { SPIES } from '../src/data/spies';
import { unitVisibleTo } from '../src/game/fog';
import { stepError } from '../src/game/movement';
import { aiSpyMission, inciteCost, spyAction, spyActionError, spyChance, stealableTechs } from '../src/game/spies';

describe('Round 19 item 11: spies', () => {
  /** You (0) and a rival (1) at peace; the rival's Kish at (10, 5) and capital at (13, 9); your spy at (9, 5). */
  function spyState(opts: { war?: boolean } = {}) {
    const s = makeState(MAP, { peace: !opts.war });
    addCity(s, 0, 2, 2, { name: 'Babylon', capitalOf: 0 });
    const kish = addCity(s, 1, 10, 5, { name: 'Kish', size: 3, build: { kind: 'unit', id: 'warrior' }, production: 8 });
    addCity(s, 1, 13, 9, { name: 'Taxila', capitalOf: 1 });
    const spy = addUnit(s, 'spy', 0, 9, 5);
    s.players[0]!.techs = ['literacy'];
    s.players[1]!.techs = ['literacy', 'alphabet', 'bronze_working'];
    return { s, kish, spy };
  }

  it('the chance: base, less per defender and a Courthouse, more for a veteran, within the limits', () => {
    const { s, kish, spy } = spyState();
    expect(spyChance(s, spy, kish, 'steal')).toBe(55);
    expect(spyChance(s, spy, kish, 'investigate')).toBe(100);
    addUnit(s, 'spearman', 1, 10, 5);
    addUnit(s, 'spearman', 1, 10, 5);
    expect(spyChance(s, spy, kish, 'steal')).toBe(55 + 2 * SPIES.perDefenderPct);
    kish.buildings.push('courthouse');
    expect(spyChance(s, spy, kish, 'steal')).toBe(55 + 2 * SPIES.perDefenderPct + SPIES.defensePct);
    spy.veteran = true;
    expect(spyChance(s, spy, kish, 'steal')).toBe(55 + 2 * SPIES.perDefenderPct + SPIES.defensePct + SPIES.veteranPct);
    for (let i = 0; i < 10; i++) addUnit(s, 'spearman', 1, 10, 5);
    expect(spyChance(s, spy, kish, 'steal')).toBe(SPIES.minPct);
  });

  it('unseen by rivals, except next to their city with a Courthouse; never blocks or defends', () => {
    const { s, kish, spy } = spyState();
    expect(unitVisibleTo(s, 1, spy)).toBe(false);
    kish.buildings.push('courthouse');
    expect(unitVisibleTo(s, 1, spy)).toBe(true);
    // A rival unit can walk onto the spy's tile.
    s.currentPlayer = 1;
    const w = addUnit(s, 'warrior', 1, 8, 5);
    expect(stepError(s, w, { x: 9, y: 5 })).toBeUndefined();
  });

  it('walks into a city at peace, not one at war', () => {
    const { s, spy } = spyState();
    expect(stepError(s, spy, { x: 10, y: 5 })).toBeUndefined();
    const war = spyState({ war: true });
    expect(stepError(war.s, war.spy, { x: 10, y: 5 })).toBeDefined();
    // At war it still acts from next door.
    expect(spyActionError(war.s, war.spy, war.kish, 'sabotage')).toBeUndefined();
  });

  it('investigate always works and leaves a report for a while; the spy is used up', () => {
    const { s, kish, spy } = spyState();
    const res = spyAction(s, spy.id, kish.id, 'investigate');
    expect(res.ok).toBe(true);
    expect(s.units.some((u) => u.id === spy.id)).toBe(false);
    expect(s.players[0]!.intel).toEqual([{ cityId: kish.id, until: s.turn + SPIES.investigateTurns }]);
    const told = s.log.at(-1)!;
    expect(told.other).toBe(1);
    expect(told.otherText).toContain('A spy was seen');
  });

  it('steal, sabotage and incite: success does it and tells the victim without a name', () => {
    const { s, kish, spy } = spyState();
    expect(stealableTechs(s, 0, 1).sort()).toEqual(['alphabet', 'bronze_working']);
    // Whichever way the dice fall, each branch does what it says.
    const res = spyAction(s, spy.id, kish.id, 'steal', 'bronze_working');
    expect(res.ok).toBe(true);
    if (res.spy!.success) {
      expect(s.players[0]!.techs).toContain('bronze_working');
      expect(s.log.at(-1)!.otherText).toBe('A spy stole Bronze Working from Kish!');
    } else {
      expect(s.log.at(-1)!.otherText).toMatch(/^Caught a .* spy trying to steal a technology in Kish!$/);
      expect(s.diplomacy.opinion[1]![0]).toBe(SPIES.caughtOpinion);
    }
  });

  it('incite: costs gold (paid either way), never a capital, cheaper far from the capital; success moves the city and sends its units home', () => {
    const { s, kish, spy } = spyState();
    const taxila = s.cities.find((c) => c.name === 'Taxila')!;
    const cost = inciteCost(s, kish);
    expect(cost).toBeGreaterThan(0);
    expect(spyActionError(s, spy, kish, 'incite')).toBe(`Needs ${cost} gold`);
    s.players[0]!.gold = cost + 5;
    expect(spyActionError(s, spy, taxila, 'incite')).toBe('Go inside or next to the city first');
    // Find dice that make it work (deterministic).
    let won = false;
    for (let seed = 1; seed < 200 && !won; seed++) {
      const t = spyState();
      t.s.players[0]!.gold = cost + 5;
      const g = addUnit(t.s, 'warrior', 1, 10, 5);
      t.s.rngState = seed;
      const r = spyAction(t.s, t.spy.id, t.kish.id, 'incite');
      expect(t.s.players[0]!.gold).toBe(5);
      if (r.spy!.success) {
        won = true;
        expect(t.kish.owner).toBe(0);
        expect(t.kish.capturedTurn).toBe(t.s.turn);
        const tx = t.s.cities.find((c) => c.name === 'Taxila')!;
        expect([g.x, g.y]).toEqual([tx.x, tx.y]);
      }
    }
    expect(won).toBe(true);
  });

  it('the AI goes for a victory wonder first, then the tech leader', () => {
    const { s, kish } = spyState();
    s.players[1]!.techs.push('writing', 'currency');
    expect(aiSpyMission(s, 0, { x: 3, y: 3 })).toMatchObject({ action: 'steal' });
    kish.build = { kind: 'wonder', id: 'global_exchange' };
    kish.production = 40;
    expect(aiSpyMission(s, 0, { x: 3, y: 3 })).toMatchObject({ action: 'sabotage', city: kish });
  });

  it('a v13 save migrates: no spy reports', () => {
    const g = createGame({ seed: 7 }) as unknown as { players: Record<string, unknown>[]; version: number };
    for (const p of g.players) delete p.intel;
    g.version = 13;
    const res = deserializeGame(JSON.stringify({ saveVersion: 13, savedAt: 1, state: g }));
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') expect(res.state.players.every((p) => Array.isArray(p.intel) && p.intel.length === 0)).toBe(true);
  });
});

// ---- Dan's mid-round addition: Modern Infantry and the Drone ------------------------------------

import { reconError } from '../src/game/air';
import { interception } from '../src/game/combat';
import { bestDefender } from '../src/game/ai';
import { airBuild, runAiAir } from '../src/game/aiAir';
import { visibleTiles } from '../src/game/fog';

describe('Round 19 (Dan): Modern Infantry and the Drone', () => {
  it('Modern Infantry tops the foot line and is the AI\'s best defender once known', () => {
    expect(UNITS.rifleman.upgradesTo).toBe('modern_infantry');
    expect(UNITS.modern_infantry.defense).toBeGreaterThan(UNITS.rifleman.defense);
    expect(UNITS.modern_infantry.defense).toBeGreaterThan(UNITS.tank.defense);
    const s = makeState(MAP);
    const c = addCity(s, 1, 10, 5, { name: 'Kish' });
    s.players[1]!.techs = ['conscription', 'automobile', 'mass_production'];
    expect(bestDefender(s, c)).toBe('modern_infantry');
  });

  it('the Drone: cheaper and weaker than the Bomber, longer range and sight; fighters shoot it down easily', () => {
    const d = UNITS.drone;
    expect(d.cost).toBeLessThan(UNITS.bomber.cost);
    expect(d.attack).toBeLessThan(UNITS.bomber.attack);
    expect(d.range!).toBeGreaterThan(UNITS.stealth_bomber.range!);
    expect(d.sight).toBeGreaterThan(UNITS.bomber.sight);
    const s = makeState(MAP);
    addCity(s, 0, 2, 5, { name: 'Ur' });
    addCity(s, 1, 10, 5, { name: 'Kish' });
    const drone = addUnit(s, 'drone', 0, 2, 5);
    addUnit(s, 'fighter', 1, 10, 5);
    addUnit(s, 'warrior', 1, 10, 5);
    addUnit(s, 'warrior', 0, 9, 5); // eyes on the target
    const i = interception(s, drone, { x: 10, y: 5 });
    expect(i?.chance).toBeGreaterThan(0.75);
  });

  it('scouting: in range, away from base, once a turn; the area is seen until the turn ends', () => {
    const s = makeState(MAP, { exploreAll: false });
    addCity(s, 0, 2, 5, { name: 'Ur' });
    const drone = addUnit(s, 'drone', 0, 2, 5);
    expect(reconError(s, drone, { x: 2, y: 5 })).toBe('Pick a tile away from its base');
    expect(reconError(s, drone, { x: 15, y: 5 })).toBe('Out of range (10 tiles)');
    expect(applyAction(s, { type: 'recon', unitId: drone.id, at: { x: 11, y: 5 } }).ok).toBe(true);
    expect(visibleTiles(s, 0)[5 * 16 + 14]).toBe(true);
    expect(reconError(s, drone, { x: 11, y: 5 })).toBe('Already flew this turn');
    s.turn++;
    expect(visibleTiles(s, 0)[5 * 16 + 14]).toBe(false);
    expect(s.players[0]!.explored[5 * 16 + 14]).toBe(1);
  });

  it('the AI builds a Drone and scouts the dark with it', () => {
    const s = makeState(MAP, { exploreAll: false, peace: true });
    const c = addCity(s, 1, 3, 5, { name: 'Kish' });
    s.players[1]!.techs = ['computers', 'flight'];
    expect(airBuild(s, c, false).drone).toBe('drone');
    const drone = addUnit(s, 'drone', 1, 3, 5);
    s.currentPlayer = 1;
    runAiAir(s, 1, null);
    expect(drone.recon?.turn).toBe(s.turn);
    expect(airBuild(s, c, false).drone).toBeUndefined();
  });
});

// ---- Part E: culture borders and referendums (item 7) -------------------------------------

import { BORDERS } from '../src/data/rules';
import { borderRadius, flipProtected, processBorders, pullOn, referendumChance, territory, tileOwner } from '../src/game/borders';
import { foundCityError } from '../src/game/city';
import { chooseBuild } from '../src/game/ai';

describe('Round 19 item 7: culture borders and referendums', () => {
  /** Your big capital at (3, 5) and a small rival town 3 east (founded long ago), plus the rival's capital far off. */
  function flipState() {
    const s = makeState(MAP, { peace: true });
    s.turn = 60;
    const cap = addCity(s, 0, 3, 5, { name: 'Babylon', capitalOf: 0, size: 6, culture: 320, foundedTurn: 1 });
    const town = addCity(s, 1, 6, 5, { name: 'Taxila', size: 1, foundedTurn: 1 });
    addCity(s, 1, 14, 10, { name: 'Pataliputra', capitalOf: 1, foundedTurn: 1 });
    return { s, cap, town };
  }

  it('borders grow with a city\'s culture', () => {
    const { cap } = flipState();
    expect(borderRadius({ ...cap, culture: 0 })).toBe(1);
    expect(borderRadius({ ...cap, culture: BORDERS.radius[1]! })).toBe(2);
    expect(borderRadius({ ...cap, culture: BORDERS.radius[2]! })).toBe(3);
  });

  it('a tile goes to the city with more influence there; a city always holds its own tile', () => {
    const { s, town } = flipState();
    const t = territory(s);
    expect(tileOwner(s, 5, 5, t)).toBe(0); // between them: the capital's culture wins
    expect(tileOwner(s, 6, 5, t)).toBe(1); // the town's own tile
    expect(tileOwner(s, 7, 5, t)).toBe(1); // beyond the capital's reach
    expect(tileOwner(s, 10, 1, t)).toBe(-1);
    expect(pullOn(s, town)?.name).toBe('Babylon');
  });

  it('no city inside another civ\'s borders', () => {
    const { s } = flipState();
    s.currentPlayer = 1;
    const settler = addUnit(s, 'settler', 1, 3, 8);
    expect(tileOwner(s, 3, 8)).toBe(0);
    expect(foundCityError(s, settler.id)).toMatch(/^Inside .*borders$/);
  });

  it('unrest rises (warned once), fades without the pull; capitals and new cities are safe', () => {
    const { s, town, cap } = flipState();
    s.rngState = 1;
    processBorders(s);
    expect(town.unrest).toBe(1);
    processBorders(s);
    expect(town.unrest).toBe(2);
    const warns = () => s.log.filter((e) => e.kind === 'referendum' && e.text.startsWith('Unrest in Taxila'));
    expect(warns()).toHaveLength(1);
    processBorders(s);
    expect(warns()).toHaveLength(1);
    cap.culture = 0; // no pull any more
    const before = town.unrest;
    processBorders(s);
    expect(town.unrest).toBe(before - BORDERS.unrestFade);
    expect(flipProtected(s, cap)).toBe(true);
    town.foundedTurn = s.turn - 5;
    expect(flipProtected(s, town)).toBe(true);
  });

  it('the referendum chance: less per defender and with a Courthouse', () => {
    const { s, town } = flipState();
    expect(referendumChance(s, town)).toBe(BORDERS.votePct);
    addUnit(s, 'warrior', 1, 6, 5);
    expect(referendumChance(s, town)).toBe(BORDERS.votePct + BORDERS.perDefenderPct);
    town.buildings.push('courthouse');
    expect(referendumChance(s, town)).toBe(BORDERS.votePct + BORDERS.perDefenderPct + BORDERS.resistBuildingPct);
  });

  it('a referendum moves the city, sends its units home, and sours the loser', () => {
    let done = false;
    for (let seed = 1; seed < 300 && !done; seed++) {
      const { s, town } = flipState();
      town.unrest = BORDERS.voteAt;
      const w = addUnit(s, 'warrior', 1, 6, 5);
      s.rngState = seed;
      processBorders(s);
      if (town.owner !== 0) continue;
      done = true;
      expect([w.x, w.y]).toEqual([14, 10]);
      expect(town.unrest).toBe(0);
      expect(s.diplomacy.opinion[1]![0]).toBe(BORDERS.lostCityOpinion);
      const e = s.log.at(-1)!;
      expect(e.text).toBe('Referendum! Taxila voted to join Babylon'.replace('Babylon', e.text.split('join ')[1]!));
      expect(e.otherText).toContain('joined you');
    }
    expect(done).toBe(true);
  });

  it('works both ways: your own city can leave you', () => {
    const { s, town } = flipState();
    // Swap: the town is yours, the big city theirs.
    town.owner = 0;
    s.cities[0]!.owner = 1;
    s.cities[0]!.capitalOf = 1;
    expect(pullOn(s, town)?.owner).toBe(1);
  });

  it('the AI builds a Temple in a city under a rival\'s pull', () => {
    const { s, town } = flipState();
    s.players[1]!.techs = ['ceremonial_burial'];
    // Its guards, plus the one more a city in unrest keeps (it asks for that first).
    for (let i = 0; i < 4; i++) addUnit(s, 'warrior', 1, 6, 5);
    town.unrest = 1;
    s.currentPlayer = 1;
    // It has only seen its own surroundings, so it isn't out to settle.
    s.players[1]!.explored.fill(0);
    for (let y = 4; y <= 6; y++) for (let x = 5; x <= 7; x++) s.players[1]!.explored[y * 16 + x] = 1;
    expect(chooseBuild(s, town)).toEqual({ kind: 'building', id: 'temple' });
  });

  it('a v14 save migrates: each city gets its civ\'s culture shared out, no unrest', () => {
    const g = createGame({ seed: 7 }) as unknown as { cities: Record<string, unknown>[]; players: Record<string, unknown>[]; version: number };
    g.players[0]!.culture = 90;
    for (const c of g.cities) {
      delete c.culture;
      delete c.unrest;
    }
    g.version = 14;
    const res = deserializeGame(JSON.stringify({ saveVersion: 14, savedAt: 1, state: g }));
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') expect(res.state.cities.every((c) => c.unrest === 0 && typeof c.culture === 'number')).toBe(true);
  });
});

// ---- Part F: full-screen leader scenes (item 6) -------------------------------------------

import { existsSync } from 'node:fs';
import { PLAYABLE_CIVS } from '../src/data/civs';
import { LEADER_LINES } from '../src/data/leaderLines';
import { faceOnScreen, sceneLayout } from '../src/ui/portraits';
import { isOnDemandFile, precacheEntries } from '../src/pwa/files';

describe('Round 19 item 6: leader scenes', () => {
  const SCREENS = [
    [820, 1180],
    [1180, 820],
    [1920, 1080],
    [1366, 768],
    [768, 1024],
  ] as const;

  it('every leader has a full picture and a focus point', () => {
    for (const c of PLAYABLE_CIVS) {
      expect(existsSync(`src/assets/portraits-full/scene-${c.id}.webp`), c.id).toBe(true);
      expect(c.sceneFocus, c.id).toBeDefined();
    }
  });

  it('on every screen the face is in the picture, away from its edges, and never under the words', () => {
    for (const c of PLAYABLE_CIVS) {
      for (const [w, h] of SCREENS) {
        const { picture, text, wide } = sceneLayout(w, h);
        const face = faceOnScreen(c.sceneFocus!, w, h);
        const margin = Math.min(picture.w, picture.h) * 0.12;
        const where = `${c.id} at ${w}×${h}`;
        expect(face.x, where).toBeGreaterThan(picture.x + margin);
        expect(face.x, where).toBeLessThan(picture.x + picture.w - margin);
        expect(face.y, where).toBeGreaterThan(picture.y + margin);
        expect(face.y, where).toBeLessThan(picture.y + picture.h - margin);
        // The face (about a fifth of the picture's size around its center) stays clear of the words.
        const r = Math.max(picture.w, picture.h) * 0.1;
        if (wide) expect(face.x + r, where).toBeLessThan(text.x);
        else expect(face.y + r, where).toBeLessThan(text.y);
      }
    }
  });

  it('every moment has a line for every attitude', () => {
    for (const moment of Object.values(LEADER_LINES)) for (const mood of ['friendly', 'neutral', 'hostile'] as const) expect(moment[mood].length).toBeGreaterThan(10);
  });

  it('the pictures are downloaded when first shown, not up front', () => {
    expect(isOnDemandFile('/assets/scene-egypt-AbC123.webp')).toBe(true);
    expect(isOnDemandFile('/assets/egypt-AbC123.webp')).toBe(false);
    expect(precacheEntries(['/assets/scene-mali-x.webp', '/index.html'])).toEqual(['/index.html']);
  });
});
