import { isNil, isNumber } from 'lodash';

import errorUtils from '@onekeyhq/shared/src/errors/utils/errorUtils';
import dbPerfMonitor from '@onekeyhq/shared/src/utils/debug/dbPerfMonitor';
import { noopObject } from '@onekeyhq/shared/src/utils/miscUtils';
import resetUtils from '@onekeyhq/shared/src/utils/resetUtils';

import { ALL_LOCAL_DB_STORE_NAMES } from '../consts';
import { LocalDbAgentBase } from '../LocalDbAgentBase';
import { ELocalDBStoreNames } from '../localDBStoreNames';

import type {
  IIndexedDBSchemaMap,
  ILocalDBAgent,
  ILocalDBGetAllRecordsParams,
  ILocalDBGetAllRecordsResult,
  ILocalDBGetRecordByIdParams,
  ILocalDBGetRecordByIdResult,
  ILocalDBGetRecordsByIdsParams,
  ILocalDBGetRecordsByIdsResult,
  ILocalDBGetRecordsCountParams,
  ILocalDBGetRecordsCountResult,
  ILocalDBRecord,
  ILocalDBRecordPair,
  ILocalDBRecordUpdater,
  ILocalDBTransaction,
  ILocalDBTransactionStores,
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
  ILocalDBWithTransactionOptions,
  ILocalDBWithTransactionTask,
} from '../types';
import type { IDBPDatabase, IDBPObjectStore, IDBPTransaction } from 'idb';

export class IndexedDBAgent extends LocalDbAgentBase implements ILocalDBAgent {
  constructor(indexed: IDBPDatabase<IIndexedDBSchemaMap>) {
    super();
    this.indexed = indexed;
  }

  clearRecords({ name }: { name: ELocalDBStoreNames }): Promise<void> {
    return this.withTransaction(async (tx) => {
      const store = this._getObjectStoreFromTx(tx, name);
      await store.clear();
    });
  }

  indexed: IDBPDatabase<IIndexedDBSchemaMap>;

  txPair:
    | {
        dbTx: IDBPTransaction<
          IIndexedDBSchemaMap,
          ELocalDBStoreNames[],
          'readwrite'
        >;
        tx: ILocalDBTransaction;
      }
    | undefined;

  _getObjectStore<T extends ELocalDBStoreNames>(
    tx: IDBPTransaction<IIndexedDBSchemaMap, T[], 'readwrite'>,
    storeName: T,
  ): IDBPObjectStore<IIndexedDBSchemaMap, T[], T, 'readwrite'> {
    const store = tx.objectStore(storeName);
    return store;
  }

  _getOrCreateObjectStore<T extends ELocalDBStoreNames>(
    tx: IDBPTransaction<IIndexedDBSchemaMap, T[], 'readwrite'>,
    storeName: T,
  ): IDBPObjectStore<IIndexedDBSchemaMap, T[], T, 'readwrite'> {
    try {
      const store = this._getObjectStore(tx, storeName);
      // const dd = await store.get('');
      return store;
    } catch {
      this.indexed.createObjectStore(storeName, {
        keyPath: 'id',
      });
      const store = this._getObjectStore(tx, storeName);
      return store;
    }
  }

