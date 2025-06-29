import type { ForwardedRef, ReactNode } from 'react';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';

import { getTokenValue, withStaticProperties } from 'tamagui';

import platformEnv from '@onekeyhq/shared/src/platformEnv';

import { SizableText, Stack, XStack } from '../../primitives';
import { ListView } from '../ListView/list';

import type { ISizableTextProps, IStackProps } from '../../primitives';
import type { IListViewProps, IListViewRef } from '../ListView/list';
import type { Tokens } from '@tamagui/web/types/types';
import type { ListRenderItem } from 'react-native';

type ISectionRenderInfo = (info: {
  section: any;
  index: number;
}) => ReactNode | null;

export type ISectionListProps<T> = Omit<
  IListViewProps<T>,
  'data' | 'renderItem' | 'overrideItemLayout'
> & {
  sections: Array<{
    data?: any[];
  }>;
  renderItem?: (info: {
    item: any;
    section: any;
    index: number;
  }) => ReactNode | null;
  renderSectionHeader?: ISectionRenderInfo;
  renderSectionFooter?: ISectionRenderInfo;
  SectionSeparatorComponent?: ReactNode;
  stickySectionHeadersEnabled?: boolean;
  estimatedSectionHeaderSize?: number | `$${keyof Tokens['size']}`;
  estimatedSectionFooterSize?: number | `$${keyof Tokens['size']}`;
  estimatedSectionSeparatorSize?: number | `$${keyof Tokens['size']}`;
};

type IScrollToLocationParams = {
  animated?: boolean;
  itemIndex?: number;
  sectionIndex?: number;
  viewOffset?: number;
  viewPosition?: number;
};

export type ISectionListRef<T> = IListViewRef<T> & {
  scrollToLocation: (info: IScrollToLocationParams) => void;
};

enum ESectionLayoutType {
  Header = 'sectionHeader',
  SectionSeparator = 'sectionSeparator',
  Item = 'item',
  Footer = 'sectionFooter',
}

type ISectionLayoutItem = {
  index: number;
  type: ESectionLayoutType;
  value: any;
  section?: any;
  sectionIndex: number;
};

