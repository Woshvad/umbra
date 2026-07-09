// Generated from Umbra/Asset.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4 from '@daml.js/daml-prim-DA-Types-1.0.0';
import * as pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 from '@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0';

export declare type Reassign = {
  newOwner: damlTypes.Party;
};

export declare const Reassign:
  damlTypes.Serializable<Reassign> & {
  }
;


export declare type Merge = {
  otherCid: damlTypes.ContractId<Asset>;
};

export declare const Merge:
  damlTypes.Serializable<Merge> & {
  }
;


export declare type Split = {
  splitQty: damlTypes.Numeric;
};

export declare const Split:
  damlTypes.Serializable<Split> & {
  }
;


export declare type Asset = {
  operator: damlTypes.Party;
  owner: damlTypes.Party;
  symbol: string;
  quantity: damlTypes.Numeric;
};

export declare interface AssetInterface {
  Split: damlTypes.Choice<Asset, Split, pkg5aee9b21b8e9a4c4975b5f4c4198e6e6e8469df49e2010820e792f393db870f4.DA.Types.Tuple2<damlTypes.ContractId<Asset>, damlTypes.ContractId<Asset>>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Asset, undefined>>;
  Merge: damlTypes.Choice<Asset, Merge, damlTypes.ContractId<Asset>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Asset, undefined>>;
  Archive: damlTypes.Choice<Asset, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Asset, undefined>>;
  Reassign: damlTypes.Choice<Asset, Reassign, damlTypes.ContractId<Asset>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Asset, undefined>>;
}
export declare const Asset:
  damlTypes.Template<Asset, undefined, '#umbra:Umbra.Asset:Asset'> &
  damlTypes.ToInterface<Asset, never> &
  AssetInterface;

export declare namespace Asset {
}


