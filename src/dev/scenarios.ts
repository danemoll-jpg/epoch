// Dev test scenarios: small hand-made games that put a hard-to-reach rule one End Turn
// away, so it can be seen on the iPad on demand. Loaded with ?scenario=<id> or from the
// ☰ menu, in the dev server only (main.ts imports this file only when import.meta.env.DEV,
// so it is compiled out of the production build; scripts/check-dist.mjs proves it).
// A scenario never autosaves, so it can't overwrite the real game.
//
// To add one: append an entry to SCENARIOS below, and add its expected outcome to
// tests/scenarios.test.ts (the test also fails if a scenario has no outcome check).

import { growthThreshold } from '../data/rules';
import { TECHS, TECH_LIST, type TechId } from '../data/techs';
import type { TerrainId } from '../data/terrain';
import { UNITS } from '../data/units';
import { applyAction } from '../game/actions';
import { combatOdds } from '../game/combat';
import { CivName, civName, civVerb } from '../game/conquest';
import { civDef, peaceDesire } from '../game/diplomacy';
import { tileIndex } from '../game/grid';
import { techCost } from '../game/tech';
import type { City, GameState } from '../game/types';
import { addCity, addUnit, makeState } from './build';

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

/** Research `tech` with the pool one point short of its cost, so it finishes next turn. */
function oneTurnFromLearning(state: GameState, known: TechId[], tech: TechId): void {
  const p = state.players[0]!;
  p.techs = [...known];
  p.researching = tech;
  p.science = techCost(p, tech) - 1;
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
];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

