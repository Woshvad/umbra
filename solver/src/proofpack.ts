// solver/src/proofpack.ts — WOW-05 on-brand proof-pack (HTML render + headless-Chrome PDF).
//
// renderProofPackHtml() produces a PIXEL-ON-BRAND HTML document (paper #F4F1EA / ink #0A0A0A /
// lime #D6FB3C; Space Grotesk / IBM Plex Mono / Inter) that reads like docs/umbra-deck.html —
// its `:root` tokens, Google-Fonts link, and print-color-adjust are copied VERBATIM from the
// deck (docs/umbra-deck.html:8-18). The pack carries all FOUR bundles a judge wants:
//   (1) CLEARING PROOF   — the lime 100.00 hero + matched volume + §4 fills A=10/B=8/C=2
//   (2) BEST-EX RECEIPTS — one per-desk fill receipt at the uniform price
//   (3) FINALITY RECORD  — one atomic transaction + the DvP legs (A↔B 8@100 · A↔C 2@100)
//   (4) AI DECISION BUNDLE — modelId + verified flag + the shareable brief (+ proof hashes)
//
// generateProofPackPdf() writes the HTML to a temp file and spawns SYSTEM headless Chrome
// (Edge fallback) `--print-to-pdf` — the exact approach that renders the pitch deck. On a spawn
// failure (ENOENT / no browser) it returns { pdf:false, html } so the caller can serve the
// on-brand HTML for window.print() (RESEARCH A1 / Open Q2). Zero new npm deps (T-08-05-SPAWN):
// the box already has Chrome AND Edge; the flags are fixed literals.
//
// SECURITY: the HTML is composed ONLY from numbers + the brief + hashes — it NEVER interpolates
// the ANTHROPIC_API_KEY, the operator token, or the raw prompt (T-08-05-PACK). The child_process
// spawn is DEPENDENCY-INJECTED so tests never launch a real browser or write a real PDF.

