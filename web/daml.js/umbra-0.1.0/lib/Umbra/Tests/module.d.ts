// Generated from Umbra/Tests.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
import * as damlLedger from '@daml/ledger';

import * as pkg40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7 from '@daml.js/40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7';

import * as Umbra_Asset from '../../Umbra/Asset/module';
import * as Umbra_Auction from '../../Umbra/Auction/module';
import * as Umbra_Setup from '../../Umbra/Setup/module';

export declare type SeedResult = {
  parties: Umbra_Setup.Parties;
  roundCid: damlTypes.ContractId<Umbra_Auction.Round>;
  orderCids: damlTypes.ContractId<Umbra_Auction.Order>[];
  buyerUsdcCid: damlTypes.ContractId<Umbra_Asset.Asset>;
  sellerBondCids: pkg40f452260bef3f29dede136108fc08a88d5a5250310281067087da6f0baddff7.DA.Types.Tuple2<damlTypes.Party, damlTypes.ContractId<Umbra_Asset.Asset>>[];
};

export declare const SeedResult:
  damlTypes.Serializable<SeedResult> & {
  }
;

