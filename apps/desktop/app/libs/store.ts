import { safeStorage } from 'electron';
import logger from 'electron-log/main';
import Store from 'electron-store';

import type { ILocaleSymbol } from '@onekeyhq/shared/src/locale';

const store = new Store({ name: 'OneKey' });

export type ILocalStore = {
  getUpdateSettings(): IUpdateSettings;
  setUpdateSettings(updateSettings: IUpdateSettings): void;
  clear(): void;
};

export type IUpdateSettings = {
  useTestFeedUrl: boolean;
};

const configKeys = {
  WinBounds: 'winBounds',
  UpdateSettings: 'updateSettings',
  DevTools: 'devTools',
  Theme: 'theme',
  EncryptedData: 'EncryptedData',
  Language: 'language',
  DisableKeyboardShortcuts: 'disableKeyboardShortcuts',
  ASCFile: 'ascFile',
  UpdateBuildNumber: 'updateBuildNumber',
};

export const clear = () => {
  store.clear();
};

export const getUpdateSettings = (): IUpdateSettings =>
  store.get(configKeys.UpdateSettings, {
    useTestFeedUrl: false,
  }) as IUpdateSettings;

export const setUpdateSettings = (updateSettings: IUpdateSettings): void => {
  store.set(configKeys.UpdateSettings, updateSettings);
};

export const getDevTools = () => store.get(configKeys.DevTools, false);

export const setDevTools = (devTools: boolean) => {
  store.set(configKeys.DevTools, devTools);
};

export const getDisableKeyboardShortcuts = () =>
  store.get(configKeys.DisableKeyboardShortcuts, {
    disableAllShortcuts: false,
  }) as {
    disableAllShortcuts: boolean;
  };

export const setDisableKeyboardShortcuts = (config: {
  disableAllShortcuts: boolean;
}) => {
  store.set(configKeys.DisableKeyboardShortcuts, {
    ...getDisableKeyboardShortcuts(),
    ...config,
  });
};

export const getTheme = () => store.get(configKeys.Theme, 'system') as string;

export const setTheme = (theme: string) => store.set(configKeys.Theme, theme);

export const getLanguage = () =>
  store.get(configKeys.Language, 'system') as ILocaleSymbol;

export const setLanguage = (lang: string) =>
  store.set(configKeys.Language, lang);

export const getWinBounds = (): Electron.Rectangle =>
  store.get(configKeys.WinBounds, {}) as Electron.Rectangle;
export const setWinBounds = (bounds: Electron.Rectangle) =>
  store.set(configKeys.WinBounds, bounds);

export const clearUpdateSettings = () => {
  store.delete(configKeys.UpdateSettings);
};

export const getSecureItem = (key: string) => {
  const available = safeStorage.isEncryptionAvailable();
  if (!available) {
    logger.error('safeStorage is not available');
    return undefined;
  }
  const item = store.get(configKeys.EncryptedData, {}) as Record<
    string,
    string
  >;
  const value = item[key];
  if (value) {
    try {
      const result = safeStorage.decryptString(Buffer.from(value, 'hex'));
      return result;
    } catch (e) {
      logger.error(`failed to decrypt ${key}`);
      return undefined;
    }
  }
};

export const setSecureItem = (key: string, value: string): void => {
  const available = safeStorage.isEncryptionAvailable();
  if (!available) {
    logger.error('safeStorage is not available');
    return undefined;
  }
  try {
    const items = store.get(configKeys.EncryptedData, {}) as Record<
      string,
      string
    >;
    items[key] = safeStorage.encryptString(value).toString('hex');
    store.set(configKeys.EncryptedData, items);
  } catch (e) {
    logger.error(`failed to encrypt ${key}`);
  }
};

export const deleteSecureItem = (key: string) => {
  const items = store.get(configKeys.EncryptedData, {}) as Record<
    string,
    string
  >;
  delete items[key];
  store.set(configKeys.EncryptedData, items);
};

export const setASCFile = (ascFile: string) => {
  store.set(configKeys.ASCFile, ascFile);
};

export const getASCFile = () => store.get(configKeys.ASCFile, '') as string;

export const clearASCFile = () => {
  store.delete(configKeys.ASCFile);
};

export const setUpdateBuildNumber = (buildNumber: string) => {
  store.set(configKeys.UpdateBuildNumber, buildNumber);
};

export const getUpdateBuildNumber = () =>
  store.get(configKeys.UpdateBuildNumber, '') as string;

export const clearUpdateBuildNumber = () => {
  store.delete(configKeys.UpdateBuildNumber);
};
