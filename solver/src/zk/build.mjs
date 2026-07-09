// solver/src/zk/build.mjs — one-time CRYP-03 Groth16 build (PoC-grade).
//
// Compiles clearing.circom with the pinned circom.exe (v2.2.3), runs a small
// LOCAL powers-of-tau (pow 12) → Groth16 setup → single-contributor contribution
// → exports clearing_final.zkey + vkey.json. This is the "PoC trusted setup /
// cryptographer-review-gated" ceremony (A5): a SINGLE local contributor, NOT a
// multi-party ceremony. A production deployment needs a real multi-party
// powers-of-tau ceremony. Verification is OFF-LEDGER by design (Canton has no zk
// precompile — a documented HARD limitation); only the proof/vkey HASH is
// anchored on-ledger.
//
// Run once from solver/src/zk:  node build.mjs
// The §4 FIXTURES it emits (clearing.wasm, clearing_final.zkey, vkey.json) are
// COMMITTED so CI verifies without re-running the setup. The large intermediate
// artifacts (*.r1cs, *.sym, *.ptau, clearing_js/) stay gitignored (10-02).
//
// NOTE: circom's clearing_js/generate_witness.js (CommonJS) is NEVER used by the
// solver runtime — prove.ts calls snarkjs.groth16.fullProve (ESM, Pitfall 3). It
// is emitted by the compile step only and lives in the gitignored clearing_js/.

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import * as snarkjs from 'snarkjs'
import { getCurveFromName } from 'ffjavascript'

const HERE = dirname(fileURLToPath(import.meta.url))
const TMP = join(HERE, '.tmp')
const CIRCOM = join(HERE, process.platform === 'win32' ? 'circom.exe' : 'circom')
// circomlib includes resolve via -l <solver>/node_modules (../../node_modules).
const LIB = join(HERE, '..', '..', 'node_modules')

const R1CS = join(HERE, 'clearing.r1cs')
const WASM_SRC = join(HERE, 'clearing_js', 'clearing.wasm')
const WASM_DST = join(HERE, 'clearing.wasm')
const POT_0 = join(TMP, 'pot12_0000.ptau')
const POT_1 = join(TMP, 'pot12_0001.ptau')
const POT_FINAL = join(TMP, 'pot12_final.ptau')
const ZKEY_0 = join(TMP, 'clearing_0000.zkey')
const ZKEY_FINAL = join(HERE, 'clearing_final.zkey')
const VKEY = join(HERE, 'vkey.json')

const entropy = () => randomBytes(32).toString('hex')

async function main() {
  mkdirSync(TMP, { recursive: true })

  console.log('[1/6] compiling clearing.circom (circom 2.2.3)…')
  // Emits clearing.r1cs, clearing.sym, clearing_js/clearing.wasm; prints the
  // "non-linear constraints" count (≈1221) to stdout.
  const out = execFileSync(
    CIRCOM,
    ['clearing.circom', '--r1cs', '--wasm', '--sym', '-l', LIB],
    { cwd: HERE, encoding: 'utf8' },
  )
  process.stdout.write(out)
  copyFileSync(WASM_SRC, WASM_DST)

  const curve = await getCurveFromName('bn128')

  console.log('[2/6] powers-of-tau: new accumulator (pow 12)…')
  await snarkjs.powersOfTau.newAccumulator(curve, 12, POT_0)

  console.log('[3/6] powers-of-tau: single PoC contribution…')
  await snarkjs.powersOfTau.contribute(POT_0, POT_1, 'umbra-poc', entropy())

  console.log('[4/6] powers-of-tau: prepare phase 2…')
  await snarkjs.powersOfTau.preparePhase2(POT_1, POT_FINAL)

  console.log('[5/6] groth16 setup + single PoC zkey contribution…')
  await snarkjs.zKey.newZKey(R1CS, POT_FINAL, ZKEY_0)
  await snarkjs.zKey.contribute(ZKEY_0, ZKEY_FINAL, 'umbra-poc', entropy())

  console.log('[6/6] exporting vkey.json…')
  const vkey = await snarkjs.zKey.exportVerificationKey(ZKEY_FINAL)
  const { writeFileSync } = await import('node:fs')
  writeFileSync(VKEY, JSON.stringify(vkey, null, 2), 'utf8')

  // snarkjs holds worker threads open; free the curve so the process exits.
  await curve.terminate()
  rmSync(TMP, { recursive: true, force: true })

  console.log('\n✓ CRYP-03 PoC artifacts emitted:')
  console.log('  - clearing.wasm         (committed §4 fixture)')
  console.log('  - clearing_final.zkey   (committed §4 fixture)')
  console.log('  - vkey.json             (committed §4 fixture)')
}

main().catch((e) => {
  console.error('build.mjs failed:', e)
  process.exit(1)
})
