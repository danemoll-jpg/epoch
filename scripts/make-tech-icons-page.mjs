// Round 17 (C1): builds docs/tech-icon-candidates.html, Dan's picker for the 56 technologies'
// icons (3 candidates each, grouped by era). Candidates come from game-icons.net (CC BY 3.0),
// fetched once from its GitHub source into docs/tech-icon-candidates/ and normalized as on the
// other icon pages (viewBox 0 0 512 512, the black background square removed,
// fill="currentColor", a credit comment). Each candidate is shown at the sizes the game will
// use it (the tech tree card, the research picker, the top bar's research chip, a toast), on
// the game's own panel colors. A candidate whose icon the game already uses (for a unit,
// building, wonder, resource, or map mark: any file in src/assets/icons/) says so on its card.
// Run: node scripts/make-tech-icons-page.mjs   (needs the network only for missing SVGs)

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'docs/tech-icon-candidates';
const PAGE = 'docs/tech-icon-candidates.html';

/** Era → techs, each [id, name, [[author/icon, label] × 3]], in the game's order (src/data/techs.ts). */
const ERAS = [
  ['Ancient', [
    ['alphabet', 'Alphabet', [['delapouite/hieroglyph-y', 'Hieroglyph'], ['lorc/rune-stone', 'Rune stone'], ['delapouite/wax-tablet', 'Wax tablet']]],
    ['bronze_working', 'Bronze Working', [['delapouite/sword-mold', 'Casting mold'], ['lorc/cauldron', 'Cauldron'], ['delapouite/bellows', 'Bellows']]],
    ['ceremonial_burial', 'Ceremonial Burial', [['lorc/tombstone', 'Tombstone'], ['lorc/coffin', 'Coffin'], ['delapouite/grave-flowers', 'Grave with flowers']]],
    ['horseback_riding', 'Horseback Riding', [['delapouite/horseshoe', 'Horseshoe'], ['delapouite/saddle', 'Saddle'], ['caro-asercion/cloaked-figure-on-horseback', 'Rider']]],
    ['masonry', 'Masonry', [['delapouite/brick-wall', 'Brick wall'], ['delapouite/trowel', 'Trowel'], ['lorc/stone-block', 'Stone block']]],
    ['pottery', 'Pottery', [['delapouite/painted-pottery', 'Painted pot'], ['delapouite/covered-jar', 'Covered jar'], ['delapouite/column-vase', 'Vase']]],
    ['archery', 'Archery', [['delapouite/bow-arrow', 'Bow and arrow'], ['lorc/archery-target', 'Target'], ['lorc/arrow-flights', 'Arrow flights']]],
    ['writing', 'Writing', [['lorc/quill-ink', 'Quill and ink'], ['delapouite/papyrus', 'Papyrus'], ['delapouite/scroll-quill', 'Scroll and quill']]],
    ['code_of_laws', 'Code of Laws', [['lorc/stone-tablet', 'Stone tablet'], ['lorc/scales', 'Scales'], ['lorc/law-star', 'Law star']]],
    ['currency', 'Currency', [['delapouite/coins', 'Coins'], ['delapouite/coins-pile', 'Coin pile'], ['lorc/crown-coin', 'Crowned coin']]],
    ['iron_working', 'Iron Working', [['lorc/metal-bar', 'Iron bar'], ['lorc/flat-hammer', 'Smith’s hammer'], ['delapouite/sharp-axe', 'Iron axe']]],
    ['the_wheel', 'The Wheel', [['delapouite/stone-wheel', 'Stone wheel'], ['lorc/cartwheel', 'Cartwheel'], ['delapouite/wheelbarrow', 'Wheelbarrow']]],
    ['mathematics', 'Mathematics', [['delapouite/abacus', 'Abacus'], ['delapouite/pencil-ruler', 'Pencil and ruler'], ['delapouite/calculator', 'Calculator']]],
    ['mysticism', 'Mysticism', [['lorc/third-eye', 'Third eye'], ['skoll/pentacle', 'Pentacle'], ['lorc/ankh', 'Ankh']]],
    ['map_making', 'Map Making', [['lorc/treasure-map', 'Map'], ['lorc/folded-paper', 'Folded map'], ['lorc/spyglass', 'Spyglass']]],
  ]],
  ['Medieval', [
    ['monarchy', 'Monarchy', [['delapouite/throne-king', 'King on a throne'], ['delapouite/imperial-crown', 'Imperial crown'], ['delapouite/winged-scepter', 'Scepter']]],
    ['literacy', 'Literacy', [['lorc/open-book', 'Open book'], ['delapouite/book-pile', 'Book pile'], ['skoll/read', 'Reader']]],
    ['construction', 'Construction', [['delapouite/crane', 'Crane'], ['delapouite/stone-bridge', 'Stone bridge'], ['delapouite/pulley-hook', 'Pulley']]],
    ['astronomy', 'Astronomy', [['delapouite/telescope', 'Telescope'], ['lorc/ringed-planet', 'Ringed planet'], ['delapouite/star-formation', 'Constellation']]],
    ['seafaring', 'Seafaring', [['delapouite/sail', 'Sail'], ['delapouite/sailboat', 'Sailboat'], ['lorc/wave-crest', 'Wave']]],
    ['navigation', 'Navigation', [['lorc/compass', 'Compass'], ['delapouite/sextant', 'Sextant'], ['delapouite/ship-wheel', 'Ship’s wheel']]],
    ['philosophy', 'Philosophy', [['caro-asercion/philosopher-bust', 'Philosopher'], ['delapouite/think', 'Thinker'], ['lorc/owl', 'Owl']]],
    ['feudalism', 'Feudalism', [['delapouite/hill-fort', 'Hill fort'], ['delapouite/knight-banner', 'Banner'], ['delapouite/crenel-crown', 'Crenel crown']]],
    ['engineering', 'Engineering', [['delapouite/arch-bridge', 'Arch bridge'], ['lorc/cog', 'Cog'], ['lorc/lever', 'Lever']]],
    ['trade', 'Trade', [['delapouite/caravan', 'Caravan'], ['delapouite/camel', 'Camel'], ['lorc/trade', 'Trade']]],
    ['chivalry', 'Chivalry', [['lorc/barbute', 'Knight’s helm'], ['delapouite/black-knight-helm', 'Great helm'], ['skoll/chess-knight', 'Chess knight']]],
    ['monotheism', 'Monotheism', [['delapouite/jerusalem-cross', 'Cross'], ['lorc/holy-symbol', 'Holy symbol'], ['lorc/angel-wings', 'Angel wings']]],
    ['banking', 'Banking', [['delapouite/bank', 'Bank'], ['delapouite/piggy-bank', 'Piggy bank'], ['lorc/locked-chest', 'Locked chest']]],
    ['university', 'University', [['delapouite/diploma', 'Diploma'], ['delapouite/classical-knowledge', 'Classical knowledge'], ['delapouite/archive-research', 'Archive']]],
    ['invention', 'Invention', [['delapouite/idea', 'Idea'], ['lorc/clockwork', 'Clockwork'], ['delapouite/windmill', 'Windmill']]],
    ['magnetism', 'Magnetism', [['lorc/magnet', 'Magnet'], ['lorc/magnet-blast', 'Magnetic field'], ['lorc/lightning-electron', 'Electron']]],
    ['theology', 'Theology', [['delapouite/prayer-beads', 'Prayer beads'], ['lorc/prayer', 'Prayer'], ['lorc/holy-grail', 'Grail']]],
  ]],
  ['Industrial', [
    ['gunpowder', 'Gunpowder', [['lorc/powder', 'Powder horn'], ['delapouite/powder-bag', 'Powder bag'], ['skoll/musket', 'Musket']]],
    ['physics', 'Physics', [['delapouite/pendulum-swing', 'Pendulum'], ['skoll/atom', 'Atom'], ['delapouite/prism', 'Prism']]],
    ['theory_of_gravity', 'Theory of Gravity', [['lorc/shiny-apple', 'Apple'], ['delapouite/moon-orbit', 'Moon’s orbit'], ['lorc/orbital', 'Orbits']]],
    ['metallurgy', 'Metallurgy', [['delapouite/furnace', 'Furnace'], ['delapouite/melting-metal', 'Molten metal'], ['lorc/cannon-ball', 'Cannonball']]],
    ['democracy', 'Democracy', [['delapouite/vote', 'Vote'], ['lorc/capitol', 'Capitol'], ['delapouite/podium', 'Podium']]],
    ['economics', 'Economics', [['delapouite/pie-chart', 'Pie chart'], ['lorc/profit', 'Profit'], ['delapouite/weight-scale', 'Weighing scale']]],
    ['chemistry', 'Chemistry', [['lorc/erlenmeyer', 'Erlenmeyer flask'], ['lorc/round-bottom-flask', 'Round flask'], ['lorc/bubbling-flask', 'Bubbling flask']]],
    ['steam_engine', 'Steam Engine', [['delapouite/steam', 'Steam'], ['delapouite/steam-blast', 'Steam blast'], ['delapouite/turbine', 'Turbine']]],
    ['conscription', 'Conscription', [['skoll/brodie-helmet', 'Soldier’s helmet'], ['delapouite/meeple-army', 'Army'], ['skoll/rank-2', 'Rank']]],
    ['railroad', 'Railroad', [['delapouite/steam-locomotive', 'Locomotive'], ['delapouite/rail-road', 'Rails'], ['delapouite/railway', 'Railway']]],
    ['electricity', 'Electricity', [['lorc/light-bulb', 'Light bulb'], ['delapouite/electrical-socket', 'Socket'], ['caro-asercion/tesla-coil', 'Tesla coil']]],
    ['industrialization', 'Industrialization', [['delapouite/chimney', 'Chimney'], ['darkzaitzev/big-gear', 'Big gear'], ['delapouite/factory-arm', 'Factory arm']]],
    ['corporation', 'Corporation', [['delapouite/briefcase', 'Briefcase'], ['delapouite/modern-city', 'Office towers'], ['delapouite/office-chair', 'Office chair']]],
  ]],
  ['Modern', [
    ['refining', 'Refining', [['delapouite/refinery', 'Refinery'], ['delapouite/oil-pump', 'Oil pump'], ['delapouite/oil-rig', 'Oil rig']]],
    ['electronics', 'Electronics', [['lorc/circuitry', 'Circuit'], ['delapouite/pocket-radio', 'Radio'], ['delapouite/tv', 'Television']]],
    ['machine_tools', 'Machine Tools', [['delapouite/drill', 'Drill'], ['delapouite/monkey-wrench', 'Wrench'], ['sbed/circular-saw', 'Circular saw']]],
    ['combustion', 'Combustion', [['delapouite/spark-plug', 'Spark plug'], ['lorc/bright-explosion', 'Explosion'], ['lorc/cannister', 'Fuel can']]],
    ['automobile', 'Automobile', [['delapouite/city-car', 'Car'], ['skoll/race-car', 'Race car'], ['delapouite/jeep', 'Jeep']]],
    ['flight', 'Flight', [['skoll/airplane', 'Airplane'], ['delapouite/plane-wing', 'Wing'], ['delapouite/air-balloon', 'Balloon']]],
    ['mass_production', 'Mass Production', [['delapouite/robot-grab', 'Robot arm'], ['delapouite/cargo-crate', 'Crates'], ['delapouite/stack', 'Stack']]],
    ['computers', 'Computers', [['lorc/processor', 'Processor'], ['delapouite/laptop', 'Laptop'], ['delapouite/keyboard', 'Keyboard']]],
    ['rocketry', 'Rocketry', [['lorc/rocket', 'Rocket'], ['lorc/rocket-flight', 'Rocket in flight'], ['delapouite/rocket-thruster', 'Thruster']]],
    ['advanced_flight', 'Advanced Flight', [['delapouite/commercial-airplane', 'Airliner'], ['lorc/radar-dish', 'Radar dish'], ['sbed/jet-pack', 'Jet pack']]],
    ['space_flight', 'Space Flight', [['delapouite/space-shuttle', 'Space shuttle'], ['delapouite/astronaut-helmet', 'Astronaut'], ['lorc/satellite', 'Satellite']]],
  ]],
];
const LETTERS = ['A', 'B', 'C'];

