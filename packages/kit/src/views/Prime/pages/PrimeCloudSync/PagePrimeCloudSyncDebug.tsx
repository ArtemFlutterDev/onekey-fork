import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ICheckedState, ISizableTextProps } from '@onekeyhq/components';
import {
  Button,
  Checkbox,
  Dialog,
  Page,
  Select,
  SizableText as SizableTextBase,
  Stack,
  Tab,
  Table,
  Toast,
  XStack,
  YStack,
  useClipboard,
} from '@onekeyhq/components';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import { usePromiseResult } from '@onekeyhq/kit/src/hooks/usePromiseResult';
import type { IDBCloudSyncItem } from '@onekeyhq/kit-bg/src/dbs/local/types';
import {
  usePrimeCloudSyncPersistAtom,
  usePrimeMasterPasswordPersistAtom,
} from '@onekeyhq/kit-bg/src/states/jotai/atoms';
import { EPrimeCloudSyncDataType } from '@onekeyhq/shared/src/consts/primeConsts';
import dateUtils from '@onekeyhq/shared/src/utils/dateUtils';
import uriUtils from '@onekeyhq/shared/src/utils/uriUtils';
import type { ICloudSyncRawDataJson } from '@onekeyhq/shared/types/prime/primeCloudSyncTypes';

type ITabType = 'local' | 'server';

function SizableText({
  children,
  ...props
}: { children: React.ReactNode } & ISizableTextProps) {
  return (
    <SizableTextBase size="$bodySm" color="$textSubdued" {...props}>
      {children}
    </SizableTextBase>
  );
}

function shortSortIndex(sortIndex: number | undefined) {
  if (typeof sortIndex !== 'number') {
    return sortIndex;
  }
  return sortIndex.toFixed(2);
}

function RawDataJsonView({
  rawDataJson,
}: {
  rawDataJson: ICloudSyncRawDataJson | undefined;
}) {
  if (!rawDataJson) {
    return null;
  }
  if (rawDataJson.dataType === EPrimeCloudSyncDataType.Wallet) {
    return (
      <SizableText>
        {[
          rawDataJson.payload.walletType,
          rawDataJson.payload.name,
          rawDataJson.payload.avatar?.img,
        ].join('>>')}
      </SizableText>
    );
  }
  if (rawDataJson.dataType === EPrimeCloudSyncDataType.IndexedAccount) {
    return (
      <SizableText>
        {[
          rawDataJson.payload.walletXfp,
          rawDataJson.payload.name,
          rawDataJson.payload.index,
        ].join('>>')}
      </SizableText>
    );
  }
  if (rawDataJson.dataType === EPrimeCloudSyncDataType.Account) {
    return (
      <SizableText>
        {[rawDataJson.payload.name, rawDataJson.payload.accountId].join('>>')}
      </SizableText>
    );
  }

  if (rawDataJson.dataType === EPrimeCloudSyncDataType.BrowserBookmark) {
    return (
      <SizableText>
        {[
          uriUtils.getHostNameFromUrl({ url: rawDataJson.payload.url }) ||
            rawDataJson.payload.url,
          shortSortIndex(rawDataJson.payload.sortIndex),
        ].join('>>')}
      </SizableText>
    );
  }

  if (rawDataJson.dataType === EPrimeCloudSyncDataType.AddressBook) {
    return (
      <SizableText>
        {[
          rawDataJson.payload.addressBookItem.networkId,
          rawDataJson.payload.addressBookItem.address,
        ].join('>>')}
      </SizableText>
    );
  }

  if (rawDataJson.dataType === EPrimeCloudSyncDataType.MarketWatchList) {
    return (
      <SizableText>
        {[
          rawDataJson.payload.coingeckoId,
          shortSortIndex(rawDataJson.payload.sortIndex),
        ].join('>>')}
      </SizableText>
    );
  }

  if (rawDataJson.dataType === EPrimeCloudSyncDataType.CustomNetwork) {
    return (
      <SizableText>
        {[
          rawDataJson.payload.customNetwork.chainId,
          rawDataJson.payload.customNetwork.name,
          rawDataJson.payload.customRpc.rpc,
        ].join('>>')}
      </SizableText>
    );
  }

  if (rawDataJson.dataType === EPrimeCloudSyncDataType.CustomRpc) {
    return (
      <SizableText>
        {[rawDataJson.payload.rpc, rawDataJson.payload.enabled.toString()].join(
          '>>',
        )}
      </SizableText>
    );
  }

  return <SizableText>{JSON.stringify(rawDataJson)}</SizableText>;
}

