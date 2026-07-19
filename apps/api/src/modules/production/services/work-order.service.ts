import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AssemblyTaskStatus,
  CraftType,
  ErrorCode,
  ExceptionStatus,
  RecordStatus,
  TaskStatus,
  type AssemblyTaskRow,
  type PageResult,
  type ProductionOverviewItem,
  type TaskWithContextRow,
  type WorkOrderDetail,
  type WorkOrderRow,
} from '@mes/shared';
import { CodeGeneratorService } from '../../../common/code/code-generator.service';
import { AppException } from '../../../common/exceptions/app.exception';
import { IntegrationNotifyService } from '../../integration/services/notify.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StateMachineService } from '../../../common/state/state-machine.service';
import type {
  AssignTaskDto,
  ChangeWorkOrderStatusDto,
  CreateWorkOrderDto,
  DispatchTaskQueryDto,
  SaveAssemblyTaskDto,
  UpdateWorkOrderDto,
  WorkOrderListQueryDto,
} from '../dto/production.dto';

/** 「未完结」的工单状态——延期判定与派工可用性都以此为准。 */
const OPEN_WO_STATUSES: RecordStatus[] = [
  RecordStatus.DRAFT,
  RecordStatus.RELEASED,
  RecordStatus.IN_PROGRESS,
  RecordStatus.PAUSED,
];

const WO_INCLUDE = Prisma.validator<Prisma.WorkOrderInclude>()({
  project: { select: { code: true, name: true } },
  wbsTask: { select: { name: true } },
  createdBy: { select: { displayName: true } },
  tasks: {
    select: {
      status: true,
      assigneeId: true,
      standardHours: true,
      actualHours: true,
      progress: true,
    },
  },
});
type WoWithMeta = Prisma.WorkOrderGetPayload<{ include: typeof WO_INCLUDE }>;

const TASK_INCLUDE = Prisma.validator<Prisma.AssemblyTaskInclude>()({
  assignee: { select: { displayName: true } },
  drawing: { select: { code: true, name: true } },
});
type TaskWithMeta = Prisma.AssemblyTaskGetPayload<{ include: typeof TASK_INCLUDE }>;

