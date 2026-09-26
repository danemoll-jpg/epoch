// Dev test scenarios: small hand-made games that put a hard-to-reach rule one End Turn
// away, so it can be seen on the iPad on demand. Loaded with ?scenario=<id> or from the
// ☰ menu, in the dev server only (main.ts imports this file only when import.meta.env.DEV,
// so it is compiled out of the production build; scripts/check-dist.mjs proves it).
// A scenario never autosaves, so it can't overwrite the real game.
//
// To add one: append an entry to SCENARIOS below, and add its expected outcome to
// tests/scenarios.test.ts (the test also fails if a scenario has no outcome check).

import { MAP_SIZES, victoryGoals } from '../data/mapSizes';
import { DEFAULT_VIEW_TILES, ZOOM_OUT_TILES } from '../render/camera';
import { artDemoState, cityLooksState, LOOK_SIZES } from './artDemo';
import { FIXTURE_TURN, lateGame } from './fixtures/fixtures';
import { DIFFICULTIES } from '../data/difficulty';
import { createGame } from '../game/newGame';
import { endTurn, playComputerTurn } from '../game/turn';
import { BUILDINGS } from '../data/buildings';
import { BORDERS, growthThreshold } from '../data/rules';
import { PLAYABLE_CIVS, findCiv } from '../data/civs';
import { LEADER_BONUSES, UNIQUE_RULES } from '../data/leaders';
import { buyCost, itemCost } from '../game/production';
import { dissolutionGold } from '../game/uniques';
import { warScore } from '../game/diplomacy';
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
import { cityYields, empireCulture, empireIncome, foodSurplus } from '../game/yields';
import { techCost } from '../game/tech';
import type { City, GameState } from '../game/types';
import { addBarbarians, addCity, addUnit, addVillage, makeState } from './build';
import { BARBARIANS, HUTS, type HutResultKind } from '../data/barbarians';
import { GREAT_PEOPLE, GREAT_PEOPLE_RULES } from '../data/greatPeople';
import { RESOURCES, RESOURCE_IDS } from '../data/resources';
import { addBarbarianUnit } from '../game/barbarians';
import { updateExplored, visibleTiles } from '../game/fog';
import { greatPersonThreshold } from '../game/greatPeople';
import { RELIGION, RELIGION_NAMES, RELIGION_SYMBOLS } from '../data/religion';
import { ROADS } from '../data/roads';
import { conversionChancePct, faithOpinion, foundReligion, religionCityCulture, religionCityGold } from '../game/religion';
import { roadOption } from '../game/roads';
import { attitude, opinionOf } from '../game/diplomacy';
import type { CloudBackend } from '../cloud/backend';
import type { CloudLink } from '../game/save';
import { MemoryCloudStore, mockBackend, putSlot } from './memoryCloud';
import type { Religion } from '../game/types';

/** Appears in every dev bundle and must never appear in dist/ (see scripts/check-dist.mjs). */
export const SCENARIO_MARKER = 'epoch-dev-scenarios';

export interface Scenario {
  id: string;
  /** Short name for the ☰ menu. */
  title: string;
  /** What to do and what should happen, shown on screen while the scenario is loaded. */
  note: string;
  build: () => GameState;
  /** Round 13: a screen to open as soon as it loads. */
  opens?: 'mainMenu' | 'settings' | 'almanac' | 'howToPlay' | 'setup';
  /** Round 13: show every first-game tip again (only for this scenario; the device's list is untouched). */
  freshTips?: boolean;
  /** Round 14: plays sound and music (other scenarios are silent unless Settings allows it). */
  sound?: boolean;
  /** Round 14: shows the dev-only music switch in the scenario note (hear every era's track). */
  musicSwitch?: boolean;
  /** Round 15: shows the "Update available" banner as if a new version were waiting. */
  fakeUpdate?: boolean;
  /**
   * Round 16: a stand-in cloud (the dev server has no real Firebase): the signed-in player's
   * memory store, and this game's link to it. Made fresh each load.
   */
  cloud?: () => CloudScenario;
}

