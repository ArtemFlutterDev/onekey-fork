import { useRef } from 'react';

import { isEqual } from 'lodash';

import { Toast } from '@onekeyhq/components';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import type useAppNavigation from '@onekeyhq/kit/src/hooks/useAppNavigation';
import { handleDeepLinkUrl } from '@onekeyhq/kit/src/routes/config/deeplink';
import { ContextJotaiActionsBase } from '@onekeyhq/kit/src/states/jotai/utils/ContextJotaiActionsBase';
import { MaximumNumberOfTabs } from '@onekeyhq/kit/src/views/Discovery/config/Discovery.constants';
import type {
  ESiteMode,
  IBrowserBookmark,
  IBrowserHistory,
  IGotoSiteFnParams,
  IMatchDAppItemType,
  IOnWebviewNavigationFnParams,
  IWebTab,
} from '@onekeyhq/kit/src/views/Discovery/types';
import {
  browserTypeHandler,
  crossWebviewLoadUrl,
  injectToPauseWebsocket,
  injectToResumeWebsocket,
  processWebSiteUrl,
  webviewRefs,
} from '@onekeyhq/kit/src/views/Discovery/utils/explorerUtils';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { appLocale } from '@onekeyhq/shared/src/locale/appLocale';
import { defaultLogger } from '@onekeyhq/shared/src/logger/logger';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import { ETabRoutes } from '@onekeyhq/shared/src/routes';
import { memoFn } from '@onekeyhq/shared/src/utils/cacheUtils';
import { generateUUID } from '@onekeyhq/shared/src/utils/miscUtils';
import { openUrlInApp } from '@onekeyhq/shared/src/utils/openUrlUtils';
import sortUtils from '@onekeyhq/shared/src/utils/sortUtils';
import uriUtils from '@onekeyhq/shared/src/utils/uriUtils';
import { EValidateUrlEnum } from '@onekeyhq/shared/types/dappConnection';

import {
  activeTabIdAtom,
  browserDataReadyAtom,
  contextAtomMethod,
  disabledAddedNewTabAtom,
  displayHomePageAtom,
  lastClosedTabAtom,
  phishingLruCacheAtom,
  webTabsAtom,
  webTabsMapAtom,
} from './atoms';

import type { IElectronWebView } from '@onekeyfe/cross-inpage-provider-types';
import type { WebView } from 'react-native-webview';

function loggerForEmptyData(tabs: IWebTab[], fnName: string) {
  if (!tabs || tabs.length === 0) {
    defaultLogger.discovery.browser.setTabsDataFunctionName(fnName);
    defaultLogger.discovery.browser.tabsData(tabs);
  }
}

export const homeResettingFlags: Record<string, number> = {};

function buildWebTabData(tabs: IWebTab[]) {
  const map: Record<string, IWebTab> = {};
  const keys: string[] = [];
  tabs.sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return 0;
  });
  tabs.forEach((tab) => {
    keys.push(tab.id);
    map[tab.id] = tab;
  });
  return {
    data: tabs,
    keys,
    map,
  };
}

export const homeTab: IWebTab = {
  id: 'home',
  // current url in webview
  url: 'about:blank',
  title: 'OneKey',
  canGoBack: false,
  loading: false,
  favicon: '',
};

class ContextJotaiActionsDiscovery extends ContextJotaiActionsBase {
  closeTimeId: NodeJS.Timeout | null = null;

  /**
   * Browser web tab action
   */
  setDisplayHomePage = contextAtomMethod((_, set, payload: boolean) => {
    set(displayHomePageAtom(), payload);
  });

  setBrowserDataReady = contextAtomMethod((_, set) => {
    set(browserDataReadyAtom(), true);
  });

