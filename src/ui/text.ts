// Small text helpers shared by the panels (Round 13: pulled out of app.ts so the Almanac and
// How to Play use the same wording).

import { TECH_ICONS } from '../data/icons';
import { RELIGION } from '../data/religion';
import { TECH_LIST, type TechId } from '../data/techs';
import { iconHtml } from '../render/icons';
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
  // Round 19: a Spy.
  if (def.spy) parts.push('unseen by rivals · investigate, steal, sabotage, incite · used up when it acts');
  if (def.domain === 'air') {
    parts[0] = `attack ${def.attack} · defense ${def.defense}`;
    parts.push(`aircraft · range ${def.range}`);
    if (def.airAttack) parts.push(`${def.airAttack} vs aircraft, intercepts`);
    if (def.evadePct) parts.push('hard to intercept');
    parts.push('strikes and flies back to base');
    if (def.recon) parts.push(`scouts a tile in range (sees ${def.sight} around it)`);
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

/** Round 17: a tech's icon (Dan's picks), inline, sized by `cls` in CSS. */
export function techIconHtml(tech: TechId, cls = 'ticon'): string {
  return iconHtml(TECH_ICONS[tech], '', cls);
}

// Longest names first, so "learned Advanced Flight" isn't read as Flight.
const BY_LENGTH = [...TECH_LIST].sort((a, b) => b.name.length - a.name.length);

/**
 * Round 17: the tech a news line says was learned ("Learned Writing", "Traded with …: learned
 * Writing", "… from the hut"), for its icon beside the message; undefined for other news.
 */
export function learnedTech(text: string): TechId | undefined {
  return BY_LENGTH.find((t) => text.includes(`earned ${t.name}`))?.id;
}