export interface CloudScenario {
  backend: () => Promise<CloudBackend>;
  link: CloudLink;
  savedAt?: number;
  /** The memory store behind it (the tests look inside). */
  store: MemoryCloudStore;
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
  // Round 11: Charlemagne is a conqueror, and marches only with a force of 5 (an army counts 3)
  // beyond the 3 guards a border city keeps at war.
  for (let i = 0; i < 3; i++) addUnit(state, 'legion', RIVAL, 12, 8);
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
  p.science = techCost(state, 0, tech) - 1;
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
  // Round 19 (Dan's addition): the Drone.
  { name: 'Lagash', x: 12, y: 2, type: 'drone' },
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

// ---- Round 11: leaders ---------------------------------------------------------------------
// Each puts you in a leader's shoes (player 0's civ) at the moment a bonus or a unique action
// matters. Numbers in the notes are computed from the rules, never typed.

/** Makes player 0 this civ, knowing these techs (its era follows from them). */
function asLeader(state: GameState, civId: string, techs: TechId[]): GameState {
  const p = state.players[0]!;
  p.civId = civId;
  p.techs = [...techs];
  return state;
}

/** Techs up to (and including) the Medieval era's Monarchy: enough for Medieval bonuses. */
const MEDIEVAL: TechId[] = ['alphabet', 'ceremonial_burial', 'code_of_laws', 'monarchy'];
/** ...and the Industrial era (Gunpowder), and Economics for Versailles. */
const INDUSTRIAL: TechId[] = [...MEDIEVAL, 'bronze_working', 'currency', 'trade', 'banking', 'university', 'economics', 'writing', 'literacy', 'masonry', 'mathematics', 'mysticism', 'astronomy', 'philosophy'];

function newGameSetupScenario(): GameState {
  return withCapital(undefined, {}).state;
}

/** Russia on turn 1, knowing only Map Making; a lake next to the capital makes it a port. */
function startingTechScenario(): GameState {
  const { state } = withCapital(['ggc', 'ggg', 'ggg'], { name: 'St. Petersburg', build: null });
  state.turn = 1;
  return asLeader(state, 'russia', ['map_making']);
}

/** Caligula one turn from the Medieval era (Monarchy nearly learned). */
function eraBonusScenario(): GameState {
  const { state } = withCapital(undefined, { name: 'Rome', size: 3 });
  asLeader(state, 'rome', []);
  oneTurnFromLearning(state, ['alphabet', 'ceremonial_burial', 'code_of_laws', 'bronze_working'], 'monarchy');
  return state;
}

const legionCost = (civ: string, techs: TechId[]) => {
  const s = asLeader(withCapital(undefined, {}).state, civ, techs);
  return itemCost(s, s.cities[0]!, { kind: 'unit', id: 'legion' });
};

/** Caligula in the Industrial era, his capital halfway through the Pyramids, gold to spare. */
function caligulaBuyWonderScenario(): GameState {
  const { state } = withCapital(undefined, { name: 'Rome', size: 4, build: { kind: 'wonder', id: 'pyramids' }, production: 45 });
  asLeader(state, 'rome', [...INDUSTRIAL, 'gunpowder', 'invention', 'engineering', 'construction', 'the_wheel', 'horseback_riding', 'iron_working']);
  state.players[0]!.gold = 1000;
  return state;
}

function caligulaPrice(): number {
  const s = caligulaBuyWonderScenario();
  return buyCost(s, capitalCity(s))!;
}

function capitalCity(s: GameState): City {
  return s.cities.find((c) => c.owner === 0)!;
}

/** Mansa Musa in the Medieval era with a full treasury, having met a neighbor. */
function mansaPilgrimageScenario(): GameState {
  const state = diplomacyBase();
  asLeader(state, 'mali', MEDIEVAL);
  capitalCity(state).name = 'Niani';
  state.players[0]!.gold = 400;
  return state;
}

/** Henry VIII in the Medieval era: two cities with Temples, one with a Cathedral too. */
function henryDissolutionScenario(): GameState {
  const { state } = withCapital(undefined, { name: 'London', size: 4, buildings: ['temple', 'cathedral'] });
  asLeader(state, 'england', [...MEDIEVAL, 'philosophy', 'mysticism', 'literacy', 'writing', 'mathematics', 'masonry', 'astronomy', 'monotheism']);
  addCity(state, 0, 3, 8, { name: 'York', size: 2, buildings: ['temple'], build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = 2;
  return state;
}

const henryCulture = (s: GameState) => empireCulture(s, 0);

/**
 * Bolívar (Medieval) at war with Maurya, which holds Djenné, a city Mali founded. His veteran
 * Legion army stands next to it; one Warrior defends it. Mali is at peace with him.
 */
function bolivarLiberateScenario(): GameState {
  const { state } = withCapital(undefined, { name: 'Bogotá', size: 3 }, 3);
  asLeader(state, 'gran_colombia', [...MEDIEVAL, 'bronze_working', 'iron_working']);
  // Only Gran Colombia and Maurya are at war.
  state.atWar = [
    [false, true, false],
    [true, false, false],
    [false, false, false],
  ];
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y, { fortified: true });
  addCity(state, 1, 12, 8, { name: RIVAL_CAPITAL, capitalOf: 1, build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'spearman', 1, 12, 8, { fortified: true });
  addCity(state, 2, 3, 8, { name: 'Niani', capitalOf: 2, build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'spearman', 2, 3, 8, { fortified: true });
  addCity(state, 1, ENEMY.x, ENEMY.y, { name: 'Djenné', size: 3, founder: 2, build: { kind: 'unit', id: 'warrior' } });
  addUnit(state, 'warrior', 1, ENEMY.x, ENEMY.y);
  addUnit(state, 'legion', 0, FRONT.x, FRONT.y, { army: true, veteran: true });
  state.players[1]!.citiesFounded = 1;
  state.players[2]!.citiesFounded = 2;
  state.rngState = FAIR_DICE;
  return state;
}

/** JFK in the Industrial era, researching Physics, with three trading cities. */
function jfkChallengeScenario(): GameState {
  const { state } = withCapital(undefined, { name: 'Washington', size: 5, buildings: ['library'] });
  asLeader(state, 'usa', [...INDUSTRIAL, 'gunpowder', 'invention', 'engineering', 'construction', 'the_wheel', 'horseback_riding', 'iron_working']);
  addCity(state, 0, 3, 3, { name: 'New York', size: 4, build: { kind: 'unit', id: 'warrior' } });
  addCity(state, 0, 12, 8, { name: 'Boston', size: 4, build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = 3;
  state.players[0]!.researching = 'physics';
  return state;
}

const jfkScience = (s: GameState) => empireIncome(s, 0).science;
function jfkWithChallenge(): GameState {
  const s = jfkChallengeScenario();
  applyAction(s, { type: 'setChallenge', tech: 'physics' });
  return s;
}

/** Louis XIV with Economics (Industrial): Paris and a second city. */
function versaillesScenario(): GameState {
  const { state } = withCapital(undefined, { name: 'Paris', size: 5, build: null });
  asLeader(state, 'france', [...INDUSTRIAL, 'gunpowder', 'invention', 'engineering', 'construction', 'the_wheel', 'horseback_riding', 'iron_working']);
  addCity(state, 0, 3, 8, { name: 'Marseille', size: 3, build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = 2;
  return state;
}

/**
 * Kim Jong Un in the Modern era, next to a much stronger Rome at peace (Caligula, a
 * conqueror), past the grace period. Deterrence keeps Rome's war score below zero.
 */
function deterrenceScenario(): GameState {
  const state = diplomacyBase({ civ: 'rome' });
  capitalCity(state).name = 'Pyongyang';
  asLeader(state, 'north_korea', ['electricity', 'electronics']);
  state.players[RIVAL]!.techs = ['bronze_working', 'iron_working'];
  addUnit(state, 'spearman', 0, CITY_X, CITY_Y, { fortified: true });
  for (let i = 0; i < 2; i++) addUnit(state, 'legion', RIVAL, 12, 8, { army: true });
  return state;
}

/** Rome's war score against you, with Deterrence and (for comparison) without it. */
function deterrenceScores(): { with: number; without: number } {
  const s = deterrenceScenario();
  const withIt = warScore(s, RIVAL, 0);
  s.players[0]!.techs = [];
  return { with: withIt, without: warScore(s, RIVAL, 0) };
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : 'none');

/** All 12 leaders in one game, everyone met and at peace, each with a city. */
function portraitsScenario(): GameState {
  const civs = PLAYABLE_CIVS.map((c) => c.id);
  const state = makeState(mapWith(), { players: civs.length, peace: true });
  state.players.forEach((p, i) => (p.civId = civs[i]!));
  state.diplomacy.met = state.players.map((_, a) => state.players.map((_, b) => a !== b));
  const spots = [
    [7, 5], [3, 3], [11, 3], [3, 8], [11, 8], [7, 9], [7, 2], [4, 5], [10, 5], [13, 5], [13, 2], [13, 9],
  ];
  civs.forEach((id, i) => {
    const [x, y] = spots[i]!;
    addCity(state, i, x!, y!, { name: findCiv(id)!.cityNames[0]!, capitalOf: i, build: { kind: 'unit', id: 'warrior' } });
    state.players[i]!.citiesFounded = 1;
  });
  state.turn = 40;
  return state;
}

const LIBERATION = LEADER_BONUSES.gran_colombia!.start.effects.find((e) => e.kind === 'liberation') as { culture: number; gold: number };

const LEADER_SCENARIOS: Scenario[] = [
  {
    id: 'new-game-setup',
    title: 'Leaders: New Game screen',
    note: `The New Game screen is open. Tap a leader card: its portrait, starting tech, and every bonus appear at the top. Tap 🎲 Random civ to go back to random. Pick a difficulty and a map size (Round 13): Small allows up to ${MAP_SIZES.small.maxRivals} rivals, Normal ${MAP_SIZES.normal.maxRivals}, Large ${MAP_SIZES.large.maxRivals}. Set Rivals with − and +. Tap Start: a new game begins with your leader and that many rivals, drawn from the rest (not saved here: this is a dev scenario). Turn the iPad: the cards reflow.`,
    build: newGameSetupScenario,
    opens: 'setup',
  },
  {
    id: 'starting-tech',
    title: 'Leaders: starting tech',
    note: `You are Peter the Great of Russia on turn 1. You already know Map Making, without Alphabet (a starting tech comes without the techs before it). Tap St. Petersburg: the Galley is in the build list (it's a port). Open Research: Alphabet is offered; Writing isn't yet.`,
    build: startingTechScenario,
  },
  {
    id: 'era-bonus',
    title: 'Leaders: an era bonus',
    note: `You are Caligula, one turn from Monarchy and the Medieval era. A Legion costs ${legionCost('rome', ['alphabet'])} now. Tap End Turn: you enter the Medieval era, and a toast names the era bonus (${LEADER_BONUSES.rome!.eras.medieval.name}): a Legion now costs ${legionCost('rome', ['monarchy'])}.`,
    build: eraBonusScenario,
  },
  {
    id: 'caligula-buy-wonder',
    title: 'Leaders: Caligula buys a wonder',
    note: `You are Caligula in the Industrial era. Rome is building the Pyramids. Tap Rome: the Buy button offers the Pyramids for ${caligulaPrice()} gold (wonders cost twice the usual price, less his 25% rush-buy discount; no one else can buy a wonder at all). Buy, then End Turn: the Pyramids are finished.`,
    build: caligulaBuyWonderScenario,
  },
  {
    id: 'mansa-pilgrimage',
    title: 'Leaders: the Pilgrimage',
    note: `You are Mansa Musa in the Medieval era with 400 gold. Tap your leader (top left): “The Pilgrimage” spends it all for ${Math.floor(400 * UNIQUE_RULES.pilgrimage.culturePerGold)} culture, and ${civName(mansaPilgrimageScenario(), RIVAL)} thinks better of you (Diplomacy: attitude up). The button then stays greyed: once per game.`,
    build: mansaPilgrimageScenario,
  },
  {
    id: 'henry-dissolution',
    title: 'Leaders: the Dissolution',
    note: `You are Henry VIII: London has a Temple and a Cathedral, York a Temple. Your empire makes ${henryCulture(henryDissolutionScenario())} culture a turn. Tap your leader, then “The Dissolution”: +${dissolutionGold(henryDissolutionScenario(), 0)} gold, and culture drops to ${henryCulture((() => { const s = henryDissolutionScenario(); applyAction(s, { type: 'dissolution' }); return s; })())} a turn for ${UNIQUE_RULES.dissolution.turns} turns.`,
    build: henryDissolutionScenario,
  },
  {
    id: 'bolivar-liberate',
    title: 'Leaders: Bolívar liberates a city',
    note: `You are Simón Bolívar, at war with Maurya. Djenné, east of Bogotá, was founded by Mali but is held by Maurya. Select your Legion army and attack it (${oddsAt(bolivarLiberateScenario(), FRONT, ENEMY)}%; the dice are set to win): you take Djenné whole (Liberation: +${LIBERATION.culture} culture and +${LIBERATION.gold} gold, and it keeps its size). A panel offers to return it to Mali: accept for +${UNIQUE_RULES.returnCity.culture} culture and a friend (Diplomacy: Mali friendly).`,
    build: () => withDiceFor(bolivarLiberateScenario, (s) => applyAction(s, { type: 'attack', unitId: s.units.find((u) => u.owner === 0 && u.army)!.id, at: ENEMY }).combat?.attackerWon === true),
  },
  {
    id: 'jfk-challenge',
    title: 'Leaders: the National Challenge',
    note: `You are John F. Kennedy in the Industrial era, researching Physics at ${jfkScience(jfkChallengeScenario())} science a turn. Open Research, tap Physics, then “⭐ Make it the National Challenge”: science rises to ${jfkScience(jfkWithChallenge())} a turn while you research it. Another tech can't be named until Physics is learned.`,
    build: jfkChallengeScenario,
  },
  {
    id: 'versailles',
    title: 'Leaders: Versailles',
    note: `You are Louis XIV with Economics. Tap Paris: Versailles is in the build list (a wonder only France can build, only in the capital: ${WONDERS.versailles.summary}). Tap Marseille: it isn't offered there.`,
    build: versaillesScenario,
  },
  {
    id: 'deterrence',
    title: 'Leaders: Deterrence',
    note: `You are Kim Jong Un in the Modern era, next to a far stronger Rome led by Caligula, a conqueror, at peace. Rome's war score against you is ${fmt(deterrenceScores().with)} with Deterrence (it would be ${fmt(deterrenceScores().without)} without it). Tap End Turn a few times: Rome never declares war.`,
    build: deterrenceScenario,
  },
  {
    id: 'portraits',
    title: 'Leaders: all portraits',
    note: 'All 12 leaders are in this game, met and at peace. Open 🤝 Diplomacy: each civ has its portrait (small and zoomed on the face in the list, large in the detail). Open 🏆 for the victory cards, and tap your leader (top left) for the big one. docs/portraits.html shows every size side by side.',
    build: portraitsScenario,
  },
];

// ---- Round 12: religion and roads ------------------------------------------------------------

/** Founds a religion for `p` in `city` with a set name (already named, so no naming panel). */
function withReligion(state: GameState, p: number, city: City, name: string, tech: TechId | null = 'mysticism'): Religion {
  const r = foundReligion(state, p, tech, city);
  r.name = name;
  r.named = true;
  return r;
}

const capitalOfCiv = (s: GameState, p = 0) => s.cities.find((c) => c.capitalOf === p && c.owner === p)!;
const cityNamed = (s: GameState, name: string) => s.cities.find((c) => c.name === name)!;

/** One End Turn from Mysticism, the first founding tech; nobody has a religion yet. */
function foundReligionScenario(): GameState {
  const { state } = withCapital(undefined, { size: 3 });
  oneTurnFromLearning(state, ['alphabet', 'ceremonial_burial'], 'mysticism');
  return state;
}

const FAITH = RELIGION_NAMES[0]!;
const OTHER_FAITH = RELIGION_NAMES[1]!;

/**
 * Your religion (holy city Babylon) and a Missionary standing between York (yours, no religion)
 * and Pataliputra (Maurya, at peace, no religion): it can reach both.
 */
function missionaryScenario(): GameState {
  const state = diplomacyBase();
  state.players[0]!.techs = ['alphabet', 'ceremonial_burial', 'mysticism'];
  const r = withReligion(state, 0, capitalOfCiv(state), FAITH);
  addCity(state, 0, 10, 6, { name: 'York', size: 2, build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = 2;
  addUnit(state, 'missionary', 0, 11, 7, { religion: r.id, charges: RELIGION.missionaryCharges });
  return state;
}

/** Your holy city (size 6, Temple, Cathedral) and York 3 tiles east, joined by road, with no religion. */
function religionSpreadBase(): GameState {
  const { state, city } = withCapital(undefined, { size: 6, buildings: ['temple', 'cathedral'] });
  withReligion(state, 0, city, FAITH);
  addCity(state, 0, CITY_X + 3, CITY_Y, { name: 'York', size: 2, build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = 2;
  for (let x = CITY_X + 1; x < CITY_X + 3; x++) state.map.tiles[tileIndex(state.map, x, CITY_Y)]!.road = 'road';
  return state;
}

function spreadChance(s: GameState): number {
  return conversionChancePct(s, cityNamed(s, 'York'), s.religions[0]!);
}

/** Babylon, holy city of your faith, with York, Ur, and Maurya's Pataliputra following it. */
function holyCityIncomeScenario(): GameState {
  const state = diplomacyBase();
  const r = withReligion(state, 0, capitalOfCiv(state), FAITH);
  addCity(state, 0, 4, 8, { name: 'York', size: 2, religion: r.id, build: { kind: 'unit', id: 'warrior' } });
  addCity(state, 0, 10, 3, { name: 'Ur', size: 2, religion: r.id, build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = 3;
  cityNamed(state, RIVAL_CAPITAL).religion = r.id;
  return state;
}

/**
 * Your capital follows your faith; Maurya's capital, Pataliputra, follows theirs (its holy city
 * is Taxila, further east). Your Missionary stands next to Pataliputra.
 */
function sharedFaithScenario(): GameState {
  const state = diplomacyBase();
  const mine = withReligion(state, 0, capitalOfCiv(state), FAITH);
  addCity(state, RIVAL, 13, 3, { name: 'Taxila', size: 2, build: { kind: 'unit', id: 'warrior' } });
  state.players[RIVAL]!.citiesFounded = 2;
  const theirs = withReligion(state, RIVAL, cityNamed(state, 'Taxila'), OTHER_FAITH, 'astronomy');
  cityNamed(state, RIVAL_CAPITAL).religion = theirs.id;
  state.diplomacy.opinion[RIVAL]![0] = 2;
  addUnit(state, 'missionary', 0, 11, 7, { religion: mine.id, charges: RELIGION.missionaryCharges });
  return state;
}

function sharedFaithAfter(): GameState {
  const s = sharedFaithScenario();
  const m = s.units.find((u) => u.type === 'missionary')!;
  applyAction(s, { type: 'spreadReligion', unitId: m.id, cityId: cityNamed(s, RIVAL_CAPITAL).id });
  return s;
}

/** Henry VIII (Medieval) with a Temple in London; Maurya already founded a religion. */
function henryChurchScenario(): GameState {
  const state = diplomacyBase();
  capitalOfCiv(state).name = 'London';
  capitalOfCiv(state).buildings = ['temple'];
  asLeader(state, 'england', [...MEDIEVAL]);
  state.players[RIVAL]!.techs = ['alphabet', 'ceremonial_burial', 'mysticism'];
  withReligion(state, RIVAL, capitalOfCiv(state, RIVAL), OTHER_FAITH);
  return state;
}

/** Babylon and York, 5 tiles apart on open land, and 200 gold. */
function buildRoadScenario(): GameState {
  const { state } = withCapital(undefined, { size: 3 });
  addCity(state, 0, CITY_X + 5, CITY_Y, { name: 'York', size: 2, build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = 2;
  state.players[0]!.gold = 200;
  return state;
}

function roadToYork(s: GameState) {
  return roadOption(s, 0, capitalOfCiv(s), cityNamed(s, 'York'))!;
}

const ROAD_ROW = CITY_Y + 2;

/** A Warrior (1 move) at the west end of a road 4 tiles long, south of the capital. */
function roadSpeedScenario(): GameState {
  const { state } = withCapital(undefined, {});
  for (let x = CITY_X + 1; x <= CITY_X + 4; x++) state.map.tiles[tileIndex(state.map, x, ROAD_ROW)]!.road = 'road';
  addUnit(state, 'warrior', 0, CITY_X + 1, ROAD_ROW);
  return state;
}

/** Every tech Railroad needs (its whole tree), so it's one End Turn away. */
function prereqsOf(tech: TechId): TechId[] {
  const out = new Set<TechId>();
  const walk = (t: TechId) => {
    for (const p of TECHS[t].prereqs) {
      if (!out.has(p)) {
        out.add(p);
        walk(p);
      }
    }
  };
  walk(tech);
  return TECH_LIST.map((t) => t.id).filter((t) => out.has(t));
}

/** One End Turn from Railroad, with a road from Babylon to York (5 tiles east) and a Warrior in Babylon. */
function railroadScenario(): GameState {
  const state = buildRoadScenario();
  for (let x = CITY_X + 1; x < CITY_X + 5; x++) state.map.tiles[tileIndex(state.map, x, CITY_Y)]!.road = 'road';
  oneTurnFromLearning(state, prereqsOf('railroad'), 'railroad');
  // Religions from the founding techs in that tree aren't the point here.
  state.religionTechsLapsed = ['mysticism', 'astronomy', 'philosophy', 'monotheism', 'theology'];
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y);
  return state;
}

/** Eight holy cities, one per symbol (and four followers), for Dan's icon check. */
const SYMBOL_SPOTS = [
  [3, 3], [7, 2], [11, 3], [3, 8], [11, 8], [7, 9], [13, 5], [2, 5],
] as const;
const FOLLOWER_SPOTS = [[5, 5], [9, 5], [5, 7], [9, 7]] as const;

function allReligionSymbolsScenario(): GameState {
  const { state } = withCapital(undefined, {});
  // Babylon (the capital) follows the first religion; Missionaries show their letters.
  const holies = SYMBOL_SPOTS.map(([x, y], i) => addCity(state, 0, x, y, { name: `Shrine ${i + 1}`, build: { kind: 'unit', id: 'warrior' } }));
  const religions = holies.map((c, i) => withReligion(state, 0, c, RELIGION_NAMES[i]!, null));
  FOLLOWER_SPOTS.forEach(([x, y], i) => addCity(state, 0, x, y, { name: `Town ${i + 1}`, religion: religions[i * 2]!.id, build: { kind: 'unit', id: 'warrior' } }));
  capitalOfCiv(state).religion = religions[2]!.id;
  state.players[0]!.citiesFounded = 1 + holies.length + FOLLOWER_SPOTS.length;
  addUnit(state, 'missionary', 0, CITY_X, CITY_Y + 1, { religion: religions[0]!.id, charges: RELIGION.missionaryCharges });
  return state;
}

const ROUND12_SCENARIOS: Scenario[] = [
  {
    id: 'found-religion',
    title: 'Religion: found one',
    note: `You're one End Turn from ${TECHS.mysticism.name}, and nobody has a religion yet. Tap End Turn: you learn it first and found a religion in ${CAPITAL}, now its holy city (the religion's disc in the city's lower-right corner, and the gold holy-city badge top right). A panel asks for its name: type your own, or tap Suggest for another invented one, then Found it. Tap ${CAPITAL}: its Religion line shows +${RELIGION.holyCity.culture} culture and +${RELIGION.holyCity.gold} gold a turn. ☰ → Religions lists it.`,
    build: foundReligionScenario,
  },
  {
    id: 'missionary',
    title: 'Religion: a Missionary',
    note: `Your Missionary (the robed figure, ${RELIGION.missionaryCharges} spreads of ${FAITH}) stands between York (yours) and ${RIVAL_CAPITAL} (Maurya, at peace), neither following a religion. Select it: two ✦ Spread buttons. Spread to York (its moves are used up). Tap End Turn, select it again, and spread to ${RIVAL_CAPITAL}: as the faith's founder you get +${RELIGION.conversionReward.gold} gold and +${RELIGION.conversionReward.culture} culture, and the Missionary is used up.`,
    build: missionaryScenario,
  },
  {
    id: 'religion-spread',
    title: 'Religion: it spreads',
    note: `${CAPITAL} (size 6, Temple, Cathedral) is the holy city of ${FAITH}. York, 3 tiles east and joined by road, follows no religion: it has a ${spreadChance(religionSpreadBase())}% chance a turn to convert on its own (closer, bigger, holy, Temples, Cathedrals, and the road all push). The dice are set so it converts on the first End Turn: York gets the dot, and its Temple-less panel says ${FAITH}.`,
    build: () => withDice(religionSpreadBase, (s) => cityNamed(s, 'York').religion === s.religions[0]!.id),
  },
  {
    id: 'holy-city-income',
    title: 'Religion: holy city income',
    note: `${CAPITAL} is the holy city of ${FAITH}, and York, Ur, and Maurya's ${RIVAL_CAPITAL} follow it. Tap ${CAPITAL}: its Religion line says +${religionCityCulture(holyCityIncomeScenario(), capitalOfCiv(holyCityIncomeScenario()))} culture and +${religionCityGold(holyCityIncomeScenario(), capitalOfCiv(holyCityIncomeScenario()))} gold a turn (${RELIGION.holyCity.gold} for the holy city and +${RELIGION.holyCity.goldPerFollower} for each of the 3 cities following it, up to +${RELIGION.holyCity.maxFollowerGold}). Whoever holds the holy city gets it.`,
    build: holyCityIncomeScenario,
  },
  {
    id: 'shared-faith',
    title: 'Religion: a shared faith',
    note: `Your capital follows ${FAITH}; Maurya's, ${RIVAL_CAPITAL}, follows ${OTHER_FAITH}. Open 🤝 Diplomacy → Maurya: Faith “Different faith (−${Math.abs(faithOpinion(sharedFaithScenario(), RIVAL, 0))} opinion)”, attitude ${attitude(sharedFaithScenario(), RIVAL, 0)}. Close it, select your Missionary next to ${RIVAL_CAPITAL}, and spread ${FAITH} there. Diplomacy now says “Shares your faith (+${faithOpinion(sharedFaithAfter(), RIVAL, 0)} opinion)”: opinion ${opinionOf(sharedFaithScenario(), RIVAL, 0)} → ${opinionOf(sharedFaithAfter(), RIVAL, 0)}, attitude ${attitude(sharedFaithAfter(), RIVAL, 0)}.`,
    build: sharedFaithScenario,
  },
  {
    id: 'henry-national-church',
    title: 'Religion: Henry VIII’s national church',
    note: `You are Henry VIII in the Medieval era, with a Temple in London. Maurya already founded ${OTHER_FAITH}. Tap your leader (top left), then “👑 Found a national church”: London becomes the holy city of a faith of your own anyway, and the naming panel opens. Once per game.`,
    build: henryChurchScenario,
  },
  {
    id: 'build-road',
    title: 'Roads: buy a road',
    note: `${CAPITAL} and York are 5 tiles apart, and you have 200 gold. Tap ${CAPITAL}: under “Build road to…”, York costs ${roadToYork(buildRoadScenario()).cost} gold (${roadToYork(buildRoadScenario()).newTiles} new tiles at ${ROADS.goldPerTile} each). Tap it: a brown road appears between them at once, and your gold drops to ${200 - roadToYork(buildRoadScenario()).cost}. Tap ${CAPITAL} again: York now says “joined by road”.`,
    build: buildRoadScenario,
  },
  {
    id: 'road-speed',
    title: 'Roads: moving on a road',
    note: `Your Warrior (1 move) stands at the west end of a road, south-east of ${CAPITAL}. Tap the road tile 3 east of it: the Warrior gets there this turn, ⅓ of a move a tile (off the road it would take 3 turns).`,
    build: roadSpeedScenario,
  },
  {
    id: 'railroad',
    title: 'Roads: Railroad',
    note: `You're one End Turn from ${TECHS.railroad.name}, with a road from ${CAPITAL} to York. Tap End Turn: the road turns into rail (dark, with ties), for free. Then select your Warrior in ${CAPITAL} and tap York: 5 tiles for half a move (1/10 a tile); it can ride back too. Worked rail tiles also give +${ROADS.railProduction} production.`,
    build: railroadScenario,
  },
  {
    id: 'all-religion-symbols',
    title: 'Religion: all symbols',
    note: `All ${RELIGION_SYMBOLS.length} religion symbols (${RELIGION_SYMBOLS.map((x) => x.name).join(', ')}), each white on its religion's color on its holy city (with the gold holy-city badge top right), four follower cities with just the disc, and a Missionary (the robed figure) south of ${CAPITAL}. Pinch-zoom to see them at other sizes; ☰ → Religions shows them in the panel. These are Dan's picks from docs/religion-road-icon-candidates.html.`,
    build: allReligionSymbolsScenario,
  },
];

// ---- Round 13: the main menu, Settings, difficulty, map size, the guide, and tips ---------

/** Turns a Large-map scenario plays (all AI, you included) before you take over. */
export const LARGE_MAP_TURNS = 60;
export const LARGE_MAP_SEED = 4413;

/** A new Legendary game: every rival starts with the level's extra units. */
function legendaryStartScenario(): GameState {
  return createGame({ seed: 1313, difficulty: 'legendary' });
}

/**
 * A Large map with 5 rivals, played by the AI (you too) for LARGE_MAP_TURNS turns so there's
 * plenty on it, then handed to you with the whole map revealed, so the renderer draws every tile.
 */
function largeMapScenario(): GameState {
  const s = createGame({ seed: LARGE_MAP_SEED, mapSize: 'large', playerCount: MAP_SIZES.large.maxRivals + 1 });
  s.players[0]!.kind = 'ai';
  while (s.turn <= LARGE_MAP_TURNS || s.currentPlayer !== 0) {
    playComputerTurn(s, s.currentPlayer);
    endTurn(s);
  }
  s.players[0]!.kind = 'human';
  s.players[0]!.explored.fill(1);
  // The AI left its own research and builds going; you choose from here.
  return s;
}

/** Turn 1: your Settler and Warrior, a civ met (at war), and a barbarian village in sight. */
function firstGameTipsScenario(): GameState {
  const state = makeState(mapWith(), { players: 2 });
  addBarbarians(state);
  addUnit(state, 'settler', 0, CITY_X, CITY_Y);
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y);
  addVillage(state, CITY_X + 3, CITY_Y);
  // Nearly done with Pottery, so End Turn brings the first tech.
  const p = state.players[0]!;
  p.researching = 'pottery';
  p.science = techCost(state, 0, 'pottery');
  return state;
}

const ROUND13_SCENARIOS: Scenario[] = [
  {
    id: 'main-menu',
    title: 'Main menu',
    note: `The main menu is open over your game: the EPOCH title, then Continue (your leader, turn, era, difficulty, and map), New Game, How to Play, Almanac, Settings, Restore a backup, and About / Credits. Tap Continue: the game is there. Open ☰ → Main menu: it comes back. Turn the iPad: it fits both ways.`,
    build: () => withCapital(undefined, {}).state,
    opens: 'mainMenu',
  },
  {
    id: 'settings',
    title: 'Settings',
    note: `Settings is open. Set Text size to Large: the menus and panels grow at once. Turn Confirm End Turn on, close Settings, and tap End Turn: your Warrior can still move, so “End your turn? 1 unit can still move” asks first (Keep playing selects it). Settings are kept on this device, apart from your games: reload and they're still set.`,
    build: () => {
      const { state } = withCapital(undefined, {});
      addUnit(state, 'warrior', 0, CITY_X + 1, CITY_Y);
      return state;
    },
    opens: 'settings',
  },
  {
    id: 'difficulty-legendary-start',
    title: 'Difficulty: a Legendary start',
    note: `A new Legendary game on turn 1. Open 🏆: it says Legendary · Normal map. You have your Settler and Warrior; every rival started with ${DIFFICULTIES.legendary.extraAiUnits.length + 2} units (a free ${DIFFICULTIES.legendary.extraAiUnits.map((u) => UNITS[u].name).join(' and ')} on top), and their production, science, and gold are +${DIFFICULTIES.legendary.ai.production}%. They may declare war on you from turn ${DIFFICULTIES.legendary.warGraceTurns} (Normal: ${DIFFICULTIES.normal.warGraceTurns}). ☰ → Almanac → Difficulty lists every level.`,
    build: legendaryStartScenario,
  },
  {
    id: 'large-map',
    title: 'Map size: a Large map',
    note: `A Large map (${MAP_SIZES.large.width}×${MAP_SIZES.large.height}) with ${MAP_SIZES.large.maxRivals} rivals, played by the computer for ${LARGE_MAP_TURNS} turns, all of it revealed so every tile is drawn (it takes a few seconds to load). Pinch out to see the whole map and drag around: it should stay smooth. Tap End Turn: six civs and the barbarians move, which takes a moment; the toast says how long. Goals here are ${victoryGoals('large').culture} culture and ${victoryGoals('large').gold} gold.`,
    build: largeMapScenario,
  },
  {
    id: 'almanac',
    title: 'Almanac',
    note: `The Almanac is open. Type “spear” in the search box: Spearman comes first. Tap it, then its Bronze Working link: the tech's card, with everything it unlocks. Tap ‹ Back. Tap the category chips (Units, Techs, Leaders…). Close it, tap ${CAPITAL}, and tap ⓘ next to Warrior in the Build list: the Warrior's card opens. The tech screen's names are links too.`,
    build: () => withCapital(undefined, {}).state,
    opens: 'almanac',
  },
  {
    id: 'how-to-play',
    title: 'How to Play',
    note: `How to Play is open on its first page. Tap Next › through the pages (or pick one from the list): moving and founding cities, cities, research, combat, ships and aircraft, diplomacy, villages and Great People, religion and roads, and the four ways to win. The underlined names open their Almanac cards.`,
    build: () => withCapital(undefined, {}).state,
    opens: 'howToPlay',
  },
  {
    id: 'first-game-tips',
    title: 'First-game tips',
    note: `Every first-game tip is fresh here (your device's own list is untouched). A green tip says to found your city; tap Got it: the next tips come one at a time (you've met the Mauryans and you're at war with them, and a barbarian village is in sight). Found a city: “Your first city” appears. Tap End Turn: you learn Pottery and “A new tech” appears. “No more tips” turns them off (Settings turns them back on).`,
    build: firstGameTipsScenario,
    freshTips: true,
  },
];

// ---- Round 14: big maps, the art candidates, era music ---------------------------------------

/** The minimap scenario's seed: a new Huge game with everything revealed. */
export const MINIMAP_SEED = 6420;

function minimapScenario(): GameState {
  const s = createGame({ seed: MINIMAP_SEED, mapSize: 'huge', playerCount: MAP_SIZES.huge.maxRivals + 1 });
  s.players[0]!.explored.fill(1);
  return s;
}

/** Two cities side by side: yours with Walls, the other without. */
function wallsDrawnScenario(): GameState {
  const { state } = withCapital(undefined, { size: 6, buildings: ['walls'] });
  addCity(state, 0, CITY_X + 3, CITY_Y, { name: 'Ur', size: 6, build: { kind: 'unit', id: 'warrior' } });
  state.players[0]!.citiesFounded = 2;
  return state;
}

/** One End Turn from Monarchy (the Medieval era); the music is on here. */
function eraMusicScenario(): GameState {
  const { state } = withCapital(undefined, { size: 3 });
  oneTurnFromLearning(state, ['alphabet', 'ceremonial_burial', 'code_of_laws'], 'monarchy');
  return state;
}

/** Round 15 (B5): one End Turn from Theology, which now unlocks the Grand Cathedral. */
function theologyScenario(): GameState {
  const { state } = withCapital(undefined, { size: 4 });
  oneTurnFromLearning(state, prereqsOf('theology'), 'theology');
  return state;
}

/** Round 15 (B4): an AI at peace, past the road turn, with gold and two cities not yet joined. */
function aiRoadsScenario(): GameState {
  const state = diplomacyBase();
  state.turn = ROADS.ai.priorityFromTurn;
  addCity(state, RIVAL, 12, 3, { name: 'Kish', size: 2, build: { kind: 'unit', id: 'warrior' } });
  state.players[RIVAL]!.citiesFounded = 2;
  state.players[RIVAL]!.gold = 200;
  state.players[RIVAL]!.explored = state.players[RIVAL]!.explored.map(() => 1);
  return state;
}

// ---- Round 16: cloud saves (against the stand-in cloud) ----

const CLOUD_GAME = 'scenario-game';
const HOUR = 3_600_000;

/** The game on this device in the cloud scenarios: turn 12, England. */
function cloudLocalGame(): GameState {
  const { state } = withCapital(undefined, { size: 3, name: 'London' });
  state.turn = 12;
  return asLeader(state, 'england', ['alphabet']);
}

/** Another game at `turn` as `civId` (for the cloud's copies). */
function cloudOtherGame(civId: string, turn: number, techs: TechId[] = []): GameState {
  const { state } = withCapital(undefined, { size: 5 });
  state.turn = turn;
  return asLeader(state, civId, techs);
}

function cloudConflict(): CloudScenario {
  const store = new MemoryCloudStore();
  const link: CloudLink = { gameId: CLOUD_GAME, slot: 's1', uid: 'dev-user', syncedRev: 3, dirty: true };
  return {
    store,
    link,
    savedAt: Date.now() - 5 * 60_000,
    backend: async () => {
      // The same game, played on to turn 15 on the iPad (revision 5; this device last saw 3).
      await putSlot(store, cloudOtherGame('england', 15, ['alphabet', 'bronze_working']), { slot: 's1', gameId: CLOUD_GAME, rev: 5, device: 'iPad', agoMs: 2 * HOUR });
      return mockBackend(store);
    },
  };
}

/** The cloud is unreachable for the first ~12 seconds, then comes back. */
export const CLOUD_OFFLINE_MS = 12_000;

function cloudOffline(): CloudScenario {
  const store = new MemoryCloudStore();
  const link: CloudLink = { gameId: CLOUD_GAME, slot: 's1', uid: 'dev-user', syncedRev: 2, dirty: false };
  return {
    store,
    link,
    backend: async () => {
      await putSlot(store, cloudLocalGame(), { slot: 's1', gameId: CLOUD_GAME, rev: 2, device: 'PC', agoMs: 60_000 });
      store.offline = true;
      setTimeout(() => (store.offline = false), CLOUD_OFFLINE_MS);
      return mockBackend(store);
    },
  };
}

function cloudSlots(): CloudScenario {
  const store = new MemoryCloudStore();
  return {
    store,
    link: { gameId: CLOUD_GAME, syncedRev: 0, dirty: true },
    savedAt: Date.now() - 20 * 60_000,
    backend: async () => {
      await putSlot(store, cloudOtherGame('egypt', 87, ['alphabet', 'masonry', 'bronze_working']), { slot: 's1', gameId: 'g-egypt', rev: 41, device: 'iPad', agoMs: 3 * HOUR, name: 'Egypt, the long game' });
      await putSlot(store, cloudOtherGame('usa', 143, MEDIEVAL), { slot: 's2', gameId: 'g-usa', rev: 77, device: 'PC', agoMs: 26 * HOUR });
      await putSlot(store, cloudOtherGame('mali', 34), { slot: 's3', gameId: 'g-mali', rev: 9, device: 'iPad', agoMs: 5 * 24 * HOUR });
      return mockBackend(store);
    },
  };
}

/** Round 16b: signed out, with a game in progress here (never uploaded) and one game already in the cloud. */
function cloudSignInExisting(): CloudScenario {
  const store = new MemoryCloudStore();
  return {
    store,
    link: { gameId: CLOUD_GAME, syncedRev: 0, dirty: true },
    savedAt: Date.now() - 10 * 60_000,
    backend: async () => {
      await putSlot(store, cloudOtherGame('egypt', 87, ['alphabet', 'masonry', 'bronze_working']), { slot: 's1', gameId: 'g-egypt', rev: 41, device: 'iPad', agoMs: 3 * HOUR });
      return mockBackend(store, undefined, { signedIn: false });
    },
  };
}

/** Round 16b: signed out; the first sign-in doesn't finish (as if the popup were closed), the second works. */
function cloudSignInFails(): CloudScenario {
  const store = new MemoryCloudStore();
  return {
    store,
    link: { gameId: CLOUD_GAME, syncedRev: 0, dirty: true },
    backend: async () => mockBackend(store, undefined, { signedIn: false, failFirst: 1 }),
  };
}

const ROUND16_SCENARIOS: Scenario[] = [
  {
    id: 'cloud-conflict',
    title: 'Cloud: keep which game?',
    note: `As if you played this game (England, turn 12) here without syncing while it went on to turn 15 on the iPad. At once the “Which game do you want to keep?” panel shows both: this device's turn 12 (a few minutes ago) and the cloud's turn 15 (2 hours ago, iPad). Keep the cloud's: the game becomes turn 15 and this device's turn 12 goes into the backups. Or keep this device's: the cloud's turn 15 goes into the backups and turn 12 is written up (☁✓). (Stand-in cloud, and its backups are kept in memory: your real game and backups are untouched.)`,
    build: cloudLocalGame,
    cloud: cloudConflict,
  },
  {
    id: 'cloud-offline',
    title: 'Cloud: offline, then back',
    note: `Signed in, with no network for the first ${CLOUD_OFFLINE_MS / 1000} seconds. Tap End Turn: the cloud mark by the game's name shows ☁⤫ (tap it: “Offline: will sync”); no pop-up, and the game carries on. The write is retried (after 2, 4, 8 seconds…); once the network is back, the next try shows ☁… then ☁✓ (“Saved to cloud ✓”). (Stand-in cloud.)`,
    build: cloudLocalGame,
    cloud: cloudOffline,
  },
  {
    id: 'cloud-slots',
    title: 'Cloud: games on the main menu',
    note: `The main menu, signed in (“☁ Signed in as Dan (stand-in)” in a green box), with the game on this device (England, turn 12) and three cloud games: Egypt turn 87 (renamed “Egypt, the long game”, iPad, 3 hours ago), the United States turn 143 (PC, yesterday), and Mali turn 34 (iPad, 5 days ago). Continue picks the newest: the game here (it's uploaded to the 4th slot within a moment, with a toast: “On this device and in the cloud”). Try Open, Rename, and Delete (it asks first) on a cloud game. Round 16b: play, then ☰ → Save now (“Saved ✓ in the (stand-in) cloud”), and ☰ → Save to a new cloud slot… (a copy goes into slot 5; a second copy says the cloud is full). Tap the ☁ mark by the game's name: when it last saved, and Sync now. (Stand-in cloud: nothing real changes.)`,
    build: cloudLocalGame,
    cloud: cloudSlots,
    opens: 'mainMenu',
  },
  {
    id: 'cloud-signin-existing-game',
    title: 'Cloud: sign in with a game going',
    note: `The main menu, NOT signed in: an orange-edged box says “Not signed in: sign in to see your cloud games”. This device has a game going (England, turn 12) that was never uploaded, and the cloud already holds Egypt, turn 87. Tap Sign in with Google: the button says “Signing in…”, then “☁ Signed in as Dan (stand-in)” (a green box), the toast “This game is now saved in the cloud too … (slot 2 of 5)”, and the menu lists both games (England: “On this device and in the cloud”). (Stand-in cloud: nothing real changes.)`,
    build: cloudLocalGame,
    cloud: cloudSignInExisting,
    opens: 'mainMenu',
  },
  {
    id: 'cloud-signin-fails',
    title: 'Cloud: sign-in doesn’t finish',
    note: `The main menu, not signed in. Tap Sign in with Google: this first try doesn't finish (as if the Google window were closed), and the toast says “Sign-in failed. Please try again.” The box still says “Not signed in”, and ☰ → Settings → Cloud saves shows “Last try: … popup, closed before it finished (auth/popup-closed-by-user)”. Tap Sign in again: this time it works (“☁ Signed in as Dan (stand-in)”, and the game goes up to the cloud). (Stand-in cloud.)`,
    build: cloudLocalGame,
    cloud: cloudSignInFails,
    opens: 'mainMenu',
  },
];

// ---- Round 17: city arrows, and tapping a city with a unit selected -----------------------

/** The five cities of `city-cycle`, in the order the arrows go through them (the capital first). */
export const CYCLE_CITIES = [CAPITAL, 'Ur', 'Uruk', 'Nippur', 'Lagash'];

function cityCycleScenario(): GameState {
  const { state } = withCapital(undefined, { size: 5 });
  const spots: [number, number][] = [[3, 3], [11, 3], [3, 8], [11, 8]];
  spots.forEach(([x, y], i) => {
    const name = CYCLE_CITIES[i + 1]!;
    // Lagash, the last, has nothing to build.
    addCity(state, 0, x, y, { name, size: 2 + i, build: name === 'Lagash' ? null : { kind: 'unit', id: 'warrior' } });
  });
  state.players[0]!.citiesFounded = 5;
  return state;
}

/** Legion 4 tiles west of the capital (selected first), a Warrior right next to it (east). */
export const TAP_CITY_LEGION = { x: CITY_X - 4, y: CITY_Y };
export const TAP_CITY_WARRIOR = { x: CITY_X + 1, y: CITY_Y };

function tapCityWithUnitScenario(): GameState {
  const { state } = withCapital(undefined, { size: 3 });
  state.players[0]!.techs = ['bronze_working', 'iron_working'];
  addUnit(state, 'legion', 0, TAP_CITY_LEGION.x, TAP_CITY_LEGION.y);
  addUnit(state, 'warrior', 0, TAP_CITY_WARRIOR.x, TAP_CITY_WARRIOR.y);
  return state;
}

const ROUND17_SCENARIOS: Scenario[] = [
  {
    id: 'city-cycle',
    title: 'City arrows: go through your cities',
    note: `Five cities; Lagash has nothing to build, so its panel opens first (5 / 5 under its name). Tap ▶: ${CYCLE_CITIES.join(' → ')} and round again (◀ goes back), the map recentering on each and the panel staying where you'd scrolled. On the other four an orange dot by the count says another city needs a build. On a computer , and . (or [ and ]) do the same; on the iPad a swipe left or right across the top of the panel does too.`,
    build: cityCycleScenario,
  },
  {
    id: 'tap-city-with-unit',
    title: 'Tapping your city with a unit selected',
    note: `The Legion (4 tiles west of ${CAPITAL}) is selected. Tap ${CAPITAL}: it opens instead of moving the Legion, with a “Move Legion here (4 turns)” button at the top; tap it and the Legion takes its first step and the panel closes. Then the Warrior (right next to ${CAPITAL}, east) is selected: tap ${CAPITAL} and it moves straight in, no panel. Settings → Tap twice to move: the first tap on a tile shows the path and the turns, the second moves.`,
    build: tapCityWithUnitScenario,
  },
];

// ---- Round 18: the next unit in view, Wake and the Units list, tapping your own units -------

/** `next-unit-in-view`: a Warrior next to a Galley in the channel, and a Horseman far to the east. */
export const NEXT_UNIT = { warrior: { x: 5, y: 6 }, galley: { x: 6, y: 5 }, galleyTo: { x: 7, y: 8 }, horseman: { x: 14, y: 9 } };

function nextUnitInViewScenario(): GameState {
  const state = seaState(8);
  addUnit(state, 'warrior', 0, NEXT_UNIT.warrior.x, NEXT_UNIT.warrior.y);
  addUnit(state, 'galley', 0, NEXT_UNIT.galley.x, NEXT_UNIT.galley.y);
  addUnit(state, 'horseman', 0, NEXT_UNIT.horseman.x, NEXT_UNIT.horseman.y);
  // You've seen the far shore (the Horseman got there on an earlier turn).
  state.players[0]!.explored.fill(1);
  return state;
}

/** `fortified-units`: two land units fortified, a Galley staying put, and one Warrior ready. */
export const FORTIFIED = { archer: { x: 4, y: 6 }, galley: { x: 13, y: 1 }, warrior: { x: 9, y: 4 } };

function fortifiedUnitsScenario(): GameState {
  const { state } = withCapital(undefined, { size: 3 });
  state.players[0]!.techs = ['bronze_working', 'archery', 'map_making'];
  addUnit(state, 'warrior', 0, FORTIFIED.warrior.x, FORTIFIED.warrior.y);
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y, { fortified: true });
  addUnit(state, 'archer', 0, FORTIFIED.archer.x, FORTIFIED.archer.y, { fortified: true });
  addUnit(state, 'galley', 0, FORTIFIED.galley.x, FORTIFIED.galley.y, { fortified: true });
  state.players[0]!.explored.fill(1);
  return state;
}

/** `tap-own-unit`: a Legion to the west, two Legions to the south-west, a Warrior next to them, and a Galley on the west coast. */
export const TAP_OWN = { legion: { x: 3, y: 5 }, stack: { x: 4, y: 8 }, warrior: { x: 5, y: 9 }, galley: { x: 1, y: 3 } };

function tapOwnUnitScenario(): GameState {
  const { state } = withCapital(undefined, { size: 3 });
  state.players[0]!.techs = ['bronze_working', 'iron_working', 'map_making'];
  addUnit(state, 'legion', 0, TAP_OWN.legion.x, TAP_OWN.legion.y);
  addUnit(state, 'legion', 0, TAP_OWN.stack.x, TAP_OWN.stack.y, { movesLeft: 0 });
  addUnit(state, 'legion', 0, TAP_OWN.stack.x, TAP_OWN.stack.y, { movesLeft: 0 });
  addUnit(state, 'warrior', 0, TAP_OWN.warrior.x, TAP_OWN.warrior.y);
  addUnit(state, 'galley', 0, TAP_OWN.galley.x, TAP_OWN.galley.y, { movesLeft: 0 });
  state.players[0]!.explored.fill(1);
  return state;
}

const ROUND18_SCENARIOS: Scenario[] = [
  {
    id: 'next-unit-in-view',
    title: 'Next unit: the map brings it into view',
    note: `The Warrior (on the shore, south-west of the Galley) is selected. Tap the Galley: it boards with one tap (it's right next to it), and the game selects the Galley. Tap the channel 3 tiles south (south-east of the Galley's start): the Galley sails there with the Warrior aboard and uses its moves, and the game selects the Horseman, far off on the eastern shore: the map pans smoothly until it's in view. (If a unit is already comfortably on screen, the map doesn't move.)`,
    build: nextUnitInViewScenario,
  },
  {
    id: 'fortified-units',
    title: 'Fortified units: Wake and the Units list',
    note: `A Warrior in ${CAPITAL} and an Archer on the hill to the west are fortified, and a Galley on the north coast is staying put; only the Warrior east of ${CAPITAL} is ready, so Next Unit never offers the others. ☰ → Units → Fortified lists all three: tap the Archer and the map centers on it, selected. Its button reads Wake: tap it (“Archer is awake and ready to move”), and Next Unit offers it again. The Galley's button reads Wake too. Also: tap ${CAPITAL} and pick the Warrior from its unit list; it has Wake.`,
    build: fortifiedUnitsScenario,
  },
  {
    id: 'tap-own-unit',
    title: 'Tapping your own units from a distance',
    note: `The Legion west of ${CAPITAL} is selected. Tap the Galley on the west coast: the Galley is selected instead (the Legion doesn't move), with “⚓ Board the Galley (Legion, 2 turns)”. Tap the Legion to select it again, then tap the two Legions to the south: they're selected, with “Move Legion here (3 turns)”; tap it and the Legion sets off to stack up (three Legions make an army), and the game selects the Warrior, right next to the two Legions: tap them and it moves straight in with one tap.`,
    build: tapOwnUnitScenario,
  },
];

const ROUND15_SCENARIOS: Scenario[] = [
  {
    id: 'theology',
    title: 'Religion: Theology unlocks the Grand Cathedral',
    note: `You're one End Turn from ${TECHS.theology.name}. Tap ${CAPITAL}: the ${WONDERS.grand_cathedral.name} isn't in the build list yet. Tap End Turn: you learn ${TECHS.theology.name} (which still founds a religion for a civ that has none), and the ${WONDERS.grand_cathedral.name} (${WONDERS.grand_cathedral.cost} production, ${WONDERS.grand_cathedral.summary}) is in the list. It used to come with ${TECHS.monotheism.name}.`,
    build: theologyScenario,
  },
  {
    id: 'ai-roads',
    title: 'Roads: the AI links its cities',
    note: `${RIVAL_CAPITAL} and Kish (the rival's two cities, east) have no road between them, it's turn ${ROADS.ai.priorityFromTurn}, and the rival has 200 gold. Tap End Turn: on its turn the rival buys the road between them (from turn ${ROADS.ai.priorityFromTurn} a link costing up to ${ROADS.ai.priorityMaxCost} gold comes before its other purchases), drawn at once.`,
    build: aiRoadsScenario,
  },
  {
    id: 'update-available',
    title: 'App: update available',
    note: `As if a new version of the game had been put online while you play: the “Update available: tap to reload” banner shows just under the top bar, and nothing reloads by itself. Keep playing (move a unit, End Turn): the banner stays. Tap it: in the real game it saves, switches to the new version, and reloads to your game; here it only says so. (The dev server never caches the game, so this is the banner alone; the offline part is checked on the built game.)`,
    build: () => withCapital(undefined, { size: 3 }).state,
    fakeUpdate: true,
  },
];

const ROUND14_SCENARIOS: Scenario[] = [
  {
    id: 'huge-map',
    title: 'Map size: late in a Huge game',
    note: `A Huge map (${MAP_SIZES.huge.width}×${MAP_SIZES.huge.height}) with ${MAP_SIZES.huge.maxRivals} rivals at turn ${FIXTURE_TURN + 1}, played by the computer, all of it revealed. Tap End Turn: “Rivals are moving…” shows by the button while the map still pans and zooms (the rivals move in the background), then the toast says how long it took. Dan: please time it on the iPad and on the PC (the target is under about 1.5 s on the iPad). The minimap (top right) jumps and pans.`,
    build: () => lateGame('huge'),
  },
  {
    id: 'epic-map',
    title: 'Map size: late in an Epic game',
    note: `An Epic map (${MAP_SIZES.epic.width}×${MAP_SIZES.epic.height}) with ${MAP_SIZES.epic.maxRivals} rivals at turn ${FIXTURE_TURN + 1}, all revealed. Tap End Turn: “Rivals are moving…” while they move in the background; the toast says how long. Epic is offered everywhere, marked best on a computer on a touch device.`,
    build: () => lateGame('epic'),
  },
  {
    id: 'minimap',
    title: 'Minimap and zoom',
    note: `A new Huge map, all revealed. The minimap (top right) shows the whole world; the gold frame is what's on screen. Tap anywhere on it: the view jumps there. Drag on it: the view follows your finger. Pinch out as far as it goes: it stops at about ${ZOOM_OUT_TILES} tiles across the longer side (never tinier). A new game opens closer in, about ${DEFAULT_VIEW_TILES.across}×${DEFAULT_VIEW_TILES.down} tiles. 🗺 folds the minimap away (kept on this device).`,
    build: minimapScenario,
  },
  {
    id: 'city-growth-looks',
    title: 'Art: city looks by size and era',
    note: `Four civs, one per era (top to bottom: Ancient, Medieval, Industrial, Modern), each with a village (size ${LOOK_SIZES[0]}), a town (${LOOK_SIZES[1]}), a city (${LOOK_SIZES[2]}), and a metropolis (${LOOK_SIZES[3]}), left to right, and a walled metropolis on the right. These are drawn in Bold buildings (B, Dan's pick): they grow with size and change with the era. ☰ → Art style (dev only) switches Cities to A (little towns) or Old (the plain square) to compare. The capital star stays on the left-hand city of each row.`,
    build: cityLooksState,
  },
  {
    id: 'walls-drawn',
    title: 'Art: walls drawn',
    note: `${CAPITAL} has Walls; Ur, to its east, doesn't. ${CAPITAL} shows a stone wall with corner towers around its buildings. ☰ → Art style (dev only): switch Cities to A or Old; the walls stay.`,
    build: wallsDrawnScenario,
  },
  {
    id: 'terrain-styles',
    title: 'Art: terrain styles',
    note: `A small map with every terrain, a coast and an island, cities, units, an army, a ship, resources, a hut, a barbarian village, a road, a railroad, and fog (the dim tiles). The game draws Dan's picks: Painted terrain (A; its water shimmers) and Bold buildings (B). ☰ → Art style (dev only) switches Terrain between Old, A, B (storybook), and C (clean flat), and Cities between Old, A, and B, to compare.`,
    build: artDemoState,
  },
  {
    id: 'era-music',
    title: 'Music: era tracks',
    note: `Sound is on in this scenario. Tap anywhere first (the iPad needs a tap before any sound). You're in the Ancient era: its track plays (or the theme, if that track is missing). Tap End Turn: you learn ${TECHS.monarchy.name} and reach the Medieval era; the music crossfades to the Medieval track. To hear every track, use the Music buttons here: Theme, Ancient, Medieval, Industrial, Modern (each crossfades in; Game goes back to your era). ☰ → Main menu plays the theme.`,
    build: eraMusicScenario,
    sound: true,
    musicSwitch: true,
  },
];

// ---- Round 19 Part A: cards, warnings, the news log --------------------------------------------

/** England's capital in the rival victory-wonder scenario, and how many turns its Global Exchange needs. */
export const RIVAL_WONDER = { city: 'London', turns: 7 };

/**
 * England (the rival) has the gold goal and London starts the Global Exchange: End Turn warns
 * that the goal is reached and it's being built (about 7 turns); a few more End Turns count down.
 */
export function rivalVictoryWonderScenario(): GameState {
  const state = diplomacyBase({ civ: 'england' });
  const london = state.cities.find((c) => c.owner === RIVAL)!;
  london.name = RIVAL_WONDER.city;
  const p = state.players[RIVAL]!;
  p.techs = ['economics', 'currency', 'bronze_working'];
  p.gold = VICTORY.goldGoal + 400;
  london.build = { kind: 'wonder', id: 'global_exchange' };
  const perTurn = cityYields(state, london).production;
  // One turn passes before the warning, which then says about RIVAL_WONDER.turns.
  london.production = Math.max(0, WONDERS.global_exchange.cost - perTurn * (RIVAL_WONDER.turns + 1));
  // An extra defender, so England doesn't switch to guarding its capital, and it has only seen
  // the tiles around London, so it isn't looking to expand (as in the wonder race).
  addUnit(state, 'spearman', RIVAL, london.x, london.y, { fortified: true });
  const seen = state.players[RIVAL]!.explored;
  seen.fill(0);
  for (let y = london.y - 1; y <= london.y + 1; y++) for (let x = london.x - 1; x <= london.x + 1; x++) seen[tileIndex(state.map, x, y)] = 1;
  return state;
}

/**
 * Round 19 (item 10): England won by economy on turn 190 and you kept playing; your spaceship
 * arrives at the start of next turn.
 */
export function keepPlayingSpaceScenario(): GameState {
  const state = diplomacyBase({ civ: 'england' });
  state.turn = 207;
  state.victory = { winner: RIVAL, kind: 'economic', turn: 190 };
  state.keepPlaying = true;
  launched(state, 0, state.turn + 1);
  state.cities.find((c) => c.owner === RIVAL)!.name = 'London';
  return state;
}

/** Round 19 (item 1): a rival one tech from the Medieval era, ahead of you. */
function rivalEraScenario(): GameState {
  const state = diplomacyBase();
  const ancient = TECH_LIST.filter((t) => t.era === 'ancient').map((t) => t.id);
  const p = state.players[RIVAL]!;
  p.techs = [...ancient];
  p.researching = 'monarchy';
  p.science = techCost(state, RIVAL, 'monarchy') - 1;
  state.players[0]!.techs = ['alphabet'];
  return state;
}

/** Round 19 (items 2, 3, 4): three cities each one turn from finishing something. */
export const BUILT_CITIES = { library: 'Ur', legion: 'Kish' };
function builtThisTurnScenario(): GameState {
  const { state, city } = withCapital(undefined, { size: 4, build: { kind: 'wonder', id: 'pyramids' } });
  const p = state.players[0]!;
  p.techs = ['masonry', 'writing', 'iron_working', 'bronze_working', 'alphabet'];
  city.production = WONDERS.pyramids.cost - 1;
  const ur = addCity(state, 0, 3, 3, { name: BUILT_CITIES.library, size: 3, build: { kind: 'building', id: 'library' } });
  ur.production = BUILDINGS.library.cost - 1;
  const kish = addCity(state, 0, 11, 8, { name: BUILT_CITIES.legion, size: 3, build: { kind: 'unit', id: 'legion' } });
  kish.production = UNITS.legion.cost - 1;
  p.citiesFounded = 3;
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y, { fortified: true });
  addUnit(state, 'warrior', 0, ur.x, ur.y, { fortified: true });
  addUnit(state, 'warrior', 0, kish.x, kish.y, { fortified: true });
  return state;
}

// ---- Round 19 Part B: obsolete units and upgrades --------------------------------------------

/** Round 19 (item 8): just after Gunpowder, with gold; a Spearman, a veteran Archer and a Warrior army in the capital. */
export const UPGRADE_GOLD = 300;
export function upgradeUnitsScenario(): GameState {
  const { state } = withCapital(undefined, { size: 4, build: { kind: 'unit', id: 'pikeman' } });
  const p = state.players[0]!;
  p.techs = ['bronze_working', 'archery', 'feudalism', 'gunpowder', 'alphabet', 'writing'];
  p.gold = UPGRADE_GOLD;
  addUnit(state, 'spearman', 0, CITY_X, CITY_Y, { fortified: true });
  addUnit(state, 'archer', 0, CITY_X, CITY_Y, { veteran: true });
  addUnit(state, 'warrior', 0, CITY_X, CITY_Y, { army: true });
  // One outside the city: it can't upgrade until it comes home.
  addUnit(state, 'archer', 0, CITY_X + 2, CITY_Y);
  // The Pikeman build went out of date with Gunpowder (as learning it does in a game).
  state.cities[0]!.build = { kind: 'unit', id: 'musketman' };
  return state;
}

// ---- Round 19 Part C: spies ----------------------------------------------------------------

/** Where the spies scenario's Spy stands: next to London (building the Global Exchange) and York. */
export const SPY_SPOT = { x: 11, y: 7 };
export function spiesScenario(): GameState {
  const state = rivalVictoryWonderScenario();
  const york = addCity(state, RIVAL, 12, 6, { name: 'York', size: 2, build: { kind: 'unit', id: 'warrior' } });
  state.players[RIVAL]!.citiesFounded = 2;
  addUnit(state, 'warrior', RIVAL, york.x, york.y, { fortified: true });
  const me = state.players[0]!;
  me.techs = ['literacy', 'alphabet', 'writing', 'code_of_laws', 'currency'];
  me.gold = 900;
  addUnit(state, 'spy', 0, SPY_SPOT.x, SPY_SPOT.y);
  addUnit(state, 'spy', 0, SPY_SPOT.x, SPY_SPOT.y);
  addUnit(state, 'spy', 0, SPY_SPOT.x, SPY_SPOT.y, { veteran: true });
  addUnit(state, 'spy', 0, SPY_SPOT.x, SPY_SPOT.y);
  return state;
}

/** Round 19 (Dan's mid-round addition): Modern Infantry and the Drone. The east is still dark. */
export const NEW_UNITS_SCOUT = { x: 13, y: 5 };
export function newUnitsScenario(): GameState {
  const { state } = withCapital(undefined, { size: 5, build: { kind: 'unit', id: 'modern_infantry' } });
  const p = state.players[0]!;
  p.techs = ['conscription', 'mass_production', 'computers', 'flight'];
  p.gold = 200;
  addUnit(state, 'rifleman', 0, CITY_X, CITY_Y, { fortified: true, veteran: true });
  addUnit(state, 'drone', 0, CITY_X, CITY_Y);
  const seen = p.explored;
  for (let y = 0; y < state.map.height; y++) for (let x = 10; x < state.map.width; x++) seen[tileIndex(state.map, x, y)] = 0;
  return state;
}

// ---- Round 19 Part E: culture borders and referendums --------------------------------------

/** The small rival town in the culture-flip scenario, 3 tiles east of your capital. */
export const FLIP_TOWN = { name: 'Taxila', x: CITY_X + 3, y: CITY_Y };
function cultureFlipBase(): GameState {
  const state = diplomacyBase();
  const cap = state.cities.find((c) => c.owner === 0)!;
  cap.size = 6;
  cap.culture = 320;
  cap.buildings.push('temple');
  const town = addCity(state, RIVAL, FLIP_TOWN.x, FLIP_TOWN.y, { name: FLIP_TOWN.name, size: 1, build: { kind: 'unit', id: 'warrior' }, foundedTurn: 1 });
  town.unrest = BORDERS.voteAt - 1;
  addUnit(state, 'warrior', RIVAL, town.x, town.y, { fortified: true });
  state.players[RIVAL]!.citiesFounded = 2;
  return state;
}
export function cultureFlipScenario(): GameState {
  return withDice(cultureFlipBase, (s) => s.cities.find((c) => c.name === FLIP_TOWN.name)?.owner === 0);
}

export const SCENARIOS: Scenario[] = [
  // ---- Round 19 Part E ----
  {
    id: 'culture-flip',
    title: 'Culture borders: a town votes to join you',
    note: `Your capital's culture spreads its borders (the colored edge) over most of the land around ${FLIP_TOWN.name}, a small Mauryan town 3 tiles east, which is in unrest (${BORDERS.voteAt - 1} of ${BORDERS.voteAt}). Tap ${FLIP_TOWN.name}'s neighbor tiles: they're inside your borders, so no one could found a city there. Tap End Turn: the referendum comes (the dice are set for it): a card says ${FLIP_TOWN.name} joins you, its buildings stay, and its Warrior goes home to Pataliputra. Open ${CAPITAL}: the Borders line shows how far your culture reaches.`,
    build: cultureFlipScenario,
  },
  // ---- Round 19 Part C ----
  {
    id: 'spies',
    title: 'Spies',
    note: `Four Spies (one a ★ veteran) stand between London, England's capital, which is building the Global Exchange, and York, a small town. You have 900 gold. Tap the Spies: each has Investigate (sure), Steal a technology, Sabotage production and Incite a revolt, with the chance (and York's price); London can't revolt (a capital). Investigate London: its report shows the Global Exchange and its turns (tap London later to read it again). Sabotage London: if it works its production is wiped out. Steal a tech (pick one). Incite York: if it works York joins you. Each Spy is used up. England can't see them.`,
    build: spiesScenario,
  },
  {
    id: 'new-units',
    title: 'Modern Infantry and the Drone',
    note: `You know Mass Production and Computers. Open ${CAPITAL}: the Build list has Modern Infantry (attack 8, defense 12) and no Rifleman; the ★ Rifleman there has ⬆ Upgrade to Modern Infantry (40 gold) and stays a veteran. Tap the Drone (range 10): tap a dark tile to the east to scout it: everything within 4 tiles of it lights up until the turn ends. Check both in the Almanac.`,
    build: newUnitsScenario,
  },
  // ---- Round 19 Part B ----
  {
    id: 'upgrade-units',
    title: 'Upgrade old units',
    note: `You just learned Gunpowder and have ${UPGRADE_GOLD} gold. Open ${CAPITAL}: the Build list has the Musketman but no Warrior, Spearman, Pikeman or Archer (tap ⓘ on the Musketman: the Almanac says what it replaces). Each unit in the city has ⬆ Upgrade to Musketman: the Spearman and the Archer 40 gold each, the Warrior army 180 (three units). Upgrade the ★ Archer: it stays a veteran and its turn is used. ☰ → Units → Upgrade all does the rest (the Archer outside the city has to come home first).`,
    build: upgradeUnitsScenario,
  },
  // ---- Round 19 Part A ----
  {
    id: 'rival-victory-wonder',
    title: 'Rival victory wonder (warnings)',
    note: `England has the gold goal, and ${RIVAL_WONDER.city} starts the Global Exchange. Tap End Turn: full-screen cards with their leader warn that England reached the gold goal and is building the Global Exchange in ${RIVAL_WONDER.city} (about ${RIVAL_WONDER.turns} turns), and say what you can do (capture ${RIVAL_WONDER.city}, or race them). 🏆 gets a red dot, and Victory progress shows the wonder, its city and turns. Keep tapping End Turn: at 5 turns or less another card, then one every turn from 3. Every warning is in 📰 News.`,
    build: rivalVictoryWonderScenario,
  },
  {
    id: 'keep-playing-spaceship',
    title: 'Keep playing: spaceship arrives',
    note: `England won by economy on turn 190 and you kept playing. Your spaceship arrives next turn (🏆 says a win now won't count). Tap End Turn: a card says it reached Alpha Centauri, that England won on turn 190 and this doesn't change the result. 🏆 lists it under "For the record".`,
    build: keepPlayingSpaceScenario,
  },
  {
    id: 'rival-era',
    title: 'A rival enters a new era first',
    note: `${CivName(rivalEraScenario(), RIVAL)} ${civVerb(rivalEraScenario(), RIVAL, 'is', 'are')} one tech from the Medieval era; you're in the Ancient era. Tap End Turn: a panel with their portrait says they have entered the Medieval era, ahead of you.`,
    build: rivalEraScenario,
  },
  {
    id: 'built-this-turn',
    title: 'Wonder, building and unit finished',
    note: `Three cities finish something this turn. Tap End Turn: a full-screen card for the ${WONDERS.pyramids.name} (its icon, ${CAPITAL}, what it does); one list for the rest ("${BUILDINGS.library.name} built in ${BUILT_CITIES.library}: ${BUILDINGS.library.summary}", "Legion trained in ${BUILT_CITIES.legion}"). The new Legion is selected, and its panel says "just trained in ${BUILT_CITIES.legion}". Tap 📰 (its count shows what's new): everything is listed under this turn. Toasts stay longer now, and a tap dismisses one.`,
    build: builtThisTurnScenario,
  },

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
    note: `Tap End Turn. You should learn ${TECHS.monarchy.name} and enter the Medieval era: a full-screen “The Medieval Era Begins” card (tinted, a line of flavor, your era bonus, and the new units, buildings and wonders) waits for a tap, and the era chip in the top bar changes from Ancient to Medieval.`,
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
    note: `Tap End Turn. ${CAPITAL} should finish the ${WONDERS.pyramids.name}: a full-screen card with its icon and what it does. Tap ${CAPITAL}: it's listed under Wonders, production is up 25%, and Culture shows ${WONDERS.pyramids.effects.culture}. The ${WONDERS.pyramids.name} is gone from every build list, and 🏆 lists it under Wonders of the world.`,
    build: wonderScenario,
  },
  {
    id: 'wonder-race',
    title: 'Wonder race lost',
    note: `You and ${rivalName(wonderRaceScenario())} are both building the ${WONDERS.colossus.name}; theirs is one turn from done. Tap End Turn: they finish it first, and a panel says so and that yours can no longer be built. ${CAPITAL} keeps its 40+ production and its panel opens asking for a new choice; the ${WONDERS.colossus.name} isn't in the list any more.`,
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
    note: `${CivName(nearWinScenario(), RIVAL)} ${civVerb(nearWinScenario(), RIVAL, 'has', 'have')} ${nearWinScenario().players[RIVAL]!.culture} culture, past ${VICTORY.warnPct}% of the ${VICTORY.cultureGoal} goal. Tap End Turn: a full-screen “Close to winning” card with their leader warns you, says what you can do, and has a Victory progress button. It only warns once: End Turn again and it stays quiet.`,
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
    note: `Tap End Turn. The Franks declare war on you (a panel says so). Keep tapping End Turn: their Legion army and more Legions march from Aachen toward ${CAPITAL} and attack within a few turns.`,
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
  ...LEADER_SCENARIOS,
  ...ROUND12_SCENARIOS,
  ...ROUND13_SCENARIOS,
  ...ROUND14_SCENARIOS,
  ...ROUND15_SCENARIOS,
  ...ROUND16_SCENARIOS,
  ...ROUND17_SCENARIOS,
  ...ROUND18_SCENARIOS,
];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

