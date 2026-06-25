---
phase: 3
slug: privacy-proof-vertical-slice
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-25
---

# Phase 3 — Validation Strategy

> Per-phase validation contract. Two test surfaces: Daml Script (privacy proof) + the frontend (build/typecheck + live per-party JSON-API check).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Ledger framework** | Daml Script (`cd daml && daml test`) — the privacy tests |
| **Frontend framework** | Vite build + `tsc --noEmit` typecheck (`cd web && npm run build`) |
| **Live check** | `daml start` JSON API :7575 + `curl` per-party (`Authorization: Bearer <desk token>`) → each desk sees only its own Order |
| **Quick run** | `cd daml && daml test` (privacy assertions) · `cd web && npm run build` (frontend compiles) |
| **Estimated runtime** | daml test ~40s · npm build ~20–40s |

---

## Sampling Rate

- **After ledger task commit:** `cd daml && daml test` (privacy tests green).
- **After frontend task commit:** `cd web && npm run build` (typecheck + bundle, exit 0).
- **Before `/gsd-verify-work`:** `daml test` green (`test_privacy_orders`, `test_privacy_confirmations`) + `npm run build` green + the live per-party JSON-API check shows no cross-visibility.
- **Max feedback latency:** ~60s (ledger) / ~40s (frontend).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-XX | TBD | 1 | PRIV-01/02/04 | T-leak | stakeholder-only visibility | unit | `daml test` → `test_privacy_orders` (BankA sees 1, not B/C) | ❌ W0 | ⬜ pending |
| 03-XX | TBD | 1 | PRIV-03 | T-leak | confirmation visible only to its desk | unit | `daml test` → `test_privacy_confirmations` | ❌ W0 | ⬜ pending |
| 03-XX | TBD | 2 | PRIV-05 | T-token | per-party token isolation at the wire | integration | live `curl :7575/v1/query` with desk token → only own Order; operator token NOT in browser | ❌ W0 (manual/live) | ⬜ pending |
| 03-XX | TBD | 3 | UI-01/03, CLEAR-01 | T-render | per-party DamlLedger contexts (not render filter) | build | `cd web && npm run build` exit 0; 3-up view renders 3 desk panels + center count + redaction | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red. Task IDs finalized by the planner.*

---

## Wave 0 Requirements

- [ ] `daml/Umbra/Tests.daml` — `test_privacy_orders` (PRIV-01/02/04), `test_privacy_confirmations` (PRIV-03)
- [ ] token-mint script (Node) → per-party JWTs from `daml/parties.json`
- [ ] `web/` scaffold (Vite + React 18 + Tailwind 3.4) + `@daml.js/umbra` codegen + `npm install --legacy-peer-deps`
- [ ] `web/` build passes `tsc --noEmit` + `vite build`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 3-up Privacy view renders the money shot (3 desks blind, center count, redaction motif) | UI-03 | Visual fidelity to the comp; needs `daml start` + `npm run dev` running | Start ledger + web; open Privacy view; confirm each desk panel shows only its own order, center shows "3 SEALED ORDERS", "other" columns redacted |
| Live per-party isolation at the wire | PRIV-05 | Requires running JSON API :7575 + tokens | `curl :7575/v1/query` with BankA token → BankA's order only; with BankB token → BankB's only |

---

## Validation Sign-Off

- [ ] `test_privacy_orders` asserts BankA sees exactly its own order and ZERO of BankB/BankC (both directions)
- [ ] `test_privacy_confirmations` asserts each TradeConfirmation visible only to its desk
- [ ] Frontend `npm run build` exits 0 (typecheck + bundle)
- [ ] Privacy is structural: 3 separate `DamlLedger`/`createLedgerContext` per-party contexts, NOT a render-time filter
- [ ] Operator (broad-authority) token + Anthropic key never reach the browser
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
