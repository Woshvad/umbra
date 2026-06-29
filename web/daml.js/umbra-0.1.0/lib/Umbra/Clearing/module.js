"use strict";
/* eslint-disable-next-line no-unused-vars */
function __export(m) {
/* eslint-disable-next-line no-prototype-builtins */
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable-next-line no-unused-vars */
var jtv = require('@mojotech/json-type-validation');
/* eslint-disable-next-line no-unused-vars */
var damlTypes = require('@daml/types');
/* eslint-disable-next-line no-unused-vars */
var damlLedger = require('@daml/ledger');


exports.OrderView = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({desk: damlTypes.Party.decoder, side: exports.Side.decoder, quantity: damlTypes.Int.decoder, limit: damlTypes.Numeric(10).decoder, }); }),
  encode: function (__typed__) {
  return {
    desk: damlTypes.Party.encode(__typed__.desk),
    side: exports.Side.encode(__typed__.side),
    quantity: damlTypes.Int.encode(__typed__.quantity),
    limit: damlTypes.Numeric(10).encode(__typed__.limit),
  };
}
,
};



exports.Allocation = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({desk: damlTypes.Party.decoder, side: exports.Side.decoder, filledQty: damlTypes.Int.decoder, }); }),
  encode: function (__typed__) {
  return {
    desk: damlTypes.Party.encode(__typed__.desk),
    side: exports.Side.encode(__typed__.side),
    filledQty: damlTypes.Int.encode(__typed__.filledQty),
  };
}
,
};



exports.Side = {
  Buy: 'Buy',
  Sell: 'Sell',
  keys: ['Buy','Sell',],
  decoder: damlTypes.lazyMemo(function () { return jtv.oneOf(jtv.constant(exports.Side.Buy), jtv.constant(exports.Side.Sell)); }),
  encode: function (__typed__) { return __typed__; },
};

