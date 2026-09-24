// Every dev scenario must do exactly what its on-screen note says after one End Turn. The
// scenario and this test build the same state (src/dev/scenarios.ts), so they can't drift.

import { describe, expect, it } from 'vitest';
import { UNITS } from '../src/data/units';
import { SCENARIOS, type Scenario } from '../src/dev/scenarios';
import { applyAction } from '../src/game/actions';
import { combatOdds, formArmyError } from '../src/game/combat';
import { buildOptions, buyError } from '../src/game/production';
import { deserializeGame, serializeGame } from '../src/game/save';
import { playerEra } from '../src/game/tech';
import type { City, GameState } from '../src/game/types';
import { foodSurplus, tileYields } from '../src/game/yields';

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
  capture: (s) => {
    const rivalCapital = s.cities.find((c) => c.x === ENEMY.x && c.y === ENEMY.y)!;
    expect(rivalCapital.capitalOf).toBe(1);
    expect(oddsPct(s)).toBe(64); // 4 / (4 + 1 × 2.25)
    attackFromFront(s);
    expect(s.units.some((u) => u.owner === 1 && u.x === ENEMY.x && u.y === ENEMY.y)).toBe(false); // it won
    const second = mineAt(s, { x: FRONT.x, y: FRONT.y - 1 })[0]!;
    expect(applyAction(s, { type: 'move', unitId: second.id, to: ENEMY }).ok).toBe(true);
    expect(rivalCapital.owner).toBe(0);
    expect(rivalCapital.size).toBe(2);
    expect(rivalCapital.buildings).toEqual(['granary']);
    expect(rivalCapital.capitalOf).toBe(1); // still their original capital
    expect(s.log.some((e) => e.text.includes('capital'))).toBe(true);
    expect(s.players[1]!.alive).toBe(true); // they still have Taxila
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
