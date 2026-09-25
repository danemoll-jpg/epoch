// Round 14 (B1, B2): the script inside docs/terrain-style-candidates.html. It draws the demo
// map (src/dev/artDemo.ts) with the game's own renderer in every terrain style at three zoom
// levels, every city style at every look and era, and a "together" view of the two picks.
// Bundled into the page by scripts/make-art-page.mjs; the game never loads it.

import { CITY_LOOKS } from '../data/cityLooks';
import { ERAS } from '../data/techs';
import { CITY_STYLES, drawCityArt, drawTerrainTile, TERRAIN_STYLES, type ArtChoice, type CityStyleId, type TerrainStyleId } from '../render/art';
import { render, TerrainChunks, type ViewState } from '../render/renderer';
import { artDemoState } from './artDemo';

const PICKS_KEY = 'epoch.artPicks';
const ZOOMS = [{ tile: 26, label: 'zoomed out' }, { tile: 46, label: 'normal' }, { tile: 76, label: 'close up' }];
const OWNER = '#3b6fd6';
const CITY_TERRAIN: Record<CityStyleId, TerrainStyleId> = { classic: 'classic', towns: 'painted', bold: 'storybook' };

const state = artDemoState();
const redraws: (() => void)[] = [];
/** The painted views (their water shimmers). */
let animated: (() => void)[] = [];
let queued = false;
const again = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    for (const r of redraws) r();
  });
};

function loadPicks(): Partial<ArtChoice> {
  try {
    return JSON.parse(localStorage.getItem(PICKS_KEY) ?? '{}') as Partial<ArtChoice>;
  } catch {
    return {};
  }
}
let picks = loadPicks();
function savePicks(): void {
  try {
    localStorage.setItem(PICKS_KEY, JSON.stringify(picks));
  } catch {
    // Not remembered; the picks still copy.
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/** A canvas sized in CSS px, drawn at the screen's pixel ratio. */
function canvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, ctx };
}

/** The demo map in `art`, `tile` px a tile, in a `w` × `h` view centered on the map. */
function mapView(art: ArtChoice, tile: number, w: number, h: number, time = false): HTMLCanvasElement {
  const { c, ctx } = canvas(w, h);
  const chunks = new TerrainChunks();
  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const view: ViewState = {
      camera: { cx: state.map.width / 2, cy: state.map.height / 2, tileSize: tile },
      viewer: 0,
      reachable: [],
      targets: [],
      onIconReady: again,
      art,
      time: time ? performance.now() : undefined,
      chunks,
    };
    render(ctx, state, view, w, h);
  };
  draw();
  redraws.push(draw);
  if (time) animated.push(draw);
  return c;
}

function width(): number {
  const w = document.querySelector('main')!.clientWidth - 30;
  return Math.max(300, Math.min(1060, w));
}

function terrainSection(root: HTMLElement): void {
  const w = width();
  for (const st of TERRAIN_STYLES) {
    const sec = el('section', 'style');
    sec.dataset.kind = 'terrain';
    sec.dataset.id = st.id;
    sec.append(el('h3', '', `<span class="letter">${st.letter === '–' ? 'Now' : st.letter}</span> ${st.name}${st.id === 'classic' ? ' <span class="muted">(for comparison)</span>' : ''}`));
    sec.append(el('p', 'sum', st.summary));
    const row = el('div', 'zooms');
    for (const z of ZOOMS) {
      const fig = el('figure');
      const vw = Math.min(w, Math.round(state.map.width * z.tile));
      const vh = Math.min(Math.round(vw * 0.62), Math.round(state.map.height * z.tile));
      fig.append(mapView({ terrain: st.id, city: 'classic' }, z.tile, vw, vh, st.id === 'painted'));
      fig.append(el('figcaption', '', `${z.label} · ${z.tile} px tiles`));
      row.append(fig);
    }
    sec.append(row);
    if (st.id !== 'classic') sec.append(pickButton('terrain', st.id, st.letter, st.name));
    root.append(sec);
  }
}

/** One city drawn alone on a patch of matching terrain. */
function cityTile(style: CityStyleId, look: number, era: number, walls: boolean, s: number): HTMLCanvasElement {
  const { c, ctx } = canvas(s, s + s * 0.1);
  drawTerrainTile(ctx, CITY_TERRAIN[style], { terrain: 'grassland', x: look, y: era, water: false, edge: { n: false, e: false, s: false, w: false } }, 0, 0, s);
  const l = CITY_LOOKS[look]!;
  drawCityArt(ctx, style, { look: l.id, buildings: l.buildings, era, color: OWNER, walls, size: l.minSize + 1, open: false }, 0, 0, s);
  return c;
}

