import type { IAdaAmount } from '@onekeyhq/core/src/chains/ada/types';
import type {
  EAddressEncodings,
  ECoreApiExportedSecretKeyType,
  ICoreApiGetAddressItem,
  ICoreApiPrivateKeysMap,
  ICoreApiSignBasePayload,
  ICoreImportedCredentialEncryptHex,
  ICurveName,
  IEncodedTx,
  ISignedTxPro,
  IUnsignedMessage,
  IUnsignedTxPro,
} from '@onekeyhq/core/src/types';
import type { ICoinSelectAlgorithm } from '@onekeyhq/core/src/utils/coinSelectUtils';
import type { IAirGapAccount } from '@onekeyhq/qr-wallet-sdk';
import type {
  ETranslations,
  ETranslationsMock,
} from '@onekeyhq/shared/src/locale';
import type { IDappSourceInfo } from '@onekeyhq/shared/types';
import type { IDBCustomRpc } from '@onekeyhq/shared/types/customRpc';
import type { IDeviceSharedCallParams } from '@onekeyhq/shared/types/device';
import type { IStakingConfig } from '@onekeyhq/shared/types/earn';
import type {
  IFeeInfoUnit,
  ISendSelectedFeeInfo,
} from '@onekeyhq/shared/types/fee';
import type {
  IAccountHistoryTx,
  IAllNetworkHistoryExtraItem,
  IOnChainHistoryTx,
  IOnChainHistoryTxNFT,
  IOnChainHistoryTxToken,
} from '@onekeyhq/shared/types/history';
import type { ILNURLPaymentInfo } from '@onekeyhq/shared/types/lightning';
import type { ENFTType } from '@onekeyhq/shared/types/nft';
import type { IStakingInfo } from '@onekeyhq/shared/types/staking';
import type {
  ESwapTabSwitchType,
  EWrappedType,
  IFetchBuildTxResult,
  IOKXTransactionObject,
  ISwapTokenBase,
  ISwapTxInfo,
} from '@onekeyhq/shared/types/swap/types';
import type { IToken } from '@onekeyhq/shared/types/token';
import type { IReplaceTxInfo } from '@onekeyhq/shared/types/tx';

import type {
  IAccountDeriveInfoMapBtc,
  IAccountDeriveTypesBtc,
} from './impls/btc/settings';
import type { IAccountDeriveInfoMapCosmos } from './impls/cosmos/settings';
import type {
  IAccountDeriveInfoMapEvm,
  IAccountDeriveTypesEvm,
} from './impls/evm/settings';
import type { IBackgroundApi } from '../apis/IBackgroundApi';
import type { EDBAccountType } from '../dbs/local/consts';
import type { IDBAccount, IDBWalletId } from '../dbs/local/types';
import type { AllNetworkAddressParams, IDeviceType } from '@onekeyfe/hd-core';
import type { HDNodeType } from '@onekeyfe/hd-transport';
import type { SignClientTypes } from '@walletconnect/types';
import type { MessageDescriptor } from 'react-intl';

export enum EVaultKeyringTypes {
  hd = 'hd',
  qr = 'qr',
  hardware = 'hardware',
  imported = 'imported',
  watching = 'watching',
  external = 'external',
}

// AccountNameInfo
export type IAccountDeriveInfoItems = {
  value: string; // IAccountDeriveTypes
  label: string;
  item: IAccountDeriveInfo;
  description: string | undefined;
  descI18n?: {
    id: ETranslations | ETranslationsMock | undefined;
    data: Record<string | number, string>;
  };
};
export interface IAccountDeriveInfo {
  // because the first account path of ledger live template is the same as the bip44 account path, so we should set idSuffix to uniq them
  idSuffix?: string; // hd-1--m/44'/60'/0'/0/0--LedgerLive
  namePrefix: string; // accountNamePrefix: EVM #1, Ledger Live #2
  // addressPrefix?: string; // use presetNetworks.extensions.providerOptions.addressPrefix instead.

  // category: string; // `44'/${COINTYPE_ETH}'`,

  template: string; // template with INDEX_PLACEHOLDER
  coinType: string;
  coinName?: string;
  addressEncoding?: EAddressEncodings;

  labelKey?: MessageDescriptor['id'];
  label?: string;

  descI18n?: {
    id: MessageDescriptor['id'];
    data: Record<string | number, string>;
  };
  desc?: string;
  subDesc?: string;

