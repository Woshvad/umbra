// solver/src/topology.test.ts — VIZ-03 hosting-map contract (stubbed /v2/parties).
//
// Drives hostingMap() with a PURE injected probe (no live network) to prove:
//   (a) all desks on ONE participant → demoReal:true + a single node with all parties
//       + the SAME PARTICIPANT (LOCALNET) caption (the honest single-operator signal).
//   (b) desks distributed A/B/C across three participants → demoReal:false + three nodes.
//   (c) secret sweep — no bearer/token string closed over by the probe ever appears in
//       the returned structure (credential-free boundary, SOLV-04 / T-11-03-LEAK).
// Plus graceful degradation: a down participant (probe throws) fabricates no residency,
// and a non-local party is excluded.

import { describe, it, expect, vi } from 'vitest'
import {
  hostingMap,
  SAME_PARTICIPANT_CAPTION,
  DISTRIBUTED_CAPTION,
  type PartyDetail,
} from './topology.js'

// A test participant→base map (opaque bases; the probe keys off them).
const PARTICIPANTS = {
  'app-user': 'http://u',
  'app-provider': 'http://p',
  sv: 'http://s',
}

const DESKS = ['bankA::x', 'bankB::y', 'bankC::z']

// A sentinel admin bearer the probe closes over — as index.ts holds the real admin
// token in the probe closure. It must NEVER surface in the returned structure.
const SENTINEL_TOKEN = 'SENTINEL-ADMIN-BEARER-do-not-leak-11a3f7'

describe('VIZ-03 hostingMap (party→participant probe)', () => {
  it('(a) all desks on ONE participant → demoReal:true, a single node, SAME PARTICIPANT caption', async () => {
    // Every desk is isLocal on app-provider (:3975); the other participants host none
    // of the focused desk parties.
    const byBase: Record<string, PartyDetail[]> = {
      'http://p': DESKS.map((party) => ({ party, isLocal: true })),
      'http://u': [],
      'http://s': [],
    }
    const probe = vi.fn(async (base: string): Promise<PartyDetail[]> => byBase[base] ?? [])

    const result = await hostingMap(probe, { participants: PARTICIPANTS, desks: DESKS })

    expect(result.demoReal).toBe(true)
    expect(result.caption).toBe(SAME_PARTICIPANT_CAPTION)
    // A single node hosting ALL three desks.
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]?.participant).toBe('app-provider')
    expect(result.nodes[0]?.parties.sort()).toEqual([...DESKS].sort())
    // Each desk maps to the single participant.
    for (const desk of DESKS) expect(result.perParty[desk]).toEqual(['app-provider'])
    // The probe was asked for every participant.
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('(b) desks distributed A/B/C across three participants → demoReal:false, three nodes', async () => {
    // The xnode money shot: bankA@app-user, bankB@sv, bankC@app-provider.
    const byBase: Record<string, PartyDetail[]> = {
      'http://u': [{ party: 'bankA::x', isLocal: true }],
      'http://s': [{ party: 'bankB::y', isLocal: true }],
      'http://p': [{ party: 'bankC::z', isLocal: true }],
    }
    const probe = vi.fn(async (base: string): Promise<PartyDetail[]> => byBase[base] ?? [])

    const result = await hostingMap(probe, { participants: PARTICIPANTS, desks: DESKS })

    expect(result.demoReal).toBe(false)
    expect(result.caption).toBe(DISTRIBUTED_CAPTION)
    expect(result.nodes).toHaveLength(3)
    expect(result.perParty['bankA::x']).toEqual(['app-user'])
    expect(result.perParty['bankB::y']).toEqual(['sv'])
    expect(result.perParty['bankC::z']).toEqual(['app-provider'])
  })

  it('(c) secret sweep — no bearer/token the probe closes over reaches the returned structure', async () => {
    const probe = vi.fn(async (base: string): Promise<PartyDetail[]> => {
      // The probe holds the admin bearer in its closure exactly as index.ts does;
      // it authenticates the /v2/parties call but must NEVER surface in the output.
      void SENTINEL_TOKEN
      return base === 'http://p' ? DESKS.map((party) => ({ party, isLocal: true })) : []
    })

    const result = await hostingMap(probe, { participants: PARTICIPANTS, desks: DESKS })

    const wire = JSON.stringify(result)
    expect(wire).not.toContain(SENTINEL_TOKEN)
    expect(wire).not.toContain('Bearer')
    expect(wire).not.toContain('token')
  })

  it('excludes a non-local party (isLocal:false) and never fabricates residency for a down participant', async () => {
    const byBase: Record<string, PartyDetail[]> = {
      // app-provider hosts bankA locally + sees bankB as a REMOTE (isLocal:false) party.
      'http://p': [
        { party: 'bankA::x', isLocal: true },
        { party: 'bankB::y', isLocal: false },
      ],
      'http://u': [],
    }
    // sv (:4975) is DOWN — the probe rejects; it must contribute no rows, not throw.
    const probe = vi.fn(async (base: string): Promise<PartyDetail[]> => {
      if (base === 'http://s') throw new Error('ECONNREFUSED :4975 (LocalNet not running)')
      return byBase[base] ?? []
    })

    const result = await hostingMap(probe, { participants: PARTICIPANTS, desks: DESKS })

    // Only the local bankA is hosted; the remote bankB row is dropped; sv contributes nothing.
    expect(result.perParty['bankA::x']).toEqual(['app-provider'])
    expect(result.perParty['bankB::y']).toBeUndefined()
    expect(result.nodes).toHaveLength(1)
    // One hosting participant ⇒ demo-real (nothing to over-claim).
    expect(result.demoReal).toBe(true)
  })
})
