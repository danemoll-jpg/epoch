// The Almanac (Round 13, C2): a searchable card for every unit, building, wonder, project,
// tech, resource, Great Person, leader, difficulty level, and map size. Every card is made
// from the data files, so it can't go out of date. Names on a card that have cards of their
// own are links (`data-card`), and the build list and tech screen open cards the same way.

import { BUILDINGS, BUILDING_IDS } from '../data/buildings';
import { PLAYABLE_CIVS } from '../data/civs';
import { DIFFICULTIES, DIFFICULTY_IDS } from '../data/difficulty';
import { GREAT_PEOPLE, GREAT_PERSON_KINDS, GREAT_PEOPLE_RULES } from '../data/greatPeople';
import { MAP_SIZES, MAP_SIZE_IDS, victoryGoals } from '../data/mapSizes';
import { FOUNDING_TECHS } from '../data/religion';
import { RESOURCES, RESOURCE_IDS } from '../data/resources';
import { ERAS, TECHS, TECH_LIST, type TechId } from '../data/techs';
import { TERRAIN } from '../data/terrain';
import { UNITS, UNIT_IDS } from '../data/units';
import { PROJECTS, PROJECT_IDS, VICTORY_NAMES } from '../data/victory';
import { WONDER_LIST } from '../data/wonders';
import { bonusText } from '../game/resources';
import { techLeadsTo, techUnlocks } from '../game/tech';
import { iconHtml, unitIconHtml } from '../render/icons';
import { portraitHtml } from './portraits';
import { bonusListHtml } from './setup';
import { esc, unitSummary } from './text';

export type AlmanacCategory = 'unit' | 'building' | 'wonder' | 'project' | 'tech' | 'resource' | 'greatPerson' | 'leader' | 'difficulty' | 'mapSize';

export const ALMANAC_CATEGORIES: { id: AlmanacCategory; name: string }[] = [
  { id: 'unit', name: 'Units' },
  { id: 'building', name: 'Buildings' },
  { id: 'wonder', name: 'Wonders' },
  { id: 'project', name: 'Projects' },
  { id: 'tech', name: 'Techs' },
  { id: 'resource', name: 'Resources' },
  { id: 'greatPerson', name: 'Great People' },
  { id: 'leader', name: 'Leaders' },
  { id: 'difficulty', name: 'Difficulty' },
  { id: 'mapSize', name: 'Map sizes' },
];

export interface AlmanacCard {
  /** `unit:warrior`, `tech:bronze_working`, ... */
  id: string;
  category: AlmanacCategory;
  name: string;
  /** A short line under the name in the list. */
  line: string;
  /** The card's body (HTML). */
  html: string;
  /** Lowercase text the search looks in. */
  search: string;
}

/** A tappable name that opens another card. */
export function cardLink(id: string, label: string): string {
  return `<button type="button" class="alink" data-card="${esc(id)}">${esc(label)}</button>`;
}

const techLink = (t: TechId) => cardLink(`tech:${t}`, TECHS[t].name);
const row = (label: string, value: string) => `<dt>${esc(label)}</dt><dd>${value}</dd>`;
const needs = (t: TechId | undefined, also?: TechId) =>
  t ? `${techLink(t)}${also ? ` and ${techLink(also)}` : ''}` : '<span class="sub">Nothing: available from the start</span>';
const eraName = (t: TechId) => ERAS.find((e) => e.id === TECHS[t].era)?.name ?? '';
const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

function card(id: string, category: AlmanacCategory, name: string, line: string, head: string, facts: string, extra = ''): AlmanacCard {
  const html = `<div class="acardHead">${head}<div><h3>${esc(name)}</h3><div class="sub">${esc(line)}</div></div></div>
    <dl class="facts">${facts}</dl>${extra}`;
  return { id, category, name, line, html, search: `${name} ${line} ${plain(facts)} ${plain(extra)}`.toLowerCase() };
}

const disc = (inner: string, cls = '') => `<span class="udisc acardIcon ${cls}">${inner}</span>`;

function unitCards(): AlmanacCard[] {
  return UNIT_IDS.map((id) => {
    const u = UNITS[id];
    const kind = u.domain === 'sea' ? 'Ship' : u.domain === 'air' ? 'Aircraft' : u.hover ? 'Helicopter' : 'Land unit';
    const facts =
      row('Stats', esc(unitSummary(id))) +
      row('Cost', `${u.cost} production`) +
      row('Needs', needs(u.requires, u.alsoRequires)) +
      row('Sight', String(u.sight));
    return card(`unit:${id}`, 'unit', u.name, kind, disc(unitIconHtml(id)), facts);
  });
}

