// web/src/ledger/v2react.tsx — a DROP-IN replacement for @daml/react's
// `createLedgerContext`, backed by the Canton JSON Ledger API v2 instead of the
// Daml 2.x HTTP JSON API v1 WebSocket stream. Same hook surface — `DamlLedger`
// provider + `useStreamQueries` + `useLedger` — so every desk component keeps its
// exact code (and pixels) unchanged; only `ledgerContexts.ts` swaps its import here.
//
// STRUCTURAL PRIVACY (the money shot, unchanged): each named context mounts its own
// DamlLedger with that desk's OWN token. The provider polls
// POST /v2/state/active-contracts with that token + a party filter, so the
// participant returns ONLY contracts that desk is a stakeholder of — a rival
// column's query genuinely yields nothing (honest redaction, ledger-enforced). The
// operator token never enters the browser.
//
// "Streaming" is implemented as a short poll (the v1 path used a WS; the v2 AsyncAPI
// stream is a stretch). Each provider runs ONE ACS poll for its party and every
// useStreamQueries reads that shared snapshot filtered by template entity — so N
// hooks in a column cost one fetch per tick. An exercise refreshes immediately.
//
// Templates are addressed for writes by the package-NAME form `#umbra:Module:Entity`
// (the @daml.js companions carry a 2.x package id in `.templateId`; we use only the
// `Module:Entity` suffix, which is identical across the 2.x/3.x lines).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FC,
  type PropsWithChildren,
} from 'react'
import type { Choice, ContractId, Template } from '@daml/types'

const POLL_MS = 2000
const PKG = '#umbra'

// "<pkgid>:Umbra.Auction:Order" → "Order"
const entityOf = (templateId: string): string => templateId.split(':').pop() ?? ''
// "<pkgid>:Umbra.Roles:Venue" → "Umbra.Roles:Venue"
const moduleEntityOf = (templateId: string): string => templateId.split(':').slice(1).join(':')

// A minimal CreateEvent (the desk components read only `.payload` + `.contractId`).
export interface CreateEvent<T extends object = object> {
  templateId: string
  contractId: ContractId<T>
  signatories: string[]
  observers: string[]
  payload: T
}

interface RawCreated {
  contractId: string
  templateId: string
  createArgument: Record<string, unknown>
  packageName: string
  signatories?: string[]
  observers?: string[]
}

