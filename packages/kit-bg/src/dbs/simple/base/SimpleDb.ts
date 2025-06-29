import { SimpleDbEntityAccountSelector } from '../entity/SimpleDbEntityAccountSelector';
import { SimpleDbEntityAccountValue } from '../entity/SimpleDbEntityAccountValue';
import { SimpleDbEntityAddressBook } from '../entity/SimpleDbEntityAddressBook';
import { SimpleDbEntityAllNetworks } from '../entity/SimpleDbEntityAllNetworks';
import { SimpleDbEntityAppCleanup } from '../entity/SimpleDbEntityAppCleanup';
import { SimpleDbEntityAppStatus } from '../entity/SimpleDbEntityAppStatus';
import { SimpleDbEntityBabylonSync } from '../entity/SimpleDbEntityBabylonSync';
import { SimpleDbEntityBrowserBookmarks } from '../entity/SimpleDbEntityBrowserBookmarks';
import { SimpleDbEntityBrowserClosedTabs } from '../entity/SimpleDbEntityBrowserClosedTabs';
import { SimpleDbEntityBrowserHistory } from '../entity/SimpleDbEntityBrowserHistory';
import { SimpleDbEntityBrowserRiskWhiteList } from '../entity/SimpleDbEntityBrowserRiskWhiteList';
import { SimpleDbEntityBrowserTabs } from '../entity/SimpleDbEntityBrowserTabs';
import { SimpleDbEntityChangeHistory } from '../entity/SimpleDbEntityChangeHistory';
import { SimpleDbEntityCustomNetwork } from '../entity/SimpleDbEntityCustomNetwork';
import { SimpleDbEntityCustomRpc } from '../entity/SimpleDbEntityCustomRPC';
import { SimpleDbEntityCustomTokens } from '../entity/SimpleDbEntityCustomTokens';
import { SimpleDbEntityDappConnection } from '../entity/SimpleDbEntityDappConnection';
import { SimpleDbEntityDefaultWalletSettings } from '../entity/SimpleDbEntityDefaultWalletSettings';
import { SimpleDbEntityEarn } from '../entity/SimpleDbEntityEarn';
import { SimpleDbEntityEarnOrders } from '../entity/SimpleDbEntityEarnOrders';
import { SimpleDbEntityFeeInfo } from '../entity/SimpleDbEntityFeeInfo';
import { SimpleDbEntityFloatingIconDomainBlockList } from '../entity/SimpleDbEntityFloatingIconDomainBlockList';
import { SimpleDbEntityFloatingIconSettings } from '../entity/SimpleDbEntityFloatingIconSettings';
import { SimpleDbEntityLegacyWalletNames } from '../entity/SimpleDbEntityLegacyWalletNames';
import { SimpleDbEntityLightning } from '../entity/SimpleDbEntityLightning';
import { SimpleDbEntityLocalHistory } from '../entity/SimpleDbEntityLocalHistory';
import { SimpleDbEntityLocalNFTs } from '../entity/SimpleDbEntityLocalNFTs';
import { SimpleDbEntityLocalTokens } from '../entity/SimpleDbEntityLocalTokens';
import { SimpleDbEntityMarketWatchList } from '../entity/SimpleDbEntityMarketWatchList';
import { SimpleDbEntityNetworkSelector } from '../entity/SimpleDbEntityNetworkSelector';
import { SimpleDbEntityNotificationSettings } from '../entity/SimpleDbEntityNotificationSettings';
import { SimpleDbEntityPrime } from '../entity/SimpleDbEntityPrime';
import { SimpleDbEntityRecentNetworks } from '../entity/SimpleDbEntityRecentNetworks';
import { SimpleDbEntityReferralCode } from '../entity/SimpleDbEntityReferralCode';
import { SimpleDbEntityRiskyTokens } from '../entity/SimpleDbEntityRiskyTokens';
import { SimpleDbEntityServerNetwork } from '../entity/SimpleDbEntityServerNetwork';
import { SimpleDbEntitySwapConfigs } from '../entity/SimpleDbEntitySwapConfigs';
import { SimpleDbEntitySwapHistory } from '../entity/SimpleDbEntitySwapHistory';
import { SimpleDbEntitySwapNetworksSort } from '../entity/SimpleDbEntitySwapNetworksSort';
import { SimpleDbEntityUniversalSearch } from '../entity/SimpleDbEntityUniversalSearch';
import { SimpleDbEntityV4MigrationResult } from '../entity/SimpleDbEntityV4MigrationResult';

export class SimpleDb {
  prime = new SimpleDbEntityPrime();

  referralCode = new SimpleDbEntityReferralCode();

  browserTabs = new SimpleDbEntityBrowserTabs();

  browserBookmarks = new SimpleDbEntityBrowserBookmarks();

  browserClosedTabs = new SimpleDbEntityBrowserClosedTabs();

  browserRiskWhiteList = new SimpleDbEntityBrowserRiskWhiteList();

  dappConnection = new SimpleDbEntityDappConnection();

  browserHistory = new SimpleDbEntityBrowserHistory();

  accountSelector = new SimpleDbEntityAccountSelector();

  appCleanup = new SimpleDbEntityAppCleanup();

  swapNetworksSort = new SimpleDbEntitySwapNetworksSort();

  swapHistory = new SimpleDbEntitySwapHistory();

  swapConfigs = new SimpleDbEntitySwapConfigs();

  localTokens = new SimpleDbEntityLocalTokens();

  addressBook = new SimpleDbEntityAddressBook();

  localHistory = new SimpleDbEntityLocalHistory();

  riskyTokens = new SimpleDbEntityRiskyTokens();

  defaultWalletSettings = new SimpleDbEntityDefaultWalletSettings();

  networkSelector = new SimpleDbEntityNetworkSelector();

  notificationSettings = new SimpleDbEntityNotificationSettings();

  lightning = new SimpleDbEntityLightning();

  feeInfo = new SimpleDbEntityFeeInfo();

  marketWatchList = new SimpleDbEntityMarketWatchList();

  floatingIconDomainBlockList = new SimpleDbEntityFloatingIconDomainBlockList();

  floatingIconSettings = new SimpleDbEntityFloatingIconSettings();

  earn = new SimpleDbEntityEarn();

  earnOrders = new SimpleDbEntityEarnOrders();

  universalSearch = new SimpleDbEntityUniversalSearch();

  customTokens = new SimpleDbEntityCustomTokens();

  customRpc = new SimpleDbEntityCustomRpc();

  customNetwork = new SimpleDbEntityCustomNetwork();

  serverNetwork = new SimpleDbEntityServerNetwork();

  v4MigrationResult = new SimpleDbEntityV4MigrationResult();

  accountValue = new SimpleDbEntityAccountValue();

  legacyWalletNames = new SimpleDbEntityLegacyWalletNames();

  localNFTs = new SimpleDbEntityLocalNFTs();

  babylonSync = new SimpleDbEntityBabylonSync();

  appStatus = new SimpleDbEntityAppStatus();

  allNetworks = new SimpleDbEntityAllNetworks();

  changeHistory = new SimpleDbEntityChangeHistory();

  recentNetworks = new SimpleDbEntityRecentNetworks();
}
