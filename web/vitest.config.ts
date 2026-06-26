// web/vitest.config.ts — node-environment vitest config (mirrors solver/vitest.config.ts).
// The pure web/src/lib/*.ts helpers are DOM-free, so a 'node' environment is sufficient
// (no jsdom/RTL needed). Match the solver's vitest@2.1.9 for monorepo parity.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
