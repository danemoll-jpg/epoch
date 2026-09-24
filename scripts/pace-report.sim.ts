// Prints research-pace, war, and victory numbers for an all-AI 5-civ game on the report seeds.
// Run: npm run sim   (TURNS=150 npm run sim for a shorter run)
import { it } from 'vitest';
import { simulate, medianTurn } from '../src/dev/sim';
import { landmassStats } from '../src/dev/landmass';
it('report', () => {
  const seeds = [8, 13, 21, 33, 42];
  const turns = Number(process.env.TURNS ?? 300);
  const all: any[] = [];
  let wars = 0, peace = 0, elim = 0, overseas = 0, landings = 0;
  const ships100: number[] = [], ships200: number[] = [];
  const seedTree: number[] = [];
  const wins: string[] = [];
  for (const seed of seeds) {
    const t0 = Date.now();
    const r = simulate(seed, turns);
    wars += r.warsDeclared; peace += r.peaceTreaties; elim += r.eliminated;
    const line = r.civs.map((c) => `${c.civId}:M${c.eraTurn.medieval ?? '-'}/I${c.eraTurn.industrial ?? '-'}/Mo${c.eraTurn.modern ?? '-'}/done${c.treeDoneTurn ?? '-'} t50=${c.techsAt[50]} t100=${c.techsAt[100]} t150=${c.techsAt[150]} t200=${c.techsAt[200]} t250=${c.techsAt[250]} c=${c.cities}`).join('\n  ');
    const v = r.victory;
    const win = v ? `${r.state.players[v.winner]!.civId} ${v.kind} t${v.turn}` : 'none';
    wins.push(`seed ${seed}: ${win}`);
    const ends = r.state.players.map((q) => `${q.civId}:${r.goals[q.id]} cul=${q.culture} gold=${q.gold} sci=${q.scienceRate} parts=${q.space.parts} arrives=${q.space.arrivesTurn ?? '-'} wonders=${r.state.cities.filter((c) => c.owner === q.id).reduce((n, c) => n + c.wonders.length, 0)}`).join('\n  ');
    console.log(`seed ${seed} (${Date.now()-t0}ms) wars=${r.warsDeclared} peace=${r.peaceTreaties} elim@120=${r.eliminated} VICTORY=${win}\n  ${line}\n  ${ends}`);
    const naval = r.civs.map((c) => `${c.civId}:overseas=${c.overseasCities} ships@100=${c.shipsAt[100] ?? '-'} ships@200=${c.shipsAt[200] ?? '-'}`).join(' ');
    console.log(`  NAVAL landings=${r.landings} ${naval}`);
    overseas += r.civs.reduce((a, c) => a + c.overseasCities, 0);
    landings += r.landings;
    ships100.push(...r.civs.map((c) => c.shipsAt[100] ?? 0));
    ships200.push(...r.civs.map((c) => c.shipsAt[200] ?? 0));
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
  console.log(`VICTORIES\n  ${wins.join('\n  ')}`);
  const avg1 = (a: number[]) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(1);
  console.log(`NAVAL per game: overseas cities founded=${overseas / seeds.length} landings=${landings / seeds.length}; ships per civ t100=${avg1(ships100)} (max ${Math.max(...ships100)}) t200=${avg1(ships200)} (max ${Math.max(...ships200)})`);
  const lm = landmassStats(100);
  console.log(`LANDMASSES (100 seeds): each civ alone=${lm.allSeparate} all on one=${lm.allTogether} shared/mixed=${lm.mixed}; distinct start landmasses 1..5=${lm.distinctStarts.join('/')}; empty island (room for a city)=${lm.emptyIsland} (room for 2+: ${lm.emptyBigIsland})`);
}, 600000);
