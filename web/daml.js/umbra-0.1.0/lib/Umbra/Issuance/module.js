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

var Umbra_Holding = require('../../Umbra/Holding/module');
var Umbra_Instrument = require('../../Umbra/Instrument/module');


exports.Redeem = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({principalPerUnit: damlTypes.Numeric(10).decoder, holderBondCids: damlTypes.List(damlTypes.ContractId(Umbra_Holding.Holding)).decoder, issuerCashCid: damlTypes.ContractId(Umbra_Holding.Holding).decoder, }); }),
  encode: function (__typed__) {
  return {
    principalPerUnit: damlTypes.Numeric(10).encode(__typed__.principalPerUnit),
    holderBondCids: damlTypes.List(damlTypes.ContractId(Umbra_Holding.Holding)).encode(__typed__.holderBondCids),
    issuerCashCid: damlTypes.ContractId(Umbra_Holding.Holding).encode(__typed__.issuerCashCid),
  };
}
,
};



exports.Coupon = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({period: damlTypes.Int.decoder, couponPerUnit: damlTypes.Numeric(10).decoder, holderBondCids: damlTypes.List(damlTypes.ContractId(Umbra_Holding.Holding)).decoder, issuerCashCid: damlTypes.ContractId(Umbra_Holding.Holding).decoder, }); }),
  encode: function (__typed__) {
  return {
    period: damlTypes.Int.encode(__typed__.period),
    couponPerUnit: damlTypes.Numeric(10).encode(__typed__.couponPerUnit),
    holderBondCids: damlTypes.List(damlTypes.ContractId(Umbra_Holding.Holding)).encode(__typed__.holderBondCids),
    issuerCashCid: damlTypes.ContractId(Umbra_Holding.Holding).encode(__typed__.issuerCashCid),
  };
}
,
};



exports.ClearIssuance = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({winnerCashCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).decoder, }); }),
  encode: function (__typed__) {
  return {
    winnerCashCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).encode(__typed__.winnerCashCids),
  };
}
,
};



exports.IssuanceRound = damlTypes.assembleTemplate(
{
  templateId: '#umbra:Umbra.Issuance:IssuanceRound',
  templateIdWithPackageId: '804a90940ae8f9a1d9ab3b223113285c57535c6095d62f23101534e837e18689:Umbra.Issuance:IssuanceRound',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, issuer: damlTypes.Party.decoder, bondInstrument: Umbra_Instrument.InstrumentId.decoder, cashInstrument: Umbra_Instrument.InstrumentId.decoder, trancheSize: damlTypes.Int.decoder, reservePrice: damlTypes.Numeric(10).decoder, bids: damlTypes.List(exports.IssuanceBid).decoder, cleared: damlTypes.Bool.decoder, couponsPaid: damlTypes.List(damlTypes.Int).decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    issuer: damlTypes.Party.encode(__typed__.issuer),
    bondInstrument: Umbra_Instrument.InstrumentId.encode(__typed__.bondInstrument),
    cashInstrument: Umbra_Instrument.InstrumentId.encode(__typed__.cashInstrument),
    trancheSize: damlTypes.Int.encode(__typed__.trancheSize),
    reservePrice: damlTypes.Numeric(10).encode(__typed__.reservePrice),
    bids: damlTypes.List(exports.IssuanceBid).encode(__typed__.bids),
    cleared: damlTypes.Bool.encode(__typed__.cleared),
    couponsPaid: damlTypes.List(damlTypes.Int).encode(__typed__.couponsPaid),
  };
}
,
  ClearIssuance: {
    template: function () { return exports.IssuanceRound; },
    choiceName: 'ClearIssuance',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.ClearIssuance.decoder; }),
    argumentEncode: function (__typed__) { return exports.ClearIssuance.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return exports.ClearIssuanceResult.decoder; }),
    resultEncode: function (__typed__) { return exports.ClearIssuanceResult.encode(__typed__); },
  },
  Coupon: {
    template: function () { return exports.IssuanceRound; },
    choiceName: 'Coupon',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.Coupon.decoder; }),
    argumentEncode: function (__typed__) { return exports.Coupon.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(exports.IssuanceRound).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(exports.IssuanceRound).encode(__typed__); },
  },
  Redeem: {
    template: function () { return exports.IssuanceRound; },
    choiceName: 'Redeem',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.Redeem.decoder; }),
    argumentEncode: function (__typed__) { return exports.Redeem.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
  Archive: {
    template: function () { return exports.IssuanceRound; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.IssuanceRound, ['804a90940ae8f9a1d9ab3b223113285c57535c6095d62f23101534e837e18689', '#umbra']);



exports.ClearIssuanceResult = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({clearingPrice: damlTypes.Numeric(10).decoder, totalIssued: damlTypes.Int.decoder, clearedRound: damlTypes.ContractId(exports.IssuanceRound).decoder, }); }),
  encode: function (__typed__) {
  return {
    clearingPrice: damlTypes.Numeric(10).encode(__typed__.clearingPrice),
    totalIssued: damlTypes.Int.encode(__typed__.totalIssued),
    clearedRound: damlTypes.ContractId(exports.IssuanceRound).encode(__typed__.clearedRound),
  };
}
,
};



exports.IssuanceBid = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({desk: damlTypes.Party.decoder, quantity: damlTypes.Int.decoder, limit: damlTypes.Numeric(10).decoder, }); }),
  encode: function (__typed__) {
  return {
    desk: damlTypes.Party.encode(__typed__.desk),
    quantity: damlTypes.Int.encode(__typed__.quantity),
    limit: damlTypes.Numeric(10).encode(__typed__.limit),
  };
}
,
};

