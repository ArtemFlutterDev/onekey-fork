import { debounce, isEmpty, isNil } from 'lodash';

import coreChainApi from '@onekeyhq/core/src/instance/coreChainApi';
import type { IBip39RevealableSeedEncryptHex } from '@onekeyhq/core/src/secret';
import {
  EMnemonicType,
  decodeSensitiveTextAsync,
  decryptRevealableSeed,
  encryptImportedCredential,
  ensureSensitiveTextEncoded,
  mnemonicFromEntropy,
  revealEntropyToMnemonic,
  revealableSeedFromMnemonic,
  revealableSeedFromTonMnemonic,
  sha256,
  tonMnemonicFromEntropy,
  tonValidateMnemonic,
  validateMnemonic,
} from '@onekeyhq/core/src/secret';
import type {
  EAddressEncodings,
  IExportKeyType,
} from '@onekeyhq/core/src/types';
import { ECoreApiExportedSecretKeyType } from '@onekeyhq/core/src/types';
import {
  backgroundClass,
  backgroundMethod,
  toastIfError,
} from '@onekeyhq/shared/src/background/backgroundDecorators';
import { getNetworkIdsMap } from '@onekeyhq/shared/src/config/networkIds';
import { ALL_NETWORK_ACCOUNT_MOCK_ADDRESS } from '@onekeyhq/shared/src/consts/addresses';
import { BTC_FIRST_TAPROOT_PATH } from '@onekeyhq/shared/src/consts/chainConsts';
import {
  WALLET_TYPE_EXTERNAL,
  WALLET_TYPE_HD,
  WALLET_TYPE_IMPORTED,
  WALLET_TYPE_WATCHING,
} from '@onekeyhq/shared/src/consts/dbConsts';
import {
  COINTYPE_ALLNETWORKS,
  FIRST_EVM_ADDRESS_PATH,
  IMPL_ALLNETWORKS,
  IMPL_EVM,
} from '@onekeyhq/shared/src/engine/engineConsts';
import {
  InvalidMnemonic,
  OneKeyError,
  OneKeyInternalError,
} from '@onekeyhq/shared/src/errors';
import { DeviceNotOpenedPassphrase } from '@onekeyhq/shared/src/errors/errors/hardwareErrors';
import { EOneKeyErrorClassNames } from '@onekeyhq/shared/src/errors/types/errorTypes';
import errorUtils from '@onekeyhq/shared/src/errors/utils/errorUtils';
import {
  EAppEventBusNames,
  appEventBus,
} from '@onekeyhq/shared/src/eventBus/appEventBus';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { appLocale } from '@onekeyhq/shared/src/locale/appLocale';
import { defaultLogger } from '@onekeyhq/shared/src/logger/logger';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import type { IChangeHistoryUpdateItem } from '@onekeyhq/shared/src/types/changeHistory';
import {
  EChangeHistoryContentType,
  EChangeHistoryEntityType,
} from '@onekeyhq/shared/src/types/changeHistory';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import { checkIsDefined } from '@onekeyhq/shared/src/utils/assertUtils';
import bufferUtils from '@onekeyhq/shared/src/utils/bufferUtils';
import { memoizee } from '@onekeyhq/shared/src/utils/cacheUtils';
import cloudSyncUtils from '@onekeyhq/shared/src/utils/cloudSyncUtils';
import perfUtils, {
  EPerformanceTimerLogNames,
} from '@onekeyhq/shared/src/utils/debug/perfUtils';
import deviceUtils from '@onekeyhq/shared/src/utils/deviceUtils';
import type { IAvatarInfo } from '@onekeyhq/shared/src/utils/emojiUtils';
import { randomAvatar } from '@onekeyhq/shared/src/utils/emojiUtils';
import networkUtils from '@onekeyhq/shared/src/utils/networkUtils';
import stringUtils from '@onekeyhq/shared/src/utils/stringUtils';
import timerUtils from '@onekeyhq/shared/src/utils/timerUtils';
import type { IServerNetwork } from '@onekeyhq/shared/types';
import type {
  IBatchCreateAccount,
  IHwQrWalletWithDevice,
  INetworkAccount,
  IQrWalletAirGapAccount,
} from '@onekeyhq/shared/types/account';
import type { IGeneralInputValidation } from '@onekeyhq/shared/types/address';
import type { IDeviceSharedCallParams } from '@onekeyhq/shared/types/device';
import { EConfirmOnDeviceType } from '@onekeyhq/shared/types/device';
import type { IExternalConnectWalletResult } from '@onekeyhq/shared/types/externalWallet.types';
import { EReasonForNeedPassword } from '@onekeyhq/shared/types/setting';

import { EDBAccountType } from '../../dbs/local/consts';
import localDb from '../../dbs/local/localDb';
import { ELocalDBStoreNames } from '../../dbs/local/localDBStoreNames';
import simpleDb from '../../dbs/simple/simpleDb';
import { devSettingsPersistAtom } from '../../states/jotai/atoms';
import { vaultFactory } from '../../vaults/factory';
import { getVaultSettings } from '../../vaults/settings';
import ServiceBase from '../ServiceBase';

import type {
  IDBAccount,
  IDBCreateHwWalletParams,
  IDBCreateHwWalletParamsBase,
  IDBCreateQRWalletParams,
  IDBCredentialBase,
  IDBDevice,
  IDBEnsureAccountNameNotDuplicateParams,
  IDBExternalAccount,
  IDBGetWalletsParams,
  IDBIndexedAccount,
  IDBRemoveWalletParams,
  IDBSetAccountNameParams,
  IDBSetUniversalIndexedAccountNameParams,
  IDBSetWalletNameAndAvatarParams,
  IDBUtxoAccount,
  IDBVariantAccount,
  IDBWallet,
  IDBWalletId,
  IDBWalletIdSingleton,
} from '../../dbs/local/types';
import type {
  IAccountDeriveInfo,
  IAccountDeriveInfoItems,
  IAccountDeriveTypes,
  IHwAllNetworkPrepareAccountsResponse,
  IPrepareHardwareAccountsParams,
  IPrepareHdAccountsParams,
  IPrepareImportedAccountsParams,
  IPrepareWatchingAccountsParams,
  IValidateGeneralInputParams,
} from '../../vaults/types';
import type { IWithHardwareProcessingControlParams } from '../ServiceHardwareUI/ServiceHardwareUI';

export type IAddHDOrHWAccountsParams = {
  walletId: string | undefined;
  networkId: string | undefined;
  indexes?: Array<number>; // multiple add by indexes
  names?: Array<string>;
  indexedAccountId: string | undefined; // single add by indexedAccountId
  deriveType: IAccountDeriveTypes;
  hwAllNetworkPrepareAccountsResponse?: IHwAllNetworkPrepareAccountsResponse;
  isVerifyAddressAction?: boolean;
  createAllDeriveTypes?: boolean;

  // purpose?: number;
  // skipRepeat?: boolean;
  // callback?: (_account: Account) => Promise<boolean>;
  // isAddInitFirstAccountOnly?: boolean;
  // template?: string;
  // skipCheckAccountExist?: boolean;
} & IWithHardwareProcessingControlParams;
export type IAddHDOrHWAccountsResult = {
  networkId: string;
  walletId: string;
  indexedAccountId: string | undefined;
  indexes: number[] | undefined;
  accounts: IBatchCreateAccount[];
  deriveType: IAccountDeriveTypes;
};

@backgroundClass()
class ServiceAccount extends ServiceBase {
  constructor({ backgroundApi }: { backgroundApi: any }) {
    super({ backgroundApi });

    appEventBus.on(EAppEventBusNames.WalletUpdate, () => {
      this.clearAccountCache();
    });
    appEventBus.on(EAppEventBusNames.AccountRemove, () => {
      this.clearAccountCache();
    });
    appEventBus.on(EAppEventBusNames.AccountUpdate, () => {
      this.clearAccountCache();
    });
    appEventBus.on(EAppEventBusNames.RenameDBAccounts, () => {
      this.clearAccountCache();
    });
    appEventBus.on(EAppEventBusNames.WalletRename, () => {
      this.clearAccountCache();
    });
    appEventBus.on(EAppEventBusNames.AddDBAccountsToWallet, () => {
      this.clearAccountCache();
    });
  }

  clearAccountCache() {
    this.getIndexedAccountWithMemo.clear();
    localDb.clearStoreCachedData();
  }

  @backgroundMethod()
  async validateMnemonic(mnemonic: string): Promise<{
    mnemonic: string;
    mnemonicType: EMnemonicType;
  }> {
    ensureSensitiveTextEncoded(mnemonic);
    const realMnemonic = await decodeSensitiveTextAsync({
      encodedText: mnemonic,
    });
    const realMnemonicFixed = realMnemonic.trim().replace(/\s+/g, ' ');
    // TODO check by wordlists first
    if (!validateMnemonic(realMnemonicFixed)) {
      if (await tonValidateMnemonic(realMnemonicFixed.split(' '))) {
        return {
          mnemonic: realMnemonicFixed,
          mnemonicType: EMnemonicType.TON,
        };
      }
      throw new InvalidMnemonic();
    }
    return {
      mnemonic: realMnemonicFixed,
      mnemonicType: EMnemonicType.BIP39,
    };
  }

  @backgroundMethod()
  async getWallet({ walletId }: { walletId: string }): Promise<IDBWallet> {
    return localDb.getWallet({ walletId });
  }

  @backgroundMethod()
  async checkIsWalletNotBackedUp({
    walletId,
  }: {
    walletId: string;
  }): Promise<boolean> {
    try {
      const resp = await new Promise<boolean>((resolve, reject) => {
        const promiseId = this.backgroundApi.servicePromise.createCallback({
          resolve,
          reject,
        });
        appEventBus.emit(EAppEventBusNames.CheckWalletBackupStatus, {
          promiseId,
          walletId,
        });
      });
      return !resp;
    } catch (e) {
      return true;
    }
  }

  @backgroundMethod()
  async getWalletSafe({
    walletId,
    withoutRefill,
  }: {
    walletId: string;
    withoutRefill?: boolean;
  }): Promise<IDBWallet | undefined> {
    return localDb.getWalletSafe({ walletId, withoutRefill });
  }

  // TODO move to serviceHardware
  @backgroundMethod()
  async getWalletDevice({ walletId }: { walletId: string }) {
    return localDb.getWalletDevice({ walletId });
  }

  @backgroundMethod()
  async getWalletDeviceSafe({
    dbWallet,
    walletId,
  }: {
    dbWallet?: IDBWallet;
    walletId: string;
  }) {
    return localDb.getWalletDeviceSafe({ dbWallet, walletId });
  }

  @backgroundMethod()
  async getAccountDeviceSafe({ accountId }: { accountId: string }) {
    const walletId = accountUtils.getWalletIdFromAccountId({ accountId });
    if (!walletId) {
      return null;
    }
    const device = await this.getWalletDeviceSafe({ walletId });
    if (!device) {
      return null;
    }
    return device;
  }

  // TODO move to serviceHardware
  @backgroundMethod()
  async getDevice({ dbDeviceId }: { dbDeviceId: string }) {
    return localDb.getDevice(dbDeviceId);
  }

  @backgroundMethod()
  async getWallets(options?: IDBGetWalletsParams) {
    return localDb.getWallets(options);
  }

  @backgroundMethod()
  async getAllHdHwQrWallets(options?: IDBGetWalletsParams) {
    const r = await this.getWallets(options);
    const wallets = r.wallets.filter(
      (wallet) =>
        accountUtils.isHdWallet({ walletId: wallet.id }) ||
        accountUtils.isQrWallet({ walletId: wallet.id }) ||
        accountUtils.isHwWallet({
          walletId: wallet.id,
        }),
    );
    return {
      wallets,
    };
  }

  @backgroundMethod()
  async getAllHwQrWalletWithDevice(params?: {
    filterQrWallet?: boolean;
    filterHiddenWallet?: boolean;
    skipDuplicateDevice?: boolean;
  }) {
    const { wallets, allDevices } = await this.getAllWallets({
      refillWalletInfo: true,
    });

    const filterQrWallet = params?.filterQrWallet ?? false;
    const filterHiddenWallet = params?.filterHiddenWallet ?? false;
    const skipDuplicateDevice = params?.skipDuplicateDevice ?? false;

    const result: {
      [walletId: string]: IHwQrWalletWithDevice;
    } = {};

    // Map of deviceId -> walletId for hardware wallets
    const deviceToHwWalletMap: Record<string, string> = {};

    // Collect all hardware wallet device IDs if skip duplication is enabled
    if (skipDuplicateDevice) {
      for (const wallet of wallets) {
        if (
          accountUtils.isHwWallet({ walletId: wallet.id }) &&
          !accountUtils.isHwHiddenWallet({ wallet }) &&
          wallet.associatedDevice
        ) {
          deviceToHwWalletMap[wallet.associatedDevice] = wallet.id;
        }
      }
    }

    for (const wallet of wallets) {
      const isHiddenWallet = accountUtils.isHwHiddenWallet({ wallet });
      const isHwWallet = accountUtils.isHwWallet({ walletId: wallet.id });
      const isQrWallet = accountUtils.isQrWallet({ walletId: wallet.id });

      // Check if this wallet should be included in the result
      const isValidWalletType = isHwWallet || isQrWallet;
      const passesHiddenWalletFilter = !filterHiddenWallet || !isHiddenWallet;
      const passesQrWalletFilter = !filterQrWallet || !isQrWallet;
      const passesDeviceDuplicationCheck = !(
        skipDuplicateDevice &&
        isQrWallet &&
        wallet.associatedDevice &&
        deviceToHwWalletMap[wallet.associatedDevice]
      );

      // Only add wallet to result if it passes all checks
      if (
        isValidWalletType &&
        passesHiddenWalletFilter &&
        passesQrWalletFilter &&
        passesDeviceDuplicationCheck
      ) {
        const device = (allDevices ?? []).find(
          (d) => d.id === wallet.associatedDevice,
        );
        result[wallet.id] = {
          wallet,
          device,
        };
      }
    }

    return result;
  }

