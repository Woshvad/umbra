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


exports.Reassign = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({newOwner: damlTypes.Party.decoder, }); }),
  encode: function (__typed__) {
  return {
    newOwner: damlTypes.Party.encode(__typed__.newOwner),
  };
}
,
};



exports.Merge = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({otherCid: damlTypes.ContractId(exports.Asset).decoder, }); }),
  encode: function (__typed__) {
  return {
    otherCid: damlTypes.ContractId(exports.Asset).encode(__typed__.otherCid),
  };
}
,
};



exports.Split = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({splitQty: damlTypes.Numeric(10).decoder, }); }),
  encode: function (__typed__) {
  return {
    splitQty: damlTypes.Numeric(10).encode(__typed__.splitQty),
  };
}
,
};



exports.Asset = damlTypes.assembleTemplate(
{
  templateId: '#umbra:Umbra.Asset:Asset',
  templateIdWithPackageId: '76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9:Umbra.Asset:Asset',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, owner: damlTypes.Party.decoder, symbol: damlTypes.Text.decoder, quantity: damlTypes.Numeric(10).decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    owner: damlTypes.Party.encode(__typed__.owner),
    symbol: damlTypes.Text.encode(__typed__.symbol),
    quantity: damlTypes.Numeric(10).encode(__typed__.quantity),
  };
}
,
  Split: {
    template: function () { return exports.Asset; },
    choiceName: 'Split',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.Split.decoder; }),
    argumentEncode: function (__typed__) { return exports.Split.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.ContractId(exports.Asset), damlTypes.ContractId(exports.Asset)).decoder; }),
    resultEncode: function (__typed__) { return pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.ContractId(exports.Asset), damlTypes.ContractId(exports.Asset)).encode(__typed__); },
  },
  Merge: {
    template: function () { return exports.Asset; },
    choiceName: 'Merge',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.Merge.decoder; }),
    argumentEncode: function (__typed__) { return exports.Merge.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(exports.Asset).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(exports.Asset).encode(__typed__); },
  },
  Archive: {
    template: function () { return exports.Asset; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
  Reassign: {
    template: function () { return exports.Asset; },
    choiceName: 'Reassign',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.Reassign.decoder; }),
    argumentEncode: function (__typed__) { return exports.Reassign.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(exports.Asset).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(exports.Asset).encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.Asset, ['76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9', '#umbra']);