import { execFile as nodeExecFile } from 'node:child_process'
import { writeFileSync as nodeWriteFileSync, mkdirSync, unlinkSync as nodeUnlinkSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import type { Allocation } from './auction.js'

// ── Brand tokens — copied VERBATIM from docs/umbra-deck.html:8-18 ─────────────────
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap'

// The AI decision bundle surfaced on the pack — model id + verified flag + (optional) proof
// hashes. NEVER a secret: hashes are irreversible fingerprints, the brief is presentational.
export interface ProofPackAiBundle {
  modelId: string
  verified: boolean
  systemPromptHash?: string
  clearingHash?: string
  source?: string
}

// AUCT-04 — a per-desk best-ex / TCA receipt for the proof-pack's bundle 02. Carries the
// two DISTINCT surplus numbers: `surplusVsLimit` is the PROVEN, on-ledger ≥0 number, and
// `improvementVsReferenceBp` is the SIGNED benchmark vs the labeled reference stub (may be
// negative). Numbers only — the pack NEVER interpolates a secret.
export interface ProofPackReceipt {
  desk: string
  side: Allocation['side']
  filledQty: number
  clearingPrice: number
  ownLimit?: number | null
  referencePrice?: number
  surplusVsLimit?: number
  improvementVsLimitBp?: number
  improvementVsReferenceBp?: number
}

export interface RenderProofPackParams {
  clearingPrice: number
  matchedVolume: number
  allocations: Allocation[]
  brief: string
  aiBundle: ProofPackAiBundle
  // AUCT-04: when present, bundle 02 renders the full TCA receipt (fill · limit · reference ·
  // proven surplus + bp · signed benchmark bp). When absent it falls back to the shipped
  // BOUGHT/SOLD qty @ price receipts (backward-compatible with pre-AUCT-04 callers/tests).
  receipts?: ProofPackReceipt[]
}

// A DvP settlement leg (buyer receives bond from seller; cash flows the other way) at the
// uniform clearing price. Derived by greedily pairing buy fills against sell fills.
interface DvpLeg {
  buyer: string
  seller: string
  qty: number
  price: number
}

// A compact desk code for the finality legs (e.g. 'BankA' → 'A', 'bankA::1220' → 'A').
const shortDesk = (desk: string): string => desk.split('::')[0].replace(/^bank/i, '') || desk

// Pair buy fills against sell fills into DvP legs (short-side/long-side greedy match). For §4
// (A buys 10; B sells 8; C sells 2) this yields A↔B 8@p · A↔C 2@p.
const deriveDvpLegs = (allocations: Allocation[], clearingPrice: number): DvpLeg[] => {
  const buys = allocations.filter((a) => a.side === 'Buy' && a.filledQty > 0).map((a) => ({ desk: a.desk, remaining: a.filledQty }))
  const sells = allocations.filter((a) => a.side === 'Sell' && a.filledQty > 0).map((a) => ({ desk: a.desk, remaining: a.filledQty }))
  const legs: DvpLeg[] = []
  let bi = 0
  let si = 0
  while (bi < buys.length && si < sells.length) {
    const qty = Math.min(buys[bi].remaining, sells[si].remaining)
    if (qty > 0) legs.push({ buyer: buys[bi].desk, seller: sells[si].desk, qty, price: clearingPrice })
    buys[bi].remaining -= qty
    sells[si].remaining -= qty
    if (buys[bi].remaining === 0) bi += 1
    if (sells[si].remaining === 0) si += 1
  }
  return legs
}

// Minimal HTML-escape for interpolated text (brief, desk ids) — the pack takes no untrusted
// markup, but escaping keeps a desk id / rationale from breaking the document.
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ── renderProofPackHtml — the pure on-brand HTML string ───────────────────────────
export const renderProofPackHtml = (params: RenderProofPackParams): string => {
  const { clearingPrice, matchedVolume, allocations, brief, aiBundle, receipts } = params
  const price2 = clearingPrice.toFixed(2)
  const filled = allocations.filter((a) => a.filledQty > 0)
  const legs = deriveDvpLegs(allocations, clearingPrice)

  const verb = (side: Allocation['side']): string => (side === 'Buy' ? 'BOUGHT' : 'SOLD')

  // AUCT-04: signed vs-reference surplus for the desk (buyer improves when p* below the
  // reference; seller when above) — a DIFFERENT number from the proven vs-limit surplus.
  const refSurplus = (r: ProofPackReceipt): number => {
    const ref = r.referencePrice ?? r.clearingPrice
    return r.side === 'Buy'
      ? (ref - r.clearingPrice) * r.filledQty
      : (r.clearingPrice - ref) * r.filledQty
  }
  const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`)

  // Prefer the full TCA receipts (two-distinct-surplus split); fall back to the shipped
  // BOUGHT/SOLD line when no receipts were supplied (backward-compatible).
  const receiptsRows = (receipts && receipts.length ? receipts.filter((r) => r.filledQty > 0) : [])
    .map((r) => {
      const limitTxt = r.ownLimit == null ? 'NO LIMIT' : r.ownLimit.toFixed(2)
      const surplus = r.surplusVsLimit ?? 0
      const bpLimit = r.improvementVsLimitBp ?? 0
      const bpRef = r.improvementVsReferenceBp ?? 0
      return (
        `<div class="tca"><div class="row"><span class="who">${esc(r.desk)}</span>` +
        `<span class="act">${verb(r.side)} ${r.filledQty}</span>` +
        `<span class="px">@ ${r.clearingPrice.toFixed(2)}</span></div>` +
        `<div class="tcaMeta">LIMIT ${limitTxt} · REF ${(r.referencePrice ?? r.clearingPrice).toFixed(2)} (STUB)</div>` +
        `<div class="tcaMeta">PROVEN vs-LIMIT · SURPLUS ≥ 0 &nbsp; ${signed(surplus)} &nbsp; ${signed(bpLimit)} bp</div>` +
        `<div class="tcaMeta">BENCHMARK vs-REFERENCE (MAY BE NEGATIVE) &nbsp; ${signed(refSurplus(r))} &nbsp; ${signed(bpRef)} bp</div>` +
        `</div>`
      )
    })
    .join('\n')

  const fallbackReceiptsRows = filled
    .map(
      (a) =>
        `<div class="row"><span class="who">${esc(a.desk)}</span>` +
        `<span class="act">${verb(a.side)} ${a.filledQty}</span>` +
        `<span class="px">@ ${price2}</span></div>`,
    )
    .join('\n')

  const bundle02Rows = receiptsRows || fallbackReceiptsRows

  const legsRows = legs
    .map(
      (l) =>
        `<div class="leg"><span class="pair">${esc(shortDesk(l.buyer))}↔${esc(shortDesk(l.seller))}</span>` +
        `<span class="lq">${l.qty}@${l.price.toFixed(2)}</span></div>`,
    )
    .join('\n')

  const fillsSummary = filled.map((a) => `${esc(shortDesk(a.desk))}=${a.filledQty}`).join(' / ')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Umbra — Proof-Pack</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="${FONTS_HREF}" rel="stylesheet" />
<style>
  :root{
    --paper:#F4F1EA; --ink:#0A0A0A; --lime:#D6FB3C; --red:#E2231A;
    --display:'Space Grotesk',system-ui,sans-serif;
    --mono:'IBM Plex Mono',ui-monospace,monospace;
    --body:'Inter',system-ui,sans-serif;
  }
  @page{ size:1280px 720px; margin:0; }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  html,body{ margin:0; padding:0; background:var(--paper); color:var(--ink); font-family:var(--body); }
  .sheet{ position:relative; width:1280px; min-height:720px; padding:64px 84px; background:var(--paper); }
  .label{ display:flex; align-items:baseline; gap:16px; font-family:var(--mono); }
  .label .n{ font-weight:600; font-size:13px; letter-spacing:.04em; }
  .label .t{ font-size:11px; letter-spacing:.34em; text-transform:uppercase; opacity:.55; }
  .rule{ height:1px; background:var(--ink); margin:14px 0 34px; }
  .wordmark{ font-family:var(--display); font-weight:500; font-size:30px; letter-spacing:.2em; }
  .hero{ font-family:var(--display); font-weight:700; font-size:132px; line-height:1; letter-spacing:-.03em; margin:8px 0 6px; }
  .hero .lime{ color:var(--ink); box-shadow:inset 0 -.30em 0 var(--lime); }
  .heroSub{ font-family:var(--mono); font-size:14px; letter-spacing:.16em; text-transform:uppercase; opacity:.7; }
  .grid{ display:grid; grid-template-columns:1fr 1fr; gap:44px; margin-top:40px; }
  .bundle{ break-inside:avoid; }
  .bh{ font-family:var(--mono); font-size:11px; letter-spacing:.28em; text-transform:uppercase; opacity:.55; margin-bottom:14px; }
  .row,.leg{ display:flex; justify-content:space-between; align-items:center; padding:11px 0; border-bottom:1px solid rgba(10,10,10,.14); font-family:var(--mono); font-size:15px; }
  .row .who{ font-weight:600; letter-spacing:.04em; }
  .tca{ padding:11px 0; border-bottom:1px solid rgba(10,10,10,.14); }
  .tca .row{ border-bottom:none; padding:0 0 4px; }
  .tcaMeta{ font-family:var(--mono); font-size:10px; letter-spacing:.14em; text-transform:uppercase; opacity:.6; padding:2px 0; }
  .leg .pair{ font-weight:600; letter-spacing:.06em; }
  .atomic{ display:inline-block; margin-top:16px; padding:8px 14px; background:var(--ink); color:var(--lime); font-family:var(--mono); font-size:12px; letter-spacing:.2em; text-transform:uppercase; }
  .ai .kv{ display:flex; justify-content:space-between; padding:9px 0; border-bottom:1px solid rgba(10,10,10,.14); font-family:var(--mono); font-size:13px; }
  .ai .kv .v{ opacity:.72; }
  .verified{ color:var(--ink); box-shadow:inset 0 -.32em 0 var(--lime); font-weight:600; }
  .brief{ font-family:var(--body); font-size:15px; line-height:1.6; margin-top:16px; opacity:.9; }
  .foot{ margin-top:44px; font-family:var(--mono); font-size:10px; letter-spacing:.18em; text-transform:uppercase; opacity:.45; }
  .hash{ word-break:break-all; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="label"><span class="n">PROOF-PACK</span><span class="t">Clearing · Best-Ex · Finality · AI Decision</span></div>
    <div class="rule"></div>
    <div class="wordmark">UMBRA</div>

    <!-- (1) CLEARING PROOF -->
    <div class="bundle" style="margin-top:22px;">
      <div class="bh">01 — Clearing Proof</div>
      <div class="hero"><span class="lime">${price2}</span></div>
      <div class="heroSub">Uniform clearing price · matched ${matchedVolume} units · fills ${fillsSummary}</div>
    </div>

    <div class="grid">
      <!-- (2) BEST-EX RECEIPTS -->
      <div class="bundle">
        <div class="bh">02 — Per-Desk Best-Ex Receipts</div>
        ${bundle02Rows || '<div class="row"><span class="who">—</span><span class="act">no fills</span><span class="px"></span></div>'}
      </div>

      <!-- (3) FINALITY RECORD -->
      <div class="bundle">
        <div class="bh">03 — Finality Record</div>
        ${legsRows || '<div class="leg"><span class="pair">—</span><span class="lq">no legs</span></div>'}
        <div class="atomic">One atomic transaction · DvP</div>
      </div>
    </div>

    <!-- (4) AI DECISION BUNDLE -->
    <div class="bundle ai" style="margin-top:40px;">
      <div class="bh">04 — AI Decision Bundle</div>
      <div class="kv"><span class="k">Model</span><span class="v">${esc(aiBundle.modelId)}</span></div>
      <div class="kv"><span class="k">Verified against §8</span><span class="v"><span class="verified">${aiBundle.verified ? 'VERIFIED' : 'DETERMINISTIC FALLBACK'}</span></span></div>
      ${aiBundle.source ? `<div class="kv"><span class="k">Source</span><span class="v">${esc(aiBundle.source)}</span></div>` : ''}
      ${aiBundle.clearingHash ? `<div class="kv"><span class="k">Clearing hash</span><span class="v hash">${esc(aiBundle.clearingHash)}</span></div>` : ''}
      ${aiBundle.systemPromptHash ? `<div class="kv"><span class="k">Prompt hash</span><span class="v hash">${esc(aiBundle.systemPromptHash)}</span></div>` : ''}
      <div class="brief">${esc(brief)}</div>
    </div>

    <div class="foot">Umbra · sealed-bid uniform-price batch auction · settled delivery-versus-payment on Canton</div>
  </div>
</body>
</html>`
}

// ── generateProofPackPdf — spawn headless Chrome/Edge --print-to-pdf ──────────────
export const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]

