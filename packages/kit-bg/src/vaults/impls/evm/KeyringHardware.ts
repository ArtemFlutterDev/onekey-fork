/* eslint-disable @typescript-eslint/no-unused-vars */

import { web3Errors } from '@onekeyfe/cross-inpage-provider-errors';
import { TypedDataUtils } from 'eth-sig-util';
import { omit } from 'lodash';

import { buildSignedTxFromSignatureEvm } from '@onekeyhq/core/src/chains/evm/sdkEvm';
import type { UnsignedTransaction } from '@onekeyhq/core/src/chains/evm/sdkEvm/ethers';
import type { IEncodedTxEvm } from '@onekeyhq/core/src/chains/evm/types';
import coreChainApi from '@onekeyhq/core/src/instance/coreChainApi';
import type {
  ICoreApiGetAddressItem,
  ISignedMessagePro,
  ISignedTxPro,
  IUnsignedMessage,
  IUnsignedMessageEth,
  IUnsignedTxPro,
} from '@onekeyhq/core/src/types';
import { NotImplemented } from '@onekeyhq/shared/src/errors';
import {
  convertDeviceError,
  convertDeviceResponse,
} from '@onekeyhq/shared/src/errors/utils/deviceErrorUtils';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import { checkIsDefined } from '@onekeyhq/shared/src/utils/assertUtils';
import hexUtils from '@onekeyhq/shared/src/utils/hexUtils';
import numberUtils from '@onekeyhq/shared/src/utils/numberUtils';
import type {
  IDeviceResponseResult,
  IDeviceSharedCallParams,
} from '@onekeyhq/shared/types/device';
import { EMessageTypesEth } from '@onekeyhq/shared/types/message';

import { KeyringHardwareBase } from '../../base/KeyringHardwareBase';

import type { IDBAccount } from '../../../dbs/local/types';
import type {
  IBuildHwAllNetworkPrepareAccountsParams,
  IHwSdkNetwork,
  IPrepareHardwareAccountsParams,
  ISignMessageParams,
  ISignTransactionParams,
} from '../../types';
import type {
  AllNetworkAddressParams,
  CoreApi,
  EVMSignedTx,
  EVMTransaction,
  EVMTransactionEIP1559,
} from '@onekeyfe/hd-core';

async function hardwareEvmSignTransaction({
  sdk,
  path,
  chainId,
  unsignedTx,
  deviceParams,
}: {
  sdk: CoreApi;
  path: string;
  chainId: number;
  unsignedTx: IUnsignedTxPro;
  deviceParams: IDeviceSharedCallParams;
}): Promise<ISignedTxPro> {
  const { dbDevice, deviceCommonParams } = checkIsDefined(deviceParams);
  const { connectId = '', deviceId } = dbDevice;

  let response: IDeviceResponseResult<EVMSignedTx> | undefined;
  const encodedTx = unsignedTx.encodedTx as IEncodedTxEvm;

  const isEip1559 = encodedTx.maxFeePerGas || encodedTx.maxPriorityFeePerGas;

  let txToSign: EVMTransaction | EVMTransactionEIP1559;

  const nonce = numberUtils.numberToHex(checkIsDefined(encodedTx.nonce), {
    prefix0x: true,
  });
  const gasLimit = numberUtils.numberToHex(checkIsDefined(encodedTx.gasLimit), {
    prefix0x: true,
  });

  const value = encodedTx.value ?? '0x0';
  const data = encodedTx.data ?? '0x';
  const to = encodedTx.to ?? '';

  if (isEip1559) {
    const txToSignEIP1559: EVMTransactionEIP1559 = {
      ...omit(encodedTx, 'from'),
      to,
      value,
      data,
      chainId,
      nonce,
      gasPrice: undefined,
      gasLimit,
      maxFeePerGas: checkIsDefined(encodedTx.maxFeePerGas),
      maxPriorityFeePerGas: checkIsDefined(encodedTx.maxPriorityFeePerGas),
    };
    txToSign = txToSignEIP1559;
  } else {
    const txToSignNormal: EVMTransaction = {
      ...omit(encodedTx, 'from'),
      to,
      value,
      data,
      chainId,
      nonce,
      gasPrice: checkIsDefined(encodedTx.gasPrice),
      gasLimit,
      maxFeePerGas: undefined,
      maxPriorityFeePerGas: undefined,
    };
    txToSign = txToSignNormal;
  }

  const tx: UnsignedTransaction = {
    to: txToSign.to,
    gasPrice: txToSign.gasPrice,
    gasLimit: txToSign.gasLimit,
    nonce: parseInt(txToSign.nonce, 16),
    data: txToSign.data,
    value: txToSign.value,
    chainId: txToSign.chainId,
  };

  if (isEip1559) {
    tx.type = 2;
    tx.maxFeePerGas = txToSign?.maxFeePerGas ?? undefined;
    tx.maxPriorityFeePerGas = txToSign?.maxPriorityFeePerGas ?? undefined;

    if ((txToSign as EVMTransactionEIP1559).accessList) {
      tx.accessList = (txToSign as EVMTransactionEIP1559).accessList;
    }
  }

  const result = await convertDeviceResponse(async () =>
    sdk.evmSignTransaction(connectId, deviceId, {
      path,
      transaction: txToSign,
      ...deviceCommonParams,
    }),
  );

  const { rawTx, txid } = buildSignedTxFromSignatureEvm({
    tx,
    signature: result,
  });
  return { txid, rawTx, encodedTx };
}

