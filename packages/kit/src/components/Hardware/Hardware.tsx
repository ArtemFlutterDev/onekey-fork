import { useCallback, useEffect, useMemo, useState } from 'react';

import { EDeviceType } from '@onekeyfe/hd-shared';
import { useIntl } from 'react-intl';
import { StyleSheet } from 'react-native';

import type { IColorTokens, UseFormReturn } from '@onekeyhq/components';
import {
  Alert,
  Button,
  Dialog,
  ESwitchSize,
  Form,
  IconButton,
  Input,
  LottieView,
  SizableText,
  Spinner,
  Stack,
  Switch,
  Toast,
  XStack,
  useForm,
  useMedia,
} from '@onekeyhq/components';
import { useSettingsPersistAtom } from '@onekeyhq/kit-bg/src/states/jotai/atoms';
import { ETranslations } from '@onekeyhq/shared/src/locale';

import backgroundApiProxy from '../../background/instance/backgroundApiProxy';
import { SHOW_CLOSE_ACTION_MIN_DURATION } from '../../provider/Container/HardwareUiStateContainer/constants';
import { isPassphraseValid } from '../../utils/passphraseUtils';

import type { IDeviceType } from '@onekeyfe/hd-core';

export interface IConfirmOnDeviceToastContentProps {
  deviceType: IDeviceType;
}

export function ConfirmOnDeviceToastContent({
  deviceType,
}: IConfirmOnDeviceToastContentProps) {
  const intl = useIntl();
  const [animationData, setAnimationData] = useState<any>(null);
  const [showErrorButton, setShowErrorButton] = useState(false);

  const requireResource = useCallback(() => {
    switch (deviceType) {
      // Prevents the device type from being obtained
      case null:
      case undefined:
        return Promise.resolve(null);
      // Specify unsupported devices
      case EDeviceType.Unknown:
        return Promise.resolve(null);
      case EDeviceType.Classic:
      case EDeviceType.Classic1s:
      case EDeviceType.ClassicPure:
        return import(
          '@onekeyhq/kit/assets/animations/confirm-on-classic.json'
        );
      case EDeviceType.Mini:
        return import('@onekeyhq/kit/assets/animations/confirm-on-mini.json');
      case EDeviceType.Touch:
        return import('@onekeyhq/kit/assets/animations/confirm-on-touch.json');
      case EDeviceType.Pro:
        return import(
          '@onekeyhq/kit/assets/animations/confirm-on-pro-dark.json'
        );
      default:
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-case-declarations
        const checkType = deviceType;
    }
  }, [deviceType]);

  useEffect(() => {
    requireResource()
      ?.then((module) => {
        setAnimationData(module?.default);
      })
      ?.catch(() => {
        // ignore
      });
  }, [requireResource]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowErrorButton(true);
    }, SHOW_CLOSE_ACTION_MIN_DURATION);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  return (
    <XStack alignItems="center">
      <Stack bg="$bgStrong" btlr="$2" bblr="$2">
        <LottieView width={72} height={72} source={animationData ?? ''} />
      </Stack>
      <XStack flex={1} alignItems="center" px="$3" gap="$5">
        <SizableText flex={1} size="$bodyLgMedium">
          {intl.formatMessage({ id: ETranslations.global_confirm_on_device })}
        </SizableText>
        <Stack minWidth="$8">
          {showErrorButton ? (
            <Toast.Close>
              <IconButton size="small" icon="CrossedSmallOutline" />
            </Toast.Close>
          ) : null}
        </Stack>
      </XStack>
    </XStack>
  );
}

export function CommonDeviceLoading({
  children,
  bg,
}: {
  children?: any;
  bg?: IColorTokens;
}) {
  return (
    <Stack
      borderRadius="$3"
      p="$5"
      bg={bg ?? '$bgSubdued'}
      borderCurve="continuous"
    >
      <Spinner size="large" />
      {children}
    </Stack>
  );
}

