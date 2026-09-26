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
import { isAir, isShip } from '../game/naval';
import { roadTilesNear } from '../game/roads';
import { UNITS } from '../data/units';
import type { DifficultyId } from '../data/difficulty';
import type { MapSizeId } from '../data/mapSizes';

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
  /** Aircraft (not Helicopters) it had at the end of each listed turn (Round 10). */
  aircraftAt: Record<number, number>;
  /** Round 12: road and rail tiles nearest its cities at the end of each listed turn. */
  roadsAt: Record<number, number>;
}

/** Round 12: religion over the whole game. */
export interface ReligionStats {
  /** Each religion founded: by whom (civ id), with what (tech, or null = a national church), and when. */
  founded: { name: string; civId: string; tech: string | null; turn: number }[];
  /** Cities following any religion at turn 150, of all cities then. */
  followersAt150: number;
  citiesAt150: number;
  /** Missionaries built, and cities converted by one (and in all, including passive spread). */
  missionaries: number;
  missionaryConversions: number;
  conversions: number;
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
  /** Round 10: attacks by aircraft and Helicopters, and fighters intercepting one. */
  strikes: number;
  intercepts: number;
  /** Cities taken by capture (not founded), for the domination check. */
  captures: number;
  religion: ReligionStats;
  state: GameState;
}

/**
 * Round 13: the game the sim plays. Player 0 is a stand-in for the human: an AI that gets the
 * player's side of the difficulty level (and the AIs treat it as the level says).
 */
export interface SimGame {
  playerCount?: number;
  difficulty?: DifficultyId;
  mapSize?: MapSizeId;
}

/** Plays a 5-civ all-AI game for `turns` turns. Wars/peace/eliminations are counted until `countUntil`. */
export function simulate(seed: number, turns: number, countUntil = 120, checkpoints = [25, 50, 100, 150, 200, 220, 250], game: SimGame = {}): SimResult {
  const s = createGame({ seed, playerCount: game.playerCount ?? 5, difficulty: game.difficulty, mapSize: game.mapSize });
  for (const p of s.players) if (p.kind === 'human') p.kind = 'ai';
  const civs: CivPace[] = s.players.map((p) => ({ civId: p.civId, eraTurn: { ancient: 1 }, techsAt: {}, cities: 0, alive: true, overseasCities: 0, shipsAt: {}, greatPeopleAt: {}, aircraftAt: {}, roadsAt: {} }));
  const rel: ReligionStats = { founded: [], followersAt150: 0, citiesAt150: 0, missionaries: 0, missionaryConversions: 0, conversions: 0 };
  const seenMissionaries = new Set<number>();
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
  let strikes = 0;
  let intercepts = 0;
  let captures = 0;
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
      if (e.kind === 'strike') strikes++;
      if (e.kind === 'intercept') intercepts++;
      if (/ captured /.test(e.text)) captures++;
      if (e.kind === 'village' && e.text.startsWith('Destroyed')) barb.villagesDestroyed++;
      if (e.kind === 'village' && e.text.includes('settled a barbarian village')) barb.villagesSettled++;
      if (e.kind === 'raid') barb.raids++;
      if (e.kind === 'hut') barb.hutsEntered++;
      if (e.kind === 'artifact') barb.artifacts++;
      if (e.publicText?.includes('been eliminated') && e.other === barbId) barb.eliminationsByBarbarians++;
      if (e.kind === 'religion' && / now follows /.test(e.text)) {
        rel.conversions++;
        if (e.text.includes('Missionary')) rel.missionaryConversions++;
      }
    }
    for (const u of s.units) if (UNITS[u.type].spreadsReligion) seenMissionaries.add(u.id);
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
          civs[q.id]!.aircraftAt[turn] = s.units.filter((u) => u.owner === q.id && isAir(u)).length;
          civs[q.id]!.roadsAt[turn] = roadTilesNear(s, q.id).length;
        }
      }
      if (turn === 150) {
        rel.citiesAt150 = s.cities.length;
        rel.followersAt150 = s.cities.filter((c) => c.religion !== null).length;
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
  rel.founded = s.religions.map((r) => ({ name: r.name, civId: s.players[r.founder]!.civId, tech: r.tech, turn: r.foundedTurn }));
  rel.missionaries = seenMissionaries.size;
  return { seed, turns, civs: civList, warsDeclared, peaceTreaties, eliminated, victory: s.victory, goals, landings, barbarians: barb, strikes, intercepts, captures, religion: rel, state: s };
}

