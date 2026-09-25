# The app icon

Dan's icon (2026-09-25): a gold ring with a stone arrowhead rising to a star, on deep blue.

## Where the files live

| File | Size | Used for |
|---|---|---|
| `docs/app-icon/app-icon-1024.png` | 1024×1024 | The master. Not shipped with the game; make the others from it |
| `public/icons/icon-512.png` | 512×512 | Web app manifest (`purpose: any`); Android and desktop installs |
| `public/icons/icon-192.png` | 192×192 | Web app manifest (`purpose: any`) |
| `public/icons/icon-maskable-512.png` | 512×512 | Web app manifest (`purpose: maskable`): the emblem at 78% with blue padding, so a round or squircle mask never cuts it |
| `public/icons/apple-touch-icon-180.png` | 180×180 | The iPad and iPhone Home Screen icon (`<link rel="apple-touch-icon">` in `index.html`) |
| `public/icons/favicon-48.png` | 48×48 | Browser tab icon |
| `public/icons/favicon-32.png` | 32×32 | Browser tab icon |

Anything in `public/` is copied as-is into the build at the same path (so
`public/icons/icon-192.png` is served as `/icons/icon-192.png`), and the offline service worker
keeps a copy of each.

The manifest itself isn't a file in the repo: it's made from `src/data/game.ts` (the name,
short name, and colors) by `scripts/pwa-plugin.ts`, and served as `/manifest.webmanifest`. Its
theme and background color is the icon's deep blue, `#001f57`.

## Replacing the icon later

1. Make a new 1024×1024 PNG master, with the important part inside the middle 80% (the
   maskable version and some Home Screens crop the edges).
2. Resize it to the six files above, **keeping the same file names**, and replace them in
   `public/icons/` (and the master in `docs/app-icon/`). For the maskable one, shrink the
   emblem to about 78% and fill the edge with the background color.
3. If the background color changes, change `themeColor` and `backgroundColor` in
   `src/data/game.ts`.
4. `npm test` checks that every icon exists at its size.
5. On the iPad, an icon already on the Home Screen keeps its old picture: remove it and use
   Share → Add to Home Screen again.
