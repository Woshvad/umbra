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

var pkg40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7 = require('@daml.js/40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7');
var pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662 = require('@daml.js/d14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662');

var Umbra_Asset = require('../../Umbra/Asset/module');
var Umbra_Clearing = require('../../Umbra/Clearing/module');


exports.Clear = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({clearingPrice: damlTypes.Numeric(10).decoder, allocations: damlTypes.List(Umbra_Clearing.Allocation).decoder, orderCids: damlTypes.List(damlTypes.ContractId(exports.Order)).decoder, buyerUsdcCid: damlTypes.ContractId(Umbra_Asset.Asset).decoder, sellerBondCids: damlTypes.List(pkg40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Asset.Asset))).decoder, }); }),
  encode: function (__typed__) {
  return {
    clearingPrice: damlTypes.Numeric(10).encode(__typed__.clearingPrice),
    allocations: damlTypes.List(Umbra_Clearing.Allocation).encode(__typed__.allocations),
    orderCids: damlTypes.List(damlTypes.ContractId(exports.Order)).encode(__typed__.orderCids),
    buyerUsdcCid: damlTypes.ContractId(Umbra_Asset.Asset).encode(__typed__.buyerUsdcCid),
    sellerBondCids: damlTypes.List(pkg40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Asset.Asset))).encode(__typed__.sellerBondCids),
  };
}
,
};



exports.CloseRound = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({}); }),
  encode: function (__typed__) {
  return {
  };
}
,
};



exports.Round = damlTypes.assembleTemplate(
{
  templateId: 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861:Umbra.Auction:Round',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, symbol: damlTypes.Text.decoder, desks: damlTypes.List(damlTypes.Party).decoder, openedAt: damlTypes.Time.decoder, windowSeconds: damlTypes.Int.decoder, status: exports.RoundStatus.decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    roundId: damlTypes.Text.encode(__typed__.roundId),
    symbol: damlTypes.Text.encode(__typed__.symbol),
    desks: damlTypes.List(damlTypes.Party).encode(__typed__.desks),
    openedAt: damlTypes.Time.encode(__typed__.openedAt),
    windowSeconds: damlTypes.Int.encode(__typed__.windowSeconds),
    status: exports.RoundStatus.encode(__typed__.status),
  };
}
,
  Clear: {
    template: function () { return exports.Round; },
    choiceName: 'Clear',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.Clear.decoder; }),
    argumentEncode: function (__typed__) { return exports.Clear.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return exports.ClearResult.decoder; }),
    resultEncode: function (__typed__) { return exports.ClearResult.encode(__typed__); },
  },
  Archive: {
    template: function () { return exports.Round; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
  CloseRound: {
    template: function () { return exports.Round; },
    choiceName: 'CloseRound',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.CloseRound.decoder; }),
    argumentEncode: function (__typed__) { return exports.CloseRound.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(exports.Round).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(exports.Round).encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.Round, ['ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861', 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861']);



exports.ClearResult = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({roundId: damlTypes.Text.decoder, clearingPrice: damlTypes.Numeric(10).decoder, totalMatched: damlTypes.Int.decoder, confirmations: damlTypes.List(damlTypes.ContractId(exports.TradeConfirmation)).decoder, }); }),
  encode: function (__typed__) {
  return {
    roundId: damlTypes.Text.encode(__typed__.roundId),
    clearingPrice: damlTypes.Numeric(10).encode(__typed__.clearingPrice),
    totalMatched: damlTypes.Int.encode(__typed__.totalMatched),
    confirmations: damlTypes.List(damlTypes.ContractId(exports.TradeConfirmation)).encode(__typed__.confirmations),
  };
}
,
};



exports.RoundStats = damlTypes.assembleTemplate(
{
  templateId: 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861:Umbra.Auction:RoundStats',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, desks: damlTypes.List(damlTypes.Party).decoder, sealedOrderCount: damlTypes.Int.decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    roundId: damlTypes.Text.encode(__typed__.roundId),
    desks: damlTypes.List(damlTypes.Party).encode(__typed__.desks),
    sealedOrderCount: damlTypes.Int.encode(__typed__.sealedOrderCount),
  };
}
,
  Archive: {
    template: function () { return exports.RoundStats; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.RoundStats, ['ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861', 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861']);



exports.TradeConfirmation = damlTypes.assembleTemplate(
{
  templateId: 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861:Umbra.Auction:TradeConfirmation',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, desk: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, symbol: damlTypes.Text.decoder, side: Umbra_Clearing.Side.decoder, filledQty: damlTypes.Int.decoder, clearingPrice: damlTypes.Numeric(10).decoder, cashMoved: damlTypes.Numeric(10).decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    desk: damlTypes.Party.encode(__typed__.desk),
    roundId: damlTypes.Text.encode(__typed__.roundId),
    symbol: damlTypes.Text.encode(__typed__.symbol),
    side: Umbra_Clearing.Side.encode(__typed__.side),
    filledQty: damlTypes.Int.encode(__typed__.filledQty),
    clearingPrice: damlTypes.Numeric(10).encode(__typed__.clearingPrice),
    cashMoved: damlTypes.Numeric(10).encode(__typed__.cashMoved),
  };
}
,
  Archive: {
    template: function () { return exports.TradeConfirmation; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.TradeConfirmation, ['ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861', 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861']);



exports.Retire = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({}); }),
  encode: function (__typed__) {
  return {
  };
}
,
};



exports.Order = damlTypes.assembleTemplate(
{
  templateId: 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861:Umbra.Auction:Order',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, desk: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, side: Umbra_Clearing.Side.decoder, quantity: damlTypes.Int.decoder, limit: damlTypes.Numeric(10).decoder, status: exports.OrderStatus.decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    desk: damlTypes.Party.encode(__typed__.desk),
    roundId: damlTypes.Text.encode(__typed__.roundId),
    side: Umbra_Clearing.Side.encode(__typed__.side),
    quantity: damlTypes.Int.encode(__typed__.quantity),
    limit: damlTypes.Numeric(10).encode(__typed__.limit),
    status: exports.OrderStatus.encode(__typed__.status),
  };
}
,
  Retire: {
    template: function () { return exports.Order; },
    choiceName: 'Retire',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.Retire.decoder; }),
    argumentEncode: function (__typed__) { return exports.Retire.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
  Archive: {
    template: function () { return exports.Order; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.Order, ['ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861', 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861']);



exports.RoundStatus = {
  Open: 'Open',
  Closed: 'Closed',
  Cleared: 'Cleared',
  Settled: 'Settled',
  keys: ['Open','Closed','Cleared','Settled',],
  decoder: damlTypes.lazyMemo(function () { return jtv.oneOf(jtv.constant(exports.RoundStatus.Open), jtv.constant(exports.RoundStatus.Closed), jtv.constant(exports.RoundStatus.Cleared), jtv.constant(exports.RoundStatus.Settled)); }),
  encode: function (__typed__) { return __typed__; },
};



exports.OrderStatus = {
  Sealed: 'Sealed',
  Filled: 'Filled',
  PartiallyFilled: 'PartiallyFilled',
  Unfilled: 'Unfilled',
  keys: ['Sealed','Filled','PartiallyFilled','Unfilled',],
  decoder: damlTypes.lazyMemo(function () { return jtv.oneOf(jtv.constant(exports.OrderStatus.Sealed), jtv.constant(exports.OrderStatus.Filled), jtv.constant(exports.OrderStatus.PartiallyFilled), jtv.constant(exports.OrderStatus.Unfilled)); }),
  encode: function (__typed__) { return __typed__; },
};

