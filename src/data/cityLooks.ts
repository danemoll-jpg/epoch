// Round 14 (B2): how a city looks on the map as it grows. A city's size picks its look; the
// thresholds are here so they can be tuned without touching the drawing code
// (src/render/art.ts). Its owner's era picks the building style (huts, stone, brick, towers).

export type CityLookId = 'village' | 'town' | 'city' | 'metropolis';

export interface CityLookDef {
  id: CityLookId;
  name: string;
  /** The smallest size with this look. */
  minSize: number;
  /** How many buildings the map draws for it. */
  buildings: number;
}

/** Smallest first. */
export const CITY_LOOKS: CityLookDef[] = [
  { id: 'village', name: 'Village', minSize: 1, buildings: 3 },
  { id: 'town', name: 'Town', minSize: 4, buildings: 5 },
  { id: 'city', name: 'City', minSize: 8, buildings: 7 },
  { id: 'metropolis', name: 'Metropolis', minSize: 13, buildings: 9 },
];

/** The look for a city of this size. */
export function cityLook(size: number): CityLookDef {
  let look = CITY_LOOKS[0]!;
  for (const l of CITY_LOOKS) if (size >= l.minSize) look = l;
  return look;
}
