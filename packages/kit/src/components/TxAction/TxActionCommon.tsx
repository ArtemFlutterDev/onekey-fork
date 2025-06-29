import { useIntl } from 'react-intl';

import {
  Badge,
  Divider,
  Icon,
  NumberSizeableText,
  SizableText,
  Stack,
  XStack,
} from '@onekeyhq/components';
import { ListItem } from '@onekeyhq/kit/src/components/ListItem';
import type { IListItemProps } from '@onekeyhq/kit/src/components/ListItem';
import { useSettingsPersistAtom } from '@onekeyhq/kit-bg/src/states/jotai/atoms';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { formatTime } from '@onekeyhq/shared/src/utils/dateUtils';
import { TX_RISKY_LEVEL_SPAM } from '@onekeyhq/shared/src/walletConnect/constant';
import { EDecodedTxStatus, EReplaceTxType } from '@onekeyhq/shared/types/tx';

import { useAccountData } from '../../hooks/useAccountData';
import { useActiveAccount } from '../../states/jotai/contexts/accountSelector';
import {
  InfoItem,
  InfoItemGroup,
} from '../../views/AssetDetails/pages/HistoryDetails/components/TxDetailsInfoItem';
import { NetworkAvatar } from '../NetworkAvatar';
import { Token } from '../Token';

import type {
  ITxActionCommonDetailViewProps,
  ITxActionCommonListViewProps,
} from './types';

function TxActionCommonAvatar({
  avatar,
  networkLogoURI,
}: Pick<
  ITxActionCommonListViewProps,
  'avatar' | 'tableLayout' | 'networkLogoURI'
>) {
  const containerSize = '$10';

  const {
    activeAccount: { network: activeNetwork },
  } = useActiveAccount({ num: 0 });

  if (!avatar.src || typeof avatar.src === 'string') {
    return (
      <Token
        size="lg"
        isNFT={avatar.isNFT}
        fallbackIcon={avatar.fallbackIcon}
        tokenImageUri={avatar.src}
        networkImageUri={
          activeNetwork?.isAllNetworks ? networkLogoURI : undefined
        }
        networkId={activeNetwork?.id}
        showNetworkIcon={activeNetwork?.isAllNetworks}
      />
    );
  }

  return (
    <Stack
      w={containerSize}
      h={containerSize}
      alignItems="flex-end"
      justifyContent="flex-end"
    >
      <Stack position="absolute" left="$0" top="$0">
        <Token
          size="sm"
          isNFT={avatar.isNFT}
          fallbackIcon={avatar.fallbackIcon}
          tokenImageUri={avatar.src[0]}
          networkImageUri={
            activeNetwork?.isAllNetworks ? networkLogoURI : undefined
          }
          showNetworkIcon={activeNetwork?.isAllNetworks}
          networkId={activeNetwork?.id}
        />
      </Stack>
      <Stack
        borderWidth={2}
        borderColor="$bgApp"
        borderRadius="$full"
        zIndex={1}
      >
        <Token
          size="sm"
          isNFT={avatar.isNFT}
          fallbackIcon={avatar.fallbackIcon}
          tokenImageUri={avatar.src[1]}
          networkImageUri={
            activeNetwork?.isAllNetworks ? networkLogoURI : undefined
          }
          showNetworkIcon={activeNetwork?.isAllNetworks}
          networkId={activeNetwork?.id}
        />
      </Stack>
    </Stack>
  );
}

function TxActionCommonTitle({
  title,
  tableLayout,
  replaceType,
  status,
  riskyLevel,
}: Pick<
  ITxActionCommonListViewProps,
  'title' | 'tableLayout' | 'replaceType' | 'status' | 'riskyLevel'
>) {
  const intl = useIntl();

  return (
    <XStack alignItems="center">
      <SizableText
        numberOfLines={1}
        flexShrink={1}
        size="$bodyLgMedium"
        {...(tableLayout && {
          size: '$bodyMdMedium',
        })}
      >
        {title}
      </SizableText>
      {replaceType && status === EDecodedTxStatus.Pending ? (
        <Badge badgeSize="sm" badgeType="info" ml="$2">
          {intl.formatMessage({
            id:
              replaceType === EReplaceTxType.SpeedUp
                ? ETranslations.global_sped_up
                : ETranslations.global_cancelling,
          })}
        </Badge>
      ) : null}
      {status === EDecodedTxStatus.Failed ? (
        <Badge badgeSize="sm" badgeType="critical" ml="$2">
          {intl.formatMessage({ id: ETranslations.global_failed })}
        </Badge>
      ) : null}
      {riskyLevel && riskyLevel > TX_RISKY_LEVEL_SPAM ? (
        <Badge badgeSize="sm" badgeType="critical" ml="$2">
          {intl.formatMessage({ id: ETranslations.global_risk })}
        </Badge>
      ) : null}
    </XStack>
  );
}

