import BigNumber from 'bignumber.js';
import { Psbt } from 'bitcoinjs-lib';
import { cloneDeep, isEmpty, isNil, uniq } from 'lodash';

import {
  convertBtcXprvtToHex,
  getBtcForkNetwork,
  getBtcXpubFromXprvt,
  getBtcXpubSupportedAddressEncodings,
  getInputsToSignFromPsbt,
  validateBtcAddress,
} from '@onekeyhq/core/src/chains/btc/sdkBtc';
import {
  decodedPsbt as decodedPsbtFN,
  formatPsbtHex,
  toPsbtNetwork,
} from '@onekeyhq/core/src/chains/btc/sdkBtc/providerUtils';
import {
  EOutputsTypeForCoinSelect,
  type IBtcInput,
  type ICoinSelectUTXO,
  type IEncodedTxBtc,
  type IOutputsForCoinSelect,
} from '@onekeyhq/core/src/chains/btc/types';
import coreChainApi from '@onekeyhq/core/src/instance/coreChainApi';
import {
  decodeSensitiveTextAsync,
  encodeSensitiveTextAsync,
} from '@onekeyhq/core/src/secret';
import type {
  ICoreApiSignAccount,
  ICoreApiSignBtcExtraInfo,
  ISignedTxPro,
  ITxInput,
  ITxInputToSign,
  IUnsignedMessage,
  IUnsignedTxPro,
} from '@onekeyhq/core/src/types';
import { EAddressEncodings } from '@onekeyhq/core/src/types';
import { estimateTxSize, getBIP44Path } from '@onekeyhq/core/src/utils';
import {
  coinSelectWithWitness,
  getCoinSelectTxType,
} from '@onekeyhq/core/src/utils/coinSelectUtils';
import { BTC_TX_PLACEHOLDER_VSIZE } from '@onekeyhq/shared/src/consts/chainConsts';
import {
  InsufficientBalance,
  OneKeyInternalError,
} from '@onekeyhq/shared/src/errors';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { appLocale } from '@onekeyhq/shared/src/locale/appLocale';
import { checkIsDefined } from '@onekeyhq/shared/src/utils/assertUtils';
import { memoizee } from '@onekeyhq/shared/src/utils/cacheUtils';
import timerUtils from '@onekeyhq/shared/src/utils/timerUtils';
import type { INetworkAccount } from '@onekeyhq/shared/types/account';
import type {
  IGeneralInputValidation,
  INetworkAccountAddressDetail,
  IPrivateKeyValidation,
  IXprvtValidation,
  IXpubValidation,
} from '@onekeyhq/shared/types/address';
import type {
  IMeasureRpcStatusParams,
  IMeasureRpcStatusResult,
} from '@onekeyhq/shared/types/customRpc';
import type { IFeeInfoUnit } from '@onekeyhq/shared/types/fee';
import type { IAccountHistoryTx } from '@onekeyhq/shared/types/history';
import type { IStakeTxBtcBabylon } from '@onekeyhq/shared/types/staking';
import type { IDecodedTx, IDecodedTxAction } from '@onekeyhq/shared/types/tx';
import {
  EBtcF2poolReplaceState,
  EDecodedTxActionType,
  EDecodedTxStatus,
  EReplaceTxMethod,
  EReplaceTxType,
} from '@onekeyhq/shared/types/tx';

import { VaultBase } from '../../base/VaultBase';

import { KeyringHardware } from './KeyringHardware';
import { KeyringHd } from './KeyringHd';
import { KeyringImported } from './KeyringImported';
import { KeyringQr } from './KeyringQr';
import { KeyringWatching } from './KeyringWatching';
import { ClientBtc } from './sdkBtc/ClientBtc';

import type {
  IDBAccount,
  IDBUtxoAccount,
  IDBWalletType,
} from '../../../dbs/local/types';
import type { KeyringBase } from '../../base/KeyringBase';
import type {
  IBroadcastTransactionByCustomRpcParams,
  IBuildAccountAddressDetailParams,
  IBuildDecodedTxParams,
  IBuildEncodedTxParams,
  IBuildUnsignedTxParams,
  ITransferInfo,
  IValidateGeneralInputParams,
} from '../../types';

// btc vault
export default class VaultBtc extends VaultBase {
  override coreApi = coreChainApi.btc.hd;

  override async buildAccountAddressDetail(
    params: IBuildAccountAddressDetailParams,
  ): Promise<INetworkAccountAddressDetail> {
    const { account, networkId } = params;
    // btc and tbtc use different cointype, so they do not share same db account, just use db account address only
    const { address } = account;
    // const { normalizedAddress, displayAddress } = await this.validateAddress(
    //   account.address,
    // );
    return {
      networkId,
      normalizedAddress: address,
      displayAddress: address,
      address,
      baseAddress: address,
      isValid: true,
      allowEmptyAddress: false,
    };
  }

