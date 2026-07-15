// Generated from Umbra/Tests.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4 from '@daml.js/daml-prim-DA-Types-1.0.0';
import * as pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 from '@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0';

import * as Umbra_Auction from '../../Umbra/Auction/module';
import * as Umbra_Holding from '../../Umbra/Holding/module';
import * as Umbra_Instrument from '../../Umbra/Instrument/module';
import * as Umbra_Issuance from '../../Umbra/Issuance/module';
import * as Umbra_Roles from '../../Umbra/Roles/module';
import * as Umbra_Settlement from '../../Umbra/Settlement/module';
import * as Umbra_Setup from '../../Umbra/Setup/module';

export declare type IssuanceSeed = {
  parties: Umbra_Setup.Parties;
  bond2: Umbra_Instrument.InstrumentId;
  cash: Umbra_Instrument.InstrumentId;
  clearedRound: damlTypes.ContractId<Umbra_Issuance.IssuanceRound>;
  aBond2: damlTypes.ContractId<Umbra_Holding.Holding>;
  bBond2: damlTypes.ContractId<Umbra_Holding.Holding>;
};

export declare const IssuanceSeed:
  damlTypes.Serializable<IssuanceSeed> & {
  }
;


export declare type RunSettle = {
  instructions: Umbra_Settlement.Instruction[];
  sources: pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple3<damlTypes.Party, Umbra_Instrument.InstrumentId, damlTypes.ContractId<Umbra_Holding.Holding>>[];
};

export declare const RunSettle:
  damlTypes.Serializable<RunSettle> & {
  }
;


export declare type SettleHarness = {
  operator: damlTypes.Party;
};

export declare interface SettleHarnessInterface {
  RunSettle: damlTypes.Choice<SettleHarness, RunSettle, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<SettleHarness, undefined>>;
  Archive: damlTypes.Choice<SettleHarness, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<SettleHarness, undefined>>;
}
export declare const SettleHarness:
  damlTypes.Template<SettleHarness, undefined, '#umbra-sealed-auction:Umbra.Tests:SettleHarness'> &
  damlTypes.ToInterface<SettleHarness, never> &
  SettleHarnessInterface;

export declare namespace SettleHarness {
}



export declare type SeedResult = {
  parties: Umbra_Setup.Parties;
  venueCid: damlTypes.ContractId<Umbra_Roles.Venue>;
  roundCid: damlTypes.ContractId<Umbra_Auction.Round>;
  orderCids: damlTypes.ContractId<Umbra_Auction.Order>[];
  buyerCashCids: pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2<damlTypes.Party, damlTypes.ContractId<Umbra_Holding.Holding>>[];
  sellerBondCids: pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2<damlTypes.Party, damlTypes.ContractId<Umbra_Holding.Holding>>[];
};

export declare const SeedResult:
  damlTypes.Serializable<SeedResult> & {
  }
;

