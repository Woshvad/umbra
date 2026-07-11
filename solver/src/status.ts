// solver/src/status.ts — the OPS-02 / S1 PUBLIC HEALTH surface. The ONE deliberately
// token-free page: a `/status` JSON builder + a self-contained brand-styled `/status.html`
// document. Endpoint wiring into the Express app lives in plan 13-07; this module is the
// pure, unit-tested core.
//
// AGGREGATE-ONLY DISCIPLINE (mirrors api.ts buildIndicative — lines 348-366): buildStatus
// accepts and emits ONLY venue-health aggregates — venue up/down, current round PHASE NAME,
// last clear price/time (the uniform price is public by design), uptime, build/version. It
// MUST NEVER accept or emit an individual order, desk identity, per-desk fill, bid/limit,
// sealed-order content, token, or operator identifier (Pitfall 7). If in doubt, omit.
// The `/status.html` document is a self-contained HTML/CSS string (NO React, NO Tailwind,
// NO @daml/react context, NO auth) that inlines the binding brand tokens.

// ── The aggregate health input (health-only by construction) ────────────────────────
// Every field here is a venue-level aggregate. There is deliberately NO field that could
// carry an order, a desk, a limit, or a secret — the type itself is the first line of the
// "no private data" guarantee.
export type Health = 'operational' | 'degraded' | 'offline'
export type RoundPhase = 'Open' | 'Sealed' | 'Cleared' | 'Settled' | null

// The current milestone build label surfaced by the token-free /status surface when no explicit
// UMBRA_BUILD env is set (api.ts STATUS_BUILD + index.ts statusSource default). Bumped per
// milestone — now v2.1 / Phase 14 (was the stale 'phase-13'). Aggregate/version string only —
// never a token or private order data.
export const CURRENT_BUILD = 'phase-14'

export interface StatusInput {
  health: Health
  phase: RoundPhase // phase NAME only (never order contents); null = no active round
  lastClearPrice?: number // the public uniform clearing price (e.g. 100.0)
  lastClearAt?: string // ISO timestamp of the last clear
  uptimeSeconds: number
  build: string // build/version string
}

// The wire shape — a strict subset of health aggregates. Keys are a fixed allow-list.
export interface StatusJson {
  health: Health
  phase: RoundPhase
  lastClearPrice?: number
  lastClearAt?: string
  uptimeSeconds: number
  build: string
}

// ── buildStatus: the PURE aggregate mapper ──────────────────────────────────────────
// Copies buildIndicative's withholding mindset: it constructs the response by EXPLICITLY
// listing only the allowed aggregate keys — it never spreads an arbitrary object, so no
// order/desk/token field can ever ride along. Optional clear fields are included only when
// present (a fresh venue with no prior clear omits them rather than emitting nulls).
export function buildStatus(input: StatusInput): StatusJson {
  const out: StatusJson = {
    health: input.health,
    phase: input.phase,
    uptimeSeconds: input.uptimeSeconds,
    build: input.build,
  }
  if (input.lastClearPrice !== undefined) out.lastClearPrice = input.lastClearPrice
  if (input.lastClearAt !== undefined) out.lastClearAt = input.lastClearAt
  return out
}

// ── health → display mapping (pill label + dot color) ───────────────────────────────
const HEALTH_LABEL: Record<Health, string> = {
  operational: 'OPERATIONAL',
  degraded: 'DEGRADED',
  offline: 'OFFLINE',
}
// Lime up-dot for operational; brand red for degraded/offline (13-UI-SPEC S1 states).
const HEALTH_DOT: Record<Health, string> = {
  operational: '#D6FB3C',
  degraded: '#E2231A',
  offline: '#E2231A',
}

// Phase display: null → the idle sentinel `— IDLE`; otherwise the phase name uppercased.
const phaseLabel = (phase: RoundPhase): string => (phase === null ? '— IDLE' : phase.toUpperCase())

// Last-clear display: `$100.00 @ 14:32:07 UTC` or the em-dash placeholder if none yet.
const clearLabel = (status: StatusJson): string => {
  if (status.lastClearPrice === undefined) return '—'
  const price = `$${status.lastClearPrice.toFixed(2)}`
  if (!status.lastClearAt) return price
  // Render only the HH:MM:SS UTC time portion — no order-derivable detail.
  const t = new Date(status.lastClearAt)
  const hh = String(t.getUTCHours()).padStart(2, '0')
  const mm = String(t.getUTCMinutes()).padStart(2, '0')
  const ss = String(t.getUTCSeconds()).padStart(2, '0')
  return `${price} @ ${hh}:${mm}:${ss} UTC`
}

// Uptime display: compact `Dd HHh MMm SSs`, dropping leading zero units.
const uptimeLabel = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (d || h) parts.push(`${h}h`)
  if (d || h || m) parts.push(`${m}m`)
  parts.push(`${sec}s`)
  return parts.join(' ')
}

