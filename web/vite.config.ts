import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server on :5173, proxying the JSON API on :7575 so the browser talks
// same-origin to Vite (sidesteps CORS on Windows — RESEARCH Pitfall 4).
// Use httpBaseUrl '/' + wsBaseUrl ws://<host>/ in the app (web/src/config.ts).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: 'http://localhost:7575', changeOrigin: true, ws: true },
    },
  },
  // The generated @daml.js/umbra-0.1.0 bindings are CommonJS (no "type":"module";
  // each module assigns `exports.X = ...` dynamically) AND each `module.js` does
  // `require('@daml.js/<hash>')` for transitive daml-prim/stdlib bindings + sibling
  // `require('../../Umbra/*/module')`. In dev, Vite must PRE-BUNDLE the exact DEEP
  // subpaths the app imports — listing only the package root leaves those modules
  // served raw, so the transitive `require(...)` never resolves and named exports
  // (Round/RoundStats/Order/Venue/Side) come back `undefined` → `useStreamQueries(
  // undefined)` throws → blank #root. Including the deep `/lib/Umbra/*/module` paths
  // makes esbuild bundle each (resolving the requires) and expose named ESM exports.
  optimizeDeps: {
    include: [
      '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module',
      '@daml.js/umbra-0.1.0/lib/Umbra/Asset/module',
      '@daml.js/umbra-0.1.0/lib/Umbra/Roles/module',
      '@daml.js/umbra-0.1.0/lib/Umbra/Clearing/module',
      '@daml/react',
      '@daml/ledger',
      '@daml/types',
    ],
  },
  build: {
    commonjsOptions: {
      // Allow the CJS interop transform to reach the linked (file:) bindings package.
      include: [/daml\.js\/umbra-0\.1\.0/, /node_modules/],
    },
  },
})
