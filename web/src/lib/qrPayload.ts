// qrPayload — the QR / deep-link payload for the guest 4th-desk join (WOW-07).
//
// buildJoinPayload encodes ONLY the `/join` URL + the roundId (a `?round=<id>` query).
// It NEVER carries a token or any secret: the guest's scoped HS256 token is minted
// server-side (scripts/localnet/guest-onboard.mjs) into web/src/tokens.json and
// delivered to the `/join` page over the desk's own per-party plane — exactly the D6
// boundary A/B/C use. The QR bitmap therefore leaks nothing (threat T-11-10-QR); a
// scanner only learns where to point a browser, and the round it should join.
//
// Pure + DOM-free: the caller passes `origin` (window.location.protocol+host on the
// web side, or a fixture in tests) so this stays unit-testable with no globals.

export function buildJoinPayload(origin: string, roundId: string): string {
  // Trim any trailing slash(es) so we never emit `//join`.
  const base = origin.replace(/\/+$/, '')
  // Encode the round id defensively — it is the ONLY dynamic value in the payload.
  const round = encodeURIComponent(roundId)
  return `${base}/join?round=${round}`
}
