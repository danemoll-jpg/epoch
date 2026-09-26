// Spies (Round 19, item 11). A Spy is invisible to rivals (except right next to one of their
// cities with a spy defense, the Courthouse), can walk into the cities of civs it's at peace
// with, and acts once, from inside or next to a rival city, then is gone whatever happens:
//
// - Investigate: always works. Its owner can read the city's buildings, what it's building and
//   how long, its defenders and yields, for SPIES.investigateTurns turns (Player.intel).
// - Steal a technology: a chance to learn a tech the city's owner knows and the spy's doesn't.
// - Sabotage production: a chance to wipe out the city's production so far.
// - Incite a revolt: pay gold (by size, culture, and closeness to its capital) for a chance
//   that the city joins you. Never an original capital.
//
// The chance (always shown before acting) drops with the city's defenders and a Courthouse,
// and rises for a veteran spy. The victim is told either way: a success without the culprit's
// name, a failure ("caught") with it, and a caught spy sours the victim's opinion of its owner.
// Every number is in src/data/spies.ts.

import { BUILDINGS } from '../data/buildings';
import { SPIES, SPY_ACTIONS, type SpyActionId } from '../data/spies';
import { TECHS, type TechId } from '../data/techs';
import { UNITS } from '../data/units';
import { CivName, civAdjective, civName, civVerb, transferCity } from './conquest';
import { changeOpinion, hasMet } from './diplomacy';
import { distance } from './grid';
import { addLog } from './log';
import { defendsTile, removeUnit } from './naval';
import { nextFloat, pick } from './rng';
import { knows, learnTech, researchError } from './tech';
import { WONDERS } from '../data/wonders';
import { BORDERS } from '../data/rules';
import type { ActionResult, BuildItem, City, GameState, Unit } from './types';
import { atWar } from './war';
import { cityCulture } from './yields';

export function isSpy(u: Unit): boolean {
  return !!UNITS[u.type].spy;
}

/** The city has the building that guards against spies. */
export function hasSpyDefense(city: City): boolean {
  return city.buildings.includes(SPIES.defenseBuilding);
}

/** Rival cities the spy can act on right now: inside or next to them, of a civ (not the barbarians). */
export function spyTargets(state: GameState, spy: Unit): City[] {
  return state.cities.filter((c) => c.owner !== spy.owner && state.players[c.owner]?.kind !== 'barbarian' && distance(c, spy) <= 1);
}

/** Land units guarding the city (spies and aircraft don't). */
function defenders(state: GameState, city: City): number {
  return state.units.filter((u) => u.owner === city.owner && u.x === city.x && u.y === city.y && defendsTile(state, u) && !isSpy(u) && UNITS[u.type].defense > 0).length;
}

/** The chance (percent) that this spy's action on this city works. */
export function spyChance(state: GameState, spy: Unit, city: City, action: SpyActionId): number {
  const def = SPY_ACTIONS[action];
  if (def.basePct >= 100) return 100;
  let pct = def.basePct + defenders(state, city) * SPIES.perDefenderPct;
  if (hasSpyDefense(city)) pct += SPIES.defensePct;
  if (spy.veteran) pct += SPIES.veteranPct;
  if (atWar(state, spy.owner, city.owner)) pct += SPIES.atWarPct;
  return Math.max(SPIES.minPct, Math.min(SPIES.maxPct, Math.round(pct)));
}

/** The owner's original capital among its cities (for the incite price), if it still has it. */
function capitalFor(state: GameState, owner: number): City | undefined {
  return state.cities.find((c) => c.capitalOf === owner && c.owner === owner);
}

/** Round 19 (Part E): is the city in unrest (drawn to a rival's culture)? Read from the city. */
export function inUnrest(city: City): boolean {
  return city.unrest >= BORDERS.warnAt;
}

/** The gold it costs `buyer` to try to incite this city. */
export function inciteCost(state: GameState, city: City): number {
  const I = SPIES.incite;
  const base = I.baseGold + city.size * I.goldPerSize + cityCulture(state, city) * I.goldPerCulture;
  const cap = capitalFor(state, city.owner);
  const d = cap ? distance(cap, city) : I.capitalDistance;
  const near = Math.max(0, I.capitalDistance - d) / I.capitalDistance;
  let cost = base * (1 + near);
  if (inUnrest(city)) cost = (cost * I.unrestPct) / 100;
  return Math.round(cost / 10) * 10;
}

/** Techs the city's owner knows that `thief` doesn't and could use (its prerequisites known). */
export function stealableTechs(state: GameState, thief: number, victim: number): TechId[] {
  const me = state.players[thief]!;
  const them = state.players[victim]!;
  const all = them.techs.filter((t) => !knows(me, t));
  // Prefer ones it could research now; else any it lacks.
  const ready = all.filter((t) => !researchError(me, t));
  return ready.length ? ready : all;
}

