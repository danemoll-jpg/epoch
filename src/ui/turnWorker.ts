// Round 14 (A3): the Web Worker that plays the computer turns, so the screen never freezes on
// a big map. All the rules are in src/game/turnJob.ts; this only passes messages.

import { runTurnJob, type TurnRequest } from '../game/turnJob';

self.onmessage = (e: MessageEvent<TurnRequest>) => {
  self.postMessage(runTurnJob(e.data, () => performance.now()));
};
