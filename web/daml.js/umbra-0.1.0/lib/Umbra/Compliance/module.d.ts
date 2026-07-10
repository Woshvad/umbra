// Generated from Umbra/Compliance.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 from '@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0';

export declare type Revoke = {
};

export declare const Revoke:
  damlTypes.Serializable<Revoke> & {
  }
;


export declare type DeskEligibility = {
  operator: damlTypes.Party;
  compliance: damlTypes.Party;
  desk: damlTypes.Party;
  accredited: boolean;
  jurisdiction: string;
  sanctionsClear: boolean;
};

export declare interface DeskEligibilityInterface {
  Revoke: damlTypes.Choice<DeskEligibility, Revoke, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<DeskEligibility, undefined>>;
  Archive: damlTypes.Choice<DeskEligibility, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<DeskEligibility, undefined>>;
}
export declare const DeskEligibility:
  damlTypes.Template<DeskEligibility, undefined, '#umbra:Umbra.Compliance:DeskEligibility'> &
  damlTypes.ToInterface<DeskEligibility, never> &
  DeskEligibilityInterface;

export declare namespace DeskEligibility {
}


