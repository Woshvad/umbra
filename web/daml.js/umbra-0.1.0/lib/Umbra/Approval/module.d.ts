// Generated from Umbra/Approval.daml
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-use-before-define */
import * as jtv from '@mojotech/json-type-validation';
import * as damlTypes from '@daml/types';

import * as pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69 from '@daml.js/ghc-stdlib-DA-Internal-Template-1.0.0';

export declare type ClearingApproval = {
  operator: damlTypes.Party;
  compliance: damlTypes.Party;
  roundId: string;
  clearingPrice: damlTypes.Numeric;
};

export declare interface ClearingApprovalInterface {
  Archive: damlTypes.Choice<ClearingApproval, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<ClearingApproval, undefined>>;
}
export declare const ClearingApproval:
  damlTypes.Template<ClearingApproval, undefined, '#umbra:Umbra.Approval:ClearingApproval'> &
  damlTypes.ToInterface<ClearingApproval, never> &
  ClearingApprovalInterface;

export declare namespace ClearingApproval {
}



export declare type RejectClearing = {
};

export declare const RejectClearing:
  damlTypes.Serializable<RejectClearing> & {
  }
;


export declare type ApproveClearing = {
};

export declare const ApproveClearing:
  damlTypes.Serializable<ApproveClearing> & {
  }
;


export declare type ClearingApprovalRequest = {
  operator: damlTypes.Party;
  compliance: damlTypes.Party;
  roundId: string;
  clearingPrice: damlTypes.Numeric;
};

export declare interface ClearingApprovalRequestInterface {
  ApproveClearing: damlTypes.Choice<ClearingApprovalRequest, ApproveClearing, damlTypes.ContractId<ClearingApproval>, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<ClearingApprovalRequest, undefined>>;
  Archive: damlTypes.Choice<ClearingApprovalRequest, pkg9e70a8b3510d617f8a136213f33d6a903a10ca0eeec76bb06ba55d1ed9680f69.DA.Internal.Template.Archive, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<ClearingApprovalRequest, undefined>>;
  RejectClearing: damlTypes.Choice<ClearingApprovalRequest, RejectClearing, {}, undefined> & damlTypes.ChoiceFrom<damlTypes.Template<ClearingApprovalRequest, undefined>>;
}
export declare const ClearingApprovalRequest:
  damlTypes.Template<ClearingApprovalRequest, undefined, '#umbra:Umbra.Approval:ClearingApprovalRequest'> &
  damlTypes.ToInterface<ClearingApprovalRequest, never> &
  ClearingApprovalRequestInterface;

export declare namespace ClearingApprovalRequest {
}


