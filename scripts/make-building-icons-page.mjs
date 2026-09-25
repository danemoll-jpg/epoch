// Round 14 (B3): builds docs/building-icon-candidates.html, Dan's picker for the 17 buildings'
// icons and the wonders' (with one generic wonder icon for those without a sensible one).
// Candidates come from game-icons.net (CC BY 3.0), fetched once from its GitHub source into
// docs/building-icon-candidates/ and normalized as in earlier rounds (viewBox 0 0 512 512, the
// black background square removed, fill="currentColor", a credit comment). The page is one
// self-contained file with the same picker as the other icon pages.
// Run: node scripts/make-building-icons-page.mjs   (needs the network only for missing SVGs)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'docs/building-icon-candidates';
const PAGE = 'docs/building-icon-candidates.html';

/** Subject → candidates [author/icon, label]. Buildings first (in the game's order), then wonders. */
const BUILDINGS = [
  ['granary', 'Granary', [['delapouite/granary', 'Granary'], ['delapouite/barn', 'Barn'], ['delapouite/grain-bundle', 'Grain bundle']]],
  ['barracks', 'Barracks', [['delapouite/barracks', 'Barracks'], ['delapouite/barracks-tent', 'Army tent'], ['lorc/crossed-swords', 'Crossed swords']]],
  ['walls', 'Walls', [['delapouite/stone-wall', 'Stone wall'], ['heavenly-dog/defensive-wall', 'Defensive wall'], ['delapouite/brick-wall', 'Brick wall']]],
  ['library', 'Library', [['delapouite/bookshelf', 'Bookshelf'], ['delapouite/book-pile', 'Book pile'], ['lorc/book-cover', 'Book']]],
  ['marketplace', 'Marketplace', [['delapouite/shop', 'Shop'], ['lorc/scales', 'Scales'], ['delapouite/stockpiles', 'Stockpiles']]],
  ['temple', 'Temple', [['delapouite/greek-temple', 'Greek temple'], ['delapouite/pagoda', 'Pagoda'], ['delapouite/egyptian-temple', 'Egyptian temple']]],
  ['harbor', 'Harbor', [['delapouite/harbor-dock', 'Harbor dock'], ['lorc/anchor', 'Anchor'], ['delapouite/wooden-pier', 'Wooden pier']]],
  ['airport', 'Airport', [['delapouite/control-tower', 'Control tower'], ['delapouite/airplane-departure', 'Departing plane'], ['delapouite/commercial-airplane', 'Airliner']]],
  ['courthouse', 'Courthouse', [['lorc/gavel', 'Gavel'], ['lorc/capitol', 'Capitol'], ['lorc/justice-star', 'Justice star']]],
  ['cathedral', 'Cathedral', [['delapouite/church', 'Church'], ['delapouite/saint-basil-cathedral', 'Domed cathedral'], ['delapouite/byzantin-temple', 'Byzantine temple']]],
  ['colosseum', 'Colosseum', [['sbed/arena', 'Arena'], ['delapouite/theater', 'Theater'], ['lorc/drama-masks', 'Drama masks']]],
  ['university', 'University', [['delapouite/graduate-cap', 'Graduate cap'], ['delapouite/diploma', 'Diploma'], ['delapouite/scroll-quill', 'Scroll and quill']]],
  ['bank', 'Bank', [['delapouite/bank', 'Bank'], ['delapouite/coins-pile', 'Coin pile'], ['delapouite/money-stack', 'Money stack']]],
  ['factory', 'Factory', [['delapouite/factory', 'Factory'], ['lorc/gears', 'Gears'], ['delapouite/factory-arm', 'Factory arm']]],
  ['power_plant', 'Power Plant', [['delapouite/nuclear-plant', 'Cooling towers'], ['delapouite/power-generator', 'Generator'], ['lorc/power-lightning', 'Lightning']]],
  ['research_lab', 'Research Lab', [['lorc/test-tubes', 'Test tubes'], ['delapouite/atom-core', 'Atom'], ['lorc/fizzing-flask', 'Flask']]],
  ['stock_exchange', 'Stock Exchange', [['delapouite/chart', 'Chart'], ['lorc/cash', 'Cash'], ['delapouite/receive-money', 'Money in hand']]],
];
const WONDERS = [
  ['wonder', 'Generic wonder (for any wonder without its own)', [['delapouite/ancient-columns', 'Columns'], ['delapouite/ionic-column', 'Ionic column'], ['delapouite/laurels-trophy', 'Laurels']]],
  ['pyramids', 'Pyramids', [['delapouite/egyptian-pyramids', 'Pyramids'], ['delapouite/great-pyramid', 'Great pyramid']]],
  ['hanging_gardens', 'Hanging Gardens', [['delapouite/vines', 'Vines'], ['delapouite/fruit-tree', 'Fruit tree']]],
  ['colossus', 'Colossus', [['delapouite/colombian-statue', 'Statue'], ['delapouite/lighthouse', 'Lighthouse']]],
  ['oracle', 'Oracle', [['lorc/crystal-ball', 'Crystal ball'], ['delapouite/eye-of-horus', 'Eye']]],
  ['great_library', 'Great Library', [['lorc/book-aura', 'Glowing book'], ['lorc/scroll-unfurled', 'Scroll']]],
  ['great_wall', 'Great Wall', [['delapouite/castle', 'Castle'], ['delapouite/spiked-wall', 'Spiked wall']]],
  ['war_academy', 'War Academy', [['delapouite/sword-altar', 'Sword altar'], ['delapouite/roman-shield', 'Roman shield']]],
  ['grand_bazaar', 'Grand Bazaar', [['delapouite/medieval-pavilion', 'Pavilion'], ['delapouite/shopping-bag', 'Shopping bag']]],
  ['grand_cathedral', 'Grand Cathedral', [['delapouite/saint-basil-cathedral', 'Domed cathedral'], ['lorc/candle-holder', 'Candles']]],
  ['royal_observatory', 'Royal Observatory', [['delapouite/observatory', 'Observatory'], ['delapouite/telescope', 'Telescope']]],
  ['grand_workshop', 'Grand Workshop', [['lorc/gear-hammer', 'Gear and hammer'], ['lorc/anvil', 'Anvil']]],
  ['broadcast_tower', 'Broadcast Tower', [['delapouite/radio-tower', 'Radio tower'], ['delapouite/satellite-communication', 'Satellite dish']]],
  ['global_network', 'Global Network', [['delapouite/server-rack', 'Servers'], ['delapouite/globe-ring', 'Globe ring']]],
  ['world_council', 'World Council', [['lorc/world', 'World'], ['delapouite/podium', 'Podium']]],
  ['global_exchange', 'Global Exchange', [['lorc/globe', 'Globe'], ['delapouite/pay-money', 'Paying money']]],
  ['versailles', 'Versailles (Louis XIV)', [['delapouite/indian-palace', 'Palace'], ['lorc/crown', 'Crown']]],
];
const LETTERS = ['A', 'B', 'C'];

