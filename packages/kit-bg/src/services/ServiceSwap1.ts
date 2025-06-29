import axios from 'axios';
import BigNumber from 'bignumber.js';
import { EventSourcePolyfill } from 'event-source-polyfill';
import { cloneDeep, has } from 'lodash';

import {
  getBtcForkNetwork,
  validateBtcAddress,
} from '@onekeyhq/core/src/chains/btc/sdkBtc';
import {
  backgroundClass,
  backgroundMethod,
  toastIfError,
} from '@onekeyhq/shared/src/background/backgroundDecorators';
import { getNetworkIdsMap } from '@onekeyhq/shared/src/config/networkIds';
import {
  EAppEventBusNames,
  appEventBus,
} from '@onekeyhq/shared/src/eventBus/appEventBus';
import EventSource from '@onekeyhq/shared/src/eventSource';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { appLocale } from '@onekeyhq/shared/src/locale/appLocale';
import { defaultLogger } from '@onekeyhq/shared/src/logger/logger';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import { getRequestHeaders } from '@onekeyhq/shared/src/request/Interceptor';
import networkUtils from '@onekeyhq/shared/src/utils/networkUtils';
import {
  formatBalance,
  numberFormat,
} from '@onekeyhq/shared/src/utils/numberUtils';
import { equalsIgnoreCase } from '@onekeyhq/shared/src/utils/stringUtils';
import { equalTokenNoCaseSensitive } from '@onekeyhq/shared/src/utils/tokenUtils';
import { EServiceEndpointEnum } from '@onekeyhq/shared/types/endpoint';
import type { ESigningScheme } from '@onekeyhq/shared/types/message';
import type {
  ISwapProviderManager,
  ISwapServiceProvider,
} from '@onekeyhq/shared/types/swap/SwapProvider.constants';
import {
  maxRecentTokenPairs,
  swapHistoryStateFetchInterval,
  swapHistoryStateFetchRiceIntervalCount,
  swapQuoteEventTimeout,
} from '@onekeyhq/shared/types/swap/SwapProvider.constants';
import type {
  ESwapQuoteKind,
  IFetchBuildTxParams,
  IFetchBuildTxResponse,
  IFetchLimitMarketPrice,
  IFetchLimitOrderRes,
  IFetchQuoteResult,
  IFetchQuotesParams,
  IFetchResponse,
  IFetchSwapTxHistoryStatusResponse,
  IFetchTokenDetailParams,
  IFetchTokenListParams,
  IFetchTokensParams,
  IOKXTransactionObject,
  ISwapApproveTransaction,
  ISwapCheckSupportResponse,
  ISwapNetwork,
  ISwapNetworkBase,
  ISwapToken,
  ISwapTokenBase,
  ISwapTxHistory,
} from '@onekeyhq/shared/types/swap/types';
import {
  EProtocolOfExchange,
  ESwapApproveTransactionStatus,
  ESwapCrossChainStatus,
  ESwapDirectionType,
  ESwapFetchCancelCause,
  ESwapLimitOrderStatus,
  ESwapLimitOrderUpdateInterval,
  ESwapTabSwitchType,
  ESwapTxHistoryStatus,
} from '@onekeyhq/shared/types/swap/types';

import {
  inAppNotificationAtom,
  settingsAtom,
  settingsPersistAtom,
} from '../states/jotai/atoms';
import { vaultFactory } from '../vaults/factory';

import ServiceBase from './ServiceBase';

import type { IAllNetworkAccountInfo } from './ServiceAllNetwork/ServiceAllNetwork';

import type {
  IEventSourceOpenEvent,
  IEventSourceMessageEvent,
  IEventSourceDoneEvent,
  IEventSourceErrorEvent,
} from '@onekeyhq/shared/src/eventSource';
import {
  OKX_BASE_URL,
  OKX_API_PATH_PREFIX,
  signOkxRequest,
} from './ServiceOkxSignRequest';

type OKXQuoteParams = IFetchQuotesParams & {
  fromToken: ISwapToken;
  toToken: ISwapToken;
  fromTokenAmount: string;
  protocol: ESwapTabSwitchType;
  accountId?: string;
};



@backgroundClass()
export default class ServiceSwap extends ServiceBase {
  private _quoteAbortController?: AbortController;

  private _tokenListAbortController?: AbortController;

  private _quoteEventSource?: EventSource;

  private _quoteEventSourcePolyfill?: EventSourcePolyfill;

  private _tokenDetailAbortControllerMap: Record<
    ESwapDirectionType,
    AbortController | undefined
  > = { from: undefined, to: undefined };

  private historyStateIntervals: Record<string, ReturnType<typeof setTimeout>> =
    {};

  private limitOrderStateInterval: ReturnType<typeof setTimeout> | null = null;

  private historyCurrentStateIntervalIds: string[] = [];

  private historyStateIntervalCountMap: Record<string, number> = {};

  private _crossChainReceiveTxBlockNotificationMap: Record<string, boolean> =
    {};

  // cache for limit order
  private _swapSupportNetworks: ISwapNetwork[] = [];

  private swapSupportNetworksCacheTime = 0;

  private swapSupportNetworksTtl = 1000 * 60 * 120;

  private _limitOrderCurrentAccountId?: string;

  constructor({ backgroundApi }: { backgroundApi: any }) {
    super({ backgroundApi });
  }

  // --------------------- fetch
  @backgroundMethod()
  async cancelFetchQuotes() {
    if (this._quoteAbortController) {
      this._quoteAbortController.abort();
      this._quoteAbortController = undefined;
    }
  }

  @backgroundMethod()
  async cancelFetchTokenList() {
    if (this._tokenListAbortController) {
      this._tokenListAbortController.abort();
      this._tokenListAbortController = undefined;
    }
  }

  async removeQuoteEventSourceListeners() {
    if (this._quoteEventSource) {
      this._quoteEventSource.removeAllEventListeners();
    }
  }

  @backgroundMethod()
  async cancelFetchQuoteEvents() {
    if (this._quoteEventSource) {
      this._quoteEventSource.close();
      this._quoteEventSource = undefined;
    }
    if (this._quoteEventSourcePolyfill) {
      this._quoteEventSourcePolyfill.close();
      this._quoteEventSourcePolyfill = undefined;
    }
  }

  @backgroundMethod()
  async cancelFetchTokenDetail(direction?: ESwapDirectionType) {
    if (direction && this._tokenDetailAbortControllerMap) {
      if (has(this._tokenDetailAbortControllerMap, direction)) {
        this._tokenDetailAbortControllerMap[direction]?.abort();
        delete this._tokenDetailAbortControllerMap[direction];
      }
    }
  }

  @backgroundMethod()
  @toastIfError()
  async fetchSwapNetworks(): Promise<ISwapNetwork[]> {
    const protocol = EProtocolOfExchange.ALL;
    const params = {
      protocol,
    };
    const client = await this.getClient(EServiceEndpointEnum.Swap);
    const { data } = await client.get<IFetchResponse<ISwapNetworkBase[]>>(
      '/swap/v1/networks',
      { params },
    );
    const allClientSupportNetworks =
      await this.backgroundApi.serviceNetwork.getAllNetworks();
    const swapNetworks = data?.data
      ?.map((network) => {
        const clientNetwork = allClientSupportNetworks.networks.find(
          (n) => n.id === network.networkId,
        );
        if (clientNetwork) {
          return {
            name: clientNetwork.name,
            symbol: clientNetwork.symbol,
            shortcode: clientNetwork.shortcode,
            logoURI: clientNetwork.logoURI,
            networkId: network.networkId,
            defaultSelectToken: network.defaultSelectToken,
            supportCrossChainSwap: network.supportCrossChainSwap,
            supportSingleSwap: network.supportSingleSwap,
            supportLimit: network.supportLimit,
          };
        }
        return null;
      })
      .filter(Boolean);
    return swapNetworks ?? [];
  }

