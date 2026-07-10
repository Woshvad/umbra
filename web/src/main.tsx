import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import JoinView from './views/JoinView'
import './index.css'

// WOW-07 — the guest 4th-desk mobile route. The QR on `03 Theatre` encodes `/join?round=<id>`
// (URL + roundId only, never a token); this branch renders the standalone mobile `JoinView`
// (no desktop Header/Nav) instead of the full desktop App. Router-lib-free: a simple pathname
// (or `?join` marker) check keeps the single-page bundle unchanged for views 01–06.
const path = typeof window !== 'undefined' ? window.location.pathname.replace(/\/+$/, '') : ''
const isJoin =
  path === '/join' ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('join'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isJoin ? <JoinView /> : <App />}</StrictMode>,
)