  override async buildDecodedTx(
    params: IBuildDecodedTxParams,
  ): Promise<IDecodedTx> {
    const { unsignedTx } = params;
    const encodedTx = unsignedTx.encodedTx as IEncodedTxBtc;
    const { swapInfo, stakingInfo } = unsignedTx;
    const { inputs, outputs, inputsToSign, psbtHex } = encodedTx;

    if (psbtHex && Array.isArray(inputsToSign)) {
      const decodedPsbt = await this.buildDecodedPsbtTx(params);
      const decodedPsbtAction = decodedPsbt.actions[0];
      if (stakingInfo) {
        const accountAddress = await this.getAccountAddress();
        const { send } = stakingInfo;
        const action = await this.buildInternalStakingAction({
          accountAddress,
          stakingInfo,
          stakingToAddress: decodedPsbtAction.assetTransfer?.to,
        });

        let sendNativeTokenAmountBN = new BigNumber(0);
        let sendNativeTokenAmountValueBN = new BigNumber(0);

        if (send && send.token.isNative) {
          sendNativeTokenAmountBN = new BigNumber(send.amount);
          sendNativeTokenAmountValueBN = sendNativeTokenAmountBN.shiftedBy(
            send.token.decimals,
          );
          decodedPsbt.nativeAmount = sendNativeTokenAmountBN.toFixed();
          decodedPsbt.nativeAmountValue =
            sendNativeTokenAmountValueBN.toFixed();
        }

        if (action.assetTransfer) {
          action.assetTransfer.utxoFrom =
            decodedPsbtAction.assetTransfer?.utxoFrom;
          action.assetTransfer.utxoTo = decodedPsbtAction.assetTransfer?.utxoTo;
        }
        decodedPsbt.actions = [action];
      }

      return decodedPsbt;
    }

    const network = await this.getNetwork();
    const account = await this.getAccount();
    const nativeToken = await this.backgroundApi.serviceToken.getToken({
      accountId: this.accountId,
      networkId: this.networkId,
      tokenIdOnNetwork: '',
    });

    const utxoFrom = inputs.map((input) => ({
      address: input.address,
      balance: new BigNumber(input.value)
        .shiftedBy(-network.decimals)
        .toFixed(),
      balanceValue: input.value,
      symbol: network.symbol,
      isMine: true,
    }));

    const originalUtxoTo = outputs.map((output) => ({
      address: output.address,
      balance: new BigNumber(output.value)
        .shiftedBy(-network.decimals)
        .toFixed(),
      balanceValue: output.value,
      symbol: network.symbol,
      isMine: output.address === account.address,
    }));

    const utxoTo =
      outputs.length > 1
        ? outputs
            .filter((output) => !output.payload?.isChange && output.address)
            .map((output) => ({
              address: output.address,
              balance: new BigNumber(output.value)
                .shiftedBy(-network.decimals)
                .toFixed(),
              balanceValue: output.value,
              symbol: network.symbol,
              isMine: output.address === account.address,
            }))
        : outputs.map((output) => ({
            address: output.address,
            balance: new BigNumber(output.value)
              .shiftedBy(-network.decimals)
              .toFixed(),
            balanceValue: output.value,
            symbol: network.symbol,
            isMine: output.address === account.address,
          }));

    let sendNativeTokenAmountBN = new BigNumber(0);
    let sendNativeTokenAmountValueBN = new BigNumber(0);

    let actions: IDecodedTxAction[] = [
      {
        type: EDecodedTxActionType.UNKNOWN,
        unknownAction: {
          from: account.address,
          to: utxoTo[0].address,
        },
      },
    ];

    if (swapInfo) {
      const swapSendToken = swapInfo.sender.token;
      const swapReceiveToken = swapInfo.receiver.token;
      const providerInfo = swapInfo.swapBuildResData.result.info;
      const action = await this.buildTxTransferAssetAction({
        from: swapInfo.accountAddress,
        to: utxoTo[0].address,
        application: {
          name: providerInfo.providerName,
          icon: providerInfo.providerLogo ?? '',
        },
        transfers: [
          {
            from: swapInfo.accountAddress,
            to: '',
            tokenIdOnNetwork: swapSendToken.contractAddress,
            icon: swapSendToken.logoURI ?? '',
            name: swapSendToken.name ?? '',
            symbol: swapSendToken.symbol,
            amount: swapInfo.sender.amount,
            isNFT: false,
            isNative: swapSendToken.isNative,
            networkId: swapInfo.sender.accountInfo.networkId,
          },
          {
            from: '',
            to: swapInfo.receivingAddress,
            tokenIdOnNetwork: swapReceiveToken.contractAddress,
            icon: swapReceiveToken.logoURI ?? '',
            name: swapReceiveToken.name ?? '',
            symbol: swapReceiveToken.symbol,
            amount: swapInfo.receiver.amount,
            isNFT: false,
            isNative: swapReceiveToken.isNative,
            networkId: swapInfo.receiver.accountInfo.networkId,
          },
        ],
        isInternalSwap: true,
        swapReceivedAddress: swapInfo.receivingAddress,
        swapReceivedNetworkId: swapInfo.receiver.token.networkId,
      });
      if (swapSendToken.isNative) {
        sendNativeTokenAmountBN = new BigNumber(swapInfo.sender.amount);
        sendNativeTokenAmountValueBN = sendNativeTokenAmountBN.shiftedBy(
          swapSendToken.decimals,
        );
      }
      if (action.assetTransfer) {
        action.assetTransfer.utxoFrom = utxoFrom;
        action.assetTransfer.utxoTo = originalUtxoTo;
      }
      actions = [action];
    } else if (stakingInfo) {
      const accountAddress = await this.getAccountAddress();
      const { send } = stakingInfo;
      const action = await this.buildInternalStakingAction({
        accountAddress,
        stakingInfo,
        stakingToAddress: utxoTo[0].address,
      });
      if (send && send.token.isNative) {
        sendNativeTokenAmountBN = new BigNumber(send.amount);
        sendNativeTokenAmountValueBN = sendNativeTokenAmountBN.shiftedBy(
          send.token.decimals,
        );
      }
      if (action.assetTransfer) {
        action.assetTransfer.utxoFrom = utxoFrom;
        action.assetTransfer.utxoTo = originalUtxoTo;
      }
      actions = [action];
    } else if (nativeToken) {
      actions = [
        {
          type: EDecodedTxActionType.ASSET_TRANSFER,
          assetTransfer: {
            from: account.address,
            to: utxoTo[0].address,
            sends: utxoTo.map((utxo) => {
              sendNativeTokenAmountBN = sendNativeTokenAmountBN.plus(
                utxo.balance,
              );
              sendNativeTokenAmountValueBN = sendNativeTokenAmountValueBN.plus(
                utxo.balanceValue,
              );
              return {
                from: account.address,
                to: utxo.address,
                isNative: true,
                tokenIdOnNetwork: '',
                name: nativeToken.name,
                icon: nativeToken.logoURI ?? '',
                amount: utxo.balance,
                amountValue: utxo.balanceValue,
                symbol: network.symbol,
              };
            }),
            receives: [],
            utxoFrom,
            utxoTo: originalUtxoTo,
          },
        },
      ];
    }

    const totalFeeInNative = new BigNumber(encodedTx.fee)
      .shiftedBy(-1 * network.feeMeta.decimals)
      .toFixed();

    return {
      txid: '',
      owner: account.address,
      signer: account.address,
      nonce: 0,
      actions,
      status: EDecodedTxStatus.Pending,
      networkId: this.networkId,
      accountId: this.accountId,
      xpub: (account as IDBUtxoAccount).xpub,
      extraInfo: null,
      encodedTx,
      totalFeeInNative,
      nativeAmount: sendNativeTokenAmountBN.toFixed(),
      nativeAmountValue: sendNativeTokenAmountValueBN.toFixed(),
    };
  }