export function EnterPinOnDevice({
  deviceType,
}: {
  deviceType: IDeviceType | undefined;
}) {
  const requireResource = useCallback(() => {
    switch (deviceType) {
      // Prevents the device type from being obtained
      case null:
      case undefined:
        return Promise.resolve(null);
      // Specify unsupported devices
      case EDeviceType.Unknown:
        return Promise.resolve(null);
      case EDeviceType.Classic:
      case EDeviceType.Classic1s:
      case EDeviceType.ClassicPure:
        return import(
          '@onekeyhq/kit/assets/animations/enter-pin-on-classic.json'
        );
      case EDeviceType.Mini:
        return import('@onekeyhq/kit/assets/animations/enter-pin-on-mini.json');
      case EDeviceType.Touch:
        return import(
          '@onekeyhq/kit/assets/animations/enter-pin-on-touch.json'
        );
      case EDeviceType.Pro:
        return import(
          '@onekeyhq/kit/assets/animations/enter-pin-on-pro-dark.json'
        );
      default:
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-case-declarations
        const checkType = deviceType;
    }
  }, [deviceType]);

  const [animationData, setAnimationData] = useState<any>(null);

  useEffect(() => {
    requireResource()
      ?.then((module) => {
        setAnimationData(module?.default);
      })
      ?.catch(() => {
        // ignore
      });
  }, [requireResource]);

  return (
    // height must be specified on Sheet View.
    <Stack borderRadius="$3" bg="$bgSubdued" height={230}>
      {animationData ? (
        <LottieView width="100%" height="100%" source={animationData} />
      ) : null}
    </Stack>
  );
}

export function EnterPin({
  onConfirm,
  switchOnDevice,
}: {
  onConfirm: (value: string) => void;
  switchOnDevice: () => void;
}) {
  const [val, setVal] = useState('');
  const intl = useIntl();
  const varMask = useMemo(
    () =>
      val
        .split('')
        .map((v) => (v ? '•' : ''))
        .join(''),
    [val],
  );
  const keyboardMap = useMemo(
    () => ['7', '8', '9', /**/ '4', '5', '6', /**/ '1', '2', '3'],
    [],
  );
  return (
    <Stack>
      <Dialog.Header>
        <Dialog.Title>
          {intl.formatMessage({
            id: ETranslations.enter_pin_title,
          })}
        </Dialog.Title>
        <Dialog.Description>
          {intl.formatMessage({
            id: ETranslations.enter_pin_desc,
          })}
        </Dialog.Description>
      </Dialog.Header>
      <Stack
        borderWidth={StyleSheet.hairlineWidth}
        borderColor="$borderSubdued"
        borderRadius="$2"
        overflow="hidden"
        borderCurve="continuous"
      >
        <XStack
          h="$12"
          alignItems="center"
          px="$3"
          borderBottomWidth={StyleSheet.hairlineWidth}
          borderColor="$borderSubdued"
          bg="$bgSubdued"
        >
          <SizableText
            userSelect="none"
            pl="$6"
            textAlign="center"
            flex={1}
            size="$heading4xl"
          >
            {varMask}
          </SizableText>
          <IconButton
            variant="tertiary"
            icon="XBackspaceOutline"
            onPress={() => {
              setVal((v) => v.slice(0, -1));
            }}
          />
        </XStack>
        <XStack flexWrap="wrap">
          {keyboardMap.map((num, index) => (
            <Stack
              key={index}
              flexBasis="33.3333%"
              h="$14"
              borderRightWidth={StyleSheet.hairlineWidth}
              borderBottomWidth={StyleSheet.hairlineWidth}
              borderColor="$borderSubdued"
              justifyContent="center"
              alignItems="center"
              {...((index === 2 || index === 5 || index === 8) && {
                borderRightWidth: 0,
              })}
              {...((index === 6 || index === 7 || index === 8) && {
                borderBottomWidth: 0,
              })}
              hoverStyle={{
                bg: '$bgHover',
              }}
              pressStyle={{
                bg: '$bgActive',
              }}
              focusable
              focusVisibleStyle={{
                outlineColor: '$focusRing',
                outlineOffset: -2,
                outlineWidth: 2,
                outlineStyle: 'solid',
              }}
              onPress={() =>
                setVal((v) => {
                  // classic only supports 9 digits
                  // pro only on device input pin
                  if (v.length >= 9) {
                    return v;
                  }
                  return v + num;
                })
              }
            >
              <Stack w="$2.5" h="$2.5" borderRadius="$full" bg="$text" />
            </Stack>
          ))}
        </XStack>
      </Stack>
      {/* TODO: add loading state while waiting for result */}
      <Button
        mt="$5"
        $md={
          {
            size: 'large',
          } as any
        }
        variant="primary"
        onPress={() => {
          onConfirm(val);
        }}
      >
        {intl.formatMessage({ id: ETranslations.global_confirm })}
      </Button>
      <Button
        m="$0"
        mt="$2.5"
        $md={
          {
            size: 'large',
          } as any
        }
        variant="secondary"
        onPress={() => {
          switchOnDevice();
        }}
      >
        {intl.formatMessage({ id: ETranslations.global_enter_on_device })}
      </Button>
    </Stack>
  );
}

