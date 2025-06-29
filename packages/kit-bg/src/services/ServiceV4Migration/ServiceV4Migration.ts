/* eslint-disable @typescript-eslint/no-restricted-imports */
import { flatten, uniqBy } from 'lodash';

import { decryptVerifyString } from '@onekeyhq/core/src/secret';
import appGlobals from '@onekeyhq/shared/src/appGlobals';
import {
  backgroundClass,
  backgroundMethod,
  toastIfError,
} from '@onekeyhq/shared/src/background/backgroundDecorators';
import { DEFAULT_VERIFY_STRING } from '@onekeyhq/shared/src/consts/dbConsts';
import {
  COINTYPE_CFX,
  COINTYPE_COSMOS,
  COINTYPE_DOT,
  COINTYPE_NEXA,
} from '@onekeyhq/shared/src/engine/engineConsts';
import { IncorrectPassword } from '@onekeyhq/shared/src/errors';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { appLocale } from '@onekeyhq/shared/src/locale/appLocale';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import appStorage from '@onekeyhq/shared/src/storage/appStorage';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import networkUtils from '@onekeyhq/shared/src/utils/networkUtils';
import timerUtils from '@onekeyhq/shared/src/utils/timerUtils';
import { EReasonForNeedPassword } from '@onekeyhq/shared/types/setting';

import simpleDb from '../../dbs/simple/simpleDb';
import { v4CoinTypeToNetworkId } from '../../migrations/v4ToV5Migration/v4CoinTypeToNetworkId';
import { v4PresetNetworkIds } from '../../migrations/v4ToV5Migration/v4data/networkIds';
import v4dbHubs from '../../migrations/v4ToV5Migration/v4dbHubs';
import {
  V4_INDEXED_DB_NAME,
  V4_REALM_DB_NAME,
} from '../../migrations/v4ToV5Migration/v4local/v4localDBConsts';
import v4localDbExists from '../../migrations/v4ToV5Migration/v4local/v4localDbExists';
import { EV4LocalDBStoreNames } from '../../migrations/v4ToV5Migration/v4local/v4localDBStoreNames';
import { V4MigrationForAccount } from '../../migrations/v4ToV5Migration/V4MigrationForAccount';
import { V4MigrationForAddressBook } from '../../migrations/v4ToV5Migration/V4MigrationForAddressBook';
import { V4MigrationForCustomTokens } from '../../migrations/v4ToV5Migration/V4MigrationForCustomTokens';
import { V4MigrationForDiscover } from '../../migrations/v4ToV5Migration/V4MigrationForDiscover';
import { V4MigrationForHistory } from '../../migrations/v4ToV5Migration/V4MigrationForHistory';
import { V4MigrationForSecurePassword } from '../../migrations/v4ToV5Migration/V4MigrationForSecurePassword';
import { V4MigrationForSettings } from '../../migrations/v4ToV5Migration/V4MigrationForSettings';
import {
  v4migrationAtom,
  v4migrationPersistAtom,
} from '../../states/jotai/atoms/v4migration';
import { vaultFactory } from '../../vaults/factory';
import ServiceBase from '../ServiceBase';

import type { IDBIndexedAccount } from '../../dbs/local/types';
import type {
  IV4MigrationBackupSectionData,
  IV4MigrationBackupSectionDataItem,
  IV4MigrationPayload,
  IV4OnAccountMigrated,
  IV4OnWalletMigrated,
} from '../../migrations/v4ToV5Migration/types';
import type {
  IV4DBNetwork,
  IV4DBVariantAccount,
} from '../../migrations/v4ToV5Migration/v4local/v4localDBTypesSchema';
import type { V4LocalDbRealm } from '../../migrations/v4ToV5Migration/v4local/v4realm/V4LocalDbRealm';
import type { IV4Token } from '../../migrations/v4ToV5Migration/v4types';
import type { IV4MigrationAtom } from '../../states/jotai/atoms/v4migration';
import type { VaultBase } from '../../vaults/base/VaultBase';

@backgroundClass()
class ServiceV4Migration extends ServiceBase {
  constructor({ backgroundApi }: { backgroundApi: any }) {
    super({ backgroundApi });
  }

  migrationAccount = new V4MigrationForAccount({
    backgroundApi: this.backgroundApi,
  });

  migrationAddressBook = new V4MigrationForAddressBook({
    backgroundApi: this.backgroundApi,
  });

  migrationHistory = new V4MigrationForHistory({
    backgroundApi: this.backgroundApi,
  });

