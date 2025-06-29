import { web3Errors } from '@onekeyfe/cross-inpage-provider-errors';
import { IInjectedProviderNames } from '@onekeyfe/cross-inpage-provider-types';
import { Semaphore } from 'async-mutex';
import BigNumber from 'bignumber.js';
import { Psbt } from 'bitcoinjs-lib';
import { isEmpty, isNil } from 'lodash';

import { getInputsToSignFromPsbt } from '@onekeyhq/core/src/chains/btc/sdkBtc';
import {
  decodedPsbt as decodedPsbtFN,
  formatPsbtHex,
  toPsbtNetwork,
} from '@onekeyhq/core/src/chains/btc/sdkBtc/providerUtils';
import type {
  IBtcInput,
  IBtcOutput,
} from '@onekeyhq/core/src/chains/btc/types';
import type { IEncodedTx, ITxInputToSign } from '@onekeyhq/core/src/types';
import {
  backgroundClass,
  providerApiMethod,
} from '@onekeyhq/shared/src/background/backgroundDecorators';
import { getNetworkIdsMap } from '@onekeyhq/shared/src/config/networkIds';
import { defaultLogger } from '@onekeyhq/shared/src/logger/logger';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import { memoizee } from '@onekeyhq/shared/src/utils/cacheUtils';
import networkUtils from '@onekeyhq/shared/src/utils/networkUtils';
import timerUtils from '@onekeyhq/shared/src/utils/timerUtils';
import {
  BtcDappUniSetChainTypes,
  EBtcDappUniSetChainTypeEnum,
  type IPushPsbtParams,
  type ISendBitcoinParams,
  type ISignMessageParams,
  type ISignPsbtOptions,
  type ISignPsbtParams,
  type ISignPsbtsParams,
  type ISwitchNetworkParams,
  type IToSignInput,
} from '@onekeyhq/shared/types/ProviderApis/ProviderApiBtc.type';
import type { IPushTxParams } from '@onekeyhq/shared/types/ProviderApis/ProviderApiSui.type';

import { vaultFactory } from '../vaults/factory';

import ProviderApiBase from './ProviderApiBase';

import type { IProviderBaseBackgroundNotifyInfo } from './ProviderApiBase';
import type { IJsBridgeMessagePayload } from '@onekeyfe/cross-inpage-provider-types';
import type * as BitcoinJS from 'bitcoinjs-lib';

@backgroundClass()
class ProviderApiBtc extends ProviderApiBase {
  public providerName = IInjectedProviderNames.btc;

  private semaphore = new Semaphore(1);

  public override notifyDappAccountsChanged(
    info: IProviderBaseBackgroundNotifyInfo,
  ): void {
    const data = async ({ origin }: { origin: string }) => {
      const params = await this.getAccounts({
        origin,
        scope: this.providerName,
      });
      const result = {
        method: 'wallet_events_accountsChanged',
        params,
      };
      return result;
    };
    info.send(data, info.targetOrigin);
  }

  public override notifyDappChainChanged(
    info: IProviderBaseBackgroundNotifyInfo,
  ): void {
    const data = async ({ origin }: { origin: string }) => {
      const params = await this.getNetwork({
        origin,
        scope: this.providerName,
      });
      const result = {
        method: 'wallet_events_networkChanged',
        params,
      };
      return result;
    };
    info.send(data, info.targetOrigin);
    this.notifyNetworkChangedToDappSite(info.targetOrigin);
  }

  public async rpcCall(): Promise<any> {
    throw web3Errors.rpc.methodNotSupported();
  }

  @providerApiMethod()
  public async getProviderState() {
    return {
      network: '',
      isUnlocked: true,
      accounts: [],
    };
  }

  // Provider API
  @providerApiMethod()
  public async requestAccounts(request: IJsBridgeMessagePayload) {
    return this.semaphore.runExclusive(async () => {
      defaultLogger.discovery.dapp.dappRequest({ request });
      const accounts = await this.getAccounts(request);
      if (accounts && accounts.length) {
        return accounts;
      }
      await this.backgroundApi.serviceDApp.openConnectionModal(request);
      void this._getConnectedNetworkName(request);
      return this.getAccounts(request);
    });
  }

  @providerApiMethod()
  async getAccounts(request: IJsBridgeMessagePayload) {
    const accountsInfo =
      await this.backgroundApi.serviceDApp.dAppGetConnectedAccountsInfo(
        request,
      );
    if (!accountsInfo) {
      return Promise.resolve([]);
    }
    return Promise.resolve(accountsInfo.map((i) => i.account.address));
  }

