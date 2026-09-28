// Round 23 (item 3): the made-up calendar shown next to the turn number. Tied to the turn, not
// the eras, and the same on every map size (the sim matrix's median game ends between turn 196
// and 210 on all of them). Starts at 4000 BC and slows down: a typical game (turn 200–260) ends
// around 2000–2060 AD, and the Modern era (median turn 200) runs a year a turn.

export interface CalendarStage {
  /** The first turn this pace applies from (it moves the year from this turn to the next). */
  fromTurn: number;
  /** Years per turn. */
  years: number;
}

export const CALENDAR = {
  /** Turn 1's year (negative = BC). */
  startYear: -4000,
  /** In order of `fromTurn`; the first starts at turn 1. */
  stages: [
    { fromTurn: 1, years: 50 }, // 4000 BC → 800 AD at turn 97
    { fromTurn: 97, years: 25 }, // → 1600 AD at turn 129
    { fromTurn: 129, years: 10 }, // → 1850 AD at turn 154
    { fromTurn: 154, years: 5 }, // → 1950 AD at turn 174
    { fromTurn: 174, years: 2 }, // → 2000 AD at turn 199
    { fromTurn: 199, years: 1 }, // → 2051 AD at turn 250
  ] as CalendarStage[],
};
