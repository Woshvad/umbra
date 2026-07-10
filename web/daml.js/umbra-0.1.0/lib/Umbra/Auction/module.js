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

var Umbra_Clearing = require('../../Umbra/Clearing/module');
var Umbra_Holding = require('../../Umbra/Holding/module');
var Umbra_Instrument = require('../../Umbra/Instrument/module');


exports.Clear = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({clearingPrice: damlTypes.Numeric(10).decoder, allocations: damlTypes.List(Umbra_Clearing.Allocation).decoder, orderCids: damlTypes.List(damlTypes.ContractId(exports.Order)).decoder, buyerCashCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).decoder, sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).decoder, cashInstrument: Umbra_Instrument.InstrumentId.decoder, bondInstrument: Umbra_Instrument.InstrumentId.decoder, referencePrice: damlTypes.Numeric(10).decoder, }); }),
  encode: function (__typed__) {
  return {
    clearingPrice: damlTypes.Numeric(10).encode(__typed__.clearingPrice),
    allocations: damlTypes.List(Umbra_Clearing.Allocation).encode(__typed__.allocations),
    orderCids: damlTypes.List(damlTypes.ContractId(exports.Order)).encode(__typed__.orderCids),
    buyerCashCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).encode(__typed__.buyerCashCids),
    sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).encode(__typed__.sellerBondCids),
    cashInstrument: Umbra_Instrument.InstrumentId.encode(__typed__.cashInstrument),
    bondInstrument: Umbra_Instrument.InstrumentId.encode(__typed__.bondInstrument),
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
  templateIdWithPackageId: '76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9:Umbra.Auction:Round',
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


damlTypes.registerTemplate(exports.Round, ['76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9', '#umbra']);



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
  templateIdWithPackageId: '76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9:Umbra.Auction:RoundStats',
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


damlTypes.registerTemplate(exports.RoundStats, ['76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9', '#umbra']);



exports.TradeConfirmation = damlTypes.assembleTemplate(
{
  templateId: '#umbra:Umbra.Auction:TradeConfirmation',
  templateIdWithPackageId: '76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9:Umbra.Auction:TradeConfirmation',
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


damlTypes.registerTemplate(exports.TradeConfirmation, ['76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9', '#umbra']);



exports.ProofAnchor = damlTypes.assembleTemplate(
{
  templateId: '#umbra:Umbra.Auction:ProofAnchor',
  templateIdWithPackageId: '76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9:Umbra.Auction:ProofAnchor',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, proofHash: damlTypes.Text.decoder, vkeyHash: damlTypes.Text.decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    roundId: damlTypes.Text.encode(__typed__.roundId),
    proofHash: damlTypes.Text.encode(__typed__.proofHash),
    vkeyHash: damlTypes.Text.encode(__typed__.vkeyHash),
  };
}
,
  Archive: {
    template: function () { return exports.ProofAnchor; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.ProofAnchor, ['76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9', '#umbra']);



exports.ForfeitBond = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({}); }),
  encode: function (__typed__) {
  return {
  };
}
,
};



exports.RevealOrder = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({side: Umbra_Clearing.Side.decoder, quantity: damlTypes.Int.decoder, limit: damlTypes.Numeric(10).decoder, orderType: Umbra_Clearing.OrderType.decoder, minQty: jtv.Decoder.withDefault(null, damlTypes.Optional(damlTypes.Int).decoder), firmIf: jtv.Decoder.withDefault(null, damlTypes.Optional(damlTypes.Numeric(10)).decoder), salt: damlTypes.Text.decoder, }); }),
  encode: function (__typed__) {
  return {
    side: Umbra_Clearing.Side.encode(__typed__.side),
    quantity: damlTypes.Int.encode(__typed__.quantity),
    limit: damlTypes.Numeric(10).encode(__typed__.limit),
    orderType: Umbra_Clearing.OrderType.encode(__typed__.orderType),
    minQty: damlTypes.Optional(damlTypes.Int).encode(__typed__.minQty),
    firmIf: damlTypes.Optional(damlTypes.Numeric(10)).encode(__typed__.firmIf),
    salt: damlTypes.Text.encode(__typed__.salt),
  };
}
,
};



exports.OrderCommitment = damlTypes.assembleTemplate(
{
  templateId: '#umbra:Umbra.Auction:OrderCommitment',
  templateIdWithPackageId: '76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9:Umbra.Auction:OrderCommitment',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, desk: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, commitment: damlTypes.Text.decoder, bondCid: damlTypes.ContractId(Umbra_Holding.Holding).decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    desk: damlTypes.Party.encode(__typed__.desk),
    roundId: damlTypes.Text.encode(__typed__.roundId),
    commitment: damlTypes.Text.encode(__typed__.commitment),
    bondCid: damlTypes.ContractId(Umbra_Holding.Holding).encode(__typed__.bondCid),
  };
}
,
  RevealOrder: {
    template: function () { return exports.OrderCommitment; },
    choiceName: 'RevealOrder',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.RevealOrder.decoder; }),
    argumentEncode: function (__typed__) { return exports.RevealOrder.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(exports.Order).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(exports.Order).encode(__typed__); },
  },
  ForfeitBond: {
    template: function () { return exports.OrderCommitment; },
    choiceName: 'ForfeitBond',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.ForfeitBond.decoder; }),
    argumentEncode: function (__typed__) { return exports.ForfeitBond.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(Umbra_Holding.Holding).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(Umbra_Holding.Holding).encode(__typed__); },
  },
  Archive: {
    template: function () { return exports.OrderCommitment; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.OrderCommitment, ['76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9', '#umbra']);



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
  templateIdWithPackageId: '76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9:Umbra.Auction:Order',
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


damlTypes.registerTemplate(exports.Order, ['76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9', '#umbra']);



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

