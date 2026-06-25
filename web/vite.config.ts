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
  // each module assigns `exports.X = ...` dynamically). Pre-bundle them with esbuild
  // so Rollup sees proper named ESM exports for the deep `/lib/Umbra/*/module`
  // subpaths the app imports (Order/Asset/Round/RoundStats/Venue/Side).
  optimizeDeps: {
    include: ['@daml.js/umbra-0.1.0', '@daml/react', '@daml/ledger', '@daml/types'],
  },
  build: {
    commonjsOptions: {
      // Allow the CJS interop transform to reach the linked (file:) bindings package.
      include: [/daml\.js\/umbra-0\.1\.0/, /node_modules/],
    },
  },
})
