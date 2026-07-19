import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  IntegrationAdapterKey,
  IntegrationRunResult,
  IntegrationStatusResponse,
} from '@mes/shared';
import { ErrorCode } from '@mes/shared';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AdapterContext, WorkMessagePayload } from '../adapters/adapter.types';
import { DingTalkAdapter } from '../adapters/dingtalk.adapter';
import { ErpAdapter } from '../adapters/erp.adapter';
import { ACTION_DEFS, type ActionDef, type AdapterSet } from '../integration-actions';

/**
 * 集成执行器：所有对外调用的唯一入口。
 *
 * 每次调用（无论成败）都落一条 sys_integration_log；失败记录
 * needsAttention=true 即进入异常池，可按 action+payload 原样重放（M11 验收标准）。
 */
@Injectable()
export class IntegrationService {
  private readonly logger = new Logger('Integration');
  private readonly adapters: AdapterSet;

  constructor(
    private readonly prisma: PrismaService,
    erp: ErpAdapter,
    dingtalk: DingTalkAdapter,
  ) {
    this.adapters = { erp, dingtalk };
  }

  /**
   * 执行一个集成动作并落日志。**不抛业务异常**——失败也是一种要记录的结果，
   * 调用方（通知挂点/手动同步）拿返回值决定后续，不因外部系统故障中断主流程。
   */
  async execute(
    action: string,
    payload: Record<string, unknown> | null,
    triggeredBy: string,
  ): Promise<IntegrationRunResult> {
    const def = this.defOrThrow(action);
    const ctx: AdapterContext = { attempt: 0, simulateFail: payload?.simulateFail === true };

    let summary: Record<string, unknown> | null = null;
    let errorMsg: string | null = null;
    try {
      summary = await def.run(this.adapters, ctx, payload);
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    const log = await this.prisma.integrationLog.create({
      data: {
        interfaceName: def.name,
        sourceSystem: def.sourceSystem,
        targetSystem: def.targetSystem,
        action,
        payload: (payload ?? undefined) as Prisma.InputJsonValue | undefined,
        requestSummary: this.summarize(action, payload) as Prisma.InputJsonValue | undefined,
        responseSummary: (summary ?? undefined) as Prisma.InputJsonValue | undefined,
        success: !errorMsg,
        errorMsg,
        needsAttention: Boolean(errorMsg),
        triggeredBy,
      },
      select: { id: true },
    });

    if (errorMsg) {
      this.logger.warn(`${action} 失败，已进异常池（${log.id}）：${errorMsg}`);
    }
    return { logId: log.id, success: !errorMsg, errorMsg, summary };
  }

  /** 手动触发入口：业务触发型动作没有独立成立的入参，不开放手动执行。 */
  async executeManual(
    action: string,
    payload: Record<string, unknown> | null,
    userId: string,
  ): Promise<IntegrationRunResult> {
    const def = this.defOrThrow(action);
    if (def.trigger !== 'manual') {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `「${def.name}」由业务事件触发，不支持手动执行`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.execute(action, payload, userId);
  }

  /**
   * 重试异常池记录：按落库的 action+payload 原样重放。
   * 成功 → 标记 resolvedAt，移出异常池；失败 → 留在池中，累计 retryCount。
   */
  async retry(logId: string): Promise<IntegrationRunResult> {
    const log = await this.prisma.integrationLog.findUnique({ where: { id: logId } });
    if (!log) throw new AppException(ErrorCode.NOT_FOUND, '接口日志不存在', HttpStatus.NOT_FOUND);
    if (log.success || log.resolvedAt) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '该记录已成功或已处理，无需重试',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!log.action) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '该记录没有可重放的动作标识（如人工导入），请人工补偿后标记已处理',
        HttpStatus.BAD_REQUEST,
      );
    }
    const def = ACTION_DEFS[log.action];
    if (!def) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `动作 ${log.action} 已下线，无法重放，请人工补偿后标记已处理`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const payload = (log.payload ?? null) as Record<string, unknown> | null;
    const ctx: AdapterContext = {
      attempt: log.retryCount + 1,
      simulateFail: payload?.simulateFail === true,
    };

