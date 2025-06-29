import { useCallback, useEffect, useRef } from 'react';

import { debounce, noop } from 'lodash';
import { useIntl } from 'react-intl';

import {
  Dialog,
  Image,
  SizableText,
  YStack,
  rootNavigationRef,
  useShortcuts,
} from '@onekeyhq/components';
import { ipcMessageKeys } from '@onekeyhq/desktop/app/config';
import {
  useAppIsLockedAtom,
  useDevSettingsPersistAtom,
} from '@onekeyhq/kit-bg/src/states/jotai/atoms';
import { EAppUpdateStatus } from '@onekeyhq/shared/src/appUpdate';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { defaultLogger } from '@onekeyhq/shared/src/logger/logger';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import {
  EDiscoveryModalRoutes,
  EModalRoutes,
  EModalSettingRoutes,
  EMultiTabBrowserRoutes,
  ETabRoutes,
} from '@onekeyhq/shared/src/routes';
import { ERootRoutes } from '@onekeyhq/shared/src/routes/root';
import { EShortcutEvents } from '@onekeyhq/shared/src/shortcuts/shortcuts.enum';
import { ESpotlightTour } from '@onekeyhq/shared/src/spotlight';

import backgroundApiProxy from '../background/instance/backgroundApiProxy';
import { useAppUpdateInfo } from '../components/UpdateReminder/hooks';
import useAppNavigation from '../hooks/useAppNavigation';
import {
  isOpenedReferFriendsPage,
  useReferFriends,
} from '../hooks/useReferFriends';
import {
  isOpenedMyOneKeyModal,
  useToMyOneKeyModal,
} from '../views/DeviceManagement/hooks/useToMyOneKeyModal';
import { useOnLock } from '../views/Setting/pages/List/DefaultSection';

import type { IntlShape } from 'react-intl';

const useOnLockCallback = platformEnv.isDesktop
  ? useOnLock
  : () => () => undefined;

const useAppUpdateInfoCallback = platformEnv.isDesktop
  ? useAppUpdateInfo
  : () => ({} as ReturnType<typeof useAppUpdateInfo>);