  async buildDecodedPsbtTx(params: IBuildDecodedTxParams): Promise<IDecodedTx> {
    const { unsignedTx } = params;
    const encodedTx = unsignedTx.encodedTx as IEncodedTxBtc;
    const { inputs, outputs, inputsToSign } = encodedTx;

    if (
      !inputsToSign ||
      (Array.isArray(inputsToSign) && !inputsToSign.length)
    ) {
      throw new OneKeyInternalError('inputsToSign is empty');
    }

    const network = await this.getNetwork();
    const account = await this.getAccount();
    const nativeToken = await this.backgroundApi.serviceToken.getToken({
      accountId: this.accountId,
      networkId: this.networkId,
      tokenIdOnNetwork: '',
    });

    if (!nativeToken) {
      throw new OneKeyInternalError('Native token not found');
    }

    const { allUtxoList } = await this._collectUTXOsInfoByApi();

    const utxoFrom: {
      address: string;
      balance: string;
      balanceValue: string;
      symbol: string;
      isMine: boolean;
    }[] = [];

    inputsToSign.forEach((inputToSign) => {
      const index = inputToSign.index;
      const input = inputs[index];
      const existUtxo = allUtxoList?.find(
        (i) => i.txid === input.txid && i.vout === input.vout,
      );
      if (existUtxo) {
        utxoFrom.push({
          address: input.address,
          balance: new BigNumber(input.value)
            .shiftedBy(-network.decimals)
            .toFixed(),
          balanceValue: input.value,
          symbol: network.symbol,
          isMine: true,
        });
      }
    });

    const originalUtxoTo = outputs.map((output) => ({
      address: output.address,
      balance: new BigNumber(output.value)
        .shiftedBy(-network.decimals)
        .toFixed(),
      balanceValue: output.value,
      symbol: network.symbol,
      isMine: output.address === account.address,
    }));

    const utxoTo =
      outputs.length > 1
        ? (() => {
            // filter non-change and non-inscription structure outputs first
            const nonChangeAndInscriptionStructureOutputs = outputs.filter(
              (output) =>
                !output.payload?.isChange &&
                output.address &&
                !output.payload?.isInscriptionStructure,
            );
            // if filtered outputs is empty, return original outputs
            return (
              nonChangeAndInscriptionStructureOutputs.length
                ? nonChangeAndInscriptionStructureOutputs
                : outputs
            ).map((output) => ({
              address: output.address,
              balance: new BigNumber(output.value)
                .shiftedBy(-network.decimals)
                .toFixed(),
              balanceValue: output.value,
              symbol: network.symbol,
              isMine: output.address === account.address,
            }));
          })()
        : outputs.map((output) => ({
            address: output.address,
            balance: new BigNumber(output.value)
              .shiftedBy(-network.decimals)
              .toFixed(),
            balanceValue: output.value,
            symbol: network.symbol,
            isMine: output.address === account.address,
          }));

    let sendNativeTokenAmountBN = new BigNumber(0);
    let sendNativeTokenAmountValueBN = new BigNumber(0);
    const actions: IDecodedTxAction[] = [
      {
        type: EDecodedTxActionType.ASSET_TRANSFER,
        assetTransfer: {
          from: utxoFrom.length ? utxoFrom[0].address : inputs[0].address,
          to: utxoTo[0].address,
          sends: utxoTo.map((utxo) => ({
            from: account.address,
            to: utxo.address,
            isNative: true,
            tokenIdOnNetwork: '',
            name: nativeToken.name,
            icon: nativeToken.logoURI ?? '',
            amount: utxo.balance,
            amountValue: utxo.balanceValue,
            symbol: network.symbol,
          })),
          receives: [],
          utxoFrom,
          utxoTo: originalUtxoTo,
        },
      },
    ];
    const shouldCalculateNativeTokenAmount = utxoFrom.length >= 1;
    utxoTo.forEach((utxo) => {
      if (!utxo.isMine && shouldCalculateNativeTokenAmount) {
        sendNativeTokenAmountBN = sendNativeTokenAmountBN.plus(utxo.balance);
        sendNativeTokenAmountValueBN = sendNativeTokenAmountValueBN.plus(
          utxo.balanceValue,
        );
      }
    });

    const totalFeeInNative = new BigNumber(encodedTx.fee)
      .shiftedBy(-1 * network.feeMeta.decimals)
      .toFixed();

    return {
      txid: '',
      owner: account.address,
      signer: account.address,
      nonce: 0,
      actions,
      status: EDecodedTxStatus.Pending,
      networkId: this.networkId,
      accountId: this.accountId,
      xpub: (account as IDBUtxoAccount).xpub,
      extraInfo: null,
      encodedTx,
      totalFeeInNative,
      nativeAmount: sendNativeTokenAmountBN.toFixed(),
      nativeAmountValue: sendNativeTokenAmountValueBN.toFixed(),
      isPsbt: true,
    };
  }

  override async buildEncodedTx(
    params: IBuildEncodedTxParams,
  ): Promise<IEncodedTxBtc> {
    const { transfersInfo, specifiedFeeRate } = params;

    if (!transfersInfo || isEmpty(transfersInfo)) {
      throw new OneKeyInternalError('transfersInfo is required');
    }

    return this._buildEncodedTxFromTransfer({
      transfersInfo,
      specifiedFeeRate,
    });
  }

