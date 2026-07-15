// Generated from Umbra/Settlement.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as Umbra_Instrument from '../../Umbra/Instrument/module';

export declare type Instruction = {
  sender: damlTypes.Party;
  receiver: damlTypes.Party;
  instrument: Umbra_Instrument.InstrumentId;
  amount: damlTypes.Numeric;
};

export declare const Instruction:
  damlTypes.Serializable<Instruction> & {
  }
;

