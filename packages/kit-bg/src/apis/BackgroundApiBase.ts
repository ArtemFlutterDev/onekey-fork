import { consts } from '@onekeyfe/cross-inpage-provider-core';
import { IInjectedProviderNames } from '@onekeyfe/cross-inpage-provider-types';
import { isFunction } from 'lodash';

import '@onekeyhq/kit-bg/src/webembeds/instance/webembedApiProxy';
import appGlobals from '@onekeyhq/shared/src/appGlobals';
import {
  backgroundClass,
  backgroundMethod,
  bindThis,
} from '@onekeyhq/shared/src/background/backgroundDecorators';
import {
  GLOBAL_EVENT_BUS_SYNC_BROADCAST_METHOD_NAME,
  getBackgroundServiceApi,
  throwMethodNotFound,
} from '@onekeyhq/shared/src/background/backgroundUtils';
import type { IGlobalEventBusSyncBroadcastParams } from '@onekeyhq/shared/src/background/backgroundUtils';
import {
  EEventBusBroadcastMethodNames,
  appEventBus,
} from '@onekeyhq/shared/src/eventBus/appEventBus';
import type {
  EAppEventBusNames,
  IAppEventBusPayload,
} from '@onekeyhq/shared/src/eventBus/appEventBus';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import {
  ensurePromiseObject,
  ensureSerializable,
} from '@onekeyhq/shared/src/utils/assertUtils';
import { EAlignPrimaryAccountMode } from '@onekeyhq/shared/types/dappConnection';

import { updateInterceptorRequestHelper } from '../init/updateInterceptorRequestHelper';
import { createBackgroundProviders } from '../providers/backgroundProviders';
import { settingsPersistAtom } from '../states/jotai/atoms';
import { jotaiBgSync } from '../states/jotai/jotaiBgSync';
import { jotaiInit } from '../states/jotai/jotaiInit';

import {
  isExtensionInternalCall,
  isProviderApiPrivateAllowedMethod,
  isProviderApiPrivateAllowedOrigin,
} from './backgroundApiPermissions';

import type {
  IBackgroundApiBridge,
  IBackgroundApiInternalCallMessage,
} from './IBackgroundApi';
import type ProviderApiBase from '../providers/ProviderApiBase';
import type { EAtomNames } from '../states/jotai/atomNames';
import type { JotaiCrossAtom } from '../states/jotai/utils/JotaiCrossAtom';
import type { JsBridgeBase } from '@onekeyfe/cross-inpage-provider-core';
import type {
  IInjectedProviderNamesStrings,
  IJsBridgeMessagePayload,
  IJsBridgeReceiveHandler,
  IJsonRpcRequest,
  IJsonRpcResponse,
} from '@onekeyfe/cross-inpage-provider-types';
import type { JsBridgeExtBackground } from '@onekeyfe/extension-bridge-hosted';

updateInterceptorRequestHelper();

@backgroundClass()
class BackgroundApiBase implements IBackgroundApiBridge {
  constructor() {
    this.cycleDepsCheck();
    jotaiBgSync.setBackgroundApi(this as any);
    this.allAtoms = jotaiInit();
    if (process.env.NODE_ENV !== 'production') {
      appGlobals.$$backgroundApi = this as any;
    }
    // this.startDemoNowTimeUpdateInterval();
    appEventBus.registerBroadcastMethods(
      EEventBusBroadcastMethodNames.bgToUi,
      async (type, payload) => {
        const params: IGlobalEventBusSyncBroadcastParams = {
          $$isFromBgEventBusSyncBroadcast: true,
          type,
          payload,
        };
        this.bridgeExtBg?.requestToAllUi({
          method: GLOBAL_EVENT_BUS_SYNC_BROADCAST_METHOD_NAME,
          params,
        });
      },
    );
  }

  allAtoms: Promise<{
    [key: string]: JotaiCrossAtom<any>;
  }>;

  @backgroundMethod()
  async getAtomStates(): Promise<{ states: Record<EAtomNames, any> }> {
    const atoms = await this.allAtoms;
    const states = {} as Record<EAtomNames, any>;
    await Promise.all(
      Object.entries(atoms).map(async ([key, value]) => {
        states[key as EAtomNames] = await value.get();
      }),
    );
    return { states };
  }

  @bindThis()
  @backgroundMethod()
  async setAtomValue(atomName: EAtomNames, value: any) {
    const atoms = await this.allAtoms;
    const atom = atoms[atomName];
    if (!atom) {
      throw new Error(`setAtomValue ERROR: atomName not found: ${atomName}`);
    }
    await atom.set(value);
  }

  @backgroundMethod()
  async emitEvent<T extends EAppEventBusNames>(
    type: T,
    payload: IAppEventBusPayload[T],
  ): Promise<boolean> {
    appEventBus.emit(type, payload);
    return Promise.resolve(true);
  }

  cycleDepsCheck() {
    //
  }

  bridge: JsBridgeBase | null = null;

  webEmbedBridge: JsBridgeBase | null = null;

  bridgeExtBg: JsBridgeExtBackground | null = null;

  providers: Record<IInjectedProviderNames, ProviderApiBase> =
    createBackgroundProviders({
      backgroundApi: this,
    });

  // @ts-ignore
  _persistorUnsubscribe: () => void;

  connectBridge(bridge: JsBridgeBase) {
    if (platformEnv.isExtension) {
      this.bridgeExtBg = bridge as unknown as JsBridgeExtBackground;
    }
    this.bridge = bridge;
  }

  connectWebEmbedBridge(bridge: JsBridgeBase) {
    this.webEmbedBridge = bridge;
  }