  override async buildUnsignedTx(
    params: IBuildUnsignedTxParams,
  ): Promise<IUnsignedTxPro> {
    const encodedTx =
      (params.encodedTx as IEncodedTxBtc) ??
      (await this.buildEncodedTx(params));

    if (encodedTx) {
      return this._buildUnsignedTxFromEncodedTx({
        encodedTx,
        transfersInfo: params.transfersInfo ?? [],
      });
    }
    throw new OneKeyInternalError();
  }

  override async updateUnsignedTx(options: {
    unsignedTx: IUnsignedTxPro;
    feeInfo?: IFeeInfoUnit | undefined;
  }): Promise<IUnsignedTxPro> {
    const { unsignedTx, feeInfo } = options;
    let encodedTxNew = unsignedTx.encodedTx as IEncodedTxBtc;
    const { psbtHex, inputsToSign } = encodedTxNew;
    const isPsbtTx = psbtHex && inputsToSign;
    if (feeInfo && !isPsbtTx) {
      if (!unsignedTx.transfersInfo || isEmpty(unsignedTx.transfersInfo)) {
        throw new OneKeyInternalError('transfersInfo is required');
      }

      encodedTxNew = await this._attachFeeInfoToEncodedTx({
        encodedTx: unsignedTx.encodedTx as IEncodedTxBtc,
        transfersInfo: unsignedTx.transfersInfo,
        feeInfo,
      });
    }

    unsignedTx.encodedTx = encodedTxNew;

    return Promise.resolve(unsignedTx);
  }

  async _attachFeeInfoToEncodedTx({
    encodedTx,
    feeInfo,
    transfersInfo,
  }: {
    encodedTx: IEncodedTxBtc;
    feeInfo: IFeeInfoUnit;
    transfersInfo: ITransferInfo[];
  }) {
    const network = await this.getNetwork();

    if (feeInfo.feeUTXO?.feeRate) {
      const feeRate = new BigNumber(feeInfo.feeUTXO.feeRate)
        .shiftedBy(-network.feeMeta.decimals)
        .toFixed();

      if (typeof feeRate === 'string') {
        return this._buildEncodedTxFromTransfer({
          transfersInfo,
          specifiedFeeRate: feeRate,
        });
      }
    }

    return Promise.resolve(encodedTx);
  }

  async getBtcForkNetwork() {
    return getBtcForkNetwork(
      (await this.getCoreApiNetworkInfo()).networkChainCode,
    );
  }

  override validatePrivateKey(): Promise<IPrivateKeyValidation> {
    return Promise.resolve({
      isValid: false, // BTC does not support private key, current support xprvt only
    });
  }

  override async validateXpub(xpub: string): Promise<IXpubValidation> {
    const btcForkNetwork = await this.getBtcForkNetwork();
    return Promise.resolve(this.coreApi.validateXpub({ xpub, btcForkNetwork }));
  }

  override async validateXprvt(xprvt: string): Promise<IXprvtValidation> {
    const btcForkNetwork = await this.getBtcForkNetwork();
    return Promise.resolve(
      this.coreApi.validateXprvt({ xprvt, btcForkNetwork }),
    );
  }

  override async validateAddress(address: string) {
    return validateBtcAddress({
      address,
      network: await this.getBtcForkNetwork(),
    });
  }

  override async validateGeneralInput(
    params: IValidateGeneralInputParams,
  ): Promise<IGeneralInputValidation> {
    const { result, inputDecoded: input } = await this.baseValidateGeneralInput(
      params,
    );

    if (result.addressResult?.isValid && result.addressResult?.encoding) {
      const settings = await this.getVaultSettings();
      const items = Object.values(settings.accountDeriveInfo);
      result.deriveInfoItems = items.filter(
        (item) =>
          item.addressEncoding &&
          result.addressResult?.encoding === item.addressEncoding,
      );
    } else {
      // build deriveItems
      let xpub = '';
      if (result.xpubResult?.isValid) {
        // xpub from input
        xpub = input;
      }
      const network = await this.getBtcForkNetwork();
      if (!xpub && result.xprvtResult?.isValid) {
        // xpub from xprvt(input)
        ({ xpub } = getBtcXpubFromXprvt({
          network,
          privateKeyRaw: convertBtcXprvtToHex({ xprvt: input }),
        }));
      }
      if (xpub) {
        // encoding list from xpub
        const { supportEncodings } = getBtcXpubSupportedAddressEncodings({
          xpub,
          network,
        });

        if (supportEncodings && supportEncodings.length) {
          const settings = await this.getVaultSettings();
          const items = Object.values(settings.accountDeriveInfo);
          result.deriveInfoItems = items.filter(
            (item) =>
              item.addressEncoding &&
              supportEncodings.includes(item.addressEncoding),
          );
        }
      }
    }

    return result;
  }

  private parseAddressEncodings(
    addresses: string[],
  ): Promise<Array<EAddressEncodings | undefined>> {
    return Promise.all(
      addresses.map((address) => this.validateAddress(address)),
    ).then((results) => results.map((i) => i.encoding));
  }

  private async getCoinSelectTxType(address: string) {
    const encoding = (await this.parseAddressEncodings([address]))[0];
    if (encoding) {
      return getCoinSelectTxType(encoding);
    }
    throw new Error('getCoinSelectTxType ERROR: Invalid encoding');
  }

  override keyringMap: Record<IDBWalletType, typeof KeyringBase | undefined> = {
    hd: KeyringHd,
    qr: KeyringQr,
    hw: KeyringHardware,
    imported: KeyringImported,
    watching: KeyringWatching,
    external: KeyringWatching,
  };

