import { getSdkError } from '@walletconnect/utils';

import { backgroundMethod } from '@onekeyhq/shared/src/background/backgroundDecorators';
import { IMPL_ALGO, IMPL_EVM } from '@onekeyhq/shared/src/engine/engineConsts';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import { appLocale } from '@onekeyhq/shared/src/locale/appLocale';
import { defaultLogger } from '@onekeyhq/shared/src/logger/logger';
import {
  EDAppConnectionModal,
  EModalRoutes,
} from '@onekeyhq/shared/src/routes';
import uriUtils from '@onekeyhq/shared/src/utils/uriUtils';
import { EWalletConnectSessionEvents } from '@onekeyhq/shared/src/walletConnect/types';
import type { IWalletConnectSessionProposalResult } from '@onekeyhq/shared/types/dappConnection';

import walletConnectClient from '../../services/ServiceWalletConnect/walletConnectClient';
import walletConnectStorage from '../../services/ServiceWalletConnect/walletConnectStorage';

import { WalletConnectRequestProxyAlgo } from './WalletConnectRequestProxyAlgo';
import { WalletConnectRequestProxyEth } from './WalletConnectRequestProxyEth';

import type {
  IWalletConnectRequestOptions,
  WalletConnectRequestProxy,
} from './WalletConnectRequestProxy';
import type { IBackgroundApi } from '../../apis/IBackgroundApi';
import type { IWeb3Wallet, Web3WalletTypes } from '@walletconnect/web3wallet';

class ProviderApiWalletConnect {
  constructor({ backgroundApi }: { backgroundApi: any }) {
    this.backgroundApi = backgroundApi;
  }

  backgroundApi: IBackgroundApi;

  web3Wallet?: IWeb3Wallet;

  requestProxyMap: {
    [networkImpl: string]: WalletConnectRequestProxy;
  } = {
    [IMPL_EVM]: new WalletConnectRequestProxyEth({
      client: this,
    }),
    [IMPL_ALGO]: new WalletConnectRequestProxyAlgo({
      client: this,
    }),
  };

  getRequestProxy({ networkImpl }: { networkImpl: string }) {
    return this.requestProxyMap[networkImpl];
  }

  async initializeOnStart() {
    const sessions = await walletConnectStorage.walletSideStorage.getSessions();
    if (sessions?.length) {
      await this.initialize();
    }
  }

  @backgroundMethod()
  async initialize() {
    if (this.web3Wallet) {
      return;
    }
    this.web3Wallet = await walletConnectClient.getWalletSideClient();
    this.registerEvents();
  }

  registerEvents() {
    if (!this.web3Wallet) {
      throw new Error('web3Wallet is not initialized');
    }
    this.web3Wallet.on(
      EWalletConnectSessionEvents.session_proposal,
      this.onSessionProposal,
    );
    this.web3Wallet.on(
      EWalletConnectSessionEvents.session_request,
      this.onSessionRequest,
    );
    this.web3Wallet.on(
      EWalletConnectSessionEvents.session_delete,
      this.onSessionDelete,
    );
    this.web3Wallet.engine.signClient.events.on(
      EWalletConnectSessionEvents.session_ping,
      this.onSessionPing,
    );
    this.web3Wallet.on(
      EWalletConnectSessionEvents.auth_request,
      this.onAuthRequest,
    );
  }

  unregisterEvents() {
    if (!this.web3Wallet) {
      throw new Error('web3Wallet is not initialized');
    }
    this.web3Wallet.off(
      EWalletConnectSessionEvents.session_proposal,
      this.onSessionProposal,
    );
    this.web3Wallet.off(
      EWalletConnectSessionEvents.session_request,
      this.onSessionRequest,
    );
    this.web3Wallet.off(
      EWalletConnectSessionEvents.session_delete,
      this.onSessionDelete,
    );
    this.web3Wallet.engine.signClient.events.off(
      EWalletConnectSessionEvents.session_ping,
      this.onSessionPing,
    );
    this.web3Wallet.off(
      EWalletConnectSessionEvents.auth_request,
      this.onAuthRequest,
    );
  }