  @backgroundMethod()
  async isWalletHasIndexedAccounts({ walletId }: { walletId: string }) {
    const { accounts: indexedAccounts } = await this.getIndexedAccountsOfWallet(
      {
        walletId,
      },
    );
    // TODO use getRecordsCount instead
    if (indexedAccounts.length > 0) {
      return true;
    }
    return false;
  }

  async getAllCredentials() {
    const credentials = await localDb.getAllCredentials();
    const credentialsExisted: IDBCredentialBase[] = [];
    const credentialsRemoved: IDBCredentialBase[] = [];

    for (const credential of credentials) {
      let isRemoved = false;
      if (accountUtils.isHdWallet({ walletId: credential.id })) {
        const wallet = await this.getWalletSafe({ walletId: credential.id });
        if (!wallet) {
          isRemoved = true;
        }
      }
      if (accountUtils.isImportedAccount({ accountId: credential.id })) {
        const account = await this.getDBAccountSafe({
          accountId: credential.id,
        });
        if (!account) {
          isRemoved = true;
        }
      }
      if (isRemoved) {
        credentialsRemoved.push(credential);
      } else {
        credentialsExisted.push(credential);
      }
    }
    return {
      credentials: credentialsExisted,
      credentialsRemoved,
    };
  }

  @backgroundMethod()
  async dumpCredentials() {
    const { credentials } = await this.getAllCredentials();
    return credentials.reduce(
      (mapping, { id, credential }) =>
        Object.assign(mapping, { [id]: credential }),
      {},
    );
  }

  @backgroundMethod()
  async getCredentialDecryptFromCredential({
    credential,
    password,
  }: {
    credential: string;
    password: string;
  }) {
    ensureSensitiveTextEncoded(password);
    const rs = await decryptRevealableSeed({
      rs: credential,
      password,
    });
    const mnemonic = revealEntropyToMnemonic(rs.entropyWithLangPrefixed);
    return { rs, mnemonic };
  }

  @backgroundMethod()
  async getCredentialDecrypt({
    password,
    credentialId,
  }: {
    credentialId: string;
    password: string;
  }) {
    ensureSensitiveTextEncoded(password);
    const dbCredential = await localDb.getCredential(credentialId);
    const { mnemonic, rs } = await this.getCredentialDecryptFromCredential({
      password,
      credential: dbCredential.credential,
    });
    return {
      rs,
      dbCredential,
      mnemonic,
    };
  }

  @backgroundMethod()
  async getIndexedAccount({ id }: { id: string }) {
    return this.getIndexedAccountWithMemo({ id });
  }

  getIndexedAccountWithMemo = memoizee(
    ({ id }: { id: string }) => localDb.getIndexedAccount({ id }),
    {
      maxAge: timerUtils.getTimeDurationMs({ seconds: 10 }),
    },
  );

  @backgroundMethod()
  async getIndexedAccountSafe({ id }: { id: string }) {
    return localDb.getIndexedAccountSafe({ id });
  }

  @backgroundMethod()
  async getIndexedAccountByAccount({
    account,
  }: {
    account: IDBAccount | undefined;
  }) {
    return localDb.getIndexedAccountByAccount({ account });
  }

  async buildPrepareHdOrHwIndexes({
    indexedAccountId,
    indexes,
  }: {
    indexedAccountId: string | undefined;
    indexes: number[] | undefined;
  }) {
    const usedIndexes = indexes || [];
    if (indexedAccountId) {
      const indexedAccount = await this.getIndexedAccount({
        id: indexedAccountId,
      });
      usedIndexes.unshift(indexedAccount.index);
    }
    if (usedIndexes.some((index) => index >= 2 ** 31)) {
      throw new OneKeyInternalError(
        'addHDAccounts ERROR: Invalid child index, should be less than 2^31.',
      );
    }
    if (usedIndexes.length <= 0) {
      throw new OneKeyInternalError({
        message: 'addHDAccounts ERROR: indexed is empty',
      });
    }
    return usedIndexes;
  }

  async getPrepareHDOrHWAccountsParams({
    walletId,
    networkId,
    indexes,
    names,
    indexedAccountId,
    deriveType,
    confirmOnDevice,
    hwAllNetworkPrepareAccountsResponse,
    isVerifyAddressAction,
  }: {
    walletId: string | undefined;
    networkId: string | undefined;
    indexes?: Array<number>;
    names?: Array<string>; // custom names
    indexedAccountId: string | undefined;
    deriveType: IAccountDeriveTypes;
    confirmOnDevice?: EConfirmOnDeviceType;
    hwAllNetworkPrepareAccountsResponse?: IHwAllNetworkPrepareAccountsResponse;
    isVerifyAddressAction?: boolean;
  }) {
    if (!walletId) {
      throw new Error('walletId is required');
    }
    if (!networkId) {
      throw new Error('networkId is required');
    }
    if (!deriveType) {
      throw new Error('deriveType is required');
    }
    const { isHardware, password, deviceParams } =
      await this.backgroundApi.servicePassword.promptPasswordVerifyByWallet({
        walletId,
        reason: EReasonForNeedPassword.Default,
      });

    const wallet = await this.getWalletSafe({
      walletId,
    });
    if (password && wallet && accountUtils.isHdWallet({ walletId })) {
      await this.generateHDWalletMissingHashAndXfp({
        password,
        hdWallets: [wallet].filter(Boolean),
      });
    }

    // canAutoCreateNextAccount
    // skip exists account added
    // postAccountAdded
    // active first account

    const usedIndexes = await this.buildPrepareHdOrHwIndexes({
      indexedAccountId,
      indexes,
    });

    // const usedPurpose = await getVaultSettingsDefaultPurpose({ networkId });
    const deriveInfo =
      await this.backgroundApi.serviceNetwork.getDeriveInfoOfNetwork({
        networkId,
        deriveType,
      });

    let prepareParams:
      | IPrepareHdAccountsParams
      | IPrepareHardwareAccountsParams;
    if (isHardware) {
      const hwParams: IPrepareHardwareAccountsParams = {
        deviceParams: {
          ...checkIsDefined(deviceParams),
          confirmOnDevice,
        },

        indexes: usedIndexes,
        names,
        deriveInfo,
        hwAllNetworkPrepareAccountsResponse,
      };
      prepareParams = hwParams;
    } else {
      const hdParams: IPrepareHdAccountsParams = {
        // type: 'ADD_ACCOUNTS', // for hardware only?
        password,

        indexes: usedIndexes,
        names,
        deriveInfo,
        // purpose: usedPurpose,
        // deriveInfo, // TODO pass deriveInfo to generate id and name
        // skipCheckAccountExist, // BTC required
      };
      prepareParams = hdParams;
    }

    prepareParams.isVerifyAddressAction = isVerifyAddressAction;

    return {
      deviceParams,
      prepareParams,
      walletId,
      networkId,
    };
  }

  async prepareHdOrHwAccounts(params: IAddHDOrHWAccountsParams) {
    // addHDOrHWAccounts
    const {
      indexes,
      indexedAccountId,
      deriveType,
      skipCloseHardwareUiStateDialog,
      skipDeviceCancel,
      skipDeviceCancelAtFirst,
      hideCheckingDeviceLoading,
      skipWaitingAnimationAtFirst,
    } = params;

    const { prepareParams, deviceParams, networkId, walletId } =
      await this.getPrepareHDOrHWAccountsParams(params);

    try {
      defaultLogger.account.accountCreatePerf.prepareHdOrHwAccountsStart(
        params,
      );

      const vault = await vaultFactory.getWalletOnlyVault({
        networkId,
        walletId,
      });

      const r =
        await this.backgroundApi.serviceHardwareUI.withHardwareProcessing(
          async () => {
            // addHDOrHWAccounts
            const accounts = await vault.keyring.prepareAccounts(prepareParams);
            return {
              vault,
              accounts,
              networkId,
              walletId,
            };
          },
          {
            deviceParams,
            skipCloseHardwareUiStateDialog,
            skipDeviceCancel,
            skipDeviceCancelAtFirst,
            hideCheckingDeviceLoading,
            debugMethodName: 'keyring.prepareAccounts',
            skipWaitingAnimationAtFirst,
          },
        );

      defaultLogger.account.accountCreatePerf.prepareHdOrHwAccountsEnd(params);
      return r;
    } catch (error) {
      // TODO merge with EmptyAccount\canCreateAddress\isNetworkNotMatched\EmptyAccount
      if (
        networkId &&
        accountUtils.isQrWallet({ walletId }) &&
        errorUtils.isErrorByClassName({
          error,
          className: [
            EOneKeyErrorClassNames.VaultKeyringNotDefinedError,
            EOneKeyErrorClassNames.OneKeyErrorNotImplemented,
          ],
        })
      ) {
        const network = await this.backgroundApi.serviceNetwork.getNetworkSafe({
          networkId,
        });
        throw new OneKeyError({
          message: appLocale.intl.formatMessage(
            {
              id: ETranslations.wallet_unsupported_network_title,
            },
            {
              network: network?.name || '',
            },
          ),
        });
      }
      throw error;
    }
  }

  @backgroundMethod()
  async addBatchCreatedHdOrHwAccount({
    walletId,
    networkId,
    account,
  }: {
    walletId: string;
    networkId: string;
    account: IBatchCreateAccount;
  }) {
    const { addressDetail, existsInDb, displayAddress, ...dbAccount } = account;
    if (isNil(dbAccount.pathIndex)) {
      throw new Error(
        'addBatchCreatedHdOrHwAccount ERROR: pathIndex is required',
      );
    }
    await this.addIndexedAccount({
      walletId,
      indexes: [dbAccount.pathIndex],
      skipIfExists: true,
    });
    await localDb.addAccountsToWallet({
      allAccountsBelongToNetworkId: networkId,
      walletId,
      accounts: [dbAccount],
    });
  }

  @backgroundMethod()
  async addHDOrHWAccountsFn(
    params: IAddHDOrHWAccountsParams,
  ): Promise<IAddHDOrHWAccountsResult | undefined> {
    // addHDOrHWAccounts
    const {
      walletId,
      networkId,
      deriveType,
      indexes,
      indexedAccountId,
      ...others
    } = params;

    const usedIndexes = await this.buildPrepareHdOrHwIndexes({
      indexedAccountId,
      indexes,
    });

    const { accountsForCreate } =
      await this.backgroundApi.serviceBatchCreateAccount.startBatchCreateAccountsFlow(
        {
          mode: 'normal',
          params: {
            walletId: walletId || '',
            networkId: networkId || '',
            deriveType,
            indexes: usedIndexes,
            saveToDb: true,
            ...others,
          },
        },
      );

    return {
      networkId: networkId || '',
      walletId: walletId || '',
      indexedAccountId,
      accounts: accountsForCreate,
      indexes,
      deriveType,
    };
  }

  @backgroundMethod()
  @toastIfError()
  async addHDOrHWAccounts(params: IAddHDOrHWAccountsParams) {
    return this.addHDOrHWAccountsFn(params);
  }

  @backgroundMethod()
  @toastIfError()
  async restoreAccountsToWallet(params: {
    walletId: string;
    accounts: IDBAccount[];
    importedCredential?: string;
  }) {
    const { walletId, accounts, importedCredential } = params;
    const wallet = await this.getWalletSafe({ walletId });
    const shouldCreateIndexAccount =
      accountUtils.isHdWallet({ walletId }) ||
      accountUtils.isHwWallet({ walletId });
    if (shouldCreateIndexAccount) {
      await Promise.all(
        accounts.map(async (account) => {
          const { idSuffix } = accountUtils.parseAccountId({
            accountId: account.id,
          });
          const indexedAccountNo = account.indexedAccountId
            ? accountUtils.parseIndexedAccountId({
                indexedAccountId: account.indexedAccountId,
              }).index
            : 0;
          const indexedAccountId = accountUtils.buildIndexedAccountId({
            walletId,
            index: indexedAccountNo,
          });
          account.id = accountUtils.buildHDAccountId({
            walletId,
            networkImpl: account.impl,
            index: account.pathIndex,
            template: account.template,
            idSuffix,
            isUtxo: account.type === EDBAccountType.UTXO,
          });
          account.indexedAccountId = indexedAccountId;
        }),
      );
    }
    // restoreAccountsToWallet
    const { existsAccounts } = await localDb.addAccountsToWallet({
      walletId,
      accounts,
      importedCredential,
    });
    if (shouldCreateIndexAccount) {
      await this.addIndexedAccount({
        walletId,
        indexes: accounts.map((account) =>
          account.indexedAccountId
            ? accountUtils.parseIndexedAccountId({
                indexedAccountId: account.indexedAccountId,
              }).index
            : 0,
        ),
        skipIfExists: true,
      });
      for (const account of accounts) {
        const isAccountExists = existsAccounts.some(
          (existsAccount) => existsAccount.id === account.id,
        );
        if (!isAccountExists) {
          if (wallet?.xfp && account.indexedAccountId) {
            await this.setUniversalIndexedAccountName({
              name: account.name,
              indexedAccountId: account.indexedAccountId,
              index: accountUtils.parseIndexedAccountId({
                indexedAccountId: account.indexedAccountId,
              }).index,
              walletXfp: wallet.xfp,
            });
          } else {
            await this.setAccountName({
              name: account.name,
              indexedAccountId: account.indexedAccountId,
            });
          }
        }
      }
    }
  }

  @backgroundMethod()
  async validateGeneralInputOfImporting({
    input,
    networkId,
    ...others
  }: IValidateGeneralInputParams & {
    networkId: string;
  }): Promise<IGeneralInputValidation> {
    ensureSensitiveTextEncoded(input);
    const vault = await vaultFactory.getChainOnlyVault({
      networkId,
    });
    const result = await vault.validateGeneralInput({ input, ...others });
    return result;
  }

