// All-AI game simulation for pacing checks (research eras, wars). Dev/test only: used by
// tests/pace.test.ts and for the before/after numbers in the round reports.

import { ERAS, TECH_IDS, type EraId } from '../data/techs';
import { createGame } from '../game/newGame';
import { eraIndex, playerEra } from '../game/tech';
import { endTurn, playComputerTurn } from '../game/turn';
import type { GameState, Victory } from '../game/types';
import type { VictoryKind } from '../data/victory';
import { aiVictoryGoal } from '../game/aiGoals';
import { landmassAt } from '../game/mapgen';
import { isShip } from '../game/naval';

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
  /** Cities it founded on a landmass other than its capital's (Round 8). */
  overseasCities: number;
  /** Ships it had at the end of each listed turn. */
  shipsAt: Record<number, number>;
  /** Great People it had earned by the end of each listed turn (Round 9). */
  greatPeopleAt: Record<number, number>;
}

/** Barbarians, villages, and huts over the whole game (Round 9). */
export interface BarbarianStats {
  villagesAtStart: number;
  villagesDestroyed: number;
  villagesSettled: number;
  /** Units the villages sent out, and barbarians from huts. */
  spawned: number;
  killed: number;
  raids: number;
  /** Civs eliminated by a barbarian's action (should always be 0). */
  eliminationsByBarbarians: number;
  hutsEntered: number;
  artifacts: number;
}

export interface SimResult {
  seed: number;
  turns: number;
  civs: CivPace[];
  /** Counted up to and including `countUntil`. */
  warsDeclared: number;
  peaceTreaties: number;
  eliminated: number;
  /** The first win (the sim plays on after it, for the pace numbers). */
  victory: Victory | null;
  /** Each civ's victory goal at the end. */
  goals: VictoryKind[];
  /** Troops put ashore next to an enemy city (Round 8). */
  landings: number;
  barbarians: BarbarianStats;
  state: GameState;
}

/** Plays a 5-civ all-AI game for `turns` turns. Wars/peace/eliminations are counted until `countUntil`. */
export function simulate(seed: number, turns: number, countUntil = 120, checkpoints = [25, 50, 100, 150, 200, 250]): SimResult {
  const s = createGame({ seed, playerCount: 5 });
  for (const p of s.players) if (p.kind === 'human') p.kind = 'ai';
  const civs: CivPace[] = s.players.map((p) => ({ civId: p.civId, eraTurn: { ancient: 1 }, techsAt: {}, cities: 0, alive: true, overseasCities: 0, shipsAt: {}, greatPeopleAt: {} }));
  const barbId = s.players.findIndex((p) => p.kind === 'barbarian');
  const barb: BarbarianStats = {
    villagesAtStart: s.villages.length, villagesDestroyed: 0, villagesSettled: 0, spawned: 0, killed: 0, raids: 0,
    eliminationsByBarbarians: 0, hutsEntered: 0, artifacts: 0,
  };
  let barbUnits = new Set(s.units.filter((u) => u.owner === barbId).map((u) => u.id));
  const seenCities = new Set<number>();
  // The log drops old entries, so landings are counted as they happen.
  const seenLog = new WeakSet<object>();
  let landings = 0;
  let warsDeclared = 0;
  let peaceTreaties = 0;
  const n = s.players.length;
  let prevWar = s.atWar.map((r) => [...r]);
  while (s.turn <= turns) {
    const turn = s.turn;
    const p = s.players[s.currentPlayer]!;
    playComputerTurn(s, p.id);
    endTurn(s);
    for (const e of s.log) {
      if (seenLog.has(e)) continue;
      seenLog.add(e);
      if (e.kind === 'landing') landings++;
      if (e.kind === 'village' && e.text.startsWith('Destroyed')) barb.villagesDestroyed++;
      if (e.kind === 'village' && e.text.includes('settled a barbarian village')) barb.villagesSettled++;
      if (e.kind === 'raid') barb.raids++;
      if (e.kind === 'hut') barb.hutsEntered++;
      if (e.kind === 'artifact') barb.artifacts++;
      if (e.publicText?.includes('been eliminated') && e.other === barbId) barb.eliminationsByBarbarians++;
    }
    const nowBarb = new Set(s.units.filter((u) => u.owner === barbId).map((u) => u.id));
    for (const id of nowBarb) if (!barbUnits.has(id)) barb.spawned++;
    for (const id of barbUnits) if (!nowBarb.has(id)) barb.killed++;
    barbUnits = nowBarb;
    // New cities (captures keep their id): founded overseas if not on the capital's landmass.
    for (const c of s.cities) {
      if (seenCities.has(c.id)) continue;
      seenCities.add(c.id);
      const capital = s.cities.find((x) => x.capitalOf === c.owner);
      if (capital && capital.id !== c.id && landmassAt(s.map, c) !== landmassAt(s.map, capital)) civs[c.owner]!.overseasCities++;
    }
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
        if (checkpoints.includes(turn)) {
          civs[q.id]!.techsAt[turn] = q.techs.length;
          civs[q.id]!.shipsAt[turn] = s.units.filter((u) => u.owner === q.id && isShip(u)).length;
          civs[q.id]!.greatPeopleAt[turn] = q.greatPeople;
        }
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
  // The barbarians (always last) aren't a civ: leave them out of the pace numbers.
  const civList = civs.filter((_, i) => i !== barbId);
  const eliminated = civList.filter((c) => !c.alive).length;
  const goals = s.players.filter((q) => q.kind !== 'barbarian').map((q) => aiVictoryGoal(s, q.id));
  return { seed, turns, civs: civList, warsDeclared, peaceTreaties, eliminated, victory: s.victory, goals, landings, barbarians: barb, state: s };
}

/** Median of the defined values (undefined counts as "later than any"). */
export function medianTurn(values: (number | undefined)[]): number | undefined {
  const sorted = [...values].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  return sorted[Math.floor((sorted.length - 1) / 2)];
}
