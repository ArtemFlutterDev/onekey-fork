import type { ForwardedRef } from 'react';
import {
  cloneElement,
  createRef,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { setStringAsync } from 'expo-clipboard';
import { isNil } from 'lodash';
import { useIntl } from 'react-intl';
import {
  AnimatePresence,
  Sheet,
  SizableText,
  Dialog as TMDialog,
  useMedia,
} from 'tamagui';

import { dismissKeyboard } from '@onekeyhq/shared/src/keyboard';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import platformEnv from '@onekeyhq/shared/src/platformEnv';

import { Toast } from '../../actions/Toast';
import { SheetGrabber } from '../../content';
import { Form } from '../../forms/Form';
import { Portal } from '../../hocs';
import { useBackHandler, useOverlayZIndex } from '../../hooks';
import { ScrollView } from '../../layouts/ScrollView';
import { Spinner, Stack } from '../../primitives';

import { Content } from './Content';
import { DialogContext } from './context';
import { DialogForm } from './DialogForm';
import { Footer, FooterAction } from './Footer';
import {
  DialogDescription,
  DialogHeader,
  DialogHeaderContext,
  DialogHyperlinkTextDescription,
  DialogIcon,
  DialogRichDescription,
  DialogTitle,
  SetDialogHeader,
} from './Header';
import { renderToContainer } from './renderToContainer';

import type {
  IDialogCancelProps,
  IDialogConfirmProps,
  IDialogContainerProps,
  IDialogHeaderProps,
  IDialogInstance,
  IDialogProps,
  IDialogShowProps,
} from './type';
import type { IPortalManager } from '../../hocs';
import type { IStackProps } from '../../primitives';
import type { IColorTokens } from '../../types';
import type { GestureResponderEvent } from 'react-native';

export * from './hooks';
export type {
  IDialogCancelProps,
  IDialogConfirmProps,
  IDialogInstance,
  IDialogShowProps,
} from './type';

export const FIX_SHEET_PROPS: IStackProps = {
  display: 'block',
};

function DialogFrame({
  open,
  onClose,
  modal,
  renderContent,
  showFooter = true,
  footerProps,
  onConfirm,
  onConfirmText,
  onCancel,
  onOpen,
  onCancelText,
  tone,
  confirmButtonProps,
  cancelButtonProps,
  estimatedContentHeight,
  dismissOnOverlayPress = true,
  sheetProps,
  sheetOverlayProps,
  floatingPanelProps,
  disableDrag = false,
  showConfirmButton = true,
  showCancelButton = true,
  testID,
  isAsync,
}: IDialogProps) {
  const intl = useIntl();
  const { footerRef } = useContext(DialogContext);
  const [position, setPosition] = useState(0);
  const onBackdropPress = useMemo(
    () => (dismissOnOverlayPress ? onClose : undefined),
    [dismissOnOverlayPress, onClose],
  );
  const handleBackdropPress = useCallback(() => {
    void onBackdropPress?.();
  }, [onBackdropPress]);
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        void onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    onOpen?.();
  }, [onOpen]);

  const handleBackPress = useCallback(() => {
    if (!open) {
      return false;
    }
    handleOpenChange(false);
    return true;
  }, [handleOpenChange, open]);

  useBackHandler(handleBackPress);

  const handleEscapeKeyDown = useCallback((event: GestureResponderEvent) => {
    event.preventDefault();
  }, []);

  const handleCancelButtonPress = useCallback(async () => {
    const cancel = onCancel || footerRef.props?.onCancel;
    cancel?.(() => onClose());
    if (!onCancel?.length) {
      await onClose();
    }
  }, [footerRef.props?.onCancel, onCancel, onClose]);

  const media = useMedia();

  const zIndex = useOverlayZIndex(open);
  const renderDialogContent = (
    <Stack>
      <DialogHeader onClose={onClose} />
      {/* extra children */}
      <Content
        testID={testID}
        isAsync={isAsync}
        estimatedContentHeight={estimatedContentHeight}
      >
        {renderContent}
      </Content>
      <Footer
        tone={tone}
        showFooter={showFooter}
        footerProps={footerProps}
        showCancelButton={showCancelButton}
        showConfirmButton={showConfirmButton}
        cancelButtonProps={cancelButtonProps}
        onConfirm={onConfirm}
        onCancel={handleCancelButtonPress}
        onConfirmText={
          onConfirmText ||
          intl.formatMessage({
            id: ETranslations.global_confirm,
          })
        }
        confirmButtonProps={confirmButtonProps}
        onCancelText={
          onCancelText ||
          intl.formatMessage({
            id: ETranslations.global_cancel,
          })
        }
      />
    </Stack>
  );

  if (media.md) {
    return (
      <Sheet
        disableDrag={disableDrag}
        open={open}
        position={position}
        onPositionChange={setPosition}
        dismissOnSnapToBottom
        // the native dismissOnOverlayPress used on native side,
        //  so it needs to assign a value to onOpenChange.
        dismissOnOverlayPress={dismissOnOverlayPress}
        onOpenChange={handleOpenChange}
        snapPointsMode="fit"
        animation="quick"
        zIndex={zIndex}
        {...sheetProps}
      >
        <Sheet.Overlay
          {...FIX_SHEET_PROPS}
          animation="quick"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
          backgroundColor="$bgBackdrop"
          zIndex={sheetProps?.zIndex || zIndex}
          {...sheetOverlayProps}
        />
        <Sheet.Frame
          unstyled
          testID={testID}
          borderTopLeftRadius="$6"
          borderTopRightRadius="$6"
          bg="$bg"
          borderCurve="continuous"
          disableHideBottomOverflow
        >
          {!disableDrag ? <SheetGrabber /> : null}
          {renderDialogContent}
        </Sheet.Frame>
      </Sheet>
    );
  }

  return (
    <TMDialog
      open={open}
      modal={modal}
      // the native dismissOnOverlayPress used on native side,
      //  so it needs to assign a value to onOpenChange.
      onOpenChange={platformEnv.isNative ? handleOpenChange : undefined}
    >
      <AnimatePresence>
        {open ? (
          <Stack
            position={
              platformEnv.isNative ? 'absolute' : ('fixed' as unknown as any)
            }
            top={0}
            left={0}
            right={0}
            bottom={0}
            alignItems="center"
            justifyContent="center"
            zIndex={floatingPanelProps?.zIndex || zIndex}
          >
            <TMDialog.Overlay
              key="overlay"
              backgroundColor="$bgBackdrop"
              animateOnly={['opacity']}
              animation="quick"
              enterStyle={{
                opacity: 0,
              }}
              exitStyle={{
                opacity: 0,
              }}
              onPress={handleBackdropPress}
              zIndex={floatingPanelProps?.zIndex || zIndex}
            />
            {/* /* fix missing title warnings in html dialog element on Web */}
            <TMDialog.Title display="none" />
            <TMDialog.Content
              elevate
              onEscapeKeyDown={handleEscapeKeyDown as any}
              key="content"
              testID={testID}
              animateOnly={['transform', 'opacity']}
              animation={[
                'quick',
                {
                  opacity: {
                    overshootClamping: true,
                  },
                },
              ]}
              enterStyle={{ opacity: 0, scale: 0.85 }}
              exitStyle={{ opacity: 0, scale: 0.85 }}
              borderRadius="$4"
              borderWidth="$0"
              outlineColor="$borderSubdued"
              outlineStyle="solid"
              outlineWidth="$px"
              bg="$bg"
              width={400}
              p="$0"
              {...floatingPanelProps}
            >
              {renderDialogContent}
            </TMDialog.Content>
          </Stack>
        ) : null}
      </AnimatePresence>
    </TMDialog>
  );
}

