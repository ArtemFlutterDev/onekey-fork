import { cloneDeep } from 'lodash';

import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import cacheUtils, { memoizee } from '@onekeyhq/shared/src/utils/cacheUtils';
import timerUtils from '@onekeyhq/shared/src/utils/timerUtils';

import { ELocalDBStoreNames } from './localDBStoreNames';

import type {
  IDBAccount,
  IDBDevice,
  IDBIndexedAccount,
  IDBWallet,
  ILocalDBAgent,
  ILocalDBGetAllRecordsParams,
  ILocalDBGetAllRecordsResult,
  ILocalDBGetRecordByIdParams,
  ILocalDBGetRecordByIdResult,
  ILocalDBGetRecordsByIdsParams,
  ILocalDBGetRecordsByIdsResult,
  ILocalDBGetRecordsCountParams,
  ILocalDBGetRecordsCountResult,
  ILocalDBRemoveRecordsParams,
  ILocalDBTxAddRecordsParams,
  ILocalDBTxAddRecordsResult,
  ILocalDBTxGetAllRecordsParams,
  ILocalDBTxGetAllRecordsResult,
  ILocalDBTxGetRecordByIdParams,
  ILocalDBTxGetRecordByIdResult,
  ILocalDBTxGetRecordsByIdsParams,
  ILocalDBTxGetRecordsByIdsResult,
  ILocalDBTxGetRecordsCountParams,
  ILocalDBTxRemoveRecordsParams,
  ILocalDBTxUpdateRecordsParams,
  ILocalDBWithTransactionTask,
} from './types';

export abstract class LocalDbBaseContainer implements ILocalDBAgent {
  protected abstract readyDb: Promise<ILocalDBAgent>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async withTransaction<T>(task: ILocalDBWithTransactionTask<T>): Promise<T> {
    // throw new Error(
    //   'Directly call withTransaction() is NOT allowed, please use (await this.readyDb).withTransaction() at DB layer',
    // );
    const db = await this.readyDb;
    return db.withTransaction(task);
  }

  async getRecordsCount<T extends ELocalDBStoreNames>(
    params: ILocalDBGetRecordsCountParams<T>,
  ): Promise<ILocalDBGetRecordsCountResult> {
    const db = await this.readyDb;
    return db.getRecordsCount(params);
  }

  async txGetRecordsCount<T extends ELocalDBStoreNames>(
    params: ILocalDBTxGetRecordsCountParams<T>,
  ): Promise<ILocalDBGetRecordsCountResult> {
    const db = await this.readyDb;
    return db.txGetRecordsCount(params);
  }

  async getAllRecords<T extends ELocalDBStoreNames>(
    params: ILocalDBGetAllRecordsParams<T>,
  ): Promise<ILocalDBGetAllRecordsResult<T>> {
    const db = await this.readyDb;
    return db.getAllRecords(params);
  }

  async getRecordsByIds<T extends ELocalDBStoreNames>(
    params: ILocalDBGetRecordsByIdsParams<T>,
  ): Promise<ILocalDBGetRecordsByIdsResult<T>> {
    const db = await this.readyDb;
    return db.getRecordsByIds(params);
  }

  async getRecordById<T extends ELocalDBStoreNames>(
    params: ILocalDBGetRecordByIdParams<T>,
  ): Promise<ILocalDBGetRecordByIdResult<T>> {
    // eslint-disable-next-line prefer-const
    let shouldUseCache = this.isCachedStoreName(params.name);
    if (
      params.name === ELocalDBStoreNames.Account &&
      params.id === accountUtils.URL_ACCOUNT_ID
    ) {
      // shouldUseCache = false;
    }
    if (shouldUseCache) {
      const cache = await this.getRecordByIdWithCache(params);
      return cloneDeep(cache);
    }

    const db = await this.readyDb;
    return db.getRecordById(params);
  }

  private getRecordByIdWithCache = memoizee(
    async <T extends ELocalDBStoreNames>(
      params: ILocalDBGetRecordByIdParams<T>,
    ) => {
      const db = await this.readyDb;
      return db.getRecordById(params);
    },
    {
      promise: true,
      maxAge: timerUtils.getTimeDurationMs({ seconds: 10 }),
    },
  );

