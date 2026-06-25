// Three INDEPENDENT per-party ledger contexts — the structural-privacy guarantee
// (PRIV-05 / threat T-03-10). Each desk column mounts its OWN `ctx.DamlLedger`
// carrying that desk's own HS256 dev JWT, and queries via that context's hooks.
// Because `createLedgerContext` gives a *named*, isolated React context, a hook in
// one panel can never read another panel's connection — a rival column genuinely
// fetches zero contracts (the redaction stripe is HONEST, not a render-time filter).
//
// VERIFIED: @daml/react@2.10.4 `createLedgerContext(name)` — "where one needs to be
// able to nest ledger interactions, by different parties or connections, within one
// React application." (package createLedgerContext.d.ts)
import type { FC, PropsWithChildren } from 'react'
import { createLedgerContext, type LedgerContext } from '@daml/react'

// @daml/react@2.10.4 types `LedgerContext.DamlLedger` as `React.FC<LedgerProps>`,
// which under React 18's stricter `FC` no longer implies `children`. The provider
// DOES render its children at runtime — retype it locally to accept them. (The
// `LedgerProps` shape is { token, party, httpBaseUrl?, wsBaseUrl?, ... }.)
type LedgerProviderProps = PropsWithChildren<{
  token: string
  party: string
  httpBaseUrl?: string
  wsBaseUrl?: string
  reconnectThreshold?: number
}>

export type Ctx = Omit<LedgerContext, 'DamlLedger'> & {
  DamlLedger: FC<LedgerProviderProps>
}

const make = (name: string): Ctx => createLedgerContext(name) as unknown as Ctx

export const ctxA = make('bankA')
export const ctxB = make('bankB')
export const ctxC = make('bankC')

export type DeskKey = 'bankA' | 'bankB' | 'bankC'

// Stable mapping desk -> its own context, used by the 3-up Privacy view so each
// column is wired to exactly one party's connection.
export const ctxFor: Record<DeskKey, Ctx> = {
  bankA: ctxA,
  bankB: ctxB,
  bankC: ctxC,
}
