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

var Umbra_Asset = require('../../Umbra/Asset/module');
var Umbra_Auction = require('../../Umbra/Auction/module');
var Umbra_Setup = require('../../Umbra/Setup/module');


exports.SeedResult = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({parties: Umbra_Setup.Parties.decoder, roundCid: damlTypes.ContractId(Umbra_Auction.Round).decoder, orderCids: damlTypes.List(damlTypes.ContractId(Umbra_Auction.Order)).decoder, buyerUsdcCid: damlTypes.ContractId(Umbra_Asset.Asset).decoder, sellerBondCids: damlTypes.List(pkg40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Asset.Asset))).decoder, }); }),
  encode: function (__typed__) {
  return {
    parties: Umbra_Setup.Parties.encode(__typed__.parties),
    roundCid: damlTypes.ContractId(Umbra_Auction.Round).encode(__typed__.roundCid),
    orderCids: damlTypes.List(damlTypes.ContractId(Umbra_Auction.Order)).encode(__typed__.orderCids),
    buyerUsdcCid: damlTypes.ContractId(Umbra_Asset.Asset).encode(__typed__.buyerUsdcCid),
    sellerBondCids: damlTypes.List(pkg40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7.DA.Types.Tuple2(damlTypes.Party, damlTypes.ContractId(Umbra_Asset.Asset))).encode(__typed__.sellerBondCids),
  };
}
,
};

