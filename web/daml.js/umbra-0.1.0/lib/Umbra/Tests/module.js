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

var Umbra_Auction = require('../../Umbra/Auction/module');
var Umbra_Holding = require('../../Umbra/Holding/module');
var Umbra_Instrument = require('../../Umbra/Instrument/module');
var Umbra_Issuance = require('../../Umbra/Issuance/module');
var Umbra_Settlement = require('../../Umbra/Settlement/module');
var Umbra_Setup = require('../../Umbra/Setup/module');


exports.IssuanceSeed = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({parties: Umbra_Setup.Parties.decoder, bond2: Umbra_Instrument.InstrumentId.decoder, cash: Umbra_Instrument.InstrumentId.decoder, clearedRound: damlTypes.ContractId(Umbra_Issuance.IssuanceRound).decoder, aBond2: damlTypes.ContractId(Umbra_Holding.Holding).decoder, bBond2: damlTypes.ContractId(Umbra_Holding.Holding).decoder, }); }),
  encode: function (__typed__) {
  return {
    parties: Umbra_Setup.Parties.encode(__typed__.parties),
    bond2: Umbra_Instrument.InstrumentId.encode(__typed__.bond2),
    cash: Umbra_Instrument.InstrumentId.encode(__typed__.cash),
    clearedRound: damlTypes.ContractId(Umbra_Issuance.IssuanceRound).encode(__typed__.clearedRound),
    aBond2: damlTypes.ContractId(Umbra_Holding.Holding).encode(__typed__.aBond2),
    bBond2: damlTypes.ContractId(Umbra_Holding.Holding).encode(__typed__.bBond2),
  };
}
,
};



exports.RunSettle = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({instructions: damlTypes.List(Umbra_Settlement.Instruction).decoder, sources: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple3(damlTypes.Party, Umbra_Instrument.InstrumentId, damlTypes.ContractId(Umbra_Holding.Holding))).decoder, }); }),
  encode: function (__typed__) {
  return {
    instructions: damlTypes.List(Umbra_Settlement.Instruction).encode(__typed__.instructions),
    sources: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple3(damlTypes.Party, Umbra_Instrument.InstrumentId, damlTypes.ContractId(Umbra_Holding.Holding))).encode(__typed__.sources),
  };
}
,
};



exports.SettleHarness = damlTypes.assembleTemplate(
{
  templateId: '#umbra:Umbra.Tests:SettleHarness',
  templateIdWithPackageId: '804a90940ae8f9a1d9ab3b223113285c57535c6095d62f23101534e837e18689:Umbra.Tests:SettleHarness',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
  };
}
,
  RunSettle: {
    template: function () { return exports.SettleHarness; },
    choiceName: 'RunSettle',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.RunSettle.decoder; }),
    argumentEncode: function (__typed__) { return exports.RunSettle.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
  Archive: {
    template: function () { return exports.SettleHarness; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.SettleHarness, ['804a90940ae8f9a1d9ab3b223113285c57535c6095d62f23101534e837e18689', '#umbra']);



exports.SeedResult = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({parties: Umbra_Setup.Parties.decoder, roundCid: damlTypes.ContractId(Umbra_Auction.Round).decoder, orderCids: damlTypes.List(damlTypes.ContractId(Umbra_Auction.Order)).decoder, buyerCashCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).decoder, sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).decoder, }); }),
  encode: function (__typed__) {
  return {
    parties: Umbra_Setup.Parties.encode(__typed__.parties),
    roundCid: damlTypes.ContractId(Umbra_Auction.Round).encode(__typed__.roundCid),
    orderCids: damlTypes.List(damlTypes.ContractId(Umbra_Auction.Order)).encode(__typed__.orderCids),
    buyerCashCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).encode(__typed__.buyerCashCids),
    sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).encode(__typed__.sellerBondCids),
  };
}
,
};

