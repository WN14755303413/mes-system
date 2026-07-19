import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  type AdapterContext,
  type SyncStats,
  type WorkMessagePayload,
  assertMockAvailable,
  mockLatency,
} from './adapter.types';

/**
 * 钉钉适配器契约（业务方案 §11.1：组织同步 / 工作通知 / 待办提醒）。
 *
 * 免登（扫码/授权码换用户）属于认证流程，二期随真实实现一起接入 auth 模块，
 * 不在本契约内。抽象类同时充当 DI token。
 */
export abstract class DingTalkAdapter {
  abstract readonly mode: 'mock';
  /** 企业内部应用凭据（AGENT_ID / APP_KEY / APP_SECRET）是否已配置 */
  abstract readonly configured: boolean;

  /** 组织架构同步（钉钉 → MES） */
  abstract syncOrg(ctx: AdapterContext): Promise<SyncStats>;
  /** 工作通知（MES → 钉钉），业务事件触发 */
  abstract sendWorkMessage(ctx: AdapterContext, payload: WorkMessagePayload): Promise<SyncStats>;
  /** 待办提醒（MES → 钉钉），业务事件触发 */
  abstract sendTodo(ctx: AdapterContext, payload: WorkMessagePayload): Promise<SyncStats>;
}

/** Mock 实现：把「本应推到钉钉的消息」打进服务端日志，链路与异常池照常工作。 */
export class MockDingTalkAdapter extends DingTalkAdapter {
  readonly mode = 'mock' as const;
  readonly configured: boolean;

  private readonly logger = new Logger('MockDingTalkAdapter');

  constructor(config: ConfigService) {
    super();
    this.configured = Boolean(
      config.get('DINGTALK_AGENT_ID') &&
        config.get('DINGTALK_APP_KEY') &&
        config.get('DINGTALK_APP_SECRET'),
    );
  }

  async syncOrg(ctx: AdapterContext): Promise<SyncStats> {
    await mockLatency();
    assertMockAvailable(ctx, '钉钉组织架构同步');
    this.logger.log('「MOCK」组织架构同步：一期组织/账号在 MES 内维护（M3），未做变更');
    return { mock: true, depts: 0, users: 0, note: '模拟拉取，未落库' };
  }

  async sendWorkMessage(ctx: AdapterContext, payload: WorkMessagePayload): Promise<SyncStats> {
    return this.deliver(ctx, '工作通知', payload);
  }

  async sendTodo(ctx: AdapterContext, payload: WorkMessagePayload): Promise<SyncStats> {
    return this.deliver(ctx, '待办提醒', payload);
  }

  private async deliver(
    ctx: AdapterContext,
    kind: string,
    payload: WorkMessagePayload,
  ): Promise<SyncStats> {
    await mockLatency();
    assertMockAvailable(ctx, `钉钉${kind}`);
    const to = payload.users.map((u) => u.name).join('、');
    this.logger.log(`「MOCK」${kind} → ${to}：【${payload.title}】${payload.content}`);
    return { mock: true, delivered: payload.users.length };
  }
}
