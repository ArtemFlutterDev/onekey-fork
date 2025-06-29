import { useEffect } from 'react';

import { useTabIsRefreshingFocused } from '@onekeyhq/components';
import type { ITabPageProps } from '@onekeyhq/components';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';

import { usePromiseResult } from '../../../hooks/usePromiseResult';
import { DefiListView } from '../components/DefiListView';

function DefiListContainer(_props: ITabPageProps) {
  const { isFocused, isHeaderRefreshing, setIsHeaderRefreshing } =
    useTabIsRefreshingFocused();

  const { result, run } = usePromiseResult(
    async () => {
      const r = await backgroundApiProxy.serviceDefi.fetchAccountDefi({
        networkId: 'evm--1',
        accountAddress: '0x76f3f64cb3cD19debEE51436dF630a342B736C24',
      });
      setIsHeaderRefreshing(false);
      return r.data;
    },
    [setIsHeaderRefreshing],
    { overrideIsFocused: (isPageFocused) => isPageFocused && isFocused },
  );
  useEffect(() => {
    if (isHeaderRefreshing) {
      void run();
    }
  }, [isHeaderRefreshing, run]);
  return <DefiListView data={result ?? []} />;
}

export { DefiListContainer };
