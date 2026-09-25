import { defineConfig } from 'vitest/config';

// `npm run sim`: the pacing report (scripts/pace-report.sim.ts), kept out of `npm test`.
export default defineConfig({
  test: {
    include: ['scripts/**/*.sim.ts'],
    // Print the report (Vitest hides a passing test's console output otherwise).
    silent: false,
  },
});
