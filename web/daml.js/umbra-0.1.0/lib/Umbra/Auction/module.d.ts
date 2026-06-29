// Generated from Umbra/Auction.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
import * as damlLedger from '@daml/ledger';

import * as pkg40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7 from '@daml.js/40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7';
import * as pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662 from '@daml.js/d14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662';

import * as Umbra_Asset from '../../Umbra/Asset/module';
import * as Umbra_Clearing from '../../Umbra/Clearing/module';

export declare type Clear = {
  clearingPrice: damlTypes.Numeric;
  allocations: Umbra_Clearing.Allocation[];
  orderCids: damlTypes.ContractId<Order>[];
  buyerUsdcCid: damlTypes.ContractId<Umbra_Asset.Asset>;
  sellerBondCids: pkg40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7.DA.Types.Tuple2<damlTypes.Party, damlTypes.ContractId<Umbra_Asset.Asset>>[];
};

export declare const Clear:
  damlTypes.Serializable<Clear> & {
  }
;


export declare type CloseRound = {
};

export declare const CloseRound:
  damlTypes.Serializable<CloseRound> & {
  }
;


export declare type Round = {
  operator: damlTypes.Party;
  roundId: string;
  symbol: string;
  desks: damlTypes.Party[];
  openedAt: damlTypes.Time;
  windowSeconds: damlTypes.Int;
  status: RoundStatus;
};

export declare interface RoundInterface {
  Clear: damlTypes.Choice<Round, Clear, ClearResult, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Round, undefined>>;
  Archive: damlTypes.Choice<Round, pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Round, undefined>>;
  CloseRound: damlTypes.Choice<Round, CloseRound, damlTypes.ContractId<Round>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Round, undefined>>;
}
export declare const Round:
  damlTypes.Template<Round, undefined, 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861:Umbra.Auction:Round'> &
  damlTypes.ToInterface<Round, never> &
  RoundInterface;

export declare namespace Round {
  export type CreateEvent = damlLedger.CreateEvent<Round, undefined, typeof Round.templateId>
  export type ArchiveEvent = damlLedger.ArchiveEvent<Round, typeof Round.templateId>
  export type Event = damlLedger.Event<Round, undefined, typeof Round.templateId>
  export type QueryResult = damlLedger.QueryResult<Round, undefined, typeof Round.templateId>
}



export declare type ClearResult = {
  roundId: string;
  clearingPrice: damlTypes.Numeric;
  totalMatched: damlTypes.Int;
  confirmations: damlTypes.ContractId<TradeConfirmation>[];
};

export declare const ClearResult:
  damlTypes.Serializable<ClearResult> & {
  }
;


export declare type RoundStats = {
  operator: damlTypes.Party;
  roundId: string;
  desks: damlTypes.Party[];
  sealedOrderCount: damlTypes.Int;
};

export declare interface RoundStatsInterface {
  Archive: damlTypes.Choice<RoundStats, pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<RoundStats, undefined>>;
}
export declare const RoundStats:
  damlTypes.Template<RoundStats, undefined, 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861:Umbra.Auction:RoundStats'> &
  damlTypes.ToInterface<RoundStats, never> &
  RoundStatsInterface;

export declare namespace RoundStats {
  export type CreateEvent = damlLedger.CreateEvent<RoundStats, undefined, typeof RoundStats.templateId>
  export type ArchiveEvent = damlLedger.ArchiveEvent<RoundStats, typeof RoundStats.templateId>
  export type Event = damlLedger.Event<RoundStats, undefined, typeof RoundStats.templateId>
  export type QueryResult = damlLedger.QueryResult<RoundStats, undefined, typeof RoundStats.templateId>
}



export declare type TradeConfirmation = {
  operator: damlTypes.Party;
  desk: damlTypes.Party;
  roundId: string;
  symbol: string;
  side: Umbra_Clearing.Side;
  filledQty: damlTypes.Int;
  clearingPrice: damlTypes.Numeric;
  cashMoved: damlTypes.Numeric;
};

export declare interface TradeConfirmationInterface {
  Archive: damlTypes.Choice<TradeConfirmation, pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<TradeConfirmation, undefined>>;
}
export declare const TradeConfirmation:
  damlTypes.Template<TradeConfirmation, undefined, 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861:Umbra.Auction:TradeConfirmation'> &
  damlTypes.ToInterface<TradeConfirmation, never> &
  TradeConfirmationInterface;

export declare namespace TradeConfirmation {
  export type CreateEvent = damlLedger.CreateEvent<TradeConfirmation, undefined, typeof TradeConfirmation.templateId>
  export type ArchiveEvent = damlLedger.ArchiveEvent<TradeConfirmation, typeof TradeConfirmation.templateId>
  export type Event = damlLedger.Event<TradeConfirmation, undefined, typeof TradeConfirmation.templateId>
  export type QueryResult = damlLedger.QueryResult<TradeConfirmation, undefined, typeof TradeConfirmation.templateId>
}



export declare type Retire = {
};

export declare const Retire:
  damlTypes.Serializable<Retire> & {
  }
;


export declare type Order = {
  operator: damlTypes.Party;
  desk: damlTypes.Party;
  roundId: string;
  side: Umbra_Clearing.Side;
  quantity: damlTypes.Int;
  limit: damlTypes.Numeric;
  status: OrderStatus;
};

export declare interface OrderInterface {
  Retire: damlTypes.Choice<Order, Retire, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Order, undefined>>;
  Archive: damlTypes.Choice<Order, pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Order, undefined>>;
}
export declare const Order:
  damlTypes.Template<Order, undefined, 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861:Umbra.Auction:Order'> &
  damlTypes.ToInterface<Order, never> &
  OrderInterface;

export declare namespace Order {
  export type CreateEvent = damlLedger.CreateEvent<Order, undefined, typeof Order.templateId>
  export type ArchiveEvent = damlLedger.ArchiveEvent<Order, typeof Order.templateId>
  export type Event = damlLedger.Event<Order, undefined, typeof Order.templateId>
  export type QueryResult = damlLedger.QueryResult<Order, undefined, typeof Order.templateId>
}



export declare type RoundStatus =
  | 'Open'
  | 'Closed'
  | 'Cleared'
  | 'Settled'
;

export declare const RoundStatus:
  damlTypes.Serializable<RoundStatus> & {
  }
& { readonly keys: RoundStatus[] } & { readonly [e in RoundStatus]: e }
;


export declare type OrderStatus =
  | 'Sealed'
  | 'Filled'
  | 'PartiallyFilled'
  | 'Unfilled'
;

export declare const OrderStatus:
  damlTypes.Serializable<OrderStatus> & {
  }
& { readonly keys: OrderStatus[] } & { readonly [e in OrderStatus]: e }
;

