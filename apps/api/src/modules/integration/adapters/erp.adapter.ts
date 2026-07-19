import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  type AdapterContext,
  type SyncStats,
  assertMockAvailable,
  mockLatency,
} from './adapter.types';

/**
 * 用友 ERP 适配器契约（业务方案 §11.1 一期必须的五个拉取 + 两个建议的推送）。
 *
 * 抽象类同时充当 DI token。方法与「接口清单」逐条对应，
 * 二期真实对接只需实现本契约（如 U8ErpAdapter），不改调用方。
 */
export abstract class ErpAdapter {
  /** 当前实现模式，状态页展示用 */
  abstract readonly mode: 'mock';
  /** 真实凭据（ERP_API_BASE_URL / ERP_API_TOKEN）是否已配置 */
  abstract readonly configured: boolean;

  /** 物料主数据同步（ERP → MES） */
  abstract pullMaterials(ctx: AdapterContext): Promise<SyncStats>;
  /** 客户/供应商同步（ERP → MES） */
  abstract pullPartners(ctx: AdapterContext): Promise<SyncStats>;
  /** 销售订单/项目同步（ERP → MES） */
  abstract pullSalesOrders(ctx: AdapterContext): Promise<SyncStats>;
  /** 采购订单同步（ERP → MES） */
  abstract pullPurchaseOrders(ctx: AdapterContext): Promise<SyncStats>;
  /** 到货/入库/库存同步（ERP → MES） */
  abstract pullInventory(ctx: AdapterContext): Promise<SyncStats>;
  /** 项目制造进度反馈（MES → ERP，二期挂接业务事件） */
  abstract pushProjectProgress(ctx: AdapterContext, payload: unknown): Promise<SyncStats>;
  /** 质量问题反馈（MES → ERP，二期挂接业务事件） */
  abstract pushQualityIssue(ctx: AdapterContext, payload: unknown): Promise<SyncStats>;
}

/**
 * Mock 实现：模拟调用链路（延迟、失败、结果摘要），**不读写任何业务表**。
 * 一期物料/供应数据的真实入口是 M6 的 Excel 导入；mock 若伪造落库反而污染主数据。
 */
export class MockErpAdapter extends ErpAdapter {
  readonly mode = 'mock' as const;
  readonly configured: boolean;

  private readonly logger = new Logger('MockErpAdapter');

  constructor(config: ConfigService) {
    super();
    this.configured = Boolean(config.get('ERP_API_BASE_URL') && config.get('ERP_API_TOKEN'));
  }

  private async simulate(ctx: AdapterContext, what: string, stats: SyncStats): Promise<SyncStats> {
    await mockLatency();
    assertMockAvailable(ctx, what);
    this.logger.log(`「MOCK」${what} → ${JSON.stringify(stats)}`);
    return { mock: true, ...stats };
  }

  pullMaterials(ctx: AdapterContext): Promise<SyncStats> {
    return this.simulate(ctx, 'ERP 物料主数据同步', { fetched: 0, upserted: 0, note: '模拟拉取，未落库' });
  }

  pullPartners(ctx: AdapterContext): Promise<SyncStats> {
    return this.simulate(ctx, 'ERP 客户/供应商同步', { fetched: 0, upserted: 0, note: '模拟拉取，未落库' });
  }

  pullSalesOrders(ctx: AdapterContext): Promise<SyncStats> {
    return this.simulate(ctx, 'ERP 销售订单/项目同步', { fetched: 0, upserted: 0, note: '模拟拉取，未落库' });
  }

  pullPurchaseOrders(ctx: AdapterContext): Promise<SyncStats> {
    return this.simulate(ctx, 'ERP 采购订单同步', { fetched: 0, upserted: 0, note: '模拟拉取，未落库' });
  }

  pullInventory(ctx: AdapterContext): Promise<SyncStats> {
    return this.simulate(ctx, 'ERP 到货/入库/库存同步', { fetched: 0, upserted: 0, note: '模拟拉取，未落库' });
  }

  pushProjectProgress(ctx: AdapterContext, payload: unknown): Promise<SyncStats> {
    return this.simulate(ctx, 'MES 项目进度反馈', { pushed: payload ? 1 : 0 });
  }

  pushQualityIssue(ctx: AdapterContext, payload: unknown): Promise<SyncStats> {
    return this.simulate(ctx, 'MES 质量问题反馈', { pushed: payload ? 1 : 0 });
  }
}
