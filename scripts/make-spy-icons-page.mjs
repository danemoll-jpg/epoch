// Round 19 (item 11, and Dan's mid-round addition): builds docs/spy-icon-candidates.html, Dan's
// picker for the Spy's, Modern Infantry's and the Drone's icons. Three game-icons.net candidates
// each (CC BY 3.0), fetched once into docs/spy-icon-candidates/ and
// normalized as in earlier rounds (viewBox 0 0 512 512, the black square removed,
// fill="currentColor", a credit comment). Each is shown at the sizes the game uses: big, on the
// map (white on a civ's color, next to other units), in the unit panel, and in a list row.
// Run: node scripts/make-spy-icons-page.mjs   (needs the network only for missing SVGs)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'docs/spy-icon-candidates';
const PAGE = 'docs/spy-icon-candidates.html';
/** Subject → its candidates, and the game's own icons of units it will stand beside. */
const SUBJECTS = [
  { id: 'spy', name: 'Spy', stats: 'Spy · invisible · moves 2/2 · Grassland', neighbors: ['caveman', 'robe', 'bowman', 'old-wagon'], cands: [
    ['delapouite/spy', 'Spy (hat and coat)'],
    ['lorc/cloak-dagger', 'Cloak and dagger'],
    ['lorc/domino-mask', 'Domino mask'],
  ] },
  { id: 'modern-infantry', name: 'Modern Infantry', stats: 'Modern Infantry · attack 8 · defense 12 · moves 1/1', neighbors: ['lee-enfield', 'tank', 'blunderbuss', 'mortar'], cands: [
    ['skoll/kevlar-vest', 'Body armor'],
    ['sbed/rifle', 'Modern rifle'],
    ['quoting/trench-assault', 'Trench assault'],
  ] },
  { id: 'drone', name: 'Drone', stats: 'Drone · range 10 · sight 4 · tap a tile to scout or strike', neighbors: ['biplane', 'jet-fighter', 'carpet-bombing', 'helicopter'], cands: [
    ['delapouite/delivery-drone', 'Quadcopter drone'],
    ['lorc/radar-sweep', 'Radar sweep'],
    ['lorc/satellite', 'Satellite'],
  ] },
];
const LETTERS = ['A', 'B', 'C'];
const COLORS = ['#3f7fe0', '#c0392b', '#2f9e5b', '#b8860b'];

const author = (slug) => slug.split('/')[0].split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const iconName = (slug) => slug.split('/')[1].split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

async function fetchSvg(slug) {
  const r = await fetch(`https://raw.githubusercontent.com/game-icons/icons/master/${slug}.svg`);
  if (!r.ok) throw new Error(`${slug}: HTTP ${r.status}`);
  return r.text();
}

function normalize(svg, slug) {
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"[^>]*\/?>/g)].map((m) => m[1]).filter((d) => d !== 'M0 0h512v512H0z');
  if (!paths.length) throw new Error(`${slug}: no paths`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!-- ${slug.split('/')[1]} by ${author(slug)}, game-icons.net, CC BY 3.0 -->${paths.map((d) => `<path fill="currentColor" d="${d}"/>`).join('')}</svg>`;
}

const inner = (svg) => svg.trim().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/<!--.*?-->/, '');

mkdirSync(DIR, { recursive: true });
const symbols = [];
const sources = [];
const neighborSeen = new Set();
for (const sub of SUBJECTS) {
  sub.list = [];
  for (let i = 0; i < sub.cands.length; i++) {
    const [slug, label] = sub.cands[i];
    const file = `${sub.id}-${LETTERS[i].toLowerCase()}.svg`;
    const path = join(DIR, file);
    if (!existsSync(path)) writeFileSync(path, normalize(await fetchSvg(slug), slug));
    symbols.push(`<symbol id="i-${file.replace('.svg', '')}" viewBox="0 0 512 512">${inner(readFileSync(path, 'utf8'))}</symbol>`);
    sources.push(`| ${file} | ${sub.name} | ${LETTERS[i]} | ${slug.split('/')[1]} | ${author(slug)} | https://game-icons.net/1x1/${slug}.html | CC BY 3.0 |`);
    sub.list.push({ slug, label, file, letter: LETTERS[i] });
  }
  for (const n of sub.neighbors) {
    if (neighborSeen.has(n)) continue;
    neighborSeen.add(n);
    symbols.push(`<symbol id="n-${n}" viewBox="0 0 512 512">${inner(readFileSync(`src/assets/icons/${n}.svg`, 'utf8'))}</symbol>`);
  }
}

