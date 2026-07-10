// solver/src/index.ts — the solver service boot entrypoint.
//
// Boot sequence:
//   1. dotenv.config() FIRST — so JSON_API_URL / SOLVER_PORT / ROUND_SECONDS are
//      in process.env BEFORE ledger.ts constructs its Ledger (which reads
//      JSON_API_URL at module-eval time).
//   2. Construct the in-memory clock (createClock) wired to the ledger closeRound.
//   3. REHYDRATE from a live query(Round) so a sandbox-seeded round (R1) is
//      recognized — the ledger Round.status is authoritative (T-04-10).
//   4. buildDeps(...) assembles the AppDeps for createApp, with the CRITICAL wiring:
//      POST /round → openRound (ledger create) AND openRoundClock (timer start).
//   5. createApp(deps).listen(SOLVER_PORT), logging ONLY ":<port> as <operatorParty>"
//      — never the token, ANTHROPIC_API_KEY, or process.env (SOLV-04 / T-04-04).
//
// The dotenv import + the ledger import are deferred into main() (dynamic import)
// so that importing THIS module for the wiring unit test (index.test.ts) does NOT
// trigger ledger.ts's module-private credential resolution or open a Ledger. The
// test drives buildDeps directly with injected spies.

import { createApp, type AppDeps, type RoundView } from './api.js'
import type { Clock } from './clock.js'

// Default window / port (overridable via env). ROUND_SECONDS drives the auto-close
// timer; SOLVER_PORT is the :4100 bind.
export const DEFAULT_ROUND_SECONDS = 60
export const DEFAULT_SOLVER_PORT = 4100

// The ledger functions index.ts needs to wire into the API + clock. The unit test
// injects spies for these; main() supplies the real ledger.ts implementations.
export interface LedgerPort {
  openRound: AppDeps['openRound']
  queryRound: AppDeps['queryRound']
  readSealedOrders: AppDeps['readSealedOrders']
  refreshStats: AppDeps['refreshStats']
  closeRound: AppDeps['closeRound']
  settle: AppDeps['settle']
  // WOW-02: the dedicated tamper seam (ledger.tamperClear) — mirrors settle wiring.
  tamperClear: AppDeps['tamperClear']
  readTradeConfirmations: AppDeps['readTradeConfirmations']
}

// The pure §8 helpers (auction.ts) the API needs.
export interface MathPort {
  computeClearing: AppDeps['computeClearing']
  matchedAt: AppDeps['matchedAt']
  demandAt: AppDeps['demandAt']
  supplyAt: AppDeps['supplyAt']
  candidatePrices: AppDeps['candidatePrices']
  choosePStar: AppDeps['choosePStar']
}

export interface BuildDepsArgs {
  ledger: LedgerPort
  math: MathPort
  clock: Clock
  // The clock's timer-start (clock.openRoundClock), passed explicitly so the test
  // can assert it fires alongside openRound on POST /round.
  openRoundClock: (roundId: string, windowSeconds: number) => void
  roundSeconds: number
  // The AI Solver Agent's verify-don't-trust proposeClearing (agent.ts). main()
  // constructs the real keyless-safe agent once at boot; the unit test injects a stub.
  proposeClearing: AppDeps['proposeClearing']
  // WOW-03: the agent's server-side NL order parser (agent.ts). Same boot agent, same
  // module-private key; keyless-degrades to null. The unit test injects a stub.
  parseOrder: AppDeps['parseOrder']
  // WOW-04: the agent's live rationale streamer (agent.ts messages.stream) + the pure
  // post-round brief composer (brief.ts). Same boot agent for the stream; the brief is
  // a pure import. The unit test injects stubs.
  streamRationale: AppDeps['streamRationale']
  composeBrief: AppDeps['composeBrief']
  // TRUST-03: read the settle-time decision proof bundle (proof.ts). Optional here so the
  // boot-wiring unit test (index.test.ts) need not inject it; buildDeps defaults it to a
  // null reader. main() supplies the real proof.readProofBundle.
  readProofBundle?: AppDeps['readProofBundle']
  // WOW-05: compose + render the on-brand proof-pack PDF (proofpack.ts) for a settled round.
  // Optional for the same reason; buildDeps defaults it to the on-brand HTML fallback.
  buildProofPack?: AppDeps['buildProofPack']
  // CRYP-02/03 + VIZ-02 crypto deps — ALL optional so the index.test.ts boot-wiring path
  // (which never exercises the crypto endpoints) need not inject them; buildDeps defaults
  // each to an inert secret-free stub, exactly like readProofBundle/buildProofPack above.
  // main() supplies the real tlock.ts / zk/*.ts / timemachine.ts implementations.
  timelockEncrypt?: AppDeps['timelockEncrypt']
  timelockDecrypt?: AppDeps['timelockDecrypt']
  drandRoundInfo?: AppDeps['drandRoundInfo']
  generateProof?: AppDeps['generateProof']
  verifyProof?: AppDeps['verifyProof']
  anchorProof?: AppDeps['anchorProof']
  tamperProof?: AppDeps['tamperProof']
  getStageOffsets?: AppDeps['getStageOffsets']
  // VIZ-03 / WOW-07 — the topology hosting map + the guest /join bootstrap. Optional so
  // the boot-wiring unit test (index.test.ts) need not inject them; buildDeps defaults
  // each to an inert, secret-free stub. main() supplies the real topology.ts probe +
  // the guest bootstrap composed from the deploy party map.
  hostingMap?: AppDeps['hostingMap']
  onboardGuest?: AppDeps['onboardGuest']
}

