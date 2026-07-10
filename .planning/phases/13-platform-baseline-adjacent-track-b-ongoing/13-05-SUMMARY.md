---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 05
subsystem: solver
tags: [fix-4.4, order-entry, newordersingle, executionreport, framing, checksum, bodylength, session, msgseqnum, hand-rolled, dependency-minimalism]

# Dependency graph
requires:
  - phase: 05 (§8 clearing port)
    provides: agent.ts orderSchema shape mirrored by fix.ts submitOrderSchema (zod re-validation discipline)
provides:
  - Hand-rolled FIX 4.4 order-entry subset (framing bodyLength/checkSum + parseFix/buildFix + fixToSubmitOrder + handleFixMessage acceptor + newFixSession)
  - Pure, offline-tested protocol logic for 13-09 to expose via an HTTP-wrapped raw-FIX endpoint
affects: [13-09 (wraps handleFixMessage in a POST raw-FIX endpoint; optional net.Server TCP listener)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-rolled FIX 4.4 SOH-delimited tag=value framing — bodyLength(9)/checkSum(10) to exact spec ranges, no FIX-engine dependency"
    - "Order-preserving tag→value Map so buildFix(parseFix(m)) round-trips byte-exact (8/9 forced first, 10 last, 9+10 recomputed)"
    - "zod re-validation of inbound wire fields mirroring agent.ts orderSchema (only BONDX Limit numeric/enum fields reach the domain)"
    - "Never-throw acceptor: a malformed frame degrades to a 35=8 ExecutionReport reject (mirrors agent.ts parseOrder discipline)"
    - "Credential-free surface behind the operator boundary — secret-sweep asserts no operator/Anthropic token in any FIX output"
    - "Monotonic outbound MsgSeqNum(34) per session (session-integrity control)"

key-files:
  created:
    - solver/src/fix.ts
    - solver/src/fix.test.ts
  modified: []

key-decisions:
  - "HTTP-wrapped raw-FIX endpoint is the primary (deferred to 13-09); this plan ships the pure protocol logic, fully offline-testable in vitest with no socket lifecycle"
  - "buildFix ignores any stale 8/9/10 in the input map and recomputes BodyLength/CheckSum, guaranteeing byte-exact round-trip and self-consistent framing"
  - "fixToSubmitOrder gates on 55=BONDX and 40=2 (Limit) before zod — a foreign symbol / non-Limit type / out-of-range field → null, never a throw"
  - "OrderID/ExecID derived from the monotonic seq counter (no PII, no credential); reject reports carry a fixed secret-free Text(58)"

patterns-established:
  - "FIX framing helpers proven against a hard-coded known-good vector with independently-precomputed BodyLength=70 / CheckSum=065 (FIX-spec regression anchor)"
  - "Untrusted-wire-input → zod-validated domain → never-throw degrade, reused from agent.ts parseOrder"

requirements-completed: [OPS-05]

# Metrics
duration: 4min
completed: 2026-07-10
---

# Phase 13 Plan 05: OPS-05 Hand-Rolled FIX 4.4 Order-Entry Subset Summary

**A dependency-free FIX 4.4 order-entry acceptor: SOH-delimited framing helpers (BodyLength(9)/CheckSum(10) proven byte-exact against a known-good NewOrderSingle vector), a `35=D` → validated sealed `{side,qty,limit}` mapper, a `35=8` ExecutionReport builder that rejects malformed frames without ever throwing, and a minimal Logon/Heartbeat/Logout session with a monotonic MsgSeqNum — credential-free behind the operator boundary. Honest label: "FIX 4.4 subset — order entry only; live OMS interop is a UAT gate."**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-10T20:01:00Z
- **Completed:** 2026-07-10T20:05:00Z
- **Tasks:** 1 (TDD)
- **Files modified:** 2 created

## Accomplishments
- `fix.ts`: pure `bodyLength(msg)` / `checkSum(msg)` framing helpers anchored on SOH boundaries to the exact FIX-spec ranges (BodyLength = bytes after `9=<n>\x01` up to and incl. the SOH before `10=`; CheckSum = sum of all bytes to that SOH, mod 256, 3-digit zero-padded).
- `parseFix(raw)` decodes SOH-delimited tag=value pairs into an ORDER-PRESERVING Map (null on empty / no-MsgType / non-numeric-tag / no-`=`, never throws); `buildFix(fields)` re-serializes with 8/9 forced first and 10 last, recomputing 9+10 — so `buildFix(parseFix(vector)) === vector` byte-for-byte even with stale 9/10 in the map.
- `fixToSubmitOrder(fields)` maps a `35=D` NewOrderSingle (55 Symbol=BONDX, 54 Side, 38 OrderQty, 44 Price, 40 OrdType=2 Limit) to a zod-validated `{side,qty,limit}` mirroring agent.ts `orderSchema`; a foreign symbol / non-Limit type / out-of-range Side / non-positive-integer qty → null.
- `handleFixMessage(raw, session)` returns a framed `35=8` ExecutionReport — OrdStatus 0 (New) on a valid mappable `35=D`, OrdStatus 8 (Rejected) on a malformed/unmapped/unknown message — and recognizes session Logon(A)/Heartbeat(0)/Logout(5), bumping a monotonic MsgSeqNum(34) on every outbound message. Never throws.
- Secret-sweep proven: with `OPERATOR_TOKEN`/`ANTHROPIC_API_KEY` sentinels set in the env, no sentinel (and no `sk-ant-`) appears in any built ExecutionReport — the acceptor reads no credential.
- Full solver suite stays green (230 tests, 23 files) incl. the §4 golden $100.00 clear; `tsc --noEmit` clean; `auction.ts` untouched.

## Task Commits

Task committed atomically (TDD RED → GREEN):

1. **Task 1 (RED): failing FIX contract** - `53be3dd` (test)
2. **Task 1 (GREEN): fix.ts acceptor** - `d9735c2` (feat)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP commit)