  @backgroundMethod()
  async getNetworkSupportedExportKeyTypes({
    networkId,
    exportType,
    accountId,
  }: {
    networkId: string;
    exportType: IExportKeyType;
    accountId?: string;
  }) {
    const settings = await getVaultSettings({ networkId });
    let keyTypes: ECoreApiExportedSecretKeyType[] | undefined;
    if (exportType === 'privateKey') {
      keyTypes = settings.supportExportedSecretKeys?.filter((item) =>
        [
          ECoreApiExportedSecretKeyType.privateKey,
          ECoreApiExportedSecretKeyType.xprvt,
        ].includes(item),
      );
    }
    if (exportType === 'publicKey') {
      keyTypes = settings.supportExportedSecretKeys?.filter((item) =>
        [
          ECoreApiExportedSecretKeyType.publicKey,
          ECoreApiExportedSecretKeyType.xpub,
        ].includes(item),
      );
    }
    if (exportType === 'mnemonic') {
      if (accountId) {
        const hasMnemonic = await this.hasTonImportedAccountMnemonic({
          accountId,
        });
        if (hasMnemonic) {
          keyTypes = settings.supportExportedSecretKeys?.filter((item) =>
            [ECoreApiExportedSecretKeyType.mnemonic].includes(item),
          );
        }
      }
    }
    return keyTypes;
  }

  @backgroundMethod()
  @toastIfError()
  async exportAccountKeysByType({
    accountId,
    indexedAccountId,
    networkId,
    deriveType,
    exportType,
    accountName,
  }: {
    accountId: string | undefined;
    indexedAccountId: string | undefined;
    networkId: string;
    deriveType: IAccountDeriveTypes | undefined;
    exportType: IExportKeyType;
    accountName: string | undefined;
  }) {
    if (!accountId && !indexedAccountId) {
      throw new Error('accountId or indexedAccountId is required');
    }
    if (accountId && indexedAccountId) {
      throw new Error(
        'accountId and indexedAccountId can not be used at the same time',
      );
    }
    let dbAccountId = accountId;
    if (indexedAccountId) {
      if (!deriveType) {
        throw new Error('deriveType required');
      }
      dbAccountId = await this.getDbAccountIdFromIndexedAccountId({
        indexedAccountId,
        networkId,
        deriveType,
      });
    }
    if (!dbAccountId) {
      throw new Error('dbAccountId required');
    }
    const dbAccount = await this.getDBAccountSafe({
      accountId: dbAccountId,
    });

    if (!dbAccount) {
      const network = await this.backgroundApi.serviceNetwork.getNetworkSafe({
        networkId,
      });
      let deriveInfo: IAccountDeriveInfo | undefined;
      let deriveItems: IAccountDeriveInfoItems[] | undefined;
      if (deriveType) {
        deriveInfo =
          await this.backgroundApi.serviceNetwork.getDeriveInfoOfNetwork({
            networkId,
            deriveType,
          });
        deriveItems =
          await this.backgroundApi.serviceNetwork.getDeriveInfoItemsOfNetwork({
            networkId,
          });
      }
      throw new Error(
        appLocale.intl.formatMessage(
          {
            id: ETranslations.global_private_key_error,
          },
          {
            network: network?.name || '',
            path:
              deriveItems?.length && deriveItems?.length > 1
                ? deriveInfo?.label || deriveType || ''
                : '',
          },
        ),
      );
    }
    const keyTypes = await this.getNetworkSupportedExportKeyTypes({
      networkId,
      exportType,
    });
    const keyType = keyTypes?.[0];
    if (!keyType) {
      // throw new Error(
      //   appLocale.intl.formatMessage({
      //     id: ETranslations.hardware_not_support,
      //   }),
      // );
      throw new Error('Export keyType not found for the network');
    }
    if (exportType === 'privateKey') {
      return this.exportAccountSecretKey({
        accountId: dbAccountId,
        networkId,
        keyType,
      });
    }
    if (exportType === 'publicKey') {
      return this.exportAccountPublicKey({
        accountId: dbAccountId,
        networkId,
        keyType,
      });
    }
    throw new Error(`exportType not supported: ${String(exportType)}`);
  }

  @backgroundMethod()
  @toastIfError()
  async exportAccountSecretKey({
    accountId,
    networkId,
    keyType,
  }: {
    accountId: string;
    networkId: string;
    keyType: ECoreApiExportedSecretKeyType;
  }): Promise<string> {
    const vault = await vaultFactory.getVault({ networkId, accountId });
    const { password } =
      await this.backgroundApi.servicePassword.promptPasswordVerifyByAccount({
        accountId,
        reason: EReasonForNeedPassword.Security,
      });
    return vault.keyring.exportAccountSecretKeys({
      password,
      keyType,
    });
  }

  @backgroundMethod()
  @toastIfError()
  async exportAccountPublicKey({
    accountId,
    networkId,
    keyType,
  }: {
    accountId: string;
    networkId: string;
    keyType: ECoreApiExportedSecretKeyType;
  }): Promise<string | undefined> {
    const buildResult = async (account: IDBAccount | undefined) => {
      if (!account) {
        throw new Error('exportAccountPublicKey ERROR: account not found');
      }
      let publicKey: string | undefined;
      if (keyType === ECoreApiExportedSecretKeyType.publicKey) {
        publicKey = account?.pub;
      }
      if (keyType === ECoreApiExportedSecretKeyType.xpub) {
        publicKey = (account as IDBUtxoAccount | undefined)?.xpub;
      }
      if (!publicKey) {
        throw new Error('publicKey not found');
      }
      return publicKey;
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password } =
      await this.backgroundApi.servicePassword.promptPasswordVerifyByAccount({
        accountId,
        reason: EReasonForNeedPassword.Security,
      });
    const account: IDBAccount | undefined = await this.getAccount({
      accountId,
      networkId,
    });
    if (accountUtils.isHwOrQrAccount({ accountId })) {
      const walletId = accountUtils.getWalletIdFromAccountId({ accountId });
      const indexedAccountId = account.indexedAccountId;
      const { deriveType } =
        await this.backgroundApi.serviceNetwork.getDeriveTypeByDBAccount({
          networkId,
          account,
        });
      const { prepareParams, deviceParams } =
        await this.getPrepareHDOrHWAccountsParams({
          walletId,
          networkId,
          indexedAccountId,
          deriveType,
          confirmOnDevice: EConfirmOnDeviceType.EveryItem,
        });
      const vault = await vaultFactory.getWalletOnlyVault({
        networkId,
        walletId,
      });

      // const accounts = await vault.keyring.prepareAccounts(prepareParams);
      const { accountsForCreate } =
        await this.backgroundApi.serviceBatchCreateAccount.previewBatchBuildAccounts(
          {
            walletId,
            networkId,
            deriveType,
            indexes: prepareParams.indexes,
            showOnOneKey: true,
          },
        );
      return buildResult(accountsForCreate?.[0]);
    }
    return buildResult(account);
  }

  @backgroundMethod()
  @toastIfError()
  async addImportedAccount({
    input,
    networkId,
    deriveType,
    name,
    shouldCheckDuplicateName,
  }: {
    input: string;
    networkId: string;
    deriveType: IAccountDeriveTypes | undefined;
    name?: string;
    shouldCheckDuplicateName?: boolean;
  }) {
    ensureSensitiveTextEncoded(input);
    const walletId = WALLET_TYPE_IMPORTED;
    const vault = await vaultFactory.getWalletOnlyVault({
      networkId,
      walletId,
    });
    const { privateKey } = await vault.getPrivateKeyFromImported({ input });
    return this.addImportedAccountWithCredential({
      credential: privateKey,
      networkId,
      deriveType,
      name,
      shouldCheckDuplicateName,
    });
  }

  @backgroundMethod()
  @toastIfError()
  async addImportedAccountWithCredential({
    credential,
    networkId,
    deriveType,
    name,
    fallbackName,
    shouldCheckDuplicateName,
    skipAddIfNotEqualToAddress,
  }: {
    name?: string;
    fallbackName?: string;
    shouldCheckDuplicateName?: boolean;
    credential: string;
    networkId: string;
    deriveType: IAccountDeriveTypes | undefined;
    skipAddIfNotEqualToAddress?: string;
  }): Promise<{
    networkId: string;
    walletId: string;
    accounts: IDBAccount[];
    isOverrideAccounts: boolean;
  }> {
    if (platformEnv.isWebDappMode) {
      throw new Error(
        'addImportedAccountWithCredential ERROR: Not supported in Dapp mode',
      );
    }
    const walletId = WALLET_TYPE_IMPORTED;

    if (shouldCheckDuplicateName && name) {
      await localDb.ensureAccountNameNotDuplicate({
        name,
        walletId,
      });
    }

    const vault = await vaultFactory.getWalletOnlyVault({
      networkId,
      walletId,
    });
    // TODO privateKey should be HEX format
    ensureSensitiveTextEncoded(credential);

    const privateKeyDecoded = await decodeSensitiveTextAsync({
      encodedText: credential,
    });

    const { password } =
      await this.backgroundApi.servicePassword.promptPasswordVerifyByWallet({
        walletId,
      });
    const credentialEncrypt = await encryptImportedCredential({
      credential: {
        privateKey: privateKeyDecoded,
      },
      password,
    });
    const params: IPrepareImportedAccountsParams = {
      password,
      name: name || '',
      importedCredential: credentialEncrypt,
      networks: [networkId],
      createAtNetwork: networkId,
    };
    if (deriveType) {
      const deriveInfo =
        await this.backgroundApi.serviceNetwork.getDeriveInfoOfNetwork({
          networkId,
          deriveType,
        });
      if (deriveInfo) params.deriveInfo = deriveInfo;
    }

    // addImportedAccount
    const accounts = await vault.keyring.prepareAccounts(params);

    if (
      skipAddIfNotEqualToAddress &&
      accounts.length === 1 &&
      accounts?.[0]?.address &&
      accounts?.[0]?.address !== skipAddIfNotEqualToAddress
    ) {
      return {
        networkId,
        walletId,
        accounts: [],
        isOverrideAccounts: false,
      };
    }

    const { isOverrideAccounts, existsAccounts } =
      await localDb.addAccountsToWallet({
        allAccountsBelongToNetworkId: networkId,
        walletId,
        accounts,
        importedCredential: credentialEncrypt,
        accountNameBuilder: ({ nextAccountId }) => {
          if (fallbackName) {
            return fallbackName;
          }
          return accountUtils.buildBaseAccountName({ nextAccountId });
        },
      });
    appEventBus.emit(EAppEventBusNames.AccountUpdate, undefined);

    if (isOverrideAccounts && existsAccounts.length) {
      void this.addAccountNameChangeHistory({
        accounts,
        existsAccounts,
      });
    }

    return {
      networkId,
      walletId,
      accounts,
      isOverrideAccounts,
    };
  }

  @backgroundMethod()
  async addExternalAccount({
    connectResult,
  }: {
    connectResult: IExternalConnectWalletResult;
  }) {
    const walletId = WALLET_TYPE_EXTERNAL;

    const isWalletConnect = !!connectResult.connectionInfo.walletConnect;

    let accounts: IDBExternalAccount[] = [];

    const { notSupportedNetworkIds, connectionInfo, accountInfo } =
      connectResult;
    const { addresses, networkIds, impl, createAtNetwork, name } = accountInfo;

    if (isWalletConnect) {
      // walletconnect should create multiple chain accounts
      for (const networkId of checkIsDefined(networkIds)) {
        const accountId = accountUtils.buildExternalAccountId({
          wcSessionTopic: connectResult.connectionInfo?.walletConnect?.topic,
          connectionInfo: connectResult.connectionInfo,
          networkId,
        });

        const { isMergedNetwork } = accountUtils.getWalletConnectMergedNetwork({
          networkId,
        });
        const account: IDBExternalAccount = {
          id: accountId,
          type: EDBAccountType.VARIANT,
          name: '',
          connectionInfoRaw: stringUtils.safeStringify(connectionInfo),
          addresses: {},
          connectedAddresses: addresses, // TODO merge with addresses
          selectedAddress: {},
          address: '',
          pub: '',
          path: '',
          coinType: '',
          impl: networkUtils.getNetworkImpl({ networkId }),
          createAtNetwork: networkId,
          networks: isMergedNetwork ? undefined : [networkId],
        };
        if (!accounts.find((item) => item.id === accountId)) {
          accounts.push(account);
        }
      }
    } else {
      // injected create single account
      const accountId = accountUtils.buildExternalAccountId({
        wcSessionTopic: connectResult.connectionInfo?.walletConnect?.topic,
        connectionInfo: connectResult.connectionInfo,
      });

      const account: IDBExternalAccount = {
        id: accountId,
        type: EDBAccountType.VARIANT,
        name: '',
        connectionInfoRaw: stringUtils.safeStringify(connectionInfo),
        addresses: {},
        connectedAddresses: addresses, // TODO merge with addresses
        selectedAddress: {},
        address: '',
        pub: '',
        path: '',
        coinType: '',
        impl,
        createAtNetwork,
        networks: networkIds,
      };
      accounts = [account];
    }

    // addExternalAccount
    await localDb.addAccountsToWallet({
      walletId,
      accounts,
      accountNameBuilder: ({ nextAccountId }) =>
        accountUtils.buildBaseAccountName({
          mainName: name || 'Account',
          nextAccountId,
        }),
    });
    appEventBus.emit(EAppEventBusNames.AccountUpdate, undefined);

    if (notSupportedNetworkIds && notSupportedNetworkIds?.length > 0) {
      // TODO show external wallet switch network dialog to evm--1
      void this.backgroundApi.serviceApp.showToast({
        method: 'error',
        title: `Not supported network: ${notSupportedNetworkIds.join(', ')}`,
      });
    }
    return {
      walletId,
      accounts,
    };
  }