/** Icons the game already shows, by file name (every bundled icon, units to map marks). */
const USED = new Set(readdirSync('src/assets/icons').filter((f) => f.endsWith('.svg')).map((f) => f.replace('.svg', '')));
/** What each used icon is, for the clash note (from the icon credits in src/data/icons.ts). */
const USED_FOR = (() => {
  const src = readFileSync('src/data/icons.ts', 'utf8');
  const out = new Map();
  for (const m of src.matchAll(/(\w+):\s*'([a-z0-9-]+)'/g)) if (USED.has(m[2]) && !out.has(m[2])) out.set(m[2], m[1].replace(/_/g, ' '));
  return out;
})();

const author = (slug) => slug.split('/')[0].split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ').replace('Heavenly Dog', 'HeavenlyDog').replace('Caro Asercion', 'Caro Asercion');
const iconName = (slug) => slug.split('/')[1].split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

async function fetchSvg(slug) {
  const url = `https://raw.githubusercontent.com/game-icons/icons/master/${slug}.svg`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${slug}: HTTP ${r.status}`);
  return r.text();
}

/** The path data of an SVG from game-icons, background square removed, colored by currentColor. */
function normalize(svg, slug) {
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"[^>]*\/?>/g)].map((m) => m[1]).filter((d) => d !== 'M0 0h512v512H0z');
  if (!paths.length) throw new Error(`${slug}: no paths`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!-- ${slug.split('/')[1]} by ${author(slug)}, game-icons.net, CC BY 3.0 -->${paths.map((d) => `<path fill="currentColor" d="${d}"/>`).join('')}</svg>`;
}