  buildWebTabs = contextAtomMethod(
    (
      get,
      set,
      payload: {
        data: IWebTab[];
        options?: { forceUpdate?: boolean; isInitFromStorage?: boolean };
      },
    ) => {
      const { data, options } = payload;
      const isReady = get(browserDataReadyAtom());
      if (!isReady && !options?.isInitFromStorage) {
        return;
      }
      const webTabs = get(webTabsAtom());
      let newTabs = data;
      if (!Array.isArray(data)) {
        throw new Error('setWebTabsWriteAtom: payload must be an array');
      }
      if (!newTabs || !newTabs.length) {
        newTabs = [];
      }
      const result = buildWebTabData(newTabs);
      // Should update tabs
      if (!isEqual(result.keys, webTabs.keys) || options?.forceUpdate) {
        set(webTabsAtom(), { keys: result.keys, tabs: result.data });
      }

      set(webTabsMapAtom(), () => result.map);
      loggerForEmptyData(result.data, 'buildWebTabs->saveToSimpleDB');
      void backgroundApiProxy.simpleDb.browserTabs.setRawData({
        tabs: result.data,
      });
    },
  );

  setTabsByIds = contextAtomMethod(
    (
      get,
      set,
      {
        pinnedTabs,
        unpinnedTabs,
      }: {
        pinnedTabs: { id: string; timestamp?: number }[];
        unpinnedTabs: { id: string; timestamp?: number }[];
      },
    ) => {
      const tabMap = get(webTabsMapAtom());
      const tabs: IWebTab[] = [];
      const now = Date.now();
      for (const { id, timestamp } of pinnedTabs) {
        tabs.push({
          ...tabMap[id],
          timestamp: timestamp ?? now,
          isPinned: true,
        });
      }
      for (const { id, timestamp } of unpinnedTabs) {
        tabs.push({
          ...tabMap[id],
          timestamp: timestamp ?? now,
          isPinned: false,
        });
      }
      this.buildWebTabs.call(set, {
        data: tabs,
      });
    },
  );

  setTabs = contextAtomMethod((get, set, tabs?: IWebTab[]) => {
    const newTabs = tabs ?? get(webTabsAtom())?.tabs;
    loggerForEmptyData(newTabs, 'setTabs');
    this.buildWebTabs.call(set, {
      data: [...newTabs],
      options: { forceUpdate: true },
    });
  });

  setCurrentWebTab = contextAtomMethod((get, set, tabId: string | null) => {
    const currentTabId = get(activeTabIdAtom());
    if (currentTabId !== tabId) {
      this.pauseDappInteraction.call(set, currentTabId);

      // set isActive to true
      const { tabs } = get(webTabsAtom());
      const targetIndex = tabs.findIndex((t) => t.id === tabId);
      tabs.forEach((t) => {
        t.isActive = false;
      });
      loggerForEmptyData([...tabs], 'setCurrentWebTab');
      this.buildWebTabs.call(set, { data: [...tabs] });
      if (targetIndex !== -1) {
        tabs[targetIndex].isActive = true;
        set(activeTabIdAtom(), tabId);
        this.resumeDappInteraction.call(set, tabId);
      } else {
        set(activeTabIdAtom(), '');
      }
    }
    const displayHomePage = get(displayHomePageAtom());
    if (tabId && displayHomePage) {
      this.setDisplayHomePage.call(set, false);
    }
    if (!tabId && !displayHomePage) {
      this.setDisplayHomePage.call(set, true);
    }
  });

  addWebTab = contextAtomMethod((get, set, payload: Partial<IWebTab>) => {
    const startTime = performance.now();
    const { tabs } = get(webTabsAtom());
    if (!payload.id || payload.id === homeTab.id) {
      payload.id = generateUUID();
    }
    payload.timestamp = Date.now();
    this.buildWebTabs.call(set, { data: [...tabs, payload as IWebTab] });
    this.setCurrentWebTab.call(set, payload.id ?? '');
    const endTime = performance.now();
    console.log(`addBlankWebTab took ${endTime - startTime} milliseconds.`);
  });

  addBlankWebTab = contextAtomMethod((_, set) => {
    this.addWebTab.call(set, { ...homeTab, isActive: true, type: 'normal' });
  });

  addBrowserHomeTab = contextAtomMethod((_, set) => {
    const id = generateUUID();
    this.addWebTab.call(set, {
      id,
      url: '',
      title: appLocale.intl.formatMessage({
        id: ETranslations.browser_start_tab,
      }),
      canGoBack: false,
      loading: false,
      favicon: '',
      isActive: true,
      type: 'home',
    });
    this.setCurrentWebTab.call(set, id);
  });

