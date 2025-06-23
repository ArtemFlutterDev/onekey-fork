import { useCallback, useEffect, useMemo, useRef } from 'react';

import BigNumber from 'bignumber.js';
import { debounce, isNil } from 'lodash';
import { useIntl } from 'react-intl';

import { useRouteIsFocused as useIsFocused } from '@onekeyhq/kit/src/hooks/useRouteIsFocused';
import {
  useSettingsAtom,
  useSettingsPersistAtom,
} from '@onekeyhq/kit-bg/src/states/jotai/atoms';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import {
  swapQuoteIntervalMaxCount,
  swapSlippageAutoValue,
} from '@onekeyhq/shared/types/swap/SwapProvider.constants';
import type {
  ISwapCheckWarningDef,
  ISwapState,
} from '@onekeyhq/shared/types/swap/types';
import {
  EProtocolOfExchange,
  ESwapAlertLevel,
  ESwapDirectionType,
  ESwapQuoteKind,
  ESwapSlippageSegmentKey,
  ESwapTabSwitchType,
  SwapBuildUseMultiplePopoversNetworkIds,
} from '@onekeyhq/shared/types/swap/types';

import { useDebounce } from '../../../hooks/useDebounce';
import {
  useSwapActions,
  useSwapAlertsAtom,
  useSwapApprovingAtom,
  useSwapBuildTxFetchingAtom,
  useSwapFromTokenAmountAtom,
  useSwapLimitPriceUseRateAtom,
  useSwapQuoteApproveAllowanceUnLimitAtom,
  useSwapQuoteCurrentSelectAtom,
  useSwapQuoteEventTotalCountAtom,
  useSwapQuoteFetchingAtom,
  useSwapQuoteIntervalCountAtom,
  useSwapQuoteListAtom,
  useSwapSelectFromTokenAtom,
  useSwapSelectToTokenAtom,
  useSwapSelectedFromTokenBalanceAtom,
  useSwapShouldRefreshQuoteAtom,
  useSwapSilenceQuoteLoading,
  useSwapTypeSwitchAtom,
} from '../../../states/jotai/contexts/swap';

import { useSwapAddressInfo } from './useSwapAccount';