  // recommended?: boolean;
  // notRecommended?: boolean;
  enableConditions?: {
    // only available for certain networks
    networkId?: string[];
  }[];
}
export type IAccountDeriveInfoMapBase = {
  default: IAccountDeriveInfo; // default is required
};
export type IAccountDeriveInfoMap =
  | IAccountDeriveInfoMapEvm
  | IAccountDeriveInfoMapBtc
  | IAccountDeriveInfoMapCosmos;
export type IAccountDeriveTypes =
  | 'default'
  | IAccountDeriveTypesEvm
  | IAccountDeriveTypesBtc;

export type IVaultSettingsNetworkInfo = {
  addressPrefix: string;
  curve: ICurveName;
  nativeTokenAddress?: string;
};
export type IVaultSettings = {
  impl: string;
  coinTypeDefault: string;

  importedAccountEnabled: boolean;
  watchingAccountEnabled: boolean;
  externalAccountEnabled: boolean;
  hardwareAccountEnabled: boolean;
  qrAccountEnabled?: boolean;
  publicKeyExportEnabled?: boolean;

  supportExportedSecretKeys?: ECoreApiExportedSecretKeyType[];

  dappInteractionEnabled?: boolean;

  softwareAccountDisabled?: boolean;

  supportedDeviceTypes?: IDeviceType[];

  addressBookDisabled?: boolean;
  copyAddressDisabled?: boolean;

  disabledSwapAction?: boolean;
  disabledSendAction?: boolean;

  isUtxo: boolean;
  isSingleToken: boolean;
  NFTEnabled: boolean;
  nonceRequired: boolean;
  feeUTXORequired: boolean;
  editFeeEnabled: boolean;
  defaultFeePresetIndex: number;
  checkFeeDetailEnabled?: boolean;
  replaceTxEnabled: boolean;
  cancelTxEnabled?: boolean;
  speedUpCancelEnabled?: boolean;
  // Get the interval time for polling the fee API, in seconds
  estimatedFeePollingInterval: number;

  minTransferAmount?: string;
  nativeMinTransferAmount?: string;
  utxoDustAmount?: string;

  accountType: EDBAccountType;
  accountDeriveInfo: IAccountDeriveInfoMap;
  networkInfo: {
    default: IVaultSettingsNetworkInfo;
    [networkId: string]: IVaultSettingsNetworkInfo;
  };
  validationRequired?: boolean;
  hideAmountInputOnFirstEntry?: boolean;
  allowZeroFee?: boolean;

  onChainHistoryDisabled?: boolean;
  saveConfirmedTxsEnabled?: boolean;

  cannotSendToSelf?: boolean;

  /**
   * xrp destination tag
   * cosmos memo
   * https://xrpl.org/source-and-destination-tags.html
   * https://support.ledger.com/hc/en-us/articles/4409603715217-What-is-a-Memo-Tag-?support=true
   */
  withMemo?: boolean;
  memoMaxLength?: number;
  numericOnlyMemo?: boolean;

  // dnx
  withPaymentId?: boolean;

  // algo
  withNote?: boolean;
  noteMaxLength?: number;

  hideFeeInfoInHistoryList?: boolean;

  hasFrozenBalance?: boolean;

  hasResource?: boolean;
  resourceKey?: MessageDescriptor['id'];

  withL1BaseFee?: boolean;

  hideBlockExplorer?: boolean;

  ignoreUpdateNativeAmount?: boolean;

  withoutBroadcastTxId?: boolean;

  transferZeroNativeTokenEnabled?: boolean;

  gasLimitValidationEnabled?: boolean;

  showAddressType?: boolean;

  hideTxUtxoListWhenPending?: boolean;

  maxSendFeeUpRatio?: {
    [networkId: string]: number;
  };

  maxSendCanNotSentFullAmount?: boolean;

  preCheckDappTxFeeInfoRequired?: boolean;

  activateTokenRequired?: boolean;
  customRpcEnabled?: boolean;
  mergeDeriveAssetsEnabled?: boolean;
  sendZeroWithZeroTokenBalanceDisabled?: boolean;

  stakingConfig?: IStakingConfig;
  stakingResultPollingInterval?: number;

  editApproveAmountEnabled?: boolean;
  useRemoteTxId?: boolean;
  isNativeTokenContractAddressEmpty?: boolean;

  canEditNonce?: boolean;
  canEditData?: boolean;

  withTxMessage?: boolean;

  fixConfirmedTxEnabled?: boolean;

  supportBatchEstimateFee?: Record<string, boolean>;

  afterSendTxActionEnabled?: boolean;

  createAllDeriveTypeAccountsByDefault?: boolean;
};

