---
status: testing
phase: 09-auction-depth-live-viz
source: [09-VERIFICATION.md]
started: 2026-07-09T19:30:00Z
updated: 2026-07-09T19:30:00Z
---

## Current Test

number: 1
name: Live per-type order submission (LIMIT / NONCOMP / MAQ / COND) into a running OPEN round
expected: |
  All four order types submit successfully via Venue.SubmitOrder on each desk's own
  DamlLedger token; the one-per-round lock engages after seal; the round clears with the
  richer book. (Code + ensure guards + 23/23 daml tests + web build/vitest are green; only
  the live end-to-end submit was not booted — human_verify_mode = end-of-phase.)
awaiting: user response

## Tests

### 1. Live per-type order submission (AUCT-01, SC#1)
expected: Boot the live Canton stack; from each desk plane submit one order of each type (LIMIT, NONCOMP, MAQ, COND) into a running OPEN round and confirm the sealed order is created on the desk's own token. All four submit successfully via Venue.SubmitOrder on the desk's own ledger; the one-per-round lock engages; the round clears with the richer book.
result: [pending]

### 2. Live aggregate indicative feed + assembling→locked crossing (AUCT-03, VIZ-01, SC#3)
expected: With a live OPEN round, seal orders one at a time and watch the Theatre INDICATIVE panel + CrossingChart. The aggregate indicative price / net imbalance / est. matched update as orders arrive; ONLY scalars are shown (never an individual order or candidate-price curve); the small-N guard shows a coarse band AND withholds imbalance/matched until ≥2 orders per crossing side (CR-01 fix — verify no ±quantity leak at N=1); the CrossingChart shows ASSEMBLING (no red p*) and LOCKS the red p* at close.
result: [pending]

### 3. Live per-desk TCA receipt + export + proof-pack (AUCT-04, SC#4)
expected: Settle a live round and open the per-desk TCA receipt in SettlementView + EXPORT RECEIPT + proof-pack. Each desk sees its own receipt with two DISTINCT surplus rows (PROVEN vs-LIMIT on-ledger ≥0, and a labeled BENCHMARK vs-REFERENCE that may be negative); EXPORT RECEIPT downloads a secret-free text receipt; the proof-pack embeds the receipts.
result: [pending]

### 4. Live §4 continuous canary — settles $100.00 / A=10 / B=8 / C=2 (SC#1..4)
expected: Confirm the §4 fixture still clears at exactly $100.00 (A=10/B=8/C=2) end-to-end on the live settle path with the new order-model + TCA fields in the wire. Live round settles A=10/B=8/C=2 @ $100.00; three TradeConfirmations carry the TCA fields; balances match §4 (A:10/4000, B:12/1800, C:13/1200).
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