mkdirSync(DIR, { recursive: true });
const techs = ERAS.flatMap(([era, list]) => list.map((t) => [...t, era]));
if (techs.length !== 56) throw new Error(`expected 56 techs, got ${techs.length}`);
const seen = new Map();
const sources = [];
const symbols = [];
for (const [id, name, cands] of techs) {
  if (cands.length !== 3) throw new Error(`${id}: ${cands.length} candidates`);
  for (let i = 0; i < cands.length; i++) {
    const [slug, label] = cands[i];
    if (seen.has(slug)) throw new Error(`${slug} is offered for both ${seen.get(slug)} and ${name}`);
    seen.set(slug, name);
    const file = `${id.replace(/_/g, '-')}-${LETTERS[i].toLowerCase()}.svg`;
    const path = join(DIR, file);
    if (!existsSync(path)) writeFileSync(path, normalize(await fetchSvg(slug), slug));
    const svg = readFileSync(path, 'utf8');
    const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/<!--.*?-->/, '');
    symbols.push(`<symbol id="i-${file.replace('.svg', '')}" viewBox="0 0 512 512">${inner}</symbol>`);
    const icon = slug.split('/')[1];
    const clash = USED.has(icon) ? `already used in the game${USED_FOR.has(icon) ? ` (${USED_FOR.get(icon)})` : ''}` : '';
    sources.push(`| ${file} | ${name} | ${LETTERS[i]} | ${icon} | ${author(slug)} | https://game-icons.net/1x1/${slug}.html | CC BY 3.0 |`);
    cands[i] = { slug, label, file, letter: LETTERS[i], clash };
  }
}
const clashes = techs.flatMap(([, name, cands]) => cands.filter((c) => c.clash).map((c) => `${name} ${c.letter}`));