export type IVaultFactoryOptions = {
  networkId: string;
  accountId: string;
  walletId?: IDBWalletId;
  isChainOnly?: boolean;
  isWalletOnly?: boolean;
};
export type IVaultOptions = IVaultFactoryOptions & {
  backgroundApi: IBackgroundApi;
};

// PrepareAccounts ----------------------------------------------
export type IGetDefaultPrivateKeyParams = ICoreApiSignBasePayload;
export type IGetDefaultPrivateKeyResult = {
  privateKeyRaw: string; // encrypted privateKey hex of default full path
};
export type IGetPrivateKeysParams = {
  password: string;
  relPaths?: string[] | undefined;
};
export type IGetPrivateKeysResult = ICoreApiPrivateKeysMap;
export type IPrepareExternalAccountsParams = {
  name: string;
  networks?: string[];
  wcTopic?: string;
  wcPeerMeta?: SignClientTypes.Metadata;
};
export type IPrepareWatchingAccountsParams = {
  // target: string; // address, xpub TODO remove
  address: string;
  networks?: string[]; // onlyAvailableOnCertainNetworks
  createAtNetwork: string;
  pub?: string;
  xpub?: string;
  name: string;
  template?: string; // TODO use deriveInfo, for BTC taproot address importing
  deriveInfo?: IAccountDeriveInfo;
  isUrlAccount?: boolean;
  addresses?: Record<string, string>;
};
export type IPrepareImportedAccountsParams = {
  password: string;
  importedCredential: ICoreImportedCredentialEncryptHex;
  networks?: string[]; // onlyAvailableOnCertainNetworks
  createAtNetwork: string;
  name: string;
  template?: string; // TODO use deriveInfo
  deriveInfo?: IAccountDeriveInfo;
};
export type IPrepareHdAccountsParamsBase = {
  indexes: Array<number>;
  names?: Array<string>; // custom names
  deriveInfo: IAccountDeriveInfo;
  skipCheckAccountExist?: boolean; // BTC required
  isVerifyAddressAction?: boolean;
};
export type IPrepareHdAccountsParams = IPrepareHdAccountsParamsBase & {
  password: string;
};
export type IPrepareQrAccountsParams = IPrepareHdAccountsParamsBase & {
  // isVerifyAddress?: boolean;
};
export type IPrepareHdAccountsOptions = {
  checkIsAccountUsed?: (query: {
    xpub: string;
    xpubSegwit?: string;
    address: string;
  }) => Promise<{ isUsed: boolean }>;
  buildAddressesInfo: (payload: {
    usedIndexes: number[];
  }) => Promise<ICoreApiGetAddressItem[]>;
};
export type IPrepareHardwareAccountsParams = IPrepareHdAccountsParamsBase & {
  deviceParams: IDeviceSharedCallParams;
  hwAllNetworkPrepareAccountsResponse?: IHwAllNetworkPrepareAccountsResponse;
};
export type IPrepareAccountsParams =
  | IPrepareWatchingAccountsParams
  | IPrepareImportedAccountsParams
  | IPrepareHdAccountsParams
  | IPrepareHardwareAccountsParams
  | IPrepareQrAccountsParams
  | IPrepareExternalAccountsParams;

// PrepareAccountByAddressIndex
export type IPrepareAccountByAddressIndexParams = {
  password: string;
  template: string;
  accountIndex: number;
  addressIndex: number;
};

export type IExportAccountSecretKeysParams = {
  password: string;
  keyType: ECoreApiExportedSecretKeyType;
  relPaths?: string[]; // used for get privateKey of other utxo address
};

export type IBuildHwAllNetworkPrepareAccountsParams = {
  path: string; // full path
  template: string;
  index: number;
};

export type IBuildPrepareAccountsPrefixedPathParams = {
  template: string;
  index: number;
};

export type INormalizeGetMultiAccountsPathParams = {
  path: string;
};

export type IHwSdkNetwork = AllNetworkAddressParams['network'];

