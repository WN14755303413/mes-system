/**
 * 集成适配器公共类型。
 *
 * 一期只有 mock 实现（M11「集成预留」）：契约在此固化，二期对接真实
 * 用友 ERP / 钉钉时新增实现类并在 integration.module 的工厂里切换，
 * 执行器、异常池、业务挂点全部不动。
 */

/** 一次同步/推送动作的结果摘要，原样落 sys_integration_log.response_summary */
export interface SyncStats {
  [key: string]: unknown;
}

/** 适配器调用上下文 */
export interface AdapterContext {
  /** 第几次尝试：0 = 首次，≥1 = 异常池重试 */
  attempt: number;
  /** 演示开关：首次调用抛错进异常池，重试即成功，用于验证补偿闭环 */
  simulateFail: boolean;
}

/** 钉钉通知的接收人。名字在挂点处解析好，payload 自包含才能独立重放。 */
export interface NotifyTarget {
  id: string;
  name: string;
}

export interface WorkMessagePayload {
  users: NotifyTarget[];
  title: string;
  content: string;
  /** 点开通知跳转的 MES 页面路径，如 /production/report */
  link?: string;
}

/** mock 实现共用：simulateFail 只挂掉首次调用，保证「失败→重试→成功」可演示 */
export function assertMockAvailable(ctx: AdapterContext, what: string): void {
  if (ctx.simulateFail && ctx.attempt === 0) {
    throw new Error(`（模拟失败）${what}：外部系统无响应，请稍后重试`);
  }
}

/** mock 实现共用：模拟一次外部调用的网络延迟 */
export function mockLatency(): Promise<void> {
  return new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
}