  onSessionProposal = async (proposal: Web3WalletTypes.SessionProposal) => {
    const { serviceWalletConnect, serviceDApp } = this.backgroundApi;
    console.log('onSessionProposal: ', JSON.stringify(proposal));
    const optionalNamespaces = proposal?.params?.optionalNamespaces;
    const optionalNamespacesString = Object.keys(optionalNamespaces).join(', ');
    // check if all required networks are supported
    const notSupportedChains = await serviceWalletConnect.getNotSupportedChains(
      // proposal,
      proposal?.params?.requiredNamespaces,
    );
    const origin = uriUtils.safeGetWalletConnectOrigin(proposal);
    const metadata = proposal.params.proposer.metadata;
    if (notSupportedChains.length > 0) {
      console.error(
        'ProviderApiWalletConnect ERROR: onSessionProposal notSupportedChains',
        notSupportedChains,
      );
      await this.web3Wallet?.rejectSession({
        id: proposal.id,
        reason: getSdkError('UNSUPPORTED_CHAINS'),
      });
      void this.backgroundApi.serviceApp.showToast({
        method: 'error',
        title: `ChainId: ${notSupportedChains[0]}`,
        message: 'Unsupported yet',
      });
      defaultLogger.discovery.dapp.dappUse({
        dappName: metadata.name,
        dappDomain: metadata.url,
        action: 'ConnectWallet',
        network: optionalNamespacesString,
        failReason: `Unsupported ChainId: ${notSupportedChains[0]}`,
      });
      return;
    }

    try {
      if (!origin) {
        const message = appLocale.intl.formatMessage({
          id: ETranslations.browser_invalid_url,
        });
        await this.web3Wallet?.rejectSession({
          id: proposal.id,
          reason: {
            message,
            code: 40_001,
          },
        });
        void this.backgroundApi.serviceApp.showToast({
          method: 'error',
          title: message,
        });
        defaultLogger.discovery.dapp.dappUse({
          dappName: metadata.name,
          dappDomain: metadata.url,
          action: 'ConnectWallet',
          network: optionalNamespacesString,
          failReason: message,
        });
        return;
      }

      const result = (await serviceDApp.openModal({
        request: {
          scope: '$walletConnect',
          origin,
        },
        screens: [
          EModalRoutes.DAppConnectionModal,
          EDAppConnectionModal.WalletConnectSessionProposalModal,
        ],
        params: {
          proposal,
        },
        fullScreen: true,
      })) as IWalletConnectSessionProposalResult;
      const newSession = await this.web3Wallet?.approveSession({
        id: proposal.id,
        namespaces: result.supportedNamespaces,
      });
      await serviceDApp.saveConnectionSession({
        origin,
        accountsInfo: result.accountsInfo,
        storageType: 'walletConnect',
        walletConnectTopic: newSession?.topic,
      });
      void serviceWalletConnect.batchEmitNetworkChangedEvent({
        topic: newSession?.topic ?? '',
        accountsInfo: result.accountsInfo,
      });
      defaultLogger.discovery.dapp.dappUse({
        dappName: metadata.name,
        dappDomain: metadata.url,
        action: 'ConnectWallet',
        network: optionalNamespacesString,
      });
    } catch (e) {
      console.error('onSessionProposal error: ', e);
      await this.web3Wallet?.rejectSession({
        id: proposal.id,
        reason: getSdkError('USER_REJECTED'),
      });
      defaultLogger.discovery.dapp.dappUse({
        dappName: metadata.name,
        dappDomain: metadata.url,
        action: 'ConnectWallet',
        network: optionalNamespacesString,
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        failReason: `${e?.message ?? e}`,
      });
    }
  };

