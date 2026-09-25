// Milestone 5: contact, war and peace, AI war/peace choices, demands, tech trading, event
// visibility with "met", the AI's expansion and defender cap, and the v4 → v5 save migration.

import { describe, expect, it } from 'vitest';
import { RULES } from '../src/data/rules';
import { applyAction } from '../src/game/actions';
import { aiCityTarget, isMilitary } from '../src/game/ai';
import { attackError } from '../src/game/combat';
import {
  answerOffer,
  canDemand,
  declareWar,
  declareWarError,
  hasMet,
  offerText,
  peaceDesire,
  runAiDiplomacy,
  techPrice,
  tradeableTechs,
  updateContacts,
  warChance,
  warScore,
} from '../src/game/diplomacy';
import { entryText, eventsVisibleTo } from '../src/game/log';
import { moveUnit } from '../src/game/movement';
import { createGame } from '../src/game/newGame';
import { deserializeGame, serializeGame } from '../src/game/save';
import { endTurn, playComputerTurn } from '../src/game/turn';
import { STATE_VERSION, type GameState } from '../src/game/types';
import { atWar } from '../src/game/war';
import { CivName, checkEliminations, civName, civPossessive } from '../src/game/conquest';
import { addCity, addUnit, makeState } from './helpers';

const D = RULES.diplomacy;
const row = (n: number) => 'g'.repeat(n);

/** Two civs, met, at peace, past the grace period. Player 1 is Maurya unless `civ` is given. */
function twoCivs(opts: { civ?: string; turn?: number } = {}): GameState {
  const s = makeState([row(16), row(16), row(16), row(16), row(16)], { peace: true });
  if (opts.civ) s.players[1]!.civId = opts.civ;
  s.turn = opts.turn ?? 30;
  addCity(s, 0, 1, 2, { name: 'Home', build: { kind: 'unit', id: 'warrior' } });
  addCity(s, 1, 8, 2, { name: 'Theirs', build: { kind: 'unit', id: 'warrior' } });
  addUnit(s, 'warrior', 0, 1, 2, { fortified: true });
  addUnit(s, 'spearman', 1, 8, 2, { fortified: true });
  return s;
}

function setWar(s: GameState, a: number, b: number, sinceTurn: number): void {
  s.atWar[a]![b] = s.atWar[b]![a] = true;
  s.diplomacy.warStart[a]![b] = s.diplomacy.warStart[b]![a] = sinceTurn;
}

describe('contact', () => {
  it('a new game starts with nobody met', () => {
    const s = createGame({ seed: 4 });
    for (const a of s.players) for (const b of s.players) expect(hasMet(s, a.id, b.id)).toBe(false);
  });

  it('civs meet when one sees the other’s unit, both ways, at peace', () => {
    const s = makeState([row(8)], { met: false });
    const w = addUnit(s, 'warrior', 0, 1, 0);
    addUnit(s, 'warrior', 1, 4, 0);
    expect(updateContacts(s)).toEqual([]);
    expect(moveUnit(s, w.id, { x: 2, y: 0 }).ok).toBe(true);
    expect(hasMet(s, 0, 1)).toBe(false); // sight 1: (2,0) sees x 1..3, their unit is at 4
    w.movesLeft = 1;
    expect(moveUnit(s, w.id, { x: 3, y: 0 }).ok).toBe(true);
    expect(hasMet(s, 0, 1) && hasMet(s, 1, 0)).toBe(true);
    expect(atWar(s, 0, 1)).toBe(false);
    expect(s.log.filter((e) => e.kind === 'contact')).toHaveLength(1);
  });

  it('seeing a city counts too', () => {
    const s = makeState([row(8)], { met: false });
    addCity(s, 1, 5, 0);
    const w = addUnit(s, 'warrior', 0, 2, 0);
    // City sight is 2: their city at 5 sees 3..7; our warrior at 2 sees 1..3.
    updateContacts(s);
    expect(hasMet(s, 0, 1)).toBe(false);
    moveUnit(s, w.id, { x: 3, y: 0 });
    expect(hasMet(s, 0, 1)).toBe(true);
  });
});

