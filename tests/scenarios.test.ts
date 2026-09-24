// Every dev scenario must do exactly what its on-screen note says after one End Turn. The
// scenario and this test build the same state (src/dev/scenarios.ts), so they can't drift.

import { describe, expect, it } from 'vitest';
import { UNITS, UNIT_IDS } from '../src/data/units';
import { SCENARIOS, type Scenario } from '../src/dev/scenarios';
import { applyAction } from '../src/game/actions';
import { attackError, attackStrength, combatOdds, defenseStrength, formArmyError } from '../src/game/combat';
import { attitude, hasMet, metCivs } from '../src/game/diplomacy';
import { distance } from '../src/game/grid';
import { atWar } from '../src/game/war';
import { buildOptions, buyError } from '../src/game/production';
import { deserializeGame, serializeGame } from '../src/game/save';
import { playerEra } from '../src/game/tech';
import type { City, GameState } from '../src/game/types';
import { cityCulture, cityYields, foodSurplus, tileYields } from '../src/game/yields';
import { WONDERS } from '../src/data/wonders';
import { eventsVisibleTo } from '../src/game/log';
import { armyCandidates, behindUnit, isMixedStack, stackLabel, unitsOnTile } from '../src/game/stack';

const capital = (s: GameState): City => s.cities.find((c) => c.owner === 0)!;
const FRONT = { x: 9, y: 5 };
const ENEMY = { x: 10, y: 5 };
const mineAt = (s: GameState, at: { x: number; y: number }) => s.units.filter((u) => u.owner === 0 && u.x === at.x && u.y === at.y);
const oddsPct = (s: GameState) => Math.round(combatOdds(s, mineAt(s, FRONT)[0]!, ENEMY)!.chance * 100);
const modLabels = (s: GameState) => combatOdds(s, mineAt(s, FRONT)[0]!, ENEMY)!.defense.mods.map((m) => `${m.label} +${m.pct}%`);
const noteOf = (id: string) => SCENARIOS.find((x) => x.id === id)!.note;

/** Attack ENEMY from FRONT through the real action; exactly one of the two units dies. */
function attackFromFront(s: GameState): void {
  const before = s.units.length;
  const res = applyAction(s, { type: 'attack', unitId: mineAt(s, FRONT)[0]!.id, at: ENEMY });
  expect(res.ok).toBe(true);
  expect(res.combat).toBeDefined();
  expect(s.units.length).toBe(before - 1);
}
const builds = (s: GameState) => buildOptions(s, capital(s)).map((i) => i.id);

function endTurn(s: GameState): void {
  expect(applyAction(s, { type: 'endTurn' })).toEqual({ ok: true });
}

