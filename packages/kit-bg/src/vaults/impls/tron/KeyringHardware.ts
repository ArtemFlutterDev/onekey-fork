/* eslint-disable @typescript-eslint/no-unused-vars */
import { isNil } from 'lodash';
import { utils } from 'tronweb';

import type { IEncodedTxTron } from '@onekeyhq/core/src/chains/tron/types';
import coreChainApi from '@onekeyhq/core/src/instance/coreChainApi';
import type {
  ICoreApiGetAddressItem,
  ISignedMessagePro,
  ISignedTxPro,
} from '@onekeyhq/core/src/types';
import { NotImplemented } from '@onekeyhq/shared/src/errors';
import { convertDeviceResponse } from '@onekeyhq/shared/src/errors/utils/deviceErrorUtils';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import { checkIsDefined } from '@onekeyhq/shared/src/utils/assertUtils';

import { KeyringHardwareBase } from '../../base/KeyringHardwareBase';

import type { IDBAccount } from '../../../dbs/local/types';
import type {
  IBuildHwAllNetworkPrepareAccountsParams,
  IHwSdkNetwork,
  IPrepareHardwareAccountsParams,
  ISignTransactionParams,
} from '../../types';
import type {
  AllNetworkAddressParams,
  TronTransactionContract,
} from '@onekeyfe/hd-core';
import type { Types } from 'tronweb';

export class KeyringHardware extends KeyringHardwareBase {
  override coreApi = coreChainApi.tron.hd;

  override hwSdkNetwork: IHwSdkNetwork = 'tron';

  override async buildHwAllNetworkPrepareAccountsParams(
    params: IBuildHwAllNetworkPrepareAccountsParams,
  ): Promise<AllNetworkAddressParams | undefined> {
    return {
      network: this.hwSdkNetwork,
      path: params.path,
      showOnOneKey: false,
    };
  }

  override async prepareAccounts(
    params: IPrepareHardwareAccountsParams,
  ): Promise<IDBAccount[]> {
    const chainId = await this.getNetworkChainId();

    return this.basePrepareHdNormalAccounts(params, {
      buildAddressesInfo: async ({ usedIndexes }) => {
        const publicKeys = await this.baseGetDeviceAccountAddresses({
          params,
          usedIndexes,
          sdkGetAddressFn: async ({
            connectId,
            deviceId,
            pathPrefix,
            pathSuffix,
            coinName,
            showOnOnekeyFn,
            template,
          }) => {
            const buildFullPath = (p: { index: number }) =>
              accountUtils.buildPathFromTemplate({
                template,
                index: p.index,
              });

            const allNetworkAccounts = await this.getAllNetworkPrepareAccounts({
              params,
              usedIndexes,
              buildPath: buildFullPath,
              buildResultAccount: ({ account }) => ({
                path: account.path,
                address: account.payload?.address || '',
              }),
              hwSdkNetwork: this.hwSdkNetwork,
            });
            if (allNetworkAccounts) {
              return allNetworkAccounts;
            }

            throw new Error('use sdk allNetworkGetAddress instead');

            // const sdk = await this.getHardwareSDKInstance();

            // const response = await sdk.tronGetAddress(connectId, deviceId, {
            //   ...params.deviceParams.deviceCommonParams,
            //   bundle: usedIndexes.map((index, arrIndex) => ({
            //     path: `${pathPrefix}/${pathSuffix.replace(
            //       '{index}',
            //       `${index}`,
            //     )}`,
            //     showOnOneKey: showOnOnekeyFn(arrIndex),
            //     chainId: Number(chainId),
            //   })),
            // });
            // return response;
          },
        });

        console.log('tron-buildAddressesInfo', publicKeys);

        const ret: ICoreApiGetAddressItem[] = [];
        for (let i = 0; i < publicKeys.length; i += 1) {
          const item = publicKeys[i];
          const { path, address } = item;
          const { normalizedAddress } = await this.vault.validateAddress(
            address ?? '',
          );
          const addressInfo: ICoreApiGetAddressItem = {
            address: normalizedAddress || address || '',
            path,
            publicKey: '',
          };
          ret.push(addressInfo);
        }
        return ret;
      },
    });
  }