function buildingCards(): AlmanacCard[] {
  return BUILDING_IDS.map((id) => {
    const b = BUILDINGS[id];
    const facts =
      row('Does', esc(b.summary)) +
      row('Cost', `${b.cost} production`) +
      row('Needs', needs(b.requires)) +
      (b.needs ? row('City must have', cardLink(`building:${b.needs}`, BUILDINGS[b.needs].name)) : '') +
      (b.coastal ? row('Where', 'A coastal city (next to water)') : '');
    return card(`building:${id}`, 'building', b.name, 'Building', disc('🏛'), facts);
  });
}

function wonderCards(): AlmanacCard[] {
  return WONDER_LIST.map((w) => {
    const civ = w.civ ? PLAYABLE_CIVS.find((c) => c.id === w.civ) : undefined;
    const facts =
      row('Does', esc(w.summary)) +
      row('Cost', `${w.cost} production`) +
      row('Needs', techLink(w.requires)) +
      (w.victory ? row('Victory', `Finishing it wins a ${VICTORY_NAMES[w.victory].toLowerCase()} victory (with the goal reached)`) : '') +
      (civ ? row('Only for', cardLink(`leader:${civ.id}`, `${civ.leader} of ${civ.name}`) + ', in the capital') : '') +
      row('Rule', 'One per world: the first city to finish it gets it');
    return card(`wonder:${w.id}`, 'wonder', w.name, w.victory ? 'Victory wonder' : 'Wonder of the world', disc('★'), facts);
  });
}

function projectCards(): AlmanacCard[] {
  return PROJECT_IDS.map((id) => {
    const p = PROJECTS[id];
    const civ = p.civ ? PLAYABLE_CIVS.find((c) => c.id === p.civ) : undefined;
    const facts =
      row('Does', esc(p.summary)) +
      row('Cost', `${p.cost} production`) +
      row('Needs', techLink(p.requires)) +
      (civ ? row('Only for', cardLink(`leader:${civ.id}`, `${civ.leader} of ${civ.name}`)) : '');
    return card(`project:${id}`, 'project', p.name, 'Project', disc(id === 'spaceship' ? '🚀' : '🌙'), facts);
  });
}

function techCards(): AlmanacCard[] {
  return TECH_LIST.map((t) => {
    const u = techUnlocks(t.id);
    const unlocks = [
      ...u.units.map((id) => cardLink(`unit:${id}`, UNITS[id].name)),
      ...u.buildings.map((id) => cardLink(`building:${id}`, BUILDINGS[id].name)),
      ...u.wonders.map((w) => cardLink(`wonder:${w.id}`, w.name)),
      ...PROJECT_IDS.filter((p) => PROJECTS[p].requires === t.id).map((p) => cardLink(`project:${p}`, PROJECTS[p].name)),
    ];
    const reveals = RESOURCE_IDS.filter((r) => RESOURCES[r].revealedBy === t.id).map((r) => cardLink(`resource:${r}`, RESOURCES[r].name));
    const leads = techLeadsTo(t.id).map(techLink);
    const starters = PLAYABLE_CIVS.filter((c) => c.startTech === t.id).map((c) => cardLink(`leader:${c.id}`, c.leader));
    const facts =
      row('Era', esc(eraName(t.id))) +
      row('Needs', t.prereqs.length ? t.prereqs.map(techLink).join(', ') : '<span class="sub">Nothing</span>') +
      row('Unlocks', unlocks.length ? unlocks.join(', ') : '<span class="sub">Nothing to build; it leads on</span>') +
      (reveals.length ? row('Reveals', reveals.join(', ')) : '') +
      (FOUNDING_TECHS.includes(t.id) ? row('Religion', 'The first civ to learn it founds a religion (one per civ)') : '') +
      (leads.length ? row('Leads to', leads.join(', ')) : '') +
      (starters.length ? row('Starting tech of', starters.join(', ')) : '');
    return card(`tech:${t.id}`, 'tech', t.name, `${eraName(t.id)} tech`, disc('🔬'), facts, `<p>${esc(t.description)}</p>`);
  });
}

function resourceCards(): AlmanacCard[] {
  return RESOURCE_IDS.map((id) => {
    const r = RESOURCES[id];
    const facts =
      row('Bonus', `${esc(bonusText(r.bonus))} when a city works the tile`) +
      row('Found on', r.terrains.map((t) => esc(TERRAIN[t].name)).join(', ')) +
      (r.hidden ? row('Hidden', r.revealedBy ? `Until you learn ${techLink(r.revealedBy)} (or destroy a village on it)` : 'Until revealed') : '');
    return card(`resource:${id}`, 'resource', r.name, r.hidden ? 'Hidden resource' : 'Resource', disc(iconHtml(r.icon, esc(r.glyph)), 'mapdisc'), facts);
  });
}

