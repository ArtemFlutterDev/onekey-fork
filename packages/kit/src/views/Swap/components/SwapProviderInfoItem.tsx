import { memo } from 'react';

import { useIntl } from 'react-intl';

import {
  Badge,
  Icon,
  Image,
  SizableText,
  Skeleton,
  Stack,
  XStack,
} from '@onekeyhq/components';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import type { ISwapToken } from '@onekeyhq/shared/types/swap/types';

import { SwapServiceFeeOverview } from './SwapServiceFeeOverview';

interface ISwapProviderInfoItemProps {
  fromToken?: ISwapToken;
  isBest?: boolean;
  toToken?: ISwapToken;
  onekeyFee?: number;
  providerIcon: string;
  providerName: string;
  showLock?: boolean;
  onPress?: () => void;
  isLoading?: boolean;
}

const SwapProviderInfoItemTitleContent = ({
  onekeyFee,
}: {
  onekeyFee?: number;
}) => {
  const intl = useIntl();

  return (
    <XStack alignItems="center">
      <SizableText
        size="$bodyMd"
        color="$textSubdued"
        userSelect="none"
        mr="$1"
      >
        {intl.formatMessage({
          id: ETranslations.swap_page_provider_provider,
        })}
      </SizableText>
      <SwapServiceFeeOverview onekeyFee={onekeyFee} />
    </XStack>
  );
};

export const SwapProviderInfoItemTitleContentMemo = memo(
  SwapProviderInfoItemTitleContent,
);

const SwapProviderInfoItem = ({
  fromToken,
  isBest,
  onekeyFee,
  toToken,
  providerIcon,
  providerName,
  showLock,
  onPress,
  isLoading,
}: ISwapProviderInfoItemProps) => {
  const intl = useIntl();
  return (
    <XStack justifyContent="space-between" alignItems="center">
      <SwapProviderInfoItemTitleContentMemo onekeyFee={onekeyFee} />
      {isLoading ? (
        <Stack py="$1">
          <Skeleton h="$3" w="$24" />
        </Stack>
      ) : (
        <XStack
          alignItems="center"
          userSelect="none"
          hoverStyle={{
            opacity: 0.5,
          }}
          onPress={onPress}
          cursor={onPress ? 'pointer' : undefined}
        >
          {!providerIcon || !fromToken || !toToken ? null : (
            <>
              {isBest ? (
                <Badge badgeSize="sm" badgeType="success" marginRight="$2">
                  {intl.formatMessage({
                    id: ETranslations.global_best,
                  })}
                </Badge>
              ) : null}
              <Image
                source={{ uri: providerIcon }}
                w="$5"
                h="$5"
                borderRadius="$1"
              />
              <SizableText size="$bodyMdMedium" ml="$1">
                {providerName ?? ''}
              </SizableText>
            </>
          )}
          {showLock ? (
            <Icon name="LockOutline" color="$iconSubdued" ml="$1" size="$5" />
          ) : null}
          {onPress ? (
            <Icon
              name="ChevronRightSmallOutline"
              size="$5"
              color="$iconSubdued"
              mr="$-1"
            />
          ) : null}
        </XStack>
      )}
    </XStack>
  );
};
export default memo(SwapProviderInfoItem);
