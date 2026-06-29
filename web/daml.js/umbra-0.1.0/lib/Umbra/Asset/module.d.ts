// Generated from Umbra/Asset.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
import * as damlLedger from '@daml/ledger';

import * as pkg40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7 from '@daml.js/40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7';
import * as pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662 from '@daml.js/d14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662';

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
  Split: damlTypes.Choice<Asset, Split, pkg40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7.DA.Types.Tuple2<damlTypes.ContractId<Asset>, damlTypes.ContractId<Asset>>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Asset, undefined>>;
  Merge: damlTypes.Choice<Asset, Merge, damlTypes.ContractId<Asset>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Asset, undefined>>;
  Archive: damlTypes.Choice<Asset, pkgd14e08374fc7197d6a0de468c968ae8ba3aadbf9315476fd39071831f5923662.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Asset, undefined>>;
  Reassign: damlTypes.Choice<Asset, Reassign, damlTypes.ContractId<Asset>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<Asset, undefined>>;
}
export declare const Asset:
  damlTypes.Template<Asset, undefined, 'ba79017a89c595cab162d9bab15ae17f0c979f3960d088c830ec7636caa0c861:Umbra.Asset:Asset'> &
  damlTypes.ToInterface<Asset, never> &
  AssetInterface;

export declare namespace Asset {
  export type CreateEvent = damlLedger.CreateEvent<Asset, undefined, typeof Asset.templateId>
  export type ArchiveEvent = damlLedger.ArchiveEvent<Asset, typeof Asset.templateId>
  export type Event = damlLedger.Event<Asset, undefined, typeof Asset.templateId>
  export type QueryResult = damlLedger.QueryResult<Asset, undefined, typeof Asset.templateId>
}