  @providerApiMethod()
  public async getPublicKey(request: IJsBridgeMessagePayload) {
    const accountsInfo =
      await this.backgroundApi.serviceDApp.dAppGetConnectedAccountsInfo(
        request,
      );
    if (!accountsInfo) {
      return Promise.resolve('');
    }
    return Promise.resolve(accountsInfo[0]?.account?.pub);
  }

  @providerApiMethod()
  public async getNetwork(request: IJsBridgeMessagePayload) {
    try {
      const networks =
        await this.backgroundApi.serviceDApp.getConnectedNetworks({
          origin: request.origin ?? '',
          scope: request.scope ?? this.providerName,
        });
      if (Array.isArray(networks) && networks.length) {
        return await networkUtils.getBtcDappNetworkName(networks[0]);
      }
      return '';
    } catch {
      return '';
    }
  }

  @providerApiMethod()
  public async switchNetwork(
    request: IJsBridgeMessagePayload,
    params: ISwitchNetworkParams,
  ) {
    defaultLogger.discovery.dapp.dappRequest({ request });
    const accountsInfo =
      await this.backgroundApi.serviceDApp.dAppGetConnectedAccountsInfo(
        request,
      );
    if (!accountsInfo) {
      return;
    }
    const { accountInfo: { networkId: oldNetworkId } = {} } = accountsInfo[0];

    if (!oldNetworkId) {
      return;
    }

    const { network: networkName } = params;
    let networkId;
    if (networkName === 'livenet') {
      networkId = getNetworkIdsMap().btc;
    } else if (networkName === 'testnet') {
      networkId = getNetworkIdsMap().tbtc;
    } else if (networkName === 'signet') {
      networkId = getNetworkIdsMap().sbtc;
    }
    if (!networkId) {
      throw web3Errors.provider.custom({
        code: 4000,
        message: `Unrecognized network ${networkName}.`,
      });
    }
    try {
      await this.backgroundApi.serviceDApp.switchConnectedNetwork({
        origin: request.origin ?? '',
        scope: request.scope ?? this.providerName,
        oldNetworkId,
        newNetworkId: networkId,
      });
      this.notifyNetworkChangedToDappSite(request.origin ?? '');
    } catch (e: any) {
      const { message } = e || {};
      throw web3Errors.provider.custom({
        code: 4000,
        message: message ?? 'Switch network failed',
      });
    }
    const network = await this.getNetwork(request);
    return network;
  }

  @providerApiMethod()
  public async getChain(request: IJsBridgeMessagePayload) {
    const defaultNetwork = await this.backgroundApi.serviceNetwork.getNetwork({
      networkId: getNetworkIdsMap().btc,
    });
    const defaultChain = await networkUtils.getBtcDappNetworkName(
      defaultNetwork,
    );
    try {
      const networks =
        await this.backgroundApi.serviceDApp.getConnectedNetworks({
          origin: request.origin ?? '',
          scope: request.scope ?? this.providerName,
        });
      if (Array.isArray(networks) && networks.length) {
        return await networkUtils.getBtcDappUniSetChainName(networks[0]);
      }
      return defaultChain;
    } catch (e) {
      console.log('getChain error: ', e);
      return defaultChain;
    }
  }

  @providerApiMethod()
  public async switchChain(
    request: IJsBridgeMessagePayload,
    params: { chain: EBtcDappUniSetChainTypeEnum },
  ) {
    defaultLogger.discovery.dapp.dappRequest({ request });
    const accountsInfo =
      await this.backgroundApi.serviceDApp.dAppGetConnectedAccountsInfo(
        request,
      );
    if (!accountsInfo) {
      return;
    }
    const { accountInfo: { networkId: oldNetworkId } = {} } = accountsInfo[0];

    if (!oldNetworkId) {
      return undefined;
    }

    let networkId;
    if (params.chain === EBtcDappUniSetChainTypeEnum.BITCOIN_MAINNET) {
      networkId = getNetworkIdsMap().btc;
    } else if (params.chain === EBtcDappUniSetChainTypeEnum.BITCOIN_TESTNET) {
      networkId = getNetworkIdsMap().tbtc;
    } else if (params.chain === EBtcDappUniSetChainTypeEnum.BITCOIN_SIGNET) {
      networkId = getNetworkIdsMap().sbtc;
    }

    if (!networkId) {
      throw web3Errors.provider.custom({
        code: 4000,
        message: `Unrecognized network ${params.chain}.`,
      });
    }

    const chain = BtcDappUniSetChainTypes[params.chain];

    try {
      await this.backgroundApi.serviceDApp.switchConnectedNetwork({
        origin: request.origin ?? '',
        scope: request.scope ?? this.providerName,
        oldNetworkId,
        newNetworkId: networkId,
      });
      this.notifyNetworkChangedToDappSite(request.origin ?? '');
      return chain;
    } catch (e: any) {
      const { message } = e || {};
      throw web3Errors.provider.custom({
        code: 4000,
        message: message ?? 'Switch network failed',
      });
    }
  }