describe('war and peace', () => {
  it('at peace, units can’t attack or enter each other’s cities', () => {
    const s = twoCivs();
    const legion = addUnit(s, 'legion', 0, 7, 2);
    expect(attackError(s, legion, { x: 8, y: 2 })).toContain('at peace');
    const empty = addCity(s, 1, 12, 2);
    const w = addUnit(s, 'warrior', 0, 11, 2);
    expect(moveUnit(s, w.id, empty).reason).toBe('You are at peace with Maurya');
    expect(empty.owner).toBe(1);
  });

  it('declaring war is an action; then attacks are allowed and it’s logged for both sides', () => {
    const s = twoCivs();
    const legion = addUnit(s, 'legion', 0, 7, 2);
    const res = applyAction(s, { type: 'declareWar', target: 1 });
    expect(res.ok).toBe(true);
    expect(atWar(s, 0, 1) && atWar(s, 1, 0)).toBe(true);
    expect(attackError(s, legion, { x: 8, y: 2 })).toBeUndefined();
    const entry = s.log.find((e) => e.kind === 'war')!;
    expect(entryText(entry, 0)).toBe('You declared war on Maurya');
    expect(entryText(entry, 1)).toBe('Babylon declared war on you!');
    expect(s.diplomacy.opinion[1]![0]).toBe(D.declaredOnOpinion);
  });

  it('can’t declare war on someone you haven’t met, or twice', () => {
    const s = twoCivs();
    s.diplomacy.met[0]![1] = s.diplomacy.met[1]![0] = false;
    expect(declareWarError(s, 0, 1)).toBe("You haven't met them");
    s.diplomacy.met[0]![1] = s.diplomacy.met[1]![0] = true;
    setWar(s, 0, 1, 20);
    expect(declareWarError(s, 0, 1)).toBe('Already at war');
  });

  it(`after a peace treaty, war can't be declared for ${D.minPeaceTurns} turns`, () => {
    const s = twoCivs({ civ: 'maurya' });
    setWar(s, 0, 1, 10);
    s.diplomacy.warLosses[1]![0] = 6; // they're losing badly
    expect(applyAction(s, { type: 'proposePeace', target: 1 }).answer?.accepted).toBe(true);
    const signed = s.turn;
    expect(declareWarError(s, 0, 1)).toBe(`Your peace treaty holds until turn ${signed + D.minPeaceTurns}`);
    s.turn = signed + D.minPeaceTurns - 1;
    expect(declareWarError(s, 0, 1)).toBeDefined();
    s.turn = signed + D.minPeaceTurns;
    expect(declareWarError(s, 0, 1)).toBeUndefined();
  });

  it('the AI answers peace proposals: yes when losing, no when winning, the same every time', () => {
    const s = twoCivs({ civ: 'inca' });
    setWar(s, 0, 1, 25);
    s.diplomacy.warLosses[0]![1] = 6; // we lost 6 units to them
    const no = applyAction(s, { type: 'proposePeace', target: 1 });
    expect(no.answer).toEqual({ accepted: false, reason: 'We are winning this war.' });
    expect(applyAction(s, { type: 'proposePeace', target: 1 }).answer).toEqual(no.answer);
    expect(atWar(s, 0, 1)).toBe(true);
    s.diplomacy.warLosses[0]![1] = 0;
    s.diplomacy.warLosses[1]![0] = 10;
    const yes = applyAction(s, { type: 'proposePeace', target: 1 });
    expect(yes.answer?.accepted).toBe(true);
    expect(yes.answer?.reason).toContain('We accept peace');
    expect(atWar(s, 0, 1)).toBe(false);
  });

  it('refuses peace in the first turns of a war unless it’s losing', () => {
    const s = twoCivs({ civ: 'maurya' });
    setWar(s, 0, 1, s.turn - 1);
    expect(peaceDesire(s, 1, 0)).toMatchObject({ reason: 'This war has only just begun.' });
    expect(peaceDesire(s, 1, 0).value).toBeLessThanOrEqual(0);
  });
});

