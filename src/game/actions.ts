// Single entry point the UI uses to change game state. Every action maps to a rule function
// the AI also calls directly.

import { foundCity } from './city';
import { moveUnitToward } from './movement';
import { endHumanTurn } from './turn';
import type { ActionResult, Coord, GameState } from './types';

export type Action =
  | { type: 'move'; unitId: number; to: Coord }
  | { type: 'foundCity'; unitId: number }
  | { type: 'endTurn' };

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'move':
      return moveUnitToward(state, action.unitId, action.to);
    case 'foundCity':
      return foundCity(state, action.unitId);
    case 'endTurn':
      return endHumanTurn(state);
  }
}