  async _buildEncodedTxFromTransfer(params: {
    transfersInfo: ITransferInfo[];
    specifiedFeeRate?: string;
  }): Promise<IEncodedTxBtc> {
    const { transfersInfo } = params;
    if (transfersInfo.length === 1) {
      const transferInfo = transfersInfo[0];
      if (!transferInfo.to) {
        throw new Error('buildEncodedTx ERROR: transferInfo.to is missing');
      }
    }
    return this._buildEncodedTxFromBatchTransfer(params);
  }

  async _buildEncodedTxFromBatchTransfer(params: {
    transfersInfo: ITransferInfo[];
    specifiedFeeRate?: string;
  }): Promise<IEncodedTxBtc> {
    const { transfersInfo } = params;
    const transferInfo = transfersInfo[0];
    const account = (await this.getAccount()) as IDBUtxoAccount;
    const {
      inputs,
      outputs,
      fee,
      txSize,
      inputsForCoinSelect,
      outputsForCoinSelect,
    } = await this._buildTransferParamsWithCoinSelector(params);

    if (!inputs || !outputs || isNil(fee)) {
      const insufficientBalance = appLocale.intl.formatMessage({
        id: ETranslations.earn_insufficient_balance,
      });
      const description = appLocale.intl.formatMessage({
        id: ETranslations.send_toast_btc_fork_insufficient_fund,
      });
      throw new InsufficientBalance({
        message: `${insufficientBalance} ${description}`,
      });
    }

    return {
      inputs: inputs.map(({ txid, amount, ...keep }) => ({
        address: account.address,
        path: '',
        ...keep,
        txid,
        value: amount,
      })),
      outputs: outputs.map(({ type, amount, address, path, script }) => {
        const valueText = amount;

        // OP_RETURN output
        if (
          type === 'opreturn' &&
          valueText &&
          new BigNumber(valueText).eq(0) &&
          !address &&
          script === transferInfo.opReturn
        ) {
          return {
            address: '',
            value: valueText,
            payload: {
              opReturn: transferInfo.opReturn,
            },
          };
        }

        if (!valueText || new BigNumber(valueText).lte(0)) {
          throw new Error(
            'buildEncodedTxFromBatchTransfer ERROR: Invalid value',
          );
        }

        if (!address) {
          throw new Error(
            'buildEncodedTxFromBatchTransfer ERROR: Invalid output address',
          );
        }

        if (type === 'payment') {
          return {
            address,
            value: valueText,
          };
        }

        if (type === 'change') {
          if (!path) {
            throw new Error(
              'buildEncodedTxFromBatchTransfer ERROR: Invalid change path',
            );
          }
          return {
            address,
            value: valueText,
            payload: {
              isChange: true,
              bip44Path: path,
            },
          };
        }

        throw new Error(
          'buildEncodedTxFromBatchTransfer ERROR: Invalid output type',
        );
      }),
      inputsForCoinSelect,
      outputsForCoinSelect,
      fee: fee.toString(),
      txSize,
    };
  }

  async _buildTransferParamsWithCoinSelector({
    transfersInfo,
    specifiedFeeRate,
  }: {
    transfersInfo: ITransferInfo[];
    specifiedFeeRate?: string;
  }) {
    const network = await this.getNetwork();
    if (!transfersInfo.length) {
      throw new Error(
        'buildTransferParamsWithCoinSelector ERROR: transferInfos is required',
      );
    }

    const isBatchTransfer = transfersInfo.length > 1;

    const { utxoList: utxosInfo } = await this._collectUTXOsInfoByApi();

    // Select the slowest fee rate as default, otherwise the UTXO selection
    // would be failed.
    // SpecifiedFeeRate is from UI layer and is in BTC/byte, convert it to sats/byte
    const feeRate =
      typeof specifiedFeeRate !== 'undefined'
        ? new BigNumber(specifiedFeeRate)
            .shiftedBy(network.feeMeta.decimals)
            .toFixed()
        : (await this._getFeeRate())[1];

    const inputsForCoinSelect: ICoinSelectUTXO[] = utxosInfo.map(
      ({ txid, vout, value, address, path, confirmations }) => ({
        txId: txid,
        vout,
        value: parseInt(value, 10),
        amount: new BigNumber(parseInt(value, 10)).toFixed(),
        address,
        path,
        confirmations,
      }),
    );

    let outputsForCoinSelect: IOutputsForCoinSelect = [];

    if (isBatchTransfer) {
      outputsForCoinSelect = transfersInfo.map(({ to, amount }) => ({
        type: EOutputsTypeForCoinSelect.Payment,
        address: to,
        value: parseInt(
          new BigNumber(amount).shiftedBy(network.decimals).toFixed(),
          10,
        ),
        amount: new BigNumber(amount).shiftedBy(network.decimals).toFixed(),
      }));
    } else {
      const transferInfo = transfersInfo[0];
      const { to, amount } = transferInfo;

      const allUtxoAmount = utxosInfo
        .reduce((v, { value }) => v.plus(value), new BigNumber('0'))
        .shiftedBy(-network.decimals);

      if (allUtxoAmount.lt(amount)) {
        throw new InsufficientBalance({
          info: {
            symbol: network.symbol,
          },
        });
      }

      const max = allUtxoAmount.lte(amount);

      const value = new BigNumber(amount).shiftedBy(network.decimals).toFixed();

      outputsForCoinSelect = [
        max
          ? { address: to, type: EOutputsTypeForCoinSelect.SendMax }
          : {
              type: EOutputsTypeForCoinSelect.Payment,
              address: to,
              value: parseInt(value, 10),
              amount: value,
            },
      ];

      if (
        transferInfo.opReturn &&
        typeof transferInfo.opReturn === 'string' &&
        transferInfo.opReturn.length
      ) {
        outputsForCoinSelect.push({
          address: '',
          value: 0,
          amount: '0',
          script: transferInfo.opReturn,
          type: EOutputsTypeForCoinSelect.OpReturn,
          dataHex: Buffer.from(transferInfo.opReturn, 'ascii').toString('hex'),
        });
      }
    }

    // transfer output + maybe opReturn output
    if (!isBatchTransfer && outputsForCoinSelect.length > 2) {
      throw new Error('single transfer should only have one output');
    }
    const btcForkNetwork = await this.getBtcForkNetwork();
    const dbAccount = (await this.getAccount()) as IDBUtxoAccount;
    const txType = await this.getCoinSelectTxType(dbAccount.address);
    const { inputs, outputs, fee, bytes } = coinSelectWithWitness({
      inputsForCoinSelect,
      outputsForCoinSelect,
      feeRate,
      network: btcForkNetwork,
      changeAddress: {
        address: dbAccount.address,
        path: getBIP44Path(dbAccount, dbAccount.address),
      },
      txType,
    });

    return {
      inputs,
      outputs,
      fee,
      inputsForCoinSelect,
      outputsForCoinSelect,
      feeRate,
      txSize: bytes,
    };
  }

