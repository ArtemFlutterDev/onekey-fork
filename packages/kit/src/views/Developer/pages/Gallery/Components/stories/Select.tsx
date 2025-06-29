/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable react/no-unstable-nested-components */
import { useState } from 'react';

import type { ISelectItem, ISelectSection } from '@onekeyhq/components';
import { Icon, Select, SizableText, Stack } from '@onekeyhq/components';

import { Layout } from './utils/Layout';

const items: ISelectItem[] = [
  { label: 'Banana0', value: 'Banana' },
  {
    label: 'Apple1',
    value: 'Apple',
  },

  {
    label: 'Pear2',
    value: 'Pear',
  },

  {
    label: 'Blackberry3',
    value: 'Blackberry',
  },

  {
    label: 'Peach4',
    value: 'Peach',
  },

  { label: 'Apricot5', value: 'Apricot' },

  { label: 'Melon6', value: 'Melon' },

  { label: 'Honeydew7', value: 'Honeydew' },

  { label: 'Starfruit8', value: 'Starfruit' },

  { label: 'Blueberry9', value: 'Blueberry' },
];

const SelectDefaultItem = () => {
  const [val, setVal] = useState(items[1].value);

  return (
    <Select
      items={items}
      value={val}
      onChange={setVal}
      title="Demo Title"
      onOpenChange={console.log}
    />
  );
};

const SelectLongListItem = () => {
  const [val, setVal] = useState('Apple');

  return (
    <Select
      items={new Array(1000).fill(undefined).map((_, index) => ({
        label: String(index),
        value: String(index),
      }))}
      sheetProps={{
        snapPointsMode: 'percent',
        snapPoints: [80],
      }}
      value={val}
      onChange={setVal}
      title="Demo Title"
      onOpenChange={console.log}
    />
  );
};

const SelectDisabledItem = () => {
  const [val, setVal] = useState('Apple');

  return (
    <Select
      disabled
      items={items}
      value={val}
      onChange={setVal}
      title="Demo Title"
      onOpenChange={console.log}
    />
  );
};

const SelectCustomItem = () => {
  const [val, setVal] = useState('');

  return (
    <Select
      placeholder="please select one"
      renderTrigger={({ value, label, placeholder }) => (
        <SizableText>
          {value
            ? `label: ${label || ''}, value: ${String(value)}`
            : placeholder}
        </SizableText>
      )}
      items={items}
      value={val}
      onChange={setVal}
      title="Demo Title"
      onOpenChange={console.log}
    />
  );
};

const sections: ISelectSection[] = [
  {
    title: 'emoji Section',
    data: [
      {
        label: 'Apple🍎',
        value: 'Apple',
        leading: <SizableText size="$bodyMdMedium">😀</SizableText>,
      },

      {
        label: 'Pear🌰',
        value: 'Pear',
        leading: <SizableText size="$bodyMdMedium">🚅</SizableText>,
      },

      {
        label: 'Blackberry🫐',
        value: 'Blackberry',
        leading: <SizableText size="$bodyMdMedium">🚆</SizableText>,
      },

      {
        label: 'Peach🍑',
        value: 'Peach',
        leading: <Icon name="AccessibilityEyeOutline" size="$5" />,
      },
    ],
  },
  {
    title: 'plain Section',
    data: [
      { label: 'Apricot1', value: 'Apricot1' },

      { label: 'Melon2', value: 'Melon2' },

      { label: 'Honeydew3', value: 'Honeydew3' },

      { label: 'Starfruit4', value: 'Starfruit4' },

      { label: 'Blueberry5', value: 'Blueberry5' },
    ],
  },
];

const SelectSectionsItemDemo = () => {
  const [val, setVal] = useState('Apple');
  return (
    <Select
      sections={sections}
      value={val}
      onChange={setVal}
      title="Demo Title"
      onOpenChange={console.log}
    />
  );
};

const SelectDefaultValue = () => {
  const [val, setVal] = useState('Apple');
  return (
    <Select
      sections={sections}
      value={val}
      onChange={setVal}
      title="Demo Title"
      onOpenChange={console.log}
    />
  );
};

const SelectGallery = () => (
  <Layout
    componentName="Select"
    elements={[
      {
        title: '默认状态',
        element: (
          <Stack gap="$1">
            <SelectDefaultItem />
          </Stack>
        ),
      },
      {
        title: 'labelInValue',
        element: () => {
          const [val, setVal] = useState(items[3]);
          const [sectionVal, setSectionVal] = useState(sections[1].data[2]);
          return (
            <Stack gap="$1">
              <Select
                labelInValue
                items={items}
                value={val}
                onChange={setVal}
                title="Label In Value"
                onOpenChange={console.log}
              />

              <Select
                labelInValue
                sections={sections}
                value={sectionVal}
                onChange={setSectionVal}
                title="Label In Value"
                onOpenChange={console.log}
              />
            </Stack>
          );
        },
      },
      {
        title: 'Long List',
        element: (
          <Stack gap="$1">
            <SelectLongListItem />
          </Stack>
        ),
      },
      {
        title: 'Disabled',
        element: (
          <Stack gap="$1">
            <SelectDisabledItem />
          </Stack>
        ),
      },
      {
        title: 'Custom Trigger',
        element: (
          <Stack gap="$1">
            <SelectCustomItem />
          </Stack>
        ),
      },
      {
        title: 'Select Sections',
        element: (
          <Stack gap="$1">
            <SelectSectionsItemDemo />
          </Stack>
        ),
      },
      {
        title: 'default value with Label',
        element: (
          <Stack gap="$1">
            <SelectDefaultValue />
          </Stack>
        ),
      },
    ]}
  />
);

export default SelectGallery;
