import type { Dispatch, SetStateAction } from 'react';
import { useMemo } from 'react';

import WebView from '@onekeyhq/kit/src/components/WebView';
import { useBrowserTabActions } from '@onekeyhq/kit/src/states/jotai/contexts/discovery';

import { webviewRefs } from '../../utils/explorerUtils';

import type { IWebTab } from '../../types';
import type { WebViewProps } from 'react-native-webview';

type IWebContentProps = IWebTab &
  WebViewProps & {
    isCurrent: boolean;
    setBackEnabled?: Dispatch<SetStateAction<boolean>>;
    setForwardEnabled?: Dispatch<SetStateAction<boolean>>;
  };

function WebContent({ id, url }: IWebContentProps) {
  const { setWebTabData } = useBrowserTabActions().current;
  const webview = useMemo(
    () => (
      <WebView
        id={id}
        src={url}
        onWebViewRef={(ref) => {
          if (ref && ref.innerRef) {
            if (!webviewRefs[id]) {
              setWebTabData({
                id,
                refReady: true,
              });
            }
            webviewRefs[id] = ref;
          }
        }}
        allowpopups
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );

  return webview;
}

export default WebContent;