  @providerApiMethod()
  public async getBalance(request: IJsBridgeMessagePayload) {
    const { accountInfo: { networkId, accountId } = {} } = (
      await this.getAccountsInfo(request)
    )[0];

    const { balance } =
      await this.backgroundApi.serviceAccountProfile.fetchAccountDetails({
        networkId: networkId ?? '',
        accountId: accountId ?? '',
      });
    return {
      confirmed: balance,
      unconfirmed: 0,
      total: balance,
    };
  }

  @providerApiMethod()
  public async getInscriptions() {
    throw web3Errors.rpc.methodNotSupported();
  }

  @providerApiMethod()
  public async sendBitcoin(
    request: IJsBridgeMessagePayload,
    params: ISendBitcoinParams,
  ) {
    defaultLogger.discovery.dapp.dappRequest({ request });
    const { toAddress, satoshis, feeRate } = params;
    const accountsInfo = await this.getAccountsInfo(request);
    const { accountInfo: { accountId, networkId, address } = {} } =
      accountsInfo[0];

    if (!networkId || !accountId) {
      throw web3Errors.provider.custom({
        code: 4002,
        message: `Can not get account`,
      });
    }

    const amountBN = new BigNumber(satoshis);

    if (amountBN.isNaN() || amountBN.isNegative()) {
      throw web3Errors.rpc.invalidParams('Invalid satoshis');
    }

    const vault = await vaultFactory.getVault({
      networkId,
      accountId,
    });
    const network = await this.backgroundApi.serviceNetwork.getNetwork({
      networkId,
    });

    const transfersInfo = [
      {
        from: address ?? '',
        to: toAddress,
        amount: amountBN.shiftedBy(-network.decimals).toFixed(),
      },
    ];
    const encodedTx = await vault.buildEncodedTx({
      transfersInfo,
      specifiedFeeRate: isNil(feeRate)
        ? undefined
        : new BigNumber(feeRate).shiftedBy(-network.feeMeta.decimals).toFixed(),
    });

    const result =
      await this.backgroundApi.serviceDApp.openSignAndSendTransactionModal({
        request,
        encodedTx,
        accountId: accountId ?? '',
        networkId: networkId ?? '',
        transfersInfo,
      });
    return result.txid;
  }

  @providerApiMethod()
  public async signMessage(
    request: IJsBridgeMessagePayload,
    params: ISignMessageParams,
  ) {
    defaultLogger.discovery.dapp.dappRequest({ request });
    const { message, type } = params;
    const accountsInfo = await this.getAccountsInfo(request);
    const { accountInfo: { accountId, networkId } = {} } = accountsInfo[0];

    if (type !== 'bip322-simple' && type !== 'ecdsa') {
      throw web3Errors.rpc.invalidParams('Invalid type');
    }

    const result = await this.backgroundApi.serviceDApp.openSignMessageModal({
      request,
      accountId: accountId ?? '',
      networkId: networkId ?? '',
      unsignedMessage: {
        type,
        message,
        sigOptions: {
          noScriptType: true,
        },
        payload: {
          isFromDApp: true,
        },
      },
    });
    return Buffer.from(result as string, 'hex').toString('base64');
  }

  @providerApiMethod()
  public async sendInscription() {
    throw web3Errors.rpc.methodNotSupported();
  }

  @providerApiMethod()
  public async inscribeTransfer() {
    throw web3Errors.rpc.methodNotSupported();
  }