const author = (slug) => slug.split('/')[0].split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ').replace('Heavenly Dog', 'HeavenlyDog');
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
const subjects = [...BUILDINGS.map((b) => [...b, 'building']), ...WONDERS.map((w) => [...w, 'wonder'])];
const sources = [];
const symbols = [];
for (const [id, name, cands] of subjects) {
  for (let i = 0; i < cands.length; i++) {
    const [slug, label] = cands[i];
    const file = `${id.replace(/_/g, '-')}-${LETTERS[i].toLowerCase()}.svg`;
    const path = join(DIR, file);
    if (!existsSync(path)) writeFileSync(path, normalize(await fetchSvg(slug), slug));
    const svg = readFileSync(path, 'utf8');
    const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/<!--.*?-->/, '');
    symbols.push(`<symbol id="i-${file.replace('.svg', '')}" viewBox="0 0 512 512">${inner}</symbol>`);
    sources.push(`| ${file} | ${name} | ${LETTERS[i]} | ${slug.split('/')[1]} | ${author(slug)} | https://game-icons.net/1x1/${slug}.html | CC BY 3.0 |`);
    cands[i] = { slug, label, file, letter: LETTERS[i] };
  }
}

writeFileSync(join(DIR, 'SOURCES.md'), `# Building and wonder icon candidates: sources

All icons are from [game-icons.net](https://game-icons.net) (SVG sources:
https://github.com/game-icons/icons), licensed **CC BY 3.0**
(https://creativecommons.org/licenses/by/3.0/). Whichever icons are used must
credit their authors. The files here are normalized: \`viewBox="0 0 512 512"\`,
the site's black background square removed, the shape's path(s) with
\`fill="currentColor"\`. The shapes themselves are unchanged.

Round 14 (B3): 2–3 candidates for each of the 17 buildings, a generic wonder icon
(for any wonder without its own), and 2 for each wonder. Built by
\`scripts/make-building-icons-page.mjs\`; the picker page is
\`docs/building-icon-candidates.html\` (picks are saved on the device under
\`epoch.buildingIconPicks\`).

| File | Subject | Letter | Icon | Author | Source | License |
|---|---|---|---|---|---|---|
${sources.join('\n')}
`);

// ---- the page ----------------------------------------------------------------------------

const use = (file, px, color) => `<svg width="${px}" height="${px}" aria-hidden="true"><use href="#i-${file.replace('.svg', '')}" width="${px}" height="${px}"${color ? ` style="color:${color}"` : ''}/></svg>`;

function candHtml(subject, c) {
  return `<figure class="cand"><div class="letter">${c.letter}</div>
<div class="big">${use(c.file, 96)}</div>
<div class="tiles">
<div class="buildrow">${use(c.file, 28, '#f0e2b6')}<span>${subject}</span><span class="cost">60</span></div>
<div class="chip">${use(c.file, 18, '#dfe7ef')}<span>${subject}</span></div>
</div>
<figcaption><b>${c.label}</b><br>${iconName(c.slug)} by ${author(c.slug)} · <a href="https://game-icons.net/1x1/${c.slug}.html">game-icons.net</a> · CC BY 3.0</figcaption></figure>`;
}

