// Generated from Umbra/Setup.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4 from '@daml.js/daml-prim-DA-Types-1.0.0';

import * as Umbra_Asset from '../../Umbra/Asset/module';
import * as Umbra_Auction from '../../Umbra/Auction/module';

export declare type CommitRevealSeed = {
  parties: Parties;
  roundCid: damlTypes.ContractId<Umbra_Auction.Round>;
  orderCids: damlTypes.ContractId<Umbra_Auction.Order>[];
  buyerUsdcCid: damlTypes.ContractId<Umbra_Asset.Asset>;
  sellerBondCids: pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2<damlTypes.Party, damlTypes.ContractId<Umbra_Asset.Asset>>[];
};

export declare const CommitRevealSeed:
  damlTypes.Serializable<CommitRevealSeed> & {
  }
;


export declare type Parties = {
  operator: damlTypes.Party;
  bankA: damlTypes.Party;
  bankB: damlTypes.Party;
  bankC: damlTypes.Party;
};

export declare const Parties:
  damlTypes.Serializable<Parties> & {
  }
;

