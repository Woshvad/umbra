---
phase: 11-settlement-institutional-grade
plan: 09
subsystem: web-topology-view
tags: [VIZ-03, topology, cross-node, atomic-settle, demo-real, honesty-badge, redaction]
requires:
  - "solver.getTopology + TopologyMeta client seam (11-08)"
  - "GET /round/:id/topology shape { nodes, perParty, demoReal, caption } (11-03)"
  - "AtomicStamp + RedactionBar motifs + TimeMachineView chrome"
  - "Nav view-07 tab + Screen union 'topology' (11-08)"
provides:
  - "web/src/components/TopologyNode.tsx — participant/operator node card + pure nodesFromHosting/edges/demoRealCaption core"
  - "web/src/views/TopologyView.tsx — view 07 (chrome + node grid + SVG edges + demo-real badge + AtomicStamp)"
  - "App route screen==='topology' → TopologyView"
affects:
  - "web/src/App.tsx (added topology render branch)"
tech-stack:
  added: []
  patterns:
    - "pure DOM-free derivation core exported from a component, unit-tested in node-env .tsx"
    - "credential-free operator-plane fetch (getTopology) — no operator token / @daml/react in bundle"
    - "hand-rolled SVG connector overlay (viewBox 0-100, non-scaling-stroke) — no chart lib"
key-files:
  created:
    - web/src/components/TopologyNode.tsx
    - web/src/views/Topology.test.tsx
    - web/src/views/TopologyView.tsx
  modified:
    - web/src/App.tsx
decisions:
  - "Pure core lives in TopologyNode.tsx (Task-1 file) and is re-exported from TopologyView.tsx so Task 1 is self-contained + testable before the view exists; TopologyView is still the documented home (re-export)."
  - "SVG edges use solid 1px ink→red on settle with a reduced-motion-gated stroke transition (draw-on is optional per UI-SPEC); avoids strokeDasharray gap artifacts on short percentage-scaled lines."
  - "Badge is rendered whenever demoReal !== false (the LocalNet reality) — non-removable while nodes map to one participant; conservatively shown before data loads."
metrics:
  duration: ~9 min
  tasks: 2
  files: 4
  completed: 2026-07-10
---

# Phase 11 Plan 09: Network Topology (VIZ-03) Summary

View 07 Network Topology: three participant node cards (+ GUEST once joined) each hosting a
desk's order as a cross-node redaction stripe, an inverted operator/synchronizer node that sees
only a count, hand-rolled SVG connector edges that light red with an `AtomicStamp` spanning the
whole diagram on settle, and the HARD non-removable `DEMO-REAL · SINGLE-OPERATOR LOCALNET`
honesty badge — bound to the 11-UI-SPEC tokens, modeled on `TimeMachineView` chrome, and fed by
the credential-free `getTopology` client.

## What Was Built

### Task 1 — `TopologyNode.tsx` + pure derivation core + `Topology.test.tsx` (commit `96af34e`)
- **`TopologyNode`** — a single node-card component with two variants: `participant` (1px ink
  border, paper fill, `24px 22px 26px` padding; ColumnHeader-style mono code + role; an `ORDER
  RESIDENT` label; the resident order rendered ONLY as a `bg-redact` stripe + `NOT VISIBLE` —
  contents are the owner's alone, cross-node privacy is structural; a `PARTICIPANT · {id}` /
  `SAME PARTICIPANT (LOCALNET)` caption) and `operator` (inverted ink `#0A0A0A` fill / paper
  text, `OPERATOR · Venue · Synchronizer`, a `SEES A COUNT · NEVER CONTENTS` count-only body).
- **Pure DOM-free core** — `nodesFromHosting(meta)` maps the `TopologyMeta` hosting map onto
  participant node descriptors (A/B/C always; GUEST only once a bankD party is hosted), `edges(nodes)`
  fans each node → the single synchronizer, `demoRealCaption(meta)` returns the honest overall
  caption, `partyForDesk` resolves a desk key → full party id by prefix. Node descriptors carry
  NO order contents (no side/quantity/limit) — the redaction is structural, not a render filter.
- **`Topology.test.tsx` (10 tests, node-env)** — (a) single-participant → every node caption is
  `SAME PARTICIPANT (LOCALNET)` + the demo-real badge string; (b) distributed → per-participant
  `PARTICIPANT · {id}` captions, GUEST node appears once bankD is hosted, edges all → synchronizer;
  (c) no node ever exposes rival order contents; empty/null map degrades honestly to A/B/C.

