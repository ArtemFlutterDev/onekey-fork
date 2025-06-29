import { Shortcut, YStack } from '@onekeyhq/components';
import { shortcutsKeys } from '@onekeyhq/shared/src/shortcuts/shortcutsKeys.enum';

import { Layout } from './utils/Layout';

const ShortcutGallery = () => (
  <Layout
    componentName="Shortcut"
    elements={[
      {
        title: 'State',
        element: (
          <YStack gap="$4">
            <Shortcut>
              <Shortcut.Key>{shortcutsKeys.CmdOrCtrl}</Shortcut.Key>
              <Shortcut.Key>t</Shortcut.Key>
            </Shortcut>
          </YStack>
        ),
      },
    ]}
  />
);

export default ShortcutGallery;
