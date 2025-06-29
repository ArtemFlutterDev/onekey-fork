import { useEffect, useRef, useState } from 'react';

import { updateInterceptorRequestHelper } from '@onekeyhq/kit-bg/src/init/updateInterceptorRequestHelper';

// TODO why not use lazy feature?
export function createLazyKitProviderLegacy({
  displayName,
}: {
  displayName: string;
}) {
  const LazyKitProvider = (props: any) => {
    const propsRef = useRef(props);
    const [cmp, setCmp] = useState<any>(null);
    useEffect(() => {
      setTimeout(() => {
        // KitProviderMock index
        void import('.').then((module) => {
          const { KitProvider } = module;
          setCmp(<KitProvider {...propsRef.current} />);
        });
      }, 0);
    }, []);
    if (cmp) {
      globalThis.$$onekeyPerfTrace?.log({
        name: 'LazyKitProvider render **children**',
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return cmp;
    }
    globalThis.$$onekeyPerfTrace?.log({
      name: 'LazyKitProvider render [null]',
    });
    return null;
  };
  LazyKitProvider.displayName = displayName;
  return LazyKitProvider;
}

updateInterceptorRequestHelper();
export function createLazyKitProvider({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  displayName,
}: {
  displayName?: string;
} = {}) {
  const { KitProvider } = require('.');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-member-access
  return KitProvider;
}