function section([, name, cands]) {
  return `<section><h2>${name}</h2><div class="cands">
${cands.map((c) => candHtml(name.replace(/ \(.*\)$/, ''), c)).join('\n')}
</div></section>`;
}

const overview = (list) => `<div class="ovgrid">${list
  .map(([, name, cands]) => `<div class="ovc" data-subject="${name}"><span class="ovl">A</span>${cands.map((c) => `<span class="ovv" data-l="${c.letter}"${c.letter === 'A' ? '' : ' hidden'}>${use(c.file, 36)}</span>`).join('')}<span class="ovn">${name.replace(/ \(.*\)$/, '')}</span></div>`)
  .join('')}</div>`;

// The picker script and its bar are the same as on the other icon pages.
const religion = readFileSync('docs/religion-road-icon-candidates.html', 'utf8');
const pickerStyle = religion.slice(religion.lastIndexOf('<style>'), religion.indexOf('</style>', religion.lastIndexOf('<style>')) + 8);
const pickerBar = religion.slice(religion.indexOf('<div id="pickBar"'), religion.indexOf('<script>', religion.indexOf('<div id="pickBar"')));
const pickerScript = religion
  .slice(religion.indexOf('<script>', religion.indexOf('<div id="pickBar"')), religion.lastIndexOf('</script>') + 9)
  .replace("'epoch.religionIconPicks'", "'epoch.buildingIconPicks'")
  .replace(/Epoch religion icon picks/g, 'Epoch building icon picks');

const total = subjects.length;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Building Icons</title>
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
.cands{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.cand{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;display:grid;grid-template-columns:auto 1fr;grid-template-areas:"l big" "tiles tiles" "cap cap";gap:10px;align-items:center;min-width:0}
.letter{grid-area:l;font-size:2.6rem;font-weight:800;line-height:1;width:1.2em;text-align:center}
.big{grid-area:big;justify-self:start;background:var(--tileBg);border-radius:10px;padding:8px;color:var(--glyph);line-height:0}
.tiles{grid-area:tiles;display:flex;gap:6px;flex-direction:column;align-items:stretch}
.buildrow{display:flex;align-items:center;gap:10px;background:#1c2530;color:#f4f4f4;border-radius:10px;padding:8px 12px;font-weight:600;font-size:.95rem}
.buildrow .cost{margin-left:auto;color:#aab6c2;font-weight:400}
.chip{display:inline-flex;align-self:flex-start;align-items:center;gap:6px;background:#2b3542;color:#dfe7ef;border-radius:14px;padding:3px 10px 3px 6px;font-size:.8rem}
figcaption{grid-area:cap;font-size:.85rem;color:var(--muted);overflow-wrap:anywhere}
figcaption b{color:var(--ink);font-size:.95rem}
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
footer{margin-top:24px;font-size:.85rem;color:var(--muted)}
@media (max-width:420px){.cands{grid-template-columns:1fr}}
</style></head>
<body><svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
${symbols.join('\n')}
</defs></svg>
<main>
<h1>Building Icons</h1>
<p class="intro">Icons for the <b>17 buildings</b> and the <b>wonders</b>. They'll show in the city panel's build list (the dark row, at 28&nbsp;px), next to a building's name where the city lists what it has (the small chip), and on the Almanac cards. Until you pick, the game shows no icon there, as now. For a wonder you can pick its own icon, or leave it and it gets the <b>generic wonder</b> icon.</p>
<p class="intro"><b>Tap one icon per subject</b> to pick it (tap again to undo). Your picks are remembered on this device. When you're done, tap <b>Copy my picks</b> (or <b>Share</b>) and paste the list into the chat. The picks get wired in the round after.</p>
<div class="overview"><h2>Overview: buildings</h2><p>Your pick for each, or A until you pick. They sit in one list in the game, so they should look different from each other.</p>${overview(BUILDINGS)}</div>
<div class="overview"><h2>Overview: wonders</h2>${overview(WONDERS)}</div>
<h2 class="group">Buildings</h2>
${BUILDINGS.map(section).join('\n')}
<h2 class="group">Wonders</h2>
${WONDERS.map(section).join('\n')}
<footer>Icons: game-icons.net, CC BY 3.0 (creativecommons.org/licenses/by/3.0). Authors are named under each icon. Full list: docs/building-icon-candidates/SOURCES.md.</footer>
</main>
${pickerStyle}
${pickerBar.replace(/0 of 10 picked/, `0 of ${total} picked`)}
${pickerScript}
</body></html>
`;
writeFileSync(PAGE, html);
console.log(`make-building-icons-page: ${subjects.length} subjects, ${symbols.length} icons → ${PAGE} (${Math.round(html.length / 1024)} KB)`);
