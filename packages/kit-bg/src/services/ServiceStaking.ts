import BigNumber from 'bignumber.js';

import { isTaprootAddress } from '@onekeyhq/core/src/chains/btc/sdkBtc';
import type { IAxiosResponse } from '@onekeyhq/shared/src/appApiClient/appApiClient';
import {
  backgroundClass,
  backgroundMethod,
} from '@onekeyhq/shared/src/background/backgroundDecorators';
import { OneKeyServerApiError } from '@onekeyhq/shared/src/errors/errors/baseErrors';
import { defaultLogger } from '@onekeyhq/shared/src/logger/logger';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import { memoizee } from '@onekeyhq/shared/src/utils/cacheUtils';
import earnUtils from '@onekeyhq/shared/src/utils/earnUtils';
import networkUtils from '@onekeyhq/shared/src/utils/networkUtils';
import timerUtils from '@onekeyhq/shared/src/utils/timerUtils';
import type { INetworkAccount } from '@onekeyhq/shared/types/account';
import type { IDiscoveryBanner } from '@onekeyhq/shared/types/discovery';
import type {
  EEarnProviderEnum,
  ISupportedSymbol,
} from '@onekeyhq/shared/types/earn';
import { earnMainnetNetworkIds } from '@onekeyhq/shared/types/earn/earnProvider.constants';
import { EServiceEndpointEnum } from '@onekeyhq/shared/types/endpoint';
import type {
  IAccountHistoryTx,
  IChangedPendingTxInfo,
} from '@onekeyhq/shared/types/history';
import type {
  IAllowanceOverview,
  IAvailableAsset,
  IBabylonPortfolioItem,
  IBuildPermit2ApproveSignDataParams,
  IBuildRegisterSignMessageParams,
  IClaimRecordParams,
  IClaimableListResponse,
  IEarnAccountResponse,
  IEarnAccountToken,
  IEarnAccountTokenResponse,
  IEarnBabylonTrackingItem,
  IEarnEstimateAction,
  IEarnEstimateFeeResp,
  IEarnFAQList,
  IEarnInvestmentItem,
  IEarnPermit2ApproveSignData,
  IEarnRegisterSignMessageResponse,
  IEarnUnbondingDelegationList,
  IGetPortfolioParams,
  IStakeBaseParams,
  IStakeClaimBaseParams,
  IStakeHistoriesResponse,
  IStakeHistoryParams,
  IStakeProtocolDetails,
  IStakeProtocolListItem,
  IStakeTag,
  IStakeTx,
  IStakeTxResponse,
  IUnstakePushParams,
  IVerifyRegisterSignMessageParams,
  IWithdrawBaseParams,
} from '@onekeyhq/shared/types/staking';
import { EApproveType } from '@onekeyhq/shared/types/staking';
import { EDecodedTxStatus } from '@onekeyhq/shared/types/tx';

import simpleDb from '../dbs/simple/simpleDb';
import { vaultFactory } from '../vaults/factory';

import ServiceBase from './ServiceBase';

import type {
  IAddEarnOrderParams,
  IEarnOrderItem,
} from '../dbs/simple/entity/SimpleDbEntityEarnOrders';

interface ICheckAmountResponse {
  code: number;
  message: string;
}

interface IRecommendResponse {
  code: string;
  message?: string;
  data: { tokens: IEarnAccountToken[] };
}

interface IAvailableAssetsResponse {
  code: string;
  message?: string;
  data: { assets: IAvailableAsset[] };
}

@backgroundClass()
class ServiceStaking extends ServiceBase {
  constructor({ backgroundApi }: { backgroundApi: any }) {
    super({ backgroundApi });
  }

  @backgroundMethod()
  public async fetchTokenAllowance(params: {
    networkId: string;
    accountId: string;
    tokenAddress: string;
    spenderAddress: string;
    blockNumber?: number;
  }) {
    const { networkId, accountId, ...rest } = params;
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const accountAddress =
      await this.backgroundApi.serviceAccount.getAccountAddressForApi({
        networkId,
        accountId,
      });

    const resp = await client.get<{
      data: IAllowanceOverview;
    }>(`/earn/v1/on-chain/allowance`, {
      params: { accountAddress, networkId, ...rest },
    });

    return resp.data.data;
  }

