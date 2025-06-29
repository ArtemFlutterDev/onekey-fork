import type { ComponentProps } from 'react';

import { useIntl } from 'react-intl';
import { StyleSheet } from 'react-native';

import { Badge, Icon, SizableText, XStack } from '@onekeyhq/components';
import { ETranslations } from '@onekeyhq/shared/src/locale';

import { usePrimeAuthV2 } from '../../hooks/usePrimeAuthV2';

import { PrimeUserInfoMoreButton } from './PrimeUserInfoMoreButton';

export function PrimeUserInfo({
  doPurchase,
  onLogoutSuccess,
  ...stackProps
}: {
  doPurchase?: () => Promise<void>;
  onLogoutSuccess?: () => Promise<void>;
} & ComponentProps<typeof XStack>) {
  const intl = useIntl();
  const { user } = usePrimeAuthV2();
  const isPrime = user?.primeSubscription?.isActive;

  return (
    <XStack
      alignItems="center"
      gap="$2"
      px="$3.5"
      py={13}
      bg="$bg"
      borderWidth={StyleSheet.hairlineWidth}
      borderRadius="$3"
      flexWrap="wrap"
      borderColor="$borderSubdued"
      borderCurve="continuous"
      elevation={0.5}
      {...stackProps}
    >
      <Icon name="PeopleOutline" color="$iconSubdued" size="$5" />
      <SizableText
        onPress={() => {
          // console.log(privy?.web?.user);
          // console.log(privy?.native?.user);
        }}
        flex={1}
        size="$bodyMdMedium"
        ellipsizeMode="middle"
        ellipse
      >
        {user?.displayEmail}
      </SizableText>
      {/* {isPrime ? (
        <Badge bg="$brand3" badgeSize="sm">
          <Badge.Text color="$brand11">Prime</Badge.Text>
        </Badge>
      ) : (
        <Badge badgeType="default" badgeSize="sm">
          {intl.formatMessage({
            id: ETranslations.prime_status_free,
          })}
        </Badge>
      )} */}
      <PrimeUserInfoMoreButton
        doPurchase={doPurchase}
        onLogoutSuccess={onLogoutSuccess}
      />
    </XStack>
  );
}