  @backgroundMethod()
  async fetchSwapTokens({
    networkId,
    keywords,
    limit = 50,
    accountAddress,
    accountNetworkId,
    accountId,
    onlyAccountTokens,
    isAllNetworkFetchAccountTokens,
    protocol,
  }: IFetchTokensParams): Promise<ISwapToken[]> {
    if (!isAllNetworkFetchAccountTokens) {
      await this.cancelFetchTokenList();
    }
    const params: IFetchTokenListParams = {
      protocol:
        protocol === ESwapTabSwitchType.LIMIT
          ? EProtocolOfExchange.LIMIT
          : EProtocolOfExchange.SWAP,
      networkId: networkId ?? getNetworkIdsMap().onekeyall,
      keywords,
      limit,
      accountAddress: !networkUtils.isAllNetwork({
        networkId: networkId ?? getNetworkIdsMap().onekeyall,
      })
        ? accountAddress
        : undefined,
      accountNetworkId,
      skipReservationValue: true,
      onlyAccountTokens,
    };
    if (!isAllNetworkFetchAccountTokens) {
      this._tokenListAbortController = new AbortController();
    }
    const client = await this.getClient(EServiceEndpointEnum.Swap);
    if (accountId && accountAddress && networkId) {
      const accountAddressForAccountId =
        await this.backgroundApi.serviceAccount.getAccountAddressForApi({
          accountId,
          networkId,
        });
      if (accountAddressForAccountId === accountAddress) {
        params.accountXpub =
          await this.backgroundApi.serviceAccount.getAccountXpub({
            accountId,
            networkId,
          });
      }
      const inscriptionProtection =
        await this.backgroundApi.serviceSetting.getInscriptionProtection();
      const checkInscriptionProtectionEnabled =
        await this.backgroundApi.serviceSetting.checkInscriptionProtectionEnabled(
          {
            networkId,
            accountId,
          },
        );
      const withCheckInscription =
        checkInscriptionProtectionEnabled && inscriptionProtection;
      params.withCheckInscription = withCheckInscription;
    }
    try {
      const { data } = await client.get<IFetchResponse<ISwapToken[]>>(
        '/swap/v1/tokens',
        {
          params,
          signal: !isAllNetworkFetchAccountTokens
            ? this._tokenListAbortController?.signal
            : undefined,
          headers:
            await this.backgroundApi.serviceAccountProfile._getWalletTypeHeader(
              {
                accountId,
              },
            ),
        },
      );
      return data?.data ?? [];
    } catch (e) {
      if (axios.isCancel(e)) {
        throw new Error('swap fetch token cancel', {
          cause: ESwapFetchCancelCause.SWAP_TOKENS_CANCEL,
        });
      } else {
        const error = e as { code: number; message: string; requestId: string };
        void this.backgroundApi.serviceApp.showToast({
          method: 'error',
          title: error?.message,
          message: error?.requestId,
        });
        return [];
      }
    }
  }

  @backgroundMethod()
  async getSupportSwapAllAccounts({
    indexedAccountId,
    otherWalletTypeAccountId,
    swapSupportNetworks,
  }: {
    indexedAccountId?: string;
    otherWalletTypeAccountId?: string;
    swapSupportNetworks: ISwapNetwork[];
  }) {
    const accountIdKey =
      indexedAccountId ?? otherWalletTypeAccountId ?? 'noAccountId';
    let swapSupportAccounts: IAllNetworkAccountInfo[] = [];
    if (indexedAccountId || otherWalletTypeAccountId) {
      try {
        const allNetAccountId = indexedAccountId
          ? (
              await this.backgroundApi.serviceAccount.getMockedAllNetworkAccount(
                {
                  indexedAccountId,
                },
              )
            ).id
          : otherWalletTypeAccountId ?? '';
        const { accountsInfo } =
          await this.backgroundApi.serviceAllNetwork.getAllNetworkAccounts({
            accountId: allNetAccountId,
            networkId: getNetworkIdsMap().onekeyall,
          });
        const noBtcAccounts = accountsInfo.filter(
          (networkDataString) =>
            !networkUtils.isBTCNetwork(networkDataString.networkId),
        );
        const btcAccounts = accountsInfo.filter((networkDataString) =>
          networkUtils.isBTCNetwork(networkDataString.networkId),
        );
        const btcAccountsWithMatchDeriveType = await Promise.all(
          btcAccounts.map(async (networkData) => {
            const globalDeriveType =
              await this.backgroundApi.serviceNetwork.getGlobalDeriveTypeOfNetwork(
                {
                  networkId: networkData.networkId,
                },
              );
            const btcNet = getBtcForkNetwork(
              networkUtils.getNetworkImpl({
                networkId: networkData.networkId,
              }),
            );
            const addressValidate = validateBtcAddress({
              network: btcNet,
              address: networkData.apiAddress,
            });
            if (addressValidate.isValid && addressValidate.encoding) {
              const deriveTypeRes =
                await this.backgroundApi.serviceNetwork.getDeriveTypeByAddressEncoding(
                  {
                    networkId: networkData.networkId,
                    encoding: addressValidate.encoding,
                  },
                );
              if (deriveTypeRes === globalDeriveType) {
                return networkData;
              }
            }
            return null;
          }),
        );
        const filteredAccounts = [
          ...noBtcAccounts,
          ...btcAccountsWithMatchDeriveType.filter(Boolean),
        ];
        swapSupportAccounts = filteredAccounts.filter((networkDataString) => {
          const { networkId: accountNetworkId } = networkDataString;
          return swapSupportNetworks.find(
            (network) => network.networkId === accountNetworkId,
          );
        });
      } catch (e) {
        console.error(e);
      }
    }
    return { accountIdKey, swapSupportAccounts };
  }

