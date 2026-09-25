// The New Game setup screen (Round 11, C1): pick your civ from Dan's 12 (or a random one) and
// how many rivals (1–4), then Start. Rivals are drawn at random (seeded) from the rest by
// createGame. Touch-first: big cards in a grid that reflows for portrait and landscape; tap a
// card to choose it and see all its bonuses.

import { PLAYABLE_CIVS, findCiv } from '../data/civs';
import { LEADER_BONUSES } from '../data/leaders';
import { RULES } from '../data/rules';
import { ERAS, TECHS } from '../data/techs';
import { portraitHtml } from './portraits';

export interface SetupChoice {
  /** The civ id, or undefined for a random one. */
  civ?: string;
  /** Rival civs (AI), 1–4. */
  rivals: number;
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
  private rivals = RULES.defaultPlayers - 1;
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
    const max = RULES.maxPlayers - 1;
    document.getElementById('setupBody')!.innerHTML = `
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
    else if (act === 'random') this.civ = undefined;
    else if (act === 'fewer') this.rivals = Math.max(1, this.rivals - 1);
    else if (act === 'more') this.rivals = Math.min(RULES.maxPlayers - 1, this.rivals + 1);
    else if (act === 'start') {
      this.close();
      this.onStart({ civ: this.civ, rivals: this.rivals });
      return;
    } else if (act === 'cancel') {
      this.close();
      return;
    } else return;
    this.render();
  }
}