// ── v2 wire (same-origin via the Vite proxy; baseUrl like http://host:5173/) ──────
const v2 = async (baseUrl: string, token: string, path: string, body?: unknown): Promise<unknown> => {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`)
  return res.status === 204 ? undefined : res.json()
}

// The Daml package NAME our contracts carry (createdEvent.packageName). Configurable so a
// package rename cannot silently render an EMPTY book: the shared DevNet validator already
// had an unrelated team's `umbra`, forcing ours to `umbra-sealed-auction`. A hard-coded name
// here fails silently (every contract filtered out) rather than loudly — hence the env knob.
export const UMBRA_PACKAGE_NAME: string =
  (import.meta.env.VITE_UMBRA_PACKAGE_NAME as string | undefined) ?? 'umbra-sealed-auction'

const fetchAcs = async (baseUrl: string, token: string, party: string): Promise<RawCreated[]> => {
  const end = (await v2(baseUrl, token, '/v2/state/ledger-end')) as { offset: number }
  const arr = (await v2(baseUrl, token, '/v2/state/active-contracts', {
    filter: { filtersByParty: { [party]: {} } },
    verbose: true,
    activeAtOffset: end.offset,
  })) as unknown[]
  return (Array.isArray(arr) ? arr : [])
    .map((e: any) => e?.contractEntry?.JsActiveContract?.createdEvent)
    .filter((c: any): c is RawCreated => !!c && c.packageName === UMBRA_PACKAGE_NAME)
}

// v2 returns Daml Numeric zero-padded to its scale ("101.0" → "101.0000000000").
// Trim trailing zeros (keeping one digit after the point) so the comp's clean
// figures render unchanged. Only decimal-number strings match — party ids, Text,
// Ints (no '.'), ISO times and enums are left untouched.
const trimNumeric = (s: string): string =>
  /^-?\d+\.\d+$/.test(s) ? s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '.0') : s

const normalizeNumerics = (v: unknown): unknown => {
  if (typeof v === 'string') return trimNumeric(v)
  if (Array.isArray(v)) return v.map(normalizeNumerics)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = normalizeNumerics(val)
    return out
  }
  return v
}

const toCreateEvent = <T extends object>(c: RawCreated): CreateEvent<T> => ({
  templateId: c.templateId,
  contractId: c.contractId as ContractId<T>,
  signatories: c.signatories ?? [],
  observers: c.observers ?? [],
  payload: normalizeNumerics(c.createArgument) as T,
})

interface Conn {
  party: string
  token: string
  baseUrl: string
  contracts: RawCreated[]
  loading: boolean
  refresh: () => Promise<void>
}

export interface LedgerClient {
  query: <T extends object, K, I extends string>(t: Template<T, K, I>) => Promise<CreateEvent<T>[]>
  exercise: <T extends object, C, R>(
    choice: Choice<T, C, R> & { choiceName: string; template: () => { templateId: string } },
    cid: ContractId<T>,
    arg: C,
  ) => Promise<[R, unknown[]]>
}

export interface LedgerContext {
  DamlLedger: FC<
    PropsWithChildren<{
      token: string
      party: string
      httpBaseUrl?: string
      wsBaseUrl?: string
      reconnectThreshold?: number
    }>
  >
  useStreamQueries: <T extends object, K = unknown, I extends string = string>(
    t: Template<T, K, I>,
  ) => { contracts: CreateEvent<T>[]; loading: boolean }
  useLedger: () => LedgerClient
}

export function createLedgerContext(_name: string): LedgerContext {
  const Ctx = createContext<Conn | null>(null)

  const DamlLedger: LedgerContext['DamlLedger'] = ({ token, party, httpBaseUrl, children }) => {
    const baseUrl = httpBaseUrl ?? '/'
    const [contracts, setContracts] = useState<RawCreated[]>([])
    const [loading, setLoading] = useState(true)
    // Keep the latest token without resubscribing the poll loop.
    const tokenRef = useRef(token)
    tokenRef.current = token

    const refresh = useCallback(async () => {
      try {
        setContracts(await fetchAcs(baseUrl, tokenRef.current, party))
      } finally {
        setLoading(false)
      }
    }, [baseUrl, party])

    useEffect(() => {
      let alive = true
      const tick = async (): Promise<void> => {
        if (!alive) return
        try {
          await refresh()
        } catch {
          // keep the last good snapshot; the next tick retries
        }
      }
      void tick() // immediate first fetch (screenshot-ready without a poll wait)
      const id = setInterval(tick, POLL_MS)
      return () => {
        alive = false
        clearInterval(id)
      }
    }, [refresh])

    const value: Conn = { party, token, baseUrl, contracts, loading, refresh }
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>
  }

  const useConn = (): Conn => {
    const c = useContext(Ctx)
    if (!c) throw new Error('useStreamQueries/useLedger must be used inside this context’s DamlLedger')
    return c
  }

  const useStreamQueries: LedgerContext['useStreamQueries'] = (template) => {
    const conn = useConn()
    const entity = entityOf(template.templateId)
    const contracts = conn.contracts
      .filter((c) => entityOf(c.templateId) === entity)
      .map((c) => toCreateEvent<typeof template extends Template<infer T> ? T : never>(c as RawCreated))
    return { contracts: contracts as never, loading: conn.loading }
  }

  const useLedger: LedgerContext['useLedger'] = () => {
    const conn = useConn()
    return {
      async query(template) {
        const acs = await fetchAcs(conn.baseUrl, conn.token, conn.party)
        const entity = entityOf(template.templateId)
        return acs.filter((c) => entityOf(c.templateId) === entity).map((c) => toCreateEvent(c)) as never
      },
      async exercise(choice, cid, arg) {
        const moduleEntity = moduleEntityOf(choice.template().templateId)
        await v2(conn.baseUrl, conn.token, '/v2/commands/submit-and-wait', {
          commandId: `umbra-web-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          actAs: [conn.party],
          commands: [
            {
              ExerciseCommand: {
                templateId: `${PKG}:${moduleEntity}`,
                contractId: cid,
                choice: choice.choiceName,
                choiceArgument: arg,
              },
            },
          ],
        })
        await conn.refresh()
        return [undefined as never, []]
      },
    }
  }

  return { DamlLedger, useStreamQueries, useLedger }
}
