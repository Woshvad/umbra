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
// WOW-07 guest 4th desk (bankD). Its OWN isolated per-party context, identical in
// shape to A/B/C — structural per-party privacy applies to the guest exactly as it
// does to the primary desks. It is NOT part of the desktop 3-desk switcher (the guest
// joins only via the mobile /join route, UI-SPEC); mounted on demand there.
export const ctxD = make('bankD')

export type DeskKey = 'bankA' | 'bankB' | 'bankC' | 'bankD'

// Stable mapping desk -> its own context, used by the 3-up Privacy view so each
// column is wired to exactly one party's connection. bankD is included so the guest
// /join surface can resolve its own context via the same map; the desktop switcher
// iterates DESKS (A/B/C only) and never touches bankD.
export const ctxFor: Record<DeskKey, Ctx> = {
  bankA: ctxA,
  bankB: ctxB,
  bankC: ctxC,
  bankD: ctxD,
}
