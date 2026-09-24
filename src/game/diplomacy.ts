// Diplomacy (Milestone 5): contact, war and peace, opinions, tech trading, gifts, and the
// offers AIs make to the human (demands and peace offers).
//
// Rules (all numbers in RULES.diplomacy):
// - Two civs meet the first time either one's unit or city sees the other's unit or city.
//   Newly met civs are at peace. Unmet civs don't appear in diplomacy.
// - At peace, units can't attack each other or enter each other's cities.
// - Declaring war is an explicit action. After a peace treaty, neither side may declare war
//   again for minPeaceTurns turns.
// - Peace is proposed and accepted or refused. An AI decides with peaceDesire: relative
//   military strength, how the war is going (losses on each side), its aggression, war
//   weariness, and its opinion of the other side.
// - Opinion (how one civ feels about another) moves with events and drifts back toward 0; it
//   gives the attitude shown in the diplomacy screen: friendly, neutral, or hostile.
// - Tech trades: an AI only trades techs it has for techs it lacks (or sells one for gold),
//   never to a civ it's hostile to or at war with. The receiver learns the tech at once; the
//   giver keeps it. A tech can only go to a civ that knows its prerequisites.
// - AIs occasionally demand tribute (gold or a tech) from the human; rare and capped.
//
// Every choice an AI makes here is deterministic: answers to the human depend only on the
// state (asking twice gets the same answer), and the AI's own initiatives use the seeded RNG.

import { CIVS, type CivDef } from '../data/civs';
import { RULES } from '../data/rules';
import { TECHS, type TechId } from '../data/techs';
import { UNITS } from '../data/units';
import { civName } from './conquest';
import { visibleTiles } from './fog';
import { distance, tileIndex } from './grid';
import { addLog } from './log';
import { nextFloat } from './rng';
import { attackStrength, winChance } from './combat';
import { hasTech, learnTech, researchError, techCost } from './tech';
import { atWar } from './war';
import type { ActionResult, Diplomacy, GameState, Offer } from './types';

const D = RULES.diplomacy;

export function table<T>(n: number, value: T): T[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => value));
}

/** Diplomacy for a new game of `n` players: nobody has met, no treaties, no feelings yet. */
export function newDiplomacy(n: number): Diplomacy {
  return {
    met: table(n, false),
    peaceTurn: table<number | null>(n, null),
    warStart: table<number | null>(n, null),
    opinion: table(n, 0),
    warLosses: table(n, 0),
    lastDemand: table<number | null>(n, null),
    lastPeaceOffer: table<number | null>(n, null),
    offers: [],
  };
}

export function civDef(state: GameState, playerId: number): CivDef {
  const civId = state.players[playerId]?.civId;
  return CIVS.find((c) => c.id === civId) ?? CIVS[0]!;
}

export function hasMet(state: GameState, a: number, b: number): boolean {
  return a !== b && state.diplomacy.met[a]?.[b] === true;
}

/** Living civs `viewer` has met, in id order. */
export function metCivs(state: GameState, viewer: number): number[] {
  return state.players.filter((p) => p.alive && hasMet(state, viewer, p.id)).map((p) => p.id);
}

function setBoth<T>(t: T[][], a: number, b: number, v: T): void {
  t[a]![b] = v;
  t[b]![a] = v;
}

// ---- contact ---------------------------------------------------------------------------

/**
 * Marks civs as met once either sees the other's unit or city, and logs the first contact.
 * Returns the newly met pairs. Cheap when everyone alive has already met.
 */
export function updateContacts(state: GameState): [number, number][] {
  const alive = state.players.filter((p) => p.alive).map((p) => p.id);
  const unmet: [number, number][] = [];
  for (const a of alive) for (const b of alive) if (a < b && !hasMet(state, a, b)) unmet.push([a, b]);
  if (unmet.length === 0) return [];
  const vis = new Map<number, boolean[]>();
  const visOf = (p: number) => {
    let v = vis.get(p);
    if (!v) vis.set(p, (v = visibleTiles(state, p)));
    return v;
  };
  const sees = (viewer: number, owner: number) => {
    const v = visOf(viewer);
    return (
      state.units.some((u) => u.owner === owner && v[tileIndex(state.map, u.x, u.y)]) ||
      state.cities.some((c) => c.owner === owner && v[tileIndex(state.map, c.x, c.y)])
    );
  };
  const met: [number, number][] = [];
  for (const [a, b] of unmet) {
    if (!sees(a, b) && !sees(b, a)) continue;
    setBoth(state.diplomacy.met, a, b, true);
    met.push([a, b]);
    addLog(state, a, `Met ${civName(state, b)}`, undefined, b, { otherText: `Met ${civName(state, a)}`, kind: 'contact' });
  }
  return met;
}

