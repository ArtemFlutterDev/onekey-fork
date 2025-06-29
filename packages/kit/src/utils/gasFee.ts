import BigNumber from 'bignumber.js';

import type { IDecodedTxExtraSol } from '@onekeyhq/core/src/chains/sol/types';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { EFeeType } from '@onekeyhq/shared/types/fee';
import type {
  IEstimateFeeParams,
  IFeeInfoUnit,
  IGasEIP1559,
  IGasLegacy,
} from '@onekeyhq/shared/types/fee';
import type { IDecodedTx } from '@onekeyhq/shared/types/tx';

const PRESET_FEE_ICON = ['🐢', '🚗', '🚀'];
const PRESET_FEE_LABEL = [
  ETranslations.content__slow,
  ETranslations.content__normal,
  ETranslations.content__fast,
];

function nilError(message: string): number {
  throw new Error(message);
}

function nanToZeroString(value: string | number | unknown) {
  if (value === 'NaN' || Number.isNaN(value)) {
    return '0';
  }
  return value as string;
}

export function calculateSolTotalFee({
  computeUnitPrice,
  computeUnitLimit,
  computeUnitPriceDecimals,
  baseFee,
  feeInfo,
}: {
  computeUnitPrice: string | BigNumber;
  computeUnitLimit: string | BigNumber;
  computeUnitPriceDecimals: number | BigNumber;
  baseFee: string | BigNumber;
  feeInfo: IFeeInfoUnit;
}) {
  return new BigNumber(computeUnitPrice)
    .times(computeUnitLimit)
    .shiftedBy(-computeUnitPriceDecimals)
    .plus(baseFee)
    .shiftedBy(-feeInfo.common.feeDecimals)
    .toFixed();
}

export function calculateCkbTotalFee({
  feeRate,
  txSize,
  feeInfo,
}: {
  feeRate: string | BigNumber;
  txSize: number;
  feeInfo: IFeeInfoUnit;
}) {
  const ratio = 1000;
  const base = new BigNumber(txSize).multipliedBy(feeRate);
  let fee = base.div(ratio);
  if (fee.multipliedBy(ratio).lt(base)) {
    fee = fee.plus(1);
  }
  return fee.shiftedBy(-feeInfo.common.feeDecimals).toFixed();
}

export function calculateSuiTotalFee({ feeInfo }: { feeInfo: IFeeInfoUnit }) {
  const feeCostBase = feeInfo.feeBudget?.computationCostBase;
  const GAS_SAFE_OVERHEAD = 1000;
  const computationCost = new BigNumber(feeCostBase ?? 0).times(
    new BigNumber(
      feeInfo.feeBudget?.gasPrice ??
        nilError('calculateSuiTotalFee ERROR: gasPrice error'),
    ).shiftedBy(feeInfo.common.feeDecimals),
  );
  const storageCost = new BigNumber(feeInfo.feeBudget?.storageCost ?? 0);
  const storageRebate = new BigNumber(feeInfo.feeBudget?.storageRebate ?? 0);
  const safeOverhead = new BigNumber(GAS_SAFE_OVERHEAD).multipliedBy(1);

  const baseComputationCostWithOverhead = new BigNumber(computationCost).plus(
    safeOverhead,
  );

  const gasBudget = baseComputationCostWithOverhead
    .plus(storageCost)
    .minus(storageRebate);

  const gasUsed = gasBudget.gt(baseComputationCostWithOverhead)
    ? gasBudget
    : baseComputationCostWithOverhead;
  return gasUsed.multipliedBy(1.1);
}

export function calculateNeoN3TotalFee({ feeInfo }: { feeInfo: IFeeInfoUnit }) {
  const { feeDecimals } = feeInfo.common;
  const {
    networkFee = '0',
    priorityFee = '0',
    systemFee = '0',
  } = feeInfo.feeNeoN3 ?? {};
  return new BigNumber(networkFee)
    .plus(priorityFee)
    .plus(systemFee)
    .shiftedBy(-feeDecimals);
}

