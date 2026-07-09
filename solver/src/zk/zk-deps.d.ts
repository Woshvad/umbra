// Ambient module declarations for the pure-JS ZK toolchain (no shipped types).
// Minimal typed surface for exactly what prove.ts / verify.ts use — the full
// snarkjs/circomlibjs APIs are larger; we declare only the ESM entry points the
// CRYP-03 wrappers call. Build-only deps (ffjavascript) live in build.mjs (JS,
// not typechecked) and are intentionally not declared here.

declare module 'snarkjs' {
  export const groth16: {
    // ESM-safe programmatic prover — does witness calc internally (Pitfall 3:
    // NEVER the CommonJS generate_witness.js).
    fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: Record<string, unknown>; publicSignals: string[] }>
    verify(
      vkey: unknown,
      publicSignals: string[],
      proof: Record<string, unknown>,
    ): Promise<boolean>
  }
}

declare module 'circomlibjs' {
  interface PoseidonField {
    toObject(x: Uint8Array): bigint
  }
  interface Poseidon {
    (inputs: Array<number | bigint | string>): Uint8Array
    F: PoseidonField
  }
  // Host-side Poseidon matching the in-circuit circomlib Poseidon params.
  export function buildPoseidon(): Promise<Poseidon>
}
