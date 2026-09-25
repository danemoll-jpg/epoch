// Round 13: the victory mix and win turns at each difficulty level, and at each map size.
// Player 0 is the stand-in for the human (an AI with the player's side of the level).
// Run: npm run sim -- difficulty   (SEEDS=12 for more games; LEVELS=novice,legendary to pick)
//      npm run sim -- sizes        (SIZES=small,large to pick)
import { describe, it } from 'vitest';
import { playToVictory, report, type SimGame } from '../src/dev/sim';
import { DIFFICULTY_IDS, type DifficultyId } from '../src/data/difficulty';
import { MAP_SIZES, MAP_SIZE_IDS, type MapSizeId } from '../src/data/mapSizes';

function run(label: string, game: SimGame): void {
  const n = Number(process.env.SEEDS ?? 8);
  const seeds = Array.from({ length: n }, (_, i) => 101 + i * 7);
  const kinds: Record<string, number> = {};
  const turns: number[] = [];
  let standIn = 0;
  let ms = 0;
  let turnsPlayed = 0;
  for (const seed of seeds) {
    const t0 = Date.now();
    const r = playToVictory(seed, 320, game);
    const took = Date.now() - t0;
    ms += took;
    turnsPlayed += r.state.turn;
    const v = r.victory;
    kinds[v?.kind ?? 'none'] = (kinds[v?.kind ?? 'none'] ?? 0) + 1;
    if (v) turns.push(v.turn);
    if (v?.winner === 0) standIn++;
    const cities = r.state.players.filter((p) => p.kind !== 'barbarian').map((p) => r.state.cities.filter((c) => c.owner === p.id).length);
    report(`${label} seed ${seed} (${took}ms, ${(took / r.state.turn).toFixed(0)}ms/turn): ${v ? `${r.winnerCiv}${v.winner === 0 ? ' (stand-in)' : ''} ${v.kind} t${v.turn}` : 'no winner'} | cities ${cities.join('/')} | wars=${r.wars} captures=${r.captures} eliminated=${r.eliminated}`);
  }
  turns.sort((a, b) => a - b);
  report(`${label} VICTORY MIX ${JSON.stringify(kinds)}`);
  report(`${label} WIN TURNS ${turns.join(',')} (median ${turns[Math.floor((turns.length - 1) / 2)] ?? '-'})`);
  report(`${label} STAND-IN (player 0) WINS ${standIn}/${seeds.length}; avg ${(ms / Math.max(1, turnsPlayed)).toFixed(0)} ms per game turn (all civs)`);
}

const pick = <T extends string>(env: string | undefined, all: T[]): T[] => (env ? (env.split(',') as T[]).filter((x) => all.includes(x)) : all);

describe('difficulty', () => {
  for (const level of pick<DifficultyId>(process.env.LEVELS, DIFFICULTY_IDS.filter((d) => d !== 'veteran'))) {
    it(level, () => run(`[${level}]`, { difficulty: level }), 3_600_000);
  }
});

describe('sizes', () => {
  for (const size of pick<MapSizeId>(process.env.SIZES, MAP_SIZE_IDS)) {
    it(size, () => run(`[${size}]`, { mapSize: size, playerCount: MAP_SIZES[size].maxRivals + 1 }), 3_600_000);
  }
});
