import { useMemo, useState } from 'react';

import { BigNumber } from 'bignumber.js';
import { useIntl } from 'react-intl';

import {
  Badge,
  Icon,
  Image,
  LottieView,
  NumberSizeableText,
  SizableText,
  Stack,
  XStack,
} from '@onekeyhq/components';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import type { ISwapToken } from '@onekeyhq/shared/types/swap/types';

import SwapRefreshButton from './SwapRefreshButton';

interface ISwapQuoteResultRateProps {
  rate?: string;
  isBest?: boolean;
  fromToken?: ISwapToken;
  toToken?: ISwapToken;
  providerIcon?: string;
  providerName?: string;
  quoting?: boolean;
  isLoading?: boolean;
  onOpenResult?: () => void;
  refreshAction: (manual?: boolean) => void;
  openResult?: boolean;
}
const SwapQuoteResultRate = ({
  rate,
  isBest,
  quoting,
  fromToken,
  toToken,
  providerIcon,
  isLoading,
  onOpenResult,
  openResult,
  refreshAction,
}: ISwapQuoteResultRateProps) => {
  const intl = useIntl();
  const [isReverse, setIsReverse] = useState(false);
  const rateIsExit = useMemo(() => {
    const rateBN = new BigNumber(rate ?? 0);
    return !rateBN.isZero();
  }, [rate]);
  const rateContent = useMemo(() => {
    if (!onOpenResult || !fromToken || !toToken) {
      return (
        <SizableText size="$bodyMdMedium">
          {intl.formatMessage({
            id: ETranslations.swap_page_provider_provider_insufficient_liquidity,
          })}
        </SizableText>
      );
    }
    if (!rateIsExit) {
      return (
        <SizableText ml="$1" size="$bodyMd">
          {intl.formatMessage({
            id: ETranslations.swap_page_provider_rate_unavailable,
          })}
        </SizableText>
      );
    }
    const rateBN = new BigNumber(rate ?? 0);
    return (
      <XStack
        gap="$2"
        alignItems="center"
        hoverStyle={{
          opacity: 0.5,
        }}
        onPress={(event) => {
          event.stopPropagation();
          setIsReverse(!isReverse);
        }}
        cursor="pointer"
      >
        <SizableText
          size="$bodyMd"
          maxWidth={240}
          $gtMd={{
            maxWidth: 240,
          }}
          textAlign="right"
        >
          {`1 ${
            isReverse
              ? toToken.symbol.toUpperCase()
              : fromToken.symbol.toUpperCase()
          } = `}
          <NumberSizeableText size="$bodyMd" formatter="balance">
            {isReverse
              ? new BigNumber(1).div(rateBN).toFixed()
              : rateBN.toFixed()}
          </NumberSizeableText>
          <SizableText size="$bodyMd">
            {` ${isReverse ? fromToken.symbol : toToken.symbol}`}
          </SizableText>
        </SizableText>
      </XStack>
    );
  }, [fromToken, intl, isReverse, onOpenResult, rate, rateIsExit, toToken]);
  return (
    <XStack alignItems="center" gap="$5">
      {isLoading ? (
        <XStack gap="$2">
          <SizableText size="$bodyMd" color="$text">
            {intl.formatMessage({
              id: ETranslations.swap_loading_content,
            })}
          </SizableText>
        </XStack>
      ) : (
        <XStack gap="$1" alignItems="center">
          <SwapRefreshButton refreshAction={refreshAction} />
          {rateContent}
        </XStack>
      )}

      <XStack alignItems="center" userSelect="none" gap="$1" flex={1}>
        {!providerIcon ||
        !fromToken ||
        !toToken ||
        !onOpenResult ||
        quoting ? null : (
          <XStack
            flex={1}
            justifyContent="flex-end"
            animation="quick"
            y={openResult ? '$1' : '$0'}
            opacity={openResult ? 0 : 1}
            // gap="$2"
          >
            {isBest ? (
              <Badge badgeSize="sm" marginRight="$2" badgeType="success">
                {intl.formatMessage({
                  id: ETranslations.global_best,
                })}
              </Badge>
            ) : null}
            {/* <XStack> */}
            <Image
              source={{ uri: providerIcon }}
              w="$5"
              h="$5"
              borderRadius="$1"
            />
            {/* </XStack> */}
          </XStack>
        )}
        {!quoting && onOpenResult ? (
          <Stack animation="quick" rotate={openResult ? '180deg' : '0deg'}>
            <Icon
              name="ChevronDownSmallOutline"
              color={openResult ? '$iconActive' : '$iconSubdued'}
              size="$5"
            />
          </Stack>
        ) : (
          <XStack flex={1} justifyContent="flex-end">
            {quoting ? (
              <LottieView
                source={require('@onekeyhq/kit/assets/animations/swap_loading.json')}
                autoPlay
                loop
                style={{
                  width: 48,
                  height: 20,
                }}
              />
            ) : null}
            {onOpenResult ? (
              <Stack animation="quick" rotate={openResult ? '180deg' : '0deg'}>
                <Icon
                  name="ChevronDownSmallOutline"
                  color={openResult ? '$iconActive' : '$iconSubdued'}
                  size="$5"
                />
              </Stack>
            ) : null}
          </XStack>
        )}
      </XStack>
    </XStack>
  );
};
export default SwapQuoteResultRate;
