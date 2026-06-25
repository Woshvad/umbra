// solver/src/clock.test.ts — the executable contract for the in-memory round clock.
//
// Uses vitest FAKE TIMERS (vi.useFakeTimers) — never real sleeps — so the
// ROUND_SECONDS window can be advanced deterministically and instantly.
//
// Proven here:
//   • The auto-close timer fires at the window: advancing time past ROUND_SECONDS
//     calls the injected closeRound EXACTLY once and transitions state to 'Closed'.
//   • forceClose BEFORE the window cancels the timer: advancing time afterward does
//     NOT call closeRound a second time (T-04-11, no leaked/double-firing timer).
//   • forceClose is idempotent: a second call on an already-Closed round is a no-op.
//
// closeRound is a stub (vi.fn) — no live ledger.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClock } from './clock.js'

// The window the tests drive (the call site passes ROUND_SECONDS here).
const ROUND_SECONDS = 60

describe('in-memory round clock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('auto-closes at the ROUND_SECONDS window (closeRound called once → Closed)', async () => {
    const closeRound = vi.fn(async () => undefined)
    const clock = createClock({ closeRound })

    const state = clock.openRoundClock('R1', ROUND_SECONDS)
    expect(state.status).toBe('Open')
    expect(closeRound).not.toHaveBeenCalled()

    // Advance time PAST the window so the auto-close timer fires.
    await vi.advanceTimersByTimeAsync(ROUND_SECONDS * 1000)

    expect(closeRound).toHaveBeenCalledTimes(1)
    expect(closeRound).toHaveBeenCalledWith('R1')
    expect(clock.getState('R1')?.status).toBe('Closed')
  })

  it('forceClose BEFORE the window cancels the timer (no second closeRound)', async () => {
    const closeRound = vi.fn(async () => undefined)
    const clock = createClock({ closeRound })

    clock.openRoundClock('R1', ROUND_SECONDS)

    // Force-close at half the window — this should cancel the auto-close timer.
    await vi.advanceTimersByTimeAsync((ROUND_SECONDS / 2) * 1000)
    await clock.forceClose('R1')

    expect(closeRound).toHaveBeenCalledTimes(1)
    expect(clock.getState('R1')?.status).toBe('Closed')

    // Advance PAST when the original timer would have fired — it must NOT fire again.
    await vi.advanceTimersByTimeAsync(ROUND_SECONDS * 1000)

    expect(closeRound).toHaveBeenCalledTimes(1) // still exactly one — timer was cancelled
  })

  it('forceClose is idempotent (a second call is a no-op)', async () => {
    const closeRound = vi.fn(async () => undefined)
    const clock = createClock({ closeRound })

    clock.openRoundClock('R1', ROUND_SECONDS)

    await clock.forceClose('R1')
    await clock.forceClose('R1') // already Closed → must not call closeRound again

    expect(closeRound).toHaveBeenCalledTimes(1)
    expect(clock.getState('R1')?.status).toBe('Closed')
  })

  it('forceClose on an unknown round is a safe no-op', async () => {
    const closeRound = vi.fn(async () => undefined)
    const clock = createClock({ closeRound })

    await clock.forceClose('does-not-exist')

    expect(closeRound).not.toHaveBeenCalled()
    expect(clock.getState('does-not-exist')).toBeUndefined()
  })

  it('rehydrate seeds map state from live rounds without starting a timer', async () => {
    const closeRound = vi.fn(async () => undefined)
    const clock = createClock({ closeRound })

    clock.rehydrate([{ roundId: 'R1', status: 'Open', windowSeconds: ROUND_SECONDS }])
    expect(clock.getState('R1')?.status).toBe('Open')

    // No timer was armed by rehydrate, so advancing time must not auto-close.
    await vi.advanceTimersByTimeAsync(ROUND_SECONDS * 2 * 1000)
    expect(closeRound).not.toHaveBeenCalled()
    expect(clock.getState('R1')?.status).toBe('Open')
  })
})
