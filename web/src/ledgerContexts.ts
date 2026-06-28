// Three INDEPENDENT per-party ledger contexts — the structural-privacy guarantee
// (PRIV-05 / threat T-03-10). Each desk column mounts its OWN `ctx.DamlLedger`
// carrying that desk's own HS256 dev JWT, and queries via that context's hooks.
// Because `createLedgerContext` gives a *named*, isolated React context, a hook in
// one panel can never read another panel's connection — a rival column genuinely
// fetches zero contracts (the redaction stripe is HONEST, not a render-time filter).
//
// MIGRATED TO CANTON JSON LEDGER API v2: `createLedgerContext` now comes from the
// local v2 shim (web/src/ledger/v2react.tsx), which polls /v2/state/active-contracts
// with each desk's token instead of the Daml 2.x WS stream. The hook surface
// (DamlLedger / useStreamQueries / useLedger) is byte-identical, so every desk
// component is unchanged.
import { createLedgerContext, type LedgerContext } from './ledger/v2react'

// The v2 shim's DamlLedger already accepts children (PropsWithChildren), so no
// retyping is needed (the v1 @daml/react FC dropped `children` under React 18).
export type Ctx = LedgerContext

const make = (name: string): Ctx => createLedgerContext(name)

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
