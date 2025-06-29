import type { IModalFlowNavigatorConfig } from '@onekeyhq/components';
import type { IModalFirmwareUpdateParamList } from '@onekeyhq/shared/src/routes';
import { EModalFirmwareUpdateRoutes } from '@onekeyhq/shared/src/routes';

import { LazyLoadPage } from '../../../components/LazyLoadPage';

const PageFirmwareUpdateChangeLog = LazyLoadPage(
  () =>
    import(
      '@onekeyhq/kit/src/views/FirmwareUpdate/pages/PageFirmwareUpdateChangeLog'
    ),
);

const PageFirmwareUpdateInstall = LazyLoadPage(
  () =>
    import(
      '@onekeyhq/kit/src/views/FirmwareUpdate/pages/PageFirmwareUpdateInstall'
    ),
);

const PageFirmwareUpdateInstallV2 = LazyLoadPage(
  () =>
    import(
      '@onekeyhq/kit/src/views/FirmwareUpdate/pages/PageFirmwareUpdateInstallV2'
    ),
);
export const ModalFirmwareUpdateStack: IModalFlowNavigatorConfig<
  EModalFirmwareUpdateRoutes,
  IModalFirmwareUpdateParamList
>[] = [
  {
    name: EModalFirmwareUpdateRoutes.ChangeLog,
    component: PageFirmwareUpdateChangeLog,
  },
  {
    name: EModalFirmwareUpdateRoutes.Install,
    component: PageFirmwareUpdateInstall,
  },
  {
    name: EModalFirmwareUpdateRoutes.InstallV2,
    component: PageFirmwareUpdateInstallV2,
  },
];