// Assemble the AppDeps so the API routes are wired to the ledger + clock.
//
// CRITICAL WIRING: the injected `openRound` calls the REAL ledger openRound AND
// THEN starts the clock via openRoundClock(roundId, roundSeconds) — opening a round
// must arm the auto-close timer. `closeRound` routes through clock.forceClose so a
// force-close cancels the timer (and the clock calls ledger.closeRound). This factory
// is the single path index.ts and index.test.ts both use, so the test's spies prove
// the live wiring.
export const buildDeps = (args: BuildDepsArgs): AppDeps => {
  const { ledger, math, clock, openRoundClock, roundSeconds, proposeClearing, parseOrder, streamRationale, composeBrief } =
    args
  // TRUST-03: default to a null reader when not injected (index.test.ts boot-wiring path).
  const readProofBundle: AppDeps['readProofBundle'] = args.readProofBundle ?? (() => null)
  // WOW-05: default to the on-brand HTML fallback when not injected (index.test.ts path).
  const buildProofPack: AppDeps['buildProofPack'] = args.buildProofPack ?? (async () => ({ pdf: false as const, html: '' }))
  // CRYP-02/03 + VIZ-02: inert, secret-free defaults for the boot-wiring path (index.test.ts).
  // main() overrides every one with the real tlock/zk/timemachine implementation.
  const timelockEncrypt: AppDeps['timelockEncrypt'] =
    args.timelockEncrypt ?? (async () => ({ ciphertext: '', targetRound: 0, mode: 'offline', warning: '' }))
  const timelockDecrypt: AppDeps['timelockDecrypt'] = args.timelockDecrypt ?? (async () => ({ plaintext: '' }))
  const drandRoundInfo: AppDeps['drandRoundInfo'] =
    args.drandRoundInfo ?? (async () => ({ targetRound: 0, timeToBeaconMs: 0, chainHash: '' }))
  const generateProof: AppDeps['generateProof'] =
    args.generateProof ?? (async () => ({ proof: {}, publicSignals: [], sizeBytes: 0, ms: 0 }))
  const verifyProof: AppDeps['verifyProof'] = args.verifyProof ?? (async () => false)
  const anchorProof: AppDeps['anchorProof'] = args.anchorProof ?? (async () => ({ proofHash: '', vkeyHash: '' }))
  const tamperProof: AppDeps['tamperProof'] =
    args.tamperProof ?? (async () => ({ rejected: true, verified: false as const, error: '' }))
  const getStageOffsets: AppDeps['getStageOffsets'] = args.getStageOffsets ?? (() => ({}))
  // VIZ-03 / WOW-07: inert, secret-free defaults for the boot-wiring path (index.test.ts).
  // main() overrides both with the real topology probe + guest bootstrap.
  const hostingMap: AppDeps['hostingMap'] =
    args.hostingMap ?? (async () => ({ nodes: [], perParty: {}, demoReal: true, caption: 'SAME PARTICIPANT (LOCALNET)' }))
  const onboardGuest: AppDeps['onboardGuest'] =
    args.onboardGuest ?? (async () => ({ party: '', joinUrl: '/join', roundId: '' }))
  return {
    // POST /round → ledger create THEN timer start (both).
    openRound: async (roundId, desks, windowSeconds): Promise<RoundView> => {
      const round = await ledger.openRound(roundId, desks, windowSeconds)
      openRoundClock(round.roundId, roundSeconds)
      return round
    },
    queryRound: ledger.queryRound,
    readSealedOrders: ledger.readSealedOrders,
    refreshStats: ledger.refreshStats,
    readTradeConfirmations: ledger.readTradeConfirmations,
    // POST /round/:id/close → clock.forceClose (cancels the timer, calls ledger.closeRound).
    closeRound: async (roundId): Promise<string> => {
      await clock.forceClose(roundId)
      const state = clock.getState(roundId)
      return state?.status ?? 'Closed'
    },
    settle: ledger.settle,
    // WOW-02: the dedicated tamper seam (never on the /settle path).
    tamperClear: ledger.tamperClear,
    // The AI Solver Agent — proposes a clearing, the deterministic core verifies it.
    proposeClearing,
    // WOW-03: server-side NL order parsing (same boot agent, key module-private).
    parseOrder,
    // WOW-04: live rationale streaming (same boot agent) + the pure brief composer.
    streamRationale,
    composeBrief,
    // TRUST-03: read-only decision proof bundle for GET /round/:id/proof.
    readProofBundle,
    // WOW-05: on-brand proof-pack PDF for GET /round/:id/proof-pack.pdf.
    buildProofPack,
    // CRYP-02/03 + VIZ-02: timelock, ZK prove/verify/anchor/tamper, stage offsets.
    timelockEncrypt,
    timelockDecrypt,
    drandRoundInfo,
    generateProof,
    verifyProof,
    anchorProof,
    tamperProof,
    getStageOffsets,
    // VIZ-03: the party→participant hosting map (credential-free).
    hostingMap,
    // WOW-07: the guest /join bootstrap (party + URL + roundId; never a token).
    onboardGuest,
    computeClearing: math.computeClearing,
    matchedAt: math.matchedAt,
    demandAt: math.demandAt,
    supplyAt: math.supplyAt,
    candidatePrices: math.candidatePrices,
    choosePStar: math.choosePStar,
  }
}

