import { IMPL_NEO } from '@onekeyhq/shared/src/engine/engineConsts';

import { CoreChainScopeBase } from '../../base/CoreChainScopeBase';

import type CoreChainHd from './CoreChainHd';
import type CoreChainImported from './CoreChainImported';

export default class extends CoreChainScopeBase {
  override impl = IMPL_NEO;

  override hd: CoreChainHd = this._createApiProxy('hd') as CoreChainHd;

  protected override _hd = async () => (await import('./CoreChainHd')).default;

  override imported: CoreChainImported = this._createApiProxy(
    'imported',
  ) as CoreChainImported;

  protected override _imported = async () =>
    (await import('./CoreChainImported')).default;
}
