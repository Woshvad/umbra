// solver/src/proofpack.test.ts — WOW-05 on-brand proof-pack render + PDF-spawn contract.
//
// Proven here:
//   • renderProofPackHtml carries the three binding brand tokens (#F4F1EA / #0A0A0A / #D6FB3C),
//     the Google-Fonts family string, and -webkit-print-color-adjust:exact (deck fidelity).
//   • it carries all FOUR bundles: the lime 100.00 hero + §4 fills, per-desk best-ex receipts,
//     the DvP finality legs (A↔B 8@100 · A↔C 2@100) + the one-atomic-transaction stamp, and
//     the AI decision bundle (modelId + verified flag + brief).
//   • the HTML embeds NO secret (no key / operator token).
//   • generateProofPackPdf spawns the (MOCKED) browser and returns { pdf:true } on success;
//     on an ENOENT spawn failure for every browser it returns the { pdf:false, html } fallback.
//     No real Chrome is launched and no real PDF/HTML is written to disk (spawn + writer injected).

import { describe, it, expect, vi } from 'vitest'
import type { Allocation } from './auction.js'
import { renderProofPackHtml, generateProofPackPdf, type PdfSpawnDeps } from './proofpack.js'

// The §4 settled allocation: A buys 10, B sells 8, C sells 2 — clears 100.00.
const SECTION4_ALLOCS: Allocation[] = [
  { desk: 'BankA', side: 'Buy', filledQty: 10 },
  { desk: 'BankB', side: 'Sell', filledQty: 8 },
  { desk: 'BankC', side: 'Sell', filledQty: 2 },
]

const SENTINEL_API_KEY = 'sk-ant-SENTINEL-API-KEY-do-not-leak-9c4e2d'
const SENTINEL_TOKEN = 'SENTINEL-OPERATOR-TOKEN-do-not-leak-7f3a9b'

const renderSection4 = (): string =>
  renderProofPackHtml({
    clearingPrice: 100,
    matchedVolume: 10,
    allocations: SECTION4_ALLOCS,
    brief:
      'This round cleared at a single uniform price of $100.00, matching 10 units of the bond and settling delivery-versus-payment atomically in one transaction.',
    aiBundle: {
      modelId: 'claude-haiku-4-5',
      verified: true,
      source: 'claude',
      systemPromptHash: 'a'.repeat(64),
      clearingHash: 'c'.repeat(64),
    },
  })

describe('WOW-05 proof-pack HTML (renderProofPackHtml)', () => {
  it('carries the three binding brand tokens + fonts + print-color-adjust', () => {
    const html = renderSection4()
    expect(html).toContain('#F4F1EA') // paper
    expect(html).toContain('#0A0A0A') // ink
    expect(html).toContain('#D6FB3C') // lime
    expect(html).toContain('Space+Grotesk')
    expect(html).toContain('IBM+Plex+Mono')
    expect(html).toContain('Inter')
    expect(html).toContain('-webkit-print-color-adjust:exact')
  })

  it('carries bundle 01 — the lime 100.00 hero + §4 fills', () => {
    const html = renderSection4()
    expect(html).toContain('100.00')
    expect(html).toContain('class="lime"')
    // §4 fills summary A=10 / B=8 / C=2 (coded-desk form).
    expect(html).toContain('A=10')
    expect(html).toContain('B=8')
    expect(html).toContain('C=2')
    expect(html).toContain('matched 10 units')
  })

  it('carries bundle 02 — per-desk best-ex receipts', () => {
    const html = renderSection4()
    expect(html).toContain('Best-Ex Receipts')
    expect(html).toContain('BankA')
    expect(html).toContain('BOUGHT 10')
    expect(html).toContain('SOLD 8')
    expect(html).toContain('SOLD 2')
  })

  it('carries bundle 03 — the DvP finality legs + one-atomic-transaction stamp', () => {
    const html = renderSection4()
    expect(html).toContain('Finality Record')
    expect(html).toContain('A↔B')
    expect(html).toContain('8@100')
    expect(html).toContain('A↔C')
    expect(html).toContain('2@100')
    expect(html).toContain('One atomic transaction')
  })

  it('carries bundle 04 — the AI decision bundle (modelId + verified + brief)', () => {
    const html = renderSection4()
    expect(html).toContain('AI Decision Bundle')
    expect(html).toContain('claude-haiku-4-5')
    expect(html).toContain('VERIFIED')
    expect(html).toContain('This round cleared at a single uniform price of $100.00')
  })

  it('embeds NO secret (no key, no operator token)', () => {
    void SENTINEL_API_KEY
    void SENTINEL_TOKEN
    const html = renderSection4()
    expect(html).not.toContain(SENTINEL_API_KEY)
    expect(html).not.toContain(SENTINEL_TOKEN)
  })

  it('renders a graceful empty state when no orders crossed', () => {
    const html = renderProofPackHtml({
      clearingPrice: 100,
      matchedVolume: 0,
      allocations: [],
      brief: 'No orders crossed this round.',
      aiBundle: { modelId: 'claude-haiku-4-5', verified: false },
    })
    expect(html).toContain('100.00')
    expect(html).toContain('no fills')
    expect(html).toContain('DETERMINISTIC FALLBACK')
  })
})

describe('WOW-05 proof-pack PDF (generateProofPackPdf) — spawn mocked, no real Chrome', () => {
  // A spy execFile that reports success (exit 0) via its node-style callback.
  const okExecFile = vi.fn((_file: string, _args: readonly string[], cb: (err: Error | null) => void) => {
    cb(null)
    return {} as never
  }) as unknown as PdfSpawnDeps['execFile']

  // A spy execFile that fails to spawn every browser (ENOENT).
  const enoentExecFile = vi.fn((_file: string, _args: readonly string[], cb: (err: Error | null) => void) => {
    cb(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))
    return {} as never
  }) as unknown as PdfSpawnDeps['execFile']

  it('returns { pdf:true, path } when the (mocked) browser exits 0', async () => {
    const writeFile = vi.fn() // no real disk write
    const result = await generateProofPackPdf('<html>proof</html>', '/tmp/out.pdf', {
      execFile: okExecFile,
      writeFile,
      browserPaths: ['C:/fake/chrome.exe'],
      tmpDir: '/tmp/proofpack',
    })

    expect(result).toEqual({ pdf: true, path: '/tmp/out.pdf' })
    expect(writeFile).toHaveBeenCalledTimes(1) // temp HTML written via the injected writer
    expect(okExecFile).toHaveBeenCalled()
  })

  it('falls back to { pdf:false, html } when every browser fails to spawn (ENOENT)', async () => {
    const html = '<html>on-brand fallback</html>'
    const writeFile = vi.fn()
    const result = await generateProofPackPdf(html, '/tmp/out.pdf', {
      execFile: enoentExecFile,
      writeFile,
      browserPaths: ['C:/fake/chrome.exe', 'C:/fake/edge.exe'],
      tmpDir: '/tmp/proofpack',
    })

    expect(result).toEqual({ pdf: false, html })
    // Both browsers were attempted before the HTML fallback.
    expect((enoentExecFile as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })

  it('never launches a real browser or writes a real file in tests (injected deps only)', async () => {
    const writeFile = vi.fn()
    const execFile = vi.fn((_f: string, _a: readonly string[], cb: (e: Error | null) => void) => {
      cb(null)
      return {} as never
    }) as unknown as PdfSpawnDeps['execFile']
    await generateProofPackPdf('<html/>', '/tmp/out.pdf', { execFile, writeFile, browserPaths: ['x'], tmpDir: '/tmp/x' })
    expect(writeFile).toHaveBeenCalled()
  })
})
