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

