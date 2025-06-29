import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useIntl } from 'react-intl';
import { StyleSheet } from 'react-native';

import type { ISortableSectionListRef } from '@onekeyhq/components';
import {
  Button,
  Empty,
  Icon,
  Page,
  SearchBar,
  SectionList,
  SortableSectionList,
  Stack,
  useSafeAreaInsets,
} from '@onekeyhq/components';
import { ListItem } from '@onekeyhq/kit/src/components/ListItem';
import { Spotlight } from '@onekeyhq/kit/src/components/Spotlight';
import { useEnabledNetworksCompatibleWithWalletIdInAllNetworks } from '@onekeyhq/kit/src/hooks/useAllNetwork';
import useAppNavigation from '@onekeyhq/kit/src/hooks/useAppNavigation';
import { usePrevious } from '@onekeyhq/kit/src/hooks/usePrevious';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import { EChainSelectorPages } from '@onekeyhq/shared/src/routes';
import { ESpotlightTour } from '@onekeyhq/shared/src/spotlight';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import type { IServerNetwork } from '@onekeyhq/shared/types';

import { useFuseSearch } from '../../hooks/useFuseSearch';
import RecentNetworks from '../RecentNetworks';

import { EditableChainSelectorContext } from './context';
import { EditableListItem } from './EditableListItem';
import { ALL_NETWORK_HEADER_HEIGHT, CELL_HEIGHT } from './type';

import type {
  IEditableChainSelectorContext,
  IEditableChainSelectorSection,
} from './type';

const ListEmptyComponent = () => {
  const intl = useIntl();
  return (
    <Empty
      icon="SearchOutline"
      title={intl.formatMessage({
        id: ETranslations.global_no_results,
      })}
    />
  );
};

const ListHeaderComponent = ({
  walletId,
  accountId,
  indexedAccountId,
  setAllNetworksChanged,
  initialScrollIndex,
  recentNetworksEnabled,
  mainnetItems,
  testnetItems,
}: {
  walletId?: string;
  accountId?: string;
  indexedAccountId?: string;
  setAllNetworksChanged?: (value: boolean) => void;
  initialScrollIndex?: { sectionIndex: number; itemIndex?: number };
  recentNetworksEnabled?: boolean;
  mainnetItems: IServerNetwork[];
  testnetItems: IServerNetwork[];
}) => {
  const intl = useIntl();
  const navigation = useAppNavigation();
  const { allNetworkItem, searchText, onPressItem, setRecentNetworksHeight } =
    useContext(EditableChainSelectorContext);

  const { enabledNetworksCompatibleWithWalletId, run } =
    useEnabledNetworksCompatibleWithWalletIdInAllNetworks({
      walletId: walletId ?? '',
    });

  const handleNetworksChange = useCallback(async () => {
    setAllNetworksChanged?.(true);
    await run({ alwaysSetState: true });
  }, [setAllNetworksChanged, run]);

  const allNetworksActions = useMemo(() => {
    if (accountUtils.isOthersWallet({ walletId: walletId ?? '' })) {
      return [];
    }

    return (
      <Spotlight
        delayMs={500}
        isVisible={
          !initialScrollIndex || initialScrollIndex?.sectionIndex === 0
        }
        message={intl.formatMessage({
          id: ETranslations.network_all_networks_selection_tip,
        })}
        tourName={ESpotlightTour.allNetworksInfo}
      >
        <Button
          size="small"
          variant="secondary"
          onPress={() => {
            if (walletId) {
              navigation.push(EChainSelectorPages.AllNetworksManager, {
                walletId,
                accountId,
                indexedAccountId,
                onNetworksChanged: handleNetworksChange,
              });
            }
          }}
        >
          {intl.formatMessage(
            {
              id: ETranslations.network_enabled_count,
            },
            { 'count': enabledNetworksCompatibleWithWalletId.length },
          )}{' '}
          →
        </Button>
      </Spotlight>
    );
  }, [
    accountId,
    enabledNetworksCompatibleWithWalletId.length,
    handleNetworksChange,
    indexedAccountId,
    initialScrollIndex,
    intl,
    navigation,
    walletId,
  ]);

  return (
    <Stack mt="$4">
      {recentNetworksEnabled ? (
        <RecentNetworks
          onPressItem={onPressItem}
          setRecentNetworksHeight={setRecentNetworksHeight}
          availableNetworks={[...mainnetItems, ...testnetItems]}
        />
      ) : null}
      {!allNetworkItem || searchText?.trim() ? null : (
        <EditableListItem
          item={allNetworkItem}
          isEditable={false}
          actions={allNetworksActions}
        />
      )}
    </Stack>
  );
};

