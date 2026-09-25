// Religion (Round 12, Dan's own twist; Civ Rev 1 had none). The numbers are in
// src/data/religion.ts.
//
// Founding: the first civ to know a founding tech (Mysticism, Astronomy, Philosophy,
// Monotheism, Theology), among those that haven't founded one yet (RELIGION.maxPerCiv, 1),
// founds a religion in its capital (or, if that's already a holy city,
// its biggest other city), which becomes the holy city. At most RELIGION.maxReligions. It's
// checked when a civ learns a tech and at the end of each of its turns (so a civ that knows one
// before it has a city founds once it does). A founding tech some civ already knew when an old
// save was upgraded is "lapsed": nobody founds with it. The AI names its religion from our
// invented list at once; a human founder gets a suggested name and a panel to type their own.
//
// Each city follows one religion or none. Passive spread, once a game turn: cities near a
// city of a religion may convert (closer, bigger, holy, Temples, Cathedrals, and a road between
// them push harder). A Missionary carries its city's religion and converts a city it stands in
// or next to (its owner's, or one of a civ it has met and is at peace with); a Great Artist can
// convert a city too. Holy cities never change faith.
//
// Effects: the holy city's owner gets culture and gold (plus gold per follower city anywhere);
// a following city's Temple and Cathedral make extra culture; capitals that share a religion
// make their civs like each other more, different religions a little less; converting a city
// someone else owns pays the religion's founder. It all feeds culture: no religious victory.
// A captured holy city's income goes to its new owner; the founder is kept for naming only.

import { FOUNDING_TECHS, RELIGION, RELIGION_NAMES, RELIGION_SYMBOLS } from '../data/religion';
import { UNIQUE_RULES } from '../data/leaders';
import type { BuildItem } from './types';
import { TECHS, type TechId } from '../data/techs';
import { UNITS } from '../data/units';
import { CivName, civName } from './conquest';
import { distance, neighbors } from './grid';
import { hasUnique } from './leaders';
import { addLog } from './log';
import { nextFloat } from './rng';
import { roadConnected } from './roads';
import { hashSeed } from './rng';
import type { ActionResult, City, GameState, Religion, Unit } from './types';

// ---- lookups ----------------------------------------------------------------------------------

export function religionById(state: GameState, id: number | null | undefined): Religion | undefined {
  if (id === null || id === undefined) return undefined;
  return state.religions?.find((r) => r.id === id);
}

export function cityReligion(state: GameState, city: City): Religion | undefined {
  return religionById(state, city.religion);
}

/** The religion whose holy city this is, if any. */
export function holyReligion(state: GameState, city: City): Religion | undefined {
  return state.religions?.find((r) => r.holyCityId === city.id);
}

export function holyCity(state: GameState, r: Religion): City | undefined {
  return state.cities.find((c) => c.id === r.holyCityId);
}

/** Cities (anywhere) following this religion. */
export function followerCities(state: GameState, r: Religion): City[] {
  return state.cities.filter((c) => c.religion === r.id);
}

function capitalCity(state: GameState, p: number): City | undefined {
  return state.cities.find((c) => c.capitalOf === p && c.owner === p);
}

/**
 * The religion a civ stands for: its capital's, else the first it founded, else the one most
 * of its cities follow. The AI's Missionaries and Great Artists spread this one.
 */
export function ownReligion(state: GameState, p: number): Religion | undefined {
  const cap = capitalCity(state, p);
  const fromCapital = cap ? cityReligion(state, cap) : undefined;
  if (fromCapital) return fromCapital;
  const founded = state.religions.find((r) => r.founder === p);
  if (founded) return founded;
  const counts = new Map<number, number>();
  for (const c of state.cities) if (c.owner === p && c.religion !== null) counts.set(c.religion, (counts.get(c.religion) ?? 0) + 1);
  let best: { id: number; n: number } | undefined;
  for (const [id, n] of counts) if (!best || n > best.n || (n === best.n && id < best.id)) best = { id, n };
  return best ? religionById(state, best.id) : undefined;
}

export function symbolOf(r: Religion) {
  return RELIGION_SYMBOLS[r.symbol % RELIGION_SYMBOLS.length]!;
}

// ---- founding -----------------------------------------------------------------------------------

/** Can a religion still be founded with this tech (nobody has, it hasn't lapsed, and there's room)? */
export function foundingOpen(state: GameState, tech: TechId): boolean {
  if (!FOUNDING_TECHS.includes(tech)) return false;
  if (state.religions.some((r) => r.tech === tech) || state.religionTechsLapsed.includes(tech)) return false;
  return state.religions.filter((r) => r.tech !== null).length < RELIGION.maxReligions;
}

