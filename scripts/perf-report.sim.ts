// Round 14 (A3): End Turn time on each map size. Player 0 is the usual AI stand-in; its own
// turn isn't counted, so "End Turn" here is what the human waits for: their cities' end of
// turn, then every rival and the barbarians. Averages per stretch of turns, and the slowest.
// Run: npm run sim -- perf   (SIZES=huge,epic to pick; SEEDS=2; TURNS=250)
import { describe, it } from 'vitest';
import { report } from '../src/dev/sim';
import { MAP_SIZES, MAP_SIZE_IDS, type MapSizeId } from '../src/data/mapSizes';
import { createGame } from '../src/game/newGame';
import { endTurn, playComputerTurn } from '../src/game/turn';

const pick = <T extends string>(env: string | undefined, all: T[]): T[] => (env ? (env.split(',') as T[]).filter((x) => all.includes(x)) : all);

function run(size: MapSizeId): void {
  const n = Number(process.env.SEEDS ?? 2);
  const maxTurns = Number(process.env.TURNS ?? 250);
  const windows = [[1, 50], [51, 100], [101, 150], [151, 200], [201, 250]] as const;
  const sums = windows.map(() => ({ ms: 0, turns: 0 }));
  let slowest = 0;
  let slowestTurn = 0;
  for (let k = 0; k < n; k++) {
    const seed = 101 + k * 7;
    const s = createGame({ seed, mapSize: size, playerCount: MAP_SIZES[size].maxRivals + 1 });
    for (const p of s.players) if (p.kind === 'human') p.kind = 'ai';
    s.keepPlaying = true;
    // What End Turn costs the human: their own end of turn (cities, research), then every
    // other player's whole turn. Player 0's AI moves aren't counted (a human makes those).
    let ms = 0;
    while (s.turn <= maxTurns) {
      const turn = s.turn;
      const me = s.currentPlayer === 0;
      if (me) playComputerTurn(s, 0);
      const t0 = performance.now();
      if (!me) playComputerTurn(s, s.currentPlayer);
      endTurn(s);
      ms += performance.now() - t0;
      if (s.turn !== turn) {
        const w = windows.findIndex(([a, b]) => turn >= a && turn <= b);
        if (w >= 0) {
          sums[w]!.ms += ms;
          sums[w]!.turns++;
        }
        if (ms > slowest) {
          slowest = ms;
          slowestTurn = turn;
        }
        ms = 0;
      }
    }
    report(`[perf ${size}] seed ${seed}: ${s.cities.length} cities, ${s.units.length} units at turn ${s.turn - 1}`);
  }
  const cells = windows.map(([a, b], i) => `t${a}-${b}: ${sums[i]!.turns ? (sums[i]!.ms / sums[i]!.turns).toFixed(0) : '-'} ms`);
  report(`[perf ${size}] END TURN ${MAP_SIZES[size].width}x${MAP_SIZES[size].height}, ${MAP_SIZES[size].maxRivals} rivals | ${cells.join(' | ')} | slowest ${slowest.toFixed(0)} ms (t${slowestTurn})`);
}

describe('perf', () => {
  for (const size of pick<MapSizeId>(process.env.SIZES, MAP_SIZE_IDS.filter((m) => m !== 'small'))) {
    it(size, () => run(size), 3_600_000);
  }
});
