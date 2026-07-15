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

var Umbra_Auction = require('../../Umbra/Auction/module');
var Umbra_Clearing = require('../../Umbra/Clearing/module');
var Umbra_Holding = require('../../Umbra/Holding/module');
var Umbra_Instrument = require('../../Umbra/Instrument/module');
var Umbra_Roles = require('../../Umbra/Roles/module');


exports.MultiBuyerSeed = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, venueCid: damlTypes.ContractId(Umbra_Roles.Venue).decoder, bankA: damlTypes.Party.decoder, bankB: damlTypes.Party.decoder, bankC: damlTypes.Party.decoder, bankD: damlTypes.Party.decoder, roundCid: damlTypes.ContractId(Umbra_Auction.Round).decoder, orderCids: damlTypes.List(damlTypes.ContractId(Umbra_Auction.Order)).decoder, buyerCashCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).decoder, sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).decoder, cashInstrument: Umbra_Instrument.InstrumentId.decoder, bondInstrument: Umbra_Instrument.InstrumentId.decoder, allocations: damlTypes.List(Umbra_Clearing.Allocation).decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    venueCid: damlTypes.ContractId(Umbra_Roles.Venue).encode(__typed__.venueCid),
    bankA: damlTypes.Party.encode(__typed__.bankA),
    bankB: damlTypes.Party.encode(__typed__.bankB),
    bankC: damlTypes.Party.encode(__typed__.bankC),
    bankD: damlTypes.Party.encode(__typed__.bankD),
    roundCid: damlTypes.ContractId(Umbra_Auction.Round).encode(__typed__.roundCid),
    orderCids: damlTypes.List(damlTypes.ContractId(Umbra_Auction.Order)).encode(__typed__.orderCids),
    buyerCashCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).encode(__typed__.buyerCashCids),
    sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).encode(__typed__.sellerBondCids),
    cashInstrument: Umbra_Instrument.InstrumentId.encode(__typed__.cashInstrument),
    bondInstrument: Umbra_Instrument.InstrumentId.encode(__typed__.bondInstrument),
    allocations: damlTypes.List(Umbra_Clearing.Allocation).encode(__typed__.allocations),
  };
}
,
};



exports.CommitRevealSeed = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({parties: exports.Parties.decoder, venueCid: damlTypes.ContractId(Umbra_Roles.Venue).decoder, roundCid: damlTypes.ContractId(Umbra_Auction.Round).decoder, orderCids: damlTypes.List(damlTypes.ContractId(Umbra_Auction.Order)).decoder, buyerCashCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).decoder, sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).decoder, }); }),
  encode: function (__typed__) {
  return {
    parties: exports.Parties.encode(__typed__.parties),
    venueCid: damlTypes.ContractId(Umbra_Roles.Venue).encode(__typed__.venueCid),
    roundCid: damlTypes.ContractId(Umbra_Auction.Round).encode(__typed__.roundCid),
    orderCids: damlTypes.List(damlTypes.ContractId(Umbra_Auction.Order)).encode(__typed__.orderCids),
    buyerCashCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).encode(__typed__.buyerCashCids),
    sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Holding.Holding))).encode(__typed__.sellerBondCids),
  };
}
,
};



exports.Parties = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, bankA: damlTypes.Party.decoder, bankB: damlTypes.Party.decoder, bankC: damlTypes.Party.decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    bankA: damlTypes.Party.encode(__typed__.bankA),
    bankB: damlTypes.Party.encode(__typed__.bankB),
    bankC: damlTypes.Party.encode(__typed__.bankC),
  };
}
,
};