/** Where a civ would found a religion now: its capital, else its biggest city that isn't a holy city. */
export function foundingCity(state: GameState, p: number): City | undefined {
  const cap = capitalCity(state, p);
  if (cap && !holyReligion(state, cap)) return cap;
  return state.cities
    .filter((c) => c.owner === p && !holyReligion(state, c))
    .sort((a, b) => b.size - a.size || a.id - b.id)[0];
}

/** The `n`th invented name not yet taken in this game (the seed picks where the list starts). */
export function suggestReligionName(state: GameState, n = 0): string {
  const taken = new Set(state.religions.map((r) => r.name.toLowerCase()));
  const free = RELIGION_NAMES.filter((x) => !taken.has(x.toLowerCase()));
  if (free.length === 0) return `Faith ${state.religions.length + 1}`;
  const start = hashSeed(state.seed + state.religions.length * 7919) % free.length;
  return free[(start + n) % free.length]!;
}

/** Founds a religion for `p` in `city` (tech null: Henry VIII's national church). */
export function foundReligion(state: GameState, p: number, tech: TechId | null, city: City): Religion {
  const human = state.players[p]?.kind === 'human';
  const r: Religion = {
    id: state.religions.length,
    name: suggestReligionName(state),
    founder: p,
    holyCityId: city.id,
    symbol: state.religions.length % RELIGION_SYMBOLS.length,
    tech,
    foundedTurn: state.turn,
    named: !human,
  };
  state.religions.push(r);
  city.religion = r.id;
  const how = tech ? ` (${TECHS[tech].name})` : '';
  addLog(state, p, human ? `You founded a religion in ${city.name}${how}! It is now a holy city. Name your faith.` : `Founded ${r.name} in ${city.name}`, city, undefined, {
    publicText: `${CivName(state, p)} founded a new religion in ${city.name}`,
    kind: 'religion',
  });
  return r;
}

/**
 * Founds a religion for each founding tech `p` knows that's still open, while it has a city to
 * be the holy city. Called after a tech is learned and at the end of each of its turns.
 */
export function checkFoundings(state: GameState, p: number): Religion[] {
  const player = state.players[p];
  const out: Religion[] = [];
  if (!player || !player.alive || player.kind === 'barbarian' || !state.religions) return out;
  for (const tech of FOUNDING_TECHS) {
    // One religion per civ by default (RELIGION.maxPerCiv): the next civ that knows it founds it.
    if (state.religions.filter((r) => r.founder === p).length >= RELIGION.maxPerCiv) break;
    if (!player.techs.includes(tech) || !foundingOpen(state, tech)) continue;
    const city = foundingCity(state, p);
    if (!city) break;
    out.push(foundReligion(state, p, tech, city));
  }
  return out;
}

/** Why this name can't be given, or undefined. */
export function religionNameError(state: GameState, religionId: number, name: string): string | undefined {
  const r = religionById(state, religionId);
  if (!r) return 'No such religion';
  if (r.founder !== state.currentPlayer) return 'Only its founder names it';
  if (r.named) return 'It already has a name';
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return 'Type a name';
  if (clean.length > RELIGION.maxNameLength) return `At most ${RELIGION.maxNameLength} letters`;
  if (state.religions.some((o) => o.id !== r.id && o.name.toLowerCase() === clean.toLowerCase())) return 'Another religion has that name';
  return undefined;
}

/** The founder names their new religion (once). */
export function nameReligion(state: GameState, religionId: number, name: string): ActionResult {
  const err = religionNameError(state, religionId, name);
  if (err) return { ok: false, reason: err };
  const r = religionById(state, religionId)!;
  r.name = name.trim().replace(/\s+/g, ' ');
  r.named = true;
  const city = holyCity(state, r);
  addLog(state, r.founder, `Your faith is named ${r.name}${city ? `; its holy city is ${city.name}` : ''}`, city, undefined, {
    publicText: `${CivName(state, r.founder)}'s new faith is called ${r.name}`,
    kind: 'religion',
  });
  return { ok: true, message: `${r.name} is founded` };
}

// ---- passive spread ---------------------------------------------------------------------------

/** How hard religion `r` pushes on `target` (0 = not at all). */
export function religionPressure(state: GameState, target: City, r: Religion): number {
  const R = RELIGION;
  let total = 0;
  for (const src of state.cities) {
    if (src.id === target.id || src.religion !== r.id) continue;
    const d = distance(src, target);
    if (d > R.spreadRadius) continue;
    let p = R.spreadRadius + 1 - d + Math.floor(src.size / R.sizePerPoint);
    if (src.buildings.includes('temple')) p += R.templePressure;
    if (src.buildings.includes('cathedral')) p += R.cathedralPressure;
    if (roadConnected(state, src, target, R.spreadRadius * 2)) p += R.roadPressure;
    if (r.holyCityId === src.id) p *= R.holyCityMult;
    total += p;
  }
  return total;
}

