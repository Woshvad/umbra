// solver/src/zk/verify.ts — CRYP-03 ESM Groth16 verifier + on-ledger anchor.
//
// verifyClearingProof(vkey, publicSignals, proof) is a REAL Groth16 check
// (snarkjs.groth16.verify): true for the genuine §4 proof, FALSE for a forged
// public input (e.g. a doctored p*=99). Verification is OFF-LEDGER by design —
// Canton has NO zk precompile (a documented HARD limitation); on-ledger we anchor
// only the proof/vkey HASHES (proofAnchorHashes), which records "a valid proof
// against this circuit existed" without needing an on-chain verifier.
//
// The trusted setup behind vkey.json is PoC-grade / cryptographer-review-gated
// (single local contributor — build.mjs). Label it as such wherever surfaced.
//
// HASHING: node:crypto sha256 only — the same dependency-free primitive as
// proof.ts's `sha` (T-08-05-CRYPTO: no hand-rolled crypto). No witness, key, or
// token ever reaches these hashes — only the (already-public) proof + signals +
// vkey.

import * as snarkjs from 'snarkjs'
import { createHash } from 'node:crypto'
import type { Groth16Proof, PublicSignals, VKey } from './prove.js'

// sha256 hex — mirrors solver/src/proof.ts `sha` (createHash('sha256')). Kept
// local to avoid widening proof.ts's public surface.
const sha = (s: string): string => createHash('sha256').update(s).digest('hex')

// The on-ledger anchor: a proof-hash binding (proof ‖ publicSignals) plus the
// vkey hash (so a verifier can bind the anchored proof to a KNOWN circuit).
// Both are just Text fields on-ledger (RESEARCH Open Question 3).
export interface ProofAnchor {
  proofHash: string
  vkeyHash: string
}

// REAL Groth16 verification (off-ledger). Returns true only if `proof` is a
// valid proof of `publicSignals` under `vkey`. A forged public signal → false.
export const verifyClearingProof = (
  vkey: VKey,
  publicSignals: PublicSignals,
  proof: Groth16Proof,
): Promise<boolean> => snarkjs.groth16.verify(vkey, publicSignals, proof)

// Deterministic on-ledger anchor hashes for a verified proof. Same inputs →
// same hashes (used to prove-then-anchor: verify off-ledger, record the hash).
export const proofAnchorHashes = (
  proof: Groth16Proof,
  publicSignals: PublicSignals,
  vkey: VKey,
): ProofAnchor => ({
  proofHash: sha(JSON.stringify(proof) + JSON.stringify(publicSignals)),
  vkeyHash: sha(JSON.stringify(vkey)),
})
