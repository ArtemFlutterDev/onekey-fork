import { memo, useCallback, useEffect, useMemo, useRef } from 'react';

import { Freeze } from 'react-freeze';
import { BackHandler } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  Icon,
  Page,
  Stack,
  XStack,
  useMedia,
  useSafeAreaInsets,
} from '@onekeyhq/components';
import type { IPageNavigationProp } from '@onekeyhq/components/src/layouts/Navigation';
import useAppNavigation from '@onekeyhq/kit/src/hooks/useAppNavigation';
import { useBrowserTabActions } from '@onekeyhq/kit/src/states/jotai/contexts/discovery';
import { useTakeScreenshot } from '@onekeyhq/kit/src/views/Discovery/components/MobileBrowser/MobileBrowserBottomBar';
import {
  EAppEventBusNames,
  appEventBus,
} from '@onekeyhq/shared/src/eventBus/appEventBus';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import type { IDiscoveryModalParamList } from '@onekeyhq/shared/src/routes';
import {
  EDiscoveryModalRoutes,
  EModalRoutes,
  ETabRoutes,
} from '@onekeyhq/shared/src/routes';
import { useDebugComponentRemountLog } from '@onekeyhq/shared/src/utils/debug/debugUtils';

import CustomHeaderTitle from '../../components/CustomHeaderTitle';
import { HandleRebuildBrowserData } from '../../components/HandleData/HandleRebuildBrowserTabData';
import HeaderRightToolBar from '../../components/HeaderRightToolBar';
import MobileBrowserBottomBar from '../../components/MobileBrowser/MobileBrowserBottomBar';
import TabCountButton from '../../components/MobileBrowser/TabCountButton';
import { useDAppNotifyChanges } from '../../hooks/useDAppNotifyChanges';
import useMobileBottomBarAnimation from '../../hooks/useMobileBottomBarAnimation';
import {
  useActiveTabId,
  useDisplayHomePageFlag,
  useWebTabDataById,
  useWebTabs,
} from '../../hooks/useWebTabs';
import { webviewRefs } from '../../utils/explorerUtils';
import { checkAndCreateFolder } from '../../utils/screenshot';
import { showTabBar } from '../../utils/tabBarUtils';
import { BrowserTitle } from '../components/BrowserTitle';
import { HistoryIconButton } from '../components/HistoryIconButton';
import DashboardContent from '../Dashboard/DashboardContent';

import MobileBrowserContent from './MobileBrowserContent';
import { withBrowserProvider } from './WithBrowserProvider';

import type { WebView } from 'react-native-webview';

const isNativeMobile = platformEnv.isNative && !platformEnv.isNativeIOSPad;