/** A city's chance (percent) of converting to `r` this turn. */
export function conversionChancePct(state: GameState, city: City, r: Religion): number {
  const R = RELIGION;
  if (city.religion === r.id || holyReligion(state, city)) return 0;
  const pressure = religionPressure(state, city, r);
  if (pressure <= 0) return 0;
  const chance = Math.min(R.maxChancePct, pressure * R.pctPerPressure);
  const own = cityReligion(state, city);
  if (!own) return chance;
  const hold = religionPressure(state, city, own) + R.ownPressure;
  if (pressure < hold * R.switchPressureMult) return 0;
  return (chance * R.switchChanceSharePct) / 100;
}

/** Once a game turn: each city may convert to the religion pushing hardest on it. Seeded. */
export function spreadReligions(state: GameState): void {
  if (!state.religions?.length) return;
  for (const city of [...state.cities].sort((a, b) => a.id - b.id)) {
    let best: { r: Religion; pct: number } | undefined;
    for (const r of state.religions) {
      const pct = conversionChancePct(state, city, r);
      if (pct > 0 && (!best || pct > best.pct)) best = { r, pct };
    }
    if (!best) continue;
    if (nextFloat(state) * 100 >= best.pct) continue;
    convertCity(state, city, best.r, 'spread');
  }
}

/**
 * Converts the city. Active conversions (a Missionary, a Great Artist) of a city its founder
 * doesn't own pay the religion's founder.
 */
export function convertCity(state: GameState, city: City, r: Religion, how: 'spread' | 'missionary' | 'artist', by?: number): void {
  city.religion = r.id;
  const reward = how !== 'spread' && city.owner !== r.founder && state.players[r.founder]?.alive;
  const who = by !== undefined && by !== city.owner ? `${CivName(state, by)}'s ${how === 'artist' ? 'Great Artist' : 'Missionary'}: ` : '';
  addLog(state, city.owner, `${who}${city.name} now follows ${r.name}`, city, by !== undefined && by !== city.owner ? by : undefined, {
    otherText: by !== undefined && by !== city.owner ? `${city.name} (${civName(state, city.owner)}) now follows ${r.name}` : undefined,
    kind: 'religion',
  });
  if (reward) {
    const C = RELIGION.conversionReward;
    const founder = state.players[r.founder]!;
    founder.gold += C.gold;
    founder.culture += C.culture;
    addLog(state, r.founder, `${r.name} spread to ${city.name}: +${C.gold} gold, +${C.culture} culture`, city, undefined, { kind: 'religion' });
  }
}

// ---- Missionaries and Great Artists -------------------------------------------------------------

/** Why this religion can't be brought to this city by `p` (distance and moves aside), or undefined. */
export function convertTargetError(state: GameState, p: number, city: City, r: Religion | undefined): string | undefined {
  if (!r) return 'No religion to spread';
  if (city.religion === r.id) return `${city.name} already follows ${r.name}`;
  const holy = holyReligion(state, city);
  if (holy) return `${city.name} is the holy city of ${holy.name}`;
  if (city.owner !== p) {
    const them = state.players[city.owner];
    if (!them || them.kind === 'barbarian' || !state.diplomacy.met[p]?.[city.owner]) return 'You haven’t met them';
    if (state.atWar[p]?.[city.owner]) return 'Not while you’re at war with them';
  }
  return undefined;
}

/** Why this Missionary can't spread its religion to this city now, or undefined. */
export function spreadError(state: GameState, unit: Unit, city: City): string | undefined {
  if (!UNITS[unit.type].spreadsReligion) return 'Only a Missionary can do that';
  if (unit.owner !== state.currentPlayer) return 'Not your turn';
  if ((unit.charges ?? 0) <= 0) return 'No spreads left';
  if (unit.movesLeft <= 0) return 'No moves left';
  if (unit.carriedBy !== null) return 'Go ashore first';
  if (distance(unit, city) > 1) return 'Stand in or next to the city';
  return convertTargetError(state, unit.owner, city, religionById(state, unit.religion));
}

/** Cities this Missionary could convert right now. */
export function spreadTargets(state: GameState, unit: Unit): City[] {
  return state.cities.filter((c) => distance(unit, c) <= 1 && !spreadError(state, unit, c)).sort((a, b) => a.id - b.id);
}

