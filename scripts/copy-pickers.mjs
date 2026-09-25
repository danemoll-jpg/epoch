// Copies the icon picker pages (docs/*-candidates.html, each self-contained) and the portrait
// check page (docs/portraits.html, Round 11, with the pictures in docs/portraits/) into the LAN
// play build, so Dan can open them on his iPad from the play server:
// http://<PC-IP>:4173/docs/<page>.html. Only `build:play` runs this; the Netlify build (dist/)
// never gets them.

import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'dist-play';
const pages = readdirSync('docs').filter((f) => f.endsWith('-candidates.html') || f === 'portraits.html');
mkdirSync(join(OUT, 'docs', 'portraits'), { recursive: true });
for (const page of pages) copyFileSync(join('docs', page), join(OUT, 'docs', page));
const portraits = readdirSync('src/assets/portraits').filter((f) => /\.(png|webp)$/.test(f));
for (const f of portraits) copyFileSync(join('src/assets/portraits', f), join(OUT, 'docs', 'portraits', f));
console.log(`copy-pickers: ${pages.length} page(s) and ${portraits.length} portrait(s) → ${OUT}/docs/`);
