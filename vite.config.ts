import { defineConfig } from 'vitest/config';
import pkg from './package.json';
import { pwaPlugin } from './scripts/pwa-plugin';

export default defineConfig({
  // The game's version, shown on the About / Credits screen.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Round 15: the name in index.html, the web app manifest, and the offline service worker.
  plugins: [pwaPlugin()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