// The result of a PDF attempt: a rendered file, or a graceful HTML fallback for window.print().
export type ProofPackResult = { pdf: true; path: string } | { pdf: false; html: string }

// Injectable spawn surface so tests never launch a real browser or write a real PDF.
export interface PdfSpawnDeps {
  execFile?: typeof nodeExecFile
  writeFile?: (path: string, data: string) => void
  // Best-effort removal of the temp HTML after the browser loop (IN-02) — injectable so
  // tests can assert/stub it. Defaults to a swallowing unlinkSync.
  deleteFile?: (path: string) => void
  browserPaths?: string[]
  tmpDir?: string
}

// Default HTML writer — mkdir the temp dir then write (only used at live boot, never in tests).
const defaultWriteHtml = (path: string, data: string): void => {
  mkdirSync(dirname(path), { recursive: true })
  nodeWriteFileSync(path, data, 'utf8')
}

// Run one browser to a PDF; resolves on exit-0, rejects on spawn error / non-zero exit.
const runBrowser = (
  execFileFn: typeof nodeExecFile,
  browser: string,
  htmlPath: string,
  outPath: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    // Build the source URL with pathToFileURL — string-concatenating `file://` + a native
    // Windows path (C:\Users\...) yields `file://C:\...`, which Chrome parses with `C:` as
    // the URL host and backslashes as invalid separators, so the page never loads and the
    // PDF silently degrades to the HTML fallback (WR-01). pathToFileURL emits a correct
    // `file:///C:/Users/...` on Windows and `file:///...` on POSIX.
    execFileFn(
      browser,
      ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${outPath}`, pathToFileURL(htmlPath).href],
      (err) => (err ? reject(err) : resolve()),
    )
  })

// Render the HTML to a temp file then try each browser in turn. If EVERY browser fails to spawn
// (ENOENT / no browser installed), degrade to the on-brand HTML for window.print() (RESEARCH A1).
export const generateProofPackPdf = async (
  html: string,
  outPath: string,
  deps: PdfSpawnDeps = {},
): Promise<ProofPackResult> => {
  const execFileFn = deps.execFile ?? nodeExecFile
  const writeFile = deps.writeFile ?? defaultWriteHtml
  // Best-effort temp-HTML cleanup (IN-02): swallow errors (ENOENT on a never-written temp
  // in tests, or a locked file) so cleanup never masks the actual PDF/HTML result.
  const deleteFile = deps.deleteFile ?? ((path: string): void => {
    try {
      nodeUnlinkSync(path)
    } catch {
      /* best-effort — an orphaned temp file is harmless, a throw here is not */
    }
  })
  const browserPaths = deps.browserPaths ?? CHROME_PATHS
  const tmpDir = deps.tmpDir ?? fileURLToPath(new URL('../.tmp', import.meta.url))
  const htmlPath = join(tmpDir, `proof-${Date.now()}.html`)

  try {
    writeFile(htmlPath, html)
  } catch {
    return { pdf: false, html }
  }

  // The temp HTML is only ever an intermediate render input — remove it on EVERY exit
  // (PDF success returns outPath, the distinct PDF file; failure returns the in-memory
  // html string), so a working PDF path no longer leaks one orphan .html per request.
  try {
    for (const browser of browserPaths) {
      try {
        await runBrowser(execFileFn, browser, htmlPath, outPath)
        return { pdf: true, path: outPath }
      } catch {
        // try the next browser (Chrome → Edge); if all fail, fall through to the HTML fallback.
      }
    }
    return { pdf: false, html }
  } finally {
    deleteFile(htmlPath)
  }
}