function BaseDialogContainer(
  {
    onOpen,
    onClose,
    renderContent,
    title,
    tone,
    description,
    icon,
    renderIcon,
    showExitButton,
    open,
    isExist,
    onOpenChange,
    ...props
  }: IDialogContainerProps,
  ref: ForwardedRef<IDialogInstance>,
) {
  const [isOpenState, changeIsOpenState] = useState(true);
  const isControlled = !isNil(open);
  const isOpen = isControlled ? open : isOpenState;
  const changeIsOpen = useCallback(
    (value: boolean) => {
      if (isControlled) {
        onOpenChange?.(value);
      }
      changeIsOpenState(value);
    },
    [isControlled, onOpenChange],
  );
  const formRef = useRef();
  const handleClose = useCallback(
    (extra?: { flag?: string }) => {
      changeIsOpen(false);
      return onClose(extra);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [changeIsOpen, onClose],
  );

  const handleIsExist = useCallback(
    () => (isExist ? isExist() : false),
    [isExist],
  );

  const contextValue = useMemo(
    () => ({
      dialogInstance: {
        close: handleClose,
        ref: formRef,
        isExist: handleIsExist,
      },
      footerRef: {
        notifyUpdate: undefined,
        props: undefined,
      },
    }),
    [handleClose, handleIsExist],
  );

  const handleOpen = useCallback(() => {
    changeIsOpen(true);
    onOpen?.();
  }, [changeIsOpen, onOpen]);

  const handleImperativeClose = useCallback(
    (extra?: { flag?: string }) => handleClose(extra),
    [handleClose],
  );

  useImperativeHandle(
    ref,
    () => ({
      close: handleImperativeClose,
      getForm: () => formRef.current,
      isExist: handleIsExist,
    }),
    [handleImperativeClose, handleIsExist],
  );
  const [headerProps, setHeaderProps] = useState<IDialogHeaderProps>({
    title,
    tone,
    description,
    icon,
    renderIcon,
    showExitButton,
  });

  // If the header properties change, update the headerContext content.
  useLayoutEffect(() => {
    setHeaderProps((prev) => ({
      ...prev,
      title,
      tone,
      description,
      icon,
      renderIcon,
      showExitButton,
    }));
  }, [description, icon, renderIcon, showExitButton, title, tone]);
  const headerContextValue = useMemo(
    () => ({ headerProps, setHeaderProps }),
    [headerProps],
  );
  return (
    <DialogContext.Provider value={contextValue}>
      <DialogHeaderContext.Provider value={headerContextValue}>
        <DialogFrame
          contextValue={contextValue}
          open={isOpen}
          onOpen={handleOpen}
          renderContent={renderContent}
          onClose={handleClose}
          {...props}
        />
      </DialogHeaderContext.Provider>
    </DialogContext.Provider>
  );
}

export const DialogContainer = forwardRef<
  IDialogInstance,
  IDialogContainerProps
>(BaseDialogContainer);

function dialogShow({
  onClose,
  dialogContainer,
  portalContainer,
  ...props
}: IDialogShowProps & {
  dialogContainer?: (o: {
    ref: React.RefObject<IDialogInstance> | undefined;
  }) => JSX.Element;
}): IDialogInstance {
  dismissKeyboard();
  let instanceRef: React.RefObject<IDialogInstance> | undefined =
    createRef<IDialogInstance>();

  let portalRef:
    | {
        current: IPortalManager;
      }
    | undefined;

  const buildForwardOnClose =
    (options: {
      onClose?: (extra?: { flag?: string }) => void | Promise<void>;
    }) =>
    (extra?: { flag?: string }) =>
      new Promise<void>((resolve) => {
        // Remove the React node after the animation has finished.
        setTimeout(() => {
          if (instanceRef) {
            instanceRef = undefined;
          }
          if (portalRef) {
            portalRef.current.destroy();
            portalRef = undefined;
          }
          void options.onClose?.(extra);
          resolve();
        }, 300);
      });
  const isExist = () => !!instanceRef?.current;
  const element = (() => {
    if (dialogContainer) {
      const e = dialogContainer({ ref: instanceRef });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      // const newOnClose = buildForwardOnClose({ onClose: e.props.onClose });
      const newOnClose = buildForwardOnClose({ onClose });
      const newProps = {
        ...props,
        ...e.props,
        onClose: newOnClose,
      };
      return cloneElement(e, newProps);
    }
    return (
      <DialogContainer
        ref={instanceRef}
        {...props}
        onClose={buildForwardOnClose({ onClose })}
        isExist={isExist}
      />
    );
  })();

  portalRef = {
    current: portalContainer
      ? renderToContainer(portalContainer, element)
      : Portal.Render(Portal.Constant.FULL_WINDOW_OVERLAY_PORTAL, element),
  };
  const close = async (extra?: { flag?: string }, times = 0) => {
    if (times > 10) {
      return;
    }
    if (!instanceRef?.current) {
      setTimeout(() => {
        void close(extra, times + 1);
      }, 10);
      return Promise.resolve();
    }
    return instanceRef?.current?.close(extra);
  };
  return {
    close,
    getForm: () => instanceRef?.current?.getForm(),
    isExist,
  };
}

const dialogConfirm = (props: IDialogConfirmProps) =>
  dialogShow({
    ...props,
    showFooter: true,
    showConfirmButton: true,
    showCancelButton: false,
  });

const dialogCancel = (props: IDialogCancelProps) =>
  dialogShow({
    ...props,
    showFooter: true,
    showConfirmButton: false,
    showCancelButton: true,
  });

const dialogDebugMessage = (
  props: IDialogShowProps & { debugMessage: any },
) => {
  const dataContent = JSON.stringify(props.debugMessage, null, 4);
  console.log('dialogDebugMessage:', dataContent);
  const copyContent = async () => {
    await setStringAsync(dataContent);
    Toast.success({
      title: 'Copied',
    });
  };
  return dialogShow({
    title: 'DebugMessage',
    showFooter: true,
    showConfirmButton: true,
    showCancelButton: true,
    onConfirmText: 'Copy',
    onConfirm: async ({ preventClose }) => {
      preventClose();
      await copyContent();
    },
    renderContent: (
      <ScrollView maxHeight="$48" nestedScrollEnabled>
        <SizableText size="$bodySm" onPress={copyContent}>
          {dataContent}
        </SizableText>
      </ScrollView>
    ),
    ...props,
  });
};

export function DialogLoadingView({
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

export type IDialogLoadingProps = {
  title: string;
  showExitButton?: boolean;
};
function dialogLoading(props: IDialogLoadingProps) {
  return dialogShow({
    showExitButton: false,
    ...props,
    dismissOnOverlayPress: false,
    // disableSwipeGesture: true,
    disableDrag: true,
    showFooter: false,
    showConfirmButton: false,
    showCancelButton: false,
    renderContent: <DialogLoadingView />,
  });
}

export const Dialog = {
  Header: SetDialogHeader,
  Title: DialogTitle,
  Description: DialogDescription,
  RichDescription: DialogRichDescription,
  HyperlinkTextDescription: DialogHyperlinkTextDescription,
  Icon: DialogIcon,
  Footer: FooterAction,
  Form: DialogForm,
  FormField: Form.Field,
  Loading: DialogLoadingView,
  show: dialogShow,
  confirm: dialogConfirm,
  cancel: dialogCancel,
  loading: dialogLoading,
  debugMessage: dialogDebugMessage,
};
