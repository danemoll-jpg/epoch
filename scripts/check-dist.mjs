// Post-build check: the dev scenarios must never ship. main.ts only imports them behind
// import.meta.env.DEV, which Vite compiles out of the production build; this proves it by
// searching dist/ for a marker string that every dev bundle contains. Run by `npm run build`,
// so a leak fails the build (and the Netlify deploy).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const MARKER_SOURCE = 'src/dev/scenarios.ts';
const DIST = process.argv[2] ?? 'dist';

// Read the marker from the source, so this check can't silently go stale.
const src = readFileSync(MARKER_SOURCE, 'utf8');
const match = src.match(/SCENARIO_MARKER = '([^']+)'/);
if (!match) {
  console.error(`check-dist: couldn't find SCENARIO_MARKER in ${MARKER_SOURCE}`);
  process.exit(1);
}
const needles = [match[1], 'Tap End Turn.'];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const all = files(DIST);
const leaks = [];
for (const file of all) {
  const text = readFileSync(file, 'utf8');
  for (const n of needles) if (text.includes(n)) leaks.push(`${file}: contains "${n}"`);
}
if (leaks.length) {
  console.error('check-dist: dev scenario code leaked into the production build:\n  ' + leaks.join('\n  '));
  process.exit(1);
}
console.log(`check-dist: OK, no dev scenario code in ${all.length} files under ${DIST}/`);

// Round 16: the first load (the page, its entry script, the scripts it preloads, and its
// styles) must not contain Firebase: the SDK is loaded only when a player signs in (or was
// signed in before). The markers are strings every Firebase SDK build contains.
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const firstLoad = ['index.html'];
for (const m of html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.(?:js|css))"/g)) firstLoad.push(m[1]);
const FIREBASE_MARKERS = ['FirebaseError', 'firestore.googleapis.com', 'identitytoolkit.googleapis.com'];
const fbLeaks = [];
let raw = 0;
let gz = 0;
for (const f of firstLoad) {
  const buf = readFileSync(join(DIST, f));
  raw += buf.length;
  gz += gzipSync(buf).length;
  const text = buf.toString('utf8');
  for (const n of FIREBASE_MARKERS) if (text.includes(n)) fbLeaks.push(`${f}: contains "${n}"`);
}
if (fbLeaks.length) {
  console.error('check-dist: Firebase code is in the first load (it must be loaded only when needed):\n  ' + fbLeaks.join('\n  '));
  process.exit(1);
}
const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`check-dist: OK, no Firebase in the first load (${firstLoad.length} files, ${kb(raw)}, ${kb(gz)} gzipped)`);
