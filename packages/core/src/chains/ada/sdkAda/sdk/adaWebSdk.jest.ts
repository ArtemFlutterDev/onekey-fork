import * as Loader from '@onekeyfe/cardano-coin-selection-asmjs';

import type { IGetCardanoApi } from './types';

const getCardanoApi: IGetCardanoApi = async () => ({
  composeTxPlan: Loader.onekeyUtils.composeTxPlan,
  signTransaction: Loader.onekeyUtils.signTransaction,
  hwSignTransaction: Loader.trezorUtils.signTransaction,
  txToOneKey: Loader.onekeyUtils.txToOneKey,
  hasSetTagWithBody: Loader.onekeyUtils.hasSetTagWithBody,
  dAppGetBalance: Loader.dAppUtils.getBalance,
  dAppGetAddresses: Loader.dAppUtils.getAddresses,
  dAppGetUtxos: Loader.dAppUtils.getUtxos,
  dAppConvertCborTxToEncodeTx: Loader.dAppUtils.convertCborTxToEncodeTx,
  dAppSignData: Loader.dAppUtils.signData,
});

export default {
  getCardanoApi,
};