// ---- strength and feelings -------------------------------------------------------------

/** Rough military strength: attack + defense of every fighting unit (× 3 for an army). */
export function militaryStrength(state: GameState, playerId: number): number {
  let total = 0;
  for (const u of state.units) {
    if (u.owner !== playerId || UNITS[u.type].canFoundCity) continue;
    total += (UNITS[u.type].attack + UNITS[u.type].defense) * (u.army ? RULES.combat.armyMultiplier : 1);
  }
  return total;
}

/** a's strength over b's (smoothed so tiny early armies don't give wild ratios). */
export function strengthRatio(state: GameState, a: number, b: number): number {
  return (militaryStrength(state, a) + 2) / (militaryStrength(state, b) + 2);
}

export type Attitude = 'friendly' | 'neutral' | 'hostile';

/** How `a` feels about `b`. Always hostile while they're at war. */
export function attitude(state: GameState, a: number, b: number): Attitude {
  if (atWar(state, a, b)) return 'hostile';
  const o = state.diplomacy.opinion[a]?.[b] ?? 0;
  if (o >= D.friendlyAt) return 'friendly';
  if (o <= D.hostileAt) return 'hostile';
  return 'neutral';
}

export function changeOpinion(state: GameState, a: number, b: number, delta: number): void {
  const row = state.diplomacy.opinion[a];
  if (!row || a === b) return;
  row[b] = Math.max(D.opinionMin, Math.min(D.opinionMax, (row[b] ?? 0) + delta));
}

/** Each turn: opinions sour during a war and otherwise drift back toward 0. */
export function driftOpinions(state: GameState, a: number): void {
  const row = state.diplomacy.opinion[a]!;
  for (let b = 0; b < row.length; b++) {
    if (b === a) continue;
    if (atWar(state, a, b)) changeOpinion(state, a, b, D.warOpinionPerTurn);
    else if (row[b]! > 0) row[b] = Math.max(0, row[b]! - D.opinionDecayPerTurn);
    else if (row[b]! < 0) row[b] = Math.min(0, row[b]! + D.opinionDecayPerTurn);
  }
}

/** `loser` lost `amount` (units; a city counts cityLossWeight) to `winner` in their war. */
export function recordLoss(state: GameState, loser: number, winner: number, amount: number): void {
  const row = state.diplomacy.warLosses[loser];
  if (row && loser !== winner) row[winner] = (row[winner] ?? 0) + amount;
}

// ---- war and peace ---------------------------------------------------------------------

/** The last turn of a and b's peace treaty lock, or undefined when war may be declared. */
export function treatyLockedUntil(state: GameState, a: number, b: number): number | undefined {
  const t = state.diplomacy.peaceTurn[a]?.[b];
  if (t === null || t === undefined) return undefined;
  const until = t + D.minPeaceTurns;
  return state.turn < until ? until : undefined;
}

export function declareWarError(state: GameState, a: number, b: number): string | undefined {
  if (a === b) return "You can't declare war on yourself";
  if (!state.players[b]?.alive) return 'They are gone';
  if (!hasMet(state, a, b)) return "You haven't met them";
  if (atWar(state, a, b)) return 'Already at war';
  const until = treatyLockedUntil(state, a, b);
  if (until !== undefined) return `Your peace treaty holds until turn ${until}`;
  return undefined;
}

function dropOffersBetween(state: GameState, a: number, b: number): void {
  state.diplomacy.offers = state.diplomacy.offers.filter(
    (o) => !((o.from === a && o.to === b) || (o.from === b && o.to === a)),
  );
}

/** `a` declares war on `b`. The same action for the human and the AI. */
export function declareWar(state: GameState, a: number, b: number): ActionResult {
  const err = declareWarError(state, a, b);
  if (err) return { ok: false, reason: err };
  setBoth(state.atWar, a, b, true);
  setBoth(state.diplomacy.warStart, a, b, state.turn);
  setBoth(state.diplomacy.peaceTurn, a, b, null);
  state.diplomacy.warLosses[a]![b] = 0;
  state.diplomacy.warLosses[b]![a] = 0;
  changeOpinion(state, b, a, D.declaredOnOpinion);
  dropOffersBetween(state, a, b);
  const A = civName(state, a);
  const B = civName(state, b);
  addLog(state, a, `You declared war on ${B}`, undefined, b, {
    otherText: `${A} declared war on you!`,
    publicText: `${A} declared war on ${B}`,
    kind: 'war',
  });
  return { ok: true };
}