type IHwAllNetworkPrepareAccountsItemErrorPayload = {
  error: string;
  code: number;
  errorCode: string | number; // TODO use code instead
  connectId: string;
  deviceId: string;
};

type IHwAllNetworkPrepareAccountsItemCommon = {
  path: string;
  network: IHwSdkNetwork;
  chainName?: string;
  prefix?: string;
};
export type IHwAllNetworkPrepareAccountsItem =
  IHwAllNetworkPrepareAccountsItemCommon & {
    success: true;

    payload?: IHwAllNetworkPrepareAccountsItemErrorPayload & {
      address?: string;

      pub?: string;
      publicKey?: string; // cosmos, sui, aptos 缺
      publickey?: string; // nostr

      npub?: string; // nostr

      xpub?: string;
      xpubSegwit?: string;

      node?: HDNodeType; // btc

      serializedPath?: string; // ada
      stakeAddress?: string; // ada

      derivedPath?: string; // alph
    };
  };

export type IHwAllNetworkPrepareAccountsResponse =
  IHwAllNetworkPrepareAccountsItem[];

export type IExportAccountSecretKeysResult = string;
// GetAddress ----------------------------------------------
export type IHardwareGetAddressParams = {
  path: string;
  showOnOneKey: boolean;
  /**
   * for btc like chain, when isTemplatePath is true, param path is whole path
   * e.g., isTemplatePath = false, then the path is m/44'/0'/0'
   *       isTemplatePath = true, then the path is m/44'/0'/0'/0/0
   */
  isTemplatePath?: boolean;
};

export type IGetAddressParams = IHardwareGetAddressParams;

export type IBuildAccountAddressDetailParams = {
  networkId: string;
  networkInfo: IVaultSettingsNetworkInfo;
  account: IDBAccount;
  externalAccountAddress?: string;
};

// Internal txInfo ----------------------------------------------
export type ITransferInfo = {
  from: string;
  to: string;
  amount: string;

  tokenInfo?: IToken;

  nftInfo?: {
    nftId: string;
    nftType: ENFTType;
    nftAddress: string;
  };

  useCustomAddressesBalance?: boolean;
  opReturn?: string;
  coinSelectAlgorithm?: ICoinSelectAlgorithm;
  memo?: string; // Ripple chain destination tag, Cosmos chain memo
  keepAlive?: boolean; // Polkadot chain keep alive

  // Lightning network
  lnurlPaymentInfo?: ILNURLPaymentInfo;
  lightningAddress?: string;

  paymentId?: string; // Dynex chain paymentId

  note?: string; // Algo chain note

  hexData?: string; // evm tx hex data
};

export type IApproveInfo = {
  owner: string;
  spender: string;
  amount: string;
  isMax?: boolean;
  tokenInfo?: IToken;
  swapApproveRes?: IFetchBuildTxResult;
};

export type ITransferPayload = {
  amountToSend: string;
  isMaxSend: boolean;
  isNFT: boolean;
  originalRecipient: string;
  isToContract?: boolean;
  memo?: string;
  paymentId?: string;
  note?: string;
  tokenInfo?: IToken;
};

export type IWrappedInfo = {
  from: string;
  amount: string;
  contract: string;
  type: EWrappedType;
};

export type IUtxoInfo = {
  txid: string;
  vout: number;
  value: string;
  height: number;
  confirmations: number;
  address: string;
  path: string;
  // Use for Cardano UTXO info
  txIndex?: number;
  amount?: IAdaAmount[];
  datumHash?: string | null;
  referenceScriptHash?: string | null;
  scriptPublicKey?: {
    scriptPublicKey: string;
    version: number;
  };
  // Use for Dynex UTXO info
  globalIndex: number;
  prevOutPubkey: string;
  txPubkey: string;
};

export type INativeAmountInfo = {
  amount?: string;
  maxSendAmount?: string;
};

