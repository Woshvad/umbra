// solver/src/topology.ts — VIZ-03 party→participant hosting probe.
//
// Builds the honest party→participant hosting map that the "07 Topology" view
// renders: for each Canton LocalNet participant (app-user :2975, app-provider
// :3975, sv :4975) it probes `GET /v2/parties` and records, per party, the
// participant(s) where `isLocal:true`. This is the exact `isLocal` signal the
// xnode scripts (xnode-up.mjs:68 / probe-xnode.mjs) already use to distribute the
// desks across nodes.
//
// HONESTY (Pitfall 7 / T-11-03-OVERCLAIM): the LocalNet participants are all in ONE
// operator trust domain. When every desk party resolves to a SINGLE participant
// (the default single-node seed) the result is flagged `demoReal:true` with the
// `SAME PARTICIPANT (LOCALNET)` caption — the view must NOT imply three independent
// institutions. Only when the desks are genuinely distributed across participants
// (the xnode-up.mjs money shot) is `demoReal:false`. The honest limit is the single
// trust domain, not necessarily a single participant.
//
// SECURITY (SOLV-04 / T-11-03-LEAK): this module is CREDENTIAL-FREE at its boundary.
// The admin/probe token lives ONLY inside the injected `probe` function's closure
// (supplied by index.ts); it NEVER crosses into the returned TopologyResult, which
// carries only party ids + participant ids + a caption + booleans. The probe is
// DEPENDENCY-INJECTED so the unit test can stub `/v2/parties` with no live network.

// A single participant's `/v2/parties` entry (the fields we consume). The live v2
// response has more, but only `party` + `isLocal` drive the hosting map.
export interface PartyDetail {
  party: string
  isLocal: boolean
}

// The injected probe: given a participant base URL, resolve its local+remote party
// details. index.ts closes the admin bearer INSIDE this function so no token reaches
// the topology boundary; the unit test injects a pure stub. A probe that rejects (a
// participant that is down / unreachable) contributes NO hosting info — the map
// degrades gracefully rather than fabricating residency (live-ledger-optional).
export type PartiesProbe = (base: string) => Promise<PartyDetail[]>

// One participant node in the topology: the participant id + the (focused) parties
// it locally hosts.
export interface TopologyNode {
  participant: string
  parties: string[]
}

export interface TopologyResult {
  // Only participants that locally host ≥1 (focused) party — a single node when
  // demo-real, three nodes when genuinely distributed.
  nodes: TopologyNode[]
  // party → the participant id(s) hosting it (isLocal:true). Usually one; a
  // co-hosted party (e.g. the guest, WOW-07) can appear on more than one.
  perParty: Record<string, string[]>
  // TRUE when every hosted party maps to a SINGLE participant (single-operator
  // LocalNet) — the view MUST show the SAME PARTICIPANT (LOCALNET) caption. FALSE
  // when the desks are distributed across participants (the xnode money shot).
  demoReal: boolean
  // The honest, non-removable caption signal for the view.
  caption: string
}

// The canonical cn-quickstart LocalNet participants + their JSON Ledger API v2 bases
// (live-e2e-ops memory: :2975 app-user, :3975 app-provider, :4975 sv).
export const PARTICIPANTS: Record<string, string> = {
  'app-user': 'http://localhost:2975',
  'app-provider': 'http://localhost:3975',
  sv: 'http://localhost:4975',
}

export const SAME_PARTICIPANT_CAPTION = 'SAME PARTICIPANT (LOCALNET)'
export const DISTRIBUTED_CAPTION = 'DISTRIBUTED (MULTI-NODE)'

export interface HostingMapOptions {
  // Override the participant→base map (defaults to PARTICIPANTS).
  participants?: Record<string, string>
  // When provided, restrict the hosting map to these desk party ids — so the
  // demo-real flag reflects DESK residency, not the participants' own admin parties
  // (every participant locally hosts its own admin party, which would otherwise make
  // the map always look distributed). When omitted, every local party is included.
  desks?: string[]
}

// Build the party→participant hosting map by probing each participant's /v2/parties.
// Pure over the injected `probe` — no live network here, no token in the output.
export const hostingMap = async (
  probe: PartiesProbe,
  opts: HostingMapOptions = {},
): Promise<TopologyResult> => {
  const participants = opts.participants ?? PARTICIPANTS
  const focus = opts.desks && opts.desks.length ? new Set(opts.desks) : null

  const perParty: Record<string, string[]> = {}
  const nodeParties: Record<string, string[]> = {}

  for (const [pid, base] of Object.entries(participants)) {
    let details: PartyDetail[] = []
    try {
      details = await probe(base)
    } catch {
      // A down / unreachable participant contributes NO hosting rows — the map is
      // honestly incomplete rather than fabricated (any live-ledger step degrades
      // gracefully; LocalNet may not be running).
      details = []
    }
    for (const d of details) {
      if (!d.isLocal) continue
      if (focus && !focus.has(d.party)) continue
      ;(perParty[d.party] ??= []).push(pid)
      ;(nodeParties[pid] ??= []).push(d.party)
    }
  }

  // Only participants that actually host a (focused) party become nodes.
  const nodes: TopologyNode[] = Object.entries(nodeParties).map(([participant, parties]) => ({
    participant,
    parties,
  }))

  // demo-real ⇔ every hosted party's CANONICAL (first) hosting participant is the SAME
  // single participant. We collapse each party to ONE canonical participant BEFORE counting
  // so a co-hosted party — which `perParty` explicitly allows to resolve isLocal:true on >1
  // participant (e.g. the WOW-07 guest) — cannot fabricate a "distributed" signal on the
  // single-operator LocalNet (T-11-03-OVERCLAIM). Using the flattened union instead would
  // flip demoReal to false the moment ANY single party appeared on two participants, dropping
  // the HARD honesty badge. Zero hosted parties (nothing probed / ledger down) collapses to
  // demo-real (nothing to over-claim); ≥2 distinct canonical participants ⇒ genuinely
  // distributed (desks each on their own node — the xnode money shot).
  const canonicalParticipants = new Set(
    Object.values(perParty)
      .map((ids) => ids[0])
      .filter((id): id is string => id !== undefined),
  )
  const demoReal = canonicalParticipants.size <= 1

  return {
    nodes,
    perParty,
    demoReal,
    caption: demoReal ? SAME_PARTICIPANT_CAPTION : DISTRIBUTED_CAPTION,
  }
}
