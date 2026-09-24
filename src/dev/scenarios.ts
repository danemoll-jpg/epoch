// Dev test scenarios: small hand-made games that put a hard-to-reach rule one End Turn
// away, so it can be seen on the iPad on demand. Loaded with ?scenario=<id> or from the
// ☰ menu, in the dev server only (main.ts imports this file only when import.meta.env.DEV,
// so it is compiled out of the production build; scripts/check-dist.mjs proves it).
// A scenario never autosaves, so it can't overwrite the real game.
//
// To add one: append an entry to SCENARIOS below, and add its expected outcome to
// tests/scenarios.test.ts (the test also fails if a scenario has no outcome check).

import { BUILDINGS } from '../data/buildings';
import { growthThreshold } from '../data/rules';
import { TECHS, TECH_LIST, type TechId } from '../data/techs';
import type { TerrainId } from '../data/terrain';
import { UNITS, UNIT_IDS } from '../data/units';
import { VICTORY } from '../data/victory';
import { WONDERS } from '../data/wonders';
import { applyAction } from '../game/actions';
import { combatOdds, interception } from '../game/combat';
import { CivName, civName, civVerb } from '../game/conquest';
import { civDef, peaceDesire } from '../game/diplomacy';
import { findOverseasSite } from '../game/aiNaval';
import { tileIndex } from '../game/grid';
import { foodSurplus } from '../game/yields';
import { techCost } from '../game/tech';
import type { City, GameState } from '../game/types';
import { addBarbarians, addCity, addUnit, addVillage, makeState } from './build';
import { BARBARIANS, HUTS, type HutResultKind } from '../data/barbarians';
import { GREAT_PEOPLE, GREAT_PEOPLE_RULES } from '../data/greatPeople';
import { RESOURCES, RESOURCE_IDS } from '../data/resources';
import { addBarbarianUnit } from '../game/barbarians';
import { updateExplored, visibleTiles } from '../game/fog';
import { greatPersonThreshold } from '../game/greatPeople';

/** Appears in every dev bundle and must never appear in dist/ (see scripts/check-dist.mjs). */
export const SCENARIO_MARKER = 'epoch-dev-scenarios';

export interface Scenario {
  id: string;
  /** Short name for the ☰ menu. */
  title: string;
  /** What to do and what should happen, shown on screen while the scenario is loaded. */
  note: string;
  build: () => GameState;
}

const CAPITAL = 'Babylon';

// 16×12 island of mixed land; the city sits at (7, 5). Scenarios repaint the 3×3 around it.
const BASE_MAP = [
  'oooooooooooooooo',
  'occcccccccccccco',
  'ocgggpffgggpgpco',
  'ocgpgggghggpggco',
  'ocggfgpgggfgpgco',
  'ocpgggggggggpgco',
  'ocgghgggggpgfgco',
  'ocggggfgggggpgco',
  'ocpggfggghggggco',
  'ocggpgggfggpggco',
  'occcccccccccccco',
  'oooooooooooooooo',
];

const CITY_X = 7;
const CITY_Y = 5;

/** The base map with the 3×3 block centered on the city replaced by `patch` (3 rows of 3). */
function mapWith(patch?: string[]): string[] {
  const rows = BASE_MAP.map((r) => [...r]);
  if (patch) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) rows[CITY_Y + dy]![CITY_X + dx] = patch[dy + 1]![dx + 1]!;
    }
  }
  return rows.map((r) => r.join(''));
}

/**
 * A game with the human capital at the usual spot. One player by default (no rivals to
 * interfere); the combat scenarios pass 2.
 */
function withCapital(patch: string[] | undefined, city: Partial<City>, players = 1): { state: GameState; city: City } {
  const state = makeState(mapWith(patch), { players });
  const capital = addCity(state, 0, CITY_X, CITY_Y, {
    name: CAPITAL,
    // Something already chosen, so the city panel doesn't pop open over the map.
    build: { kind: 'unit', id: 'warrior' },
    capitalOf: 0,
    ...city,
  });
  state.players[0]!.citiesFounded = 1;
  return { state, city: capital };
}

// ---- combat scenarios (Milestone 4) --------------------------------------------------------
// Your capital at (7, 5); the fight happens just east of it, between (9, 5) and (10, 5). The
// rival (Maurya, player 1) also has its capital, Pataliputra, in the south-east corner, so it
// isn't eliminated by losing one unit.

const RIVAL_CAPITAL = 'Pataliputra';
/**
 * The RNG state the combat scenarios start from. makeState's default happens to roll 0.98
 * first, which would make the first attack in every scenario lose unless its odds were
 * above 98%; from this state the first roll is about 0.48, a fair middle.
 */
const FAIR_DICE = (12345 + 2 * 0x6d2b79f5) >>> 0;
const FRONT = { x: 9, y: 5 };
const ENEMY = { x: 10, y: 5 };

function setTerrain(state: GameState, x: number, y: number, t: TerrainId): void {
  state.map.tiles[tileIndex(state.map, x, y)]!.terrain = t;
}

/**
 * Your capital (with a fortified Warrior at home, so your front-line unit is the one selected
 * at the start) and a rival capital far away, both defended.
 */
function battlefield(): GameState {
  const { state } = withCapital(undefined, {}, 2);
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y, { fortified: true });
  addCity(state, 1, 12, 8, { name: RIVAL_CAPITAL, capitalOf: 1, build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'warrior', 1, 12, 8);
  state.players[1]!.citiesFounded = 1;
  state.rngState = FAIR_DICE;
  return state;
}

/** The win chance (whole percent) of the unit on FRONT attacking ENEMY, for the notes. */
function frontOdds(state: GameState): number {
  const u = state.units.find((x) => x.owner === 0 && x.x === FRONT.x && x.y === FRONT.y)!;
  return Math.round(combatOdds(state, u, ENEMY)!.chance * 100);
}

function combatScenario(): GameState {
  const state = battlefield();
  addUnit(state, 'legion', 0, FRONT.x, FRONT.y);
  addUnit(state, 'spearman', 1, ENEMY.x, ENEMY.y);
  return state;
}

function fortifiedScenario(): GameState {
  const state = battlefield();
  setTerrain(state, ENEMY.x, ENEMY.y, 'hills');
  addUnit(state, 'legion', 0, FRONT.x, FRONT.y);
  addUnit(state, 'spearman', 1, ENEMY.x, ENEMY.y, { veteran: true, fortified: true });
  return state;
}

function wallsScenario(): GameState {
  const state = battlefield();
  addCity(state, 1, ENEMY.x, ENEMY.y, { name: 'Taxila', size: 2, buildings: ['walls'], build: { kind: 'unit', id: 'warrior' } });
  state.players[1]!.citiesFounded = 2;
  addUnit(state, 'catapult', 0, FRONT.x, FRONT.y);
  addUnit(state, 'spearman', 1, ENEMY.x, ENEMY.y);
  return state;
}

function armyScenario(): GameState {
  const state = battlefield();
  for (let i = 0; i < 3; i++) addUnit(state, 'archer', 0, FRONT.x, FRONT.y);
  addUnit(state, 'warrior', 1, ENEMY.x, ENEMY.y);
  return state;
}

/** Three Legions inside your capital (Dan's round 4 report: they couldn't form an army). */
function armyInCityScenario(): GameState {
  const state = battlefield();
  for (let i = 0; i < 3; i++) addUnit(state, 'legion', 0, CITY_X, CITY_Y);
  return state;
}

/**
 * Dan's round 5 case: three Legions and a Warrior on one tile looked like a lone Warrior. The
 * Warrior is the oldest, so it's the one drawn on top. A rival mixed stack sits next to it.
 */
function mixedStackScenario(): GameState {
  const state = battlefield();
  addUnit(state, 'warrior', 0, FRONT.x, FRONT.y);
  for (let i = 0; i < 3; i++) addUnit(state, 'legion', 0, FRONT.x, FRONT.y);
  addUnit(state, 'spearman', 1, FRONT.x + 1, FRONT.y - 1, { fortified: true });
  addUnit(state, 'archer', 1, FRONT.x + 1, FRONT.y - 1);
  return state;
}

function captureScenario(): GameState {
  // Here the rival's capital is the city next to you, walled, with one Warrior; its second
  // city is in the corner so it survives the loss.
  const { state } = withCapital(undefined, {}, 2);
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y, { fortified: true });
  addCity(state, 1, ENEMY.x, ENEMY.y, {
    name: RIVAL_CAPITAL, capitalOf: 1, size: 3, buildings: ['walls', 'granary'], build: { kind: 'unit', id: 'warrior' },
  });
  addCity(state, 1, 12, 8, { name: 'Taxila', build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'warrior', 1, 12, 8);
  state.players[1]!.citiesFounded = 2;
  addUnit(state, 'warrior', 1, ENEMY.x, ENEMY.y);
  addUnit(state, 'legion', 0, FRONT.x, FRONT.y);
  // Fixed dice: the attack wins (it's a 64% shot; this scenario is about what capturing
  // does, so it shouldn't depend on luck).
  state.rngState = (12345 + 0x6d2b79f5) >>> 0;
  return state;
}

