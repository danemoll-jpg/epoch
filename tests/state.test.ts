import { describe, expect, it } from 'vitest';
import { RULES } from '../src/data/rules';
import { applyAction } from '../src/game/actions';
import { createGame } from '../src/game/newGame';

describe('game state', () => {
  it('survives a JSON round-trip unchanged', () => {
    const state = createGame({ seed: 42 });
    const copy = JSON.parse(JSON.stringify(state));
    expect(copy).toEqual(state);
  });

  it('still round-trips after play (cities, log, moved units)', () => {
    const state = createGame({ seed: 7 });
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'settler')!;
    applyAction(state, { type: 'foundCity', unitId: settler.id });
    applyAction(state, { type: 'endTurn' });
    applyAction(state, { type: 'endTurn' });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('a round-tripped game plays on identically to the original', () => {
    const a = createGame({ seed: 99 });
    const b = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 5; i++) {
      applyAction(a, { type: 'endTurn' });
      applyAction(b, { type: 'endTurn' });
    }
    expect(b).toEqual(a);
  });

  it('supports the full 5-player game (1 human, 4 AI)', () => {
    const state = createGame({ seed: 3, playerCount: RULES.maxPlayers });
    // Plus the barbarians (Round 9), always last.
    expect(state.players).toHaveLength(6);
    expect(state.players[5]!.kind).toBe('barbarian');
    expect(state.players.filter((p) => p.kind === 'human')).toHaveLength(1);
    expect(state.players.filter((p) => p.kind === 'ai')).toHaveLength(4);
    expect(new Set(state.players.map((p) => p.civId)).size).toBe(6);
    for (const p of state.players.filter((q) => q.kind !== 'barbarian')) {
      expect(state.units.filter((u) => u.owner === p.id).map((u) => u.type).sort()).toEqual(['settler', 'warrior']);
    }
  });

  it('a new game has 5 civs by default (Milestone 5)', () => {
    expect(RULES.defaultPlayers).toBe(5);
    const civs = (s: ReturnType<typeof createGame>) => s.players.filter((p) => p.kind !== 'barbarian');
    expect(civs(createGame({ seed: 5 }))).toHaveLength(5);
    expect(civs(createGame({ seed: 5, playerCount: 2 }))).toHaveLength(2);
  });

  it('rejects more players than the game supports', () => {
    expect(() => createGame({ seed: 1, playerCount: 6 })).toThrow();
  });
});