export class KeyringHardware extends KeyringHardwareBase {
  override coreApi = coreChainApi.evm.hd;

  async signTransaction(params: ISignTransactionParams): Promise<ISignedTxPro> {
    const sdk = await this.getHardwareSDKInstance();
    const path = await this.vault.getAccountPath();
    const chainId = await this.getNetworkChainId();
    const { unsignedTx } = params;
    return hardwareEvmSignTransaction({
      sdk,
      path,
      chainId: Number(chainId),
      unsignedTx,
      deviceParams: checkIsDefined(params.deviceParams),
    });
  }

  override signMessage(params: ISignMessageParams): Promise<ISignedMessagePro> {
    const { messages, deviceParams } = params;
    checkIsDefined(deviceParams);
    return Promise.all(
      messages.map(async (message: IUnsignedMessage) =>
        this.handleSignMessage({
          message: message as IUnsignedMessageEth,
          deviceParams,
        }),
      ),
    );
  }

  async handleSignMessage(params: {
    message: IUnsignedMessageEth;
    deviceParams: IDeviceSharedCallParams | undefined;
  }): Promise<string> {
    const { message, deviceParams } = params;
    if (!deviceParams) {
      throw new Error('deviceParams is undefined');
    }
    const { dbDevice, deviceCommonParams } = deviceParams;
    const { connectId, deviceId } = dbDevice;

    const sdk = await this.getHardwareSDKInstance();
    const path = await this.vault.getAccountPath();

    const chainId = Number(await this.getNetworkChainId());

    if (
      message.type === EMessageTypesEth.TYPED_DATA_V1 ||
      message.type === EMessageTypesEth.ETH_SIGN
    ) {
      throw new NotImplemented();
    }

    if (message.type === EMessageTypesEth.PERSONAL_SIGN) {
      let messageBuffer: Buffer;
      try {
        if (!hexUtils.isHexString(message.message))
          throw new Error('not hex string');

        messageBuffer = Buffer.from(message.message.replace('0x', ''), 'hex');
      } catch (error) {
        messageBuffer = Buffer.from('');
      }

      let messageHex = message.message;
      if (messageBuffer.length === 0) {
        messageHex = Buffer.from(message.message, 'utf-8').toString('hex');
      }

      const res = await sdk.evmSignMessage(connectId, deviceId, {
        path,
        messageHex,
        chainId,
        ...deviceCommonParams,
      });

      if (!res.success) {
        throw convertDeviceError(res.payload);
      }

      return hexUtils.addHexPrefix(res?.payload?.signature || '');
    }

    if (
      message.type === EMessageTypesEth.TYPED_DATA_V3 ||
      message.type === EMessageTypesEth.TYPED_DATA_V4
    ) {
      const useV4 = message.type === EMessageTypesEth.TYPED_DATA_V4;
      const data = JSON.parse(message.message);
      const typedData = TypedDataUtils.sanitizeData(data);
      const domainHash = TypedDataUtils.hashStruct(
        'EIP712Domain',
        typedData.domain,
        typedData.types,
        useV4,
      ).toString('hex');
      const messageHash = TypedDataUtils.hashStruct(
        // @ts-expect-error
        typedData.primaryType,
        typedData.message,
        typedData.types,
        useV4,
      ).toString('hex');

      const res = await sdk.evmSignTypedData(connectId, deviceId, {
        path,
        metamaskV4Compat: !!useV4,
        data,
        domainHash,
        messageHash,
        chainId,
        ...deviceCommonParams,
      });

      if (!res.success) {
        throw convertDeviceError(res.payload);
      }

      return hexUtils.addHexPrefix(res?.payload?.signature || '');
    }

    throw web3Errors.rpc.methodNotFound(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Sign message method=${message.type} not found`,
    );
  }

  override hwSdkNetwork: IHwSdkNetwork = 'evm';

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
            template,
            coinName,
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

            // defaultLogger.account.accountCreatePerf.sdkEvmGetAddress();
            // const response = await sdk.evmGetAddress(connectId, deviceId, {
            //   ...params.deviceParams.deviceCommonParams, // passpharse params
            //   bundle: usedIndexes.map((index, arrIndex) => ({
            //     path: buildFullPath({
            //       index,
            //     }),
            //     /**
            //      * Search accounts not show detail at device.Only show on device when add accounts into wallet.
            //      */
            //     showOnOneKey: showOnOnekeyFn(arrIndex),
            //     chainId: Number(chainId),
            //   })),
            // });
            // defaultLogger.account.accountCreatePerf.sdkEvmGetAddressDone({
            //   deriveTypeLabel: params.deriveInfo?.label ?? '',
            //   indexes: usedIndexes,
            //   coinName,
            //   chainId,
            // });

            // return response;
          },
        });

        console.log('evm-buildAddressesInfo', publicKeys);

        const ret: ICoreApiGetAddressItem[] = [];
        for (let i = 0; i < publicKeys.length; i += 1) {
          const item = publicKeys[i];
          const { path, address } = item;
          const { normalizedAddress } = await this.vault.validateAddress(
            address,
          );
          const addressInfo: ICoreApiGetAddressItem = {
            address: normalizedAddress || address,
            path,
            publicKey: '', // TODO return pub from hardware?
          };
          ret.push(addressInfo);
        }
        return ret;
      },
    });
  }
}