  @backgroundMethod()
  @toastIfError()
  async addWatchingAccount({
    input,
    networkId,
    deriveType,
    name,
    fallbackName,
    shouldCheckDuplicateName,
    isUrlAccount,
    skipAddIfNotEqualToAddress,
  }: {
    input: string;
    networkId: string;
    name?: string;
    fallbackName?: string;
    shouldCheckDuplicateName?: boolean;
    deriveType?: IAccountDeriveTypes;
    isUrlAccount?: boolean;
    skipAddIfNotEqualToAddress?: string;
  }): Promise<{
    networkId: string;
    walletId: string;
    accounts: IDBAccount[];
    isOverrideAccounts: boolean;
  }> {
    if (networkUtils.isAllNetwork({ networkId })) {
      throw new Error(
        'addWatchingAccount ERROR: networkId should not be all networks',
      );
    }
    const walletId = WALLET_TYPE_WATCHING;

    if (name && shouldCheckDuplicateName) {
      await localDb.ensureAccountNameNotDuplicate({
        name,
        walletId,
      });
    }

    // /evm/0x63ac73816EeB38514DaE6c46008baf55f1c59C9e
    if (networkId === IMPL_EVM) {
      // eslint-disable-next-line no-param-reassign
      networkId = getNetworkIdsMap().eth;
    }

    const network = await this.backgroundApi.serviceNetwork.getNetwork({
      networkId,
    });
    if (!network) {
      throw new Error('addWatchingAccount ERROR: network not found');
    }

    const vault = await vaultFactory.getWalletOnlyVault({
      networkId,
      walletId,
    });
    let address = '';
    let xpub = '';
    let btcForkAddressEncoding: EAddressEncodings | undefined;
    const addressValidationResult = await vault.validateAddress(input);
    if (addressValidationResult.isValid) {
      address = addressValidationResult.normalizedAddress;
      btcForkAddressEncoding = addressValidationResult.encoding;
    } else {
      const xpubValidationResult = await vault.validateXpub(input);
      if (xpubValidationResult.isValid) {
        xpub = input;
      }
    }
    if (!address && !xpub) {
      throw new Error('input not valid');
    }

    const params: IPrepareWatchingAccountsParams = {
      address,
      xpub,
      name: name || '',
      networks: [networkId],
      createAtNetwork: networkId,
      isUrlAccount,
    };

    let deriveTypeByAddressEncoding: IAccountDeriveTypes | undefined;
    if (btcForkAddressEncoding) {
      deriveTypeByAddressEncoding =
        await this.backgroundApi.serviceNetwork.getDeriveTypeByAddressEncoding({
          encoding: btcForkAddressEncoding,
          networkId,
        });
      if (
        deriveType &&
        deriveTypeByAddressEncoding &&
        deriveTypeByAddressEncoding !== deriveType
      ) {
        throw new Error('addWatchingAccount ERROR: deriveType not correct');
      }
    }

    if (!deriveType && deriveTypeByAddressEncoding) {
      // eslint-disable-next-line no-param-reassign
      deriveType = deriveTypeByAddressEncoding;
    }

    if (deriveType) {
      const deriveInfo =
        await this.backgroundApi.serviceNetwork.getDeriveInfoOfNetwork({
          networkId,
          deriveType,
        });
      if (deriveInfo) params.deriveInfo = deriveInfo;
    }

    // addWatchingAccount
    const accounts = await vault.keyring.prepareAccounts(params);

    if (
      skipAddIfNotEqualToAddress &&
      accounts.length === 1 &&
      accounts?.[0]?.address &&
      accounts?.[0]?.address !== skipAddIfNotEqualToAddress
    ) {
      return {
        networkId,
        walletId,
        accounts: [],
        isOverrideAccounts: false,
      };
    }

    const { isOverrideAccounts, existsAccounts } =
      await localDb.addAccountsToWallet({
        allAccountsBelongToNetworkId: networkId,
        walletId,
        accounts,
        accountNameBuilder: ({ nextAccountId }) => {
          if (isUrlAccount) {
            return `Url Account ${Date.now()}`;
          }
          if (fallbackName) {
            return fallbackName;
          }
          return accountUtils.buildBaseAccountName({ nextAccountId });
        },
      });
    appEventBus.emit(EAppEventBusNames.AccountUpdate, undefined);

    if (isOverrideAccounts && existsAccounts.length) {
      void this.addAccountNameChangeHistory({
        accounts,
        existsAccounts,
      });
    }
    return {
      networkId,
      walletId,
      accounts,
      isOverrideAccounts,
    };
  }

  async addAccountNameChangeHistory({
    accounts,
    existsAccounts,
  }: {
    accounts: IDBAccount[];
    existsAccounts: IDBAccount[];
  }) {
    const items: IChangeHistoryUpdateItem[] = accounts
      .map((account) => {
        const oldName =
          existsAccounts.find((item) => item.id === account.id)?.name || '';
        const newName = account.name || '';
        if (!newName || !oldName) {
          return null;
        }
        return {
          entityType: EChangeHistoryEntityType.Account,
          entityId: account.id,
          contentType: EChangeHistoryContentType.Name,
          oldValue: oldName,
          value: newName,
        };
      })
      .filter(Boolean);

    // Record the name change history
    await simpleDb.changeHistory.addChangeHistory({
      items,
    });
  }

  @backgroundMethod()
  async getIndexedAccountsOfWallet({ walletId }: { walletId: string }) {
    return localDb.getIndexedAccountsOfWallet({ walletId });
  }

  @backgroundMethod()
  async getSingletonAccountsOfWallet({
    walletId,
    activeNetworkId,
  }: {
    walletId: IDBWalletIdSingleton;
    activeNetworkId?: string;
  }) {
    let { accounts } = await localDb.getSingletonAccountsOfWallet({
      walletId,
    });
    accounts = await Promise.all(
      accounts.map(async (account) => {
        const { id: accountId } = account;
        try {
          const accountNetworkId = accountUtils.getAccountCompatibleNetwork({
            account,
            networkId: activeNetworkId || '',
          });
          if (accountNetworkId) {
            return await this.getAccount({
              accountId,
              networkId: accountNetworkId,
            });
          }
        } catch (e) {
          //
        }
        return account;
      }),
    );
    return { accounts };
  }

  @backgroundMethod()
  async getWalletConnectDBAccounts({ topic }: { topic: string | undefined }) {
    const { accounts } =
      await this.backgroundApi.serviceAccount.getSingletonAccountsOfWallet({
        walletId: WALLET_TYPE_EXTERNAL,
      });
    const wcAccounts = accounts
      .filter((item) => {
        const accountTopic = (item as IDBExternalAccount | undefined)
          ?.connectionInfo?.walletConnect?.topic;
        // find specific walletconnect account with same topic
        if (topic) {
          return accountTopic === topic;
        }
        // find all walletconnect accounts
        return Boolean(accountTopic);
      })
      .filter(Boolean);
    return {
      accounts: wcAccounts,
    };
  }

  @backgroundMethod()
  async getDBAccount({ accountId }: { accountId: string }) {
    const account = await localDb.getAccount({ accountId });
    return account;
  }

  @backgroundMethod()
  async getDBAccountSafe({ accountId }: { accountId: string }) {
    if (accountUtils.isAllNetworkMockAccount({ accountId })) {
      return undefined;
    }
    const account = await localDb.getAccountSafe({ accountId });
    return account;
  }

  @backgroundMethod()
  async getUrlDBAccountSafe() {
    return this.getDBAccountSafe({
      accountId: accountUtils.buildWatchingAccountId({
        coinType: '',
        isUrlAccount: true,
      }),
    });
  }

  @backgroundMethod()
  async saveAccountAddresses({
    account,
    networkId,
  }: {
    account: INetworkAccount;
    networkId: string;
  }) {
    await localDb.saveAccountAddresses({
      account,
      networkId,
    });
  }

  @backgroundMethod()
  async getAccountNameFromAddress({
    networkId,
    address,
  }: {
    networkId: string;
    address: string;
  }) {
    return this.getAccountNameFromAddressMemo({ networkId, address });
  }

  getAccountNameFromAddressMemo = memoizee(
    async ({ networkId, address }: { networkId: string; address: string }) => {
      const vault = await vaultFactory.getChainOnlyVault({
        networkId,
      });
      const { normalizedAddress } = await vault.validateAddress(address);
      return localDb.getAccountNameFromAddress({
        networkId,
        address,
        normalizedAddress,
      });
    },
    {
      promise: true,
      primitive: true,
      max: 50,
      maxAge: timerUtils.getTimeDurationMs({ seconds: 30 }),
    },
  );

  @backgroundMethod()
  async getMockedAllNetworkAccount({
    indexedAccountId,
  }: {
    indexedAccountId: string;
  }): Promise<INetworkAccount> {
    const mockAllNetworkAccountAddress = ALL_NETWORK_ACCOUNT_MOCK_ADDRESS;
    const indexedAccount = await this.getIndexedAccount({
      id: indexedAccountId,
    });
    const { index } = accountUtils.parseIndexedAccountId({ indexedAccountId });
    const realDBAccountId = await this.getDbAccountIdFromIndexedAccountId({
      indexedAccountId,
      networkId: getNetworkIdsMap().onekeyall,
      deriveType: 'default',
    });
    return {
      id: realDBAccountId,
      indexedAccountId,
      name: indexedAccount.name,
      address: mockAllNetworkAccountAddress,
      type: undefined,
      path: '',
      coinType: COINTYPE_ALLNETWORKS,
      pathIndex: index,
      impl: IMPL_ALLNETWORKS,
      pub: '',
      addresses: {},
      selectedAddress: {},
      connectionInfoRaw: '',
      connectedAddresses: {},
      connectionInfo: {},
      addressDetail: {
        isValid: true,
        allowEmptyAddress: true,
        networkId: getNetworkIdsMap().onekeyall,
        address: mockAllNetworkAccountAddress,
        baseAddress: mockAllNetworkAccountAddress,
        normalizedAddress: mockAllNetworkAccountAddress,
        displayAddress: mockAllNetworkAccountAddress,
      },
    };
  }

  @backgroundMethod()
  async getAccount({
    dbAccount,
    accountId,
    networkId,
  }: {
    dbAccount?: IDBAccount;
    accountId: string;
    networkId: string;
  }): Promise<INetworkAccount> {
    checkIsDefined(accountId);
    checkIsDefined(networkId);
    if (networkUtils.isAllNetwork({ networkId })) {
      if (
        accountUtils.isOthersWallet({
          walletId: accountUtils.getWalletIdFromAccountId({ accountId }),
        })
      ) {
        let dbAccountUsed: IDBAccount | undefined = dbAccount;
        if (!dbAccountUsed || dbAccountUsed?.id !== accountId) {
          dbAccountUsed = await localDb.getAccount({ accountId });
        }
        const realNetworkId = accountUtils.getAccountCompatibleNetwork({
          account: dbAccountUsed,
          networkId: undefined,
        });
        if (realNetworkId === getNetworkIdsMap().onekeyall) {
          throw new Error(
            'getAccount ERROR: realNetworkId can not be allnetwork',
          );
        }
        return this.getAccount({
          dbAccount: dbAccountUsed,
          accountId,
          networkId: checkIsDefined(realNetworkId),
        });
      }
      const indexedAccountId =
        accountUtils.buildAllNetworkIndexedAccountIdFromAccountId({
          accountId,
        });
      const allNetworkAccount = await this.getMockedAllNetworkAccount({
        indexedAccountId,
      });
      if (allNetworkAccount.id !== accountId) {
        throw new Error(
          'getAccount ERROR: allNetworkAccount accountId not match',
        );
      }
      return allNetworkAccount;
    }
    const vault = await vaultFactory.getVault({
      accountId,
      networkId,
    });
    const networkAccount = await vault.getAccount({ dbAccount });

    return networkAccount;
  }

  @backgroundMethod()
  async getNetworkAccount({
    dbAccount,
    accountId,
    indexedAccountId,
    deriveType,
    networkId,
  }: {
    dbAccount?: IDBAccount;
    accountId: string | undefined;
    indexedAccountId: string | undefined;
    deriveType: IAccountDeriveTypes;
    networkId: string;
  }): Promise<INetworkAccount> {
    if (accountId) {
      return this.getAccount({
        dbAccount,
        accountId,
        networkId,
      });
    }
    if (indexedAccountId) {
      if (!deriveType) {
        throw new Error('deriveType is required');
      }
      const { accounts } = await this.getAccountsByIndexedAccounts({
        networkId,
        deriveType,
        indexedAccountIds: [indexedAccountId],
        dbAccounts: [dbAccount].filter(Boolean),
      });
      if (accounts[0]) {
        return accounts[0];
      }
      throw new Error(`indexedAccounts not found: ${indexedAccountId}`);
    }
    throw new OneKeyInternalError({
      message: 'accountId or indexedAccountId missing',
    });
  }

  @backgroundMethod()
  async getAllIndexedAccounts({
    allWallets,
    filterRemoved,
  }: {
    allWallets?: IDBWallet[];
    filterRemoved?: boolean;
  } = {}) {
    const { indexedAccounts } = await localDb.getAllIndexedAccounts();
    let indexedAccountsExists: IDBIndexedAccount[] = [];
    const indexedAccountsRemoved: IDBIndexedAccount[] = [];
    if (filterRemoved) {
      const wallets: IDBWallet[] =
        allWallets || (await this.getAllWallets()).wallets;
      await Promise.all(
        indexedAccounts.map(async (indexedAccount) => {
          const walletId = accountUtils.getWalletIdFromAccountId({
            accountId: indexedAccount.id,
          });
          let isRemoved = false;
          if (walletId && wallets?.length) {
            const wallet = wallets.find((o) => o.id === walletId);
            if (!wallet) {
              isRemoved = true;
            }
          }
          if (isRemoved) {
            indexedAccountsRemoved.push(indexedAccount);
          } else {
            indexedAccountsExists.push(indexedAccount);
          }
        }),
      );
    } else {
      indexedAccountsExists = indexedAccounts;
    }
    return {
      indexedAccounts: indexedAccountsExists,
      indexedAccountsRemoved,
    };
  }

