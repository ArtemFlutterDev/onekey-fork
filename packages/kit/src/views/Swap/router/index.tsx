import type { IModalFlowNavigatorConfig } from '@onekeyhq/components';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { EModalSwapRoutes } from '@onekeyhq/shared/src/routes/swap';
import type { IModalSwapParamList } from '@onekeyhq/shared/src/routes/swap';

import { LazyLoadPage } from '../../../components/LazyLoadPage';
import LimitOrderDetailModal from '../pages/modal/LimitOrderDetailModal';

const SwapHistoryDetailModal = LazyLoadPage(
  () => import('../pages/modal/SwapHistoryDetailModal'),
);
const SwapHistoryListModal = LazyLoadPage(
  () => import('../pages/modal/SwapHistoryListModal'),
);
const SwapProviderSelectModal = LazyLoadPage(
  () => import('../pages/modal/SwapProviderSelectModal'),
);
const SwapToAnotherAddressModal = LazyLoadPage(
  () => import('../pages/modal/SwapToAnotherAddressModal'),
);
const SwapTokenSelectModal = LazyLoadPage(
  () => import('../pages/modal/SwapTokenSelectModal'),
);
const TokenRiskReminderModal = LazyLoadPage(
  () => import('../pages/modal/TokenRiskReminderModal'),
);
const SwapMainLandModal = LazyLoadPage(
  () => import('../pages/modal/SwapMainLandModal'),
);
const SwapLazyMarketModal = LazyLoadPage(
  () => import('../pages/modal/SwapLazyMarketModal'),
);

export const ModalSwapStack: IModalFlowNavigatorConfig<
  EModalSwapRoutes,
  IModalSwapParamList
>[] = [
  {
    name: EModalSwapRoutes.SwapTokenSelect,
    component: SwapTokenSelectModal,
    translationId: ETranslations.token_selector_title,
  },
  {
    name: EModalSwapRoutes.SwapMainLand,
    component: SwapMainLandModal,
    translationId: ETranslations.swap_page_swap,
  },
  {
    name: EModalSwapRoutes.SwapProviderSelect,
    component: SwapProviderSelectModal,
    translationId: ETranslations.provider_title,
  },
  {
    name: EModalSwapRoutes.SwapHistoryList,
    component: SwapHistoryListModal,
    translationId: ETranslations.swap_history_title,
  },
  {
    name: EModalSwapRoutes.SwapHistoryDetail,
    component: SwapHistoryDetailModal,
    translationId: ETranslations.swap_history_detail_title,
  },
  {
    name: EModalSwapRoutes.LimitOrderDetail,
    component: LimitOrderDetailModal,
    translationId: ETranslations.swap_history_detail_title,
  },
  {
    name: EModalSwapRoutes.SwapToAnotherAddress,
    component: SwapToAnotherAddressModal,
    translationId: ETranslations.swap_page_account_to_address_title,
  },
  {
    name: EModalSwapRoutes.TokenRiskReminder,
    component: TokenRiskReminderModal,
    translationId: ETranslations.token_selector_risk_reminder_title,
  },
  {
    name: EModalSwapRoutes.SwapLazyMarketModal,
    component: SwapLazyMarketModal,
    translationId: ETranslations.swap_page_swap,
  },
];
