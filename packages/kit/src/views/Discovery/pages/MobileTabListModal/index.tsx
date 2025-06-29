import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useIntl } from 'react-intl';
import { StyleSheet } from 'react-native';

import {
  ActionList,
  BlurView,
  Button,
  IconButton,
  ListView,
  Page,
  Stack,
  Toast,
  useClipboard,
} from '@onekeyhq/components';
import type { IActionListItemProps } from '@onekeyhq/components';
import type { IPageNavigationProp } from '@onekeyhq/components/src/layouts/Navigation';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import useAppNavigation from '@onekeyhq/kit/src/hooks/useAppNavigation';
import {
  useBrowserBookmarkAction,
  useBrowserTabActions,
} from '@onekeyhq/kit/src/states/jotai/contexts/discovery';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import type { IDiscoveryModalParamList } from '@onekeyhq/shared/src/routes';
import {
  EDiscoveryModalRoutes,
  EModalRoutes,
  ETabRoutes,
} from '@onekeyhq/shared/src/routes';

import MobileTabListItem from '../../components/MobileTabListItem';
import MobileTabListPinnedItem from '../../components/MobileTabListItem/MobileTabListPinnedItem';
import { TAB_LIST_CELL_COUNT_PER_ROW } from '../../config/TabList.constants';
import useBrowserOptionsAction from '../../hooks/useBrowserOptionsAction';
import {
  useActiveTabId,
  useDisabledAddedNewTab,
  useWebTabs,
} from '../../hooks/useWebTabs';
import { withBrowserProvider } from '../Browser/WithBrowserProvider';

import type { IWebTab } from '../../types';
import type { View } from 'react-native';

export const tabGridRefs: Record<string, View> = {};

function TabToolBar({
  closeAllDisabled,
  onAddTab,
  onCloseAll,
  onDone,
}: {
  closeAllDisabled: boolean;
  onAddTab: () => void;
  onCloseAll: () => void;
  onDone: () => void;
}) {
  const intl = useIntl();
  return (
    <Stack
      py="$2"
      flexDirection="row"
      alignItems="center"
      borderTopWidth={StyleSheet.hairlineWidth}
      borderTopColor="$borderSubdued"
    >
      <Stack flex={1} alignItems="center" justifyContent="center">
        <Button
          variant="tertiary"
          size="medium"
          onPress={onCloseAll}
          disabled={closeAllDisabled}
          testID="tab-list-modal-close-all"
        >
          {intl.formatMessage({ id: ETranslations.explore_close_all })}
        </Button>
      </Stack>
      <Stack flex={1} alignItems="center" justifyContent="center">
        <IconButton
          variant="secondary"
          size="medium"
          icon="PlusLargeOutline"
          testID="browser-bar-add"
          onPress={onAddTab}
        />
      </Stack>
      <Stack flex={1} alignItems="center" justifyContent="center">
        <Button
          variant="tertiary"
          size="medium"
          onPress={onDone}
          testID="tab-list-modal-done"
        >
          {intl.formatMessage({ id: ETranslations.global_done })}
        </Button>
      </Stack>
    </Stack>
  );
}

