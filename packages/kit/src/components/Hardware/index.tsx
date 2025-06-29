import { EDeviceType } from '@onekeyfe/hd-shared';

import { Dialog, Toast } from '@onekeyhq/components';
import timerUtils from '@onekeyhq/shared/src/utils/timerUtils';

import {
  ConfirmOnDeviceToastContent,
  ConfirmPassphrase,
  EnterPassphraseOnDevice,
  EnterPhase,
  EnterPin,
  EnterPinOnDevice,
} from './Hardware';

import type { IConfirmOnDeviceToastContentProps } from './Hardware';

const mockListenDeviceResult = () => {
  const actions: (() => void | undefined)[] = [];
  return {
    run: () =>
      new Promise<void>((resolve, reject) => {
        actions[0] = resolve;
        actions[1] = reject;
      }),
    confirm: () => {
      actions?.[0]();
    },
    cancel: () => {
      actions?.[1]();
    },
  };
};

export const ConfirmOnDeviceToast = async ({
  deviceType,
}: IConfirmOnDeviceToastContentProps) => {
  const event = mockListenDeviceResult();
  const toast = Toast.show({
    dismissOnOverlayPress: false,
    disableSwipeGesture: false,
    children: <ConfirmOnDeviceToastContent deviceType={deviceType} />,
    onClose: (extra) => {
      console.log('close flag:', extra?.flag);
      console.log('close ConfirmOnDeviceToastContent');
    },
  });
  setTimeout(async () => {
    event.confirm();
    await toast.close({ flag: 'ConfirmOnDeviceToastContent closeFlag' });
  }, 3500);
  await event.run();
};

export const confirmOnDeviceToastSample = async () => {
  const event = mockListenDeviceResult();

  const toast = Toast.show({
    children: <ConfirmOnDeviceToastContent deviceType={EDeviceType.Pro} />,
    dismissOnOverlayPress: false,
    disableSwipeGesture: false,
    onClose: async () => {
      console.log('close ConfirmOnDeviceToastContent');
    },
  });

  setTimeout(async () => {
    event.confirm();
    await toast.close();
  }, timerUtils.getTimeDurationMs({ seconds: 35 }));
  await event.run();
};

export const confirmPinOnDevice = async () => {
  const event = mockListenDeviceResult();
  const dialog = Dialog.show({
    title: 'Enter PIN on Device',
    showFooter: false,
    dismissOnOverlayPress: false,
    renderContent: <EnterPinOnDevice deviceType={EDeviceType.Pro} />,
    onClose: () => {
      console.log('close confirmPinOnDevice');
      event.cancel();
    },
  });
  setTimeout(async () => {
    event.confirm();
    await dialog.close();
  }, 3500);
  await event.run();
};

export const confirmByPin = async () => {
  const event = mockListenDeviceResult();
  const dialog = Dialog.show({
    title: 'Enter PIN',
    description: 'Check device screen for keypad layout.',
    showFooter: false,
    dismissOnOverlayPress: false,
    renderContent: (
      <EnterPin
        onConfirm={async () => {
          event.confirm();
          await dialog.close();
        }}
        switchOnDevice={async () => {
          await dialog.close();
          await confirmPinOnDevice();
        }}
      />
    ),
    onClose: () => {
      console.log('close confirmByPin');
      event.cancel();
    },
  });
  await event.run();
};

export const confirmPhraseOnDevice = async () => {
  const event = mockListenDeviceResult();
  Dialog.show({
    title: 'Enter Passphrase on Device',
    showFooter: false,
    dismissOnOverlayPress: false,
    renderContent: <EnterPassphraseOnDevice deviceType={EDeviceType.Pro} />,
    onClose: () => {
      console.log('close EnterPassphraseOnDevice');
      event.cancel();
    },
  });
  await event.run();
};

export const confirmPhrase = async () => {
  const event = mockListenDeviceResult();
  const dialog = Dialog.show({
    title: 'Enter Passphrase',
    showFooter: false,
    dismissOnOverlayPress: false,
    renderContent: (
      <EnterPhase
        onConfirm={async () => {
          event.confirm();
          await dialog.close();
        }}
        switchOnDevice={async () => {
          await dialog.close();
          await confirmPhraseOnDevice();
        }}
      />
    ),
    onClose: () => {
      console.log('close EnterPhase');
      event.cancel();
    },
  });
  await event.run();
};

export const confirmPassphrase = async () => {
  const event = mockListenDeviceResult();
  const dialog = Dialog.show({
    title: 'Confirm Passphrase',
    showFooter: false,
    dismissOnOverlayPress: false,
    renderContent: (
      <ConfirmPassphrase
        onConfirm={async () => {
          event.confirm();
          await dialog.close();
        }}
        switchOnDevice={async () => {
          await dialog.close();
          await confirmPhraseOnDevice();
        }}
      />
    ),
    onClose: () => {
      console.log('close ConfirmPassphrase');
      event.cancel();
    },
  });
  await event.run();
};