  setWebTabData = contextAtomMethod((get, set, payload: Partial<IWebTab>) => {
    const { tabs: previousTabs } = get(webTabsAtom());
    const tabs = previousTabs;
    const tabIndex = tabs.findIndex((t) => t.id === payload.id);
    if (tabIndex > -1) {
      const tabToModify = tabs[tabIndex];
      Object.keys(payload).forEach((k) => {
        const key = k as keyof IWebTab;
        const value = payload[key];
        if (value !== undefined && value !== tabToModify[key]) {
          if (key === 'title') {
            if (!value) {
              return;
            }
          }
          // @ts-expect-error
          tabToModify[key] = value;
          if (key === 'url') {
            tabToModify.timestamp = Date.now();
            if (value === 'about:blank' && payload.id) {
              homeResettingFlags[payload.id] = tabToModify.timestamp;
            }
          }
        }
      });
      tabs[tabIndex] = tabToModify;
      loggerForEmptyData(tabs, 'setWebTabData');
      this.buildWebTabs.call(set, { data: tabs });
    }
  });

  buildClosedTabData = contextAtomMethod((get, set, payload: IWebTab[]) => {
    const isReady = get(browserDataReadyAtom());
    if (!isReady) {
      return;
    }
    const tabs = payload.length > 100 ? payload.slice(20) : payload;
    void backgroundApiProxy.simpleDb.browserClosedTabs.setRawData({
      tabs,
    });
    set(lastClosedTabAtom(), { tabs });
  });

  reOpenLastClosedTab = contextAtomMethod((get, set) => {
    const { tabs } = get(lastClosedTabAtom());
    if (tabs.length) {
      const tab = tabs.pop();
      if (tab) {
        this.addWebTab.call(set, tab);
        this.buildClosedTabData.call(set, tabs);
        return true;
      }
    }
    return false;
  });

  saveLastClosedTab = contextAtomMethod(
    (get, set, tab: IWebTab | IWebTab[]) => {
      const { tabs } = get(lastClosedTabAtom());
      tabs.push(...(Array.isArray(tab) ? tab : [tab]));
      this.buildClosedTabData.call(set, tabs);
    },
  );

  closeWebTab = contextAtomMethod(
    (
      get,
      set,
      payload: { tabId: string; entry: 'Menu' | 'ShortCut' | 'BlockView' },
    ) => {
      const { tabId, entry } = payload;
      delete webviewRefs[tabId];
      const { tabs } = get(webTabsAtom());
      const targetIndex = tabs.findIndex((t) => t.id === tabId);
      if (targetIndex !== -1) {
        const closedTab = tabs[targetIndex];
        tabs.splice(targetIndex, 1);

        // Add to browser history when tab is closed
        if (closedTab.url && closedTab.title && closedTab.url !== homeTab.url) {
          void this.addBrowserHistory.call(set, {
            url: closedTab.url,
            title: closedTab.title,
          });
        }

        const activateAdjacentTab = () => {
          let newActiveTabIndex = targetIndex - 1;

          if (newActiveTabIndex < 0 && tabs.length > 0) {
            newActiveTabIndex = 0;
          }

          // if current active tab is not in tabs, set it to the first tab
          const hasCurrentActiveTab = tabs.find((t) => t.isActive);

          if (hasCurrentActiveTab) {
            return;
          }

          // get the new active tab
          const newActiveTab = tabs[newActiveTabIndex];

          if (newActiveTab) {
            newActiveTab.isActive = true;
            this.setCurrentWebTab.call(set, newActiveTab.id);
          }
        };

        // Refresh the list after closing WebView in Electron to improve list fluidity
        if (platformEnv.isNative) {
          activateAdjacentTab();
        } else {
          if (this.closeTimeId) {
            clearTimeout(this.closeTimeId);
          }

          this.closeTimeId = setTimeout(() => {
            activateAdjacentTab();
          }, 100);
        }

        setTimeout(() => {
          this.saveLastClosedTab.call(set, closedTab);
        }, 50);
      }
      loggerForEmptyData([...tabs], 'closeWebTab');
      this.buildWebTabs.call(set, { data: [...tabs] });
      defaultLogger.discovery.browser.closeTab({
        closeMethod: entry,
      });
    },
  );