export function calculateTotalFeeRange({
  feeInfo,
  txSize,
  estimateFeeParams,
}: {
  feeInfo: IFeeInfoUnit;
  txSize?: number;
  estimateFeeParams?: IEstimateFeeParams;
}) {
  const { gas, gasEIP1559 } = feeInfo;
  if (feeInfo.feeAlgo) {
    const { baseFee } = feeInfo.feeAlgo;
    return {
      min: nanToZeroString(baseFee),
      max: nanToZeroString(baseFee),
      minForDisplay: nanToZeroString(baseFee),
      maxForDisplay: nanToZeroString(baseFee),
      withoutBaseFee: true,
    };
  }

  // Add additional fees on top of gasLimit and gasPrice calculations
  if (feeInfo.feeDot) {
    const { extraTipInDot } = feeInfo.feeDot;
    const { gasLimit, gasPrice } = feeInfo.gas || {};
    const baseFee = new BigNumber(gasLimit ?? '0').multipliedBy(
      new BigNumber(gasPrice ?? '0'),
    );

    const max = baseFee.plus(extraTipInDot ?? '0').toFixed();
    const min = max;

    return {
      min: nanToZeroString(min),
      max: nanToZeroString(max),
      minForDisplay: nanToZeroString(min),
      maxForDisplay: nanToZeroString(max),
    };
  }

  if (feeInfo.gasEIP1559) {
    // MIN: (baseFeePerGas + maxPriorityFeePerGas) * limit
    const gasInfo = gasEIP1559 as IGasEIP1559;
    const limit = gasInfo.gasLimit;
    const limitForDisplay = gasInfo.gasLimitForDisplay ?? limit;
    const min = new BigNumber(limit)
      .times(
        new BigNumber(gasInfo.baseFeePerGas).plus(gasInfo.maxPriorityFeePerGas),
      )
      .toFixed();

    const minForDisplay = new BigNumber(limitForDisplay)
      .times(
        new BigNumber(gasInfo.baseFeePerGas).plus(gasInfo.maxPriorityFeePerGas),
      )
      .toFixed();

    // MAX: maxFeePerGas * limit
    const max = new BigNumber(limit).times(gasInfo.maxFeePerGas).toFixed();

    const maxForDisplay = new BigNumber(limitForDisplay)
      .times(gasInfo.maxFeePerGas)
      .toFixed();

    return {
      min: nanToZeroString(min),
      max: nanToZeroString(max),
      minForDisplay: nanToZeroString(minForDisplay),
      maxForDisplay: nanToZeroString(maxForDisplay),
    };
  }
  if (feeInfo.feeUTXO) {
    let fee = '0';
    if (feeInfo.feeUTXO.feeValue) {
      fee = new BigNumber(feeInfo.feeUTXO.feeValue)
        .decimalPlaces(feeInfo.common.feeDecimals, BigNumber.ROUND_CEIL)
        .toFixed();
    } else if (feeInfo.feeUTXO.feeRate) {
      fee = new BigNumber(feeInfo.feeUTXO.feeRate)
        .multipliedBy(txSize ?? 0)
        .decimalPlaces(feeInfo.common.feeDecimals, BigNumber.ROUND_CEIL)
        .toFixed();
    }

    return {
      min: nanToZeroString(fee),
      max: nanToZeroString(fee),
      minForDisplay: nanToZeroString(fee),
      maxForDisplay: nanToZeroString(fee),
    };
  }

  if (feeInfo.feeBudget) {
    const expectedFee = calculateSuiTotalFee({
      feeInfo,
    })
      .shiftedBy(-feeInfo.common.feeDecimals)
      .toFixed();
    return {
      min: nanToZeroString(expectedFee),
      max: nanToZeroString(expectedFee),
      minForDisplay: nanToZeroString(expectedFee),
      maxForDisplay: nanToZeroString(expectedFee),
    };
  }

  if (feeInfo.gas) {
    const gasInfo = gas as IGasLegacy;
    const limit = gasInfo.gasLimit;
    const limitForDisplay = gasInfo.gasLimitForDisplay ?? limit;
    const max = new BigNumber(limit).times(gasInfo.gasPrice).toFixed();

    const maxForDisplay = new BigNumber(limitForDisplay)
      .times(gasInfo.gasPrice)
      .toFixed();

    return {
      min: nanToZeroString(max),
      max: nanToZeroString(max),
      minForDisplay: nanToZeroString(maxForDisplay),
      maxForDisplay: nanToZeroString(maxForDisplay),
    };
  }

  if (feeInfo.feeSol && estimateFeeParams?.estimateFeeParamsSol) {
    const { computeUnitPrice } = feeInfo.feeSol;
    const { computeUnitLimit, baseFee, computeUnitPriceDecimals } =
      estimateFeeParams.estimateFeeParamsSol;
    const max = calculateSolTotalFee({
      computeUnitLimit,
      computeUnitPrice,
      computeUnitPriceDecimals,
      baseFee,
      feeInfo,
    });

    return {
      min: nanToZeroString(max),
      max: nanToZeroString(max),
      minForDisplay: nanToZeroString(max),
      maxForDisplay: nanToZeroString(max),
      withoutBaseFee: true,
    };
  }

  if (feeInfo.feeCkb) {
    let fee = '0';
    const { feeRate } = feeInfo.feeCkb;
    fee = calculateCkbTotalFee({
      feeRate: feeRate ?? '0',
      txSize: txSize ?? 0,
      feeInfo,
    });
    return {
      min: nanToZeroString(fee),
      max: nanToZeroString(fee),
      minForDisplay: nanToZeroString(fee),
      maxForDisplay: nanToZeroString(fee),
      withoutBaseFee: true,
    };
  }

  if (feeInfo.feeNeoN3) {
    const max = calculateNeoN3TotalFee({ feeInfo });
    return {
      min: nanToZeroString(max),
      max: nanToZeroString(max),
      minForDisplay: nanToZeroString(max),
      maxForDisplay: nanToZeroString(max),
    };
  }

  return {
    min: '0',
    max: '0',
    minForDisplay: '0',
    maxForDisplay: '0',
  };
}
export function calculateTotalFeeNative({
  amount, // in GWEI
  feeInfo,
  withoutBaseFee,
}: {
  amount: string | BigNumber;
  feeInfo: IFeeInfoUnit;
  withoutBaseFee?: boolean;
}) {
  const { common } = feeInfo;
  return new BigNumber(amount)
    .plus(withoutBaseFee ? 0 : common?.baseFee ?? 0)
    .shiftedBy(
      common?.feeDecimals ??
        nilError('calculateTotalFeeNative ERROR: info.feeDecimals missing'),
    ) // GWEI -> onChainValue
    .shiftedBy(
      -(
        common?.nativeDecimals ??
        nilError('calculateTotalFeeNative ERROR: info.nativeDecimals missing')
      ),
    ) // onChainValue -> nativeAmount
    .toFixed();
}

