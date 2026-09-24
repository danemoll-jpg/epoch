// All-AI game simulation for pacing checks (research eras, wars). Dev/test only: used by
// tests/pace.test.ts and for the before/after numbers in the round reports.

import { ERAS, TECH_IDS, type EraId } from '../data/techs';
import { runAiTurn } from '../game/ai';
import { createGame } from '../game/newGame';
import { eraIndex, playerEra } from '../game/tech';
import { endTurn } from '../game/turn';
import type { GameState } from '../game/types';

export interface CivPace {
  civId: string;
  /** Turn each era was first reached (undefined = never, within the simulated turns). */
  eraTurn: Partial<Record<EraId, number>>;
  /** Turn the whole tree was known. */
  treeDoneTurn?: number;
  /** Techs known at the end of each listed turn. */
  techsAt: Record<number, number>;
  cities: number;
  alive: boolean;
}

export interface SimResult {
  seed: number;
  turns: number;
  civs: CivPace[];
  /** Counted up to and including `countUntil`. */
  warsDeclared: number;
  peaceTreaties: number;
  eliminated: number;
  state: GameState;
}

/** Plays a 5-civ all-AI game for `turns` turns. Wars/peace/eliminations are counted until `countUntil`. */
export function simulate(seed: number, turns: number, countUntil = 120, checkpoints = [25, 50, 100, 150, 200, 250]): SimResult {
  const s = createGame({ seed, playerCount: 5 });
  for (const p of s.players) p.kind = 'ai';
  const civs: CivPace[] = s.players.map((p) => ({ civId: p.civId, eraTurn: { ancient: 1 }, techsAt: {}, cities: 0, alive: true }));
  let warsDeclared = 0;
  let peaceTreaties = 0;
  const n = s.players.length;
  let prevWar = s.atWar.map((r) => [...r]);
  while (s.turn <= turns) {
    const turn = s.turn;
    const p = s.players[s.currentPlayer]!;
    if (p.alive) runAiTurn(s, p.id);
    endTurn(s);
    // Record after each player's turn, stamped with the turn it happened in.
    for (const q of s.players) {
      const era = playerEra(q);
      const c = civs[q.id]!;
      for (const e of ERAS) if (eraIndex(e.id) <= eraIndex(era) && c.eraTurn[e.id] === undefined) c.eraTurn[e.id] = turn;
      if (c.treeDoneTurn === undefined && q.techs.length === TECH_IDS.length) c.treeDoneTurn = turn;
    }
    if (turn <= countUntil) {
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          const was = prevWar[a]![b]!;
          const now = s.atWar[a]![b]!;
          if (!was && now) warsDeclared++;
          if (was && now === false && s.players[a]!.alive && s.players[b]!.alive) peaceTreaties++;
        }
      }
    }
    prevWar = s.atWar.map((r) => [...r]);
    if (s.turn !== turn) {
      // The turn just wrapped.
      for (const q of s.players) {
        if (checkpoints.includes(turn)) civs[q.id]!.techsAt[turn] = q.techs.length;
      }
      if (turn === countUntil) {
        for (const q of s.players) civs[q.id]!.alive = q.alive;
      }
    }
  }
  for (const q of s.players) {
    const c = civs[q.id]!;
    c.cities = s.cities.filter((x) => x.owner === q.id).length;
    if (turns < countUntil) c.alive = q.alive;
  }
  const eliminated = civs.filter((c) => !c.alive).length;
  return { seed, turns, civs, warsDeclared, peaceTreaties, eliminated, state: s };
}

/** Median of the defined values (undefined counts as "later than any"). */
export function medianTurn(values: (number | undefined)[]): number | undefined {
  const sorted = [...values].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  return sorted[Math.floor((sorted.length - 1) / 2)];
}
