import BigNumber from 'bignumber.js';
import { isEmpty } from 'lodash';

import { XRPL } from '@onekeyhq/core/src/chains/xrp/sdkXrp';
import type {
  IDecodedTxExtraXrp,
  IEncodedTxXrp,
} from '@onekeyhq/core/src/chains/xrp/types';
import {
  decodeSensitiveTextAsync,
  encodeSensitiveTextAsync,
} from '@onekeyhq/core/src/secret';
import type { ISignedTxPro, IUnsignedTxPro } from '@onekeyhq/core/src/types';
import {
  InvalidAddress,
  InvalidTransferValue,
  NotImplemented,
  OneKeyInternalError,
} from '@onekeyhq/shared/src/errors';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import bufferUtils from '@onekeyhq/shared/src/utils/bufferUtils';
import { memoizee } from '@onekeyhq/shared/src/utils/cacheUtils';
import type {
  IAddressValidation,
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
import type { IOnChainHistoryTx } from '@onekeyhq/shared/types/history';
import {
  EDecodedTxActionType,
  EDecodedTxStatus,
} from '@onekeyhq/shared/types/tx';
import type { IDecodedTx, IDecodedTxAction } from '@onekeyhq/shared/types/tx';

import { VaultBase } from '../../base/VaultBase';

import { KeyringExternal } from './KeyringExternal';
import { KeyringHardware } from './KeyringHardware';
import { KeyringHd } from './KeyringHd';
import { KeyringImported } from './KeyringImported';
import { KeyringWatching } from './KeyringWatching';
import { ClientRipple } from './sdkRipple/ClientRipple';

import type { IDBWalletType } from '../../../dbs/local/types';
import type { KeyringBase } from '../../base/KeyringBase';
import type {
  IBroadcastTransactionByCustomRpcParams,
  IBuildAccountAddressDetailParams,
  IBuildDecodedTxParams,
  IBuildEncodedTxParams,
  IBuildUnsignedTxParams,
  IGetPrivateKeyFromImportedParams,
  IGetPrivateKeyFromImportedResult,
  IUpdateUnsignedTxParams,
  IValidateGeneralInputParams,
} from '../../types';

export default class Vault extends VaultBase {
  override keyringMap: Record<IDBWalletType, typeof KeyringBase | undefined> = {
    hd: KeyringHd,
    qr: undefined,
    hw: KeyringHardware,
    imported: KeyringImported,
    watching: KeyringWatching,
    external: KeyringExternal,
  };

  override buildAccountAddressDetail(
    params: IBuildAccountAddressDetailParams,
  ): Promise<INetworkAccountAddressDetail> {
    const { account, networkId } = params;
    const { address } = account;
    return Promise.resolve({
      networkId,
      normalizedAddress: address,
      displayAddress: address,
      address,
      baseAddress: address,
      isValid: true,
      allowEmptyAddress: false,
    });
  }

  override async buildEncodedTx(
    params: IBuildEncodedTxParams,
  ): Promise<IEncodedTxXrp> {
    const { transfersInfo } = params;
    if (!transfersInfo || isEmpty(transfersInfo)) {
      throw new OneKeyInternalError('transfersInfo is required');
    }
    if (transfersInfo.length > 1) {
      throw new OneKeyInternalError('Batch transfer is not supported');
    }
    const transferInfo = transfersInfo[0];
    if (!transferInfo.to) {
      throw new Error('buildEncodedTx ERROR: transferInfo.to is missing');
    }
    const { to, amount } = transferInfo;
    const dbAccount = await this.getAccount();
    let destination = to;
    let destinationTag: number | undefined = transferInfo.memo
      ? Number(transferInfo.memo)
      : undefined;
    // Slice destination tag from swap address
    if (!XRPL.isValidAddress(to) && to.indexOf('#') > -1) {
      const [address, tag] = to.split('#');
      destination = address;
      destinationTag = tag ? Number(tag) : undefined;

      if (!XRPL.isValidAddress(address)) {
        throw new InvalidAddress();
      }
    }

    const [currentLedgerIndex] =
      await this.backgroundApi.serviceAccountProfile.sendProxyRequest<number>({
        networkId: this.networkId,
        body: [
          {
            route: 'rpc',
            params: {
              method: 'getLedgerIndex',
              params: [],
            },
          },
        ],
      });
    const [prepared] =
      await this.backgroundApi.serviceAccountProfile.sendProxyRequest<
        Awaited<ReturnType<XRPL.Client['autofill']>>
      >({
        networkId: this.networkId,
        body: [
          {
            route: 'rpc',
            params: {
              method: 'autofill',
              params: [
                {
                  TransactionType: 'Payment',
                  Account: dbAccount.address,
                  Amount: XRPL.xrpToDrops(amount),
                  Destination: destination,
                  DestinationTag: destinationTag,
                  LastLedgerSequence: currentLedgerIndex + 50,
                },
              ],
            },
          },
        ],
      });

    return {
      ...prepared,
    } as IEncodedTxXrp;
  }

  override async buildDecodedTx(
    params: IBuildDecodedTxParams,
  ): Promise<IDecodedTx> {
    const { unsignedTx, transferPayload } = params;
    const encodedTx = unsignedTx.encodedTx as IEncodedTxXrp;
    const network = await this.getNetwork();

    let actions: IDecodedTxAction[] = [];

    if (unsignedTx.swapInfo) {
      actions = [
        await this.buildInternalSwapAction({
          swapInfo: unsignedTx.swapInfo,
          swapToAddress: encodedTx.Destination,
        }),
      ];
    } else {
      const nativeToken = await this.backgroundApi.serviceToken.getToken({
        accountId: this.accountId,
        networkId: this.networkId,
        tokenIdOnNetwork: '',
      });

      if (nativeToken) {
        const transfer = {
          from: encodedTx.Account,
          to: encodedTx.Destination,
          amount: new BigNumber(encodedTx.Amount)
            .shiftedBy(-network.decimals)
            .toFixed(),
          tokenIdOnNetwork: nativeToken.address,
          icon: nativeToken.logoURI ?? '',
          name: nativeToken.name,
          symbol: nativeToken.symbol,
          isNFT: false,
          isNative: true,
        };
        actions = [
          await this.buildTxTransferAssetAction({
            from: encodedTx.Account,
            to: encodedTx.Destination,
            transfers: [transfer],
          }),
        ];
      }
    }

    if (actions.length === 0) {
      actions.push({
        type: EDecodedTxActionType.UNKNOWN,
        unknownAction: {
          from: encodedTx.Account,
          to: encodedTx.Destination,
        },
      });
    }

    const decodedTx: IDecodedTx = {
      txid: '',
      owner: encodedTx.Account,
      signer: encodedTx.Account,
      nonce: 0,
      actions,
      status: EDecodedTxStatus.Pending,
      networkId: this.networkId,
      accountId: this.accountId,
      extraInfo: {
        destinationTag: transferPayload?.memo
          ? Number(transferPayload.memo)
          : undefined,
      },
      encodedTx,
    };

    return decodedTx;
  }

  override async buildUnsignedTx(
    params: IBuildUnsignedTxParams,
  ): Promise<IUnsignedTxPro> {
    const encodedTx = await this.buildEncodedTx(params);
    if (encodedTx) {
      return {
        encodedTx,
        transfersInfo: params.transfersInfo,
      };
    }
    throw new NotImplemented();
  }

  override updateUnsignedTx(
    params: IUpdateUnsignedTxParams,
  ): Promise<IUnsignedTxPro> {
    const encodedTx = params.unsignedTx.encodedTx as IEncodedTxXrp;
    if (params.nativeAmountInfo?.maxSendAmount) {
      if (encodedTx.Fee) {
        encodedTx.Amount = new BigNumber(encodedTx.Amount)
          .minus(encodedTx.Fee)
          .toFixed();
      }
    }
    return Promise.resolve({
      ...params.unsignedTx,
      encodedTx,
    });
  }

  override buildOnChainHistoryTxExtraInfo({
    onChainHistoryTx,
  }: {
    onChainHistoryTx: IOnChainHistoryTx;
  }): Promise<IDecodedTxExtraXrp> {
    return Promise.resolve({
      destinationTag: onChainHistoryTx.destinationTag,
      ledgerIndex: onChainHistoryTx.ledgerIndex,
      lastLedgerSequence: onChainHistoryTx.lastLedgerSequence,
    });
  }

  override validateAddress(address: string): Promise<IAddressValidation> {
    if (XRPL.isValidClassicAddress(address)) {
      return Promise.resolve({
        isValid: true,
        normalizedAddress: address,
        displayAddress: address,
      });
    }
    return Promise.reject(new InvalidAddress());
  }

  override validateXpub(): Promise<IXpubValidation> {
    return Promise.resolve({
      isValid: false,
    });
  }

  override async getPrivateKeyFromImported(
    params: IGetPrivateKeyFromImportedParams,
  ): Promise<IGetPrivateKeyFromImportedResult> {
    const input = await decodeSensitiveTextAsync({ encodedText: params.input });
    let privateKey = bufferUtils.bytesToHex(input);
    privateKey = await encodeSensitiveTextAsync({ text: privateKey });
    return Promise.resolve({ privateKey });
  }

  override validateXprvt(): Promise<IXprvtValidation> {
    return Promise.resolve({
      isValid: false,
    });
  }

  override validatePrivateKey(
    privateKey: string,
  ): Promise<IPrivateKeyValidation> {
    const isValid = /^(00)?[0-9a-zA-Z]{64}$/.test(privateKey);
    return Promise.resolve({ isValid });
  }

  override async validateGeneralInput(
    params: IValidateGeneralInputParams,
  ): Promise<IGeneralInputValidation> {
    const { result } = await this.baseValidateGeneralInput(params);
    return result;
  }

  private _getAccountInfo = memoizee(
    async (address: string) => {
      const [accountInfo] =
        await this.backgroundApi.serviceAccountProfile.sendProxyRequest<{
          success: boolean;
          error: string;
          result?: {
            error?: string;
            error_message?: string;
          };
        }>({
          networkId: this.networkId,
          body: [
            {
              route: 'rpc',
              params: {
                method: 'request',
                params: [
                  {
                    'command': 'account_info',
                    'account': address,
                    'ledger_index': 'validated',
                  },
                ],
              },
            },
          ],
          returnRawData: true,
        });
      if (accountInfo.success === false) {
        throw new Error(accountInfo.error);
      }
      if (accountInfo.result?.error || accountInfo.result?.error_message) {
        throw new Error(
          accountInfo.result.error_message || accountInfo.result.error,
        );
      }
      return accountInfo;
    },
    {
      promise: true,
      max: 1,
      maxAge: 1000 * 30,
    },
  );

  override async validateSendAmount({
    amount,
    to,
  }: {
    amount: string;
    tokenBalance: string;
    to: string;
  }): Promise<boolean> {
    if (!to) return true;

    const amountBN = new BigNumber(amount);
    try {
      await this._getAccountInfo(to);
    } catch (e) {
      const error = (e as Error).message ?? '';
      if (error.includes('Account not found')) {
        if (amountBN.lt(1)) {
          throw new InvalidTransferValue({
            key: ETranslations.form_amount_recipient_activate,
            info: {
              amount: '1',
              unit: 'XRP',
            },
          });
        } else {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  override async getCustomRpcEndpointStatus(
    params: IMeasureRpcStatusParams,
  ): Promise<IMeasureRpcStatusResult> {
    const client = new ClientRipple({ url: params.rpcUrl });
    const start = performance.now();
    const { blockHeight } = await client.getBlockHeight();
    return {
      responseTime: Math.floor(performance.now() - start),
      bestBlockNumber: blockHeight,
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

    const client = new ClientRipple({ url: rpcUrl });
    const txId = await client.broadcastTransaction(signedTx.rawTx);
    console.log('broadcastTransaction END:', {
      txid: txId,
      rawTx: signedTx.rawTx,
    });
    return {
      ...params.signedTx,
      txid: txId,
    };
  }
}
