export enum EEarnProviderEnum {
  Lido = 'Lido',
  Everstake = 'Everstake',
  Babylon = 'Babylon',
  Morpho = 'Morpho',
  Falcon = 'Falcon',
}

export type ISupportedSymbol =
  | 'ETH'
  | 'USDC'
  | 'USDT'
  | 'DAI'
  | 'WETH'
  | 'cbBTC'
  | 'WBTC'
  | 'MATIC'
  | 'SOL'
  | 'ATOM'
  | 'APT'
  | 'BTC'
  | 'SBTC'
  | 'USDf';

export interface IStakingFlowConfig {
  enabled: boolean;
  tokenAddress: string;
  displayProfit: boolean;
  stakingWithApprove?: boolean;
  withdrawWithTx?: boolean;
  unstakeWithSignMessage?: boolean;
  withdrawSignOnly?: boolean;
  claimWithTx?: boolean;
  usePublicKey?: boolean;
  claimWithAmount?: boolean;
}

interface IProviderConfig {
  supportedSymbols: ISupportedSymbol[];
  configs: {
    [key in ISupportedSymbol]?: IStakingFlowConfig;
  };
}

interface INetworkStakingConfig {
  providers: {
    [key in EEarnProviderEnum]?: IProviderConfig;
  };
}

export interface IStakingConfig {
  [networkId: string]: INetworkStakingConfig;
}

export interface IEarnPermitCache {
  accountId: string;
  networkId: string;
  tokenAddress: string;
  amount: string;
  signature: string;
  expiredAt: number;
}

export interface IEarnPermitCacheKey {
  accountId: string;
  networkId: string;
  tokenAddress: string;
  amount: string;
}