/** Your Legion army next to the last rival's only city, held by one Warrior. */
function victoryScenario(): GameState {
  const { state } = withCapital(undefined, {}, 2);
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y, { fortified: true });
  addCity(state, 1, ENEMY.x, ENEMY.y, { name: RIVAL_CAPITAL, capitalOf: 1, build: { kind: 'unit', id: 'warrior' } });
  state.players[1]!.citiesFounded = 1;
  addUnit(state, 'warrior', 1, ENEMY.x, ENEMY.y);
  addUnit(state, 'legion', 0, FRONT.x, FRONT.y, { army: true });
  state.rngState = FAIR_DICE;
  return state;
}

// ---- diplomacy scenarios (Milestone 5) ------------------------------------------------------
// Player 1 is Maurya (Ashoka: not aggressive, happy to trade) unless a scenario swaps in the
// Franks (Charlemagne: the most aggressive). Diplomacy opens from the 🤝 button in the top bar.

const RIVAL = 1;

function rivalName(state: GameState): string {
  return civName(state, RIVAL);
}

/** A two-civ game at peace, both met (unless `met` is false), past the early grace period. */
function diplomacyBase(opts: { met?: boolean; civ?: string } = {}): GameState {
  const { state } = withCapital(undefined, { size: 3 }, 2);
  const met = opts.met !== false;
  state.atWar = [[false, false], [false, false]];
  state.diplomacy.met = [[false, met], [met, false]];
  if (opts.civ) state.players[RIVAL]!.civId = opts.civ;
  state.turn = 30;
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y, { fortified: true });
  const name = opts.civ === 'franks' ? 'Aachen' : RIVAL_CAPITAL;
  addCity(state, RIVAL, 12, 8, { name, capitalOf: RIVAL, size: 3, build: { kind: 'unit', id: 'warrior' } });
  state.players[RIVAL]!.citiesFounded = 1;
  addUnit(state, 'spearman', RIVAL, 12, 8, { fortified: true });
  state.rngState = FAIR_DICE;
  return state;
}

/**
 * Some rules happen on a dice roll at End Turn (an AI's demand, a declaration of war). This
 * finds the first dice (RNG state) for which one End Turn gives the wanted result, so the
 * scenario always shows it. Deterministic: same scenario, same dice.
 */
function withDice(build: () => GameState, wanted: (s: GameState) => boolean): GameState {
  for (let i = 0; i < 5000; i++) {
    const dice = (FAIR_DICE + i * 0x9e3779b9) >>> 0;
    const trial = build();
    trial.rngState = dice;
    applyAction(trial, { type: 'endTurn' });
    if (wanted(trial)) {
      const state = build();
      state.rngState = dice;
      return state;
    }
  }
  throw new Error('no dice found for the scenario');
}

function firstContactScenario(): GameState {
  // Your Warrior at (9, 5) is 2 tiles from their Warrior at (11, 5): out of sight both ways
  // (units see 1 tile). One step east and you meet.
  const state = diplomacyBase({ met: false });
  addUnit(state, 'warrior', 0, FRONT.x, FRONT.y);
  addUnit(state, 'warrior', RIVAL, FRONT.x + 2, FRONT.y);
  return state;
}

function peaceScenario(): GameState {
  // At war for 10 turns; they've lost 3 units to you and taken none.
  const state = diplomacyBase();
  state.atWar = [[false, true], [true, false]];
  state.diplomacy.warStart = [[null, state.turn - 10], [state.turn - 10, null]];
  state.diplomacy.warLosses[RIVAL]![0] = 3;
  addUnit(state, 'legion', 0, FRONT.x, FRONT.y);
  addUnit(state, 'legion', 0, FRONT.x, FRONT.y - 1);
  addUnit(state, 'warrior', RIVAL, ENEMY.x, ENEMY.y);
  return state;
}

function demandBase(): GameState {
  // The Franks (the most aggressive leader) with a strong army, next door. You have 100 gold.
  const state = diplomacyBase({ civ: 'franks' });
  state.players[0]!.gold = 100;
  state.players[0]!.techs = ['bronze_working'];
  state.players[RIVAL]!.techs = ['bronze_working', 'iron_working'];
  addUnit(state, 'legion', RIVAL, 12, 8, { army: true });
  return state;
}

function techTradeScenario(): GameState {
  // Maurya likes you (friendly), knows Pottery, and lacks your Bronze Working.
  const state = diplomacyBase();
  state.diplomacy.opinion[RIVAL]![0] = 5;
  state.players[0]!.techs = ['bronze_working'];
  state.players[RIVAL]!.techs = ['pottery', 'alphabet'];
  return state;
}

function aiWarBase(): GameState {
  // The Franks, much stronger, with a Legion army in Aachen, 5 tiles from Babylon.
  const state = diplomacyBase({ civ: 'franks' });
  state.players[RIVAL]!.techs = ['bronze_working', 'iron_working'];
  addUnit(state, 'spearman', RIVAL, 12, 8);
  addUnit(state, 'legion', RIVAL, 12, 8, { army: true });
  return state;
}

function defeatScenario(): GameState {
  // Your last city, size 1, with one Warrior; three rival Legions next to it.
  const { state } = withCapital(undefined, { size: 1 }, 2);
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y);
  addCity(state, 1, 12, 8, { name: RIVAL_CAPITAL, capitalOf: 1, build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'warrior', 1, 12, 8);
  state.players[1]!.citiesFounded = 1;
  for (const y of [4, 5, 6]) addUnit(state, 'legion', 1, CITY_X + 1, y);
  return state;
}

/**
 * Round 7 icon check: one of each unit type at map size (two rows north and south of your
 * capital), plus an army, a veteran, a fortified unit, and a mixed stack, and a few rival
 * units in their color. Everyone is at peace, so nothing fights.
 */
function allUnitsScenario(): GameState {
  const { state } = withCapital(undefined, {}, 2);
  state.atWar = [[false, false], [false, false]];
  // Row 1 (y = 3) and row 2 (y = 7): every type in table order, left to right.
  UNIT_IDS.filter((id) => UNITS[id].domain === 'land').forEach((id, i) => {
    const x = 2 + (i % 12);
    const y = i < 12 ? 3 : 7;
    addUnit(state, id, 0, x, y);
  });
  addUnit(state, 'legion', 0, 6, 7, { army: true });
  addUnit(state, 'spearman', 0, 8, 7, { veteran: true });
  addUnit(state, 'pikeman', 0, 10, 7, { fortified: true });
  // A mixed stack: a Musketman on top of two Archers.
  addUnit(state, 'musketman', 0, 12, 7);
  addUnit(state, 'archer', 0, 12, 7);
  addUnit(state, 'archer', 0, 12, 7);
  // Rival units in their own color along the south coast.
  for (const [i, id] of (['warrior', 'knight', 'rifleman', 'tank'] as const).entries()) addUnit(state, id, 1, 4 + i * 2, 9);
  addCity(state, 1, 12, 9, { name: RIVAL_CAPITAL, capitalOf: 1, build: { kind: 'unit', id: 'warrior' } });
  state.players[1]!.citiesFounded = 1;
  return state;
}

// ---- wonders and victory scenarios (Milestone 6) ------------------------------------------

/** Your capital building `wonder` with the production one turn short. */
function wonderScenario(): GameState {
  const { state, city } = withCapital(undefined, { size: 3, build: { kind: 'wonder', id: 'pyramids' } });
  state.players[0]!.techs = ['masonry'];
  city.production = WONDERS.pyramids.cost - 1;
  return state;
}

/**
 * You and Maurya both build the Colossus; theirs is one turn from done, yours is not. Maurya
 * leans to culture (wonders before buildings), sees no open city site, and has its two
 * defenders, so it keeps building the Colossus.
 */
function wonderRaceScenario(): GameState {
  const { state, city } = withCapital(undefined, { size: 3, build: { kind: 'wonder', id: 'colossus' } }, 2);
  state.atWar = [[false, false], [false, false]];
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y, { fortified: true });
  city.production = 40;
  for (const p of state.players) p.techs = ['bronze_working'];
  const rival = addCity(state, 1, 12, 8, {
    name: RIVAL_CAPITAL, capitalOf: 1, size: 3, build: { kind: 'wonder', id: 'colossus' }, production: WONDERS.colossus.cost - 1,
  });
  state.players[1]!.citiesFounded = 1;
  addUnit(state, 'spearman', 1, rival.x, rival.y, { fortified: true });
  addUnit(state, 'spearman', 1, rival.x, rival.y, { fortified: true });
  // Maurya has only seen the tiles around its city, so it isn't looking to expand.
  const seen = state.players[1]!.explored;
  seen.fill(0);
  for (let y = rival.y - 1; y <= rival.y + 1; y++) for (let x = rival.x - 1; x <= rival.x + 1; x++) seen[tileIndex(state.map, x, y)] = 1;
  return state;
}

/**
 * Three civs: you already hold Maurya's capital (Taxila is left to them); Mali's capital, next
 * to your Legion army, is the last one you need.
 */