  @providerApiMethod()
  public async pushTx(request: IJsBridgeMessagePayload, params: IPushTxParams) {
    defaultLogger.discovery.dapp.dappRequest({ request });
    const { rawTx } = params;
    const accountsInfo = await this.getAccountsInfo(request);
    const { accountInfo: { accountId, networkId, address } = {} } =
      accountsInfo[0];

    if (!networkId || !accountId) {
      throw web3Errors.provider.custom({
        code: 4002,
        message: `Can not get account`,
      });
    }

    const vault = await vaultFactory.getVault({
      networkId,
      accountId,
    });
    const result = await vault.broadcastTransaction({
      accountId,
      accountAddress: address ?? '',
      networkId,
      signedTx: {
        txid: '',
        rawTx,
        encodedTx: null,
      },
    });

    return result.txid;
  }

  @providerApiMethod()
  public async signPsbt(
    request: IJsBridgeMessagePayload,
    params: ISignPsbtParams,
  ) {
    defaultLogger.discovery.dapp.dappRequest({ request });
    const accountsInfo = await this.getAccountsInfo(request);
    const { accountInfo: { accountId, networkId } = {} } = accountsInfo[0];

    if (!networkId || !accountId) {
      throw web3Errors.provider.custom({
        code: 4002,
        message: `Can not get account`,
      });
    }

    // if (accountUtils.isHwAccount({ accountId })) {
    //   throw web3Errors.provider.custom({
    //     code: 4003,
    //     message:
    //       'Partially signed bitcoin transactions is not supported on hardware.',
    //   });
    // }

    const network = await this.backgroundApi.serviceNetwork.getNetwork({
      networkId,
    });
    if (!network) return null;

    const { psbtHex, options } = params;
    const formattedPsbtHex = formatPsbtHex(psbtHex);
    const psbtNetwork = toPsbtNetwork(network);
    const psbt = Psbt.fromHex(formattedPsbtHex, { network: psbtNetwork });
    const respPsbtHex = await this._signPsbt(request, {
      psbt,
      psbtNetwork,
      options,
    });

    return respPsbtHex;
  }

  @providerApiMethod()
  public async signPsbts(
    request: IJsBridgeMessagePayload,
    params: ISignPsbtsParams,
  ) {
    defaultLogger.discovery.dapp.dappRequest({ request });
    const accountsInfo = await this.getAccountsInfo(request);
    const { accountInfo: { accountId, networkId } = {} } = accountsInfo[0];

    if (!networkId || !accountId) {
      throw web3Errors.provider.custom({
        code: 4002,
        message: `Can not get account`,
      });
    }

    if (accountUtils.isHwAccount({ accountId })) {
      throw web3Errors.provider.custom({
        code: 4003,
        message:
          'Partially signed bitcoin transactions is not supported on hardware.',
      });
    }

    const network = await this.backgroundApi.serviceNetwork.getNetwork({
      networkId,
    });
    if (!network) return null;

    const { psbtHexs, options } = params;

    const psbtNetwork = toPsbtNetwork(network);
    const result: string[] = [];

    for (let i = 0; i < psbtHexs.length; i += 1) {
      const formattedPsbtHex = formatPsbtHex(psbtHexs[i]);
      const psbt = Psbt.fromHex(formattedPsbtHex, { network: psbtNetwork });
      const respPsbtHex = await this._signPsbt(request, {
        psbt,
        psbtNetwork,
        options,
      });
      result.push(respPsbtHex);
    }

    return result;
  }

