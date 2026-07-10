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


exports.Revoke = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({}); }),
  encode: function (__typed__) {
  return {
  };
}
,
};



exports.DeskEligibility = damlTypes.assembleTemplate(
{
  templateId: '#umbra:Umbra.Compliance:DeskEligibility',
  templateIdWithPackageId: '76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9:Umbra.Compliance:DeskEligibility',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, compliance: damlTypes.Party.decoder, desk: damlTypes.Party.decoder, accredited: damlTypes.Bool.decoder, jurisdiction: damlTypes.Text.decoder, sanctionsClear: damlTypes.Bool.decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    compliance: damlTypes.Party.encode(__typed__.compliance),
    desk: damlTypes.Party.encode(__typed__.desk),
    accredited: damlTypes.Bool.encode(__typed__.accredited),
    jurisdiction: damlTypes.Text.encode(__typed__.jurisdiction),
    sanctionsClear: damlTypes.Bool.encode(__typed__.sanctionsClear),
  };
}
,
  Revoke: {
    template: function () { return exports.DeskEligibility; },
    choiceName: 'Revoke',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.Revoke.decoder; }),
    argumentEncode: function (__typed__) { return exports.Revoke.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
  Archive: {
    template: function () { return exports.DeskEligibility; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.DeskEligibility, ['76118676638da246f5c358566ac0e8959c836263d01011224c7aefed35d84ee9', '#umbra']);