  closeAllWebTabs = contextAtomMethod(async (get, set) => {
    const { tabs } = get(webTabsAtom());
    const activeTabId = get(activeTabIdAtom());
    const pinnedTabs = tabs.filter((tab) => tab.isPinned); // close all tabs exclude pinned tab
    const tabsToClose = tabs.filter((tab) => !tab.isPinned);

    // Create a queue for closing tabs
    const closeQueue = tabsToClose.map((tab) => async () => {
      if (tab.url && tab.title) {
        await this.addBrowserHistory.call(set, {
          url: tab.url,
          title: tab.title,
        });
      }
    });

    // Process queue sequentially
    for (const closeOperation of closeQueue) {
      await closeOperation();
    }

    // should update active tab, if active tab is not in pinnedTabs
    if (pinnedTabs.every((tab) => tab.id !== activeTabId)) {
      this.setCurrentWebTab.call(set, null);
    }

    for (const id of Object.getOwnPropertyNames(webviewRefs)) {
      if (!pinnedTabs.find((tab) => tab.id === id)) {
        delete webviewRefs[id];
      }
    }

    loggerForEmptyData(pinnedTabs, 'closeAllWebTabs');
    this.buildWebTabs.call(set, { data: pinnedTabs });

    setTimeout(() => {
      this.saveLastClosedTab.call(set, tabsToClose);
    }, 50);

    defaultLogger.discovery.browser.clearTabs({
      clearTabsAmount: tabsToClose.length,
    });
  });

  setPinnedTab = contextAtomMethod(
    (get, set, payload: { id: string; pinned: boolean }) => {
      this.setWebTabData.call(set, {
        id: payload.id,
        isPinned: payload.pinned,
        timestamp: Date.now(),
      });
      this.setTabs.call(set);

      // track pinned tab
      const currentTab = this.getWebTabById.call(set, payload.id);
      const newTabs = get(webTabsAtom())?.tabs;
      const pinnedTabsAmount = newTabs.filter((tab) => tab.isPinned).length;
      const trackParams = {
        dappName: currentTab.title ?? '',
        dappDomain: currentTab.url ?? '',
        pinnedTabsAmount,
      };
      if (payload.pinned) {
        defaultLogger.discovery.browser.pinTab(trackParams);
      } else {
        defaultLogger.discovery.browser.unpinTab(trackParams);
      }
    },
  );

  setSiteMode = contextAtomMethod(
    (get, set, payload: { id: string; siteMode: ESiteMode }) => {
      this.setWebTabData.call(set, {
        id: payload.id,
        siteMode: payload.siteMode,
      });
      this.setTabs.call(set);
    },
  );

  /**
   * Bookmark actions
   */
  syncBookmark = contextAtomMethod(
    (get, set, payload: { url: string; isBookmark: boolean }) => {
      const tabMap = get(webTabsMapAtom());
      if (!tabMap) return;
      Object.entries(tabMap).forEach(([, value]) => {
        if (value.url === payload.url) {
          this.setWebTabData.call(set, {
            id: value.id,
            isBookmark: payload.isBookmark,
          });
        }
      });
    },
  );

  getBookmarkData = contextAtomMethod(async () => {
    const bookmarks =
      (await backgroundApiProxy.simpleDb.browserBookmarks.getRawData())?.data ??
      [];
    return bookmarks;
  });

  buildBookmarkData = contextAtomMethod(
    (
      get,
      set,
      payload: {
        data: IBrowserBookmark[];
        isRemove?: boolean; // remove payload.data
        options?: { isInitFromStorage?: boolean };
        skipSaveLocalSyncItem?: boolean;
      },
    ) => {
      const { data, isRemove, options, skipSaveLocalSyncItem } = payload;
      const isReady = get(browserDataReadyAtom());
      // web always ready
      const isBrowserDataReady = isReady || platformEnv.isWeb;
      if (!isBrowserDataReady && !options?.isInitFromStorage) {
        return;
      }
      if (!Array.isArray(data)) {
        throw new Error('buildBookmarkData: payload must be an array');
      }

      void backgroundApiProxy.serviceDiscovery.setBrowserBookmarks({
        bookmarks: data,
        isRemove,
        skipSaveLocalSyncItem,
      });
    },
  );

