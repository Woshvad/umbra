// ProofPackButton (WOW-05, 08-07) — UI-SPEC "WOW-05 — Download Proof-Pack" (05 Settlement).
// A post-settle, one-click export: an INK-BORDERED GHOST `DOWNLOAD PROOF-PACK ↓` (mono
// 13px/700 .14em, padding 15px 28px, hover ink fill / paper text via .umbra-ink-ghost) —
// deliberately distinct from the primary ink-FILL SETTLE ATOMICALLY, and NEVER red/lime.
// It fetches the on-brand PDF from the solver (GET /round/:id/proof-pack.pdf, Content-
// Disposition: attachment; server may serve an HTML print-fallback) and triggers a save
// via a Blob object URL. States: ready → preparing (`PREPARING PROOF-PACK…`, disabled) →
// done; any failure surfaces the VERBATIM WOW-05 error copy. The browser holds no
// operator/Anthropic credential — proofPackUrl is a plain URL (no auth header).
import { useState } from 'react'
import { proofPackUrl } from '../solver'

// Verbatim WOW-05 error copy (08-UI-SPEC Copywriting) — secret-free, user-facing.
const ERROR_COPY =
  "Proof-pack couldn't be generated. Check the solver on the configured port and try again."

type State = 'ready' | 'preparing' | 'done' | 'error'

type Props = { roundId: string }

export default function ProofPackButton({ roundId }: Props) {
  const [state, setState] = useState<State>('ready')

  const download = async () => {
    if (state === 'preparing') return
    setState('preparing')
    try {
      const res = await fetch(proofPackUrl(roundId))
      if (!res.ok) throw new Error('proof-pack fetch failed')
      const blob = await res.blob()
      // The server streams a PDF (attachment) or, if Chrome/Edge can't be spawned, the
      // on-brand HTML for window.print() — save with the matching extension either way.
      const ct = res.headers.get('content-type') ?? ''
      const ext = ct.includes('pdf') ? 'pdf' : 'html'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Umbra-Proof-Pack-${roundId}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setState('done')
    } catch {
      setState('error')
    }
  }

  const preparing = state === 'preparing'

  return (
    <div style={{ marginTop: '20px' }}>
      <button
        type="button"
        onClick={() => void download()}
        disabled={preparing}
        className="umbra-ink-ghost font-mono text-13 font-bold uppercase disabled:opacity-40"
        style={{
          padding: '15px 28px',
          letterSpacing: '.14em',
          cursor: preparing ? 'default' : 'pointer',
        }}
      >
        {preparing ? 'PREPARING PROOF-PACK…' : 'DOWNLOAD PROOF-PACK ↓'}
      </button>

      {state === 'error' && (
        <p
          className="font-body text-13"
          style={{ margin: '12px 0 0', opacity: 0.7, lineHeight: 1.6, maxWidth: '520px' }}
        >
          {ERROR_COPY}
        </p>
      )}
    </div>
  )
}
