// Round 14 (D2): the late-game saves behind the `huge-map` and `epic-map` dev scenarios, made by
// scripts/map-fixtures.sim.ts (npm run sim -- map-fixtures). Dev only.

import type { MapSizeId } from '../../data/mapSizes';
import { deserializeGame } from '../../game/save';
import type { GameState } from '../../game/types';
import hugeLate from './huge-late.json?raw';
import epicLate from './epic-late.json?raw';

/** The turn the fixtures were played to (the AI played every civ until then). */
export const FIXTURE_TURN = 150;

/** Seeds tried in order; the first without a winner by FIXTURE_TURN is used. */
export const FIXTURE_SEEDS: Partial<Record<MapSizeId, number[]>> = {
  huge: [6401, 6402, 6403, 6404],
  epic: [8001, 8002, 8003, 8004],
};

const TEXT: Partial<Record<MapSizeId, string>> = { huge: hugeLate, epic: epicLate };

/** A fresh copy of the late-game fixture for this size (loaded through the save code, so an old one is migrated). */
export function lateGame(size: 'huge' | 'epic'): GameState {
  const r = deserializeGame(TEXT[size]!);
  if (r.kind !== 'ok') throw new Error(`The ${size} fixture can't be loaded (${r.kind}); run npm run sim -- map-fixtures`);
  return r.state;
}