function SyncItemTable({ activeTab }: { activeTab: ITabType }) {
  const { copyText } = useClipboard();
  const [isLoading, setIsLoading] = useState(false);
  const [syncItems, setSyncItems] = useState<IDBCloudSyncItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedDataType, setSelectedDataType] = useState<
    EPrimeCloudSyncDataType | '$ALL'
  >('$ALL');

  const [includingServerDeleted, setIncludingServerDeleted] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let items: IDBCloudSyncItem[] = [];
      if (activeTab === 'local') {
        items =
          await backgroundApiProxy.servicePrimeCloudSync.decryptAllLocalSyncItems();
      } else {
        items =
          await backgroundApiProxy.servicePrimeCloudSync.decryptAllServerSyncItems(
            {
              includeDeleted: includingServerDeleted,
            },
          );
      }
      setSyncItems(items || []);
    } catch (err) {
      console.error('获取数据失败', err);
      setError(err instanceof Error ? err.message : '未知错误');
      setSyncItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, includingServerDeleted]);

  useEffect(() => {
    if (activeTab) {
      void fetchData();
    }
  }, [activeTab, fetchData]);

  const filteredItems = useMemo(() => {
    if (selectedDataType === '$ALL') return syncItems;
    return syncItems.filter((item) => item.dataType === selectedDataType);
  }, [syncItems, selectedDataType]);

  const columns = useMemo(
    () => [
      {
        title: 'key/dataType/data',
        dataIndex: 'id',
        columnWidth: 150,
        render: (text: string, record: IDBCloudSyncItem) => (
          <YStack>
            <SizableText style={{ fontWeight: 'bold' }} color="$textSuccess">
              {text.slice(0, 10)}...
            </SizableText>
            <SizableText style={{ fontWeight: 'bold' }} color="$textSubdued">
              {record.dataType}
            </SizableText>
            <SizableText color="$textSubdued">
              {record.data?.slice(0, 10)}...
            </SizableText>
          </YStack>
        ),
      },
      {
        title: '更新时间',
        dataIndex: 'dataTime',
        columnWidth: 300,
        render: (text: number, record: IDBCloudSyncItem) => (
          <YStack>
            <SizableText style={{ fontWeight: 'bold' }} color="$textSuccess">
              {dateUtils.formatDate(new Date(text), {
                formatTemplate: 'yyyy/LL/dd, HH:mm:ss',
              })}
            </SizableText>
            <SizableText color="$textSubdued">{record.rawKey}</SizableText>
            <SizableText color="$textSubdued">
              <RawDataJsonView rawDataJson={record.rawDataJson} />
            </SizableText>
          </YStack>
        ),
      },
    ],
    [],
  );

  return (
    <YStack p="$1" gap="$1">
      <XStack gap="$1" alignItems="center">
        <Select
          title="数据类型"
          value={selectedDataType}
          onChange={(value) =>
            setSelectedDataType(value as EPrimeCloudSyncDataType)
          }
          items={[
            { label: '全部', value: '$ALL' },
            { label: 'Lock', value: EPrimeCloudSyncDataType.Lock },
            { label: 'Wallet', value: EPrimeCloudSyncDataType.Wallet },
            {
              label: 'IndexedAccount',
              value: EPrimeCloudSyncDataType.IndexedAccount,
            },
            { label: 'Account', value: EPrimeCloudSyncDataType.Account },
            {
              label: 'BrowserBookmark',
              value: EPrimeCloudSyncDataType.BrowserBookmark,
            },
            {
              label: 'AddressBook',
              value: EPrimeCloudSyncDataType.AddressBook,
            },
            {
              label: 'MarketWatchList',
              value: EPrimeCloudSyncDataType.MarketWatchList,
            },
            {
              label: 'CustomNetwork',
              value: EPrimeCloudSyncDataType.CustomNetwork,
            },
            { label: 'CustomRpc', value: EPrimeCloudSyncDataType.CustomRpc },
            {
              label: 'CustomToken',
              value: EPrimeCloudSyncDataType.CustomToken,
            },
          ]}
        />
        <Stack flex={1} />
        <Button
          size="small"
          onPress={() => {
            // 复制 filteredItems
            const itemsStr = JSON.stringify(filteredItems, null, 2);
            copyText(itemsStr);
            Toast.success({
              title: `已复制 ${filteredItems.length} 条数据`,
            });
          }}
        >
          复制结果
        </Button>
      </XStack>
      <XStack gap="$1" alignItems="center">
        <SizableText>{filteredItems?.length}条</SizableText>
        <Stack flex={1} />
        {activeTab === 'server' ? (
          <Checkbox
            label="包含已删除数据"
            value={includingServerDeleted}
            onChange={(v: ICheckedState) =>
              setIncludingServerDeleted(v === true)
            }
          />
        ) : null}
        <Button loading={isLoading} size="small" onPress={fetchData}>
          刷新
        </Button>
      </XStack>
      {error ? <SizableText color="$textCritical">{error}</SizableText> : null}
      {!filteredItems?.length ? <SizableText>无数据</SizableText> : null}
      <Table
        columns={columns}
        dataSource={filteredItems}
        estimatedItemSize={40}
        keyExtractor={(item) => item.id}
        onRow={(record) => ({
          onPress: () => {
            console.log('row data', record);
            Dialog.debugMessage({
              debugMessage: record,
            });
          },
        })}
      />
    </YStack>
  );
}