  @backgroundMethod()
  public async fetchLocalStakingHistory({
    accountId,
    networkId,
    stakeTag,
  }: {
    accountId: string;
    networkId: string;
    stakeTag: IStakeTag;
  }) {
    const [xpub, accountAddress] = await Promise.all([
      this.backgroundApi.serviceAccount.getAccountXpub({
        accountId,
        networkId,
      }),
      await this.backgroundApi.serviceAccount.getAccountAddressForApi({
        accountId,
        networkId,
      }),
    ]);

    const pendingTxs =
      await this.backgroundApi.serviceHistory.getAccountLocalHistoryPendingTxs({
        networkId,
        accountAddress,
        xpub,
      });

    const stakingTxs = pendingTxs.filter(
      (
        o,
      ): o is IAccountHistoryTx &
        Required<Pick<IAccountHistoryTx, 'stakingInfo'>> =>
        Boolean(o.stakingInfo && o.stakingInfo.tags.includes(stakeTag)),
    );

    return stakingTxs;
  }

  @backgroundMethod()
  public async buildLidoEthPermitMessageData({
    amount,
    accountId,
    networkId,
  }: {
    amount: string;
    accountId: string;
    networkId: string;
  }) {
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const accountAddress =
      await this.backgroundApi.serviceAccount.getAccountAddressForApi({
        networkId,
        accountId,
      });
    const resp = await client.post<{
      data: { message: string; deadline: number };
    }>(`/earn/v1/lido-eth/tx/permit_message`, {
      amount,
      accountAddress,
      networkId,
    });
    return resp.data.data;
  }

  private async getFirmwareDeviceTypeParam({
    accountId,
  }: {
    accountId: string;
  }) {
    if (!accountUtils.isHwAccount({ accountId })) {
      return undefined;
    }
    const device = await this.backgroundApi.serviceAccount.getAccountDeviceSafe(
      {
        accountId,
      },
    );
    if (device?.deviceType) {
      return device?.deviceType;
    }
    return undefined;
  }

  @backgroundMethod()
  async buildStakeTransaction(
    params: IStakeBaseParams,
  ): Promise<IStakeTxResponse> {
    const {
      networkId,
      accountId,
      provider,
      symbol,
      morphoVault,
      approveType,
      permitSignature,
      ...rest
    } = params;
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const vault = await vaultFactory.getVault({ networkId, accountId });
    const account = await vault.getAccount();
    const stakingConfig = await this.getStakingConfigs({
      networkId,
      symbol,
      provider,
    });
    if (!stakingConfig) {
      throw new Error('Staking config not found');
    }
    const resp = await client.post<{
      data: IStakeTxResponse;
    }>(`/earn/v2/stake`, {
      accountAddress: account.address,
      publicKey: stakingConfig.usePublicKey ? account.pub : undefined,
      term: params.term,
      feeRate: params.feeRate,
      networkId,
      symbol,
      provider,
      vault: morphoVault,
      firmwareDeviceType: await this.getFirmwareDeviceTypeParam({
        accountId,
      }),
      approveType,
      permitSignature:
        approveType === EApproveType.Permit ? permitSignature : undefined,
      ...rest,
    });
    return resp.data.data;
  }

  @backgroundMethod()
  async buildUnstakeTransaction(params: IWithdrawBaseParams) {
    const { networkId, accountId, morphoVault, ...rest } = params;
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const vault = await vaultFactory.getVault({ networkId, accountId });
    const account = await vault.getAccount();
    const stakingConfig = await this.getStakingConfigs({
      networkId,
      symbol: params.symbol,
      provider: params.provider,
    });
    if (!stakingConfig) {
      throw new Error('Staking config not found');
    }
    const resp = await client.post<{
      data: IStakeTxResponse;
    }>(`/earn/v2/unstake`, {
      accountAddress: account.address,
      networkId,
      publicKey: stakingConfig.usePublicKey ? account.pub : undefined,
      firmwareDeviceType: await this.getFirmwareDeviceTypeParam({
        accountId,
      }),
      vault: morphoVault,
      ...rest,
    });
    return resp.data.data;
  }

  @backgroundMethod()
  async unstakePush(params: IUnstakePushParams) {
    const { networkId, accountId, ...rest } = params;
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const vault = await vaultFactory.getVault({ networkId, accountId });
    const acc = await vault.getAccount();
    const resp = await client.post<{
      data: IStakeTxResponse;
    }>(`/earn/v1/unstake/push`, {
      accountAddress: acc.address,
      networkId,
      ...rest,
    });
    return resp.data.data;
  }

  @backgroundMethod()
  async babylonClaimRecord(params: IClaimRecordParams) {
    const { networkId, accountId, ...rest } = params;
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const vault = await vaultFactory.getVault({ networkId, accountId });
    const acc = await vault.getAccount();
    const resp = await client.post<{
      data: IStakeTxResponse;
    }>(`/earn/v1/claim/record`, {
      accountAddress: acc.address,
      publicKey: acc.pub,
      networkId,
      ...rest,
    });
    return resp.data.data;
  }