  @backgroundMethod()
  async fetchSwapTokenDetails({
    networkId,
    accountAddress,
    accountId,
    contractAddress,
    direction,
  }: {
    networkId: string;
    accountAddress?: string;
    accountId?: string;
    contractAddress: string;
    direction?: ESwapDirectionType;
  }): Promise<ISwapToken[] | undefined> {
    await this.cancelFetchTokenDetail(direction);
    const params: IFetchTokenDetailParams = {
      protocol: EProtocolOfExchange.SWAP,
      networkId,
      accountAddress,
      contractAddress,
    };
    if (direction) {
      if (direction === ESwapDirectionType.FROM) {
        this._tokenDetailAbortControllerMap.from = new AbortController();
      } else if (direction === ESwapDirectionType.TO) {
        this._tokenDetailAbortControllerMap.to = new AbortController();
      }
    }
    const client = await this.getClient(EServiceEndpointEnum.Swap);
    if (accountId && accountAddress && networkId) {
      const accountAddressForAccountId =
        await this.backgroundApi.serviceAccount.getAccountAddressForApi({
          accountId,
          networkId,
        });
      if (accountAddressForAccountId === accountAddress) {
        params.xpub = await this.backgroundApi.serviceAccount.getAccountXpub({
          accountId,
          networkId,
        });
      }
      const inscriptionProtection =
        await this.backgroundApi.serviceSetting.getInscriptionProtection();
      const checkInscriptionProtectionEnabled =
        await this.backgroundApi.serviceSetting.checkInscriptionProtectionEnabled(
          {
            networkId,
            accountId,
          },
        );
      const withCheckInscription =
        checkInscriptionProtectionEnabled && inscriptionProtection;
      params.withCheckInscription = withCheckInscription;
    }
    const { data } = await client.get<IFetchResponse<ISwapToken[]>>(
      '/swap/v1/token/detail',
      {
        params,
        signal:
          direction === ESwapDirectionType.FROM
            ? this._tokenDetailAbortControllerMap.from?.signal
            : this._tokenDetailAbortControllerMap.to?.signal,
        headers:
          await this.backgroundApi.serviceAccountProfile._getWalletTypeHeader({
            accountId,
          }),
      },
    );
    return data?.data;
  }

@backgroundMethod()
async fetchQuotes({
  fromToken,
  toToken,
  fromTokenAmount,
  slippagePercentage,
  accountId,
}: {
  fromToken: ISwapToken;
  toToken: ISwapToken;
  fromTokenAmount: string;
  slippagePercentage: number;
  accountId?: string;
}): Promise<IFetchQuoteResult[]> {
  console.log('[OKX-QUOTE] 🔄 fetchQuotes called with', {
    fromToken,
    toToken,
    fromTokenAmount,
    slippagePercentage,
    accountId,
  });

  this._quoteAbortController?.abort();
  this._quoteAbortController = new AbortController();

  const chainId = Number(fromToken.networkId.split('--').pop() ?? NaN);
  if (Number.isNaN(chainId)) {
    console.error('[OKX-QUOTE] ❌ invalid chainId:', fromToken.networkId);
    return [];
  }

  const amountMinimal = new BigNumber(fromTokenAmount)
    .shiftedBy(fromToken.decimals)
    .toFixed(0);

  const ZERO_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const okxParams = {
    chainId,
    fromTokenAddress: fromToken.isNative
      ? ZERO_ADDRESS
      : fromToken.contractAddress,
    toTokenAddress: toToken.isNative
      ? ZERO_ADDRESS
      : toToken.contractAddress,
    amount: amountMinimal,
  };
  console.log('[OKX-QUOTE]   → okxParams:', okxParams);

  const path = `${OKX_API_PATH_PREFIX}/quote`;
  const qs = new URLSearchParams({
    chainId: okxParams.chainId.toString(),
    fromTokenAddress: okxParams.fromTokenAddress,
    toTokenAddress: okxParams.toTokenAddress,
    amount: okxParams.amount,
  }).toString();
  const headers = signOkxRequest({
    method: 'GET',
    requestPath: path,
    queryString: qs,
  });

  const resp = await axios.get(`${OKX_BASE_URL}${path}`, {
    params: okxParams,
    headers,
    signal: this._quoteAbortController.signal,
  });
  console.log('[OKX-QUOTE]   ← OKX response:', resp.data);

  if (resp.data.code !== '0' || !Array.isArray(resp.data.data)) {
    return [];
  }
  const q = resp.data.data[0];

  return [
    {
      protocol: EProtocolOfExchange.SWAP,
      info: { provider: 'okx', providerName: 'OKX DEX' },
      fromAmount: q.fromTokenAmount,
      toAmount: q.toTokenAmount,
      fee: {
        percentageFee: 0,
        otherFeeInfos: [
          { token: 'USD', amount: String(q.tradeFee) },
          {
            token: q.estimateGasFeeTokenSymbol || toToken.symbol,
            amount: String(q.estimateGasFee),
          },
        ],
      },
      fromTokenInfo: {
        ...fromToken,
        contractAddress: q.fromToken.tokenContractAddress,
        decimals: q.fromToken.decimals,
        symbol: q.fromToken.tokenSymbol,
      },
      toTokenInfo: {
        ...toToken,
        contractAddress: q.toToken.tokenContractAddress,
        decimals: q.toToken.decimals,
        symbol: q.toToken.tokenSymbol,
      },
    },
  ];
}
  // async fetchQuotes({
  //   fromToken,
  //   toToken,
  //   fromTokenAmount,
  //   userAddress,
  //   slippagePercentage,
  //   autoSlippage,
  //   blockNumber,
  //   receivingAddress,
  //   accountId,
  //   protocol,
  //   expirationTime,
  //   limitPartiallyFillable,
  //   kind,
  //   toTokenAmount,
  //   userMarketPriceRate,
  // }: {
  //   fromToken: ISwapToken;
  //   toToken: ISwapToken;
  //   fromTokenAmount?: string;
  //   userAddress?: string;
  //   slippagePercentage: number;
  //   autoSlippage?: boolean;
  //   receivingAddress?: string;
  //   blockNumber?: number;
  //   accountId?: string;
  //   expirationTime?: number;
  //   protocol: ESwapTabSwitchType;
  //   limitPartiallyFillable?: boolean;
  //   kind?: ESwapQuoteKind;
  //   toTokenAmount?: string;
  //   userMarketPriceRate?: string;
  // }): Promise<IFetchQuoteResult[]> {
  //   await this.cancelFetchQuotes();
  //   const denyCrossChainProvider = await this.getDenyCrossChainProvider(
  //     fromToken.networkId,
  //     toToken.networkId,
  //   );
  //   const denySingleSwapProvider = await this.getDenySingleSwapProvider(
  //     fromToken.networkId,
  //     toToken.networkId,
  //   );
  //   const params: IFetchQuotesParams = {
  //     fromTokenAddress: fromToken.contractAddress,
  //     toTokenAddress: toToken.contractAddress,
  //     fromTokenAmount,
  //     fromNetworkId: fromToken.networkId,
  //     toNetworkId: toToken.networkId,
  //     protocol:
  //       protocol === ESwapTabSwitchType.LIMIT
  //         ? EProtocolOfExchange.LIMIT
  //         : EProtocolOfExchange.SWAP,
  //     userAddress,
  //     slippagePercentage,
  //     autoSlippage,
  //     blockNumber,
  //     receivingAddress,
  //     expirationTime,
  //     limitPartiallyFillable,
  //     kind,
  //     toTokenAmount,
  //     userMarketPriceRate,
  //     denyCrossChainProvider,
  //     denySingleSwapProvider,
  //   };
  //   this._quoteAbortController = new AbortController();
  //   const client = await this.getClient(EServiceEndpointEnum.Swap);
  //   const fetchUrl = '/swap/v1/quote';
  //   try {
  //     const { data } = await client.get<IFetchResponse<IFetchQuoteResult[]>>(
  //       fetchUrl,
  //       {
  //         params,
  //         signal: this._quoteAbortController.signal,
  //         headers:
  //           await this.backgroundApi.serviceAccountProfile._getWalletTypeHeader(
  //             {
  //               accountId,
  //             },
  //           ),
  //       },
  //     );
  //     this._quoteAbortController = undefined;

