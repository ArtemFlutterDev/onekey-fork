import { useIntl } from 'react-intl';

import type { IDecodedTxExtraLightning } from '@onekeyhq/core/src/chains/lightning/types';
import { AddressInfo } from '@onekeyhq/kit/src/components/AddressInfo';
import { useAccountData } from '@onekeyhq/kit/src/hooks/useAccountData';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import type { IOnChainHistoryTx } from '@onekeyhq/shared/types/history';
import {
  EDecodedTxActionType,
  type IDecodedTx,
} from '@onekeyhq/shared/types/tx';

import { InfoItem } from './TxDetailsInfoItem';

function LightningTxAttributes({
  decodedTx,
  txDetails,
}: {
  decodedTx: IDecodedTx;
  txDetails?: IOnChainHistoryTx;
}) {
  const intl = useIntl();
  const lightningExtraInfo = decodedTx.extraInfo as IDecodedTxExtraLightning;

  if (!lightningExtraInfo) return null;

  const preimage = lightningExtraInfo.preImage || txDetails?.preimage;

  return (
    <>
      {lightningExtraInfo?.description ? (
        <InfoItem
          label={intl.formatMessage({ id: ETranslations.global_description })}
          renderContent={lightningExtraInfo.description}
        />
      ) : null}
      {preimage ? <InfoItem label="Preimage" renderContent={preimage} /> : null}
    </>
  );
}

function LightningTxFlow({ decodedTx }: { decodedTx: IDecodedTx }) {
  const intl = useIntl();
  const transferAction = decodedTx.actions[0];
  const { networkId, accountId } = decodedTx;
  const { account } = useAccountData({ accountId, networkId });

  if (
    transferAction &&
    transferAction.type === EDecodedTxActionType.ASSET_TRANSFER
  ) {
    if (
      Array.isArray(transferAction.assetTransfer?.receives) &&
      transferAction.assetTransfer.receives.length
    ) {
      return (
        <InfoItem
          label={intl.formatMessage({ id: ETranslations.global_to })}
          renderContent={account?.name ?? ''}
          description={
            <AddressInfo
              address={account?.addressDetail.normalizedAddress ?? ''}
              accountId={accountId}
              networkId={networkId}
            />
          }
        />
      );
    }
    return (
      <InfoItem
        label={intl.formatMessage({ id: ETranslations.global_from })}
        renderContent={account?.name ?? ''}
        description={
          <AddressInfo
            address={account?.addressDetail.normalizedAddress ?? ''}
            accountId={accountId}
            networkId={networkId}
          />
        }
      />
    );
  }
  return null;
}

export { LightningTxAttributes, LightningTxFlow };