function TxActionCommonDescription({
  description,
}: Pick<ITxActionCommonListViewProps, 'description' | 'tableLayout'>) {
  return (
    <XStack alignItems="center" flex={1}>
      {description?.prefix ? (
        <SizableText size="$bodyMd" color="$textSubdued" pr="$1.5">
          {description?.prefix}
        </SizableText>
      ) : null}
      {description?.icon ? (
        <Icon
          color="$iconSubdued"
          mr="$0.5"
          size="$4"
          name={description.icon}
        />
      ) : null}
      <SizableText size="$bodyMd" color="$textSubdued" minWidth={0}>
        {description?.children}
      </SizableText>
    </XStack>
  );
}

function TxActionCommonChange({
  change,
  tableLayout,
}: Pick<ITxActionCommonListViewProps, 'tableLayout'> & { change: string }) {
  return (
    <SizableText
      numberOfLines={1}
      size="$bodyLgMedium"
      {...(change?.includes('+') && {
        color: '$textSuccess',
      })}
      {...(tableLayout && {
        size: '$bodyMdMedium',
      })}
    >
      {change}
    </SizableText>
  );
}

function TxActionCommonChangeDescription({
  changeDescription,
}: {
  changeDescription: string;
}) {
  return (
    <SizableText size="$bodyMd" color="$textSubdued" numberOfLines={1}>
      {changeDescription || '-'}
    </SizableText>
  );
}

function TxActionCommonFee({
  fee,
  feeFiatValue,
  feeSymbol,
  currencySymbol,
}: Pick<ITxActionCommonListViewProps, 'fee' | 'feeFiatValue' | 'feeSymbol'> & {
  currencySymbol: string;
}) {
  const intl = useIntl();

  return (
    <Stack flexGrow={1} flexBasis={0}>
      <SizableText size="$bodyMd" color="$textSubdued">
        {intl.formatMessage({
          id: ETranslations.swap_history_detail_network_fee,
        })}
      </SizableText>
      <XStack alignItems="center" gap="$1">
        <NumberSizeableText
          size="$bodyMd"
          formatter="balance"
          formatterOptions={{ tokenSymbol: feeSymbol }}
        >
          {fee}
        </NumberSizeableText>
        <NumberSizeableText
          size="$bodyMd"
          color="$textSubdued"
          formatter="value"
          formatterOptions={{ currency: currencySymbol }}
        >
          {feeFiatValue}
        </NumberSizeableText>
      </XStack>
    </Stack>
  );
}

