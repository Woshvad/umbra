// Generated from Umbra/Instrument.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 from '@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0';

export declare type Instrument = {
  issuer: damlTypes.Party;
  operator: damlTypes.Party;
  id: string;
  description: string;
};

export declare interface InstrumentInterface {
  Archive: damlTypes.Choice<Instrument, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Instrument, undefined>>;
}
export declare const Instrument:
  damlTypes.Template<Instrument, undefined, '#umbra:Umbra.Instrument:Instrument'> &
  damlTypes.ToInterface<Instrument, never> &
  InstrumentInterface;

export declare namespace Instrument {
}



export declare type InstrumentId = {
  issuer: damlTypes.Party;
  id: string;
};

export declare const InstrumentId:
  damlTypes.Serializable<InstrumentId> & {
  }
;

