// Generated from Umbra/Roles.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 from '@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0';

import * as Umbra_Auction from '../../Umbra/Auction/module';
import * as Umbra_Clearing from '../../Umbra/Clearing/module';

export declare type SubmitOrder = {
  desk: damlTypes.Party;
  roundId: string;
  side: Umbra_Clearing.Side;
  quantity: damlTypes.Int;
  limit: damlTypes.Numeric;
  orderType: Umbra_Clearing.OrderType;
  minQty: damlTypes.Optional<damlTypes.Int>;
  firmIf: damlTypes.Optional<damlTypes.Numeric>;
};

export declare const SubmitOrder:
  damlTypes.Serializable<SubmitOrder> & {
  }
;


export declare type Venue = {
  operator: damlTypes.Party;
  desks: damlTypes.Party[];
};

export declare interface VenueInterface {
  Archive: damlTypes.Choice<Venue, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Venue, undefined>>;
  SubmitOrder: damlTypes.Choice<Venue, SubmitOrder, damlTypes.ContractId<Umbra_Auction.Order>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Venue, undefined>>;
}
export declare const Venue:
  damlTypes.Template<Venue, undefined, '#umbra:Umbra.Roles:Venue'> &
  damlTypes.ToInterface<Venue, never> &
  VenueInterface;

export declare namespace Venue {
}