  async _buildUnsignedTxFromEncodedTx({
    encodedTx,
    transfersInfo,
  }: {
    encodedTx: IEncodedTxBtc;
    transfersInfo: ITransferInfo[];
  }): Promise<IUnsignedTxPro> {
    const {
      inputs,
      outputs,
      inputsForCoinSelect,
      txSize: encodedTxTxSize,
    } = encodedTx;

    let txSize = encodedTxTxSize;
    if (!txSize) {
      txSize = BTC_TX_PLACEHOLDER_VSIZE;
      const inputsInUnsignedTx: ITxInput[] = [];
      for (const input of inputs) {
        const value = new BigNumber(input.value);
        inputsInUnsignedTx.push({
          address: input.address,
          value,
          utxo: { txid: input.txid, vout: input.vout, value },
        });
      }
      const selectedInputs = inputsForCoinSelect?.filter((input) =>
        inputsInUnsignedTx.some(
          (i) => i.utxo?.txid === input.txId && i.utxo.vout === input.vout,
        ),
      );
      if (Number(selectedInputs?.length) > 0 && outputs.length > 0) {
        txSize = estimateTxSize(
          selectedInputs ?? [],
          outputs.map((o) => ({
            type: EOutputsTypeForCoinSelect.Payment,
            address: o.address,
            value: parseInt(o.value, 10),
          })) ?? [],
        );
      }
    }

    const ret: IUnsignedTxPro = {
      txSize,
      encodedTx,
      transfersInfo,
    };

    return Promise.resolve(ret);
  }

  _getFeeRate = memoizee(
    async () => {
      try {
        const feeInfo = await this.backgroundApi.serviceGas.estimateFee({
          accountId: this.accountId,
          networkId: this.networkId,
          accountAddress: await this.getAccountAddress(),
        });
        const { feeUTXO } = feeInfo;
        if (!feeUTXO || isEmpty(feeUTXO)) {
          throw new OneKeyInternalError(
            appLocale.intl.formatMessage({
              id: ETranslations.feedback_failed_to_fet_fee_rate,
            }),
          );
        }
        const fees = feeUTXO.map((item) =>
          new BigNumber(item.feeRate ?? 0).toFixed(0),
        );
        // Find the index of the first negative fee.
        let negativeIndex = fees.findIndex((val) => new BigNumber(val).lt(0));

        // Keep replacing if there is any negative fee in the array.
        while (negativeIndex >= 0) {
          let leftIndex = negativeIndex - 1;
          let rightIndex = negativeIndex + 1;

          // eslint-disable-next-line no-constant-condition
          while (true) {
            if (leftIndex >= 0 && new BigNumber(fees[leftIndex]).gte(0)) {
              fees[negativeIndex] = fees[leftIndex];
              break;
            }

            if (
              rightIndex < fees.length &&
              new BigNumber(fees[rightIndex]).gte(0)
            ) {
              fees[negativeIndex] = fees[rightIndex];
              break;
            }

            // Move pointers to expand searching range.
            leftIndex -= 1;
            rightIndex += 1;

            if (leftIndex < 0 && rightIndex >= fees.length) {
              break;
            }
          }

          // Find the next negative fee after replacement.
          negativeIndex = fees.findIndex((val) => new BigNumber(val).lt(0));
        }

        return fees.sort((a, b) =>
          new BigNumber(a).comparedTo(new BigNumber(b)),
        );
      } catch (e) {
        console.error(e);
        throw new OneKeyInternalError(
          appLocale.intl.formatMessage({
            id: ETranslations.feedback_failed_to_fet_fee_rate,
          }),
        );
      }
    },
    {
      promise: true,
      max: 1,
      maxAge: 1000 * 30,
    },
  );

  // collectTxs by blockbook api or proxy api
  async collectTxsByApi(txids: string[]): Promise<{
    [txid: string]: string; // rawTx string
  }> {
    const lookup: {
      [txid: string]: string; // rawTx string
    } = {};

    const txs = await this.backgroundApi.serviceSend.getRawTransactions({
      networkId: this.networkId,
      txids,
    });

    Object.keys(txs).forEach((txid) => (lookup[txid] = txs[txid].rawTx));

    return lookup;
  }

  _collectUTXOsInfoByApi = memoizee(
    async () => {
      try {
        const inscriptionProtection =
          await this.backgroundApi.serviceSetting.getInscriptionProtection();
        const checkInscriptionProtectionEnabled =
          await this.backgroundApi.serviceSetting.checkInscriptionProtectionEnabled(
            {
              networkId: this.networkId,
              accountId: this.accountId,
            },
          );
        const withCheckInscription =
          checkInscriptionProtectionEnabled && inscriptionProtection;
        const { utxoList, frozenUtxoList, allUtxoList } =
          await this.backgroundApi.serviceAccountProfile.fetchAccountDetails({
            networkId: this.networkId,
            accountId: this.accountId,
            withUTXOList: true,
            withFrozenBalance: true,
            withCheckInscription,
          });
        if (!utxoList) {
          throw new OneKeyInternalError(
            appLocale.intl.formatMessage({
              id: ETranslations.feedback_failed_to_get_utxos,
            }),
          );
        }
        return { utxoList, frozenUtxoList, allUtxoList };
      } catch (e) {
        throw new OneKeyInternalError(
          appLocale.intl.formatMessage({
            id: ETranslations.feedback_failed_to_get_utxos,
          }),
        );
      }
    },
    {
      promise: true,
      max: 1,
      maxAge: timerUtils.getTimeDurationMs({ seconds: 30 }),
    },
  );

