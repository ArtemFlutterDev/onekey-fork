import { useCallback, useMemo } from 'react';

import { SizableText, Stack } from '@onekeyhq/components';
import type { IPageNavigationProp } from '@onekeyhq/components/src/layouts/Navigation';
import useAppNavigation from '@onekeyhq/kit/src/hooks/useAppNavigation';
import type { IDiscoveryModalParamList } from '@onekeyhq/shared/src/routes';
import {
  EDiscoveryModalRoutes,
  EModalRoutes,
} from '@onekeyhq/shared/src/routes';

import {
  useActiveTabId,
  useDisplayHomePageFlag,
  useWebTabs,
} from '../../hooks/useWebTabs';

import { useTakeScreenshot } from './MobileBrowserBottomBar';

interface ITabCountButtonProps {
  testID: string;
  hideWhenEmpty?: boolean;
}

function TabCountButton({ testID, hideWhenEmpty }: ITabCountButtonProps) {
  const { displayHomePage } = useDisplayHomePageFlag();
  const { tabs } = useWebTabs();
  const { activeTabId } = useActiveTabId();
  const tabCount = useMemo(() => tabs.length, [tabs]);
  const takeScreenshot = useTakeScreenshot(activeTabId);

  const navigation =
    useAppNavigation<IPageNavigationProp<IDiscoveryModalParamList>>();

  const handleShowTabList = useCallback(async () => {
    try {
      if (!displayHomePage) {
        await takeScreenshot();
      }
    } catch (e) {
      console.error(e);
    }
    navigation.pushModal(EModalRoutes.DiscoveryModal, {
      screen: EDiscoveryModalRoutes.MobileTabList,
    });
  }, [takeScreenshot, navigation, displayHomePage]);

  if (hideWhenEmpty && tabCount === 0) {
    return null;
  }

  return (
    <Stack
      p="$3"
      borderRadius="$full"
      pressStyle={{
        bg: '$bgActive',
      }}
      onPress={() => {
        void handleShowTabList();
      }}
      testID={testID}
    >
      <Stack
        minWidth="$5"
        minHeight="$5"
        borderRadius="$1"
        borderWidth="$0.5"
        borderColor="$iconSubdued"
        alignItems="center"
        justifyContent="center"
      >
        <SizableText size="$bodySmMedium" color="$iconSubdued">
          {tabCount}
        </SizableText>
      </Stack>
    </Stack>
  );
}

export default TabCountButton;
