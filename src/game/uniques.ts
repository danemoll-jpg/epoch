// Leaders' unique actions (Round 11, Milestone 8): Mansa Musa's Pilgrimage, Henry VIII's
// Dissolution, John F. Kennedy's National Challenge, and Simón Bolívar returning a liberated
// city. (Versailles and the Moonshot are built like a wonder and a project: see production.ts.)
// Each is on only once the leader's bonus for that era is (leaders.ts). The same actions for
// the human and the AI; the AI's choices at the bottom are deterministic.

import { UNIQUE_RULES } from '../data/leaders';
import { RULES } from '../data/rules';
import { TECHS, type TechId } from '../data/techs';
import { aiVictoryGoal } from './aiGoals';
import { CivName, civName } from './conquest';
import { changeOpinion, hasMet, makePeace } from './diplomacy';
import { updateExplored } from './fog';
import { distance } from './grid';
import { hasUnique } from './leaders';
import { addLog } from './log';
import { isAir } from './naval';
import { knows } from './tech';
import type { ActionResult, City, GameState } from './types';
import { atWar } from './war';
import { refreshWorkedTiles } from './yields';

// ---- Pilgrimage (Mansa Musa, from the Medieval era) --------------------------------------------

export function pilgrimageError(state: GameState, p: number): string | undefined {
  const player = state.players[p];
  if (!player || !hasUnique(state, p, 'pilgrimage')) return 'Only Mali, from the Medieval era';
  if (player.uniquesUsed.includes('pilgrimage')) return 'Already made (once per game)';
  const min = UNIQUE_RULES.pilgrimage.minGold;
  if (player.gold < min) return `Needs at least ${min} gold`;
  return undefined;
}

/** All the treasury becomes culture (×1.5), and every civ that has met Mali thinks better of it. */
export function pilgrimage(state: GameState): ActionResult {
  const p = state.currentPlayer;
  const err = pilgrimageError(state, p);
  if (err) return { ok: false, reason: err };
  const player = state.players[p]!;
  const R = UNIQUE_RULES.pilgrimage;
  const gold = player.gold;
  const culture = Math.floor(gold * R.culturePerGold);
  player.gold = 0;
  player.culture += culture;
  player.uniquesUsed.push('pilgrimage');
  for (const q of state.players) if (q.id !== p && q.alive && hasMet(state, q.id, p)) changeOpinion(state, q.id, p, R.opinion);
  const message = `The Pilgrimage: ${gold} gold spent on the road, and the world is dazzled. +${culture} culture`;
  addLog(state, p, message, undefined, undefined, {
    publicText: `${CivName(state, p)}'s ruler made a lavish pilgrimage, handing out gold all the way`,
    kind: 'leader',
  });
  return { ok: true, message };
}

// ---- Dissolution (Henry VIII, from the Medieval era) -------------------------------------------

function churches(state: GameState, p: number): number {
  const D = UNIQUE_RULES.dissolution;
  return state.cities.filter((c) => c.owner === p).reduce((n, c) => n + c.buildings.filter((b) => D.buildings.includes(b)).length, 0);
}

/** The gold the Dissolution would bring now. */
export function dissolutionGold(state: GameState, p: number): number {
  return churches(state, p) * UNIQUE_RULES.dissolution.goldPerBuilding;
}

export function dissolutionError(state: GameState, p: number): string | undefined {
  const player = state.players[p];
  if (!player || !hasUnique(state, p, 'dissolution')) return 'Only England, from the Medieval era';
  if (player.uniquesUsed.includes('dissolution')) return 'Already done (once per game)';
  if (churches(state, p) === 0) return 'You have no Temples or Cathedrals';
  return undefined;
}

/** Gold for every Temple and Cathedral; their culture is halved for a while (leaders.ts). */
export function dissolution(state: GameState): ActionResult {
  const p = state.currentPlayer;
  const err = dissolutionError(state, p);
  if (err) return { ok: false, reason: err };
  const player = state.players[p]!;
  const D = UNIQUE_RULES.dissolution;
  const gold = dissolutionGold(state, p);
  player.gold += gold;
  player.uniquesUsed.push('dissolution');
  player.dissolvedUntil = state.turn + D.turns;
  const message = `The Dissolution: the monasteries' treasure fills the royal coffers. +${gold} gold; Temples and Cathedrals make half the culture until turn ${player.dissolvedUntil}`;
  addLog(state, p, message, undefined, undefined, {
    publicText: `${CivName(state, p)} dissolved the monasteries and seized their treasure`,
    kind: 'leader',
  });
  return { ok: true, message };
}

// ---- National Challenge (John F. Kennedy, from the Industrial era) ---------------------------------

