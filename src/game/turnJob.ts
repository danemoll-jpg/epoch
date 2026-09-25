// Round 14 (A3): End Turn as a job that can run off the main thread. The Web Worker
// (src/ui/turnWorker.ts) receives a copy of the state (postMessage's structured clone), runs
// exactly the action the main thread would, and posts the new state back. Pure: the same
// state in gives the same state out, wherever it runs (tests/round14.test.ts checks it).

import { applyAction } from './actions';
import type { ActionResult, GameState } from './types';

export interface TurnRequest {
  id: number;
  state: GameState;
}

export interface TurnResponse {
  id: number;
  state: GameState;
  result: ActionResult;
  /** How long the job itself took (ms), without copying the state back and forth. */
  ms: number;
  /** Set when the job threw: the main thread then runs End Turn itself. */
  error?: string;
}

/** Runs End Turn on `req.state` (changing it) and reports the result. */
export function runTurnJob(req: TurnRequest, now: () => number = () => 0): TurnResponse {
  const t0 = now();
  try {
    const result = applyAction(req.state, { type: 'endTurn' });
    return { id: req.id, state: req.state, result, ms: now() - t0 };
  } catch (e) {
    return { id: req.id, state: req.state, result: { ok: false }, ms: now() - t0, error: String(e) };
  }
}