  @backgroundMethod()
  async buildClaimTransaction(params: IStakeClaimBaseParams) {
    const {
      networkId,
      accountId,
      claimTokenAddress: rewardTokenAddress,
      ...rest
    } = params;
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const vault = await vaultFactory.getVault({ networkId, accountId });
    const account = await vault.getAccount();
    const stakingConfig = await this.getStakingConfigs({
      networkId,
      symbol: params.symbol,
      provider: params.provider,
    });
    if (!stakingConfig) {
      throw new Error('Staking config not found');
    }

    const resp = await client.post<{
      data: IStakeTxResponse;
    }>(`/earn/v2/claim`, {
      accountAddress: account.address,
      networkId,
      publicKey: stakingConfig.usePublicKey ? account.pub : undefined,
      firmwareDeviceType: await this.getFirmwareDeviceTypeParam({
        accountId,
      }),
      rewardTokenAddress,
      ...rest,
    });
    return resp.data.data;
  }

  @backgroundMethod()
  async buildPermit2ApproveSignData(
    params: IBuildPermit2ApproveSignDataParams,
  ) {
    if (!params?.networkId) {
      throw new Error('networkId is required');
    }
    if (!params?.provider) {
      throw new Error('provider is required');
    }
    if (!params?.symbol) {
      throw new Error('symbol is required');
    }
    if (!params?.accountAddress) {
      throw new Error('accountAddress is required');
    }
    if (!params?.vault) {
      throw new Error('vault is required');
    }
    if (!params?.amount) {
      throw new Error('amount is required');
    }
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const resp = await client.post<{
      data: IEarnPermit2ApproveSignData;
    }>(`/earn/v1/permit-signature`, params);
    return resp.data.data;
  }

  @backgroundMethod()
  async buildRegisterSignMessageData(params: IBuildRegisterSignMessageParams) {
    if (!params?.networkId) {
      throw new Error('networkId is required');
    }
    if (!params?.provider) {
      throw new Error('provider is required');
    }
    if (!params?.symbol) {
      throw new Error('symbol is required');
    }
    if (!params?.accountAddress) {
      throw new Error('accountAddress is required');
    }
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const resp = await client.post<{
      data: IEarnRegisterSignMessageResponse;
    }>(`/earn/v1/permit-signature`, params);
    return resp.data.data;
  }

  @backgroundMethod()
  async verifyRegisterSignMessage(params: IVerifyRegisterSignMessageParams) {
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const resp = await client.post<{
      data: IEarnRegisterSignMessageResponse;
    }>(`/earn/v1/verify-sig`, params);
    return resp.data.data;
  }

  @backgroundMethod()
  async getStakeHistory(params: IStakeHistoryParams) {
    const { networkId, accountId, morphoVault, type, ...rest } = params;
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const accountAddress =
      await this.backgroundApi.serviceAccount.getAccountAddressForApi({
        networkId,
        accountId,
      });

    const data: Record<string, string | undefined> & { type?: string } = {
      accountAddress,
      networkId,
      vault: morphoVault,
      ...rest,
    };
    if (type) {
      data.type = params.type;
    }
    const resp = await client.get<{
      data: IStakeHistoriesResponse;
    }>(`/earn/v1/stake-histories`, {
      params: data,
    });
    return resp.data.data;
  }

  @backgroundMethod()
  async getPortfolioList(params: IGetPortfolioParams) {
    const { networkId, accountId, ...rest } = params;
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const vault = await vaultFactory.getVault({ networkId, accountId });
    const acc = await vault.getAccount();

    const resp = await client.get<{
      data: IBabylonPortfolioItem[];
    }>(`/earn/v1/portfolio/list`, {
      params: {
        accountAddress: acc.address,
        networkId,
        publicKey: networkUtils.isBTCNetwork(networkId) ? acc.pub : undefined,
        ...rest,
      },
    });
    return resp.data.data;
  }

  @backgroundMethod()
  async getProtocolDetails(params: {
    accountId?: string;
    indexedAccountId?: string;
    networkId: string;
    symbol: string;
    provider: string;
    vault?: string;
  }) {
    const { networkId, accountId, indexedAccountId, ...rest } = params;
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const requestParams: {
      accountAddress?: string;
      networkId: string;
      symbol: string;
      provider: string;
      publicKey?: string;
      vault?: string;
    } = { networkId, ...rest };
    const account = await this.getEarnAccount({
      accountId: accountId ?? '',
      networkId,
      indexedAccountId,
      btcOnlyTaproot: true,
    });
    if (account?.accountAddress) {
      requestParams.accountAddress = account.accountAddress;
    }
    if (account?.account?.pub) {
      requestParams.publicKey = account?.account?.pub;
    }
    const resp = await client.get<{ data: IStakeProtocolDetails }>(
      '/earn/v1/stake-protocol/detail',
      { params: requestParams },
    );
    const result = resp.data.data;
    return result;
  }