  override async signTransaction(
    params: ISignTransactionParams,
  ): Promise<ISignedTxPro> {
    const { unsignedTx, deviceParams } = params;
    const encodedTx = unsignedTx.encodedTx as IEncodedTxTron;
    const {
      ref_block_bytes: refBlockBytes,
      ref_block_hash: refBlockHash,
      expiration,
      timestamp,
      fee_limit: feeLimit,
    } = encodedTx.raw_data;

    let contractCall: TronTransactionContract | undefined;
    switch (encodedTx.raw_data.contract[0].type) {
      case 'TransferContract': {
        const { amount, to_address: toAddressHex } = encodedTx.raw_data
          .contract[0].parameter.value as Types.TransferContract;
        contractCall = {
          transferContract: {
            amount,
            toAddress: utils.address.fromHex(toAddressHex),
          },
        };
        break;
      }
      case 'TriggerSmartContract': {
        const {
          contract_address: contractAddressHex,
          call_value: callValue,
          data,
        } = encodedTx.raw_data.contract[0].parameter
          .value as Types.TriggerSmartContract;
        contractCall = {
          triggerSmartContract: {
            contractAddress: utils.address.fromHex(contractAddressHex),
            data,
            callValue,
          },
        };
        break;
      }
      case 'FreezeBalanceV2Contract': {
        const { frozen_balance: frozenBalance, resource = 'BANDWIDTH' } =
          encodedTx.raw_data.contract[0].parameter
            .value as Types.FreezeBalanceV2Contract;
        contractCall = {
          freezeBalanceV2Contract: {
            frozenBalance,
            ...(resource === 'BANDWIDTH' ? null : { resource: 1 }),
          },
        };

        break;
      }
      case 'UnfreezeBalanceV2Contract': {
        const { unfreeze_balance: unfreezeBalance, resource = 'BANDWIDTH' } =
          encodedTx.raw_data.contract[0].parameter
            .value as Types.UnfreezeBalanceV2Contract;
        contractCall = {
          unfreezeBalanceV2Contract: {
            unfreezeBalance,
            ...(resource === 'BANDWIDTH' ? null : { resource: 1 }),
          },
        };
        break;
      }

      case 'DelegateResourceContract': {
        const {
          receiver_address: receiverAddress,
          resource = 'BANDWIDTH',
          balance,
          lock,
        } = encodedTx.raw_data.contract[0].parameter
          .value as Types.DelegateResourceContract;
        contractCall = {
          delegateResourceContract: {
            balance,
            receiverAddress: utils.address.fromHex(receiverAddress),
            ...(lock ? { lock } : null),
            ...(resource === 'BANDWIDTH' ? null : { resource: 1 }),
          },
        };

        break;
      }
      case 'UnDelegateResourceContract': {
        const {
          receiver_address: receiverAddress,
          resource = 'BANDWIDTH',
          balance,
        } = encodedTx.raw_data.contract[0].parameter
          .value as Types.UnDelegateResourceContract;
        contractCall = {
          unDelegateResourceContract: {
            balance,
            receiverAddress: utils.address.fromHex(receiverAddress),
            ...(resource === 'BANDWIDTH' ? null : { resource: 1 }),
          },
        };
        break;
      }
      case 'WithdrawBalanceContract': {
        const { owner_address: ownerAddress } = encodedTx.raw_data.contract[0]
          .parameter.value as Types.WithdrawBalanceContract;
        contractCall = {
          withdrawBalanceContract: {
            ownerAddress: utils.address.fromHex(ownerAddress),
          },
        };
        break;
      }
      case 'WithdrawExpireUnfreezeContract': {
        contractCall = {
          // @ts-ignore
          withdrawExpireUnfreezeContract: {},
        };
        break;
      }
      case 'VoteWitnessContract': {
        const { votes } = encodedTx.raw_data.contract[0].parameter
          .value as Types.VoteWitnessContract;
        contractCall = {
          voteWitnessContract: {
            votes: votes.map((vote) => ({
              voteAddress: utils.address.fromHex(vote.vote_address),
              voteCount: vote.vote_count,
            })),
          },
        };
        break;
      }
      case 'CancelAllUnfreezeV2Contract': {
        contractCall = {
          // @ts-expect-error
          cancelAllUnfreezeV2Contract: {},
        };
        break;
      }
      default:
    }

    if (isNil(contractCall)) {
      throw new NotImplemented();
    }

    const sdk = await this.getHardwareSDKInstance();
    const path = await this.vault.getAccountPath();
    const { deviceCommonParams, dbDevice } = checkIsDefined(deviceParams);
    const { connectId, deviceId } = dbDevice;

    const result = await convertDeviceResponse(async () =>
      sdk.tronSignTransaction(connectId, deviceId, {
        path,
        transaction: {
          refBlockBytes,
          refBlockHash,
          expiration,
          timestamp,
          feeLimit: feeLimit as number,
          contract: contractCall,
        },
        ...deviceCommonParams,
      }),
    );

    const { signature, serialized_tx: serializedTx } = result;
    return Promise.resolve({
      txid: encodedTx.txID,
      encodedTx,
      rawTx: JSON.stringify({
        ...encodedTx,
        raw_data_hex: serializedTx || encodedTx.raw_data_hex,
        signature: [signature],
      }),
    });
  }

  override signMessage(): Promise<ISignedMessagePro> {
    throw new NotImplemented('Signing tron message is not supported yet.');
  }
}
