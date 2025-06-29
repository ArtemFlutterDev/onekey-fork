import { IconButton, Tooltip, XStack } from '@onekeyhq/components';

import { Layout } from './utils/Layout';

const TooltipGallery = () => (
  <Layout
    componentName="Tooltip"
    description="A tooltip on web, with only accessibility output on native"
    elements={[
      {
        title: 'Default',
        element: (
          <XStack gap="$4">
            <Tooltip
              renderTrigger={<IconButton icon="EditOutline" />}
              renderContent="Qui nulla occaecat anim"
            />
          </XStack>
        ),
      },
      {
        title: 'Placements',
        element: (
          <XStack gap="$4">
            <Tooltip
              renderTrigger={<IconButton icon="ChevronTopOutline" />}
              renderContent="Qui nulla occaecat anim"
              placement="top"
            />
            <Tooltip
              renderTrigger={<IconButton icon="ChevronRightOutline" />}
              renderContent="Qui nulla occaecat anim"
              placement="right"
            />
            <Tooltip
              renderTrigger={<IconButton icon="ChevronBottomOutline" />}
              renderContent="Qui nulla occaecat anim"
            />
            <Tooltip
              renderTrigger={<IconButton icon="ChevronLeftOutline" />}
              renderContent="Qui nulla occaecat anim"
              placement="left"
            />
          </XStack>
        ),
      },
      {
        title: 'Max width',
        element: (
          <XStack gap="$4">
            <Tooltip
              renderTrigger={<IconButton icon="EditOutline" />}
              renderContent="Excepteur cillum laboris ea sint esse reprehenderit. Culpa fugiat aliqua elit sit deserunt cupidatat adipisicing velit non ad. Magna qui aute eiusmod deserunt elit commodo culpa nostrud aute veniam esse elit eu."
            />
          </XStack>
        ),
      },
    ]}
  />
);

export default TooltipGallery;
