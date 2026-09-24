// Unit icons (Round 7): every unit has an icon file in src/assets/icons/, every used icon is
// credited (the CC BY 3.0 license requires it) in data and in CREDITS.md, and no two unit
// types share an icon.

import { describe, expect, it } from 'vitest';
import { ICON_CREDITS } from '../src/data/icons';
import { UNITS, UNIT_IDS } from '../src/data/units';
import credits from '../CREDITS.md?raw';

// The bundled files, read the same way the game reads them (as text, through Vite).
const FILES = import.meta.glob<string>('../src/assets/icons/*.svg', { query: '?raw', import: 'default', eager: true });

describe('unit icons', () => {
  it.each(UNIT_IDS)('%s has a bundled, credited icon', (id) => {
    const icon = UNITS[id].icon;
    const file = `../src/assets/icons/${icon}.svg`;
    const svg = FILES[file];
    expect(svg, file).toBeDefined();
    // One shape, colored by whoever draws it (the map picks white, the panels use CSS).
    expect(svg!).toContain('fill="currentColor"');
    // Nothing loads from the web.
    expect(svg!).not.toMatch(/href="https?:/);
    const credit = ICON_CREDITS[icon];
    expect(credit, `credit for ${icon}`).toBeDefined();
    expect(credits).toContain(credit!.url);
    expect(credits).toContain(`| ${UNITS[id].name} | ${credit!.title} | ${credit!.author} |`);
  });

  it('every unit type looks different', () => {
    const icons = UNIT_IDS.map((id) => UNITS[id].icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('only used icons are credited', () => {
    const used = new Set(UNIT_IDS.map((id) => UNITS[id].icon));
    expect(Object.keys(ICON_CREDITS).filter((k) => !used.has(k))).toEqual([]);
  });
});
