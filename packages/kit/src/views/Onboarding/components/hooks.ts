import { useCallback, useMemo, useRef, useState } from 'react';

import wordLists from 'bip39/src/wordlists/english.json';
import { shuffle } from 'lodash';
import { InteractionManager } from 'react-native';

import type { useForm } from '@onekeyhq/components';
import { Haptics, useClipboard, useKeyboardEvent } from '@onekeyhq/components';
import { dismissKeyboard } from '@onekeyhq/shared/src/keyboard';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import timerUtils from '@onekeyhq/shared/src/utils/timerUtils';

const isValidWord = (word: string) => wordLists.includes(word);

export const PHRASE_LENGTHS = [12, 15, 18, 21, 24];
export const useSearchWords = () => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const ref = useRef(new Map<string, string[]>());
  const suggestionsRef = useRef<string[]>([]);

  const updateSuggestions = useCallback((suggestionWords: string[]) => {
    suggestionsRef.current = suggestionWords;
    setSuggestions(suggestionWords);
  }, []);

  const fetchSuggestions = useCallback(
    (value: string) => {
      if (!value) {
        return [];
      }
      const cachedSuggestions = ref.current.get(value);
      if (cachedSuggestions) {
        updateSuggestions(cachedSuggestions);
      } else {
        const suggestionWords = wordLists.filter((text: string) =>
          text.startsWith(value),
        );
        ref.current.set(value, shuffle(suggestionWords));
        updateSuggestions(suggestionWords);
      }
      return suggestionsRef.current;
    },
    [updateSuggestions],
  );
  return {
    fetchSuggestions,
    suggestionsRef,
    suggestions,
    updateSuggestions,
  };
};