const TASK_CONTEXT_INCLUDE = Prisma.validator<Prisma.AssemblyTaskInclude>()({
  ...TASK_INCLUDE,
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
type TaskWithContext = Prisma.AssemblyTaskGetPayload<{ include: typeof TASK_CONTEXT_INCLUDE }>;

/**
 * 装配工单与任务（M7）。
 *
 * 工单即计划单元（一期不建独立计划实体，§8.4 不做复杂 APS）：
 * 状态走通用 RecordStatus 状态机，「下达」= DRAFT→RELEASED，现场自此可见任务。
 * 进度由任务按标准工时加权汇总（recomputeProgress），并回写关联的 WBS 任务，
 * 使 M4 甘特图与项目台账即时反映现场执行。
 */
@Injectable()
export class WorkOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: CodeGeneratorService,
    private readonly stateMachine: StateMachineService,
    private readonly notify: IntegrationNotifyService,
  ) {}

  // ============ 工单 ============

  async list(query: WorkOrderListQueryDto): Promise<PageResult<WorkOrderRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.WorkOrderWhereInput = {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.craft ? { craft: query.craft } : {}),
      ...(query.keyword
        ? {
            OR: [
              { code: { contains: query.keyword, mode: 'insensitive' } },
              { name: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.delayedOnly
        ? { planEndAt: { lt: new Date() }, status: { in: OPEN_WO_STATUSES } }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.findMany({
        where,
        include: WO_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map((r) => this.toRow(r)), total, page, pageSize };
  }

  /** 生产计划页顶部的项目维度汇总：计划 vs 实际、延期与未派工预警。 */
  async overview(): Promise<ProductionOverviewItem[]> {
    // 看板读不要求两表严格同刻，Promise.all 即可（groupBy 在 $transaction 数组里类型推断退化）
    const [orders, exceptions] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { status: { not: RecordStatus.VOIDED } },
        select: {
          projectId: true,
          status: true,
          progress: true,
          planEndAt: true,
          project: { select: { code: true, name: true, planEndAt: true } },
          tasks: { select: { assigneeId: true, status: true, standardHours: true } },
        },
      }),
      this.prisma.workException.groupBy({
        by: ['projectId'],
        where: { status: { not: ExceptionStatus.CLOSED } },
        _count: { _all: true },
      }),
    ]);

    const openExceptions = new Map(exceptions.map((e) => [e.projectId, e._count._all]));
    const now = Date.now();
    const byProject = new Map<string, ProductionOverviewItem & { weight: number; weighted: number }>();

    for (const wo of orders) {
      let agg = byProject.get(wo.projectId);
      if (!agg) {
        agg = {
          projectId: wo.projectId,
          projectCode: wo.project.code,
          projectName: wo.project.name,
          projectPlanEndAt: wo.project.planEndAt?.toISOString() ?? null,
          workOrderCount: 0,
          completedCount: 0,
          inProgressCount: 0,
          delayedCount: 0,
          unassignedCount: 0,
          avgProgress: 0,
          openExceptionCount: openExceptions.get(wo.projectId) ?? 0,
          weight: 0,
          weighted: 0,
        };
        byProject.set(wo.projectId, agg);
      }

      agg.workOrderCount += 1;
      if (wo.status === RecordStatus.COMPLETED || wo.status === RecordStatus.CLOSED) {
        agg.completedCount += 1;
      }
      if (wo.status === RecordStatus.IN_PROGRESS) agg.inProgressCount += 1;
      if (
        wo.planEndAt &&
        wo.planEndAt.getTime() < now &&
        (OPEN_WO_STATUSES as string[]).includes(wo.status)
      ) {
        agg.delayedCount += 1;
      }
      agg.unassignedCount += wo.tasks.filter((t) => !t.assigneeId).length;

      // 项目层平均进度按工单的任务标准工时总量加权，无任务的工单权重记 1
      const woWeight = wo.tasks.reduce((s, t) => s + (Number(t.standardHours) || 1), 0) || 1;
      agg.weight += woWeight;
      agg.weighted += wo.progress * woWeight;
    }

    return [...byProject.values()]
      .map(({ weight, weighted, ...item }) => ({
        ...item,
        avgProgress: weight ? Math.round(weighted / weight) : 0,
      }))
      .sort((a, b) => a.projectCode.localeCompare(b.projectCode));
  }

  async detail(id: string): Promise<WorkOrderDetail> {
    const wo = await this.prisma.workOrder.findUnique({ where: { id }, include: WO_INCLUDE });
    if (!wo) throw new AppException(ErrorCode.NOT_FOUND, '工单不存在', HttpStatus.NOT_FOUND);

    const tasks = await this.prisma.assemblyTask.findMany({
      where: { workOrderId: id },
      include: TASK_INCLUDE,
      orderBy: { seq: 'asc' },
    });

    return { ...this.toRow(wo), tasks: tasks.map((t) => this.toTaskRow(t)) };
  }

  async create(dto: CreateWorkOrderDto, userId: string): Promise<{ id: string; code: string }> {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);

    await this.assertWbsTask(dto.wbsTaskId, dto.projectId);

    // 单据编号规则（业务方案 §10.2）：WO-年月日-流水号
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const code = await this.codeGen.next(`WO-${today}`);

    return this.prisma.workOrder.create({
      data: {
        code,
        projectId: dto.projectId,
        name: dto.name.trim(),
        craft: dto.craft,
        planStartAt: dto.planStartAt ? new Date(dto.planStartAt) : null,
        planEndAt: dto.planEndAt ? new Date(dto.planEndAt) : null,
        wbsTaskId: dto.wbsTaskId || null,
        remark: dto.remark?.trim() || null,
        createdById: userId,
      },
      select: { id: true, code: true },
    });
  }

  /** 计划调整（§8.4）。专业仅草稿可改；完结（完工/关闭/作废）后不可再改。 */
  async update(id: string, dto: UpdateWorkOrderDto): Promise<void> {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id },
      select: { status: true, projectId: true, craft: true },
    });
    if (!wo) throw new AppException(ErrorCode.NOT_FOUND, '工单不存在', HttpStatus.NOT_FOUND);
    if (!(OPEN_WO_STATUSES as string[]).includes(wo.status)) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '工单已完结，不可再调整',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.craft && dto.craft !== wo.craft && wo.status !== RecordStatus.DRAFT) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '工单下达后不可变更专业',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.wbsTaskId) await this.assertWbsTask(dto.wbsTaskId, wo.projectId);

    await this.prisma.workOrder.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.craft !== undefined ? { craft: dto.craft } : {}),
        ...(dto.planStartAt !== undefined
          ? { planStartAt: dto.planStartAt ? new Date(dto.planStartAt) : null }
          : {}),
        ...(dto.planEndAt !== undefined
          ? { planEndAt: dto.planEndAt ? new Date(dto.planEndAt) : null }
          : {}),
        ...(dto.wbsTaskId !== undefined ? { wbsTaskId: dto.wbsTaskId || null } : {}),
        ...(dto.remark !== undefined ? { remark: dto.remark?.trim() || null } : {}),
      },
    });
  }

  /**
   * 工单状态流转（通用状态机）。
   * 下达要求至少有一条任务；完工确认（§8.5）要求全部任务已完工。
   */
  async changeStatus(id: string, dto: ChangeWorkOrderStatusDto): Promise<void> {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id },
      select: {
        status: true,
        actualStartAt: true,
        wbsTaskId: true,
        tasks: { select: { status: true } },
      },
    });
    if (!wo) throw new AppException(ErrorCode.NOT_FOUND, '工单不存在', HttpStatus.NOT_FOUND);

    this.stateMachine.assertTransition(wo.status as RecordStatus, dto.status);

    const data: Prisma.WorkOrderUpdateInput = { status: dto.status };

    if (dto.status === RecordStatus.RELEASED && wo.tasks.length === 0) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '工单下还没有任务，请先添加任务再下达',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.status === RecordStatus.IN_PROGRESS && !wo.actualStartAt) {
      data.actualStartAt = new Date();
    }
    if (dto.status === RecordStatus.COMPLETED) {
      const undone = wo.tasks.filter((t) => t.status !== AssemblyTaskStatus.COMPLETED).length;
      if (wo.tasks.length === 0 || undone > 0) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          undone > 0 ? `还有 ${undone} 条任务未完工，不能完工确认` : '工单下没有任务',
          HttpStatus.BAD_REQUEST,
        );
      }
      data.actualEndAt = new Date();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrder.update({ where: { id }, data });
      await this.recomputeProgress(tx, id);
    });
  }

  // ============ 任务 ============

  /** 派工页任务列表（带工单与项目上下文）。 */
  async dispatchList(query: DispatchTaskQueryDto): Promise<PageResult<TaskWithContextRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.AssemblyTaskWhereInput = {
      ...(query.workOrderId ? { workOrderId: query.workOrderId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.unassignedOnly ? { assigneeId: null } : {}),
      workOrder: {
        status: { not: RecordStatus.VOIDED },
        ...(query.projectId ? { projectId: query.projectId } : {}),
      },
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { workOrder: { code: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.assemblyTask.count({ where }),
      this.prisma.assemblyTask.findMany({
        where,
        include: TASK_CONTEXT_INCLUDE,
        orderBy: [{ workOrder: { createdAt: 'desc' } }, { seq: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map((r) => this.toTaskContextRow(r)), total, page, pageSize };
  }

  async addTask(
    workOrderId: string,
    dto: SaveAssemblyTaskDto,
  ): Promise<{ id: string }> {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { status: true, projectId: true },
    });
    if (!wo) throw new AppException(ErrorCode.NOT_FOUND, '工单不存在', HttpStatus.NOT_FOUND);
    if (!(OPEN_WO_STATUSES as string[]).includes(wo.status)) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '工单已完结，不能再添加任务',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertDrawing(dto.drawingId, wo.projectId);

    return this.prisma.$transaction(async (tx) => {
      const last = await tx.assemblyTask.findFirst({
        where: { workOrderId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      const task = await tx.assemblyTask.create({
        data: {
          workOrderId,
          seq: (last?.seq ?? 0) + 1,
          name: dto.name.trim(),
          planStartAt: dto.planStartAt ? new Date(dto.planStartAt) : null,
          planEndAt: dto.planEndAt ? new Date(dto.planEndAt) : null,
          standardHours:
            dto.standardHours != null ? new Prisma.Decimal(dto.standardHours) : null,
          drawingId: dto.drawingId || null,
          requirement: dto.requirement?.trim() || null,
          remark: dto.remark?.trim() || null,
        },
        select: { id: true },
      });
      // 新任务进度为 0，会拉低工单整体进度，须立即重算
      await this.recomputeProgress(tx, workOrderId);
      return task;
    });
  }

  async updateTask(taskId: string, dto: SaveAssemblyTaskDto): Promise<void> {
    const task = await this.getTaskOrThrow(taskId);
    if (task.status === AssemblyTaskStatus.COMPLETED) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '任务已完工，不可编辑；如需返工请由装配工报工「返工」',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertDrawing(dto.drawingId, task.workOrder.projectId);

    await this.prisma.$transaction(async (tx) => {
      await tx.assemblyTask.update({
        where: { id: taskId },
        data: {
          name: dto.name.trim(),
          planStartAt: dto.planStartAt ? new Date(dto.planStartAt) : null,
          planEndAt: dto.planEndAt ? new Date(dto.planEndAt) : null,
          standardHours:
            dto.standardHours != null ? new Prisma.Decimal(dto.standardHours) : null,
          drawingId: dto.drawingId || null,
          requirement: dto.requirement?.trim() || null,
          remark: dto.remark?.trim() || null,
        },
      });
      // 标准工时是进度加权权重，改动后工单进度随之变化
      await this.recomputeProgress(tx, task.workOrderId);
    });
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = await this.getTaskOrThrow(taskId);
    if (task.status !== AssemblyTaskStatus.PENDING) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '仅未开工的任务可删除',
        HttpStatus.BAD_REQUEST,
      );
    }
    const reportCount = await this.prisma.workReport.count({ where: { taskId } });
    if (reportCount > 0) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '任务已有报工记录，不可删除',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.assemblyTask.delete({ where: { id: taskId } });
      await this.recomputeProgress(tx, task.workOrderId);
    });
  }

  /** 派工/改派（§8.5）。已完工任务不可改派；取消派工仅限未开工任务。 */
  async assign(taskId: string, dto: AssignTaskDto): Promise<void> {
    const task = await this.getTaskOrThrow(taskId);
    if (!(OPEN_WO_STATUSES as string[]).includes(task.workOrder.status)) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '工单已完结，不可派工',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (task.status === AssemblyTaskStatus.COMPLETED) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '任务已完工，不可改派',
        HttpStatus.BAD_REQUEST,
      );
    }

    const assigneeId = dto.assigneeId || null;
    if (!assigneeId && task.status !== AssemblyTaskStatus.PENDING) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '任务已开工，只能改派给他人，不能取消派工',
        HttpStatus.BAD_REQUEST,
      );
    }
    let assignee: { id: string; displayName: string } | null = null;
    if (assigneeId) {
      assignee = await this.prisma.user.findFirst({
        where: { id: assigneeId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, displayName: true },
      });
      if (!assignee) {
        throw new AppException(ErrorCode.NOT_FOUND, '被派工人员不存在或已停用', HttpStatus.NOT_FOUND);
      }
    }

    await this.prisma.assemblyTask.update({ where: { id: taskId }, data: { assigneeId } });

    // 钉钉挂点（§5.2）：派工即通知装配工。fire-and-forget，失败进异常池不影响派工。
    if (assignee) {
      const context = await this.prisma.assemblyTask.findUnique({
        where: { id: taskId },
        select: {
          name: true,
          workOrder: { select: { code: true, project: { select: { name: true } } } },
        },
      });
      if (context) {
        this.notify.sendWorkMessage(
          [{ id: assignee.id, name: assignee.displayName }],
          '新装配任务',
          `项目「${context.workOrder.project.name}」工单 ${context.workOrder.code}：任务「${context.name}」已派给您，请在「现场报工」中查看。`,
          '/production/report',
        );
      }
    }
  }

  // ============ 进度汇总（报工回写链路的核心） ============

  /**
   * 重算工单进度并回写关联的 WBS 任务。
   *
   * 工单进度 = Σ(任务进度 × 权重) / Σ权重，权重 = 标准工时（未填按 1）。
   * WBS 回写：progress 同步为工单进度，status 按 0/中间/100 映射为
   * 未开始/进行中/已完成——M4 甘特图因此能实时反映现场（M7 验收标准）。
   * 必须在报工/任务增删的同一事务内调用，避免并发报工时进度互相覆盖。
   */
  async recomputeProgress(tx: Prisma.TransactionClient, workOrderId: string): Promise<number> {
    const tasks = await tx.assemblyTask.findMany({
      where: { workOrderId },
      select: { progress: true, standardHours: true },
    });

    let weight = 0;
    let weighted = 0;
    for (const t of tasks) {
      const w = Number(t.standardHours) || 1;
      weight += w;
      weighted += t.progress * w;
    }
    const progress = weight ? Math.round(weighted / weight) : 0;

    const wo = await tx.workOrder.update({
      where: { id: workOrderId },
      data: { progress },
      select: { wbsTaskId: true },
    });

    if (wo.wbsTaskId) {
      await tx.projectTask.update({
        where: { id: wo.wbsTaskId },
        data: {
          progress,
          status:
            progress >= 100
              ? TaskStatus.COMPLETED
              : progress > 0
                ? TaskStatus.IN_PROGRESS
                : TaskStatus.DRAFT,
        },
      });
    }

    return progress;
  }

  // ---- 私有辅助 ----

  private async getTaskOrThrow(taskId: string) {
    const task = await this.prisma.assemblyTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        status: true,
        workOrderId: true,
        workOrder: { select: { status: true, projectId: true } },
      },
    });
    if (!task) throw new AppException(ErrorCode.NOT_FOUND, '任务不存在', HttpStatus.NOT_FOUND);
    return task;
  }

  /** WBS 任务必须属于同一项目——跨项目回写进度会污染别的项目的甘特图。 */
  private async assertWbsTask(wbsTaskId: string | null | undefined, projectId: string) {
    if (!wbsTaskId) return;
    const wbs = await this.prisma.projectTask.findFirst({
      where: { id: wbsTaskId, projectId },
      select: { id: true },
    });
    if (!wbs) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '关联的 WBS 任务不存在或不属于该项目',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** 任务图纸必须是本项目的有效图纸——防止现场拿到别项目或已作废的图。 */
  private async assertDrawing(drawingId: string | null | undefined, projectId: string) {
    if (!drawingId) return;
    const drawing = await this.prisma.drawing.findFirst({
      where: { id: drawingId, projectId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!drawing) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '关联图纸不存在、已作废或不属于该项目',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private toRow(wo: WoWithMeta): WorkOrderRow {
    const now = Date.now();
    return {
      id: wo.id,
      code: wo.code,
      projectId: wo.projectId,
      projectCode: wo.project.code,
      projectName: wo.project.name,
      name: wo.name,
      craft: wo.craft as CraftType,
      status: wo.status,
      planStartAt: wo.planStartAt?.toISOString() ?? null,
      planEndAt: wo.planEndAt?.toISOString() ?? null,
      actualStartAt: wo.actualStartAt?.toISOString() ?? null,
      actualEndAt: wo.actualEndAt?.toISOString() ?? null,
      progress: wo.progress,
      taskCount: wo.tasks.length,
      doneTaskCount: wo.tasks.filter((t) => t.status === AssemblyTaskStatus.COMPLETED).length,
      unassignedCount: wo.tasks.filter((t) => !t.assigneeId).length,
      totalStandardHours: wo.tasks.reduce((s, t) => s + Number(t.standardHours ?? 0), 0),
      totalActualHours: wo.tasks.reduce((s, t) => s + Number(t.actualHours), 0),
      wbsTaskId: wo.wbsTaskId,
      wbsTaskName: wo.wbsTask?.name ?? null,
      delayed:
        !!wo.planEndAt &&
        wo.planEndAt.getTime() < now &&
        (OPEN_WO_STATUSES as string[]).includes(wo.status),
      remark: wo.remark,
      createdByName: wo.createdBy?.displayName ?? null,
      createdAt: wo.createdAt.toISOString(),
    };
  }

  toTaskRow(t: TaskWithMeta): AssemblyTaskRow {
    return {
      id: t.id,
      workOrderId: t.workOrderId,
      seq: t.seq,
      name: t.name,
      assigneeId: t.assigneeId,
      assigneeName: t.assignee?.displayName ?? null,
      status: t.status as AssemblyTaskStatus,
      planStartAt: t.planStartAt?.toISOString() ?? null,
      planEndAt: t.planEndAt?.toISOString() ?? null,
      actualStartAt: t.actualStartAt?.toISOString() ?? null,
      actualEndAt: t.actualEndAt?.toISOString() ?? null,
      standardHours: t.standardHours != null ? Number(t.standardHours) : null,
      actualHours: Number(t.actualHours),
      progress: t.progress,
      drawingId: t.drawingId,
      drawingCode: t.drawing?.code ?? null,
      drawingName: t.drawing?.name ?? null,
      requirement: t.requirement,
      remark: t.remark,
    };
  }

  toTaskContextRow(t: TaskWithContext): TaskWithContextRow {
    return {
      ...this.toTaskRow(t),
      workOrderCode: t.workOrder.code,
      workOrderName: t.workOrder.name,
      workOrderStatus: t.workOrder.status,
      craft: t.workOrder.craft as CraftType,
      projectId: t.workOrder.projectId,
      projectCode: t.workOrder.project.code,
      projectName: t.workOrder.project.name,
    };
  }
}