  @backgroundMethod()
  async getAllAccounts({
    ids,
    filterRemoved,
  }: {
    ids?: string[];
    filterRemoved?: boolean;
  } = {}) {
    let accounts: IDBAccount[] = [];

    // filter accounts match to available wallets, some account wallet or indexedAccount may be deleted
    ({ accounts } = await localDb.getAllAccounts({ ids }));

    const removedHiddenWallet: {
      [walletId: string]: true;
    } = {};
    const removedWallet: {
      [walletId: string]: true;
    } = {};
    const removedIndexedAccount: {
      [indexedAccountId: string]: true;
    } = {};

    let accountsFiltered: IDBAccount[] = accounts;
    let accountsRemoved: IDBAccount[] | undefined;

    let allWallets: IDBWallet[] | undefined;
    let indexedAccounts: IDBIndexedAccount[] = [];
    let indexedAccountsRemoved: IDBIndexedAccount[] = [];
    let allDevices: IDBDevice[] | undefined;

    if (filterRemoved) {
      const allWalletsResult = await this.getAllWallets({
        refillWalletInfo: true,
      });
      allWallets = allWalletsResult.wallets;
      allDevices = allWalletsResult.allDevices;
      ({ indexedAccounts, indexedAccountsRemoved } =
        await this.getAllIndexedAccounts({
          allWallets,
          filterRemoved: true,
        }));

      accountsRemoved = [];
      accountsFiltered = (
        await Promise.all(
          accounts.map(async (account) => {
            const { indexedAccountId, id } = account;

            if (
              accountUtils.isUrlAccountFn({
                accountId: id,
              })
            ) {
              return null;
            }

            const walletId = accountUtils.getWalletIdFromAccountId({
              accountId: id,
            });
            const pushRemovedAccount = () => {
              accountsRemoved?.push(account);
            };

            if (walletId) {
              if (removedWallet[walletId] || removedHiddenWallet[walletId]) {
                pushRemovedAccount();
                return null;
              }
              const wallet: IDBWallet | undefined = allWallets?.find(
                (o) => o.id === walletId,
              );
              if (!wallet && allWallets) {
                removedWallet[walletId] = true;
                pushRemovedAccount();
                return null;
              }
              if (wallet && localDb.isTempWalletRemoved({ wallet })) {
                removedHiddenWallet[walletId] = true;
                pushRemovedAccount();
                return null;
              }
            }
            let indexedAccount: IDBIndexedAccount | undefined;
            if (indexedAccountId) {
              if (removedIndexedAccount[indexedAccountId]) {
                pushRemovedAccount();
                return null;
              }
              indexedAccount = indexedAccounts.find(
                (o) => o.id === indexedAccountId,
              );
              if (!indexedAccount) {
                removedIndexedAccount[indexedAccountId] = true;
                pushRemovedAccount();
                return null;
              }
            }
            localDb.refillAccountInfo({ account, indexedAccount });
            return account;
          }),
        )
      ).filter(Boolean);
    }

    return {
      accounts: accountsFiltered,
      accountsRemoved,
      allWallets,
      allDevices,
      allIndexedAccounts: indexedAccounts,
      indexedAccountsRemoved,
    };
  }

  async getAllWallets(params: { refillWalletInfo?: boolean } = {}) {
    let { wallets } = await localDb.getAllWallets();
    let allDevices: IDBDevice[] | undefined;
    if (params.refillWalletInfo) {
      allDevices = (await this.getAllDevices()).devices;
      const refilledWalletsCache: {
        [walletId: string]: IDBWallet;
      } = {};
      wallets = await Promise.all(
        wallets.map((wallet) =>
          localDb.refillWalletInfo({
            wallet,
            refilledWalletsCache,
            allDevices,
          }),
        ),
      );
    }
    return { wallets, allDevices };
  }

  async getAllDevices() {
    return localDb.getAllDevices();
  }

  // TODO cache
  @backgroundMethod()
  async getAccountsInSameIndexedAccountId({
    indexedAccountId,
  }: {
    indexedAccountId: string;
  }): Promise<{
    accounts: IDBAccount[];
    allDbAccounts: IDBAccount[];
  }> {
    const result = await localDb.getAccountsInSameIndexedAccountId({
      indexedAccountId,
    });

    return result;
  }

  @backgroundMethod()
  async getDbAccountIdFromIndexedAccountId({
    indexedAccountId,
    networkId,
    deriveType,
  }: {
    indexedAccountId: string;
    networkId: string;
    deriveType: IAccountDeriveTypes;
  }) {
    const settings = await this.backgroundApi.serviceNetwork.getVaultSettings({
      networkId,
    });
    const deriveInfo =
      await this.backgroundApi.serviceNetwork.getDeriveInfoOfNetwork({
        networkId,
        deriveType,
      });
    const { idSuffix, template } = deriveInfo;

    const { index, walletId } = accountUtils.parseIndexedAccountId({
      indexedAccountId,
    });
    const realDBAccountId = accountUtils.buildHDAccountId({
      walletId,
      networkImpl: settings.impl,
      index,
      template, // from networkId
      idSuffix,
      isUtxo: settings.isUtxo,
    });
    return realDBAccountId;
  }

  @backgroundMethod()
  /**
   * Retrieves accounts by their indexed account IDs.
   *
   * @param indexedAccountIds - An array of indexed account IDs.
   * @param networkId - The network ID.
   * @param deriveType - The account derive type.
   * @returns A promise that resolves to an object containing the retrieved accounts.
   */
  async getAccountsByIndexedAccounts({
    dbAccounts,
    indexedAccountIds,
    networkId,
    deriveType,
  }: {
    dbAccounts?: IDBAccount[];
    indexedAccountIds: string[];
    networkId: string;
    deriveType: IAccountDeriveTypes;
  }): Promise<{
    accounts: INetworkAccount[];
  }> {
    const accounts = await Promise.all(
      indexedAccountIds.map(async (indexedAccountId) => {
        if (networkUtils.isAllNetwork({ networkId })) {
          return this.getMockedAllNetworkAccount({ indexedAccountId });
        }
        const realDBAccountId = await this.getDbAccountIdFromIndexedAccountId({
          indexedAccountId,
          networkId,
          deriveType,
        });
        const dbAccount: IDBAccount | undefined = dbAccounts?.find(
          (o) => o.id === realDBAccountId,
        );
        return this.getAccount({
          accountId: realDBAccountId,
          networkId,
          dbAccount,
        });
      }),
    );
    return {
      accounts,
    };
  }

  @backgroundMethod()
  async addIndexedAccount({
    walletId,
    indexes,
    names,
    skipIfExists,
  }: {
    walletId: string;
    indexes: number[];
    names?: {
      [index: number]: string;
    };
    skipIfExists: boolean;
  }) {
    return localDb.addIndexedAccount({
      walletId,
      indexes,
      names,
      skipIfExists,
    });
  }

  @backgroundMethod()
  async addHDNextIndexedAccount({ walletId }: { walletId: string }) {
    const result = await localDb.addHDNextIndexedAccount({ walletId });
    appEventBus.emit(EAppEventBusNames.AccountUpdate, undefined);
    return result;
  }

  @backgroundMethod()
  async ensureAccountNameNotDuplicate(
    params: IDBEnsureAccountNameNotDuplicateParams,
  ) {
    return localDb.ensureAccountNameNotDuplicate(params);
  }

  // rename account
  @backgroundMethod()
  @toastIfError()
  async setAccountName(params: IDBSetAccountNameParams): Promise<void> {
    const { accountId, indexedAccountId, name } = params;

    let account: IDBAccount | undefined;
    let indexedAccount: IDBIndexedAccount | undefined;

    // Get the old name before updating
    let oldName = '';
    if (name) {
      if (accountId) {
        account = await this.getDBAccountSafe({ accountId });
        oldName = account?.name || '';
      } else if (indexedAccountId) {
        indexedAccount = await this.getIndexedAccountSafe({
          id: indexedAccountId,
        });
        oldName = indexedAccount?.name || '';
      }
    }

    if (!account && !indexedAccount) {
      return;
    }

    const r = await localDb.setAccountName(params);
    if (!params.skipEventEmit) {
      appEventBus.emit(EAppEventBusNames.AccountUpdate, undefined);
    }

    // Only proceed if the name is actually changing
    if (oldName && name && oldName !== name) {
      const entityType: EChangeHistoryEntityType = accountId
        ? EChangeHistoryEntityType.Account
        : EChangeHistoryEntityType.IndexedAccount;

      const entityId = accountId || indexedAccountId || '';
      // Record the name change history
      await simpleDb.changeHistory.addChangeHistory({
        items: [
          {
            entityType,
            entityId,
            contentType: EChangeHistoryContentType.Name,
            oldValue: oldName,
            value: name,
          },
        ],
      });
    }

    return r;
  }

  @backgroundMethod()
  @toastIfError()
  async setUniversalIndexedAccountName(
    params: IDBSetUniversalIndexedAccountNameParams,
  ) {
    const { index, walletXfp, name, ...others } = params;
    let wallets: IDBWallet[] = [];
    if (walletXfp) {
      wallets = await localDb.getWalletsByXfp({ xfp: walletXfp });
    } else if (params.indexedAccountId) {
      const { walletId } = accountUtils.parseIndexedAccountId({
        indexedAccountId: params.indexedAccountId,
      });
      const wallet = await this.getWalletSafe({
        walletId,
      });
      if (wallet) {
        wallets.push(wallet);
      }
    }
    for (const wallet of wallets) {
      try {
        const indexedAccountId = accountUtils.buildIndexedAccountId({
          walletId: wallet.id,
          index,
        });
        const isSelfAccount = indexedAccountId === params.indexedAccountId;
        await this.setAccountName({
          name,
          ...others,
          indexedAccountId,
          skipEventEmit: true,
          skipSaveLocalSyncItem: isSelfAccount
            ? params.skipSaveLocalSyncItem
            : true,
          shouldCheckDuplicate: isSelfAccount
            ? params.shouldCheckDuplicate
            : false,
        });
      } catch (e) {
        console.error('setUniversalIndexedAccountName ERROR', e);
      }
    }
    if (wallets.length && !params.skipEventEmit) {
      appEventBus.emit(EAppEventBusNames.AccountUpdate, undefined);
    }
  }

  @backgroundMethod()
  async getWalletDeviceParams({
    walletId,
  }: {
    walletId: string;
  }): Promise<IDeviceSharedCallParams | undefined> {
    if (!accountUtils.isHwWallet({ walletId })) {
      return undefined;
    }

    const wallet = await this.getWallet({ walletId });
    const dbDevice = await this.getWalletDevice({ walletId });
    return {
      confirmOnDevice: EConfirmOnDeviceType.LastItem,
      dbDevice,
      dbWallet: wallet,
      deviceCommonParams: {
        passphraseState: wallet?.passphraseState,
        useEmptyPassphrase: !wallet.passphraseState,
      },
    };
  }

  @backgroundMethod()
  @toastIfError()
  async createHWHiddenWallet({
    walletId,
    skipDeviceCancel,
    hideCheckingDeviceLoading,
  }: {
    walletId: string;
    skipDeviceCancel?: boolean;
    hideCheckingDeviceLoading?: boolean;
  }) {
    const dbDevice = await this.getWalletDevice({ walletId });
    const { connectId } = dbDevice;

    // createHWHiddenWallet
    return this.backgroundApi.serviceHardwareUI.withHardwareProcessing(
      async () => {
        const passphraseState =
          await this.backgroundApi.serviceHardware.getPassphraseState({
            connectId,
            forceInputPassphrase: true,
          });

        if (!passphraseState) {
          throw new DeviceNotOpenedPassphrase({
            payload: {
              connectId,
              deviceId: dbDevice.deviceId ?? undefined,
            },
          });
        }

        // TODO save remember states

        const dbWallet = await this.createHWWalletBase({
          device: deviceUtils.dbDeviceToSearchDevice(dbDevice),
          features: dbDevice.featuresInfo || ({} as any),
          passphraseState,
          fillingXfpByCallingSdk: true,
        });

        if (dbWallet?.wallet.id) {
          const hiddenWalletImmediately =
            await this.backgroundApi.serviceSetting.getHiddenWalletImmediately();
          await this.setWalletTempStatus({
            walletId: dbWallet.wallet.id,
            isTemp: !hiddenWalletImmediately,
          });
        }

        defaultLogger.account.wallet.walletAdded({
          status: 'success',
          addMethod: 'ConnectHardware',
          details: {
            deviceType: dbDevice.featuresInfo
              ? await deviceUtils.getDeviceTypeFromFeatures({
                  features: dbDevice.featuresInfo,
                })
              : undefined,
            hardwareWalletType: 'Hidden',
          },
          isSoftwareWalletOnlyUser:
            await this.backgroundApi.serviceAccountProfile.isSoftwareWalletOnlyUser(),
        });

        return dbWallet;
      },
      {
        deviceParams: {
          dbDevice,
        },
        skipDeviceCancel,
        hideCheckingDeviceLoading,
        debugMethodName: 'createHWHiddenWallet.getPassphraseState',
      },
    );
  }

  @backgroundMethod()
  @toastIfError()
  async createQrWallet(params: IDBCreateQRWalletParams) {
    const fullXfp = this.buildQrWalletFullXfp({
      shortXfp: params.qrDevice.xfp,
      airGapAccounts: params.airGapAccounts,
    });
    // const { name, deviceId, xfp, version } = qrDevice;
    const result = await localDb.createQrWallet({ ...params, fullXfp });
    appEventBus.emit(EAppEventBusNames.WalletUpdate, undefined);
    return result;
  }

  @backgroundMethod()
  @toastIfError()
  async createHWWallet(params: IDBCreateHwWalletParamsBase) {
    // createHWWallet
    return this.backgroundApi.serviceHardwareUI.withHardwareProcessing(
      () =>
        this.createHWWalletBase({ ...params, fillingXfpByCallingSdk: true }),
      {
        deviceParams: {
          dbDevice: params.device as IDBDevice,
        },
        skipDeviceCancel: params.skipDeviceCancel,
        hideCheckingDeviceLoading: params.hideCheckingDeviceLoading,
        debugMethodName: 'createHWWalletBase',
      },
    );
  }

  @backgroundMethod()
  async restoreTempCreatedWallet({ walletId }: { walletId: string }) {
    await localDb.restoreTempCreatedWallet({ walletId });
  }

