// Generated from Umbra/Auction.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4 from '@daml.js/daml-prim-DA-Types-1.0.0';
import * as pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 from '@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0';

import * as Umbra_Asset from '../../Umbra/Asset/module';
import * as Umbra_Clearing from '../../Umbra/Clearing/module';

export declare type Clear = {
  clearingPrice: damlTypes.Numeric;
  allocations: Umbra_Clearing.Allocation[];
  orderCids: damlTypes.ContractId<Order>[];
  buyerUsdcCid: damlTypes.ContractId<Umbra_Asset.Asset>;
  sellerBondCids: pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2<damlTypes.Party, damlTypes.ContractId<Umbra_Asset.Asset>>[];
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
  Archive: damlTypes.Choice<Round, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Round, undefined>>;
  CloseRound: damlTypes.Choice<Round, CloseRound, damlTypes.ContractId<Round>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Round, undefined>>;
}
export declare const Round:
  damlTypes.Template<Round, undefined, '#umbra:Umbra.Auction:Round'> &
  damlTypes.ToInterface<Round, never> &
  RoundInterface;

export declare namespace Round {
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
  Archive: damlTypes.Choice<RoundStats, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<RoundStats, undefined>>;
}
export declare const RoundStats:
  damlTypes.Template<RoundStats, undefined, '#umbra:Umbra.Auction:RoundStats'> &
  damlTypes.ToInterface<RoundStats, never> &
  RoundStatsInterface;

export declare namespace RoundStats {
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
  Archive: damlTypes.Choice<TradeConfirmation, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<TradeConfirmation, undefined>>;
}
export declare const TradeConfirmation:
  damlTypes.Template<TradeConfirmation, undefined, '#umbra:Umbra.Auction:TradeConfirmation'> &
  damlTypes.ToInterface<TradeConfirmation, never> &
  TradeConfirmationInterface;

export declare namespace TradeConfirmation {
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
  orderType: Umbra_Clearing.OrderType;
  minQty: damlTypes.Optional<damlTypes.Int>;
  firmIf: damlTypes.Optional<damlTypes.Numeric>;
};

export declare interface OrderInterface {
  Retire: damlTypes.Choice<Order, Retire, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Order, undefined>>;
  Archive: damlTypes.Choice<Order, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Order, undefined>>;
}
export declare const Order:
  damlTypes.Template<Order, undefined, '#umbra:Umbra.Auction:Order'> &
  damlTypes.ToInterface<Order, never> &
  OrderInterface;

export declare namespace Order {
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

