import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useIntl } from 'react-intl';
import { Animated, Easing, Keyboard } from 'react-native';

import { Icon, Page, Stack, Tab, YStack, useMedia } from '@onekeyhq/components';
import { getEnabledNFTNetworkIds } from '@onekeyhq/shared/src/engine/engineConsts';
import {
  EAppEventBusNames,
  appEventBus,
} from '@onekeyhq/shared/src/eventBus/appEventBus';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import { ETabRoutes } from '@onekeyhq/shared/src/routes';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import { EAccountSelectorSceneName } from '@onekeyhq/shared/types';

import backgroundApiProxy from '../../../background/instance/backgroundApiProxy';
import { EmptyAccount, EmptyWallet } from '../../../components/Empty';
import { NetworkAlert } from '../../../components/NetworkAlert';
import { TabPageHeader } from '../../../components/TabPageHeader';
import { UniversalSearchInput } from '../../../components/TabPageHeader/UniversalSearchInput';
import { UpdateReminder } from '../../../components/UpdateReminder';
import { WalletBackupAlert } from '../../../components/WalletBackup';
import { usePromiseResult } from '../../../hooks/usePromiseResult';
import { useActiveAccount } from '../../../states/jotai/contexts/accountSelector';
import { HomeFirmwareUpdateReminder } from '../../FirmwareUpdate/components/HomeFirmwareUpdateReminder';
import HomeSelector from '../components/HomeSelector';
import { HomeSupportedWallet } from '../components/HomeSupportedWallet';
import useHomePageWidth from '../hooks/useHomePageWidth';

import { HomeHeaderContainer } from './HomeHeaderContainer';
import { NFTListContainerWithProvider } from './NFTListContainer';
import { TokenListContainerWithProvider } from './TokenListContainer';
import { TxHistoryListContainerWithProvider } from './TxHistoryContainer';
import WalletContentWithAuth from './WalletContentWithAuth';

let CONTENT_ITEM_WIDTH: Animated.Value | undefined;

