import { useCallback, useEffect, useMemo, useState } from 'react';

import { useIntl } from 'react-intl';

import {
  Button,
  Icon,
  ScrollView,
  SizableText,
  Stack,
  XStack,
  YStack,
  getSharedButtonStyles,
  useMedia,
} from '@onekeyhq/components';
import {
  EAppEventBusNames,
  appEventBus,
} from '@onekeyhq/shared/src/eventBus/appEventBus';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import type { IMarketCategory } from '@onekeyhq/shared/types/market';

import {
  useMarketWatchListAtom,
  useWatchListActions,
} from '../../../states/jotai/contexts/market';

import { MarketHomeList } from './MarketHomeList';
import { MarketTokenIcon } from './MarketTokenIcon';
import { useWatchListAction } from './wachListHooks';

function RecommendItem({
  icon,
  checked = false,
  onChange,
  tokenName,
  symbol,
  coingeckoId,
}: {
  icon: string;
  tokenName: string;
  checked: boolean;
  symbol: string;
  coingeckoId: string;
  onChange: (checked: boolean, coingeckoId: string) => void;
}) {
  const { sharedFrameStyles } = useMemo(
    () =>
      getSharedButtonStyles({
        disabled: false,
        loading: false,
      }),
    [],
  );
  return (
    <XStack
      userSelect="none"
      flexGrow={1}
      flexBasis={0}
      justifyContent="space-between"
      px={platformEnv.isExtensionUiPopup ? '$3' : '$4'}
      py={platformEnv.isExtensionUiPopup ? '$1.5' : '$3.5'}
      borderRadius="$3"
      onPress={() => {
        onChange(!checked, coingeckoId);
      }}
      ai="center"
      {...sharedFrameStyles}
    >
      <XStack gap="$3" ai="center" flexShrink={1}>
        <MarketTokenIcon uri={icon} size="lg" />
        <YStack flexShrink={1}>
          <SizableText size="$bodyLgMedium" numberOfLines={1}>
            {symbol.toUpperCase()}
          </SizableText>
          <SizableText
            size="$bodyMd"
            color="$textSubdued"
            flexShrink={1}
            numberOfLines={1}
          >
            {tokenName}
          </SizableText>
        </YStack>
      </XStack>
      {checked ? (
        <Icon name="CheckRadioSolid" size="$6" color="$iconActive" />
      ) : (
        <Stack w="$6" h="$6" />
      )}
    </XStack>
  );
}

const maxSize = 8;
export function MarketWatchList({ category }: { category: IMarketCategory }) {
  const intl = useIntl();
  const [{ data: watchListCoingeckoIds, isMounted }] = useMarketWatchListAtom();

  const actions = useWatchListAction();
  const actions2 = useWatchListActions();

  useEffect(() => {
    const fn = async () => {
      await actions2.current.refreshWatchList();
    };
    appEventBus.on(EAppEventBusNames.RefreshMarketWatchList, fn);
    return () => {
      appEventBus.off(EAppEventBusNames.RefreshMarketWatchList, fn);
    };
  }, [actions2]);

  const defaultCoingeckoIds = useMemo(
    () =>
      category?.recommendedTokens
        ?.slice(0, maxSize)
        ?.map((i) => i.coingeckoId) || [],
    [category.recommendedTokens],
  );
  const [coingeckoIds, setCoingeckoIds] =
    useState<string[]>(defaultCoingeckoIds);

  const handleRecommendItemChange = useCallback(
    (checked: boolean, coingeckoId: string) => {
      setCoingeckoIds((prev) =>
        checked
          ? [...prev, coingeckoId]
          : prev.filter((i) => i !== coingeckoId),
      );
    },
    [],
  );

  const handleAddTokens = useCallback(async () => {
    await actions.addIntoWatchList(coingeckoIds);
    // reset selections
    setTimeout(() => {
      setCoingeckoIds(defaultCoingeckoIds);
    }, 50);
  }, [actions, coingeckoIds, defaultCoingeckoIds]);

  const { gtMd } = useMedia();
  const confirmButton = useMemo(
    () => (
      <Button
        width="100%"
        size="large"
        disabled={!coingeckoIds.length}
        variant="primary"
        onPress={handleAddTokens}
      >
        {intl.formatMessage(
          {
            id: ETranslations.market_add_number_tokens,
          },
          { number: coingeckoIds.length || 0 },
        )}
      </Button>
    ),
    [coingeckoIds.length, handleAddTokens, intl],
  );
  const listCategory = useMemo(
    () =>
      ({
        categoryId: 'all',
        coingeckoIds: watchListCoingeckoIds?.map(
          ({ coingeckoId }) => coingeckoId,
        ),
        watchList: watchListCoingeckoIds,
      } as IMarketCategory),
    [watchListCoingeckoIds],
  );
  const renderRecommend = useCallback(() => {
    if (category?.recommendedTokens) {
      return (
        <>
          <ScrollView
            contentContainerStyle={{ ai: 'center' }}
            px="$5"
            py={platformEnv.isExtensionUiPopup ? '$5' : '$8'}
          >
            <SizableText
              size={
                platformEnv.isExtensionUiPopup ? '$headingXl' : '$heading3xl'
              }
            >
              {intl.formatMessage({
                id: ETranslations.market_empty_watchlist_title,
              })}
            </SizableText>
            <SizableText
              size={
                platformEnv.isExtensionUiPopup
                  ? '$bodyMdMedium'
                  : '$bodyLgMedium'
              }
              pt="$2"
            >
              {intl.formatMessage({
                id: ETranslations.market_empty_watchlist_desc,
              })}
            </SizableText>
            <YStack
              pt={platformEnv.isExtensionUiPopup ? '$5' : '$8'}
              gap="$2.5"
              flexWrap="wrap"
              width="100%"
              $gtMd={{ maxWidth: 480 }}
            >
              {new Array(Math.ceil(maxSize / 2)).fill(0).map((_, i) => (
                <XStack gap="$2.5" key={i}>
                  {new Array(2).fill(0).map((__, j) => {
                    const item = category.recommendedTokens?.[i * 2 + j];
                    return item ? (
                      <RecommendItem
                        key={item.coingeckoId}
                        coingeckoId={item.coingeckoId}
                        checked={coingeckoIds.includes(item.coingeckoId)}
                        icon={item.iconUrl}
                        symbol={item.symbol}
                        tokenName={item.name}
                        onChange={handleRecommendItemChange}
                      />
                    ) : null;
                  })}
                </XStack>
              ))}
              {gtMd ? <YStack pt="$8">{confirmButton}</YStack> : null}
            </YStack>
          </ScrollView>
          {gtMd ? null : <YStack p="$5">{confirmButton}</YStack>}
        </>
      );
    }
    return null;
  }, [
    category.recommendedTokens,
    coingeckoIds,
    confirmButton,
    gtMd,
    handleRecommendItemChange,
    intl,
  ]);
  if (!isMounted) {
    return null;
  }
  return watchListCoingeckoIds?.length === 0 ? (
    renderRecommend()
  ) : (
    <MarketHomeList showMoreAction ordered draggable category={listCategory} />
  );
}
