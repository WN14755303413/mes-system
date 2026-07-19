import type { IntegrationAdapterKey } from '@mes/shared';
import type { AdapterContext, SyncStats, WorkMessagePayload } from './adapters/adapter.types';
import type { DingTalkAdapter } from './adapters/dingtalk.adapter';
import type { ErpAdapter } from './adapters/erp.adapter';

/**
 * 集成动作注册表——action 字符串是持久化契约。
 *
 * 每条 sys_integration_log 记录 action + payload，异常池重试按 action
 * 在此路由回适配器重放。因此 action 一旦上线**只能新增不能改名**，
 * 改名会让历史失败记录无法重试。
 */

export interface AdapterSet {
  erp: ErpAdapter;
  dingtalk: DingTalkAdapter;
}

export interface ActionDef {
  /** 展示名，落库到 interfaceName */
  name: string;
  adapter: IntegrationAdapterKey;
  sourceSystem: string;
  targetSystem: string;
  /** manual：状态页可手动触发；business：业务事件触发（或二期挂接），不开放手动 */
  trigger: 'manual' | 'business';
  run: (adapters: AdapterSet, ctx: AdapterContext, payload: unknown) => Promise<SyncStats>;
}

export const ACTION_DEFS: Record<string, ActionDef> = {
  'erp.pullMaterials': {
    name: 'ERP 物料主数据同步',
    adapter: 'erp',
    sourceSystem: 'ERP',
    targetSystem: 'MES',
    trigger: 'manual',
    run: (a, ctx) => a.erp.pullMaterials(ctx),
  },
  'erp.pullPartners': {
    name: 'ERP 客户/供应商同步',
    adapter: 'erp',
    sourceSystem: 'ERP',
    targetSystem: 'MES',
    trigger: 'manual',
    run: (a, ctx) => a.erp.pullPartners(ctx),
  },
  'erp.pullSalesOrders': {
    name: 'ERP 销售订单/项目同步',
    adapter: 'erp',
    sourceSystem: 'ERP',
    targetSystem: 'MES',
    trigger: 'manual',
    run: (a, ctx) => a.erp.pullSalesOrders(ctx),
  },
  'erp.pullPurchaseOrders': {
    name: 'ERP 采购订单同步',
    adapter: 'erp',
    sourceSystem: 'ERP',
    targetSystem: 'MES',
    trigger: 'manual',
    run: (a, ctx) => a.erp.pullPurchaseOrders(ctx),
  },
  'erp.pullInventory': {
    name: 'ERP 到货/入库/库存同步',
    adapter: 'erp',
    sourceSystem: 'ERP',
    targetSystem: 'MES',
    trigger: 'manual',
    run: (a, ctx) => a.erp.pullInventory(ctx),
  },
  'erp.pushProjectProgress': {
    name: 'MES 项目进度反馈',
    adapter: 'erp',
    sourceSystem: 'MES',
    targetSystem: 'ERP',
    trigger: 'business',
    run: (a, ctx, payload) => a.erp.pushProjectProgress(ctx, payload),
  },
  'erp.pushQualityIssue': {
    name: 'MES 质量问题反馈',
    adapter: 'erp',
    sourceSystem: 'MES',
    targetSystem: 'ERP',
    trigger: 'business',
    run: (a, ctx, payload) => a.erp.pushQualityIssue(ctx, payload),
  },
  'dingtalk.syncOrg': {
    name: '钉钉组织架构同步',
    adapter: 'dingtalk',
    sourceSystem: 'DINGTALK',
    targetSystem: 'MES',
    trigger: 'manual',
    run: (a, ctx) => a.dingtalk.syncOrg(ctx),
  },
  'dingtalk.sendWorkMessage': {
    name: '钉钉工作通知',
    adapter: 'dingtalk',
    sourceSystem: 'MES',
    targetSystem: 'DINGTALK',
    trigger: 'business',
    run: (a, ctx, payload) => a.dingtalk.sendWorkMessage(ctx, payload as WorkMessagePayload),
  },
  'dingtalk.sendTodo': {
    name: '钉钉待办提醒',
    adapter: 'dingtalk',
    sourceSystem: 'MES',
    targetSystem: 'DINGTALK',
    trigger: 'business',
    run: (a, ctx, payload) => a.dingtalk.sendTodo(ctx, payload as WorkMessagePayload),
  },
};