  //     if (data?.code === 0 && data?.data?.length) {
  //       return data?.data;
  //     }
  //   } catch (e) {
  //     if (axios.isCancel(e)) {
  //       throw new Error('swap fetch quote cancel', {
  //         cause: ESwapFetchCancelCause.SWAP_QUOTE_CANCEL,
  //       });
  //     }
  //   }
  //   return [
  //     {
  //       info: { provider: '', providerName: '' },
  //       fromTokenInfo: fromToken,
  //       toTokenInfo: toToken,
  //     },
  //   ]; //  no support providers
  // }

private _quotePollingTimeout?: ReturnType<typeof setTimeout>;

@backgroundMethod()
async fetchQuotesEvents({
  fromToken,
  toToken,
  fromTokenAmount,
  slippagePercentage,
  accountId,
}: {
  fromToken: ISwapToken;
  toToken: ISwapToken;
  fromTokenAmount?: string;
  slippagePercentage: number;
  accountId?: string;
}): Promise<void> {
  if (!fromTokenAmount) return;

  const ZERO_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const fromAddr = fromToken.isNative
    ? ZERO_ADDRESS
    : fromToken.contractAddress;
  const toAddr = toToken.isNative
    ? ZERO_ADDRESS
    : toToken.contractAddress;
  const chainId = Number(fromToken.networkId.split('--')[1]);
  if (Number.isNaN(chainId)) {
    console.error('[OKX-QUOTE] ❌ invalid chainId:', fromToken.networkId);
    return;
  }

  const requestParams: IFetchQuotesParams = {
    fromTokenAddress: fromAddr,
    toTokenAddress: toAddr,
    fromTokenAmount,
    fromNetworkId: fromToken.networkId,
    toNetworkId: toToken.networkId,
    protocol: EProtocolOfExchange.SWAP,
    slippagePercentage,
  };

  // — OPEN —
  appEventBus.emit(EAppEventBusNames.SwapQuoteEvent, {
    type: 'open',
    event: { type: 'open' } as IEventSourceOpenEvent,
    params: requestParams,
    tokenPairs: { fromToken, toToken },
    accountId,
  });

  let quotes: IFetchQuoteResult[] = [];
  let delay = 15000;

  try {
    console.log('[OKX-QUOTE] 🔄 SSE → fetchQuotes()', {
      fromAddr,
      toAddr,
      fromTokenAmount,
      slippagePercentage,
      accountId,
    });

    quotes = await this.fetchQuotes({
      fromToken,
      toToken,
      fromTokenAmount,
      slippagePercentage,
      accountId,
    });

    if (!quotes.length) {
      quotes = [
        {
          info: { provider: '', providerName: '' },
          fromTokenInfo: fromToken,
          toTokenInfo: toToken,
        },
      ];
    }

    // — MESSAGE —
    appEventBus.emit(EAppEventBusNames.SwapQuoteEvent, {
      type: 'message',
      event: {
        type: 'message',
        data: JSON.stringify(quotes),
        lastEventId: null,
        url: `${OKX_BASE_URL}${OKX_API_PATH_PREFIX}/quote`,
      } as IEventSourceMessageEvent,
      params: requestParams,
      tokenPairs: { fromToken, toToken },
      accountId,
    });
  } catch (e: any) {
    if (axios.isAxiosError(e) && e.response?.status === 429) {
      console.warn('[OKX-QUOTE] ⚠️ rate limited, backoff');
      delay = 10000;
    } else {
      console.error('[OKX-QUOTE] ❌ error:', e);
      // — ERROR —
      appEventBus.emit(EAppEventBusNames.SwapQuoteEvent, {
        type: 'error',
        event: {
          type: 'error',
          message: e?.message ?? 'OKX quote error',
        } as IEventSourceErrorEvent,
        params: requestParams,
        tokenPairs: { fromToken, toToken },
        accountId,
      });
    }
  } finally {
    // — DONE —
    appEventBus.emit(EAppEventBusNames.SwapQuoteEvent, {
      type: 'done',
      event: { type: 'done' } as IEventSourceDoneEvent,
      params: requestParams,
      tokenPairs: { fromToken, toToken },
      accountId,
    });
    console.log(`[OKX-QUOTE] scheduling next in ${delay / 1000}s`);
    setTimeout(() => {
      void this.fetchQuotesEvents({
        fromToken,
        toToken,
        fromTokenAmount,
        slippagePercentage,
        accountId,
      });
    }, delay);
  }
}

  async getDenyCrossChainProvider(fromNetworkId: string, toNetworkId: string) {
    if (fromNetworkId === toNetworkId) {
      return undefined;
    }
    const { bridgeProviderManager } = await inAppNotificationAtom.get();
    const denyBridges = bridgeProviderManager.filter((item) => !item.enable);
    if (!denyBridges?.length) {
      return undefined;
    }
    return denyBridges.map((item) => item.providerInfo.provider).join(',');
  }

  async getDenySingleSwapProvider(fromNetworkId: string, toNetworkId: string) {
    if (fromNetworkId !== toNetworkId) {
      return undefined;
    }
    const { swapProviderManager } = await inAppNotificationAtom.get();
    const denyDexs = swapProviderManager.filter((item) => !item.enable);
    let denyDexArr = denyDexs?.map((item) => item.providerInfo.provider);
    const denyDexNetworks = swapProviderManager.filter((item) => {
      if (item.enable) {
        const netDisEnable = item.disableNetworks?.find(
          (net) => net.networkId === fromNetworkId,
        );
        if (netDisEnable) {
          return true;
        }
        return false;
      }
      return false;
    });
    if (denyDexNetworks?.length) {
      denyDexArr = [
        ...(denyDexArr ?? []),
        ...denyDexNetworks.map((item) => item.providerInfo.provider),
      ];
    }
    return denyDexArr?.join(',');
  }

  @backgroundMethod()
  @toastIfError()
  async fetchBuildTx({
    fromToken,
    toToken,
    fromTokenAmount,
    userAddress,
    toTokenAmount,
    provider,
    receivingAddress,
    slippagePercentage,
    quoteResultCtx,
    accountId,
    protocol,
    kind,
    walletType,
  }: {
    fromToken: ISwapToken;
    toToken: ISwapToken;
    toTokenAmount: string;
    fromTokenAmount: string;
    provider: string;
    userAddress: string;
    receivingAddress: string;
    slippagePercentage: number;
    accountId?: string;
    quoteResultCtx?: any;
    protocol: EProtocolOfExchange;
    kind: ESwapQuoteKind;
    walletType?: string;
  }): Promise<IFetchBuildTxResponse | undefined> {
    const params: IFetchBuildTxParams = {
      fromTokenAddress: fromToken.contractAddress,
      toTokenAddress: toToken.contractAddress,
      fromTokenAmount,
      toTokenAmount,
      fromNetworkId: fromToken.networkId,
      toNetworkId: toToken.networkId,
      protocol,
      provider,
      userAddress,
      receivingAddress,
      slippagePercentage,
      quoteResultCtx,
      kind,
      walletType,
    };
    try {
      const client = await this.getClient(EServiceEndpointEnum.Swap);
      const { data } = await client.post<IFetchResponse<IFetchBuildTxResponse>>(
        '/swap/v1/build-tx',
        params,
        {
          headers:
            await this.backgroundApi.serviceAccountProfile._getWalletTypeHeader(
              {
                accountId,
              },
            ),
        },
      );
      return data?.data;
    } catch (e) {
      const error = e as { code: number; message: string; requestId: string };
      void this.backgroundApi.serviceApp.showToast({
        method: 'error',
        title: error?.message,
        message: error?.requestId,
      });
    }
  }

  @backgroundMethod()
  // @toastIfError()
  async fetchTxState({
    txId,
    provider,
    networkId,
    protocol,
    toTokenAddress,
    receivedAddress,
    orderId,
    ctx,
  }: {
    txId?: string;
    toTokenAddress?: string;
    receivedAddress?: string;
    networkId: string;
    protocol?: EProtocolOfExchange;
    provider?: string;
    orderId?: string;
    ctx?: any;
  }): Promise<IFetchSwapTxHistoryStatusResponse> {
    const params = {
      txId,
      protocol,
      provider,
      ctx,
      networkId,
      toTokenAddress,
      receivedAddress,
      orderId,
    };
    const client = await this.getClient(EServiceEndpointEnum.Swap);

    const { data } = await client.post<
      IFetchResponse<IFetchSwapTxHistoryStatusResponse>
    >('/swap/v1/state-tx', params);
    return data?.data ?? { state: ESwapTxHistoryStatus.PENDING };
  }

  @backgroundMethod()
  async checkSupportSwap({ networkId }: { networkId: string }) {
    const client = await this.getClient(EServiceEndpointEnum.Swap);
    const resp = await client.get<{
      data: ISwapCheckSupportResponse[];
    }>(`/swap/v1/check-support`, {
      params: {
        networkId,
        protocol: EProtocolOfExchange.SWAP,
      },
    });
    return resp.data.data[0];
  }

  @backgroundMethod()
  async fetchApproveAllowance({
    networkId,
    tokenAddress,
    spenderAddress,
    walletAddress,
    accountId,
  }: {
    networkId: string;
    tokenAddress: string;
    spenderAddress: string;
    walletAddress: string;
    accountId?: string;
  }) {
    const params = {
      networkId,
      tokenAddress,
      spenderAddress,
      walletAddress,
    };
    const client = await this.getClient(EServiceEndpointEnum.Swap);

    const { data } = await client.get<IFetchResponse<string>>(
      '/swap/v1/allowance',
      {
        params,
        headers:
          await this.backgroundApi.serviceAccountProfile._getWalletTypeHeader({
            accountId,
          }),
      },
    );
    return data?.data;
  }

