// Generated from Umbra/Roles.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
import * as damlLedger from '@daml/ledger';

import * as pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662 from '@daml.js/d14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662';

import * as Umbra_Auction from '../../Umbra/Auction/module';
import * as Umbra_Clearing from '../../Umbra/Clearing/module';

export declare type SubmitOrder = {
  desk: damlTypes.Party;
  roundId: string;
  side: Umbra_Clearing.Side;
  quantity: damlTypes.Int;
  limit: damlTypes.Numeric;
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
  Archive: damlTypes.Choice<Venue, pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Venue, undefined>>;
  SubmitOrder: damlTypes.Choice<Venue, SubmitOrder, damlTypes.ContractId<Umbra_Auction.Order>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Venue, undefined>>;
}
export declare const Venue:
  damlTypes.Template<Venue, undefined, 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861:Umbra.Roles:Venue'> &
  damlTypes.ToInterface<Venue, never> &
  VenueInterface;

export declare namespace Venue {
  export type CreateEvent = damlLedger.CreateEvent<Venue, undefined, typeof Venue.templateId>
  export type ArchiveEvent = damlLedger.ArchiveEvent<Venue, typeof Venue.templateId>
  export type Event = damlLedger.Event<Venue, undefined, typeof Venue.templateId>
  export type QueryResult = damlLedger.QueryResult<Venue, undefined, typeof Venue.templateId>
}