  _buildTransactionAndStores({
    db,
    alwaysCreate = true,
    readOnly = false,
  }: {
    db: IDBPDatabase<IIndexedDBSchemaMap>;
    alwaysCreate: boolean;
    readOnly?: boolean;
  }) {
    if (!this.txPair || alwaysCreate) {
      // eslint-disable-next-line spellcheck/spell-checker
      // type IDBTransactionMode = "readonly" | "readwrite" | "versionchange";
      const mode: 'readwrite' = readOnly ? ('readonly' as any) : 'readwrite';
      const dbTx = db.transaction(
        ALL_LOCAL_DB_STORE_NAMES,
        // 'readwrite',
        mode,
      );

      const contextStore = this._getOrCreateObjectStore(
        dbTx,
        ELocalDBStoreNames.Context,
      );

      const walletStore = this._getOrCreateObjectStore(
        dbTx,
        ELocalDBStoreNames.Wallet,
      );

      const accountStore = this._getOrCreateObjectStore(
        dbTx,
        ELocalDBStoreNames.Account,
      );

      const accountDerivationStore = this._getOrCreateObjectStore(
        dbTx,
        ELocalDBStoreNames.AccountDerivation,
      );

      const indexedAccountStore = this._getOrCreateObjectStore(
        dbTx,
        ELocalDBStoreNames.IndexedAccount,
      );

      const credentialStore = this._getOrCreateObjectStore(
        dbTx,
        ELocalDBStoreNames.Credential,
      );

      const deviceStore = this._getOrCreateObjectStore(
        dbTx,
        ELocalDBStoreNames.Device,
      );

      const addressStore = this._getOrCreateObjectStore(
        dbTx,
        ELocalDBStoreNames.Address,
      );

      const signMessageStore = this._getOrCreateObjectStore(
        dbTx,
        ELocalDBStoreNames.SignedMessage,
      );

      const signedTransactionStore = this._getOrCreateObjectStore(
        dbTx,
        ELocalDBStoreNames.SignedTransaction,
      );

      const connectedSiteStore = this._getOrCreateObjectStore(
        dbTx,
        ELocalDBStoreNames.ConnectedSite,
      );

      const cloudSyncItemStore = this._getOrCreateObjectStore(
        dbTx,
        ELocalDBStoreNames.CloudSyncItem,
      );

      const tx: ILocalDBTransaction = {
        stores: {
          [ELocalDBStoreNames.Context]: contextStore as any,
          [ELocalDBStoreNames.Wallet]: walletStore as any,
          [ELocalDBStoreNames.IndexedAccount]: indexedAccountStore as any,
          [ELocalDBStoreNames.Account]: accountStore as any,
          [ELocalDBStoreNames.AccountDerivation]: accountDerivationStore as any,
          [ELocalDBStoreNames.Credential]: credentialStore as any,
          [ELocalDBStoreNames.Device]: deviceStore as any,
          [ELocalDBStoreNames.Address]: addressStore as any,
          [ELocalDBStoreNames.SignedMessage]: signMessageStore as any,
          [ELocalDBStoreNames.SignedTransaction]: signedTransactionStore as any,
          [ELocalDBStoreNames.ConnectedSite]: connectedSiteStore as any,
          [ELocalDBStoreNames.CloudSyncItem]: cloudSyncItemStore as any,
        },
      };

      this.txPair = {
        dbTx,
        tx,
      };
    }
    return this.txPair;
  }

  _getObjectStoreFromTx<T extends ELocalDBStoreNames>(
    tx: ILocalDBTransaction,
    storeName: T,
  ): ILocalDBTransactionStores[T] {
    const store = tx.stores?.[storeName];
    if (!store) {
      throw new Error(
        `indexedDB store not found: ${storeName}, check IndexedDBAgent code`,
      );
    }
    return store;
  }

  async _executeUpdateRecord<T extends ELocalDBStoreNames>({
    name,
    updater,
    oldRecord,
    tx,
  }: {
    name: T;
    oldRecord: ILocalDBRecord<T>;
    updater: ILocalDBRecordUpdater<T>;
    tx: ILocalDBTransaction;
  }) {
    const store = this._getObjectStoreFromTx(tx, name);
    const newRecord = await updater(oldRecord);
    return store.put(newRecord as any);
  }

  // ----------------------------------------------

