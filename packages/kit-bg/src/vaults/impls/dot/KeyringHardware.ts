import { u8aConcat } from '@polkadot/util';
import { encodeAddress } from '@polkadot/util-crypto';

import {
  serializeSignedTransaction,
  serializeUnsignedTransaction,
} from '@onekeyhq/core/src/chains/dot/sdkDot';
import {
  DOT_TYPE_PREFIX,
  type IEncodedTxDot,
} from '@onekeyhq/core/src/chains/dot/types';
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
import bufferUtils from '@onekeyhq/shared/src/utils/bufferUtils';
import hexUtils from '@onekeyhq/shared/src/utils/hexUtils';

import { KeyringHardwareBase } from '../../base/KeyringHardwareBase';

import { getMetadataRpc } from './utils';

import type { IDBAccount } from '../../../dbs/local/types';
import type {
  IBuildHwAllNetworkPrepareAccountsParams,
  IHwSdkNetwork,
  IPrepareHardwareAccountsParams,
  ISignMessageParams,
  ISignTransactionParams,
} from '../../types';
import type { AllNetworkAddressParams } from '@onekeyfe/hd-core';

export class KeyringHardware extends KeyringHardwareBase {
  override coreApi = coreChainApi.dot.hd;

  override hwSdkNetwork: IHwSdkNetwork = 'dot';

  override async buildHwAllNetworkPrepareAccountsParams(
    params: IBuildHwAllNetworkPrepareAccountsParams,
  ): Promise<AllNetworkAddressParams | undefined> {
    const networkInfo = await this.getNetworkInfo();
    const chainId = await this.getNetworkChainId();

    return {
      network: this.hwSdkNetwork,
      path: params.path,
      showOnOneKey: false,
      prefix: networkInfo.addressPrefix,
      chainName: chainId,
    };
  }

  override async prepareAccounts(
    params: IPrepareHardwareAccountsParams,
  ): Promise<IDBAccount[]> {
    const networkInfo = await this.getNetworkInfo();
    const chainId = await this.getNetworkChainId();
    return this.basePrepareHdNormalAccounts(params, {
      buildAddressesInfo: async ({ usedIndexes }) => {
        const list = await this.baseGetDeviceAccountAddresses({
          params,
          usedIndexes,
          sdkGetAddressFn: async ({
            connectId,
            deviceId,
            pathPrefix,
            pathSuffix,
            template,
            showOnOnekeyFn,
          }) => {
            const buildFullPath = (p: { index: number }) =>
              accountUtils.buildPathFromTemplate({
                template,
                index: p.index,
              });

            const allNetworkAccounts = await this.getAllNetworkPrepareAccounts({
              params,
              usedIndexes,
              hwSdkNetwork: this.hwSdkNetwork,
              buildPath: buildFullPath,
              buildResultAccount: ({ account, index }) => ({
                path: account.path,
                address: account.payload?.address || '',
                publicKey: account.payload?.publicKey || '',
              }),
            });
            if (allNetworkAccounts) {
              return allNetworkAccounts;
            }
            throw new Error('use sdk allNetworkGetAddress instead');

            // const sdk = await this.getHardwareSDKInstance();
            // const response = await sdk.polkadotGetAddress(connectId, deviceId, {
            //   ...params.deviceParams.deviceCommonParams, // passpharse params
            //   bundle: usedIndexes.map((index, arrIndex) => {
            //     const i = pathSuffix.replace('{index}', `${index}`);
            //     return {
            //       path: `${pathPrefix}/${i}`,
            //       showOnOneKey: showOnOnekeyFn(arrIndex),
            //       prefix: +networkInfo.addressPrefix,
            //       network: chainId,
            //     };
            //   }),
            // });
            // return response;
          },
        });

        const ret: ICoreApiGetAddressItem[] = [];
        for (let i = 0; i < list.length; i += 1) {
          const item = list[i];
          const { path, address, publicKey } = item;
          const addresses = {
            [this.networkId]:
              address ??
              encodeAddress(
                bufferUtils.hexToBytes(hexUtils.addHexPrefix(publicKey)),
                +networkInfo.addressPrefix,
              ),
          };
          const addressInfo: ICoreApiGetAddressItem = {
            address: '',
            addresses,
            path,
            publicKey,
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
    const sdk = await this.getHardwareSDKInstance();
    const unsignedTx = checkIsDefined(params.unsignedTx);
    const deviceParams = checkIsDefined(params.deviceParams);
    const encodedTx = checkIsDefined(unsignedTx.encodedTx) as IEncodedTxDot;
    const { dbDevice, deviceCommonParams } = checkIsDefined(deviceParams);
    const { connectId = '', deviceId } = dbDevice;
    const account = await this.vault.getAccount();
    const network = await this.getNetwork();
    encodedTx.chainName = network.name;
    const metadataRpc = await getMetadataRpc(
      this.networkId,
      this.backgroundApi,
    );
    const tx = await serializeUnsignedTransaction({
      ...encodedTx,
      metadataRpc,
    });
    const { signature } = await convertDeviceResponse(async () =>
      sdk.polkadotSignTransaction(connectId, deviceId, {
        path: account.path,
        network: network.chainId,
        rawTx: bufferUtils.bytesToHex(tx.rawTx),
        ...deviceCommonParams,
      }),
    );
    const txSignature = u8aConcat(
      DOT_TYPE_PREFIX.ed25519,
      bufferUtils.hexToBytes(signature),
    );
    const signedTx = await serializeSignedTransaction(
      { ...encodedTx, metadataRpc },
      bufferUtils.bytesToHex(txSignature),
    );
    return {
      txid: '',
      rawTx: signedTx,
      encodedTx,
      signature: hexUtils.addHexPrefix(bufferUtils.bytesToHex(txSignature)),
    };
  }

  override signMessage(
    _params: ISignMessageParams,
  ): Promise<ISignedMessagePro> {
    throw new NotImplemented();
  }
}
