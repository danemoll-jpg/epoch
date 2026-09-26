// Round 19 (item 6): builds docs/leader-scenes.html, the check page for the full-screen leader
// scenes: all 12 leaders at iPad portrait (820×1180), iPad landscape (1180×820), and a PC
// (1920×1080), drawn with the same layout as the game (sceneLayout in src/ui/portraits.ts and
// style.css): the picture top 60% (portrait) or left 58% (wide), cropped around each leader's
// `sceneFocus` (src/data/civs.ts), and the words below or beside it. Self-contained (the
// pictures are embedded), so it opens from the play server or straight from the disk.
// Run: node scripts/make-leader-scenes-page.mjs   (after python scripts/make-scene-webp.py)

import { readFileSync, writeFileSync } from 'node:fs';

const civsSrc = readFileSync('src/data/civs.ts', 'utf8');
const civs = [];
for (const m of civsSrc.matchAll(/id: '([a-z_]+)', name: '([^']+)'[^\n]*leader: '([^']+)', color: '(#[0-9a-f]+)'[^\n]*\n\s*sceneFocus: \{ x: ([\d.]+), y: ([\d.]+) \}/g)) {
  civs.push({ id: m[1], name: m[2], leader: m[3], color: m[4], fx: Number(m[5]), fy: Number(m[6]) });
}
if (civs.length !== 12) throw new Error(`expected 12 leaders with a sceneFocus, found ${civs.length}`);
const SIZES = [
  { id: 'portrait', label: 'iPad portrait 820×1180', w: 820, h: 1180, scale: 0.26 },
  { id: 'landscape', label: 'iPad landscape 1180×820', w: 1180, h: 820, scale: 0.26 },
  { id: 'pc', label: 'PC 1920×1080', w: 1920, h: 1080, scale: 0.17 },
];
const img = (id) => `data:image/webp;base64,${readFileSync(`src/assets/portraits-full/scene-${id}.webp`).toString('base64')}`;

function scene(c, s) {
  const wide = s.w > s.h;
  const pic = wide ? `left:0;top:0;width:58%;height:100%` : `left:0;top:0;width:100%;height:60%`;
  const text = wide ? `left:56%;top:0;width:44%;height:100%;justify-content:center` : `left:0;top:52%;width:100%;height:48%;justify-content:flex-start`;
  const fade = wide ? 'linear-gradient(to right,transparent 60%,rgba(5,8,12,.8) 92%,#05080c)' : 'linear-gradient(to bottom,transparent 55%,rgba(5,8,12,.85) 88%,#05080c)';
  return `<figure class="shot" style="width:${Math.round(s.w * s.scale)}px;height:${Math.round(s.h * s.scale)}px">
<div class="screen" style="width:${s.w}px;height:${s.h}px;transform:scale(${s.scale})">
<div class="pic" style="${pic};background-image:var(--img-${c.id});background-position:${Math.round(c.fx * 100)}% ${Math.round(c.fy * 100)}%"><div class="fade" style="background:${fade}"></div><div class="face" style="left:${c.fx * 100}%;top:${c.fy * 100}%"></div></div>
<div class="words" style="${text}"><div class="kicker">${c.name} · Neutral</div><div class="name">${c.leader}</div>
<div class="speech">“You have my attention. Speak.”</div><div class="line">Tribute demanded: ${c.leader} of ${c.name} demands 40 gold as tribute.</div>
<div class="btns"><span>Refuse</span><span>Give</span></div></div>
</div><figcaption>${s.label}</figcaption></figure>`;
}

const vars = civs.map((c) => `--img-${c.id}:url(${img(c.id)})`).join(';');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Leader Scenes</title>
<style>
:root{--bg:#f4f1ea;--card:#fff;--ink:#1d1f22;--muted:#5d6166;--line:#ddd8cc;${vars}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15171a;--card:#1f2226;--ink:#ecebe7;--muted:#a3a6ab;--line:#33373c}}
:root[data-theme="dark"]{--bg:#15171a;--card:#1f2226;--ink:#ecebe7;--muted:#a3a6ab;--line:#33373c}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow-x:hidden}
main{max-width:1200px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:1.7rem;margin:0 0 .3em}
.intro{color:var(--muted);max-width:48em}
.intro b{color:var(--ink)}
section{border-top:1px solid var(--line);padding:16px 0}
h2{margin:0 0 10px;font-size:1.25rem}
.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
.shot{margin:0;position:relative;overflow:hidden;border-radius:8px;border:1px solid var(--line);background:#05080c}
.screen{position:absolute;left:0;top:0;transform-origin:0 0;background:#05080c;font-family:system-ui,sans-serif}
.pic{position:absolute;background-size:cover;overflow:hidden}
.fade{position:absolute;inset:0}
.face{position:absolute;width:40px;height:40px;margin:-20px 0 0 -20px;border:4px solid #ff3b3b;border-radius:50%;display:none}
body.showFace .face{display:block}
.words{position:absolute;display:flex;flex-direction:column;align-items:center;text-align:center;padding:24px;color:#fff}
.kicker{color:#e6b73f;letter-spacing:.14em;text-transform:uppercase;font-weight:700;font-size:13px}
.name{font-size:32px;font-weight:800;margin:2px 0 8px}
.speech{background:#f4efe2;color:#1d1f22;border-radius:14px;padding:12px 16px;font-style:italic;font-size:18px;max-width:520px;margin-bottom:12px}
.line{font-size:16px;margin-bottom:14px}
.btns{display:flex;gap:10px}.btns span{background:#243447;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:12px 26px;font-weight:600}
figcaption{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);color:#fff;font-size:11px;padding:2px 6px}
label{display:inline-flex;gap:6px;align-items:center;margin:6px 0 10px;cursor:pointer}
</style></head>
<body><main>
<h1>Leader Scenes</h1>
<p class="intro">Round 19: when you meet a civ, open it in 🤝 Diplomacy, get a demand or an offer, or go to war or make peace, <b>their leader fills the screen</b> (your original, uncropped pictures). Here is each of the 12 at three screen shapes, laid out exactly as the game does: on a tall screen the picture is on top and the words below; on a wide one the picture is on the left and the words on the right. <b>Please check every crop: the face should never be cut off or covered.</b> Tell me any leader to nudge (say "Mali: higher", "Germany: more to the left").</p>
<label><input type="checkbox" id="showFace"> Show where I placed each face (the crop's focus point)</label>
${civs.map((c) => `<section><h2>${c.leader} <span style="color:var(--muted);font-weight:400">· ${c.name}</span></h2><div class="row">${SIZES.map((s) => scene(c, s)).join('')}</div></section>`).join('\n')}
<p class="intro">The pictures: 1200 px WebP, ${Math.round(civs.reduce((n, c) => n + readFileSync(`src/assets/portraits-full/scene-${c.id}.webp`).length, 0) / 1024)} KB for all 12; each is downloaded the first time its scene shows (not up front). Your PNG originals are in docs/portraits-full-master/.</p>
</main>
<script>document.getElementById('showFace').addEventListener('change',function(e){document.body.classList.toggle('showFace',e.target.checked)});</script>
</body></html>
`;
writeFileSync('docs/leader-scenes.html', html);
console.log(`make-leader-scenes-page: ${civs.length} leaders × ${SIZES.length} sizes → docs/leader-scenes.html (${Math.round(html.length / 1024)} KB)`);