// Minimal HTML-escape for the few interpolated aggregate strings (build/version). No user
// order content is ever placed here, but escaping keeps the document robust regardless.
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ── renderStatusHtml: the self-contained brand-styled S1 document ───────────────────
// A single HTML string with inlined brand tokens (paper #F4F1EA / ink #0A0A0A / lime
// #D6FB3C / red #E2231A), Google Fonts (Space Grotesk + IBM Plex Mono) with system-ui /
// monospace fallbacks, the UMBRA wordmark (30px Space Grotesk -.02em), the persistent
// honest-label tag, the metric rows (PHASE / LAST CLEAR / UPTIME / BUILD), the health pill,
// the idle empty-state, and a client-side poll of /status with the feed-unreachable notice.
// NO React, NO Tailwind, NO auth context.
export function renderStatusHtml(status: StatusJson): string {
  const label = HEALTH_LABEL[status.health]
  const dot = HEALTH_DOT[status.health]
  const idle = status.phase === null
  const emptyState = idle
    ? `<div class="empty"><h2>NO ACTIVE ROUND</h2><p>Venue idle — waiting for the next round to open.</p></div>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>UMBRA VENUE STATUS</title>
<!-- PUBLIC HEALTH document — token-free, aggregate-only. Serves ZERO private order data. -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet" />
<style>
  :root {
    --paper: #F4F1EA;
    --ink: #0A0A0A;
    --lime: #D6FB3C;
    --red: #E2231A;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #F4F1EA;
    color: #0A0A0A;
    font-family: 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    padding: 48px 20px;
  }
  .col { width: 100%; max-width: 520px; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .wordmark {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 30px;
    letter-spacing: -.02em;
    line-height: 1;
  }
  .honest {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 9px;
    letter-spacing: .12em;
    text-transform: uppercase;
    border: 1px solid var(--ink);
    padding: 5px 8px;
  }
  h1.heading {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: .08em;
    text-transform: uppercase;
    opacity: .55;
    margin: 24px 0 12px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: .04em;
    margin-bottom: 20px;
  }
  .dot { width: 11px; height: 11px; border-radius: 50%; background: ${dot}; }
  .rows { border-top: 1px solid var(--ink); }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 14px 0;
    border-bottom: 1px solid rgba(10,10,10,.16);
  }
  .row .k {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 10px;
    letter-spacing: .14em;
    text-transform: uppercase;
    opacity: .5;
  }
  .row .v {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 22px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .empty { margin: 20px 0; }
  .empty h2 {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 15px; font-weight: 600; letter-spacing: .04em; margin: 0 0 6px;
  }
  .empty p { font-size: 13px; opacity: .6; margin: 0; }
  #unreachable {
    display: none;
    margin-top: 20px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    color: var(--red);
  }
  footer { margin-top: 28px; font-family: 'IBM Plex Mono', monospace; font-size: 9px; opacity: .4; letter-spacing: .1em; }
</style>
</head>
<body>
  <div class="col">
    <header>
      <div class="wordmark">UMBRA</div>
      <div class="honest">PUBLIC HEALTH · NO PRIVATE ORDER DATA</div>
    </header>
    <h1 class="heading">UMBRA VENUE STATUS</h1>
    <div class="pill" id="pill"><span class="dot" id="dot"></span><span id="pill-label">${label}</span></div>
    ${emptyState}
    <div class="rows">
      <div class="row"><span class="k">PHASE</span><span class="v" id="v-phase">${esc(phaseLabel(status.phase))}</span></div>
      <div class="row"><span class="k">LAST CLEAR</span><span class="v" id="v-clear">${esc(clearLabel(status))}</span></div>
      <div class="row"><span class="k">UPTIME</span><span class="v" id="v-uptime">${esc(uptimeLabel(status.uptimeSeconds))}</span></div>
      <div class="row"><span class="k">BUILD</span><span class="v" id="v-build">${esc(status.build)}</span></div>
    </div>
    <div id="unreachable">STATUS UNAVAILABLE — cannot reach the venue. Retrying…</div>
    <footer>UMBRA · PUBLIC HEALTH · AGGREGATE ONLY</footer>
  </div>
  <script>
    // Browser auto-refresh poll of the aggregate /status JSON. Reduced-motion friendly:
    // no animation — just a periodic re-fetch. On a fetch failure the full-page notice shows
    // and polling continues (feed-unreachable state). NO auth, NO token — /status is public.
    var DOT = { operational: '#D6FB3C', degraded: '#E2231A', offline: '#E2231A' };
    var LABEL = { operational: 'OPERATIONAL', degraded: 'DEGRADED', offline: 'OFFLINE' };
    function fmtClear(s) {
      if (s.lastClearPrice === undefined || s.lastClearPrice === null) return '—';
      var p = '$' + Number(s.lastClearPrice).toFixed(2);
      if (!s.lastClearAt) return p;
      var t = new Date(s.lastClearAt);
      function z(n){ return String(n).padStart(2,'0'); }
      return p + ' @ ' + z(t.getUTCHours()) + ':' + z(t.getUTCMinutes()) + ':' + z(t.getUTCSeconds()) + ' UTC';
    }
    function fmtUptime(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      var d = Math.floor(sec/86400), h = Math.floor((sec%86400)/3600), m = Math.floor((sec%3600)/60), s = sec%60;
      var parts = [];
      if (d) parts.push(d+'d');
      if (d||h) parts.push(h+'h');
      if (d||h||m) parts.push(m+'m');
      parts.push(s+'s');
      return parts.join(' ');
    }
    async function poll() {
      try {
        var res = await fetch('/status', { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('http ' + res.status);
        var s = await res.json();
        document.getElementById('unreachable').style.display = 'none';
        document.getElementById('dot').style.background = DOT[s.health] || '#E2231A';
        document.getElementById('pill-label').textContent = LABEL[s.health] || 'OFFLINE';
        document.getElementById('v-phase').textContent = (s.phase == null) ? '— IDLE' : String(s.phase).toUpperCase();
        document.getElementById('v-clear').textContent = fmtClear(s);
        document.getElementById('v-uptime').textContent = fmtUptime(s.uptimeSeconds);
        document.getElementById('v-build').textContent = s.build || '';
      } catch (e) {
        // Feed unreachable — show the notice, keep polling.
        document.getElementById('unreachable').style.display = 'block';
      }
    }
    poll();
    setInterval(poll, 5000);
  </script>
</body>
</html>`
}