  addOrUpdateBrowserBookmark = contextAtomMethod(
    async (_, set, payload: IBrowserBookmark) => {
      if (!payload.url || payload.url === homeTab.url) {
        return;
      }
      const newBookmark: IBrowserBookmark = {
        url: payload.url,
        title: payload.title,
        logo: payload.logo ?? undefined,
        sortIndex: payload.sortIndex ?? undefined,
      };
      const updatedBookmarks = [newBookmark];
      this.buildBookmarkData.call(set, { data: updatedBookmarks });
      this.syncBookmark.call(set, { url: payload.url, isBookmark: true });
      void backgroundApiProxy.serviceCloudBackup.requestAutoBackup();

      defaultLogger.discovery.browser.addBookmark({
        dappName: payload.title,
        dappDomain: payload.url,
      });
    },
  );

  removeBrowserBookmark = contextAtomMethod(async (_, set, url: string) => {
    const bookmarks = await this.getBookmarkData.call(set);
    const removedBookmark = bookmarks.find((bookmark) => bookmark.url === url);
    if (!removedBookmark) {
      return;
    }
    this.buildBookmarkData.call(set, {
      data: [removedBookmark],
      isRemove: true,
    });
    this.syncBookmark.call(set, { url, isBookmark: false });

    defaultLogger.discovery.browser.removeBookmark({
      dappName: removedBookmark?.title || '',
      dappDomain: url,
    });
  });

  modifyBrowserBookmark = contextAtomMethod(
    async (_, set, payload: IBrowserBookmark) => {
      if (!payload.url || payload.url === homeTab.url) {
        return;
      }
      await this.addOrUpdateBrowserBookmark.call(set, payload);
    },
  );

  sortBrowserBookmark = contextAtomMethod(
    async (
      _,
      set,
      payload: {
        target: IBrowserBookmark;
        prev: IBrowserBookmark | undefined;
        next: IBrowserBookmark | undefined;
      },
    ) => {
      const { target, prev, next } = payload;
      const newSortIndex = sortUtils.buildNewSortIndex({
        target,
        prev,
        next,
      });
      await this.modifyBrowserBookmark.call(set, {
        ...target,
        sortIndex: newSortIndex,
      });
    },
  );

  /**
   * History actions
   */
  getHistoryData = contextAtomMethod(async () => {
    const histories =
      (await backgroundApiProxy.simpleDb.browserHistory.getRawData())?.data ??
      [];
    return histories;
  });

  buildHistoryData = contextAtomMethod(
    (
      get,
      set,

      payload: {
        data: IBrowserHistory[];
        options?: { isInitFromStorage?: boolean };
      },
    ) => {
      const { data, options } = payload;
      const isReady = get(browserDataReadyAtom());
      if (!isReady && !options?.isInitFromStorage) {
        return;
      }
      if (!Array.isArray(data)) {
        throw new Error('buildHistoryData: payload must be an array');
      }
      void backgroundApiProxy.simpleDb.browserHistory.setRawData({
        data,
      });
    },
  );

  addBrowserHistory = contextAtomMethod(
    async (_, set, payload: Omit<IBrowserHistory, 'id' | 'createdAt'>) => {
      if (!payload.url || payload.url === homeTab.url) {
        return;
      }
      const history = await this.getHistoryData.call(set);

      const updatedHistory = history.filter((item) => item.url !== payload.url);

      const newHistoryEntry = {
        id: generateUUID(),
        url: payload.url,
        title: payload.title,
        createdAt: Date.now(),
      };

      this.buildHistoryData.call(set, {
        data: [newHistoryEntry, ...updatedHistory],
      });
    },
  );

  removeBrowserHistory = contextAtomMethod(async (_, set, payload: string) => {
    const history = await this.getHistoryData.call(set);

    const updatedHistory = history.filter((item) => item.id !== payload);

    this.buildHistoryData.call(set, { data: updatedHistory });
  });

  removeAllBrowserHistory = contextAtomMethod(async (_, set) => {
    this.buildHistoryData.call(set, { data: [] });
  });

  /**
   * Browser Logic
   */
  getWebTabById = contextAtomMethod((get, _, tabId: string) => {
    const tabMaps = get(webTabsMapAtom());
    return tabMaps?.[tabId || ''];
  });

