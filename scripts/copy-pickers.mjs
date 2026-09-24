// Copies the icon picker pages (docs/*-candidates.html, each self-contained) into the LAN play
// build, so Dan can open them on his iPad from the play server:
// http://<PC-IP>:4173/docs/<page>.html. Only `build:play` runs this; the Netlify build (dist/)
// never gets them.

import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'dist-play';
const pages = readdirSync('docs').filter((f) => f.endsWith('-candidates.html'));
mkdirSync(join(OUT, 'docs'), { recursive: true });
for (const page of pages) copyFileSync(join('docs', page), join(OUT, 'docs', page));
console.log(`copy-pickers: ${pages.length} picker page(s) → ${OUT}/docs/`);
