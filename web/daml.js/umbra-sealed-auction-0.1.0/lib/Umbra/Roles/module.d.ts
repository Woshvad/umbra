// Generated from Umbra/Roles.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4 from '@daml.js/daml-prim-DA-Types-1.0.0';
import * as pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 from '@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0';

import * as Umbra_Approval from '../../Umbra/Approval/module';
import * as Umbra_Auction from '../../Umbra/Auction/module';
import * as Umbra_Clearing from '../../Umbra/Clearing/module';
import * as Umbra_Compliance from '../../Umbra/Compliance/module';
import * as Umbra_Holding from '../../Umbra/Holding/module';
import * as Umbra_Instrument from '../../Umbra/Instrument/module';

export declare type SettleRound = {
  roundCid: damlTypes.ContractId<Umbra_Auction.Round>;
  clearingPrice: damlTypes.Numeric;
  allocations: Umbra_Clearing.Allocation[];
  orderCids: damlTypes.ContractId<Umbra_Auction.Order>[];
  buyerCashCids: pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2<damlTypes.Party, damlTypes.ContractId<Umbra_Holding.Holding>>[];
  sellerBondCids: pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2<damlTypes.Party, damlTypes.ContractId<Umbra_Holding.Holding>>[];
  cashInstrument: Umbra_Instrument.InstrumentId;
  bondInstrument: Umbra_Instrument.InstrumentId;
  referencePrice: damlTypes.Numeric;
  approvalCid: damlTypes.ContractId<Umbra_Approval.ClearingApproval>;
};

export declare const SettleRound:
  damlTypes.Serializable<SettleRound> & {
  }
;


export declare type AnchorProof = {
  roundId: string;
  proofHash: string;
  vkeyHash: string;
};

export declare const AnchorProof:
  damlTypes.Serializable<AnchorProof> & {
  }
;


export declare type IssueHolding = {
  owner: damlTypes.Party;
  instrument: Umbra_Instrument.InstrumentId;
  amount: damlTypes.Numeric;
  eligCid: damlTypes.ContractId<Umbra_Compliance.DeskEligibility>;
};

export declare const IssueHolding:
  damlTypes.Serializable<IssueHolding> & {
  }
;


export declare type CommitOrder = {
  desk: damlTypes.Party;
  roundId: string;
  commitment: string;
  bondCid: damlTypes.ContractId<Umbra_Holding.Holding>;
  cashInstrument: Umbra_Instrument.InstrumentId;
  eligCid: damlTypes.ContractId<Umbra_Compliance.DeskEligibility>;
};

export declare const CommitOrder:
  damlTypes.Serializable<CommitOrder> & {
  }
;


export declare type SubmitOrder = {
  desk: damlTypes.Party;
  roundId: string;
  side: Umbra_Clearing.Side;
  quantity: damlTypes.Int;
  limit: damlTypes.Numeric;
  orderType: Umbra_Clearing.OrderType;
  minQty: damlTypes.Optional<damlTypes.Int>;
  firmIf: damlTypes.Optional<damlTypes.Numeric>;
  eligCid: damlTypes.ContractId<Umbra_Compliance.DeskEligibility>;
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
  SubmitOrder: damlTypes.Choice<Venue, SubmitOrder, damlTypes.ContractId<Umbra_Auction.Order>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Venue, undefined>>;
  CommitOrder: damlTypes.Choice<Venue, CommitOrder, damlTypes.ContractId<Umbra_Auction.OrderCommitment>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Venue, undefined>>;
  IssueHolding: damlTypes.Choice<Venue, IssueHolding, damlTypes.ContractId<Umbra_Holding.Holding>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Venue, undefined>>;
  AnchorProof: damlTypes.Choice<Venue, AnchorProof, damlTypes.ContractId<Umbra_Auction.ProofAnchor>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Venue, undefined>>;
  Archive: damlTypes.Choice<Venue, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Venue, undefined>>;
  SettleRound: damlTypes.Choice<Venue, SettleRound, Umbra_Auction.ClearResult, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Venue, undefined>>;
}
export declare const Venue:
  damlTypes.Template<Venue, undefined, '#umbra-sealed-auction:Umbra.Roles:Venue'> &
  damlTypes.ToInterface<Venue, never> &
  VenueInterface;

export declare namespace Venue {
}


