// Round 15: which built files the service worker keeps offline (used by scripts/pwa-plugin.ts
// when it writes sw.js, and by the tests). Paths start with "/".

/** The era music and the theme: big, so cached the first time each plays, not up front. */
export function isMusicFile(path: string): boolean {
  return /^\/assets\/music-[^/]*\.mp3$/.test(path);
}

/** Everything the game needs offline: code, styles, icons, portraits, sound effects, the page. */
export function precacheEntries(files: string[]): string[] {
  return files
    .filter((f) => !isMusicFile(f))
    // The service worker itself, source maps, and the dev pages copied into the play build.
    .filter((f) => f !== '/sw.js' && !f.endsWith('.map') && !f.startsWith('/docs/'))
    .sort();
}
