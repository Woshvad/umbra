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
var pkg718a0f77e505a8de22f188bd4c87fe74101274e9d4cb1bfac7d09aec7158d35b = require('@daml.js/splice-api-token-holding-v1-1.0.0');
var pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 = require('@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0');

var Umbra_Instrument = require('../../Umbra/Instrument/module');


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
  decoder: damlTypes.lazyMemo(function () { return jtv.object({otherCid: damlTypes.ContractId(exports.Holding).decoder, }); }),
  encode: function (__typed__) {
  return {
    otherCid: damlTypes.ContractId(exports.Holding).encode(__typed__.otherCid),
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



exports.Holding = damlTypes.assembleTemplate(
{
  templateId: '#umbra-sealed-auction:Umbra.Holding:Holding',
  templateIdWithPackageId: '6800e677629153916aac2f994e4198f95761e03cfdf29cabcd23cafcb1c83f06:Umbra.Holding:Holding',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, owner: damlTypes.Party.decoder, instrument: Umbra_Instrument.InstrumentId.decoder, amount: damlTypes.Numeric(10).decoder, lock: jtv.Decoder.withDefault(null, damlTypes.Optional(damlTypes.Text).decoder), }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    owner: damlTypes.Party.encode(__typed__.owner),
    instrument: Umbra_Instrument.InstrumentId.encode(__typed__.instrument),
    amount: damlTypes.Numeric(10).encode(__typed__.amount),
    lock: damlTypes.Optional(damlTypes.Text).encode(__typed__.lock),
  };
}
,
  Split: {
    template: function () { return exports.Holding; },
    choiceName: 'Split',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.Split.decoder; }),
    argumentEncode: function (__typed__) { return exports.Split.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.ContractId(exports.Holding), damlTypes.ContractId(exports.Holding)).decoder; }),
    resultEncode: function (__typed__) { return pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2(damlTypes.ContractId(exports.Holding), damlTypes.ContractId(exports.Holding)).encode(__typed__); },
  },
  Merge: {
    template: function () { return exports.Holding; },
    choiceName: 'Merge',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.Merge.decoder; }),
    argumentEncode: function (__typed__) { return exports.Merge.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(exports.Holding).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(exports.Holding).encode(__typed__); },
  },
  Reassign: {
    template: function () { return exports.Holding; },
    choiceName: 'Reassign',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.Reassign.decoder; }),
    argumentEncode: function (__typed__) { return exports.Reassign.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(exports.Holding).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(exports.Holding).encode(__typed__); },
  },
  Archive: {
    template: function () { return exports.Holding; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

, pkg718a0f77e505a8de22f188bd4c87fe74101274e9d4cb1bfac7d09aec7158d35b.Splice.Api.Token.HoldingV1.Holding
);


damlTypes.registerTemplate(exports.Holding, ['6800e677629153916aac2f994e4198f95761e03cfdf29cabcd23cafcb1c83f06', '#umbra-sealed-auction']);