describe('AI war choices', () => {
  /** A strong AI (Franks, aggressive) next to a weak human. */
  function strongNeighbor(): GameState {
    const s = twoCivs({ civ: 'franks' });
    s.players[1]!.techs = ['bronze_working', 'iron_working'];
    addUnit(s, 'legion', 1, 8, 2, { army: true });
    return s;
  }

  it('a stronger, aggressive AI wants war; a weak or peaceful one doesn’t', () => {
    const s = strongNeighbor();
    expect(warScore(s, 1, 0)).toBeGreaterThan(0);
    expect(warChance(warScore(s, 1, 0))).toBeGreaterThan(0);
    const weak = strongNeighbor();
    for (let i = 0; i < 4; i++) addUnit(weak, 'legion', 0, 1, 2); // now we're the strong one
    expect(warScore(weak, 1, 0)).toBe(-Infinity);
    const peaceful = strongNeighbor();
    peaceful.players[1]!.civId = 'maurya';
    expect(warScore(peaceful, 1, 0)).toBeLessThan(warScore(s, 1, 0));
  });

  it(`never declares on the human before turn ${D.aiGraceTurns}, or during a treaty`, () => {
    const s = strongNeighbor();
    s.turn = D.aiGraceTurns - 1;
    expect(warScore(s, 1, 0)).toBe(-Infinity);
    s.turn = 40;
    s.diplomacy.peaceTurn[0]![1] = s.diplomacy.peaceTurn[1]![0] = 35;
    expect(warScore(s, 1, 0)).toBe(-Infinity);
  });

  it('won’t start a war it can’t win (no attacker that beats their fortified defender)', () => {
    const s = twoCivs({ civ: 'franks' });
    addUnit(s, 'spearman', 0, 1, 2);
    for (let i = 0; i < 6; i++) addUnit(s, 'warrior', 1, 8, 2); // strong on paper, but warriors only
    // A Warrior army (attack 3) vs a Spearman fortified in a city (3 × 1.75 = 5.25): 36%.
    expect(warScore(s, 1, 0)).toBe(-Infinity);
    s.players[1]!.techs = ['bronze_working', 'iron_working']; // Legions: an army attacks at 12
    expect(warScore(s, 1, 0)).toBeGreaterThan(0);
  });

  it('declares war deterministically over a few turns, and the same dice give the same result', () => {
    const run = () => {
      const s = strongNeighbor();
      for (let i = 0; i < 40 && !atWar(s, 0, 1); i++) {
        s.currentPlayer = 1;
        runAiDiplomacy(s, 1);
      }
      return s;
    };
    const a = run();
    expect(atWar(a, 0, 1)).toBe(true);
    expect(run()).toEqual(a);
  });

  it('two AIs make peace when both want it', () => {
    const s = makeState([row(16), row(16)], { players: 3, peace: true });
    s.turn = 60;
    s.players[1]!.civId = 'maurya';
    s.players[2]!.civId = 'mali';
    addCity(s, 1, 2, 0);
    addCity(s, 2, 12, 0);
    setWar(s, 1, 2, 20); // a long, even war
    s.currentPlayer = 1;
    expect(peaceDesire(s, 1, 2).value).toBeGreaterThan(0);
    expect(peaceDesire(s, 2, 1).value).toBeGreaterThan(0);
    runAiDiplomacy(s, 1);
    expect(atWar(s, 1, 2)).toBe(false);
    expect(s.log.some((e) => e.kind === 'peace' && e.publicText === 'Maurya and Mali made peace')).toBe(true);
  });

  it('an AI losing a war with the human offers peace, at most once per cooldown', () => {
    const s = twoCivs({ civ: 'maurya' });
    setWar(s, 0, 1, 10);
    s.diplomacy.warLosses[1]![0] = 8;
    s.currentPlayer = 1;
    runAiDiplomacy(s, 1);
    const offers = () => s.diplomacy.offers.filter((o) => o.kind === 'peace' && o.from === 1);
    expect(offers()).toHaveLength(1);
    s.currentPlayer = 0;
    expect(applyAction(s, { type: 'answerOffer', offerId: offers()[0]!.id, accept: false }).answer?.accepted).toBe(false);
    s.currentPlayer = 1;
    s.turn += 1;
    runAiDiplomacy(s, 1);
    expect(offers()).toHaveLength(0);
    s.turn += D.peaceOfferCooldownTurns;
    runAiDiplomacy(s, 1);
    expect(offers()).toHaveLength(1);
  });
});