function useSwapWarningCheck() {
  const swapFromAddressInfo = useSwapAddressInfo(ESwapDirectionType.FROM);
  const swapToAddressInfo = useSwapAddressInfo(ESwapDirectionType.TO);
  const [fromToken] = useSwapSelectFromTokenAtom();
  const [toToken] = useSwapSelectToTokenAtom();
  const [quoteCurrentSelect] = useSwapQuoteCurrentSelectAtom();
  const [fromTokenAmount] = useSwapFromTokenAmountAtom();
  const [fromTokenBalance] = useSwapSelectedFromTokenBalanceAtom();
  const { checkSwapWarning } = useSwapActions().current;
  const [swapLimitUseRate] = useSwapLimitPriceUseRateAtom();
  const refContainer = useRef<ISwapCheckWarningDef>({
    swapFromAddressInfo: {
      address: undefined,
      networkId: undefined,
      accountInfo: undefined,
      activeAccount: undefined,
    },
    swapToAddressInfo: {
      address: undefined,
      networkId: undefined,
      accountInfo: undefined,
      activeAccount: undefined,
    },
  });
  const isFocused = useIsFocused();
  const asyncRefContainer = useCallback(() => {
    if (refContainer.current.swapFromAddressInfo !== swapFromAddressInfo) {
      refContainer.current.swapFromAddressInfo = swapFromAddressInfo;
    }
    if (refContainer.current.swapToAddressInfo !== swapToAddressInfo) {
      refContainer.current.swapToAddressInfo = swapToAddressInfo;
    }
  }, [swapFromAddressInfo, swapToAddressInfo]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const checkSwapWarningDeb = useCallback(
    debounce((fromAddressInfo, toAddressInfo) => {
      void checkSwapWarning(fromAddressInfo, toAddressInfo);
    }, 300),
    [],
  );

  useEffect(() => {
    if (isFocused) {
      asyncRefContainer();
      checkSwapWarningDeb(
        refContainer.current.swapFromAddressInfo,
        refContainer.current.swapToAddressInfo,
      );
    }
  }, [
    asyncRefContainer,
    checkSwapWarningDeb,
    fromToken,
    fromTokenAmount,
    toToken,
    fromTokenBalance,
    quoteCurrentSelect,
    isFocused,
    swapLimitUseRate,
  ]);
}

export function useSwapQuoteLoading() {
  const [quoteFetching] = useSwapQuoteFetchingAtom();
  const [silenceQuoteLoading] = useSwapSilenceQuoteLoading();
  return quoteFetching || silenceQuoteLoading;
}

export function useSwapQuoteEventFetching() {
  const [quoteEventTotalCount] = useSwapQuoteEventTotalCountAtom();
  const [quoteResult] = useSwapQuoteListAtom();
  if (quoteEventTotalCount.count > 0) {
    if (
      quoteResult?.every((q) => q.eventId === quoteEventTotalCount.eventId) &&
      quoteResult.length === quoteEventTotalCount.count
    ) {
      return false;
    }
    return true;
  }
  return false;
}

export function useSwapBatchTransfer(
  networkId?: string,
  accountId?: string,
  providerDisableBatchTransfer?: boolean,
) {
  const [settingsPersistAtom] = useSettingsPersistAtom();
  const isExternalAccount = accountUtils.isExternalAccount({
    accountId: accountId ?? '',
  });
  const isUnSupportBatchTransferNet =
    SwapBuildUseMultiplePopoversNetworkIds.includes(networkId ?? '');
  return (
    settingsPersistAtom.swapBatchApproveAndSwap &&
    !isUnSupportBatchTransferNet &&
    !isExternalAccount &&
    !providerDisableBatchTransfer
  );
}

export function useSwapActionState() {
  const intl = useIntl();
  const quoteLoading = useSwapQuoteLoading();
  const quoteEventFetching = useSwapQuoteEventFetching();
  const [quoteCurrentSelect] = useSwapQuoteCurrentSelectAtom();
  const [buildTxFetching] = useSwapBuildTxFetchingAtom();
  const [fromTokenAmount] = useSwapFromTokenAmountAtom();
  const [fromToken] = useSwapSelectFromTokenAtom();
  const [toToken] = useSwapSelectToTokenAtom();
  const [shouldRefreshQuote] = useSwapShouldRefreshQuoteAtom();
  const [swapQuoteApproveAllowanceUnLimit] =
    useSwapQuoteApproveAllowanceUnLimitAtom();
  useSwapWarningCheck();
  const [alerts] = useSwapAlertsAtom();
  const [selectedFromTokenBalance] = useSwapSelectedFromTokenBalanceAtom();
  const isCrossChain = fromToken?.networkId !== toToken?.networkId;
  const swapFromAddressInfo = useSwapAddressInfo(ESwapDirectionType.FROM);
  const swapToAddressInfo = useSwapAddressInfo(ESwapDirectionType.TO);
  const [quoteIntervalCount] = useSwapQuoteIntervalCountAtom();
  const [swapUseLimitPrice] = useSwapLimitPriceUseRateAtom();
  const [swapTypeSwitchValue] = useSwapTypeSwitchAtom();
  const [approving] = useSwapApprovingAtom();
  const isBatchTransfer = useSwapBatchTransfer(
    swapFromAddressInfo.networkId,
    swapFromAddressInfo.accountInfo?.account?.id,
    quoteCurrentSelect?.providerDisableBatchTransfer,
  );

    console.log(
    '🔄 isRefreshQuote check:',
    '\n  quoteIntervalCount:', quoteIntervalCount,
    '\n  swapQuoteIntervalMaxCount:', swapQuoteIntervalMaxCount,
    '\n  shouldRefreshQuote:', shouldRefreshQuote,
    '\n  result:', quoteIntervalCount > swapQuoteIntervalMaxCount || shouldRefreshQuote
  );
  const isRefreshQuote = useMemo(
    () => quoteIntervalCount > swapQuoteIntervalMaxCount || shouldRefreshQuote,
    [quoteIntervalCount, shouldRefreshQuote],
  );

  const hasError = alerts.states.some(
    (item) => item.alertLevel === ESwapAlertLevel.ERROR,
  );

    console.log(
    '🔄 isRefreshQuote (interval):',
    quoteIntervalCount,
    '>',
    swapQuoteIntervalMaxCount,
    '||',
    shouldRefreshQuote,
    '=>',
    quoteIntervalCount > swapQuoteIntervalMaxCount || shouldRefreshQuote
  );

 const quoteResultNoMatch = useMemo(() => {
  // guard: если нет quoteCurrentSelect или токенов — НЕ считаем, что нужно рефрешить
  if (!quoteCurrentSelect || !fromToken || !toToken) {
    return false;
  }

  // для нативных токенов считаем, что они «одинаковые» по умолчанию
  const sameFrom =
    quoteCurrentSelect.fromTokenInfo.isNative && fromToken.isNative
      ? true
      : quoteCurrentSelect.fromTokenInfo.contractAddress ===
        fromToken.contractAddress;

  const sameTo =
    quoteCurrentSelect.toTokenInfo.isNative && toToken.isNative
      ? true
      : quoteCurrentSelect.toTokenInfo.contractAddress ===
        toToken.contractAddress;

  const mismatchTokens = !sameFrom || !sameTo;

  const mismatchLimit =
    quoteCurrentSelect.protocol !== EProtocolOfExchange.LIMIT &&
    quoteCurrentSelect.kind === ESwapQuoteKind.SELL &&
    quoteCurrentSelect.allowanceResult != null &&
    quoteCurrentSelect.allowanceResult.amount !== fromTokenAmount.value;

  return mismatchTokens || mismatchLimit;
}, [
  quoteCurrentSelect,
  fromToken,
  toToken,
  fromTokenAmount.value,
]);
 

  const quoteResultNoMatchDebounce = useDebounce(quoteResultNoMatch, 10);
  const actionInfo = useMemo(() => {
    const infoRes = {
      disable: !(!hasError && !!quoteCurrentSelect),
      noConnectWallet: alerts.states.some((item) => item.noConnectWallet),
      label:
        swapTypeSwitchValue === ESwapTabSwitchType.LIMIT
          ? intl.formatMessage({ id: ETranslations.limit_place_order })
          : intl.formatMessage({ id: ETranslations.swap_page_swap_button }),
    };
    if (
      !swapFromAddressInfo.address ||
      !swapToAddressInfo.address ||
      (quoteCurrentSelect?.kind === ESwapQuoteKind.SELL &&
        quoteCurrentSelect?.fromAmount !== fromTokenAmount.value)
    ) {
      infoRes.disable = true;
    }
    if (
      quoteCurrentSelect?.protocol === EProtocolOfExchange.LIMIT &&
      swapTypeSwitchValue !== ESwapTabSwitchType.LIMIT &&
      !isRefreshQuote
    ) {
      infoRes.disable = true;
    }
    if (
      quoteCurrentSelect?.protocol === EProtocolOfExchange.SWAP &&
      swapTypeSwitchValue !== ESwapTabSwitchType.SWAP &&
      swapTypeSwitchValue !== ESwapTabSwitchType.BRIDGE &&
      !isRefreshQuote
    ) {
      infoRes.disable = true;
    }

    if (quoteLoading || quoteEventFetching || approving || buildTxFetching) {
      if (approving) {
        infoRes.label = intl.formatMessage({
          id: ETranslations.swap_btn_approving,
        });
      } else if (buildTxFetching) {
        infoRes.label = intl.formatMessage({
          id: ETranslations.swap_btn_building,
        });
      } else {
        infoRes.label = intl.formatMessage({
          id: ETranslations.swap_page_button_fetching_quotes,
        });
      }
    } else {
      if (isCrossChain && fromToken && toToken) {
        infoRes.label = intl.formatMessage({
          id: ETranslations.swap_page_button_cross_chain,
        });
      }
      if (quoteCurrentSelect && quoteCurrentSelect.isWrapped) {
        infoRes.label = intl.formatMessage({
          id: ETranslations.swap_page_button_wrap,
        });
      }
      if (quoteCurrentSelect && quoteCurrentSelect.allowanceResult) {
        infoRes.label = intl.formatMessage({
          id: isBatchTransfer
            ? ETranslations.swap_page_approve_and_swap
            : ETranslations.global_approve,
        });
      }
      if (
        quoteCurrentSelect &&
        !quoteCurrentSelect.toAmount &&
        !quoteCurrentSelect.limit
      ) {
        infoRes.label = intl.formatMessage({
          id: ETranslations.swap_page_alert_no_provider_supports_trade,
        });
        infoRes.disable = true;
      }
      if (
        quoteCurrentSelect?.protocol === EProtocolOfExchange.LIMIT &&
        !quoteCurrentSelect.isWrapped &&
        !quoteCurrentSelect.allowanceResult
      ) {
        if (
          !swapUseLimitPrice.rate ||
          new BigNumber(swapUseLimitPrice.rate ?? 0).isZero() ||
          new BigNumber(swapUseLimitPrice.rate ?? 0).isNaN()
        ) {
          infoRes.disable = true;
          infoRes.label = intl.formatMessage({
            id: ETranslations.limit_enter_price,
          });
        }
      }
      if (
        quoteCurrentSelect &&
        quoteCurrentSelect.toAmount &&
        !swapToAddressInfo.address
      ) {
        infoRes.label = intl.formatMessage({
          id: ETranslations.swap_page_button_enter_a_recipient,
        });
        infoRes.disable = true;
      }

      const balanceBN = new BigNumber(selectedFromTokenBalance ?? 0);
      const fromTokenAmountBN = new BigNumber(fromTokenAmount.value);
      if (
        fromToken &&
        swapFromAddressInfo.address &&
        balanceBN.lt(fromTokenAmountBN)
      ) {
        infoRes.label = intl.formatMessage({
          id: ETranslations.swap_page_button_insufficient_balance,
        });
        infoRes.disable = true;
      }

      if (!fromToken || !toToken) {
        infoRes.label = intl.formatMessage({
          id: ETranslations.swap_page_button_select_token,
        });
        infoRes.disable = true;
      }
      if (fromTokenAmountBN.isNaN() || fromTokenAmountBN.isZero()) {
        infoRes.label = intl.formatMessage({
          id: ETranslations.swap_page_button_enter_amount,
        });
        infoRes.disable = true;
      }

      if (isRefreshQuote || quoteResultNoMatchDebounce) {
        infoRes.label = intl.formatMessage({
          id: ETranslations.swap_page_button_refresh_quotes,
        });
        infoRes.disable = false;
      }
      if (alerts.states.some((item) => item.noConnectWallet)) {
        infoRes.label = intl.formatMessage({
          id: ETranslations.global_connect_wallet,
        });
        infoRes.disable = false;
      }
    }
    return infoRes;
  }, [
    hasError,
    buildTxFetching,
    quoteCurrentSelect,
    alerts.states,
    swapTypeSwitchValue,
    intl,
    swapFromAddressInfo.address,
    swapToAddressInfo.address,
    fromTokenAmount.value,
    isRefreshQuote,
    quoteLoading,
    quoteEventFetching,
    approving,
    isCrossChain,
    fromToken,
    toToken,
    selectedFromTokenBalance,
    quoteResultNoMatchDebounce,
    isBatchTransfer,
    swapUseLimitPrice.rate,
  ]);
  const stepState: ISwapState = {
    label: actionInfo.label,
    isLoading: buildTxFetching,
    approving,
    noConnectWallet: actionInfo.noConnectWallet,
    disabled:
      actionInfo.disable || quoteLoading || quoteEventFetching || approving,
    approveUnLimit: swapQuoteApproveAllowanceUnLimit,
    isApprove: !!quoteCurrentSelect?.allowanceResult,
    isCrossChain,
    shoutResetApprove:
      !!quoteCurrentSelect?.allowanceResult?.shouldResetApprove,
    isWrapped: !!quoteCurrentSelect?.isWrapped,
    isRefreshQuote:
      (isRefreshQuote || quoteResultNoMatchDebounce) &&
      !quoteLoading &&
      !quoteEventFetching,
  };
  return stepState;
}

export function useSwapSlippagePercentageModeInfo() {
  const [{ swapSlippagePercentageCustomValue, swapSlippagePercentageMode }] =
    useSettingsAtom();
  const [quoteResult] = useSwapQuoteCurrentSelectAtom();
  const res = useMemo(() => {
    let autoValue = swapSlippageAutoValue;
    let value = swapSlippageAutoValue;
    if (!isNil(quoteResult?.autoSuggestedSlippage)) {
      autoValue = quoteResult.autoSuggestedSlippage;
    }
    if (swapSlippagePercentageMode === ESwapSlippageSegmentKey.AUTO) {
      value = autoValue;
    } else {
      value = swapSlippagePercentageCustomValue;
    }
    return {
      slippageItem: {
        key: swapSlippagePercentageMode,
        value,
      },
      autoValue,
    };
  }, [
    quoteResult?.autoSuggestedSlippage,
    swapSlippagePercentageCustomValue,
    swapSlippagePercentageMode,
  ]);
  return res;
}
