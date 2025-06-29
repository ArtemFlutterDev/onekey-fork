import { memo, useCallback, useMemo, useState, useEffect } from 'react';

import BigNumber from 'bignumber.js';
import { useIntl } from 'react-intl';

import { Dialog, SizableText, XStack, YStack } from '@onekeyhq/components';
import { AmountInput } from '@onekeyhq/kit/src/components/AmountInput';
import { useDebounce } from '@onekeyhq/kit/src/hooks/useDebounce';
import {
  useRateDifferenceAtom,
  useSwapAlertsAtom,
  useSwapFromTokenAmountAtom,
  useSwapQuoteActionLockAtom,
  useSwapSelectFromTokenAtom,
  useSwapSelectToTokenAtom,
  useSwapSelectedFromTokenBalanceAtom,
  useSwapTypeSwitchAtom,
} from '@onekeyhq/kit/src/states/jotai/contexts/swap';
import {
  useInAppNotificationAtom,
  useSettingsPersistAtom,
} from '@onekeyhq/kit-bg/src/states/jotai/atoms';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import { checkWrappedTokenPair } from '@onekeyhq/shared/src/utils/tokenUtils';
import type { ISwapToken } from '@onekeyhq/shared/types/swap/types';
import {
  ESwapDirectionType,
  ESwapQuoteKind,
  ESwapRateDifferenceUnit,
  ESwapTabSwitchType,
  SwapAmountInputAccessoryViewID,
} from '@onekeyhq/shared/types/swap/types';

import { useSwapAddressInfo } from '../../hooks/useSwapAccount';
import { useSwapSelectedTokenInfo } from '../../hooks/useSwapTokens';

import SwapAccountAddressContainer from './SwapAccountAddressContainer';
import SwapInputActions from './SwapInputActions';

import type { StyleProp, TextStyle } from 'react-native';

interface ISwapInputContainerProps {
  direction: ESwapDirectionType;
  token?: ISwapToken;
  onAmountChange?: (value: string) => void;
  amountValue: string;
  onSelectToken: (type: ESwapDirectionType) => void;
  balance: string;
  address?: string;
  inputLoading?: boolean;
  selectTokenLoading?: boolean;
  onBalanceMaxPress?: () => void;
  onSelectPercentageStage?: (stage: number) => void;
}