  gotoSite = contextAtomMethod(
    async (
      _,
      set,
      {
        id,
        url,
        title,
        favicon,
        siteMode,
        isNewWindow,
        isInPlace,
      }: IGotoSiteFnParams,
    ) => {
      const tab = this.getWebTabById.call(set, id ?? '');
      if (url) {
        const validatedUrl = uriUtils.validateUrl(url);
        if (!validatedUrl) {
          return;
        }

        if (browserTypeHandler === 'StandardBrowser') {
          return openUrlInApp(validatedUrl);
        }

        const tabId = tab?.id;

        const thisTab = this.getWebTabById.call(set, tabId ?? '');
        let isNewTab =
          typeof isNewWindow === 'boolean'
            ? isNewWindow
            : (isNewWindow || !tabId || tabId === 'home') &&
              browserTypeHandler === 'MultiTabBrowser';

        if (thisTab?.type === 'home') {
          isNewTab = false;
        }

        const bookmarks = await this.getBookmarkData.call(set);
        const isBookmark = bookmarks?.some((item) =>
          item.url.includes(validatedUrl),
        );
        if (isNewTab) {
          this.addWebTab.call(set, {
            title,
            url: validatedUrl,
            favicon,
            isBookmark,
            siteMode,
            type: 'normal',
          });
        } else {
          this.setWebTabData.call(set, {
            id: tabId,
            url: validatedUrl,
            title,
            favicon,
            isBookmark,
            type: 'normal',
          });
        }

        if (!isNewTab && !isInPlace) {
          crossWebviewLoadUrl({
            url: validatedUrl,
            tabId,
          });
        }

        return true;
      }
      return false;
    },
  );

  openMatchDApp = contextAtomMethod(
    async (
      _,
      set,
      { dApp, webSite, isNewWindow, tabId }: IMatchDAppItemType,
    ) => {
      if (webSite) {
        return this.gotoSite.call(set, {
          id: tabId,
          url: webSite.url,
          title: webSite.title,
          favicon:
            await backgroundApiProxy.serviceDiscovery.buildWebsiteIconUrl(
              webSite.url,
            ),
          isNewWindow,
        });
      }
      if (dApp) {
        return this.gotoSite.call(set, {
          id: tabId,
          url: dApp.url,
          title: dApp.name,
          dAppId: dApp.dappId,
          favicon: dApp.logo || dApp.originLogo,
          isNewWindow,
        });
      }
    },
  );

  handleOpenWebSite = contextAtomMethod(
    (
      get,
      set,
      {
        useCurrentWindow,
        tabId,
        navigation,
        webSite,
        dApp,
        shouldPopNavigation = true,
        switchToMultiTabBrowser = false,
      }: {
        navigation: ReturnType<typeof useAppNavigation>;
        useCurrentWindow?: boolean;
        tabId?: string;
        webSite?: IMatchDAppItemType['webSite'];
        dApp?: IMatchDAppItemType['dApp'];
        shouldPopNavigation?: boolean;
        switchToMultiTabBrowser?: boolean;
      },
    ) => {
      if (webSite?.url) {
        webSite.url = processWebSiteUrl(webSite.url) ?? webSite.url;
      }

      let delayTime = 0;
      if (shouldPopNavigation) {
        delayTime = 300;
      }
      setTimeout(() => {
        const isNewWindow = !useCurrentWindow;

        if (!useCurrentWindow) {
          const disabledAddedNewTab = get(disabledAddedNewTabAtom());
          if (disabledAddedNewTab) {
            Toast.message({
              title: appLocale.intl.formatMessage(
                { id: ETranslations.explore_toast_tab_limit_reached },
                { number: MaximumNumberOfTabs },
              ),
            });
            return;
          }
        }
        this.setDisplayHomePage.call(set, false);
        void this.openMatchDApp.call(set, {
          webSite,
          dApp,
          isNewWindow,
          tabId,
        });
      }, delayTime);

      if (switchToMultiTabBrowser || platformEnv.isDesktop) {
        navigation.switchTab(ETabRoutes.MultiTabBrowser);
      } else if (shouldPopNavigation) {
        navigation.switchTab(ETabRoutes.Discovery);
      }
    },
  );