  @backgroundMethod()
  async createHWWalletBase(params: IDBCreateHwWalletParams) {
    const { features, passphraseState, fillingXfpByCallingSdk } = params;
    if (!features) {
      throw new Error('createHWWalletBase ERROR: features is required');
    }
    const connectId = params.device.connectId ?? '';
    const searchDeviceId = params.device.deviceId ?? '';
    const deviceId = deviceUtils.getRawDeviceId({
      device: params.device,
      features,
    });

    console.log('createHWWalletBase paramsInfo', {
      connectId,
      deviceId,
      searchDeviceId,
    });

    let xfp: string | undefined;
    if (fillingXfpByCallingSdk) {
      xfp = await this.backgroundApi.serviceHardware.buildHwWalletXfp({
        connectId,
        deviceId,
        passphraseState,
        throwError: true,
      });
      console.log('createHWWalletBase xfp', xfp, connectId, deviceId);
    }
    const result = await localDb.createHwWallet({
      ...params,
      xfp,
      passphraseState: passphraseState || '',
      getFirstEvmAddressFn: async () => {
        const r =
          await this.backgroundApi.serviceHardware.getEvmAddressByStandardWallet(
            {
              connectId,
              deviceId,
              path: FIRST_EVM_ADDRESS_PATH,
            },
          );
        return r;
      },
    });
    appEventBus.emit(EAppEventBusNames.WalletUpdate, undefined);
    return result;
  }

  hdWalletHashAndXfpBuilder = async (options: {
    realMnemonic: string;
  }): Promise<{
    hash: string;
    xfp: string;
  }> => {
    const text = `${options.realMnemonic}--4863FBE1-7B9B-4006-91D0-24212CCCC375`;
    const buff = sha256(bufferUtils.toBuffer(text, 'utf8'));
    const hash = bufferUtils.bytesToHex(buff);

    const { fullXfp: fulXfp } = await coreChainApi.btc.hd.buildXfpFromMnemonic({
      mnemonic: options.realMnemonic,
    });
    return { hash, xfp: fulXfp };
  };

  @backgroundMethod()
  async createHDWallet({
    name,
    mnemonic,
    isWalletBackedUp,
  }: {
    mnemonic: string;
    name?: string;
    isWalletBackedUp?: boolean;
  }) {
    const { servicePassword } = this.backgroundApi;
    const { password } = await servicePassword.promptPasswordVerify({
      reason: EReasonForNeedPassword.CreateOrRemoveWallet,
    });

    ensureSensitiveTextEncoded(mnemonic); // TODO also add check for imported account

    const { mnemonic: realMnemonic, mnemonicType } =
      await this.validateMnemonic(mnemonic);

    if (mnemonicType === EMnemonicType.TON) {
      throw new Error('TON mnemonic is not supported');
    }

    await this.generateAllHDWalletMissingHashAndXfp({ password });

    const walletHashAndXfp = await this.hdWalletHashAndXfpBuilder({
      realMnemonic,
    });

    let rs: IBip39RevealableSeedEncryptHex | undefined;
    try {
      rs = await revealableSeedFromMnemonic(realMnemonic, password);
    } catch {
      throw new InvalidMnemonic();
    }
    const mnemonicFromRs = await mnemonicFromEntropy(rs, password);
    if (realMnemonic !== mnemonicFromRs) {
      throw new InvalidMnemonic();
    }

    return this.createHDWalletWithRs({
      rs,
      password,
      name,
      walletHash: walletHashAndXfp.hash,
      walletXfp: walletHashAndXfp.xfp,
      isWalletBackedUp,
    });
  }

  @backgroundMethod()
  async saveTonImportedAccountMnemonic({
    mnemonic,
    accountId,
  }: {
    mnemonic: string;
    accountId: string;
  }) {
    const { servicePassword } = this.backgroundApi;
    const { password } = await servicePassword.promptPasswordVerify({
      reason: EReasonForNeedPassword.CreateOrRemoveWallet,
    });
    ensureSensitiveTextEncoded(mnemonic);
    const { mnemonic: realMnemonic, mnemonicType } =
      await this.validateMnemonic(mnemonic);

    if (mnemonicType !== EMnemonicType.TON) {
      throw new Error('saveTonMnemonic ERROR: Not a TON mnemonic');
    }
    let rs: IBip39RevealableSeedEncryptHex | undefined;
    try {
      rs = await revealableSeedFromTonMnemonic(realMnemonic, password);
    } catch {
      throw new InvalidMnemonic();
    }

    const tonMnemonicFromRs = await tonMnemonicFromEntropy(rs, password);
    if (realMnemonic !== tonMnemonicFromRs) {
      throw new InvalidMnemonic();
    }
    await localDb.saveTonImportedAccountMnemonic({ accountId, rs });
  }

  @backgroundMethod()
  async createHDWalletWithRs({
    rs,
    password,
    avatarInfo,
    name,
    walletHash,
    walletXfp,
    isWalletBackedUp,
  }: {
    rs: string;
    password: string;
    avatarInfo?: IAvatarInfo;
    name?: string;
    walletHash: string;
    walletXfp: string;
    isWalletBackedUp?: boolean;
  }): Promise<{
    wallet: IDBWallet;
    indexedAccount?: IDBIndexedAccount;
    isOverrideWallet?: boolean;
  }> {
    if (platformEnv.isWebDappMode) {
      throw new Error('createHDWallet ERROR: Not supported in Dapp mode');
    }
    ensureSensitiveTextEncoded(password);

    let shouldCheckDuplicate = true;

    const devSettings = await devSettingsPersistAtom.get();
    if (devSettings.enabled && devSettings.settings?.allowAddSameHDWallet) {
      shouldCheckDuplicate = false;
    }

    if (walletHash && shouldCheckDuplicate) {
      // TODO performance issue
      const { wallets } = await this.getAllWallets();
      const existsSameHashWallet = wallets.find(
        (item) => walletHash && item.hash && item.hash === walletHash,
      );
      if (existsSameHashWallet) {
        const indexedAccounts = await this.addIndexedAccount({
          walletId: existsSameHashWallet.id,
          indexes: [0],
          skipIfExists: true,
        });
        // localDb.buildCreateHDAndHWWalletResult({
        //   walletId: existsSameHashWallet.id,
        //   addedHdAccountIndex:
        // })
        // DO NOT throw error, just return the exists wallet, so v4 migration can continue
        // throw new Error('Wallet with the same mnemonic hash already exists');
        return {
          wallet: existsSameHashWallet,
          isOverrideWallet: true,
          indexedAccount: indexedAccounts[0],
        };
      }
    }

    const result = await localDb.createHDWallet({
      password,
      rs,
      backuped: !!isWalletBackedUp,
      avatar: avatarInfo ?? randomAvatar(),
      name,
      walletHash,
      walletXfp,
    });

    await timerUtils.wait(100);

    appEventBus.emit(EAppEventBusNames.WalletUpdate, undefined);
    return result;
  }

  @backgroundMethod()
  async isTempWalletRemoved({
    wallet,
  }: {
    wallet: IDBWallet;
  }): Promise<boolean> {
    return Promise.resolve(localDb.isTempWalletRemoved({ wallet }));
  }

  @backgroundMethod()
  async setWalletTempStatus({
    walletId,
    isTemp,
    hideImmediately,
  }: {
    walletId: IDBWalletId;
    isTemp: boolean;
    hideImmediately?: boolean;
  }) {
    const result = await localDb.setWalletTempStatus({
      walletId,
      isTemp,
      hideImmediately,
    });
    appEventBus.emit(EAppEventBusNames.WalletUpdate, undefined);
    return result;
  }

  @backgroundMethod()
  @toastIfError()
  async setWalletNameAndAvatar(params: IDBSetWalletNameAndAvatarParams) {
    const { walletId, name } = params;

    let oldName = '';
    // Get the old name before updating
    if (name) {
      const wallet = await this.getWalletSafe({
        walletId,
        withoutRefill: true,
      });
      oldName = wallet?.name || '';
    }

    const result = await localDb.setWalletNameAndAvatar(params);

    if (!params.skipEmitEvent) {
      appEventBus.emit(EAppEventBusNames.WalletUpdate, undefined);
      appEventBus.emit(EAppEventBusNames.WalletRename, {
        walletId: params.walletId,
      });
    }

    // Only proceed if the name is actually changing
    if (name && oldName && oldName !== name) {
      // Record the name change history
      await simpleDb.changeHistory.addChangeHistory({
        items: [
          {
            entityType: EChangeHistoryEntityType.Wallet,
            entityId: walletId,
            contentType: EChangeHistoryContentType.Name,
            oldValue: oldName,
            value: name,
          },
        ],
      });
    }

    return result;
  }

  @backgroundMethod()
  async removeAccount({
    indexedAccount,
    account,
  }: {
    indexedAccount?: IDBIndexedAccount;
    account?: IDBAccount;
  }) {
    let walletId = '';
    if (indexedAccount) {
      walletId = indexedAccount.walletId;
    }
    if (account) {
      walletId = accountUtils.getWalletIdFromAccountId({
        accountId: account.id,
      });
    }
    // await this.backgroundApi.servicePassword.promptPasswordVerifyByWallet({
    //   walletId,
    // });
    //  OK-26980 remove account without password
    if (account) {
      const accountId = account.id;
      await localDb.removeAccount({ accountId, walletId });
      await this.backgroundApi.serviceDApp.removeDappConnectionAfterAccountRemove(
        { accountId },
      );
    }
    if (indexedAccount) {
      await localDb.removeIndexedAccount({
        indexedAccountId: indexedAccount.id,
        walletId,
      });
      await this.backgroundApi.serviceDApp.removeDappConnectionAfterAccountRemove(
        { indexedAccountId: indexedAccount.id },
      );
    }

    appEventBus.emit(EAppEventBusNames.AccountUpdate, undefined);
    appEventBus.emit(EAppEventBusNames.AccountRemove, undefined);

    if (
      account &&
      accountUtils.isExternalAccount({
        accountId: account.id,
      })
    ) {
      await this.backgroundApi.serviceDappSide.disconnectExternalWallet({
        account,
      });
    }
  }

  @backgroundMethod()
  async removeWallet({
    walletId,
  }: Omit<IDBRemoveWalletParams, 'password' | 'isHardware'>) {
    if (!walletId) {
      throw new Error('walletId is required');
    }
    await this.backgroundApi.servicePassword.promptPasswordVerifyByWallet({
      walletId,
    });
    const result = await localDb.removeWallet({
      walletId,
    });
    appEventBus.emit(EAppEventBusNames.WalletUpdate, undefined);
    await this.backgroundApi.serviceDApp.removeDappConnectionAfterWalletRemove({
      walletId,
    });
    return result;
  }

  getAccountXpubOrAddressWithMemo = memoizee(
    async ({
      accountId,
      networkId,
      addressToLowerCase = true,
    }: {
      accountId: string | undefined;
      networkId: string | undefined;
      addressToLowerCase?: boolean;
    }): Promise<string | null> => {
      // console.log('getAccountXpubOrAddressWithMemo', accountId, networkId);
      if (!networkId || !accountId) {
        return null;
      }
      let accountXpubOrAddress: string | undefined;

      let accountXpub: string | undefined;
      try {
        accountXpub = await this.getAccountXpub({
          networkId,
          accountId,
        });
      } catch (error) {
        console.error(error);
      }
      if (accountXpub) {
        accountXpubOrAddress = accountXpub;
      } else {
        let accountAddress: string | undefined;
        try {
          accountAddress = await this.getAccountAddressForApi({
            networkId,
            accountId,
          });
        } catch (error) {
          console.error(error);
        }
        if (accountAddress) {
          accountXpubOrAddress = accountAddress;
          if (addressToLowerCase) {
            accountXpubOrAddress = accountXpubOrAddress?.toLowerCase();
          }
        }
      }

      return accountXpubOrAddress || null;
    },
    {
      max: 100,
      maxAge: timerUtils.getTimeDurationMs({ seconds: 5 }),
      promise: true,
    },
  );

  @backgroundMethod()
  async getAccountXpubOrAddress({
    accountId,
    networkId,
    addressToLowerCase = true,
  }: {
    accountId: string | undefined;
    networkId: string | undefined;
    addressToLowerCase?: boolean;
  }): Promise<string | null> {
    // Because all EVM networks use the same address, so the networkId is unified to eth to better utilize the cache
    if (networkUtils.isEvmNetwork({ networkId })) {
      // eslint-disable-next-line no-param-reassign
      networkId = getNetworkIdsMap().eth;
    }

    return this.getAccountXpubOrAddressWithMemo({
      accountId,
      networkId,
      addressToLowerCase,
    });
  }

  @backgroundMethod()
  async getAccountXpub({
    accountId,
    networkId,
    dbAccount,
  }: {
    accountId: string;
    networkId: string;
    dbAccount?: IDBAccount;
  }) {
    if (networkUtils.isAllNetwork({ networkId })) {
      return '';
    }

    const vault = await vaultFactory.getVault({
      accountId,
      networkId,
    });

    const xpub = await vault.getAccountXpub({ dbAccount });

    return xpub;
  }

  // Get Address for each chain when request the API
  @backgroundMethod()
  async getAccountAddressForApi({
    dbAccount,
    accountId,
    networkId,
  }: {
    dbAccount?: IDBAccount;
    accountId: string;
    networkId: string;
  }) {
    if (networkUtils.isAllNetwork({ networkId })) {
      return ALL_NETWORK_ACCOUNT_MOCK_ADDRESS;
    }
    const account = await this.getAccount({ accountId, networkId, dbAccount });
    if (networkUtils.isLightningNetworkByNetworkId(networkId)) {
      return account.addressDetail.normalizedAddress;
    }
    return account.address;
  }

  @backgroundMethod()
  async getHDAccountMnemonic({
    walletId,
    reason,
  }: {
    walletId: string;
    reason?: EReasonForNeedPassword;
  }) {
    if (!accountUtils.isHdWallet({ walletId })) {
      throw new Error('getHDAccountMnemonic ERROR: Not a HD account');
    }
    const { password } =
      await this.backgroundApi.servicePassword.promptPasswordVerifyByWallet({
        walletId,
        reason,
      });
    const credential = await localDb.getCredential(walletId);
    const mnemonicRaw = await mnemonicFromEntropy(
      credential.credential,
      password,
    );
    const mnemonic =
      await this.backgroundApi.servicePassword.encodeSensitiveText({
        text: mnemonicRaw,
      });
    return { mnemonic };
  }

