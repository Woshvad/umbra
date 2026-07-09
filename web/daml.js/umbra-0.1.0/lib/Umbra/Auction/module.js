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

var pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4 = require('@daml.js/daml-prim-DA-Types-1.0.0');
var pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 = require('@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0');

var Umbra_Asset = require('../../Umbra/Asset/module');
var Umbra_Clearing = require('../../Umbra/Clearing/module');


exports.Clear = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({clearingPrice: damlTypes.Numeric(10).decoder, allocations: damlTypes.List(Umbra_Clearing.Allocation).decoder, orderCids: damlTypes.List(damlTypes.ContractId(exports.Order)).decoder, buyerUsdcCid: damlTypes.ContractId(Umbra_Asset.Asset).decoder, sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Asset.Asset))).decoder, referencePrice: damlTypes.Numeric(10).decoder, }); }),
  encode: function (__typed__) {
  return {
    clearingPrice: damlTypes.Numeric(10).encode(__typed__.clearingPrice),
    allocations: damlTypes.List(Umbra_Clearing.Allocation).encode(__typed__.allocations),
    orderCids: damlTypes.List(damlTypes.ContractId(exports.Order)).encode(__typed__.orderCids),
    buyerUsdcCid: damlTypes.ContractId(Umbra_Asset.Asset).encode(__typed__.buyerUsdcCid),
    sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Asset.Asset))).encode(__typed__.sellerBondCids),
    referencePrice: damlTypes.Numeric(10).encode(__typed__.referencePrice),
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
  templateId: '#umbra:Umbra.Auction:Round',
  templateIdWithPackageId: '12560276cdc3281f38a0b88829be259f33f5f607bfe8d903e7a2cd19af01a34a:Umbra.Auction:Round',
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
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
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


damlTypes.registerTemplate(exports.Round, ['12560276cdc3281f38a0b88829be259f33f5f607bfe8d903e7a2cd19af01a34a', '#umbra']);



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
  templateId: '#umbra:Umbra.Auction:RoundStats',
  templateIdWithPackageId: '12560276cdc3281f38a0b88829be259f33f5f607bfe8d903e7a2cd19af01a34a:Umbra.Auction:RoundStats',
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
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.RoundStats, ['12560276cdc3281f38a0b88829be259f33f5f607bfe8d903e7a2cd19af01a34a', '#umbra']);



exports.TradeConfirmation = damlTypes.assembleTemplate(
{
  templateId: '#umbra:Umbra.Auction:TradeConfirmation',
  templateIdWithPackageId: '12560276cdc3281f38a0b88829be259f33f5f607bfe8d903e7a2cd19af01a34a:Umbra.Auction:TradeConfirmation',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, desk: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, symbol: damlTypes.Text.decoder, side: Umbra_Clearing.Side.decoder, filledQty: damlTypes.Int.decoder, clearingPrice: damlTypes.Numeric(10).decoder, cashMoved: damlTypes.Numeric(10).decoder, ownLimit: jtv.Decoder.withDefault(null, damlTypes.Optional(damlTypes.Numeric(10)).decoder), referencePrice: damlTypes.Numeric(10).decoder, surplusVsLimit: damlTypes.Numeric(10).decoder, improvementVsLimitBp: damlTypes.Numeric(10).decoder, improvementVsReferenceBp: damlTypes.Numeric(10).decoder, }); }),
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
    ownLimit: damlTypes.Optional(damlTypes.Numeric(10)).encode(__typed__.ownLimit),
    referencePrice: damlTypes.Numeric(10).encode(__typed__.referencePrice),
    surplusVsLimit: damlTypes.Numeric(10).encode(__typed__.surplusVsLimit),
    improvementVsLimitBp: damlTypes.Numeric(10).encode(__typed__.improvementVsLimitBp),
    improvementVsReferenceBp: damlTypes.Numeric(10).encode(__typed__.improvementVsReferenceBp),
  };
}
,
  Archive: {
    template: function () { return exports.TradeConfirmation; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.TradeConfirmation, ['12560276cdc3281f38a0b88829be259f33f5f607bfe8d903e7a2cd19af01a34a', '#umbra']);



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
  templateId: '#umbra:Umbra.Auction:Order',
  templateIdWithPackageId: '12560276cdc3281f38a0b88829be259f33f5f607bfe8d903e7a2cd19af01a34a:Umbra.Auction:Order',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, desk: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, side: Umbra_Clearing.Side.decoder, quantity: damlTypes.Int.decoder, limit: damlTypes.Numeric(10).decoder, status: exports.OrderStatus.decoder, orderType: Umbra_Clearing.OrderType.decoder, minQty: jtv.Decoder.withDefault(null, damlTypes.Optional(damlTypes.Int).decoder), firmIf: jtv.Decoder.withDefault(null, damlTypes.Optional(damlTypes.Numeric(10)).decoder), }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    desk: damlTypes.Party.encode(__typed__.desk),
    roundId: damlTypes.Text.encode(__typed__.roundId),
    side: Umbra_Clearing.Side.encode(__typed__.side),
    quantity: damlTypes.Int.encode(__typed__.quantity),
    limit: damlTypes.Numeric(10).encode(__typed__.limit),
    status: exports.OrderStatus.encode(__typed__.status),
    orderType: Umbra_Clearing.OrderType.encode(__typed__.orderType),
    minQty: damlTypes.Optional(damlTypes.Int).encode(__typed__.minQty),
    firmIf: damlTypes.Optional(damlTypes.Numeric(10)).encode(__typed__.firmIf),
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
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.Order, ['12560276cdc3281f38a0b88829be259f33f5f607bfe8d903e7a2cd19af01a34a', '#umbra']);



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

