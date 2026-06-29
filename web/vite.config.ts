import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server on :5173, proxying the Canton JSON Ledger API v2 on the cn-quickstart
// LocalNet app-provider participant (:3975) so the browser talks same-origin to
// Vite (sidesteps CORS — the participant doesn't emit CORS headers for :5173). Each
// desk's per-party JWT is forwarded by the proxy in the Authorization header, so the
// participant enforces structural privacy per token.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // §19 cross-node: each desk routes to its OWN participant via a path prefix
      // (from tokens.json `base`); the v2 shim appends /v2/... . Default /v2 →
      // app-provider. Each desk's JWT (Authorization header) is forwarded as-is.
      '/cn/app-user': {
        target: 'http://localhost:2975',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/cn\/app-user/, ''),
      },
      '/cn/sv': {
        target: 'http://localhost:4975',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/cn\/sv/, ''),
      },
      '/v2': { target: 'http://localhost:3975', changeOrigin: true, ws: true },
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
  // The @daml.js bindings are kept ONLY as the typed Daml schema (template/choice
  // companions + payload types + the Side enum); the v2 shim reads ledger data, not
  // @daml/react. @daml/react is dropped; @daml/ledger + @daml/types remain because
  // the generated bindings reference them.
  optimizeDeps: {
    include: [
      '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module',
      '@daml.js/umbra-0.1.0/lib/Umbra/Asset/module',
      '@daml.js/umbra-0.1.0/lib/Umbra/Roles/module',
      '@daml.js/umbra-0.1.0/lib/Umbra/Clearing/module',
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
