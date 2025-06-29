import { EAddressEncodings } from '@onekeyhq/core/src/types';
import { getNetworkIdsMap } from '@onekeyhq/shared/src/config/networkIds';
import { EMPTY_NATIVE_TOKEN_ADDRESS } from '@onekeyhq/shared/src/consts/addresses';
import {
  COINNAME_TBTC,
  COINTYPE_TBTC,
  IMPL_TBTC,
  INDEX_PLACEHOLDER,
} from '@onekeyhq/shared/src/engine/engineConsts';
import { EEarnProviderEnum } from '@onekeyhq/shared/types/earn';

import settingsBtc from '../btc/settings';

import type {
  IAccountDeriveInfo,
  IAccountDeriveInfoMapBase,
  IVaultSettings,
} from '../../types';

type IAccountDeriveInfoMapBtc = IAccountDeriveInfoMapBase & {
  default: IAccountDeriveInfo;
  BIP86: IAccountDeriveInfo;
  BIP84: IAccountDeriveInfo;
  BIP44: IAccountDeriveInfo;
};
// TODO make build method
const accountDeriveInfo: IAccountDeriveInfoMapBtc = {
  default: {
    namePrefix: 'TBTC Nested SegWit',
    label: 'Nested SegWit',
    template: `m/49'/${COINTYPE_TBTC}'/${INDEX_PLACEHOLDER}'/0/0`,
    coinType: COINTYPE_TBTC,
    coinName: COINNAME_TBTC,
    addressEncoding: EAddressEncodings.P2SH_P2WPKH,
  },
  BIP86: {
    namePrefix: 'TBTC Taproot',
    label: 'Taproot',
    template: `m/86'/${COINTYPE_TBTC}'/${INDEX_PLACEHOLDER}'/0/0`,
    coinType: COINTYPE_TBTC,
    coinName: COINNAME_TBTC,
    addressEncoding: EAddressEncodings.P2TR,
  },
  BIP84: {
    namePrefix: 'TBTC Native SegWit',
    label: 'Native SegWit',
    template: `m/84'/${COINTYPE_TBTC}'/${INDEX_PLACEHOLDER}'/0/0`,
    coinType: COINTYPE_TBTC,
    coinName: COINNAME_TBTC,
    addressEncoding: EAddressEncodings.P2WPKH,
  },
  BIP44: {
    namePrefix: 'TBTC Legacy',
    label: 'Legacy',
    template: `m/44'/${COINTYPE_TBTC}'/${INDEX_PLACEHOLDER}'/0/0`,
    coinType: COINTYPE_TBTC,
    coinName: COINNAME_TBTC,
    addressEncoding: EAddressEncodings.P2PKH,
    // notRecommended: true,
  },
};

const settings: IVaultSettings = {
  ...settingsBtc,
  accountDeriveInfo,
  impl: IMPL_TBTC,
  coinTypeDefault: COINTYPE_TBTC,
  estimatedFeePollingInterval: 60,
  dappInteractionEnabled: false,
  customRpcEnabled: true,

  stakingConfig: {
    [getNetworkIdsMap().sbtc]: {
      providers: {
        [EEarnProviderEnum.Babylon]: {
          supportedSymbols: ['SBTC'],
          configs: {
            'SBTC': {
              enabled: true,
              tokenAddress: EMPTY_NATIVE_TOKEN_ADDRESS,
              displayProfit: false,
              withdrawWithTx: true,
              claimWithTx: true,
              usePublicKey: true,
              withdrawSignOnly: true,
            },
          },
        },
      },
    },
  },
  stakingResultPollingInterval: 60,

  createAllDeriveTypeAccountsByDefault: false,
};

export default Object.freeze(settings);
