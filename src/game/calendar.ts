// Round 23 (item 3): turn → calendar year. Pure; the pace is in src/data/calendar.ts.

import { CALENDAR } from '../data/calendar';

/**
 * The year of `turn`, negative for BC. There is no year 0: the year that would be 0 is shown as
 * 1 AD (so 50 BC is followed by 1 AD, then 50 AD).
 */
export function yearOf(turn: number): number {
  let year = CALENDAR.startYear;
  const stages = CALENDAR.stages;
  for (let i = 0; i < stages.length; i++) {
    const from = stages[i]!.fromTurn;
    const to = stages[i + 1]?.fromTurn ?? Infinity;
    if (turn <= from) break;
    year += (Math.min(turn, to) - from) * stages[i]!.years;
  }
  return year === 0 ? 1 : year;
}

/** "4000 BC", "1 AD", "1854 AD". */
export function yearText(turn: number): string {
  const y = yearOf(turn);
  return y < 0 ? `${-y} BC` : `${y} AD`;
}

/** "Turn 232 · 1854 AD" (or "turn 232 · 1854 AD" with `lower`). */
export function turnYearText(turn: number, lower = false): string {
  return `${lower ? 'turn' : 'Turn'} ${turn} · ${yearText(turn)}`;
}