writeFileSync(join(DIR, 'SOURCES.md'), `# Spy icon candidates: sources

All icons are from [game-icons.net](https://game-icons.net) (SVG sources:
https://github.com/game-icons/icons), licensed **CC BY 3.0**
(https://creativecommons.org/licenses/by/3.0/). The files here are normalized:
\`viewBox="0 0 512 512"\`, the site's black background square removed, the shape's
path(s) with \`fill="currentColor"\`. The shapes themselves are unchanged.

Round 19 (item 11): three candidates each for the Spy, and (Dan's mid-round addition) Modern
Infantry and the Drone. Built by
\`scripts/make-spy-icons-page.mjs\`; the picker page is \`docs/spy-icon-candidates.html\`
(picks are saved on the device under \`epoch.spyIconPicks\`). The game uses A until Dan picks.

| File | Subject | Letter | Icon | Author | Source | License |
|---|---|---|---|---|---|---|
${sources.join('\n')}
`);

const use = (id, px, color) => `<svg width="${px}" height="${px}" aria-hidden="true"><use href="#${id}" width="${px}" height="${px}"${color ? ` style="color:${color}"` : ''}/></svg>`;
const disc = (id, bg, px = 30) => `<span class="disc" style="background:${bg};width:${px}px;height:${px}px">${use(id, Math.round(px * 0.72), '#fff')}</span>`;

function candHtml(sub, c) {
  const id = `i-${c.file.replace('.svg', '')}`;
  const neighbors = sub.neighbors.map((n, k) => disc(`n-${n}`, COLORS[(k + 1) % COLORS.length])).join('');
  return `<figure class="cand"><div class="letter">${c.letter}</div>
<div class="big">${use(id, 96)}</div>
<div class="tiles">
<div class="map"><span class="tile">${disc(id, COLORS[0], 34)}</span><span class="tile">${disc(id, COLORS[1], 34)}</span><span class="tile">${disc(id, COLORS[2], 26)}</span><span class="row">${disc(id, COLORS[0])}${neighbors}</span></div>
<div class="panel">${disc(id, COLORS[0], 26)}<span>${sub.stats}</span></div>
<div class="listrow">${disc(id, COLORS[0], 22)}<span>${sub.name}</span><span class="sub">ready · 3 tiles from Ur</span></div>
</div>
<figcaption><b>${c.label}</b><br>${iconName(c.slug)} by ${author(c.slug)} · <a href="https://game-icons.net/1x1/${c.slug}.html">game-icons.net</a> · CC BY 3.0</figcaption></figure>`;
}

const religion = readFileSync('docs/religion-road-icon-candidates.html', 'utf8');
const pickerStyle = religion.slice(religion.lastIndexOf('<style>'), religion.indexOf('</style>', religion.lastIndexOf('<style>')) + 8);
const pickerBar = religion.slice(religion.indexOf('<div id="pickBar"'), religion.indexOf('<script>', religion.indexOf('<div id="pickBar"')));
const pickerScript = religion
  .slice(religion.indexOf('<script>', religion.indexOf('<div id="pickBar"')), religion.lastIndexOf('</script>') + 9)
  .replace("'epoch.religionIconPicks'", "'epoch.spyIconPicks'")
  .replace(/Epoch religion icon picks/g, 'Epoch new unit icon picks');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>New Unit Icons</title>
