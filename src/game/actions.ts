// Single entry point the UI uses to change game state. Every action maps to a rule function
// the AI also calls directly.

import type { CityFocus } from '../data/rules';
import type { TechId } from '../data/techs';
import { foundCity } from './city';
import { attack, formArmy, fortify } from './combat';
import { answerOffer, declareWar, giveGold, proposePeace, tradeTech } from './diplomacy';
import { moveUnitToward } from './movement';
import { rushBuy, setBuild, setFocus, setScienceRate } from './production';
import { setResearch } from './tech';
import { endHumanTurn } from './turn';
import type { ActionResult, BuildItem, Coord, GameState } from './types';

export type Action =
  | { type: 'move'; unitId: number; to: Coord }
  | { type: 'foundCity'; unitId: number }
  | { type: 'attack'; unitId: number; at: Coord }
  | { type: 'fortify'; unitId: number }
  | { type: 'formArmy'; unitId: number }
  | { type: 'setBuild'; cityId: number; item: BuildItem }
  | { type: 'setFocus'; cityId: number; focus: CityFocus }
  | { type: 'rushBuy'; cityId: number }
  | { type: 'setScienceRate'; rate: number }
  | { type: 'setResearch'; tech: TechId }
  | { type: 'declareWar'; target: number }
  | { type: 'proposePeace'; target: number }
  /** Ask `partner` for `get`, paying with the tech `give`, or with gold when give is null. */
  | { type: 'tradeTech'; partner: number; get: TechId; give: TechId | null }
  | { type: 'giveGold'; target: number; amount: number }
  | { type: 'answerOffer'; offerId: number; accept: boolean }
  | { type: 'endTurn' };

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'move':
      return moveUnitToward(state, action.unitId, action.to);
    case 'foundCity':
      return foundCity(state, action.unitId);
    case 'attack':
      return attack(state, action.unitId, action.at);
    case 'fortify':
      return fortify(state, action.unitId);
    case 'formArmy':
      return formArmy(state, action.unitId);
    case 'setBuild':
      return setBuild(state, action.cityId, action.item);
    case 'setFocus':
      return setFocus(state, action.cityId, action.focus);
    case 'rushBuy':
      return rushBuy(state, action.cityId);
    case 'setScienceRate':
      return setScienceRate(state, action.rate);
    case 'setResearch':
      return setResearch(state, action.tech);
    case 'declareWar':
      return declareWar(state, state.currentPlayer, action.target);
    case 'proposePeace':
      return proposePeace(state, action.target);
    case 'tradeTech':
      return tradeTech(state, action.partner, action.get, action.give);
    case 'giveGold':
      return giveGold(state, action.target, action.amount);
    case 'answerOffer':
      return answerOffer(state, action.offerId, action.accept);
    case 'endTurn':
      return endHumanTurn(state);
  }
}