// Send ------------
export interface IBuildEncodedTxParams {
  transfersInfo?: ITransferInfo[];
  approveInfo?: IApproveInfo;
  wrappedInfo?: IWrappedInfo;
  specifiedFeeRate?: string;
}
export interface IBuildDecodedTxParams {
  unsignedTx: IUnsignedTxPro;
  feeInfo?: ISendSelectedFeeInfo;
  transferPayload?: ITransferPayload;
  saveToLocalHistory?: boolean;
  isToContract?: boolean;
}
export interface IBuildUnsignedTxParams {
  unsignedTx?: IUnsignedTxPro;
  encodedTx?: IEncodedTx;
  transfersInfo?: ITransferInfo[];
  approveInfo?: IApproveInfo;
  wrappedInfo?: IWrappedInfo;
  swapInfo?: ISwapTxInfo;
  stakingInfo?: IStakingInfo;
  specifiedFeeRate?: string;
  prevNonce?: number;
  feeInfo?: IFeeInfoUnit;
  transferPayload?: ITransferPayload;
  isInternalSwap?: boolean;
  isInternalTransfer?: boolean;
}

export type ITokenApproveInfo = { allowance: string; isUnlimited: boolean };
export interface IUpdateUnsignedTxParams {
  unsignedTx: IUnsignedTxPro;
  feeInfo?: IFeeInfoUnit;
  feeInfoEditable?: boolean;
  nonceInfo?: { nonce: number };
  tokenApproveInfo?: ITokenApproveInfo;
  nativeAmountInfo?: INativeAmountInfo;
  dataInfo?: { data: string };
}
export interface IBroadcastTransactionParams {
  accountId: string;
  networkId: string;
  accountAddress: string;
  signedTx: ISignedTxPro;
  signature?: string;
  rawTxType?: 'json' | 'hex';
}

export interface IBroadcastTransactionByCustomRpcParams
  extends IBroadcastTransactionParams {
  customRpcInfo: IDBCustomRpc;
}

export interface IPreCheckFeeInfoParams {
  encodedTx: IEncodedTx;
  feeTokenSymbol: string;
  feeAmount: string;
  networkId: string;
  accountAddress: string;
}

export interface ISignTransactionParamsBase {
  unsignedTx: IUnsignedTxPro;
  // TODO rename externalSignOnly
  signOnly: boolean; // external account use this field to indicate sign only or sign and send
  rawTxType?: 'json' | 'hex';
}

export type ISignAndSendTransactionParams = ISignTransactionParams;
export type ISignTransactionParams = ISignTransactionParamsBase & {
  password: string;
  deviceParams: IDeviceSharedCallParams | undefined;
};

export interface IBatchSignTransactionParamsBase {
  unsignedTxs: IUnsignedTxPro[];
  feeInfos?: ISendSelectedFeeInfo[];
  nativeAmountInfo?: INativeAmountInfo;
  signOnly?: boolean;
  sourceInfo?: IDappSourceInfo;
  replaceTxInfo?: IReplaceTxInfo;
  transferPayload: ITransferPayload | undefined;
  successfullySentTxs?: string[];
}

export interface ISignMessageParams {
  messages: IUnsignedMessage[];
  password: string;
  deviceParams: IDeviceSharedCallParams | undefined;
}

export interface IBuildHistoryTxParams {
  accountId: string;
  networkId: string;
  accountAddress: string;
  xpub?: string;
  onChainHistoryTx: IOnChainHistoryTx;
  tokens: Record<string, IOnChainHistoryTxToken>;
  nfts: Record<string, IOnChainHistoryTxNFT>;
  localHistoryPendingTxs?: IAccountHistoryTx[];
  index?: number;
  allNetworkHistoryExtraItems?: IAllNetworkHistoryExtraItem[];
  dbAccountCache?: {
    [accountId: string]: IDBAccount;
  };
}

export type IGetPrivateKeyFromImportedParams = {
  input: string;
};
export type IGetPrivateKeyFromImportedResult = {
  privateKey: string;
};
export type IValidateGeneralInputParams = {
  input: string;
  validateAddress?: boolean;
  validateXpub?: boolean;
  validateXprvt?: boolean;
  validatePrivateKey?: boolean;
};

export type IGetChildPathTemplatesParams = {
  airGapAccount: IAirGapAccount;
  index: number;
};

export type IGetChildPathTemplatesResult = {
  childPathTemplates: string[];
};

export type IQrWalletGetVerifyAddressChainParamsQuery = {
  fullPath: string;
};

export type IQrWalletGetVerifyAddressChainParamsResult = {
  scriptType?: string; // BTC only
  chainId?: string; // EVM only
};

export type IBuildOkxSwapEncodedTxParams = {
  okxTx: IOKXTransactionObject;
  fromTokenInfo: ISwapTokenBase;
  type: ESwapTabSwitchType;
};