  async _getRelPathsToAddressByApi({
    addresses, // addresses in tx.inputs
    account,
  }: {
    addresses: string[];
    account: IDBAccount;
  }) {
    const { utxoList: utxos } = await this._collectUTXOsInfoByApi();

    const pathToAddresses: {
      [fullPath: string]: {
        address: string;
        relPath: string;
        fullPath: string;
      };
    } = {};

    const addressToPath: {
      [address: string]: {
        address: string;
        relPath: string;
        fullPath: string;
      };
    } = {};

    // add all matched addresses from utxos
    for (const utxo of utxos) {
      const { address, path: fullPath } = utxo;
      if (addresses.includes(address)) {
        const relPath = fullPath.split('/').slice(-2).join('/');
        pathToAddresses[fullPath] = {
          address,
          relPath,
          fullPath,
        };
      }
    }

    // always add first account (path=0/0) address
    const firstRelPath = '0/0';
    const firstFullPath = [account.path, firstRelPath].join('/');
    if (!pathToAddresses[firstFullPath]) {
      pathToAddresses[firstFullPath] = {
        address: account.address,
        relPath: firstRelPath,
        fullPath: firstFullPath,
      };
    }

    const relPaths: string[] = [];

    Object.values(pathToAddresses).forEach((item) => {
      relPaths.push(item.relPath);
      addressToPath[item.address] = cloneDeep(item);
    });

    return {
      relPaths: uniq(relPaths),
      pathToAddresses,
      addressToPath,
    };
  }

  async _collectInfoForSoftwareSign(
    unsignedTx: IUnsignedTxPro,
  ): Promise<[Array<EAddressEncodings | undefined>, Record<string, string>]> {
    const { inputs } = unsignedTx.encodedTx as IEncodedTxBtc;

    const inputAddressesEncodings = await this.parseAddressEncodings(
      inputs.map((i) => i.address),
    );

    const nonWitnessInputPrevTxids = Array.from(
      new Set(
        inputAddressesEncodings
          .map((encoding, index) => {
            if (encoding === EAddressEncodings.P2PKH) {
              return checkIsDefined(inputs[index]).txid;
            }
            return undefined;
          })
          .filter((i) => !!i) as string[],
      ),
    );

    const nonWitnessPrevTxs = await this.collectTxsByApi(
      nonWitnessInputPrevTxids,
    );

    return [inputAddressesEncodings, nonWitnessPrevTxs];
  }

  async prepareBtcSignExtraInfo({
    unsignedTx,
    unsignedMessage,
  }: {
    unsignedTx?: IUnsignedTxPro;
    unsignedMessage?: IUnsignedMessage;
  }): Promise<{
    account: ICoreApiSignAccount;
    btcExtraInfo: ICoreApiSignBtcExtraInfo;
    relPaths?: string[]; // used for get privateKey of other utxo address
  }> {
    const account = await this.getAccount();

    let addresses: string[] = [];
    if (unsignedMessage) {
      addresses = [account.address];
    }
    if (unsignedTx) {
      const { inputs, inputsToSign } = unsignedTx.encodedTx as IEncodedTxBtc;
      const emptyInputs: Array<ITxInputToSign | IBtcInput> = [];
      addresses = emptyInputs
        .concat(inputsToSign ?? [], inputs ?? [])
        .filter(Boolean)
        .map((input) => input.address)
        .concat(account.address);
    }

    // TODO generate relPaths from inputs/inputsToSign/inputsForCoinSelect

    const {
      // required for multiple address signing
      relPaths,
      pathToAddresses,
      addressToPath,
    } = await this._getRelPathsToAddressByApi({
      addresses,
      account,
    });

    const btcExtraInfo: ICoreApiSignBtcExtraInfo = {
      pathToAddresses,
      addressToPath,
    };

    if (unsignedTx) {
      const [inputAddressesEncodings, nonWitnessPrevTxs] =
        await this._collectInfoForSoftwareSign(unsignedTx);
      btcExtraInfo.inputAddressesEncodings = inputAddressesEncodings;
      btcExtraInfo.nonWitnessPrevTxs = nonWitnessPrevTxs;
    }

    const signerAccount: ICoreApiSignAccount = account;

    return { btcExtraInfo, account: signerAccount, relPaths };
  }

  override async getPrivateKeyFromImported(params: {
    input: string;
  }): Promise<{ privateKey: string }> {
    // params.input is xprvt format:
    const input = await decodeSensitiveTextAsync({ encodedText: params.input });

    // result is hex format:
    let privateKey = convertBtcXprvtToHex({ xprvt: input });

    privateKey = await encodeSensitiveTextAsync({ text: privateKey });
    return Promise.resolve({
      privateKey,
    });
  }

  override async getXpubFromAccount(
    networkAccount: INetworkAccount,
  ): Promise<string | undefined> {
    const account = networkAccount as IDBUtxoAccount;
    return account.xpubSegwit || account.xpub;
  }

  override async buildEstimateFeeParams() {
    return Promise.resolve({
      encodedTx: undefined,
    });
  }

  override async precheckUnsignedTx(params: {
    unsignedTx: IUnsignedTxPro;
  }): Promise<boolean> {
    const { frozenUtxoList } = await this._collectUTXOsInfoByApi();
    const encodedTx = params.unsignedTx.encodedTx as IEncodedTxBtc;
    const { inputs } = encodedTx;
    if (Array.isArray(frozenUtxoList) && frozenUtxoList.length > 0) {
      if (
        inputs.some((input) =>
          frozenUtxoList.find(
            (u) => u.txid === input.txid && u.vout === input.vout,
          ),
        )
      ) {
        throw new OneKeyInternalError({
          key: ETranslations.feedback_unable_to_send_frozen_balance,
        });
      }
    }
    return true;
  }