export function HomePageView({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onPressHide,
  sceneName,
}: {
  onPressHide?: () => void;
  sceneName: EAccountSelectorSceneName;
}) {
  const { screenWidth, pageWidth } = useHomePageWidth();
  if (CONTENT_ITEM_WIDTH == null) {
    CONTENT_ITEM_WIDTH = new Animated.Value(pageWidth);
  }
  useEffect(() => {
    if (!CONTENT_ITEM_WIDTH) {
      return;
    }
    Animated.timing(CONTENT_ITEM_WIDTH, {
      toValue: pageWidth,
      duration: 400,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [pageWidth]);
  const intl = useIntl();
  const {
    activeAccount: {
      account,
      accountName,
      network,
      deriveInfo,
      wallet,
      ready,
      device,
      indexedAccount,
    },
  } = useActiveAccount({ num: 0 });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addressType = deriveInfo?.labelKey
    ? intl.formatMessage({
        id: deriveInfo?.labelKey,
      })
    : deriveInfo?.label ?? '';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isHide, setIsHide] = useState(false);

  const result = usePromiseResult(async () => {
    if (!network) {
      return;
    }
    const [v, a] = await Promise.all([
      backgroundApiProxy.serviceNetwork.getVaultSettings({
        networkId: network?.id ?? '',
      }),
      indexedAccount
        ? backgroundApiProxy.serviceAccount.getNetworkAccountsInSameIndexedAccountIdWithDeriveTypes(
            {
              networkId: network?.id ?? '',
              indexedAccountId: indexedAccount?.id ?? '',
              excludeEmptyAccount: true,
            },
          )
        : undefined,
    ]);
    return {
      vaultSettings: v,
      networkAccounts: a,
    };
  }, [network, indexedAccount]);

  const { vaultSettings, networkAccounts } = result.result ?? {};

  const isNFTEnabled =
    vaultSettings?.NFTEnabled &&
    getEnabledNFTNetworkIds().includes(network?.id ?? '');
  const isRequiredValidation = vaultSettings?.validationRequired;
  const softwareAccountDisabled = vaultSettings?.softwareAccountDisabled;
  const supportedDeviceTypes = vaultSettings?.supportedDeviceTypes;
  const watchingAccountEnabled = vaultSettings?.watchingAccountEnabled;

  const tabs = useMemo(
    () =>
      [
        {
          title: intl.formatMessage({
            id: ETranslations.global_crypto,
          }),
          page: memo(TokenListContainerWithProvider, () => true),
        },
        isNFTEnabled
          ? {
              title: intl.formatMessage({
                id: ETranslations.global_nft,
              }),
              page: memo(NFTListContainerWithProvider, () => true),
            }
          : null,
        // {
        //   title: 'Defi',
        //   page: memo(DefiListContainer, () => true),
        // },
        {
          title: intl.formatMessage({
            id: ETranslations.global_history,
          }),
          page: memo(TxHistoryListContainerWithProvider, () => true),
        },
      ].filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [intl, account?.id, network?.id, isNFTEnabled],
  );

  const onRefresh = useCallback(() => {
    appEventBus.emit(EAppEventBusNames.AccountDataUpdate, undefined);
  }, []);

  const emptyAccountView = useMemo(
    () => (
      <EmptyAccount
        autoCreateAddress
        createAllDeriveTypes
        createAllEnabledNetworks
        name={accountName}
        chain={network?.name ?? ''}
        type={
          (deriveInfo?.labelKey
            ? intl.formatMessage({
                id: deriveInfo?.labelKey,
              })
            : deriveInfo?.label) ?? ''
        }
      />
    ),
    [accountName, deriveInfo?.label, deriveInfo?.labelKey, intl, network?.name],
  );

  const prevPageIndex = useRef<number | undefined>();
  const handleSelectPageIndexChange = useCallback((pageIndex: number) => {
    if (
      prevPageIndex.current !== undefined &&
      prevPageIndex.current !== pageIndex
    ) {
      Keyboard.dismiss();
    }
    prevPageIndex.current = pageIndex;
  }, []);

  const renderTabs = useCallback(
    () => (
      <Tab
        disableRefresh={!platformEnv.isNative}
        data={tabs}
        ListHeaderComponent={<HomeHeaderContainer />}
        onSelectedPageIndex={handleSelectPageIndexChange}
        initialScrollIndex={0}
        initialHeaderHeight={220}
        contentItemWidth={CONTENT_ITEM_WIDTH}
        contentWidth={screenWidth}
        showsVerticalScrollIndicator={false}
        onRefresh={onRefresh}
      />
    ),
    [tabs, handleSelectPageIndexChange, screenWidth, onRefresh],
  );

  useEffect(() => {
    void Icon.prefetch('CloudOffOutline');
  }, []);

  const renderHomePageContent = useCallback(() => {
    if (
      (softwareAccountDisabled &&
        accountUtils.isHdWallet({
          walletId: wallet?.id ?? '',
        })) ||
      (supportedDeviceTypes &&
        device?.deviceType &&
        !supportedDeviceTypes.includes(device?.deviceType))
    ) {
      return (
        <HomeSupportedWallet
          supportedDeviceTypes={supportedDeviceTypes}
          watchingAccountEnabled={watchingAccountEnabled}
        />
      );
    }

    if (
      !account &&
      !(
        vaultSettings?.mergeDeriveAssetsEnabled &&
        networkAccounts &&
        networkAccounts.networkAccounts &&
        networkAccounts.networkAccounts.length > 0
      )
    ) {
      return (
        <YStack height="100%">
          <HomeSelector padding="$5" />
          <Stack flex={1} justifyContent="center">
            {emptyAccountView}
          </Stack>
        </YStack>
      );
    }
    if (isRequiredValidation) {
      return (
        <WalletContentWithAuth
          networkId={network?.id ?? ''}
          accountId={account?.id ?? ''}
        >
          <>{renderTabs()}</>
        </WalletContentWithAuth>
      );
    }

    return <>{renderTabs()}</>;
  }, [
    softwareAccountDisabled,
    wallet?.id,
    supportedDeviceTypes,
    device?.deviceType,
    account,
    vaultSettings?.mergeDeriveAssetsEnabled,
    networkAccounts,
    isRequiredValidation,
    renderTabs,
    watchingAccountEnabled,
    emptyAccountView,
    network?.id,
  ]);

  const media = useMedia();

  const renderHomePage = useCallback(() => {
    if (!ready) {
      return (
        <TabPageHeader
          showHeaderRight
          sceneName={sceneName}
          tabRoute={ETabRoutes.Home}
        />
      );
    }

    let content = (
      <Stack h="100%" justifyContent="center">
        <EmptyWallet />
      </Stack>
    );

    if (wallet) {
      content = renderHomePageContent();
      // This is a temporary hack solution, need to fix the layout of headerLeft and headerRight
    }
    return (
      <>
        <TabPageHeader
          showHeaderRight
          sceneName={sceneName}
          tabRoute={ETabRoutes.Home}
        >
          {media.gtMd && sceneName === EAccountSelectorSceneName.home ? (
            <UniversalSearchInput key="searchInput" />
          ) : null}
        </TabPageHeader>
        <Page.Body>
          <WalletBackupAlert />
          <NetworkAlert />
          {
            // The upgrade reminder does not need to be displayed on the Url Account page
            sceneName === EAccountSelectorSceneName.home ? (
              <>
                <UpdateReminder />
                <HomeFirmwareUpdateReminder />
              </>
            ) : null
          }
          {content}
        </Page.Body>
      </>
    );
  }, [ready, wallet, sceneName, media.gtMd, renderHomePageContent]);

  return useMemo(
    () => <Page fullPage>{renderHomePage()}</Page>,
    [renderHomePage],
  );
}