### Task 2 — `TopologyView.tsx` (chrome + grid + SVG + badge + AtomicStamp) + App route (commit `7ec6f03`)
- **Chrome** verbatim from the shipped `TimeMachineView` pattern: `<main padding 30px 48px 64px>`
  → `07` marker + `Network Topology · Cross-Node Settlement` label → 1px ink rule → `font-display
  text-54` headline `ONE TRANSACTION. EVERY NODE.`.
- **HARD honesty badge** directly under the headline in the red-square mono-9 tag grammar:
  `DEMO-REAL · SINGLE-OPERATOR LOCALNET` + the limitation sub-caption (`True 3-validator topology
  needs three institutions each running a validator — a recorded limitation.`), rendered
  (non-removable) whenever nodes resolve to one participant.
- **Diagram** — the inverted operator/synchronizer node top-centered over a CSS-grid of
  participant cards, with an absolutely-positioned SVG connector overlay (`viewBox 0 0 100 100`,
  `non-scaling-stroke`) fanning 1px ink edges node→synchronizer. On `phase === 'settled'` the
  edges light `#E2231A` red and `AtomicStamp` (`1 TRANSACTION · ATOMIC`) spans the whole diagram.
- **States** — offline (`OFFLINE_CAPTION`) → loading (`READING NODE TOPOLOGY…`, `animate-umbra-pulse`)
  → empty (`No round to map yet.` + body) → resident/settled. Data via credential-free
  `getTopology(roundId)`; reduced-motion honored (stroke transition gated). App routes
  `screen === 'topology'` → `<TopologyView {...operatorState} />`.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run Topology` (Task 1) | 10/10 green |
| `grep -c "DEMO-REAL · SINGLE-OPERATOR LOCALNET" TopologyView.tsx` | 1 (present, non-removable) |
| `cd web && npm run build` (tsc + vite) | green (dist built) |
| `cd web && npx vitest run` (full suite) | 73/73 green (10 files) |
| Views 01–06 unaffected | yes (additive route + new files only) |

## Deviations from Plan

None — plan executed as written. One structural clarification worth noting (not a behavior
deviation): the plan text says "Export a PURE DOM-free derivation core from TopologyView (or a
lib)". Because Task 1's acceptance requires `Topology.test.tsx` green BEFORE `TopologyView.tsx`
exists (Task 2), the core physically lives in the Task-1 file `TopologyNode.tsx` and is
re-exported from `TopologyView.tsx` (its documented home). The "(or a lib)" clause covers this.

## Honest Limitations

- **Single-operator LocalNet is the demo-real reality.** On this box every desk party is hosted
  by one participant, so the `DEMO-REAL · SINGLE-OPERATOR LOCALNET` badge + `SAME PARTICIPANT
  (LOCALNET)` per-node caption are always on-screen. True 3-validator topology (three institutions
  each running a validator) is a recorded limitation, labeled on-screen — never overclaimed.
- **Live cross-node atomic settle is live-UAT.** The pure core + view are unit-tested against
  mocked `TopologyMeta` and build green, but the live 3-node hosting + red-edge atomic settle
  across a booted xnode LocalNet is an end-of-phase human-verify item (LocalNet may be down;
  the view renders an offline-safe empty/degraded state in that case).
- **Draw-on animation omitted.** Edges use a solid ink→red stroke transition rather than the
  optional `animate-umbra-draw` draw-on, to avoid dash-gap artifacts on short percentage-scaled
  SVG lines; reduced-motion trivially honored.

## Threat Model Compliance

- **T-11-09-OVERCLAIM (mitigate)** — HARD non-removable `DEMO-REAL · SINGLE-OPERATOR LOCALNET`
  badge + `SAME PARTICIPANT (LOCALNET)` per-node caption while one participant. ✅
- **T-11-09-DISCLOSE (mitigate)** — node cards render ONLY redaction stripes for cross-node
  orders; the pure core carries no order contents (asserted by test c). ✅
- **T-11-09-CRED (mitigate)** — data via credential-free `getTopology` (SOLVER_BASE_URL); no
  operator token / `@daml/react` context in this bundle. ✅

## Self-Check: PASSED

- Created files exist: `TopologyNode.tsx`, `Topology.test.tsx`, `TopologyView.tsx`, `11-09-SUMMARY.md`.
- Commits exist: `96af34e` (Task 1), `7ec6f03` (Task 2).
- App route `screen === 'topology'` present.
