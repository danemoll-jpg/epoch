// Small text helpers shared by the panels (Round 13: pulled out of app.ts so the Almanac and
// How to Play use the same wording).

import { RELIGION } from '../data/religion';
import { UNITS, type UnitTypeId } from '../data/units';

export function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** A unit's stats and special abilities in one line (build list, tech screen, Almanac). */
export function unitSummary(id: string): string {
  const def = UNITS[id as UnitTypeId];
  if (!def) return '';
  const parts = [`attack ${def.attack} · defense ${def.defense} · moves ${def.moves}`];
  if (def.domain === 'sea') {
    parts.push(def.cargo ? `ship, carries ${def.cargo}` : 'ship');
    if (def.coastOnly) parts.push('coast only');
    if (def.stealth) parts.push('seen only from next to it');
  }
  if (def.domain === 'air') {
    parts[0] = `attack ${def.attack} · defense ${def.defense}`;
    parts.push(`aircraft · range ${def.range}`);
    if (def.airAttack) parts.push(`${def.airAttack} vs aircraft, intercepts`);
    if (def.evadePct) parts.push('hard to intercept');
    parts.push('strikes and flies back to base');
  }
  if (def.hover) parts.push('flies over anything, can’t capture');
  if (def.airCargo) parts.push(`carries ${def.airCargo} aircraft`);
  if (def.canFoundCity) parts.push('founds a city');
  if (def.popCost > 0) parts.push(`costs ${def.popCost} population`);
  // Round 12: the Missionary can't fight.
  if (def.spreadsReligion) {
    parts[0] = `moves ${def.moves}`;
    parts.push(`spreads this city’s religion ${RELIGION.missionaryCharges} times · can’t fight`);
  }
  return parts.join(' · ');
}
