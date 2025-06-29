import { useCallback, useRef, useState } from 'react';

import { useRoute } from '@react-navigation/core';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { useIntl } from 'react-intl';
import { StyleSheet } from 'react-native';

import {
  Button,
  Icon,
  Page,
  SizableText,
  Stack,
  TextArea,
  Toast,
  XStack,
  YStack,
} from '@onekeyhq/components';
import HeaderIconButton from '@onekeyhq/components/src/layouts/Navigation/Header/HeaderIconButton';
import type { IKeyOfIcons } from '@onekeyhq/components/src/primitives';
import appGlobals from '@onekeyhq/shared/src/appGlobals';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { defaultLogger } from '@onekeyhq/shared/src/logger/logger';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import type {
  EScanQrCodeModalPages,
  IScanQrCodeModalParamList,
} from '@onekeyhq/shared/src/routes';
import appStorage from '@onekeyhq/shared/src/storage/appStorage';
import { EAppSyncStorageKeys } from '@onekeyhq/shared/src/storage/syncStorage';

import useAppNavigation from '../../../hooks/useAppNavigation';
import { ScanQrCode } from '../components';
import { scanFromURLAsync } from '../utils/scanFromURLAsync';

import type { RouteProp } from '@react-navigation/core';

appGlobals.$$scanNavigation = undefined;
function DebugInput({ onText }: { onText: (text: string) => void }) {
  const navigation = useAppNavigation();
  appGlobals.$$scanNavigation = navigation;

  const [inputText, setInputText] = useState<string>(
    appStorage.syncStorage.getString(
      EAppSyncStorageKeys.last_scan_qr_code_text,
    ) || '',
  );
  const [visible, setVisible] = useState(false);

  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  if (visible) {
    return (
      <XStack>
        <Stack flex={1}>
          <TextArea
            value={inputText}
            onChangeText={setInputText}
            flex={1}
            placeholder="demo qrcode scan text"
          />
        </Stack>
        <Button onPress={() => onText(inputText)} size="small">
          Confirm
        </Button>
        <Button onPress={() => navigation.popStack()} size="small">
          Close
        </Button>
      </XStack>
    );
  }
  return (
    <XStack
      onPress={() => setVisible(true)}
      w="$8"
      h="$8"
      backgroundColor="transparent"
    />
  );
}

function ScanQrCodeModalFooter({
  qrWalletScene,
  showProTutorial,
}: {
  qrWalletScene?: boolean;
  showProTutorial?: boolean;
}) {
  const intl = useIntl();

  const FOOTER_NORMAL_ITEM_LIST: { title: string; icon: IKeyOfIcons }[] = [
    {
      icon: 'Copy3Outline',
      title: intl.formatMessage({
        id: ETranslations.scan_scan_address_codes_to_copy_address,
      }),
    },
    {
      icon: 'WalletconnectBrand',
      title: intl.formatMessage({
        id: ETranslations.scan_scan_walletconnect_code_to_connect_to_sites,
      }),
    },
  ];

  const FOOTER_TUTORIAL_ITEM_LIST: { title: string; icon: IKeyOfIcons }[] = [
    {
      icon: 'QrCodeOutline',
      title: intl.formatMessage({ id: ETranslations.scan_show_qr_code_steps }),
    },
  ];

  const FOOTER_SECURITY_ITEM_LIST: { title: string; icon: IKeyOfIcons }[] = [
    {
      icon: 'CameraExposureZoomInOutline',
      title: intl.formatMessage({
        id: ETranslations.scan_move_closer_if_scan_fails,
      }),
    },
    ...(platformEnv.isNativeAndroid
      ? []
      : ([
          {
            icon: 'ShieldCheckDoneOutline',
            title: intl.formatMessage({
              id: ETranslations.scan_screen_blurred_for_security,
            }),
          },
        ] as { title: string; icon: IKeyOfIcons }[])),
  ];

  const data = qrWalletScene
    ? [
        ...(showProTutorial ? FOOTER_TUTORIAL_ITEM_LIST : []),
        ...FOOTER_SECURITY_ITEM_LIST,
      ]
    : FOOTER_NORMAL_ITEM_LIST;

  return (
    <Stack
      w="100%"
      mx="auto"
      flex={1}
      $gtMd={{
        maxWidth: '$80',
      }}
      p="$5"
    >
      {data.map((item, index) => (
        <XStack
          key={index}
          {...(index !== 0
            ? {
                pt: '$4',
              }
            : null)}
        >
          <Stack
            $md={{
              pt: '$0.5',
            }}
          >
            <Icon name={item.icon} size="$5" color="$iconSubdued" />
          </Stack>
          <SizableText
            flex={1}
            pl="$4"
            size="$bodyLg"
            color="$textSubdued"
            $gtMd={{
              size: '$bodyMd',
            }}
          >
            {item.title}
          </SizableText>
        </XStack>
      ))}
    </Stack>
  );
}

