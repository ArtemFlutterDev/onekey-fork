/* eslint-disable react/no-unstable-nested-components */
import type { ReactElement } from 'react';
import { useMemo } from 'react';

import { useIntl } from 'react-intl';

import { type ISizableTextProps, SizableText } from '@onekeyhq/components';
import type { ETranslations } from '@onekeyhq/shared/src/locale';
import { openUrlExternal } from '@onekeyhq/shared/src/utils/openUrlUtils';
import { EQRCodeHandlerNames } from '@onekeyhq/shared/types/qrCode';

import useParseQRCode from '../../views/ScanQrCode/hooks/useParseQRCode';

export type IHyperlinkTextProps = {
  translationId?: ETranslations;
  defaultMessage?: string;
  onAction?: (url: string) => void;
  messages?: Record<string, string>;
  values?: Record<
    string,
    string | ReactElement | ((v: string) => ReactElement | string)
  >;
  autoHandleResult?: boolean;
  urlTextProps?: ISizableTextProps;
  actionTextProps?: ISizableTextProps;
  underlineTextProps?: ISizableTextProps;
  boldTextProps?: ISizableTextProps;
  textProps?: ISizableTextProps;
} & ISizableTextProps;

export function HyperlinkText({
  translationId,
  defaultMessage,
  onAction,
  children,
  values,
  autoHandleResult = true,
  urlTextProps,
  actionTextProps,
  underlineTextProps,
  boldTextProps,
  textProps,
  ...basicTextProps
}: IHyperlinkTextProps) {
  const intl = useIntl();
  const parseQRCode = useParseQRCode();
  const text = useMemo(
    () =>
      translationId
        ? intl.formatMessage(
            {
              id: translationId,
              defaultMessage,
            },
            {
              ...values,
              action: (params: React.ReactNode[]) => {
                const [actionId, chunks] = params;
                const isActionIdString = typeof actionId === 'string';
                return (
                  <SizableText
                    {...basicTextProps}
                    {...actionTextProps}
                    cursor="pointer"
                    hoverStyle={{ bg: '$bgHover' }}
                    pressStyle={{ bg: '$bgActive' }}
                    onPress={() => {
                      if (isActionIdString) {
                        onAction?.(actionId);
                      }
                    }}
                  >
                    {isActionIdString ? chunks : actionId}
                  </SizableText>
                );
              },
              url: (params: React.ReactNode[]) => {
                const [link, chunks] = params;
                const isLinkString = typeof link === 'string';
                return (
                  <SizableText
                    {...basicTextProps}
                    {...urlTextProps}
                    cursor="pointer"
                    hoverStyle={{ bg: '$bgHover' }}
                    pressStyle={{ bg: '$bgActive' }}
                    onPress={() => {
                      setTimeout(() => {
                        onAction?.(isLinkString ? link : '');
                      }, 0);
                      if (isLinkString) {
                        void parseQRCode.parse(link, {
                          handlers: [
                            EQRCodeHandlerNames.marketDetail,
                            EQRCodeHandlerNames.sendProtection,
                          ],
                          qrWalletScene: false,
                          autoHandleResult,
                          defaultHandler: openUrlExternal,
                        });
                      }
                    }}
                  >
                    {isLinkString ? chunks : link}
                  </SizableText>
                );
              },
              underline: ([string]) => (
                <SizableText
                  {...basicTextProps}
                  {...underlineTextProps}
                  textDecorationLine="underline"
                >
                  {string}
                </SizableText>
              ),
              bold: ([string]) => (
                <SizableText
                  {...basicTextProps}
                  {...boldTextProps}
                  size="$headingLg"
                >
                  {string}
                </SizableText>
              ),
              text: (chunks) => (
                <>
                  {chunks.map((chunk, index) =>
                    typeof chunk === 'string' ? (
                      <SizableText
                        {...basicTextProps}
                        {...textProps}
                        key={index}
                      >
                        {chunk}
                      </SizableText>
                    ) : (
                      chunk
                    ),
                  )}
                </>
              ),
            },
          )
        : (children as string),
    [
      translationId,
      intl,
      defaultMessage,
      values,
      children,
      basicTextProps,
      actionTextProps,
      onAction,
      urlTextProps,
      parseQRCode,
      autoHandleResult,
      underlineTextProps,
      boldTextProps,
      textProps,
    ],
  );
  return <SizableText {...basicTextProps}>{text}</SizableText>;
}
