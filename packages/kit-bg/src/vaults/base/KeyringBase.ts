// eslint-disable-next-line max-classes-per-file
import { isNil } from 'lodash';

import type { CoreChainApiBase } from '@onekeyhq/core/src/base/CoreChainApiBase';
import type { ISignedMessagePro, ISignedTxPro } from '@onekeyhq/core/src/types';
import { NotImplemented } from '@onekeyhq/shared/src/errors';
import { defaultLogger } from '@onekeyhq/shared/src/logger/logger';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import timerUtils from '@onekeyhq/shared/src/utils/timerUtils';

import { EDBAccountType } from '../../dbs/local/consts';
import { EVaultKeyringTypes } from '../types';

import { VaultContext } from './VaultContext';

import type { VaultBase } from './VaultBase';
import type {
  IDBAccount,
  IDBSimpleAccount,
  IDBUtxoAccount,
  IDBVariantAccount,
} from '../../dbs/local/types';
import type {
  IBuildHwAllNetworkPrepareAccountsParams,
  IBuildPrepareAccountsPrefixedPathParams,
  IExportAccountSecretKeysParams,
  IExportAccountSecretKeysResult,
  INormalizeGetMultiAccountsPathParams,
  IPrepareAccountsParams,
  IPrepareHdAccountsOptions,
  IPrepareHdAccountsParamsBase,
  ISignMessageParams,
  ISignTransactionParams,
} from '../types';
import type { AllNetworkAddressParams } from '@onekeyfe/hd-core';

export abstract class KeyringBase extends VaultContext {
  constructor(vault: VaultBase) {
    super(vault.options);
    this.vault = vault;
    if (this.vault.networkId !== vault.options.networkId) {
      throw new Error('KeyringBase ERROR: networkId not match1');
    }
    if (this.networkId !== vault.options.networkId) {
      throw new Error('KeyringBase ERROR: networkId not match2');
    }
  }

  vault: VaultBase;

  abstract coreApi: CoreChainApiBase | undefined;

  abstract keyringType: EVaultKeyringTypes;

  isKeyringImported() {
    return this.keyringType === EVaultKeyringTypes.imported;
  }

  isKeyringHd() {
    return this.keyringType === EVaultKeyringTypes.hd;
  }

  isKeyringHardware() {
    return this.keyringType === EVaultKeyringTypes.hardware;
  }

  isKeyringWatching() {
    return this.keyringType === EVaultKeyringTypes.watching;
  }

  async basePrepareHdNormalAccounts(
    params: IPrepareHdAccountsParamsBase,
    options: IPrepareHdAccountsOptions,
  ): Promise<Array<IDBSimpleAccount | IDBVariantAccount>> {
    const { walletId } = this;
    if (!walletId) {
      throw new Error('walletId is not defined');
    }
    const { names, deriveInfo, indexes } = params;
    const { coinType, template, namePrefix, idSuffix } = deriveInfo;
    if (!coinType) {
      throw new Error('coinType is not defined');
    }

    const settings = await this.getVaultSettings();
    const { accountType } = settings;

    const { buildAddressesInfo } = options;

    const usedIndexes = indexes;
    const addressInfos = await buildAddressesInfo({
      usedIndexes,
    });
    const ret: Array<IDBSimpleAccount | IDBVariantAccount> = [];
    for (let idx = 0; idx < addressInfos.length; idx += 1) {
      const { path, publicKey, address, addresses, relPath } =
        addressInfos[idx];
      if (!path) {
        throw new Error('KeyringHD prepareAccounts ERROR: path not found');
      }
      if (accountType === EDBAccountType.VARIANT && !addresses) {
        throw new Error('addresses is required for variant account');
      }
      if (accountType === EDBAccountType.VARIANT && address) {
        throw new Error('address should not set for variant account');
      }

      const pathIndex = usedIndexes[idx];
      const name =
        names?.[idx] ||
        accountUtils.buildHDAccountName({
          pathIndex,
          namePrefix,
        });

      const id = accountUtils.buildHDAccountId({
        walletId,
        path,
        idSuffix,
      });

      const indexedAccountId = accountUtils.buildIndexedAccountId({
        walletId,
        index: pathIndex,
      });

      ret.push({
        id,
        name,
        type: accountType,
        path,
        pathIndex,
        relPath,
        indexedAccountId,
        coinType, // TODO save deriveType to account
        impl: settings.impl,
        pub: publicKey,
        address,
        addresses,
        template,
      });
    }

    return ret;
  }

