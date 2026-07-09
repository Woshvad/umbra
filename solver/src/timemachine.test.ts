// solver/src/timemachine.test.ts — the executable contract for the VIZ-02
// stage→offset capture map. Ledger-FREE: the offset source is injected, so no live
// ledger (and no operator token) is needed to prove the record→get round-trip.
//
// Proven here:
//   • recordStage captures the injected offset for a (round, stage) pair.
//   • getStageOffsets returns the accumulated { open, committed, sealed, cleared,
//     settled } map; stages never recorded are ABSENT (not zero/null).
//   • Re-recording a stage is last-write-wins (idempotent-safe, no crash).
//   • Two rounds keep independent maps.

import { describe, it, expect, beforeEach } from 'vitest'
import { recordStage, getStageOffsets, __resetTimeMachine } from './timemachine.js'

describe('VIZ-02 stage→offset capture', () => {
  beforeEach(() => {
    __resetTimeMachine()
  })

  it('records a five-stage map with an injected offset source', async () => {
    let n = 100
    const src = async () => n++ // 100, 101, 102, 103, 104
    await recordStage('R1', 'open', undefined, src)
    await recordStage('R1', 'committed', undefined, src)
    await recordStage('R1', 'sealed', undefined, src)
    await recordStage('R1', 'cleared', undefined, src)
    await recordStage('R1', 'settled', undefined, src)

    expect(getStageOffsets('R1')).toEqual({
      open: 100,
      committed: 101,
      sealed: 102,
      cleared: 103,
      settled: 104,
    })
  })

  it('accepts an explicit offset (no source call)', async () => {
    await recordStage('R2', 'committed', 42)
    expect(getStageOffsets('R2')).toEqual({ committed: 42 })
  })

  it('omits stages that were never recorded', async () => {
    await recordStage('R3', 'open', 1)
    await recordStage('R3', 'cleared', 9)
    const map = getStageOffsets('R3')
    expect(map).toEqual({ open: 1, cleared: 9 })
    expect('committed' in map).toBe(false)
    expect('settled' in map).toBe(false)
  })

  it('re-records a stage last-write-wins (idempotent-safe)', async () => {
    await recordStage('R4', 'committed', 5)
    await recordStage('R4', 'committed', 8)
    expect(getStageOffsets('R4')).toEqual({ committed: 8 })
  })

  it('keeps rounds independent', async () => {
    await recordStage('RA', 'open', 1)
    await recordStage('RB', 'settled', 2)
    expect(getStageOffsets('RA')).toEqual({ open: 1 })
    expect(getStageOffsets('RB')).toEqual({ settled: 2 })
  })

  it('returns an empty map for an unknown round', () => {
    expect(getStageOffsets('nope')).toEqual({})
  })
})
