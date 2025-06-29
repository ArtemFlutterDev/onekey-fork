import type { IFuseResultMatch } from '@onekeyhq/shared/src/modules3rdParty/fuse';
import type { IServerNetwork } from '@onekeyhq/shared/types';

export type IServerNetworkMatch = IServerNetwork & {
  titleMatch?: IFuseResultMatch;
};

export type IPureChainSelectorSectionListItem = {
  title?: string;
  data: IServerNetworkMatch[];
  isUnavailable?: boolean;
};