  _getProtocolList = memoizee(
    async (params: {
      symbol: string;
      networkId?: string;
      accountAddress?: string;
      publicKey?: string;
    }) => {
      const { symbol, accountAddress, publicKey } = params;
      const client = await this.getClient(EServiceEndpointEnum.Earn);
      const protocolListResp = await client.get<{
        data: { protocols: IStakeProtocolListItem[] };
      }>('/earn/v1/stake-protocol/list', {
        params: {
          symbol,
          accountAddress,
          publicKey,
        },
      });
      const protocols = protocolListResp.data.data.protocols;
      return protocols;
    },
    {
      promise: true,
      maxAge: timerUtils.getTimeDurationMs({ seconds: 5 }),
    },
  );

  @backgroundMethod()
  async getProtocolList(params: {
    symbol: string;
    networkId?: string;
    accountId?: string;
    indexedAccountId?: string;
    filter?: boolean;
  }) {
    const listParams: {
      symbol: string;
      networkId?: string;
      accountAddress?: string;
      publicKey?: string;
    } = { symbol: params.symbol };
    if (params.networkId && params.accountId) {
      const earnAccount = await this.getEarnAccount({
        accountId: params.accountId,
        networkId: params.networkId,
        indexedAccountId: params.indexedAccountId,
        btcOnlyTaproot: true,
      });
      if (earnAccount) {
        listParams.networkId = earnAccount.networkId;
        listParams.accountAddress = earnAccount.accountAddress;
        if (networkUtils.isBTCNetwork(listParams.networkId)) {
          listParams.publicKey = earnAccount.account.pub;
        }
      }
    }
    let items = await this._getProtocolList(listParams);

    if (
      params.filter &&
      params.networkId &&
      !networkUtils.isAllNetwork({ networkId: params.networkId })
    ) {
      items = items.filter((o) => o.network.networkId === params.networkId);
    }

    const itemsWithEnabledStatus = await Promise.all(
      items.map(async (item) => {
        const stakingConfig = await this.getStakingConfigs({
          networkId: item.network.networkId,
          symbol: params.symbol,
          provider: item.provider.name,
        });
        const isEnabled = stakingConfig?.enabled;
        return { item, isEnabled };
      }),
    );

    const enabledItems = itemsWithEnabledStatus
      .filter(({ isEnabled }) => isEnabled)
      .map(({ item }) => item);
    return enabledItems;
  }

  @backgroundMethod()
  async getClaimableList(params: {
    networkId: string;
    accountId: string;
    symbol: string;
    provider: string;
  }) {
    const { networkId, accountId, symbol, ...rest } = params;
    const vault = await vaultFactory.getVault({ networkId, accountId });
    const acc = await vault.getAccount();
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const resp = await client.get<{
      data: IClaimableListResponse;
    }>('/earn/v1/claimable/list', {
      params: {
        networkId,
        accountAddress: acc.address,
        symbol,
        publicKey: networkUtils.isBTCNetwork(networkId) ? acc.pub : undefined,
        ...rest,
      },
    });
    return resp.data.data;
  }

  @backgroundMethod()
  async getWithdrawList(params: {
    networkId: string;
    accountId: string;
    symbol: string;
    provider: string;
  }) {
    const { networkId, accountId, symbol, ...rest } = params;
    const vault = await vaultFactory.getVault({ networkId, accountId });
    const acc = await vault.getAccount();

    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const resp = await client.get<{
      data: IClaimableListResponse;
    }>('/earn/v1/withdraw/list', {
      params: {
        networkId,
        accountAddress: acc.address,
        symbol,
        publicKey: networkUtils.isBTCNetwork(networkId) ? acc.pub : undefined,
        ...rest,
      },
    });
    return resp.data.data;
  }

  @backgroundMethod()
  async getAccountAsset(
    params: {
      networkId: string;
      accountAddress: string;
      publicKey?: string;
    }[],
  ) {
    const client = await this.getRawDataClient(EServiceEndpointEnum.Earn);
    const result: IEarnAccountTokenResponse = {
      accounts: [],
    };
    const tokensResponse = await client.post<
      IRecommendResponse,
      IAxiosResponse<IRecommendResponse>
    >(`/earn/v1/recommend`, { accounts: params });

    this.handleServerError({
      ...tokensResponse.data,
      requestId: tokensResponse.$requestId,
    });
    const tokens =
      tokensResponse?.data.data.tokens?.map((item, index) => ({
        ...item,
        orderIndex: index,
      })) || [];

    for (const account of params) {
      result.accounts.push({
        ...account,
        tokens: tokens?.filter((i) => i.networkId === account.networkId) || [],
      });
    }
    return result;
  }

