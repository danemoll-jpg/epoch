// Round 15: which built files the service worker keeps offline (used by scripts/pwa-plugin.ts
// when it writes sw.js, and by the tests). Paths start with "/".

/** The era music and the theme: big, so cached the first time each plays, not up front. */
export function isMusicFile(path: string): boolean {
  return /^\/assets\/music-[^/]*\.mp3$/.test(path);
}

/**
 * Round 16: the cloud-save code (the Firebase SDK, and the gzip fallback for older browsers).
 * Only players who sign in need it, so it isn't downloaded up front either: like the music,
 * it's kept the first time it loads (so a signed-in player's game still starts offline).
 */
export function isCloudChunk(path: string): boolean {
  return /^\/assets\/(firebase|gzipFallback)-[^/]*\.js$/.test(path);
}

/** Kept the first time it's used, not downloaded up front: the music and the cloud code. */
export function isOnDemandFile(path: string): boolean {
  return isMusicFile(path) || isCloudChunk(path);
}

/** Everything the game needs offline: code, styles, icons, portraits, sound effects, the page. */
export function precacheEntries(files: string[]): string[] {
  return files
    .filter((f) => !isOnDemandFile(f))
    // The service worker itself, source maps, and the dev pages copied into the play build.
    .filter((f) => f !== '/sw.js' && !f.endsWith('.map') && !f.startsWith('/docs/'))
    .sort();
}