  // swap approving transaction
  @backgroundMethod()
  async getApprovingTransaction() {
    const { swapApprovingTransaction } = await inAppNotificationAtom.get();
    return swapApprovingTransaction;
  }

  @backgroundMethod()
  async setApprovingTransaction(item?: ISwapApproveTransaction) {
    await inAppNotificationAtom.set((pre) => ({
      ...pre,
      swapApprovingTransaction: item,
    }));
  }

  // --- swap provider manager
  @backgroundMethod()
  async getSwapProviderManager() {
    const client = await this.getClient(EServiceEndpointEnum.Swap);
    const resp = await client.get<{
      data: ISwapServiceProvider[];
    }>(`/swap/v1/providers/list`);
    return resp.data.data;
  }

  @backgroundMethod()
  async updateSwapProviderManager(
    data: ISwapProviderManager[],
    isBridge: boolean,
  ) {
    if (isBridge) {
      await this.backgroundApi.simpleDb.swapConfigs.setBridgeProviderManager(
        data,
      );
      await inAppNotificationAtom.set((pre) => ({
        ...pre,
        bridgeProviderManager: data,
      }));
    } else {
      await this.backgroundApi.simpleDb.swapConfigs.setSwapProviderManager(
        data,
      );
      await inAppNotificationAtom.set((pre) => ({
        ...pre,
        swapProviderManager: data,
      }));
    }
  }

  // --- swap history
  @backgroundMethod()
  async fetchSwapHistoryListFromSimple() {
    const histories =
      await this.backgroundApi.simpleDb.swapHistory.getSwapHistoryList();
    return histories.sort((a, b) => b.date.created - a.date.created);
  }

  @backgroundMethod()
  async syncSwapHistoryPendingList() {
    const histories = await this.fetchSwapHistoryListFromSimple();
    const pendingHistories = histories.filter(
      (history) =>
        history.status === ESwapTxHistoryStatus.PENDING ||
        history.status === ESwapTxHistoryStatus.CANCELING,
    );
    await inAppNotificationAtom.set((pre) => ({
      ...pre,
      swapHistoryPendingList: [...pendingHistories],
    }));
  }

  @backgroundMethod()
  async addSwapHistoryItem(item: ISwapTxHistory) {
    await this.backgroundApi.simpleDb.swapHistory.addSwapHistoryItem(item);
    await inAppNotificationAtom.set((pre) => {
      if (
        !pre.swapHistoryPendingList.find((i) =>
          item.txInfo.useOrderId
            ? i.txInfo.orderId === item.txInfo.orderId
            : i.txInfo.txId === item.txInfo.txId,
        )
      ) {
        return {
          ...pre,
          swapHistoryPendingList: [...pre.swapHistoryPendingList, item],
        };
      }
      return pre;
    });
  }

  @backgroundMethod()
  async updateSwapHistoryTx({
    oldTxId,
    newTxId,
    status,
  }: {
    oldTxId: string;
    newTxId: string;
    status: ESwapTxHistoryStatus;
  }) {
    const { swapHistoryPendingList } = await inAppNotificationAtom.get();
    const oldHistoryItemIndex = swapHistoryPendingList.findIndex(
      (item) => item.txInfo.txId === oldTxId,
    );
    if (oldHistoryItemIndex !== -1) {
      const newHistoryItem = swapHistoryPendingList[oldHistoryItemIndex];
      const updated = Date.now();
      newHistoryItem.date = { ...newHistoryItem.date, updated };
      newHistoryItem.txInfo.txId = newTxId;
      newHistoryItem.status = status;
      await this.backgroundApi.simpleDb.swapHistory.updateSwapHistoryItem(
        newHistoryItem,
        oldTxId,
      );
      await inAppNotificationAtom.set((pre) => {
        const newPendingList = [...pre.swapHistoryPendingList];
        newPendingList[oldHistoryItemIndex] = newHistoryItem;
        return {
          ...pre,
          swapHistoryPendingList: [...newPendingList],
        };
      });
      return;
    }
    const approvingTransaction = await this.getApprovingTransaction();
    if (
      approvingTransaction &&
      approvingTransaction.status === ESwapApproveTransactionStatus.PENDING &&
      approvingTransaction.txId === oldTxId
    ) {
      approvingTransaction.txId = newTxId;
      await this.setApprovingTransaction(approvingTransaction);
    }
  }

  @backgroundMethod()
  async updateSwapHistoryItem(item: ISwapTxHistory) {
    const { swapHistoryPendingList } = await inAppNotificationAtom.get();
    const index = swapHistoryPendingList.findIndex((i) =>
      item.txInfo.useOrderId
        ? i.txInfo.orderId === item.txInfo.orderId
        : i.txInfo.txId === item.txInfo.txId,
    );
    if (index !== -1) {
      const updated = Date.now();
      item.date = { ...item.date, updated };
      const oldItem = swapHistoryPendingList[index];
      if (
        oldItem.status === ESwapTxHistoryStatus.CANCELING &&
        item.status === ESwapTxHistoryStatus.SUCCESS
      ) {
        item.status = ESwapTxHistoryStatus.CANCELED;
      }
      if (
        item.txInfo.receiverTransactionId &&
        !this._crossChainReceiveTxBlockNotificationMap[
          item.txInfo.receiverTransactionId
        ]
      ) {
        void this.backgroundApi.serviceNotification.blockNotificationForTxId({
          networkId: item.baseInfo.toToken.networkId,
          tx: item.txInfo.receiverTransactionId,
        });
        this._crossChainReceiveTxBlockNotificationMap[
          item.txInfo.receiverTransactionId
        ] = true;
      }
      await this.backgroundApi.simpleDb.swapHistory.updateSwapHistoryItem(item);
      await inAppNotificationAtom.set((pre) => {
        const newPendingList = [...pre.swapHistoryPendingList];
        newPendingList[index] = item;
        return {
          ...pre,
          swapHistoryPendingList: [...newPendingList],
        };
      });
      if (item.status !== ESwapTxHistoryStatus.PENDING) {
        let fromAmountFinal = item.baseInfo.fromAmount;
        if (item.swapInfo.otherFeeInfos?.length) {
          item.swapInfo.otherFeeInfos.forEach((extraFeeInfo) => {
            if (
              equalTokenNoCaseSensitive({
                token1: extraFeeInfo.token,
                token2: item.baseInfo.fromToken,
              })
            ) {
              fromAmountFinal = new BigNumber(fromAmountFinal)
                .plus(extraFeeInfo.amount ?? 0)
                .toFixed();
            }
          });
        }
        void this.backgroundApi.serviceApp.showToast({
          method:
            item.status === ESwapTxHistoryStatus.SUCCESS ||
            item.status === ESwapTxHistoryStatus.PARTIALLY_FILLED
              ? 'success'
              : 'error',
          title: appLocale.intl.formatMessage({
            id:
              item.status === ESwapTxHistoryStatus.SUCCESS ||
              item.status === ESwapTxHistoryStatus.PARTIALLY_FILLED
                ? ETranslations.swap_page_toast_swap_successful
                : ETranslations.swap_page_toast_swap_failed,
          }),
          message: `${
            numberFormat(item.baseInfo.fromAmount, {
              formatter: 'balance',
            }) as string
          } ${item.baseInfo.fromToken.symbol} → ${
            numberFormat(item.baseInfo.toAmount, {
              formatter: 'balance',
            }) as string
          } ${item.baseInfo.toToken.symbol}`,
        });
      }
    }
  }