  protected rpcResult(
    result: any,
    rpcRequest?: IJsonRpcRequest,
  ): IJsonRpcResponse<any> {
    return {
      id: rpcRequest?.id ?? undefined,
      jsonrpc: rpcRequest?.jsonrpc ?? '2.0',
      result,
    };
  }

  async handleProviderMethods(
    payload: IJsBridgeMessagePayload,
  ): Promise<IJsonRpcResponse<any>> {
    const { scope, origin } = payload;
    const payloadData = payload?.data as IJsonRpcRequest;
    const provider: ProviderApiBase | null =
      this.providers[scope as IInjectedProviderNames];
    if (!provider) {
      throw new Error(
        `[${scope as string}] ProviderApi instance is not found.`,
      );
    }
    if (
      scope === IInjectedProviderNames.$private &&
      !isProviderApiPrivateAllowedOrigin(origin) &&
      !isProviderApiPrivateAllowedMethod(payloadData?.method)
    ) {
      const error = new Error(
        `[${origin as string}] is not allowed to call $private methods: ${
          payloadData?.method
        }`,
      );
      throw error;
    }
    // throw web3Errors.provider.custom({
    //   code: 3881,
    //   message: 'test custom error to dapp',
    // });
    const result = await provider.handleMethods(payload);
    ensureSerializable(result);
    // TODO non rpc result return in some chain provider
    const resultWrapped = this.rpcResult(result, payloadData);

    return resultWrapped;
  }

  async _bridgeReceiveHandler(payload: IJsBridgeMessagePayload): Promise<any> {
    const { scope, origin, internal } = payload;
    const request = (payload.data ?? {}) as IJsonRpcRequest;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { method, params } = request;

    if (!origin) {
      throw new Error('BackgroundApi [payload.origin] is required.');
    }

    if (!internal && !scope) {
      throw new Error(
        'BackgroundApi [payload.scope] is required for non-internal method call.',
      );
    }

    if (scope) {
      return this.handleProviderMethods(payload);
    }

    // call background global methods (backgroundDappTest.ts)
    //    Only Extension and internal call allowed
    if (isExtensionInternalCall(payload)) {
      return this.handleInternalMethods(payload);
    }

    if (isProviderApiPrivateAllowedOrigin(origin)) {
      return this.handleSelfOriginMethods(payload);
    }

    throwMethodNotFound(method);
  }

  bridgeReceiveHandler: IJsBridgeReceiveHandler = async (
    payload: IJsBridgeMessagePayload,
  ): Promise<any> => {
    const res = await this._bridgeReceiveHandler(payload);
    return res;
  };

  handleSelfOriginMethods(payload: IJsBridgeMessagePayload) {
    // TODO open webview url
    console.log(payload);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async handleInternalMethods(payload: IJsBridgeMessagePayload): Promise<any> {
    const { method, params, service } = (payload.data ??
      {}) as IBackgroundApiInternalCallMessage;
    const serviceName = service || '';
    const paramsArr = [].concat(params as any);

    const serviceApi = getBackgroundServiceApi({
      serviceName,
      backgroundApi: this,
    });

    const methodFunc = serviceApi[method];
    if (methodFunc) {
      const resultPromise = methodFunc.call(serviceApi, ...paramsArr);
      ensurePromiseObject(resultPromise, {
        serviceName,
        methodName: method,
      });
      const result = await resultPromise;
      ensureSerializable(result);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return result;
    }

    throwMethodNotFound(serviceName, method);
  }

  sendForProviderMaps: Record<string, any> = {};

  sendForProvider(providerName: IInjectedProviderNamesStrings): any {
    if (!providerName) {
      throw new Error('sendForProvider: providerName is required.');
    }
    if (!this.sendForProviderMaps[providerName]) {
      this.sendForProviderMaps[providerName] =
        this.sendMessagesToInjectedBridge.bind(this, providerName);
    }
    return this.sendForProviderMaps[providerName];
  }

  sendMessagesToInjectedBridge = async (
    scope: IInjectedProviderNamesStrings,
    data: unknown,
    targetOrigin: string,
  ) => {
    if (!this.bridge && !this.webEmbedBridge) {
      if (!platformEnv.isWeb) {
        console.warn(
          `sendMessagesToInjectedBridge ERROR: bridge should be connected first. scope=${scope}`,
        );
      }
      return;
    }
    if (platformEnv.isExtension) {
      // send to all dapp sites content-script

      // * bridgeExtBg.requestToAllCS supports function data: await data({ origin })
      const currentSettings = await settingsPersistAtom.get();
      if (
        currentSettings.alignPrimaryAccountMode ===
        EAlignPrimaryAccountMode.AlwaysUsePrimaryAccount
      ) {
        // eslint-disable-next-line no-param-reassign
        targetOrigin = consts.ONEKEY_REQUEST_TO_ALL_CS;
      }
      this.bridgeExtBg?.requestToAllCS(scope, data, targetOrigin);
    } else {
      if (this.bridge) {
        if (isFunction(data) && this.bridge.remoteInfo.origin) {
          // eslint-disable-next-line no-param-reassign
          data = await data({ origin: this.bridge.remoteInfo.origin });
        }
        ensureSerializable(data);

        // this.bridge.requestSync({ scope, data });
        if (this.bridge.globalOnMessageEnabled) {
          this.bridge.requestSync({ scope, data });
        }
      }
      if (this.webEmbedBridge) {
        if (isFunction(data) && this.webEmbedBridge.remoteInfo.origin) {
          // eslint-disable-next-line no-param-reassign
          data = await data({ origin: this.webEmbedBridge.remoteInfo.origin });
        }
        ensureSerializable(data);

        // this.bridge.requestSync({ scope, data });
        if (this.webEmbedBridge.globalOnMessageEnabled) {
          this.webEmbedBridge.requestSync({ scope, data });
        }
      }
    }
  };
}
export default BackgroundApiBase;
