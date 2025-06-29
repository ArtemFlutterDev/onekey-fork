import { useCallback } from 'react';

import { useIntl } from 'react-intl';

import type { IPageNavigationProp } from '@onekeyhq/components';
import useAppNavigation from '@onekeyhq/kit/src/hooks/useAppNavigation';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { EModalReceiveRoutes, EModalRoutes } from '@onekeyhq/shared/src/routes';
import type { IModalReceiveParamList } from '@onekeyhq/shared/src/routes';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import networkUtils from '@onekeyhq/shared/src/utils/networkUtils';
import type { INetworkAccount } from '@onekeyhq/shared/types/account';
import { EDeriveAddressActionType } from '@onekeyhq/shared/types/address';
import type { IToken, ITokenData } from '@onekeyhq/shared/types/token';

import backgroundApiProxy from '../background/instance/backgroundApiProxy';

import { useAccountData } from './useAccountData';

function useReceiveToken({
  accountId,
  networkId,
  walletId,
  tokens,
  tokenListState,
  isMultipleDerive,
  indexedAccountId,
}: {
  accountId: string;
  networkId: string;
  walletId: string;
  indexedAccountId: string;
  isAllNetworks?: boolean;
  tokens?: ITokenData;
  tokenListState?: {
    isRefreshing: boolean;
    initialized: boolean;
  };
  isMultipleDerive?: boolean;
}) {
  const intl = useIntl();
  const { vaultSettings, account, network } = useAccountData({
    networkId,
    accountId,
  });

  const navigation =
    useAppNavigation<IPageNavigationProp<IModalReceiveParamList>>();
  const handleOnReceive = useCallback(
    (token?: IToken) => {
      if (networkUtils.isLightningNetworkByNetworkId(networkId)) {
        navigation.pushModal(EModalRoutes.ReceiveModal, {
          screen: EModalReceiveRoutes.CreateInvoice,
          params: {
            networkId,
            accountId,
          },
        });
        return;
      }

      if (vaultSettings?.isSingleToken || token) {
        if (
          isMultipleDerive &&
          !accountUtils.isOthersWallet({ walletId }) &&
          vaultSettings?.mergeDeriveAssetsEnabled
        ) {
          navigation.pushModal(EModalRoutes.ReceiveModal, {
            screen: EModalReceiveRoutes.ReceiveSelectDeriveAddress,
            params: {
              networkId,
              indexedAccountId,
              token: token ?? tokens?.data?.[0],
              tokenMap: tokens?.map,
              actionType: EDeriveAddressActionType.Select,
              onSelected: ({ account: a }: { account: INetworkAccount }) => {
                navigation.push(EModalReceiveRoutes.ReceiveToken, {
                  networkId,
                  accountId: a.id ?? accountId,
                  walletId,
                  token: token ?? tokens?.data?.[0],
                });
              },
            },
          });
          return;
        }

        navigation.pushModal(EModalRoutes.ReceiveModal, {
          screen: EModalReceiveRoutes.ReceiveToken,
          params: {
            networkId,
            accountId,
            walletId,
            token,
          },
        });
      } else {
        navigation.pushModal(EModalRoutes.ReceiveModal, {
          screen: EModalReceiveRoutes.ReceiveSelectToken,
          params: {
            title: intl.formatMessage({ id: ETranslations.global_receive }),
            networkId,
            accountId,
            tokens,
            tokenListState,
            searchAll: true,
            closeAfterSelect: false,
            footerTipText: intl.formatMessage({
              id: ETranslations.receive_token_list_footer_text,
            }),
            onSelect: async (t: IToken) => {
              if (networkUtils.isLightningNetworkByNetworkId(t.networkId)) {
                navigation.pushModal(EModalRoutes.ReceiveModal, {
                  screen: EModalReceiveRoutes.CreateInvoice,
                  params: {
                    networkId: t.networkId ?? '',
                    accountId: t.accountId ?? '',
                  },
                });
                return;
              }

              const settings =
                await backgroundApiProxy.serviceNetwork.getVaultSettings({
                  networkId: t.networkId ?? '',
                });

              if (
                settings.mergeDeriveAssetsEnabled &&
                network?.isAllNetworks &&
                !accountUtils.isOthersWallet({ walletId })
              ) {
                navigation.push(
                  EModalReceiveRoutes.ReceiveSelectDeriveAddress,
                  {
                    networkId: t.networkId ?? '',
                    indexedAccountId: account?.indexedAccountId ?? '',
                    token: t,
                    tokenMap: tokens?.map,
                    accountId: t.accountId ?? '',
                    actionType: EDeriveAddressActionType.Select,
                    onSelected: ({
                      account: a,
                    }: {
                      account: INetworkAccount;
                    }) => {
                      navigation.push(EModalReceiveRoutes.ReceiveToken, {
                        networkId: t.networkId ?? networkId,
                        accountId: a.id ?? accountId,
                        walletId,
                        token: t,
                      });
                    },
                  },
                );
                return;
              }

              navigation.push(EModalReceiveRoutes.ReceiveToken, {
                networkId: t.networkId ?? networkId,
                accountId: t.accountId ?? accountId,
                walletId,
                token: t,
              });
            },
          },
        });
      }
    },
    [
      account?.indexedAccountId,
      accountId,
      indexedAccountId,
      intl,
      isMultipleDerive,
      navigation,
      network?.isAllNetworks,
      networkId,
      tokenListState,
      tokens,
      vaultSettings?.isSingleToken,
      vaultSettings?.mergeDeriveAssetsEnabled,
      walletId,
    ],
  );

  return { handleOnReceive };
}

export { useReceiveToken };