<style>
:root{--bg:#f4f1ea;--card:#ffffff;--ink:#1d1f22;--muted:#5d6166;--line:#ddd8cc;--tileBg:#ece8de;--glyph:#1d1f22;--link:#2c62b8}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15171a;--card:#1f2226;--ink:#ecebe7;--muted:#a3a6ab;--line:#33373c;--tileBg:#2b2f34;--glyph:#f2f0ea;--link:#8db4f5}}
:root[data-theme="dark"]{--bg:#15171a;--card:#1f2226;--ink:#ecebe7;--muted:#a3a6ab;--line:#33373c;--tileBg:#2b2f34;--glyph:#f2f0ea;--link:#8db4f5}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow-x:hidden}
main{max-width:1100px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:1.7rem;margin:0 0 .3em}
.intro{color:var(--muted);margin:0 0 1.2em;max-width:46em}
.intro b{color:var(--ink)}
section{border-top:1px solid var(--line);padding:18px 0 8px}
.cands{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.cand{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;display:grid;grid-template-columns:auto 1fr;grid-template-areas:"l big" "tiles tiles" "cap cap";gap:10px;align-items:center;min-width:0}
.letter{grid-area:l;font-size:2.6rem;font-weight:800;line-height:1;width:1.2em;text-align:center}
.big{grid-area:big;justify-self:start;background:var(--tileBg);border-radius:10px;padding:8px;color:var(--glyph);line-height:0}
.tiles{grid-area:tiles;display:flex;gap:8px;flex-direction:column}
.disc{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;box-shadow:0 0 0 2px rgba(0,0,0,.35);flex:none}
.map{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#5d8a3a;border-radius:10px;padding:10px}
.map .tile{display:inline-flex;width:52px;height:52px;align-items:center;justify-content:center;background:#6f9c48;border:1px solid rgba(0,0,0,.2)}
.map .row{display:flex;gap:6px}
.panel,.listrow{display:flex;align-items:center;gap:8px;background:#1c2530;color:#f4f4f4;border-radius:10px;padding:8px 12px;font-size:.9rem}
.listrow .sub{margin-left:auto;color:#aab6c2}
figcaption{grid-area:cap;font-size:.85rem;color:var(--muted);overflow-wrap:anywhere}
figcaption b{color:var(--ink);font-size:.95rem}
a{color:var(--link)}
footer{margin-top:24px;font-size:.85rem;color:var(--muted)}
@media (max-width:420px){.cands{grid-template-columns:1fr}}
</style></head>
<body><svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
${symbols.join('\n')}
</defs></svg>
<main>
<h1>New Unit Icons</h1>
<p class="intro">Round 19's three new units need icons: the <b>Spy</b>, <b>Modern Infantry</b> (the Rifleman's successor) and the <b>Drone</b>. Each candidate is shown big, on the map (white on a civ's color, on a tile and beside units it will stand with), in the unit panel, and in the ☰ → Units list. <b>The game uses A for each until you pick.</b></p>
<p class="intro"><b>Tap one icon per unit</b> to pick it (tap again to undo). Your picks are remembered on this device. Then tap <b>Copy my picks</b> (or <b>Share</b>) and paste them into the chat.</p>
${SUBJECTS.map((sub) => `<section><h2>${sub.name}</h2><div class="cands">
${sub.list.map((c) => candHtml(sub, c)).join('\n')}
</div></section>`).join('\n')}
<footer>Icons: game-icons.net, CC BY 3.0 (creativecommons.org/licenses/by/3.0). Authors are named under each icon. Full list: docs/spy-icon-candidates/SOURCES.md.</footer>
</main>
${pickerStyle}
${pickerBar.replace(/0 of 10 picked/, `0 of ${SUBJECTS.length} picked`)}
${pickerScript}
</body></html>
`;
writeFileSync(PAGE, html);
console.log(`make-spy-icons-page: ${SUBJECTS.length * 3} candidates → ${PAGE} (${Math.round(html.length / 1024)} KB)`);
