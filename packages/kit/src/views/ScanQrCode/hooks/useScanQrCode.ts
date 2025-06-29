import { useCallback, useMemo } from 'react';

import { Haptics, ImpactFeedbackStyle } from '@onekeyhq/components';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import type {
  IAnimationValue,
  IBaseValue,
  IQRCodeHandlerParseOutsideOptions,
  IQRCodeHandlerParseResult,
} from '@onekeyhq/kit-bg/src/services/ServiceScanQRCode/utils/parseQRCode/type';
import { OneKeyErrorScanQrCodeCancel } from '@onekeyhq/shared/src/errors';
import {
  EModalRoutes,
  EScanQrCodeModalPages,
} from '@onekeyhq/shared/src/routes';
import {
  EQRCodeHandlerType,
  PARSE_HANDLER_NAMES,
} from '@onekeyhq/shared/types/qrCode';

import useAppNavigation from '../../../hooks/useAppNavigation';

import useParseQRCode from './useParseQRCode';

export default function useScanQrCode() {
  const navigation = useAppNavigation();
  const parseQRCode = useParseQRCode();
  const start = useCallback(
    ({
      autoHandleResult = false,
      handlers,
      account,
      network,
      tokens,
      qrWalletScene = false,
      showProTutorial = false,
    }: IQRCodeHandlerParseOutsideOptions) =>
      new Promise<IQRCodeHandlerParseResult<IBaseValue>>((resolve, reject) => {
        void backgroundApiProxy.serviceScanQRCode.resetAnimationData();

        navigation.pushModal(EModalRoutes.ScanQrCodeModal, {
          screen: EScanQrCodeModalPages.ScanQrCodeStack,
          params: {
            qrWalletScene,
            showProTutorial,
            callback: async ({ value, popNavigation }) => {
              if (value?.length > 0) {
                const parseValue = await parseQRCode.parse(value, {
                  autoHandleResult,
                  handlers,
                  account,
                  network,
                  tokens,
                });
                if (parseValue.type === EQRCodeHandlerType.ANIMATION_CODE) {
                  const animationValue = parseValue.data as IAnimationValue;
                  if (animationValue.fullData) {
                    parseValue.raw = animationValue.fullData;
                    resolve(parseValue);
                    popNavigation();
                  }
                  Haptics.impact(ImpactFeedbackStyle.Light);
                  return {
                    progress: animationValue.progress,
                  };
                }
                resolve(parseValue);
                if (
                  [
                    EQRCodeHandlerType.ANIMATION_CODE,
                    EQRCodeHandlerType.WALLET_CONNECT,
                  ].includes(parseValue.type)
                ) {
                  popNavigation();
                  if (parseValue.type === EQRCodeHandlerType.WALLET_CONNECT) {
                    // TODO: use global singleton loading
                    // Dialog.loading({
                    //   title: intl.formatMessage({
                    //     id: ETranslations.global_processing,
                    //   }),
                    //   showExitButton: true,
                    // });
                  }
                }

                if (
                  parseValue.type === EQRCodeHandlerType.UNKNOWN ||
                  parseValue.type === EQRCodeHandlerType.URL_ACCOUNT
                ) {
                  popNavigation();
                }

                return {};
              }
              reject(new OneKeyErrorScanQrCodeCancel());
              return {};
            },
          },
        });
      }),
    [navigation, parseQRCode],
  );
  return useMemo(() => ({ start, PARSE_HANDLER_NAMES }), [start]);
}