function winDominationScenario(): GameState {
  const { state } = withCapital(undefined, {}, 3);
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y, { fortified: true });
  addCity(state, 0, 4, 8, { name: RIVAL_CAPITAL, capitalOf: 1, build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'warrior', 0, 4, 8, { fortified: true });
  addCity(state, 1, 13, 2, { name: 'Taxila', build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'warrior', 1, 13, 2);
  state.players[1]!.citiesFounded = 2;
  addCity(state, 2, ENEMY.x, ENEMY.y, { name: 'Niani', capitalOf: 2, build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'warrior', 2, ENEMY.x, ENEMY.y);
  state.players[2]!.citiesFounded = 1;
  addUnit(state, 'legion', 0, FRONT.x, FRONT.y, { army: true });
  state.rngState = FAIR_DICE;
  return state;
}

/** Your capital one turn from finishing a victory wonder, with the goal already reached. */
function winWonderScenario(kind: 'culture' | 'economic'): GameState {
  const id = kind === 'culture' ? 'world_council' : 'global_exchange';
  const { state, city } = withCapital(undefined, { size: 3, build: { kind: 'wonder', id } });
  const p = state.players[0]!;
  p.techs = [WONDERS[id].requires];
  if (kind === 'culture') p.culture = VICTORY.cultureGoal;
  else p.gold = VICTORY.goldGoal;
  city.production = WONDERS[id].cost - 1;
  return state;
}

function launched(state: GameState, player: number, arrives: number): void {
  const p = state.players[player]!;
  p.techs = [VICTORY.spaceship.requires];
  p.space = { parts: VICTORY.spaceship.parts, launchedTurn: arrives - VICTORY.spaceship.travelTurns, arrivesTurn: arrives };
}

/** Your spaceship arrives at the start of next turn. */
function winSpaceScenario(): GameState {
  const { state } = withCapital(undefined, { size: 3 });
  state.turn = 200;
  launched(state, 0, state.turn + 1);
  return state;
}

/** Maurya's spaceship arrives at the start of next turn, far out of your reach. */
function loseSpaceScenario(): GameState {
  const state = diplomacyBase();
  state.turn = 200;
  launched(state, RIVAL, state.turn + 1);
  return state;
}

/**
 * Three civs. Maurya's ship arrives in 3 turns, and its capital, Pataliputra, is next to your
 * Legion army with one Warrior in it. Mali, far away, keeps this from being a domination win.
 */
function stopLaunchScenario(): GameState {
  const { state } = withCapital(undefined, {}, 3);
  state.turn = 200;
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y, { fortified: true });
  addCity(state, RIVAL, ENEMY.x, ENEMY.y, { name: RIVAL_CAPITAL, capitalOf: RIVAL, size: 3, build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'warrior', RIVAL, ENEMY.x, ENEMY.y);
  addCity(state, RIVAL, 12, 8, { name: 'Taxila', build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'spearman', RIVAL, 12, 8, { fortified: true });
  state.players[RIVAL]!.citiesFounded = 2;
  addCity(state, 2, 13, 2, { name: 'Niani', capitalOf: 2, build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'spearman', 2, 13, 2, { fortified: true });
  state.players[2]!.citiesFounded = 1;
  launched(state, RIVAL, state.turn + 3);
  addUnit(state, 'legion', 0, FRONT.x, FRONT.y, { army: true });
  state.rngState = FAIR_DICE;
  return state;
}

/** Maurya, met and at peace, has culture just past the warning line. */
function nearWinScenario(): GameState {
  const state = diplomacyBase();
  state.players[RIVAL]!.culture = Math.ceil((VICTORY.cultureGoal * (VICTORY.warnPct + 5)) / 100);
  return state;
}

/** Research `tech` with the pool one point short of its cost, so it finishes next turn. */
function oneTurnFromLearning(state: GameState, known: TechId[], tech: TechId): void {
  const p = state.players[0]!;
  p.techs = [...known];
  p.researching = tech;
  p.science = techCost(p, tech) - 1;
}

// ---- naval scenarios (Round 8) -------------------------------------------------------------
// A 16×12 sea: your island in the west, another landmass to the east. Water next to land is
// coast (light blue; a Galley can go there), water farther out is ocean (dark blue).

/** `land(x, y)` gives the terrain letter of each land tile; everything else is water. */
function seaMap(land: (x: number, y: number) => string | undefined): string[] {
  const W = 16;
  const H = 12;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? land(x, y) : undefined);
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const t = at(x, y);
      if (t) {
        row += t;
        continue;
      }
      let coast = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy)) coast = true;
      row += coast ? 'c' : 'o';
    }
    rows.push(row);
  }
  return rows;
}

/** A little variety on the islands, the same every time. */
function islandTerrain(x: number, y: number): string {
  const k = (x * 7 + y * 3) % 11;
  return k === 0 ? 'f' : k === 5 ? 'p' : k === 8 ? 'h' : 'g';
}

const WEST = { x0: 1, x1: 5, y0: 2, y1: 9 };
/** Your capital: on the east shore of your island, so it's a port. */
const PORT = { x: 5, y: 5 };

/**
 * Your island plus an eastern landmass starting at column `eastX`: 8 leaves a two-tile coast
 * channel (a Galley can cross), 10 leaves open ocean in between (it can't).
 */
