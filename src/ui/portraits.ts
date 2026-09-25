// Leader portraits (Round 11). Dan's pictures live in src/assets/portraits/<civ-id>.png (or
// .webp), bundled by Vite; a civ without one gets the placeholder: the leader's initials on
// the civ color in a circle. At small sizes (48 px and under) the picture zooms in on the face
// using the civ's `portraitFocus` (src/data/civs.ts). See docs/PORTRAITS.md.

import { BARBARIAN_CIV } from '../data/barbarians';
import { findCiv, leaderInitials, type CivDef, type PortraitFocus } from '../data/civs';

const files = import.meta.glob('../assets/portraits/*.{png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Portrait URL per civ id (a .webp wins over a .png of the same name). */
const URLS: Record<string, string> = {};
for (const [path, url] of Object.entries(files).sort(([a], [b]) => (a.endsWith('.webp') ? 1 : 0) - (b.endsWith('.webp') ? 1 : 0) || a.localeCompare(b))) {
  const id = path.split('/').pop()!.replace(/\.(png|webp)$/, '');
  URLS[id] = url;
}

export function portraitUrl(civId: string): string | undefined {
  return URLS[civId];
}

/** At or below this size (px), a portrait zooms in on the face. */
export const SMALL_PORTRAIT = 48;

/**
 * CSS background size and position that zoom by `focus.zoom` and put the focus point as close
 * to the center as the picture allows. Pure, so it's unit-tested (and docs/portraits.html
 * uses the same formula).
 */
export function portraitCrop(focus: PortraitFocus | undefined, size: number): { size: string; position: string } {
  if (!focus || size > SMALL_PORTRAIT || focus.zoom <= 1) return { size: 'cover', position: '50% 50%' };
  const z = focus.zoom;
  const pos = (f: number) => Math.max(0, Math.min(100, ((f * z - 0.5) / (z - 1)) * 100));
  return { size: `${Math.round(z * 100)}%`, position: `${pos(focus.x).toFixed(1)}% ${pos(focus.y).toFixed(1)}%` };
}

function civFor(civId: string): CivDef | undefined {
  return civId === BARBARIAN_CIV.id ? BARBARIAN_CIV : findCiv(civId);
}

/** A round portrait of the civ's leader, `size` px across: the picture, or the initials placeholder. */
export function portraitHtml(civId: string, size: number, extraClass = ''): string {
  const civ = civFor(civId);
  const color = civ?.color ?? '#888';
  const title = civ ? `${civ.leader} of ${civ.name}` : '';
  const style = `width:${size}px;height:${size}px;border-color:${color}`;
  const url = portraitUrl(civId);
  if (url) {
    const crop = portraitCrop(civ?.portraitFocus, size);
    return `<span class="portrait ${extraClass}" role="img" aria-label="${title}" style="${style};background-image:url('${url}');background-size:${crop.size};background-position:${crop.position}"></span>`;
  }
  const initials = civ ? leaderInitials(civ) : '?';
  const font = Math.max(10, Math.round(size / (initials.length > 2 ? 3.2 : 2.4)));
  return `<span class="portrait placeholder ${extraClass}" role="img" aria-label="${title}" style="${style};background:${color};font-size:${font}px">${initials}</span>`;
}
