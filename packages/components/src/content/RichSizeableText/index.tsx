import { useCallback } from 'react';

import { FormattedMessage } from 'react-intl';

import type { ETranslations } from '@onekeyhq/shared/src/locale';
import { openUrlExternal } from '@onekeyhq/shared/src/utils/openUrlUtils';

import { SizableText } from '../../primitives';

import type { ISizableTextProps } from '../../primitives';

export type IRichSizeableTextProps = Omit<ISizableTextProps, 'children'> & {
  children?: string | ETranslations;
  linkList?: { [key: string]: ILinkItemType };
  i18NValues?: Record<string, string | ((value: any) => React.JSX.Element)>;
};

type ILinkItemType = ISizableTextProps & {
  url: string | undefined;
};

/**
 * @deprecated This component is deprecated. Please use HyperlinkText instead.
 * @see HyperlinkText in @onekeyhq/kit/src/components/HyperlinkText
 */
export function RichSizeableText({
  children,
  linkList,
  i18NValues,
  ...rest
}: IRichSizeableTextProps) {
  const onLinkDidPress = useCallback((link: ILinkItemType) => {
    if (link.url) {
      openUrlExternal(link?.url ?? '');
    }
  }, []);
  return (
    <SizableText size="$bodyLg" color="$textSubdued" {...rest}>
      {linkList || i18NValues ? (
        <FormattedMessage
          id={children as ETranslations}
          defaultMessage={children}
          values={
            {
              ...(linkList
                ? Object.keys(linkList).reduce((values, key) => {
                    // eslint-disable-next-line react/no-unstable-nested-components
                    values[key] = (text) => {
                      const link = linkList[key];
                      return (
                        <SizableText
                          color="$textInfo"
                          cursor="pointer"
                          onPress={() => onLinkDidPress(link)}
                          {...link}
                        >
                          {text}
                        </SizableText>
                      );
                    };
                    return values;
                  }, {} as Record<string, string | ((value: any) => React.JSX.Element)>)
                : {}),
              ...i18NValues,
            } as Record<string, React.ReactNode>
          }
        />
      ) : (
        children
      )}
    </SizableText>
  );
}