/** Signs a peace treaty between a and b. */
export function makePeace(state: GameState, a: number, b: number): void {
  setBoth(state.atWar, a, b, false);
  setBoth(state.diplomacy.peaceTurn, a, b, state.turn);
  setBoth(state.diplomacy.warStart, a, b, null);
  state.diplomacy.warLosses[a]![b] = 0;
  state.diplomacy.warLosses[b]![a] = 0;
  changeOpinion(state, a, b, D.peaceOpinion);
  changeOpinion(state, b, a, D.peaceOpinion);
  dropOffersBetween(state, a, b);
  if (state.aiPlans[a]?.target === b) state.aiPlans[a] = null;
  if (state.aiPlans[b]?.target === a) state.aiPlans[b] = null;
  const A = civName(state, a);
  const B = civName(state, b);
  addLog(state, a, `Peace with ${B}`, undefined, b, {
    otherText: `Peace with ${A}`,
    publicText: `${A} and ${B} made peace`,
    kind: 'peace',
  });
}

export interface Desire {
  /** Positive: wants it. */
  value: number;
  /** One line, in the AI's voice, explaining the answer. */
  reason: string;
}

/**
 * How much AI `ai` wants peace with `other` (they must be at war), and why. The factors add
 * up: being weaker, losing more than it has taken, war weariness, and a good opinion push
 * toward peace; aggression and a fixed bias push away. Early in a war it refuses unless
 * it's losing.
 */
export function peaceDesire(state: GameState, ai: number, other: number): Desire {
  const d = state.diplomacy;
  const ratio = Math.max(1 / 3, Math.min(3, strengthRatio(state, ai, other)));
  const going = (d.warLosses[other]?.[ai] ?? 0) - (d.warLosses[ai]?.[other] ?? 0); // + = ai winning
  const start = d.warStart[ai]?.[other];
  // A war from before Milestone 5 has no start turn: treat it as a long one.
  const turns = start === null || start === undefined ? D.warWearinessMaxTurns : state.turn - start;
  const aggression = civDef(state, ai).aggression;
  const factors: { value: number; yes: string; no: string }[] = [
    { value: Math.max(-D.peaceStrengthMax, (1 - ratio) * D.peaceStrengthWeight), yes: 'Your armies are stronger than ours.', no: 'Our armies are stronger. We will fight on.' },
    { value: -going * D.peaceScoreWeight, yes: 'This war has cost us too much.', no: 'We are winning this war.' },
    { value: -(aggression - 3) * D.peaceAggressionWeight, yes: 'We never wanted this war.', no: 'We are not finished with you.' },
    { value: Math.min(turns, D.warWearinessMaxTurns) * D.warWearinessPerTurn, yes: 'Our people are tired of war.', no: '' },
    { value: (d.opinion[ai]?.[other] ?? 0) * D.peaceOpinionWeight, yes: 'We would rather be friends.', no: 'We do not trust you.' },
  ];
  const value = factors.reduce((s, f) => s + f.value, 0) - D.peaceBias;
  if (turns < D.minWarTurnsBeforePeace && going >= 0 && value > 0) {
    return { value: Math.min(value, -1), reason: 'This war has only just begun.' };
  }
  if (value > 0) {
    const top = factors.reduce((best, f) => (f.value > best.value ? f : best));
    return { value, reason: `${top.yes} We accept peace.` };
  }
  const worst = factors.filter((f) => f.no).reduce((best, f) => (f.value < best.value ? f : best));
  return { value, reason: worst.value < 0 ? worst.no : 'We are not ready to talk of peace.' };
}

function answered(accepted: boolean, reason: string): ActionResult {
  return { ok: true, answer: { accepted, reason } };
}

/** Why the current player can't make a proposal to `to` at all (not an AI's refusal). */
function proposalError(state: GameState, to: number): string | undefined {
  const from = state.currentPlayer;
  if (from === to) return 'That is you';
  const them = state.players[to];
  if (!them?.alive) return 'They are gone';
  if (!hasMet(state, from, to)) return "You haven't met them";
  if (them.kind !== 'ai') return 'They can only answer on their own turn';
  return undefined;
}

