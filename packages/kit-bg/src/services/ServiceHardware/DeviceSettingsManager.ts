import { ResourceType, type Success } from '@onekeyfe/hd-transport';
import { isNil } from 'lodash';

import type { IHardwareHomeScreenName } from '@onekeyhq/kit/src/views/AccountManagerStacks/pages/HardwareHomeScreen/hardwareHomeScreenData';
import { backgroundMethod } from '@onekeyhq/shared/src/background/backgroundDecorators';
import { FirmwareVersionTooLow } from '@onekeyhq/shared/src/errors';
import { convertDeviceResponse } from '@onekeyhq/shared/src/errors/utils/deviceErrorUtils';
import { CoreSDKLoader } from '@onekeyhq/shared/src/hardware/instance';
import deviceHomeScreenUtils from '@onekeyhq/shared/src/utils/deviceHomeScreenUtils';
import deviceUtils from '@onekeyhq/shared/src/utils/deviceUtils';

import localDb from '../../dbs/local/localDb';

import { ServiceHardwareManagerBase } from './ServiceHardwareManagerBase';

import type { IDBDeviceSettings as IDBDeviceDbSettings } from '../../dbs/local/types';
import type {
  DeviceSettingsParams,
  DeviceUploadResourceParams,
} from '@onekeyfe/hd-core';

export type ISetInputPinOnSoftwareParams = {
  walletId: string;
  inputPinOnSoftware: boolean;
};

export type ISetPassphraseEnabledParams = {
  walletId: string;
  passphraseEnabled: boolean;
};

export type IGetDeviceAdvanceSettingsParams = { walletId: string };
export type IGetDeviceLabelParams = { walletId: string };
export type ISetDeviceLabelParams = { walletId: string; label: string };
export type ISetDeviceHomeScreenParams = {
  // TODO use IHardwareHomeScreenData
  dbDeviceId: string;
  imgName: IHardwareHomeScreenName;
  imgHex: string;
  thumbnailHex: string;
  isUserUpload?: boolean;
};
export type IDeviceHomeScreenSizeInfo = {
  width: number;
  height: number;
  radius?: number;
};
export type IDeviceHomeScreenConfig = {
  names: string[];
  size?: IDeviceHomeScreenSizeInfo;
  thumbnailSize?: IDeviceHomeScreenSizeInfo;
};

export class DeviceSettingsManager extends ServiceHardwareManagerBase {
  @backgroundMethod()
  async changePin(connectId: string, remove = false): Promise<Success> {
    const hardwareSDK = await this.getSDKInstance();

    return convertDeviceResponse(() =>
      hardwareSDK?.deviceChangePin(connectId, {
        remove,
      }),
    );
  }

  @backgroundMethod()
  async applySettingsToDevice(
    connectId: string,
    settings: DeviceSettingsParams,
  ) {
    const hardwareSDK = await this.getSDKInstance();

    return convertDeviceResponse(() =>
      hardwareSDK?.deviceSettings(connectId, settings),
    );
  }

  @backgroundMethod()
  async getDeviceAdvanceSettings({
    walletId,
  }: IGetDeviceAdvanceSettingsParams): Promise<{
    passphraseEnabled: boolean;
    inputPinOnSoftware: boolean;
    inputPinOnSoftwareSupport: boolean;
  }> {
    const dbDevice = await localDb.getWalletDevice({ walletId });

    return this.backgroundApi.serviceHardwareUI.withHardwareProcessing(
      async () => {
        // touch or Pro should unlock device first, otherwise features?.passphrase_protection will return undefined
        await this.serviceHardware.unlockDevice({
          connectId: dbDevice.connectId,
        });

        const features = await this.serviceHardware.getFeaturesByWallet({
          walletId,
        });
        const supportFeatures =
          await this.serviceHardware.getDeviceSupportFeatures(
            dbDevice.connectId,
          );
        const inputPinOnSoftwareSupport = Boolean(
          supportFeatures?.inputPinOnSoftware?.support,
        );
        const passphraseEnabled = Boolean(features?.passphrase_protection);
        const inputPinOnSoftware = Boolean(
          dbDevice?.settings?.inputPinOnSoftware,
        );
        return {
          passphraseEnabled,
          inputPinOnSoftware,
          inputPinOnSoftwareSupport,
        };
      },
      {
        deviceParams: {
          dbDevice,
        },
        hideCheckingDeviceLoading: true,
        debugMethodName: 'deviceSettings.getDeviceSupportFeatures',
      },
    );
  }

  @backgroundMethod()
  async getDeviceLabel({ walletId }: IGetDeviceLabelParams) {
    const device = await localDb.getWalletDevice({ walletId });
    const features =
      await this.backgroundApi.serviceHardware.getFeaturesWithoutCache({
        connectId: device.connectId,
      });
    const label = await deviceUtils.buildDeviceLabel({
      features,
    });
    return label || 'Unknown';
  }