  async _signPsbt(
    request: IJsBridgeMessagePayload,
    params: {
      psbt: Psbt;
      psbtNetwork: BitcoinJS.networks.Network;
      options?: ISignPsbtOptions;
    },
  ) {
    const accountsInfo = await this.getAccountsInfo(request);
    const { accountInfo: { accountId, networkId, address } = {} } =
      accountsInfo[0];

    if (!networkId || !accountId) {
      throw web3Errors.provider.custom({
        code: 4002,
        message: `Can not get account`,
      });
    }

    const { psbt, psbtNetwork, options } = params;

    const decodedPsbt = decodedPsbtFN({ psbt, psbtNetwork });

    const account = await this.backgroundApi.serviceAccount.getAccount({
      accountId,
      networkId,
    });

    let inputsToSign: ITxInputToSign[] = [];
    if (
      Array.isArray(options?.toSignInputs) &&
      options?.toSignInputs.length > 0
    ) {
      inputsToSign = options.toSignInputs.map((input) => ({
        index: input.index,
        publicKey: input.publicKey || account.pub || '',
        address: input.address || account.address || '',
        sighashTypes: input.sighashTypes,
        disableTweakSigner: input.disableTweakSigner,
        useTweakedSigner: input.useTweakedSigner,
      }));
    } else {
      inputsToSign = getInputsToSignFromPsbt({
        psbt,
        psbtNetwork,
        account,
        isBtcWalletProvider: options?.isBtcWalletProvider ?? false,
      });
    }

    const inputAddresses = new Map<string, BigNumber>();
    decodedPsbt.inputInfos.forEach((input) => {
      const value = new BigNumber(input.value?.toString() ?? 0);
      const addressKey = input.address;
      if (addressKey) {
        inputAddresses.set(
          addressKey,
          (inputAddresses.get(addressKey) || new BigNumber(0)).plus(value),
        );
      }
    });

    const outputAddresses = new Map<string, BigNumber>();
    decodedPsbt.outputInfos.forEach((output) => {
      const value = new BigNumber(output.value?.toString() ?? 0);
      const addressKey = output.address;
      if (addressKey) {
        outputAddresses.set(
          addressKey,
          (outputAddresses.get(addressKey) || new BigNumber(0)).plus(value),
        );
      }
    });

    // Check for change address:
    // 1. More than one output
    // 2. Not all output addresses are the same as the current account address
    // This often happens in BRC-20 transfer transactions
    const hasChangeAddress =
      decodedPsbt.outputInfos.length > 1 &&
      !(decodedPsbt.outputInfos ?? []).every((v) => v.address === address);

    const outputs: IBtcOutput[] = (decodedPsbt.outputInfos ?? []).map((v) => {
      const isChange = hasChangeAddress ? v.address === address : false;
      // check if the output is an inscription structure output
      const inputValue =
        inputAddresses.get(v.address ?? '') || new BigNumber(0);
      const outputValue =
        outputAddresses.get(v.address ?? '') || new BigNumber(0);
      // allow 1000 satoshi error for fee
      const isInscriptionStructure = inputValue
        .minus(outputValue)
        .abs()
        .lt(1000);

      return {
        ...v,
        value: new BigNumber(v.value?.toString() ?? 0).toFixed(),
        payload: {
          isChange,
          isInscriptionStructure,
        },
      };
    });

    const resp =
      await this.backgroundApi.serviceDApp.openSignAndSendTransactionModal({
        request,
        accountId,
        networkId,
        encodedTx: {
          inputs: (decodedPsbt.inputInfos ?? []).map((v) => ({
            ...v,
            path: '',
            value: new BigNumber(v.value?.toString() ?? 0).toFixed(),
          })) as IBtcInput[],
          outputs,
          inputsForCoinSelect: [],
          outputsForCoinSelect: [],
          fee: new BigNumber(decodedPsbt.fee).toFixed(),
          inputsToSign,
          psbtHex: psbt.toHex(),
          disabledCoinSelect: true,
          txSize: undefined,
        },
        signOnly: true,
      });

    if (!resp.psbtHex) {
      throw web3Errors.provider.custom({
        code: 4001,
        message: 'Failed to sign psbt',
      });
    }
    const respPsbt = Psbt.fromHex(resp.psbtHex, { network: psbtNetwork });

    if (options && options.autoFinalized === false) {
      // do not finalize
    } else {
      inputsToSign.forEach((input: IToSignInput) => {
        respPsbt.finalizeInput(input.index);
      });
    }
    return respPsbt.toHex();
  }

  @providerApiMethod()
  public async pushPsbt(
    request: IJsBridgeMessagePayload,
    params: IPushPsbtParams,
  ) {
    defaultLogger.discovery.dapp.dappRequest({ request });
    const accountsInfo = await this.getAccountsInfo(request);
    const { accountInfo: { accountId, networkId, address } = {} } =
      accountsInfo[0];

    if (!networkId || !accountId) {
      throw web3Errors.provider.custom({
        code: 4002,
        message: `Can not get account`,
      });
    }

    const { psbtHex } = params;

    const formattedPsbtHex = formatPsbtHex(psbtHex);
    const psbt = Psbt.fromHex(formattedPsbtHex);
    const tx = psbt.extractTransaction();
    const rawTx = tx.toHex();

    const vault = await vaultFactory.getVault({
      networkId,
      accountId,
    });
    const result = await vault.broadcastTransaction({
      accountAddress: address ?? '',
      accountId,
      networkId,
      signedTx: {
        txid: '',
        rawTx,
        encodedTx: null,
      },
    });

    return result.txid;
  }

