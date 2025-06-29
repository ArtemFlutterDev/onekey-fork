import { cloneElement, useCallback, useContext, useState } from 'react';

import { useIntl } from 'react-intl';
import { StyleSheet } from 'react-native';
import { createStyledContext, styled, useThemeName } from 'tamagui';

import { ETranslations } from '@onekeyhq/shared/src/locale';

import {
  Button,
  Icon,
  SizableText,
  Stack,
  XStack,
  YStack,
} from '../../primitives';
import { IconButton } from '../IconButton';

import type { IKeyOfIcons } from '../../primitives';
import type { ColorTokens } from 'tamagui';

export type IAlertType =
  | 'info'
  | 'warning'
  | 'critical'
  | 'success'
  | 'default'
  | 'danger';

type IAlertActionProps = {
  primary: string;
  onPrimaryPress?: () => void;
  secondary?: string;
  onSecondaryPress?: () => void;
  isPrimaryLoading?: boolean;
  isSecondaryLoading?: boolean;
};

const AlertContext = createStyledContext<{
  type: IAlertType;
  fullBleed?: boolean;
}>({
  type: 'default',
  fullBleed: false,
});

export type IAlertProps = {
  type?: IAlertType;
  fullBleed?: boolean;
  title?: string;
  description?: string;
  descriptionComponent?: React.ReactNode;
  closable?: boolean;
  onClose?: () => void;
  icon?: IKeyOfIcons;
  action?: IAlertActionProps;
};

const AlertFrame = styled(XStack, {
  name: 'Alert',
  context: AlertContext,
  paddingHorizontal: '$4',
  paddingVertical: '$3.5',
  alignItems: 'center',
  gap: '$2',
  backgroundColor: '$bgSubdued',
  borderColor: '$borderSubdued',
  borderRadius: '$3',
  borderWidth: StyleSheet.hairlineWidth,
  borderCurve: 'continuous',
  variants: {
    type: {
      info: {
        backgroundColor: '$bgInfoSubdued',
        borderColor: '$borderInfoSubdued',
      },
      warning: {
        backgroundColor: '$bgCautionSubdued',
        borderColor: '$borderCautionSubdued',
      },
      critical: {
        backgroundColor: '$bgCriticalSubdued',
        borderColor: '$borderCriticalSubdued',
      },
      danger: {
        backgroundColor: '$bgCritical',
        borderColor: '$borderCritical',
      },
      success: {
        backgroundColor: '$bgSuccessSubdued',
        borderColor: '$borderSuccessSubdued',
      },
      default: {
        backgroundColor: '$bgSubdued',
        borderColor: '$borderSubdued',
      },
    },
    fullBleed: {
      true: {
        paddingHorizontal: '$5',
        borderLeftWidth: 0,
        borderRightWidth: 0,
        borderRadius: 0,
      },
    },
  },
});

const AlertIcon = (props: { children: any }) => {
  const { type } = useContext(AlertContext);
  const colorMapping: Record<IAlertType, ColorTokens> = {
    default: '$iconSubdued',
    info: '$iconInfo',
    warning: '$iconCaution',
    critical: '$iconCritical',
    danger: '$iconCritical',
    success: '$iconSuccess',
  };
  return cloneElement(props.children, {
    color: colorMapping[type],
  });
};

export const Alert = AlertFrame.styleable<IAlertProps>((props, ref) => {
  const {
    icon,
    title,
    description,
    descriptionComponent,
    closable,
    type,
    fullBleed,
    action,
    onClose: onCloseProp,
    children,
    ...rest
  } = props;

  const [show, setShow] = useState(true);
  const onClose = useCallback(() => {
    setShow(false);
    onCloseProp?.();
  }, [onCloseProp]);

  const intl = useIntl();
  const isDanger = type === 'danger';
  const themeName = useThemeName() as 'light' | 'dark';
  const dangerTextColor =
    themeName === 'light' ? '$textOnBrightColor' : '$textOnColor';

  if (!show) return null;

  return (
    <AlertFrame ref={ref} type={type} fullBleed={fullBleed} {...rest}>
      {icon ? (
        <Stack>
          <AlertIcon>
            <Icon name={icon} size="$5" />
          </AlertIcon>
        </Stack>
      ) : null}
      <YStack flex={1} gap="$1">
        {title ? (
          <SizableText
            size="$bodyMdMedium"
            color={isDanger ? dangerTextColor : undefined}
          >
            {title}
          </SizableText>
        ) : null}
        {description ? (
          <SizableText
            size="$bodyMd"
            color={isDanger ? dangerTextColor : '$textSubdued'}
          >
            {description}
          </SizableText>
        ) : null}
        {descriptionComponent || null}

        {children || null}
      </YStack>
      {action ? (
        <XStack gap="$4" alignItems="center">
          <Button
            size="small"
            onPress={action.onPrimaryPress}
            loading={action.isPrimaryLoading}
          >
            {action.primary}
          </Button>
          {action.secondary ? (
            <Button
              size="small"
              variant="tertiary"
              onPress={action.onSecondaryPress}
              loading={action.isSecondaryLoading}
            >
              {action.secondary}
            </Button>
          ) : null}
        </XStack>
      ) : null}
      {closable ? (
        <IconButton
          title={intl.formatMessage({ id: ETranslations.explore_dismiss })}
          icon="CrossedSmallSolid"
          size="small"
          variant="tertiary"
          onPress={onClose}
        />
      ) : null}
    </AlertFrame>
  );
});
