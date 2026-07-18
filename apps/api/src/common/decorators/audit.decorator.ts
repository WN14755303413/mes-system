import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit:meta';

export interface AuditMeta {
  /** 动作标识，形如 `user.create` / `role.update`。与 auth 模块手写的 `auth.login` 同一命名空间。 */
  action: string;
  /** 目标对象类型，如 `user` / `role` / `dept`。用于审计查询按对象归类。 */
  targetType?: string;
  /**
   * 从何处取目标对象 id。
   * - `'param:id'`（默认）：取路由参数 req.params.id
   * - `'result'`：取 handler 返回值的 .id 字段（新建时 id 是后端生成的，只能从结果拿）
   */
  targetIdFrom?: `param:${string}` | 'result';
}

/**
 * 标记一个写操作需要落审计日志。由全局 AuditInterceptor 消费。
 *
 * 只加在「写」handler 上。读接口不记审计，否则日志会被查询淹没。
 */
export const Audit = (
  action: string,
  options: Omit<AuditMeta, 'action'> = {},
) => SetMetadata(AUDIT_KEY, { action, targetIdFrom: 'param:id', ...options } satisfies AuditMeta);