  migrationDiscover = new V4MigrationForDiscover({
    backgroundApi: this.backgroundApi,
  });

  migrationSettings = new V4MigrationForSettings({
    backgroundApi: this.backgroundApi,
  });

  migrationSecurePassword = new V4MigrationForSecurePassword({
    backgroundApi: this.backgroundApi,
  });

  migrationCustomTokens = new V4MigrationForCustomTokens({
    backgroundApi: this.backgroundApi,
  });

  migrationPayload: IV4MigrationPayload | undefined;

  async getMigrationPasswordV5() {
    const pwd = this.migrationPayload?.v5password || '';
    if (!pwd) {
      throw new Error('Migration v5 password not set');
    }
    return pwd;
  }

  async getMigrationPasswordV4() {
    const pwd =
      this.migrationPayload?.v4password ||
      this.migrationPayload?.v5password ||
      '';
    if (!pwd) {
      throw new Error('Migration v4 password not set');
    }
    return pwd;
  }

  async getMigrationPayload() {
    return this.migrationPayload;
  }

  @backgroundMethod()
  async testShowData() {
    const data = await v4dbHubs.v4reduxDb.reduxData;
    const simpleDbAccountHistory =
      await v4dbHubs.v4simpleDb.history.getAccountHistory({
        accountId: 'hd-1--1',
      });
    const dbWallets = await v4dbHubs.v4localDb.getAllRecords({
      name: EV4LocalDBStoreNames.Wallet,
    });
    const dbAccounts = await v4dbHubs.v4localDb.getAllRecords({
      name: EV4LocalDBStoreNames.Account,
    });
    const allAccounts = dbAccounts.records;
    const dbWallet = dbWallets.records[0];
    const result = {
      simpleDbAccountHistory,
      reduxSettings: data?.settings,
      dbWallet,
      accounts: dbWallet.accounts,
      associatedDevice: dbWallet.associatedDevice,
      allAccounts: dbAccounts.records,
    };
    console.log('testV4MigrationData', result);
    console.log(
      'testV4MigrationData allAccounts ============',
      JSON.stringify(allAccounts, null, 2),
    );
    console.log(
      'testV4MigrationData wallet ============',
      JSON.stringify(dbWallets.records, null, 2),
    );
    if (platformEnv.isNative) {
      console.log({
        dbVersion: (await (appGlobals.$$localDbV4 as V4LocalDbRealm).readyDb)
          ?.realm?.schemaVersion,
        dbName: (await (appGlobals.$$localDbV4 as V4LocalDbRealm).readyDb)
          ?.realm?.path,
      });
    }
    return result;
  }

  async v4localDbRecordsCountGreaterThan({
    name,
    value,
  }: {
    name: EV4LocalDBStoreNames;
    value: number;
  }) {
    return v4dbHubs.logger.runAsyncWithCatch(
      async () => {
        const v4localDb = v4dbHubs.v4localDb;
        const { count } = await v4localDb.getRecordsCount({
          name,
        });
        return count > value;
      },
      {
        name: `check db records count: ${name}`,
        errorResultFn: () => false,
      },
    );
  }

  @backgroundMethod()
  async canRenameFromV4AccountName({
    indexedAccount,
  }: {
    indexedAccount: IDBIndexedAccount | undefined;
  }) {
    if (!indexedAccount) {
      return false;
    }
    const v4dbExist = await this.checkIfV4DbExist();
    if (!v4dbExist) {
      return false;
    }
    return simpleDb.v4MigrationResult.isV5IndexedAccountIdMigrated({
      v5indexedAccountId: indexedAccount.id,
    });
  }

  @backgroundMethod()
  @toastIfError()
  async checkIfV4DbExist() {
    try {
      return await v4localDbExists();
    } catch (error) {
      return false;
    }
  }

  async updateV4Password({
    oldPassword,
    newPassword,
  }: {
    oldPassword: string;
    newPassword: string;
  }) {
    try {
      const isV4DbExists = await this.checkIfV4DbExist();
      if (!isV4DbExists) {
        return;
      }
      await v4dbHubs.v4localDb.updateV4Password({ oldPassword, newPassword });
    } catch (error) {
      //
      console.error('updateV4Password error', error);
    }
  }

  async saveAppStorageV4migrationAutoStartDisabled({
    v4migrationAutoStartDisabled,
  }: {
    v4migrationAutoStartDisabled: boolean | undefined;
  }) {
    await appStorage.setItem(
      '$$_OneKey_V4Migration_AutoStart_Disabled_$$',
      v4migrationAutoStartDisabled ? 'true' : '',
    );
  }

