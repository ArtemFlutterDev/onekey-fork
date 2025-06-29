import { useEffect, useState } from 'react';

import { useThrottledCallback } from 'use-debounce';

import { ipcMessageKeys } from '@onekeyhq/desktop/app/config';
import platformEnv from '@onekeyhq/shared/src/platformEnv';

import { ETranslations } from '../../locale';
import { appLocale } from '../../locale/appLocale';
import { defaultLogger } from '../../logger/logger';

import type {
  IClearPackage,
  IDownloadASC,
  IDownloadPackage,
  IInstallPackage,
  IManualInstallPackage,
  IUpdateDownloadedEvent,
  IUseDownloadProgress,
  IVerifyASC,
  IVerifyPackage,
} from './type';

const updateCheckingTasks: (() => void)[] = [];
globalThis.desktopApi?.on?.(ipcMessageKeys.UPDATE_CHECKING, () => {
  defaultLogger.update.app.log('checking');
  while (updateCheckingTasks.length) {
    updateCheckingTasks.pop()?.();
  }
});

const updateAvailableTasks: (() => void)[] = [];
globalThis.desktopApi?.on?.(ipcMessageKeys.UPDATE_AVAILABLE, ({ version }) => {
  defaultLogger.update.app.log('available', version);
  while (updateAvailableTasks.length) {
    updateAvailableTasks.pop()?.();
  }
});

globalThis.desktopApi?.on?.(ipcMessageKeys.UPDATE_NOT_AVAILABLE, (params) => {
  console.log('update/not-available', params);
  defaultLogger.update.app.log('not-available');
});

globalThis.desktopApi?.on?.(ipcMessageKeys.UPDATE_DOWNLOAD, ({ version }) => {
  defaultLogger.update.app.log('download', version);
});

const updateVerifyTasks: (() => void)[] = [];
globalThis.desktopApi.on(ipcMessageKeys.UPDATE_VERIFIED, () => {
  defaultLogger.update.app.log('update/verified');
  while (updateVerifyTasks.length) {
    updateVerifyTasks.pop()?.();
  }
});

const updateDownloadASCTasks: (() => void)[] = [];
globalThis.desktopApi.on(ipcMessageKeys.UPDATE_DOWNLOAD_ASC_DONE, () => {
  defaultLogger.update.app.log('update/download-asc');
  while (updateDownloadASCTasks.length) {
    updateDownloadASCTasks.pop()?.();
  }
});

const updateVerifyASCTasks: (() => void)[] = [];
globalThis.desktopApi.on(ipcMessageKeys.UPDATE_VERIFY_ASC_DONE, () => {
  defaultLogger.update.app.log('update/verify-asc');
  while (updateVerifyASCTasks.length) {
    updateVerifyASCTasks.pop()?.();
  }
});

let updateDownloadingTasks: ((params: {
  total: number;
  delta: number;
  transferred: number;
  percent: number;
  bytesPerSecond: number;
}) => void)[] = [];
globalThis.desktopApi?.on?.(
  ipcMessageKeys.UPDATE_DOWNLOADING,
  (params: {
    percent: number;
    delta: number;
    bytesPerSecond: number;
    total: number;
    transferred: number;
  }) => {
    console.log('update/downloading', params);
    defaultLogger.update.app.log('downloading', params.percent);
    updateDownloadingTasks.forEach((t) => t(params));
  },
);

const updateDownloadedTasks: ((event: IUpdateDownloadedEvent) => void)[] = [];
globalThis.desktopApi.on(
  ipcMessageKeys.UPDATE_DOWNLOADED,
  (event: IUpdateDownloadedEvent) => {
    defaultLogger.update.app.log('download');
    while (updateDownloadedTasks.length) {
      updateDownloadedTasks.pop()?.(event);
    }
    updateDownloadingTasks = [];
  },
);

const updateErrorTasks: ((error: { message: string }) => void)[] = [];
globalThis.desktopApi?.on?.(
  ipcMessageKeys.UPDATE_ERROR,
  ({
    err,
    isNetworkError,
  }: {
    err: { message: string };
    isNetworkError: boolean;
  }) => {
    console.log('update/error', err, isNetworkError);
    const message =
      err.message ||
      'Network exception, please check your internet connection.';
    defaultLogger.update.app.log('error', message);
    while (updateErrorTasks.length) {
      updateErrorTasks.pop()?.({ message });
    }
  },
);

export const downloadPackage: IDownloadPackage = () =>
  new Promise<IUpdateDownloadedEvent>((resolve, reject) => {
    updateAvailableTasks.push(() => {
      globalThis.desktopApi.downloadUpdate();
    });
    updateDownloadedTasks.push((event: IUpdateDownloadedEvent) => {
      resolve(event);
    });
    updateErrorTasks.push(reject);
    globalThis.desktopApi.checkForUpdates();
  });

export const downloadASC: IDownloadASC = async (params) =>
  new Promise((resolve, reject) => {
    updateDownloadASCTasks.push(resolve);
    updateErrorTasks.push(reject);
    globalThis.desktopApi.downloadASC(params);
  });

export const verifyASC: IVerifyASC = async (params) =>
  new Promise((resolve, reject) => {
    updateVerifyASCTasks.push(resolve);
    updateErrorTasks.push(reject);
    globalThis.desktopApi.verifyASC(params);
  });

export const verifyPackage: IVerifyPackage = async (params) =>
  new Promise((resolve, reject) => {
    updateVerifyTasks.push(resolve);
    updateErrorTasks.push(reject);
    globalThis.desktopApi.verifyUpdate(params);
  });

export const installPackage: IInstallPackage = async ({ downloadedEvent }) =>
  new Promise((_, reject) => {
    defaultLogger.update.app.log('install');
    updateErrorTasks.push(reject);
    // verifyUpdate will be called by default in the electron module when calling to installUpdate
    globalThis.desktopApi.installUpdate({
      ...downloadedEvent,
      buildNumber: String(platformEnv.buildNumber || 1),
    });
  });

export const useDownloadProgress: IUseDownloadProgress = (
  onSuccess,
  onFailed,
) => {
  const [percent, setPercent] = useState(0);

  const updatePercent = useThrottledCallback(
    ({
      percent: progress,
    }: {
      total: number;
      delta: number;
      transferred: number;
      percent: number;
      bytesPerSecond: number;
    }) => {
      defaultLogger.update.app.log('downloading', progress);
      setPercent(Number(Number(progress).toFixed()));
    },
    10,
  );

  useEffect(() => {
    updateDownloadingTasks.push(updatePercent);
    updateDownloadedTasks.push(onSuccess);
    updateErrorTasks.push(onFailed);
  }, [onFailed, onSuccess, updatePercent]);
  return percent;
};

export const clearPackage: IClearPackage = async () => {
  globalThis.desktopApi.clearUpdate();
};

export const manualInstallPackage: IManualInstallPackage = async (params) =>
  new Promise((resolve, reject) => {
    updateErrorTasks.push(reject);
    globalThis.desktopApi.manualInstallPackage(params);
    setTimeout(() => {
      resolve();
    }, 3500);
  });
