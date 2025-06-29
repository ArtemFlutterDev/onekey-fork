import { useMemo, useRef } from 'react';

import { withStaticProperties } from 'tamagui';

import { PageBody } from './PageBody';
import { PageClose } from './PageClose';
import { PageContainer } from './PageContainer';
import { PageContext } from './PageContext';
import { Every, PageEvery } from './PageEvery';
import { PageFooter } from './PageFooter';
import {
  FooterActions,
  FooterCancelButton,
  FooterConfirmButton,
} from './PageFooterActions';
import { PageHeader } from './PageHeader';
import { PageLifeCycle } from './PageLifeCycle';

import type { IPageFooterRef } from './PageContext';
import type { IPageProps } from './type';

export type { IPageProps, IPageFooterProps, IPageLifeCycle } from './type';

function PageProvider({
  children,
  skipLoading = false,
  scrollEnabled = false,
  scrollProps = { showsVerticalScrollIndicator: false },
  safeAreaEnabled = true,
  fullPage,
  onMounted,
  onUnmounted,
  onClose,
  onCancel,
  onConfirm,
}: IPageProps) {
  const footerRef = useRef<IPageFooterRef>({});
  const closeExtraRef = useRef<{ flag?: string }>({});
  const value = useMemo(
    () => ({
      scrollEnabled,
      scrollProps,
      safeAreaEnabled,
      footerRef,
      closeExtraRef,
    }),
    [safeAreaEnabled, scrollEnabled, scrollProps],
  );

  const isEnablePageLifeCycle = onMounted || onUnmounted || onClose || onCancel;

  return (
    <>
      <PageContext.Provider value={value}>
        <PageContainer skipLoading={skipLoading} fullPage={fullPage}>
          {children}
        </PageContainer>
      </PageContext.Provider>
      {isEnablePageLifeCycle ? (
        <PageLifeCycle
          onMounted={onMounted}
          onUnmounted={onUnmounted}
          onCancel={onCancel}
          onClose={onClose}
          onConfirm={onConfirm}
          closeExtraRef={closeExtraRef}
        />
      ) : null}
      <PageEvery />
    </>
  );
}

export const Page = withStaticProperties(PageProvider, {
  Header: PageHeader,
  Body: PageBody,
  Footer: PageFooter,
  FooterActions,
  CancelButton: FooterCancelButton,
  ConfirmButton: FooterConfirmButton,
  Close: PageClose,
  Every,
});

export * from './hooks';