const useDesktopEvents = platformEnv.isDesktop
  ? () => {
      const intl = useIntl();
      const navigation = useAppNavigation();
      const onLock = useOnLockCallback();
      const useOnLockRef = useRef(onLock);
      useOnLockRef.current = onLock;

      const { toReferFriendsPage } = useReferFriends();
      const toMyOneKeyModal = useToMyOneKeyModal();

      const { checkForUpdates, onUpdateAction } = useAppUpdateInfoCallback(
        false,
        false,
      );
      const isCheckingUpdate = useRef(false);

      const onCheckUpdate = useCallback(async () => {
        defaultLogger.update.app.log('checkForUpdates');
        if (isCheckingUpdate.current) {
          return;
        }
        isCheckingUpdate.current = true;
        const { isNeedUpdate, response } = await checkForUpdates();
        if (isNeedUpdate || response === undefined) {
          onUpdateAction();
          isCheckingUpdate.current = false;
        } else {
          Dialog.confirm({
            title: intl.formatMessage({
              id: ETranslations.update_app_update_latest_version,
            }),
            tone: 'success',
            icon: 'Ai3StarSolid',
            description: intl.formatMessage({
              id: ETranslations.update_app_up_to_date,
            }),
            onClose: () => {
              isCheckingUpdate.current = false;
            },
            onConfirmText: intl.formatMessage({
              id: ETranslations.global_ok,
            }),
          });
        }
      }, [checkForUpdates, intl, onUpdateAction]);

      const onCheckUpdateRef = useRef(onCheckUpdate);
      onCheckUpdateRef.current = onCheckUpdate;

      const openSettings = useCallback(
        (isMainWindowVisible: boolean) => {
          const openSettingPage = () => {
            navigation.pushModal(EModalRoutes.SettingModal, {
              screen: EModalSettingRoutes.SettingListModal,
            });
          };

          // close Settings page When MainWindow is visible
          if (isMainWindowVisible) {
            const routeState = rootNavigationRef.current?.getRootState();
            if (routeState) {
              const route = routeState.routes[routeState.routes.length - 1];
              if (
                route &&
                (route.params as { screen: string })?.screen ===
                  EModalRoutes.SettingModal
              ) {
                if (route.name === ERootRoutes.Modal) {
                  const routeLength =
                    route.state?.routes?.[0]?.state?.routes.length || 1;
                  for (let i = 0; i < routeLength; i += 1)
                    setTimeout(() => {
                      rootNavigationRef.current?.goBack();
                    }, 10);
                  return;
                }
              }
            }
          }

          openSettingPage();
        },
        [navigation],
      );

      const openSettingsRef = useRef(openSettings);
      openSettingsRef.current = openSettings;

      const ensureModalClosedAndNavigate = useCallback(
        (navigateAction?: () => void) => {
          const routeState = rootNavigationRef.current?.getRootState();
          if (routeState?.routes) {
            const allModalRoutes = routeState.routes.filter(
              (_, index) => index !== 0,
            );
            const hasMultipleModalRoutes = allModalRoutes.length === 1;

            if (allModalRoutes.length > 1) {
              return;
            }

            if (hasMultipleModalRoutes) {
              let index = 1;
              // close all modal routes
              allModalRoutes.forEach((route) => {
                const routeLength =
                  route.state?.routes?.[0]?.state?.routes.length || 1;
                for (let i = 0; i < routeLength; i += 1)
                  setTimeout(() => {
                    rootNavigationRef.current?.goBack();
                  }, index * 10);

                index += 1;
              });
              index += 1;

              setTimeout(() => {
                navigateAction?.();
              }, index * 10);
            } else {
              setTimeout(() => {
                navigateAction?.();
              }, 100);
            }
          }
        },
        [],
      );

      useEffect(() => {
        globalThis.desktopApi.on(ipcMessageKeys.CHECK_FOR_UPDATES, () => {
          void onCheckUpdateRef.current();
        });

        const debounceOpenSettings = debounce((isVisible: boolean) => {
          openSettingsRef.current(isVisible);
        }, 250);
        globalThis.desktopApi.on(
          ipcMessageKeys.APP_OPEN_SETTINGS,
          debounceOpenSettings,
        );

        globalThis.desktopApi.on(ipcMessageKeys.APP_LOCK_NOW, () => {
          void useOnLockRef.current();
        });
      }, []);

      useShortcuts(undefined, (eventName) => {
        switch (eventName) {
          case EShortcutEvents.TabWallet:
            navigation.switchTab(ETabRoutes.Home);
            break;
          case EShortcutEvents.TabEarn:
            navigation.switchTab(ETabRoutes.Earn);
            break;
          case EShortcutEvents.TabSwap:
            navigation.switchTab(ETabRoutes.Swap);
            break;
          case EShortcutEvents.TabMarket:
            navigation.switchTab(ETabRoutes.Market);
            break;
          case EShortcutEvents.TabReferAFriend:
            if (!isOpenedReferFriendsPage()) {
              ensureModalClosedAndNavigate(() => {
                void toReferFriendsPage();
              });
            } else {
              ensureModalClosedAndNavigate();
            }
            break;
          case EShortcutEvents.TabMyOneKey:
            if (!isOpenedMyOneKeyModal()) {
              ensureModalClosedAndNavigate(() => {
                void toMyOneKeyModal();
              });
            } else {
              ensureModalClosedAndNavigate();
            }
            break;
          case EShortcutEvents.TabBrowser:
            navigation.switchTab(ETabRoutes.Discovery);
            break;
          case EShortcutEvents.NewTab2:
            if (platformEnv.isDesktop) {
              navigation.switchTab(ETabRoutes.MultiTabBrowser, {
                screen: EMultiTabBrowserRoutes.MultiTabBrowser,
                params: {
                  action: 'create_new_tab',
                },
              });
            } else {
              navigation.pushModal(EModalRoutes.DiscoveryModal, {
                screen: EDiscoveryModalRoutes.SearchModal,
              });
            }
            break;
          default:
            break;
        }
      });
    }
  : () => undefined;

