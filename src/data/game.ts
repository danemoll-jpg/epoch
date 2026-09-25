// Round 15: the game's name and app identity, in one place. Everything that shows the name
// (the page title, the title-screen wordmark, About, How to Play, the web app manifest, the
// Home Screen label) reads it from here. Save and settings keys stay `epoch.*` whatever the
// name, so saves survive a rename.

export const GAME = {
  /** The full name: the page title, About, the manifest's `name`. */
  name: 'Epoch: From Stone to Stars',
  /** The short name: under the Home Screen icon (manifest `short_name`), the top bar. */
  shortName: 'Epoch',
  /** The title screen: the large gold wordmark and the smaller line under it. */
  wordmark: 'EPOCH',
  subtitle: 'From Stone to Stars',
  /** One line for the manifest's description and the hub card. */
  tagline: 'Lead a people from the first village to the stars, one turn at a time.',
  /** The app icon's deep blue: the manifest's theme and background colors. */
  themeColor: '#001f57',
  backgroundColor: '#001f57',
} as const;

/** The web app manifest (served as /manifest.webmanifest; built by vite.config.ts). */
export function webManifest(): Record<string, unknown> {
  return {
    name: GAME.name,
    short_name: GAME.shortName,
    description: GAME.tagline,
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Landscape and portrait both allowed.
    orientation: 'any',
    theme_color: GAME.themeColor,
    background_color: GAME.backgroundColor,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