  @backgroundMethod()
  async getEarnAvailableAccountsParams({
    accountId,
    networkId,
  }: {
    accountId: string;
    networkId: string;
  }) {
    const accounts = await this.getEarnAvailableAccounts({
      accountId,
      networkId,
    });
    const accountParams: {
      networkId: string;
      accountAddress: string;
      publicKey?: string;
    }[] = [];

    earnMainnetNetworkIds.forEach((mainnetNetworkId) => {
      const account = accounts.find((i) => i.networkId === mainnetNetworkId);
      if (account?.apiAddress) {
        accountParams.push({
          accountAddress: account?.apiAddress,
          networkId: mainnetNetworkId,
          publicKey: account?.pub,
        });
      }
    });

    const uniqueAccountParams = Array.from(
      new Map(
        accountParams.map((item) => [
          `${item.networkId}-${item.accountAddress}-${item.publicKey || ''}`,
          item,
        ]),
      ).values(),
    );
    return uniqueAccountParams;
  }

  @backgroundMethod()
  async fetchAccountOverview(params: {
    accountId: string;
    networkId: string;
    assets: IAvailableAsset[];
  }) {
    const accounts = await this.getEarnAvailableAccountsParams(params);
    const client = await this.getRawDataClient(EServiceEndpointEnum.Earn);
    const overviewData = (
      await Promise.allSettled(
        accounts.map((account) =>
          client.get<{
            data: IEarnAccountResponse;
          }>(`/earn/v1/overview`, { params: account }),
        ),
      )
    )
      .filter((result) => result.status === 'fulfilled')
      .map(
        (result) =>
          (
            result as PromiseFulfilledResult<{
              data: { data: IEarnAccountResponse };
            }>
          ).value,
      );

    const { totalFiatValue, earnings24h, hasClaimableAssets } =
      overviewData.reduce(
        (prev, item) => {
          prev.totalFiatValue = prev.totalFiatValue.plus(
            BigNumber(item.data.data.totalFiatValue || 0),
          );
          prev.earnings24h = prev.earnings24h.plus(
            BigNumber(item.data.data.earnings24h || 0),
          );
          prev.hasClaimableAssets =
            prev.hasClaimableAssets || !!item.data.data.canClaim;
          return prev;
        },
        {
          totalFiatValue: BigNumber(0),
          earnings24h: BigNumber(0),
          hasClaimableAssets: false,
        },
      );

    return {
      totalFiatValue: totalFiatValue.toFixed(),
      earnings24h: earnings24h.toFixed(),
      hasClaimableAssets,
    };
  }

  @backgroundMethod()
  async fetchAllNetworkAssets({
    accountId,
    networkId,
  }: {
    accountId: string;
    networkId: string;
  }) {
    const accounts = await this.getEarnAvailableAccountsParams({
      accountId,
      networkId,
    });
    return this.getAccountAsset(accounts);
  }

  @backgroundMethod()
  async fetchInvestmentDetail(
    list: {
      accountAddress: string;
      networkId: string;
      publicKey?: string;
    }[],
  ) {
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const response = await client.post<{
      data: IEarnInvestmentItem[];
    }>(`/earn/v1/investment/detail`, {
      list,
    });
    return response.data.data;
  }

  @backgroundMethod()
  async getAvailableAssets() {
    const client = await this.getRawDataClient(EServiceEndpointEnum.Earn);
    const resp = await client.get<
      IAvailableAssetsResponse,
      IAxiosResponse<IAvailableAssetsResponse>
    >(`/earn/v1/available-assets`);

    this.handleServerError({
      ...resp.data,
      requestId: resp.$requestId,
    });
    return resp.data.data.assets;
  }

  handleServerError(data: {
    code?: string | number;
    message?: string;
    requestId?: string;
  }) {
    if (data.code !== undefined && Number(data.code) !== 0 && data.message) {
      throw new OneKeyServerApiError({
        autoToast: true,
        disableFallbackMessage: true,
        code: Number(data.code),
        message: data.message,
        requestId: data.requestId,
      });
    }
  }