const useAboutVersion =
  platformEnv.isDesktop && !platformEnv.isDesktopMac
    ? () => {
        const intl = useIntl();
        useEffect(() => {
          desktopApi.on(ipcMessageKeys.SHOW_ABOUT_WINDOW, () => {
            const versionString = intl.formatMessage(
              {
                id: ETranslations.settings_version_versionnum,
              },
              {
                'versionNum': ` ${process.env.VERSION || 1}(${
                  platformEnv.buildNumber || 1
                })`,
              },
            );
            Dialog.show({
              showFooter: false,
              renderContent: (
                <YStack gap={4} alignItems="center" pt="$4">
                  <Image
                    source={require('../../assets/logo.png')}
                    size={72}
                    borderRadius="$full"
                  />
                  <YStack gap="$2" pt="$4" alignItems="center">
                    <SizableText size="$heading2xl">OneKey</SizableText>
                    <SizableText size="$bodySm">
                      {`${globalThis.desktopApi.platform}-${
                        globalThis.desktopApi.arch || 'unknown'
                      }`}
                    </SizableText>
                    <SizableText size="$bodySm">{versionString}</SizableText>
                    <SizableText size="$bodySm">Copyright © OneKey</SizableText>
                  </YStack>
                </YStack>
              ),
            });
          });
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
      }
    : noop;

export const useFetchCurrencyList = () => {
  useEffect(() => {
    void backgroundApiProxy.serviceSetting.fetchCurrencyList();
  }, []);
};

const launchFloatingIconEvent = async (intl: IntlShape) => {
  const visited = await backgroundApiProxy.serviceSpotlight.isVisited(
    ESpotlightTour.showFloatingIconDialog,
  );
  if (!visited) {
    const isShowFloatingButton =
      await backgroundApiProxy.serviceSetting.isShowFloatingButton();
    const launchTimesLastReset =
      await backgroundApiProxy.serviceApp.getLaunchTimesLastReset();
    if (!isShowFloatingButton && launchTimesLastReset === 5) {
      Dialog.show({
        title: '',
        showExitButton: false,
        renderContent: (
          <YStack gap="$4">
            <Image
              borderRadius="$3"
              $md={{
                h: '$40',
              }}
              $gtMd={{
                w: 360,
                h: 163,
              }}
              source={require('@onekeyhq/kit/assets/floating_icon_placeholder.png')}
            />
            <YStack gap="$1">
              <SizableText size="$headingLg">
                {intl.formatMessage({
                  id: ETranslations.setting_introducing_floating_icon,
                })}
              </SizableText>
              <SizableText size="$bodyLg" color="$textSubdued">
                {intl.formatMessage({
                  id: ETranslations.setting_floating_icon_always_display_description,
                })}
              </SizableText>
            </YStack>
          </YStack>
        ),
        onConfirmText: intl.formatMessage({
          id: ETranslations.global_enable,
        }),
        onConfirm: async () => {
          await backgroundApiProxy.serviceSpotlight.firstVisitTour(
            ESpotlightTour.showFloatingIconDialog,
          );
          await backgroundApiProxy.serviceSetting.setIsShowFloatingButton(true);
          defaultLogger.discovery.dapp.enableFloatingIcon({
            enable: true,
          });
        },
        onCancelText: intl.formatMessage({
          id: ETranslations.global_close,
        }),
        onCancel: async () => {
          await backgroundApiProxy.serviceSpotlight.firstVisitTour(
            ESpotlightTour.showFloatingIconDialog,
          );
        },
      });
    }
  }
};

export const useLaunchEvents = (): void => {
  const intl = useIntl();
  const [isLocked] = useAppIsLockedAtom();
  const hasLaunchEventsExecutedRef = useRef(false);
  useEffect(() => {
    if (isLocked || hasLaunchEventsExecutedRef.current) {
      return;
    }
    void backgroundApiProxy.serviceAppUpdate
      .getUpdateStatus()
      .then((updateStatus: EAppUpdateStatus) => {
        if (updateStatus === EAppUpdateStatus.ready) {
          return;
        }
        hasLaunchEventsExecutedRef.current = true;
        setTimeout(async () => {
          await backgroundApiProxy.serviceApp.updateLaunchTimes();
          if (platformEnv.isExtension) {
            await launchFloatingIconEvent(intl);
          }
        }, 250);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked]);
};

const getBuilderNumber = (builderNumber?: string) =>
  builderNumber ? Number(builderNumber.split('-')[0]) : -1;
export const useCheckUpdateOnDesktop =
  platformEnv.isDesktop &&
  !platformEnv.isMas &&
  !platformEnv.isDesktopLinuxSnap &&
  !platformEnv.isDesktopWinMsStore
    ? () => {
        useEffect(() => {
          globalThis.desktopApi.on(
            ipcMessageKeys.UPDATE_DOWNLOAD_FILE_INFO,
            (downloadUrl) => {
              defaultLogger.update.app.log(
                'UPDATE_DOWNLOAD_FILE_INFO',
                downloadUrl,
              );
              void backgroundApiProxy.serviceAppUpdate.updateDownloadUrl(
                downloadUrl,
              );
            },
          );
          setTimeout(() => {
            const previousBuildNumber =
              globalThis.desktopApi.getPreviousUpdateBuildNumber();
            if (
              previousBuildNumber &&
              getBuilderNumber(previousBuildNumber) >=
                getBuilderNumber(platformEnv.buildNumber)
            ) {
              void backgroundApiProxy.serviceAppUpdate.resetToManualInstall();
            }
          }, 0);
        }, []);
      }
    : noop;

export function Bootstrap() {
  const navigation = useAppNavigation();
  const [devSettings] = useDevSettingsPersistAtom();
  const autoNavigation = devSettings.settings?.autoNavigation;

  useEffect(() => {
    if (
      platformEnv.isDev &&
      autoNavigation?.enabled &&
      autoNavigation?.selectedTab &&
      Object.values(ETabRoutes).includes(autoNavigation.selectedTab)
    ) {
      const timer = setTimeout(() => {
        navigation.switchTab(autoNavigation.selectedTab as ETabRoutes);
      }, 1000);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [navigation, autoNavigation?.enabled, autoNavigation?.selectedTab]);

  useFetchCurrencyList();
  useAboutVersion();
  useDesktopEvents();
  useLaunchEvents();
  useCheckUpdateOnDesktop();
  return null;
}
