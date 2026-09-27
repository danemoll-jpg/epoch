// Round 22 (item 8): a unit leaves Explore mode and asks for orders (kept apart from explore.ts
// so combat can call it without importing the AI).

import { UNITS } from '../data/units';
import { addLog } from './log';
import type { GameState, Unit } from './types';

/** The unit stops exploring; its owner hears why ("Galley stopped exploring: it sighted …"). */
export function stopExploring(state: GameState, u: Unit, why: string): void {
  if (!u.exploring) return;
  u.exploring = false;
  addLog(state, u.owner, `${UNITS[u.type].name} stopped exploring: ${why}`, u, undefined, { kind: 'explore', ref: { unitId: u.id } });
}