function StatusPanel() {
  const [cloudSyncStatus] = usePrimeCloudSyncPersistAtom();
  const [localMasterPasswordInfo] = usePrimeMasterPasswordPersistAtom();

  const { result } = usePromiseResult(async () => {
    const serverUserInfo =
      await backgroundApiProxy.servicePrime.callApiFetchPrimeUserInfo();

    const { lock } =
      await backgroundApiProxy.servicePrimeCloudSync.apiFetchSyncLock();
    const serverLockItem =
      await backgroundApiProxy.servicePrimeCloudSync.decodeServerLockItem({
        lockItem: lock,
        serverUserInfo,
      });
    return {
      serverUserInfo,
      serverLockItem,
    };
  }, []);

  return (
    <YStack p="$4" gap="$2">
      <SizableText>网络和梯子正常 ✅</SizableText>
      <SizableText>服务器测试网络节点已启用 ✅</SizableText>
      <SizableText>锁屏密码已缓存 ✅</SizableText>
      <SizableText>OneKeyID 已登录 ✅</SizableText>
      <SizableText>Prime 已订阅未过期 ✅</SizableText>
      <SizableText>主密码已缓存 ✅</SizableText>
      <SizableText>
        云端同步已开启 {cloudSyncStatus.isCloudSyncEnabled ? '✅' : '❌'}
      </SizableText>
      <SizableText>系统时间正常 ✅</SizableText>
      <SizableText>
        localPwdHash: {localMasterPasswordInfo.masterPasswordUUID}
      </SizableText>
      <SizableText>
        serverPwdHash: {result?.serverUserInfo?.pwdHash}
      </SizableText>
      <SizableText>
        serverLockItem:{' '}
        {JSON.stringify({
          dataType: result?.serverLockItem?.dataType,
          key: `${result?.serverLockItem?.id?.slice(0, 10) || ''}...`,
          data: `${result?.serverLockItem?.data?.slice(0, 10) || ''}...`,
          payload: result?.serverLockItem?.rawDataJson?.payload ?? '--',
        })}
      </SizableText>
      <SizableText>
        localLockItem:{JSON.stringify(localMasterPasswordInfo)}
      </SizableText>
    </YStack>
  );
}

