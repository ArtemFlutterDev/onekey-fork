import { IInjectedProviderNames } from '@onekeyfe/cross-inpage-provider-types';

import ProviderApiAlgo from './ProviderApiAlgo';
import ProviderApiAlph from './ProviderApiAlph';
import ProviderApiAptos from './ProviderApiAptos';
import ProviderApiBfc from './ProviderApiBfc';
import ProviderApiBtc from './ProviderApiBtc';
import ProviderApiCardano from './ProviderApiCardano';
import ProviderApiConflux from './ProviderApiConflux';
import ProviderApiCosmos from './ProviderApiCosmos';
import ProviderApiEthereum from './ProviderApiEthereum';
import ProviderApiNear from './ProviderApiNear';
import ProviderApiNeoN3 from './ProviderApiNeoN3';
import ProviderApiNostr from './ProviderApiNostr';
import ProviderApiPolkadot from './ProviderApiPolkadot';
import ProviderApiPrivate from './ProviderApiPrivate';
import ProviderApiScdo from './ProviderApiScdo';
import ProviderApiSolana from './ProviderApiSolana';
import ProviderApiSui from './ProviderApiSui';
import ProviderApiTon from './ProviderApiTon';
import ProviderApiTron from './ProviderApiTron';
import ProviderApiWebln from './ProviderApiWebln';

import type ProviderApiBase from './ProviderApiBase';
import type {
  IBackgroundApi,
  IBackgroundApiBridge,
} from '../apis/IBackgroundApi';

function createBackgroundProviders({
  backgroundApi,
}: {
  backgroundApi: IBackgroundApiBridge | IBackgroundApi;
}) {
  const backgroundProviders: Record<string, ProviderApiBase> = {
    [IInjectedProviderNames.$private]: new ProviderApiPrivate({
      backgroundApi,
    }),
    [IInjectedProviderNames.ethereum]: new ProviderApiEthereum({
      backgroundApi,
    }),
    [IInjectedProviderNames.solana]: new ProviderApiSolana({
      backgroundApi,
    }),
    // [IInjectedProviderNames.starcoin]: new ProviderApiStarcoin({
    //   backgroundApi,
    // }),
    [IInjectedProviderNames.near]: new ProviderApiNear({
      backgroundApi,
    }),
    [IInjectedProviderNames.aptos]: new ProviderApiAptos({
      backgroundApi,
    }),
    [IInjectedProviderNames.conflux]: new ProviderApiConflux({
      backgroundApi,
    }),
    [IInjectedProviderNames.tron]: new ProviderApiTron({
      backgroundApi,
    }),
    [IInjectedProviderNames.algo]: new ProviderApiAlgo({
      backgroundApi,
    }),
    [IInjectedProviderNames.sui]: new ProviderApiSui({
      backgroundApi,
    }),
    [IInjectedProviderNames.bfc]: new ProviderApiBfc({
      backgroundApi,
    }),
    [IInjectedProviderNames.ton]: new ProviderApiTon({
      backgroundApi,
    }),
    [IInjectedProviderNames.alephium]: new ProviderApiAlph({
      backgroundApi,
    }),
    [IInjectedProviderNames.scdo]: new ProviderApiScdo({
      backgroundApi,
    }),
    [IInjectedProviderNames.cardano]: new ProviderApiCardano({
      backgroundApi,
    }),
    [IInjectedProviderNames.cosmos]: new ProviderApiCosmos({
      backgroundApi,
    }),
    [IInjectedProviderNames.polkadot]: new ProviderApiPolkadot({
      backgroundApi,
    }),
    [IInjectedProviderNames.webln]: new ProviderApiWebln({ backgroundApi }),
    [IInjectedProviderNames.nostr]: new ProviderApiNostr({ backgroundApi }),
    [IInjectedProviderNames.btc]: new ProviderApiBtc({
      backgroundApi,
    }),
    [IInjectedProviderNames.neo]: new ProviderApiNeoN3({
      backgroundApi,
    }),
    // eslint-disable-next-line spellcheck/spell-checker
    // sollet
  };
  return backgroundProviders;
}

export { createBackgroundProviders };
