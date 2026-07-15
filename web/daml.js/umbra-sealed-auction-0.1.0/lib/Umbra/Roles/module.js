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

var Umbra_Approval = require('../../Umbra/Approval/module');
var Umbra_Auction = require('../../Umbra/Auction/module');
var Umbra_Clearing = require('../../Umbra/Clearing/module');
var Umbra_Compliance = require('../../Umbra/Compliance/module');
var Umbra_Holding = require('../../Umbra/Holding/module');
var Umbra_Instrument = require('../../Umbra/Instrument/module');


exports.SettleRound = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({roundCid: damlTypes.ContractId(Umbra_Auction.Round).decoder, clearingPrice: damlTypes.Numeric(10).decoder, allocations: damlTypes.List(Umbra_Clearing.Allocation).decoder, orderCids: damlTypes.List(damlTypes.ContractId(Umbra_Auction.Order)).decoder, buyerCashCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).decoder, sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).decoder, cashInstrument: Umbra_Instrument.InstrumentId.decoder, bondInstrument: Umbra_Instrument.InstrumentId.decoder, referencePrice: damlTypes.Numeric(10).decoder, approvalCid: damlTypes.ContractId(Umbra_Approval.ClearingApproval).decoder, }); }),
  encode: function (__typed__) {
  return {
    roundCid: damlTypes.ContractId(Umbra_Auction.Round).encode(__typed__.roundCid),
    clearingPrice: damlTypes.Numeric(10).encode(__typed__.clearingPrice),
    allocations: damlTypes.List(Umbra_Clearing.Allocation).encode(__typed__.allocations),
    orderCids: damlTypes.List(damlTypes.ContractId(Umbra_Auction.Order)).encode(__typed__.orderCids),
    buyerCashCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).encode(__typed__.buyerCashCids),
    sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).encode(__typed__.sellerBondCids),
    cashInstrument: Umbra_Instrument.InstrumentId.encode(__typed__.cashInstrument),
    bondInstrument: Umbra_Instrument.InstrumentId.encode(__typed__.bondInstrument),
    referencePrice: damlTypes.Numeric(10).encode(__typed__.referencePrice),
    approvalCid: damlTypes.ContractId(Umbra_Approval.ClearingApproval).encode(__typed__.approvalCid),
  };
}
,
};



exports.AnchorProof = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({roundId: damlTypes.Text.decoder, proofHash: damlTypes.Text.decoder, vkeyHash: damlTypes.Text.decoder, }); }),
  encode: function (__typed__) {
  return {
    roundId: damlTypes.Text.encode(__typed__.roundId),
    proofHash: damlTypes.Text.encode(__typed__.proofHash),
    vkeyHash: damlTypes.Text.encode(__typed__.vkeyHash),
  };
}
,
};



exports.IssueHolding = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({owner: damlTypes.Party.decoder, instrument: Umbra_Instrument.InstrumentId.decoder, amount: damlTypes.Numeric(10).decoder, eligCid: damlTypes.ContractId(Umbra_Compliance.DeskEligibility).decoder, }); }),
  encode: function (__typed__) {
  return {
    owner: damlTypes.Party.encode(__typed__.owner),
    instrument: Umbra_Instrument.InstrumentId.encode(__typed__.instrument),
    amount: damlTypes.Numeric(10).encode(__typed__.amount),
    eligCid: damlTypes.ContractId(Umbra_Compliance.DeskEligibility).encode(__typed__.eligCid),
  };
}
,
};



exports.CommitOrder = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({desk: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, commitment: damlTypes.Text.decoder, bondCid: damlTypes.ContractId(Umbra_Holding.Holding).decoder, cashInstrument: Umbra_Instrument.InstrumentId.decoder, eligCid: damlTypes.ContractId(Umbra_Compliance.DeskEligibility).decoder, }); }),
  encode: function (__typed__) {
  return {
    desk: damlTypes.Party.encode(__typed__.desk),
    roundId: damlTypes.Text.encode(__typed__.roundId),
    commitment: damlTypes.Text.encode(__typed__.commitment),
    bondCid: damlTypes.ContractId(Umbra_Holding.Holding).encode(__typed__.bondCid),
    cashInstrument: Umbra_Instrument.InstrumentId.encode(__typed__.cashInstrument),
    eligCid: damlTypes.ContractId(Umbra_Compliance.DeskEligibility).encode(__typed__.eligCid),
  };
}
,
};



