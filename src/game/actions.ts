// Single entry point the UI uses to change game state. Every action maps to a rule function
// the AI also calls directly.

import type { CityFocus } from '../data/rules';
import { foundCity } from './city';
import { moveUnitToward } from './movement';
import { rushBuy, setBuild, setFocus, setScienceRate } from './production';
import { endHumanTurn } from './turn';
import type { ActionResult, BuildItem, Coord, GameState } from './types';

export type Action =
  | { type: 'move'; unitId: number; to: Coord }
  | { type: 'foundCity'; unitId: number }
  | { type: 'setBuild'; cityId: number; item: BuildItem }
  | { type: 'setFocus'; cityId: number; focus: CityFocus }
  | { type: 'rushBuy'; cityId: number }
  | { type: 'setScienceRate'; rate: number }
  | { type: 'endTurn' };

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'move':
      return moveUnitToward(state, action.unitId, action.to);
    case 'foundCity':
      return foundCity(state, action.unitId);
    case 'setBuild':
      return setBuild(state, action.cityId, action.item);
    case 'setFocus':
      return setFocus(state, action.cityId, action.focus);
    case 'rushBuy':
      return rushBuy(state, action.cityId);
    case 'setScienceRate':
      return setScienceRate(state, action.rate);
    case 'endTurn':
      return endHumanTurn(state);
  }
}
