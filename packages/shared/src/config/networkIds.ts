// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { memoFn } from '../utils/cacheUtils';

import { getPresetNetworks } from './presetNetworks';

export type INetworkShortCode =
  | 'onekeyall'
  | 'eth'
  | 'goerli'
  | 'arbitrum'
  | 'optimism'
  | 'avalanche'
  | 'bsc'
  | 'sol'
  | 'near'
  | 'algo'
  | 'stc'
  | 'cfx'
  | 'apt'
  | 'doge'
  | 'xna'
  | 'bch'
  | 'xrp'
  | 'ada'
  | 'sui'
  | 'fil'
  | 'dot'
  | 'kaspa'
  | 'nexa'
  | 'nostr'
  | 'dnx'
  | 'ckb'
  | 'btc'
  | 'tbtc'
  | 'sbtc'
  | 'juno'
  | 'osmosis'
  | 'secretnetwork'
  | 'cosmoshub'
  | 'akash'
  | 'fetch'
  | 'terra'
  | 'cryptoorgchain'
  | 'injective'
  | 'polygon'
  | 'tlightning'
  | 'lightning'
  | 'ltc'
  | 'trx'
  | 'neurai'
  | 'sepolia'
  | 'mantle'
  | 'mantapacific'
  | 'blast'
  | 'opbnb'
  | 'fevm'
  | 'holesky'
  | 'flare'
  | 'base'
  | 'ton'
  | 'bob'
  | 'mode'
  | 'taiko'
  | 'metis'
  | 'hsk'
  | 'neon3';

const checkErrors: string[] = [];
// TODO generate getNetworkIdsMap in build time
export const getNetworkIdsMap = memoFn(() => {
  const networks = getPresetNetworks();
  const r = networks.reduce((memo, n) => {
    memo[n.shortcode as INetworkShortCode] = n.id;
    // const testNames: string[] = [
    //   n.code,
    //   n.impl,
    //   //  n.shortcode,
    // ];
    // if (uniq(testNames).length > 1) {
    //   checkErrors.push(
    //     `Networks must have same code, shortcode and impl: ${JSON.stringify(
    //       testNames,
    //     )}`,
    //   );
    // }
    return memo;
  }, {} as Record<INetworkShortCode, string>);
  if (checkErrors.length) {
    throw new Error(checkErrors.join('\n'));
  }
  return r;
});

export const getNetworkIds = memoFn(() => Object.keys(getNetworkIdsMap()));