interface IEnterPhaseFormValues {
  passphrase: string;
  confirmPassphrase: string;
  hideImmediately: boolean;
}

export function EnterPhase({
  isSingleInput,
  onConfirm,
  switchOnDevice,
}: {
  isSingleInput?: boolean;
  onConfirm: (p: {
    passphrase: string;
    save: boolean;
    hideImmediately: boolean;
  }) => void;
  switchOnDevice: ({ hideImmediately }: { hideImmediately: boolean }) => void;
}) {
  const intl = useIntl();
  const [settings] = useSettingsPersistAtom();
  const formOption = useMemo(
    () => ({
      defaultValues: {
        passphrase: '',
        confirmPassphrase: '',
        hideImmediately:
          settings.hiddenWalletImmediately === undefined
            ? true
            : settings.hiddenWalletImmediately,
      },
      onSubmit: async (form: UseFormReturn<IEnterPhaseFormValues>) => {
        const values = form.getValues();
        if (
          !isSingleInput &&
          (values.passphrase || '') !== (values.confirmPassphrase || '')
        ) {
          Toast.error({
            title: intl.formatMessage({
              id: ETranslations.feedback_passphrase_not_matched,
            }),
          });
          return;
        }
        const passphrase = values.passphrase || '';
        onConfirm({
          passphrase,
          save: true,
          hideImmediately: values.hideImmediately,
        });
      },
    }),
    [intl, isSingleInput, onConfirm, settings.hiddenWalletImmediately],
  );
  const form = useForm<IEnterPhaseFormValues>(formOption);

  const handleSwitchOnDevice = useCallback(() => {
    switchOnDevice({ hideImmediately: form.getValues().hideImmediately });
  }, [form, switchOnDevice]);
  const media = useMedia();
  const [secureEntry1, setSecureEntry1] = useState(true);
  const [secureEntry2, setSecureEntry2] = useState(true);

  return (
    <Stack>
      <Stack pb="$5">
        <Alert
          title={intl.formatMessage({
            id: ETranslations.global_enter_passphrase_alert,
          })}
          type="warning"
        />
      </Stack>
      <Form form={form}>
        <Form.Field
          name="passphrase"
          label={intl.formatMessage({ id: ETranslations.global_passphrase })}
          rules={{
            maxLength: {
              value: 50,
              message: intl.formatMessage(
                {
                  id: ETranslations.hardware_passphrase_enter_too_long,
                },
                {
                  0: 50,
                },
              ),
            },
            validate: (text) => {
              const valid = isPassphraseValid(text);
              if (valid) {
                return undefined;
              }
              return intl.formatMessage({
                id: ETranslations.hardware_unsupported_passphrase_characters,
              });
            },
            onChange: () => {
              form.clearErrors();
            },
          }}
        >
          <Input
            secureTextEntry={secureEntry1}
            placeholder={intl.formatMessage({
              id: ETranslations.global_enter_passphrase,
            })}
            addOns={[
              {
                iconName: secureEntry1 ? 'EyeOutline' : 'EyeOffOutline',
                onPress: () => {
                  setSecureEntry1(!secureEntry1);
                },
              },
            ]}
            {...(media.md && {
              size: 'large',
            })}
          />
        </Form.Field>
        {!isSingleInput ? (
          <Form.Field
            name="confirmPassphrase"
            label={intl.formatMessage({
              id: ETranslations.form_confirm_passphrase,
            })}
          >
            <Input
              secureTextEntry={secureEntry2}
              placeholder={intl.formatMessage({
                id: ETranslations.form_confirm_passphrase_placeholder,
              })}
              addOns={[
                {
                  iconName: secureEntry2 ? 'EyeOutline' : 'EyeOffOutline',
                  onPress: () => {
                    setSecureEntry2(!secureEntry2);
                  },
                },
              ]}
              {...(media.md && {
                size: 'large',
              })}
            />
          </Form.Field>
        ) : null}
        {!isSingleInput ? (
          <Form.Field
            horizontal
            name="hideImmediately"
            label={intl.formatMessage({
              id: ETranslations.form_keep_hidden_wallet_label,
            })}
            description={intl.formatMessage({
              id: ETranslations.form_keep_hidden_wallet_label_desc,
            })}
          >
            <Switch size={ESwitchSize.small} />
          </Form.Field>
        ) : null}
      </Form>
      {/* TODO: add loading state while waiting for result */}
      <Button
        mt="$5"
        $md={
          {
            size: 'large',
          } as any
        }
        variant="primary"
        onPress={form.submit}
      >
        {intl.formatMessage({ id: ETranslations.global_confirm })}
      </Button>
      <Button
        m="$0"
        mt="$2.5"
        $md={
          {
            size: 'large',
          } as any
        }
        variant="secondary"
        onPress={handleSwitchOnDevice}
      >
        {intl.formatMessage({ id: ETranslations.global_enter_on_device })}
      </Button>
    </Stack>
  );
}

