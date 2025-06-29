import { useCallback } from 'react';

import { useIntl } from 'react-intl';

import { ActionList } from '@onekeyhq/components';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import { showRenameDialog } from '@onekeyhq/kit/src/components/RenameDialog';
import type {
  IDBAccount,
  IDBIndexedAccount,
  IDBWallet,
} from '@onekeyhq/kit-bg/src/dbs/local/types';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import {
  EChangeHistoryContentType,
  EChangeHistoryEntityType,
} from '@onekeyhq/shared/src/types/changeHistory';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';

export function AccountRenameButton({
  name,
  wallet,
  indexedAccount,
  account,
  onClose,
}: {
  name: string;
  wallet: IDBWallet | undefined;
  indexedAccount?: IDBIndexedAccount;
  account?: IDBAccount;
  onClose: () => void;
}) {
  const intl = useIntl();
  const { serviceAccount } = backgroundApiProxy;

  const callShowRenameDialog = useCallback(() => {
    showRenameDialog(name, {
      disabledMaxLengthLabel: true,
      indexedAccount,
      nameHistoryInfo: {
        entityId: indexedAccount?.id || account?.id || '',
        entityType: indexedAccount?.id
          ? EChangeHistoryEntityType.IndexedAccount
          : EChangeHistoryEntityType.Account,
        contentType: EChangeHistoryContentType.Name,
      },
      onSubmit: async (newName) => {
        if (indexedAccount?.id && newName) {
          const walletNew = await serviceAccount.getWalletSafe({
            walletId: wallet?.id || '',
          });
          await serviceAccount.setUniversalIndexedAccountName({
            indexedAccountId: indexedAccount?.id,
            index: indexedAccount?.index,
            walletXfp: walletNew?.xfp,
            name: newName,
            shouldCheckDuplicate: true,
          });
        } else if (account?.id && newName) {
          await serviceAccount.setAccountName({
            accountId: account?.id,
            name: newName,
            shouldCheckDuplicate: true,
          });
        }
      },
    });
  }, [account?.id, indexedAccount, name, serviceAccount, wallet?.id]);

  return (
    <ActionList.Item
      icon="PencilOutline"
      label={intl.formatMessage({ id: ETranslations.global_rename })}
      onClose={onClose}
      onPress={() => {
        if (indexedAccount?.id) {
          void (async () => {
            const isHwWallet = accountUtils.isHwWallet({
              walletId: wallet?.id,
            });
            const isQrWallet = accountUtils.isQrWallet({
              walletId: wallet?.id,
            });
            if (!isHwWallet || isQrWallet) {
              await serviceAccount.generateWalletsMissingMetaWithUserInteraction(
                {
                  walletId: wallet?.id || '',
                },
              );
            }
            callShowRenameDialog();
          })();
        } else {
          callShowRenameDialog();
        }
      }}
    />
  );
}