function MobileBrowser() {
  const { tabs } = useWebTabs();
  const { activeTabId } = useActiveTabId();
  const { closeWebTab, setCurrentWebTab } = useBrowserTabActions().current;
  const { tab: activeTabData } = useWebTabDataById(activeTabId ?? '');
  const navigation =
    useAppNavigation<IPageNavigationProp<IDiscoveryModalParamList>>();
  const { handleScroll, toolbarRef, toolbarAnimatedStyle } =
    useMobileBottomBarAnimation(activeTabId);
  useDAppNotifyChanges({ tabId: activeTabId });

  useDebugComponentRemountLog({
    name: 'MobileBrowser3864',
  });

  const { displayHomePage } = useDisplayHomePageFlag();
  const displayBottomBar = !displayHomePage;

  useEffect(() => {
    if (!tabs?.length) {
      showTabBar();
    }
  }, [tabs]);

  const { setDisplayHomePage } = useBrowserTabActions().current;
  const firstRender = useRef(true);
  useEffect(() => {
    if (!firstRender.current && tabs.length === 0) {
      setDisplayHomePage(true);
    }
    if (firstRender.current) {
      firstRender.current = false;
    }
  }, [tabs, navigation, setDisplayHomePage]);

  useEffect(() => {
    void checkAndCreateFolder();
  }, []);

  const closeCurrentWebTab = useCallback(async () => {
    showTabBar();
    return activeTabId
      ? closeWebTab({ tabId: activeTabId, entry: 'Menu' })
      : Promise.resolve();
  }, [activeTabId, closeWebTab]);

  const onCloseCurrentWebTabAndGoHomePage = useCallback(() => {
    if (activeTabId) {
      closeWebTab({ tabId: activeTabId, entry: 'Menu' });
      setCurrentWebTab(null);
    }
    showTabBar();
    return Promise.resolve();
  }, [activeTabId, closeWebTab, setCurrentWebTab]);

  // For risk detection
  useEffect(() => {
    const listener = () => {
      void closeCurrentWebTab();
    };
    appEventBus.on(EAppEventBusNames.CloseCurrentBrowserTab, listener);
    return () => {
      appEventBus.off(EAppEventBusNames.CloseCurrentBrowserTab, listener);
    };
  }, [closeCurrentWebTab]);

  const content = useMemo(
    () =>
      tabs.map((t) => (
        <MobileBrowserContent id={t.id} key={t.id} onScroll={handleScroll} />
      )),
    [tabs, handleScroll],
  );

  const { gtMd } = useMedia();

  const handleSearchBarPress = useCallback(
    (url: string) => {
      const tab = tabs.find((t) => t.id === activeTabId);
      navigation.pushModal(EModalRoutes.DiscoveryModal, {
        screen: EDiscoveryModalRoutes.SearchModal,
        params: {
          url,
          tabId: activeTabId ?? undefined,
          useCurrentWindow: tab?.isPinned ? false : !!activeTabId,
        },
      });
    },
    [tabs, navigation, activeTabId],
  );

  const { top, bottom } = useSafeAreaInsets();
  const takeScreenshot = useTakeScreenshot(activeTabId);

  const handleGoBackHome = useCallback(async () => {
    try {
      await takeScreenshot();
    } catch (e) {
      console.error('takeScreenshot error: ', e);
    }
    setTimeout(() => {
      setCurrentWebTab(null);
      showTabBar();
      if (platformEnv.isNativeIOSPad) {
        navigation.switchTab(ETabRoutes.Discovery);
      }
    });
  }, [takeScreenshot, setCurrentWebTab, navigation]);

  useEffect(() => {
    // Only add back handler on Android
    if (!platformEnv.isNativeAndroid) return;

    const onBackPress = () => {
      if (!displayHomePage && activeTabData?.canGoBack && activeTabId) {
        const webviewRef = webviewRefs[activeTabId];
        if (webviewRef?.innerRef) {
          try {
            (webviewRef.innerRef as WebView)?.goBack();
          } catch (error) {
            console.error('Error while navigating back:', error);
          }
        }
      } else {
        void handleGoBackHome();
      }

      // Prevent default behavior
      return true;
    };

    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () =>
      BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [
    activeTabId,
    activeTabData?.canGoBack,
    displayHomePage,
    handleGoBackHome,
  ]);

  return (
    <Page fullPage>
      <Page.Header headerShown={false} />
      {/* custom header */}
      <XStack
        pt={top}
        px="$5"
        alignItems="center"
        my="$1"
        mt={platformEnv.isNativeAndroid ? '$3' : undefined}
      >
        {!displayHomePage ? (
          <Stack
            onPress={
              isNativeMobile
                ? handleGoBackHome
                : onCloseCurrentWebTabAndGoHomePage
            }
          >
            <Icon
              name={isNativeMobile ? 'MinimizeOutline' : 'CrossedLargeOutline'}
              mr="$4"
            />
          </Stack>
        ) : null}

        {!displayHomePage ? (
          <CustomHeaderTitle handleSearchBarPress={handleSearchBarPress} />
        ) : (
          <XStack
            width="100%"
            position="relative"
            justifyContent="center"
            alignItems="center"
            $gtSm={{
              justifyContent: 'space-between',
            }}
          >
            <BrowserTitle />

            <XStack gap="$2" position="absolute" right={0} alignItems="center">
              <Stack>
                <HistoryIconButton />
              </Stack>

              <TabCountButton
                hideWhenEmpty={displayHomePage}
                testID="browser-header-tabs"
              />
            </XStack>
          </XStack>
        )}
        <HeaderRightToolBar />
      </XStack>
      <Page.Body>
        <Stack flex={1} zIndex={3} pb={gtMd ? bottom : 0}>
          <HandleRebuildBrowserData />
          <Stack flex={1}>
            {gtMd ? null : (
              <Stack display={displayHomePage ? 'flex' : 'none'}>
                <DashboardContent onScroll={handleScroll} />
              </Stack>
            )}
            <Freeze freeze={displayHomePage}>{content}</Freeze>
          </Stack>
          <Freeze freeze={!displayBottomBar}>
            <Animated.View
              ref={toolbarRef}
              style={[
                toolbarAnimatedStyle,
                {
                  bottom: 0,
                  left: 0,
                  right: 0,
                },
              ]}
            >
              <MobileBrowserBottomBar
                id={activeTabId ?? ''}
                onGoBackHomePage={handleGoBackHome}
              />
            </Animated.View>
          </Freeze>
        </Stack>
      </Page.Body>
    </Page>
  );
}

export default memo(withBrowserProvider(MobileBrowser));