  async basePrepareHdUtxoAccounts(
    params: IPrepareHdAccountsParamsBase,
    options: IPrepareHdAccountsOptions,
  ): Promise<IDBUtxoAccount[]> {
    const { walletId } = this;
    if (!walletId) {
      throw new Error('walletId is undefined');
    }
    // v5 do not check prev account used, so skipCheckAccountExist is always true
    const { indexes, deriveInfo, names, skipCheckAccountExist = true } = params;
    const { coinType, template, namePrefix } = deriveInfo;
    if (!coinType) {
      throw new Error('coinType is not defined');
    }

    const settings = await this.getVaultSettings();
    const { accountType } = settings;

    if (accountType !== EDBAccountType.UTXO) {
      throw new Error('accountType is not utxo');
    }

    const { checkIsAccountUsed, buildAddressesInfo } = options;

    // const ignoreFirst = indexes[0] !== 0;
    const ignoreFirst = false; // v5 do not check prev account used

    // check first prev non-zero index account existing
    const usedIndexes = [...(ignoreFirst ? [indexes[0] - 1] : []), ...indexes];

    defaultLogger.account.accountCreatePerf.utxoBuildAddressesInfo();
    const addressesInfo = await buildAddressesInfo({
      usedIndexes,
    });
    defaultLogger.account.accountCreatePerf.utxoBuildAddressesInfoDone();

    defaultLogger.account.accountCreatePerf.buildDBUtxoAccounts();
    const ret: IDBUtxoAccount[] = [];
    let idx = 0;
    for (const {
      path,
      relPath,
      publicKey,
      xpub,
      xpubSegwit,
      address,
      addresses,
    } of addressesInfo) {
      if (!path || isNil(xpub) || !addresses) {
        throw new Error(
          'basePrepareHdUtxoAccounts ERROR: path or xpub or addresses is undefined',
        );
      }
      if (!relPath) {
        throw new Error(
          'basePrepareHdUtxoAccounts ERROR: relPath is undefined',
        );
      }

      const prefix = namePrefix;
      const pathIndex = usedIndexes[idx];
      const name = names?.[idx] || `${prefix} #${pathIndex + 1}`;
      // TODO use accountUtils.buildHDAccountId
      const id = `${this.walletId}--${path}`;
      if (!ignoreFirst || idx > 0) {
        const indexedAccountId = accountUtils.buildIndexedAccountId({
          walletId: this.walletId,
          index: pathIndex,
        });

        ret.push({
          id,
          name,
          type: accountType,
          path,
          pathIndex,
          indexedAccountId,
          relPath,
          coinType,
          impl: settings.impl,
          pub: publicKey,
          xpub,
          xpubSegwit,
          address,
          addresses,
          template,
        });
      }

      const isLast = idx === addressesInfo.length - 1;
      if (!skipCheckAccountExist && !isLast && checkIsAccountUsed) {
        const { isUsed } = await checkIsAccountUsed({
          xpub,
          xpubSegwit,
          address,
        });
        if (!isUsed) {
          // Software should prevent a creation of an account
          // if a previous account does not have a transaction history (meaning none of its addresses have been used before).
          // https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki
          break;
        }
        // blockbook API rate limit.
        await timerUtils.wait(200);
      }

      idx += 1;
    }
    defaultLogger.account.accountCreatePerf.buildDBUtxoAccountsDone();

    return ret;
  }

  async batchGetAddresses(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params: IPrepareAccountsParams,
  ): Promise<{ address: string; path: string }[]> {
    return [];
  }

  abstract signTransaction(
    params: ISignTransactionParams,
  ): Promise<ISignedTxPro>;

  abstract signMessage(params: ISignMessageParams): Promise<ISignedMessagePro>;

  abstract prepareAccounts(
    params: IPrepareAccountsParams,
  ): Promise<IDBAccount[]>;

  async exportAccountSecretKeys(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params: IExportAccountSecretKeysParams,
  ): Promise<IExportAccountSecretKeysResult> {
    throw new NotImplemented();
  }

  async buildHwAllNetworkPrepareAccountsParams(
    params: IBuildHwAllNetworkPrepareAccountsParams,
  ): Promise<AllNetworkAddressParams | undefined> {
    return undefined;
  }

  buildPrepareAccountsPrefixedPath(
    params: IBuildPrepareAccountsPrefixedPathParams,
  ): string {
    throw new NotImplemented();
  }
}

// @ts-ignore
export class KeyringBaseMock extends KeyringBase {}