export const useSuggestion = (
  form: ReturnType<typeof useForm>,
  phraseLength = 12,
  {
    setPhraseLength,
  }: {
    setPhraseLength: (length: string) => void;
  },
) => {
  const { fetchSuggestions, suggestions, updateSuggestions, suggestionsRef } =
    useSearchWords();

  const [isShowErrors, setIsShowErrors] = useState<Record<string, boolean>>({});

  const [selectInputIndex, setSelectInputIndex] = useState(-1);

  // only work on web
  const openStatusRef = useRef(false);

  const updateByPressLock = useRef(false);

  const checkAllWords = useCallback(() => {
    const values = form.getValues() as Record<string, string>;
    const errors: Record<string, boolean> = {};
    for (let i = 0; i < phraseLength; i += 1) {
      const key = `phrase${i + 1}`;
      const value = values[key];
      if (value && !isValidWord(value)) {
        errors[i] = true;
      }
    }
    setIsShowErrors(errors);
  }, [form, phraseLength]);

  const checkIsValidWord = useCallback(
    (index: number, text?: string, isBlur = false) => {
      setTimeout(() => {
        if (!text) {
          setIsShowErrors((prev) => ({ ...prev, [index]: false }));
          return;
        }

        if (platformEnv.isNative && isBlur) {
          if (isValidWord(text)) {
            setIsShowErrors((prev) => ({ ...prev, [index]: false }));
          } else if (text) {
            setIsShowErrors((prev) => ({ ...prev, [index]: true }));
          }
          return;
        }

        if (
          isBlur &&
          (!openStatusRef.current ||
            (suggestionsRef.current && suggestionsRef.current?.length === 0))
        ) {
          if (isValidWord(text)) {
            setIsShowErrors((prev) => ({ ...prev, [index]: false }));
          } else if (text) {
            setIsShowErrors((prev) => ({ ...prev, [index]: true }));
          }
          return;
        }

        if (
          selectInputIndex === index &&
          suggestionsRef.current &&
          suggestionsRef.current?.length > 0
        ) {
          setIsShowErrors((prev) => ({ ...prev, [index]: false }));
          return;
        }
        setIsShowErrors((prev) => ({ ...prev, [index]: false }));
      }, 0);
    },
    [selectInputIndex, suggestionsRef],
  );

  const resetSuggestions = useCallback(() => {
    openStatusRef.current = false;
    updateSuggestions([]);
  }, [updateSuggestions]);

  const focusNextInput = useCallback(async () => {
    await InteractionManager.runAfterInteractions();
    const key = `phrase${selectInputIndex + 2}`;
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        if (platformEnv.isNative && selectInputIndex === phraseLength - 1) {
          dismissKeyboard();
        } else {
          setTimeout(() => {
            form.setFocus(key);
          }, 100);
        }
        resolve();
      }, 300);
    });
  }, [form, phraseLength, selectInputIndex]);

  const updateInputValue = useCallback(
    (word: string) => {
      const key = `phrase${selectInputIndex + 1}`;
      form.setValue(key, word);
    },
    [form, selectInputIndex],
  );

  const onInputChange = useCallback(
    (value: string) => {
      // on ios, when the value is changed, onInputChange will called twice.
      //  so lock the update when the value is changed by press suggestion item.
      if (updateByPressLock.current) {
        return value;
      }
      if (!value) {
        resetSuggestions();
      }
      const text = value.toLowerCase().trim();
      const words = fetchSuggestions(text);
      openStatusRef.current = words.length > 0;
      checkIsValidWord(selectInputIndex, text);
      return text;
    },
    [checkIsValidWord, fetchSuggestions, resetSuggestions, selectInputIndex],
  );

  const getFormValueByIndex = useCallback(
    (index: number) => {
      const key = `phrase${index + 1}`;
      const values = form.getValues() as Record<string, string>;
      const value = values[key];
      return value;
    },
    [form],
  );

  const updateInputValueWithLock = useCallback(
    async (word: string) => {
      updateByPressLock.current = true;
      updateInputValue(word);
      resetSuggestions();
      // the value of invalid word is undefined
      if (word && word.length > 0) {
        await focusNextInput();
        setTimeout(
          () => {
            updateByPressLock.current = false;
          },
          platformEnv.isNative ? 300 : 0,
        );
      } else {
        updateByPressLock.current = false;
      }
    },
    [focusNextInput, resetSuggestions, updateInputValue],
  );

  useKeyboardEvent({
    keyboardWillHide: () => {
      setTimeout(() => {
        updateSuggestions([]);
      });
    },
  });

  const onInputFocus = useCallback(
    (index: number) => {
      setSelectInputIndex(index);
      resetSuggestions();
    },
    [resetSuggestions],
  );

  const onInputBlur = useCallback(
    async (index: number) => {
      if (platformEnv.isNative) {
        checkIsValidWord(selectInputIndex, getFormValueByIndex(index), true);
        return;
      }

      // check popover status
      if (openStatusRef.current && index === selectInputIndex) {
        return;
      }
      if (index === selectInputIndex) {
        setSelectInputIndex(-1);
      }
      openStatusRef.current = false;
      checkIsValidWord(selectInputIndex, getFormValueByIndex(index), true);
    },
    [checkIsValidWord, getFormValueByIndex, selectInputIndex],
  );

  const { clearText } = useClipboard();

  const onPasteMnemonic = useCallback(
    (value: string, inputIndex: number) => {
      const arrays = value.trim().split(' ');
      if (arrays.length > 1) {
        Haptics.success();
        let currentPhraseLength = phraseLength;
        setTimeout(async () => {
          clearText();
          if (
            PHRASE_LENGTHS.includes(arrays.length) &&
            arrays.length > currentPhraseLength
          ) {
            currentPhraseLength = arrays.length;
            setPhraseLength(currentPhraseLength.toString());
            await timerUtils.wait(30);
          }
          const formValues = Object.values(form.getValues());
          const values: string[] = formValues.slice(0, inputIndex);
          const words = [...values, ...arrays].slice(0, currentPhraseLength);
          if (words.length < currentPhraseLength) {
            words.push(...formValues.slice(words.length, currentPhraseLength));
          }
          form.reset(
            words.reduce((prev, next, index) => {
              prev[`phrase${index + 1}`] = next;
              return prev;
            }, {} as Record<`phrase${number}`, string>),
          );
          resetSuggestions();
          await timerUtils.wait(10);
          checkAllWords();
        }, 30);
        return true;
      }
      return false;
    },
    [
      checkAllWords,
      clearText,
      form,
      phraseLength,
      resetSuggestions,
      setPhraseLength,
    ],
  );

  const closePopover = useCallback(() => {
    resetSuggestions();
    checkIsValidWord(
      selectInputIndex,
      getFormValueByIndex(selectInputIndex),
      true,
    );
  }, [
    checkIsValidWord,
    getFormValueByIndex,
    resetSuggestions,
    selectInputIndex,
  ]);

  return useMemo(
    () => ({
      isShowErrors,
      suggestions,
      onInputFocus,
      onInputBlur,
      onPasteMnemonic,
      suggestionsRef,
      updateInputValue: updateInputValueWithLock,
      openStatusRef,
      onInputChange,
      selectInputIndex,
      focusNextInput,
      closePopover,
    }),
    [
      isShowErrors,
      suggestions,
      onInputFocus,
      onInputBlur,
      onPasteMnemonic,
      suggestionsRef,
      updateInputValueWithLock,
      onInputChange,
      selectInputIndex,
      focusNextInput,
      closePopover,
    ],
  );
};
