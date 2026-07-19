import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ASSEMBLY_TASK_STATUS_LABEL,
  AssemblyTaskStatus,
  ErrorCode,
  REPORT_ACTION_RULES,
  RecordStatus,
  WORK_REPORT_TYPE_LABEL,
  WorkReportType,
  type MyTaskDetail,
  type PageResult,
  type TaskWithContextRow,
  type WorkReportRow,
} from '@mes/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { CreateWorkReportDto, MyTaskQueryDto } from '../dto/production.dto';
import { WorkOrderService } from './work-order.service';

/** 装配工可见的工单状态：已下达之后、未作废。草稿工单的任务对现场不存在。 */
const VISIBLE_WO_STATUSES: RecordStatus[] = [
  RecordStatus.RELEASED,
  RecordStatus.IN_PROGRESS,
  RecordStatus.PAUSED,
  RecordStatus.COMPLETED,
  RecordStatus.CLOSED,
];

/** 可报工的工单状态。整单暂停时现场不能继续报工。 */
const REPORTABLE_WO_STATUSES: RecordStatus[] = [RecordStatus.RELEASED, RecordStatus.IN_PROGRESS];

const TASK_CONTEXT_INCLUDE = Prisma.validator<Prisma.AssemblyTaskInclude>()({
  assignee: { select: { displayName: true } },
  drawing: { select: { code: true, name: true } },
  workOrder: {
    select: {
      code: true,
      name: true,
      craft: true,
      status: true,
      projectId: true,
      project: { select: { code: true, name: true } },
    },
  },
});

/**
 * 「我的任务」与现场报工（M7）。
 *
 * 行级数据权限在这里强制：所有查询都以 assigneeId = 当前用户 为硬条件，
 * 与角色 dataScope 无关——装配工永远只看得到派给自己的任务（M7 验收标准，
 * 业务方案 §7.9/§13）。有 plan:read 的角色走工单/派工接口看全量，不走这里。
 *
 * 报工是唯一驱动任务状态的入口（REPORT_ACTION_RULES 强校验），
 * 同一事务内：写报工流水 → 更新任务 → 重算工单进度 → 回写 WBS 任务。
 */
@Injectable()
export class MyTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrders: WorkOrderService,
  ) {}

  async list(userId: string, query: MyTaskQueryDto): Promise<PageResult<TaskWithContextRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.AssemblyTaskWhereInput = {
      assigneeId: userId, // 行级过滤的锚点，绝不接受前端传入
      workOrder: { status: { in: VISIBLE_WO_STATUSES } },
      ...(query.status
        ? { status: query.status }
        : { status: { not: AssemblyTaskStatus.COMPLETED } }),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.assemblyTask.count({ where }),
      this.prisma.assemblyTask.findMany({
        where,
        include: TASK_CONTEXT_INCLUDE,
        // 有计划完工日的排前且越紧越靠前，便于现场按优先级开工
        orderBy: [{ planEndAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((r) => this.workOrders.toTaskContextRow(r)),
      total,
      page,
      pageSize,
    };
  }

  /** 任务详情 + 本任务全部报工记录。非本人任务一律 404，不暴露存在性。 */
  async detail(taskId: string, userId: string): Promise<MyTaskDetail> {
    const task = await this.prisma.assemblyTask.findFirst({
      where: {
        id: taskId,
        assigneeId: userId,
        workOrder: { status: { in: VISIBLE_WO_STATUSES } },
      },
      include: TASK_CONTEXT_INCLUDE,
    });
    if (!task) throw new AppException(ErrorCode.NOT_FOUND, '任务不存在', HttpStatus.NOT_FOUND);

    const reports = await this.prisma.workReport.findMany({
      where: { taskId },
      include: { reporter: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      task: this.workOrders.toTaskContextRow(task),
      reports: reports.map((r) => this.toReportRow(r)),
    };
  }

  /**
   * 报工（§9.5 步骤 5「执行开工、报工、完工」）。
   *
   * 动作合法性由共享的 REPORT_ACTION_RULES 决定；进度语义：
   * COMPLETE 强制 100，REWORK 缺省归 0，其余动作缺省保持原值。
   * 首次报工把 RELEASED 的工单自动推进到执行中——现场动了，计划状态就该跟上。
   */
  async report(taskId: string, userId: string, dto: CreateWorkReportDto): Promise<{ ok: true }> {
    await this.prisma.$transaction(async (tx) => {
      // 在事务内读，与并发报工串行化，防止双开工/双完工
      const task = await tx.assemblyTask.findFirst({
        where: { id: taskId, assigneeId: userId },
        select: {
          id: true,
          status: true,
          progress: true,
          actualStartAt: true,
          workOrderId: true,
          workOrder: { select: { status: true, actualStartAt: true } },
        },
      });
      if (!task) throw new AppException(ErrorCode.NOT_FOUND, '任务不存在', HttpStatus.NOT_FOUND);

      if (!(REPORTABLE_WO_STATUSES as string[]).includes(task.workOrder.status)) {
        throw new AppException(
          ErrorCode.ILLEGAL_STATE_TRANSITION,
          '所属工单当前不可报工（未下达、已暂停或已完结）',
          HttpStatus.BAD_REQUEST,
        );
      }

      const rule = REPORT_ACTION_RULES[dto.type];
      if (!rule.from.includes(task.status as AssemblyTaskStatus)) {
        throw new AppException(
          ErrorCode.ILLEGAL_STATE_TRANSITION,
          `任务当前为「${ASSEMBLY_TASK_STATUS_LABEL[task.status as AssemblyTaskStatus]}」，不能执行「${WORK_REPORT_TYPE_LABEL[dto.type]}」`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const progress =
        dto.type === WorkReportType.COMPLETE
          ? 100
          : dto.type === WorkReportType.REWORK
            ? (dto.progress ?? 0)
            : (dto.progress ?? task.progress);
      const hours = dto.hours ?? 0;
      const now = new Date();

      await tx.workReport.create({
        data: {
          taskId,
          type: dto.type,
          hours: new Prisma.Decimal(hours),
          progress,
          note: dto.note?.trim() || null,
          reporterId: userId,
        },
      });

      await tx.assemblyTask.update({
        where: { id: taskId },
        data: {
          status: rule.to,
          progress,
          actualHours: { increment: new Prisma.Decimal(hours) },
          ...(task.actualStartAt ? {} : { actualStartAt: now }),
          actualEndAt: dto.type === WorkReportType.COMPLETE ? now : null,
        },
      });

      // 现场一动，RELEASED 的工单自动进入执行中
      if (task.workOrder.status === RecordStatus.RELEASED) {
        await tx.workOrder.update({
          where: { id: task.workOrderId },
          data: {
            status: RecordStatus.IN_PROGRESS,
            ...(task.workOrder.actualStartAt ? {} : { actualStartAt: now }),
          },
        });
      }

      // 任务进度 → 工单进度 → WBS 任务（报工回写项目进度，M7 验收标准）
      await this.workOrders.recomputeProgress(tx, task.workOrderId);
    });

    return { ok: true };
  }

  private toReportRow(
    r: Prisma.WorkReportGetPayload<{ include: { reporter: { select: { displayName: true } } } }>,
  ): WorkReportRow {
    return {
      id: r.id,
      taskId: r.taskId,
      type: r.type as WorkReportType,
      hours: Number(r.hours),
      progress: r.progress,
      note: r.note,
      reporterName: r.reporter?.displayName ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
