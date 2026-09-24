// What's on a tile (Round 6, Dan's feedback: a mixed stack looked like one unit type, so he
// couldn't tell why Form Army wasn't offered). Pure helpers shared by the map and the unit
// panel; unit-tested.

import { UNITS, type UnitTypeId } from '../data/units';
import { formArmyError } from './combat';
import type { GameState, Unit } from './types';

/** The unit types on a tile, each once, in the order they first appear. */
export function stackTypes(units: Unit[]): UnitTypeId[] {
  return [...new Set(units.map((u) => u.type))];
}

/** More than one unit type on the tile. */
export function isMixedStack(units: Unit[]): boolean {
  return stackTypes(units).length > 1;
}

/**
 * A unit of a different type from `shown`, to peek out behind it on the map. The strongest
 * other defender (then the oldest), so it's the unit most worth knowing about.
 */
export function behindUnit(units: Unit[], shown: Unit): Unit | undefined {
  const others = units.filter((u) => u.type !== shown.type);
  if (others.length === 0) return undefined;
  return [...others].sort((a, b) => UNITS[b.type].defense - UNITS[a.type].defense || a.id - b.id)[0];
}

/** "3 Legions, 1 Archer, 1 Legion army": every kind on the tile with its count. */
export function stackLabel(units: Unit[]): string {
  const kinds: { name: string; n: number }[] = [];
  for (const u of units) {
    const name = `${UNITS[u.type].name}${u.army ? ' army' : ''}`;
    const k = kinds.find((x) => x.name === name);
    if (k) k.n++;
    else kinds.push({ name, n: 1 });
  }
  return kinds.map((k) => `${k.n} ${k.n === 1 ? k.name : k.name.endsWith(' army') ? k.name.replace(/ army$/, ' armies') : `${k.name}s`}`).join(', ');
}

/** One unit per type that could form an army right now (any type on the tile, not just the selected one). */
export function armyCandidates(state: GameState, units: Unit[]): Unit[] {
  const seen = new Set<UnitTypeId>();
  const out: Unit[] = [];
  for (const u of units) {
    if (seen.has(u.type) || formArmyError(state, u) !== undefined) continue;
    seen.add(u.type);
    out.push(u);
  }
  return out;
}

/** Every unit on the tile (anyone's), oldest first. */
export function unitsOnTile(state: GameState, x: number, y: number): Unit[] {
  return state.units.filter((u) => u.x === x && u.y === y).sort((a, b) => a.id - b.id);
}
