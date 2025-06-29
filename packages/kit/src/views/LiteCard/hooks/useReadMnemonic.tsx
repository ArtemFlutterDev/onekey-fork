import { useCallback, useMemo } from 'react';

import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import { ELiteCardRoutes, EModalRoutes } from '@onekeyhq/shared/src/routes';

import useAppNavigation from '../../../hooks/useAppNavigation';

export default function useReadMnemonic() {
  const navigation = useAppNavigation();
  const readWalletIdFromSelectWallet = useCallback(
    () =>
      new Promise<string>((resolve) => {
        navigation.pushModal(EModalRoutes.LiteCardModal, {
          screen: ELiteCardRoutes.LiteCardSelectWallet,
          params: {
            onPick: async (wallet) => {
              navigation.popStack();
              resolve(wallet.id);
            },
          },
        });
      }),
    [navigation],
  );
  const readMnemonicWithWalletId = useCallback(
    async (_walletId: string | undefined) => {
      let walletId = _walletId;
      if (!walletId) {
        walletId = await readWalletIdFromSelectWallet();
      }
      await backgroundApiProxy.servicePassword.clearCachedPassword();
      const { password } =
        await backgroundApiProxy.servicePassword.promptPasswordVerifyByWallet({
          walletId,
        });

      const { mnemonic } =
        await backgroundApiProxy.serviceAccount.getCredentialDecrypt({
          password,
          credentialId: walletId,
        });
      return {
        mnemonic,
        walletId,
      };
    },
    [readWalletIdFromSelectWallet],
  );
  return useMemo(
    () => ({ readMnemonicWithWalletId }),
    [readMnemonicWithWalletId],
  );
}
