// Copies the icon picker pages (docs/*-candidates.html, each self-contained) and the portrait
// check page (docs/portraits.html, Round 11, with the pictures in docs/portraits/) into the LAN
// play build, so Dan can open them on his iPad from the play server:
// http://<PC-IP>:4173/docs/<page>.html. Only `build:play` runs this; the Netlify build (dist/)
// never gets them. Round 13: also the sound check page (docs/sounds.html), with Dan's sound
// files from src/assets/sounds/ in docs/sounds/ (the page shows "missing" for any not there).

import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'dist-play';
// Round 19: also the leader scenes' check page (self-contained).
const pages = readdirSync('docs').filter((f) => f.endsWith('-candidates.html') || f === 'portraits.html' || f === 'sounds.html' || f === 'leader-scenes.html');
mkdirSync(join(OUT, 'docs', 'portraits'), { recursive: true });
for (const page of pages) copyFileSync(join('docs', page), join(OUT, 'docs', page));
const portraits = readdirSync('src/assets/portraits').filter((f) => /\.(png|webp)$/.test(f));
for (const f of portraits) copyFileSync(join('src/assets/portraits', f), join(OUT, 'docs', 'portraits', f));
// Round 16: Dan's PNG masters too, for the page's PNG-and-WebP side-by-side check.
mkdirSync(join(OUT, 'docs', 'portraits-master'), { recursive: true });
const masters = readdirSync('docs/portraits-master').filter((f) => f.endsWith('.png'));
for (const f of masters) copyFileSync(join('docs/portraits-master', f), join(OUT, 'docs', 'portraits-master', f));
mkdirSync(join(OUT, 'docs', 'sounds'), { recursive: true });
const sounds = readdirSync('src/assets/sounds').filter((f) => f.endsWith('.mp3'));
for (const f of sounds) copyFileSync(join('src/assets/sounds', f), join(OUT, 'docs', 'sounds', f));
console.log(`copy-pickers: ${pages.length} page(s), ${portraits.length} portrait(s) (+${masters.length} PNG masters), and ${sounds.length} sound(s) → ${OUT}/docs/`);
