/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable react/no-unstable-nested-components */

import { EDeviceType } from '@onekeyfe/hd-shared';

import { Button, Dialog, SizableText, Stack } from '@onekeyhq/components';
import {
  ConfirmOnDeviceToast,
  confirmByPin,
  confirmOnDeviceToastSample,
  confirmPassphrase,
  confirmPhrase,
  confirmPhraseOnDevice,
  confirmPinOnDevice,
} from '@onekeyhq/kit/src/components/Hardware';
import type { IHardwareUiPayload } from '@onekeyhq/kit-bg/src/states/jotai/atoms';
import {
  EHardwareUiStateAction,
  hardwareUiStateAtom,
  hardwareUiStateCompletedAtom,
} from '@onekeyhq/kit-bg/src/states/jotai/atoms';
import deviceHomeScreenUtils from '@onekeyhq/shared/src/utils/deviceHomeScreenUtils';
import { EOneKeyDeviceMode } from '@onekeyhq/shared/types/device';

import { Layout } from './utils/Layout';

import type { IDeviceType } from '@onekeyfe/hd-core';
// https://i.mij.rip/2024/09/19/b0cdcbdb45494fe53b831fff02981fdb.jpeg

const HardwareActionTest = () => {
  const generateAction = async (
    uiRequestType: EHardwareUiStateAction,
    options?: {
      deviceType?: IDeviceType;
      payload?: any;
    },
  ) => {
    const { deviceType, payload } = options || {};
    const usedPayload: IHardwareUiPayload = {
      uiRequestType,
      eventType: '',
      deviceType: deviceType ?? EDeviceType.Pro,
      deviceId: '123',
      connectId: '123',
      deviceMode: EOneKeyDeviceMode.normal,
      isBootloaderMode: false,
      passphraseState: undefined,
      rawPayload: undefined,
    };

    if (uiRequestType === EHardwareUiStateAction.FIRMWARE_TIP) {
      usedPayload.firmwareTipData = payload;
    }
    if (uiRequestType === EHardwareUiStateAction.FIRMWARE_PROGRESS) {
      usedPayload.firmwareProgress = payload;
    }

    if (
      ![
        // skip events
        EHardwareUiStateAction.CLOSE_UI_WINDOW,
        EHardwareUiStateAction.PREVIOUS_ADDRESS,
      ].includes(uiRequestType)
    ) {
      // show hardware ui dialog
      await hardwareUiStateAtom.set({
        action: uiRequestType,
        connectId: '123',
        payload: usedPayload,
      });
    }
    await hardwareUiStateCompletedAtom.set({
      action: uiRequestType,
      connectId: '123',
      payload: usedPayload,
    });
  };

  return (
    <Stack gap="$6">
      <Stack gap="$2">
        <SizableText textAlign="left" size="$bodySmMedium" color="$text">
          事件：Confirm =》Confirm =》Pin =》Pin =》Confirm =》Confirm =》Pin
          =》Confirm
        </SizableText>
        <SizableText textAlign="left" size="$bodySmMedium" color="$text">
          实际：Confirm =》Pin =》Confirm =》Pin =》Confirm
        </SizableText>
        <Button
          onPress={async () => {
            await generateAction(EHardwareUiStateAction.REQUEST_BUTTON);
            await generateAction(EHardwareUiStateAction.FIRMWARE_TIP, {
              payload: {
                message: 'ConfirmOnDevice',
              },
            });
            await generateAction(EHardwareUiStateAction.REQUEST_PIN);
            await generateAction(EHardwareUiStateAction.REQUEST_PIN);
            await generateAction(EHardwareUiStateAction.REQUEST_BUTTON);
            await generateAction(EHardwareUiStateAction.REQUEST_BUTTON);
            await generateAction(EHardwareUiStateAction.REQUEST_PIN);
            await generateAction(EHardwareUiStateAction.REQUEST_BUTTON);
          }}
        >
          Test Hardware Action Dialog (Test 1)
        </Button>
      </Stack>

      <Stack gap="$2">
        <SizableText textAlign="left" size="$bodySmMedium" color="$text">
          事件：Pin =》Pin On Device
        </SizableText>
        <Button
          onPress={async () => {
            await generateAction(EHardwareUiStateAction.REQUEST_PIN);
            await generateAction(EHardwareUiStateAction.EnterPinOnDevice);
            await generateAction(EHardwareUiStateAction.REQUEST_BUTTON);

            // await generateAction(EHardwareUiStateAction.REQUEST_PIN);
            // await generateAction(EHardwareUiStateAction.REQUEST_PASSPHRASE);
            // await generateAction(EHardwareUiStateAction.EnterPinOnDevice);
            // await generateAction(
            //   EHardwareUiStateAction.REQUEST_PASSPHRASE_ON_DEVICE,
            // );
            // await generateAction(EHardwareUiStateAction.REQUEST_PIN);
            // await generateAction(EHardwareUiStateAction.REQUEST_PASSPHRASE);
          }}
        >
          Test Hardware Action Dialog (Test 2)
        </Button>
      </Stack>

      <Stack gap="$2">
        <SizableText textAlign="left" size="$bodySmMedium" color="$text">
          事件：Confirm =》Confirm Classic =》FIRMWARE_PROGRESS
          =》FIRMWARE_PROGRESS
        </SizableText>
        <SizableText textAlign="left" size="$bodySmMedium" color="$text">
          实际：Confirm =》Confirm Classic
        </SizableText>
        <Button
          onPress={async () => {
            await generateAction(EHardwareUiStateAction.REQUEST_BUTTON);

            await generateAction(EHardwareUiStateAction.FIRMWARE_TIP, {
              payload: {
                message: 'ConfirmOnDevice',
              },
              deviceType: EDeviceType.Classic,
            });

            await generateAction(EHardwareUiStateAction.FIRMWARE_PROGRESS);
            await generateAction(EHardwareUiStateAction.FIRMWARE_PROGRESS);
          }}
        >
          Test Hardware Action Toast (Count 3)
        </Button>
      </Stack>

      <Stack gap="$2">
        <SizableText textAlign="left" size="$bodySmMedium" color="$text">
          事件：Confirm =》Confirm Classic =》FIRMWARE_PROGRESS
          =》FIRMWARE_PROGRESS
        </SizableText>
        <SizableText textAlign="left" size="$bodySmMedium" color="$text">
          实际：Confirm =》Confirm Classic
        </SizableText>
        <Button
          onPress={async () => {
            await generateAction(EHardwareUiStateAction.FIRMWARE_PROGRESS, {
              payload: 100,
            });
            await generateAction(EHardwareUiStateAction.REQUEST_BUTTON);
            await generateAction(EHardwareUiStateAction.REQUEST_BUTTON);

            await generateAction(EHardwareUiStateAction.FIRMWARE_TIP, {
              payload: {
                message: 'ConfirmOnDevice',
              },
              deviceType: EDeviceType.Pro,
            });
            await generateAction(EHardwareUiStateAction.FIRMWARE_TIP, {
              payload: {
                message: '"InstallingFirmware"',
              },
              deviceType: EDeviceType.Pro,
            });
          }}
        >
          Install Firmware Event (Test 1)
        </Button>
      </Stack>
    </Stack>
  );
};