## Files Created/Modified
- `solver/src/fix.ts` - framing (bodyLength/checkSum), parseFix/buildFix, fixToSubmitOrder, handleFixMessage acceptor, newFixSession
- `solver/src/fix.test.ts` - 19 tests: bodyLength/checkSum vs the precomputed known-good vector, byte-exact round-trip (incl. stale-9/10 recompute), parseFix never-throw malformed cases, 35=D→sealed-order mapping (Buy/Sell/foreign-symbol/non-Limit/bad-qty/bad-side), 35=8 New/Reject, session A/0/5 recognition, MsgSeqNum monotonicity, secret-sweep

## Decisions Made
- The HTTP-wrapped raw-FIX endpoint (primary transport) is deferred to plan 13-09; this plan ships and unit-tests only the pure protocol logic — fully offline, no socket lifecycle.
- `buildFix` recomputes BodyLength/CheckSum and ignores any stale 8/9/10 in the input map, guaranteeing byte-exact round-trip and self-consistent framing on every build.
- `fixToSubmitOrder` gates on 55=BONDX and 40=2 (Limit) before the zod parse; anything foreign/out-of-range → null (no free text reaches the AI — T-13-15).
- OrderID(37)/ExecID(17) derived from the monotonic seq counter (no PII, no credential); reject reports carry a fixed secret-free Text(58).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Threat Model Coverage
- **T-13-12 (Tampering/DoS — parse):** bounds-checked SOH parse; a malformed frame → a clean 35=8 reject, `handleFixMessage`/`parseFix` never throw — mitigated, unit-tested.
- **T-13-13 (Spoofing — session):** monotonic MsgSeqNum(34) per session via `buildOutbound` — mitigated, asserted strictly increasing.
- **T-13-14 (Information Disclosure):** credential-free acceptor (reads no operator/Anthropic secret); secret-sweep asserts no sentinel in any FIX output — mitigated.
- **T-13-15 (Tampering via FIX text):** zod re-validation (mirrors orderSchema); only mapped numeric/enum BONDX-Limit fields reach the domain — mitigated.

## Known Stubs
None. The pure protocol logic is complete and tested; the transport wrapper (HTTP endpoint / optional TCP listener) is intentionally scoped to plan 13-09 per the locked design decision (RESEARCH Pattern 7).

## User Setup Required
None - no external service configuration required. A live counterparty OMS FIX handshake is a documented UAT gate (honest-subset label); this plan is verified entirely offline.

## Next Phase Readiness
- Pure `handleFixMessage(raw, session)` ready for 13-09 to wrap in a `POST` raw-FIX endpoint (and optionally a thin `net.Server` TCP listener) and map accepted orders to `Venue.SubmitOrder`.
- No blockers. §4 canary intact; full solver suite (230 tests) + tsc clean.

## Self-Check: PASSED

- Both source files present on disk (`solver/src/fix.ts`, `solver/src/fix.test.ts`).
- Both task commits (53be3dd, d9735c2) present in git history.
- `npx vitest run src/fix.test.ts`: 19/19 green (bodyLength=70 / checkSum=065 vs known-good vector, byte-exact round-trip, malformed-reject, MsgSeqNum monotonicity, secret-sweep). Full solver suite 230/230 green incl. §4 $100.00. `tsc --noEmit` clean. `auction.ts` byte-unchanged.

---
*Phase: 13-platform-baseline-adjacent-track-b-ongoing*
*Completed: 2026-07-10*
