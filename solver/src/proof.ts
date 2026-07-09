// solver/src/proof.ts — TRUST-03 immutable per-round decision proof bundle.
//
// Every settle additively persists a JSON "decision proof" under solver/proofs/<id>.json
// so the AI's clearing decision is a FIRST-CLASS AUDITABLE ARTIFACT, not just "trust the
// recompute". The bundle records what the model was asked (as HASHES, never the raw prompt),
// what it proposed (numbers only), the deterministic §8 recompute, whether the two agreed,
// and a hash of the settled clearing.
//
// SECURITY (Pitfall 6 / T-08-05-BUNDLE / spec §15): the bundle NEVER contains the
// ANTHROPIC_API_KEY, the operator token, or the RAW system prompt. It stores
// `systemPromptHash` = sha256(SYSTEM_PROMPT) and `batchHash` = sha256(buildBatchMessage(views))
// instead — irreversible fingerprints that prove provenance without leaking content.
// `rawAiProposal` carries only the agent's numbers + its (already-surfaced) rationale +
// its source label. solver/proofs/ is gitignored (root .gitignore) — bundles are ephemeral
// per-round output and are never committed.
//
// HASHING: node:crypto createHash('sha256') only — no hand-rolled crypto (T-08-05-CRYPTO).
// On-ledger anchoring of the clearingHash is deferred to Phase 10.
//
// FILESYSTEM: writeFileSync / readFileSync / mkdirSync, resolved relative to import.meta.url
// exactly like ledger.ts's operator-token read (ledger.ts:46). The roundId is sanitized into
// the filename so a hostile id (e.g. a `../` traversal via GET /round/:id/proof) can never
// escape solver/proofs/.

import { createHash } from 'node:crypto'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { SYSTEM_PROMPT, buildBatchMessage, type AgentResult } from './agent.js'
import type { Allocation, OrderView } from './auction.js'

// The pinned solver model id (mirrors agent.ts's `model: 'claude-haiku-4-5'`).
export const PROOF_MODEL_ID = 'claude-haiku-4-5'

// solver/proofs/ resolved from THIS module (solver/src/proof.ts → solver/proofs).
const PROOFS_DIR = fileURLToPath(new URL('../proofs', import.meta.url))

// sha256 hex — the ONLY hashing primitive (node:crypto, dependency-free, deterministic).
const sha = (s: string): string => createHash('sha256').update(s).digest('hex')

// Sanitize a roundId into a safe filename component (no path traversal, no separators).
// A round id is normally a simple token (R1, R-<ts>); this hardens the GET /:id/proof path.
const safeName = (roundId: string): string => roundId.replace(/[^A-Za-z0-9_.-]/g, '_')

// The agent's proposal as recorded in the bundle — numbers + the (presentational) rationale
// + the source label. NEVER a secret: the model output carries no key/prompt.
export interface RawAiProposal {
  clearingPrice: number
  allocations: Allocation[]
  rationale: string
  source: AgentResult['source']
}

// The immutable proof bundle shape (TRUST-03). Field order is stable for a readable artifact.
export interface ProofBundle {
  roundId: string
  timestamp: string
  modelId: string
  systemPromptHash: string
  batchHash: string
  rawAiProposal: RawAiProposal
  deterministicRecompute: { clearingPrice: number; allocations: Allocation[] }
  verified: boolean
  clearingHash: string
}

export interface WriteProofParams {
  roundId: string
  views: OrderView[]
  agentResult: AgentResult
  clearingPrice: number
  allocations: Allocation[]
  verified: boolean
}

// Build + persist the decision proof bundle for a settled round. Returns the bundle it wrote
// (so a caller/test can assert on it without re-reading). mkdirSync(recursive) is idempotent.
export const writeProofBundle = (params: WriteProofParams): ProofBundle => {
  const { roundId, views, agentResult, clearingPrice, allocations, verified } = params

  const bundle: ProofBundle = {
    roundId,
    timestamp: new Date().toISOString(),
    modelId: PROOF_MODEL_ID,
    // Provenance WITHOUT the content: irreversible fingerprints of the prompt + the batch.
    systemPromptHash: sha(SYSTEM_PROMPT),
    batchHash: sha(buildBatchMessage(views)),
    // The AI's proposal — numbers + rationale + source, never a secret.
    rawAiProposal: {
      clearingPrice: agentResult.clearingPrice,
      allocations: agentResult.allocations,
      rationale: agentResult.rationale,
      source: agentResult.source,
    },
    // The deterministic §8 recompute — the source of truth the on-ledger Clear re-verified.
    deterministicRecompute: { clearingPrice, allocations },
    verified,
    clearingHash: sha(JSON.stringify({ clearingPrice, allocations })),
  }

  mkdirSync(PROOFS_DIR, { recursive: true })
  writeFileSync(join(PROOFS_DIR, `${safeName(roundId)}.json`), JSON.stringify(bundle, null, 2), 'utf8')
  return bundle
}

// Read a previously-written bundle (or null if none exists / is unreadable). Read-only.
export const readProofBundle = (roundId: string): ProofBundle | null => {
  try {
    const raw = readFileSync(join(PROOFS_DIR, `${safeName(roundId)}.json`), 'utf8')
    return JSON.parse(raw) as ProofBundle
  } catch {
    return null
  }
}
