import { memo, useCallback } from 'react';

import { flatMap, map } from 'lodash';
import { useIntl } from 'react-intl';

import { Alert } from '@onekeyhq/components';
import { useAccountData } from '@onekeyhq/kit/src/hooks/useAccountData';
import {
  useDecodedTxsAtom,
  usePreCheckTxStatusAtom,
  useSendFeeStatusAtom,
  useSendTxStatusAtom,
} from '@onekeyhq/kit/src/states/jotai/contexts/signatureConfirm';
import type { ITransferPayload } from '@onekeyhq/kit-bg/src/vaults/types';
import { getNetworkIdsMap } from '@onekeyhq/shared/src/config/networkIds';
import {
  EAppEventBusNames,
  appEventBus,
} from '@onekeyhq/shared/src/eventBus/appEventBus';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import { ESendFeeStatus } from '@onekeyhq/shared/types/fee';

interface IProps {
  accountId: string;
  networkId: string;
  transferPayload?: ITransferPayload;
}

function TxConfirmAlert(props: IProps) {
  const { networkId, accountId, transferPayload } = props;

  const intl = useIntl();
  const [{ decodedTxs }] = useDecodedTxsAtom();
  const [sendFeeStatus] = useSendFeeStatusAtom();
  const [sendTxStatus] = useSendTxStatusAtom();
  const [preCheckTxStatus] = usePreCheckTxStatusAtom();
  const { network } = useAccountData({
    networkId,
  });

  const renderDecodedTxsAlert = useCallback(() => {
    const alerts = flatMap(
      map(decodedTxs, (tx) => tx.txDisplay?.alerts),
    ).filter(Boolean);

    return alerts.map((alert) => (
      <Alert
        key={alert}
        description={alert}
        type="warning"
        icon="InfoSquareOutline"
      />
    ));
  }, [decodedTxs]);

  const renderTxFeeAlert = useCallback(() => {
    if (!sendFeeStatus.errMessage) {
      return null;
    }
    return (
      <Alert
        icon="ErrorOutline"
        type="critical"
        title={sendFeeStatus.errMessage}
        action={{
          primary: intl.formatMessage({
            id: ETranslations.global_retry,
          }),
          isPrimaryLoading: sendFeeStatus.status === ESendFeeStatus.Loading,
          onPrimaryPress() {
            appEventBus.emit(EAppEventBusNames.EstimateTxFeeRetry, undefined);
          },
        }}
      />
    );
  }, [intl, sendFeeStatus.errMessage, sendFeeStatus.status]);

  const renderInsufficientNativeBalanceAlert = useCallback(() => {
    if (!sendTxStatus.isInsufficientNativeBalance) {
      return null;
    }
    return (
      <Alert
        icon="ErrorOutline"
        type="critical"
        title={`${intl.formatMessage(
          {
            id: ETranslations.msg__str_is_required_for_network_fees_top_up_str_to_make_tx,
          },
          {
            symbol: network?.symbol ?? '',
            amount: sendTxStatus.fillUpNativeBalance ?? '0',
          },
        )}${
          sendTxStatus.isBaseOnEstimateMaxFee
            ? `(${intl.formatMessage(
                {
                  id: ETranslations.insufficient_fee_append_desc,
                },
                {
                  amount: sendTxStatus.maxFeeNative ?? '0',
                  symbol: network?.symbol ?? '',
                },
              )})`
            : ''
        }`}
      />
    );
  }, [
    intl,
    network?.symbol,
    sendTxStatus.fillUpNativeBalance,
    sendTxStatus.isBaseOnEstimateMaxFee,
    sendTxStatus.isInsufficientNativeBalance,
    sendTxStatus.maxFeeNative,
  ]);

  const renderPreCheckTxAlert = useCallback(() => {
    if (preCheckTxStatus.errorMessage) {
      return (
        <Alert
          icon="ErrorOutline"
          type="critical"
          title={preCheckTxStatus.errorMessage}
        />
      );
    }
    return null;
  }, [preCheckTxStatus]);

  const renderChainSpecialAlert = useCallback(() => {
    if (
      networkId === getNetworkIdsMap().kaspa &&
      accountUtils.isHwAccount({ accountId }) &&
      transferPayload?.tokenInfo &&
      !transferPayload.tokenInfo.isNative
    ) {
      return (
        <Alert
          type="warning"
          title={intl.formatMessage({
            id: ETranslations.sending_krc20_warning_text,
          })}
        />
      );
    }
    return null;
  }, [accountId, intl, networkId, transferPayload?.tokenInfo]);

  return (
    <>
      {renderTxFeeAlert()}
      {renderInsufficientNativeBalanceAlert()}
      {renderDecodedTxsAlert()}
      {renderPreCheckTxAlert()}
      {renderChainSpecialAlert()}
    </>
  );
}

export default memo(TxConfirmAlert);
