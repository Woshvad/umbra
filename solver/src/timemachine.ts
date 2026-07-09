// solver/src/timemachine.ts — the VIZ-02 stage→offset capture map.
//
// A module-scoped `Map<roundId, Partial<Record<Stage, offset>>>` records the ledger
// offset at each lifecycle stage of a round (open → committed → sealed → cleared →
// settled). The browser replays those offsets per party (each desk with its OWN
// token) to reconstruct "what BankB could see at stage N" — the operator plane only
// supplies the offsets, the per-party ACS reads happen in the browser (RESOLVED
// Open Q2). Mirrors the clock.ts in-memory pattern.
//
// AUTHORITY (mirrors clock.ts T-04-10): this map is CACHE / CLOCK state ONLY. The
// ledger is authoritative — an offset is just a numeric bookmark into the ledger's
// own event log; re-reading the ACS at that offset is what yields the real per-party
// view. A missing stage is simply un-recorded, not "empty".
//
// SECRETS: like clock.ts, this module deals only in roundId / stage / numeric offset.
// It never holds the operator token. The default offset source (ledger.ts
// currentOffset) reads the offset through the module-private auth header inside
// ledger.ts and hands back only the number.

import { currentOffset } from './ledger.js'

// The lifecycle stages a round passes through, in order.
export type Stage = 'open' | 'committed' | 'sealed' | 'cleared' | 'settled'

// The recorded offsets for one round. A stage absent from the record was never
// captured (distinct from offset 0).
export type StageOffsets = Partial<Record<Stage, number>>

// An injectable offset source so the unit test runs with no live ledger.
export type OffsetSource = () => Promise<number>

// Module-private map — never exposed directly; the ledger is authoritative.
const rounds = new Map<string, StageOffsets>()

// ── recordStage ──────────────────────────────────────────────────────────────────
// Capture the offset for a (round, stage). `offset` defaults to the current ledger
// offset (via currentOffset), but stays injectable (`source`) so the test needs no
// ledger. Last write wins — re-recording a stage is idempotent-safe.
export const recordStage = async (
  roundId: string,
  stage: Stage,
  offset?: number,
  source: OffsetSource = currentOffset,
): Promise<number> => {
  const at = offset ?? (await source())
  const map = rounds.get(roundId) ?? {}
  map[stage] = at
  rounds.set(roundId, map)
  return at
}

// ── getStageOffsets ──────────────────────────────────────────────────────────────
// Return the recorded stage->offset map for a round (a COPY, so callers cannot mutate
// the private map). Unknown round → empty object; un-recorded stages are absent.
export const getStageOffsets = (roundId: string): StageOffsets => ({ ...(rounds.get(roundId) ?? {}) })

// ── __resetTimeMachine ─────────────────────────────────────────────────────────────
// Test-only: clear all recorded offsets (mirrors a fresh module load).
export const __resetTimeMachine = (): void => {
  rounds.clear()
}