writeFileSync(join(DIR, 'SOURCES.md'), `# Technology icon candidates: sources

All icons are from [game-icons.net](https://game-icons.net) (SVG sources:
https://github.com/game-icons/icons), licensed **CC BY 3.0**
(https://creativecommons.org/licenses/by/3.0/). Whichever icons are used must
credit their authors. The files here are normalized: \`viewBox="0 0 512 512"\`,
the site's black background square removed, the shape's path(s) with
\`fill="currentColor"\`. The shapes themselves are unchanged.

Round 17 (C1): 3 candidates for each of the 56 technologies, none of them an
icon the game already uses${clashes.length ? ` (except ${clashes.join(', ')})` : ''}. Built by
\`scripts/make-tech-icons-page.mjs\`; the picker page is
\`docs/tech-icon-candidates.html\` (picks are saved on the device under
\`epoch.techIconPicks\`).

| File | Technology | Letter | Icon | Author | Source | License |
|---|---|---|---|---|---|---|
${sources.join('\n')}
`);

// ---- the page ----------------------------------------------------------------------------

const use = (file, px, color) => `<svg width="${px}" height="${px}" aria-hidden="true"><use href="#i-${file.replace('.svg', '')}" width="${px}" height="${px}"${color ? ` style="color:${color}"` : ''}/></svg>`;