exports.SubmitOrder = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({desk: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, side: Umbra_Clearing.Side.decoder, quantity: damlTypes.Int.decoder, limit: damlTypes.Numeric(10).decoder, orderType: Umbra_Clearing.OrderType.decoder, minQty: jtv.Decoder.withDefault(null, damlTypes.Optional(damlTypes.Int).decoder), firmIf: jtv.Decoder.withDefault(null, damlTypes.Optional(damlTypes.Numeric(10)).decoder), eligCid: damlTypes.ContractId(Umbra_Compliance.DeskEligibility).decoder, }); }),
  encode: function (__typed__) {
  return {
    desk: damlTypes.Party.encode(__typed__.desk),
    roundId: damlTypes.Text.encode(__typed__.roundId),
    side: Umbra_Clearing.Side.encode(__typed__.side),
    quantity: damlTypes.Int.encode(__typed__.quantity),
    limit: damlTypes.Numeric(10).encode(__typed__.limit),
    orderType: Umbra_Clearing.OrderType.encode(__typed__.orderType),
    minQty: damlTypes.Optional(damlTypes.Int).encode(__typed__.minQty),
    firmIf: damlTypes.Optional(damlTypes.Numeric(10)).encode(__typed__.firmIf),
    eligCid: damlTypes.ContractId(Umbra_Compliance.DeskEligibility).encode(__typed__.eligCid),
  };
}
,
};



exports.Venue = damlTypes.assembleTemplate(
{
  templateId: '#umbra-sealed-auction:Umbra.Roles:Venue',
  templateIdWithPackageId: '6800e677629153916aac2f994e4198f95761e03cfdf29cabcd23cafcb1c83f06:Umbra.Roles:Venue',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, desks: damlTypes.List(damlTypes.Party).decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    desks: damlTypes.List(damlTypes.Party).encode(__typed__.desks),
  };
}
,
  SubmitOrder: {
    template: function () { return exports.Venue; },
    choiceName: 'SubmitOrder',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.SubmitOrder.decoder; }),
    argumentEncode: function (__typed__) { return exports.SubmitOrder.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(Umbra_Auction.Order).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(Umbra_Auction.Order).encode(__typed__); },
  },
  CommitOrder: {
    template: function () { return exports.Venue; },
    choiceName: 'CommitOrder',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.CommitOrder.decoder; }),
    argumentEncode: function (__typed__) { return exports.CommitOrder.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(Umbra_Auction.OrderCommitment).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(Umbra_Auction.OrderCommitment).encode(__typed__); },
  },
  IssueHolding: {
    template: function () { return exports.Venue; },
    choiceName: 'IssueHolding',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.IssueHolding.decoder; }),
    argumentEncode: function (__typed__) { return exports.IssueHolding.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(Umbra_Holding.Holding).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(Umbra_Holding.Holding).encode(__typed__); },
  },
  AnchorProof: {
    template: function () { return exports.Venue; },
    choiceName: 'AnchorProof',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.AnchorProof.decoder; }),
    argumentEncode: function (__typed__) { return exports.AnchorProof.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(Umbra_Auction.ProofAnchor).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(Umbra_Auction.ProofAnchor).encode(__typed__); },
  },
  Archive: {
    template: function () { return exports.Venue; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
  SettleRound: {
    template: function () { return exports.Venue; },
    choiceName: 'SettleRound',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.SettleRound.decoder; }),
    argumentEncode: function (__typed__) { return exports.SettleRound.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return Umbra_Auction.ClearResult.decoder; }),
    resultEncode: function (__typed__) { return Umbra_Auction.ClearResult.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.Venue, ['6800e677629153916aac2f994e4198f95761e03cfdf29cabcd23cafcb1c83f06', '#umbra-sealed-auction']);

