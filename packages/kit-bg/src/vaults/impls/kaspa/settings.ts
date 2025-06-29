import BigNumber from 'bignumber.js';

import { DUST_AMOUNT } from '@onekeyhq/core/src/chains/kaspa/sdkKaspa';
import { ECoreApiExportedSecretKeyType } from '@onekeyhq/core/src/types';
import {
  COINTYPE_KASPA,
  IMPL_KASPA,
  INDEX_PLACEHOLDER,
} from '@onekeyhq/shared/src/engine/engineConsts';
import { ETranslations } from '@onekeyhq/shared/src/locale';

import { EDBAccountType } from '../../../dbs/local/consts';

import type { IAccountDeriveInfoMapBase, IVaultSettings } from '../../types';

const accountDeriveInfo: IAccountDeriveInfoMapBase = {
  default: {
    namePrefix: 'KASPA',
    labelKey: ETranslations.bip44__standard,
    template: `m/44'/${COINTYPE_KASPA}'/0'/0/${INDEX_PLACEHOLDER}`,
    coinType: COINTYPE_KASPA,
  },
};

const settings: IVaultSettings = {
  impl: IMPL_KASPA,
  coinTypeDefault: COINTYPE_KASPA,
  accountType: EDBAccountType.SIMPLE,

  importedAccountEnabled: true,
  hardwareAccountEnabled: true,
  externalAccountEnabled: false,
  watchingAccountEnabled: true,

  supportExportedSecretKeys: [
    ECoreApiExportedSecretKeyType.privateKey,
    // ECoreApiExportedSecretKeyType.publicKey,
  ],

  defaultFeePresetIndex: 1,

  isUtxo: false,
  isSingleToken: false,
  NFTEnabled: false,
  nonceRequired: false,
  feeUTXORequired: false,
  editFeeEnabled: true,
  replaceTxEnabled: false,
  estimatedFeePollingInterval: 300,

  customRpcEnabled: true,

  accountDeriveInfo,
  networkInfo: {
    default: {
      curve: 'secp256k1',
      addressPrefix: '',
    },
  },

  nativeMinTransferAmount: new BigNumber(DUST_AMOUNT).shiftedBy(-8).toFixed(),
  isNativeTokenContractAddressEmpty: false,

  afterSendTxActionEnabled: true,
};

export default Object.freeze(settings);