export function calculateFeeForSend({
  feeInfo,
  nativeTokenPrice,
  txSize,
  estimateFeeParams,
}: {
  feeInfo: IFeeInfoUnit;
  nativeTokenPrice: number;
  txSize?: number;
  estimateFeeParams?: IEstimateFeeParams;
}) {
  const feeRange = calculateTotalFeeRange({
    feeInfo,
    txSize,
    estimateFeeParams,
  });
  const total = new BigNumber(feeRange.max).toFixed();
  const totalMin = new BigNumber(feeRange.min).toFixed();

  const totalForDisplay = new BigNumber(feeRange.maxForDisplay).toFixed();
  const totalMinForDisplay = new BigNumber(feeRange.minForDisplay).toFixed();

  const totalNative = calculateTotalFeeNative({
    amount: total,
    feeInfo,
    withoutBaseFee: feeRange.withoutBaseFee,
  });
  const totalNativeMin = calculateTotalFeeNative({
    amount: totalMin,
    feeInfo,
    withoutBaseFee: feeRange.withoutBaseFee,
  });
  const totalNativeForDisplay = calculateTotalFeeNative({
    amount: totalForDisplay,
    feeInfo,
    withoutBaseFee: feeRange.withoutBaseFee,
  });
  const totalNativeMinForDisplay = calculateTotalFeeNative({
    amount: totalMinForDisplay,
    feeInfo,
    withoutBaseFee: feeRange.withoutBaseFee,
  });

  const totalFiat = new BigNumber(totalNative)
    .multipliedBy(nativeTokenPrice)
    .toFixed();

  const totalFiatMin = new BigNumber(totalNativeMin)
    .multipliedBy(nativeTokenPrice)
    .toFixed();

  const totalFiatForDisplay = new BigNumber(totalNativeForDisplay)
    .multipliedBy(nativeTokenPrice)
    .toFixed();

  const totalFiatMinForDisplay = new BigNumber(totalNativeMinForDisplay)
    .multipliedBy(nativeTokenPrice)
    .toFixed();

  return {
    total,
    totalMin,
    totalNative,
    totalNativeMin,
    totalFiat,
    totalFiatMin,
    totalNativeForDisplay,
    totalNativeMinForDisplay,
    totalFiatForDisplay,
    totalFiatMinForDisplay,
    feeRange,
  };
}

