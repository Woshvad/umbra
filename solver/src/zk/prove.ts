// solver/src/zk/prove.ts — CRYP-03 ESM Groth16 prover (PoC-grade).
//
// generateClearingProof(witness) computes each order's Poseidon commitment
// HOST-SIDE (circomlibjs buildPoseidon — same params as the in-circuit
// circomlib Poseidon(4)), assembles the full circuit input, and produces a real
// Groth16 proof via snarkjs.groth16.fullProve (ESM — NEVER circom's CommonJS
// generate_witness.js, Pitfall 3). The wasm/zkey are the committed §4 fixtures,
// resolved from import.meta.url exactly like proof.ts resolves solver/proofs.
//
// SECURITY (spec §15 / T-10-11): the PRIVATE witness — every order's
// side/qty/limit/salt/fill — NEVER enters a return value or a log. Only the
// proof, the public signals ([pStar, matched, comm…]), and their sizes cross
// out. The commitments comm[i] are irreversible Poseidon hashes, so publishing
// them reveals no order value ("reveals no losing order").

import * as snarkjs from 'snarkjs'
import { buildPoseidon } from 'circomlibjs'
import { fileURLToPath } from 'node:url'

// Committed §4 PoC fixtures, resolved relative to THIS module (src/zk/).
const WASM_PATH = fileURLToPath(new URL('./clearing.wasm', import.meta.url))
const ZKEY_PATH = fileURLToPath(new URL('./clearing_final.zkey', import.meta.url))

// A Groth16 proof + its public signals are opaque JSON to us — the ONLY things
// that cross the prover boundary alongside their byte size + timing.
export type Groth16Proof = Record<string, unknown>
export type PublicSignals = string[]
export type VKey = Record<string, unknown>

// One order's PRIVATE witness. side: 1 = Buy, 0 = Sell (matches the circuit's
// side-gated limit compliance: buy fill ⇒ limit≥p*, sell fill ⇒ limit≤p*).
// salt is a decimal-integer field element (string) — kept private, never logged.
export interface OrderWitness {
  side: 0 | 1
  qty: number
  limit: number
  salt: string
  fill: number
}

// The full clearing witness for a batch of N orders at the published (pStar,
// matched). pStar/limit are whole numbers for the §4 fixture (100/101/99/100).
export interface ClearingWitness {
  pStar: number
  matched: number
  orders: OrderWitness[]
}

// The prover's OUTPUT — proof + public signals only. No witness field exists.
export interface ClearingProof {
  proof: Groth16Proof
  publicSignals: PublicSignals
  sizeBytes: number
  ms: number
}

// Compute the host-side Poseidon commitment for one order — must byte-match the
// in-circuit Poseidon(4) over [side, qty, limit, salt]. Returns a decimal string
// (field element) so it round-trips as a snarkjs signal input + a public signal.
const commitmentOf = (
  poseidon: Awaited<ReturnType<typeof buildPoseidon>>,
  o: OrderWitness,
): string =>
  poseidon.F.toObject(poseidon([o.side, o.qty, o.limit, BigInt(o.salt)])).toString()

// Produce a REAL Groth16 proof that (pStar, matched, comm…) is a fair,
// conserving clearing of the COMMITTED batch. Throws if the witness is
// inconsistent (e.g. matched ≠ Σ fills) — witness generation fails inside
// fullProve, which is exactly the CRYP-03 tamper-reject-by-witness path.
export const generateClearingProof = async (
  witness: ClearingWitness,
): Promise<ClearingProof> => {
  const poseidon = await buildPoseidon()
  const comm = witness.orders.map((o) => commitmentOf(poseidon, o))

  // The full circuit input: public [pStar, matched, comm] + the private witness
  // arrays. This object is local and never returned/logged.
  const input: Record<string, unknown> = {
    pStar: witness.pStar,
    matched: witness.matched,
    comm,
    side: witness.orders.map((o) => o.side),
    qty: witness.orders.map((o) => o.qty),
    limit: witness.orders.map((o) => o.limit),
    salt: witness.orders.map((o) => o.salt),
    fill: witness.orders.map((o) => o.fill),
  }

  const t0 = Date.now()
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH)
  const ms = Date.now() - t0

  // Only proof + public signals + sizes cross out — the witness stays here.
  return {
    proof,
    publicSignals,
    sizeBytes: Buffer.byteLength(JSON.stringify(proof), 'utf8'),
    ms,
  }
}
