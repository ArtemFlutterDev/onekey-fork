import type { FC } from 'react';
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';

import { useWebViewBridge } from '@onekeyfe/onekey-cross-webview';

import { Progress, Spinner, Stack } from '@onekeyhq/components';
import platformEnv from '@onekeyhq/shared/src/platformEnv';

import { ESiteMode } from '../../views/Discovery/types';

// refresh hash: 889263555577754
// @ts-expect-error
import injectedNativeCode from './injectedNative.text-js';
import { NativeWebView } from './NativeWebView';

import type { IInpageProviderWebViewProps } from './types';
import type { IWebViewWrapperRef } from '@onekeyfe/onekey-cross-webview';
import type { WebViewProps } from 'react-native-webview';

const desktopUserAgent = platformEnv.isNativeIOS
  ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
  : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const injectedJavaScript = `
  const updateMedate = () => {
    setTimeout(() => {
      const meta = document.createElement('meta');
      meta.setAttribute('content', 'width=device-width, initial-scale=0.5, maximum-scale=2, user-scalable=2'); 
      meta.setAttribute('name', 'viewport');
      document.getElementsByTagName('head')[0].appendChild(meta);
    }, 1500);
  };
  document.addEventListener("DOMContentLoaded", () => {
    updateMedate();
  });
  updateMedate();
`;

const InpageProviderWebView: FC<IInpageProviderWebViewProps> = forwardRef(
  (
    {
      src = '',
      onSrcChange,
      receiveHandler,
      onNavigationStateChange,
      onShouldStartLoadWithRequest,
      nativeWebviewSource,
      nativeInjectedJavaScriptBeforeContentLoaded,
      isSpinnerLoading,
      onContentLoaded,
      onOpenWindow,
      onLoad,
      onLoadStart,
      onLoadEnd,
      onScroll,
      androidLayerType,
      displayProgressBar,
      onProgress,
      webviewDebuggingEnabled,
      siteMode,
    }: IInpageProviderWebViewProps,
    ref: any,
  ) => {
    const [progress, setProgress] = useState(5);
    const { webviewRef, setWebViewRef } = useWebViewBridge();

    useImperativeHandle(
      ref,
      (): IWebViewWrapperRef | null => webviewRef.current,
    );

    const nativeWebviewProps = useMemo(() => {
      const props = {} as WebViewProps;
      if (nativeWebviewSource) {
        props.source = nativeWebviewSource;
      }
      if (onOpenWindow) {
        props.onOpenWindow = onOpenWindow;
      }
      // setting layer type to software may fix some crashes on android
      // https://github.com/react-native-webview/react-native-webview/issues/1915#issuecomment-880989194
      props.androidLayerType = androidLayerType;
      props.onShouldStartLoadWithRequest = onShouldStartLoadWithRequest;
      return props;
    }, [
      androidLayerType,
      nativeWebviewSource,
      onOpenWindow,
      onShouldStartLoadWithRequest,
    ]);
    const nativeInjectedJsCode = useMemo(() => {
      let code: string = injectedNativeCode || '';
      if (nativeInjectedJavaScriptBeforeContentLoaded) {
        code += `
        ;(function() {
            ;
            ${nativeInjectedJavaScriptBeforeContentLoaded ?? ''}
            ;
        })();
        `;
      }
      return code;
    }, [nativeInjectedJavaScriptBeforeContentLoaded]);

    const progressLoading = useMemo(() => {
      if (!displayProgressBar) {
        return null;
      }
      if (progress < 100) {
        if (isSpinnerLoading) {
          // should be absolute position, otherwise android will crashed!
          return (
            <Stack
              position="absolute"
              left={0}
              top={0}
              right={0}
              w="100%"
              h="100%"
              flex={1}
              alignItems="center"
              justifyContent="center"
            >
              <Spinner size="large" />
            </Stack>
          );
        }
        return (
          <Progress
            value={progress}
            width="100%"
            position="absolute"
            left={0}
            top={0}
            right={0}
            zIndex={10}
            borderRadius={0}
          />
        );
      }
      return null;
    }, [isSpinnerLoading, progress, displayProgressBar]);
    const isDesktopMode = useMemo(
      () =>
        // Enable desktop mode by default on iPad
        platformEnv.isNativeIOSPad ? true : siteMode === ESiteMode.desktop,
      [siteMode],
    );
    return (
      <Stack flex={1}>
        {progressLoading}
        <NativeWebView
          scalesPageToFit={!isDesktopMode}
          webviewDebuggingEnabled={webviewDebuggingEnabled}
          ref={setWebViewRef}
          src={src}
          onSrcChange={onSrcChange}
          receiveHandler={receiveHandler}
          injectedJavaScriptBeforeContentLoaded={nativeInjectedJsCode}
          injectedJavaScript={
            platformEnv.isNative && !platformEnv.isNativeIOSPad && isDesktopMode
              ? injectedJavaScript
              : undefined
          }
          onLoadProgress={({ nativeEvent }) => {
            const p = Math.ceil(nativeEvent.progress * 100);
            onProgress?.(p);
            setProgress(p);
            if (p >= 100) {
              onContentLoaded?.();
            }
          }}
          onNavigationStateChange={onNavigationStateChange}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          textInteractionEnabled={undefined}
          minimumFontSize={undefined}
          onLoad={onLoad}
          onLoadStart={onLoadStart}
          onLoadEnd={onLoadEnd}
          onScroll={onScroll}
          // allowFileAccessFromFileURLs
          // allowFileAccess
          // allowUniversalAccessFromFileURLs
          // *** Note that static HTML will require setting originWhitelist to ["*"].
          originWhitelist={['*']}
          userAgent={isDesktopMode ? desktopUserAgent : undefined}
          // https://github.com/react-native-webview/react-native-webview/issues/1779
          onMessage={(event) => {}}
          {...nativeWebviewProps}
        />
      </Stack>
    );
  },
);
InpageProviderWebView.displayName = 'InpageProviderWebView';

export default InpageProviderWebView;