function TxActionCommonListView(
  props: ITxActionCommonListViewProps & IListItemProps,
) {
  const {
    avatar,
    title,
    status,
    description,
    change,
    changeDescription,
    fee,
    feeFiatValue,
    feeSymbol,
    timestamp,
    tableLayout,
    showIcon,
    hideFeeInfo,
    replaceType,
    networkId,
    networkLogoURI,
    riskyLevel,
    ...rest
  } = props;
  const [settings] = useSettingsPersistAtom();
  const currencySymbol = settings.currencyInfo.symbol;

  return (
    <ListItem
      testID="tx-action-common-list-view"
      gap="$2"
      flexDirection="column"
      alignItems="flex-start"
      userSelect="none"
      opacity={riskyLevel && riskyLevel > TX_RISKY_LEVEL_SPAM ? 0.5 : 1}
      {...rest}
    >
      {/* Content */}
      <XStack gap="$3" alignSelf="stretch">
        {/* token, title and subtitle */}
        <XStack
          flex={1}
          gap="$3"
          {...(tableLayout && {
            flexGrow: 1,
            flexBasis: 1,
          })}
        >
          {showIcon ? (
            <TxActionCommonAvatar
              avatar={avatar}
              tableLayout={tableLayout}
              networkLogoURI={networkLogoURI}
            />
          ) : null}
          <Stack flex={1}>
            <TxActionCommonTitle
              title={title}
              status={status}
              tableLayout={tableLayout}
              replaceType={replaceType}
              riskyLevel={riskyLevel}
            />
            <XStack alignSelf="stretch">
              {timestamp &&
              (tableLayout || !(description && description.children)) ? (
                <>
                  <SizableText size="$bodyMd" color="$textSubdued">
                    {formatTime(new Date(timestamp), {
                      hideSeconds: true,
                      hideMilliseconds: true,
                    })}
                  </SizableText>
                  {description && description.children ? (
                    <SizableText size="$bodyMd" color="$textSubdued" mx="$1">
                      •
                    </SizableText>
                  ) : null}
                </>
              ) : null}
              <TxActionCommonDescription
                description={description}
                tableLayout={tableLayout}
              />
            </XStack>
          </Stack>
        </XStack>
        {/* changes */}
        <Stack
          maxWidth="50%"
          alignItems="flex-end"
          {...(tableLayout && {
            alignItems: 'unset',
            flexGrow: 1,
            flexBasis: 0,
          })}
        >
          {typeof change === 'string' ? (
            <TxActionCommonChange change={change} tableLayout={tableLayout} />
          ) : (
            change
          )}
          {typeof changeDescription === 'string' ? (
            <TxActionCommonChangeDescription
              changeDescription={changeDescription}
            />
          ) : (
            changeDescription
          )}
        </Stack>
        {/* fees */}
        {tableLayout && !hideFeeInfo ? (
          <TxActionCommonFee
            fee={fee}
            feeFiatValue={feeFiatValue}
            feeSymbol={feeSymbol}
            currencySymbol={currencySymbol}
          />
        ) : null}
      </XStack>
    </ListItem>
  );
}

function TxActionCommonDetailView(props: ITxActionCommonDetailViewProps) {
  const { overview, target, source, applyFor, networkId } = props;
  const intl = useIntl();
  const { network } = useAccountData({ networkId });

  return (
    <InfoItemGroup>
      <InfoItem
        label={overview.title}
        renderContent={
          <XStack alignItems="center" gap="$3" minWidth={0}>
            <Token
              fallbackIcon={overview.avatar?.fallbackIcon}
              isNFT={overview.avatar?.isNFT}
              tokenImageUri={overview.avatar?.src}
            />
            {typeof overview.content === 'string' ? (
              <SizableText
                minWidth={0}
                maxWidth="$96"
                size="$headingSm"
                flex={1}
              >
                {overview.content}
              </SizableText>
            ) : (
              overview.content
            )}
          </XStack>
        }
      />

      <Divider mx="$2.5" my="$3" />

      {source && source.content ? (
        <InfoItem
          label={
            source.title ??
            intl.formatMessage({ id: ETranslations.content__from })
          }
          renderContent={source.content}
          description={source.description?.content}
        />
      ) : null}

      {target && target.content ? (
        <InfoItem
          label={
            target.title ??
            intl.formatMessage({ id: ETranslations.content__to })
          }
          renderContent={target.content}
          description={target.description?.content}
        />
      ) : null}

      {applyFor && applyFor.content ? (
        <InfoItem
          label={
            applyFor.title ??
            intl.formatMessage({ id: ETranslations.global_for })
          }
          renderContent={applyFor.content}
          description={applyFor.description?.content}
        />
      ) : null}
      <InfoItem
        label={intl.formatMessage({ id: ETranslations.network__network })}
        renderContent={
          <XStack alignItems="center" gap="$2">
            <NetworkAvatar networkId={networkId} size="$5" />
            <SizableText size="$bodyMd" color="$textSubdued">
              {network?.name}
            </SizableText>
          </XStack>
        }
      />
    </InfoItemGroup>
  );
}

export { TxActionCommonListView, TxActionCommonDetailView };