  @providerApiMethod()
  public async getNetworkFees(request: IJsBridgeMessagePayload) {
    const accountsInfo = await this.getAccountsInfo(request);
    const { accountInfo: { networkId, accountId } = {} } = accountsInfo[0];

    if (!networkId || !accountId) {
      throw web3Errors.provider.custom({
        code: 4002,
        message: `Can not get account`,
      });
    }
    const accountAddress =
      await this.backgroundApi.serviceAccount.getAccountAddressForApi({
        networkId,
        accountId,
      });

    const { encodedTx } =
      await this.backgroundApi.serviceGas.buildEstimateFeeParams({
        accountId,
        networkId,
        encodedTx: {} as IEncodedTx,
      });

    const result = await this.backgroundApi.serviceGas.estimateFee({
      accountId,
      networkId,
      encodedTx,
      accountAddress,
    });
    if (result.feeUTXO && result.feeUTXO.length === 3) {
      const fastestFee = Number(result.feeUTXO[0].feeRate);
      const halfHourFee = Number(result.feeUTXO[1].feeRate);
      const hourFee = Number(result.feeUTXO[2].feeRate);
      return {
        fastestFee,
        halfHourFee,
        hourFee,
        economyFee: hourFee,
        minimumFee: hourFee,
      };
    }
    throw web3Errors.provider.custom({
      code: 4001,
      message: 'Failed to get network fees',
    });
  }

  @providerApiMethod()
  public async getUtxos(
    request: IJsBridgeMessagePayload,
    params: {
      address: string;
      amount: number;
    },
  ) {
    const accountsInfo = await this.getAccountsInfo(request);
    const { accountInfo: { networkId, accountId } = {} } = accountsInfo[0];

    if (!networkId || !accountId) {
      throw web3Errors.provider.custom({
        code: 4002,
        message: `Can not get account`,
      });
    }

    const { utxoList } =
      await this.backgroundApi.serviceAccountProfile.fetchAccountDetails({
        networkId,
        accountId,
        withUTXOList: true,
      });
    if (!utxoList || isEmpty(utxoList)) {
      throw web3Errors.provider.custom({
        code: 4001,
        message: 'Failed to get UTXO list',
      });
    }
    const utxos = utxoList;
    const confirmedUtxos = utxos.filter(
      (v) => v.address === params.address && Number(v?.confirmations ?? 0) > 0,
    );
    let sum = 0;
    let index = 0;
    for (const utxo of confirmedUtxos) {
      sum += new BigNumber(utxo.value).toNumber();
      index += 1;
      if (sum > params.amount) {
        break;
      }
    }
    if (sum < params.amount) {
      return [];
    }
    const sliced = confirmedUtxos.slice(0, index);
    const result = [];
    for (const utxo of sliced) {
      // TODO: get scriptPubKey from txDetails by Api
      const txDetails = {} as any;
      result.push({
        txid: utxo.txid,
        vout: utxo.vout,
        value: new BigNumber(utxo.value).toNumber(),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        scriptPubKey: txDetails?.vout?.[utxo.vout].hex ?? '',
      });
    }

    return result;
  }

  @providerApiMethod()
  public async getBTCTipHeight(request: IJsBridgeMessagePayload) {
    const accountsInfo = await this.getAccountsInfo(request);
    const { accountInfo: { networkId } = {} } = accountsInfo[0];
    return this._getBlockHeightMemo({
      networkId,
      origin: request.origin ?? '',
    });
  }

  private _getBlockHeightMemo = memoizee(
    async (params: { networkId?: string; origin: string }) => {
      const { networkId, origin } = params;
      if (!networkId) return undefined;
      const [result] = await this.backgroundApi.serviceDApp.proxyRPCCall({
        networkId,
        request: {
          method: 'get',
          // @ts-expect-error
          url: '/api/v2',
        },
        skipParseResponse: true,
        origin,
      });
      // @ts-expect-error
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const blockHeight = result?.data?.blockbook?.bestHeight;
      if (blockHeight) {
        return Number(blockHeight);
      }
      return undefined;
    },
    {
      promise: true,
      maxAge: timerUtils.getTimeDurationMs({ seconds: 30 }),
    },
  );
}

export default ProviderApiBtc;