  async withTransaction<T>(
    task: ILocalDBWithTransactionTask<T>,
    options?: ILocalDBWithTransactionOptions,
  ): Promise<T> {
    noopObject(options);
    const { tx, dbTx } = this._buildTransactionAndStores({
      db: this.indexed,
      alwaysCreate: true,
      readOnly: options?.readOnly,
    });

    try {
      const result = await task(tx);
      // await dbTx.done;
      return result;
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(error);
      }
      dbTx.abort();
      throw error;
    }
  }

  override async getRecordsCount<T extends ELocalDBStoreNames>(
    params: ILocalDBGetRecordsCountParams<T>,
  ): Promise<ILocalDBGetRecordsCountResult> {
    return this.withTransaction(
      async (tx) =>
        this.txGetRecordsCount({
          ...params,
          tx,
        }),
      {
        readOnly: true,
      },
    );
  }

  async getRecordsByIds<T extends ELocalDBStoreNames>(
    params: ILocalDBGetRecordsByIdsParams<T>,
  ): Promise<ILocalDBGetRecordsByIdsResult<T>> {
    return this.withTransaction(
      async (tx) => {
        const { records } = await this.txGetRecordsByIds({
          ...params,
          tx,
        });
        return { records };
      },
      {
        readOnly: true,
      },
    );
  }

  async getAllRecords<T extends ELocalDBStoreNames>(
    params: ILocalDBGetAllRecordsParams<T>,
  ): Promise<ILocalDBGetAllRecordsResult<T>> {
    return this.withTransaction(
      async (tx) => {
        const { records } = await this.txGetAllRecords({
          ...params,
          tx,
        });
        return { records };
      },
      {
        readOnly: true,
      },
    );
  }

  async getRecordById<T extends ELocalDBStoreNames>(
    params: ILocalDBGetRecordByIdParams<T>,
  ): Promise<ILocalDBGetRecordByIdResult<T>> {
    // logLocalDbCall(`getRecordById`, params.name, [params.id]);
    return this.withTransaction(
      async (tx) => {
        const [record] = await this.txGetRecordById({
          ...params,
          tx,
        });
        return record;
      },
      {
        readOnly: true,
      },
    );
  }

  override async txGetRecordsCount<T extends ELocalDBStoreNames>(
    params: ILocalDBTxGetRecordsCountParams<T>,
  ): Promise<ILocalDBGetRecordsCountResult> {
    const { tx: paramsTx, name } = params;
    dbPerfMonitor.logLocalDbCall(`txGetRecordsCount`, name, [true]);
    const fn = async (tx: ILocalDBTransaction) => {
      const store = this._getObjectStoreFromTx(tx, name);
      const count = await store.count();
      return {
        count,
      };
    };
    return fn(paramsTx);
  }

  async txGetRecordsByIds<T extends ELocalDBStoreNames>(
    params: ILocalDBTxGetRecordsByIdsParams<T>,
  ): Promise<ILocalDBTxGetRecordsByIdsResult<T>> {
    const { tx: paramsTx, name, ids } = params;
    dbPerfMonitor.logLocalDbCall(`txGetRecordsByIds`, name, [
      `ids_count=${ids ? ids?.length?.toString() : ''}`,
    ]);
    const fn = async (tx: ILocalDBTransaction) => {
      const store = this._getObjectStoreFromTx<T>(tx, name);
      // TODO add query support
      // query?: StoreKey<DBTypes, StoreName> | IDBKeyRange | null, count?: number
      let results: unknown[] = [];

      results = await Promise.all(ids.map((id) => store.get(id)));

      const recordPairs: ILocalDBRecordPair<T>[] = [];
      const records: ILocalDBRecord<T>[] = [];

      results.forEach((record) => {
        records.push(record as any);
        recordPairs.push([record as any, null]);
      });
      return {
        recordPairs,
        records,
      };
    };

    return fn(paramsTx);
  }

  async txGetAllRecords<T extends ELocalDBStoreNames>(
    params: ILocalDBTxGetAllRecordsParams<T>,
  ): Promise<ILocalDBTxGetAllRecordsResult<T>> {
    const { tx: paramsTx, name, limit, offset } = params;
    dbPerfMonitor.logLocalDbCall(`txGetAllRecords`, name, [`ids_count=ALL`]);
    const fn = async (tx: ILocalDBTransaction) => {
      const store = this._getObjectStoreFromTx<T>(tx, name);
      // TODO add query support
      // query?: StoreKey<DBTypes, StoreName> | IDBKeyRange | null, count?: number
      let results: unknown[] = [];

      if (isNumber(limit) && isNumber(offset)) {
        const indexStore =
          store as ILocalDBTransactionStores[ELocalDBStoreNames.SignedMessage];
        if (indexStore.indexNames.contains('createdAt')) {
          const cursor = await indexStore
            .index('createdAt')
            .openCursor(null, 'prev');

          let skipped = 0;
          while (cursor) {
            if (skipped < offset) {
              skipped += 1;
            } else if (results.length <= limit) {
              results.push(cursor.value);
            }
            const data = await cursor.continue();
            if (!data || results.length >= limit) {
              break;
            }
          }
        } else {
          results = await store.getAll();
        }
      } else {
        results = await store.getAll();
      }

      const recordPairs: ILocalDBRecordPair<T>[] = [];
      const records: ILocalDBRecord<T>[] = [];

      results.forEach((record) => {
        records.push(record as any);
        recordPairs.push([record as any, null]);
      });
      return {
        recordPairs,
        records,
      };
    };

    return fn(paramsTx);
  }

  async txGetRecordById<T extends ELocalDBStoreNames>(
    params: ILocalDBTxGetRecordByIdParams<T>,
  ): Promise<ILocalDBTxGetRecordByIdResult<T>> {
    const { tx: paramsTx, name, id } = params;
    const fn: (
      tx: ILocalDBTransaction,
    ) => Promise<ILocalDBTxGetRecordByIdResult<T>> = async (
      tx: ILocalDBTransaction,
    ) => {
      const store = this._getObjectStoreFromTx(tx, name);
      dbPerfMonitor.logLocalDbCall(`txGetRecordById`, name, [id]);
      const record = await store.get(id);
      if (!record) {
        const error = new Error(`record not found: ${name} ${id}`);
        errorUtils.autoPrintErrorIgnore(error);
        throw error;
      }
      return [record as any, null];
    };
    return fn(paramsTx);
  }

  async txUpdateRecords<T extends ELocalDBStoreNames>(
    params: ILocalDBTxUpdateRecordsParams<T>,
  ): Promise<void> {
    resetUtils.checkNotInResetting();
    const { name, tx, updater } = params;
    const pairs = await this.buildRecordPairsFromIds(params);
    dbPerfMonitor.logLocalDbCall(`txUpdateRecords`, name, [
      `records: ${pairs.length}`,
    ]);
    await Promise.all(
      pairs.map((pair) =>
        this._executeUpdateRecord({
          name,
          tx,
          updater,
          // TODO only update first record?
          oldRecord: pair[0],
        }),
      ),
    );
  }

  async txAddRecords<T extends ELocalDBStoreNames>(
    params: ILocalDBTxAddRecordsParams<T>,
  ): Promise<ILocalDBTxAddRecordsResult> {
    resetUtils.checkNotInResetting();
    const { name, tx, records, skipIfExists } = params;
    const store = this._getObjectStoreFromTx(tx, name);
    const result: ILocalDBTxAddRecordsResult = {
      added: 0,
      skipped: 0,
      addedIds: [],
    };
    dbPerfMonitor.logLocalDbCall(`txAddRecords`, name, [
      `records: ${records.length}`,
    ]);
    for (const record of records) {
      let shouldAdd = true;
      if (skipIfExists) {
        const existingRecord = await store.get(record.id);
        if (existingRecord) {
          shouldAdd = false;
        }
      }
      if (shouldAdd) {
        await store.add(record as any);
        result.added += 1;
        result.addedIds.push(record.id);
      } else {
        result.skipped += 1;
      }
    }
    return result;
  }

  async txRemoveRecords<T extends ELocalDBStoreNames>(
    params: ILocalDBTxRemoveRecordsParams<T>,
  ): Promise<void> {
    resetUtils.checkNotInResetting();
    const { name, tx } = params;
    const store = this._getObjectStoreFromTx(tx, name);
    const pairs = await this.buildRecordPairsFromIds(params);
    dbPerfMonitor.logLocalDbCall(`txRemoveRecords`, name, [
      `records: ${pairs.length}`,
    ]);
    await Promise.all(
      pairs.map(async (pair) => {
        // TODO only remove first record?
        const recordId = pair[0]?.id;
        if (isNil(recordId)) {
          throw new Error('dbRemoveRecord ERROR: recordId not found');
        }
        return store.delete(recordId);
      }),
    );
  }
}
