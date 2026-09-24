// Icons: every unit (land, sea, and air) and every map thing (village, hut, barbarian badge,
// artifact, resources, Great People) has an icon file in src/assets/icons/, bundled into the
// game; every used icon is credited (the CC BY 3.0 license requires it) in data and in
// CREDITS.md; no two things share an icon; and nothing unused is credited. Ships got theirs
// from Dan's round 8 picks (the Carrier's is modified); aircraft and the map icons in round 10.

import { describe, expect, it } from 'vitest';
import { ICON_CREDITS, MAP_ICONS, usedIcons } from '../src/data/icons';
import { GREAT_PEOPLE, GREAT_PERSON_KINDS } from '../src/data/greatPeople';
import { RESOURCES, RESOURCE_IDS } from '../src/data/resources';
import { UNITS, UNIT_IDS } from '../src/data/units';
import credits from '../CREDITS.md?raw';

// The bundled files, read the same way the game reads them (as text, through Vite).
const FILES = import.meta.glob<string>('../src/assets/icons/*.svg', { query: '?raw', import: 'default', eager: true });

const USED = usedIcons();

describe('icons', () => {
  it('every unit, ships and aircraft included, has an icon', () => {
    for (const id of UNIT_IDS) expect(UNITS[id].icon, id).toBeDefined();
  });

  it('every resource, Great Person, and map feature has an icon', () => {
    for (const id of RESOURCE_IDS) expect(RESOURCES[id].icon, id).toBeTruthy();
    for (const k of GREAT_PERSON_KINDS) expect(GREAT_PEOPLE[k].icon, k).toBeTruthy();
    for (const icon of Object.values(MAP_ICONS)) expect(icon).toBeTruthy();
    // 24 units + 5 aircraft, and Dan's 24 map picks.
    expect(USED.filter((u) => u.group === 'Units')).toHaveLength(29);
    expect(USED.filter((u) => u.group === 'Map')).toHaveLength(24);
  });

  it.each(USED.map((u) => [u.name, u.icon] as const))('%s has a bundled, credited icon (%s)', (name, icon) => {
    const file = `../src/assets/icons/${icon}.svg`;
    const svg = FILES[file];
    expect(svg, file).toBeDefined();
    // One shape, colored by whoever draws it (the map picks the color, the panels use CSS).
    expect(svg!).toContain('fill="currentColor"');
    // Nothing loads from the web.
    expect(svg!).not.toMatch(/href="https?:/);
    const credit = ICON_CREDITS[icon];
    expect(credit, `credit for ${icon}`).toBeDefined();
    expect(credits).toContain(credit!.url);
    expect(credits).toContain(`| ${name} | ${credit!.title} | ${credit!.author} |`);
  });

  it('everything looks different: no icon is used twice', () => {
    const icons = USED.map((u) => u.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('only used icons are credited, and every bundled file is used', () => {
    const used = new Set(USED.map((u) => u.icon));
    expect(Object.keys(ICON_CREDITS).filter((k) => !used.has(k))).toEqual([]);
    const bundled = Object.keys(FILES).map((f) => f.replace(/^.*\/(.+)\.svg$/, '$1'));
    expect(bundled.filter((k) => !used.has(k))).toEqual([]);
  });

  it('credits every new author from rounds 9 and 10', () => {
    for (const author of ['Willdabeast', 'Guard13007', 'Lord Berandas', 'Quoting', 'Skoll']) {
      expect(Object.values(ICON_CREDITS).some((c) => c.author === author), author).toBe(true);
      expect(credits).toContain(`| ${author} |`);
    }
  });
});
