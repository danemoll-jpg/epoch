// Turn cycle. Players move in order; when play wraps back to the first player the turn
// counter advances. A player's units get their movement points back at the start of that
// player's turn.

import { UNITS } from '../data/units';
import { runAiTurn } from './ai';
import { runBarbarianTurn } from './barbarians';
import { checkGreatPeople } from './greatPeople';
import { expireOffers, updateContacts } from './diplomacy';
import { updateExplored } from './fog';
import { processCities } from './production';
import { processResearch } from './tech';
import { checkVictory, issueWarnings } from './victory';
import type { ActionResult, GameState } from './types';
import { chooseVillage, pendingVillage } from './villages';
import { checkFoundings, spreadReligions } from './religion';
import { processBorders } from './borders';

function startTurnFor(state: GameState, playerId: number): void {
  for (const u of state.units) {
    if (u.owner === playerId) u.movesLeft = UNITS[u.type].moves;
  }
  updateExplored(state, playerId);
  updateContacts(state);
}

/**
 * Ends the current player's turn (their cities grow, produce, and earn; research advances)
 * and starts the next living player's turn.
 */
export function endTurn(state: GameState): ActionResult {
  processCities(state, state.currentPlayer);
  processResearch(state, state.currentPlayer);
  // The turn's culture is in: any Great People earned (Round 9). An AI uses its own at once.
  checkGreatPeople(state, state.currentPlayer);
  // Round 12: a civ that knows a founding tech but had no city to found in (a starting tech).
  checkFoundings(state, state.currentPlayer);
  const n = state.players.length;
  let next = state.currentPlayer;
  let newTurn = false;
  for (let i = 0; i < n; i++) {
    next = (next + 1) % n;
    if (next === 0) {
      state.turn++;
      newTurn = true;
    }
    if (state.players[next]!.alive) break;
  }
  // Round 12: religions spread once a game turn, before the first player moves.
  if (newTurn) spreadReligions(state);
  // Round 19 (item 7): unrest, and referendums, once a game turn.
  if (newTurn) processBorders(state);
  state.currentPlayer = next;
  startTurnFor(state, next);
  // Wonders just finished, captures during the turn, a spaceship arriving at this turn's start.
  checkVictory(state);
  return { ok: true };
}

/** Plays a computer-run player's turn: the barbarians (Round 9), or a civ's AI. */
export function playComputerTurn(state: GameState, playerId: number): void {
  const p = state.players[playerId];
  if (!p || !p.alive) return;
  if (p.kind === 'barbarian') runBarbarianTurn(state, playerId);
  else runAiTurn(state, playerId);
}

/**
 * Plays out AI turns until it's a human's turn again. The AI acts through the same action
 * functions the player uses.
 */
export function runUntilHuman(state: GameState): void {
  // Guard against a game with no living humans looping forever.
  for (let guard = 0; guard < state.players.length * 2; guard++) {
    // The human was eliminated: stop here (the UI shows the Defeated panel).
    if (!state.players.some((q) => q.kind === 'human' && q.alive)) return;
    const p = state.players[state.currentPlayer]!;
    if (p.kind === 'human' && p.alive) return;
    playComputerTurn(state, p.id);
    endTurn(state);
  }
}

/** The human pressed End Turn: finish their turn, run the AIs, return to the human. */
export function endHumanTurn(state: GameState): ActionResult {
  const p = state.players[state.currentPlayer];
  if (!p || p.kind !== 'human') return { ok: false, reason: 'Not your turn' };
  // Offers left unanswered count as refused.
  expireOffers(state, p.id);
  // A village left without a choice is destroyed for its reward (Round 9).
  const waiting = pendingVillage(state, p.id);
  if (waiting) chooseVillage(state, waiting.id, 'destroy');
  endTurn(state);
  runUntilHuman(state);
  // Anyone the human has met who got close to winning this round.
  issueWarnings(state);
  return { ok: true };
}
