import { defineConfig } from 'vitest/config';
import pkg from './package.json';

export default defineConfig({
  // The game's version, shown on the About / Credits screen.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
