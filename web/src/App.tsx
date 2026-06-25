// Plan 03-03 fills this in — the real global shell (header/wordmark, party
// switcher, status indicator, nav) + the 3-up Privacy view (one <DamlLedger>
// provider per desk). This scaffold renders only the paper background + the
// UMBRA wordmark so `tsc --noEmit && vite build` exits 0 and the comp fonts/
// tokens (Space Grotesk, ink, paper) are exercised once end-to-end.
export default function App() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="flex items-end justify-between border-b px-48 pb-14 pt-22">
        <div className="flex items-baseline gap-18">
          <span className="font-display text-30 font-bold tracking-tight">UMBRA</span>
          <span className="font-mono text-10 uppercase tracking-widest opacity-55">
            Sealed-Bid Batch Auction
          </span>
        </div>
        <span className="font-mono text-11 uppercase tracking-wider opacity-50">
          Scaffold · Plan 03-03 fills this in
        </span>
      </header>
    </div>
  )
}