/** The current player proposes peace to AI `to`, which accepts or refuses at once. */
export function proposePeace(state: GameState, to: number): ActionResult {
  const err = proposalError(state, to);
  if (err) return { ok: false, reason: err };
  const from = state.currentPlayer;
  if (!atWar(state, from, to)) return { ok: false, reason: 'You are already at peace' };
  const desire = peaceDesire(state, to, from);
  if (desire.value <= 0) return answered(false, desire.reason);
  makePeace(state, from, to);
  return answered(true, desire.reason);
}

// ---- tech trading and gifts --------------------------------------------------------------

/** Techs `from` knows that `to` could learn right now (`to` knows the prerequisites). */
export function tradeableTechs(state: GameState, from: number, to: number): TechId[] {
  const giver = state.players[from]!;
  const receiver = state.players[to]!;
  return giver.techs.filter((t) => researchError(receiver, t) === undefined);
}

/** What a tech is worth to `receiver`: what it would cost them to research. */
export function techValue(state: GameState, receiver: number, tech: TechId): number {
  return techCost(state.players[receiver]!, tech);
}

function willingness(state: GameState, ai: number): number {
  return Math.max(1, Math.min(5, civDef(state, ai).tradeWillingness));
}

/** AI `seller`'s asking price in gold for teaching `buyer` this tech. */
export function techPrice(state: GameState, seller: number, buyer: number, tech: TechId): number {
  const markup = D.techMarkup[willingness(state, seller) - 1]!;
  const friendly = attitude(state, seller, buyer) === 'friendly' ? 0.9 : 1;
  return Math.ceil(techValue(state, buyer, tech) * D.techGoldPerScience * markup * friendly);
}

/** Why AI `ai` won't trade with `other` at all right now, or undefined. */
export function tradeRefusal(state: GameState, ai: number, other: number): string | undefined {
  if (atWar(state, ai, other)) return 'Not while we are at war.';
  if (attitude(state, ai, other) === 'hostile') return 'We share nothing with those we distrust.';
  return undefined;
}

/** The share of value AI `ai` wants back in a swap (a friendly AI asks for less). */
function swapRatio(state: GameState, ai: number, other: number): number {
  const base = D.swapMinValueRatio[willingness(state, ai) - 1]!;
  return attitude(state, ai, other) === 'friendly' ? base - 0.1 : base;
}

function doSwap(state: GameState, a: number, b: number, aGets: TechId, bGets: TechId | null, gold: number): void {
  const A = civName(state, a);
  const B = civName(state, b);
  const what = bGets ? `${TECHS[bGets].name} for ${TECHS[aGets].name}` : `${gold} gold for ${TECHS[aGets].name}`;
  learnTech(state, a, aGets, `Traded with ${B}: learned ${TECHS[aGets].name}`);
  if (bGets) learnTech(state, b, bGets, `Traded with ${A}: learned ${TECHS[bGets].name}`);
  if (gold > 0) {
    state.players[a]!.gold -= gold;
    state.players[b]!.gold += gold;
  }
  changeOpinion(state, a, b, D.tradeOpinion);
  changeOpinion(state, b, a, D.tradeOpinion);
  addLog(state, a, `You traded ${what} with ${B}`, undefined, b, {
    otherText: `${A} traded ${what} with you`,
    publicText: `${A} and ${B} traded knowledge`,
    kind: 'trade',
  });
}

/**
 * The current player asks AI `partner` for `get`, offering one of their own techs in
 * exchange (`give`), or gold (give = null: the AI's asking price, see techPrice).
 */
export function tradeTech(state: GameState, partner: number, get: TechId, give: TechId | null): ActionResult {
  const err = proposalError(state, partner);
  if (err) return { ok: false, reason: err };
  const me = state.currentPlayer;
  if (!TECHS[get] || !tradeableTechs(state, partner, me).includes(get)) {
    return { ok: false, reason: `${civName(state, partner)} can't teach you that` };
  }
  if (give !== null && (!TECHS[give] || !tradeableTechs(state, me, partner).includes(give))) {
    return { ok: false, reason: `You can't teach them that` };
  }
  let price = 0;
  if (give === null) {
    price = techPrice(state, partner, me, get);
    if (state.players[me]!.gold < price) return { ok: false, reason: `That costs ${price} gold` };
  }
  const refusal = tradeRefusal(state, partner, me);
  if (refusal) return answered(false, refusal);
  if (give !== null) {
    const theirs = techValue(state, me, get);
    const ours = techValue(state, partner, give);
    if (ours < theirs * swapRatio(state, partner, me)) {
      return answered(false, `Our ${TECHS[get].name} is worth more than your ${TECHS[give].name}.`);
    }
  }
  doSwap(state, me, partner, get, give, price);
  return answered(true, `Agreed. You learned ${TECHS[get].name}.`);
}

