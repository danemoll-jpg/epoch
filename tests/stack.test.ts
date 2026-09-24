// Round 6: what's on a tile (mixed stacks), for the map's second disc and the unit panel.

import { describe, expect, it } from 'vitest';
import { armyCandidates, behindUnit, isMixedStack, stackLabel, stackTypes, unitsOnTile } from '../src/game/stack';
import { addUnit, makeState } from './helpers';

describe('stacks', () => {
  it('one type is not mixed; two types are', () => {
    const s = makeState(['ggg']);
    addUnit(s, 'legion', 0, 1, 0);
    addUnit(s, 'legion', 0, 1, 0);
    expect(isMixedStack(unitsOnTile(s, 1, 0))).toBe(false);
    expect(behindUnit(unitsOnTile(s, 1, 0), unitsOnTile(s, 1, 0)[0]!)).toBeUndefined();
    addUnit(s, 'archer', 0, 1, 0);
    const units = unitsOnTile(s, 1, 0);
    expect(isMixedStack(units)).toBe(true);
    expect(stackTypes(units)).toEqual(['legion', 'archer']);
    expect(stackLabel(units)).toBe('2 Legions, 1 Archer');
    units[0]!.army = true;
    expect(stackLabel(units)).toBe('1 Legion army, 1 Legion, 1 Archer');
  });

  it('the unit behind is another type: the strongest defender, then the oldest', () => {
    const s = makeState(['ggg']);
    const w = addUnit(s, 'warrior', 0, 0, 0);
    const a = addUnit(s, 'archer', 0, 0, 0);
    const sp = addUnit(s, 'spearman', 0, 0, 0);
    addUnit(s, 'spearman', 0, 0, 0);
    const units = unitsOnTile(s, 0, 0);
    expect(behindUnit(units, w)?.id).toBe(sp.id);
    // Behind a Spearman: the Archer (defense 2) over the Warrior (defense 1).
    expect(behindUnit(units, sp)?.id).toBe(a.id);
  });

  it('Form Army is offered for every type with three on the tile, whichever unit is selected', () => {
    const s = makeState(['ggg']);
    addUnit(s, 'warrior', 0, 0, 0);
    for (let i = 0; i < 3; i++) addUnit(s, 'legion', 0, 0, 0);
    for (let i = 0; i < 3; i++) addUnit(s, 'archer', 0, 0, 0);
    addUnit(s, 'settler', 0, 0, 0);
    const types = armyCandidates(s, unitsOnTile(s, 0, 0)).map((u) => u.type);
    expect(types).toEqual(['legion', 'archer']);
  });

  it("only the tile's units count, anyone's, oldest first", () => {
    const s = makeState(['ggg']);
    const b = addUnit(s, 'warrior', 1, 1, 0);
    const a = addUnit(s, 'warrior', 0, 1, 0);
    addUnit(s, 'warrior', 0, 2, 0);
    expect(unitsOnTile(s, 1, 0).map((u) => u.id)).toEqual([b.id, a.id]);
  });
});