type IEditableChainSelectorContentProps = {
  isEditMode?: boolean;
  recentNetworksEnabled?: boolean;
  mainnetItems: IServerNetwork[];
  testnetItems: IServerNetwork[];
  unavailableItems: IServerNetwork[];
  frequentlyUsedItems: IServerNetwork[];
  allNetworkItem?: IServerNetwork;
  networkId?: string;
  walletId?: string;
  accountId?: string;
  indexedAccountId?: string;
  onPressItem?: (network: IServerNetwork) => void;
  onAddCustomNetwork?: () => void;
  onEditCustomNetwork?: (network: IServerNetwork) => void;
  onFrequentlyUsedItemsChange?: (networks: IServerNetwork[]) => void;
  setAllNetworksChanged?: (value: boolean) => void;
};

export const EditableChainSelectorContent = ({
  mainnetItems,
  testnetItems,
  frequentlyUsedItems,
  unavailableItems,
  onPressItem,
  onAddCustomNetwork,
  onEditCustomNetwork,
  networkId,
  walletId,
  accountId,
  indexedAccountId,
  isEditMode,
  allNetworkItem,
  onFrequentlyUsedItemsChange,
  setAllNetworksChanged,
  recentNetworksEnabled,
}: IEditableChainSelectorContentProps) => {
  const intl = useIntl();
  const { bottom } = useSafeAreaInsets();
  const [searchText, setSearchText] = useState('');
  const [tempFrequentlyUsedItems, setTempFrequentlyUsedItems] = useState(
    frequentlyUsedItems ?? [],
  );
  const listRef = useRef<ISortableSectionListRef<any> | null>(null);
  const lastIsEditMode = usePrevious(isEditMode);
  const searchTextTrim = searchText.trim();
  const showAllNetworkHeader = useMemo(
    () => (allNetworkItem && !searchText?.trim?.()) ?? true,
    [allNetworkItem, searchText],
  );

  const [recentNetworksHeight, setRecentNetworksHeight] = useState(0);

  useEffect(() => {
    if (!isEditMode && lastIsEditMode) {
      onFrequentlyUsedItemsChange?.(tempFrequentlyUsedItems);
    }
  }, [
    isEditMode,
    lastIsEditMode,
    tempFrequentlyUsedItems,
    onFrequentlyUsedItemsChange,
  ]);

  useEffect(() => {
    setTempFrequentlyUsedItems(frequentlyUsedItems);
  }, [frequentlyUsedItems]);

  const networksToSearch = useMemo<IServerNetwork[]>(() => {
    const networks = [...mainnetItems, ...testnetItems];
    if (allNetworkItem) {
      networks.unshift(allNetworkItem);
    }
    return networks;
  }, [mainnetItems, testnetItems, allNetworkItem]);

  const networkFuseSearch = useFuseSearch(networksToSearch);

  const sections = useMemo<IEditableChainSelectorSection[]>(() => {
    if (searchTextTrim) {
      const data = networkFuseSearch(searchTextTrim);
      return data.length === 0
        ? []
        : [
            {
              data,
            },
          ];
    }

    const tempFrequentlyUsedItemsSet = new Set(
      tempFrequentlyUsedItems.map((o) => o.id),
    );
    const filterFrequentlyUsedNetworks = (inputs: IServerNetwork[]) =>
      inputs.filter((o) => !tempFrequentlyUsedItemsSet.has(o.id));

    const data = filterFrequentlyUsedNetworks(mainnetItems).reduce(
      (result, item) => {
        const char = item.name[0].toUpperCase();
        if (!result[char]) {
          result[char] = [];
        }
        result[char].push(item);

        return result;
      },
      {} as Record<string, IServerNetwork[]>,
    );

    const mainnetSections = Object.entries(data)
      .map(([key, value]) => ({ title: key, data: value }))
      .sort((a, b) => a.title.charCodeAt(0) - b.title.charCodeAt(0));

    const _sections: IEditableChainSelectorSection[] = [
      { data: tempFrequentlyUsedItems, draggable: true },
      ...mainnetSections,
    ];

    if (testnetItems && testnetItems.length > 0) {
      _sections.push({
        title: intl.formatMessage({
          id: ETranslations.global_testnet,
        }),
        data: filterFrequentlyUsedNetworks(testnetItems),
      });
    }
    if (unavailableItems.length > 0) {
      _sections.push({
        title: intl.formatMessage({
          id: ETranslations.network_selector_unavailable_networks,
        }),
        data: unavailableItems,
        unavailable: true,
      });
    }
    return _sections;
  }, [
    mainnetItems,
    testnetItems,
    tempFrequentlyUsedItems,
    unavailableItems,
    searchTextTrim,
    intl,
    networkFuseSearch,
  ]);

  const listHeaderHeight = useMemo(() => {
    return (
      recentNetworksHeight +
      (showAllNetworkHeader ? ALL_NETWORK_HEADER_HEIGHT : 0)
    );
  }, [showAllNetworkHeader, recentNetworksHeight]);

  const dragItemOverflowHitSlop = useMemo(() => {
    const dragCount = tempFrequentlyUsedItems.length;
    if (dragCount <= 0) {
      return undefined;
    }
    return { bottom: (dragCount + 1) * listHeaderHeight + 16 };
  }, [tempFrequentlyUsedItems, listHeaderHeight]);

  const layoutList = useMemo(() => {
    let offset = 16 + listHeaderHeight;
    const layouts: {
      offset: number;
      length: number;
      index: number;
      sectionIndex?: number;
    }[] = [];
    sections.forEach((section, sectionIndex) => {
      if (sectionIndex !== 0) {
        layouts.push({
          offset,
          length: 20,
          index: layouts.length,
          sectionIndex,
        });
        offset += 20;
      }
      const headerHeight = section.title ? 36 : 0;
      layouts.push({
        offset,
        length: headerHeight,
        index: layouts.length,
        sectionIndex,
      });
      offset += headerHeight;
      section.data.forEach(() => {
        layouts.push({
          offset,
          length: CELL_HEIGHT,
          index: layouts.length,
          sectionIndex,
        });
        offset += CELL_HEIGHT;
      });
      const footerHeight = 0;
      layouts.push({
        offset,
        length: footerHeight,
        index: layouts.length,
        sectionIndex,
      });
      offset += footerHeight;
    });
    layouts.push({ offset, length: 16, index: layouts.length });
    return layouts;
  }, [sections, listHeaderHeight]);

  const initialScrollIndex = useMemo(() => {
    if (searchText.trim() || tempFrequentlyUsedItems !== frequentlyUsedItems) {
      return undefined;
    }
    let _initialScrollIndex:
      | { sectionIndex: number; itemIndex?: number }
      | undefined;
    sections.forEach((section, sectionIndex) => {
      section.data.forEach((item, itemIndex) => {
        if (item.id === networkId && _initialScrollIndex === undefined) {
          _initialScrollIndex = {
            sectionIndex,
            itemIndex: itemIndex - ((section?.title?.length ?? 0) > 0 ? 1 : 0),
          };
          if (
            _initialScrollIndex &&
            _initialScrollIndex.itemIndex !== undefined
          ) {
            // if (!platformEnv.isNative) {
            //   _initialScrollIndex.itemIndex += 1;
            // }
            const _itemIndex = _initialScrollIndex?.itemIndex ?? 0;
            if (_itemIndex === -1) {
              _initialScrollIndex.itemIndex = undefined;
            }
            if (
              _itemIndex === section.data.length &&
              sectionIndex !== sections.length - 1
            ) {
              _initialScrollIndex.sectionIndex += 1;
              _initialScrollIndex.itemIndex = undefined;
            }
          }
        }
      });
    });
    if (
      _initialScrollIndex?.sectionIndex !== undefined &&
      sections
        .slice(0, _initialScrollIndex.sectionIndex)
        .reduce((prev, section) => prev + section.data.length, 0) +
        (_initialScrollIndex?.itemIndex ?? 0) <=
        7
    ) {
      return { sectionIndex: 0, itemIndex: undefined };
    }
    return _initialScrollIndex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, networkId, searchText]);

  const context = useMemo<IEditableChainSelectorContext>(
    () => ({
      frequentlyUsedItems: tempFrequentlyUsedItems,
      setFrequentlyUsedItems: setTempFrequentlyUsedItems,
      frequentlyUsedItemsIds: new Set(
        tempFrequentlyUsedItems.map((item) => item.id),
      ),
      networkId,
      onPressItem,
      onAddCustomNetwork,
      onEditCustomNetwork: (network: IServerNetwork) => {
        // Save list edits before editing custom network
        onFrequentlyUsedItemsChange?.(tempFrequentlyUsedItems);
        onEditCustomNetwork?.(network);
      },
      isEditMode,
      searchText: searchTextTrim,
      allNetworkItem,
      setRecentNetworksHeight,
    }),
    [
      tempFrequentlyUsedItems,
      setTempFrequentlyUsedItems,
      networkId,
      onPressItem,
      onAddCustomNetwork,
      onEditCustomNetwork,
      onFrequentlyUsedItemsChange,
      isEditMode,
      searchTextTrim,
      allNetworkItem,
    ],
  );
  const renderItem = useCallback(
    ({
      item,
      section,
      drag,
      dragProps,
    }: {
      item: IServerNetwork;
      section: IEditableChainSelectorSection;
      drag?: () => void;
      dragProps?: Record<string, any>;
    }) => (
      <EditableListItem
        item={item}
        isDraggable={section.draggable}
        isDisabled={section.unavailable}
        isEditable={section.editable}
        isCustomNetworkEditable={item.isCustomNetwork}
        drag={drag}
        dragProps={dragProps}
      />
    ),
    [],
  );

  const renderSectionHeader = useCallback(
    (item: { section: IEditableChainSelectorSection }) => {
      if (item.section.title) {
        return <SectionList.SectionHeader title={item.section.title} />;
      }
      return <Stack />;
    },
    [],
  );

  useEffect(() => {
    // For non-native platforms, initialScrollIndex causes display bugs
    // Handle it by manually scrolling to the target position
    if (!platformEnv.isNative) {
      if (!initialScrollIndex || layoutList.length === 0) return;

      let offset = 0;

      if (initialScrollIndex.sectionIndex !== 0) {
        const index = layoutList.findIndex(
          (item) => item.sectionIndex === initialScrollIndex.sectionIndex,
        );

        if (index === -1) return;

        offset =
          layoutList[index].offset +
          CELL_HEIGHT * (initialScrollIndex.itemIndex ?? 0);
      }

      setTimeout(() => {
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        listRef.current?._listRef?._scrollRef?.scrollTo?.({
          y: offset,
          animated: false,
        });
      }, 100);
    }
  }, [initialScrollIndex, layoutList]);

  return (
    <EditableChainSelectorContext.Provider value={context}>
      <Stack flex={1} position="relative">
        <Stack px="$5">
          <SearchBar
            testID="chain-selector"
            placeholder={intl.formatMessage({
              id: ETranslations.global_search,
            })}
            value={searchText}
            onChangeText={(text) => {
              // @ts-ignore
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
              listRef?.current?._listRef?._scrollRef?.scrollTo?.({
                y: 0,
                animated: false,
              });
              // @ts-ignore
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              if (listRef?.current?._listRef?._hasDoneInitialScroll) {
                // @ts-ignore
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                listRef.current._listRef._hasDoneInitialScroll = false;
              }
              setSearchText(text.trim());
            }}
            {...(!platformEnv.isNative && {
              autoFocus: true,
            })}
          />
        </Stack>
        <Stack flex={1}>
          {sections.length > 0 ? (
            <SortableSectionList
              ref={listRef}
              enabled={isEditMode}
              stickySectionHeadersEnabled
              sections={sections}
              renderItem={renderItem}
              keyExtractor={(item) => (item as IServerNetwork).id}
              onDragEnd={(result) => {
                const itemList = result?.sections?.[0]
                  ?.data as IServerNetwork[];
                setTempFrequentlyUsedItems(itemList);
              }}
              initialScrollIndex={
                platformEnv.isNative ? initialScrollIndex : undefined
              }
              dragItemOverflowHitSlop={dragItemOverflowHitSlop}
              getItemLayout={(_, index) => {
                if (index === -1) {
                  return {
                    index,
                    offset: showAllNetworkHeader ? listHeaderHeight : 0,
                    length: 0,
                  };
                }
                return layoutList[index];
              }}
              ListHeaderComponent={
                <ListHeaderComponent
                  recentNetworksEnabled={recentNetworksEnabled}
                  initialScrollIndex={initialScrollIndex}
                  walletId={walletId}
                  accountId={accountId}
                  indexedAccountId={indexedAccountId}
                  setAllNetworksChanged={setAllNetworksChanged}
                  mainnetItems={mainnetItems}
                  testnetItems={testnetItems}
                />
              }
              renderSectionHeader={renderSectionHeader}
              ListFooterComponent={
                <>
                  {isEditMode ? <Stack h="$2" /> : <Stack h={bottom || '$2'} />}
                </>
              } // Act as padding bottom
            />
          ) : (
            <ListEmptyComponent />
          )}
        </Stack>
        {isEditMode ? (
          <Page.Footer>
            <Stack
              pt="$2"
              pb={bottom || '$2'}
              borderTopWidth={StyleSheet.hairlineWidth}
              borderTopColor="$borderSubdued"
            >
              <ListItem
                userSelect="none"
                onPress={() => onAddCustomNetwork?.()}
              >
                <Stack p="$1" borderRadius="$full" bg="$bgStrong">
                  <Icon name="PlusSmallOutline" color="$iconSubdued" />
                </Stack>
                <ListItem.Text
                  primary={intl.formatMessage({
                    id: ETranslations.custom_network_add_network_action_text,
                  })}
                />
              </ListItem>
            </Stack>
          </Page.Footer>
        ) : null}
      </Stack>
    </EditableChainSelectorContext.Provider>
  );
};