// ── Live boot (only runs when executed as the entrypoint, never on import) ────────
const main = async (): Promise<void> => {
  const dotenv = await import('dotenv')
  dotenv.config()

  const roundSeconds = Number(process.env.ROUND_SECONDS ?? DEFAULT_ROUND_SECONDS) || DEFAULT_ROUND_SECONDS
  const solverPort = Number(process.env.SOLVER_PORT ?? DEFAULT_SOLVER_PORT) || DEFAULT_SOLVER_PORT

  // Import the ledger client AFTER dotenv so it reads JSON_API_URL from .env.
  const ledger = await import('./ledger.js')
  const auction = await import('./auction.js')
  const { createClock } = await import('./clock.js')
  const { createAgent } = await import('./agent.js')
  const { composeBrief } = await import('./brief.js')
  // TRUST-03: the decision proof bundle writer/reader (proof.ts). The write is an ADDITIVE
  // side effect in settleResult below — the deterministic settle path stays byte-unchanged.
  const proof = await import('./proof.js')
  // WOW-05: the on-brand proof-pack renderer + headless-Chrome PDF spawn (proofpack.ts).
  const proofpack = await import('./proofpack.js')
  const { fileURLToPath } = await import('node:url')
  // CRYP-02/03 + VIZ-02: the timelock (tlock.ts), ZK prover/verifier (zk/*.ts), and the
  // VIZ-02 stage→offset capture map (timemachine.ts). Dynamically imported AFTER dotenv so
  // tlock reads DRAND_URL and the zk modules' snarkjs/circomlibjs eval only at live boot
  // (never on the index.test.ts import path). The verification key is the committed §4 fixture.
  const tlock = await import('./tlock.js')
  const zkProve = await import('./zk/prove.js')
  const zkVerify = await import('./zk/verify.js')
  const timemachine = await import('./timemachine.js')
  const { readFileSync } = await import('node:fs')
  const { randomBytes } = await import('node:crypto')
  const vkey = JSON.parse(
    readFileSync(fileURLToPath(new URL('./zk/vkey.json', import.meta.url)), 'utf8'),
  ) as Record<string, unknown>

  // Construct the real AI Solver Agent ONCE at boot. No `client` is passed — agent.ts
  // resolves its own module-private ANTHROPIC_API_KEY (or runs keyless: the §4 fixture
  // still clears at 100.00 with a neutral rationale). index.ts NEVER reads the key.
  const agent = createAgent({
    computeClearing: auction.computeClearing,
    matchedAt: auction.matchedAt,
  })

  // The clock force-closes ON-LEDGER via ledger.closeRound at the window / on demand.
  const clock = createClock({ closeRound: ledger.closeRound })

  // REHYDRATE: recognize live rounds (the sandbox-seeded R1) so the solver does not
  // treat them as unknown. The ledger Round.status is authoritative.
  try {
    const live = await ledger.queryAllRounds()
    clock.rehydrate(
      live.map((r) => ({
        roundId: r.roundId,
        status: r.status as 'Open' | 'Closed' | 'Cleared' | 'Settled',
        windowSeconds: r.windowSeconds,
      })),
    )
    // eslint-disable-next-line no-console
    console.log(`Rehydrated ${live.length} round(s) from the ledger`)
  } catch (err) {
    // Boot must not crash if the sandbox is not yet reachable — log a secret-free note.
    // eslint-disable-next-line no-console
    console.warn('Rehydrate skipped — ledger not reachable yet (will recognize rounds on first request)')
  }

  // Adapt the ledger.ts return shapes onto the API's RoundView / SettleResult
  // (ledger.queryRound returns a CreateEvent<Round>; ledger.settle returns
  // { result, status }). These are thin projections — no behavior change.
  const queryRoundView: LedgerPort['queryRound'] = async (roundId): Promise<RoundView | null> => {
    const c = await ledger.queryRound(roundId)
    if (!c) return null
    return {
      roundId: c.payload.roundId,
      status: c.payload.status,
      desks: c.payload.desks,
      openedAt: c.payload.openedAt,
      windowSeconds: Number(c.payload.windowSeconds),
    }
  }
  const openRoundView: LedgerPort['openRound'] = async (roundId, desks, windowSeconds): Promise<RoundView> => {
    const r = await ledger.openRound(roundId, desks, windowSeconds)
    // VIZ-02: capture the 'open' stage offset (best-effort; a live-ledger read that must
    // NEVER break the open path — an offset is a numeric bookmark, not authority).
    void timemachine.recordStage(roundId, 'open').catch(() => undefined)
    return { roundId: r.roundId, status: r.status }
  }
  const closeRoundStr: LedgerPort['closeRound'] = async (roundId): Promise<string> => {
    const status = String(await ledger.closeRound(roundId))
    // VIZ-02: capture the 'sealed' stage offset at close (best-effort, never fatal).
    void timemachine.recordStage(roundId, 'sealed').catch(() => undefined)
    return status
  }
  const settleResult: LedgerPort['settle'] = async (roundId) => {
    // Capture the §8 allocation BEFORE settle retires the sealed orders (ClearResult
    // carries only the aggregate totalMatched, not per-desk fills). The deterministic
    // computeClearing is the SAME allocation the on-ledger Clear re-verifies.
    const views = (await ledger.readSealedOrders(roundId)).map((s) => s.view)
    const clearing = auction.computeClearing(views)
    const { allocations } = clearing
    const { result } = await ledger.settle(roundId)

    // VIZ-02: capture the 'settled' stage offset (best-effort; NEVER changes settle's return).
    void timemachine.recordStage(roundId, 'settled').catch(() => undefined)

    // TRUST-03: ADDITIVELY persist the immutable decision proof bundle from the LIVE views +
    // the deterministic §8 recompute + an off-authority agent proposal (purely for provenance:
    // verified/source/rawAiProposal). This runs AFTER ledger.settle and NEVER affects the
    // settlement — a write failure is logged secret-free and swallowed so /settle is unchanged.
    try {
      const agentResult = await agent.proposeClearing(views)
      proof.writeProofBundle({
        roundId,
        views,
        agentResult,
        clearingPrice: clearing.clearingPrice,
        allocations: clearing.allocations,
        verified: agentResult.verified,
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Proof bundle write skipped (non-fatal)', err instanceof Error ? err.name : 'unknown')
    }

    return {
      clearingPrice: Number(result.clearingPrice),
      allocations,
      matchedVolume: Number(result.totalMatched),
    }
  }

  // WOW-05: compose the on-brand proof-pack for a settled round from the persisted proof bundle
  // + the per-desk TradeConfirmations + the shareable brief, then render + spawn a PDF. Reads
  // ledger truth (restart-proof); interpolates only numbers/hashes/brief — never a secret.
  const buildProofPack: AppDeps['buildProofPack'] = async (roundId) => {
    const bundle = proof.readProofBundle(roundId)
    const confs = await ledger.readTradeConfirmations(roundId)
    const allocations = confs.map((c) => ({ desk: c.desk, side: c.side, filledQty: c.filledQty }))
    const clearingPrice = bundle?.deterministicRecompute.clearingPrice ?? confs[0]?.clearingPrice ?? 0
    const matchedVolume = confs.filter((c) => c.side === 'Buy').reduce((sum, c) => sum + c.filledQty, 0)
    const rationale = bundle?.rawAiProposal.rationale ?? ''
    const brief = composeBrief(clearingPrice, matchedVolume, allocations, rationale)
    const html = proofpack.renderProofPackHtml({
      clearingPrice,
      matchedVolume,
      allocations,
      brief,
      // AUCT-04: embed the per-desk TCA receipts (two-distinct-surplus) in bundle 02.
      receipts: confs.map((c) => ({
        desk: c.desk,
        side: c.side,
        filledQty: c.filledQty,
        clearingPrice: c.clearingPrice,
        ownLimit: c.ownLimit ?? null,
        referencePrice: c.referencePrice ?? c.clearingPrice,
        surplusVsLimit: c.surplusVsLimit ?? 0,
        improvementVsLimitBp: c.improvementVsLimitBp ?? 0,
        improvementVsReferenceBp: c.improvementVsReferenceBp ?? 0,
      })),
      aiBundle: {
        modelId: bundle?.modelId ?? 'claude-haiku-4-5',
        verified: bundle?.verified ?? false,
        source: bundle?.rawAiProposal.source,
        systemPromptHash: bundle?.systemPromptHash,
        clearingHash: bundle?.clearingHash,
      },
    })
    const safeId = roundId.replace(/[^A-Za-z0-9_.-]/g, '_')
    const outPath = fileURLToPath(new URL(`../.tmp/Umbra-Proof-Pack-${safeId}.pdf`, import.meta.url))
    return proofpack.generateProofPackPdf(html, outPath)
  }

  // ── CRYP-03 proof composition (zk/prove.ts over the round's sealed views) ─────────
  // Build the §4 ClearingWitness from the LIVE sealed orders + the deterministic §8 fills,
  // then produce a real Groth16 proof. Each order's salt is a CRYPTOGRAPHICALLY-RANDOM field
  // element (randomBytes(31) = 248 bits, safely below the BN254 scalar field prime), freshly
  // generated per order — a real blinding factor so the published Poseidon commitments are
  // actually hiding (NOT a guessable index; that defeats sealed-bid privacy). The salt stays
  // in the PRIVATE witness — it never leaves zk/prove.ts; only { proof, publicSignals,
  // sizeBytes, ms } return, and the salt is never logged.
  const saltFieldElement = () => BigInt('0x' + randomBytes(31).toString('hex')).toString()
  const generateProof: AppDeps['generateProof'] = async (roundId) => {
    const views = (await ledger.readSealedOrders(roundId)).map((s) => s.view)
    const clearing = auction.computeClearing(views)
    const pStar = clearing.clearingPrice
    const matched = auction.matchedAt(views, pStar)
    const orders = views.map((v) => {
      const alloc = clearing.allocations.find((a) => a.desk === v.desk && a.side === v.side)
      return {
        side: (v.side === 'Buy' ? 1 : 0) as 0 | 1,
        qty: v.quantity,
        limit: v.limit,
        salt: saltFieldElement(), // high-entropy random blinding factor (never logged / returned)
        fill: alloc?.filledQty ?? 0,
      }
    })
    return zkProve.generateClearingProof({ pStar, matched, orders })
  }

  // CRYP-03 OFF-LEDGER verify — a thin pass-through to the real Groth16 check.
  const verifyProof: AppDeps['verifyProof'] = (vk, publicSignals, proof) =>
    zkVerify.verifyClearingProof(vk, publicSignals, proof)

  // CRYP-03 ON-LEDGER anchor — compute the anchor hashes, record ONLY those on-ledger, and
  // return them. DISTINCT from verify: this records "a proof against this circuit existed",
  // it does NOT re-verify (the off-ledger verify is the separate act).
  const anchorProof: AppDeps['anchorProof'] = async (roundId, proof, publicSignals, vk) => {
    const hashes = zkVerify.proofAnchorHashes(proof, publicSignals, vk)
    await ledger.anchorProof(roundId, hashes.proofHash, hashes.vkeyHash)
    return hashes
  }

  // CRYP-03 "break the proof" — generate a valid proof, perturb the FIRST public signal (p*),
  // re-verify → expect false. Mirrors tamperClear: NEVER throws, NEVER anchors; the verbatim
  // (secret-free) rejection is the payload.
  const tamperProof: AppDeps['tamperProof'] = async (roundId) => {
    try {
      const { proof, publicSignals } = await generateProof(roundId)
      const tampered = [...publicSignals]
      tampered[0] = String(BigInt(tampered[0] ?? '0') + 1n) // perturb p* by +1
      const verified = await zkVerify.verifyClearingProof(vkey, tampered, proof)
      return {
        rejected: !verified,
        verified: false as const,
        error: verified
          ? 'UNEXPECTED: the tampered public input verified — investigate the circuit'
          : 'Groth16 verification rejected the tampered public input (p* perturbed by +1).',
      }
    } catch {
      // Secret-free never-throw contract — a prover/verifier outage still yields a clean body.
      return { rejected: true, verified: false as const, error: 'proof generation or verification unavailable' }
    }
  }

  // ── VIZ-03 topology probe (topology.ts) + WOW-07 guest bootstrap ──────────────────
  // The hosting map probes each participant's /v2/parties with the ADMIN bearer
  // (ledger-api-user, the same token xnode-up.mjs uses across :2975/:3975/:4975). The
  // token lives ONLY inside the probe closure — it never crosses into the TopologyResult
  // (credential-free boundary, SOLV-04 / T-11-03-LEAK). Live-ledger-optional: hostingMap
  // catches a down participant per-probe and degrades to an honest partial/empty map.
  const topology = await import('./topology.js')
  const readAdminBearer = (): string => {
    try {
      const raw = readFileSync(fileURLToPath(new URL('../../scripts/.operator-token', import.meta.url)), 'utf8')
      return (JSON.parse(raw) as { token?: string }).token ?? ''
    } catch {
      return ''
    }
  }
  const readDeskParties = (): string[] => {
    try {
      const raw = readFileSync(fileURLToPath(new URL('../../daml/parties.json', import.meta.url)), 'utf8')
      const p = JSON.parse(raw) as Record<string, string>
      // Focus the hosting map on the DESK parties (A/B/C + the guest bankD when present)
      // so demoReal reflects desk residency, not the participants' own admin parties.
      return [p.bankA, p.bankB, p.bankC, p.bankD].filter((x): x is string => Boolean(x))
    } catch {
      return []
    }
  }
  const readGuestParty = (): string => {
    try {
      const raw = readFileSync(fileURLToPath(new URL('../../web/src/tokens.json', import.meta.url)), 'utf8')
      // Read ONLY the guest party id — the scoped token in tokens.json is NEVER surfaced
      // by the bootstrap endpoint (T-11-03-QR).
      return (JSON.parse(raw) as Record<string, { party?: string }>).bankD?.party ?? ''
    } catch {
      return ''
    }
  }
  const hostingMap: AppDeps['hostingMap'] = () => {
    const adminBearer = readAdminBearer()
    const probe = async (base: string): Promise<{ party: string; isLocal: boolean }[]> => {
      const res = await fetch(`${base}/v2/parties`, { headers: { Authorization: `Bearer ${adminBearer}` } })
      if (!res.ok) throw new Error(`/v2/parties HTTP ${res.status}`)
      const json = (await res.json()) as { partyDetails?: { party: string; isLocal: boolean }[] }
      return (json.partyDetails ?? []).map((d) => ({ party: d.party, isLocal: Boolean(d.isLocal) }))
    }
    return topology.hostingMap(probe, { desks: readDeskParties() })
  }
  const onboardGuest: AppDeps['onboardGuest'] = async () => {
    // Pick a live round for the /join deep-link (Open preferred), degrade to R1. No token.
    let roundId = 'R1'
    try {
      const live = await ledger.queryAllRounds()
      const open = live.find((r) => r.status === 'Open') ?? live[0]
      if (open) roundId = open.roundId
    } catch {
      // ledger unreachable — the default deep-link still works once a round exists.
    }
    // The /join URL carries ONLY the roundId (the QR encodes THIS) — never the token.
    return { party: readGuestParty(), joinUrl: `/join?round=${encodeURIComponent(roundId)}`, roundId }
  }

  const deps = buildDeps({
    ledger: {
      openRound: openRoundView,
      queryRound: queryRoundView,
      readSealedOrders: ledger.readSealedOrders,
      refreshStats: ledger.refreshStats,
      closeRound: closeRoundStr,
      settle: settleResult,
      tamperClear: ledger.tamperClear,
      readTradeConfirmations: ledger.readTradeConfirmations,
    },
    math: {
      computeClearing: auction.computeClearing,
      matchedAt: auction.matchedAt,
      demandAt: auction.demandAt,
      supplyAt: auction.supplyAt,
      candidatePrices: auction.candidatePrices,
      choosePStar: auction.choosePStar,
    },
    clock,
    openRoundClock: (roundId, windowSeconds) => clock.openRoundClock(roundId, windowSeconds),
    roundSeconds,
    proposeClearing: agent.proposeClearing,
    parseOrder: agent.parseOrder,
    streamRationale: agent.streamRationale,
    composeBrief,
    // TRUST-03: serve the settle-time decision proof bundle read-only.
    readProofBundle: proof.readProofBundle,
    // WOW-05: serve the on-brand proof-pack PDF (window.print() HTML fallback).
    buildProofPack,
    // CRYP-02: timelock seal/open + public drand round metadata (tlock.ts).
    timelockEncrypt: (payload, windowMs) => tlock.timelockSeal(payload, windowMs),
    timelockDecrypt: async (ciphertext) => ({ plaintext: await tlock.timelockOpen(ciphertext) }),
    drandRoundInfo: (windowMs) => tlock.drandRoundInfo(windowMs),
    // CRYP-03: ZK prove (off round views) / verify (off-ledger) / anchor (on-ledger) / tamper.
    generateProof,
    verifyProof,
    anchorProof,
    tamperProof,
    // VIZ-02: the recorded stage→offset map for the round (timemachine.ts).
    getStageOffsets: (roundId) => timemachine.getStageOffsets(roundId),
    // VIZ-03: the credential-free party→participant hosting map (topology.ts probe).
    hostingMap,
    // WOW-07: the guest /join bootstrap (party + URL + roundId; never a token).
    onboardGuest,
  })

  const app = createApp(deps)
  app.listen(solverPort, () => {
    // SECRET-FREE boot log: only the bound port + the PUBLIC operator party id.
    // NEVER the token, ANTHROPIC_API_KEY, or process.env (SOLV-04 / T-04-04).
    // eslint-disable-next-line no-console
    console.log(`Solver listening on :${solverPort} as ${ledger.operatorParty}`)
  })
}

// Run main() only when this file is the process entrypoint — importing it for the
// unit test (buildDeps) must NOT boot the service, connect, or listen.
const isEntrypoint = (): boolean => {
  const entry = process.argv[1]
  if (!entry) return false
  // import.meta.url is a file:// URL; compare its path tail to the invoked script.
  return import.meta.url.endsWith(entry.replace(/\\/g, '/').split('/').pop() ?? '__never__')
}

if (isEntrypoint()) {
  main().catch((err) => {
    // Secret-free fatal log — do not serialize the underlying error (could carry a path).
    // eslint-disable-next-line no-console
    console.error('Solver failed to boot:', err instanceof Error ? err.message : 'unknown error')
    process.exit(1)
  })
}