function MobileTabListModal() {
  const intl = useIntl();
  const navigation =
    useAppNavigation<IPageNavigationProp<IDiscoveryModalParamList>>();

  const { tabs } = useWebTabs();
  const data = useMemo(() => (tabs ?? []).filter((t) => !t.isPinned), [tabs]);
  const pinnedData = useMemo(
    () => (tabs ?? []).filter((t) => t.isPinned),
    [tabs],
  );
  const { disabledAddedNewTab } = useDisabledAddedNewTab();

  const { activeTabId } = useActiveTabId();

  const {
    addOrUpdateBrowserBookmark: addBrowserBookmark,
    removeBrowserBookmark,
  } = useBrowserBookmarkAction().current;

  const {
    closeAllWebTabs,
    setCurrentWebTab,
    closeWebTab,
    setPinnedTab,
    setDisplayHomePage,
  } = useBrowserTabActions().current;

  const triggerCloseTab = useRef(false);
  useEffect(() => {
    if (triggerCloseTab.current && !tabs.length) {
      setDisplayHomePage(true);
      navigation.pop();
    }
    triggerCloseTab.current = false;
  }, [tabs, setDisplayHomePage, navigation]);

  const tabInitialScrollIndex = useMemo(
    () => data.findIndex((t) => t.id === activeTabId),
    [data, activeTabId],
  );
  const pinInitialScrollIndex = useMemo(
    () => pinnedData.findIndex((t) => t.id === activeTabId),
    [pinnedData, activeTabId],
  );

  const { handleShareUrl, handleRenameTab } = useBrowserOptionsAction();
  const { copyText } = useClipboard();

  const handleBookmarkPress = useCallback(
    (bookmark: boolean, url: string, title: string) => {
      if (bookmark) {
        void addBrowserBookmark({
          url,
          title,
          logo: undefined,
          sortIndex: undefined,
        });
      } else {
        void removeBrowserBookmark(url);
      }
      Toast.success({
        title: bookmark
          ? intl.formatMessage({
              id: ETranslations.explore_toast_bookmark_added,
            })
          : intl.formatMessage({
              id: ETranslations.explore_toast_bookmark_removed,
            }),
      });
    },
    [addBrowserBookmark, removeBrowserBookmark, intl],
  );
  const handleShare = useCallback(
    (url: string) => {
      handleShareUrl(url);
    },
    [handleShareUrl],
  );
  const handleDisconnect = useCallback(async (url: string) => {
    const origin = url ? new URL(url).origin : null;
    if (!origin) return;
    await backgroundApiProxy.serviceDApp.disconnectWebsite({
      origin,
      storageType: 'injectedProvider',
      entry: 'Browser',
    });
  }, []);
  const handlePinnedPress = useCallback(
    (id: string, pinned: boolean) => {
      void setPinnedTab({ id, pinned });
      Toast.success({
        title: pinned
          ? intl.formatMessage({ id: ETranslations.explore_toast_pinned })
          : intl.formatMessage({ id: ETranslations.explore_toast_unpinned }),
      });
    },
    [setPinnedTab, intl],
  );
  const handleCloseTab = useCallback(
    (id: string) => {
      triggerCloseTab.current = true;
      void closeWebTab({ tabId: id, entry: 'Menu' });
    },
    [closeWebTab],
  );

  const handleAddNewTab = useCallback(() => {
    if (disabledAddedNewTab) {
      Toast.message({
        title: intl.formatMessage(
          { id: ETranslations.explore_toast_tab_limit_reached },
          { number: '20' },
        ),
      });
      return;
    }
    // TODO: need to add promise api for navigation chains
    navigation.pop();
    setTimeout(() => {
      navigation.pushModal(EModalRoutes.DiscoveryModal, {
        screen: EDiscoveryModalRoutes.SearchModal,
      });
    }, 0);
  }, [disabledAddedNewTab, navigation, intl]);

  const showTabOptions = useCallback(
    async (tab: IWebTab, id: string) => {
      const origin = tab?.url ? new URL(tab.url).origin : null;
      let hasConnectedAccount = false;
      if (origin) {
        const connectedAccounts =
          await backgroundApiProxy.serviceDApp.findInjectedAccountByOrigin(
            origin,
          );
        hasConnectedAccount = (connectedAccounts ?? []).length > 0;
      }
      ActionList.show({
        title: intl.formatMessage({ id: ETranslations.explore_options }),
        sections: [
          {
            items: [
              {
                label: intl.formatMessage({
                  id: tab.isBookmark
                    ? ETranslations.explore_remove_bookmark
                    : ETranslations.explore_add_bookmark,
                }),
                icon: tab.isBookmark ? 'StarSolid' : 'StarOutline',
                onPress: () =>
                  handleBookmarkPress(
                    !tab.isBookmark,
                    tab.url,
                    tab.title ?? '',
                  ),
                testID: `action-list-item-${
                  !tab.isBookmark ? 'bookmark' : 'remove-bookmark'
                }`,
              },
              {
                label: intl.formatMessage({
                  id: tab.isPinned
                    ? ETranslations.explore_unpin
                    : ETranslations.explore_pin,
                }),
                icon: tab.isPinned ? 'ThumbtackSolid' : 'ThumbtackOutline',
                onPress: () => handlePinnedPress(id, !tab.isPinned),
                testID: `action-list-item-${!tab.isPinned ? 'pin' : 'un-pin'}`,
              },
              {
                label: intl.formatMessage({
                  id: ETranslations.explore_rename,
                }),
                icon: 'PencilOutline',
                onPress: () => {
                  void handleRenameTab(tab);
                },
                testID: `action-list-item-rename`,
              },
            ].filter(Boolean) as IActionListItemProps[],
          },
          {
            items: [
              {
                label: intl.formatMessage({
                  id: ETranslations.global_copy_url,
                }),
                icon: 'LinkOutline',
                onPress: () => {
                  // onCopyUrl();
                  copyText(tab.url);
                },
                testID: `action-list-item-copy`,
              },
              {
                label: intl.formatMessage({ id: ETranslations.explore_share }),
                icon: 'ShareOutline',
                onPress: () => handleShare(tab.url),
                testID: 'action-list-item-share',
              },
            ].filter(Boolean) as IActionListItemProps[],
          },
          {
            items: [
              hasConnectedAccount && {
                label: intl.formatMessage({
                  id: ETranslations.explore_disconnect,
                }),
                icon: 'BrokenLinkOutline',
                onPress: () => {
                  void handleDisconnect(tab.url);
                },
                testID: `action-list-item-disconnect`,
              },
              {
                label: intl.formatMessage({
                  id: ETranslations.explore_close_tab,
                }),
                icon: 'CrossedLargeOutline',
                onPress: () => handleCloseTab(id),
                testID: `action-list-item-close-close-tab`,
              },
            ].filter(Boolean) as IActionListItemProps[],
          },
        ],
      });
    },
    [
      handleBookmarkPress,
      handlePinnedPress,
      handleShare,
      handleRenameTab,
      handleDisconnect,
      handleCloseTab,
      copyText,
      intl,
    ],
  );

  const keyExtractor = useCallback((item: IWebTab) => item.id, []);
  const renderItem = useCallback(
    ({ item: tab }: { item: IWebTab }) => (
      <MobileTabListItem
        {...tab}
        activeTabId={activeTabId}
        onSelectedItem={(id) => {
          void setCurrentWebTab(id);
          navigation.pop();
          if (platformEnv.isNativeIOSPad) {
            navigation.switchTab(ETabRoutes.MultiTabBrowser);
          }
        }}
        onCloseItem={handleCloseTab}
        onLongPress={(id) => {
          void showTabOptions(tab, id);
        }}
      />
    ),
    [activeTabId, handleCloseTab, navigation, setCurrentWebTab, showTabOptions],
  );

  const renderPinnedItem = useCallback(
    ({ item: tab }: { item: IWebTab }) => (
      <MobileTabListPinnedItem
        {...tab}
        activeTabId={activeTabId}
        onSelectedItem={(id) => {
          setCurrentWebTab(id);
          navigation.pop();
        }}
        onCloseItem={handleCloseTab}
        onLongPress={(id) => {
          void showTabOptions(tab, id);
        }}
      />
    ),
    [navigation, setCurrentWebTab, activeTabId, handleCloseTab, showTabOptions],
  );

  const renderPinnedList = useMemo(() => {
    if (pinnedData.length === 0) {
      return null;
    }
    return (
      <BlurView
        position="absolute"
        left="$2.5"
        bottom="$2.5"
        right="$2.5"
        borderRadius="$5"
        bg="$bgStrong"
        testID="tab-pined-container"
        // To improve performance on Android, turn off the blur effect.
        experimentalBlurMethod="none"
      >
        <ListView
          contentContainerStyle={{
            p: '$1',
          }}
          horizontal
          data={pinnedData}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          estimatedItemSize="$28"
          // @ts-expect-error
          estimatedListSize={{ width: 370, height: 52 }}
          renderItem={renderPinnedItem}
          initialScrollIndex={pinInitialScrollIndex}
        />
      </BlurView>
    );
  }, [pinnedData, renderPinnedItem, pinInitialScrollIndex]);

  return (
    <Page>
      <Page.Header
        title={intl.formatMessage(
          { id: ETranslations.explore_tabs_count },
          { number: `${tabs.length ?? 0}` },
        )}
      />
      <Page.Body>
        <ListView
          initialScrollIndex={tabInitialScrollIndex}
          // estimated item min size
          estimatedItemSize={223}
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={TAB_LIST_CELL_COUNT_PER_ROW}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 10,
            paddingBottom: 62,
          }}
          testID="tab-container"
        />
        {renderPinnedList}
      </Page.Body>
      <Page.Footer>
        <TabToolBar
          closeAllDisabled={data.length <= 0}
          onAddTab={handleAddNewTab}
          onCloseAll={() => {
            triggerCloseTab.current = true;
            void closeAllWebTabs();
          }}
          onDone={() => {
            navigation.pop();
          }}
        />
      </Page.Footer>
    </Page>
  );
}

export default withBrowserProvider(MobileTabListModal);
