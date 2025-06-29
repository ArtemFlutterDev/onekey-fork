import { useCallback } from 'react';

import { useIntl } from 'react-intl';

import type { IIconProps, IStackProps } from '@onekeyhq/components';
import { Button, Icon, SizableText, XStack } from '@onekeyhq/components';
import { EAppUpdateStatus } from '@onekeyhq/shared/src/appUpdate';
import type { IAppUpdateInfo } from '@onekeyhq/shared/src/appUpdate';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import platformEnv from '@onekeyhq/shared/src/platformEnv';

import { DownloadProgress } from './DownloadProgress';
import { useAppUpdateInfo } from './hooks';

function UpdateStatusText({ updateInfo }: { updateInfo: IAppUpdateInfo }) {
  const intl = useIntl();
  const buildStyles = useCallback(
    () =>
      ({
        [EAppUpdateStatus.notify]: {
          iconName: 'DownloadOutline',
          iconColor: '$iconInfo',
          renderText({
            updateInfo: appUpdateInfo,
          }: {
            updateInfo: IAppUpdateInfo;
          }) {
            return intl.formatMessage(
              { id: ETranslations.update_update_app_available },
              {
                version: appUpdateInfo.latestVersion || '',
              },
            );
          },
        },
        [EAppUpdateStatus.downloadPackage]: {
          iconName: 'RefreshCcwSolid',
          iconColor: '$iconInfo',
          renderText: DownloadProgress,
        },
        [EAppUpdateStatus.downloadASC]: {
          iconName: 'RefreshCcwSolid',
          iconColor: '$iconInfo',
          renderText() {
            return intl.formatMessage({
              id: ETranslations.update_download_asc_label,
            });
          },
        },
        [EAppUpdateStatus.verifyASC]: {
          iconName: 'RefreshCcwSolid',
          iconColor: '$iconInfo',
          renderText() {
            return intl.formatMessage({
              id: ETranslations.update_verify_asc_labe,
            });
          },
        },
        [EAppUpdateStatus.verifyPackage]: {
          iconName: 'RefreshCcwSolid',
          iconColor: '$iconInfo',
          renderText() {
            return intl.formatMessage({
              id: ETranslations.update_verify_file_signature,
            });
          },
        },
        [EAppUpdateStatus.downloadPackageFailed]: {
          iconName: 'ErrorOutline',
          iconColor: '$iconCritical',
          renderText({
            updateInfo: appUpdateInfo,
          }: {
            updateInfo: IAppUpdateInfo;
          }) {
            return intl.formatMessage({
              id: appUpdateInfo.errorText || ETranslations.global_update_failed,
            });
          },
        },
        [EAppUpdateStatus.verifyASCFailed]: {
          iconName: 'ErrorOutline',
          iconColor: '$iconCritical',
          renderText({
            updateInfo: appUpdateInfo,
          }: {
            updateInfo: IAppUpdateInfo;
          }) {
            return intl.formatMessage({
              id: appUpdateInfo.errorText || ETranslations.global_update_failed,
            });
          },
        },
        [EAppUpdateStatus.verifyPackageFailed]: {
          iconName: 'ErrorOutline',
          iconColor: '$iconCritical',
          renderText({
            updateInfo: appUpdateInfo,
          }: {
            updateInfo: IAppUpdateInfo;
          }) {
            return intl.formatMessage({
              id: appUpdateInfo.errorText || ETranslations.global_update_failed,
            });
          },
        },
        [EAppUpdateStatus.downloadASCFailed]: {
          iconName: 'ErrorOutline',
          iconColor: '$iconCritical',
          renderText({
            updateInfo: appUpdateInfo,
          }: {
            updateInfo: IAppUpdateInfo;
          }) {
            return intl.formatMessage({
              id: appUpdateInfo.errorText || ETranslations.global_update_failed,
            });
          },
        },
        [EAppUpdateStatus.ready]: {
          iconName: 'Shield2CheckOutline',
          iconColor: '$iconSuccess',
          renderText({
            updateInfo: appUpdateInfo,
          }: {
            updateInfo: IAppUpdateInfo;
          }) {
            return intl.formatMessage(
              { id: ETranslations.update_app_version_ready_for_update },
              {
                version: appUpdateInfo.latestVersion || '',
              },
            );
          },
        },
        [EAppUpdateStatus.updateIncomplete]: {
          iconName: 'ErrorOutline',
          iconColor: '$iconCaution',
          renderText() {
            return intl.formatMessage({
              id: ETranslations.update_update_incomplete_text,
            });
          },
        },
        [EAppUpdateStatus.manualInstall]: {
          iconName: 'ErrorOutline',
          iconColor: '$iconCaution',
          renderText() {
            return intl.formatMessage({
              id: ETranslations.update_update_incomplete_text,
            });
          },
        },
        [EAppUpdateStatus.failed]: {
          iconName: 'ErrorOutline',
          iconColor: '$iconCritical',
          renderText({
            updateInfo: appUpdateInfo,
          }: {
            updateInfo: IAppUpdateInfo;
          }) {
            return intl.formatMessage({
              id: appUpdateInfo.errorText || ETranslations.global_update_failed,
            });
          },
        },
        [EAppUpdateStatus.done]: undefined,
      } as Record<
        EAppUpdateStatus,
        | {
            iconName: IIconProps['name'];
            iconColor: IIconProps['color'];
            renderText: ({
              updateInfo,
            }: {
              updateInfo: IAppUpdateInfo;
            }) => string;
          }
        | undefined
      >),
    [intl],
  );
  const styles = buildStyles();
  const data = styles[updateInfo.status];

  const { iconName, iconColor, renderText } = data || {};
  const Component = renderText;
  return Component ? (
    <XStack alignItems="center" gap="$2" flexShrink={1}>
      <Icon name={iconName} color={iconColor} size="$5" flexShrink={0} />
      <SizableText size="$bodyMdMedium" color="$text" flexShrink={1}>
        <Component updateInfo={updateInfo} />
      </SizableText>
    </XStack>
  ) : null;
}