  onNavigation = contextAtomMethod(
    (
      get,
      set,
      {
        url,
        isNewWindow,
        isInPlace,
        title,
        favicon,
        canGoBack,
        canGoForward,
        loading,
        id,
        handlePhishingUrl,
      }: IOnWebviewNavigationFnParams,
    ) => {
      const now = Date.now();
      const tab = this.getWebTabById.call(set, id ?? '');
      if (!tab) {
        return;
      }
      const isValidNewUrl = typeof url === 'string' && url !== tab.url;

      if (url) {
        const cache = get(phishingLruCacheAtom());
        const { action } = uriUtils.parseDappRedirect(
          url,
          Array.from(cache.keys()),
        );
        if (action === uriUtils.EDAppOpenActionEnum.DENY) {
          defaultLogger.discovery.browser.logRejectUrl(url);
          handlePhishingUrl?.(url);
          return;
        }
        if (uriUtils.isValidDeepLink(url)) {
          handleDeepLinkUrl({ url });
          return;
        }
      }

      if (isValidNewUrl) {
        if (tab.timestamp && now - tab.timestamp < 500) {
          // ignore url change if it's too fast to avoid back & forth loop
          return;
        }
        if (
          homeResettingFlags[tab.id] &&
          url !== homeTab.url &&
          now - homeResettingFlags[tab.id] < 1000
        ) {
          return;
        }

        void this.gotoSite.call(set, {
          url,
          title,
          favicon,
          isNewWindow,
          isInPlace,
          id: tab.id,
        });
      }

      this.setWebTabData.call(set, {
        id: tab.id,
        title,
        favicon,
        canGoBack,
        canGoForward,
        loading,
      });
    },
  );

  addUrlToPhishingCache = contextAtomMethod(
    (get, set, payload: { url: string }) => {
      try {
        const { origin } = new URL(payload.url);
        const cache = get(phishingLruCacheAtom());
        cache.set(origin, true);
        set(phishingLruCacheAtom(), cache);
        globalThis.desktopApi?.setAllowedPhishingUrls(Array.from(cache.keys()));
      } catch {
        // ignore
      }
    },
  );

  updateDappActivityInteraction = contextAtomMethod(
    (get, _, payload: { id?: string | null; type: 'pause' | 'resume' }) => {
      let tabId: string | undefined | null = payload.id;
      if (!tabId) {
        tabId = get(activeTabIdAtom());
      }
      const ref = tabId ? webviewRefs[tabId] : null;
      if (ref) {
        const shouldPause = payload.type === 'pause';
        const injectCode = shouldPause
          ? injectToPauseWebsocket
          : injectToResumeWebsocket;
        // update jsBridge interaction
        if (ref.jsBridge) {
          ref.jsBridge.globalOnMessageEnabled = !shouldPause;
        }
        // update wallet connect websocket
        if (platformEnv.isNative) {
          try {
            (ref.innerRef as WebView)?.injectJavaScript(injectCode);
          } catch (error) {
            // ipad mini orientation changed cause injectJavaScript ERROR, which crash app
            console.error(
              `${
                shouldPause ? 'pauseDappInteraction' : 'resumeDappInteraction'
              } webview.injectJavaScript() ERROR >>>>> `,
              error,
            );
          }
        }
        if (platformEnv.isDesktop) {
          const deskTopRef = ref.innerRef as IElectronWebView;
          if (deskTopRef) {
            try {
              deskTopRef.executeJavaScript(injectCode);
            } catch (e) {
              // if not dom ready, no need to pause websocket
            }
          }
        }
      }
    },
  );

  pauseDappInteraction = contextAtomMethod((_, set, payload: string | null) => {
    this.updateDappActivityInteraction.call(set, {
      id: payload,
      type: 'pause',
    });
  });

  resumeDappInteraction = contextAtomMethod(
    (_, set, payload: string | null) => {
      this.updateDappActivityInteraction.call(set, {
        id: payload,
        type: 'resume',
      });
    },
  );

  validateWebviewSrc = contextAtomMethod((get, _, url: string) => {
    if (!url) return EValidateUrlEnum.InvalidUrl;
    const cache = get(phishingLruCacheAtom());
    const { action } = uriUtils.parseDappRedirect(
      url,
      Array.from(cache.keys()),
    );
    if (action === uriUtils.EDAppOpenActionEnum.DENY) {
      defaultLogger.discovery.browser.logRejectUrl(url);
      return EValidateUrlEnum.NotSupportProtocol;
    }
    if (uriUtils.containsPunycode(url)) {
      defaultLogger.discovery.browser.logRejectUrl(url);
      return EValidateUrlEnum.InvalidPunycode;
    }
    if (uriUtils.isValidDeepLink(url)) {
      return EValidateUrlEnum.ValidDeeplink;
    }
    return EValidateUrlEnum.Valid;
  });
}