function DebugPanel() {
  return (
    <YStack p="$4" gap="$2">
      <Button
        mt="$4"
        onPress={() => {
          void backgroundApiProxy.servicePassword.promptPasswordVerify({});
        }}
      >
        激活锁屏密码
      </Button>
      <Stack h="$8" />
      <Button
        mt="$4"
        onPress={() => {
          void backgroundApiProxy.servicePrimeCloudSync.debugCopyDevice();
        }}
      >
        copyDevice
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.clearAllLocalSyncItems();
          Toast.success({
            title: 'success',
          });
        }}
      >
        清空本地同步数据
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.resetServerData({
            skipPrimeStatusCheck: true,
          });
          Toast.success({
            title: 'success',
          });
        }}
      >
        清空云端同步数据和密码
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.serviceMasterPassword.clearLocalMasterPassword();
          Toast.success({
            title: 'success',
          });
        }}
      >
        清空本地主密码
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.serviceMasterPassword.clearLocalMasterPassword(
            {
              skipDisableCloudSync: true,
            },
          );
          Toast.success({
            title: 'success',
          });
        }}
      >
        清空本地主密码，不关闭云同步
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.debugClearSyncItemPwdHash();
          Toast.success({
            title: 'success',
            message: '清理完成后，在另一个客户端上修改主密码，然后同步',
          });
        }}
      >
        清空本地数据的 pwdHash
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.servicePrimeCloudSync.debugTamperingSyncItemData();
          Toast.success({
            title: 'success',
          });
        }}
      >
        篡改本地数据 data
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.simpleDb.appStatus.setRawData({});
          const { password } =
            await backgroundApiProxy.servicePassword.promptPasswordVerify({});
          await backgroundApiProxy.serviceAccount.generateAllHDWalletMissingHashAndXfp(
            {
              password,
            },
          );
        }}
      >
        生成 HD 钱包 hash 和 xfp
      </Button>
      <Button
        onPress={async () => {
          await backgroundApiProxy.serviceAccount.clearAllWalletHashAndXfp();
          Toast.success({
            title: 'success',
          });
        }}
      >
        清除所有钱包 hash 和 xfp
      </Button>
    </YStack>
  );
}

export default function PagePrimeCloudSyncDebug() {
  const localItemsTable = useCallback(
    () => <SyncItemTable activeTab="local" />,
    [],
  );

  const serverItemsTable = useCallback(
    () => <SyncItemTable activeTab="server" />,
    [],
  );

  const statusPanel = useCallback(() => {
    return <StatusPanel />;
  }, []);

  const debugPanel = useCallback(() => {
    return <DebugPanel />;
  }, []);

  return (
    <Page scrollEnabled>
      <Page.Header title="云同步数据调试" />
      <Page.Body>
        <Stack>
          <Tab.Page
            data={[
              {
                title: '本地数据',
                page: localItemsTable,
              },
              {
                title: '云端数据',
                page: serverItemsTable,
              },
              {
                title: '状态信息',
                page: statusPanel,
              },
              {
                title: '调试面板',
                page: debugPanel,
              },
            ]}
            initialScrollIndex={0}
            onSelectedPageIndex={(index) => {
              //   console.log('index', index);
            }}
          />
        </Stack>
      </Page.Body>
    </Page>
  );
}