  @backgroundMethod()
  async cleanSwapHistoryItems(statuses?: ESwapTxHistoryStatus[]) {
    await this.backgroundApi.simpleDb.swapHistory.deleteSwapHistoryItem(
      statuses,
    );
    const inAppNotification = await inAppNotificationAtom.get();
    const deleteHistoryIds = inAppNotification.swapHistoryPendingList
      .filter((item) => statuses?.includes(item.status))
      .map((item) =>
        item.txInfo.useOrderId ? item.txInfo.orderId : item.txInfo.txId,
      );
    await inAppNotificationAtom.set((pre) => ({
      ...pre,
      swapHistoryPendingList: statuses
        ? pre.swapHistoryPendingList.filter(
            (item) => !statuses?.includes(item.status),
          )
        : [],
    }));
    await Promise.all(
      deleteHistoryIds.map((id) => this.cleanHistoryStateIntervals(id)),
    );
  }

  @backgroundMethod()
  async cleanOneSwapHistory(txInfo: {
    txId?: string;
    useOrderId?: boolean;
    orderId?: string;
  }) {
    await this.backgroundApi.simpleDb.swapHistory.deleteOneSwapHistory(txInfo);
    const deleteHistoryId = txInfo.useOrderId
      ? txInfo.orderId ?? ''
      : txInfo.txId ?? '';
    await inAppNotificationAtom.set((pre) => ({
      ...pre,
      swapHistoryPendingList: pre.swapHistoryPendingList.filter(
        (item) => item.txInfo.txId !== deleteHistoryId,
      ),
    }));
    await this.cleanHistoryStateIntervals(deleteHistoryId);
  }

  @backgroundMethod()
  async cleanHistoryStateIntervals(historyId?: string) {
    if (!historyId) {
      this.historyCurrentStateIntervalIds = [];
      await Promise.all(
        Object.keys(this.historyStateIntervals).map(async (id) => {
          clearInterval(this.historyStateIntervals[id]);
          delete this.historyStateIntervals[id];
          delete this.historyStateIntervalCountMap[id];
        }),
      );
    } else if (this.historyStateIntervals[historyId]) {
      clearInterval(this.historyStateIntervals[historyId]);
      this.historyCurrentStateIntervalIds =
        this.historyCurrentStateIntervalIds.filter((id) => id !== historyId);
      delete this.historyStateIntervals[historyId];
      delete this.historyStateIntervalCountMap[historyId];
    }
  }

  async swapHistoryStatusRunFetch(swapTxHistory: ISwapTxHistory) {
    let enableInterval = true;
    let currentSwapTxHistory = cloneDeep(swapTxHistory);
    try {
      const txStatusRes = await this.fetchTxState({
        txId:
          currentSwapTxHistory.txInfo.txId ??
          currentSwapTxHistory.txInfo.orderId ??
          '',
        provider: currentSwapTxHistory.swapInfo.provider.provider,
        protocol: EProtocolOfExchange.SWAP,
        networkId: currentSwapTxHistory.baseInfo.fromToken.networkId,
        ctx: currentSwapTxHistory.ctx,
        toTokenAddress: currentSwapTxHistory.baseInfo.toToken.contractAddress,
        receivedAddress: currentSwapTxHistory.txInfo.receiver,
        orderId: currentSwapTxHistory.swapInfo.orderId,
      });
      if (
        txStatusRes?.state !== ESwapTxHistoryStatus.PENDING ||
        txStatusRes.crossChainStatus !== currentSwapTxHistory.crossChainStatus
      ) {
        currentSwapTxHistory = {
          ...currentSwapTxHistory,
          status: txStatusRes.state,
          swapInfo: {
            ...currentSwapTxHistory.swapInfo,
            surplus:
              txStatusRes.surplus ?? currentSwapTxHistory.swapInfo.surplus,
            chainFlipExplorerUrl:
              txStatusRes.chainFlipExplorerUrl ??
              currentSwapTxHistory.swapInfo?.chainFlipExplorerUrl,
          },
          swapOrderHash:
            txStatusRes.swapOrderHash ?? currentSwapTxHistory.swapOrderHash,
          crossChainStatus:
            txStatusRes.crossChainStatus ??
            currentSwapTxHistory?.crossChainStatus,
          txInfo: {
            ...currentSwapTxHistory.txInfo,
            txId: txStatusRes.txId ?? currentSwapTxHistory.txInfo.txId,
            receiverTransactionId: txStatusRes.crossChainReceiveTxHash || '',
            gasFeeInNative: txStatusRes.gasFee
              ? txStatusRes.gasFee
              : currentSwapTxHistory.txInfo.gasFeeInNative,
            gasFeeFiatValue: txStatusRes.gasFeeFiatValue
              ? txStatusRes.gasFeeFiatValue
              : currentSwapTxHistory.txInfo.gasFeeFiatValue,
          },
          baseInfo: {
            ...currentSwapTxHistory.baseInfo,
            toAmount: txStatusRes.dealReceiveAmount
              ? txStatusRes.dealReceiveAmount
              : currentSwapTxHistory.baseInfo.toAmount,
          },
        };
        await this.updateSwapHistoryItem(currentSwapTxHistory);
        if (
          currentSwapTxHistory.crossChainStatus ===
            ESwapCrossChainStatus.FROM_SUCCESS ||
          currentSwapTxHistory.crossChainStatus ===
            ESwapCrossChainStatus.TO_SUCCESS ||
          currentSwapTxHistory.crossChainStatus ===
            ESwapCrossChainStatus.REFUNDED ||
          (!currentSwapTxHistory.crossChainStatus &&
            (txStatusRes?.state === ESwapTxHistoryStatus.SUCCESS ||
              txStatusRes?.state === ESwapTxHistoryStatus.PARTIALLY_FILLED))
        ) {
          appEventBus.emit(EAppEventBusNames.SwapTxHistoryStatusUpdate, {
            fromToken: currentSwapTxHistory.baseInfo.fromToken,
            toToken: currentSwapTxHistory.baseInfo.toToken,
            status: txStatusRes.state,
            crossChainStatus: txStatusRes.crossChainStatus,
          });
        }
        if (txStatusRes?.state !== ESwapTxHistoryStatus.PENDING) {
          enableInterval = false;
          const deleteHistoryId = currentSwapTxHistory.txInfo.useOrderId
            ? currentSwapTxHistory.txInfo.orderId ?? ''
            : currentSwapTxHistory.txInfo.txId ?? '';
          await this.cleanHistoryStateIntervals(deleteHistoryId);
        }
      }
    } catch (e) {
      const error = e as { message?: string };
      console.error('Swap History Status Fetch Error', error?.message);
    } finally {
      const keyId = currentSwapTxHistory.txInfo.useOrderId
        ? currentSwapTxHistory.txInfo.orderId ?? ''
        : currentSwapTxHistory.txInfo.txId ?? '';
      if (
        enableInterval &&
        this.historyCurrentStateIntervalIds.includes(keyId)
      ) {
        this.historyStateIntervalCountMap[keyId] =
          (this.historyStateIntervalCountMap[keyId] ?? 0) + 1;
        this.historyStateIntervals[keyId] = setTimeout(() => {
          void this.swapHistoryStatusRunFetch(currentSwapTxHistory);
        }, swapHistoryStateFetchInterval * (Math.floor((this.historyStateIntervalCountMap[keyId] ?? 0) / swapHistoryStateFetchRiceIntervalCount) + 1));
      }
    }
  }

