import type { PropsWithChildren, ReactNode } from 'react';

import type { IKeyOfIcons } from '@onekeyhq/components/src/primitives/Icon/Icons';
import type { IFiatCryptoType } from '@onekeyhq/shared/types/fiatCrypto';

import type { IActionItemsProps } from '../../../Home/components/WalletActions/RawActions';

export type IActionProps = PropsWithChildren<{
  networkId: string;
  tokenAddress: string;
  accountId: string;
  walletId: string;
  walletType: string | undefined;
  source: 'homePage' | 'tokenDetails' | 'earn' | 'swap';
}> &
  Partial<IActionItemsProps>;

export type IActionBaseProps = PropsWithChildren<{
  networkId: string;
  tokenAddress: string;
  accountId: string;
  walletId: string;
  type: IFiatCryptoType;
  label: string | ReactNode;
  icon: IKeyOfIcons;
  walletType: string | undefined;
  hiddenIfDisabled?: boolean;
  source: 'homePage' | 'tokenDetails' | 'earn' | 'swap';
}> &
  Partial<IActionItemsProps>;
