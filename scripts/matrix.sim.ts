// Round 15: the full sim matrix. Every map size at Normal (each with its most rivals), plus
// Novice and Legendary on the Normal map: victory mix, win turns, wins per leader, era medians,
// and roads per civ. Every game is played by AIs to the first win (player 0 is the stand-in).
// Run: npm run sim -- matrix   (SEEDS=20 default; CONFIGS=normal,large to pick; the JSON lands in
// sim-matrix-<config>.json, git-ignored, so separate runs can be put into one table)
import { describe, it } from 'vitest';
import { medianTurn, playToVictory, report, type SimGame } from '../src/dev/sim';
import { MAP_SIZES } from '../src/data/mapSizes';
import { VICTORY } from '../src/data/victory';
import { RULES } from '../src/data/rules';
import { DIFFICULTIES } from '../src/data/difficulty';
import { ROADS } from '../src/data/roads';
import { RELIGION } from '../src/data/religion';
import { GREAT_PEOPLE_RULES } from '../src/data/greatPeople';
import { WONDERS } from '../src/data/wonders';
import { BUILDINGS } from '../src/data/buildings';
import { TECH_COST } from '../src/data/techs';

// Tuning experiments without editing the data: TUNE="VICTORY.cultureGoal=8000;MAP_SIZES.large.victoryPct=140"
// sets those numbers for this run (TAG=name keeps its JSON apart). Only for trying numbers; the
// kept values go into src/data/.
const TUNABLE: Record<string, unknown> = { VICTORY, RULES, MAP_SIZES, DIFFICULTIES, ROADS, RELIGION, GREAT_PEOPLE_RULES, WONDERS, BUILDINGS, TECH_COST };
for (const pair of (process.env.TUNE ?? '').split(';').filter(Boolean)) {
  const [path, value] = pair.split('=') as [string, string];
  const keys = path.split('.');
  let obj = TUNABLE as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) obj = obj[k] as Record<string, unknown>;
  const last = keys.at(-1)!;
  if (typeof obj !== 'object' || obj === null) throw new Error(`TUNE: no ${path}`);
  obj[last] = JSON.parse(value);
}
const TAG = process.env.TAG ? `-${process.env.TAG}` : '';

interface Config { id: string; label: string; game: SimGame }

const CONFIGS: Config[] = [
  { id: 'small', label: 'Small, Normal', game: { mapSize: 'small', playerCount: MAP_SIZES.small.maxRivals + 1 } },
  { id: 'normal', label: 'Normal, Normal', game: { mapSize: 'normal', playerCount: MAP_SIZES.normal.maxRivals + 1 } },
  { id: 'large', label: 'Large, Normal', game: { mapSize: 'large', playerCount: MAP_SIZES.large.maxRivals + 1 } },
  { id: 'huge', label: 'Huge, Normal', game: { mapSize: 'huge', playerCount: MAP_SIZES.huge.maxRivals + 1 } },
  { id: 'epic', label: 'Epic, Normal', game: { mapSize: 'epic', playerCount: MAP_SIZES.epic.maxRivals + 1 } },
  { id: 'novice', label: 'Normal map, Novice', game: { mapSize: 'normal', difficulty: 'novice' } },
  { id: 'legendary', label: 'Normal map, Legendary', game: { mapSize: 'normal', difficulty: 'legendary' } },
];

export interface MatrixRow {
  id: string;
  label: string;
  games: number;
  mix: Record<string, number>;
  winTurns: number[];
  median?: number;
  standIn: number;
  wins: Record<string, number>;
  played: Record<string, number>;
  /** Expected wins if every civ in a game were equally likely to win. */
  fair: Record<string, number>;
  eras: Record<string, number | undefined>;
  roads100: number;
  roads200: number;
  msPerTurn: number;
}