  @backgroundMethod()
  async getTonImportedAccountMnemonic({ accountId }: { accountId: string }) {
    if (!accountUtils.isImportedAccount({ accountId })) {
      throw new Error(
        'getTonImportedAccountMnemonic ERROR: Not a Ton Imported account',
      );
    }
    const { password } =
      await this.backgroundApi.servicePassword.promptPasswordVerifyByAccount({
        accountId,
        reason: EReasonForNeedPassword.Security,
      });
    const credential = await localDb.getCredential(
      accountUtils.buildTonMnemonicCredentialId({
        accountId,
      }),
    );
    const mnemonicRaw = await tonMnemonicFromEntropy(
      credential.credential,
      password,
    );
    const mnemonic =
      await this.backgroundApi.servicePassword.encodeSensitiveText({
        text: mnemonicRaw,
      });
    return { mnemonic };
  }

  @backgroundMethod()
  async hasTonImportedAccountMnemonic({ accountId }: { accountId: string }) {
    try {
      const credential = await localDb.getCredential(
        accountUtils.buildTonMnemonicCredentialId({
          accountId,
        }),
      );
      return !!credential;
    } catch {
      return false;
    }
  }

  @backgroundMethod()
  async canAutoCreateAddressInSilentMode({
    walletId,
    networkId,
    deriveType,
  }: {
    walletId: string;
    networkId: string;
    deriveType: IAccountDeriveTypes;
  }) {
    if (
      // !networkUtils.isAllNetwork({ networkId }) && // all network cost too much time
      accountUtils.isHdWallet({ walletId })
    ) {
      const pwd = await this.backgroundApi.servicePassword.getCachedPassword();
      if (pwd) {
        const map =
          await this.backgroundApi.serviceNetwork.getDeriveInfoMapOfNetwork({
            networkId,
          });
        const deriveInfo = map?.[deriveType as 'default'];
        if (deriveInfo) {
          return true;
        }
      }
    }
    return false;
  }

  @backgroundMethod()
  @toastIfError()
  async verifyHWAccountAddresses(params: {
    walletId: string;
    networkId: string;
    indexes?: Array<number>;
    indexedAccountId: string | undefined;
    deriveType: IAccountDeriveTypes;
    confirmOnDevice?: EConfirmOnDeviceType;
  }): Promise<string[]> {
    const { prepareParams, deviceParams, networkId, walletId } =
      await this.getPrepareHDOrHWAccountsParams(params);

    prepareParams.isVerifyAddressAction = true;

    const vault = await vaultFactory.getWalletOnlyVault({
      networkId,
      walletId,
    });

    const vaultSettings =
      await this.backgroundApi.serviceNetwork.getVaultSettings({ networkId });
    // getHWAccountAddresses
    return this.backgroundApi.serviceHardwareUI.withHardwareProcessing(
      async () => {
        const addresses = await vault.keyring.batchGetAddresses(prepareParams);
        if (!isEmpty(addresses)) {
          return addresses.map((address) => address.address);
        }

        // const accounts = await vault.keyring.prepareAccounts(prepareParams);
        const { accountsForCreate } =
          await this.backgroundApi.serviceBatchCreateAccount.previewBatchBuildAccounts(
            {
              walletId,
              networkId,
              deriveType: params.deriveType,
              indexes: prepareParams.indexes,
              showOnOneKey: true,
              isVerifyAddressAction: prepareParams.isVerifyAddressAction,
            },
          );
        const results: string[] = [];
        for (let i = 0; i < accountsForCreate.length; i += 1) {
          const account = accountsForCreate[i];
          if (vaultSettings.accountType === EDBAccountType.VARIANT) {
            const address = (account as IDBVariantAccount).addresses[networkId];
            if (address) {
              results.push(address);
            } else {
              const addressInfo = await vault.buildAccountAddressDetail({
                networkId,
                account,
                networkInfo: await vault.getNetworkInfo(),
              });
              results.push(addressInfo.displayAddress);
            }
          } else {
            results.push(account.address);
          }
        }

        return results;
      },
      {
        deviceParams,
        skipDeviceCancelAtFirst: true,
        debugMethodName: 'verifyHWAccountAddresses.prepareAccounts',
      },
    );
  }

  @backgroundMethod()
  async insertWalletOrder({
    targetWalletId,
    startWalletId,
    endWalletId,
    emitEvent,
  }: {
    targetWalletId: string;
    startWalletId: string | undefined;
    endWalletId: string | undefined;
    emitEvent?: boolean;
  }) {
    const checkIsNotHiddenWallet = (wallet: IDBWallet | undefined) => {
      if (wallet && accountUtils.isHwHiddenWallet({ wallet })) {
        throw new Error(
          'insertWalletOrder ERROR: Not supported for HW hidden wallet',
        );
      }
    };

    const targetWallet = await localDb.getWalletSafe({
      walletId: targetWalletId,
    });
    checkIsNotHiddenWallet(targetWallet);

    const startWallet = await localDb.getWalletSafe({
      walletId: startWalletId || '',
    });
    checkIsNotHiddenWallet(startWallet);

    const endWallet = await localDb.getWalletSafe({
      walletId: endWalletId || '',
    });
    checkIsNotHiddenWallet(endWallet);

    const startOrder = startWallet?.walletOrder ?? 0;
    const endOrder = endWallet?.walletOrder ?? startOrder + 1;
    await localDb.updateWalletOrder({
      walletId: targetWalletId,
      walletOrder: (startOrder + endOrder) / 2,
    });

    if (emitEvent) {
      // force UI re-render, may cause performance issue
      appEventBus.emit(EAppEventBusNames.WalletUpdate, undefined);
    }
  }

  @backgroundMethod()
  async insertIndexedAccountOrder({
    targetIndexedAccountId,
    startIndexedAccountId,
    endIndexedAccountId,
    emitEvent,
  }: {
    targetIndexedAccountId: string;
    startIndexedAccountId: string | undefined;
    endIndexedAccountId: string | undefined;
    emitEvent?: boolean;
  }) {
    // const targetIndexedAccount = await localDb.getIndexedAccountSafe({
    //   id: targetIndexedAccountId,
    // });

    const startIndexedAccount = await localDb.getIndexedAccountSafe({
      id: startIndexedAccountId || '',
    });

    const endIndexedAccount = await localDb.getIndexedAccountSafe({
      id: endIndexedAccountId || '',
    });

    const startOrder = startIndexedAccount?.order ?? 0;
    const endOrder = endIndexedAccount?.order ?? startOrder + 1;

    await localDb.updateIndexedAccountOrder({
      indexedAccountId: targetIndexedAccountId,
      order: (startOrder + endOrder) / 2,
    });

    if (emitEvent) {
      // force UI re-render, may cause performance issue
      appEventBus.emit(EAppEventBusNames.AccountUpdate, undefined);
    }
  }

  @backgroundMethod()
  async insertAccountOrder({
    targetAccountId,
    startAccountId,
    endAccountId,
    emitEvent,
  }: {
    targetAccountId: string;
    startAccountId: string | undefined;
    endAccountId: string | undefined;
    emitEvent?: boolean;
  }) {
    // const targetAccount = await localDb.getAccountSafe({
    //   accountId: targetAccountId,
    // });

    const startAccount = await localDb.getAccountSafe({
      accountId: startAccountId || '',
    });

    const endAccount = await localDb.getAccountSafe({
      accountId: endAccountId || '',
    });

    const startOrder = startAccount?.accountOrder ?? 0;
    const endOrder = endAccount?.accountOrder ?? startOrder + 1;

    await localDb.updateAccountOrder({
      accountId: targetAccountId,
      order: (startOrder + endOrder) / 2,
    });

    if (emitEvent) {
      // force UI re-render, may cause performance issue
      appEventBus.emit(EAppEventBusNames.AccountUpdate, undefined);
    }
  }

  @backgroundMethod()
  async getNetworkAccountsInSameIndexedAccountId({
    indexedAccountId,
    networkIds,
  }: {
    indexedAccountId: string;
    networkIds: string[];
  }): Promise<
    {
      network: IServerNetwork;
      accountDeriveType: IAccountDeriveTypes;
      account?: INetworkAccount;
    }[]
  > {
    const perf = perfUtils.createPerf({
      name: EPerformanceTimerLogNames.serviceAccount__getNetworkAccountsInSameIndexedAccountId,
    });

    perf.markStart('getAccountsInSameIndexedAccountId');
    const { serviceNetwork } = this.backgroundApi;
    const { accounts: dbAccounts } =
      await this.getAccountsInSameIndexedAccountId({
        indexedAccountId,
      });
    perf.markEnd('getAccountsInSameIndexedAccountId');

    perf.markStart('processAllNetworksAccounts');
    const result = await Promise.all(
      networkIds.map(async (networkId) => {
        const perfEachAccount = perfUtils.createPerf({
          name: EPerformanceTimerLogNames.serviceAccount__getNetworkAccountsInSameIndexedAccountId_EachAccount,
        });

        perfEachAccount.markStart('getCompatibleAccount');
        const dbAccount = dbAccounts.find((account) =>
          accountUtils.isAccountCompatibleWithNetwork({
            account,
            networkId,
          }),
        );
        perfEachAccount.markEnd('getCompatibleAccount');

        let account: INetworkAccount | undefined;

        perfEachAccount.markStart('getNetwork');
        const network = await serviceNetwork.getNetwork({ networkId });
        perfEachAccount.markEnd('getNetwork');

        perfEachAccount.markStart('getGlobalDeriveTypeOfNetwork');
        const accountDeriveType =
          await serviceNetwork.getGlobalDeriveTypeOfNetwork({ networkId });
        perfEachAccount.markEnd('getGlobalDeriveTypeOfNetwork');

        if (dbAccount) {
          perfEachAccount.markStart('getNetworkAccount');
          try {
            account = await this.getNetworkAccount({
              dbAccount,
              accountId: undefined,
              networkId,
              deriveType: accountDeriveType,
              indexedAccountId: dbAccount.indexedAccountId,
            });
          } catch {
            console.log('failed to get Network account');
          }
          perfEachAccount.markEnd('getNetworkAccount');
        }

        perfEachAccount.done();
        return { network, accountDeriveType, account };
      }),
    );
    perf.markEnd('processAllNetworksAccounts');

    perf.done();

    return result;
  }

  @backgroundMethod()
  async getNetworkAccountsInSameIndexedAccountIdWithDeriveTypes({
    networkId,
    indexedAccountId,
    excludeEmptyAccount,
  }: {
    networkId: string;
    indexedAccountId: string;
    excludeEmptyAccount?: boolean;
  }) {
    const { serviceNetwork } = this.backgroundApi;
    const network = await serviceNetwork.getNetworkSafe({ networkId });
    if (!network) {
      throw new Error('Network not found');
    }
    const vault = await vaultFactory.getChainOnlyVault({ networkId });
    const vaultSettings = await vault.getVaultSettings();
    const accountDeriveTypes = Object.entries(
      vaultSettings.accountDeriveInfo,
    ).map(([deriveType, deriveInfo]) => ({
      deriveType: deriveType as IAccountDeriveTypes,
      deriveInfo,
    }));
    let networkAccounts = await Promise.all(
      accountDeriveTypes.map(async (item) => {
        let resp: { accounts: INetworkAccount[] } | undefined;
        try {
          resp = await this.getAccountsByIndexedAccounts({
            indexedAccountIds: [indexedAccountId],
            networkId,
            deriveType: item.deriveType,
          });
        } catch (e) {
          // fail to get account
        }
        return {
          deriveType: item.deriveType,
          deriveInfo: item.deriveInfo,
          account: resp?.accounts[0],
        };
      }),
    );

    if (excludeEmptyAccount) {
      networkAccounts = networkAccounts.filter((item) => item.account);
    }

    return { networkAccounts, network };
  }

  @backgroundMethod()
  async getAccountAddressType({
    accountId,
    networkId,
    address,
  }: {
    accountId: string;
    networkId: string;
    address: string;
  }) {
    const vault = await vaultFactory.getVault({ networkId, accountId });
    return vault.getAddressType({ address });
  }

  @backgroundMethod()
  async createAddressIfNotExists(
    {
      walletId,
      networkId,
      accountId,
      indexedAccountId,
    }: {
      walletId: string;
      networkId: string;
      accountId?: string;
      indexedAccountId?: string;
    },
    { allowWatchAccount }: { allowWatchAccount?: boolean },
  ) {
    if (!accountId && !indexedAccountId) {
      throw new Error('accountId or indexedAccountId is required');
    }

    const { serviceNetwork, serviceAccount } = this.backgroundApi;
    const deriveType = await serviceNetwork.getGlobalDeriveTypeOfNetwork({
      networkId,
    });

    const showSwitchAccountSelector = () => {
      appEventBus.emit(EAppEventBusNames.ShowSwitchAccountSelector, {
        networkId,
      });
    };

    if (
      !allowWatchAccount &&
      accountUtils.isWatchingAccount({
        accountId: accountId ?? '',
      })
    ) {
      showSwitchAccountSelector();
      return undefined;
    }

    if (indexedAccountId) {
      try {
        const result = await serviceAccount.getNetworkAccount({
          accountId: undefined,
          indexedAccountId,
          networkId,
          deriveType,
        });
        return result;
      } catch (error) {
        const isCreated = await new Promise<boolean>((resolve, reject) => {
          const promiseId = this.backgroundApi.servicePromise.createCallback({
            resolve,
            reject,
          });
          appEventBus.emit(EAppEventBusNames.CreateAddressByDialog, {
            networkId,
            indexedAccountId,
            deriveType,
            promiseId,
            autoCreateAddress: accountUtils.isHdWallet({ walletId }),
          });
        });
        if (!isCreated) {
          return undefined;
        }
        const result = await serviceAccount.getNetworkAccount({
          accountId: undefined,
          indexedAccountId,
          networkId,
          deriveType,
        });
        return result;
      }
    }

    if (accountId) {
      try {
        const result = await serviceAccount.getNetworkAccount({
          accountId,
          indexedAccountId: undefined,
          networkId,
          deriveType,
        });
        return result;
      } catch (error) {
        showSwitchAccountSelector();
      }
    }
    return undefined;
  }

