import {
  backgroundClass,
  backgroundMethod,
} from '@onekeyhq/shared/src/background/backgroundDecorators';
import type {
  IHardwareSalesRecord,
  IInviteHistory,
  IInvitePostConfig,
  IInviteSummary,
} from '@onekeyhq/shared/src/referralCode/type';
import { EServiceEndpointEnum } from '@onekeyhq/shared/types/endpoint';

import ServiceBase from './ServiceBase';

@backgroundClass()
class ServiceReferralCode extends ServiceBase {
  constructor({ backgroundApi }: { backgroundApi: any }) {
    super({ backgroundApi });
  }

  @backgroundMethod()
  async getSummaryInfo() {
    const client = await this.getOneKeyIdClient(EServiceEndpointEnum.Rebate);
    const summary = await client.get<{
      data: IInviteSummary;
    }>('/rebate/v1/invite/summary');
    return summary.data.data;
  }

  @backgroundMethod()
  async getInviteCode() {
    const inviteCode =
      await this.backgroundApi.simpleDb.referralCode.getInviteCode();
    return inviteCode;
  }

  @backgroundMethod()
  async bindAddress(params: {
    networkId: string;
    address: string;
    emailOTP: string;
  }) {
    const client = await this.getOneKeyIdClient(EServiceEndpointEnum.Rebate);
    return client.post('/rebate/v1/address', params);
  }

  @backgroundMethod()
  async getHardwareSalesRewardHistory(cursor?: string) {
    const client = await this.getOneKeyIdClient(EServiceEndpointEnum.Rebate);
    const params: {
      subject: string;
      limit: number;
      cursor?: string;
    } = {
      subject: 'HardwareSales',
      limit: 100,
    };
    if (cursor) {
      params.cursor = cursor;
    }
    const response = await client.get<{
      data: IInviteHistory;
    }>('/rebate/v1/invite/history', { params });
    return response.data.data;
  }

  @backgroundMethod()
  async getEarnRewardHistory(cursor?: string) {
    const client = await this.getOneKeyIdClient(EServiceEndpointEnum.Rebate);
    const params: {
      subject: string;
      limit: number;
      cursor?: string;
    } = {
      subject: 'Earn',
      limit: 100,
    };
    if (cursor) {
      params.cursor = cursor;
    }
    const response = await client.get<{
      data: IInviteHistory;
    }>('/rebate/v1/invite/history', { params });
    return response.data.data;
  }

  @backgroundMethod()
  async getHardwareSales(cursor?: string) {
    const client = await this.getOneKeyIdClient(EServiceEndpointEnum.Rebate);
    const params: {
      subject: string;
      cursor?: string;
    } = {
      subject: 'HardwareSales',
    };
    if (cursor) {
      params.cursor = cursor;
    }
    const response = await client.get<{
      data: IHardwareSalesRecord;
    }>('/rebate/v1/invite/records', { params });
    return response.data.data;
  }

  @backgroundMethod()
  async getEarnReward(cursor?: string) {
    const client = await this.getOneKeyIdClient(EServiceEndpointEnum.Rebate);
    const params: {
      subject: string;
      cursor?: string;
    } = {
      subject: 'Earn',
    };
    if (cursor) {
      params.cursor = cursor;
    }
    const response = await client.get<{
      data: IHardwareSalesRecord;
    }>('/rebate/v1/invite/records', { params });
    return response.data.data;
  }

  @backgroundMethod()
  async getMyReferralCode() {
    const myReferralCode =
      await this.backgroundApi.simpleDb.referralCode.getMyReferralCode();
    return myReferralCode;
  }

  @backgroundMethod()
  async isBindInviteCode() {
    const inviteCode =
      await this.backgroundApi.simpleDb.referralCode.getInviteCode();
    return inviteCode !== '';
  }

  @backgroundMethod()
  async bindInviteCode(code: string) {
    const valid = await this.backgroundApi.serviceStaking.checkInviteCode(code);
    if (valid) {
      await this.backgroundApi.simpleDb.referralCode.updateCode({
        inviteCode: code,
      });
    }
    return valid;
  }

  @backgroundMethod()
  async updateMyReferralCode(code: string) {
    await this.backgroundApi.simpleDb.referralCode.updateCode({
      myReferralCode: code,
    });
  }

  @backgroundMethod()
  async reset() {
    await this.backgroundApi.simpleDb.referralCode.reset();
  }

  @backgroundMethod()
  async fetchPostConfig() {
    const client = await this.getClient(EServiceEndpointEnum.Rebate);
    const response = await client.get<{
      data: IInvitePostConfig;
    }>('/rebate/v1/invite/post-config');
    const postConfig = response.data.data;
    await this.backgroundApi.simpleDb.referralCode.updatePostConfig(postConfig);
    return postConfig;
  }

  @backgroundMethod()
  async getPostConfig() {
    const postConfig =
      await this.backgroundApi.simpleDb.referralCode.getPostConfig();
    return postConfig;
  }
}

export default ServiceReferralCode;
