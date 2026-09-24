// Single entry point the UI uses to change game state. Every action maps to a rule function
// the AI also calls directly.

import type { CityFocus } from '../data/rules';
import type { TechId } from '../data/techs';
import { foundCity } from './city';
import { attack, formArmy, fortify } from './combat';
import { airlift, rebase } from './air';
import { answerOffer, declareWar, giveGold, proposePeace, tradeTech } from './diplomacy';
import { boardShip, moveUnitToward, unloadHere } from './movement';
import { rushBuy, setBuild, setFocus, setScienceRate } from './production';
import { setResearch } from './tech';
import { endHumanTurn } from './turn';
import { checkVictory, keepPlaying, launchSpaceship } from './victory';
import type { ActionResult, BuildItem, Coord, GameState } from './types';
import { chooseVillage, type VillageChoice } from './villages';
import { useGreatPerson, type GreatPersonUse } from './greatPeople';

export type Action =
  | { type: 'move'; unitId: number; to: Coord }
  | { type: 'foundCity'; unitId: number }
  | { type: 'attack'; unitId: number; at: Coord }
  | { type: 'fortify'; unitId: number }
  | { type: 'formArmy'; unitId: number }
  /** Board a ship docked on the unit's own tile (in a city). At sea, boarding is a move onto the ship. */
  | { type: 'board'; unitId: number; shipId: number }
  /** Go ashore from a ship docked in a city, into the city. Elsewhere, unloading is a move onto land. */
  | { type: 'unload'; unitId: number }
  /** Round 10: fly an aircraft to a city or Carrier in range (a 'move' order for an aircraft does the same). */
  | { type: 'rebase'; unitId: number; to: Coord }
  /** Round 10: fly a land unit from its city's Airport to another city with one. */
  | { type: 'airlift'; unitId: number; cityId: number }
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
  /** Round 9: destroy or settle the barbarian village your unit just took. */
  | { type: 'chooseVillage'; villageId: number; choice: VillageChoice }
  /** Round 9: settle a waiting Great Person in a city, or use it once. */
  | { type: 'useGreatPerson'; gpId: number; how: GreatPersonUse }
  | { type: 'launchSpaceship' }
  | { type: 'keepPlaying' }
  | { type: 'endTurn' };

export function applyAction(state: GameState, action: Action): ActionResult {
  const res = runAction(state, action);
  // A capture can win the game on the spot (domination).
  if (res.ok) checkVictory(state);
  return res;
}

function runAction(state: GameState, action: Action): ActionResult {
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
    case 'board':
      return boardShip(state, action.unitId, action.shipId);
    case 'unload':
      return unloadHere(state, action.unitId);
    case 'rebase':
      return rebase(state, action.unitId, action.to);
    case 'airlift':
      return airlift(state, action.unitId, action.cityId);
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
    case 'chooseVillage':
      return chooseVillage(state, action.villageId, action.choice);
    case 'useGreatPerson':
      return useGreatPerson(state, action.gpId, action.how);
    case 'launchSpaceship':
      return launchSpaceship(state);
    case 'keepPlaying':
      return keepPlaying(state);
    case 'endTurn':
      return endHumanTurn(state);
  }
}