/** The current player gives `amount` gold to `to`. Gifts improve their opinion of you. */
export function giveGold(state: GameState, to: number, amount: number): ActionResult {
  const from = state.currentPlayer;
  if (from === to || !state.players[to]?.alive) return { ok: false, reason: 'No one to give it to' };
  if (!hasMet(state, from, to)) return { ok: false, reason: "You haven't met them" };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'Invalid amount' };
  if (state.players[from]!.gold < amount) return { ok: false, reason: `You only have ${state.players[from]!.gold} gold` };
  state.players[from]!.gold -= amount;
  state.players[to]!.gold += amount;
  changeOpinion(state, to, from, Math.min(D.giftOpinionMax, amount / D.goldPerOpinion));
  const A = civName(state, from);
  const B = civName(state, to);
  addLog(state, from, `You gave ${amount} gold to ${B}`, undefined, to, { otherText: `${A} gave you ${amount} gold`, kind: 'gift' });
  return answered(true, atWar(state, from, to) ? 'Gold will not end this war, but we will take it.' : 'A generous gift. We will remember it.');
}

// ---- offers from AIs to the human -------------------------------------------------------

export function offerText(state: GameState, o: Offer): string {
  const def = civDef(state, o.from);
  const who = `${def.leader} of ${def.name}`;
  if (o.kind === 'peace') return `${who} offers peace.`;
  const what = o.tech ? `your knowledge of ${TECHS[o.tech].name}` : `${o.gold} gold`;
  return `${who} demands ${what} as tribute.`;
}

/** Why the offer can't be accepted as it stands (e.g. you spent the gold), or undefined. */
export function offerAcceptError(state: GameState, o: Offer): string | undefined {
  if (o.kind !== 'demand') return undefined;
  if (o.gold !== undefined && state.players[o.to]!.gold < o.gold) return `You only have ${state.players[o.to]!.gold} gold`;
  if (o.tech && !tradeableTechs(state, o.to, o.from).includes(o.tech)) return 'They can no longer learn it';
  return undefined;
}

/** The human answers an AI's offer: pay or refuse a demand, accept or refuse peace. */
export function answerOffer(state: GameState, offerId: number, accept: boolean): ActionResult {
  const o = state.diplomacy.offers.find((x) => x.id === offerId);
  if (!o) return { ok: false, reason: 'That offer is gone' };
  if (o.to !== state.currentPlayer) return { ok: false, reason: 'Not your turn' };
  if (accept) {
    const err = offerAcceptError(state, o);
    if (err) return { ok: false, reason: err };
  }
  state.diplomacy.offers = state.diplomacy.offers.filter((x) => x.id !== offerId);
  const A = civName(state, o.from);
  if (o.kind === 'peace') {
    if (accept) {
      makePeace(state, o.to, o.from);
      return answered(true, `Peace with ${A}.`);
    }
    changeOpinion(state, o.from, o.to, D.peaceRefusedOpinion);
    return answered(false, `The war with ${A} goes on.`);
  }
  if (!accept) {
    changeOpinion(state, o.from, o.to, D.demandRefusedOpinion);
    addLog(state, o.to, `You refused ${A}'s demand`, undefined, o.from, { otherText: `${civName(state, o.to)} refused our demand`, kind: 'demand' });
    return answered(false, `${A} will not forget this.`);
  }
  if (o.tech) learnTech(state, o.from, o.tech, `Tribute from ${civName(state, o.to)}: learned ${TECHS[o.tech].name}`);
  if (o.gold) {
    state.players[o.to]!.gold -= o.gold;
    state.players[o.from]!.gold += o.gold;
  }
  changeOpinion(state, o.from, o.to, D.demandPaidOpinion);
  const what = o.tech ? TECHS[o.tech].name : `${o.gold} gold`;
  addLog(state, o.to, `You paid ${A} ${what} in tribute`, undefined, o.from, { otherText: `${civName(state, o.to)} paid us ${what}`, kind: 'demand' });
  return answered(true, `${A} is satisfied, for now.`);
}

