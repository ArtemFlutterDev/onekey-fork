import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRoute } from '@react-navigation/core';
import { useIntl } from 'react-intl';
import { useDebouncedCallback } from 'use-debounce';

import { Page } from '@onekeyhq/components';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import { TokenListView } from '@onekeyhq/kit/src/components/TokenListView';
import useAppNavigation from '@onekeyhq/kit/src/hooks/useAppNavigation';
import { useTokenListActions } from '@onekeyhq/kit/src/states/jotai/contexts/tokenList';
import type { IAllNetworkAccountInfo } from '@onekeyhq/kit-bg/src/services/ServiceAllNetwork/ServiceAllNetwork';
import type { IVaultSettings } from '@onekeyhq/kit-bg/src/vaults/types';
import { SEARCH_KEY_MIN_LENGTH } from '@onekeyhq/shared/src/consts/walletConsts';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import type {
  EAssetSelectorRoutes,
  IAssetSelectorParamList,
} from '@onekeyhq/shared/src/routes';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import networkUtils from '@onekeyhq/shared/src/utils/networkUtils';
import { EAccountSelectorSceneName } from '@onekeyhq/shared/types';
import type { IAccountToken } from '@onekeyhq/shared/types/token';

import { AccountSelectorProviderMirror } from '../../../components/AccountSelector';
import { useAccountSelectorCreateAddress } from '../../../components/AccountSelector/hooks/useAccountSelectorCreateAddress';
import { useAccountData } from '../../../hooks/useAccountData';
import { usePromiseResult } from '../../../hooks/usePromiseResult';
import { HomeTokenListProviderMirrorWrapper } from '../../Home/components/HomeTokenListProvider';

import type { RouteProp } from '@react-navigation/core';
import type { TextInputFocusEventData } from 'react-native';

const num = 0;

