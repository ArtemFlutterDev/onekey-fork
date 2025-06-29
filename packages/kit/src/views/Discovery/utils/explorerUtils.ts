import type { IElement } from '@onekeyhq/components';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import uriUtils from '@onekeyhq/shared/src/utils/uriUtils';

import type { IBrowserType } from '../types';
import type { IElectronWebView } from '@onekeyfe/cross-inpage-provider-types';
import type { IWebViewWrapperRef } from '@onekeyfe/onekey-cross-webview';
import type { WebView } from 'react-native-webview';

export const browserTypeHandler: IBrowserType = (() => {
  if (platformEnv.isDesktop || platformEnv.isNative) {
    return 'MultiTabBrowser';
  }
  return 'StandardBrowser';
})();

export const webviewRefs: Record<string, IWebViewWrapperRef> = {};
export const captureViewRefs: Record<string, IElement> = {};

if (process.env.NODE_ENV !== 'production') {
  // @ts-ignore
  globalThis.$$webviewRefs = webviewRefs;
}

export function getWebviewWrapperRef(id?: string) {
  const ref = id ? webviewRefs[id] : null;
  return ref ?? null;
}

export function formatHiddenHttpsUrl(url?: string) {
  return {
    isHttpsUrl: url && /^https/i.test(url),
    hiddenHttpsUrl: url?.replace?.(/^https:\/\//i, ''),
  };
}

export function crossWebviewLoadUrl({
  url,
  tabId,
}: {
  url: string;
  tabId?: string;
}) {
  const wrapperRef = getWebviewWrapperRef(tabId);
  // debugLogger.webview.info('crossWebviewLoadUrl >>>>', url);
  console.log('crossWebviewLoadUrl >>>>', url);
  if (platformEnv.isDesktop) {
    setTimeout(() => {
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (wrapperRef?.innerRef as IElectronWebView)?.loadURL(url).catch();
    });
  } else if (platformEnv.isRuntimeBrowser) {
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (wrapperRef?.innerRef as IElectronWebView)?.loadURL(url);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (wrapperRef?.innerRef as WebView)?.loadUrl(url);
  }
}

// for hide keyboard
const injectToDismissWebviewKeyboard = `
(function(){
  document.activeElement && document.activeElement.blur()
})()
`;

export function dismissWebviewKeyboard(id?: string) {
  const ref = getWebviewWrapperRef(id);
  if (ref) {
    if (platformEnv.isNative) {
      try {
        (ref.innerRef as WebView)?.injectJavaScript(
          injectToDismissWebviewKeyboard,
        );
      } catch (error) {
        // ipad mini orientation changed cause injectJavaScript ERROR, which crash app
        console.error(
          'blurActiveElement webview.injectJavaScript() ERROR >>>>> ',
          error,
        );
      }
    }
    if (platformEnv.isDesktop) {
      const deskTopRef = ref.innerRef as IElectronWebView;
      if (deskTopRef) {
        try {
          deskTopRef.executeJavaScript(injectToDismissWebviewKeyboard);
        } catch (e) {
          // if not dom ready, no need to pause websocket
        }
      }
    }
  }
}

// https://github.com/facebook/hermes/issues/114#issuecomment-887106990
export const injectToPauseWebsocket = `
(function(){
  if (window.WebSocket) {
    if (!window.$$onekeyWebSocketSend) {
      window.$$onekeyWebSocketSend = window.WebSocket.prototype.send;
    }
    window.WebSocket.prototype.send = () => {};
  }
})()
`;

export const injectToResumeWebsocket = `
(function(){
  if (
    window.WebSocket &&
    window.$$onekeyWebSocketSend
  ) {
    window.WebSocket.prototype.send = window.$$onekeyWebSocketSend;
  }
})()
`;

export function processWebSiteUrl(url?: string): string | undefined {
  if (!url) return url;

  try {
    const urlObj = new URL(uriUtils.validateUrl(url));

    // add fp=onekey to searchParams when visit babylon
    if (urlObj.hostname === 'btcstaking.babylonlabs.io') {
      urlObj.searchParams.set('fp', 'onekey');
      return urlObj.toString();
    }

    return url;
  } catch (error) {
    // ignore url parse error
    return url;
  }
}
