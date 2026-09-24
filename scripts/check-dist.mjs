// Post-build check: the dev scenarios must never ship. main.ts only imports them behind
// import.meta.env.DEV, which Vite compiles out of the production build; this proves it by
// searching dist/ for a marker string that every dev bundle contains. Run by `npm run build`,
// so a leak fails the build (and the Netlify deploy).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