/** At the end of the human's turn, offers left unanswered count as refused. */
export function expireOffers(state: GameState, playerId: number): void {
  for (const o of state.diplomacy.offers.filter((x) => x.to === playerId)) answerOffer(state, o.id, false);
}

function pushOffer(state: GameState, offer: Omit<Offer, 'id' | 'turn'>): Offer {
  const o: Offer = { id: state.nextId++, turn: state.turn, ...offer };
  state.diplomacy.offers.push(o);
  return o;
}

// ---- AI diplomacy -----------------------------------------------------------------------

function citiesOf(state: GameState, p: number) {
  return state.cities.filter((c) => c.owner === p);
}

/** The closest distance between a city of a and a city of b (Infinity if either has none). */
export function cityDistance(state: GameState, a: number, b: number): number {
  let best = Infinity;
  for (const x of citiesOf(state, a)) for (const y of citiesOf(state, b)) best = Math.min(best, distance(x, y));
  return best;
}

/**
 * How much AI `ai` wants to start a war with `target`, or -Infinity when it won't (not met,
 * already at war with anyone, a treaty, the human's grace period, too weak, too far).
 */
export function warScore(state: GameState, ai: number, target: number): number {
  if (ai === target || !state.players[target]?.alive || !hasMet(state, ai, target)) return -Infinity;
  if (declareWarError(state, ai, target)) return -Infinity;
  if (state.players.some((p) => p.alive && atWar(state, ai, p.id))) return -Infinity;
  if (state.players[target]!.kind === 'human' && state.turn < D.aiGraceTurns) return -Infinity;
  const ratio = strengthRatio(state, ai, target);
  if (ratio < D.warMinStrengthRatio) return -Infinity;
  if (cityDistance(state, ai, target) > D.warMaxDistance) return -Infinity;
  // Only a war it could win: its best attack (as an army) must beat their best city defender.
  if (winChance(bestAttack(state, ai), bestCityDefense(state, target)) < D.warMinAttackChance) return -Infinity;
  const aggression = civDef(state, ai).aggression;
  return (
    (Math.min(ratio, 4) - D.warMinStrengthRatio) * D.warStrengthWeight +
    (aggression - 3) * D.warAggressionWeight -
    (state.diplomacy.opinion[ai]?.[target] ?? 0) * D.warOpinionWeight
  );
}

/** The strongest attack `p` could bring: its best attacking unit type it has or can build, as an army. */
export function bestAttack(state: GameState, p: number): number {
  const player = state.players[p]!;
  let best = 0;
  for (const def of Object.values(UNITS)) {
    if (def.canFoundCity || !hasTech(player, def.requires)) continue;
    best = Math.max(best, def.attack * RULES.combat.armyMultiplier);
  }
  for (const u of state.units) if (u.owner === p) best = Math.max(best, attackStrength(u).total);
  return best;
}

/** Roughly what `p`'s best unit would defend with, fortified in a city (Walls not counted). */
export function bestCityDefense(state: GameState, p: number): number {
  let best = 0;
  for (const u of state.units) {
    if (u.owner !== p || UNITS[u.type].canFoundCity) continue;
    const mult = (u.army ? RULES.combat.armyMultiplier : 1) * (u.veteran ? 1 + RULES.combat.veteranPct / 100 : 1);
    best = Math.max(best, UNITS[u.type].defense * mult);
  }
  return best * (1 + (RULES.combat.cityDefensePct + RULES.combat.fortifiedPct) / 100);
}

/** Chance (0–1) per turn that the AI declares war with this score. */
export function warChance(score: number): number {
  if (!(score > 0)) return 0;
  return Math.min(D.warMaxChancePct, score * D.warChancePctPerPoint) / 100;
}

/** Would AI `ai` demand tribute from `target` now (ignoring the dice)? */
export function canDemand(state: GameState, ai: number, target: number): boolean {
  const d = state.diplomacy;
  if (!hasMet(state, ai, target) || atWar(state, ai, target)) return false;
  if (state.turn < D.aiGraceTurns) return false;
  const last = d.lastDemand[ai]?.[target];
  if (last !== null && last !== undefined && state.turn - last < D.demandCooldownTurns) return false;
  // At most one demand waiting at a time, from anyone.
  if (d.offers.some((o) => o.to === target && o.kind === 'demand')) return false;
  if (strengthRatio(state, ai, target) < D.demandMinStrengthRatio) return false;
  return civDef(state, ai).aggression >= D.demandMinAggression || attitude(state, ai, target) === 'hostile';
}

