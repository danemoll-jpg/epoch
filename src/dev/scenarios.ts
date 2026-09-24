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
import { UNITS } from '../data/units';
import { techCost } from '../game/tech';
import type { City, GameState } from '../game/types';
import { addCity, makeState } from './build';

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

/** A one-player game (no rivals to interfere) with the human capital at the usual spot. */
function withCapital(patch: string[] | undefined, city: Partial<City>): { state: GameState; city: City } {
  const state = makeState(mapWith(patch), { players: 1 });
  const capital = addCity(state, 0, CITY_X, CITY_Y, {
    name: CAPITAL,
    // Something already chosen, so the city panel doesn't pop open over the map.
    build: { kind: 'unit', id: 'warrior' },
    ...city,
  });
  state.players[0]!.citiesFounded = 1;
  return { state, city: capital };
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
];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