const createActions = memoFn(() => {
  console.log('new ContextJotaiActionsDiscovery()', Date.now());
  return new ContextJotaiActionsDiscovery();
});

export function useBrowserTabActions() {
  const actions = createActions();
  const addWebTab = actions.addWebTab.use();
  const addBlankWebTab = actions.addBlankWebTab.use();
  const addBrowserHomeTab = actions.addBrowserHomeTab.use();
  const buildWebTabs = actions.buildWebTabs.use();
  const setTabs = actions.setTabs.use();
  const setTabsByIds = actions.setTabsByIds.use();
  const setWebTabData = actions.setWebTabData.use();
  const getWebTabById = actions.getWebTabById.use();
  const closeWebTab = actions.closeWebTab.use();
  const closeAllWebTabs = actions.closeAllWebTabs.use();
  const setCurrentWebTab = actions.setCurrentWebTab.use();
  const setPinnedTab = actions.setPinnedTab.use();
  const setDisplayHomePage = actions.setDisplayHomePage.use();
  const setBrowserDataReady = actions.setBrowserDataReady.use();
  const reOpenLastClosedTab = actions.reOpenLastClosedTab.use();
  const setSiteMode = actions.setSiteMode.use();
  return useRef({
    addWebTab,
    addBlankWebTab,
    addBrowserHomeTab,
    buildWebTabs,
    setTabs,
    setTabsByIds,
    setWebTabData,
    getWebTabById,
    closeWebTab,
    closeAllWebTabs,
    setCurrentWebTab,
    setPinnedTab,
    setDisplayHomePage,
    setBrowserDataReady,
    reOpenLastClosedTab,
    setSiteMode,
  });
}

export function useBrowserBookmarkAction() {
  const actions = createActions();
  const buildBookmarkData = actions.buildBookmarkData.use();
  const getBookmarkData = actions.getBookmarkData.use();
  const addOrUpdateBrowserBookmark = actions.addOrUpdateBrowserBookmark.use();
  const removeBrowserBookmark = actions.removeBrowserBookmark.use();
  const modifyBrowserBookmark = actions.modifyBrowserBookmark.use();
  const sortBrowserBookmark = actions.sortBrowserBookmark.use();

  return useRef({
    buildBookmarkData,
    getBookmarkData,
    addOrUpdateBrowserBookmark,
    removeBrowserBookmark,
    modifyBrowserBookmark,
    sortBrowserBookmark,
  });
}

export function useBrowserHistoryAction() {
  const actions = createActions();
  const buildHistoryData = actions.buildHistoryData.use();
  const getHistoryData = actions.getHistoryData.use();
  const addBrowserHistory = actions.addBrowserHistory.use();
  const removeBrowserHistory = actions.removeBrowserHistory.use();
  const removeAllBrowserHistory = actions.removeAllBrowserHistory.use();

  return useRef({
    buildHistoryData,
    getHistoryData,
    addBrowserHistory,
    removeBrowserHistory,
    removeAllBrowserHistory,
  });
}

export function useBrowserAction() {
  const actions = createActions();
  const gotoSite = actions.gotoSite.use();
  const openMatchDApp = actions.openMatchDApp.use();
  const handleOpenWebSite = actions.handleOpenWebSite.use();
  const onNavigation = actions.onNavigation.use();
  const addUrlToPhishingCache = actions.addUrlToPhishingCache.use();
  const pauseDappInteraction = actions.pauseDappInteraction.use();
  const resumeDappInteraction = actions.resumeDappInteraction.use();
  const validateWebviewSrc = actions.validateWebviewSrc.use();

  return useRef({
    gotoSite,
    openMatchDApp,
    handleOpenWebSite,
    onNavigation,
    addUrlToPhishingCache,
    pauseDappInteraction,
    resumeDappInteraction,
    validateWebviewSrc,
  });
}