describe('AI demands', () => {
  function bully(): GameState {
    const s = twoCivs({ civ: 'franks' });
    s.players[0]!.gold = 100;
    s.players[1]!.techs = ['bronze_working', 'iron_working'];
    addUnit(s, 'legion', 1, 8, 2, { army: true });
    return s;
  }

  it('only a stronger, aggressive (or hostile) AI demands, and not in the grace period', () => {
    const s = bully();
    expect(canDemand(s, 1, 0)).toBe(true);
    s.turn = D.aiGraceTurns - 1;
    expect(canDemand(s, 1, 0)).toBe(false);
    const meek = bully();
    meek.players[1]!.civId = 'maurya';
    expect(canDemand(meek, 1, 0)).toBe(false);
    meek.diplomacy.opinion[1]![0] = -5;
    expect(canDemand(meek, 1, 0)).toBe(true);
  });

  it(`is capped: once per ${D.demandCooldownTurns} turns per civ, one waiting at a time`, () => {
    const s = bully();
    let count = 0;
    for (let t = 0; t < 200; t++) {
      s.turn = 30 + t;
      s.currentPlayer = 1;
      runAiDiplomacy(s, 1);
      s.atWar[0]![1] = s.atWar[1]![0] = false; // keep them at peace for this test
      const pending = s.diplomacy.offers.filter((o) => o.kind === 'demand');
      expect(pending.length).toBeLessThanOrEqual(1);
      if (pending.length) {
        count++;
        s.currentPlayer = 0;
        applyAction(s, { type: 'answerOffer', offerId: pending[0]!.id, accept: true });
        s.players[0]!.gold = 100;
        s.players[0]!.techs = [];
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(Math.ceil(200 / D.demandCooldownTurns));
  });

  it('paying hands over the gold; refusing lowers their opinion, which raises the chance of war', () => {
    const s = bully();
    s.currentPlayer = 0;
    s.diplomacy.offers.push({ id: 900, from: 1, to: 0, kind: 'demand', gold: 40, turn: s.turn });
    const scoreBefore = warScore(s, 1, 0);
    expect(applyAction(s, { type: 'answerOffer', offerId: 900, accept: false }).answer?.accepted).toBe(false);
    expect(s.diplomacy.opinion[1]![0]).toBe(D.demandRefusedOpinion);
    expect(warScore(s, 1, 0)).toBeGreaterThan(scoreBefore);
    s.diplomacy.offers.push({ id: 901, from: 1, to: 0, kind: 'demand', gold: 40, turn: s.turn });
    expect(applyAction(s, { type: 'answerOffer', offerId: 901, accept: true }).answer?.accepted).toBe(true);
    expect(s.players[0]!.gold).toBe(60);
    expect(s.players[1]!.gold).toBe(40);
  });

  it('an unanswered demand counts as refused when you end your turn', () => {
    const s = bully();
    s.diplomacy.offers.push({ id: 902, from: 1, to: 0, kind: 'demand', gold: 40, turn: s.turn });
    applyAction(s, { type: 'endTurn' });
    expect(s.diplomacy.offers.some((o) => o.id === 902)).toBe(false);
    expect(s.players[0]!.gold).toBeGreaterThanOrEqual(100);
  });
});

describe('tech trading', () => {
  function traders(): GameState {
    const s = twoCivs({ civ: 'mali' });
    s.players[0]!.techs = ['bronze_working', 'masonry'];
    s.players[1]!.techs = ['pottery', 'alphabet', 'writing'];
    return s;
  }

  it('only techs the receiver can learn now (it knows the prerequisites) are tradeable', () => {
    const s = traders();
    expect(tradeableTechs(s, 1, 0).sort()).toEqual(['alphabet', 'pottery']); // not Writing (needs Alphabet)
    expect(tradeableTechs(s, 0, 1).sort()).toEqual(['bronze_working', 'masonry']);
  });

  it('a swap: both learn at once, and the giver keeps its tech', () => {
    const s = traders();
    const res = applyAction(s, { type: 'tradeTech', partner: 1, get: 'pottery', give: 'masonry' });
    expect(res.answer?.accepted).toBe(true);
    expect(s.players[0]!.techs).toEqual(expect.arrayContaining(['pottery', 'bronze_working', 'masonry']));
    expect(s.players[1]!.techs).toEqual(expect.arrayContaining(['masonry', 'pottery']));
    expect(s.log.some((e) => e.kind === 'trade')).toBe(true);
  });

  it('buying for gold costs the asking price; not enough gold is an error', () => {
    const s = traders();
    const price = techPrice(s, 1, 0, 'pottery');
    expect(applyAction(s, { type: 'tradeTech', partner: 1, get: 'pottery', give: null }).reason).toBe(`That costs ${price} gold`);
    s.players[0]!.gold = price + 5;
    expect(applyAction(s, { type: 'tradeTech', partner: 1, get: 'pottery', give: null }).answer?.accepted).toBe(true);
    expect(s.players[0]!.gold).toBe(5);
    expect(s.players[1]!.gold).toBe(price);
  });

  it('won’t trade while hostile or at war', () => {
    const s = traders();
    s.diplomacy.opinion[1]![0] = -5;
    expect(applyAction(s, { type: 'tradeTech', partner: 1, get: 'pottery', give: 'masonry' }).answer).toEqual({
      accepted: false,
      reason: 'We share nothing with those we distrust.',
    });
    s.diplomacy.opinion[1]![0] = 0;
    setWar(s, 0, 1, 25);
    expect(applyAction(s, { type: 'tradeTech', partner: 1, get: 'pottery', give: 'masonry' }).answer?.reason).toBe(
      'Not while we are at war.',
    );
    expect(s.players[0]!.techs).not.toContain('pottery');
  });

  it('a stingy AI refuses an uneven swap', () => {
    const s = traders();
    s.players[1]!.civId = 'franks'; // trade willingness 2
    s.players[0]!.techs = ['bronze_working', 'masonry', 'ceremonial_burial', 'horseback_riding', 'archery', 'alphabet', 'code_of_laws'];
    s.players[1]!.techs = ['pottery', 'currency', 'bronze_working', 'alphabet', 'writing'];
    // Currency is deep for us; Archery is shallow for them.
    const res = applyAction(s, { type: 'tradeTech', partner: 1, get: 'currency', give: 'archery' });
    expect(res.answer?.accepted).toBe(false);
    expect(res.answer?.reason).toContain('is worth more than');
  });

  it('gifts of gold improve their opinion', () => {
    const s = traders();
    s.players[0]!.gold = 60;
    expect(applyAction(s, { type: 'giveGold', target: 1, amount: 50 }).answer?.accepted).toBe(true);
    expect(s.players[0]!.gold).toBe(10);
    expect(s.diplomacy.opinion[1]![0]).toBe(2);
  });
});

describe('event visibility with contact', () => {
  it('civ-level news shows once you’ve met; map-level news still needs sight', () => {
    const s = makeState([row(20)], { players: 3, met: false });
    addUnit(s, 'warrior', 0, 0, 0);
    s.log.push(
      { turn: 1, player: 1, text: 'Entered the Medieval era', publicText: 'Maurya entered the Medieval era', kind: 'era' },
      { turn: 1, player: 1, text: 'Maurya founded Taxila', x: 15, y: 0 },
    );
    expect(eventsVisibleTo(s, 0, s.log)).toHaveLength(0);
    s.diplomacy.met[0]![1] = s.diplomacy.met[1]![0] = true;
    const seen = eventsVisibleTo(s, 0, s.log);
    expect(seen.map((e) => entryText(e, 0))).toEqual(['Maurya entered the Medieval era']);
  });

  it('news between two other civs shows if you’ve met either', () => {
    const s = makeState([row(20)], { players: 3, met: false });
    s.log.push({ turn: 1, player: 1, other: 2, text: 'x', publicText: 'Maurya declared war on Mali', kind: 'war' });
    expect(eventsVisibleTo(s, 0, s.log)).toHaveLength(0);
    s.diplomacy.met[0]![2] = s.diplomacy.met[2]![0] = true;
    expect(eventsVisibleTo(s, 0, s.log).map((e) => entryText(e, 0))).toEqual(['Maurya declared war on Mali']);
  });
});

describe('AI expansion and defender cap (simulation)', () => {
  it('expands past the old fixed 4 cities, keeps unit counts in check, and stays deterministic', () => {
    const play = () => {
      const s = createGame({ seed: 33, playerCount: 5 });
      for (const p of s.players) if (p.kind === 'human') p.kind = 'ai';
      while (s.turn <= 100) {
        playComputerTurn(s, s.currentPlayer);
        endTurn(s);
      }
      return s;
    };
    const s = play();
    expect(play()).toEqual(s);
    expect(aiCityTarget(s)).toBeGreaterThan(4);
    const alive = s.players.filter((p) => p.alive && p.kind !== 'barbarian');
    const cities = alive.map((p) => s.cities.filter((c) => c.owner === p.id).length);
    expect(cities.reduce((a, b) => a + b, 0) / alive.length).toBeGreaterThan(4.5);
    // The cap: defenders + wartime offense per city, plus a little slack for units in production
    // (4 since Round 14: the faster path search picks other equal-cost paths, and in this
    // seed's new game one civ ends a single unit over the old slack of 3).
    for (const p of alive) {
      const n = s.cities.filter((c) => c.owner === p.id).length;
      const military = s.units.filter((u) => u.owner === p.id && isMilitary(u)).length;
      expect(military).toBeLessThanOrEqual(n * (RULES.ai.borderDefendersAtWar + RULES.ai.offensePerCityWar) + 4);
    }
  }, 30_000);
});

describe('save migration v4 → v5', () => {
  function v4Save(): string {
    const s = makeState([row(20)], { players: 3 });
    addUnit(s, 'warrior', 0, 1, 0);
    addUnit(s, 'warrior', 1, 2, 0); // next to player 0: they can see each other
    addCity(s, 2, 18, 0); // far away
    const raw = JSON.parse(serializeGame(s, 0));
    raw.saveVersion = 4;
    raw.state.version = 4;
    delete raw.state.diplomacy;
    delete raw.state.aiPlans;
    return JSON.stringify(raw);
  }

  it('pairs who can see each other now count as met; wars carry over as they are', () => {
    const res = deserializeGame(v4Save());
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    const s = res.state;
    expect(s.version).toBe(STATE_VERSION);
    expect(res.migratedFrom).toBe(4);
    expect(hasMet(s, 0, 1)).toBe(true);
    expect(hasMet(s, 0, 2)).toBe(false);
    expect(hasMet(s, 1, 2)).toBe(false);
    // M4 had everyone at war; that stays, met or not.
    expect(atWar(s, 0, 1) && atWar(s, 0, 2) && atWar(s, 1, 2)).toBe(true);
    expect(s.diplomacy.offers).toEqual([]);
    // Round 9 adds the barbarians as a fourth player.
    expect(s.aiPlans).toEqual([null, null, null, null]);
    // It plays on.
    expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
  });

  it('a v2 save goes all the way to v5 in one load', () => {
    const raw = JSON.parse(v4Save());
    raw.saveVersion = 2;
    raw.state.version = 2;
    delete raw.state.atWar;
    for (const p of raw.state.players) delete p.techs;
    const res = deserializeGame(JSON.stringify(raw));
    expect(res.kind).toBe('ok');
  });
});

describe('civ names in messages (Round 6)', () => {
  it('plural civs read with "the" and agree: "The Franks declared war on you!"', () => {
    const s = twoCivs({ civ: 'franks' });
    expect([civName(s, 1), CivName(s, 1), civPossessive(s, 1)]).toEqual(['the Franks', 'The Franks', "the Franks'"]);
    expect([civName(s, 0), CivName(s, 0), civPossessive(s, 0)]).toEqual(['Babylon', 'Babylon', "Babylon's"]);
    declareWar(s, 1, 0);
    const entry = s.log.find((e) => e.kind === 'war')!;
    expect(entryText(entry, 0)).toBe('The Franks declared war on you!');
    expect(entryText(entry, 1)).toBe('You declared war on Babylon');
    expect(entry.publicText).toBe('The Franks declared war on Babylon');
  });

  it('offers name the leader of the civ, and answers use the right forms', () => {
    const s = twoCivs({ civ: 'franks' });
    s.players[0]!.gold = 100;
    s.diplomacy.offers.push({ id: 1, from: 1, to: 0, kind: 'demand', gold: 30, turn: s.turn });
    expect(offerText(s, s.diplomacy.offers[0]!)).toBe('Charlemagne of the Franks demands 30 gold as tribute.');
    const res = answerOffer(s, 1, false);
    expect(res.ok).toBe(true);
    expect(s.log.at(-1)!.text).toBe("You refused the Franks' demand");
  });

  it('an eliminated plural civ "have been eliminated"', () => {
    const s = twoCivs({ civ: 'inca' });
    s.cities = s.cities.filter((c) => c.owner !== 1);
    s.units = s.units.filter((u) => u.owner !== 1);
    checkEliminations(s, 0, { x: 8, y: 2 });
    expect(s.log.at(-1)!.publicText).toBe('The Inca have been eliminated');
  });
});
