import { useCallback } from 'react';

import { useIntl } from 'react-intl';

import {
  IconButton,
  SizableText,
  Stack,
  XStack,
  YStack,
} from '@onekeyhq/components';
import useAppNavigation from '@onekeyhq/kit/src/hooks/useAppNavigation';
import {
  useUniversalSearchActions,
  useUniversalSearchAtom,
} from '@onekeyhq/kit/src/states/jotai/contexts/universalSearch';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { defaultLogger } from '@onekeyhq/shared/src/logger/logger';
import { ETabMarketRoutes } from '@onekeyhq/shared/src/routes';
import {
  EUniversalSearchType,
  type IIUniversalRecentSearchItem,
} from '@onekeyhq/shared/types/search';

function SearchTextItem({
  item,
  onPress,
  searchType,
}: {
  item: IIUniversalRecentSearchItem;
  onPress: (item: IIUniversalRecentSearchItem) => void;
  searchType?: EUniversalSearchType;
}) {
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);
  return (
    <Stack
      ai="center"
      jc="center"
      borderRadius="$2"
      gap="$3"
      bg="$bgStrong"
      mt="$3"
      cursor="pointer"
      onPress={handlePress}
    >
      <SizableText px="$2.5" py="$1" size="$bodyMdMedium">
        {searchType === EUniversalSearchType.MarketToken
          ? item.text.toUpperCase()
          : item.text}
      </SizableText>
    </Stack>
  );
}

export function RecentSearched({
  searchType,
}: {
  searchType?: EUniversalSearchType;
}) {
  const intl = useIntl();
  const [{ recentSearch }] = useUniversalSearchAtom();

  const actions = useUniversalSearchActions();

  const navigation = useAppNavigation();
  const handlePress = useCallback(
    async (item: IIUniversalRecentSearchItem) => {
      switch (item.type) {
        case EUniversalSearchType.MarketToken:
          navigation.pop();
          setTimeout(() => {
            navigation.push(ETabMarketRoutes.MarketDetail, {
              token: item.id,
            });
            defaultLogger.market.token.searchToken({
              tokenSymbol: item.id,
              from: 'recentSearch',
            });
          }, 80);
          break;
        default:
      }
    },
    [navigation],
  );

  const handleDeleteAll = useCallback(() => {
    actions.current.clearAllRecentSearch();
  }, [actions]);

  return recentSearch.length &&
    searchType === EUniversalSearchType.MarketToken ? (
    <YStack px="$5" pb="$5">
      <XStack jc="space-between" pt="$5">
        <SizableText size="$headingSm" color="$textSubdued">
          {intl.formatMessage({ id: ETranslations.global_recent_searched })}
        </SizableText>
        <IconButton
          variant="tertiary"
          icon="DeleteOutline"
          color="$textSubdued"
          iconSize="$5"
          onPress={handleDeleteAll}
        />
      </XStack>
      <XStack flexWrap="wrap" gap="$3">
        {recentSearch.map((i) => (
          <SearchTextItem
            onPress={handlePress}
            item={i}
            searchType={searchType}
            key={i.text}
          />
        ))}
      </XStack>
    </YStack>
  ) : (
    <XStack pt="$5" />
  );
}