  @backgroundMethod()
  async swapHistoryStatusFetchLoop() {
    const { swapHistoryPendingList } = await inAppNotificationAtom.get();
    const statusPendingList = swapHistoryPendingList.filter(
      (item) =>
        item.status === ESwapTxHistoryStatus.PENDING ||
        item.status === ESwapTxHistoryStatus.CANCELING,
    );
    const newHistoryStatePendingList = statusPendingList.filter(
      (item) =>
        !this.historyCurrentStateIntervalIds.includes(
          item.txInfo.useOrderId
            ? item.txInfo.orderId ?? ''
            : item.txInfo.txId ?? '',
        ),
    );
    if (!newHistoryStatePendingList.length) return;
    await Promise.all(
      newHistoryStatePendingList.map(async (swapTxHistory) => {
        this.historyCurrentStateIntervalIds = [
          ...this.historyCurrentStateIntervalIds,
          swapTxHistory.txInfo.useOrderId
            ? swapTxHistory.txInfo.orderId ?? ''
            : swapTxHistory.txInfo.txId ?? '',
        ];
        await this.swapHistoryStatusRunFetch(swapTxHistory);
      }),
    );
  }

  @backgroundMethod()
  async swapRecentTokenSync() {
    const recentTokenPairs =
      await this.backgroundApi.simpleDb.swapConfigs.getRecentTokenPairs();

    // To avoid getting the token balance information of the last transaction, we need to get the token base information again
    const recentTokenPairsBase = recentTokenPairs.map((tokenPairs) => {
      const { fromToken, toToken } = tokenPairs;
      return {
        fromToken: {
          networkId: fromToken.networkId,
          contractAddress: fromToken.contractAddress,
          symbol: fromToken.symbol,
          decimals: fromToken.decimals,
          name: fromToken.name,
          logoURI: fromToken.logoURI,
          networkLogoURI: fromToken.networkLogoURI,
          isNative: fromToken.isNative,
        },
        toToken: {
          networkId: toToken.networkId,
          contractAddress: toToken.contractAddress,
          symbol: toToken.symbol,
          decimals: toToken.decimals,
          name: toToken.name,
          logoURI: toToken.logoURI,
          networkLogoURI: toToken.networkLogoURI,
          isNative: toToken.isNative,
        },
      };
    });
    await inAppNotificationAtom.set((pre) => ({
      ...pre,
      swapRecentTokenPairs: recentTokenPairsBase,
    }));
  }

  @backgroundMethod()
  async swapRecentTokenPairsUpdate({
    fromToken,
    toToken,
  }: {
    fromToken: ISwapToken;
    toToken: ISwapToken;
  }) {
    let { swapRecentTokenPairs: recentTokenPairs } =
      await inAppNotificationAtom.get();
    const isExit = recentTokenPairs.some(
      (pair) =>
        (equalTokenNoCaseSensitive({
          token1: fromToken,
          token2: pair.fromToken,
        }) &&
          equalTokenNoCaseSensitive({
            token1: toToken,
            token2: pair.toToken,
          })) ||
        (equalTokenNoCaseSensitive({
          token1: fromToken,
          token2: pair.toToken,
        }) &&
          equalTokenNoCaseSensitive({
            token1: toToken,
            token2: pair.fromToken,
          })),
    );
    if (isExit) {
      recentTokenPairs = recentTokenPairs.filter(
        (pair) =>
          !(
            (equalTokenNoCaseSensitive({
              token1: fromToken,
              token2: pair.fromToken,
            }) &&
              equalTokenNoCaseSensitive({
                token1: toToken,
                token2: pair.toToken,
              })) ||
            (equalTokenNoCaseSensitive({
              token1: fromToken,
              token2: pair.toToken,
            }) &&
              equalTokenNoCaseSensitive({
                token1: toToken,
                token2: pair.fromToken,
              }))
          ),
      );
    }
    const fromTokenBaseInfo: ISwapToken = {
      networkId: fromToken.networkId,
      contractAddress: fromToken.contractAddress,
      symbol: fromToken.symbol,
      decimals: fromToken.decimals,
      name: fromToken.name,
      logoURI: fromToken.logoURI,
      networkLogoURI: fromToken.networkLogoURI,
      isNative: fromToken.isNative,
    };
    const toTokenBaseInfo: ISwapToken = {
      networkId: toToken.networkId,
      contractAddress: toToken.contractAddress,
      symbol: toToken.symbol,
      decimals: toToken.decimals,
      name: toToken.name,
      logoURI: toToken.logoURI,
      networkLogoURI: toToken.networkLogoURI,
      isNative: toToken.isNative,
    };
    let newRecentTokenPairs = [
      {
        fromToken: fromTokenBaseInfo,
        toToken: toTokenBaseInfo,
      },
      ...recentTokenPairs,
    ];

    let singleChainTokenPairs = newRecentTokenPairs.filter(
      (t) => t.fromToken.networkId === t.toToken.networkId,
    );
    let crossChainTokenPairs = newRecentTokenPairs.filter(
      (t) => t.fromToken.networkId !== t.toToken.networkId,
    );

    if (singleChainTokenPairs.length > maxRecentTokenPairs) {
      singleChainTokenPairs = singleChainTokenPairs.slice(
        0,
        maxRecentTokenPairs,
      );
    }
    if (crossChainTokenPairs.length > maxRecentTokenPairs) {
      crossChainTokenPairs = crossChainTokenPairs.slice(0, maxRecentTokenPairs);
    }
    newRecentTokenPairs = [...singleChainTokenPairs, ...crossChainTokenPairs];
    await inAppNotificationAtom.set((pre) => ({
      ...pre,
      swapRecentTokenPairs: newRecentTokenPairs,
    }));
    await this.backgroundApi.simpleDb.swapConfigs.addRecentTokenPair(
      fromTokenBaseInfo,
      toTokenBaseInfo,
      isExit,
    );
  }

  @backgroundMethod()
  async buildOkxSwapEncodedTx(params: {
    accountId: string;
    networkId: string;
    okxTx: IOKXTransactionObject;
    fromTokenInfo: ISwapTokenBase;
    type: ESwapTabSwitchType;
  }) {
    const vault = await vaultFactory.getVault({
      accountId: params.accountId,
      networkId: params.networkId,
    });
    return vault.buildOkxSwapEncodedTx({
      okxTx: params.okxTx,
      fromTokenInfo: params.fromTokenInfo,
      type: params.type,
    });
  }

  async getCacheSwapSupportNetworks() {
    const now = Date.now();
    if (
      this._swapSupportNetworks.length &&
      now - this.swapSupportNetworksCacheTime < this.swapSupportNetworksTtl
    ) {
      return this._swapSupportNetworks;
    }
    const swapSupportNetworks = await this.fetchSwapNetworks();
    this._swapSupportNetworks = swapSupportNetworks;
    this.swapSupportNetworksCacheTime = now;
    return swapSupportNetworks;
  }

  // --- limit order ---