/** What AI `ai` would demand from `target`: its most valuable tech, or part of its gold. */
export function demandFor(state: GameState, ai: number, target: number): Pick<Offer, 'gold' | 'tech'> | undefined {
  const techs = tradeableTechs(state, target, ai).sort((x, y) => techValue(state, ai, y) - techValue(state, ai, x));
  const have = state.players[target]!.gold;
  const gold = Math.min(have, D.demandGoldMax, Math.max(D.demandGoldMin, Math.round((have * D.demandGoldPct) / 100)));
  const canGold = have >= D.demandGoldMin;
  if (techs.length && (!canGold || nextFloat(state) < 0.5)) return { tech: techs[0]! };
  if (canGold) return { gold };
  return undefined;
}

function tryAiTrade(state: GameState, ai: number): void {
  if (nextFloat(state) * 100 >= (D.aiTradeChancePct * willingness(state, ai)) / 5) return;
  for (const p of state.players) {
    const b = p.id;
    if (b === ai || !p.alive || p.kind !== 'ai' || !hasMet(state, ai, b)) continue;
    if (tradeRefusal(state, ai, b) || tradeRefusal(state, b, ai)) continue;
    const gets = tradeableTechs(state, b, ai);
    const gives = tradeableTechs(state, ai, b);
    let best: { get: TechId; give: TechId; value: number } | undefined;
    for (const get of gets) {
      for (const give of gives) {
        const forAi = techValue(state, ai, get);
        const forB = techValue(state, b, give);
        // Both sides must think it's fair enough.
        if (forB < forAi * swapRatio(state, b, ai) || forAi < forB * swapRatio(state, ai, b)) continue;
        if (!best || forAi > best.value) best = { get, give, value: forAi };
      }
    }
    if (best) {
      doSwap(state, ai, b, best.get, best.give, 0);
      return;
    }
  }
}

/**
 * The AI's diplomacy at the start of its turn: opinions drift; it makes peace with other AIs
 * (both must want it) or offers peace to the human; it may declare one war; it may demand
 * tribute from the human; and it may trade techs with another AI.
 */
export function runAiDiplomacy(state: GameState, ai: number): void {
  const d = state.diplomacy;
  driftOpinions(state, ai);

  for (const p of state.players) {
    const e = p.id;
    if (!p.alive || !atWar(state, ai, e)) continue;
    const want = peaceDesire(state, ai, e);
    if (p.kind === 'ai') {
      if (want.value > 0 && peaceDesire(state, e, ai).value > 0) makePeace(state, ai, e);
    } else if (want.value >= D.peaceOfferMinDesire) {
      const last = d.lastPeaceOffer[ai]?.[e];
      const pending = d.offers.some((o) => o.from === ai && o.to === e);
      if (!pending && (last === null || last === undefined || state.turn - last >= D.peaceOfferCooldownTurns)) {
        d.lastPeaceOffer[ai]![e] = state.turn;
        pushOffer(state, { from: ai, to: e, kind: 'peace' });
      }
    }
  }

  let best: { target: number; score: number } | undefined;
  for (const p of state.players) {
    const score = warScore(state, ai, p.id);
    if (score > 0 && (!best || score > best.score)) best = { target: p.id, score };
  }
  // Always roll, so the dice advance the same way whatever the scores are.
  const roll = nextFloat(state);
  if (best && roll < warChance(best.score)) declareWar(state, ai, best.target);

  for (const p of state.players) {
    if (p.kind !== 'human' || !p.alive || !canDemand(state, ai, p.id)) continue;
    if (nextFloat(state) * 100 >= D.demandChancePct) continue;
    const ask = demandFor(state, ai, p.id);
    if (!ask) continue;
    d.lastDemand[ai]![p.id] = state.turn;
    const o = pushOffer(state, { from: ai, to: p.id, kind: 'demand', ...ask });
    addLog(state, ai, `Demanded tribute from ${civName(state, p.id)}`, undefined, p.id, { otherText: offerText(state, o), kind: 'demand' });
  }

  tryAiTrade(state, ai);
}
