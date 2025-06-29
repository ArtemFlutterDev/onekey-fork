import { SimpleDbEntityBase } from '../base/SimpleDbEntityBase';

export interface ISimpleDBAppStatus {
  hdWalletHashGenerated?: boolean;
  hdWalletXfpGenerated?: boolean;
  launchTimes?: number;
  launchTimesLastReset?: number;
  hdWalletsBackupMigrated?: boolean;
  falconDepositDoNotShowAgain?: boolean;
}

export class SimpleDbEntityAppStatus extends SimpleDbEntityBase<ISimpleDBAppStatus> {
  entityName = 'appStatus';

  override enableCache = true;
}
