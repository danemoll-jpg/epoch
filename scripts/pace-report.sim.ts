// Prints research-pace and war numbers for an all-AI 5-civ game on the report seeds.
// Run: npm run sim   (TURNS=150 npm run sim for a shorter run)
import { it } from 'vitest';
import { simulate, medianTurn } from '../src/dev/sim';
it('report', () => {
  const seeds = [8, 13, 21, 33, 42];
  const turns = Number(process.env.TURNS ?? 300);
  const all: any[] = [];
  let wars = 0, peace = 0, elim = 0;
  const seedTree: number[] = [];
  for (const seed of seeds) {
    const t0 = Date.now();
    const r = simulate(seed, turns);
    wars += r.warsDeclared; peace += r.peaceTreaties; elim += r.eliminated;
    const line = r.civs.map((c) => `${c.civId}:M${c.eraTurn.medieval ?? '-'}/I${c.eraTurn.industrial ?? '-'}/Mo${c.eraTurn.modern ?? '-'}/done${c.treeDoneTurn ?? '-'} t50=${c.techsAt[50]} t100=${c.techsAt[100]} t150=${c.techsAt[150]} t200=${c.techsAt[200]} t250=${c.techsAt[250]} c=${c.cities}`).join('\n  ');
    console.log(`seed ${seed} (${Date.now()-t0}ms) wars=${r.warsDeclared} peace=${r.peaceTreaties} elim@120=${r.eliminated}\n  ${line}`);
    all.push(...r.civs);
    seedTree.push(Math.min(...r.civs.map((c) => c.treeDoneTurn ?? Infinity)));
  }
  const alive = all;
  const med = (k: string) => medianTurn(alive.map((c) => c.eraTurn[k]));
  const avg = (t: number) => (all.reduce((a, c) => a + (c.techsAt[t] ?? 0), 0) / all.length).toFixed(1);
  const first = (k: string) => Math.min(...all.map((c) => c.eraTurn[k] ?? Infinity));
  console.log(`FIRST medieval=${first('medieval')} industrial=${first('industrial')} modern=${first('modern')} tree=${Math.min(...all.map((c) => c.treeDoneTurn ?? Infinity))}; per seed tree=${seedTree.join(',')}`);
  console.log(`MEDIAN medieval=${med('medieval')} industrial=${med('industrial')} modern=${med('modern')} tree=${medianTurn(all.map(c=>c.treeDoneTurn))}`);
  console.log(`AVG techs t25=${avg(25)} t50=${avg(50)} t100=${avg(100)} t150=${avg(150)} t200=${avg(200)} t250=${avg(250)}`);
  console.log(`PER GAME wars=${wars/5} peace=${peace/5} elim=${elim/5}; avg cities end=${(all.reduce((a,c)=>a+c.cities,0)/all.length).toFixed(1)}`);
}, 600000);
