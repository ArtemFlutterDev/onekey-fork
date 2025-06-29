import type { IKaspaUnspentOutputInfo } from './sdkKaspa';
import type { PrivateKey, PublicKey } from '@onekeyfe/kaspa-core-lib';

export type IEncodedTxKaspa = {
  utxoIds: string[];
  inputs: IKaspaUnspentOutputInfo[];
  outputs: {
    address: string;
    value: string;
  }[];
  mass: number;
  hasMaxSend: boolean;
  // TODO IFeeInfoUnit
  feeInfo?: {
    price: string; // feerate
    limit: string;
  };

  commitAddress?: string;
  commitScriptPubKey?: string;
  commitScriptHex?: string;
  changeAddress?: string;
};

export type IKaspaSigner = {
  getPublicKey(): PublicKey;

  getPrivateKey(): Promise<PrivateKey>;
};
