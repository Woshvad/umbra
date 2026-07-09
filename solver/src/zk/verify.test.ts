import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { generateClearingProof, type ClearingProof, type ClearingWitness, type VKey } from './prove.js'
import { verifyClearingProof, proofAnchorHashes } from './verify.js'

// CRYP-03 — a REAL circom/snarkjs Groth16 proof over the §4 committed batch:
//   ACCEPT the genuine proof (p*=100, matched=10) · REJECT a forged public input
//   (p*=99 → verify false) · REJECT an inconsistent clearing (matched=12 → witness
//   generation throws). No mock, no short-circuit — the committed fixtures
//   (clearing.wasm / clearing_final.zkey / vkey.json) let CI verify without
//   re-running the trusted setup.

// The committed §4 verification key (PoC trusted setup).
const vkey = JSON.parse(
  readFileSync(fileURLToPath(new URL('./vkey.json', import.meta.url)), 'utf8'),
) as VKey

// The §4 fixture as a ZK witness — mirrors daml Tests.daml test_clears_at_100:
//   A Buy 10 @101 (fill 10) · B Sell 8 @99 (fill 8) · C Sell 5 @100 (fill 2,
//   residual 3). side 1=Buy / 0=Sell. Salts are private field elements.
const SECTION4: ClearingWitness = {
  pStar: 100,
  matched: 10,
  orders: [
    { side: 1, qty: 10, limit: 101, salt: '111111111111', fill: 10 },
    { side: 0, qty: 8, limit: 99, salt: '222222222222', fill: 8 },
    { side: 0, qty: 5, limit: 100, salt: '333333333333', fill: 2 },
  ],
}

// Order values that MUST NOT appear in the public signals — the salts (private
// field elements) and C's partial-fill / residual / private qtys+limits. p*=100
// and matched=10 ARE public; qty 10 == matched and limit 100 == p* only coincide.
const LOSING_VALUES = ['111111111111', '222222222222', '333333333333', '101', '99', '8', '5', '2', '3']

describe('CRYP-03 groth16 proof-of-correct-clearing', () => {
  let proof: ClearingProof

  beforeAll(async () => {
    proof = await generateClearingProof(SECTION4)
  }, 60_000)

  it('ACCEPTS the real §4 proof (p*=100, matched=10) and leaks no losing order', async () => {
    // Public signals are exactly [pStar, matched, comm0, comm1, comm2].
    expect(proof.publicSignals[0]).toBe('100')
    expect(proof.publicSignals[1]).toBe('10')
    expect(proof.publicSignals).toHaveLength(5)

    // The verifier accepts the genuine proof — a REAL Groth16 check.
    await expect(verifyClearingProof(vkey, proof.publicSignals, proof.proof)).resolves.toBe(true)

    // T-10-11: no losing/private order value appears in the public signals.
    for (const v of LOSING_VALUES) {
      expect(proof.publicSignals).not.toContain(v)
    }
  })

  it('REJECTS a forged public input (doctored p*=99 → verify false)', async () => {
    const forged = [...proof.publicSignals]
    forged[0] = '99' // claim a different clearing price against the same proof
    await expect(verifyClearingProof(vkey, forged, proof.proof)).resolves.toBe(false)
  })

  it('REJECTS an inconsistent clearing (matched=12 → witness generation throws)', async () => {
    // Same fills (Σ = 10) but matched=12 violates conservation (sb===matched);
    // fullProve cannot even build a witness → it rejects. No fake pass possible.
    const inconsistent: ClearingWitness = { ...SECTION4, matched: 12 }
    await expect(generateClearingProof(inconsistent)).rejects.toThrow()
  }, 60_000)

  it('derives DETERMINISTIC on-ledger anchor hashes (proof/vkey)', () => {
    const a = proofAnchorHashes(proof.proof, proof.publicSignals, vkey)
    const b = proofAnchorHashes(proof.proof, proof.publicSignals, vkey)
    expect(a).toEqual(b)
    expect(a.proofHash).toMatch(/^[0-9a-f]{64}$/)
    expect(a.vkeyHash).toMatch(/^[0-9a-f]{64}$/)
    expect(a.proofHash).not.toBe(a.vkeyHash)
  })
})