function greatPersonCards(): AlmanacCard[] {
  return GREAT_PERSON_KINDS.map((k) => {
    const g = GREAT_PEOPLE[k];
    const facts =
      row('Settle', `${esc(g.settleText)}, for good`) +
      row('Use once', esc(g.useText)) +
      row('Comes', `From culture: the first at ${GREAT_PEOPLE_RULES.first} culture earned, each next one needs more`);
    return card(`greatPerson:${k}`, 'greatPerson', g.name, 'Great Person', disc(iconHtml(g.icon, esc(g.glyph)), 'mapdisc'), facts);
  });
}

function leaderCards(): AlmanacCard[] {
  return PLAYABLE_CIVS.map((c) => {
    const facts =
      row('Civ', esc(c.name)) +
      row('Starting tech', c.startTech ? techLink(c.startTech) : '<span class="sub">None</span>') +
      (c.lean ? row('As an AI, goes for', `${VICTORY_NAMES[c.lean.primary]} (then ${VICTORY_NAMES[c.lean.secondary].toLowerCase()})`) : '') +
      row('As an AI', `aggression ${c.aggression}/5 · trade ${c.tradeWillingness}/5`);
    return card(`leader:${c.id}`, 'leader', c.leader, `Leader of ${c.name}`, portraitHtml(c.id, 64), facts, bonusListHtml(c.id));
  });
}

function difficultyCards(): AlmanacCard[] {
  return DIFFICULTY_IDS.map((id) => {
    const d = DIFFICULTIES[id];
    const pct = (n: number) => (n > 0 ? `+${n}%` : n < 0 ? `−${-n}%` : '±0');
    const facts =
      row('For', esc(d.forWhom)) +
      row('What changes', esc(d.summary)) +
      row('You', `production ${pct(d.player.production)}, science ${pct(d.player.science)}, gold ${pct(d.player.gold)}`) +
      row('The AIs', `production ${pct(d.ai.production)}, science ${pct(d.ai.science)}, gold ${pct(d.ai.gold)}`) +
      row('Safe from', `war on you until turn ${d.warGraceTurns}; demands until turn ${d.demandsFromTurn}`) +
      (d.extraAiUnits.length ? row('AIs start with', `a free ${d.extraAiUnits.map((u) => cardLink(`unit:${u}`, UNITS[u].name)).join(' and ')}`) : '');
    return card(`difficulty:${id}`, 'difficulty', d.name, 'Difficulty level', disc('⚖'), facts);
  });
}

function mapSizeCards(): AlmanacCard[] {
  return MAP_SIZE_IDS.map((id) => {
    const m = MAP_SIZES[id];
    const g = victoryGoals(id);
    const facts =
      row('Size', `${m.width}×${m.height} tiles`) +
      row('Rivals', `up to ${m.maxRivals}`) +
      row('Goals', `culture ${g.culture}, gold ${g.gold}`) +
      row('Villages', `${m.villages.min}–${m.villages.max}, huts ${m.huts.min}–${m.huts.max}`) +
      (m.techCostPct ? row('Techs', `cost +${m.techCostPct}%`) : '') +
      (m.bestOnComputer ? row('Best on', 'a computer (its rivals’ turns are slow on an iPad)') : '');
    return card(`mapSize:${id}`, 'mapSize', `${m.name} map`, 'Map size', disc('🗺'), facts);
  });
}

let all: AlmanacCard[] | undefined;

/** Every card, grouped by category in ALMANAC_CATEGORIES order (made once). */
export function almanacCards(): AlmanacCard[] {
  all ??= [
    ...unitCards(),
    ...buildingCards(),
    ...wonderCards(),
    ...projectCards(),
    ...techCards(),
    ...resourceCards(),
    ...greatPersonCards(),
    ...leaderCards(),
    ...difficultyCards(),
    ...mapSizeCards(),
  ];
  return all;
}

export function findCard(id: string): AlmanacCard | undefined {
  return almanacCards().find((c) => c.id === id);
}

/** Cards matching `query` (every word must appear) in `category` (or any). Name matches first. */
export function searchAlmanac(query: string, category?: AlmanacCategory): AlmanacCard[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = almanacCards().filter((c) => (!category || c.category === category) && words.every((w) => c.search.includes(w)));
  if (!words.length) return hits;
  const inName = (c: AlmanacCard) => words.every((w) => c.name.toLowerCase().includes(w));
  return [...hits.filter(inName), ...hits.filter((c) => !inName(c))];
}