  async checkLimitOrderStatus(
    fetchResult: IFetchLimitOrderRes[],
    currentSwapLimitOrders: IFetchLimitOrderRes[],
  ) {
    const openOrders = currentSwapLimitOrders.filter(
      (order) =>
        order.status === ESwapLimitOrderStatus.OPEN ||
        order.status === ESwapLimitOrderStatus.PRESIGNATURE_PENDING,
    );
    openOrders.forEach((openOrder) => {
      const updatedOrder = fetchResult.find(
        (order) => order.orderId === openOrder.orderId,
      );
      const newStatus = updatedOrder?.status;
      if (
        updatedOrder &&
        newStatus !== ESwapLimitOrderStatus.OPEN &&
        newStatus !== ESwapLimitOrderStatus.PRESIGNATURE_PENDING
      ) {
        let toastTitle = '';
        let toastMessage = '';
        const method: 'success' | 'error' | 'message' = 'success';
        if (ESwapLimitOrderStatus.FULFILLED === newStatus) {
          appEventBus.emit(EAppEventBusNames.SwapTxHistoryStatusUpdate, {
            fromToken: updatedOrder.fromTokenInfo,
            toToken: updatedOrder.toTokenInfo,
            status: ESwapTxHistoryStatus.SUCCESS,
          });
          const executedBuyAmountBN = new BigNumber(
            updatedOrder.executedBuyAmount ?? '0',
          ).shiftedBy(-(updatedOrder.toTokenInfo?.decimals ?? 0));
          const formattedExecutedBuyAmount = formatBalance(
            executedBuyAmountBN.toFixed(),
          );
          const executedSellAmountBN = new BigNumber(
            updatedOrder.executedSellAmount ?? '0',
          ).shiftedBy(-(updatedOrder.fromTokenInfo?.decimals ?? 0));
          const formattedExecutedSellAmount = formatBalance(
            executedSellAmountBN.toFixed(),
          );
          toastTitle = appLocale.intl.formatMessage({
            id: ETranslations.limit_toast_order_filled,
          });
          toastMessage = appLocale.intl.formatMessage(
            {
              id: ETranslations.limit_toast_order_content,
            },
            {
              num1: formattedExecutedSellAmount.formattedValue,
              num2: formattedExecutedBuyAmount.formattedValue,
              token1: updatedOrder.fromTokenInfo.symbol,
              token2: updatedOrder.toTokenInfo.symbol,
            },
          );
        }
        if (ESwapLimitOrderStatus.CANCELLED === newStatus) {
          toastTitle = appLocale.intl.formatMessage({
            id: ETranslations.limit_toast_order_cancelled,
          });
        }
        if (toastTitle || toastMessage) {
          void this.backgroundApi.serviceApp.showToast({
            method,
            title: toastTitle,
            message: toastMessage,
          });
        }
      }
    });
  }

  @backgroundMethod()
  async swapLimitOrdersFetchLoop(
    indexedAccountId?: string,
    otherWalletTypeAccountId?: string,
    isFetchNewOrder?: boolean,
    interval?: boolean,
  ) {
    if (this.limitOrderStateInterval) {
      clearTimeout(this.limitOrderStateInterval);
      this.limitOrderStateInterval = null;
    }
    if (
      interval &&
      this._limitOrderCurrentAccountId &&
      this._limitOrderCurrentAccountId !==
        `${indexedAccountId ?? ''}-${otherWalletTypeAccountId ?? ''}`
    ) {
      return;
    }
    if (
      !interval &&
      this._limitOrderCurrentAccountId !==
        `${indexedAccountId ?? ''}-${otherWalletTypeAccountId ?? ''}`
    ) {
      this._limitOrderCurrentAccountId = `${indexedAccountId ?? ''}-${
        otherWalletTypeAccountId ?? ''
      }`;
    }
    let sameAccount = true;
    const swapSupportNetworks = await this.getCacheSwapSupportNetworks();
    const swapLimitSupportNetworks = swapSupportNetworks.filter(
      (item) => item.supportLimit,
    );
    const { swapSupportAccounts } = await this.getSupportSwapAllAccounts({
      indexedAccountId,
      otherWalletTypeAccountId,
      swapSupportNetworks: swapLimitSupportNetworks,
    });
    if (swapSupportAccounts.length > 0) {
      const { swapLimitOrders } = await inAppNotificationAtom.get();
      if (
        swapLimitOrders.length &&
        swapLimitOrders.find(
          (item) =>
            !swapSupportAccounts.find(
              (account) =>
                equalsIgnoreCase(item.userAddress, account.apiAddress) &&
                item.networkId === account.networkId,
            ),
        )
      ) {
        sameAccount = false;
      }
      const openOrders = swapLimitOrders.filter(
        (or) => or.status === ESwapLimitOrderStatus.OPEN,
      );
      let res: IFetchLimitOrderRes[] = [];
      try {
        if (
          !swapLimitOrders.length ||
          isFetchNewOrder ||
          !sameAccount ||
          openOrders.length
        ) {
          const accounts = swapSupportAccounts.map((account) => ({
            userAddress: account.apiAddress,
            networkId: account.networkId,
          }));
          await inAppNotificationAtom.set((pre) => ({
            ...pre,
            swapLimitOrdersLoading: true,
          }));
          res = await this.fetchLimitOrders(accounts);
          await this.checkLimitOrderStatus(res, swapLimitOrders);
          await inAppNotificationAtom.set((pre) => {
            if (sameAccount) {
              let newList = [...pre.swapLimitOrders];
              res.forEach((item) => {
                const index = newList.findIndex(
                  (i) => i.orderId === item.orderId,
                );
                if (index !== -1) {
                  newList[index] = item;
                } else {
                  newList = [item, ...newList];
                }
              });
              return {
                ...pre,
                swapLimitOrders: [...newList],
                swapLimitOrdersLoading: false,
              };
            }
            return {
              ...pre,
              swapLimitOrdersLoading: false,
              swapLimitOrders: [...res],
            };
          });
          if (res.find((item) => item.status === ESwapLimitOrderStatus.OPEN)) {
            this.limitOrderStateInterval = setTimeout(() => {
              void this.swapLimitOrdersFetchLoop(
                indexedAccountId,
                otherWalletTypeAccountId,
                false,
                true,
              );
            }, ESwapLimitOrderUpdateInterval);
          }
        }
      } catch (error) {
        this.limitOrderStateInterval = setTimeout(() => {
          void this.swapLimitOrdersFetchLoop(
            indexedAccountId,
            otherWalletTypeAccountId,
            false,
            true,
          );
        }, ESwapLimitOrderUpdateInterval);
      } finally {
        await inAppNotificationAtom.set((pre) => ({
          ...pre,
          swapLimitOrdersLoading: false,
        }));
      }
    }
  }

  @backgroundMethod()
  async fetchLimitOrders(
    accounts: {
      userAddress: string;
      networkId: string;
      orderIds?: string;
      limit?: number;
      offset?: number;
    }[],
  ) {
    try {
      const client = await this.getClient(EServiceEndpointEnum.Swap);
      const res = await client.post<{
        data: IFetchLimitOrderRes[];
      }>(`/swap/v1/limit-orders`, {
        accounts,
      });
      return res.data.data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @backgroundMethod()
  async cancelLimitOrder(params: {
    orderIds: string[];
    signature: string;
    signingScheme: ESigningScheme;
    networkId: string;
    provider: string;
    userAddress: string;
  }) {
    try {
      const client = await this.getClient(EServiceEndpointEnum.Swap);
      const resp = await client.post<{ success: boolean }>(
        `/swap/v1/cancel-limit-orders`,
        {
          networkId: params.networkId,
          orderIds: params.orderIds.join(','),
          userAddress: params.userAddress,
          provider: params.provider,
          signature: params.signature,
          signingScheme: params.signingScheme,
        },
      );
      return resp.data.success;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  @backgroundMethod()
  async fetchLimitMarketPrice(params: {
    fromToken: ISwapTokenBase;
    toToken: ISwapTokenBase;
  }) {
    const client = await this.getClient(EServiceEndpointEnum.Swap);
    const fromTokenFetchPromise = client.get<{ data: IFetchLimitMarketPrice }>(
      `/swap/v1/limit-market-price`,
      {
        params: {
          tokenAddress: params.fromToken.contractAddress,
          networkId: params.fromToken.networkId,
        },
      },
    );
    const toTokenFetchPromise = client.get<{ data: IFetchLimitMarketPrice }>(
      `/swap/v1/limit-market-price`,
      {
        params: {
          tokenAddress: params.toToken.contractAddress,
          networkId: params.toToken.networkId,
        },
      },
    );
    try {
      const [{ data: fromTokenRes }, { data: toTokenRes }] = await Promise.all([
        fromTokenFetchPromise,
        toTokenFetchPromise,
      ]);
      return {
        fromTokenPrice: fromTokenRes.data?.price,
        toTokenPrice: toTokenRes.data?.price,
      };
    } catch (error) {
      console.error(error);
      return {
        fromTokenPrice: '',
        toTokenPrice: '',
      };
    }
  }
}
