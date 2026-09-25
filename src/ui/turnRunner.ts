// Round 14 (A3): runs End Turn in the Web Worker, or right here if the browser can't start one
// (or the worker fails): the result is the same state either way (see src/game/turnJob.ts).

import { runTurnJob, type TurnResponse } from '../game/turnJob';
import type { GameState } from '../game/types';

export class TurnRunner {
  private worker: Worker | undefined;
  private broken = false;
  private nextId = 1;
  private waiting = new Map<number, (r: TurnResponse) => void>();

  private start(): Worker | undefined {
    if (this.worker || this.broken) return this.worker;
    try {
      this.worker = new Worker(new URL('./turnWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<TurnResponse>) => {
        const done = this.waiting.get(e.data.id);
        this.waiting.delete(e.data.id);
        done?.(e.data);
      };
      this.worker.onerror = (e) => {
        console.warn('Epoch: the turn worker failed; computer turns run on the page from now on', e);
        this.fail();
      };
    } catch (e) {
      console.warn('Epoch: no turn worker; computer turns run on the page', e);
      this.broken = true;
      this.worker = undefined;
    }
    return this.worker;
  }

  /** The worker died: finish anything waiting on the page instead. */
  private fail(): void {
    this.broken = true;
    this.worker?.terminate();
    this.worker = undefined;
    for (const [, done] of this.waiting) done({ id: -1, state: undefined as unknown as GameState, result: { ok: false }, ms: 0, error: 'worker failed' });
    this.waiting.clear();
  }

  /** Starts the worker ahead of time (loading its code), so the first End Turn doesn't wait for it. */
  warm(): void {
    this.start();
  }

  /** Where the last End Turn ran (for the timing toast and the report). */
  lastWhere: 'worker' | 'page' = 'page';

  /**
   * Ends the human's turn on a copy of `state` and resolves with the new state (the original
   * is left as it was). Falls back to the page when there's no worker or it fails.
   */
  async run(state: GameState): Promise<TurnResponse> {
    const worker = this.start();
    if (worker) {
      const id = this.nextId++;
      const res = await new Promise<TurnResponse>((resolve) => {
        this.waiting.set(id, resolve);
        worker.postMessage({ id, state });
      });
      if (!res.error) {
        this.lastWhere = 'worker';
        return res;
      }
      console.warn(`Epoch: End Turn failed in the worker (${res.error}); running it on the page`);
    }
    this.lastWhere = 'page';
    return runTurnJob({ id: 0, state: structuredClone(state) }, () => performance.now());
  }
}
