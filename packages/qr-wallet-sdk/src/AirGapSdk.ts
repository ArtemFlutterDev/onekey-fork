import AirGapSdkBase from '@keystonehq/keystone-sdk';

import { AirGapBtcSDK, AirGapEthSDK, AirGapSolSDK } from './chains';

export class AirGapSdk extends AirGapSdkBase {
  private _ethAirGap: AirGapEthSDK | undefined;

  override get eth() {
    if (!this._ethAirGap) {
      this._ethAirGap = new AirGapEthSDK(this.config);
    }
    return this._ethAirGap;
  }

  private _btcAirGap: AirGapBtcSDK | undefined;

  override get btc() {
    if (!this._btcAirGap) {
      this._btcAirGap = new AirGapBtcSDK(this.config);
    }
    return this._btcAirGap;
  }

  private _solAirGap: AirGapSolSDK | undefined;

  override get sol() {
    if (!this._solAirGap) {
      this._solAirGap = new AirGapSolSDK();
    }
    return this._solAirGap;
  }
}

let sdk: AirGapSdk | undefined;
export function getAirGapSdk(): AirGapSdk {
  if (!sdk) {
    sdk = new AirGapSdk();
  }
  return sdk;
}
