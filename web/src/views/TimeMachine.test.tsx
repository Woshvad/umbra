// web/src/views/TimeMachine.test.tsx — the VIZ-02 per-party redaction proof (10-VALIDATION
// VIZ-02 row). DOM-free: it exercises the Time Machine's PURE cell-verdict core against a
// MOCKED v2 /state/active-contracts response (per-party), so the privacy guarantee is proven
// without a live ledger (the live scrub across a real run is an end-of-phase human-verify).
//
// The four load-bearing assertions (mirroring DeskColumn's redaction grammar across time):
//   1. BankB's authentic read sees ∅ of BankA → BankA's cell in BankB's column is NOT VISIBLE.
//   2. The viewer's OWN order renders real data as a T1 `LEDGER EVENT @ {offset}`.
//   3. The OPERATOR column is redacted at the COMMITTED/TIMELOCKED stage (venue-blind, CRYP-02).
//   4. A stage/plane with no captured authentic event is honestly labeled RECONSTRUCTED.
import { describe, expect, it } from 'vitest'
import {
  bankCell,
  operatorCell,
  ordersFromAcs,
  visibleDesksFromAcs,
  ledgerEventCaption,
  CAP_NOT_VISIBLE,
  TAG_RECONSTRUCTED,
  isVenueBlindStage,
  STAGE_NODES,
  type CellOrder,
} from './TimeMachineView'
import { tokens } from '../desks'
import { UMBRA_PACKAGE_NAME } from '../ledger/v2react'

// A single v2 createdEvent row, byte-shaped like v2react.fetchAcs consumes
// (contractEntry.JsActiveContract.createdEvent + the package NAME our contracts carry).
//
// The name is IMPORTED, never hard-coded: `ordersFromAcs` filters on UMBRA_PACKAGE_NAME, so a
// literal here silently rots the moment the package is renamed — as it did when the shared
// DevNet validator's existing `umbra` forced ours to `umbra-sealed-auction`, and these rows
// began filtering out to [] while the app itself was fine. Importing keeps fixture and filter
// in lockstep by construction.
const acsOrderRow = (deskParty: string, o: CellOrder) => ({
  contractEntry: {
    JsActiveContract: {
      createdEvent: {
        contractId: `c-${deskParty}`,
        templateId: 'abc123:Umbra.Auction:Order',
        packageName: UMBRA_PACKAGE_NAME,
        createArgument: { desk: deskParty, side: o.side, quantity: o.quantity, limit: o.limit },
      },
    },
  },
})

const A = tokens.bankA.party
const B = tokens.bankB.party
const ORDER_B: CellOrder = { side: 'Sell', quantity: '8', limit: '99.0' }
const OFFSET = 42

// BankB's AUTHENTIC per-party read at the offset: the participant returns ONLY BankB's own
// Order (BankA's order is absent at the wire — this is the mocked v2 ACS, privacy-enforced).
const BANK_B_ACS = [acsOrderRow(B, ORDER_B)]

describe('VIZ-02 Time Machine — mocked v2 ACS parse (privacy at the wire)', () => {
  it('extracts only the orders present in the party read, keyed by owning desk', () => {
    const reads = ordersFromAcs(BANK_B_ACS)
    expect(reads).toHaveLength(1)
    expect(reads[0].desk).toBe('bankB')
    expect(reads[0].order).toEqual(ORDER_B)
  })

  it("BankB's read yields visible-set {bankB} — it genuinely sees ∅ of BankA", () => {
    const visible = visibleDesksFromAcs(BANK_B_ACS)
    expect(visible.has('bankB')).toBe(true)
    expect(visible.has('bankA')).toBe(false)
  })

  it('ignores non-umbra / non-Order rows and malformed entries', () => {
    const noise = [
      // Right package, WRONG template — must be ignored on the template, not the package name.
      { contractEntry: { JsActiveContract: { createdEvent: { templateId: 'x:Umbra.Asset:Asset', packageName: UMBRA_PACKAGE_NAME, createArgument: {} } } } },
      { contractEntry: { JsActiveContract: { createdEvent: { templateId: 'x:Umbra.Auction:Order', packageName: 'other', createArgument: { desk: A } } } } },
      null,
      {},
    ]
    expect(ordersFromAcs(noise)).toHaveLength(0)
  })
})

describe('VIZ-02 Time Machine — per-party redaction verdicts', () => {
  const visibleB = visibleDesksFromAcs(BANK_B_ACS)

  it("1. BankB's column renders BankA's order as NOT VISIBLE (bg-redact)", () => {
    const cell = bankCell({ stage: 'sealed', offset: OFFSET, visible: visibleB, subject: 'bankA' })
    expect(cell.kind).toBe('blinded')
    expect(CAP_NOT_VISIBLE).toBe('NOT VISIBLE')
  })

  it('2. the own column renders the real order as a T1 LEDGER EVENT @ {offset}', () => {
    const cell = bankCell({
      stage: 'sealed',
      offset: OFFSET,
      visible: visibleB,
      subject: 'bankB',
      order: ORDER_B,
    })
    expect(cell.kind).toBe('visible')
    expect(cell.offset).toBe(OFFSET)
    expect(cell.order).toEqual(ORDER_B)
    expect(ledgerEventCaption(OFFSET)).toBe('LEDGER EVENT @ 42')
  })

  it('3. the OPERATOR column is redacted at the COMMITTED/TIMELOCKED stage (venue-blind)', () => {
    expect(isVenueBlindStage('committed')).toBe(true)
    expect(operatorCell({ stage: 'committed', offset: 7 }).kind).toBe('blinded')
    // …and every desk column is blinded there too — contents are ciphertext for all.
    expect(bankCell({ stage: 'committed', offset: 7, visible: visibleB, subject: 'bankB', order: ORDER_B }).kind).toBe('blinded')
  })

  it('4. a derived stage/plane with no captured event is labeled RECONSTRUCTED', () => {
    // The operator plane is never authentically readable in the browser (no operator token).
    expect(operatorCell({ stage: 'settled', offset: 99 }).kind).toBe('reconstructed')
    // A bank stage with no recorded offset is likewise reconstructed (honest — no event).
    expect(bankCell({ stage: 'cleared', offset: undefined, visible: visibleB, subject: 'bankB' }).kind).toBe('reconstructed')
    expect(TAG_RECONSTRUCTED).toBe('RECONSTRUCTED')
  })
})

describe('VIZ-02 Time Machine — scrubber shape', () => {
  it('exposes the five lifecycle stages in order with the verbatim labels', () => {
    expect(STAGE_NODES.map((s) => s.key)).toEqual(['open', 'committed', 'sealed', 'cleared', 'settled'])
    expect(STAGE_NODES[1].label).toBe('COMMITTED/TIMELOCKED')
  })
})
