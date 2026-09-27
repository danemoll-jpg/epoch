// Round 22: fixes from Dan's playtest (2026-09-26/27).

import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game/actions';
import { tileOwner } from '../src/game/borders';
import { aiUpgrade, upgradableUnits, upgradeError } from '../src/game/upgrades';
import { addCity, addUnit, makeState } from './helpers';

// ---- item 1: upgrades anywhere inside your borders ------------------------------------------

describe('Round 22 item 1: upgrades inside your borders', () => {
  // Your city Ur at (2, 1) on the coast (column 0 is water), a rival's Taxila at (7, 1).
  function coast() {
    const s = makeState(['cgggggggg', 'cgggggggg', 'cgggggggg']);
    addCity(s, 0, 2, 1, { name: 'Ur' });
    addCity(s, 1, 7, 1, { name: 'Taxila' });
    const p = s.players[0]!;
    p.techs = ['bronze_working', 'map_making', 'seafaring', 'astronomy', 'navigation'];
    p.gold = 500;
    return s;
  }

  it('borders reach the water next to the coast', () => {
    const s = coast();
    expect(tileOwner(s, 1, 1)).toBe(0);
    expect(s.map.tiles[1 * 9 + 1]!.terrain).toBe('grassland');
    // Column 0 is two tiles from Ur: outside radius 1 until the city grows its borders.
    s.cities[0]!.culture = 25;
    expect(tileOwner(s, 0, 1)).toBe(0);
    expect(s.map.tiles[1 * 9 + 0]!.terrain).toBe('coast');
  });

  it('a land unit in the field inside your borders upgrades there', () => {
    const s = coast();
    const w = addUnit(s, 'warrior', 0, 3, 2);
    expect(upgradeError(s, w)).toBeUndefined();
    expect(applyAction(s, { type: 'upgrade', unitId: w.id }).ok).toBe(true);
    expect(w.type).toBe('spearman');
  });

  it('a ship at sea inside your borders upgrades there; one outside can\'t', () => {
    const s = coast();
    s.cities[0]!.culture = 25;
    const g = addUnit(s, 'galley', 0, 0, 1);
    expect(upgradeError(s, g)).toBeUndefined();
    const far = addUnit(s, 'galley', 0, 0, 2);
    s.cities[0]!.culture = 0;
    expect(upgradeError(s, far)).toBe('Only inside your borders');
    s.cities[0]!.culture = 25;
    expect(applyAction(s, { type: 'upgrade', unitId: g.id }).ok).toBe(true);
    expect(g.type).toBe('caravel');
  });

  it('not in a rival\'s borders or neutral land, not aboard a ship; cargo and moves still checked', () => {
    const s = coast();
    expect(upgradeError(s, addUnit(s, 'warrior', 0, 6, 1))).toBe('Only inside your borders');
    expect(upgradeError(s, addUnit(s, 'warrior', 0, 4, 1))).toBe('Only inside your borders');
    s.cities[0]!.culture = 25;
    const g = addUnit(s, 'galley', 0, 0, 1);
    const aboard = addUnit(s, 'warrior', 0, 0, 1, { carriedBy: g.id });
    expect(upgradeError(s, aboard)).toBe('Not while aboard a ship');
    expect(upgradeError(s, addUnit(s, 'warrior', 0, 3, 1, { movesLeft: 0 }))).toBe('It has already used its turn');
    s.players[0]!.techs.push('magnetism', 'iron_working', 'steam_engine', 'industrialization');
    const f = addUnit(s, 'frigate', 0, 0, 0);
    for (let i = 0; i < 3; i++) addUnit(s, 'warrior', 0, 0, 0, { carriedBy: f.id });
    s.map.tiles[0]!.terrain = 'coast';
    expect(upgradeError(s, f)).toBe('Unload its cargo first');
  });

  it('Upgrade all and the AI see units anywhere in their borders', () => {
    const s = coast();
    const w = addUnit(s, 'warrior', 0, 3, 2);
    addUnit(s, 'warrior', 0, 5, 1); // outside
    expect(upgradableUnits(s, 0).map((x) => x.unit.id)).toEqual([w.id]);
    const ai = addUnit(s, 'warrior', 1, 6, 2);
    s.players[1]!.techs = ['bronze_working'];
    s.players[1]!.gold = 100;
    s.currentPlayer = 1;
    expect(aiUpgrade(s, 1, 0)).toBe(1);
    expect(ai.type).toBe('spearman');
  });
});
