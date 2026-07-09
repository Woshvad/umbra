---
status: testing
phase: 08-demo-hardening
source: [08-VERIFICATION.md]
started: 2026-07-09T13:25:00Z
updated: 2026-07-09T13:25:00Z
---

## Current Test

number: 1
name: WOW-01 live — raw v2 rival peek returns empty []/403 at the wire
expected: |
  As BankA (BankA's own token), run the PeekConsole against a rival (BankB) Order via raw
  POST /v2/state/active-contracts on the running LocalNet (:2975/:4975). The raw response
  pane shows an empty [] (or 403) live; the second target (rival TradeConfirmation) is also
  empty — privacy proven at the wire, not in render logic.
awaiting: user response

## Tests

### 1. WOW-01 live — raw v2 rival peek returns empty []/403 at the wire
expected: As BankA (own token), the PeekConsole raw response pane shows an empty [] (or 403) for a rival BankB Order via POST /v2/state/active-contracts on the running LocalNet; the rival TradeConfirmation target is also empty.
result: [pending]

### 2. WOW-02 live — wrong clear rejected on-ledger, correct clear settles $100.00
expected: On the Agent view Break-the-AI panel, FORCE A WRONG CLEAR surfaces the VERBATIM on-ledger Round.Clear assertMsg rejection with no balance change; RUN CORRECT CLEAR then settles at exactly $100.00 (A=10/B=8/C=2).
result: [pending]

### 3. WOW-03/WOW-04 live — NL parse prefills, rationale streams via SSE, brief renders
expected: Type plain English in the Order Ticket → PARSE returns a validated {side,qty,limit} that prefills the ticket (SEAL ORDER stays the single confirm, never auto-submit); during a real solve the AgentRationale streams token-by-token via SSE from real Anthropic; a shareable post-round brief renders.
result: [pending]

### 4. WOW-05 live — one-click proof-pack PDF downloads on-brand
expected: After a real settlement, click DOWNLOAD PROOF-PACK ↓ and a proof-pack PDF downloads and opens on-brand (paper #F4F1EA / ink #0A0A0A / lime #D6FB3C; Space Grotesk / IBM Plex Mono / Inter) with clearing proof + per-desk best-ex receipts + finality record + AI decision bundle.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
