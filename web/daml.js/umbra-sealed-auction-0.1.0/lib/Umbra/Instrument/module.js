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


exports.Instrument = damlTypes.assembleTemplate(
{
  templateId: '#umbra-sealed-auction:Umbra.Instrument:Instrument',
  templateIdWithPackageId: '6800e677629153916aac2f994e4198f95761e03cfdf29cabcd23cafcb1c83f06:Umbra.Instrument:Instrument',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({issuer: damlTypes.Party.decoder, operator: damlTypes.Party.decoder, id: damlTypes.Text.decoder, description: damlTypes.Text.decoder, }); }),
  encode: function (__typed__) {
  return {
    issuer: damlTypes.Party.encode(__typed__.issuer),
    operator: damlTypes.Party.encode(__typed__.operator),
    id: damlTypes.Text.encode(__typed__.id),
    description: damlTypes.Text.encode(__typed__.description),
  };
}
,
  Archive: {
    template: function () { return exports.Instrument; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.Instrument, ['6800e677629153916aac2f994e4198f95761e03cfdf29cabcd23cafcb1c83f06', '#umbra-sealed-auction']);



exports.InstrumentId = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({issuer: damlTypes.Party.decoder, id: damlTypes.Text.decoder, }); }),
  encode: function (__typed__) {
  return {
    issuer: damlTypes.Party.encode(__typed__.issuer),
    id: damlTypes.Text.encode(__typed__.id),
  };
}
,
};

