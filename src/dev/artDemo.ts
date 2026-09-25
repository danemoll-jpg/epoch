// Round 14 (B1, B2): small hand-made maps for judging the art styles. Dev only: the picker page
// (docs/terrain-style-candidates.html, built by scripts/make-art-page.mjs) and the dev
// scenarios `terrain-styles`, `city-growth-looks`, and `walls-drawn` draw these.

import { CITY_LOOKS } from '../data/cityLooks';
import type { TechId } from '../data/techs';
import { foundReligion } from '../game/religion';
import type { GameState } from '../game/types';
import { addCity, addUnit, addVillage, makeState } from './build';

/** One tech from each era: knowing up to one of these puts a civ in that era. */
export const ERA_TECHS: TechId[][] = [['pottery'], ['pottery', 'monarchy'], ['pottery', 'monarchy', 'railroad'], ['pottery', 'monarchy', 'railroad', 'computers']];

const DEMO_ROWS = [
  'oooooooooooooooo',
  'occccooooooccooo',
  'ocggpcoooochcooo',
  'cggffpcocgggcooo',
  'cpgfhhgccgpdcooo',
  'cppghmmggpddcooo',
  'ccggghmffgpccooo',
  'occpgggffgcoocco',
  'oocppddgcooochco',
  'ooocccccccooocco',
  'oooooooooooooooo',
];

/**
 * Every terrain, a coastline and an island, two civs' cities of several sizes (one walled, a
 * capital, a holy city), units on land and sea (an army, a ship), resources, a hut, a
 * barbarian village, a road and a railroad, and fog: all explored, but only what your units
 * and cities see is in sight.
 */
export function artDemoState(): GameState {
  const s = makeState(DEMO_ROWS, { players: 2, peace: true, barbarians: true });
  s.players[0]!.techs = [...ERA_TECHS[1]!];
  s.players[1]!.techs = [...ERA_TECHS[2]!];
  const capital = addCity(s, 0, 2, 3, { name: 'Babylon', size: 6, capitalOf: 0, buildings: ['walls'], build: { kind: 'unit', id: 'warrior' } });
  addCity(s, 0, 5, 7, { name: 'Ur', size: 2, build: { kind: 'unit', id: 'warrior' } });
  const rival = addCity(s, 1, 9, 5, { name: 'Pataliputra', size: 10, capitalOf: 1, buildings: ['walls'], build: { kind: 'unit', id: 'warrior' } });
  addCity(s, 1, 13, 8, { name: 'Vaishali', size: 14, build: { kind: 'unit', id: 'warrior' } });
  const faith = foundReligion(s, 0, null, capital);
  faith.name = 'The Way of the Sun';
  faith.named = true;
  rival.religion = faith.id;
  addUnit(s, 'warrior', 0, 4, 3);
  addUnit(s, 'settler', 0, 4, 4);
  addUnit(s, 'legion', 0, 7, 5, { army: true, veteran: true });
  addUnit(s, 'galley', 0, 6, 2);
  addUnit(s, 'spearman', 1, 10, 4);
  // Roads (yours, south-east from the capital) and a railroad (theirs, which knows Railroad).
  for (const [x, y] of [[3, 4], [4, 5], [5, 6]] as const) s.map.tiles[y * s.map.width + x]!.road = 'road';
  for (const [x, y] of [[9, 4], [10, 3], [11, 2]] as const) s.map.tiles[y * s.map.width + x]!.road = 'rail';
  // Resources everyone can see, a hut, and a barbarian village.
  for (const [x, y, r] of [[1, 5, 'wheat'], [3, 3, 'game'], [6, 7, 'wine'], [7, 1, 'fish'], [11, 4, 'oasis'], [10, 7, 'gold']] as const) {
    s.map.tiles[y * s.map.width + x]!.resource = r;
  }
  s.map.tiles[8 * s.map.width + 6]!.hut = true;
  addVillage(s, 10, 6, { flags: 2 });
  return s;
}

/** Sizes that show each city look (the smallest size of each). */
export const LOOK_SIZES = CITY_LOOKS.map((l) => l.minSize + 1);

/**
 * Round 14 (D2 `city-growth-looks`): four civs, one per era (Ancient to Modern, top to
 * bottom), each with a city of every look (village, town, city, metropolis, left to right); the
 * right-hand column repeats the metropolis with walls.
 */
export function cityLooksState(): GameState {
  const rows = Array.from({ length: 9 }, () => 'gggggggggggg');
  const s = makeState(rows, { players: 4, peace: true });
  ERA_TECHS.forEach((techs, p) => {
    s.players[p]!.techs = [...techs];
    LOOK_SIZES.forEach((size, i) => addCity(s, p, 1 + i * 2, 1 + p * 2, { name: `${CITY_LOOKS[i]!.name} ${p + 1}`, size, capitalOf: i === 0 ? p : null, build: { kind: 'unit', id: 'warrior' } }));
    addCity(s, p, 10, 1 + p * 2, { name: `Walled ${p + 1}`, size: LOOK_SIZES[3]!, buildings: ['walls'], build: { kind: 'unit', id: 'warrior' } });
  });
  s.players[0]!.citiesFounded = 5;
  return s;
}
