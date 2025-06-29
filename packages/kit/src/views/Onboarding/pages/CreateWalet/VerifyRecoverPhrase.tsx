import { useCallback, useState } from 'react';

import { useIntl } from 'react-intl';

import type { IButtonProps, IPageScreenProps } from '@onekeyhq/components';
import {
  Button,
  Page,
  SizableText,
  Toast,
  XStack,
  YStack,
} from '@onekeyhq/components';
import { ensureSensitiveTextEncoded } from '@onekeyhq/core/src/secret';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import useAppNavigation from '@onekeyhq/kit/src/hooks/useAppNavigation';
import { usePromiseResult } from '@onekeyhq/kit/src/hooks/usePromiseResult';
import { useUserWalletProfile } from '@onekeyhq/kit/src/hooks/useUserWalletProfile';
import { useSettingsPersistAtom } from '@onekeyhq/kit-bg/src/states/jotai/atoms';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { defaultLogger } from '@onekeyhq/shared/src/logger/logger';
import type { IOnboardingParamList } from '@onekeyhq/shared/src/routes';
import { EOnboardingPages } from '@onekeyhq/shared/src/routes';

function WordButton({
  children,
  onPress,
  ...props
}: { children: string; onPress: (word: string) => void } & Omit<
  IButtonProps,
  'onPress' | 'children'
>) {
  const handlePress = useCallback(() => {
    onPress(children);
  }, [children, onPress]);
  return (
    <Button
      borderWidth={2}
      focusVisibleStyle={{
        bg: '$bgActive',
      }}
      onPress={handlePress}
      {...props}
    >
      {children}
    </Button>
  );
}

function WordSelector({
  words,
  selectedWord,
  onSelect,
}: {
  words: string[];
  selectedWord: string;
  onSelect: (word: string) => void;
}) {
  const onPress = useCallback(
    (word: string) => {
      onSelect(word);
    },
    [onSelect],
  );

  return (
    <XStack gap="$2.5">
      {words.map((word) => (
        <WordButton
          flex={1}
          width="100%"
          key={word}
          onPress={onPress}
          borderColor={selectedWord === word ? '$borderActive' : undefined}
          testID={`suggest-${word}`}
        >
          {word}
        </WordButton>
      ))}
    </XStack>
  );
}

export function VerifyRecoveryPhrase({
  route,
}: IPageScreenProps<
  IOnboardingParamList,
  EOnboardingPages.VerifyRecoverPhrase
>) {
  const intl = useIntl();
  const { servicePassword } = backgroundApiProxy;
  const { mnemonic, verifyRecoveryPhrases } = route.params || {};
  const [settings] = useSettingsPersistAtom();

  ensureSensitiveTextEncoded(mnemonic);
  const navigation = useAppNavigation();

  const { result: phrases } = usePromiseResult(async () => {
    const mnemonicRaw = await servicePassword.decodeSensitiveText({
      encodedText: mnemonic,
    });
    return mnemonicRaw.split(' ');
  }, [mnemonic, servicePassword]);

  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const { isSoftwareWalletOnlyUser } = useUserWalletProfile();
  const handleConfirm = useCallback(async () => {
    if (verifyRecoveryPhrases && phrases) {
      const isValid = selectedWords.every((word, index) => {
        const [wordIndex] = verifyRecoveryPhrases[index];
        return word === phrases[Number(wordIndex)];
      });

      if (isValid) {
        if (route.params?.isBackup) {
          if (route.params?.walletId) {
            await backgroundApiProxy.serviceAccount.updateWalletBackupStatus({
              walletId: route.params?.walletId,
              isBackedUp: true,
            });
          }
          Toast.success({
            title: intl.formatMessage({
              id: ETranslations.backup_recovery_phrase_backed_up,
            }),
          });
          navigation.popStack();
          return;
        }

        navigation.push(EOnboardingPages.FinalizeWalletSetup, {
          mnemonic,
          isWalletBackedUp: true,
        });
        defaultLogger.account.wallet.walletAdded({
          status: 'success',
          addMethod: 'CreateWallet',
          details: {
            isBiometricSet: settings.isBiologyAuthSwitchOn,
            isBackupSkipped: false,
          },
          isSoftwareWalletOnlyUser,
        });
      } else {
        Toast.error({
          title: intl.formatMessage({
            id: ETranslations.feedback_invalid_words_title,
          }),
          message: intl.formatMessage({
            id: ETranslations.feedback_invalid_words_title_message,
          }),
        });
      }
    }
  }, [
    verifyRecoveryPhrases,
    phrases,
    selectedWords,
    route.params?.isBackup,
    route.params?.walletId,
    navigation,
    mnemonic,
    settings.isBiologyAuthSwitchOn,
    isSoftwareWalletOnlyUser,
    intl,
  ]);

  return (
    <Page>
      <Page.Header
        title={intl.formatMessage({
          id: ETranslations.onboarding_verify_recovery_phrase_title,
        })}
      />
      <Page.Body p="$5">
        {phrases && verifyRecoveryPhrases ? (
          <YStack gap="$5">
            {verifyRecoveryPhrases.map(([wordIndex, phraseArray], index) => (
              <YStack key={String(wordIndex)} gap="$2.5">
                <SizableText testID="wordIndex">{`${intl.formatMessage({
                  id: ETranslations.word,
                })} #${Number(wordIndex) + 1}`}</SizableText>
                <WordSelector
                  words={phraseArray}
                  selectedWord={selectedWords[index]}
                  onSelect={(word) => {
                    setSelectedWords((prev) => {
                      prev[index] = word;
                      return [...prev];
                    });
                  }}
                />
              </YStack>
            ))}
          </YStack>
        ) : null}
      </Page.Body>
      <Page.Footer
        onConfirmText={intl.formatMessage({ id: ETranslations.global_confirm })}
        onConfirm={handleConfirm}
        confirmButtonProps={{ disabled: selectedWords.length < 3 }}
      />
    </Page>
  );
}

export default VerifyRecoveryPhrase;
