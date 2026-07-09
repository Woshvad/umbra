// web/vitest.config.ts — node-environment vitest config (mirrors solver/vitest.config.ts).
// The pure web/src/lib/*.ts helpers are DOM-free, so a 'node' environment is sufficient
// (no jsdom/RTL needed). Match the solver's vitest@2.1.9 for monorepo parity.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // `.tsx` added for the VIZ-02 Time Machine's DOM-free logic test (10-10): its pure
    // cell-verdict core (bankCell/operatorCell/ordersFromAcs) is exported from a `.tsx`
    // view, so its co-located test carries the `.tsx` extension. Still node-env — the
    // test asserts pure functions, never renders (no jsdom/RTL needed).
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
