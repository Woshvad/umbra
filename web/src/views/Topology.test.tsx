// web/src/views/Topology.test.tsx — the VIZ-03 topology derivation proof (11-VALIDATION VIZ-03).
// DOM-free: it exercises the PURE node/edge derivation core against MOCKED TopologyMeta hosting
// maps (single-participant LocalNet vs a genuinely distributed multi-node map), so the honest
// demo-real labeling + the structural cross-node privacy are proven WITHOUT a live LocalNet
// (the live 3-node cross-node atomic settle is an end-of-phase live-UAT item).
//
// The load-bearing assertions:
//   (a) single-participant meta → every node caption is `SAME PARTICIPANT (LOCALNET)` and the
//       HARD `DEMO-REAL · SINGLE-OPERATOR LOCALNET` badge string is the derived overall caption's
//       partner (present + non-removable while nodes map to one participant).
//   (b) distributed meta → per-participant captions (`PARTICIPANT · {id}`) + a distributed
//       overall caption; the GUEST node appears only once a bankD party is hosted.
//   (c) no node EVER carries a rival's order contents — the derived descriptors expose only the
//       redaction motif (structural cross-node privacy, threat T-11-09-DISCLOSE).
import { describe, expect, it } from 'vitest'
import {
  nodesFromHosting,
  edges,
  demoRealCaption,
  partyForDesk,
  DEMO_REAL_BADGE,
  SAME_PARTICIPANT_CAPTION,
  NODE_NOT_VISIBLE,
  OPERATOR_ID,
} from '../components/TopologyNode'
import type { TopologyMeta } from '../solver'

// Live-shaped party ids ("bankX::<fingerprint>") keyed exactly as the solver's perParty map.
const A = 'bankA::fp1'
const B = 'bankB::fp1'
const C = 'bankC::fp1'
const D = 'bankD::fp1'

// Single-operator LocalNet: every desk party hosted on ONE participant (the demo-real case).
const SINGLE: TopologyMeta = {
  roundId: 'R1',
  nodes: [{ participant: 'app-provider', parties: [A, B, C] }],
  perParty: { [A]: ['app-provider'], [B]: ['app-provider'], [C]: ['app-provider'] },
  demoReal: true,
  caption: SAME_PARTICIPANT_CAPTION,
}

// Genuinely distributed: A/B/C on three distinct participants (+ a co-hosted GUEST desk).
const DISTRIBUTED: TopologyMeta = {
  roundId: 'R2',
  nodes: [
    { participant: 'app-user', parties: [A, D] },
    { participant: 'sv', parties: [B] },
    { participant: 'app-provider', parties: [C] },
  ],
  perParty: {
    [A]: ['app-user'],
    [B]: ['sv'],
    [C]: ['app-provider'],
    [D]: ['app-user'],
  },
  demoReal: false,
  caption: 'DISTRIBUTED (MULTI-NODE)',
}

describe('VIZ-03 topology — hosting-map party resolution', () => {
  it('resolves a desk key to its full party id by prefix', () => {
    expect(partyForDesk(SINGLE.perParty, 'bankA')).toBe(A)
    expect(partyForDesk(SINGLE.perParty, 'bankD')).toBeUndefined()
  })
})

describe('VIZ-03 topology — (a) single-participant LocalNet (HARD demo-real)', () => {
  const nodes = nodesFromHosting(SINGLE)

  it('renders the three primary desks (no GUEST until a guest joins)', () => {
    expect(nodes.map((n) => n.code)).toEqual(['BLUEROCK', 'MERIDIAN', 'HALWARD'])
  })

  it('every node carries the SAME PARTICIPANT (LOCALNET) caption', () => {
    expect(nodes.every((n) => n.caption === SAME_PARTICIPANT_CAPTION)).toBe(true)
  })

  it('the overall demo-real caption is the SAME PARTICIPANT beat (badge is non-removable here)', () => {
    expect(demoRealCaption(SINGLE)).toBe(SAME_PARTICIPANT_CAPTION)
    expect(DEMO_REAL_BADGE).toBe('DEMO-REAL · SINGLE-OPERATOR LOCALNET')
  })
})

describe('VIZ-03 topology — (b) distributed multi-node', () => {
  const nodes = nodesFromHosting(DISTRIBUTED)

  it('adds the GUEST node once a bankD party is hosted', () => {
    expect(nodes.map((n) => n.code)).toEqual(['BLUEROCK', 'MERIDIAN', 'HALWARD', 'GUEST'])
  })

  it('each node shows a per-participant caption', () => {
    expect(nodes.map((n) => n.caption)).toEqual([
      'PARTICIPANT · app-user',
      'PARTICIPANT · sv',
      'PARTICIPANT · app-provider',
      'PARTICIPANT · app-user',
    ])
    expect(nodes.every((n) => n.caption.startsWith('PARTICIPANT · '))).toBe(true)
  })

  it('the overall caption reflects the distributed map (not the demo-real beat)', () => {
    expect(demoRealCaption(DISTRIBUTED)).toBe('DISTRIBUTED (MULTI-NODE)')
  })

  it('every participant node links to the single synchronizer', () => {
    const e = edges(nodes)
    expect(e).toHaveLength(4)
    expect(e.every((edge) => edge.to === OPERATOR_ID)).toBe(true)
    expect(e.map((edge) => edge.from)).toEqual(['bankA', 'bankB', 'bankC', 'bankD'])
  })
})

describe('VIZ-03 topology — (c) no node carries a rival order contents (structural privacy)', () => {
  it('derived node descriptors expose only the redaction motif — never side/quantity/limit', () => {
    for (const node of nodesFromHosting(DISTRIBUTED)) {
      expect('order' in node).toBe(false)
      expect('side' in node).toBe(false)
      expect('quantity' in node).toBe(false)
      expect('limit' in node).toBe(false)
    }
    // The only order-shaped thing a node ever renders is the redaction stripe caption.
    expect(NODE_NOT_VISIBLE).toBe('NOT VISIBLE')
  })

  it('degrades honestly on an empty/degraded hosting map (LocalNet down)', () => {
    const empty = nodesFromHosting(null)
    expect(empty.map((n) => n.code)).toEqual(['BLUEROCK', 'MERIDIAN', 'HALWARD'])
    expect(empty.every((n) => n.participant === undefined)).toBe(true)
  })
})