function citySection(root: HTMLElement): void {
  for (const st of CITY_STYLES) {
    const sec = el('section', 'style');
    sec.dataset.kind = 'city';
    sec.dataset.id = st.id;
    sec.append(el('h3', '', `<span class="letter">${st.letter === '–' ? 'Now' : st.letter}</span> ${st.name}${st.id === 'classic' ? ' <span class="muted">(for comparison)</span>' : ''}`));
    sec.append(el('p', 'sum', st.summary));
    const grid = el('div', 'cityGrid');
    grid.append(el('div', 'hd', ''));
    for (const l of CITY_LOOKS) grid.append(el('div', 'hd', `${l.name}<br><span class="muted">size ${l.minSize}+</span>`));
    grid.append(el('div', 'hd', 'With walls'));
    ERAS.forEach((era, e) => {
      grid.append(el('div', 'rowhd', era.name));
      CITY_LOOKS.forEach((_, i) => grid.append(cityTile(st.id, i, e, false, 64)));
      grid.append(cityTile(st.id, CITY_LOOKS.length - 1, e, true, 64));
    });
    sec.append(grid);
    const small = el('div', 'smallRow');
    small.append(el('span', 'muted', 'At the zoomed-out size (30 px):'));
    CITY_LOOKS.forEach((_, i) => small.append(cityTile(st.id, i, 1, i === 3, 30)));
    sec.append(small);
    if (st.id !== 'classic') sec.append(pickButton('city', st.id, st.letter, st.name));
    root.append(sec);
  }
}

function pickButton(kind: 'terrain' | 'city', id: string, letter: string, name: string): HTMLButtonElement {
  const b = el('button', 'pick', `Pick ${letter}: ${name}`);
  b.type = 'button';
  b.dataset.kind = kind;
  b.dataset.id = id;
  b.addEventListener('click', () => {
    picks = { ...picks, [kind]: picks[kind] === id ? undefined : id };
    savePicks();
    updatePicks();
  });
  return b;
}

function together(root: HTMLElement): void {
  const baseRedraws = redraws.length;
  const box = document.getElementById('together')!;
  const draw = () => {
    box.innerHTML = '';
    // Forget the old view's redraws (its canvas is gone).
    redraws.length = baseRedraws;
    animated = animated.filter((d) => redraws.includes(d));
    const art: ArtChoice = { terrain: (picks.terrain ?? 'classic') as TerrainStyleId, city: (picks.city ?? 'classic') as CityStyleId };
    const w = Math.min(width(), 16 * 60);
    box.append(mapView(art, Math.floor(w / 16), w, Math.floor(w / 16) * 11, art.terrain === 'painted'));
  };
  draw();
  if (togetherDraw) root.removeEventListener('picks', togetherDraw);
  togetherDraw = draw;
  root.addEventListener('picks', draw);
}
let togetherDraw: (() => void) | undefined;

function updatePicks(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('button.pick')) {
    const on = picks[b.dataset.kind as 'terrain' | 'city'] === b.dataset.id;
    b.classList.toggle('on', on);
    b.textContent = `${on ? '✓ Picked' : 'Pick'} ${b.textContent!.replace(/^(✓ Picked|Pick) /, '')}`;
    b.closest('section')?.classList.toggle('picked', on);
  }
  const t = TERRAIN_STYLES.find((x) => x.id === picks.terrain);
  const c = CITY_STYLES.find((x) => x.id === picks.city);
  document.getElementById('pickText')!.textContent = `${t ? `Terrain ${t.letter}` : 'No terrain yet'} · ${c ? `Cities ${c.letter}` : 'no cities yet'}`;
  document.getElementById('app')!.dispatchEvent(new Event('picks'));
}

function picksText(): string {
  const t = TERRAIN_STYLES.find((x) => x.id === picks.terrain);
  const c = CITY_STYLES.find((x) => x.id === picks.city);
  return [`Terrain style: ${t ? `${t.letter} (${t.name})` : 'not picked'}`, `City style: ${c ? `${c.letter} (${c.name})` : 'not picked'}`].join('\n');
}

/** Draws every section for the page's current width (again after a resize or rotation). */
function build(app: HTMLElement): void {
  redraws.length = 0;
  animated = [];
  document.getElementById('terrain')!.innerHTML = '';
  document.getElementById('cities')!.innerHTML = '';
  terrainSection(document.getElementById('terrain')!);
  citySection(document.getElementById('cities')!);
  together(app);
  updatePicks();
}

function start(): void {
  const app = document.getElementById('app')!;
  let built = width();
  build(app);
  let timer: number | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (Math.abs(width() - built) < 40) return;
      built = width();
      build(app);
    }, 200);
  });
  document.getElementById('copyBtn')!.addEventListener('click', () => {
    const msg = document.getElementById('copyMsg')!;
    const text = picksText();
    // The play server is plain http on the LAN, where the clipboard API isn't offered: then
    // select the text in a box and copy it the old way (or leave it selected to copy by hand).
    const fallback = () => {
      const ta = document.getElementById('copyText') as HTMLTextAreaElement;
      ta.hidden = false;
      ta.value = text;
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      msg.textContent = ok ? 'Copied. Paste it into the chat.' : 'Select the text below and copy it.';
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => (msg.textContent = 'Copied. Paste it into the chat.'), fallback);
    } else fallback();
  });
  document.getElementById('shareBtn')!.addEventListener('click', () => {
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) void nav.share({ text: picksText() }).catch(() => {});
    else document.getElementById('copyMsg')!.textContent = picksText();
  });
  // The painted water shimmers.
  const tick = () => {
    for (const d of animated) d();
    setTimeout(tick, 150);
  };
  tick();
}

start();