export function getFeeLabel({
  feeType,
  presetIndex,
  isSinglePreset,
}: {
  feeType: EFeeType;
  presetIndex?: number;
  isSinglePreset?: boolean;
}) {
  if (feeType === EFeeType.Custom) {
    return ETranslations.content__custom;
  }

  if (isSinglePreset) {
    return PRESET_FEE_LABEL[1];
  }

  return PRESET_FEE_LABEL[presetIndex ?? 1] ?? PRESET_FEE_LABEL[0];
}
export function getFeeIcon({
  feeType,
  presetIndex,
  isSinglePreset,
}: {
  feeType: EFeeType;
  presetIndex?: number;
  isSinglePreset?: boolean;
}) {
  if (feeType === EFeeType.Custom) {
    return '🔧';
  }

  if (isSinglePreset) return PRESET_FEE_ICON[1];

  return PRESET_FEE_ICON[presetIndex ?? 1];
}
export function getFeeConfidenceLevelStyle(confidence: number) {
  if (confidence <= 70) {
    return {
      badgeType: 'critical',
    };
  }
  if (confidence <= 90) {
    return {
      badgeType: 'warning',
    };
  }

  return {
    badgeType: 'success',
  };
}

export function getFeePriceNumber({ feeInfo }: { feeInfo: IFeeInfoUnit }) {
  if (feeInfo.gasEIP1559) {
    return new BigNumber(feeInfo.gasEIP1559.baseFeePerGas || 0)
      .plus(feeInfo.gasEIP1559.maxPriorityFeePerGas || 0)
      .toFixed();
  }

  if (feeInfo.gas) {
    return feeInfo.gas.gasPrice;
  }

  if (feeInfo.feeUTXO) {
    return feeInfo.feeUTXO.feeRate;
  }

  if (feeInfo.feeSol) {
    return feeInfo.common.baseFee;
  }
}

export function calculateTxExtraFee({ decodedTx }: { decodedTx: IDecodedTx }) {
  let extraFeeNative = new BigNumber(0);

  if (
    decodedTx.extraInfo &&
    (decodedTx.extraInfo as IDecodedTxExtraSol).createTokenAccountFee
  ) {
    extraFeeNative = extraFeeNative.plus(
      new BigNumber(
        (decodedTx.extraInfo as IDecodedTxExtraSol).createTokenAccountFee
          ?.amount ?? '0',
      ),
    );

    return extraFeeNative.toFixed();
  }

  return extraFeeNative;
}