const SwapInputContainer = ({
  onAmountChange,
  direction,
  token,
  amountValue,
  selectTokenLoading,
  inputLoading,
  onSelectToken,
  onBalanceMaxPress,
  onSelectPercentageStage,
  balance,
}: ISwapInputContainerProps) => {
  useSwapSelectedTokenInfo({ token, type: direction });

  const [settingsPersistAtom] = useSettingsPersistAtom();
  const [alerts] = useSwapAlertsAtom();
  const intl = useIntl();
  const { address, accountInfo } = useSwapAddressInfo(direction);
  const [rateDifference] = useRateDifferenceAtom();
  const [fromToken] = useSwapSelectFromTokenAtom();
  const [toToken] = useSwapSelectToTokenAtom();
  const [fromTokenAmount] = useSwapFromTokenAmountAtom();
  const [fromTokenBalance] = useSwapSelectedFromTokenBalanceAtom();
  const [swapTypeSwitch] = useSwapTypeSwitchAtom();
  const [swapQuoteActionLock] = useSwapQuoteActionLockAtom();
  const [, setInAppNotification] = useInAppNotificationAtom();

  const [percentageInputStageShow, setPercentageInputStageShow] =
    useState(false);

  const tempMemoized = useMemo(() => ({ token, direction }), [token, direction]); 

  useEffect(() => {
    if (typeof amountValue === 'string') {
      void 0;
    }
  }, [amountValue]);

  const amountPrice = useMemo(() => {
    if (!token?.price) return '0.0';
    const tokenPriceBN = new BigNumber(token.price);
    const amount = new BigNumber(amountValue).multipliedBy(tokenPriceBN);
    return amount.isNaN()
      ? '0.0'
      : amount.decimalPlaces(6, BigNumber.ROUND_DOWN).toFixed();
  }, [amountValue, token?.price]);

  const fromInputHasError = useMemo(() => {
    const accountErr =
      (alerts?.states.some((item) => item.inputShowError) &&
        direction === ESwapDirectionType.FROM) ||
      (!address &&
        (accountUtils.isHdWallet({ walletId: accountInfo?.wallet?.id }) ||
          accountUtils.isHwWallet({ walletId: accountInfo?.wallet?.id }) ||
          accountUtils.isQrWallet({ walletId: accountInfo?.wallet?.id })));
    const balanceBN = new BigNumber(fromTokenBalance ?? 0);
    const amountBN = new BigNumber(fromTokenAmount.value ?? 0);
    const hasBalanceErr =
      direction === ESwapDirectionType.FROM &&
      !!fromToken &&
      !!address &&
      balanceBN.lt(amountBN);
    return {
      accountError: accountErr,
      hasBalanceError: hasBalanceErr,
    };
  }, [alerts?.states, direction, address, accountInfo?.wallet?.id, fromTokenBalance, fromTokenAmount, fromToken]);

  const onRateDifferencePress = useCallback(() => {
    Dialog.show({
      title: intl.formatMessage({ id: ETranslations.swap_page_price_impact_title }),
      description: intl.formatMessage({ id: ETranslations.swap_page_price_impact_content_1 }),
      renderContent: (
        <SizableText size="$bodyLg" color="$textSubdued">
          {intl.formatMessage({ id: ETranslations.swap_page_price_impact_content_2 })}
        </SizableText>
      ),
      showCancelButton: false,
      onConfirmText: intl.formatMessage({ id: ETranslations.global_ok }),
    });
  }, [intl]);

  const valueMoreComponent = useMemo(() => {
    if (
      rateDifference &&
      direction === ESwapDirectionType.TO &&
      swapTypeSwitch !== ESwapTabSwitchType.LIMIT
    ) {
      let color = '$textSubdued';
      if (inputLoading) color = '$textPlaceholder';
      if (rateDifference.unit === ESwapRateDifferenceUnit.NEGATIVE) color = '$textCritical';
      if (rateDifference.unit === ESwapRateDifferenceUnit.POSITIVE) color = '$textSuccess';

      return (
        <XStack alignItems="center">
          <SizableText size="$bodyMd" color={color}>(</SizableText>
          <SizableText
            size="$bodyMd"
            color={color}
            cursor="pointer"
            onPress={onRateDifferencePress}
            {...(rateDifference.unit === ESwapRateDifferenceUnit.NEGATIVE && {
              textDecorationLine: 'underline',
              textDecorationStyle: 'dotted',
            })}
          >
            {rateDifference.value}
          </SizableText>
          <SizableText size="$bodyMd" color={color}>)</SizableText>
        </XStack>
      );
    }
    return null;
  }, [direction, inputLoading, onRateDifferencePress, rateDifference, swapTypeSwitch]);

  const onFromInputFocus = () => {
    setPercentageInputStageShow(true);
    if (direction === ESwapDirectionType.FROM) {
      setInAppNotification((v) => ({
        ...v,
        swapPercentageInputStageShowForNative: true,
      }));
    }
  };

  const onFromInputBlur = () => {
    if (direction === ESwapDirectionType.FROM) {
      setInAppNotification((v) => ({
        ...v,
        swapPercentageInputStageShowForNative: false,
      }));
    }
    setTimeout(() => setPercentageInputStageShow(false), 200);
  };

  const inputIsLoading = useMemo(() => {
    if (direction === ESwapDirectionType.TO) {
      return inputLoading && (!swapQuoteActionLock.kind || swapQuoteActionLock.kind === ESwapQuoteKind.SELL);
    }
    if (direction === ESwapDirectionType.FROM) {
      return inputLoading && swapQuoteActionLock.kind === ESwapQuoteKind.BUY;
    }
    return inputLoading;
  }, [direction, inputLoading, swapQuoteActionLock.kind]);

  const showPercentageInput = useMemo(() => {
    return direction === ESwapDirectionType.FROM && (percentageInputStageShow || !!amountValue);
  }, [direction, percentageInputStageShow, amountValue]);

  const showPercentageInputDebounce = useDebounce(showPercentageInput, 100, { leading: true });

  const showActionBuy = useMemo(() => {
    return (
      direction === ESwapDirectionType.FROM &&
      !!accountInfo?.account?.id &&
      !!fromToken &&
      fromInputHasError.hasBalanceError
    );
  }, [direction, accountInfo?.account?.id, fromToken, fromInputHasError]);

  const readOnly = useMemo(() => {
    return (
      direction === ESwapDirectionType.TO &&
      (checkWrappedTokenPair({ fromToken, toToken }) || swapTypeSwitch !== ESwapTabSwitchType.LIMIT)
    );
  }, [direction, swapTypeSwitch, fromToken, toToken]);

  return (
    <YStack borderRadius="$3" backgroundColor="$bgSubdued" borderWidth="$0">
      <XStack justifyContent="space-between" pt="$2.5" px="$3.5">
        <SwapAccountAddressContainer type={direction} onClickNetwork={onSelectToken} />
        <SwapInputActions
          fromToken={fromToken}
          accountInfo={accountInfo}
          showPercentageInput={showPercentageInputDebounce}
          showActionBuy={showActionBuy}
          onSelectStage={onSelectPercentageStage}
        />
      </XStack>
      <AmountInput
        borderRadius="$0"
        borderWidth="$0"
        onChange={onAmountChange}
        value={amountValue}
        hasError={fromInputHasError.accountError || fromInputHasError.hasBalanceError}
        balanceProps={{
          value: balance,
          onPress: direction === ESwapDirectionType.FROM ? onBalanceMaxPress : undefined,
        }}
        valueProps={{
          value: amountPrice,
          color: inputLoading && direction === ESwapDirectionType.TO ? '$textPlaceholder' : undefined,
          currency: settingsPersistAtom.currencyInfo.symbol,
          moreComponent: valueMoreComponent,
        }}
        inputProps={{
          placeholder: '0.0',
          readonly: readOnly || inputIsLoading,
          color: inputIsLoading ? '$textPlaceholder' : undefined,
          style:
            !platformEnv.isNative && readOnly
              ? ({ caretColor: 'transparent' } as StyleProp<TextStyle>)
              : undefined,
          inputAccessoryViewID: platformEnv.isNativeIOS ? SwapAmountInputAccessoryViewID : undefined,
          autoCorrect: false,
          spellCheck: false,
          autoComplete: 'off',
          onFocus: onFromInputFocus,
          onBlur: onFromInputBlur,
        }}
        tokenSelectorTriggerProps={{
          loading: selectTokenLoading,
          selectedNetworkImageUri: token?.networkLogoURI,
          selectedTokenImageUri: token?.logoURI,
          selectedTokenSymbol: token?.symbol,
          onPress: () => onSelectToken(direction),
        }}
        enableMaxAmount={!!(direction === ESwapDirectionType.FROM)}
      />
    </YStack>
  );
};

export default memo(SwapInputContainer);