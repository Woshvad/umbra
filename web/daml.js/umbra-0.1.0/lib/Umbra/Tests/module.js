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

var Umbra_Asset = require('../../Umbra/Asset/module');
var Umbra_Auction = require('../../Umbra/Auction/module');
var Umbra_Setup = require('../../Umbra/Setup/module');


exports.SeedResult = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({parties: Umbra_Setup.Parties.decoder, roundCid: damlTypes.ContractId(Umbra_Auction.Round).decoder, orderCids: damlTypes.List(damlTypes.ContractId(Umbra_Auction.Order)).decoder, buyerUsdcCid: damlTypes.ContractId(Umbra_Asset.Asset).decoder, sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Asset.Asset))).decoder, }); }),
  encode: function (__typed__) {
  return {
    parties: Umbra_Setup.Parties.encode(__typed__.parties),
    roundCid: damlTypes.ContractId(Umbra_Auction.Round).encode(__typed__.roundCid),
    orderCids: damlTypes.List(damlTypes.ContractId(Umbra_Auction.Order)).encode(__typed__.orderCids),
    buyerUsdcCid: damlTypes.ContractId(Umbra_Asset.Asset).encode(__typed__.buyerUsdcCid),
    sellerBondCids: damlTypes.List(pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Asset.Asset))).encode(__typed__.sellerBondCids),
  };
}
,
};

