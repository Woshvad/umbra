// ESM import smoke (RESEARCH Open Question 1 / Pitfall 6): prove the generated
// CommonJS @daml.js bindings + @daml/ledger import cleanly under Node ESM
// (`type: "module"`) BEFORE any client code is written. If a named import here
// resolves, the whole ledger.ts (Plan 04-02) is unblocked.
import { Round, Order, RoundStats } from '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module'
import { Asset } from '@daml.js/umbra-0.1.0/lib/Umbra/Asset/module'
import { Side } from '@daml.js/umbra-0.1.0/lib/Umbra/Clearing/module'
// NAMED import — @daml/ledger is CJS exposing the class as both `default` and a named
// `Ledger`; a DEFAULT import binds the namespace object (typeof 'object'), so `new
// Ledger()` throws "not a constructor" on a real boot (the bug the live E2E surfaced).
// This smoke is the regression guard: it must resolve to a constructor (typeof 'function').
import { Ledger } from '@daml/ledger'

// Touch each binding so the imports are not elided and so a bad export fails loudly.
console.log('Round.templateId       =', Round.templateId)
console.log('Order.templateId       =', Order.templateId)
console.log('RoundStats.templateId  =', RoundStats.templateId)
console.log('Asset.templateId       =', Asset.templateId)
console.log('Side.Buy / Side.Sell   =', Side.Buy, '/', Side.Sell)
console.log('Ledger constructor     =', typeof Ledger)

if (!Round.templateId.includes(':Umbra.Auction:Round')) {
  console.error('FAIL: Round.templateId does not look like a Umbra.Auction:Round id')
  process.exit(1)
}

// The real boot constructs `new Ledger(...)` — guard that the import resolves to the
// class, not the CJS namespace object (the default-import interop trap).
if (typeof Ledger !== 'function') {
  console.error(`FAIL: @daml/ledger Ledger is ${typeof Ledger}, not a constructor — use the named import`)
  process.exit(1)
}

console.log('ledger-smoke OK — generated bindings import cleanly under Node ESM')
process.exit(0)
