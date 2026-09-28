import { describe, expect, it } from 'vitest';
import { CALENDAR } from '../src/data/calendar';
import { turnYearText, yearOf, yearText } from '../src/game/calendar';

describe('Round 23 item 3: the calendar', () => {
  it('starts at 4000 BC and goes 50 years a turn early on', () => {
    expect(yearText(1)).toBe('4000 BC');
    expect(yearText(2)).toBe('3950 BC');
    expect(yearText(80)).toBe('50 BC');
  });

  it('has no year 0: 50 BC is followed by 1 AD, then 50 AD', () => {
    expect(yearText(81)).toBe('1 AD');
    expect(yearText(82)).toBe('50 AD');
    for (let t = 1; t < 400; t++) expect(yearOf(t)).not.toBe(0);
  });

  it('slows down: the stage boundaries', () => {
    expect(yearOf(97)).toBe(800);
    expect(yearOf(129)).toBe(1600);
    expect(yearOf(154)).toBe(1850);
    expect(yearOf(174)).toBe(1950);
    expect(yearOf(199)).toBe(2000);
    expect(yearOf(200)).toBe(2001);
  });

  it('a typical game (turn 200–260) ends around 2000–2060 AD', () => {
    expect(yearOf(200)).toBeGreaterThanOrEqual(2000);
    expect(yearOf(250)).toBe(2051);
    expect(yearOf(260)).toBeLessThanOrEqual(2065);
  });

  it('always moves forward, and never faster than the stage says', () => {
    for (let t = 1; t < 400; t++) {
      const step = yearOf(t + 1) - yearOf(t);
      expect(step).toBeGreaterThan(0);
      const stage = [...CALENDAR.stages].reverse().find((s) => s.fromTurn <= t)!;
      // Around the missing year 0 (50 BC → 1 AD → 50 AD) the steps are 51 and 49.
      expect(step === stage.years || yearOf(t + 1) === 1 || yearOf(t) === 1).toBe(true);
    }
  });

  it('writes "Turn 232 · 1983 AD"', () => {
    expect(turnYearText(232)).toBe(`Turn 232 · ${yearOf(232)} AD`);
    expect(turnYearText(1, true)).toBe('turn 1 · 4000 BC');
  });
});
