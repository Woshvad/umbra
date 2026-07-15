// Generated from Umbra/Holding.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4 from '@daml.js/daml-prim-DA-Types-1.0.0';
import * as pkg718a0f77e505a8de22f188bd4c87fe74101274e9d4cb1bfac7d09aec7158d35b from '@daml.js/splice-api-token-holding-v1-1.0.0';
import * as pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 from '@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0';

import * as Umbra_Instrument from '../../Umbra/Instrument/module';

export declare type Reassign = {
  newOwner: damlTypes.Party;
};

export declare const Reassign:
  damlTypes.Serializable<Reassign> & {
  }
;


export declare type Merge = {
  otherCid: damlTypes.ContractId<Holding>;
};

export declare const Merge:
  damlTypes.Serializable<Merge> & {
  }
;


export declare type Split = {
  splitQty: damlTypes.Numeric;
};

export declare const Split:
  damlTypes.Serializable<Split> & {
  }
;


export declare type Holding = {
  operator: damlTypes.Party;
  owner: damlTypes.Party;
  instrument: Umbra_Instrument.InstrumentId;
  amount: damlTypes.Numeric;
  lock: damlTypes.Optional<string>;
};

export declare interface HoldingInterface {
  Split: damlTypes.Choice<Holding, Split, pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2<damlTypes.ContractId<Holding>, damlTypes.ContractId<Holding>>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Holding, undefined>>;
  Merge: damlTypes.Choice<Holding, Merge, damlTypes.ContractId<Holding>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Holding, undefined>>;
  Reassign: damlTypes.Choice<Holding, Reassign, damlTypes.ContractId<Holding>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Holding, undefined>>;
  Archive: damlTypes.Choice<Holding, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Holding, undefined>>;
}
export declare const Holding:
  damlTypes.Template<Holding, undefined, '#umbra-sealed-auction:Umbra.Holding:Holding'> &
  damlTypes.ToInterface<Holding, pkg718a0f77e505a8de22f188bd4c87fe74101274e9d4cb1bfac7d09aec7158d35b.Splice.Api.Token.HoldingV1.Holding> &
  HoldingInterface;

export declare namespace Holding {
}


