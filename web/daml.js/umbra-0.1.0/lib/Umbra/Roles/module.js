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

var pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 = require('@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0');

var Umbra_Asset = require('../../Umbra/Asset/module');
var Umbra_Auction = require('../../Umbra/Auction/module');
var Umbra_Clearing = require('../../Umbra/Clearing/module');


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



exports.CommitOrder = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({desk: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, commitment: damlTypes.Text.decoder, bondCid: damlTypes.ContractId(Umbra_Asset.Asset).decoder, }); }),
  encode: function (__typed__) {
  return {
    desk: damlTypes.Party.encode(__typed__.desk),
    roundId: damlTypes.Text.encode(__typed__.roundId),
    commitment: damlTypes.Text.encode(__typed__.commitment),
    bondCid: damlTypes.ContractId(Umbra_Asset.Asset).encode(__typed__.bondCid),
  };
}
,
};



exports.SubmitOrder = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({desk: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, side: Umbra_Clearing.Side.decoder, quantity: damlTypes.Int.decoder, limit: damlTypes.Numeric(10).decoder, orderType: Umbra_Clearing.OrderType.decoder, minQty: jtv.Decoder.withDefault(null, damlTypes.Optional(damlTypes.Int).decoder), firmIf: jtv.Decoder.withDefault(null, damlTypes.Optional(damlTypes.Numeric(10)).decoder), }); }),
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
  };
}
,
};



exports.Venue = damlTypes.assembleTemplate(
{
  templateId: '#umbra:Umbra.Roles:Venue',
  templateIdWithPackageId: 'b5612deed4d4f313a67eeec837e12b2dd10bb702bb3afa04da2e341ac8c35c2d:Umbra.Roles:Venue',
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
  Archive: {
    template: function () { return exports.Venue; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
  AnchorProof: {
    template: function () { return exports.Venue; },
    choiceName: 'AnchorProof',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.AnchorProof.decoder; }),
    argumentEncode: function (__typed__) { return exports.AnchorProof.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(Umbra_Auction.ProofAnchor).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(Umbra_Auction.ProofAnchor).encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.Venue, ['b5612deed4d4f313a67eeec837e12b2dd10bb702bb3afa04da2e341ac8c35c2d', '#umbra']);