function TokenSelector() {
  const intl = useIntl();
  const {
    updateCreateAccountState,
    refreshActiveAccountTokenList,
    refreshTokenListMap,
    updateActiveAccountTokenListState,
  } = useTokenListActions().current;

  const route =
    useRoute<
      RouteProp<IAssetSelectorParamList, EAssetSelectorRoutes.TokenSelector>
    >();

  const navigation = useAppNavigation();

  const { createAddress } = useAccountSelectorCreateAddress();

  const {
    title,
    networkId,
    accountId,
    closeAfterSelect = true,
    onSelect,
    searchAll,
    isAllNetworks,
    searchPlaceholder,
    footerTipText,
    activeAccountId,
    activeNetworkId,
  } = route.params;

  const { network, account } = useAccountData({ networkId, accountId });

  const [searchKey, setSearchKey] = useState('');
  const [searchTokenState, setSearchTokenState] = useState({
    isSearching: false,
  });
  const [searchTokenList, setSearchTokenList] = useState<{
    tokens: IAccountToken[];
  }>({ tokens: [] });

  const handleTokenOnPress = useCallback(
    async (token: IAccountToken) => {
      if (network?.isAllNetworks) {
        let vaultSettings: IVaultSettings | undefined;
        if (token.networkId) {
          vaultSettings =
            await backgroundApiProxy.serviceNetwork.getVaultSettings({
              networkId: token.networkId,
            });
        }

        let accounts: IAllNetworkAccountInfo[] = [];

        try {
          if (
            (token.accountId || account?.id) &&
            (token.networkId || network?.id)
          ) {
            const params = token.accountId
              ? {
                  accountId: token.accountId ?? '',
                  networkId: token.networkId ?? '',
                }
              : {
                  accountId: account?.id ?? '',
                  networkId: network?.id ?? '',
                };

            let deriveType;

            if (token.accountId && token.networkId) {
              const tokenAccount =
                await backgroundApiProxy.serviceAccount.getAccount({
                  accountId: token.accountId ?? '',
                  networkId: token.networkId ?? '',
                });
              deriveType = (
                await backgroundApiProxy.serviceNetwork.getDeriveTypeByTemplate(
                  {
                    networkId: token.networkId,
                    template: tokenAccount.template,
                  },
                )
              ).deriveType;
            }

            const { accountsInfo } =
              await backgroundApiProxy.serviceAllNetwork.getAllNetworkAccounts({
                ...params,
                includingNonExistingAccount: true,
                deriveType,
                excludeTestNetwork: false,
              });
            accounts = accountsInfo;
          }
        } catch {
          // pass
        }

        const matchedAccount = accounts.find((item) =>
          token.accountId
            ? item.accountId === token.accountId
            : true && item.networkId === token.networkId,
        );

        if (
          vaultSettings?.mergeDeriveAssetsEnabled ||
          matchedAccount?.accountId
        ) {
          if (matchedAccount?.accountId) {
            void onSelect?.({
              ...token,
              accountId: matchedAccount.accountId,
            });
          } else {
            void onSelect?.(token);
          }
        } else if (account) {
          updateCreateAccountState({
            isCreating: true,
            token,
          });
          const walletId = accountUtils.getWalletIdFromAccountId({
            accountId: account.id,
          });
          try {
            const resp = await createAddress({
              num: 0,
              account: {
                walletId,
                networkId: token.networkId,
                indexedAccountId: account.indexedAccountId,
                deriveType: 'default',
              },
            });

            updateCreateAccountState({
              isCreatingAccount: false,
              token: null,
            });

            if (resp) {
              void onSelect?.({
                ...token,
                accountId: resp.accounts[0]?.id,
              });
            }
          } catch (e) {
            updateCreateAccountState({
              isCreatingAccount: false,
              token: null,
            });
          }
        }
      } else {
        void onSelect?.(token);
      }

      if (closeAfterSelect) {
        navigation.pop();
      }
    },
    [
      account,
      closeAfterSelect,
      createAddress,
      navigation,
      network?.id,
      network?.isAllNetworks,
      onSelect,
      updateCreateAccountState,
    ],
  );

  const debounceUpdateSearchKey = useDebouncedCallback(
    setSearchKey,
    searchAll ? 1000 : 200,
  );

  const headerSearchBarOptions = useMemo(
    () => ({
      placeholder:
        searchPlaceholder ??
        intl.formatMessage({
          id: ETranslations.send_token_selector_search_placeholder,
        }),
      onChangeText: ({
        nativeEvent,
      }: {
        nativeEvent: TextInputFocusEventData;
      }) => {
        debounceUpdateSearchKey(nativeEvent.text);
      },
    }),
    [debounceUpdateSearchKey, intl, searchPlaceholder],
  );

  const searchTokensBySearchKey = useCallback(
    async (keywords: string) => {
      setSearchTokenState({ isSearching: true });
      await backgroundApiProxy.serviceToken.abortSearchTokens();
      try {
        const result = await backgroundApiProxy.serviceToken.searchTokens({
          accountId,
          networkId,
          keywords,
        });
        setSearchTokenList({ tokens: result });
      } catch (e) {
        console.log(e);
      }
      setSearchTokenState({ isSearching: false });
    },
    [accountId, networkId],
  );

  const showActiveAccountTokenList = useMemo(() => {
    return !!(
      activeAccountId &&
      activeNetworkId &&
      activeAccountId !== accountId &&
      activeNetworkId !== networkId
    );
  }, [activeAccountId, activeNetworkId, accountId, networkId]);

  usePromiseResult(async () => {
    if (activeAccountId && activeNetworkId && showActiveAccountTokenList) {
      updateActiveAccountTokenListState({
        initialized: false,
        isRefreshing: true,
      });
      const r = await backgroundApiProxy.serviceToken.fetchAccountTokens({
        accountId,
        networkId,
        flag: 'token-selector',
      });

      refreshActiveAccountTokenList({
        tokens: [...r.tokens.data, ...r.smallBalanceTokens.data],
        keys: `${r.tokens.keys}_${r.smallBalanceTokens.keys}`,
      });
      refreshTokenListMap({
        tokens: {
          ...r.tokens.map,
          ...r.smallBalanceTokens.map,
        },
        merge: true,
      });
      updateActiveAccountTokenListState({
        isRefreshing: false,
        initialized: true,
      });
    }
  }, [
    accountId,
    activeAccountId,
    activeNetworkId,
    networkId,
    refreshActiveAccountTokenList,
    refreshTokenListMap,
    showActiveAccountTokenList,
    updateActiveAccountTokenListState,
  ]);

  useEffect(() => {
    if (searchAll && searchKey && searchKey.length >= SEARCH_KEY_MIN_LENGTH) {
      void searchTokensBySearchKey(searchKey);
    } else {
      setSearchTokenState({ isSearching: false });
      setSearchTokenList({ tokens: [] });
      void backgroundApiProxy.serviceToken.abortSearchTokens();
    }
  }, [searchAll, searchKey, searchTokensBySearchKey]);

  return (
    <Page
      safeAreaEnabled={false}
      onClose={() => setSearchKey('')}
      onUnmounted={() => setSearchKey('')}
    >
      <Page.Header
        title={
          title ??
          intl.formatMessage({
            id: ETranslations.global_select_crypto,
          })
        }
        headerSearchBarOptions={headerSearchBarOptions}
      />
      <Page.Body>
        <TokenListView
          showActiveAccountTokenList={showActiveAccountTokenList}
          withPresetVerticalPadding={false}
          onPressToken={handleTokenOnPress}
          isAllNetworks={isAllNetworks ?? network?.isAllNetworks}
          withNetwork={isAllNetworks ?? network?.isAllNetworks}
          searchAll={searchAll}
          footerTipText={footerTipText}
          isTokenSelector
          tokenSelectorSearchKey={searchKey}
          tokenSelectorSearchTokenState={searchTokenState}
          tokenSelectorSearchTokenList={searchTokenList}
        />
      </Page.Body>
    </Page>
  );
}

export default function TokenSelectorModal() {
  const route =
    useRoute<
      RouteProp<IAssetSelectorParamList, EAssetSelectorRoutes.TokenSelector>
    >();

  const { accountId } = route.params;

  return (
    <AccountSelectorProviderMirror
      config={{
        sceneName: EAccountSelectorSceneName.home,
      }}
      enabledNum={[num]}
    >
      <HomeTokenListProviderMirrorWrapper accountId={accountId}>
        <TokenSelector />
      </HomeTokenListProviderMirrorWrapper>
    </AccountSelectorProviderMirror>
  );
}