export function challengeError(state: GameState, p: number, tech: TechId): string | undefined {
  const player = state.players[p];
  if (!player || !hasUnique(state, p, 'challenge')) return 'Only the United States, from the Industrial era';
  if (!TECHS[tech]) return 'Unknown tech';
  if (knows(player, tech)) return 'Already known';
  if (player.challenge && player.challenge !== tech) return `The National Challenge is still ${TECHS[player.challenge].name}`;
  if (player.challenge === tech) return 'Already the National Challenge';
  return undefined;
}

/** Names `tech` as the national goal: +50% science while researching it (leaders.ts), until it's learned. */
export function setChallenge(state: GameState, tech: TechId): ActionResult {
  const p = state.currentPlayer;
  const err = challengeError(state, p, tech);
  if (err) return { ok: false, reason: err };
  state.players[p]!.challenge = tech;
  const message = `National Challenge: ${TECHS[tech].name}. +${UNIQUE_RULES.challenge.sciencePct}% science while you research it`;
  addLog(state, p, message, undefined, undefined, { kind: 'leader' });
  return { ok: true, message };
}

// ---- Returning a liberated city (Simón Bolívar, from the Medieval era) -------------------------

/** Why the owner can't give this city back to its founder now, or undefined. */
export function returnCityError(state: GameState, city: City): string | undefined {
  const o = city.owner;
  if (!hasUnique(state, o, 'returnCity')) return 'Only Gran Colombia, from the Medieval era';
  if (city.founder === o) return 'You founded it';
  if (city.capturedTurn !== state.turn) return 'Only on the turn you take it';
  const founder = state.players[city.founder];
  if (!founder || !founder.alive || founder.kind === 'barbarian') return 'Its founders are gone';
  return undefined;
}

/**
 * Gives the city back to the civ that founded it: culture for Bolívar, peace with that civ,
 * and a friend. His units there go home to his nearest city.
 */
export function returnCity(state: GameState, cityId: number): ActionResult {
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return { ok: false, reason: 'No such city' };
  if (city.owner !== state.currentPlayer) return { ok: false, reason: 'Not your city' };
  const err = returnCityError(state, city);
  if (err) return { ok: false, reason: err };
  const me = city.owner;
  const to = city.founder;
  const R = UNIQUE_RULES.returnCity;
  city.owner = to;
  city.capturedTurn = undefined;
  city.build = null;
  // His troops march out to his nearest city (aircraft fly there).
  const home = state.cities.filter((c) => c.owner === me).sort((a, b) => distance(a, city) - distance(b, city) || a.id - b.id)[0];
  for (const u of state.units) {
    if (u.owner !== me || u.x !== city.x || u.y !== city.y) continue;
    if (home) {
      u.x = home.x;
      u.y = home.y;
      u.fortified = false;
      if (!isAir(u)) u.movesLeft = 0;
    }
  }
  if (atWar(state, me, to)) makePeace(state, me, to);
  const row = state.diplomacy.opinion[to]!;
  row[me] = Math.max(row[me] ?? 0, RULES.diplomacy.friendlyAt) + R.opinion;
  changeOpinion(state, to, me, 0);
  state.players[me]!.culture += R.culture;
  refreshWorkedTiles(state);
  updateExplored(state, to);
  updateExplored(state, me);
  const message = `${city.name} was returned to ${civName(state, to)}. +${R.culture} culture, and a grateful friend`;
  addLog(state, me, message, city, to, {
    otherText: `${CivName(state, me)} liberated ${city.name} and gave it back to us!`,
    publicText: `${CivName(state, me)} liberated ${city.name} and returned it to ${civName(state, to)}`,
    kind: 'leader',
  });
  return { ok: true, message };
}

// ---- the AI -------------------------------------------------------------------------------------

/** An AI leader uses its unique actions: deterministic rules of thumb. */
export function aiUseUniques(state: GameState, p: number): void {
  const player = state.players[p]!;
  const goal = aiVictoryGoal(state, p);
  // Pilgrimage: once the treasury is well past the minimum, unless it's saving for the gold win.
  if (!pilgrimageError(state, p) && goal !== 'economic' && player.gold >= UNIQUE_RULES.pilgrimage.minGold * 2) pilgrimage(state);
  // Dissolution: when at war and short of gold, with a few churches to sell.
  const atWarNow = state.players.some((q) => q.alive && q.kind !== 'barbarian' && atWar(state, p, q.id));
  if (!dissolutionError(state, p) && atWarNow && player.gold < 50 && dissolutionGold(state, p) >= 120) dissolution(state);
  // National Challenge: whatever it's researching.
  if (!player.challenge && player.researching && !challengeError(state, p, player.researching)) setChallenge(state, player.researching);
  // A city freed from a third party goes back to its founders (a liberator's gesture that also
  // buys a friend). One taken from its founders in a war is kept, and so is a capital a
  // conqueror needs for domination.
  for (const c of state.cities) {
    if (c.owner !== p || returnCityError(state, c)) continue;
    if (atWar(state, p, c.founder)) continue;
    if (c.capitalOf !== null && goal === 'domination') continue;
    returnCity(state, c.id);
  }
}