  @backgroundMethod()
  async checkAmount({
    networkId,
    accountId,
    symbol,
    provider,
    action,
    withdrawAll,
    amount,
    morphoVault,
  }: {
    accountId?: string;
    networkId?: string;
    symbol?: string;
    provider?: string;
    action: 'stake' | 'unstake' | 'claim';
    withdrawAll: boolean;
    amount?: string;
    morphoVault?: string;
  }) {
    if (!networkId || !accountId || !provider) {
      throw new Error('networkId or accountId or provider not found');
    }
    const vault = await vaultFactory.getVault({ networkId, accountId });
    const account = await vault.getAccount();
    const client = await this.getRawDataClient(EServiceEndpointEnum.Earn);
    const result = await client.get<
      ICheckAmountResponse,
      IAxiosResponse<ICheckAmountResponse>
    >(`/earn/v1/check-amount`, {
      params: {
        networkId,
        accountAddress: account.address,
        symbol,
        provider: provider || '',
        action,
        amount,
        vault: morphoVault,
        withdrawAll,
      },
    });
    const { code, message } = result.data;
    this.handleServerError({
      code,
      message,
      requestId: result.$requestId,
    });
    return Number(code) === 0 ? '' : message;
  }

  @backgroundMethod()
  async getStakingConfigs({
    networkId,
    symbol,
    provider,
  }: {
    networkId: string;
    symbol: string;
    provider: string;
  }) {
    const providerKey = earnUtils.getEarnProviderEnumKey(provider);
    if (!providerKey) {
      return null;
    }

    const vaultSettings =
      await this.backgroundApi.serviceNetwork.getVaultSettings({ networkId });
    const allStakingConfig = vaultSettings.stakingConfig;
    if (!allStakingConfig) {
      return null;
    }

    const stakingConfig = allStakingConfig[networkId];
    if (!stakingConfig) {
      return null;
    }

    const providerConfig = stakingConfig.providers[providerKey];
    if (!providerConfig) {
      return null;
    }

    const tokenSymbol = symbol as ISupportedSymbol;
    if (providerConfig.supportedSymbols.includes(tokenSymbol)) {
      return providerConfig.configs[tokenSymbol];
    }

    return null;
  }

  @backgroundMethod()
  async findSymbolByTokenAddress({
    networkId,
    tokenAddress,
  }: {
    networkId: string;
    tokenAddress: string;
  }) {
    const vaultSettings =
      await this.backgroundApi.serviceNetwork.getVaultSettings({ networkId });

    const allStakingConfig = vaultSettings.stakingConfig;
    if (!allStakingConfig) {
      return null;
    }

    const stakingConfig = allStakingConfig[networkId];
    if (!stakingConfig) {
      return null;
    }

    const normalizedTokenAddress = tokenAddress.toLowerCase();

    const providerEntries = Object.entries(stakingConfig.providers).filter(
      ([, providerConfig]) => providerConfig !== undefined,
    );

    for (const [provider, providerConfig] of providerEntries) {
      const symbolEntry = Object.entries(providerConfig.configs).find(
        ([, config]) =>
          config &&
          config.tokenAddress.toLowerCase() === normalizedTokenAddress &&
          config.enabled,
      );

      if (symbolEntry) {
        const [symbol] = symbolEntry;
        return {
          symbol: symbol as ISupportedSymbol,
          provider: provider as EEarnProviderEnum,
        };
      }
    }

    return null;
  }

  @backgroundMethod()
  async getEarnAccount(params: {
    accountId: string;
    networkId: string;
    indexedAccountId?: string;
    btcOnlyTaproot?: boolean;
  }) {
    const { accountId, networkId, indexedAccountId, btcOnlyTaproot } = params;
    if (!accountId && !indexedAccountId) {
      return null;
    }
    if (networkUtils.isAllNetwork({ networkId })) {
      throw new Error('networkId should not be all network');
    }
    if (networkUtils.isAllNetwork({ networkId }) && !indexedAccountId) {
      throw new Error('indexedAccountId should be provided');
    }
    if (accountUtils.isOthersAccount({ accountId }) || !indexedAccountId) {
      let account: INetworkAccount | null = null;
      try {
        account = await this.backgroundApi.serviceAccount.getAccount({
          accountId,
          networkId,
        });
      } catch (e) {
        return null;
      }
      if (
        networkUtils.isBTCNetwork(networkId) &&
        btcOnlyTaproot &&
        !isTaprootAddress(account?.address)
      ) {
        return null;
      }
      const accountAddress =
        await this.backgroundApi.serviceAccount.getAccountAddressForApi({
          networkId,
          accountId,
        });
      return {
        accountId: account.id,
        networkId,
        accountAddress,
        account,
      };
    }
    try {
      const globalDeriveType =
        await this.backgroundApi.serviceNetwork.getGlobalDeriveTypeOfNetwork({
          networkId,
        });
      let deriveType = globalDeriveType;
      // only support taproot for earn
      if (networkUtils.isBTCNetwork(networkId) && btcOnlyTaproot) {
        deriveType = 'BIP86';
      }
      const networkAccount =
        await this.backgroundApi.serviceAccount.getNetworkAccount({
          accountId: undefined,
          indexedAccountId,
          networkId,
          deriveType,
        });
      const accountAddress =
        await this.backgroundApi.serviceAccount.getAccountAddressForApi({
          networkId,
          accountId: networkAccount.id,
        });
      return {
        accountId: networkAccount.id,
        networkId,
        accountAddress,
        account: networkAccount,
      };
    } catch (e) {
      // ignore error
      return null;
    }
  }

