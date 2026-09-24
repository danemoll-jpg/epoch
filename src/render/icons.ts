// Unit icons (Round 7), and the map icons (Round 10). The SVGs in src/assets/icons/ are bundled into the build as text (no
// request to the web, ever). The map draws each icon from a small bitmap, rasterized once per
// icon, color, and pixel size and then cached; the HTML panels inline the SVG itself, colored
// by CSS (`currentColor`). A missing or not-yet-loaded icon falls back to the unit's letters.

import { UNITS, type UnitTypeId } from '../data/units';

/** Raw SVG text by icon name ('old-wagon'), from src/assets/icons/<name>.svg. */
const SVG: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../assets/icons/*.svg', { query: '?raw', import: 'default', eager: true }),
  ).map(([path, text]) => [path.replace(/^.*\/(.+)\.svg$/, '$1'), text]),
);

export function iconSvg(icon: string): string | undefined {
  return SVG[icon];
}

/** The unit type's icon as inline HTML (inherits the text color), or its letters if missing. */
export function unitIconHtml(type: UnitTypeId, cls = 'uicon'): string {
  const def = UNITS[type];
  return iconHtml(def?.icon, def?.glyph ?? '?', cls);
}

/**
 * Any icon as inline HTML (inherits the text color; sized by CSS), or `fallback` letters if
 * it's missing. Round 10: map things (resources, Great People, the village...) use it too.
 */
export function iconHtml(icon: string | undefined, fallback: string, cls = 'uicon'): string {
  const svg = icon ? iconSvg(icon) : undefined;
  if (!svg) return `<span class="${cls} uglyph" aria-hidden="true">${fallback}</span>`;
  // Drop the credit comment and size the SVG by CSS.
  return `<span class="${cls}" aria-hidden="true">${svg.replace(/<!--.*?-->/g, '').replace('<svg ', '<svg focusable="false" ')}</span>`;
}

type Entry = { bitmap?: HTMLCanvasElement; failed?: boolean };
/** icon|color → pixel size → entry. */
const cache = new Map<string, Map<number, Entry>>();
/** Sizes are rounded to this many device pixels, so pinch-zooming doesn't make a bitmap per frame. */
const SIZE_STEP = 4;

/**
 * The icon rasterized in `color`, about `px` device pixels square. While the exact size is
 * still loading, the nearest size already made is returned (the caller scales it), or
 * undefined if none is ready (or the icon is missing). `onReady` is called when a new bitmap
 * becomes available, so the map can redraw.
 */
export function iconBitmap(icon: string, color: string, px: number, onReady: () => void): HTMLCanvasElement | undefined {
  const size = Math.max(SIZE_STEP * 2, Math.round(px / SIZE_STEP) * SIZE_STEP);
  const key = `${icon}|${color}`;
  let sizes = cache.get(key);
  if (!sizes) {
    sizes = new Map();
    cache.set(key, sizes);
  }
  const hit = sizes.get(size);
  if (hit?.bitmap) return hit.bitmap;
  if (!hit) load(icon, color, size, sizes, onReady);
  let best: { d: number; bmp: HTMLCanvasElement } | undefined;
  for (const [s, e] of sizes) {
    if (!e.bitmap) continue;
    const d = Math.abs(s - size);
    if (!best || d < best.d) best = { d, bmp: e.bitmap };
  }
  return best?.bmp;
}

function load(icon: string, color: string, size: number, sizes: Map<number, Entry>, onReady: () => void): void {
  const svg = iconSvg(icon);
  const entry: Entry = {};
  sizes.set(size, entry);
  if (!svg || typeof Image === 'undefined') {
    entry.failed = true;
    return;
  }
  const colored = svg.replace(/currentColor/g, color).replace('<svg ', `<svg width="${size}" height="${size}" `);
  const img = new Image(size, size);
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    if (!g) {
      entry.failed = true;
      return;
    }
    g.drawImage(img, 0, 0, size, size);
    entry.bitmap = c;
    onReady();
  };
  img.onerror = () => {
    entry.failed = true;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`;
}