    // 并发双击重试可能重放两次；mock 动作幂等，真实适配器接入时应在适配器内做幂等键
    try {
      const summary = await def.run(this.adapters, ctx, payload);
      await this.prisma.integrationLog.update({
        where: { id: logId },
        data: {
          success: true,
          errorMsg: null,
          responseSummary: summary as Prisma.InputJsonValue,
          needsAttention: false,
          resolvedAt: new Date(),
          retryCount: { increment: 1 },
        },
      });
      return { logId, success: true, errorMsg: null, summary };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.integrationLog.update({
        where: { id: logId },
        data: { errorMsg: msg, retryCount: { increment: 1 } },
      });
      return { logId, success: false, errorMsg: msg, summary: null };
    }
  }

  /** 人工补偿：操作者已在系统外解决（如手工补录数据），把记录移出异常池。 */
  async resolve(logId: string): Promise<void> {
    const log = await this.prisma.integrationLog.findUnique({
      where: { id: logId },
      select: { success: true, resolvedAt: true },
    });
    if (!log) throw new AppException(ErrorCode.NOT_FOUND, '接口日志不存在', HttpStatus.NOT_FOUND);
    if (log.success || log.resolvedAt) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '该记录不在异常池中',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.integrationLog.update({
      where: { id: logId },
      data: { needsAttention: false, resolvedAt: new Date() },
    });
  }

  /** 状态页数据：两个适配器的模式/凭据就绪度 + 每个动作的最近一次执行。 */
  async status(): Promise<IntegrationStatusResponse> {
    const actionKeys = Object.keys(ACTION_DEFS);
    const [lastRuns, pendingExceptions] = await Promise.all([
      Promise.all(
        actionKeys.map((action) =>
          this.prisma.integrationLog.findFirst({
            where: { action },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true, success: true },
          }),
        ),
      ),
      this.prisma.integrationLog.count({ where: { needsAttention: true, resolvedAt: null } }),
    ]);
    const lastByAction = new Map(actionKeys.map((k, i) => [k, lastRuns[i]]));

    const actionsOf = (key: IntegrationAdapterKey) =>
      Object.entries(ACTION_DEFS)
        .filter(([, def]) => def.adapter === key)
        .map(([action, def]) => {
          const last = lastByAction.get(action);
          return {
            action,
            name: def.name,
            direction: `${def.sourceSystem} → ${def.targetSystem}`,
            trigger: def.trigger,
            lastRun: last ? { at: last.createdAt.toISOString(), success: last.success } : null,
          };
        });

    return {
      adapters: [
        {
          key: 'erp',
          title: '用友 ERP',
          mode: this.adapters.erp.mode,
          configured: this.adapters.erp.configured,
          note: '一期预留：接口契约已固化，当前为模拟实现，不读写真实 ERP。物料与供应数据经 Excel 导入（M6）落库；二期替换为用友接口实现即可，调用方与异常池不变。',
          actions: actionsOf('erp'),
        },
        {
          key: 'dingtalk',
          title: '钉钉',
          mode: this.adapters.dingtalk.mode,
          configured: this.adapters.dingtalk.configured,
          note: '一期预留：派工、异常上报、质量问题分派已触发工作通知（当前模拟发送并记录日志）。配置企业内部应用凭据并接入真实实现后，同一链路即推送到钉钉。',
          actions: actionsOf('dingtalk'),
        },
      ],
      pendingExceptions,
    };
  }

  private defOrThrow(action: string): ActionDef {
    const def = ACTION_DEFS[action];
    if (!def) {
      throw new AppException(ErrorCode.NOT_FOUND, `未知的集成动作：${action}`, HttpStatus.NOT_FOUND);
    }
    return def;
  }

  /** requestSummary 给人看：通知类只留接收人与标题，避免正文把日志列表撑爆。 */
  private summarize(
    action: string,
    payload: Record<string, unknown> | null,
  ): Record<string, unknown> | undefined {
    if (!payload) return undefined;
    if (action === 'dingtalk.sendWorkMessage' || action === 'dingtalk.sendTodo') {
      const p = payload as unknown as WorkMessagePayload;
      return { to: p.users?.map((u) => u.name).join('、'), title: p.title };
    }
    return payload;
  }
}
