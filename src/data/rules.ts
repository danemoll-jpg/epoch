// Tunable rule constants for Milestone 1. Placeholders until the balance pass.

import type { UnitTypeId } from './units';

export const RULES = {
  mapWidth: 32,
  mapHeight: 24,
  /** Civs per full game (1 human + 4 AI). Milestone 1 spawns fewer. */
  maxPlayers: 5,
  /** Players spawned in Milestone 1 (human + 1 AI). */
  milestone1Players: 2,
  startingUnits: ['settler', 'warrior'] as UnitTypeId[],
  /** No city may be founded within this many tiles (Chebyshev) of another city. */
  minCityDistance: 3,
  citySight: 2,
  /** Start positions must be at least this far apart (Chebyshev) when possible. */
  minStartDistance: 7,
};
