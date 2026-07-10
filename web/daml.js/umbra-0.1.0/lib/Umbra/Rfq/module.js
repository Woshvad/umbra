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

var Umbra_Clearing = require('../../Umbra/Clearing/module');
var Umbra_Holding = require('../../Umbra/Holding/module');
var Umbra_Instrument = require('../../Umbra/Instrument/module');


exports.Quote = damlTypes.assembleTemplate(
{
  templateId: '#umbra:Umbra.Rfq:Quote',
  templateIdWithPackageId: '804a90940ae8f9a1d9ab3b223113285c57535c6095d62f23101534e837e18689:Umbra.Rfq:Quote',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, dealer: damlTypes.Party.decoder, requester: damlTypes.Party.decoder, instrument: Umbra_Instrument.InstrumentId.decoder, price: damlTypes.Numeric(10).decoder, quantity: damlTypes.Int.decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    dealer: damlTypes.Party.encode(__typed__.dealer),
    requester: damlTypes.Party.encode(__typed__.requester),
    instrument: Umbra_Instrument.InstrumentId.encode(__typed__.instrument),
    price: damlTypes.Numeric(10).encode(__typed__.price),
    quantity: damlTypes.Int.encode(__typed__.quantity),
  };
}
,
  Archive: {
    template: function () { return exports.Quote; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.Quote, ['804a90940ae8f9a1d9ab3b223113285c57535c6095d62f23101534e837e18689', '#umbra']);



exports.AcceptQuote = {
  decoder: damlTypes.lazyMemo(function () { return jtv.object({quoteCid: damlTypes.ContractId(exports.Quote).decoder, bondSourceCid: damlTypes.ContractId(Umbra_Holding.Holding).decoder, cashSourceCid: damlTypes.ContractId(Umbra_Holding.Holding).decoder, cashInstrument: Umbra_Instrument.InstrumentId.decoder, }); }),
  encode: function (__typed__) {
  return {
    quoteCid: damlTypes.ContractId(exports.Quote).encode(__typed__.quoteCid),
    bondSourceCid: damlTypes.ContractId(Umbra_Holding.Holding).encode(__typed__.bondSourceCid),
    cashSourceCid: damlTypes.ContractId(Umbra_Holding.Holding).encode(__typed__.cashSourceCid),
    cashInstrument: Umbra_Instrument.InstrumentId.encode(__typed__.cashInstrument),
  };
}
,
};



exports.RfqRequest = damlTypes.assembleTemplate(
{
  templateId: '#umbra:Umbra.Rfq:RfqRequest',
  templateIdWithPackageId: '804a90940ae8f9a1d9ab3b223113285c57535c6095d62f23101534e837e18689:Umbra.Rfq:RfqRequest',
  keyDecoder: damlTypes.lazyMemo(function () { return jtv.constant(undefined); }),
  keyEncode: function () { throw 'EncodeError'; },
  decoder: damlTypes.lazyMemo(function () { return jtv.object({operator: damlTypes.Party.decoder, requester: damlTypes.Party.decoder, dealers: damlTypes.List(damlTypes.Party).decoder, instrument: Umbra_Instrument.InstrumentId.decoder, side: Umbra_Clearing.Side.decoder, quantity: damlTypes.Int.decoder, }); }),
  encode: function (__typed__) {
  return {
    operator: damlTypes.Party.encode(__typed__.operator),
    requester: damlTypes.Party.encode(__typed__.requester),
    dealers: damlTypes.List(damlTypes.Party).encode(__typed__.dealers),
    instrument: Umbra_Instrument.InstrumentId.encode(__typed__.instrument),
    side: Umbra_Clearing.Side.encode(__typed__.side),
    quantity: damlTypes.Int.encode(__typed__.quantity),
  };
}
,
  Archive: {
    template: function () { return exports.RfqRequest; },
    choiceName: 'Archive',
    argumentDecoder: damlTypes.lazyMemo(function () { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.decoder; }),
    argumentEncode: function (__typed__) { return pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
  AcceptQuote: {
    template: function () { return exports.RfqRequest; },
    choiceName: 'AcceptQuote',
    argumentDecoder: damlTypes.lazyMemo(function () { return exports.AcceptQuote.decoder; }),
    argumentEncode: function (__typed__) { return exports.AcceptQuote.encode(__typed__); },
    resultDecoder: damlTypes.lazyMemo(function () { return damlTypes.Unit.decoder; }),
    resultEncode: function (__typed__) { return damlTypes.Unit.encode(__typed__); },
  },
}

);


damlTypes.registerTemplate(exports.RfqRequest, ['804a90940ae8f9a1d9ab3b223113285c57535c6095d62f23101534e837e18689', '#umbra']);