  @backgroundMethod()
  async clearAllWalletHashAndXfp() {
    await localDb.withTransaction(async (tx) => {
      const { recordPairs } = await localDb.txGetAllRecords({
        tx,
        name: ELocalDBStoreNames.Wallet,
      });
      await localDb.txUpdateRecords({
        tx,
        name: ELocalDBStoreNames.Wallet,
        recordPairs,
        updater: (record) => {
          if (
            accountUtils.isHdWallet({ walletId: record.id }) ||
            accountUtils.isHwWallet({ walletId: record.id }) ||
            accountUtils.isQrWallet({ walletId: record.id })
          ) {
            record.hash = undefined;
            if (accountUtils.isQrWallet({ walletId: record.id })) {
              record.xfp = accountUtils.getShortXfp({ xfp: record.xfp || '' });
            } else {
              record.xfp = undefined;
            }
          }
          return record;
        },
      });
    });
  }

  // TODO mutex
  // TODO QR wallet
  @backgroundMethod()
  async generateAllHDWalletMissingHashAndXfp({
    password,
  }: {
    password: string;
  }) {
    const { wallets } = await this.getAllWallets({ refillWalletInfo: false });
    const hdWallets = wallets.filter((wallet) =>
      accountUtils.isHdWallet({ walletId: wallet.id }),
    );
    if (!hdWallets?.length) {
      return;
    }
    let hdWalletsToProcess = [];
    const appStatus = await simpleDb.appStatus.getRawData();
    if (!appStatus?.hdWalletHashGenerated || !appStatus?.hdWalletXfpGenerated) {
      hdWalletsToProcess = hdWallets;
    } else {
      hdWalletsToProcess = hdWallets.filter(
        (wallet) =>
          !wallet.hash ||
          !wallet.xfp ||
          !accountUtils.isValidWalletXfp({ xfp: wallet.xfp }),
      );
    }
    if (!hdWalletsToProcess?.length) {
      return;
    }

    await this.generateHDWalletMissingHashAndXfp({
      password,
      hdWallets: hdWalletsToProcess,
    });
    await simpleDb.appStatus.setRawData((v) => ({
      ...v,
      hdWalletHashGenerated: true,
      hdWalletXfpGenerated: true,
    }));
  }

  @backgroundMethod()
  async generateHDWalletMissingHashAndXfp({
    password,
    hdWallets,
  }: {
    password: string;
    hdWallets: IDBWallet[];
  }) {
    if (!hdWallets?.length) {
      return;
    }
    const walletsHashXfpMap: {
      [walletId: string]: { hash: string; xfp: string };
    } = {};
    for (const wallet of hdWallets) {
      try {
        const isHdWallet = accountUtils.isHdWallet({ walletId: wallet.id });
        if (isHdWallet) {
          const credentialInfo = await localDb.getCredential(wallet.id);
          if (!credentialInfo) {
            // eslint-disable-next-line no-continue
            continue;
          }
          const realMnemonic = await mnemonicFromEntropy(
            credentialInfo.credential,
            password,
          );
          const walletHashXfp = await this.hdWalletHashAndXfpBuilder({
            realMnemonic,
          });
          walletsHashXfpMap[wallet.id] = walletHashXfp;
        }
      } catch (error) {
        console.error(error);
      }
    }
    await localDb.updateWalletsHashAndXfp(walletsHashXfpMap);
  }

  generateHwWalletsMissingXfpFn = async ({
    wallet,
    connectId,
    deviceId,
    throwError,
  }: {
    wallet: IDBWallet | undefined;
    connectId: string | undefined;
    deviceId: string | undefined;
    throwError?: boolean;
  }) => {
    if (!wallet?.id) {
      return;
    }
    if (!accountUtils.isHwWallet({ walletId: wallet?.id })) {
      return;
    }
    if (wallet && accountUtils.isValidWalletXfp({ xfp: wallet?.xfp })) {
      console.log('wallet already has xfp', wallet.xfp);
      return;
    }
    if (!connectId) {
      const device = await localDb.getWalletDeviceSafe({
        dbWallet: wallet,
        walletId: wallet?.id,
      });
      // eslint-disable-next-line no-param-reassign
      connectId = device?.connectId;
      // eslint-disable-next-line no-param-reassign
      deviceId = device?.deviceId;
    }

    const xfp = await this.backgroundApi.serviceHardware.buildHwWalletXfp({
      connectId,
      deviceId,
      passphraseState: wallet?.passphraseState,
      throwError: throwError ?? false,
    });
    if (xfp) {
      await localDb.updateWalletsHashAndXfp({
        [wallet?.id]: {
          xfp,
        },
      });
    }
    console.log('generateHwWalletsMissingXfp', { xfp, connectId, deviceId });
  };

  generateHwWalletsMissingXfpDebounced = debounce(
    this.generateHwWalletsMissingXfpFn,
    3000,
    {
      leading: false,
      trailing: true,
    },
  );

  buildQrWalletFullXfp({
    shortXfp,
    airGapAccounts,
  }: {
    shortXfp: string;
    airGapAccounts: IQrWalletAirGapAccount[];
  }) {
    if (!airGapAccounts?.length) {
      return;
    }
    const firstTaprootAccount = airGapAccounts.find(
      (item) => item.path === BTC_FIRST_TAPROOT_PATH,
    );
    if (!firstTaprootAccount) {
      return;
    }
    const xpub = firstTaprootAccount.extendedPublicKey;
    if (xpub && shortXfp) {
      const fullXfp = accountUtils.buildFullXfp({
        xfp: shortXfp,
        firstTaprootXpub: xpub,
      });
      return fullXfp;
    }
  }

  async generateAllQrWalletsMissingXfp() {
    const { wallets } = await this.getAllWallets({ refillWalletInfo: true });
    const qrWallets = wallets.filter((wallet) =>
      accountUtils.isQrWallet({ walletId: wallet.id }),
    );
    if (!qrWallets?.length) {
      return;
    }
    await Promise.all(
      qrWallets.map(async (wallet) => {
        if (!wallet?.id) {
          return;
        }
        if (!accountUtils.isQrWallet({ walletId: wallet?.id })) {
          return;
        }
        if (wallet && accountUtils.isValidWalletXfp({ xfp: wallet?.xfp })) {
          console.log('wallet already has xfp', wallet.xfp);
          return;
        }
        const shortXfp = wallet.xfp;
        const airGapAccounts = wallet.airGapAccountsInfo?.accounts;
        if (shortXfp && airGapAccounts?.length) {
          // TODO airGapAccounts missing firstTaprootAccount, show QR code to add if current wallet is self
          const fullXfp = this.buildQrWalletFullXfp({
            shortXfp,
            airGapAccounts,
          });
          if (fullXfp) {
            await localDb.updateWalletsHashAndXfp({
              [wallet?.id]: { xfp: fullXfp },
            });
          }
        }
      }),
    );
  }

  @backgroundMethod()
  async generateHwWalletsMissingXfp({
    wallet,
    connectId,
    deviceId,
  }: {
    wallet: IDBWallet | undefined;
    connectId: string;
    deviceId: string | undefined;
  }) {
    await this.generateHwWalletsMissingXfpDebounced({
      wallet,
      connectId,
      deviceId,
    });
  }

  @backgroundMethod()
  @toastIfError()
  async generateWalletsMissingMetaWithUserInteraction({
    walletId,
  }: {
    walletId: string;
  }) {
    try {
      if (!walletId) {
        throw new Error('walletId is required');
      }
      const wallet = await localDb.getWalletSafe({ walletId });
      if (!wallet) {
        throw new Error('wallet not found');
      }

      let walletUpdated = false;

      const isHdWallet = accountUtils.isHdWallet({ walletId: wallet.id });
      if (isHdWallet) {
        if (
          isHdWallet &&
          wallet.hash &&
          accountUtils.isValidWalletXfp({ xfp: wallet.xfp })
        ) {
          return;
        }
        const { password } =
          await this.backgroundApi.servicePassword.promptPasswordVerify({});
        if (!password) {
          return;
        }
        await this.generateAllHDWalletMissingHashAndXfp({ password });
        walletUpdated = true;
      }

      const isHwWallet = accountUtils.isHwWallet({ walletId: wallet.id });
      if (isHwWallet) {
        if (isHwWallet && accountUtils.isValidWalletXfp({ xfp: wallet.xfp })) {
          return;
        }
        const device = await localDb.getWalletDeviceSafe({
          dbWallet: wallet,
          walletId: wallet?.id,
        });
        if (!device) {
          throw new Error('wallet associated device not found');
        }
        await this.backgroundApi.serviceHardwareUI.withHardwareProcessing(
          async () => {
            await timerUtils.wait(1000);
            await this.generateHwWalletsMissingXfpFn({
              wallet,
              connectId: device?.connectId || '',
              deviceId: device?.deviceId || '',
              throwError: true,
            });
            await timerUtils.wait(1000);
            walletUpdated = true;
          },
          {
            deviceParams: {
              dbDevice: device,
            },
          },
        );
      }

      const isQrWallet = accountUtils.isQrWallet({ walletId: wallet.id });
      if (isQrWallet) {
        if (isQrWallet && accountUtils.isValidWalletXfp({ xfp: wallet.xfp })) {
          return;
        }
        await this.generateAllQrWalletsMissingXfp();
        walletUpdated = true;
      }

      if (walletUpdated) {
        const { servicePrimeCloudSync } = this.backgroundApi;
        await servicePrimeCloudSync.initLocalSyncItemsDBForLegacyIndexedAccount();

        // TODO syncToSceneWithLocalSyncItems
        // let { items } = await servicePrimeCloudSync.getAllLocalSyncItems();
        // items = items.filter((item) =>
        //   cloudSyncUtils.canSyncWithoutServer(item.dataType),
        // );
        // await servicePrimeCloudSync._syncToSceneWithLocalSyncItems({
        //   items,
        //   syncCredential: undefined,
        // });
      }
    } catch (error) {
      console.error(error);
    }
  }

  @backgroundMethod()
  async updateWalletsDeprecatedState(params: {
    willUpdateDeprecateMap: Record<string, boolean>;
  }) {
    const { willUpdateDeprecateMap } = params;

    if (
      !willUpdateDeprecateMap ||
      Object.keys(willUpdateDeprecateMap).length === 0
    ) {
      return true;
    }

    try {
      for (const [walletId, isDeprecated] of Object.entries(
        willUpdateDeprecateMap,
      )) {
        await localDb.setWalletDeprecated({
          walletId,
          isDeprecated,
        });
      }
      return true;
    } catch (error) {
      console.error(
        `updateWalletsDeprecatedState failed: `,
        error instanceof Error ? error.message : String(error),
      );
    }
    return false;
  }

  async getLocalSameHDWallets({ password }: { password: string }) {
    await this.generateAllHDWalletMissingHashAndXfp({ password });
    const { wallets: allWallets } = await this.getAllWallets({
      refillWalletInfo: true,
    });
    const sameWalletsMap: {
      [walletHash: string]: IDBWallet[];
    } = {};
    for (const wallet of allWallets) {
      const walletHash = wallet.hash;
      if (walletHash) {
        sameWalletsMap[walletHash] = sameWalletsMap[walletHash] || [];
        sameWalletsMap[walletHash].push(wallet);
      }
    }
    const sameWallets: Array<{ walletHash: string; wallets: IDBWallet[] }> = [];
    Object.entries(sameWalletsMap).forEach(([walletHash, wallets]) => {
      if (wallets.length >= 2) {
        sameWallets.push({ walletHash, wallets });
      }
    });
    return sameWallets;
  }

  @backgroundMethod()
  async removeDuplicateHDWallets({
    sameWallets,
    selectedWalletsMap,
  }: {
    sameWallets: {
      walletHash: string;
      wallets: IDBWallet[];
    }[];
    selectedWalletsMap: {
      [walletHash: string]: string; // walletId
    };
  }) {
    const walletsToRemove: string[] = [];

    for (const sameWallet of sameWallets) {
      const selectedWalletId = selectedWalletsMap[sameWallet.walletHash];
      if (selectedWalletId) {
        for (const wallet of sameWallet.wallets) {
          if (wallet.id !== selectedWalletId) {
            walletsToRemove.push(wallet.id);
          }
        }
      }
    }

    for (const walletId of walletsToRemove) {
      await this.removeWallet({ walletId });
    }
    // await timerUtils.wait(3000);
  }

  @backgroundMethod()
  @toastIfError()
  async updateWalletBackupStatus({
    walletId,
    isBackedUp,
  }: {
    walletId: string;
    isBackedUp: boolean;
  }): Promise<void> {
    if (!walletId) {
      return;
    }

    const wallet = await this.getWalletSafe({ walletId });
    if (!wallet) {
      throw new Error('updateWalletBackupStatus ERROR: wallet not found');
    }
    await localDb.updateWalletsBackupStatus({
      [walletId]: {
        isBackedUp,
      },
    });
    appEventBus.emit(EAppEventBusNames.WalletUpdate, undefined);
  }

  @backgroundMethod()
  async migrateHdWalletsBackedUpStatus() {
    const appStatus = await simpleDb.appStatus.getRawData();
    if (appStatus?.hdWalletsBackupMigrated) {
      console.log('migrateHdWalletsBackedUpStatus: already migrated');
      return;
    }
    const { wallets } = await localDb.getWallets();
    const walletsBackedUpStatusMap: {
      [walletId: string]: {
        isBackedUp: boolean;
      };
    } = {};
    for (const wallet of wallets) {
      if (wallet.type === WALLET_TYPE_HD && !wallet.backuped) {
        walletsBackedUpStatusMap[wallet.id] = {
          isBackedUp: true,
        };
      }
    }
    await localDb.updateWalletsBackupStatus(walletsBackedUpStatusMap);

    await simpleDb.appStatus.setRawData((v) => ({
      ...v,
      hdWalletsBackupMigrated: true,
    }));

    if (Object.keys(walletsBackedUpStatusMap).length > 0) {
      appEventBus.emit(EAppEventBusNames.WalletUpdate, undefined);
    }
  }
}

export default ServiceAccount;