  isCachedStoreName(storeName: ELocalDBStoreNames) {
    return [
      ELocalDBStoreNames.Account,
      ELocalDBStoreNames.IndexedAccount,
      ELocalDBStoreNames.Wallet,
      ELocalDBStoreNames.Device,
    ].includes(storeName);
  }

  dbAllRecordsCache = new cacheUtils.LRUCache<
    'allDbAccounts' | 'allDbIndexedAccounts' | 'allDbWallets' | 'allDbDevices',
    IDBAccount[] | IDBIndexedAccount[] | IDBWallet[] | IDBDevice[]
  >({
    max: 10,
    ttl: timerUtils.getTimeDurationMs({ seconds: 5 }),
  });

  getAllRecordsByCache<T>(
    cacheKey:
      | 'allDbAccounts'
      | 'allDbIndexedAccounts'
      | 'allDbWallets'
      | 'allDbDevices',
  ) {
    const allItemsInCache = this.dbAllRecordsCache.get(cacheKey) as T[];
    if (allItemsInCache && allItemsInCache.length) {
      return cloneDeep(allItemsInCache);
    }
    return undefined;
  }

  clearStoreCachedDataIfMatch(storeName: ELocalDBStoreNames) {
    if (this.isCachedStoreName(storeName)) {
      this.clearStoreCachedData();
    }
  }

  clearStoreCachedData() {
    this.getRecordByIdWithCache.clear();
    this.dbAllRecordsCache.clear();
  }

  async removeRecords<T extends ELocalDBStoreNames>(
    params: ILocalDBRemoveRecordsParams<T>,
  ) {
    return this.withTransaction((tx) => {
      return this.txRemoveRecords({
        ...params,
        tx,
      });
    });
  }

  async txGetAllRecords<T extends ELocalDBStoreNames>(
    params: ILocalDBTxGetAllRecordsParams<T>,
  ): Promise<ILocalDBTxGetAllRecordsResult<T>> {
    const db = await this.readyDb;
    return db.txGetAllRecords(params);
  }

  async txGetRecordsByIds<T extends ELocalDBStoreNames>(
    params: ILocalDBTxGetRecordsByIdsParams<T>,
  ): Promise<ILocalDBTxGetRecordsByIdsResult<T>> {
    const db = await this.readyDb;
    return db.txGetRecordsByIds(params);
  }

  async txGetRecordById<T extends ELocalDBStoreNames>(
    params: ILocalDBTxGetRecordByIdParams<T>,
  ): Promise<ILocalDBTxGetRecordByIdResult<T>> {
    const db = await this.readyDb;
    return db.txGetRecordById(params);
  }

  async txUpdateRecords<T extends ELocalDBStoreNames>(
    params: ILocalDBTxUpdateRecordsParams<T>,
  ): Promise<void> {
    this.clearStoreCachedDataIfMatch(params.name);
    const db = await this.readyDb;
    // const a = db.txAddRecords['hello-world-test-error-stack-8889273']['name'];
    return db.txUpdateRecords(params);
  }

  async txAddRecords<T extends ELocalDBStoreNames>(
    params: ILocalDBTxAddRecordsParams<T>,
  ): Promise<ILocalDBTxAddRecordsResult> {
    this.clearStoreCachedDataIfMatch(params.name);
    const db = await this.readyDb;
    return db.txAddRecords(params);
  }

  async txRemoveRecords<T extends ELocalDBStoreNames>(
    params: ILocalDBTxRemoveRecordsParams<T>,
  ): Promise<void> {
    this.clearStoreCachedDataIfMatch(params.name);
    const db = await this.readyDb;
    return db.txRemoveRecords(params);
  }

  abstract reset(): Promise<void>;

  async clearRecords(params: { name: ELocalDBStoreNames }) {
    this.clearStoreCachedDataIfMatch(params.name);
    const db = await this.readyDb;
    return db.clearRecords(params);
  }
}
