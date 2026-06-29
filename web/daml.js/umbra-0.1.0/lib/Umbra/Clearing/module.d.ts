// Generated from Umbra/Clearing.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
import * as damlLedger from '@daml/ledger';

export declare type OrderView = {
  desk: damlTypes.Party;
  side: Side;
  quantity: damlTypes.Int;
  limit: damlTypes.Numeric;
};

export declare const OrderView:
  damlTypes.Serializable<OrderView> & {
  }
;


export declare type Allocation = {
  desk: damlTypes.Party;
  side: Side;
  filledQty: damlTypes.Int;
};

export declare const Allocation:
  damlTypes.Serializable<Allocation> & {
  }
;


export declare type Side =
  | 'Buy'
  | 'Sell'
;

export declare const Side:
  damlTypes.Serializable<Side> & {
  }
& { readonly keys: Side[] } & { readonly [e in Side]: e }
;