  getBlockbookCoinName() {
    return 'Bitcoin';
  }

  override async getCustomRpcEndpointStatus(
    params: IMeasureRpcStatusParams,
  ): Promise<IMeasureRpcStatusResult> {
    const client = new ClientBtc(params.rpcUrl);
    const start = performance.now();
    const result = await client.getInfo();
    if (result.coin !== this.getBlockbookCoinName()) {
      throw new OneKeyInternalError('Invalid coin name');
    }
    return {
      responseTime: Math.floor(performance.now() - start),
      bestBlockNumber: result.bestBlockNumber,
    };
  }

  override async broadcastTransactionFromCustomRpc(
    params: IBroadcastTransactionByCustomRpcParams,
  ): Promise<ISignedTxPro> {
    const { customRpcInfo, signedTx } = params;
    const rpcUrl = customRpcInfo.rpc;
    if (!rpcUrl) {
      throw new OneKeyInternalError('Invalid rpc url');
    }
    const client = new ClientBtc(rpcUrl);
    const txid = await client.broadcastTransaction(signedTx.rawTx);
    return {
      ...signedTx,
      txid,
      encodedTx: signedTx.encodedTx,
    };
  }

  override async getAddressType({ address }: { address: string }) {
    const { encoding, isValid } = await this.validateAddress(address);
    if (isValid && encoding) {
      const deriveInfo =
        await this.backgroundApi.serviceNetwork.getDeriveInfoByAddressEncoding({
          networkId: this.networkId,
          encoding,
        });
      return {
        type: deriveInfo?.label,
      };
    }

    return {};
  }

  override async attachFeeInfoToDAppEncodedTx(params: {
    encodedTx: IEncodedTxBtc;
    feeInfo: IFeeInfoUnit;
  }): Promise<IEncodedTxBtc> {
    const { encodedTx } = params;
    if (encodedTx.psbtHex && Array.isArray(encodedTx.inputsToSign)) {
      // @ts-expect-error
      return '';
    }
    return encodedTx;
  }

  override async buildStakeEncodedTx(
    params: IStakeTxBtcBabylon,
  ): Promise<IEncodedTxBtc> {
    const { psbtHex } = params;
    const network = await this.getNetwork();
    const formattedPsbtHex = formatPsbtHex(psbtHex);
    const psbtNetwork = toPsbtNetwork(network);
    const psbt = Psbt.fromHex(formattedPsbtHex, { network: psbtNetwork });
    const decodedPsbt = decodedPsbtFN({ psbt, psbtNetwork });
    console.log('Babylon Staking PSBT ====>>>>: ', decodedPsbt);
    const account = await this.backgroundApi.serviceAccount.getAccount({
      accountId: this.accountId,
      networkId: this.networkId,
    });

    const inputsToSign = getInputsToSignFromPsbt({
      psbt,
      psbtNetwork,
      account,
      isBtcWalletProvider: true,
    });

    // Check for change address:
    // 1. More than one output
    // 2. Not all output addresses are the same as the current account address
    // This often happens in BRC-20 transfer transactions
    const hasChangeAddress =
      decodedPsbt.outputInfos.length > 1 &&
      !(decodedPsbt.outputInfos ?? []).every(
        (v) => v.address === account.address,
      );
    const encodedTx = {
      inputs: (decodedPsbt.inputInfos ?? []).map((v) => ({
        ...v,
        path: '',
        value: new BigNumber(v.value?.toString() ?? 0).toFixed(),
      })),
      outputs: (decodedPsbt.outputInfos ?? []).map((v) => ({
        ...v,
        value: new BigNumber(v.value?.toString() ?? 0).toFixed(),
        payload: hasChangeAddress
          ? {
              isChange: v.address === account.address,
            }
          : undefined,
      })),
      inputsForCoinSelect: [],
      outputsForCoinSelect: [],
      fee: new BigNumber(decodedPsbt.fee).toFixed(),
      inputsToSign,
      psbtHex: psbt.toHex(),
      disabledCoinSelect: true,
      txSize: undefined,
    };

    return encodedTx;
  }

  override async canAccelerateTx({ txId }: { txId: string }): Promise<boolean> {
    console.log('BTC: canAccelerateTx: ===>>>: txId : ', txId);
    const replaceState =
      await this.backgroundApi.serviceHistory.getReplaceInfoForBtc({
        networkId: this.networkId,
        accountId: this.accountId,
        txid: txId,
      });
    return replaceState === EBtcF2poolReplaceState.NOT_ACCELERATED;
  }

  override async getPendingTxsToUpdate({
    pendingTxs,
  }: {
    pendingTxs: IAccountHistoryTx[];
  }): Promise<IAccountHistoryTx[]> {
    console.log(
      'BTC: getPendingTxsToUpdate: ===>>>: pendingTxs : ',
      pendingTxs,
    );
    try {
      const updatedTxs: IAccountHistoryTx[] = [];

      for (const tx of pendingTxs) {
        const txId = tx.decodedTx.txid;
        const replaceState =
          await this.backgroundApi.serviceHistory.getReplaceInfoForBtc({
            networkId: this.networkId,
            accountId: this.accountId,
            txid: txId,
          });
        if (replaceState === EBtcF2poolReplaceState.ACCELERATED_PENDING) {
          updatedTxs.push({
            ...tx,
            replacedType: EReplaceTxType.SpeedUp,
            replacedMethod: EReplaceTxMethod.BTC_F2POOL,
          });
        }
      }

      return updatedTxs;
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  override checkTxSpeedUpStateEnabled({
    historyTx,
  }: {
    historyTx: IAccountHistoryTx;
  }): Promise<boolean> {
    return Promise.resolve(
      historyTx.replacedType === EReplaceTxType.SpeedUp &&
        historyTx.replacedMethod === EReplaceTxMethod.BTC_F2POOL,
    );
  }
}
