import { useCallback, useRef } from 'react';

import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import { ContextJotaiActionsBase } from '@onekeyhq/kit/src/states/jotai/utils/ContextJotaiActionsBase';
import { memoFn } from '@onekeyhq/shared/src/utils/cacheUtils';
import earnUtils from '@onekeyhq/shared/src/utils/earnUtils';
import type {
  IEarnPermitCache,
  IEarnPermitCacheKey,
} from '@onekeyhq/shared/types/earn';
import type {
  IAvailableAsset,
  IEarnAccountTokenResponse,
  IEarnAtomData,
} from '@onekeyhq/shared/types/staking';

import { contextAtomMethod, earnAtom, earnPermitCacheAtom } from './atoms';

export const homeResettingFlags: Record<string, number> = {};

class ContextJotaiActionsMarket extends ContextJotaiActionsBase {
  syncToDb = contextAtomMethod((get, set, payload: IEarnAtomData) => {
    const atom = earnAtom();
    if (!get(atom).isMounted) {
      return;
    }
    void this.syncToJotai.call(set, payload);
    void backgroundApiProxy.simpleDb.earn.setRawData(payload);
  });

  syncToJotai = contextAtomMethod((get, set, payload: IEarnAtomData) => {
    const atom = earnAtom();
    if (!get(atom).isMounted) {
      return;
    }
    set(atom, (prev: IEarnAtomData) => ({
      ...prev,
      ...payload,
    }));
  });

  getAvailableAssets = contextAtomMethod((get) => {
    const { availableAssets } = get(earnAtom());
    return availableAssets || [];
  });

  updateAvailableAssets = contextAtomMethod(
    (_, set, availableAssets: IAvailableAsset[]) => {
      this.syncToDb.call(set, {
        availableAssets,
      });
    },
  );

  getEarnAccount = contextAtomMethod((get, set, key: string) => {
    const { earnAccount } = get(earnAtom());
    return earnAccount?.[key];
  });

  updateEarnAccounts = contextAtomMethod(
    (
      get,
      set,
      {
        key,
        earnAccount,
      }: {
        key: string;
        earnAccount: IEarnAccountTokenResponse;
      },
    ) => {
      const earnData = get(earnAtom());
      this.syncToJotai.call(set, {
        earnAccount: {
          ...earnData.earnAccount,
          [key]: earnAccount,
        },
      });
    },
  );

  getPermitCache = contextAtomMethod(
    (get, set, keyPayload: IEarnPermitCacheKey) => {
      const permitCaches = get(earnPermitCacheAtom());
      const key = earnUtils.getEarnPermitCacheKey(keyPayload);

      const cache = permitCaches[key];
      if (!cache) {
        return null;
      }

      const now = Date.now();
      if (now < cache.expiredAt) {
        return cache;
      }

      // Remove expired cache
      set(earnPermitCacheAtom(), (prev) => {
        const newCache = { ...prev };
        delete newCache[key];
        return newCache;
      });
      return null;
    },
  );

  updatePermitCache = contextAtomMethod((_, set, payload: IEarnPermitCache) => {
    const key = earnUtils.getEarnPermitCacheKey(payload);
    set(earnPermitCacheAtom(), (prev: Record<string, IEarnPermitCache>) => ({
      ...prev,
      [key]: payload,
    }));
  });

  removePermitCache = contextAtomMethod(
    (_, set, keyPayload: IEarnPermitCacheKey) => {
      const key = earnUtils.getEarnPermitCacheKey(keyPayload);
      set(earnPermitCacheAtom(), (prev: Record<string, IEarnPermitCache>) => {
        const newCache = { ...prev };
        delete newCache[key];
        return newCache;
      });
    },
  );
}

const createActions = memoFn(() => new ContextJotaiActionsMarket());

export function useEarnActions() {
  const actions = createActions();
  const getAvailableAssets = actions.getAvailableAssets.use();
  const updateAvailableAssets = actions.updateAvailableAssets.use();
  const updateEarnAccounts = actions.updateEarnAccounts.use();
  const getEarnAccount = actions.getEarnAccount.use();
  const getPermitCache = actions.getPermitCache.use();
  const updatePermitCache = actions.updatePermitCache.use();
  const removePermitCache = actions.removePermitCache.use();

  const buildEarnAccountsKey = useCallback(
    (account = '', network = '') => `${account}-${network}`,
    [],
  );

  return useRef({
    getAvailableAssets,
    updateAvailableAssets,
    buildEarnAccountsKey,
    updateEarnAccounts,
    getEarnAccount,
    getPermitCache,
    updatePermitCache,
    removePermitCache,
  });
}