  @backgroundMethod()
  async getUnbondingDelegationList(params: {
    accountAddress: string;
    provider: string;
    networkId: string;
    symbol: string;
  }) {
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const resp = await client.get<{
      data: {
        delegations: IEarnUnbondingDelegationList;
      };
    }>(`/earn/v1/unbonding-delegation/list`, {
      params,
    });
    return resp.data.data.delegations;
  }

  @backgroundMethod()
  fetchEarnHomePageData() {
    return this._fetchEarnHomePageData();
  }

  _fetchEarnHomePageData = memoizee(
    async () => {
      const client = await this.getClient(EServiceEndpointEnum.Utility);
      const res = await client.get<{ data: IDiscoveryBanner[] }>(
        '/utility/v1/earn-banner/list',
      );
      return res.data.data;
    },
    {
      promise: true,
      maxAge: timerUtils.getTimeDurationMs({ seconds: 60 }),
    },
  );

  @backgroundMethod()
  async getEarnAvailableAccounts(params: {
    accountId: string;
    networkId: string;
  }) {
    const { accountId, networkId } = params;
    const { accountsInfo } =
      await this.backgroundApi.serviceAllNetwork.getAllNetworkAccounts({
        accountId,
        networkId,
        fetchAllNetworkAccounts: accountUtils.isOthersAccount({ accountId })
          ? undefined
          : true,
      });
    return accountsInfo.filter(
      (account) =>
        !(
          networkUtils.isBTCNetwork(account.networkId) &&
          !isTaprootAddress(account.apiAddress)
        ),
    );
  }

  @backgroundMethod()
  async getFAQList(params: { provider: string; symbol: string }) {
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const resp = await client.get<{
      data: {
        list: IEarnFAQList;
      };
    }>(`/earn/v1/faq/list`, {
      params,
    });
    return resp.data.data.list;
  }

  @backgroundMethod()
  async buildEarnTx({
    accountId,
    networkId,
    tx,
  }: {
    accountId: string;
    networkId: string;
    tx: IStakeTx;
  }) {
    const vault = await vaultFactory.getVault({ networkId, accountId });
    const encodedTx = await vault.buildStakeEncodedTx(tx as any);
    return encodedTx;
  }

  @backgroundMethod()
  async estimateFee(params: {
    networkId: string;
    provider: string;
    symbol: string;
    action: IEarnEstimateAction;
    amount: string;
    txId?: string;
    morphoVault?: string;
    identity?: string;
    accountAddress?: string;
    approveType?: 'permit';
    permitSignature?: string;
  }) {
    const { symbol, morphoVault, ...rest } = params;
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const resp = await client.get<{
      data: IEarnEstimateFeeResp;
    }>(`/earn/v1/estimate-fee`, {
      params: {
        symbol,
        vault: morphoVault,
        ...rest,
      },
    });
    return resp.data.data;
  }

  @backgroundMethod()
  async addBabylonTrackingItem(item: IEarnBabylonTrackingItem) {
    return simpleDb.babylonSync.addTrackingItem(item);
  }

  @backgroundMethod()
  async getBabylonTrackingItems({
    accountId,
    networkId,
  }: {
    accountId: string;
    networkId: string;
  }) {
    const items = await simpleDb.babylonSync.getTrackingList();
    const result = items.filter(
      (o) => o.accountId === accountId && networkId === o.networkId,
    );
    return result;
  }

  @backgroundMethod()
  async removeBabylonTrackingItem(item: { txIds: string[] }) {
    return simpleDb.babylonSync.removeTrackingItem({ txIds: item.txIds });
  }