const HardwareGallery = () => (
  <Layout
    componentName="Hardware"
    elements={[
      {
        title: 'Interactive with hardware wallet',
        element: () => (
          <Stack gap="$4">
            <Button
              onPress={() => {
                void confirmOnDeviceToastSample();
              }}
            >
              Confirm On Device (Toast)
            </Button>

            <Button
              onPress={() => {
                void ConfirmOnDeviceToast({ deviceType: EDeviceType.Classic });
              }}
            >
              Confirm On Classic (Toast)
            </Button>

            <Button
              onPress={() => {
                void ConfirmOnDeviceToast({ deviceType: EDeviceType.Touch });
              }}
            >
              Confirm On Touch (Toast)
            </Button>

            <Button
              onPress={() => {
                void confirmPinOnDevice();
              }}
            >
              Enter PIN on Device
            </Button>
            <Button
              onPress={() => {
                void confirmByPin();
              }}
            >
              Enter PIN
            </Button>

            <Button
              onPress={() => {
                void confirmPhraseOnDevice();
              }}
            >
              Enter Passphrase on Device
            </Button>
            <Button
              onPress={() => {
                void confirmPhrase();
              }}
            >
              Enter Passphrase
            </Button>

            <Button
              onPress={() => {
                void confirmPassphrase();
              }}
            >
              Confirm Passphrase
            </Button>
            <HardwareActionTest />
            <Button
              onPress={() =>
                Dialog.show({
                  title: 'Test Hardware Action',
                  renderContent: <HardwareActionTest />,
                })
              }
            >
              Test Hardware Action Dialog & Toast from Dialog
            </Button>
            <Button
              onPress={async () => {
                const hex = await deviceHomeScreenUtils.imagePathToHex(
                  'https://i.mij.rip/2024/09/19/b0cdcbdb45494fe53b831fff02981fdb.jpeg',
                  EDeviceType.Classic,
                );
                console.log(hex);
              }}
            >
              Test HomeScreen imagePathToHex
            </Button>
          </Stack>
        ),
      },
    ]}
  />
);

export default HardwareGallery;