/** What each scenario's note promises. A new scenario without an entry here fails the suite. */
const OUTCOMES: Record<string, (s: GameState) => void> = {
  wonder: (s) => {
    const c = capital(s);
    const before = cityYields(s, c).production;
    endTurn(s);
    expect(capital(s).wonders).toEqual(['pyramids']);
    expect(cityYields(s, capital(s)).production).toBe(before + Math.floor((before * 25) / 100));
    expect(cityCulture(s, capital(s))).toBe(WONDERS.pyramids.effects.culture);
    expect(buildOptions(s, capital(s)).some((i) => i.kind === 'wonder' && i.id === 'pyramids')).toBe(false);
  },
  'wonder-race': (s) => {
    const c = capital(s);
    expect(c.production).toBe(40);
    endTurn(s);
    const rival = s.cities.find((x) => x.owner === 1)!;
    expect(rival.wonders).toEqual(['colossus']);
    expect(capital(s).build).toBeNull();
    expect(capital(s).production).toBeGreaterThanOrEqual(40);
    expect(buildOptions(s, capital(s)).some((i) => i.id === 'colossus')).toBe(false);
    expect(eventsVisibleTo(s, 0, s.log).some((e) => e.player === 0 && e.text.includes('first'))).toBe(true);
  },
  'win-domination': (s) => {
    expect(s.victory).toBeNull();
    attackFromFront(s);
    expect(s.victory).toMatchObject({ winner: 0, kind: 'domination' });
    // Maurya lost its capital to you but is still in the game (Taxila).
    expect(s.players[1]!.alive).toBe(true);
    expect(noteOf('win-domination')).toContain(`${oddsPct(SCENARIOS.find((x) => x.id === 'win-domination')!.build())}%`);
  },
  'win-culture': (s) => {
    endTurn(s);
    expect(s.victory).toMatchObject({ winner: 0, kind: 'culture' });
    // Keep playing: no more checks, and the record stays.
    expect(applyAction(s, { type: 'keepPlaying' }).ok).toBe(true);
    endTurn(s);
    expect(s.keepPlaying).toBe(true);
    expect(s.victory).toMatchObject({ winner: 0, kind: 'culture' });
  },
  'win-economic': (s) => {
    endTurn(s);
    expect(s.victory).toMatchObject({ winner: 0, kind: 'economic' });
  },
  'win-space': (s) => {
    const arrives = s.players[0]!.space.arrivesTurn;
    expect(arrives).toBe(s.turn + 1);
    expect(s.victory).toBeNull();
    endTurn(s);
    expect(s.victory).toMatchObject({ winner: 0, kind: 'technology', turn: arrives });
  },
  'lose-space': (s) => {
    endTurn(s);
    expect(s.victory).toMatchObject({ winner: 1, kind: 'technology' });
    expect(s.players[0]!.alive).toBe(true);
  },
  'stop-launch': (s) => {
    const arrives = s.players[1]!.space.arrivesTurn!;
    attackFromFront(s);
    const pat = s.cities.find((c) => c.capitalOf === 1)!;
    expect(pat.owner).toBe(0);
    expect(s.players[1]!.space).toEqual({ parts: 0, launchedTurn: null, arrivesTurn: null });
    expect(s.log.some((e) => e.kind === 'space' && e.publicText?.includes('lost'))).toBe(true);
    while (s.turn <= arrives + 1) endTurn(s);
    expect(s.victory).toBeNull();
  },
  'near-win-warning': (s) => {
    endTurn(s);
    const warnings = () => s.log.filter((e) => e.kind === 'warning' && e.other === 0);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]!.text).toContain('culture');
    endTurn(s);
    expect(warnings()).toHaveLength(1);
  },
  'all-units': (s) => {
    const mine = s.units.filter((u) => u.owner === 0);
    expect(new Set(mine.map((u) => u.type))).toEqual(new Set(UNIT_IDS));
    expect(mine.some((u) => u.army)).toBe(true);
    expect(mine.some((u) => u.veteran)).toBe(true);
    expect(mine.some((u) => u.fortified)).toBe(true);
    expect(isMixedStack(unitsOnTile(s, 12, 7))).toBe(true);
    expect(s.units.some((u) => u.owner === 1)).toBe(true);
    // Nothing on the map is at war, so looking around is safe.
    expect(atWar(s, 0, 1)).toBe(false);
    expect(noteOf('all-units')).toContain(String(UNIT_IDS.length));
  },
  grow: (s) => {
    expect(capital(s).size).toBe(2);
    endTurn(s);
    expect(capital(s).size).toBe(3);
  },
  starve: (s) => {
    const c = capital(s);
    expect(c.size).toBe(3);
    expect(foodSurplus(s, c)).toBeLessThan(0);
    // The starvation guard does its best: the one tile with food (hills) is worked.
    const foodTiles = c.worked.filter((k) => tileYields(s, k).food > 0);
    expect(foodTiles.map((k) => s.map.tiles[k]!.terrain)).toEqual(['hills']);
    endTurn(s);
    expect(capital(s).size).toBe(2);
  },
  settler: (s) => {
    expect(capital(s).size).toBe(2);
    expect(s.units).toHaveLength(0);
    endTurn(s);
    const c = capital(s);
    expect(c.size).toBe(1);
    expect(s.units.filter((u) => UNITS[u.type].canFoundCity && u.x === c.x && u.y === c.y)).toHaveLength(1);
  },
  rich: (s) => {
    const c = capital(s);
    expect(s.players[0]!.gold).toBe(500);
    expect(buyError(s, c)).toBeUndefined();
    expect(applyAction(s, { type: 'rushBuy', cityId: c.id }).ok).toBe(true);
    endTurn(s);
    expect(capital(s).buildings).toContain('library');
  },
  tech: (s) => {
    expect(builds(s)).not.toContain('library');
    endTurn(s);
    const p = s.players[0]!;
    expect(p.techs).toContain('writing');
    expect(p.researching).toBeNull(); // the game asks for the next pick
    expect(builds(s)).toContain('library');
  },
  era: (s) => {
    expect(playerEra(s.players[0]!)).toBe('ancient');
    endTurn(s);
    expect(playerEra(s.players[0]!)).toBe('medieval');
    expect(s.log.map((e) => e.text)).toContain('Entered the Medieval era');
  },
  combat: (s) => {
    expect(oddsPct(s)).toBe(57); // 4 / (4 + 3)
    expect(modLabels(s)).toEqual([]);
    expect(noteOf('combat')).toContain('57%');
    attackFromFront(s);
  },
  fortified: (s) => {
    expect(modLabels(s)).toEqual(['Hills +50%', 'Fortified +50%', 'Veteran +50%']);
    expect(combatOdds(s, mineAt(s, FRONT)[0]!, ENEMY)!.defense.total).toBe(7.5);
    expect(oddsPct(s)).toBe(35); // 4 / (4 + 7.5)
    expect(noteOf('fortified')).toContain('35%');
    attackFromFront(s);
  },
  walls: (s) => {
    expect(modLabels(s)).toEqual(['In a city +25%', 'Walls +100%']);
    expect(combatOdds(s, mineAt(s, FRONT)[0]!, ENEMY)!.defense.total).toBe(6.75);
    expect(oddsPct(s)).toBe(47); // 6 / (6 + 6.75)
    expect(noteOf('walls')).toContain('47%');
    attackFromFront(s);
  },
  army: (s) => {
    const archers = mineAt(s, FRONT);
    expect(archers.map((u) => u.type)).toEqual(['archer', 'archer', 'archer']);
    expect(oddsPct(s)).toBe(75);
    expect(formArmyError(s, archers[0]!)).toBeUndefined();
    expect(applyAction(s, { type: 'formArmy', unitId: archers[0]!.id }).ok).toBe(true);
    const army = mineAt(s, FRONT);
    expect(army).toHaveLength(1);
    expect(army[0]!.army).toBe(true);
    const odds = combatOdds(s, army[0]!, ENEMY)!;
    expect([odds.attack.total, UNITS.archer.defense * 3]).toEqual([9, 6]);
    expect(oddsPct(s)).toBe(90);
  },
  'army-in-city': (s) => {
    const c = capital(s);
    const legions = mineAt(s, c).filter((u) => u.type === 'legion');
    expect(legions).toHaveLength(3);
    // The city panel's unit row selects the Legion; its Form Army button then works.
    expect(formArmyError(s, legions[1]!)).toBeUndefined();
    expect(applyAction(s, { type: 'formArmy', unitId: legions[1]!.id }).ok).toBe(true);
    const army = mineAt(s, c).filter((u) => u.type === 'legion');
    expect(army).toHaveLength(1);
    expect(army[0]!.army).toBe(true);
    expect(attackStrength(army[0]!).total).toBe(12);
    expect(defenseStrength(s, army[0]!).base).toBe(6);
    expect(noteOf('army-in-city')).toContain('attack 12, defense 6');
  },
  'mixed-stack': (s) => {
    const stack = unitsOnTile(s, FRONT.x, FRONT.y);
    expect(stack.map((u) => u.type)).toEqual(['warrior', 'legion', 'legion', 'legion']);
    expect(isMixedStack(stack)).toBe(true);
    expect(stackLabel(stack)).toBe('1 Warrior, 3 Legions');
    // The Warrior is drawn on top; a Legion peeks out behind it.
    expect(behindUnit(stack, stack[0]!)?.type).toBe('legion');
    // Form Army is offered for the Legions even though the Warrior is the selected unit.
    expect(formArmyError(s, stack[0]!)).toBeDefined();
    const [candidate] = armyCandidates(s, stack);
    expect(candidate?.type).toBe('legion');
    expect(applyAction(s, { type: 'formArmy', unitId: candidate!.id }).ok).toBe(true);
    const after = unitsOnTile(s, FRONT.x, FRONT.y);
    expect(after.map((u) => [u.type, u.army])).toEqual([['warrior', false], ['legion', true]]);
    expect(attackStrength(after[1]!).total).toBe(12);
    expect(noteOf('mixed-stack')).toContain('1 Warrior, 3 Legions');
    // The rival's tile is mixed too.
    const theirs = unitsOnTile(s, FRONT.x + 1, FRONT.y - 1);
    expect(isMixedStack(theirs)).toBe(true);
    expect(stackLabel(theirs)).toBe('1 Spearman, 1 Archer');
  },
  capture: (s) => {
    const rivalCapital = s.cities.find((c) => c.x === ENEMY.x && c.y === ENEMY.y)!;
    expect(rivalCapital.capitalOf).toBe(1);
    expect(oddsPct(s)).toBe(64); // 4 / (4 + 1 × 2.25)
    expect(noteOf('capture')).toContain('64%');
    const legion = mineAt(s, FRONT)[0]!;
    const res = applyAction(s, { type: 'attack', unitId: legion.id, at: ENEMY });
    expect(res.combat?.attackerWon).toBe(true);
    // One unit is enough now: the winner moved in and took the city.
    expect(res.combat?.capturedCityId).toBe(rivalCapital.id);
    expect(mineAt(s, ENEMY).map((u) => u.id)).toEqual([legion.id]);
    expect(rivalCapital.owner).toBe(0);
    expect(rivalCapital.size).toBe(2);
    expect(rivalCapital.buildings).toEqual(['granary']);
    expect(rivalCapital.capitalOf).toBe(1); // still their original capital
    expect(s.log.some((e) => e.text.includes('capital'))).toBe(true);
    expect(s.players[1]!.alive).toBe(true); // they still have Taxila
  },
  victory: (s) => {
    expect(noteOf('victory')).toContain(`${oddsPct(s)}%`);
    const res = applyAction(s, { type: 'attack', unitId: mineAt(s, FRONT)[0]!.id, at: ENEMY });
    expect(res.combat?.attackerWon).toBe(true);
    expect(res.combat?.capturedCityId).toBeDefined();
    expect(s.players[1]!.alive).toBe(false);
    // The UI shows the Victory panel when every rival is gone.
    expect(s.players.filter((p) => p.id !== 0).every((p) => !p.alive)).toBe(true);
  },
  'first-contact': (s) => {
    expect(hasMet(s, 0, 1)).toBe(false);
    const w = mineAt(s, FRONT)[0]!;
    expect(applyAction(s, { type: 'move', unitId: w.id, to: { x: FRONT.x + 1, y: FRONT.y } }).ok).toBe(true);
    expect(hasMet(s, 0, 1)).toBe(true);
    expect(atWar(s, 0, 1)).toBe(false);
    expect(metCivs(s, 0)).toEqual([1]);
    expect(s.log.some((e) => e.kind === 'contact' && e.player === 0 && e.other === 1)).toBe(true);
    expect(noteOf('first-contact')).toContain('Maurya, led by Ashoka');
  },
  peace: (s) => {
    expect(atWar(s, 0, 1)).toBe(true);
    const res = applyAction(s, { type: 'proposePeace', target: 1 });
    expect(res.answer?.accepted).toBe(true);
    expect(noteOf('peace')).toContain(res.answer!.reason);
    expect(atWar(s, 0, 1)).toBe(false);
    const legion = mineAt(s, FRONT)[0]!;
    expect(attackError(s, legion, ENEMY)).toContain('at peace');
  },
  demand: (s) => {
    endTurn(s);
    const gold = s.players[0]!.gold;
    const offer = s.diplomacy.offers.find((o) => o.kind === 'demand' && o.to === 0)!;
    expect(offer).toBeDefined();
    expect(offer.from).toBe(1);
    expect(atWar(s, 0, 1)).toBe(false);
    const before = s.diplomacy.opinion[1]![0]!;
    const res = applyAction(s, { type: 'answerOffer', offerId: offer.id, accept: false });
    expect(res.answer?.accepted).toBe(false);
    expect(s.diplomacy.opinion[1]![0]).toBeLessThan(before);
    expect(s.players[0]!.gold).toBe(gold);
  },
  'tech-trade': (s) => {
    expect(attitude(s, 1, 0)).toBe('friendly');
    expect(builds(s)).not.toContain('granary');
    const res = applyAction(s, { type: 'tradeTech', partner: 1, get: 'pottery', give: 'bronze_working' });
    expect(res.answer?.accepted).toBe(true);
    expect(s.players[0]!.techs).toContain('pottery');
    expect(s.players[1]!.techs).toContain('bronze_working');
    expect(builds(s)).toContain('granary');
  },
  'ai-war': (s) => {
    const rivalArmy = s.units.find((u) => u.owner === 1 && u.army)!;
    const start = distance(rivalArmy, capital(s));
    endTurn(s);
    expect(atWar(s, 0, 1)).toBe(true);
    expect(s.log.some((e) => e.kind === 'war' && e.player === 1 && e.other === 0)).toBe(true);
    // Within a few turns the army closes in and attacks (or has taken the city).
    let attacked = false;
    for (let i = 0; i < 6 && !attacked; i++) {
      endTurn(s);
      attacked = s.log.some((e) => e.player === 1 && e.other === 0 && /defeated|destroyed attacking|captured/.test(e.text));
    }
    expect(attacked).toBe(true);
    const army = s.units.find((u) => u.id === rivalArmy.id);
    if (army) expect(distance(army, capital(s))).toBeLessThan(start);
  },
  defeat: (s) => {
    expect(s.players[0]!.alive).toBe(true);
    endTurn(s);
    expect(s.cities.filter((c) => c.owner === 0)).toHaveLength(0);
    expect(s.units.filter((u) => u.owner === 0)).toHaveLength(0);
    expect(s.players[0]!.alive).toBe(false); // the UI shows the Defeated panel
  },
};

describe('dev scenarios', () => {
  it('has the starter set, with unique ids and a note each', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['grow', 'starve', 'settler', 'rich', 'tech']));
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENARIOS) expect(s.note.length).toBeGreaterThan(20);
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as [string, Scenario]))('%s does what its note says', (id, scenario) => {
    const outcome = OUTCOMES[id];
    expect(outcome, `add an expected outcome for scenario "${id}" to OUTCOMES`).toBeDefined();
    outcome!(scenario.build());
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as [string, Scenario]))('%s is a valid, repeatable game state', (_id, scenario) => {
    const a = scenario.build();
    expect(scenario.build()).toEqual(a);
    const loaded = deserializeGame(serializeGame(a, 0));
    expect(loaded.kind).toBe('ok');
  });
});
