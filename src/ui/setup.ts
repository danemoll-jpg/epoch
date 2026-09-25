// The New Game setup screen (Round 11, C1): pick your civ from Dan's 12 (or a random one) and
// how many rivals (1–4), then Start. Rivals are drawn at random (seeded) from the rest by
// createGame. Touch-first: big cards in a grid that reflows for portrait and landscape; tap a
// card to choose it and see all its bonuses.

import { PLAYABLE_CIVS, findCiv } from '../data/civs';
import { LEADER_BONUSES } from '../data/leaders';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, DIFFICULTY_IDS, type DifficultyId } from '../data/difficulty';
import { DEFAULT_MAP_SIZE, MAP_SIZES, MAP_SIZE_IDS, type MapSizeId } from '../data/mapSizes';
import { ERAS, TECHS } from '../data/techs';
import { portraitHtml } from './portraits';

export interface SetupChoice {
  /** The civ id, or undefined for a random one. */
  civ?: string;
  /** Rival civs (AI), 1 to the map size's most. */
  rivals: number;
  /** Round 13: the difficulty level and map size. */
  difficulty: DifficultyId;
  mapSize: MapSizeId;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Every bonus of a civ as HTML: start, each era, and the drawback. */
export function bonusListHtml(civId: string, activeEra?: number): string {
  const b = LEADER_BONUSES[civId];
  if (!b) return '<p class="sub">No leader bonuses (an older civ, kept for old saves).</p>';
  const row = (label: string, name: string, text: string, on: boolean | undefined, cls = '') =>
    `<li class="${cls} ${on === false ? 'later' : ''}"><span class="blabel">${label}</span><b>${esc(name)}</b> ${esc(text)}</li>`;
  const rows = [row('Start', b.start.name, b.start.text, activeEra === undefined ? undefined : true)];
  ERAS.forEach((e, i) => {
    const bonus = b.eras[e.id];
    rows.push(row(e.name, bonus.name, bonus.text, activeEra === undefined ? undefined : i <= activeEra));
  });
  if (b.drawback) rows.push(row('Drawback', b.drawback.name, b.drawback.text, activeEra === undefined ? undefined : true, 'drawback'));
  return `<ul class="bonusList">${rows.join('')}</ul>`;
}

export class SetupScreen {
  private civ: string | undefined = undefined;
  private rivals = MAP_SIZES[DEFAULT_MAP_SIZE].defaultRivals;
  private difficulty: DifficultyId = DEFAULT_DIFFICULTY;
  private mapSize: MapSizeId = DEFAULT_MAP_SIZE;
  private readonly root: HTMLElement;

  constructor(private readonly onStart: (choice: SetupChoice) => void) {
    this.root = document.getElementById('setupOverlay')!;
    this.root.addEventListener('click', (e) => this.handleClick(e));
  }

  open(): void {
    this.render();
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  private render(): void {
    const cards = PLAYABLE_CIVS.map((c) => {
      const tech = c.startTech ? TECHS[c.startTech].name : '—';
      const start = LEADER_BONUSES[c.id]?.start;
      const on = this.civ === c.id;
      return `<button type="button" class="civCard ${on ? 'on' : ''}" data-civ="${c.id}" aria-pressed="${on}" style="--civ:${c.color}">
        ${portraitHtml(c.id, 64)}
        <span class="civText"><b>${esc(c.leader)}</b><span class="civName"><span class="swatch" style="background:${c.color}"></span>${esc(c.name)}</span>
        <span class="sub">Starts with ${esc(tech)}</span>
        <span class="sub">${start ? esc(start.text) : ''}</span></span></button>`;
    }).join('');
    const chosen = this.civ ? findCiv(this.civ) : undefined;
    const detail = chosen
      ? `<div class="setupDetail">${portraitHtml(chosen.id, 96)}<div><h3>${esc(chosen.leader)} of ${esc(chosen.name)}</h3>
          <p class="sub">Starting tech: ${chosen.startTech ? esc(TECHS[chosen.startTech].name) : '—'} (known from turn 1, even without the techs before it)</p>
          ${bonusListHtml(chosen.id)}</div></div>`
      : `<div class="setupDetail"><div><h3>Random civ</h3><p class="sub">You'll get one of the 12 at random. Tap a card to choose instead, and to see all its bonuses.</p></div></div>`;
    const max = MAP_SIZES[this.mapSize].maxRivals;
    const seg = (act: string, id: string, on: boolean, name: string, sub: string) =>
      `<button type="button" data-${act}="${id}" class="optBtn ${on ? 'on' : ''}" aria-pressed="${on}"><b>${esc(name)}</b><span class="sub">${esc(sub)}</span></button>`;
    const levels = DIFFICULTY_IDS.map((d) => seg('difficulty', d, this.difficulty === d, DIFFICULTIES[d].name, DIFFICULTIES[d].forWhom)).join('');
    const sizes = MAP_SIZE_IDS.map((m) => seg('size', m, this.mapSize === m, MAP_SIZES[m].name, MAP_SIZES[m].summary)).join('');
    document.getElementById('setupBody')!.innerHTML = `
      <div class="label">Difficulty</div>
      <div class="optRow">${levels}</div>
      <div class="sub optNote">${esc(DIFFICULTIES[this.difficulty].summary)}</div>
      <div class="label">Map</div>
      <div class="optRow">${sizes}</div>
      <div class="label">Leader</div>
      <div class="setupControls row">
        <button type="button" data-act="random" class="${this.civ ? '' : 'on'}" aria-pressed="${!this.civ}">🎲 Random civ</button>
        <span class="rivals">Rivals
          <button type="button" data-act="fewer" aria-label="Fewer rivals" ${this.rivals <= 1 ? 'disabled' : ''}>−</button>
          <b id="rivalCount">${this.rivals}</b>
          <button type="button" data-act="more" aria-label="More rivals" ${this.rivals >= max ? 'disabled' : ''}>+</button>
        </span>
      </div>
      ${detail}
      <div class="civGrid">${cards}</div>`;
  }

  private handleClick(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest('button');
    if (e.target === this.root) {
      this.close();
      return;
    }
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    if (el.dataset.civ) this.civ = el.dataset.civ === this.civ ? undefined : el.dataset.civ;
    else if (el.dataset.difficulty) this.difficulty = el.dataset.difficulty as DifficultyId;
    else if (el.dataset.size) {
      // A new size: its usual rival count if you hadn't changed it, else yours (within its limit).
      const was = MAP_SIZES[this.mapSize];
      this.mapSize = el.dataset.size as MapSizeId;
      const now = MAP_SIZES[this.mapSize];
      this.rivals = this.rivals === was.defaultRivals ? now.defaultRivals : Math.min(this.rivals, now.maxRivals);
    }
    else if (act === 'random') this.civ = undefined;
    else if (act === 'fewer') this.rivals = Math.max(1, this.rivals - 1);
    else if (act === 'more') this.rivals = Math.min(MAP_SIZES[this.mapSize].maxRivals, this.rivals + 1);
    else if (act === 'start') {
      this.close();
      this.onStart({ civ: this.civ, rivals: this.rivals, difficulty: this.difficulty, mapSize: this.mapSize });
      return;
    } else if (act === 'cancel') {
      this.close();
      return;
    } else return;
    this.render();
  }
}