export default function ScanQrCodeModal() {
  const intl = useIntl();
  const route =
    useRoute<
      RouteProp<
        IScanQrCodeModalParamList,
        EScanQrCodeModalPages.ScanQrCodeStack
      >
    >();
  const {
    callback: routeCallback,
    qrWalletScene,
    showProTutorial,
  } = route.params;

  const callback = useCallback(
    async ({
      value,
      popNavigation,
    }: {
      value: string;
      popNavigation: () => void;
    }) => {
      if (process.env.NODE_ENV !== 'production') {
        if (value) {
          appStorage.syncStorage.set(
            EAppSyncStorageKeys.last_scan_qr_code_text,
            value,
          );
        }
      }
      return routeCallback({ value, popNavigation });
    },
    [routeCallback],
  );

  const navigation = useAppNavigation();

  const popNavigation = useCallback(() => {
    navigation.pop();
  }, [navigation]);

  const isPickedImage = useRef(false);

  const pickImage = useCallback(async () => {
    const result = await launchImageLibraryAsync({
      base64: !platformEnv.isNative,
      allowsMultipleSelection: false,
    });

    if (!result.canceled) {
      const uri = result?.assets?.[0]?.uri;
      let data: string | null = null;
      try {
        data = await scanFromURLAsync(uri);
      } catch {
        data = null;
      }
      if (data && data.length > 0) {
        isPickedImage.current = true;
        await callback({ value: data, popNavigation });
      } else {
        Toast.error({
          title: intl.formatMessage({
            id: ETranslations.scan_no_recognizable_qr_code_found,
          }),
        });
      }
      defaultLogger.scanQrCode.readQrCode.readFromLibrary(
        JSON.stringify(result),
        data,
      );
    }
  }, [callback, intl, popNavigation]);

  const onCameraScanned = useCallback(
    async (value: string) => {
      if (isPickedImage.current) {
        return {};
      }
      defaultLogger.scanQrCode.readQrCode.readFromCamera(value);
      return callback({ value, popNavigation });
    },
    [callback, popNavigation],
  );

  const headerRightCall = useCallback(
    () =>
      qrWalletScene ? null : (
        <HeaderIconButton
          onPress={pickImage}
          icon="ImageSquareMountainOutline"
          testID="scan-open-photo"
          title={intl.formatMessage({ id: ETranslations.scan_select_a_photo })}
        />
      ),
    [intl, pickImage, qrWalletScene],
  );

  return (
    <Page safeAreaEnabled={false}>
      <Page.Header
        title={intl.formatMessage({ id: ETranslations.scan_scan_qr_code })}
        headerRight={headerRightCall}
      />
      <Page.Body $gtMd={{ jc: 'center' }}>
        <Stack
          w="100%"
          mx="auto"
          $gtMd={{
            maxWidth: '$80',
          }}
        >
          <Stack w="100%" pb="100%">
            <YStack fullscreen p="$5">
              <Stack
                w="100%"
                h="100%"
                borderRadius="$6"
                $gtMd={{
                  borderRadius: '$3',
                }}
                borderCurve="continuous"
                overflow="hidden"
                borderWidth={StyleSheet.hairlineWidth}
                borderColor="$borderSubdued"
                // the filter property used for overflow-hidden work on web
                style={{
                  filter: 'blur(0px)',
                }}
              >
                <ScanQrCode
                  handleBarCodeScanned={onCameraScanned}
                  qrWalletScene={qrWalletScene}
                />
              </Stack>
            </YStack>
          </Stack>
        </Stack>
        <ScanQrCodeModalFooter
          qrWalletScene={qrWalletScene}
          showProTutorial={showProTutorial}
        />
      </Page.Body>
      {platformEnv.isDev ? (
        <Page.Footer>
          <DebugInput onText={(value) => callback({ value, popNavigation })} />
        </Page.Footer>
      ) : null}
    </Page>
  );
}
