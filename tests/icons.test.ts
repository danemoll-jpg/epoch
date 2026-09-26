// Icons: every unit (land, sea, and air) and every map thing (village, hut, barbarian badge,
// artifact, resources, Great People) has an icon file in src/assets/icons/, bundled into the
// game; every used icon is credited (the CC BY 3.0 license requires it) in data and in
// CREDITS.md; no two things share an icon; and nothing unused is credited. Ships got theirs
// from Dan's round 8 picks (the Carrier's is modified); aircraft and the map icons in round 10.

import { describe, expect, it } from 'vitest';
import { ICON_CREDITS, MAP_ICONS, TECH_ICONS, usedIcons } from '../src/data/icons';
import { TECH_LIST } from '../src/data/techs';
import { WONDER_LIST } from '../src/data/wonders';
import { GREAT_PEOPLE, GREAT_PERSON_KINDS } from '../src/data/greatPeople';
import { RESOURCES, RESOURCE_IDS } from '../src/data/resources';
import { UNITS, UNIT_IDS } from '../src/data/units';
import { RELIGION_SYMBOLS } from '../src/data/religion';
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
    // 24 units + 5 aircraft + the Missionary, and Dan's 24 map picks + the holy city and 8 religion symbols (Round 12).
    expect(USED.filter((u) => u.group === 'Units')).toHaveLength(30);
    expect(USED.filter((u) => u.group === 'Map')).toHaveLength(33);
    for (const r of RELIGION_SYMBOLS) expect(r.icon, r.id).toBeTruthy();
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
    const onMap = USED.filter((u) => u.group !== 'Buildings').map((u) => u.icon);
    expect(new Set(onMap).size).toBe(onMap.length);
    const built = USED.filter((u) => u.group === 'Buildings').map((u) => u.icon);
    expect(new Set(built).size).toBe(built.length);
    // And none of them repeats a map icon (Dan swapped the Grand Workshop off Iron's anvil).
    expect(built.filter((i) => onMap.includes(i))).toEqual([]);
  });

  it('every building and wonder has an icon (Round 14)', () => {
    expect(USED.filter((u) => u.group === 'Buildings')).toHaveLength(17 + WONDER_LIST.length + 1);
  });

  it('every technology has its own icon, unlike anything else in the game (Round 17)', () => {
    const techs = USED.filter((u) => u.group === 'Techs');
    expect(techs).toHaveLength(56);
    for (const t of TECH_LIST) expect(TECH_ICONS[t.id], t.id).toBeTruthy();
    const icons = techs.map((u) => u.icon);
    expect(new Set(icons).size).toBe(icons.length);
    const others = USED.filter((u) => u.group !== 'Techs').map((u) => u.icon);
    expect(icons.filter((i) => others.includes(i))).toEqual([]);
    expect(credits).toContain('## Technology icons');
  });

  it('only used icons are credited, and every bundled file is used', () => {
    const used = new Set(USED.map((u) => u.icon));
    expect(Object.keys(ICON_CREDITS).filter((k) => !used.has(k))).toEqual([]);
    const bundled = Object.keys(FILES).map((f) => f.replace(/^.*\/(.+)\.svg$/, '$1'));
    expect(bundled.filter((k) => !used.has(k))).toEqual([]);
  });

  it('credits every new author from rounds 9, 10, and 12', () => {
    for (const author of ['Willdabeast', 'Guard13007', 'Lord Berandas', 'Quoting', 'Skoll', 'Carl Olsen']) {
      expect(Object.values(ICON_CREDITS).some((c) => c.author === author), author).toBe(true);
      expect(credits).toContain(`| ${author} |`);
    }
  });
});
