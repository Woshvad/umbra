// web/src/lib/solverParse.ts — PURE, DOM-free helpers around the solver payloads.
//
//   • `badgeLabel` — maps the agent provenance source onto the NEW Agent badge
//     label (UI-SPEC line 305 / RESEARCH Pitfall 5). The actual enum value is
//     'deterministic-fallback' but the binding label is "VERIFIED · DETERMINISTIC".
//   • `parseSolvePreview` — narrows an untyped solve-preview JSON body to the
//     typed SolvePreviewResponse (belt-and-suspenders around the network boundary),
//     asserting the §4 invariants are present.
//
// No I/O, no React, no DOM.

import type { AgentMeta, SolvePreviewResponse } from '../solver'

// The NEW agent badge label (CONTEXT). 'claude' → CLAUDE; anything else (i.e.
// 'deterministic-fallback') → DETERMINISTIC. Never invent a 'deterministic' source.
export const badgeLabel = (source: AgentMeta['source']): string =>
  source === 'claude' ? 'VERIFIED · CLAUDE' : 'VERIFIED · DETERMINISTIC'

// Narrow an untyped solve-preview body to the typed shape. Throws if the core §4
// fields are missing/malformed (the money-shot numbers must always be present).
export const parseSolvePreview = (json: unknown): SolvePreviewResponse => {
  const o = json as Partial<SolvePreviewResponse>
  if (
    o == null ||
    typeof o.clearingPrice !== 'number' ||
    typeof o.matchedVolume !== 'number' ||
    !Array.isArray(o.allocations) ||
    !Array.isArray(o.curve) ||
    typeof o.rationale !== 'string' ||
    o.agent == null ||
    typeof o.agent.verified !== 'boolean'
  ) {
    throw new Error('malformed solve-preview payload')
  }
  return o as SolvePreviewResponse
}