  async getAppStorageV4migrationAutoStartDisabled() {
    return appStorage.getItem('$$_OneKey_V4Migration_AutoStart_Disabled_$$');
  }

  @backgroundMethod()
  @toastIfError()
  async checkShouldMigrateV4OnMount() {
    if (platformEnv.isWeb) {
      return false;
    }

    const v4migrationPersistData = await v4migrationPersistAtom.get();
    if (v4migrationPersistData?.v4migrationAutoStartDisabled) {
      return false;
    }

    if (await this.getAppStorageV4migrationAutoStartDisabled()) {
      return false;
    }

    let v4dbExist = true;
    v4dbExist = await v4dbHubs.logger.runAsyncWithCatch(
      async () => this.checkIfV4DbExist(),
      {
        name: `check v4 db exist: ${
          platformEnv.isNative ? V4_REALM_DB_NAME : V4_INDEXED_DB_NAME
        }`,
        errorResultFn: () => false,
      },
    );

    if (v4dbExist) {
      const isV4PasswordSet = await v4dbHubs.logger.runAsyncWithCatch(
        async () => {
          const v4DbContext = await this.migrationAccount.getV4LocalDbContext();
          if (
            v4DbContext &&
            v4DbContext.verifyString !== DEFAULT_VERIFY_STRING
          ) {
            return true;
          }
          return false;
        },
        {
          name: 'check v4 password set',
          errorResultFn: () => false,
        },
      );

      if (isV4PasswordSet) {
        return true;
      }

      if (
        await this.v4localDbRecordsCountGreaterThan({
          name: EV4LocalDBStoreNames.Device,
          value: 0,
        })
      ) {
        return true;
      }
      if (
        await this.v4localDbRecordsCountGreaterThan({
          name: EV4LocalDBStoreNames.Wallet,
          value: 3,
        })
      ) {
        return true;
      }
      if (
        await this.v4localDbRecordsCountGreaterThan({
          name: EV4LocalDBStoreNames.Credential,
          value: 0,
        })
      ) {
        return true;
      }
      if (
        await this.v4localDbRecordsCountGreaterThan({
          name: EV4LocalDBStoreNames.Account,
          value: 0,
        })
      ) {
        return true;
      }
    }

    // const v4localDbContext = await this.migrationAccount.getV4LocalDbContext();
    // persist migration status to global atom
    return false;
  }

  @backgroundMethod()
  @toastIfError()
  async migrateBaseSettings() {
    try {
      const storageKey = '$$$_OneKey_V4Migration_BaseSettings_Migrated_$$$';
      // migrateBaseSettings may cause app reload, so we should check
      const isBaseSettingsMigrated = await appStorage.getItem(storageKey);
      if (isBaseSettingsMigrated) {
        return;
      }
      await appStorage.setItem(storageKey, 'true');
      await this.migrationSettings.migrateBaseSettings();
    } catch (error) {
      //
    }
  }

