// Round 11: the victory mix over 10 all-AI games of 5 civs drawn from Dan's 12, and which
// leaders win. Run: npm run sim -- leaders   (SEEDS=20 for more games)
import { it } from 'vitest';
import { playToVictory, report } from '../src/dev/sim';
import { capitalsHeld } from '../src/game/victory';

it('leaders', () => {
  const n = Number(process.env.SEEDS ?? 10);
  const seeds = Array.from({ length: n }, (_, i) => 101 + i * 7);
  const kinds: Record<string, number> = {};
  const wins: Record<string, number> = {};
  const played: Record<string, number> = {};
  const turns: number[] = [];
  for (const seed of seeds) {
    const t0 = Date.now();
    const r = playToVictory(seed);
    for (const c of r.civs) played[c] = (played[c] ?? 0) + 1;
    const v = r.victory;
    const kind = v?.kind ?? 'none';
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    if (r.winnerCiv) wins[r.winnerCiv] = (wins[r.winnerCiv] ?? 0) + 1;
    if (v) turns.push(v.turn);
    const st = r.state;
    const detail = st.players.filter((p) => p.kind !== 'barbarian').map((p, i) => `${p.civId}:${r.goals[i]} c${st.cities.filter((c) => c.owner === p.id).length} cap${capitalsHeld(st, p.id).held} cul${p.culture} g${p.gold}`).join(' ');
    report(`seed ${seed} (${Date.now() - t0}ms): ${v ? `${r.winnerCiv} ${v.kind} t${v.turn}` : 'no winner'} | ${detail} | wars=${r.wars} captures=${r.captures} eliminated=${r.eliminated}`);
  }
  turns.sort((a, b) => a - b);
  report(`VICTORY MIX ${JSON.stringify(kinds)}`);
  report(`WIN TURNS ${turns.join(',')} (median ${turns[Math.floor((turns.length - 1) / 2)] ?? '-'})`);
  report(`WINS BY CIV ${Object.entries(played).map(([c, p]) => `${c}:${wins[c] ?? 0}/${p}`).join(' ')}`);
}, 1_800_000);
