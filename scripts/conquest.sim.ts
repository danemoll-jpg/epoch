// Round 20 (items 5 and 6): why conquerors struggle to finish. Plays all-AI games like the
// matrix and, after each conqueror's turn (an AI whose goal is domination), records what its
// war plan is doing: no war, at war with no plan, gathering, marching, and on the march whether
// its units stand next to the target city with odds too poor to attack (a stalled siege), or
// the target is overseas. Also each conqueror's captures and capitals by the end.
// Run: CONFIG=normal|huge|epic SEEDS=10 npx vitest run --config vitest.sim.config.ts conquest
import { it } from 'vitest';
import { report } from '../src/dev/sim';
import { entriesSince } from '../src/game/log';
import { createGame } from '../src/game/newGame';
import { endTurn, playComputerTurn } from '../src/game/turn';
import { aiVictoryGoal } from '../src/game/aiGoals';
import { atWar } from '../src/game/war';
import { strengthRatio } from '../src/game/diplomacy';
import { combatOdds } from '../src/game/combat';
import { distance } from '../src/game/grid';
import { landmassAt } from '../src/game/mapgen';
import { capitalsHeld } from '../src/game/victory';
import { isAir, isShip } from '../src/game/naval';
import { UNITS } from '../src/data/units';
import { RULES } from '../src/data/rules';
const AI = RULES.ai;
import type { MapSizeId } from '../src/data/mapSizes';
import type { DifficultyId } from '../src/data/difficulty';
import { MAP_SIZES } from '../src/data/mapSizes';

it('conquest', () => {
  const size = (process.env.CONFIG ?? 'normal') as MapSizeId;
  const difficulty = (process.env.LEVEL ?? 'normal') as DifficultyId;
  const n = Number(process.env.SEEDS ?? 10);
  const seeds = Array.from({ length: n }, (_, i) => 101 + i * 7);
  const tally: Record<string, number> = {};
  const add = (k: string, v = 1) => (tally[k] = (tally[k] ?? 0) + v);
  for (const seed of seeds) {
    const s = createGame({ seed, playerCount: MAP_SIZES[size].maxRivals + 1, mapSize: size, difficulty });
    for (const p of s.players) if (p.kind === 'human') p.kind = 'ai';
    let seen = s.logCount;
    const capturesBy: Record<number, number> = {};
    while (s.turn <= 320 && !s.victory) {
      const p = s.currentPlayer;
      playComputerTurn(s, p);
      const player = s.players[p]!;
      if (player.kind === 'ai' && player.alive && aiVictoryGoal(s, p) === 'domination') {
        add('turns');
        const foes = s.players.filter((q) => q.id !== p && q.kind !== 'barbarian' && q.alive && atWar(s, p, q.id) && s.cities.some((c) => c.owner === q.id));
        const plan = s.aiPlans[p];
        if (foes.length === 0) {
          add('noWar');
          const met = s.players.filter((q) => q.id !== p && q.kind !== 'barbarian' && q.alive && s.diplomacy.met[p]?.[q.id]);
          const best = Math.max(0, ...met.map((q) => strengthRatio(s, p, q.id)));
          add(met.length === 0 ? 'peaceNoneMet' : best >= AI.victory.dominationMinStrengthRatio ? 'peaceStronger' : 'peaceWeaker');
        }
        else if (!plan) add('warNoPlan');
        else {
          const target = s.cities.find((c) => c.id === plan.cityId);
          const mine = s.cities.filter((c) => c.owner === p);
          const overseas = !!target && !mine.some((c) => landmassAt(s.map, c) === landmassAt(s.map, target));
          if (overseas) {
            add('planOverseas');
            const f = s.aiFerries[p];
            add(!f ? 'overseasNoFerry' : f.kind !== 'invade' ? 'overseasSettleFerry' : f.shipId === null ? 'overseasNoShip' : `overseasFerry-${f.phase}`);
          }
          add(plan.phase === 'march' ? 'march' : 'gather');
          if (target && plan.phase === 'march') {
            const next = s.units.filter((u) => u.owner === p && !isShip(u) && !isAir(u) && u.carriedBy === null && UNITS[u.type].attack > 0 && distance(u, target) === 1);
            if (next.length === 0) add('marchNotThere');
            else {
              const best = Math.max(...next.map((u) => combatOdds(s, u, target)?.chance ?? 0));
              if (best * 100 < AI.victory.dominationAttackMinChancePct) add('stalled');
              else add('canAttack');
              add('adjUnits', next.length);
            }
          }
        }
      }
      endTurn(s);
      for (const e of entriesSince(s, seen)) if (/ captured /.test(e.text)) capturesBy[e.player] = (capturesBy[e.player] ?? 0) + 1;
      seen = s.logCount;
    }
    const conquerors = s.players.filter((q) => q.kind === 'ai' && aiVictoryGoal(s, q.id) === 'domination');
    report(
      `[conquest-${size}-${difficulty}] seed ${seed}: ${s.victory ? `${s.players[s.victory.winner]!.civId} ${s.victory.kind} t${s.victory.turn}` : 'none'} | ` +
        conquerors.map((q) => `${q.civId} cap ${capitalsHeld(s, q.id).held}/${capitalsHeld(s, q.id).of} cities ${s.cities.filter((c) => c.owner === q.id).length} took ${capturesBy[q.id] ?? 0}`).join('; '),
    );
  }
  const t = tally.turns ?? 1;
  const pct = (k: string) => `${k} ${Math.round((100 * (tally[k] ?? 0)) / t)}%`;
  report(`[conquest-${size}-${difficulty}] detail ${JSON.stringify(Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, Math.round((100 * v) / t)])))}`);
  report(
    `[conquest-${size}-${difficulty}] conqueror turns ${t}: ${['noWar', 'warNoPlan', 'gather', 'march', 'planOverseas', 'marchNotThere', 'stalled', 'canAttack'].map(pct).join(', ')}; units next to the target when there ${((tally.adjUnits ?? 0) / Math.max(1, (tally.stalled ?? 0) + (tally.canAttack ?? 0))).toFixed(1)}`,
  );
}, 7_200_000);
