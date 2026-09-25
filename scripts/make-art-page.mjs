// Round 14 (B1, B2): builds docs/terrain-style-candidates.html, Dan's picker for the terrain
// and city styles. The page draws with the game's own renderer (src/render/art.ts through
// src/dev/artPreview.ts), bundled into one inline script, so the page is a single file that
// needs nothing from the web and shows exactly what the game would draw.
// Run after changing the art: node scripts/make-art-page.mjs

import { writeFileSync } from 'node:fs';
import { build } from 'vite';

const out = await build({
  configFile: false,
  logLevel: 'warn',
  define: { __APP_VERSION__: JSON.stringify('art-preview'), 'import.meta.env.DEV': 'false' },
  build: {
    write: false,
    minify: true,
    lib: { entry: 'src/dev/artPreview.ts', formats: ['iife'], name: 'ArtPreview', fileName: () => 'art.js' },
    assetsInlineLimit: 100_000_000,
  },
});
const chunks = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output);
const js = chunks.find((c) => c.type === 'chunk')?.code;
if (!js) throw new Error('no bundle');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Terrain and City Styles</title>
<style>
:root{--bg:#f4f1ea;--card:#ffffff;--ink:#1d1f22;--muted:#5d6166;--line:#ddd8cc;--accent:#c9952a;--pick:#2f8a4a;--bar:#ffffffee}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15171a;--card:#1f2226;--ink:#ecebe7;--muted:#a3a6ab;--line:#33373c;--accent:#e6b73f;--pick:#4cc070;--bar:#1f2226ee}}
:root[data-theme="dark"]{--bg:#15171a;--card:#1f2226;--ink:#ecebe7;--muted:#a3a6ab;--line:#33373c;--accent:#e6b73f;--pick:#4cc070;--bar:#1f2226ee}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow-x:hidden}
main{max-width:1100px;margin:0 auto;padding:20px 16px 120px}
h1{font-size:1.7rem;margin:0 0 .3em}
h2{font-size:1.35rem;margin:28px 0 6px;padding-top:14px;border-top:2px solid var(--line)}
h3{font-size:1.15rem;margin:0 0 4px;display:flex;align-items:center;gap:10px}
.intro{color:var(--muted);max-width:48em;margin:0 0 1em}
.intro b{color:var(--ink)}
.muted{color:var(--muted);font-weight:400;font-size:.9em}
.letter{display:inline-flex;align-items:center;justify-content:center;min-width:2.1em;height:2.1em;border-radius:10px;background:var(--ink);color:var(--bg);font-weight:800;padding:0 .4em}
section.style{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin:14px 0}
section.style.picked{border:3px solid var(--pick)}
.sum{color:var(--muted);margin:0 0 10px}
.zooms{display:flex;flex-direction:column;gap:12px}
figure{margin:0}
figure canvas{display:block;max-width:100%;border-radius:8px}
figcaption{font-size:.85rem;color:var(--muted);margin-top:4px}
.cityGrid{display:grid;grid-template-columns:84px repeat(5,64px);gap:8px;align-items:center;justify-items:center;justify-content:start;overflow-x:auto;padding-bottom:4px}
.cityGrid .hd{font-size:.8rem;text-align:center;line-height:1.2}
.cityGrid .rowhd{font-size:.85rem;justify-self:end;padding-right:4px}
.cityGrid canvas{border-radius:6px}
.smallRow{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}
button{font:inherit;min-height:44px;padding:8px 16px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
button.pick{margin-top:12px;font-weight:700}
button.pick.on{background:var(--pick);border-color:var(--pick);color:#fff}
#together canvas{display:block;max-width:100%;border-radius:10px}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--bar);border-top:1px solid var(--line);padding:10px 16px calc(10px + env(safe-area-inset-bottom));display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
#pickText{font-weight:700}
#copyMsg{flex-basis:100%;text-align:center;font-size:.85rem;color:var(--muted);white-space:pre-line}
#copyMsg:empty{display:none}
#copyText{flex-basis:100%;min-height:4em;font:14px/1.4 ui-monospace,Menlo,Consolas,monospace;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:8px}
#copyText[hidden]{display:none}
</style></head>
<body><main id="app">
<h1>Terrain and city styles</h1>
<p class="intro">Every picture on this page is drawn by the game's own code, on a small made-up map with <b>every terrain</b>, a coastline and an island, two civs' cities (one walled, a capital, a holy city), units on land and sea, resources, a hut, a barbarian village, a road and a railroad, and <b>fog</b> (the dim tiles are explored but out of sight). Pick <b>one terrain style</b> (A, B, or C) and <b>one city style</b> (A or B); they don't have to match. "Now" is today's look, for comparison. The bottom of the page shows your two picks together. Then tap <b>Copy my picks</b> and paste them into the chat.</p>
<h2>Terrain</h2>
<div id="terrain"></div>
<h2>Cities</h2>
<p class="intro">A city's look follows its size (village, town, city, metropolis) and its owner's era (rows). Walls are drawn when a city has them. The capital star, religion, and holy-city badges stay as they are, drawn over the city.</p>
<div id="cities"></div>
<h2>Your picks together</h2>
<div id="together"></div>
</main>
<div class="bar"><span id="pickText"></span><button id="copyBtn" type="button">Copy my picks</button><button id="shareBtn" type="button">Share</button><div id="copyMsg"></div><textarea id="copyText" readonly hidden aria-label="Your picks as text"></textarea></div>
<script>${js.replace(/<\/script/g, '<\\/script')}</script>
</body></html>
`;
writeFileSync('docs/terrain-style-candidates.html', html);
console.log(`make-art-page: docs/terrain-style-candidates.html (${Math.round(html.length / 1024)} KB)`);
