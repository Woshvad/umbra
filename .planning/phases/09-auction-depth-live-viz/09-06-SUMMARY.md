---
phase: 09-auction-depth-live-viz
plan: 06
subsystem: frontend-order-entry
tags: [react, typescript, order-types, auct-01, desk-plane, ui, daml.js]

# Dependency graph
requires:
  - phase: 09-auction-depth-live-viz
    provides: "09-01 additive order model (OrderType/minQty/firmIf on Venue.SubmitOrder) + regenerated web/daml.js bindings"
  - phase: 09-auction-depth-live-viz
    provides: "09-02/09-03 clearing math for Noncompetitive/AON-MAQ/Conditional (the types this UI now makes reachable end-to-end)"
provides:
  - "AUCT-01 order-type entry surface in OrderTicket: LIMIT·NONCOMP·MAQ·COND selector + per-type param fields + type-aware Venue.SubmitOrder on the desk's own plane"
affects: ["Phase-9 UAT (per-type live submit)", "09-07 (Settlement/sim, unaffected)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuse-only UI extension: segmented order-type selector built from the shipped mono-9 toggle grammar (ink-underline active), no new tailwind token/fontSize/keyframe"
    - "1px assist tier for secondary params (mono 22, 1px underline) vs the 44px primary qty/limit inputs — mirrors the WOW-03 NL sub-block convention"
    - "Type-aware exercise: unused per-type params passed as null; Noncompetitive sends a 0.0 limit placeholder (ensure skips limit>0 — 09-01 effective-limit)"

key-files:
  created: []
  modified:
    - "web/src/components/OrderTicket.tsx — order-type selector + descriptor + per-type param fields + validation copy + type-aware SubmitOrder"

key-decisions:
  - "MAQ segment maps to the on-ledger AllOrNone OrderType; min == qty is the all-or-none special case surfaced with the `= FULL FILL ONLY` hint"
  - "Noncompetitive submits limit='0.0' (the on-ledger ensure skips limit>0 for Noncompetitive; the real any-price lift lives in the 09-02 clearing math)"
  - "NL PARSE leaves orderType untouched (satisfies both 'never switches the order type' and 'never switch away from a plain Limit'); load demo explicitly resets to Limit"
  - "firmIf and the limit placeholder encoded with toFixed(1), matching the shipped limit-price string encoding (RESEARCH Pitfall 1)"

patterns-established:
  - "Additive in-place UI surface that stays visually indistinguishable from the binding comp by composing only existing tokens/keyframes (no palette/type/motion additions)"

requirements-completed: [AUCT-01]

# Metrics
duration: ~7min
completed: 2026-07-09
---

# Phase 9 Plan 06: AUCT-01 Order-Type Entry UI Summary

**Shipped the four-type sealed order-entry surface inside the existing OrderTicket — a `LIMIT · NONCOMP · MAQ · COND` segmented selector plus per-type param fields (Min Acceptable Qty, side-directional Firm-If band) driving a type-aware `Venue.SubmitOrder` on the desk's own token — closing AUCT-01 with the single `SEAL ORDER` confirm, one-per-round lock, and seal-wipe all byte-unchanged and no new design token introduced.**

## Performance

- **Duration:** ~7 min
- **Tasks:** 1
- **Files modified:** 1 (`web/src/components/OrderTicket.tsx`)

## Accomplishments

- Added an **Order Type** segmented selector (`LIMIT·NONCOMP·MAQ·COND`, IBM Plex Mono 9 `.16em`, active = ink underline, inactive opacity .45, disabled under `ticketLocked`) between the shipped WOW-03 NL sub-block and the side toggle, plus an active-type descriptor line (Inter 13/1.6 opacity .65, `umbra-rise` on change) with the verbatim UI-SPEC copy per type.
- Wired per-type field show/hide: **Limit** = shipped side+qty+limit (unchanged); **Noncompetitive** replaces the limit input with the static `FILL AT CLEAR — NO LIMIT PRICE` caption row (reusing the shipped 1px-ink status-row grammar); **MAQ/All-or-None** adds a 1px-assist-tier Min Acceptable Qty (mono 22, unit BONDX) with the `= FULL FILL ONLY` hint when min == qty; **Conditional** adds a side-directional Firm-If band (mono 22, `Firm If Clears ≤` buy / `Firm If Clears ≥` sell, unit USDCx / unit).
- Added non-blocking validation copy (Inter 13 opacity .7) verbatim per the UI-SPEC Copywriting Contract: min>qty → "Minimum can't exceed your order size."; min≤0 → "Enter a minimum of at least 1."; band≤0 → "Enter a firm-if price above 0."
- Extended `onSeal` to a **type-aware** `Venue.SubmitOrder`: `orderType` carries the selected type; `minQty` = `String(minQtyInt)` for MAQ else null; `firmIf` = `firmIf.toFixed(1)` for Conditional else null; Noncompetitive sends a `0.0` limit placeholder (the 09-01 `ensure` skips `limit>0` for it). Per-type client-side guards gate the submit before the exercise, and the ledger `ensure` remains the real security boundary (T-09-06-02).
- Kept the desk-plane invariant intact: `OrderTicket` submits on the active desk's own `useLedger()` — grep-clean of `operator` / `@daml/react` (T-09-06-01). `load demo` resets to a plain Limit; NL PARSE never switches the order type and never auto-submits; the single `SEAL ORDER` confirm, one-per-round lock, and seal-wipe are byte-unchanged (T-09-06-03).

## Task Commits

1. **Task 1: Order-type selector + per-type params + type-aware SubmitOrder** - `f4eb28f` (feat)

**Plan metadata:** committed after this summary (docs: complete plan)

## Files Created/Modified

- `web/src/components/OrderTicket.tsx` — added `orderType`/`minQtyInput`/`firmIfInput` state, `TYPE_SEGMENTS`/`TYPE_DESCRIPTOR` constants, the segmented selector + descriptor JSX, conditional Limit/Noncompetitive rendering, MAQ + Conditional param blocks with validation hints, and the type-aware `Venue.SubmitOrder` payload. `import { Side, type OrderType }` from the 09-01 regenerated Clearing bindings.

## Decisions Made

- **MAQ ⇒ AllOrNone:** the UI's MAQ segment maps to the on-ledger `AllOrNone` `OrderType`; the all-or-none special case (min == qty) is surfaced via the `= FULL FILL ONLY` hint rather than a separate segment (matches the UI-SPEC "MAQ / All-or-None" framing).
- **Noncompetitive limit placeholder `0.0`:** the 09-01 `ensure` is `quantity > 0 && (orderType == Noncompetitive || limit > 0.0) && …`, so `0.0` is accepted; the stored value is ignored by both the AUCT-04 receipt path (`ownLimit = None` for noncomp) and the 09-02 any-price clearing math.
- **NL PARSE leaves the order type untouched:** this simultaneously honors "NL assist never switches the order type" and "never switch away from a plain Limit" (when on Limit it stays Limit; from any other type it does not switch). `load demo` explicitly resets to Limit to guarantee the plain-Limit demo.
- **`toFixed(1)` string encoding** for `firmIf` and the noncomp limit placeholder, matching the shipped limit-price encoding (Int/Numeric as strings — RESEARCH Pitfall 1).

## Deviations from Plan

None — plan executed exactly as written (scope limited to `web/src/components/OrderTicket.tsx`; no clearing math, template, solver, or `web/daml.js` change).

## Threat Model Disposition

- **T-09-06-01 (operator token leak):** mitigated — `OrderTicket` uses the desk's own `useLedger()` exclusively; grep-clean of `operator` / `@daml/react` in the file.
- **T-09-06-02 (malformed params):** mitigated — client-side validation copy is UX only; the on-ledger `ensure` (minQty∈[1,quantity]; firmIf>0; limit>0 except Noncompetitive) is the enforced guard.
- **T-09-06-03 (double-submit / lock bypass):** mitigated — single `SEAL ORDER` confirm preserved; `onParse`/`loadDemo` never auto-submit; one-per-round lock + seal-wipe byte-unchanged.

## Verification

- `cd web && npm run build` — **green** (tsc --noEmit + vite build; 92 modules, type-aware SubmitOrder compiles against the 09-01 regenerated bindings).
- `cd web && npx vitest run` — **30/30 green** (no regression to OrderTicket-adjacent libs).
- Verbatim copy grep — all UI-SPEC Copywriting Contract strings present (selector label, segment labels, four descriptors, noncomp caption, MAQ label + full-fill hint, both conditional labels, all three validation strings).
- grep-clean of `operator` / `@daml/react` in `OrderTicket.tsx` — clean.
- No new tailwind token / fontSize / keyframe — only existing tokens (`text-9/10/13/22/44`, `font-mono/body`, `animate-umbra-rise`, ink/side colors) used.

## Deferred to End-of-Phase Human Verification

- **Live per-type submit against a running open round:** submitting each of NONCOMP / MAQ / COND (plus a plain LIMIT) as a desk's own token against a real open Round on the live stack, and confirming the on-ledger `ensure` accepts each payload end-to-end, was NOT run against a booted ledger in this plan (web build + unit tests are green; the live stack is a phase-UAT concern per the Phases 1–3 precedent). Resume: boot the stack, open R1, select each type in a desk view, seal, and confirm the order appears on that desk's own stream only.

## Self-Check: PASSED

- File verified on disk: `web/src/components/OrderTicket.tsx` (modified), `.planning/phases/09-auction-depth-live-viz/09-06-SUMMARY.md` (created).
- Commit verified in git: `f4eb28f` (Task 1, feat).

---
*Phase: 09-auction-depth-live-viz*
*Completed: 2026-07-09*