function run(c: Config): MatrixRow {
  const n = Number(process.env.SEEDS ?? 20);
  const seeds = Array.from({ length: n }, (_, i) => 101 + i * 7);
  const row: MatrixRow = { id: c.id, label: c.label, games: n, mix: {}, winTurns: [], standIn: 0, wins: {}, played: {}, fair: {}, eras: {}, roads100: 0, roads200: 0, msPerTurn: 0 };
  const eraVals: Record<string, (number | undefined)[]> = { medieval: [], industrial: [], modern: [] };
  const r100: number[] = [];
  const r200: number[] = [];
  let ms = 0;
  let turns = 0;
  for (const seed of seeds) {
    const t0 = Date.now();
    const r = playToVictory(seed, 320, c.game);
    ms += Date.now() - t0;
    turns += r.state.turn;
    const v = r.victory;
    row.mix[v?.kind ?? 'none'] = (row.mix[v?.kind ?? 'none'] ?? 0) + 1;
    if (v) row.winTurns.push(v.turn);
    if (v?.winner === 0) row.standIn++;
    for (const civ of r.civs) {
      row.played[civ] = (row.played[civ] ?? 0) + 1;
      row.fair[civ] = (row.fair[civ] ?? 0) + 1 / r.civs.length;
    }
    if (r.winnerCiv) row.wins[r.winnerCiv] = (row.wins[r.winnerCiv] ?? 0) + 1;
    for (const e of r.eraTurns) for (const k of Object.keys(eraVals)) eraVals[k]!.push(e[k as 'medieval']);
    if (r.roadsAt[100]) r100.push(...r.roadsAt[100]);
    if (r.roadsAt[200]) r200.push(...r.roadsAt[200]);
    report(`[${c.id}${TAG}] seed ${seed}: ${v ? `${r.winnerCiv} ${v.kind} t${v.turn}` : 'no winner'} | ${r.civs.join(',')} | wars=${r.wars} captures=${r.captures} roads@100=${r.roadsAt[100]?.join('/') ?? '-'} @200=${r.roadsAt[200]?.join('/') ?? '-'}`);
  }
  row.winTurns.sort((a, b) => a - b);
  row.median = row.winTurns[Math.floor((row.winTurns.length - 1) / 2)];
  for (const k of Object.keys(eraVals)) row.eras[k] = medianTurn(eraVals[k]!);
  const avg = (a: number[]) => Math.round((10 * a.reduce((x, y) => x + y, 0)) / Math.max(1, a.length)) / 10;
  row.roads100 = avg(r100);
  row.roads200 = avg(r200);
  row.msPerTurn = Math.round(ms / Math.max(1, turns));
  const fs = (globalThis as { process?: { getBuiltinModule?: (m: string) => { writeFileSync: (f: string, s: string) => void } } }).process?.getBuiltinModule?.('node:fs');
  fs?.writeFileSync(`sim-matrix-${c.id}${TAG}.json`, JSON.stringify(row, null, 1));
  report(`[${c.id}${TAG}] MIX ${JSON.stringify(row.mix)} median t${row.median} range ${row.winTurns[0]}-${row.winTurns.at(-1)} standIn ${row.standIn}`);
  report(`[${c.id}${TAG}] LEADERS ${Object.keys(row.played).sort().map((k) => `${k}:${row.wins[k] ?? 0}/${row.played[k]} (fair ${row.fair[k]!.toFixed(1)})`).join(' ')}`);
  report(`[${c.id}${TAG}] ERAS medieval ${row.eras.medieval} industrial ${row.eras.industrial} modern ${row.eras.modern}; ROADS per civ t100 ${row.roads100} t200 ${row.roads200}; ${row.msPerTurn} ms/turn`);
  return row;
}

const wanted = process.env.CONFIGS?.split(',');
describe('matrix', () => {
  for (const c of CONFIGS.filter((x) => !wanted || wanted.includes(x.id))) {
    it(c.id, () => void run(c), 7_200_000);
  }
});