function UpdateAction({ onUpdateAction }: { onUpdateAction: () => void }) {
  const intl = useIntl();
  return (
    <XStack gap="$4" justifyContent="space-between" alignItems="center">
      <Button size="small" variant="secondary" onPress={onUpdateAction}>
        {intl.formatMessage({ id: ETranslations.global_view })}
      </Button>
    </XStack>
  );
}

const UPDATE_REMINDER_BAR_STYLE: Record<
  EAppUpdateStatus,
  IStackProps | undefined
> = {
  [EAppUpdateStatus.notify]: {
    bg: '$bgInfoSubdued',
    borderColor: '$borderInfoSubdued',
  },
  [EAppUpdateStatus.downloadPackage]: {
    bg: '$bgInfoSubdued',
    borderColor: '$borderInfoSubdued',
  },
  [EAppUpdateStatus.downloadASC]: {
    bg: '$bgInfoSubdued',
    borderColor: '$borderInfoSubdued',
  },
  [EAppUpdateStatus.verifyASC]: {
    bg: '$bgInfoSubdued',
    borderColor: '$borderInfoSubdued',
  },
  [EAppUpdateStatus.verifyPackage]: {
    bg: '$bgInfoSubdued',
    borderColor: '$borderInfoSubdued',
  },
  [EAppUpdateStatus.ready]: {
    bg: '$bgSuccessSubdued',
    borderColor: '$borderSuccessSubdued',
  },
  [EAppUpdateStatus.downloadPackageFailed]: {
    bg: '$bgCriticalSubdued',
    borderColor: '$borderCriticalSubdued',
  },
  [EAppUpdateStatus.downloadASCFailed]: {
    bg: '$bgCriticalSubdued',
    borderColor: '$borderCriticalSubdued',
  },
  [EAppUpdateStatus.verifyASCFailed]: {
    bg: '$bgCriticalSubdued',
    borderColor: '$borderCriticalSubdued',
  },
  [EAppUpdateStatus.verifyPackageFailed]: {
    bg: '$bgCriticalSubdued',
    borderColor: '$borderCriticalSubdued',
  },
  [EAppUpdateStatus.failed]: {
    bg: '$bgCriticalSubdued',
    borderColor: '$borderCriticalSubdued',
  },
  [EAppUpdateStatus.done]: undefined,
  [EAppUpdateStatus.updateIncomplete]: {
    bg: '$bgCautionSubdued',
    borderColor: '$borderCautionSubdued',
  },
  [EAppUpdateStatus.manualInstall]: {
    bg: '$bgCautionSubdued',
    borderColor: '$borderCautionSubdued',
  },
};

function BasicUpdateReminder() {
  const appUpdateInfo = useAppUpdateInfo(true);
  const { data, onUpdateAction } = appUpdateInfo;
  const style = UPDATE_REMINDER_BAR_STYLE[data.status];

  if (!appUpdateInfo.isNeedUpdate || !style) {
    return null;
  }
  return (
    <XStack
      px="$5"
      py="$2"
      justifyContent="space-between"
      alignItems="center"
      borderTopWidth="$px"
      borderBottomWidth="$px"
      $md={{
        mt: '$2',
      }}
      {...style}
    >
      <UpdateStatusText updateInfo={data} />
      <UpdateAction onUpdateAction={onUpdateAction} />
    </XStack>
  );
}

export const UpdateReminder = platformEnv.isWeb
  ? () => null
  : BasicUpdateReminder;
