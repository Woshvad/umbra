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
var pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662 = require('@daml.js/d14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662');


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
  templateId: 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861:Umbra.Asset:Asset',
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
    resultDecoder: damlTypes.lazyMemo(function () { return pkg40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7.DA.Types.Tuple2(damlTypes.ContractId(exports.Asset), damlTypes.ContractId(exports.Asset)).decoder; }),
    resultEncode: function (__typed__) { return pkg40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7.DA.Types.Tuple2(damlTypes.ContractId(exports.Asset), damlTypes.ContractId(exports.Asset)).encode(__typed__); },
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
    argumentDecoder: damlTypes.lazyMemo(function () { return pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive.encode(__typed__); },
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


damlTypes.registerTemplate(exports.Asset, ['ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861', 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861']);

