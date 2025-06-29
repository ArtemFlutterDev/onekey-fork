import { useState } from 'react';

import {
  Button,
  Dialog,
  SizableText,
  Stack,
  Toast,
  XStack,
} from '@onekeyhq/components';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import useAppNavigation from '@onekeyhq/kit/src/hooks/useAppNavigation';
import { useLoginOneKeyId } from '@onekeyhq/kit/src/hooks/useLoginOneKeyId';
import { usePrimeAuthV2 } from '@onekeyhq/kit/src/views/Prime/hooks/usePrimeAuthV2';
import { usePrimePayment } from '@onekeyhq/kit/src/views/Prime/hooks/usePrimePayment';
import { EModalRoutes } from '@onekeyhq/shared/src/routes';
import { EPrimePages } from '@onekeyhq/shared/src/routes/prime';

function CloudSyncDebugTest() {
  return (
    <XStack flexWrap="wrap">
      <SizableText>CloudSyncTest:</SizableText>

      <Button
        onPress={async () => {
          const syncCredential =
            await backgroundApiProxy.servicePrimeCloudSync.getSyncCredentialSafe();
          if (!syncCredential) {
            throw new Error('No sync credential');
          }
          const result =
            await backgroundApiProxy.servicePrimeCloudSync.initLocalSyncItemsDB(
              {
                syncCredential,
              },
            );
          Toast.success({
            title: result.toString() || 'error',
          });
        }}
      >
        初始化本地库
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.clearAllLocalSyncItems();
        }}
      >
        清空本地数据
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.decryptAllLocalSyncItems();
        }}
      >
        解密本地数据
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.decryptAllServerSyncItems();
        }}
      >
        API:解密云端数据
      </Button>

      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.startServerSyncFlow({
            callerName: 'PrimeDebugPanel',
          });
        }}
      >
        执行同步工作流
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.apiCheckServerStatus();
        }}
      >
        API:check
      </Button>
      <Button
        onPress={async () => {
          const userInfo =
            await backgroundApiProxy.servicePrime.apiFetchPrimeUserInfo();
          const customPwdHash = userInfo.serverUserInfo?.pwdHash;
          await backgroundApiProxy.servicePrimeCloudSync.apiDownloadItems({
            customPwdHash,
          });
        }}
      >
        API:download
      </Button>
      <Button
        onPress={async () => {
          const userInfo =
            await backgroundApiProxy.servicePrime.apiFetchPrimeUserInfo();
          const customPwdHash = userInfo.serverUserInfo?.pwdHash;
          await backgroundApiProxy.servicePrimeCloudSync.apiDownloadItems({
            includeDeleted: true,
            customPwdHash,
          });
        }}
      >
        API:download(includeDeleted=true)
      </Button>
      <Button
        onPress={async () => {
          const userInfo =
            await backgroundApiProxy.servicePrime.apiFetchPrimeUserInfo();
          const customPwdHash = userInfo.serverUserInfo?.pwdHash;
          await backgroundApiProxy.servicePrimeCloudSync.apiDownloadItems({
            limit: 1,
            customPwdHash,
          });
        }}
      >
        API:download(limit=1)
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.apiFetchSyncLock();
        }}
      >
        API:fetchLock
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.uploadAllLocalItems({
            isFlush: false,
          });
        }}
      >
        API:增量上传所有本地数据
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.uploadAllLocalItems({
            isFlush: true,
          });
        }}
      >
        API:全量上传所有本地数据
      </Button>

      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.resetServerData({
            skipPrimeStatusCheck: true,
          });
        }}
      >
        API:重置云端数据
      </Button>

      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.debugDownloadAllServerSyncItemsAndSaveToLocal();
        }}
      >
        API:下载所有云端数据并写入本地
      </Button>
    </XStack>
  );
}

function showDebugMessageByDialog(obj: any) {
  Dialog.debugMessage({
    debugMessage: obj,
  });
}

export function PrimeDebugPanel({
  shouldShowConfirmButton,
}: {
  shouldShowConfirmButton: boolean;
}) {
  const {
    getAccessToken,
    logout,
    sdkLogout,
    apiLogout,
    isReady,
    authenticated,
  } = usePrimeAuthV2();
  const { getCustomerInfo } = usePrimePayment();
  const navigation = useAppNavigation();
  const [isHidden, setIsHidden] = useState(false);
  const { loginOneKeyId } = useLoginOneKeyId();

  if (isHidden) {
    return null;
  }

  return (
    <Stack>
      <Button
        onPress={() => {
          setIsHidden(true);
        }}
      >
        Hide
      </Button>
      <XStack flexWrap="wrap">
        <Button
          onPress={() => {
            void getAccessToken().then(showDebugMessageByDialog);
          }}
        >
          Get Access Token
        </Button>
        <Button
          onPress={() => {
            showDebugMessageByDialog({
              ready: isReady,
              authenticated,
            });
          }}
        >
          User Info
        </Button>
        <Button>
          shouldShowConfirmButton={shouldShowConfirmButton.toString()}
        </Button>
        <Button
          onPress={() => {
            void getCustomerInfo().then(showDebugMessageByDialog);
          }}
        >
          CustomerInfo
        </Button>
        <Button
          onPress={() => {
            void backgroundApiProxy.servicePrime
              .apiFetchPrimeUserInfo()
              .then(showDebugMessageByDialog);
          }}
        >
          ServerPrimeUserInfo
        </Button>
        <Button
          onPress={() => {
            void backgroundApiProxy.servicePrime
              .apiGetPrimeUserDevices()
              .then(console.log);
          }}
        >
          UserDevices
        </Button>
        <Button
          onPress={() => {
            navigation.pushFullModal(EModalRoutes.PrimeModal, {
              screen: EPrimePages.PrimeDeviceLimit,
            });
          }}
        >
          DeviceLimit
        </Button>
        <Button
          onPress={() => {
            void logout();
          }}
        >
          Logout
        </Button>
        <Button
          onPress={() => {
            void apiLogout();
          }}
        >
          API Logout
        </Button>
        <Button
          onPress={() => {
            void sdkLogout();
          }}
        >
          SDK Logout
        </Button>
        <Button
          onPress={() => {
            void loginOneKeyId();
          }}
        >
          loginOneKeyId
        </Button>
      </XStack>
      <CloudSyncDebugTest />
    </Stack>
  );
}
