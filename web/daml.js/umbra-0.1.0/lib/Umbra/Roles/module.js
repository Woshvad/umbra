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

var pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662 = require('@daml.js/d14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662');

var Umbra_Auction = require('../../Umbra/Auction/module');
var Umbra_Clearing = require('../../Umbra/Clearing/module');


exports.SubmitOrder = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({desk: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, side: Umbra_Clearing.Side.decoder, quantity: damlTypes.Int.decoder, limit: damlTypes.Numeric(10).decoder, }); }),
  encode: function (__typed__) {
  return {
    desk: damlTypes.Party.encode(__typed__.desk),
    roundId: damlTypes.Text.encode(__typed__.roundId),
    side: Umbra_Clearing.Side.encode(__typed__.side),
    quantity: damlTypes.Int.encode(__typed__.quantity),
    limit: damlTypes.Numeric(10).encode(__typed__.limit),
  };
}
,
};



exports.Venue = damlTypes.assembleTemplate(
{
  templateId: 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861:Umbra.Roles:Venue',
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
  Archive: {
    template: function () { return exports.Venue; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
  SubmitOrder: {
    template: function () { return exports.Venue; },
    choiceName: 'SubmitOrder',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.SubmitOrder.decoder; }),
    argumentEncode: function (__typed__) { return exports.SubmitOrder.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(Umbra_Auction.Order).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(Umbra_Auction.Order).encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.Venue, ['ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861', 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861']);