function BaseSectionList<T>(
  {
    sections,
    renderItem,
    renderSectionHeader,
    renderSectionFooter,
    ListHeaderComponent,
    SectionSeparatorComponent = <Stack h="$5" />,
    stickySectionHeadersEnabled = false,
    keyExtractor,
    estimatedItemSize = 0,
    estimatedSectionHeaderSize = '$9',
    estimatedSectionFooterSize = 0,
    estimatedSectionSeparatorSize = '$5',
    ...restProps
  }: ISectionListProps<T>,
  parentRef: ForwardedRef<IListViewRef<T>>,
) {
  const reloadSections = useMemo(() => {
    const reloadSectionList: ISectionLayoutItem[] = [];
    sections?.forEach?.((section, sectionIndex) => {
      if (sectionIndex !== 0) {
        reloadSectionList.push({
          value: section,
          index: sectionIndex,
          sectionIndex,
          type: ESectionLayoutType.SectionSeparator,
        });
      }
      reloadSectionList.push({
        value: section,
        index: sectionIndex,
        sectionIndex,
        type: ESectionLayoutType.Header,
      });
      section?.data?.forEach?.((item, index) => {
        reloadSectionList.push({
          value: item,
          section,
          index,
          sectionIndex,
          type: ESectionLayoutType.Item,
        });
      });
      reloadSectionList.push({
        value: section,
        index: sectionIndex,
        sectionIndex,
        type: ESectionLayoutType.Footer,
      });
    });
    return reloadSectionList;
  }, [sections]);

  const reloadSectionHeaderIndex = useCallback(
    (index: number) =>
      ListHeaderComponent && !platformEnv.isNative ? index + 1 : index,
    [ListHeaderComponent],
  );

  const reloadStickyHeaderIndices = useMemo(() => {
    if (!stickySectionHeadersEnabled) {
      return undefined;
    }
    return reloadSections
      .map((item, index) =>
        item.type === ESectionLayoutType.Header
          ? reloadSectionHeaderIndex(index)
          : null,
      )
      .filter((index) => index != null);
  }, [reloadSectionHeaderIndex, stickySectionHeadersEnabled, reloadSections]);

  const ref = useRef<IListViewRef<T>>(null);
  useImperativeHandle(parentRef as any, () => ({
    scrollToLocation: ({
      animated,
      itemIndex = 0,
      sectionIndex = 0,
      viewOffset,
      viewPosition,
    }: IScrollToLocationParams) => {
      ref?.current?.scrollToIndex?.({
        index:
          reloadSections.findIndex(
            (item) =>
              item.type === ESectionLayoutType.Header &&
              item.index === sectionIndex,
          ) + itemIndex,
        animated,
        viewOffset,
        viewPosition,
      });
    },
    ...ref.current,
  }));
  const renderSectionAndItem = useCallback(
    ({ item }: { item: T }) => {
      const { type, value, section, index } = item as ISectionLayoutItem;
      switch (type) {
        case ESectionLayoutType.SectionSeparator: {
          return SectionSeparatorComponent;
        }
        case ESectionLayoutType.Header: {
          return renderSectionHeader?.({
            section: value,
            index,
          });
        }
        case ESectionLayoutType.Item: {
          return renderItem?.({
            item: value,
            section,
            index,
          });
        }
        case ESectionLayoutType.Footer: {
          return renderSectionFooter?.({
            section: value,
            index,
          });
        }
        default: {
          break;
        }
      }
    },
    [
      renderItem,
      renderSectionHeader,
      renderSectionFooter,
      SectionSeparatorComponent,
    ],
  );
  const getItemType = useCallback(
    (item: T) => (item as ISectionLayoutItem).type,
    [],
  );
  const reloadKeyExtractor = useCallback(
    (item: T, index: number) => {
      const layoutItem = item as ISectionLayoutItem;
      if (layoutItem.type === ESectionLayoutType.Item && keyExtractor) {
        return keyExtractor(layoutItem.value, index);
      }
      return `${layoutItem.type}_${layoutItem.sectionIndex}_${layoutItem.index}`;
    },
    [keyExtractor],
  );
  const getTokenSizeNumber = useCallback(
    (token?: number | `$${keyof Tokens['size']}`) => {
      if (typeof token === 'undefined') {
        return undefined;
      }
      return typeof token === 'number'
        ? token
        : (getTokenValue(token, 'size') as number);
    },
    [],
  );
  const tokenSizeNumberList = useMemo(
    () => ({
      [ESectionLayoutType.Header]: getTokenSizeNumber(
        estimatedSectionHeaderSize,
      ),
      [ESectionLayoutType.Item]: getTokenSizeNumber(estimatedItemSize),
      [ESectionLayoutType.Footer]: getTokenSizeNumber(
        estimatedSectionFooterSize,
      ),
      [ESectionLayoutType.SectionSeparator]: getTokenSizeNumber(
        estimatedSectionSeparatorSize,
      ),
    }),
    [
      getTokenSizeNumber,
      estimatedSectionHeaderSize,
      estimatedItemSize,
      estimatedSectionFooterSize,
      estimatedSectionSeparatorSize,
    ],
  );
  const overrideItemLayout = useCallback(
    (layout: { span?: number; size?: number }, item: T) => {
      layout.size = tokenSizeNumberList[(item as ISectionLayoutItem).type] ?? 0;
    },
    [tokenSizeNumberList],
  );
  const layoutList = useMemo(() => {
    let offset = 0;
    return reloadSections.map((item, index) => {
      const size = tokenSizeNumberList[item.type] ?? 0;
      offset += size;
      return { offset, length: size, index };
    });
  }, [reloadSections, tokenSizeNumberList]);
  const getItemLayout = useCallback(
    (_: ArrayLike<T> | null | undefined, index: number) =>
      index === -1 ? { index, offset: 0, length: 0 } : layoutList[index],
    [layoutList],
  );
  return (
    <ListView
      ref={ref}
      data={reloadSections as T[]}
      renderItem={renderSectionAndItem as ListRenderItem<T>}
      ListHeaderComponent={ListHeaderComponent}
      stickyHeaderIndices={reloadStickyHeaderIndices}
      getItemType={getItemType}
      keyExtractor={reloadKeyExtractor}
      estimatedItemSize={estimatedItemSize}
      {...(platformEnv.isNative
        ? {
            overrideItemLayout,
          }
        : {
            getItemLayout,
          })}
      {...restProps}
    />
  );
}

function SectionHeader({
  title,
  titleProps,
  children,
  ...restProps
}: IStackProps & {
  title?: string;
  titleProps?: ISizableTextProps;
}) {
  return (
    <XStack h="$9" px="$5" alignItems="center" bg="$bgApp" {...restProps}>
      <SizableText
        numberOfLines={1}
        size="$headingSm"
        color="$textSubdued"
        {...titleProps}
      >
        {title}
      </SizableText>
      {children}
    </XStack>
  );
}

export const SectionList = withStaticProperties(forwardRef(BaseSectionList), {
  SectionHeader,
});