/** The Missionary converts the city; one spread used (it's gone after the last), and its moves. */
export function spreadReligion(state: GameState, unitId: number, cityId: number): ActionResult {
  const unit = state.units.find((u) => u.id === unitId);
  const city = state.cities.find((c) => c.id === cityId);
  if (!unit || !city) return { ok: false, reason: 'No such unit or city' };
  const err = spreadError(state, unit, city);
  if (err) return { ok: false, reason: err };
  const r = religionById(state, unit.religion)!;
  convertCity(state, city, r, 'missionary', unit.owner);
  unit.charges = (unit.charges ?? 1) - 1;
  unit.movesLeft = 0;
  unit.fortified = false;
  if (unit.charges <= 0) state.units = state.units.filter((u) => u.id !== unit.id);
  return { ok: true, message: `${city.name} now follows ${r.name}${unit.charges > 0 ? ` (${unit.charges} spread${unit.charges === 1 ? '' : 's'} left)` : ' (the Missionary’s work is done)'}` };
}

/** Why a city can build a Missionary, or not: it must follow a religion; Monotheism, or its religion's founding tech. */
export function missionaryBuildError(state: GameState, city: City): string | undefined {
  const r = cityReligion(state, city);
  const player = state.players[city.owner]!;
  const needs = UNITS.missionary.requires!;
  if (!player.techs.includes(needs) && !(r?.tech && player.techs.includes(r.tech))) return `Needs ${TECHS[needs].name} or a religion's founding tech`;
  if (!r) return `${city.name} follows no religion`;
  return undefined;
}

/** A Great Artist converts a city to its owner's religion (Round 12: another way to spread it). */
export function artistConvertError(state: GameState, p: number, city: City | undefined): string | undefined {
  if (!city) return 'Choose a city';
  if (state.players[p]?.explored[city.y * state.map.width + city.x] !== 1) return 'You haven’t seen that city';
  return convertTargetError(state, p, city, ownReligion(state, p));
}

/** Cities a Great Artist of `p` could convert now. */
export function artistConvertTargets(state: GameState, p: number): City[] {
  return state.cities.filter((c) => !artistConvertError(state, p, c)).sort((a, b) => Number(b.owner === p) - Number(a.owner === p) || a.id - b.id);
}

// ---- effects -----------------------------------------------------------------------------------

/** Extra culture a city makes from religion: as a holy city, and a follower's Temple and Cathedral. */
export function religionCityCulture(state: GameState, city: City): number {
  let culture = 0;
  if (holyReligion(state, city)) culture += RELIGION.holyCity.culture;
  if (city.religion !== null && city.religion !== undefined) {
    if (city.buildings.includes('temple')) culture += RELIGION.followerCulture.temple;
    if (city.buildings.includes('cathedral')) culture += RELIGION.followerCulture.cathedral;
  }
  return culture;
}

/** Extra gold a holy city makes: its own, plus per city following its religion (capped). */
export function religionCityGold(state: GameState, city: City): number {
  const r = holyReligion(state, city);
  if (!r) return 0;
  const H = RELIGION.holyCity;
  const followers = followerCities(state, r).filter((c) => c.id !== city.id).length;
  return H.gold + Math.min(H.maxFollowerGold, followers * H.goldPerFollower);
}

/**
 * Round 12: how the faith of two civs' capitals colors `a`'s opinion of `b`: the same religion
 * +2, different ones −1, else 0.
 */
export function faithOpinion(state: GameState, a: number, b: number): number {
  if (!state.religions?.length) return 0;
  const ca = capitalCity(state, a);
  const cb = capitalCity(state, b);
  if (!ca || !cb || ca.religion === null || cb.religion === null || ca.religion === undefined || cb.religion === undefined) return 0;
  return ca.religion === cb.religion ? RELIGION.sharedFaithOpinion : RELIGION.differentFaithOpinion;
}

// ---- Henry VIII's national church (from the Medieval era) ---------------------------------------

export function nationalChurchError(state: GameState, p: number): string | undefined {
  const player = state.players[p];
  if (!player || !hasUnique(state, p, 'nationalChurch')) return 'Only England, from the Medieval era';
  if (player.uniquesUsed.includes('nationalChurch')) return 'Already founded (once per game)';
  const cap = capitalCity(state, p);
  if (!cap) return 'You need your capital';
  const holy = holyReligion(state, cap);
  if (holy) return `${cap.name} is already the holy city of ${holy.name}`;
  const needs = UNIQUE_RULES.nationalChurch.needs;
  if (!state.cities.some((c) => c.owner === p && c.buildings.includes(needs))) return 'Build a Temple first';
  return undefined;
}

