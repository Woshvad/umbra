// Generated from Umbra/Issuance.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4 from '@daml.js/daml-prim-DA-Types-1.0.0';
import * as pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 from '@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0';

import * as Umbra_Holding from '../../Umbra/Holding/module';
import * as Umbra_Instrument from '../../Umbra/Instrument/module';

export declare type Redeem = {
  principalPerUnit: damlTypes.Numeric;
  holderBondCids: damlTypes.ContractId<Umbra_Holding.Holding>[];
  issuerCashCid: damlTypes.ContractId<Umbra_Holding.Holding>;
};

export declare const Redeem:
  damlTypes.Serializable<Redeem> & {
  }
;


export declare type Coupon = {
  period: damlTypes.Int;
  couponPerUnit: damlTypes.Numeric;
  holderBondCids: damlTypes.ContractId<Umbra_Holding.Holding>[];
  issuerCashCid: damlTypes.ContractId<Umbra_Holding.Holding>;
};

export declare const Coupon:
  damlTypes.Serializable<Coupon> & {
  }
;


export declare type ClearIssuance = {
  winnerCashCids: pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2<damlTypes.Party, damlTypes.ContractId<Umbra_Holding.Holding>>[];
};

export declare const ClearIssuance:
  damlTypes.Serializable<ClearIssuance> & {
  }
;


export declare type IssuanceRound = {
  operator: damlTypes.Party;
  issuer: damlTypes.Party;
  bondInstrument: Umbra_Instrument.InstrumentId;
  cashInstrument: Umbra_Instrument.InstrumentId;
  trancheSize: damlTypes.Int;
  reservePrice: damlTypes.Numeric;
  bids: IssuanceBid[];
  cleared: boolean;
  couponsPaid: damlTypes.Int[];
};

export declare interface IssuanceRoundInterface {
  ClearIssuance: damlTypes.Choice<IssuanceRound, ClearIssuance, ClearIssuanceResult, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<IssuanceRound, undefined>>;
  Coupon: damlTypes.Choice<IssuanceRound, Coupon, damlTypes.ContractId<IssuanceRound>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<IssuanceRound, undefined>>;
  Redeem: damlTypes.Choice<IssuanceRound, Redeem, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<IssuanceRound, undefined>>;
  Archive: damlTypes.Choice<IssuanceRound, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<IssuanceRound, undefined>>;
}
export declare const IssuanceRound:
  damlTypes.Template<IssuanceRound, undefined, '#umbra:Umbra.Issuance:IssuanceRound'> &
  damlTypes.ToInterface<IssuanceRound, never> &
  IssuanceRoundInterface;

export declare namespace IssuanceRound {
}



export declare type ClearIssuanceResult = {
  clearingPrice: damlTypes.Numeric;
  totalIssued: damlTypes.Int;
  clearedRound: damlTypes.ContractId<IssuanceRound>;
};

export declare const ClearIssuanceResult:
  damlTypes.Serializable<ClearIssuanceResult> & {
  }
;


export declare type IssuanceBid = {
  desk: damlTypes.Party;
  quantity: damlTypes.Int;
  limit: damlTypes.Numeric;
};

export declare const IssuanceBid:
  damlTypes.Serializable<IssuanceBid> & {
  }
;