/** Median of the defined values (undefined counts as "later than any"). */
export function medianTurn(values: (number | undefined)[]): number | undefined {
  const sorted = [...values].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export interface WinResult {
  seed: number;
  /** The civs in the game, in player order. */
  civs: string[];
  victory: Victory | null;
  winnerCiv?: string;
  /** Each civ's victory goal when the game ended. */
  goals: VictoryKind[];
  /** Cities taken by capture, and wars declared, over the whole game. */
  captures: number;
  wars: number;
  eliminated: number;
  /** Round 15: turn each civ (player order) first reached each era. */
  eraTurns: Partial<Record<EraId, number>>[];
  /** Round 15: turn each civ knew the whole tree (undefined = not by the end). */
  treeDone: (number | undefined)[];
  /** Round 15: road and rail tiles near each civ's cities at turns 100 and 200 (undefined = game over by then). */
  roadsAt: Record<number, number[]>;
  /**
   * Round 19 (item 5): wars between two AIs, and wars with player 0 (the stand-in for the human);
   * each war's turn and the declarer's era; peace treaties.
   */
  warsAiAi: number;
  warsWithHuman: number;
  warList: { turn: number; era: EraId; aiAi: boolean; onHuman: boolean }[];
  peace: number;
  /** Round 19: cities that changed hands by referendum (item 7), and spy actions (item 11) by kind. */
  flips: number;
  spyActions: Record<string, number>;
  state: GameState;
}

/**
 * Round 11: plays a 5-civ all-AI game (civs drawn from the 12) until someone wins, or
 * `maxTurns`. For the victory mix and which leaders win (scripts/leaders-report.sim.ts).
 */
export function playToVictory(seed: number, maxTurns = 320, game: SimGame = {}): WinResult {
  const s = createGame({ seed, playerCount: game.playerCount ?? 5, difficulty: game.difficulty, mapSize: game.mapSize });
  for (const p of s.players) if (p.kind === 'human') p.kind = 'ai';
  const seenLog = new WeakSet<object>();
  let captures = 0;
  let wars = 0;
  const eraTurns: Partial<Record<EraId, number>>[] = s.players.map(() => ({ ancient: 1 }));
  const treeDone: (number | undefined)[] = s.players.map(() => undefined);
  const roadsAt: Record<number, number[]> = {};
  const warList: { turn: number; era: EraId; aiAi: boolean; onHuman: boolean }[] = [];
  let peace = 0;
  let flips = 0;
  const spyActions: Record<string, number> = {};
  while (s.turn <= maxTurns && !s.victory) {
    const turn = s.turn;
    playComputerTurn(s, s.currentPlayer);
    endTurn(s);
    for (const e of s.log) {
      if (seenLog.has(e)) continue;
      seenLog.add(e);
      if (/ captured /.test(e.text)) captures++;
      if (e.kind === 'war') {
        wars++;
        warList.push({ turn: e.turn, era: playerEra(s.players[e.player]!), aiAi: e.player !== 0 && e.other !== 0, onHuman: e.other === 0 });
      }
      if (e.kind === 'peace') peace++;
      if (e.kind === 'referendum' && e.text.startsWith('Referendum!')) flips++;
      if (e.kind === 'spy' && e.text.startsWith('Your spy')) {
        const k = / investigated /.test(e.text) ? 'investigate' : / stole /.test(e.text) ? 'steal' : / sabotaged /.test(e.text) ? 'sabotage' : / caught /.test(e.text) ? 'caught' : 'other';
        spyActions[k] = (spyActions[k] ?? 0) + 1;
      }
      if (e.kind === 'spy' && / revolted and joined you/.test(e.text)) spyActions.incite = (spyActions.incite ?? 0) + 1;
    }
    for (const q of s.players) {
      const era = playerEra(q);
      for (const e of ERAS) if (eraIndex(e.id) <= eraIndex(era) && eraTurns[q.id]![e.id] === undefined) eraTurns[q.id]![e.id] = turn;
      if (treeDone[q.id] === undefined && q.techs.length === TECH_IDS.length) treeDone[q.id] = turn;
    }
    if (s.turn !== turn && (turn === 100 || turn === 200)) {
      roadsAt[turn] = s.players.filter((q) => q.kind !== 'barbarian').map((q) => roadTilesNear(s, q.id).length);
    }
  }
  const civs = s.players.filter((p) => p.kind !== 'barbarian');
  return {
    seed,
    civs: civs.map((p) => p.civId),
    victory: s.victory,
    winnerCiv: s.victory ? s.players[s.victory.winner]!.civId : undefined,
    goals: civs.map((p) => aiVictoryGoal(s, p.id)),
    captures,
    wars,
    eliminated: civs.filter((p) => !p.alive).length,
    eraTurns: civs.map((p) => eraTurns[p.id]!),
    treeDone: civs.map((p) => treeDone[p.id]),
    roadsAt,
    warsAiAi: warList.filter((w) => w.aiAi).length,
    warsWithHuman: warList.filter((w) => !w.aiAi).length,
    warList,
    peace,
    flips,
    spyActions,
    state: s,
  };
}

/**
 * Prints a report line and appends it to `sim-out/sim-report.txt` (git-ignored): Vitest 5 hides
 * a passing test's console output, so `npm run sim` reports land in that file too.
 */
export function report(line: string): void {
  console.log(line);
  simOut()?.appendFileSync(`${SIM_OUT}/sim-report.txt`, line + '\n');
}

/** Round 16: where `npm run sim` writes its files (git-ignored), so the repo root stays tidy. */
export const SIM_OUT = 'sim-out';

interface SimFs {
  appendFileSync(f: string, s: string): void;
  writeFileSync(f: string, s: string): void;
  mkdirSync(d: string, o: { recursive: boolean }): void;
}

/** Node's fs, with `sim-out/` made. Node only (the sim runs under Vitest); the game never calls this. */
export function simOut(): SimFs | undefined {
  const fs = (globalThis as { process?: { getBuiltinModule?: (m: string) => SimFs } }).process?.getBuiltinModule?.('node:fs');
  fs?.mkdirSync(SIM_OUT, { recursive: true });
  return fs;
}
