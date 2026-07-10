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


exports.ClearingApproval = damlTypes.assembleTemplate(
{
  templateId: '#umbra:Umbra.Approval:ClearingApproval',
  templateIdWithPackageId: '804a90940ae8f9a1d9ab3b223113285c57535c6095d62f23101534e837e18689:Umbra.Approval:ClearingApproval',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, compliance: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, clearingPrice: damlTypes.Numeric(10).decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    compliance: damlTypes.Party.encode(__typed__.compliance),
    roundId: damlTypes.Text.encode(__typed__.roundId),
    clearingPrice: damlTypes.Numeric(10).encode(__typed__.clearingPrice),
  };
}
,
  Archive: {
    template: function () { return exports.ClearingApproval; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.ClearingApproval, ['804a90940ae8f9a1d9ab3b223113285c57535c6095d62f23101534e837e18689', '#umbra']);



exports.RejectClearing = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({}); }),
  encode: function (__typed__) {
  return {
  };
}
,
};



exports.ApproveClearing = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({}); }),
  encode: function (__typed__) {
  return {
  };
}
,
};



exports.ClearingApprovalRequest = damlTypes.assembleTemplate(
{
  templateId: '#umbra:Umbra.Approval:ClearingApprovalRequest',
  templateIdWithPackageId: '804a90940ae8f9a1d9ab3b223113285c57535c6095d62f23101534e837e18689:Umbra.Approval:ClearingApprovalRequest',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, compliance: damlTypes.Party.decoder, roundId: damlTypes.Text.decoder, clearingPrice: damlTypes.Numeric(10).decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    compliance: damlTypes.Party.encode(__typed__.compliance),
    roundId: damlTypes.Text.encode(__typed__.roundId),
    clearingPrice: damlTypes.Numeric(10).encode(__typed__.clearingPrice),
  };
}
,
  ApproveClearing: {
    template: function () { return exports.ClearingApprovalRequest; },
    choiceName: 'ApproveClearing',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.ApproveClearing.decoder; }),
    argumentEncode: function (__typed__) { return exports.ApproveClearing.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.ContractId(exports.ClearingApproval).decoder; }),
    resultEncode: function (__typed__) { return damlTypes.ContractId(exports.ClearingApproval).encode(__typed__); },
  },
  Archive: {
    template: function () { return exports.ClearingApprovalRequest; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
  RejectClearing: {
    template: function () { return exports.ClearingApprovalRequest; },
    choiceName: 'RejectClearing',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.RejectClearing.decoder; }),
    argumentEncode: function (__typed__) { return exports.RejectClearing.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.ClearingApprovalRequest, ['804a90940ae8f9a1d9ab3b223113285c57535c6095d62f23101534e837e18689', '#umbra']);