  async verifyV4PasswordEqualToV5({
    v5password,
  }: {
    v5password: string;
  }): Promise<true | false | 'not-set'> {
    const v4DbContext = await this.migrationAccount.getV4LocalDbContext();
    if (v4DbContext && v4DbContext.verifyString === DEFAULT_VERIFY_STRING) {
      return 'not-set';
    }
    try {
      if (v4DbContext?.verifyString) {
        const result = await decryptVerifyString({
          password: v5password,
          verifyString: v4DbContext?.verifyString,
        });
        return result === DEFAULT_VERIFY_STRING;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  @backgroundMethod()
  @toastIfError()
  async setV4Password({ v4password }: { v4password: string }) {
    const result = await this.verifyV4PasswordEqualToV5({
      v5password: v4password,
    });
    if (result === 'not-set') {
      return true;
    }
    if (result === true) {
      if (this.migrationPayload) {
        this.migrationPayload.v4password = v4password;
      }
      return true;
    }
    throw new IncorrectPassword();
  }

  @backgroundMethod()
  async shouldMigratePassword(): Promise<{
    isV4PasswordSet: boolean;
    isV4AddressBookAvailable: boolean;
    shouldMigratePassword: boolean;
  }> {
    return v4dbHubs.logger.runAsyncWithCatch(
      async () => {
        // this.migrationAccount.is
        const isV4PasswordSet = await v4dbHubs.v4localDb.isPasswordSet();
        const addressBookItems =
          await this.migrationAddressBook.getV4AddressBookItems();
        const isV4AddressBookAvailable = Boolean(addressBookItems.length);
        return {
          isV4PasswordSet,
          isV4AddressBookAvailable,
          shouldMigratePassword: isV4PasswordSet || isV4AddressBookAvailable,
        };
      },
      {
        name: 'should migrate password check',
        errorResultFn: () => ({
          isV4AddressBookAvailable: false,
          isV4PasswordSet: true,
          shouldMigratePassword: true,
        }),
      },
    );
  }

  @backgroundMethod()
  @toastIfError()
  async prepareMigration({
    isAutoStartOnMount,
  }: {
    isAutoStartOnMount: boolean;
  }): Promise<IV4MigrationPayload> {
    this.migrationPayload = undefined;
    await this.clearV4MigrationPayload();

    let migrateV4PasswordOk = false;
    let migrateV4SecurePasswordOk = false;

    migrateV4PasswordOk = await v4dbHubs.logger.runAsyncWithCatch(
      async () => this.migrationAccount.migrateV4PasswordToV5(),
      {
        name: 'migrate v4 password to v5',
        errorResultFn: () => false,
      },
    );

    migrateV4SecurePasswordOk = await v4dbHubs.logger.runAsyncWithCatch(
      async () => this.migrationSecurePassword.convertV4SecurePasswordToV5(),
      {
        name: 'migrate v4 secure password to v5',
        errorResultFn: () => false,
      },
    );

    const { shouldMigratePassword } = await this.shouldMigratePassword();

    let v5password = '';
    let isV4PasswordEqualToV5: 'not-set' | boolean = 'not-set';

    if (shouldMigratePassword) {
      v5password = await v4dbHubs.logger.runAsyncWithCatch(
        async () => {
          const passwordRes =
            await this.backgroundApi.servicePassword.promptPasswordVerify({
              reason: EReasonForNeedPassword.Security,
            });

          if (!passwordRes?.password) {
            throw new Error('password not set');
          }
          return passwordRes?.password || '';
        },
        {
          name: 'prompt password verify',
          errorResultFn: 'throwError',
        },
      );

      isV4PasswordEqualToV5 = await this.verifyV4PasswordEqualToV5({
        v5password,
      });
    }

    const wallets = await v4dbHubs.logger.runAsyncWithCatch(
      async () => this.migrationAccount.getV4Wallets(),
      {
        name: 'get v4 wallets',
        logResultFn: (result) => `wallets count: ${result.length}`,
        errorResultFn: () => [],
      },
    );

    const walletsForBackup = await v4dbHubs.logger.runAsyncWithCatch(
      async () =>
        this.migrationAccount.buildV4WalletsForBackup({
          v4wallets: wallets,
        }),
      {
        name: 'build v4 wallets for backup',
        logResultFn: (result) => `wallets for backup count: ${result.length}`,
        errorResultFn: () => [],
      },
    );

    this.migrationPayload = await v4dbHubs.logger.runAsyncWithCatch(
      async () => {
        let totalWalletsAndAccounts = 0;
        for (const wallet of wallets) {
          if (!wallet.isExternal) {
            if (wallet.isHD || wallet.isHw) {
              totalWalletsAndAccounts += 1;
            }
            totalWalletsAndAccounts += wallet?.wallet?.accounts?.length || 0;
          }
        }
        const migrationPayload: IV4MigrationPayload = {
          v5password,
          v4password: isV4PasswordEqualToV5 === true ? v5password : '',
          isV4PasswordEqualToV5,
          migrateV4PasswordOk,
          migrateV4SecurePasswordOk,
          shouldBackup: walletsForBackup.length > 0,
          wallets,
          walletsForBackup,
          totalWalletsAndAccounts,
          isAutoStartOnMount,
        };
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        await v4migrationAtom.set((v: IV4MigrationAtom) => ({
          // ...v,
          progress: 0,
          backedUpMark: {},
          isProcessing: false,
        }));
        return migrationPayload;
      },
      {
        name: 'prepare migration payload',
        logResultFn: (result) =>
          JSON.stringify({
            migrateV4PasswordOk: result?.migrateV4PasswordOk,
            migrateV4SecurePasswordOk: result?.migrateV4SecurePasswordOk,
            shouldBackup: result?.shouldBackup,
            walletsCount: result?.wallets?.length,
            walletsForBackupCount: result?.walletsForBackup?.length,
            totalWalletsAndAccounts: result?.totalWalletsAndAccounts,
          }),
        errorResultFn: 'throwError',
      },
    );

    return this.migrationPayload;
  }

  @backgroundMethod()
  async isAtMigrationPage() {
    const v4migrationData = await v4migrationAtom.get();
    if (
      v4migrationData?.isProcessing ||
      v4migrationData?.isMigrationModalOpen
    ) {
      return true;
    }
    return false;
  }

  @backgroundMethod()
  @toastIfError()
  async buildV4WalletsForBackupSectionData() {
    const walletsForBackup = await v4dbHubs.logger.runAsyncWithCatch(
      async () => this?.migrationPayload?.walletsForBackup || [],
      {
        name: 'get walletsForBackup from migrationPayload',
        logResultFn: (result) => `walletsForBackup count: ${result.length}`,
        errorResultFn: () => [],
      },
    );

    const hdWalletSectionData: IV4MigrationBackupSectionDataItem = {
      title: appLocale.intl.formatMessage({ id: ETranslations.global_wallets }),
      data: [
        // { hdWallet: undefined }
      ],
    };

    const importedAccountsSectionData: IV4MigrationBackupSectionDataItem = {
      title: appLocale.intl.formatMessage({
        id: ETranslations.global_private_key,
      }),
      data: [
        // { importedAccount: undefined }
      ],
    };

    for (const w of walletsForBackup) {
      v4dbHubs.logger.log({
        name: 'loop walletsForBackup',
        type: 'info',
        payload: JSON.stringify({
          id: w?.wallet?.id,
          name: w?.wallet?.name,
          accountsCount: w?.wallet?.accounts?.length,
        }),
      });
      if (w.isHD) {
        const accountsCount = w?.wallet?.accounts?.length || 0;
        hdWalletSectionData.data.push({
          hdWallet: w?.wallet,
          backupId: `v4-hd-backup:${w?.wallet?.id}`,
          title: w?.wallet?.name || '--',
          subTitle: appLocale.intl.formatMessage(
            { id: ETranslations.global_count_addresses },
            {
              count: accountsCount,
            },
          ),
        });
        v4dbHubs.logger.log({
          name: 'push hd wallet for backup',
          type: 'info',
          payload: JSON.stringify({
            id: w?.wallet?.id,
            name: w?.wallet?.name,
            count: accountsCount,
          }),
        });
      }
      if (w?.isImported) {
        if (w?.wallet?.accounts?.length) {
          for (const accountId of w.wallet.accounts) {
            v4dbHubs.logger.log({
              name: 'loop importedAccountsForBackup',
              type: 'info',
              payload: JSON.stringify({
                walletId: w?.wallet?.id,
                accountId,
              }),
            });
            await v4dbHubs.logger.runAsyncWithCatch(
              async () => {
                const v4account = await v4dbHubs.v4localDb.getRecordById({
                  name: EV4LocalDBStoreNames.Account,
                  id: accountId,
                });

                const isAccountSupport = true;
                // const isAccountSupport = v4MigrationUtils.isCoinTypeSupport({
                //   coinType: account?.coinType,
                // });
                if (isAccountSupport) {
                  const networkId = v4CoinTypeToNetworkId[v4account?.coinType];
                  const network =
                    await this.backgroundApi.serviceNetwork.getNetworkSafe({
                      networkId,
                    });
                  let addressOrPub = v4account.address || v4account.pub || '--';

                  try {
                    if (
                      [
                        COINTYPE_CFX,
                        COINTYPE_DOT,
                        COINTYPE_COSMOS,
                        COINTYPE_NEXA,
                      ].includes(v4account.coinType)
                    ) {
                      const realAddress = Object.values(
                        (v4account as IV4DBVariantAccount)?.addresses || {},
                      )?.[0];
                      addressOrPub = realAddress || addressOrPub || '--';

                      if (networkId) {
                        const vault = (await vaultFactory?.getChainOnlyVault({
                          networkId,
                        })) as VaultBase;
                        const addressDetail =
                          await vault?.buildAccountAddressDetail({
                            account: v4account as any,
                            networkId,
                            networkInfo: await vault.getNetworkInfo(),
                          });
                        if (addressDetail.address) {
                          addressOrPub = addressDetail.address;
                        }
                      }
                    }
                  } catch (error) {
                    //
                  }

                  importedAccountsSectionData.data.push({
                    importedAccount: v4account,
                    network,
                    networkId,
                    backupId: `v4-imported-backup:${v4account.id}`,
                    title: v4account.name || '--',
                    subTitle: accountUtils.shortenAddress({
                      // TODO regenerate address of certain network
                      address: addressOrPub,
                    }),
                  });
                  return {
                    accountId,
                    account: v4account,
                    networkId,
                    network,
                    addressOrPub,
                  };
                }
              },
              {
                name: 'push imported account for backup',
                logResultFn: (result) =>
                  JSON.stringify({
                    walletId: w?.wallet?.id,
                    accountId: result?.accountId,
                    accountName: result?.account?.name,
                    coinType: result?.account?.coinType,
                    networkId: result?.networkId,
                    networkName: result?.network?.name,
                    address: result?.account?.address,
                    pub: result?.account?.pub,
                  }),
                errorResultFn: () => undefined,
              },
            );
          }
        }
      }
    }

    const sectionData: IV4MigrationBackupSectionData = [];

    if (hdWalletSectionData.data.length) {
      sectionData.push(hdWalletSectionData);
    }

    if (importedAccountsSectionData.data.length) {
      sectionData.push(importedAccountsSectionData);
    }

    return sectionData;
  }

  @backgroundMethod()
  @toastIfError()
  async revealV4HdMnemonic({ hdWalletId }: { hdWalletId: string }) {
    return v4dbHubs.logger.runAsyncWithCatch(
      async () => this.migrationAccount.revealV4HdMnemonic({ hdWalletId }),
      {
        name: `reveal v4 hd mnemonic: ${hdWalletId}`,
        errorResultFn: 'throwError',
      },
    );
  }

  @backgroundMethod()
  @toastIfError()
  async revealV4ImportedPrivateKey({
    accountId,
    password,
  }: {
    accountId: string;
    password?: string;
  }) {
    return v4dbHubs.logger.runAsyncWithCatch(
      async () =>
        this.migrationAccount.revealV4ImportedPrivateKey({
          accountId,
          password,
        }),
      {
        name: `reveal v4 imported private key: ${accountId}`,
        errorResultFn: 'throwError',
      },
    );
  }

  @backgroundMethod()
  @toastIfError()
  async startV4MigrationFlow() {
    try {
      const initProgress = 1;
      const maxProgress = {
        account: 90,
        addressBook: 92,
        discover: 94,
        history: 96,
        settings: 98,
      };
      const v4migrationPersistData = await v4migrationPersistAtom.get();
      const isFirstTimeMigration =
        !v4migrationPersistData?.v4migrationAutoStartDisabled;
      const isResumeMode = Boolean(this.migrationPayload?.isAutoStartOnMount);

      await v4migrationAtom.set((v) => ({ ...v, isProcessing: true }));
      await v4migrationAtom.set((v) => ({
        ...v,
        progress: initProgress,
      }));
      await timerUtils.wait(10);

      // **** migrate accounts
      const totalWalletsAndAccounts =
        this.migrationPayload?.totalWalletsAndAccounts || 0;
      let actualWalletsAndAccountsMigrated = 0;
      const increaseProgressOfAccount = async () => {
        actualWalletsAndAccountsMigrated += 1;
        const progress = Math.min(
          Math.floor(
            (actualWalletsAndAccountsMigrated / totalWalletsAndAccounts) * 100,
          ),
          100,
        );
        await v4migrationAtom.set((v) => ({
          ...v,
          progress: Math.max(
            initProgress,
            Math.floor((progress * maxProgress.account) / 100),
          ),
        }));
        await timerUtils.wait(10);
      };

      const v4wallets = this.migrationPayload?.wallets || [];
      for (const v4walletInfo of v4wallets) {
        await v4dbHubs.logger.runAsyncWithCatch(
          async () => {
            v4dbHubs.logger.saveWalletDetailsV4({
              v4walletId: v4walletInfo?.wallet?.id,
              v4wallet: v4walletInfo?.wallet,
            });
            const onWalletMigrated: IV4OnWalletMigrated = async (v5wallet) => {
              try {
                v4dbHubs.logger.saveWalletDetailsV5({
                  v4walletId: v4walletInfo?.wallet?.id,
                  v5wallet,
                });
                await increaseProgressOfAccount();
                await simpleDb.v4MigrationResult.saveMigratedWalletId({
                  v4walletId: v4walletInfo?.wallet?.id,
                  v5walletId: v5wallet?.id || '',
                });
              } catch (error) {
                //
              }
            };
            const onAccountMigrated: IV4OnAccountMigrated = async (
              v5account,
              v4account,
            ) => {
              try {
                v4dbHubs.logger.saveAccountDetailsV5({
                  v4accountId: v4account?.id,
                  v5account,
                });
                await increaseProgressOfAccount();
                await simpleDb.v4MigrationResult.saveMigratedAccountId({
                  v4accountId: v4account?.id,
                  v5accountId: v5account?.id || '',
                });
                await this.migrationCustomTokens.migrateCustomTokens({
                  v4Account: v4account,
                  v5Account: v5account,
                });
              } catch (error) {
                //
              }
            };

            if (v4walletInfo.isHw) {
              await v4dbHubs.logger.runAsyncWithCatch(
                async () => {
                  await this.migrationAccount.migrateHwWallet({
                    v4wallet: v4walletInfo.wallet,
                    onWalletMigrated,
                    onAccountMigrated,
                    isResumeMode,
                  });
                  await timerUtils.wait(300);
                },
                {
                  name: `migrate hw wallet: ${v4walletInfo?.wallet?.id}`,
                  errorResultFn: () => undefined,
                },
              );
            }

            if (v4walletInfo.isHD) {
              await v4dbHubs.logger.runAsyncWithCatch(
                async () => {
                  await this.migrationAccount.migrateHdWallet({
                    v4wallet: v4walletInfo.wallet,
                    onWalletMigrated,
                    onAccountMigrated,
                    isResumeMode,
                  });
                  await timerUtils.wait(300);
                },
                {
                  name: `migrate hd wallet: ${v4walletInfo?.wallet?.id}`,
                  errorResultFn: () => undefined,
                },
              );
            }

            if (v4walletInfo.isImported) {
              await v4dbHubs.logger.runAsyncWithCatch(
                async () => {
                  await this.migrationAccount.migrateImportedAccounts({
                    v4wallet: v4walletInfo.wallet,
                    onWalletMigrated,
                    onAccountMigrated,
                    isResumeMode,
                  });
                  await timerUtils.wait(300);
                },
                {
                  name: `migrate imported accounts: ${v4walletInfo?.wallet?.id}`,
                  errorResultFn: () => undefined,
                },
              );
            }

            if (v4walletInfo.isWatching) {
              await v4dbHubs.logger.runAsyncWithCatch(
                async () => {
                  await this.migrationAccount.migrateWatchingAccounts({
                    v4wallet: v4walletInfo.wallet,
                    onWalletMigrated,
                    onAccountMigrated,
                    isResumeMode,
                  });
                  await timerUtils.wait(300);
                },
                {
                  name: `migrate watching accounts: ${v4walletInfo?.wallet?.id}`,
                  errorResultFn: () => undefined,
                },
              );
            }

            return v4walletInfo;
          },
          {
            name: `migrate each wallet: ${v4walletInfo?.wallet?.id}`,
            logResultFn: (result) =>
              JSON.stringify({
                id: result?.wallet?.id,
                name: result?.wallet?.name,
                accountsCount: result?.wallet?.accounts?.length,
              }),
            errorResultFn: () => undefined,
          },
        );
      }

      await v4migrationAtom.set((v) => ({
        ...v,
        progress: maxProgress.account,
      }));

      // **** migrate address book
      await timerUtils.wait(600);
      await v4dbHubs.logger.runAsyncWithCatch(
        async () => this.migrationAddressBook.convertV4ContactsToV5(),
        {
          name: 'convert v4 contacts to v5',
          errorResultFn: () => undefined,
        },
      );
      await v4migrationAtom.set((v) => ({
        ...v,
        progress: maxProgress.addressBook,
      }));

      // **** migrate discover
      await timerUtils.wait(600);
      await v4dbHubs.logger.runAsyncWithCatch(
        async () => this.migrationDiscover.convertV4DiscoverToV5(),
        {
          name: 'convert v4 discover to v5',
          errorResultFn: () => undefined,
        },
      );
      await v4migrationAtom.set((v) => ({
        ...v,
        progress: maxProgress.discover,
      }));

      // **** migrate history
      await timerUtils.wait(600);
      await v4dbHubs.logger.runAsyncWithCatch(
        async () => this.migrationHistory.migrateLocalPendingTxs(),
        {
          name: 'migrate v4 local pending txs',
          errorResultFn: () => undefined,
        },
      );
      await v4migrationAtom.set((v) => ({
        ...v,
        progress: maxProgress.history,
      }));

      if (isFirstTimeMigration) {
        // **** migrate settings
        await timerUtils.wait(600);
        await v4dbHubs.logger.runAsyncWithCatch(
          async () => this.migrationSettings.migrateSettings(),
          {
            name: 'migrate v4 settings',
            errorResultFn: () => undefined,
          },
        );
        await v4migrationAtom.set((v) => ({
          ...v,
          progress: maxProgress.settings,
        }));

        // **** migrate secure password for desktop
        await v4dbHubs.logger.runAsyncWithCatch(
          async () => this.migrationSecurePassword.writeSecurePasswordToV5(),
          {
            name: 'migrate secure password for desktop',
            errorResultFn: () => undefined,
          },
        );
      }

      // ----------------------------------------------
      await timerUtils.wait(600);
      this.migrationPayload = undefined;
      await this.clearV4MigrationPayload();

      await v4migrationAtom.set((v) => ({
        ...v,
        progress: 100,
      }));
      await v4migrationPersistAtom.set((v) => ({
        ...v,
        v4migrationAutoStartDisabled: true,
      }));

      return {
        totalWalletsAndAccounts,
        actualWalletsAndAccountsMigrated,
      };
    } finally {
      await v4migrationAtom.set((v) => ({ ...v, isProcessing: false }));
    }
  }

  @backgroundMethod()
  async clearV4MigrationPayload() {
    this.migrationPayload = undefined;
  }

  @backgroundMethod()
  @toastIfError()
  async getV4MigrationLogs() {
    return v4dbHubs.logger.getLogs();
  }

  @backgroundMethod()
  @toastIfError()
  async clearV4MigrationLogs() {
    return v4dbHubs.logger.clearLogs();
  }

  private async getV4AllNetworks() {
    const v4localDb = v4dbHubs.v4localDb;
    const r = await v4localDb.getAllRecords({
      name: EV4LocalDBStoreNames.Network,
    });
    const v4networks: IV4DBNetwork[] = r?.records || [];
    return v4networks;
  }

  private async getV4PresetNetworkIdsSet() {
    const v4ServerNetworks =
      await v4dbHubs.v4simpleDb.serverNetworks.getServerNetworks();
    return new Set([
      ...v4ServerNetworks.map((o) => o.id),
      ...v4PresetNetworkIds,
    ]);
  }

  @backgroundMethod()
  async getV4CustomRpcUrls() {
    const reduxData = await v4dbHubs.v4reduxDb.reduxData;
    const customNetworkRpcMap = reduxData?.settings?.customNetworkRpcMap;
    if (customNetworkRpcMap) {
      const v4networks = await this.getV4AllNetworks();
      const networkNameMap = v4networks.reduce((result, item) => {
        result[item.id] = item.name;
        return result;
      }, {} as Record<string, string>);
      return Object.entries(customNetworkRpcMap).map(([key, value]) => ({
        networkId: key,
        networkName: networkNameMap[key] ?? key,
        rpcUrls: value,
      }));
    }
  }

  private async getV4CustomEvmNetworks() {
    const v4networks = await this.getV4AllNetworks();
    const v4PresetNetworkIdsSet = await this.getV4PresetNetworkIdsSet();
    const v4CustomEvmNetworks = v4networks.filter(
      (o) =>
        networkUtils.isEvmNetwork({ networkId: o.id }) &&
        !v4PresetNetworkIdsSet.has(o.id),
    );
    return v4CustomEvmNetworks;
  }

  private async getV4CustomTokenList() {
    const reduxData = await v4dbHubs.v4reduxDb.reduxData;
    const accountTokens = reduxData?.tokens?.accountTokens;
    if (accountTokens) {
      return Object.entries(accountTokens)
        .map(([key, value]) => ({
          networkId: key,
          tokens: uniqBy(flatten(Object.values(value)), (o) =>
            o.address?.toLowerCase(),
          ).filter((o) => Boolean(o.address)),
        }))
        .reduce((result, item) => {
          result[item.networkId] = item.tokens;
          return result;
        }, {} as Record<string, IV4Token[]>);
    }
  }

  @backgroundMethod()
  async getV4CustomNetworkIncludeTokens() {
    const v4EvmNetworks = await this.getV4CustomEvmNetworks();
    const v4CustomTokenList = await this.getV4CustomTokenList();
    return v4EvmNetworks.map((network) => {
      const tokens = v4CustomTokenList?.[network.id] || [];
      return {
        network,
        tokens,
      };
    });
  }
}

export default ServiceV4Migration;
