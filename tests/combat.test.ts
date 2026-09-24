// Milestone 4: combat, fortify, armies, capture, elimination, AI combat, and the v3 → v4
// save migration.

import { describe, expect, it } from 'vitest';
import { RULES } from '../src/data/rules';
import { UNITS } from '../src/data/units';
import { applyAction } from '../src/game/actions';
import { runAiTurn, tryCombat } from '../src/game/ai';
import {
  attackError,
  combatOdds,
  defenseStrength,
  formArmyError,
  pickDefender,
  winChance,
} from '../src/game/combat';
import { eventsVisibleTo } from '../src/game/log';
import { createGame } from '../src/game/newGame';
import { processCities } from '../src/game/production';
import { deserializeGame, serializeGame } from '../src/game/save';
import { STATE_VERSION, type GameState } from '../src/game/types';
import { atWar } from '../src/game/war';
import { resolveTap } from '../src/ui/tap';
import { addCity, addUnit, makeState } from './helpers';

const attack = (s: GameState, unitId: number, x: number, y: number) => applyAction(s, { type: 'attack', unitId, at: { x, y } });

describe('war', () => {
  it('a new game starts with nobody at war (Milestone 5: civs meet at peace)', () => {
    const s = createGame({ seed: 3, playerCount: 5 });
    for (let a = 0; a < 5; a++) {
      for (let b = 0; b < 5; b++) expect(atWar(s, a, b)).toBe(false);
    }
  });

  it('peace blocks attacks', () => {
    const s = makeState(['ggg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    addUnit(s, 'warrior', 1, 1, 0);
    s.atWar[0]![1] = s.atWar[1]![0] = false;
    expect(attackError(s, w, { x: 1, y: 0 })).toBe('You are at peace with Maurya. Declare war in Diplomacy first');
  });
});

describe('combat odds', () => {
  it('is A / (A + D), in one function', () => {
    expect(winChance(4, 3)).toBeCloseTo(4 / 7);
    expect(winChance(1, 1)).toBe(0.5);
    expect(winChance(0, 3)).toBe(0);
    expect(winChance(3, 0)).toBe(1);
  });

  it('plain grassland: no bonuses', () => {
    const s = makeState(['ggg']);
    const legion = addUnit(s, 'legion', 0, 0, 0);
    addUnit(s, 'spearman', 1, 1, 0);
    const odds = combatOdds(s, legion, { x: 1, y: 0 })!;
    expect(odds.attack).toEqual({ base: 4, mods: [], total: 4 });
    expect(odds.defense).toEqual({ base: 3, mods: [], total: 3 });
    expect(odds.chance).toBeCloseTo(4 / 7);
  });

  it.each([
    ['hills', 'h', 50],
    ['forest', 'f', 25],
  ])('defending on %s gives +%s', (_name, ch, pct) => {
    const s = makeState([`g${ch}`]);
    addUnit(s, 'spearman', 1, 1, 0);
    const d = defenseStrength(s, s.units[0]!);
    expect(d.mods.map((m) => m.pct)).toEqual([pct as number]);
    expect(d.total).toBe(3 * (1 + (pct as number) / 100));
  });

  it('fortified +50%, veteran +50% (defending), and they add up', () => {
    const s = makeState(['gh']);
    const sp = addUnit(s, 'spearman', 1, 1, 0, { fortified: true, veteran: true });
    const d = defenseStrength(s, sp);
    expect(d.mods).toEqual([
      { label: 'Hills', pct: 50 },
      { label: 'Fortified', pct: 50 },
      { label: 'Veteran', pct: 50 },
    ]);
    expect(d.total).toBe(7.5);
  });

  it('veteran +50% when attacking too', () => {
    const s = makeState(['gg']);
    const legion = addUnit(s, 'legion', 0, 0, 0, { veteran: true });
    addUnit(s, 'warrior', 1, 1, 0);
    expect(combatOdds(s, legion, { x: 1, y: 0 })!.attack.total).toBe(6);
  });

  it('a city gives +25%, and Walls +100% more against land units', () => {
    const s = makeState(['ggg', 'ggg', 'ggg']);
    const c = addCity(s, 1, 1, 1);
    const sp = addUnit(s, 'spearman', 1, 1, 1);
    expect(defenseStrength(s, sp).total).toBe(3.75);
    c.buildings.push('walls');
    expect(defenseStrength(s, sp).mods.map((m) => m.label)).toEqual(['In a city', 'Walls']);
    expect(defenseStrength(s, sp).total).toBe(6.75);
    expect(defenseStrength(s, sp, false).total).toBe(3.75); // not against a (future) sea attack
  });
});

describe('attacking', () => {
  it('the best defender fights; if it loses, only it dies and the stack stays', () => {
    const s = makeState(['gg']);
    const legion = addUnit(s, 'legion', 0, 0, 0, { veteran: true, army: true }); // 18 attack: sure win
    const w = addUnit(s, 'warrior', 1, 1, 0);
    const sp = addUnit(s, 'spearman', 1, 1, 0);
    const settler = addUnit(s, 'settler', 1, 1, 0);
    expect(pickDefender(s, { x: 1, y: 0 }, 0)!.id).toBe(sp.id);
    // A fortified Warrior (1.5) still loses to the Spearman (3) as best defender.
    w.fortified = true;
    expect(pickDefender(s, { x: 1, y: 0 }, 0)!.id).toBe(sp.id);
    s.rngState = 1; // first draw well under the ~86% chance
    const res = attack(s, legion.id, 1, 0);
    expect(res.ok).toBe(true);
    expect(res.combat!.attackerWon).toBe(true);
    expect(s.units.map((u) => u.id).sort()).toEqual([legion.id, w.id, settler.id].sort());
    expect(legion.x).toBe(0); // the attacker stays where it was
  });

  it('the loser is destroyed: the attacker when it loses', () => {
    const s = makeState(['gh']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    const sp = addUnit(s, 'spearman', 1, 1, 0, { fortified: true, veteran: true }); // 7.5 vs 1
    s.rngState = 12345; // first draw ≈ 0.98: the 12% shot misses (deterministic)
    const res = attack(s, w.id, 1, 0);
    expect(res.combat!.attackerWon).toBe(false);
    expect(s.units.map((u) => u.id)).toEqual([sp.id]);
  });

  it('is deterministic for a given RNG state', () => {
    const run = () => {
      const s = makeState(['gg']);
      const a = addUnit(s, 'warrior', 0, 0, 0);
      addUnit(s, 'warrior', 1, 1, 0);
      s.rngState = 424242;
      return attack(s, a.id, 1, 0).combat!.attackerWon;
    };
    expect(run()).toBe(run());
  });

  it('attacking ends the attacker’s turn and clears fortify', () => {
    const s = makeState(['gg']);
    const a = addUnit(s, 'horseman', 0, 0, 0, { fortified: true });
    addUnit(s, 'warrior', 1, 1, 0);
    attack(s, a.id, 1, 0);
    const after = s.units.find((u) => u.id === a.id);
    if (after) expect([after.movesLeft, after.fortified]).toEqual([0, false]);
  });

  it('units with 0 attack (Settlers) can’t attack, and other rules are enforced', () => {
    const s = makeState(['ggg']);
    const settler = addUnit(s, 'settler', 0, 0, 0);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    addUnit(s, 'warrior', 1, 1, 0);
    expect(attackError(s, settler, { x: 1, y: 0 })).toBe("A Settler can't attack");
    expect(attackError(s, w, { x: 2, y: 0 })).toBe('Move next to it first to attack');
    expect(attackError(s, w, { x: 0, y: 0 })).toBe('Move next to it first to attack');
    w.movesLeft = 0;
    expect(attackError(s, w, { x: 1, y: 0 })).toBe('No moves left');
    w.movesLeft = 1;
    s.currentPlayer = 1;
    expect(attackError(s, w, { x: 1, y: 0 })).toBe('Not your turn');
  });

  it('the winner becomes a veteran by chance (fixed seed, rate from data)', () => {
    let promoted = 0;
    const N = 400;
    for (let seed = 1; seed <= N; seed++) {
      const s = makeState(['gg']);
      const a = addUnit(s, 'legion', 0, 0, 0, { army: true, veteran: true });
      a.veteran = false; // 12 attack vs 1: nearly always wins
      addUnit(s, 'warrior', 1, 1, 0);
      s.rngState = seed * 7919;
      const res = attack(s, a.id, 1, 0);
      if (res.combat!.attackerWon && res.combat!.promoted) {
        promoted++;
        expect(s.units.find((u) => u.id === a.id)!.veteran).toBe(true);
      }
    }
    const rate = (promoted / N) * 100;
    expect(Math.abs(rate - RULES.combat.veteranChancePct)).toBeLessThan(10);
  });

  it('a unit that is already a veteran draws no promotion', () => {
    const s = makeState(['gg']);
    const a = addUnit(s, 'legion', 0, 0, 0, { army: true, veteran: true });
    addUnit(s, 'warrior', 1, 1, 0);
    s.rngState = 1;
    expect(attack(s, a.id, 1, 0).combat!.promoted).toBe(false);
  });

  it('tapping an adjacent enemy asks to attack; a far one is just a move', () => {
    const s = makeState(['gggg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    addUnit(s, 'warrior', 1, 1, 0);
    addUnit(s, 'warrior', 1, 3, 0);
    expect(resolveTap(s, 0, w.id, 1, 0)).toEqual({ kind: 'attack', unitId: w.id });
    expect(resolveTap(s, 0, w.id, 3, 0).kind).toBe('move');
  });
});

describe('combat events and fog', () => {
  it('a fight involving your unit always shows; others only when you can see the tile', () => {
    const s = makeState(['g'.repeat(20)], { players: 3 });
    addUnit(s, 'warrior', 0, 0, 0); // player 0 sees x 0..1 only
    const ai = addUnit(s, 'legion', 1, 1, 0);
    addUnit(s, 'warrior', 0, 2, 0); // player 0's unit, attacked
    const ai2 = addUnit(s, 'legion', 1, 15, 0);
    addUnit(s, 'warrior', 2, 16, 0); // far away, 1 vs 2
    addCity(s, 2, 19, 0); // so losing that warrior doesn't eliminate player 2
    s.currentPlayer = 1;
    const start = s.log.length;
    attack(s, ai.id, 2, 0);
    attack(s, ai2.id, 16, 0);
    const entries = s.log.slice(start);
    expect(entries.map((e) => e.other)).toEqual([0, 2]);
    // Remove everything of player 0 near x 2, so the tile might not even be visible any more.
    s.units = s.units.filter((u) => !(u.owner === 0 && u.x === 2));
    const shown = eventsVisibleTo(s, 0, entries);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.other).toBe(0);
  });
});

describe('fortify', () => {
  it('fortifying ends the turn; the unit stays fortified across turns until it moves', () => {
    const s = makeState(['ggg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    expect(applyAction(s, { type: 'fortify', unitId: w.id }).ok).toBe(true);
    expect([w.fortified, w.movesLeft]).toEqual([true, 0]);
    expect(applyAction(s, { type: 'fortify', unitId: w.id }).reason).toBe('Already fortified');
    applyAction(s, { type: 'endTurn' });
    expect(w.fortified).toBe(true);
    expect(w.movesLeft).toBe(1);
    expect(applyAction(s, { type: 'move', unitId: w.id, to: { x: 1, y: 0 } }).ok).toBe(true);
    expect(w.fortified).toBe(false);
  });

  it('settlers can’t fortify', () => {
    const s = makeState(['g']);
    const settler = addUnit(s, 'settler', 0, 0, 0);
    expect(applyAction(s, { type: 'fortify', unitId: settler.id }).ok).toBe(false);
  });
});

describe('armies', () => {
  it('forms only from 3 units of the same type on one tile', () => {
    const s = makeState(['ggg']);
    const a = addUnit(s, 'archer', 0, 0, 0);
    addUnit(s, 'archer', 0, 0, 0);
    expect(formArmyError(s, a)).toBe('Needs 3 Archer units on one tile');
    const other = addUnit(s, 'spearman', 0, 0, 0);
    expect(formArmyError(s, a)).toBe('Needs 3 Archer units on one tile');
    const far = addUnit(s, 'archer', 0, 1, 0);
    expect(formArmyError(s, a)).toBe('Needs 3 Archer units on one tile');
    far.x = 0;
    expect(formArmyError(s, a)).toBeUndefined();
    expect(formArmyError(s, other)).toBe('Needs 3 Spearman units on one tile');
    const settlers = [0, 1, 2].map(() => addUnit(s, 'settler', 0, 2, 0));
    expect(formArmyError(s, settlers[0]!)).toBe('A Settler can’t join an army');
  });

  it('an army is one unit with 3× attack and defense, veteran if any member was', () => {
    const s = makeState(['ggg']);
    const a = addUnit(s, 'archer', 0, 0, 0);
    addUnit(s, 'archer', 0, 0, 0, { veteran: true });
    addUnit(s, 'archer', 0, 0, 0, { movesLeft: 0 });
    expect(applyAction(s, { type: 'formArmy', unitId: a.id }).ok).toBe(true);
    expect(s.units).toHaveLength(1);
    expect(a).toMatchObject({ army: true, veteran: true, movesLeft: 0 });
    addUnit(s, 'warrior', 1, 1, 0);
    const odds = combatOdds(s, a, { x: 1, y: 0 })!;
    expect(odds.attack.base).toBe(UNITS.archer.attack * RULES.combat.armyMultiplier);
    expect(defenseStrength(s, a).base).toBe(UNITS.archer.defense * RULES.combat.armyMultiplier);
    expect(formArmyError(s, a)).toBe('Already an army');
  });

  it('a losing army is destroyed whole', () => {
    const s = makeState(['gh']);
    const a = addUnit(s, 'warrior', 0, 0, 0, { army: true }); // 3 attack
    addUnit(s, 'musketman', 1, 1, 0, { fortified: true, veteran: true }); // 6 × 2.5 = 15
    s.rngState = 12345; // first draw ≈ 0.98
    const res = attack(s, a.id, 1, 0);
    expect(res.combat!.attackerWon).toBe(false);
    expect(s.units.filter((u) => u.owner === 0)).toHaveLength(0);
  });
});

describe('capturing cities', () => {
  function setup() {
    const s = makeState(['gggg', 'gggg']);
    const target = addCity(s, 1, 2, 0, { name: 'Niani', size: 3, buildings: ['walls', 'library'], production: 17, capitalOf: 1 });
    addCity(s, 1, 3, 1, { name: 'Gao' }); // so player 1 survives
    const legion = addUnit(s, 'legion', 0, 1, 0);
    return { s, target, legion };
  }

  it('an undefended enemy city is taken by moving in', () => {
    const { s, target, legion } = setup();
    target.build = { kind: 'building', id: 'granary' };
    expect(applyAction(s, { type: 'move', unitId: legion.id, to: { x: 2, y: 0 } }).ok).toBe(true);
    expect(target.owner).toBe(0);
    expect(target.size).toBe(2);
    expect(target.buildings).toEqual(['library']); // Walls destroyed
    expect(target.production).toBe(0);
    expect(target.build).toBeNull();
    expect(target.capitalOf).toBe(1); // still marks whose capital it was
    expect([legion.x, legion.y]).toEqual([2, 0]);
    const last = s.log[s.log.length - 1]!;
    expect(last.text).toContain('capital');
    expect(last.other).toBe(1);
  });

  it('never below size 1, and a non-capital capture is a plain event', () => {
    const { s, legion } = setup();
    const gao = s.cities.find((c) => c.name === 'Gao')!;
    legion.x = 2;
    legion.y = 1;
    applyAction(s, { type: 'move', unitId: legion.id, to: { x: 3, y: 1 } });
    expect(gao.owner).toBe(0);
    expect(gao.size).toBe(1);
    expect(s.log[s.log.length - 1]!.text).not.toContain('capital');
  });

  it('a defended city can’t be entered; a settler can’t capture', () => {
    const { s, legion } = setup();
    const def = addUnit(s, 'warrior', 1, 2, 0);
    expect(applyAction(s, { type: 'move', unitId: legion.id, to: { x: 2, y: 0 } }).ok).toBe(false);
    s.units = s.units.filter((u) => u.id !== def.id);
    const settler = addUnit(s, 'settler', 0, 1, 0);
    expect(applyAction(s, { type: 'move', unitId: settler.id, to: { x: 2, y: 0 } }).ok).toBe(false);
  });

  it('the first city a civ founds is its capital', () => {
    const s = createGame({ seed: 9, playerCount: 2 });
    const settler = s.units.find((u) => u.owner === 0 && u.type === 'settler')!;
    applyAction(s, { type: 'foundCity', unitId: settler.id });
    expect(s.cities[0]!.capitalOf).toBe(0);
  });
});

describe('elimination', () => {
  it('a civ with no cities and no units is eliminated; your defeat stops the turn loop', () => {
    const s = makeState(['gggg']);
    addCity(s, 0, 2, 0);
    const ai = addUnit(s, 'legion', 1, 1, 0);
    addCity(s, 1, 0, 0); // the AI has a city of its own too
    s.currentPlayer = 1;
    expect(applyAction(s, { type: 'move', unitId: ai.id, to: { x: 2, y: 0 } }).ok).toBe(true);
    expect(s.players[0]!.alive).toBe(false);
    expect(s.log.map((e) => e.text).some((t) => t.includes('eliminated'))).toBe(true);
  });

  it('a civ with units but no cities is still alive', () => {
    const s = makeState(['ggg']);
    const w = addUnit(s, 'warrior', 1, 2, 0);
    const legion = addUnit(s, 'legion', 0, 0, 0, { army: true, veteran: true });
    addUnit(s, 'warrior', 1, 1, 0);
    s.rngState = 1;
    attack(s, legion.id, 1, 0);
    expect(s.players[1]!.alive).toBe(true);
    s.units = s.units.filter((u) => u.id !== w.id);
    addUnit(s, 'warrior', 1, 1, 0);
    legion.movesLeft = 1;
    attack(s, legion.id, 1, 0);
    expect(s.units.some((u) => u.owner === 1)).toBe(false);
    expect(s.players[1]!.alive).toBe(false);
  });

  it('every rival eliminated: only you are left alive (the UI shows Victory)', () => {
    const s = makeState(['ggggg'], { players: 3 });
    addCity(s, 0, 0, 0);
    const a = addUnit(s, 'legion', 0, 2, 0, { army: true, veteran: true });
    addUnit(s, 'warrior', 1, 1, 0);
    addUnit(s, 'warrior', 2, 3, 0);
    s.rngState = 1;
    attack(s, a.id, 1, 0);
    a.movesLeft = 1;
    attack(s, a.id, 3, 0);
    expect(s.players.map((p) => p.alive)).toEqual([true, false, false]);
    // Turns still run (only you are left).
    expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
    expect(s.currentPlayer).toBe(0);
  });

  it('eliminated civs are skipped in the turn order', () => {
    const s = makeState(['ggg'], { players: 3 });
    addCity(s, 0, 0, 0);
    addCity(s, 2, 2, 0);
    s.players[1]!.alive = false;
    const t = s.turn;
    applyAction(s, { type: 'endTurn' });
    expect(s.turn).toBe(t + 1);
    expect(s.currentPlayer).toBe(0);
  });
});

describe('Barracks', () => {
  it('units built in a city with Barracks start as veterans, and it counts in combat', () => {
    const s = makeState(['ggg', 'ggg', 'ggg']);
    const c = addCity(s, 0, 1, 1, { buildings: ['barracks'], build: { kind: 'unit', id: 'warrior' }, production: 50 });
    processCities(s, 0);
    const u = s.units.find((x) => x.owner === 0)!;
    expect(u.veteran).toBe(true);
    expect(defenseStrength(s, u).mods.map((m) => m.label)).toContain('Veteran');
    expect(c.buildings).toContain('barracks');
  });
});

describe('AI combat', () => {
  it('attacks only at or above the win-chance threshold', () => {
    // Legion (4) vs Warrior on grassland (1): 80% → attacks.
    const s = makeState(['ggg']);
    s.currentPlayer = 1;
    const l = addUnit(s, 'legion', 1, 0, 0);
    addUnit(s, 'warrior', 0, 1, 0);
    expect(tryCombat(s, l)).toBe(true);
    expect(l.movesLeft).toBe(0);

    // Warrior vs Warrior: 50% → holds back.
    const t = makeState(['ggg']);
    t.currentPlayer = 1;
    const w = addUnit(t, 'warrior', 1, 0, 0);
    addUnit(t, 'warrior', 0, 1, 0);
    expect(tryCombat(t, w)).toBe(false);
    expect(t.units).toHaveLength(2);
  });

  it('is exactly at the threshold boundary from data', () => {
    // Archer 3 vs Spearman 2 (on grassland, 3 × … no): use Horseman 2 vs Warrior 1 on forest (1.25): 61.5%.
    const s = makeState(['gf']);
    s.currentPlayer = 1;
    const h = addUnit(s, 'horseman', 1, 0, 0);
    addUnit(s, 'warrior', 0, 1, 0);
    const chance = combatOdds(s, h, { x: 1, y: 0 })!.chance * 100;
    expect(chance).toBeGreaterThanOrEqual(RULES.combat.aiAttackMinChancePct);
    expect(tryCombat(s, h)).toBe(true);
    // Horseman 2 vs Warrior on hills (1.5): 57% → no.
    const t = makeState(['gh']);
    t.currentPlayer = 1;
    const h2 = addUnit(t, 'horseman', 1, 0, 0);
    addUnit(t, 'warrior', 0, 1, 0);
    expect(tryCombat(t, h2)).toBe(false);
  });

  it('captures an undefended city next to it', () => {
    const s = makeState(['ggg']);
    s.currentPlayer = 1;
    const c = addCity(s, 0, 1, 0);
    addCity(s, 0, 2, 0, { name: 'Other' });
    const w = addUnit(s, 'warrior', 1, 0, 0);
    expect(tryCombat(s, w)).toBe(true);
    expect(c.owner).toBe(1);
  });

  it('never attacks with a settler, fortifies a lone city defender, and forms armies', () => {
    const s = makeState(['ggggg', 'ggggg', 'ggggg']);
    s.currentPlayer = 1;
    addCity(s, 1, 0, 0);
    const guard = addUnit(s, 'warrior', 1, 0, 0);
    addUnit(s, 'warrior', 1, 4, 2); // an explorer elsewhere
    const settler = addUnit(s, 'settler', 1, 2, 1);
    addUnit(s, 'warrior', 0, 3, 1);
    const trio = [0, 1, 2].map(() => addUnit(s, 'archer', 1, 4, 0));
    runAiTurn(s, 1);
    expect(guard.fortified).toBe(true);
    expect(s.units.find((u) => u.id === settler.id)).toBeDefined();
    expect(tryCombat(s, settler)).toBe(false);
    const armies = s.units.filter((u) => u.owner === 1 && u.army);
    expect(armies.map((u) => u.id)).toEqual([trio[0]!.id]);
  });

  it('a full 5-civ game with combat stays deterministic', () => {
    const play = () => {
      const s = createGame({ seed: 21, playerCount: 5 });
      for (let i = 0; i < 60; i++) applyAction(s, { type: 'endTurn' });
      return serializeGame(s, 0);
    };
    expect(play()).toBe(play());
  });
});

describe('saves from Milestone 3', () => {
  function m3Save() {
    const s = createGame({ seed: 5, playerCount: 3 });
    for (const p of [0, 1, 2]) {
      s.currentPlayer = p;
      const settler = s.units.find((u) => u.owner === p && u.type === 'settler')!;
      applyAction(s, { type: 'foundCity', unitId: settler.id });
    }
    s.currentPlayer = 0;
    const raw = JSON.parse(serializeGame(s, 7));
    raw.saveVersion = 3;
    raw.state.version = 3;
    delete raw.state.atWar;
    for (const u of raw.state.units) {
      delete u.fortified;
      delete u.army;
    }
    for (const c of raw.state.cities) delete c.capitalOf;
    // A second, later city for player 0: not the capital.
    raw.state.cities.push({ ...raw.state.cities[0], id: 999, name: 'Later', foundedTurn: 20, x: 0, y: 0 });
    return raw;
  }

  it('migrates v3 → v4: flags off, all at war, first cities become capitals', () => {
    const res = deserializeGame(JSON.stringify(m3Save()));
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.migratedFrom).toBe(3);
    const s = res.state;
    expect(s.version).toBe(STATE_VERSION);
    expect(s.units.every((u) => u.fortified === false && u.army === false)).toBe(true);
    expect(atWar(s, 0, 1) && atWar(s, 1, 2) && !atWar(s, 1, 1)).toBe(true);
    for (const p of [0, 1, 2]) {
      const caps = s.cities.filter((c) => c.capitalOf === p);
      expect(caps).toHaveLength(1);
      expect(caps[0]!.owner).toBe(p);
    }
    expect(s.cities.find((c) => c.id === 999)!.capitalOf).toBeNull();
    // It plays on.
    for (let i = 0; i < 3; i++) expect(applyAction(s, { type: 'endTurn' }).ok).toBe(true);
  });
});
