import type { IBackgroundApi } from '@onekeyhq/kit-bg/src/apis/IBackgroundApi';
import type { IAirGapUrJson } from '@onekeyhq/qr-wallet-sdk';
import type { IServerNetwork } from '@onekeyhq/shared/types';
import type { INetworkAccount } from '@onekeyhq/shared/types/account';
import type {
  EQRCodeHandlerNames,
  EQRCodeHandlerType,
} from '@onekeyhq/shared/types/qrCode';
import type { ITokenData } from '@onekeyhq/shared/types/token';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IBaseValue {}
export interface IChainValue extends IBaseValue {
  address: string;
  amount?: string;
  network?: IServerNetwork;
  paramList?: { [key: string]: string };
  tokenAddress?: string;
}
export interface IBitcoinValue extends IChainValue {
  // Label for that address (e.g. name of receiver)
  label?: string;
  // message that describes the transaction to the user
  message?: string;
}

export interface IEthereumValue extends IChainValue {
  // Label for that address (e.g. name of receiver)
  label?: string;
  // message that describes the transaction to the user
  message?: string;

  // eip 155 compliant chain_id, used for sanity check
  id: string;
  // gas price
  gas?: number;
  // amount of gas transaction is not to exceed
  glmt?: number;
  // account nonce
  n?: number;
  // byte code data for transaction
  code?: string;
}
export interface ISolanaValue extends Omit<IChainValue, 'address'> {
  recipient?: string;
  // eslint-disable-next-line spellcheck/spell-checker
  splToken?: string;
  reference?: string[];
  label?: string;
  message?: string;
  memo?: string;
}
export type ISuiValue = IChainValue;

export interface ILightningNetworkValue extends IBaseValue {
  tag?: string;
  k1?: string;
}
export interface IWalletConnectValue extends IBaseValue {
  version: string;
  wcUri: string;
}
export interface IUrlAccountValue extends IBaseValue {
  origin: string;
  networkId: string;
  address: string;
}
export interface IMarketDetailValue extends IBaseValue {
  origin: string;
  coinGeckoId?: string;
}

export interface IMigrateValue extends IBaseValue {
  address?: string;
}

export interface IAnimationValue extends IBaseValue {
  partIndexes: number[];
  partSize: number;
  parts: string[];
  fullData?: string;
  fullUr?: IAirGapUrJson;
  progress: number;
}
export interface IUrlValue extends IBaseValue {
  url: string;
  hostname: string;
  origin: string;
  pathname: string;
  urlSchema: string;
  urlPathList: string[];
  urlParamList: { [key: string]: string };
}

export type IQRCodeHandlerResult<T extends IBaseValue> = {
  type: EQRCodeHandlerType;
  data: T;
} | null;

export type IQRCodeHandlerOptions = {
  urlResult?: IQRCodeHandlerResult<IUrlValue>;
  deeplinkResult?: IQRCodeHandlerResult<IUrlValue>;
  bitcoinUrlScheme?: string;
  backgroundApi?: IBackgroundApi;
};

export type IQRCodeHandler<T extends IBaseValue> = (
  value: string,
  options?: IQRCodeHandlerOptions,
) => Promise<IQRCodeHandlerResult<T>>;

export type IQRCodeHandlerParseResult<T extends IBaseValue> =
  IQRCodeHandlerResult<T> & { raw: string };

export type IQRCodeHandlerParseOutsideOptions = {
  handlers: EQRCodeHandlerNames[];
  defaultHandler?: (value: string) => void;
  autoHandleResult?: boolean;
  account?: INetworkAccount;
  network?: IServerNetwork;
  tokens?: ITokenData;
  qrWalletScene?: boolean;
  showProTutorial?: boolean;
};

export type IQRCodeHandlerParseOptions = IQRCodeHandlerParseOutsideOptions &
  IQRCodeHandlerOptions;

export type IQRCodeHandlerParse<T extends IBaseValue> = (
  value: string,
  options?: IQRCodeHandlerParseOptions,
) => Promise<IQRCodeHandlerParseResult<T>>;
