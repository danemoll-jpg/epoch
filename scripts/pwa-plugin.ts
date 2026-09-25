/// <reference path="./node-shims.d.ts" />
// Round 15: the Vite plugin for the app side of the game.
// - Fills the name placeholders in index.html (%GAME_NAME%, …) from src/data/game.ts.
// - Serves /manifest.webmanifest (made from the same data) in dev, and writes it in a build.
// - After a build, writes sw.js: the service worker (src/pwa/sw-template.js) with this build's
//   version and the list of files to keep offline (everything but the music, the cloud-save
//   code, and /docs/; those two are kept the first time they're used).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { GAME, webManifest } from '../src/data/game';
import { isOnDemandFile, precacheEntries } from '../src/pwa/files';

const HTML_VARS: Record<string, string> = {
  GAME_NAME: GAME.name,
  GAME_SHORT_NAME: GAME.shortName,
  GAME_WORDMARK: GAME.wordmark,
  GAME_SUBTITLE: GAME.subtitle,
  GAME_THEME_COLOR: GAME.themeColor,
};

function listFiles(dir: string, root = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, root));
    else out.push('/' + relative(root, full).split('\\').join('/'));
  }
  return out;
}

export function pwaPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'epoch-pwa',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml(html) {
      return html.replace(/%(GAME_[A-Z_]+)%/g, (m, k: string) => HTML_VARS[k] ?? m);
    },
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(JSON.stringify(webManifest(), null, 2));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(webManifest(), null, 2) });
    },
    closeBundle() {
      const files = listFiles(outDir);
      const precache = precacheEntries(files);
      const media = files.filter(isOnDemandFile).sort();
      const hash = createHash('sha256');
      for (const f of [...precache, ...media]) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(new URL('../src/pwa/sw-template.js', import.meta.url), 'utf8');
      const head = `const VERSION = ${JSON.stringify(version)};\nconst PRECACHE = ${JSON.stringify(precache)};\nconst MEDIA = ${JSON.stringify(media)};\n`;
      writeFileSync(join(outDir, 'sw.js'), head + template);
    },
  };
}