function seaState(eastX: number, players = 1, opts: { peace?: boolean } = {}): GameState {
  const inside = (x: number, y: number, r: { x0: number; x1: number; y0: number; y1: number }) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  const state = makeState(
    seaMap((x, y) => (inside(x, y, WEST) || inside(x, y, { x0: eastX, x1: 14, y0: 2, y1: 9 }) ? islandTerrain(x, y) : undefined)),
    { players, peace: opts.peace },
  );
  addCity(state, 0, PORT.x, PORT.y, { name: CAPITAL, capitalOf: 0, size: 2, build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = 1;
  state.players[0]!.techs = ['alphabet', 'map_making'];
  return state;
}

/** A rival capital on the eastern landmass, with a Warrior at home. */
function eastRival(state: GameState, x = 13, y = 7): City {
  const city = addCity(state, 1, x, y, { name: RIVAL_CAPITAL, capitalOf: 1, build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'warrior', 1, x, y, { fortified: true });
  state.players[1]!.citiesFounded = 1;
  return city;
}

function boardUnloadScenario(): GameState {
  const state = seaState(8);
  addUnit(state, 'galley', 0, PORT.x, PORT.y);
  addUnit(state, 'settler', 0, PORT.x, PORT.y);
  addUnit(state, 'warrior', 0, PORT.x, PORT.y);
  return state;
}

function galleyCoastScenario(): GameState {
  const state = seaState(10);
  addUnit(state, 'galley', 0, 6, 5);
  addUnit(state, 'caravel', 0, 6, 6);
  state.players[0]!.techs.push('navigation');
  return state;
}

function navalBattleScenario(): GameState {
  const state = seaState(10, 2);
  eastRival(state);
  addUnit(state, 'frigate', 0, 7, 5);
  addUnit(state, 'frigate', 1, 8, 5);
  state.rngState = FAIR_DICE;
  return state;
}

/** Your Frigate off the coast, next to their city at (8, 5) with one Warrior inside. */
function bombardScenario(): GameState {
  const state = seaState(8, 2);
  eastRival(state);
  addCity(state, 1, 8, 5, { name: 'Taxila', build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'warrior', 1, 8, 5);
  addUnit(state, 'frigate', 0, 7, 5);
  state.rngState = FAIR_DICE;
  return state;
}

/** Your Galley with a Settler and a Warrior aboard, next to their Frigate. */
function shipSunkBase(): GameState {
  const state = seaState(10, 2);
  eastRival(state);
  const galley = addUnit(state, 'galley', 0, 6, 4);
  addUnit(state, 'settler', 0, 6, 4, { carriedBy: galley.id });
  addUnit(state, 'warrior', 0, 6, 4, { carriedBy: galley.id });
  addUnit(state, 'frigate', 1, 7, 4);
  return state;
}

/** Your Galley with a Legion aboard, next to their empty city at (8, 5). */
function amphibiousScenario(): GameState {
  const state = seaState(8, 2);
  eastRival(state);
  addCity(state, 1, 8, 5, { name: 'Taxila', build: { kind: 'unit', id: 'warrior' } });
  const galley = addUnit(state, 'galley', 0, 7, 5);
  addUnit(state, 'legion', 0, 7, 5, { carriedBy: galley.id });
  return state;
}

/** Your capital on a spit of land in a lagoon: it works water tiles; the Harbor is one turn from done. */
function harborScenario(): GameState {
  const { state, city } = withCapital(['ccc', 'cgc', 'ccc'], { size: 3, build: { kind: 'building', id: 'harbor' } });
  state.players[0]!.techs = ['alphabet', 'pottery', 'map_making', 'seafaring'];
  city.production = BUILDINGS.harbor.cost - 1;
  return state;
}

/**
 * Maurya (player 1) is boxed in on a 3×3 island with a Galley in port, a Settler, and a Warrior
 * outside the city (a free escort); a good empty site lies across a coast channel on the
 * landmass where your capital is. Your Warrior stands next to that site, so you'll see them land.
 */
function aiOverseasScenario(): GameState {
  const AI_ISLAND = { x0: 1, x1: 3, y0: 4, y1: 6 };
  const HOME = { x0: 6, x1: 13, y0: 2, y1: 9 };
  const inside = (x: number, y: number, r: typeof HOME) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  const state = makeState(seaMap((x, y) => (inside(x, y, AI_ISLAND) || inside(x, y, HOME) ? islandTerrain(x, y) : undefined)), { players: 2, peace: true });
  addCity(state, 0, 11, 5, { name: CAPITAL, capitalOf: 0, size: 2, build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = 1;
  addCity(state, 1, 3, 5, { name: RIVAL_CAPITAL, capitalOf: 1, size: 2, build: { kind: 'building', id: 'granary' } });
  addUnit(state, 'warrior', 1, 3, 5, { fortified: true });
  addUnit(state, 'galley', 1, 3, 5);
  addUnit(state, 'settler', 1, 3, 5);
  addUnit(state, 'warrior', 1, 2, 5);
  state.players[1]!.citiesFounded = 1;
  state.players[1]!.techs = ['alphabet', 'map_making', 'pottery'];
  state.players[1]!.researching = 'writing';
  // Where they'll go, so your Warrior can watch from next door.
  const site = findOverseasSite(state, 1, 'galley')!;
  addUnit(state, 'warrior', 0, site.target.x + 1, site.target.y, { fortified: true });
  return state;
}

/** One of each ship around your island, a Galley with two units aboard (cargo badge), and a rival Frigate. */
function allShipsScenario(): GameState {
  const { state } = withCapital(undefined, {}, 2);
  state.atWar = [[false, false], [false, false]];
  // The coast ring: row 1 across the top, then down the east side.
  const ships = UNIT_IDS.filter((id) => UNITS[id].domain === 'sea');
  ships.forEach((id, i) => addUnit(state, id, 0, 3 + i, 1));
  const galley = addUnit(state, 'galley', 0, 14, 4);
  addUnit(state, 'settler', 0, 14, 4, { carriedBy: galley.id });
  addUnit(state, 'warrior', 0, 14, 4, { carriedBy: galley.id });
  addUnit(state, 'frigate', 1, 14, 5);
  addCity(state, 1, 12, 8, { name: RIVAL_CAPITAL, capitalOf: 1, build: { kind: 'unit', id: 'warrior' } });
  state.players[1]!.citiesFounded = 1;
  return state;
}

/** Three of your Frigates at sea (one carrying a Warrior), next to a Mauryan Frigate. */
function fleetScenario(): GameState {
  const state = seaState(10, 2);
  eastRival(state);
  const ships = [0, 1, 2].map(() => addUnit(state, 'frigate', 0, 7, 5));
  addUnit(state, 'warrior', 0, 7, 5, { carriedBy: ships[1]!.id });
  addUnit(state, 'frigate', 1, 8, 5);
  state.rngState = FAIR_DICE;
  return state;
}

/** The fleet scenario's odds before and after forming the fleet (whole percent). */
function fleetOdds(): [number, number] {
  const s = fleetScenario();
  const before = oddsAt(s, { x: 7, y: 5 }, { x: 8, y: 5 });
  applyAction(s, { type: 'formArmy', unitId: s.units.find((u) => u.owner === 0 && u.type === 'frigate')!.id });
  return [before, oddsAt(s, { x: 7, y: 5 }, { x: 8, y: 5 })];
}

/** The win chance (whole percent) of your unit at `from` attacking `at`, for the notes. */
function oddsAt(state: GameState, from: { x: number; y: number }, at: { x: number; y: number }): number {
  const u = state.units.find((x) => x.owner === 0 && x.x === from.x && x.y === from.y && x.carriedBy === null)!;
  return Math.round(combatOdds(state, u, at)!.chance * 100);
}

// ---- Round 9: barbarians, villages, artifacts, resources, huts, Great People ----------------
// The village sits east of your capital, at (10, 5), next to your unit at (9, 5).

const VILLAGE = { x: 10, y: 5 };

/** Your capital, plus the barbarians (they play last, at war with everyone). */
function withBarbarians(patch?: string[], city: Partial<City> = {}): { state: GameState; city: City } {
  const made = withCapital(patch, city);
  addBarbarians(made.state);
  made.state.rngState = FAIR_DICE;
  return made;
}

/**
 * Finds the first RNG state for which `check` (run on a fresh copy of the scenario) is true,
 * and returns the scenario with those dice. For rules decided by a roll during an action
 * (an artifact), so the note can promise the result.
 */
function withDiceFor(build: () => GameState, check: (s: GameState) => boolean): GameState {
  for (let i = 0; i < 5000; i++) {
    const dice = (FAIR_DICE + i * 0x9e3779b9) >>> 0;
    const trial = build();
    trial.rngState = dice;
    if (check(trial)) {
      const state = build();
      state.rngState = dice;
      return state;
    }
  }
  throw new Error('no dice found for the scenario');
}

/** A village with 3 of 4 flags, one turn from its 4th; your fortified Spearman keeps watch next to it. */
function villageSpawnBase(): GameState {
  const { state } = withBarbarians();
  state.turn = BARBARIANS.graceTurns + 2;
  addUnit(state, 'spearman', 0, 10, 7, { fortified: true });
  addVillage(state, 9, 7, { flags: BARBARIANS.flagsToSpawn - 1, progress: BARBARIANS.turnsPerFlag - 1 });
  return state;
}

function villageSpawnScenario(): GameState {
  // Dice where the new unit comes out on a tile you can see.
  return withDice(villageSpawnBase, (s) => {
    const vis = visibleTiles(s, 0);
    return s.units.some((u) => u.owner !== 0 && !u.fortified && vis[tileIndex(s.map, u.x, u.y)] === true);
  });
}

/** Your Legion at (9, 5) next to a village held by a fortified barbarian Warrior. */
function takeVillageScenario(): GameState {
  const { state } = withBarbarians();
  addUnit(state, 'legion', 0, FRONT.x, FRONT.y);
  addVillage(state, VILLAGE.x, VILLAGE.y);
  return state;
}

/** Your Warrior at (9, 5) next to an empty village (its defender is out). */
function emptyVillageBase(extra: (s: GameState) => void = () => {}): GameState {
  const { state } = withBarbarians();
  addUnit(state, 'warrior', 0, FRONT.x, FRONT.y);
  addVillage(state, VILLAGE.x, VILLAGE.y, {}, null);
  extra(state);
  return state;
}

/** Walks your Warrior in and makes the choice, on a copy: did an artifact turn up? */
function artifactWith(s: GameState, choice: 'destroy' | 'settle'): boolean {
  const w = s.units.find((u) => u.owner === 0)!;
  applyAction(s, { type: 'move', unitId: w.id, to: VILLAGE });
  const v = s.villages[0]!;
  return !!applyAction(s, { type: 'chooseVillage', villageId: v.id, choice }).village?.artifact;
}

function villageArtifactScenario(): GameState {
  const base = () => emptyVillageBase((s) => {
    s.players[0]!.techs = ['alphabet'];
    s.players[0]!.researching = 'writing';
  });
  return withDiceFor(base, (s) => {
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    return artifactWith(s, 'destroy') && artifactWith(copy, 'settle');
  });
}

function villageResourceScenario(): GameState {
  return emptyVillageBase((s) => {
    setTerrain(s, VILLAGE.x, VILLAGE.y, 'hills');
    s.map.tiles[tileIndex(s.map, VILLAGE.x, VILLAGE.y)]!.resource = 'iron';
  });
}

const RAID_CITY = 'Ur';

/** Ur, size 3 with nobody home, and a barbarian Archer next to it. You have 100 gold. */
function barbarianRaidScenario(): GameState {
  const { state } = withBarbarians();
  addCity(state, 0, 11, 8, { name: RAID_CITY, size: 3, build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = 2;
  state.players[0]!.gold = 100;
  // All trade to science, so the treasury holds exactly 100 when the raid comes.
  state.players[0]!.scienceRate = 100;
  addBarbarianUnit(state, 'archer', { x: 12, y: 8 });
  state.units.find((u) => u.type === 'archer')!.movesLeft = UNITS.archer.moves;
  return state;
}

/** Five huts in a column east of your capital, each with a Warrior next to it and a set result. */
const HUT_ROWS: { y: number; result: HutResultKind; says: string }[] = [
  { y: 3, result: 'gold', says: `${HUTS.goldMin}–${HUTS.goldMax} gold` },
  { y: 4, result: 'map', says: 'the map around it' },
  { y: 5, result: 'unit', says: 'a free Warrior or Horseman' },
  { y: 6, result: 'tech', says: 'Pottery (what you’re researching)' },
  { y: 7, result: 'barbarians', says: `${HUTS.barbarianCount} barbarians appear` },
];

function hutScenario(): GameState {
  const { state } = withCapital(undefined, {});
  addBarbarians(state);
  state.rngState = FAIR_DICE;
  state.turn = HUTS.barbariansFromTurn + 5;
  // Only the land near Babylon is known, so the map result shows something new.
  state.players[0]!.explored.fill(0);
  state.players[0]!.researching = 'pottery';
  for (const row of HUT_ROWS) {
    addUnit(state, 'warrior', 0, 8, row.y);
    const tile = state.map.tiles[tileIndex(state.map, 9, row.y)]!;
    tile.hut = true;
    tile.hutResult = row.result;
  }
  updateExplored(state, 0);
  return state;
}

/** Babylon one culture short of its first Great Person, researching Writing. */
function greatPersonBase(): GameState {
  const { state } = withCapital(undefined, { buildings: ['temple'] });
  state.players[0]!.techs = ['alphabet', 'ceremonial_burial'];
  state.players[0]!.researching = 'writing';
  state.players[0]!.culture = greatPersonThreshold(0) - 1;
  return state;
}

function greatPersonScenario(): GameState {
  return withDice(greatPersonBase, (s) => s.greatPeople[0]?.kind === 'scientist');
}

/** A Great Engineer is waiting; Babylon is building the Pyramids with a long way to go. */
function engineerWonderScenario(): GameState {
  const { state, city } = withCapital(undefined, { size: 3, build: { kind: 'wonder', id: 'pyramids' } });
  state.players[0]!.techs = ['masonry'];
  city.production = 10;
  const name = GREAT_PEOPLE.engineer.names[0]!;
  state.greatPeople.push({ id: state.nextId++, owner: 0, kind: 'engineer', name, turn: 1 });
  state.greatPeopleNames.push(name);
  return state;
}

/** One of each resource along the north of the island (row 3, then row 7), hidden ones revealed; fish and whales at sea. */
function allResourcesScenario(): GameState {
  const { state } = withCapital(undefined, {});
  let land = 0;
  for (const id of RESOURCE_IDS) {
    const def = RESOURCES[id];
    const water = def.terrains.every((t) => t === 'coast' || t === 'ocean');
    const at = water ? (id === 'fish' ? { x: 5, y: 1 } : { x: 9, y: 0 }) : land < 12 ? { x: 2 + land, y: 3 } : { x: 2 + land - 12, y: 7 };
    if (!water) land++;
    const tile = state.map.tiles[tileIndex(state.map, at.x, at.y)]!;
    tile.terrain = def.terrains[0]!;
    tile.resource = id;
    if (def.hidden) tile.revealed = true;
  }
  return state;
}

/** The order the all-resources scenario lays them out in (land ones, then the two at sea). */
function resourceOrder(): string {
  const land = RESOURCE_IDS.filter((id) => !RESOURCES[id].terrains.every((t) => t === 'coast' || t === 'ocean'));
  return land.map((id) => RESOURCES[id].name).join(', ');
}

// ---- Round 10: aircraft ----------------------------------------------------------------------
// Your capital at (7, 5) is the air base; the target sits 3 tiles east at (10, 5). The rival's
// capital, Pataliputra, is at (12, 8). You and Maurya are at war.

const AIR_TARGET = { x: 10, y: 5 };

/** The air battlefield: your capital with a fortified Warrior, the rival capital, Flight known. */
function airfield(): GameState {
  const state = battlefield();
  state.players[0]!.techs = ['flight'];
  return state;
}

const mine = (s: GameState, type: string) => s.units.find((u) => u.owner === 0 && u.type === type)!;

/** The win chance (whole percent) of your unit of this type attacking `at`, for the notes. */
function airOdds(state: GameState, type: string, at: { x: number; y: number }): number {
  return Math.round(combatOdds(state, mine(state, type), at)!.chance * 100);
}

function airStrikeBase(): GameState {
  const state = airfield();
  addUnit(state, 'bomber', 0, CITY_X, CITY_Y);
  addUnit(state, 'musketman', 1, AIR_TARGET.x, AIR_TARGET.y);
  // Aircraft strike only what you can see: a Warrior keeps the target in sight.
  addUnit(state, 'warrior', 0, FRONT.x, FRONT.y - 1, { fortified: true });
  return state;
}

const strike = (s: GameState, at = AIR_TARGET) => applyAction(s, { type: 'attack', unitId: mine(s, 'bomber').id, at });

function airStrikeScenario(): GameState {
  return withDiceFor(airStrikeBase, (s) => !!strike(s).combat?.attackerWon);
}

/** A Mauryan Fighter in Pataliputra, 3 tiles from the target: it intercepts your Bomber. */
function interceptBase(): GameState {
  const state = airStrikeBase();
  state.players[1]!.techs = ['flight'];
  addUnit(state, 'fighter', 1, 12, 8);
  return state;
}

function interceptScenario(): GameState {
  return withDiceFor(interceptBase, (s) => !!strike(s).combat?.interception?.fighterWon);
}

function interceptPct(): number {
  const s = interceptBase();
  return Math.round(interception(s, mine(s, 'bomber'), AIR_TARGET)!.chance * 100);
}

/** A Fighter and a Bomber in Babylon; your second city Ur to the north-east, and a Carrier off the north coast. */
function rebaseScenario(): GameState {
  const state = airfield();
  addCity(state, 0, 10, 3, { name: 'Ur', build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = 2;
  addUnit(state, 'fighter', 0, CITY_X, CITY_Y);
  addUnit(state, 'bomber', 0, CITY_X, CITY_Y);
  addUnit(state, 'carrier', 0, 9, 1);
  return state;
}

/** Your Battleship next to a Mauryan Carrier with a Fighter and a Bomber aboard. */
function carrierSunkBase(): GameState {
  const state = airfield();
  state.players[1]!.techs = ['flight'];
  addUnit(state, 'battleship', 0, 9, 1);
  const carrier = addUnit(state, 'carrier', 1, 10, 1);
  addUnit(state, 'fighter', 1, 10, 1, { carriedBy: carrier.id });
  addUnit(state, 'bomber', 1, 10, 1, { carriedBy: carrier.id });
  return state;
}

function carrierSunkScenario(): GameState {
  return withDiceFor(carrierSunkBase, (s) => !!applyAction(s, { type: 'attack', unitId: mine(s, 'battleship').id, at: { x: 10, y: 1 } }).combat?.attackerWon);
}

/** Taxila (Mauryan) 3 tiles east with one Musketman; your Bomber in Babylon and a Legion next to Taxila. */
function noCaptureBase(): GameState {
  const state = airfield();
  addCity(state, 1, AIR_TARGET.x, AIR_TARGET.y, { name: 'Taxila', build: { kind: 'unit', id: 'warrior' } });
  state.players[1]!.citiesFounded = 2;
  addUnit(state, 'bomber', 0, CITY_X, CITY_Y);
  addUnit(state, 'musketman', 1, AIR_TARGET.x, AIR_TARGET.y);
  addUnit(state, 'legion', 0, FRONT.x, FRONT.y - 1);
  return state;
}

function noCaptureScenario(): GameState {
  return withDiceFor(noCaptureBase, (s) => !!strike(s).combat?.attackerWon);
}

const HELI_CITY = { x: 12, y: 5 };
const HELI_SPOT = { x: 11, y: 5 };

/** A Helicopter in Babylon; a mountain and a lake to the east; Taxila beyond them, held by a Musketman. */
function helicopterBase(): GameState {
  const state = airfield();
  state.players[0]!.techs.push('machine_tools', 'advanced_flight');
  setTerrain(state, 8, 5, 'mountains');
  setTerrain(state, 9, 5, 'ocean');
  setTerrain(state, 10, 5, 'forest');
  addCity(state, 1, HELI_CITY.x, HELI_CITY.y, { name: 'Taxila', build: { kind: 'unit', id: 'warrior' } });
  state.players[1]!.citiesFounded = 2;
  addUnit(state, 'musketman', 1, HELI_CITY.x, HELI_CITY.y);
  addUnit(state, 'helicopter', 0, CITY_X, CITY_Y);
  return state;
}

function helicopterScenario(): GameState {
  return withDiceFor(helicopterBase, (s) => {
    const heli = mine(s, 'helicopter');
    applyAction(s, { type: 'move', unitId: heli.id, to: HELI_SPOT });
    return !!applyAction(s, { type: 'attack', unitId: heli.id, at: HELI_CITY }).combat?.attackerWon;
  });
}

/** The helicopter scenario's odds once it's next to Taxila. */
function helicopterOdds(): number {
  const s = helicopterBase();
  const heli = mine(s, 'helicopter');
  applyAction(s, { type: 'move', unitId: heli.id, to: HELI_SPOT });
  return airOdds(s, 'helicopter', HELI_CITY);
}

/** Babylon and Ur have Airports, Nineveh doesn't; two Riflemen in Babylon. */
function airliftScenario(): GameState {
  const { state } = withCapital(undefined, { buildings: ['airport'] });
  state.players[0]!.techs = ['flight', 'conscription'];
  addCity(state, 0, 12, 8, { name: 'Ur', buildings: ['airport'], build: { kind: 'unit', id: 'warrior' } });
  addCity(state, 0, 3, 8, { name: 'Nineveh', build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = 3;
  addUnit(state, 'rifleman', 0, CITY_X, CITY_Y);
  addUnit(state, 'rifleman', 0, CITY_X, CITY_Y);
  return state;
}

const AIRCRAFT_CITIES = [
  { name: 'Babylon', x: CITY_X, y: CITY_Y, type: 'fighter' },
  { name: 'Ur', x: 4, y: 3, type: 'bomber' },
  { name: 'Nineveh', x: 10, y: 3, type: 'jet_fighter' },
  { name: 'Uruk', x: 4, y: 8, type: 'stealth_bomber' },
] as const;

/** Each based aircraft alone in its own city (the 22 px in-city disc), a Helicopter in the open, and a Carrier with three aboard. */
function allAircraftScenario(): GameState {
  const { state } = withCapital(undefined, {}, 2);
  state.atWar = [[false, false], [false, false]];
  state.players[0]!.techs = ['flight'];
  for (const c of AIRCRAFT_CITIES.slice(1)) addCity(state, 0, c.x, c.y, { name: c.name, build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = AIRCRAFT_CITIES.length;
  for (const c of AIRCRAFT_CITIES) addUnit(state, c.type, 0, c.x, c.y);
  addUnit(state, 'helicopter', 0, 9, 7);
  const carrier = addUnit(state, 'carrier', 0, 7, 10);
  for (const t of ['fighter', 'bomber', 'jet_fighter'] as const) addUnit(state, t, 0, 7, 10, { carriedBy: carrier.id });
  addCity(state, 1, 12, 8, { name: RIVAL_CAPITAL, capitalOf: 1, build: { kind: 'unit', id: 'warrior' } });
  state.players[1]!.citiesFounded = 1;
  addUnit(state, 'bomber', 1, 12, 8);
  return state;
}

/** Every resource (as in All resources), plus a barbarian village with 2 flags, a hut, and a barbarian Archer. */
function allMapIconsScenario(): GameState {
  const state = allResourcesScenario();
  addBarbarians(state);
  addVillage(state, 10, 5, { flags: 2 });
  state.map.tiles[tileIndex(state.map, 5, 6)]!.hut = true;
  addBarbarianUnit(state, 'archer', { x: 12, y: 6 });
  // Your Warrior between them keeps both barbarians in sight.
  addUnit(state, 'warrior', 0, 11, 6, { fortified: true });
  return state;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'grow',
    title: 'City grows',
    note: `Tap End Turn. ${CAPITAL} should grow from size 2 to 3. Tap the city first to see its food bar almost full.`,
    build: () => {
      const { state, city } = withCapital(undefined, { size: 2 });
      city.food = growthThreshold(city.size) - 1;
      return state;
    },
  },
  {
    id: 'starve',
    title: 'City starves',
    note: `Tap End Turn. ${CAPITAL} should shrink from size 3 to 2. It sits on desert and mountains, and even working the one hills tile it can't feed 3 citizens.`,
    build: () => {
      const { state } = withCapital(['mdm', 'ddh', 'mdm'], { size: 3, food: 0 });
      return state;
    },
  },
  {
    id: 'settler',
    title: 'Settler costs a citizen',
    note: `Tap End Turn. ${CAPITAL} should finish a Settler and drop from size 2 to 1. The Settler appears in the city.`,
    build: () => {
      const { state } = withCapital(undefined, {
        size: 2,
        build: { kind: 'unit', id: 'settler' },
        production: UNITS.settler.cost - 1,
      });
      return state;
    },
  },
  {
    id: 'rich',
    title: 'Lots of gold (rush-buy)',
    note: `You have 500 gold. Tap ${CAPITAL}, then Buy to finish its Library at once; it appears at the end of the turn. Try buying other items too.`,
    build: () => {
      const { state } = withCapital(undefined, { size: 3, build: { kind: 'building', id: 'library' } });
      const p = state.players[0]!;
      p.gold = 500;
      p.techs = ['alphabet', 'writing', 'bronze_working', 'currency', 'pottery', 'masonry', 'ceremonial_burial'];
      return state;
    },
  },
  {
    id: 'tech',
    title: 'Tech one turn away',
    note: `Tap End Turn. You should learn ${TECHS.writing.name} and be asked to pick the next tech. Then tap ${CAPITAL}: Library is now in its build list.`,
    build: () => {
      const { state } = withCapital(undefined, { size: 2 });
      oneTurnFromLearning(state, ['alphabet'], 'writing');
      return state;
    },
  },
  {
    id: 'era',
    title: 'New era one turn away',
    note: `Tap End Turn. You should learn ${TECHS.monarchy.name} and enter the Medieval era; the top bar changes from Ancient to Medieval.`,
    build: () => {
      const { state } = withCapital(undefined, { size: 2 });
      const ancient = TECH_LIST.filter((t) => t.era === 'ancient').map((t) => t.id);
      oneTurnFromLearning(state, ancient, 'monarchy');
      return state;
    },
  },
  {
    id: 'combat',
    title: 'Combat odds',
    note: `Tap your Legion (east of ${CAPITAL}), then the enemy Spearman next to it (red outline). The odds panel should say ${frontOdds(combatScenario())}% (attack 4 vs defense 3, no bonuses). Tap Attack: one of them is destroyed, and a message says who won.`,
    build: combatScenario,
  },
  {
    id: 'fortified',
    title: 'Attack a fortified veteran',
    note: `Tap your Legion, then the enemy Spearman on the hills. The odds panel should list Hills +50%, Fortified +50%, and Veteran +50% on their side (defense 3 → 7.5), for ${frontOdds(fortifiedScenario())}%. You can Cancel; nothing happens without Attack.`,
    build: fortifiedScenario,
  },
  {
    id: 'walls',
    title: 'Attack a walled city',
    note: `Tap your Catapult, then the walled city east of it. Its Spearman defends with In a city +25% and Walls +100% (defense 3 → 6.75): ${frontOdds(wallsScenario())}% for your Catapult's 6 attack.`,
    build: wallsScenario,
  },
  {
    id: 'army',
    title: 'Form an army',
    note: `Tap the Archers east of ${CAPITAL} (3 on one tile) and tap Form Army. They become one army: gold ring and ×3 on the map, attack 9, defense 6. Then tap the enemy Warrior: the odds go from 75% for one Archer to 90% for the army.`,
    build: armyScenario,
  },
  {
    id: 'army-in-city',
    title: 'Army inside a city',
    note: `Three Legions are inside ${CAPITAL}. Tap ${CAPITAL}: “Units here” lists them with a Form Legion army button. Tap it: the three become one army (attack 12, defense 6).`,
    build: armyInCityScenario,
  },
  {
    id: 'mixed-stack',
    title: 'Mixed stack',
    note: `East of ${CAPITAL}, your Warrior has a second disc peeking out behind it and a 4 badge: the tile holds more than one type. Tap it: the unit panel says “Mixed · 4 units here: 1 Warrior, 3 Legions”, lists each one to tap, and offers Form Legion army even with the Warrior selected. Tap that: the Legions become one army (attack 12). The rival tile to the north-east is mixed too; tap it with nothing selected to hear what's in it.`,
    build: mixedStackScenario,
  },
  {
    id: 'capture',
    title: 'Capture a city',
    note: `Tap the Legion east of ${CAPITAL} and attack ${RIVAL_CAPITAL} (its only defender, a Warrior: ${frontOdds(captureScenario())}%). It wins and moves straight in: the city becomes yours, size 3 → 2, its Walls are gone (the Granary stays), and a message says you took their capital.`,
    build: captureScenario,
  },
  {
    id: 'victory',
    title: 'Victory',
    note: `Tap your Legion army east of ${CAPITAL}, then ${RIVAL_CAPITAL} next to it: their last city, held by one Warrior (${frontOdds(victoryScenario())}%). Tap Attack: your army wins, moves in, and takes the city. Their civ is eliminated, and the Victory panel appears.`,
    build: victoryScenario,
  },
  {
    id: 'defeat',
    title: 'Defeat',
    note: `Tap End Turn. Three rival Legions attack ${CAPITAL}, your last city: they beat your Warrior and move in. With no cities and no units left, the Defeated panel appears.`,
    build: defeatScenario,
  },
  {
    id: 'all-units',
    title: 'All unit icons',
    note: `One of each land unit type (${UNIT_IDS.filter((id) => UNITS[id].domain === 'land').length}) in two rows north and south of ${CAPITAL}, in table order: Settler, Warrior, Archer … Tank, Helicopter. South row also has a Legion army (gold ring, ×3), a veteran Spearman (★ in its panel), a fortified Pikeman (shield), and a mixed stack (a Musketman with two Archers peeking out behind, badge 3). Rival units along the south coast show their color. Pinch-zoom in and out: the icons should stay sharp. Tap any unit to see its icon in the unit panel.`,
    build: allUnitsScenario,
  },
  {
    id: 'wonder',
    title: 'Wonder finishes',
    note: `Tap End Turn. ${CAPITAL} should finish the ${WONDERS.pyramids.name} (a message says so). Tap ${CAPITAL}: it's listed under Wonders, production is up 25%, and Culture shows ${WONDERS.pyramids.effects.culture}. The ${WONDERS.pyramids.name} is gone from every build list, and 🏆 lists it under Wonders of the world.`,
    build: wonderScenario,
  },
  {
    id: 'wonder-race',
    title: 'Wonder race lost',
    note: `You and ${rivalName(wonderRaceScenario())} are both building the ${WONDERS.colossus.name}; theirs is one turn from done. Tap End Turn: they finish it first. ${CAPITAL} keeps its 40+ production and its panel opens asking for a new choice; the ${WONDERS.colossus.name} isn't in the list any more.`,
    build: wonderRaceScenario,
  },
  {
    id: 'win-domination',
    title: 'Win: domination',
    note: `You already hold ${RIVAL_CAPITAL}, Maurya's capital (★). Tap your Legion army east of ${CAPITAL}, then Niani, Mali's capital next to it (one Warrior: ${frontOdds(winDominationScenario())}%). Attack: you take the last rival capital, and the Domination victory screen appears with New Game and Keep playing.`,
    build: winDominationScenario,
  },
  {
    id: 'win-culture',
    title: 'Win: culture',
    note: `You have ${VICTORY.cultureGoal} culture (the goal), and ${CAPITAL} is one turn from finishing the ${WONDERS.world_council.name}. Tap End Turn: the Culture victory screen appears. Tap Keep playing to go on; the screen won't come back.`,
    build: () => winWonderScenario('culture'),
  },
  {
    id: 'win-economic',
    title: 'Win: economic',
    note: `You have ${VICTORY.goldGoal} gold (the goal), and ${CAPITAL} is one turn from finishing the ${WONDERS.global_exchange.name}. Tap End Turn: the Economic victory screen appears.`,
    build: () => winWonderScenario('economic'),
  },
  {
    id: 'win-space',
    title: 'Win: spaceship arrives',
    note: `Your spaceship was launched ${VICTORY.spaceship.travelTurns} turns ago and arrives on turn ${winSpaceScenario().turn + 1}. Tap End Turn: it arrives and the Technology victory screen appears. (🏆 shows it as launched first.)`,
    build: winSpaceScenario,
  },
  {
    id: 'lose-space',
    title: 'Lose: rival spaceship',
    note: `${CivName(loseSpaceScenario(), RIVAL)}'s spaceship arrives on turn ${loseSpaceScenario().turn + 1}, and you can't reach their capital. Tap End Turn: their ship lands and the Defeat screen names them and the technology victory.`,
    build: loseSpaceScenario,
  },
  {
    id: 'stop-launch',
    title: 'Stop a spaceship',
    note: `${CivName(stopLaunchScenario(), RIVAL)}'s spaceship arrives on turn ${stopLaunchScenario().turn + 3}. Tap your Legion army east of ${CAPITAL}, then ${RIVAL_CAPITAL}, their capital next to it (${frontOdds(stopLaunchScenario())}%). Attack: you take it and a message says their spaceship was lost. Keep tapping End Turn past turn ${stopLaunchScenario().turn + 3}: nobody wins, and 🏆 shows their spaceship as not started.`,
    build: stopLaunchScenario,
  },
  {
    id: 'near-win-warning',
    title: 'Near-win warning',
    note: `${CivName(nearWinScenario(), RIVAL)} ${civVerb(nearWinScenario(), RIVAL, 'has', 'have')} ${nearWinScenario().players[RIVAL]!.culture} culture, past ${VICTORY.warnPct}% of the ${VICTORY.cultureGoal} goal. Tap End Turn: a “Close to winning!” panel warns you, with a Victory progress button. It only warns once: End Turn again and it stays quiet.`,
    build: nearWinScenario,
  },
  {
    id: 'first-contact',
    title: 'First contact',
    note: `Tap your Warrior east of ${CAPITAL}, then the tile just east of it. You spot a ${civDef(firstContactScenario(), RIVAL).adjective} Warrior and a panel says “You have met ${rivalName(firstContactScenario())}, led by ${civDef(firstContactScenario(), RIVAL).leader}”. Then open 🤝 Diplomacy: they're listed, at peace.`,
    build: firstContactScenario,
  },
  {
    id: 'peace',
    title: 'Make peace',
    note: `You're at war with ${rivalName(peaceScenario())} and winning (they lost 3 units, you lost none). Open 🤝 Diplomacy, pick ${rivalName(peaceScenario())}, and tap Propose Peace. They accept: “${peaceDesire(peaceScenario(), RIVAL, 0).reason}” Their Warrior next to your Legions can't be attacked any more.`,
    build: peaceScenario,
  },
  {
    id: 'demand',
    title: 'AI demand',
    note: 'Tap End Turn. The Franks (strong, aggressive, next door) demand tribute: a panel asks you to Give or Refuse. Refusing makes them angrier (see their attitude in 🤝 Diplomacy) and war more likely.',
    build: () => withDice(demandBase, (s) => s.diplomacy.offers.some((o) => o.kind === 'demand') && !s.atWar[0]![RIVAL]),
  },
  {
    id: 'tech-trade',
    title: 'Trade techs',
    note: `${CivName(techTradeScenario(), RIVAL)} ${civVerb(techTradeScenario(), RIVAL, 'is', 'are')} friendly and knows Pottery. Open 🤝 Diplomacy, pick them, tap Trade Techs, and swap your Bronze Working for their Pottery. They agree, and Granary appears in ${CAPITAL}'s build list.`,
    build: techTradeScenario,
  },
  {
    id: 'ai-war',
    title: 'AI declares war',
    note: `Tap End Turn. The Franks declare war on you (a panel says so). Keep tapping End Turn: their Legion army marches from Aachen toward ${CAPITAL} and attacks within a few turns.`,
    build: () => withDice(aiWarBase, (s) => s.atWar[0]![RIVAL] === true),
  },
  // ---- Round 8: ships ----
  {
    id: 'board-unload',
    title: 'Ships: board, sail, unload',
    note: `A Galley is docked in ${CAPITAL} with a Settler and a Warrior. Tap ${CAPITAL}, tap the Settler, then “⚓ Board the Galley”; do the same for the Warrior (the Galley shows a teal “2”). Select the Galley and tap the coast tile 2 east of ${CAPITAL}. End Turn. Then tap the Galley's tile, pick the Settler (⚓ aboard) and tap the land just east of the ship: it goes ashore. Same for the Warrior. End Turn, and the Settler can found a city on the new landmass.`,
    build: boardUnloadScenario,
  },
  {
    id: 'galley-coast',
    title: 'Ships: Galley stays on the coast',
    note: 'Your Galley and Caravel sit on the light-blue coast east of your island; dark-blue ocean lies beyond. Select the Galley and tap the ocean just east of it: “A Galley can’t leave the coast”. Its highlighted tiles are all coast. Now select the Caravel: it can sail across the ocean to the far shore.',
    build: galleyCoastScenario,
  },
  {
    id: 'naval-battle',
    title: 'Ships: naval battle',
    note: `Your Frigate faces a Mauryan Frigate at sea. Select yours and tap theirs: the odds panel shows ${oddsAt(navalBattleScenario(), { x: 7, y: 5 }, { x: 8, y: 5 })}% (Frigate attack 4 against defense 3, no terrain bonus at sea). Attack: the loser sinks.`,
    build: navalBattleScenario,
  },
  {
    id: 'bombard',
    title: 'Ships: bombard the coast',
    note: `Your Frigate is off the coast next to Taxila, held by one Warrior. Select the Frigate and tap Taxila: the odds panel shows ${oddsAt(bombardScenario(), { x: 7, y: 5 }, { x: 8, y: 5 })}% and says ships never move in (Walls wouldn't count: they only stop land attacks). Attack: the Warrior is destroyed, but the Frigate stays at sea and Taxila stays Mauryan (empty).`,
    build: bombardScenario,
  },
  {
    id: 'ship-sunk-cargo',
    title: 'Ships: cargo sinks with the ship',
    note: 'Your Galley carries a Settler and a Warrior (teal “2”), right next to a Mauryan Frigate. Tap End Turn: the Frigate attacks and sinks the Galley, and a message says the 2 units aboard went down with it. All three are gone.',
    build: () => withDice(shipSunkBase, (s) => !s.units.some((u) => u.owner === 0 && u.type === 'galley')),
  },
  {
    id: 'amphibious-capture',
    title: 'Ships: land and capture',
    note: 'Your Galley carries a Legion, next to Taxila, a Mauryan city with no defenders. Tap the Galley, pick the Legion (⚓ aboard) in its panel, and tap Taxila: the Legion goes ashore straight into the city and captures it.',
    build: amphibiousScenario,
  },
  {
    id: 'harbor',
    title: 'Harbor: more food from the sea',
    note: `${CAPITAL} sits in a lagoon and works 3 coast tiles (1 food each). Tap End Turn: it finishes a Harbor, and each water tile it works gives +${BUILDINGS.harbor.effects.waterFood} food, so ${CAPITAL}'s food surplus goes from ${foodSurplus(harborScenario(), harborScenario().cities[0]!)} to +3. Tap ${CAPITAL} to see it.`,
    build: harborScenario,
  },
  {
    id: 'ai-overseas',
    title: 'Ships: AI settles overseas',
    note: `Maurya is boxed in on the little island to the west, with a Galley, a Settler, and a Warrior. Keep tapping End Turn (about 4 times): the Warrior and the Settler board the Galley, it sails over, they land next to your fortified Warrior at (${aiOverseasScenario().units.find((u) => u.owner === 0)!.x}, ${aiOverseasScenario().units.find((u) => u.owner === 0)!.y}), and Maurya founds a city on your landmass.`,
    build: aiOverseasScenario,
  },
  {
    id: 'fleet',
    title: 'Ships: form a fleet',
    note: `Three Frigates share a tile (one carries a Warrior). Tap them, then “Form Frigate fleet”: one Frigate fleet ×3 with the gold ring, cargo 1/6 (the Warrior stays aboard). Tap the Mauryan Frigate next to it: the odds go from ${fleetOdds()[0]}% for one Frigate to ${fleetOdds()[1]}% for the fleet.`,
    build: fleetScenario,
  },
  {
    id: 'all-ships',
    title: 'All ships',
    note: `One of each ship (${UNIT_IDS.filter((id) => UNITS[id].domain === 'sea').length}) along the north coast in table order: Galley, Caravel, Frigate, Ironclad, Transport, Destroyer, Battleship, Submarine, Carrier. Each shows the icon you picked (the Carrier's trimmed one); pinch-zoom to check they're clear. A Galley on the east coast carries two units (teal “2” badge), and a Mauryan Frigate sits right below it (you are at peace). Tap any ship for its stats.`,
    build: allShipsScenario,
  },

  // ---- Round 9: barbarians, villages, artifacts, resources, huts, Great People ----
  {
    id: 'village-spawn',
    title: 'Barbarians: a village sends a unit',
    note: `A barbarian village (the camp icon) south-east of ${CAPITAL} has ${BARBARIANS.flagsToSpawn - 1} of its ${BARBARIANS.flagsToSpawn} red flags; your Spearman keeps watch next to it. Tap End Turn: it gains its ${BARBARIANS.flagsToSpawn}th flag and sends a unit out (a Warrior or an Archer, dark with a red rim) next to it, and its flags start again at 0. Tap the village tile to see its flag count.`,
    build: villageSpawnScenario,
  },
  {
    id: 'take-village',
    title: 'Barbarians: take a village',
    note: `Your Legion stands next to a barbarian village held by a fortified Warrior (${frontOdds(takeVillageScenario())}% odds: the village adds +${BARBARIANS.villageDefensePct}%). Tap the Legion, then the village, then Attack: the Legion wins and moves in, and a panel asks: Destroy it (a random reward, usually gold) or Settle it (it becomes your new size 1 city). Pick either.`,
    build: takeVillageScenario,
  },
  {
    id: 'village-artifact',
    title: 'Barbarians: an ancient artifact',
    note: `Walk your Warrior east into the empty barbarian village and choose Destroy or Settle: either way your people dig up an ancient artifact (the dice are set so it happens), and a panel names it and the tech it taught you.`,
    build: villageArtifactScenario,
  },
  {
    id: 'village-resource',
    title: 'Barbarians: destroying reveals Iron',
    note: `The empty barbarian village east of your Warrior sits on hills with hidden Iron (nothing shows yet). Walk in and choose Destroy: you get the reward, and the panel says there was Iron under it; the Iron icon (an anvil) appears in the tile's corner (+${RESOURCES.iron.bonus.production} production when a city works it). Settling instead keeps it hidden until you learn ${TECHS[RESOURCES.iron.revealedBy!].name}.`,
    build: villageResourceScenario,
  },
  {
    id: 'barbarian-raid',
    title: 'Barbarians: a raid, not a capture',
    note: `${RAID_CITY} (south-east) is size 3 with no defender, and you have 100 gold. A barbarian Archer stands next to it. Tap End Turn: the barbarians raid ${RAID_CITY}: they take ${Math.round((100 * BARBARIANS.raidGoldPct) / 100)} gold and 1 population (${RAID_CITY} goes to size 2), but ${RAID_CITY} stays yours.`,
    build: barbarianRaidScenario,
  },
  {
    id: 'hut',
    title: 'Huts: every result',
    note: `Five huts (the hut icon) in a column east of ${CAPITAL}, each with your Warrior to its west. Walk each Warrior east onto its hut. Top to bottom: ${HUT_ROWS.map((r) => r.says).join('; ')}. (Normally a hut's result is random, and barbarians only come from turn ${HUTS.barbariansFromTurn}.)`,
    build: hutScenario,
  },
  {
    id: 'great-person',
    title: 'Great People: one arrives',
    note: `${CAPITAL} is 1 culture short of your first Great Person. Tap End Turn: a Great Scientist, ${GREAT_PEOPLE.scientist.names[0]}, arrives and a panel asks what to do. "Settle in a city…" → ${CAPITAL}: +${GREAT_PEOPLE_RULES.scientistSciencePct}% science there for good (the city panel lists them). Or "Use now": you learn Writing at once. "Decide later" brings the panel back next turn.`,
    build: greatPersonScenario,
  },
  {
    id: 'engineer-wonder',
    title: 'Great People: an Engineer finishes a wonder',
    note: `A Great Engineer, ${GREAT_PEOPLE.engineer.names[0]}, is waiting (the panel shows). ${CAPITAL} is building the ${WONDERS.pyramids.name} (10/${WONDERS.pyramids.cost}). Tap Use now, then ${CAPITAL}: ${WONDERS.pyramids.name}. Tap End Turn: ${CAPITAL} completes the ${WONDERS.pyramids.name}.`,
    build: engineerWonderScenario,
  },
  {
    id: 'all-resources',
    title: 'All resources',
    note: `One of each of the ${RESOURCE_IDS.length} resources, for the icon check (hidden ones shown as if revealed). Along the north of the island, then continuing on the row below ${CAPITAL}: ${resourceOrder()}. Fish is on the north coast, Whales out at sea. Tap one to see its bonus.`,
    build: allResourcesScenario,
  },
  // ---- Round 10: aircraft and the map icons ----
  {
    id: 'air-strike',
    title: 'Air: a bomber strike',
    note: `Your Bomber is based in ${CAPITAL}; a Mauryan Musketman stands 3 tiles east (you are at war). Tap ${CAPITAL}, then the Bomber in Units here: every target in its range (${UNITS.bomber.range} tiles) is outlined in red. (Aircraft strike only what you can see; your Warrior north-west of it keeps it in sight.) Tap the Musketman, then Attack (${airOdds(airStrikeBase(), 'bomber', AIR_TARGET)}%, no fighter can intercept; the dice are set to win): the Musketman is destroyed and the Bomber is back in ${CAPITAL}, done for the turn. It can strike again after End Turn.`,
    build: airStrikeScenario,
  },
  {
    id: 'intercept',
    title: 'Air: a fighter intercepts',
    note: `Same strike, but a Mauryan Fighter is based in ${RIVAL_CAPITAL}, within its range (${UNITS.fighter.range}) of the Musketman. Select your Bomber and tap the Musketman: the odds panel warns their Fighter can intercept (it wins ${interceptPct()}% of the time). Attack: their Fighter shoots your Bomber down (the dice are set) and the Musketman is untouched.`,
    build: interceptScenario,
  },
  {
    id: 'rebase',
    title: 'Air: rebase to a city and a Carrier',
    note: `A Fighter (range ${UNITS.fighter.range}) and a Bomber (range ${UNITS.bomber.range}) are based in ${CAPITAL}. Select the Fighter: the places it can fly to are highlighted. Tap Ur (north-east): it flies there and is done for the turn. Select the Bomber and tap the Carrier off the north coast: it lands on it (the Carrier's panel says aircraft 1/${UNITS.carrier.airCargo}). Select the Carrier and sail it: the Bomber goes along.`,
    build: rebaseScenario,
  },
  {
    id: 'carrier-sunk',
    title: 'Air: a Carrier sinks with its aircraft',
    note: `Your Battleship is next to a Mauryan Carrier with a Fighter and a Bomber aboard. Tap the Battleship, then the Carrier, then Attack (${oddsAt(carrierSunkBase(), { x: 9, y: 1 }, { x: 10, y: 1 })}%; the dice are set to win): the Carrier sinks, and the message says the 2 aircraft aboard went down with it.`,
    build: carrierSunkScenario,
  },
  {
    id: 'bomber-no-capture',
    title: 'Air: bombers never capture',
    note: `Taxila (Mauryan, 3 tiles east) has one Musketman. Strike it with your Bomber from ${CAPITAL} (${airOdds(noCaptureBase(), 'bomber', AIR_TARGET)}%; the dice are set to win): the Musketman is destroyed, but Taxila stays Mauryan, and empty; the Bomber is back in ${CAPITAL}. Then walk your Legion (north-west of Taxila) in: it captures the city.`,
    build: noCaptureScenario,
  },
  {
    id: 'helicopter',
    title: 'Air: the Helicopter',
    note: `Your Helicopter (${UNITS.helicopter.moves} moves) is in ${CAPITAL}. East of it are a mountain, a lake, and a forest, then Taxila (Mauryan), held by a Musketman. Tap the tile just west of Taxila: the Helicopter flies straight over all three at 1 move a tile (a land unit couldn't cross). Tap Taxila, then Attack (${helicopterOdds()}%; the dice are set to win): the Musketman is destroyed, but the Helicopter stays outside and Taxila stays Mauryan; Helicopters never capture.`,
    build: helicopterScenario,
  },
  {
    id: 'airlift',
    title: 'Air: an airlift',
    note: `${CAPITAL} and Ur (south-east) have Airports; Nineveh (south-west) doesn't. Two Riflemen are in ${CAPITAL}. Select one and tap ✈ Airlift…: only Ur is offered. Pick it: the Rifleman lands in Ur with no moves left. Select the other Rifleman: no Airlift button now; ${CAPITAL}'s Airport has flown its one unit this turn. After End Turn it can go.`,
    build: airliftScenario,
  },
  {
    id: 'all-aircraft',
    title: 'All aircraft',
    note: `Each aircraft alone in its own city, drawn at the small in-city size: ${AIRCRAFT_CITIES.map((c) => `${UNITS[c.type].name} in ${c.name}`).join(', ')}. A Helicopter is in the open south-east of ${CAPITAL} (full size), and a Carrier on the south coast has a Fighter, a Bomber, and a Jet Fighter aboard (badge 3). A Mauryan Bomber sits in ${RIVAL_CAPITAL} (you are at peace). Check the Bomber against the Fighter and the Jet Fighter; pinch-zoom to see them at other sizes. Tap a city, then its aircraft, to see its range.`,
    build: allAircraftScenario,
  },
  {
    id: 'all-map-icons',
    title: 'All map icons',
    note: `Every map icon at once: the ${RESOURCE_IDS.length} resources as in All resources (on dark badges in their tiles' corners: ${resourceOrder()}; Fish on the north coast, Whales at sea), a barbarian village east of ${CAPITAL} with 2 of its ${BARBARIANS.flagsToSpawn} flags and its Warrior in the corner, a hut south-west of ${CAPITAL}, and a barbarian Archer (red skull badge) to the south-east, both in sight of your Warrior. Tap a resource, the village, or the hut to hear what it is.`,
    build: allMapIconsScenario,
  },
];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