  @backgroundMethod()
  async setDeviceLabel({ walletId, label }: ISetDeviceLabelParams) {
    const device = await localDb.getWalletDevice({ walletId });
    return this.backgroundApi.serviceHardwareUI.withHardwareProcessing(
      () =>
        this.applySettingsToDevice(device.connectId, {
          label,
        }),
      {
        deviceParams: {
          dbDevice: device,
        },
        debugMethodName: 'deviceSettings.applySettingsToDevice',
      },
    );
  }

  @backgroundMethod()
  async setDeviceHomeScreen({
    dbDeviceId,
    imgHex,
    thumbnailHex,
    isUserUpload,
    imgName,
  }: ISetDeviceHomeScreenParams) {
    const device = await localDb.getDevice(dbDeviceId);

    return this.backgroundApi.serviceHardwareUI.withHardwareProcessing(
      async () => {
        const isMonochrome = deviceHomeScreenUtils.isMonochromeScreen(
          device.deviceType,
        );
        // pro touch upload image
        if (isUserUpload && !isMonochrome) {
          const hardwareSDK = await this.getSDKInstance();
          const uploadResParams: DeviceUploadResourceParams = {
            resType: ResourceType.WallPaper,
            suffix: 'jpeg',
            dataHex: imgHex,
            thumbnailDataHex: thumbnailHex,
            nftMetaData: '',
          };
          // upload wallpaper resource will automatically set the home screen
          await convertDeviceResponse(() =>
            hardwareSDK.deviceUploadResource(device.connectId, uploadResParams),
          );
        } else {
          const { getHomeScreenHex } = await CoreSDKLoader();
          const deviceType = device.deviceType;
          const internalHex = getHomeScreenHex(deviceType, imgName);
          // eslint-disable-next-line no-param-reassign
          imgHex = imgHex || internalHex;
          if (imgName === 'blank') {
            // eslint-disable-next-line no-param-reassign
            imgHex = '';
          }
          if (!imgHex) {
            // empty string will clear the home screen(classic,mini)
            // throw new Error('Invalid home screen hex');
          }
          await this.applySettingsToDevice(device.connectId, {
            homescreen: imgHex,
          });
        }
      },
      {
        deviceParams: {
          dbDevice: device,
        },
        debugMethodName: 'deviceSettings.applySettingsToDevice',
      },
    );
  }

  @backgroundMethod()
  async setPassphraseEnabled({
    walletId,
    passphraseEnabled,
  }: ISetPassphraseEnabledParams) {
    const device = await localDb.getWalletDevice({ walletId });
    return this.backgroundApi.serviceHardwareUI.withHardwareProcessing(
      () =>
        this.applySettingsToDevice(device.connectId, {
          usePassphrase: passphraseEnabled,
        }),
      {
        deviceParams: {
          dbDevice: device,
        },
        debugMethodName: 'deviceSettings.applySettingsToDevice',
      },
    );
  }

  @backgroundMethod()
  async setInputPinOnSoftware({
    walletId,
    inputPinOnSoftware,
  }: ISetInputPinOnSoftwareParams) {
    const device = await localDb.getWalletDevice({ walletId });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: dbDeviceId, deviceId, connectId } = device;

    let minSupportVersion: string | undefined = '';
    let inputPinOnSoftwareSupport: boolean | undefined;

    // If open PIN input on the App
    // Check whether the hardware supports it
    if (inputPinOnSoftware && !device.settings?.inputPinOnSoftwareSupport) {
      const supportFeatures =
        await this.serviceHardware.getDeviceSupportFeatures(connectId);

      if (!supportFeatures?.inputPinOnSoftware?.support) {
        // eslint-disable-next-line no-param-reassign
        inputPinOnSoftware = false;
        minSupportVersion = supportFeatures?.inputPinOnSoftware?.require;
        inputPinOnSoftwareSupport = false;
      } else {
        inputPinOnSoftwareSupport = true;
      }
    }

    const settings: IDBDeviceDbSettings = {
      ...device.settings,
      inputPinOnSoftware,
    };
    if (!isNil(inputPinOnSoftwareSupport)) {
      settings.inputPinOnSoftwareSupport = inputPinOnSoftwareSupport;
    }

    await localDb.updateDeviceDbSettings({
      dbDeviceId,
      settings,
    });

    if (minSupportVersion) {
      const error = new FirmwareVersionTooLow({
        payload: undefined as any,
        info: {
          0: minSupportVersion,
        },
      });
      // error.payload?.code
      throw error;
    }
  }
}
