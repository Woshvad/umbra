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
})