/** Henry founds a national religion in his capital, whoever got to the founding techs first. */
export function nationalChurch(state: GameState): ActionResult {
  const p = state.currentPlayer;
  const err = nationalChurchError(state, p);
  if (err) return { ok: false, reason: err };
  const cap = capitalCity(state, p)!;
  state.players[p]!.uniquesUsed.push('nationalChurch');
  const r = foundReligion(state, p, null, cap);
  const human = state.players[p]!.kind === 'human';
  const message = `The King needed a divorce, so the King founded a church. ${cap.name} is the holy city of ${human ? 'your national faith' : r.name}, and the old priests are furious`;
  addLog(state, p, message, cap, undefined, {
    publicText: `${CivName(state, p)}'s king broke with the old priests and founded his own church. The courts of the world are scandalized (and a little jealous)`,
    kind: 'leader',
  });
  return { ok: true, message };
}

// ---- the AI ------------------------------------------------------------------------------------

/** Cities `p` would like its religion brought to, best first (own cities, then friends, near first). */
function missionTargets(state: GameState, p: number, from: { x: number; y: number }, r: Religion): City[] {
  const scored: { c: City; score: number }[] = [];
  for (const c of state.cities) {
    const d = distance(from, c);
    if (d > RELIGION.ai.targetRadius || convertTargetError(state, p, c, r)) continue;
    if (state.players[p]!.explored[c.y * state.map.width + c.x] !== 1) continue;
    let score = d;
    if (c.owner === p) score -= 3;
    // A rival's city that already has a faith is left alone (AIs converting each other's cities
    // back and forth made endless Missionaries in the sim).
    else if (c.religion !== null) continue;
    else {
      // Friends first: a civ it likes, and above all their capital (shared faith, +opinion).
      const opinion = state.diplomacy.opinion[p]?.[c.owner] ?? 0;
      if (opinion < 0) continue;
      score -= opinion / 2;
      if (c.capitalOf === c.owner) score -= 3;
    }
    scored.push({ c, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.c.id - b.c.id).map((s) => s.c);
}

/** A Missionary this city should build now (the AI), or undefined: at most two out, and somewhere to go. */
export function aiMissionaryBuild(state: GameState, city: City, buildError: (item: BuildItem) => string | undefined): BuildItem | undefined {
  const p = city.owner;
  const r = ownReligion(state, p);
  if (!r || city.religion !== r.id) return undefined;
  const item: BuildItem = { kind: 'unit', id: 'missionary' };
  if (buildError(item)) return undefined;
  const out =
    state.units.filter((u) => u.owner === p && UNITS[u.type].spreadsReligion).length +
    state.cities.filter((c) => c.owner === p && c.id !== city.id && c.build?.kind === 'unit' && c.build.id === 'missionary').length;
  if (out >= RELIGION.ai.maxMissionaries) return undefined;
  return missionTargets(state, p, city, r).length ? item : undefined;
}

/**
 * Plays an AI Missionary: spread where it stands, else walk to the best target and spread next
 * turn. `walk` moves it toward a tile (movement.ts's moveUnitToward, passed in to keep this
 * module free of movement's imports). Returns true if it acted.
 */
export function playMissionary(state: GameState, unit: Unit, walk: (u: Unit, to: { x: number; y: number }) => boolean): boolean {
  const r = religionById(state, unit.religion);
  if (!r) return false;
  // Spread here if a city it wants is in reach (not one of a civ it dislikes).
  const here = spreadTargets(state, unit);
  const best = missionTargets(state, unit.owner, unit, r).find((c) => here.includes(c));
  if (best) return spreadReligion(state, unit.id, best.id).ok;
  for (const c of missionTargets(state, unit.owner, unit, r).slice(0, 3)) {
    // Its own city: walk in. A rival's: stand next to it.
    if (c.owner === unit.owner) {
      if (walk(unit, c)) return true;
      continue;
    }
    const spots = neighbors(state.map, c)
      .filter((n) => !state.units.some((u) => u.x === n.x && u.y === n.y && u.owner !== unit.owner) && !state.cities.some((x) => x.x === n.x && x.y === n.y))
      .sort((a, b) => distance(unit, a) - distance(unit, b) || a.y - b.y || a.x - b.x);
    for (const s of spots.slice(0, 3)) if (walk(unit, s)) return true;
  }
  return false;
}

/** The AI's religious choices at the start of its turn: Henry's national church when he has none. */
export function aiReligion(state: GameState, p: number): void {
  if (!nationalChurchError(state, p) && !state.religions.some((r) => r.founder === p)) nationalChurch(state);
}