  @backgroundMethod()
  async getPendingActivationPortfolioList({
    accountId,
    networkId,
  }: {
    accountId: string;
    networkId: string;
  }): Promise<IBabylonPortfolioItem[]> {
    const trackingItems = await this.getBabylonTrackingItems({
      accountId,
      networkId,
    });
    const pendingActivationItems = trackingItems.filter(
      (o) => o.action === 'stake',
    );
    return pendingActivationItems.map((o) => {
      const item = {
        txId: '',
        status: 'local_pending_activation',
        amount: o.amount,
        fiatValue: '',
        lockBlocks: 0,
        isOverflow: '',
      } as IBabylonPortfolioItem;
      if (o.minStakeTerm && o.createAt) {
        item.startTime = o.createAt;
        item.endTime = o.createAt + o.minStakeTerm;
      }
      return item;
    });
  }

  @backgroundMethod()
  async addEarnOrder(order: IAddEarnOrderParams) {
    defaultLogger.staking.order.addOrder(order);
    await simpleDb.earnOrders.addOrder(order);
    try {
      await this.updateEarnOrderStatusToServer({
        order: order as IEarnOrderItem,
      });
    } catch (e) {
      // ignore error, continue
      defaultLogger.staking.order.updateOrderStatusError({
        txId: order.txId,
        status: order.status,
      });
    }
  }

  @backgroundMethod()
  async updateSingleEarnOrderStatus({ order }: { order: IEarnOrderItem }) {
    await this.updateEarnOrderStatusToServer({
      order,
    });
  }

  @backgroundMethod()
  async updateEarnOrder({ txs }: { txs: IChangedPendingTxInfo[] }) {
    for (const tx of txs) {
      try {
        const order =
          await this.backgroundApi.simpleDb.earnOrders.getOrderByTxId(tx.txId);
        if (order && tx.status !== EDecodedTxStatus.Pending) {
          order.status = tx.status;
          await this.updateEarnOrderStatusToServer({ order });
          await this.backgroundApi.simpleDb.earnOrders.updateOrderStatusByTxId({
            currentTxId: tx.txId,
            status: tx.status,
          });
          defaultLogger.staking.order.updateOrderStatus({
            txId: tx.txId,
            status: tx.status,
          });
        }
      } catch (e) {
        // ignore error, continue loop
        defaultLogger.staking.order.updateOrderStatusError({
          txId: tx.txId,
          status: tx.status,
        });
      }
    }
  }

  @backgroundMethod()
  async updateEarnOrderStatusToServer({ order }: { order: IEarnOrderItem }) {
    const maxRetries = 3;
    let lastError;

    for (let i = 0; i < maxRetries; i += 1) {
      try {
        const client = await this.getClient(EServiceEndpointEnum.Earn);
        await client.post('/earn/v1/orders', {
          orderId: order.orderId,
          networkId: order.networkId,
          txId: order.txId,
        });
        return; // Return early on success
      } catch (error) {
        lastError = error;
        if (i === maxRetries - 1) break; // Exit loop on final retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))); // 1s, 2s, 3s
      }
    }

    throw lastError; // Throw last error after all retries fail
  }

  @backgroundMethod()
  async updateOrderStatusByTxId(params: {
    currentTxId: string;
    newTxId?: string;
    status: EDecodedTxStatus;
  }) {
    defaultLogger.staking.order.updateOrderStatusByTxId(params);
    await this.backgroundApi.simpleDb.earnOrders.updateOrderStatusByTxId(
      params,
    );
  }

  @backgroundMethod()
  async getFetchHistoryPollingInterval({ networkId }: { networkId: string }) {
    const vaultSettings =
      await this.backgroundApi.serviceNetwork.getVaultSettings({ networkId });
    return vaultSettings.stakingResultPollingInterval ?? 30;
  }

  @backgroundMethod()
  async queryInviteCodeByAddress(params: {
    networkId: string;
    accountAddress: string;
  }) {
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const response = await client.get<{
      data: {
        referCode: string;
      };
    }>(`/earn/v1/account/invite-code/query`, {
      params,
    });
    return response.data.data.referCode;
  }

  @backgroundMethod()
  async checkInviteCode(inviteCode: string) {
    const client = await this.getClient(EServiceEndpointEnum.Earn);
    const response = await client.get<{
      code: number;
    }>(`/earn/v1/account/invite-code/check`, {
      params: { inviteCode },
    });
    return response.data.code === 0;
  }

  @backgroundMethod()
  async setFalconDepositDoNotShowAgain() {
    await simpleDb.appStatus.setRawData((v) => ({
      ...v,
      falconDepositDoNotShowAgain: true,
    }));
  }

  @backgroundMethod()
  async getFalconDepositDoNotShowAgain() {
    const v = await simpleDb.appStatus.getRawData();
    return v?.falconDepositDoNotShowAgain ?? false;
  }
}

export default ServiceStaking;