export function EnterPassphraseOnDevice({
  deviceType,
}: {
  deviceType: IDeviceType | undefined;
}) {
  const requireResource = useCallback(() => {
    switch (deviceType) {
      // Prevents the device type from being obtained
      case null:
      case undefined:
        return Promise.resolve(null);
      // Specify unsupported devices
      case EDeviceType.Unknown:
        return Promise.resolve(null);
      case EDeviceType.Classic:
      case EDeviceType.Classic1s:
      case EDeviceType.ClassicPure:
        return import(
          '@onekeyhq/kit/assets/animations/enter-passphrase-on-classic.json'
        );
      case EDeviceType.Mini:
        return import(
          '@onekeyhq/kit/assets/animations/enter-passphrase-on-mini.json'
        );
      case EDeviceType.Touch:
        return import(
          '@onekeyhq/kit/assets/animations/enter-passphrase-on-touch.json'
        );
      case EDeviceType.Pro:
        return import(
          '@onekeyhq/kit/assets/animations/enter-passphrase-on-pro-dark.json'
        );
      default:
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-case-declarations
        const checkType = deviceType;
    }
  }, [deviceType]);

  const [animationData, setAnimationData] = useState<any>(null);

  useEffect(() => {
    requireResource()
      ?.then((module) => {
        setAnimationData(module?.default);
      })
      ?.catch(() => {
        // ignore
      });
  }, [requireResource]);

  return (
    <Stack borderRadius="$3" bg="$bgSubdued" height={230}>
      {animationData ? (
        <LottieView width="100%" height="100%" source={animationData} />
      ) : null}
    </Stack>
  );
}

export function ConfirmPassphrase({
  onConfirm,
  switchOnDevice,
}: {
  onConfirm: () => void;
  switchOnDevice: () => void;
}) {
  const intl = useIntl();

  return (
    <Stack>
      <Input
        size="large"
        $gtMd={{
          size: 'medium',
        }}
        placeholder={intl.formatMessage({
          id: ETranslations.global_enter_passphrase,
        })}
      />
      {/* TODO: add loading state while waiting for result */}
      <Button
        mt="$5"
        $md={
          {
            size: 'large',
          } as any
        }
        variant="primary"
        onPress={onConfirm}
      >
        {intl.formatMessage({ id: ETranslations.global_confirm })}
      </Button>
      <Button
        m="$0"
        mt="$2"
        $md={
          {
            size: 'large',
          } as any
        }
        variant="tertiary"
        onPress={switchOnDevice}
      >
        {intl.formatMessage({ id: ETranslations.global_enter_on_device })}
      </Button>
    </Stack>
  );
}
