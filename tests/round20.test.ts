// Round 20 (item 8): a city held only by ships in port can be captured by land units, the AI
// does so too, and aircraft can strike the ships in port.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game/actions';
import { tryCombat } from '../src/game/ai';
import { attackError, pickDefender } from '../src/game/combat';
import { resolveTap } from '../src/ui/tap';
import { addCity, addUnit, makeState } from './helpers';

// Land on the left (x 0..2), sea on the right: the city at (2, 1) is a port.
function portState() {
  const state = makeState(['gggooo', 'gggooo', 'gggooo']);
  state.players[0]!.techs.push('flight');
  const city = addCity(state, 1, 2, 1, { name: 'Metz' });
  addCity(state, 1, 0, 0, { name: 'Paris', capitalOf: 1 });
  addUnit(state, 'warrior', 1, 0, 0);
  const ship = addUnit(state, 'destroyer', 1, 2, 1);
  const cargo = addUnit(state, 'warrior', 1, 2, 1, { carriedBy: ship.id });
  return { state, city, ship, cargo };
}

describe('Round 20 item 8: a city held only by ships', () => {
  it('ships in port are not a defender for land units, so the tap is a capture', () => {
    const { state, city } = portState();
    const tank = addUnit(state, 'tank', 0, 1, 1);
    expect(pickDefender(state, city, 0, tank)).toBeUndefined();
    expect(resolveTap(state, 0, tank.id, 2, 1)).toEqual({ kind: 'capture', unitId: tank.id, cityId: city.id });
  });

  it('with a land defender there, the tap is still an attack', () => {
    const { state, city } = portState();
    addUnit(state, 'warrior', 1, 2, 1);
    const tank = addUnit(state, 'tank', 0, 1, 1);
    expect(resolveTap(state, 0, tank.id, city.x, city.y)).toEqual({ kind: 'attack', unitId: tank.id });
  });

  it('walking in captures it and sinks the ships with their cargo', () => {
    const { state, city, ship, cargo } = portState();
    const tank = addUnit(state, 'tank', 0, 1, 1);
    expect(applyAction(state, { type: 'move', unitId: tank.id, to: { x: 2, y: 1 } }).ok).toBe(true);
    expect(city.owner).toBe(0);
    expect(state.units.some((u) => u.id === ship.id || u.id === cargo.id)).toBe(false);
  });

  it('the AI captures such a city too', () => {
    const { state, city } = portState();
    // Swap sides: the city is player 0's, the AI (player 1) has a Tank next to it.
    city.owner = 0;
    for (const u of state.units.filter((u) => u.x === 2 && u.y === 1)) u.owner = 0;
    const tank = addUnit(state, 'tank', 1, 1, 1);
    state.currentPlayer = 1;
    expect(tryCombat(state, tank)).toBe(true);
    expect(city.owner).toBe(1);
  });

  it('a Bomber can strike a ship in port; a land defender still comes first', () => {
    const { state, city, ship } = portState();
    const bomber = addUnit(state, 'bomber', 0, 0, 2);
    addUnit(state, 'warrior', 0, 1, 2); // eyes on Metz
    expect(attackError(state, bomber, city)).toBeUndefined();
    expect(pickDefender(state, city, 0, bomber)?.id).toBe(ship.id);
    const guard = addUnit(state, 'musketman', 1, 2, 1);
    expect(pickDefender(state, city, 0, bomber)?.id).toBe(guard.id);
  });
});
