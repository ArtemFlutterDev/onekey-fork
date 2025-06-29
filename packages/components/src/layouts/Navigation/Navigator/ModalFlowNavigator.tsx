import { memo, useCallback, useEffect } from 'react';

import { useIntl } from 'react-intl';

import type { ETranslations } from '@onekeyhq/shared/src/locale';

import { EPageType, PageTypeHOC } from '../../../hocs';
import { useThemeValue } from '../../../hooks';
import { makeModalStackNavigatorOptions } from '../GlobalScreenOptions';
import createModalNavigator from '../Modal/createModalNavigator';
import { createStackNavigator } from '../StackNavigator';

import { hasStackNavigatorModal } from './CommonConfig';

import type { ICommonNavigatorConfig, IScreenOptionsInfo } from './types';
import type { IModalNavigationOptions } from '../ScreenProps';
import type { ParamListBase } from '@react-navigation/routers';

export interface IModalFlowNavigatorConfig<
  RouteName extends string,
  P extends ParamListBase,
> extends ICommonNavigatorConfig<RouteName, P> {
  translationId?: ETranslations | string;
  allowDisableClose?: boolean;
  disableClose?: boolean;
  shouldPopOnClickBackdrop?: boolean;
  dismissOnOverlayPress?: boolean;
}

interface IModalFlowNavigatorProps<
  RouteName extends string,
  P extends ParamListBase,
> {
  config: IModalFlowNavigatorConfig<RouteName, P>[];
  name?: string;
  onMounted?: () => void;
  onUnmounted?: () => void;
}

const ModalStack = hasStackNavigatorModal
  ? createStackNavigator()
  : createModalNavigator();

function ModalFlowNavigator<RouteName extends string, P extends ParamListBase>({
  config,
  onMounted,
  onUnmounted,
}: IModalFlowNavigatorProps<RouteName, P>) {
  const [bgColor, titleColor] = useThemeValue(['bgApp', 'text']);
  const intl = useIntl();

  const makeScreenOptions = useCallback(
    (optionsInfo: IScreenOptionsInfo<any>) => ({
      ...makeModalStackNavigatorOptions({
        optionsInfo,
        bgColor,
        titleColor,
      }),
    }),
    [bgColor, titleColor],
  );

  useEffect(() => {
    onMounted?.();
    return () => {
      onUnmounted?.();
    };
  }, [onMounted, onUnmounted]);

  return (
    <ModalStack.Navigator screenOptions={makeScreenOptions}>
      {config.map(
        ({
          name,
          component,
          options,
          translationId,
          allowDisableClose,
          disableClose,
          shouldPopOnClickBackdrop,
          dismissOnOverlayPress,
        }) => {
          const customOptions: IModalNavigationOptions = {
            ...options,
            allowDisableClose,
            disableClose,
            shouldPopOnClickBackdrop,
            dismissOnOverlayPress,
            title: translationId
              ? intl.formatMessage({
                  id: translationId as ETranslations,
                })
              : '',
          };
          const key = `Modal-Flow-${name as string}`;
          return (
            <ModalStack.Screen
              key={key}
              name={name}
              component={PageTypeHOC(key, EPageType.modal, component)}
              // @ts-expect-error
              options={customOptions}
            />
          );
        },
      )}
    </ModalStack.Navigator>
  );
}

export default memo(ModalFlowNavigator);
