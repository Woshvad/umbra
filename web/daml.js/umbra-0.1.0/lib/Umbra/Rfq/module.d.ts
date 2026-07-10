// Generated from Umbra/Rfq.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 from '@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0';

import * as Umbra_Clearing from '../../Umbra/Clearing/module';
import * as Umbra_Holding from '../../Umbra/Holding/module';
import * as Umbra_Instrument from '../../Umbra/Instrument/module';

export declare type Quote = {
  operator: damlTypes.Party;
  dealer: damlTypes.Party;
  requester: damlTypes.Party;
  instrument: Umbra_Instrument.InstrumentId;
  price: damlTypes.Numeric;
  quantity: damlTypes.Int;
};

export declare interface QuoteInterface {
  Archive: damlTypes.Choice<Quote, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Quote, undefined>>;
}
export declare const Quote:
  damlTypes.Template<Quote, undefined, '#umbra:Umbra.Rfq:Quote'> &
  damlTypes.ToInterface<Quote, never> &
  QuoteInterface;

export declare namespace Quote {
}



export declare type AcceptQuote = {
  quoteCid: damlTypes.ContractId<Quote>;
  bondSourceCid: damlTypes.ContractId<Umbra_Holding.Holding>;
  cashSourceCid: damlTypes.ContractId<Umbra_Holding.Holding>;
  cashInstrument: Umbra_Instrument.InstrumentId;
};

export declare const AcceptQuote:
  damlTypes.Serializable<AcceptQuote> & {
  }
;


export declare type RfqRequest = {
  operator: damlTypes.Party;
  requester: damlTypes.Party;
  dealers: damlTypes.Party[];
  instrument: Umbra_Instrument.InstrumentId;
  side: Umbra_Clearing.Side;
  quantity: damlTypes.Int;
};

export declare interface RfqRequestInterface {
  Archive: damlTypes.Choice<RfqRequest, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<RfqRequest, undefined>>;
  AcceptQuote: damlTypes.Choice<RfqRequest, AcceptQuote, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<RfqRequest, undefined>>;
}
export declare const RfqRequest:
  damlTypes.Template<RfqRequest, undefined, '#umbra:Umbra.Rfq:RfqRequest'> &
  damlTypes.ToInterface<RfqRequest, never> &
  RfqRequestInterface;

export declare namespace RfqRequest {
}


