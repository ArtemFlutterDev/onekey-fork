import type { ILocaleSymbol } from '@onekeyhq/shared/src/locale';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import { generateUUID } from '@onekeyhq/shared/src/utils/miscUtils';
import { EHardwareTransportType, EOnekeyDomain } from '@onekeyhq/shared/types';
import { EAlignPrimaryAccountMode } from '@onekeyhq/shared/types/dappConnection';
import { swapSlippageAutoValue } from '@onekeyhq/shared/types/swap/SwapProvider.constants';
import { ESwapSlippageSegmentKey } from '@onekeyhq/shared/types/swap/types';

import { EAtomNames } from '../atomNames';
import { globalAtom } from '../utils';

export type IEndpointType = 'prod' | 'test';

export type ISettingsPersistAtom = {
  theme: 'light' | 'dark' | 'system';
  lastLocale: ILocaleSymbol;
  locale: ILocaleSymbol;
  version: string;
  buildNumber?: string;
  reviewControl?: boolean;
  instanceId: string;
  instanceIdBackup?: {
    v4MigratedInstanceId: string | undefined;
    v5InitializedInstanceId: string | undefined;
  };
  sensitiveEncodeKey: string;
  isBiologyAuthSwitchOn: boolean;
  protectCreateTransaction: boolean;
  protectCreateOrRemoveWallet: boolean;
  tokenRiskReminder: boolean;
  transferAllowList: boolean;
  spendDustUTXO: boolean;
  inscriptionProtection: boolean;
  isFirstTimeSwap: boolean;
  swapBatchApproveAndSwap: boolean;

  hardwareConnectSrc: EOnekeyDomain;
  currencyInfo: {
    symbol: string;
    id: string;
  };
  alignPrimaryAccountMode?: EAlignPrimaryAccountMode;
  isCustomNonceEnabled: boolean;
  isCustomTxMessageEnabled: boolean;
  isFloatingIconAlwaysDisplay: boolean;
  isFilterScamHistoryEnabled: boolean;
  hardwareTransportType?: EHardwareTransportType;

  hiddenWalletImmediately: boolean;
};

export const settingsAtomInitialValue: ISettingsPersistAtom = {
  theme: 'system',
  lastLocale: 'system',
  locale: 'system',
  version: process.env.VERSION ?? '1.0.0',
  buildNumber: process.env.BUILD_NUMBER ?? '2022010100',
  instanceId: generateUUID(),
  sensitiveEncodeKey: generateUUID(),
  isBiologyAuthSwitchOn: true,
  protectCreateTransaction: false,
  protectCreateOrRemoveWallet: false,
  tokenRiskReminder: true,
  transferAllowList: false,
  spendDustUTXO: false,
  inscriptionProtection: true,
  isFirstTimeSwap: true,
  swapBatchApproveAndSwap: true,
  hardwareConnectSrc: EOnekeyDomain.ONEKEY_SO,
  currencyInfo: {
    id: 'usd',
    symbol: '$',
  },
  alignPrimaryAccountMode: EAlignPrimaryAccountMode.AlignDappToWallet,
  isCustomNonceEnabled: false,
  isCustomTxMessageEnabled: false,
  isFloatingIconAlwaysDisplay: false,
  isFilterScamHistoryEnabled: false,
  hardwareTransportType: platformEnv.isNative
    ? EHardwareTransportType.BLE
    : EHardwareTransportType.Bridge,
  hiddenWalletImmediately: true,
};
export const { target: settingsPersistAtom, use: useSettingsPersistAtom } =
  globalAtom<ISettingsPersistAtom>({
    persist: true,
    name: EAtomNames.settingsPersistAtom,
    initialValue: settingsAtomInitialValue,
  });

type ISettingsLastActivityPersistAtom = {
  time: number;
};

export const {
  target: settingsLastActivityAtom,
  use: useSettingsLastActivityAtom,
} = globalAtom<ISettingsLastActivityPersistAtom>({
  name: EAtomNames.settingsLastActivityAtom,
  initialValue: {
    time: Date.now(),
  },
});

type ISettingsAtom = {
  swapToAnotherAccountSwitchOn: boolean;
  swapSlippagePercentageMode: ESwapSlippageSegmentKey;
  swapSlippagePercentageCustomValue: number;
  swapEnableRecipientAddress: boolean;
};

export const { target: settingsAtom, use: useSettingsAtom } =
  globalAtom<ISettingsAtom>({
    name: EAtomNames.settingsAtom,
    initialValue: {
      swapToAnotherAccountSwitchOn: false,
      swapSlippagePercentageMode: ESwapSlippageSegmentKey.AUTO,
      swapSlippagePercentageCustomValue: swapSlippageAutoValue,
      swapEnableRecipientAddress: false,
    },
  });

export type ISettingsValuePersistAtom = {
  hideValue: boolean;
};

export const {
  target: settingsValuePersistAtom,
  use: useSettingsValuePersistAtom,
} = globalAtom<ISettingsValuePersistAtom>({
  persist: true,
  name: EAtomNames.settingsValuePersistAtom,
  initialValue: {
    hideValue: false,
  },
});

// extract high frequency refresh data to another atom