/** Why the spy can't do this here right now, or undefined if it can. */
export function spyActionError(state: GameState, spy: Unit, city: City, action: SpyActionId): string | undefined {
  if (!isSpy(spy)) return 'Only a Spy can do that';
  if (state.currentPlayer !== spy.owner) return 'Not your turn';
  if (spy.movesLeft <= 0) return 'No moves left';
  if (spy.carriedBy !== null) return 'Go ashore first';
  if (city.owner === spy.owner) return 'That’s your own city';
  if (state.players[city.owner]?.kind === 'barbarian') return 'Not a barbarian city';
  if (distance(city, spy) > 1) return 'Go inside or next to the city first';
  switch (action) {
    case 'steal':
      if (!stealableTechs(state, spy.owner, city.owner).length) return `${CivName(state, city.owner)} ${civVerb(state, city.owner, 'knows', 'know')} nothing you don’t`;
      return undefined;
    case 'sabotage':
      if (!city.build || city.production <= 0) return 'The city has nothing to sabotage';
      return undefined;
    case 'incite': {
      if (city.capitalOf !== null) return 'A capital never revolts';
      const cost = inciteCost(state, city);
      if (state.players[spy.owner]!.gold < cost) return `Needs ${cost} gold`;
      return undefined;
    }
    default:
      return undefined;
  }
}

export interface SpyOutcome {
  action: SpyActionId;
  success: boolean;
  chance: number;
  cityId: number;
  tech?: TechId;
  gold?: number;
}

/**
 * The `spy` action: the spy acts on the city (a tech to steal may be named; else one is picked),
 * and is used up whatever happens. The result carries what happened for the UI.
 */
export function spyAction(state: GameState, spyId: number, cityId: number, action: SpyActionId, tech?: TechId): ActionResult & { spy?: SpyOutcome } {
  const spy = state.units.find((u) => u.id === spyId);
  const city = state.cities.find((c) => c.id === cityId);
  if (!spy || !city) return { ok: false, reason: 'No such spy or city' };
  if (spy.owner !== state.currentPlayer) return { ok: false, reason: 'Not your unit' };
  const err = spyActionError(state, spy, city, action);
  if (err) return { ok: false, reason: err };
  const me = spy.owner;
  const victim = city.owner;
  const chance = spyChance(state, spy, city, action);
  const out: SpyOutcome = { action, success: true, chance, cityId };
  const their = `${civAdjective(state, victim)} city of ${city.name}`;
  const culprit = hasMet(state, victim, me) ? civAdjective(state, me) : 'foreign';
  removeUnit(state, spy.id);

  if (action === 'investigate') {
    const p = state.players[me]!;
    p.intel = (p.intel ?? []).filter((i) => i.cityId !== city.id && i.until >= state.turn);
    p.intel.push({ cityId: city.id, until: state.turn + SPIES.investigateTurns });
    addLog(state, me, `Your spy investigated the ${their}: its report is open for ${SPIES.investigateTurns} turns`, city, victim, {
      otherText: `A spy was seen looking around ${city.name}`,
      kind: 'spy',
      ref: { cityId: city.id },
    });
    return { ok: true, spy: out, message: `Your spy's report on ${city.name} is ready` };
  }

  // Gold for a revolt is paid whether it works or not.
  if (action === 'incite') {
    out.gold = inciteCost(state, city);
    state.players[me]!.gold -= out.gold;
  }
  out.success = nextFloat(state) * 100 < chance;
  const verb = { steal: 'steal a technology', sabotage: 'sabotage production', incite: 'incite a revolt' }[action];
  if (!out.success) {
    changeOpinion(state, victim, me, SPIES.caughtOpinion);
    addLog(state, me, `Your spy was caught trying to ${verb} in ${city.name}`, city, victim, {
      otherText: `Caught a ${culprit} spy trying to ${verb} in ${city.name}!`,
      kind: 'spy',
      ref: { cityId: city.id },
    });
    return { ok: true, spy: out, message: `Your spy was caught (${chance}% chance). ${CivName(state, victim)} will not forget it.` };
  }
  switch (action) {
    case 'steal': {
      const list = stealableTechs(state, me, victim);
      const got = tech && list.includes(tech) ? tech : pick(state, list);
      out.tech = got;
      learnTech(state, me, got, `Learned ${TECHS[got].name} (stolen by your spy)`);
      addLog(state, me, `Your spy stole ${TECHS[got].name} from ${city.name}`, city, victim, {
        otherText: `A spy stole ${TECHS[got].name} from ${city.name}!`,
        kind: 'spy',
        ref: { cityId: city.id },
      });
      return { ok: true, spy: out, message: `Your spy stole ${TECHS[got].name}!` };
    }
    case 'sabotage': {
      const lost = city.production;
      city.production = 0;
      addLog(state, me, `Your spy sabotaged ${city.name}: ${lost} production lost`, city, victim, {
        otherText: `Saboteurs struck ${city.name}: ${lost} production lost`,
        kind: 'spy',
        ref: { cityId: city.id },
      });
      return { ok: true, spy: out, message: `Sabotage! ${city.name} lost ${lost} production.` };
    }
    case 'incite': {
      changeOpinion(state, victim, me, SPIES.caughtOpinion);
      const text = `${city.name} rose up against ${civName(state, victim)} and joined ${civName(state, me)}`;
      transferCity(state, city, me);
      addLog(state, me, `${city.name} revolted and joined you!`, city, victim, {
        otherText: `${city.name} revolted and joined ${civName(state, me)}!`,
        publicText: text.charAt(0).toUpperCase() + text.slice(1),
        kind: 'spy',
        ref: { cityId: city.id },
      });
      return { ok: true, spy: out, message: `${city.name} is yours!` };
    }
  }
  return { ok: true, spy: out };
}

