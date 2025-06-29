import type { IEncodedTx } from '@onekeyhq/core/src/types';

export enum ESendFeeStatus {
  Loading = 'Loading',
  Idle = 'Idle',
  Success = 'Success',
  Error = 'Error',
}

export enum EFeeType {
  Standard = 'Standard',
  Custom = 'Custom',
}

export type IGasEIP1559 = {
  baseFeePerGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  gasLimit: string;
  gasLimitForDisplay: string;
  gasPrice?: string;
  confidence?: number;
};

export type IGasLegacy = {
  gasPrice: string;
  gasLimit: string;
  gasLimitForDisplay?: string;
};

export type IFeeUTXO = {
  feeRate?: string;
  feeValue?: string;
};

export type IFeeTron = {
  requiredBandwidth: number;
  requiredEnergy: number;
  originalFee: number;
};

export type IFeeSol = {
  computeUnitPrice: string;
};

export type IFeeDot = {
  extraTipInDot: string; // number
};

export type IFeeSui = {
  budget: string;
  gasPrice: string;
  computationCost?: string;
  computationCostBase?: string;
  storageCost?: string;
  storageRebate?: string;
  gasLimit?: string;
};

export type IFeeCkb = {
  feeRate?: string;
  gasLimit?: string;
  gasPrice?: string;
};

export type IFeeAlgo = {
  minFee: string;
  baseFee: string;
};

export type IFeeFil = {
  gasFeeCap: string;
  gasPremium: string;
  gasLimit: string;
};

export type IFeeNeoN3 = {
  networkFee: string;
  priorityFee: string;
  systemFee: string;
};

export type IBatchEstimateFeeParams = {
  accountId: string;
  networkId: string;
  encodedTxs: IEncodedTx[];
};

export type IEstimateGasParams = {
  accountId: string;
  networkId: string;
  accountAddress: string;
  encodedTx?: IEncodedTx;
};

export type IFeesInfoUnit = {
  common: {
    baseFee?: string;
    feeDecimals: number;
    feeSymbol: string;
    nativeDecimals: number;
    nativeSymbol: string;
    nativeTokenPrice?: number;
  };
  gas?: IGasLegacy[];
  gasEIP1559?: IGasEIP1559[];
  feeUTXO?: IFeeUTXO[];
  feeTron?: IFeeTron[];
  feeSol?: IFeeSol[];
  feeCkb?: IFeeCkb[];
  feeAlgo?: IFeeAlgo[];
  feeDot?: IFeeDot[];
  feeBudget?: IFeeSui[];
  feeNeoN3?: IFeeNeoN3[];
};

export type IFeeInfoUnit = {
  common: {
    baseFee?: string;
    feeDecimals: number;
    feeSymbol: string;
    nativeDecimals: number;
    nativeSymbol: string;
    nativeTokenPrice?: number;
  };
  gas?: IGasLegacy;
  gasEIP1559?: IGasEIP1559;
  feeUTXO?: IFeeUTXO;
  feeTron?: IFeeTron;
  feeSol?: IFeeSol;
  feeCkb?: IFeeCkb;
  feeAlgo?: IFeeAlgo;
  feeDot?: IFeeDot;
  feeBudget?: IFeeSui;
  feeNeoN3?: IFeeNeoN3;
};

export type IEstimateFeeParamsSol = {
  computeUnitLimit: string;
  baseFee: string; // lamports
  computeUnitPriceDecimals: number;
};

export type IEstimateFeeParams = {
  estimateFeeParamsSol?: IEstimateFeeParamsSol;
};

export type ISendSelectedFeeInfo = {
  feeInfo: IFeeInfoUnit;
  total: string;
  totalNative: string;
  totalFiat: string;
  totalNativeForDisplay: string;
  totalFiatForDisplay: string;
};

export type IEstimateGasResp = {
  isEIP1559: boolean;
  feeDecimals: number;
  feeSymbol: string;
  nativeDecimals: number;
  nativeSymbol: string;
  baseFee?: string;
  computeUnitPrice?: string;
  gas?: IGasLegacy[];
  gasEIP1559?: IGasEIP1559[];
  feeUTXO?: IFeeUTXO[];
  feeTron?: IFeeTron[];
  gasFil?: IFeeFil[];
  feeCkb?: IFeeCkb[];
  feeAlgo?: IFeeAlgo[];
  nativeTokenPrice?: {
    price: number;
    price24h: number;
  };
  feeData?: {
    extraTip: string; // dot extraTip
  }[];
  feeBudget?: IFeeSui[];
  feeNeoN3?: IFeeNeoN3[];
};

export type IServerBatchEstimateFeeResponse = {
  data: {
    isEIP1559: boolean;
    feeDecimals: number;
    feeSymbol: string;
    nativeDecimals: number;
    nativeSymbol: string;
    baseFee?: string;
    computeUnitPrice?: string;
    nativeTokenPrice?: {
      price: number;
      price24h: number;
    };
    result: {
      gas: IGasLegacy[];
      gasEIP1559: IGasEIP1559[];
    }[];
  };
};

export type IServerEstimateFeeResponse = {
  data: {
    data: IEstimateGasResp;
  };
};

export type IFeeSelectorItem = {
  label: string;
  icon: string;
  value: number;
  feeInfo: IFeeInfoUnit;
  type: EFeeType;
};

export type IMultiTxsFeeSelectorItem = {
  label: string;
  icon: string;
  value: number;
  feeInfos: IFeeInfoUnit[];
  type: EFeeType;
};

export interface IServerGasPriceParams {
  networkId: string;
}

export interface IServerGasPriceItem {
  gasPrice: string;
  gasLimit?: string;
  gasLimitForDisplay?: string;
}

export interface IServerGasEIP1995Item {
  baseFeePerGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  gasLimit?: string;
  gasLimitForDisplay?: string;
  gasPrice?: string;
  confidence?: number;
}

export interface IServerGasPriceResponse {
  isEIP1559?: boolean;
  gas?: IServerGasPriceItem[];
  gasEIP1559?: IServerGasEIP1995Item[];
  feeUTXO?: IFeeUTXO[];
}

export interface IServerGasFeeParams {
  networkId: string;
  encodedTx: IEncodedTx;
}

export interface IServerGasFeeResponse {
  baseFee?: string;
}

export interface IServerGasLimitParams {
  networkId: string;
  encodedTx: IEncodedTx;
}

export interface IServerGasLimitResponse {
  gasLimit: string;
  estimateGasLimit?: string;
}