/** One candidate, at each size the game will show it, on the game's own colors. */
function candHtml(tech, c) {
  return `<figure class="cand"><div class="letter">${c.letter}</div>
<div class="big">${use(c.file, 96)}</div>
<div class="tiles">
<div class="treecard">${use(c.file, 26, '#dfe7ef')}<span><b>${tech}</b><small>4 turns</small></span></div>
<div class="picker">${use(c.file, 44, '#e6b73f')}<span><b>${tech}</b><small>Research this · 4 turns</small></span></div>
<div class="row"><div class="chip">${use(c.file, 18, '#ffffff')}<span>${tech} · 4</span></div>
<div class="toastx">${use(c.file, 20, '#e6b73f')}<span>You learned ${tech}</span></div></div>
</div>
<figcaption><b>${c.label}</b><br>${iconName(c.slug)} by ${author(c.slug)} · <a href="https://game-icons.net/1x1/${c.slug}.html">game-icons.net</a> · CC BY 3.0${c.clash ? `<br><span class="clash">⚠ ${c.clash}</span>` : ''}</figcaption></figure>`;
}

function section([id, name, cands]) {
  return `<section id="t-${id}"><h2>${name}</h2><div class="cands">
${cands.map((c) => candHtml(name, c)).join('\n')}
</div></section>`;
}

const overview = (list) => `<div class="ovgrid">${list
  .map(([, name, cands]) => `<div class="ovc" data-subject="${name}"><span class="ovl">A</span>${cands.map((c) => `<span class="ovv" data-l="${c.letter}"${c.letter === 'A' ? '' : ' hidden'}>${use(c.file, 36)}</span>`).join('')}<span class="ovn">${name}</span></div>`)
  .join('')}</div>`;

// The picker script and its bar are the same as on the other icon pages.
const religion = readFileSync('docs/religion-road-icon-candidates.html', 'utf8');
const pickerStyle = religion.slice(religion.lastIndexOf('<style>'), religion.indexOf('</style>', religion.lastIndexOf('<style>')) + 8);
const pickerBar = religion.slice(religion.indexOf('<div id="pickBar"'), religion.indexOf('<script>', religion.indexOf('<div id="pickBar"')));
const pickerScript = religion
  .slice(religion.indexOf('<script>', religion.indexOf('<div id="pickBar"')), religion.lastIndexOf('</script>') + 9)
  .replace("'epoch.religionIconPicks'", "'epoch.techIconPicks'")
  .replace(/Epoch religion icon picks/g, 'Epoch technology icon picks');
if (!pickerScript.includes("'epoch.techIconPicks'")) throw new Error('picker script: storage key not replaced');