/** The spy's owner can read this city's report (Investigate) this turn. */
export function hasIntel(state: GameState, p: number, cityId: number): boolean {
  return (state.players[p]?.intel ?? []).some((i) => i.cityId === cityId && i.until >= state.turn);
}

/** What the spy defense building is called, for texts. */
export function spyDefenseName(): string {
  return BUILDINGS[SPIES.defenseBuilding].name;
}

// ---- the AI's spies ------------------------------------------------------------------------

/** How many spies this AI keeps at once. */
function aiSpyCap(state: GameState): number {
  return state.turn >= SPIES.ai.lateFromTurn ? SPIES.ai.maxSpiesLate : SPIES.ai.maxSpies;
}

/** What an AI spy should do and where: sabotage a rival's victory wonder or spaceship, steal from the tech leader, or incite a small city. */
export function aiSpyMission(state: GameState, p: number, from: { x: number; y: number }): { city: City; action: SpyActionId } | undefined {
  const me = state.players[p]!;
  const near = (c: City) => distance(c, from) <= SPIES.ai.maxTargetDistance && state.players[c.owner]?.kind !== 'barbarian' && c.owner !== p && hasMet(state, p, c.owner);
  const byDistance = (a: City, b: City) => distance(a, from) - distance(b, from) || a.id - b.id;
  const cities = state.cities.filter(near).sort(byDistance);
  // 1. A victory wonder or spaceship part under way, with something to wipe out.
  const racing = cities.find((c) => c.production > 0 && ((c.build?.kind === 'wonder' && WONDERS[c.build.id].victory) || c.build?.kind === 'project'));
  if (racing) return { city: racing, action: 'sabotage' };
  // 2. The civ with the most techs this AI lacks.
  let leader: { owner: number; n: number } | undefined;
  for (const q of state.players) {
    if (q.id === p || !q.alive || q.kind === 'barbarian' || !hasMet(state, p, q.id)) continue;
    const n = stealableTechs(state, p, q.id).length;
    if (n >= 2 && (!leader || n > leader.n)) leader = { owner: q.id, n };
  }
  const steal = leader ? cities.find((c) => c.owner === leader!.owner) : undefined;
  if (steal) return { city: steal, action: 'steal' };
  // 3. A small city it can afford to incite (one in unrest first).
  const incite = cities
    .filter((c) => c.capitalOf === null && c.size <= SPIES.ai.inciteMaxSize && me.gold - inciteCost(state, c) >= SPIES.ai.inciteReserve)
    .sort((a, b) => Number(inUnrest(b)) - Number(inUnrest(a)) || byDistance(a, b))[0];
  if (incite) return { city: incite, action: 'incite' };
  return undefined;
}

/** Should this AI city build a Spy? One city (the capital) builds them, up to the cap, when there's a mission. */
export function aiSpyBuild(state: GameState, city: City, buildError: (item: BuildItem) => string | undefined): BuildItem | undefined {
  const p = city.owner;
  if (city.capitalOf !== p) return undefined;
  const item: BuildItem = { kind: 'unit', id: 'spy' };
  if (buildError(item)) return undefined;
  const out = state.units.filter((u) => u.owner === p && isSpy(u)).length + state.cities.filter((c) => c.owner === p && c.id !== city.id && c.build?.kind === 'unit' && c.build.id === 'spy').length;
  if (out >= aiSpyCap(state)) return undefined;
  return aiSpyMission(state, p, city) ? item : undefined;
}

/**
 * Plays an AI spy: act if it's at its target (and the odds are fair), else walk there (`walk`
 * is movement.ts's moveUnitToward, passed in to keep this module free of movement's imports).
 */
export function playSpy(state: GameState, spy: Unit, walk: (u: Unit, to: { x: number; y: number }) => boolean): boolean {
  const m = aiSpyMission(state, spy.owner, spy);
  if (!m) return false;
  if (distance(spy, m.city) <= 1 && !spyActionError(state, spy, m.city, m.action)) {
    if (spyChance(state, spy, m.city, m.action) < SPIES.ai.minChancePct) return false;
    return spyAction(state, spy.id, m.city.id, m.action).ok;
  }
  if (walk(spy, m.city)) return true;
  // A city it can't walk into (at war): stand next to it.
  for (const n of [...neighborsOf(state, m.city)].sort((a, b) => distance(spy, a) - distance(spy, b) || a.y - b.y || a.x - b.x).slice(0, 3)) {
    if (walk(spy, n)) return true;
  }
  return false;
}

function neighborsOf(state: GameState, c: { x: number; y: number }): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = c.x + dx;
      const y = c.y + dy;
      if ((dx || dy) && x >= 0 && y >= 0 && x < state.map.width && y < state.map.height) out.push({ x, y });
    }
  return out;
}