  onSessionRequest = async (request: Web3WalletTypes.SessionRequest) => {
    console.log('onSessionRequest: ', request);
    const { topic, id } = request;
    const { serviceWalletConnect } = this.backgroundApi;

    // check request method is supported
    const chain = await serviceWalletConnect.getWcChainInfo(
      request.params.chainId,
    );
    if (!chain) {
      await this.web3Wallet?.respondSessionRequest({
        topic,
        response: {
          id,
          jsonrpc: '2.0',
          error: getSdkError('UNSUPPORTED_CHAINS'),
        },
      });
      void this.backgroundApi.serviceApp.showToast({
        method: 'error',
        title: `ChainId: ${request.params.chainId}`,
        message: 'Unsupported yet',
      });
      return;
    }

    if (
      !(await serviceWalletConnect.checkMethodSupport(
        chain.wcNamespace,
        request.params.request.method,
      ))
    ) {
      await this.web3Wallet?.respondSessionRequest({
        topic,
        response: {
          id,
          jsonrpc: '2.0',
          error: getSdkError('UNSUPPORTED_METHODS'),
        },
      });
      return;
    }

    try {
      const networkImpl = await serviceWalletConnect.getNetworkImplByNamespace(
        chain.wcNamespace,
      );
      const requestProxy = this.getRequestProxy({ networkImpl });

      // If the requested chainId does not match the one stored locally, switch the network.
      await this.switchNetwork({
        request,
        requestProxy,
      });
      const ret = await requestProxy.request(
        { sessionRequest: request },
        request.params.request,
      );
      console.log('====>onSessionRequest ret: ', ret);

      await this.web3Wallet?.respondSessionRequest({
        topic,
        response: {
          id,
          jsonrpc: '2.0',
          result: ret,
        },
      });
    } catch (error: any) {
      await this.web3Wallet?.respondSessionRequest({
        topic,
        response: {
          id,
          jsonrpc: '2.0',
          error: getSdkError('USER_REJECTED', (error as Error)?.message),
        },
      });
    }
  };

  onSessionDelete = (args: Web3WalletTypes.SessionDelete) => {
    console.log('onSessionDelete: ', args);
    console.log(this.web3Wallet?.getActiveSessions());
    void this.backgroundApi.serviceWalletConnect.handleSessionDelete(
      args.topic,
    );
  };

  onAuthRequest = (args: Web3WalletTypes.AuthRequest) => {
    console.log('onAuthRequest: ', args);
  };

  onSessionPing = () => {
    console.log('ping');
  };

  @backgroundMethod()
  async switchNetwork({
    request,
    requestProxy,
  }: {
    request: Web3WalletTypes.SessionRequest;
    requestProxy: WalletConnectRequestProxy;
  }) {
    const { topic, id } = request;
    const origin = this.getDAppOrigin({ sessionRequest: request });
    // Find connected account
    const accountsInfo =
      await this.backgroundApi.serviceDApp.getConnectedAccounts({
        origin,
        scope: requestProxy.providerName,
        isWalletConnectRequest: true,
      });
    const chainInfo =
      await this.backgroundApi.serviceWalletConnect.getWcChainInfo(
        request.params.chainId,
      );
    if (!accountsInfo?.[0].accountInfo.networkId || !chainInfo?.networkId) {
      await this.web3Wallet?.respondSessionRequest({
        topic,
        response: {
          id,
          jsonrpc: '2.0',
          error: getSdkError('USER_REJECTED', 'No connected account'),
        },
      });
      return;
    }
    if (accountsInfo[0].accountInfo.networkId === chainInfo.networkId) {
      return;
    }
    await this.backgroundApi.serviceDApp.switchConnectedNetwork({
      newNetworkId: chainInfo.networkId,
      oldNetworkId: accountsInfo[0].accountInfo.networkId,
      origin,
      scope: requestProxy.providerName,
      isWalletConnectRequest: true,
    });
  }

  @backgroundMethod()
  async connectToDapp(uri: string) {
    await this.initialize();
    await this.web3Wallet?.pair({ uri });
  }

  getDAppOrigin(option: IWalletConnectRequestOptions) {
    const originUrl =
      option.sessionRequest?.verifyContext.verified.origin ?? '';
    try {
      return new URL(originUrl).origin;
    } catch (error) {
      return originUrl;
    }
  }
}

export default ProviderApiWalletConnect;
