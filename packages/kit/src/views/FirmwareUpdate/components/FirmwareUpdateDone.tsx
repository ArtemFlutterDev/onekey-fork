import { useIntl } from 'react-intl';

import { Stack } from '@onekeyhq/components';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import type { ICheckAllFirmwareReleaseResult } from '@onekeyhq/shared/types/device';

import { useFirmwareUpdateActions } from '../hooks/useFirmwareUpdateActions';

import { FirmwareChangeLogContentView } from './FirmwareChangeLogView';
import { FirmwareUpdateBaseMessageView } from './FirmwareUpdateBaseMessageView';
import { FirmwareUpdatePageFooter } from './FirmwareUpdatePageLayout';

export function FirmwareUpdateDone({
  result,
}: {
  result: ICheckAllFirmwareReleaseResult | undefined;
}) {
  const intl = useIntl();
  const actions = useFirmwareUpdateActions();
  return (
    <Stack>
      <FirmwareUpdateBaseMessageView
        icon="CheckRadioSolid"
        tone="success"
        title={intl.formatMessage({
          id: ETranslations.update_all_updates_complete,
        })}
      />
      <FirmwareChangeLogContentView result={result} />
      <FirmwareUpdatePageFooter
        onConfirmText={intl.formatMessage({ id: ETranslations.global_got_it })}
        onConfirm={() => {
          actions.closeUpdateModal();
        }}
      />
    </Stack>
  );
}