// "Dan's picks" at the bottom: every tech's pick so far, and the short form ("All A except …").
const summaryScript = `<script>
(function () {
  var KEY = 'epoch.techIconPicks';
  var names = ${JSON.stringify(techs.map(([, name]) => name))};
  var eras = ${JSON.stringify(ERAS.map(([era, list]) => [era, list.map(([, name]) => name)]))};
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function render() {
    var picks = load();
    var body = document.getElementById('summaryBody');
    body.innerHTML = eras.map(function (e) {
      return '<tr><th colspan="2">' + e[0] + '</th></tr>' + e[1].map(function (n) {
        return '<tr><td>' + n + '</td><td>' + (picks[n] ? '<b>' + picks[n] + '</b>' : '<span class="none">not picked (A)</span>') + '</td></tr>';
      }).join('');
    }).join('');
    var count = { A: 0, B: 0, C: 0 };
    names.forEach(function (n) { count[picks[n] || 'A']++; });
    var base = ['A', 'B', 'C'].sort(function (a, b) { return count[b] - count[a]; })[0];
    var except = names.filter(function (n) { return (picks[n] || 'A') !== base; }).map(function (n) { return n + ': ' + (picks[n] || 'A'); });
    var picked = names.filter(function (n) { return picks[n]; }).length;
    document.getElementById('summaryShort').textContent = 'Technology icons: all ' + base + (except.length ? ' except ' + except.join(', ') : '') + (picked < names.length ? ' (' + (names.length - picked) + ' not picked yet, counted as A)' : '') + '.';
  }
  document.addEventListener('click', function () { setTimeout(render, 0); });
  document.addEventListener('keydown', function () { setTimeout(render, 0); });
  render();
})();
</script>`;

