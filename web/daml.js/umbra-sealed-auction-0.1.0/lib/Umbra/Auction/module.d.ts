// Generated from Umbra/Auction.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 from '@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0';

import * as Umbra_Clearing from '../../Umbra/Clearing/module';
import * as Umbra_Holding from '../../Umbra/Holding/module';

export declare type MarkSettled = {
};

export declare const MarkSettled:
  damlTypes.Serializable<MarkSettled> & {
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
  CloseRound: damlTypes.Choice<Round, CloseRound, damlTypes.ContractId<Round>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Round, undefined>>;
  Archive: damlTypes.Choice<Round, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Round, undefined>>;
  MarkSettled: damlTypes.Choice<Round, MarkSettled, damlTypes.ContractId<Round>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Round, undefined>>;
}
export declare const Round:
  damlTypes.Template<Round, undefined, '#umbra-sealed-auction:Umbra.Auction:Round'> &
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
  damlTypes.Template<RoundStats, undefined, '#umbra-sealed-auction:Umbra.Auction:RoundStats'> &
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
  ownLimit: damlTypes.Optional<damlTypes.Numeric>;
  referencePrice: damlTypes.Numeric;
  surplusVsLimit: damlTypes.Numeric;
  improvementVsLimitBp: damlTypes.Numeric;
  improvementVsReferenceBp: damlTypes.Numeric;
};

export declare interface TradeConfirmationInterface {
  Archive: damlTypes.Choice<TradeConfirmation, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<TradeConfirmation, undefined>>;
}
export declare const TradeConfirmation:
  damlTypes.Template<TradeConfirmation, undefined, '#umbra-sealed-auction:Umbra.Auction:TradeConfirmation'> &
  damlTypes.ToInterface<TradeConfirmation, never> &
  TradeConfirmationInterface;

export declare namespace TradeConfirmation {
}



export declare type ProofAnchor = {
  operator: damlTypes.Party;
  roundId: string;
  proofHash: string;
  vkeyHash: string;
};

export declare interface ProofAnchorInterface {
  Archive: damlTypes.Choice<ProofAnchor, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<ProofAnchor, undefined>>;
}
export declare const ProofAnchor:
  damlTypes.Template<ProofAnchor, undefined, '#umbra-sealed-auction:Umbra.Auction:ProofAnchor'> &
  damlTypes.ToInterface<ProofAnchor, never> &
  ProofAnchorInterface;

export declare namespace ProofAnchor {
}



export declare type ForfeitBond = {
};

export declare const ForfeitBond:
  damlTypes.Serializable<ForfeitBond> & {
  }
;


export declare type RevealOrder = {
  side: Umbra_Clearing.Side;
  quantity: damlTypes.Int;
  limit: damlTypes.Numeric;
  orderType: Umbra_Clearing.OrderType;
  minQty: damlTypes.Optional<damlTypes.Int>;
  firmIf: damlTypes.Optional<damlTypes.Numeric>;
  salt: string;
};

export declare const RevealOrder:
  damlTypes.Serializable<RevealOrder> & {
  }
;


export declare type OrderCommitment = {
  operator: damlTypes.Party;
  desk: damlTypes.Party;
  roundId: string;
  commitment: string;
  bondCid: damlTypes.ContractId<Umbra_Holding.Holding>;
};

export declare interface OrderCommitmentInterface {
  RevealOrder: damlTypes.Choice<OrderCommitment, RevealOrder, damlTypes.ContractId<Order>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<OrderCommitment, undefined>>;
  ForfeitBond: damlTypes.Choice<OrderCommitment, ForfeitBond, damlTypes.ContractId<Umbra_Holding.Holding>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<OrderCommitment, undefined>>;
  Archive: damlTypes.Choice<OrderCommitment, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<OrderCommitment, undefined>>;
}
export declare const OrderCommitment:
  damlTypes.Template<OrderCommitment, undefined, '#umbra-sealed-auction:Umbra.Auction:OrderCommitment'> &
  damlTypes.ToInterface<OrderCommitment, never> &
  OrderCommitmentInterface;

export declare namespace OrderCommitment {
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
  damlTypes.Template<Order, undefined, '#umbra-sealed-auction:Umbra.Auction:Order'> &
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

