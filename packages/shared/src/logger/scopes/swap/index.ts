import { BaseScope } from '../../base/baseScope';
import { EScopeName } from '../../types';

import { CancelLimitOrderScene } from './scenes/cancelLimitOrder';
import { CleanSwapOrderScene } from './scenes/cleanSwapOrder';
import { CreateOrderScene } from './scenes/createOrder';
import { EnterSwapScene } from './scenes/enterSwap';
import { ProviderChangeScene } from './scenes/providerChange';
import { SelectTokenScene } from './scenes/selectToken';
import { SwapQuoteScene } from './scenes/swapQuote';

export class SwapScope extends BaseScope {
  protected override scopeName = EScopeName.swap;

  createSwapOrder = this.createScene('createSwapOrder', CreateOrderScene);

  selectToken = this.createScene('selectToken', SelectTokenScene);

  providerChange = this.createScene('providerChange', ProviderChangeScene);

  cancelLimitOrder = this.createScene(
    'cancelLimitOrder',
    CancelLimitOrderScene,
  );

  cleanSwapOrder = this.createScene('cleanSwapOrder', CleanSwapOrderScene);

  swapQuote = this.createScene('swapQuote', SwapQuoteScene);

  enterSwap = this.createScene('enterSwap', EnterSwapScene);
}