const total = techs.length;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Technology Icons</title>
<style>
:root{--bg:#f4f1ea;--card:#ffffff;--ink:#1d1f22;--muted:#5d6166;--line:#ddd8cc;--tileBg:#ece8de;--glyph:#1d1f22;--link:#2c62b8;--ovbg:#e4dfd3}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15171a;--card:#1f2226;--ink:#ecebe7;--muted:#a3a6ab;--line:#33373c;--tileBg:#2b2f34;--glyph:#f2f0ea;--link:#8db4f5;--ovbg:#1b1d20}}
:root[data-theme="dark"]{--bg:#15171a;--card:#1f2226;--ink:#ecebe7;--muted:#a3a6ab;--line:#33373c;--tileBg:#2b2f34;--glyph:#f2f0ea;--link:#8db4f5;--ovbg:#1b1d20}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow-x:hidden}
main{max-width:1100px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:1.7rem;margin:0 0 .3em}
.intro{color:var(--muted);margin:0 0 1.2em;max-width:46em}
.intro b{color:var(--ink)}
section{border-top:1px solid var(--line);padding:18px 0 8px}
h2{font-size:1.3rem;margin:0 0 12px}
h2.group{font-size:1.5rem;margin:28px 0 4px;padding-top:14px;border-top:3px solid var(--ink)}
.cands{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}
.cand{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;display:grid;grid-template-columns:auto 1fr;grid-template-areas:"l big" "tiles tiles" "cap cap";gap:10px;align-items:center;min-width:0}
.letter{grid-area:l;font-size:2.6rem;font-weight:800;line-height:1;width:1.2em;text-align:center}
.big{grid-area:big;justify-self:start;background:var(--tileBg);border-radius:10px;padding:8px;color:var(--glyph);line-height:0}
.tiles{grid-area:tiles;display:flex;gap:6px;flex-direction:column;align-items:stretch;background:#0b1016;border-radius:10px;padding:8px}
.tiles b{font-weight:600}
.tiles small{display:block;font-size:.75rem;color:#9fb0c0;font-weight:400}
.treecard{display:flex;align-items:center;gap:8px;max-width:170px;background:#243447;border:1px solid #8cc4ee;color:#f4f4f4;border-radius:8px;padding:6px 10px;font-size:.9rem;line-height:1.2}
.picker{display:flex;align-items:center;gap:10px;background:rgba(16,24,34,.95);border:1px solid rgba(255,255,255,.14);color:#f4f4f4;border-radius:10px;padding:8px 10px;font-size:1.05rem;line-height:1.25}
.row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.chip{display:inline-flex;align-items:center;gap:6px;background:#23405a;color:#fff;border-radius:8px;padding:5px 10px;font-size:.8rem;font-weight:600}
.toastx{display:inline-flex;align-items:center;gap:6px;background:rgba(16,24,34,.95);border:1px solid rgba(255,255,255,.14);color:#f4f4f4;border-radius:10px;padding:5px 10px;font-size:.8rem}
figcaption{grid-area:cap;font-size:.85rem;color:var(--muted);overflow-wrap:anywhere}
figcaption b{color:var(--ink);font-size:.95rem}
.clash{color:#b5651d;font-weight:600}
a{color:var(--link)}
.overview{padding:14px 0 6px}
.overview p{color:var(--muted);margin:0 0 10px;font-size:.9rem;max-width:46em}
.ovgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;background:var(--ovbg);padding:10px;border-radius:10px;color:var(--glyph)}
.ovc{display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center;min-width:0;position:relative}
.ovv[hidden]{display:none}
.ovv{line-height:0}
.ovn{font-size:.72rem;line-height:1.15;color:var(--muted);overflow-wrap:anywhere}
.ovl{position:absolute;top:-4px;left:2px;font-size:.7rem;font-weight:800;background:var(--card);color:var(--muted);border:1px solid var(--line);border-radius:8px;padding:0 5px;line-height:1.4}
.ovc.picked .ovl{background:#2f9e5b;color:#fff;border-color:#2f9e5b}
.summary{border-top:3px solid var(--ink);margin-top:28px;padding-top:14px}
.summary table{border-collapse:collapse;width:100%;max-width:420px;font-size:.92rem}
.summary th{text-align:left;padding:10px 0 4px;font-size:1rem}
.summary td{padding:3px 8px 3px 0;border-bottom:1px solid var(--line)}
.summary .none{color:var(--muted)}
#summaryShort{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;max-width:46em}
footer{margin-top:24px;font-size:.85rem;color:var(--muted)}
@media (max-width:420px){.cands{grid-template-columns:1fr}}
</style></head>
<body><svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
${symbols.join('\n')}
</defs></svg>
<main>
<h1>Technology Icons</h1>
<p class="intro">Icons for the <b>56 technologies</b>, three choices each, grouped by era. Each is shown the way the game will show it: on its <b>tech tree card</b>, big in the <b>research picker</b>, in the top bar's <b>research chip</b>, and in the <b>“You learned …”</b> message. They'll also go on the Almanac cards and the leader cards' starting tech. None of them is an icon the game already uses for a unit, building, wonder, resource, or map mark${clashes.length ? ` (except where a card says so)` : ''}. Until you pick, the game shows no tech icons, as now.</p>
<p class="intro"><b>Tap one icon per technology</b> to pick it (tap again to undo). Your picks are remembered on this device. When you're done, tap <b>Copy my picks</b> (or <b>Share</b>), or use the short form in <b>Dan's picks</b> at the bottom (“all A except …”), and give it to the planning session. The picks get wired in the round after.</p>
${ERAS.map(([era, list]) => `<div class="overview"><h2>Overview: ${era}</h2>${era === 'Ancient' ? '<p>Your pick for each, or A until you pick. Techs of one era sit side by side on the tech screen, so they should look different from each other.</p>' : ''}${overview(list)}</div>`).join('\n')}
${ERAS.map(([era, list]) => `<h2 class="group">${era} era</h2>\n${list.map(section).join('\n')}`).join('\n')}
<div class="summary" id="summary"><h2>Dan's picks</h2>
<p id="summaryShort"></p>
<table><tbody id="summaryBody"></tbody></table></div>
<footer>Icons: game-icons.net, CC BY 3.0 (creativecommons.org/licenses/by/3.0). Authors are named under each icon. Full list: docs/tech-icon-candidates/SOURCES.md.</footer>
</main>
${pickerStyle}
${pickerBar.replace(/0 of 10 picked/, `0 of ${total} picked`)}
${pickerScript}
${summaryScript}
</body></html>
`;
writeFileSync(PAGE, html);
console.log(`make-tech-icons-page: ${techs.length} techs, ${symbols.length} icons, ${clashes.length} clashes → ${PAGE} (${Math.round(html.length / 1024)} KB)`);
