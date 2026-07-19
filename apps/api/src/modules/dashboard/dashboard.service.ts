import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  ExceptionStatus,
  InspectionStatus,
  IssueSeverity,
  QualityIssueStatus,
  RecordStatus,
  RiskLevel,
  type CompanyDashboard,
  type CraftHours,
  type DailyHoursPoint,
  type InspectionTypeSummary,
  type MonthlyIssuePoint,
  type OpenIssueRow,
  type ProjectDashboard,
  type StageCount,
  type WorkbenchSummary,
} from '@mes/shared';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../common/prisma/prisma.service';
import { KittingService } from '../material/services/kitting.service';

/** 在制口径：进入执行链路且未到终态（草稿不算在制，只计入总数）。 */
const ACTIVE_STATUSES: string[] = [
  RecordStatus.RELEASED,
  RecordStatus.IN_PROGRESS,
  RecordStatus.PAUSED,
  RecordStatus.CHANGING,
];

/** 未完成口径：延期/到期预警的统计范围（草稿也会延期）。 */
const UNFINISHED_STATUSES: string[] = [RecordStatus.DRAFT, ...ACTIVE_STATUSES];

const OPEN_ISSUE_STATUSES: string[] = [
  QualityIssueStatus.OPEN,
  QualityIssueStatus.HANDLING,
  QualityIssueStatus.RECHECKING,
];

const OPEN_EXCEPTION_STATUSES: string[] = [
  ExceptionStatus.OPEN,
  ExceptionStatus.HANDLING,
  ExceptionStatus.RESOLVED,
];

/** 未闭环问题合并列表的严重度排序权重。 */
const SEVERITY_RANK: Record<string, number> = {
  [IssueSeverity.CRITICAL]: 0,
  [IssueSeverity.HIGH]: 1,
  [IssueSeverity.MEDIUM]: 2,
  [IssueSeverity.LOW]: 3,
};

const DAY_MS = 86_400_000;
/** 中国无夏令时，固定 +8 折算北京时间做日/月分桶即可，无需拖入完整时区库。 */
const SH_OFFSET_MS = 8 * 3_600_000;
const SH_TZ = 'Asia/Shanghai';

/**
 * 数据看板聚合（M10，业务方案 §8.12）。
 *
 * 只读跨域聚合：直接查各域表做计数/分组，不复用各域业务 service；
 * 唯一例外是齐套率——那是 M6 的实时算法（不落表），必须复用 KittingService
 * 而不是抄第二份口径。每个看板一次响应返回整板数据，服务端 Promise.all
 * 并发取数，对应验收标准「看板加载 < 2s」。
 *
 * 趋势分桶在 SQL 里做：created_at 存的是 UTC（Prisma timestamp 无时区），
 * 先 AT TIME ZONE 'UTC' 标注再转北京时间取 to_char，桶键与前端展示一致。
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kitting: KittingService,
  ) {}

  // ============================================================
  //  公司级看板
  // ============================================================

  async company(): Promise<CompanyDashboard> {
    const now = new Date();
    const { monthStart, sixMonthsAgo, trendStart, dayKeys, monthKeys } = this.buckets(now);
    const dueSoonEnd = new Date(now.getTime() + 30 * DAY_MS);

    const [
      statusGroups,
      delayedCount,
      delayedRows,
      dueSoonProjects,
      kittingOverview,
      severityGroups,
      openedByMonth,
      closedByMonth,
      debugStageGroups,
      inspectionGroups,
      hoursByDay,
      hoursByCraft,
      monthHoursAgg,
      openExceptions,
    ] = await Promise.all([
      this.prisma.project.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { deletedAt: null, status: { not: RecordStatus.VOIDED } },
      }),
      this.prisma.project.count({
        where: {
          deletedAt: null,
          status: { in: UNFINISHED_STATUSES },
          planEndAt: { lt: now },
        },
      }),
      this.prisma.project.findMany({
        where: {
          deletedAt: null,
          status: { in: UNFINISHED_STATUSES },
          planEndAt: { lt: now },
        },
        select: {
          id: true,
          code: true,
          name: true,
          planEndAt: true,
          riskLevel: true,
          manager: { select: { displayName: true } },
        },
        orderBy: { planEndAt: 'asc' },
        take: 10,
      }),
      this.prisma.project.count({
        where: {
          deletedAt: null,
          status: { in: UNFINISHED_STATUSES },
          planEndAt: { gte: now, lte: dueSoonEnd },
        },
      }),
      this.kitting.overview(),
      this.prisma.qualityIssue.groupBy({
        by: ['severity'],
        _count: { _all: true },
        where: { status: { in: OPEN_ISSUE_STATUSES } },
      }),
      this.prisma.$queryRaw<{ month: string; count: number }[]>`
        SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${SH_TZ}, 'YYYY-MM') AS month,
               COUNT(*)::int AS count
        FROM qc_issue
        WHERE created_at >= ${sixMonthsAgo}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ month: string; count: number }[]>`
        SELECT to_char((closed_at AT TIME ZONE 'UTC') AT TIME ZONE ${SH_TZ}, 'YYYY-MM') AS month,
               COUNT(*)::int AS count
        FROM qc_issue
        WHERE closed_at IS NOT NULL AND closed_at >= ${sixMonthsAgo}
        GROUP BY 1`,
      this.prisma.debugIssue.groupBy({
        by: ['stage'],
        _count: { _all: true },
        where: { status: { in: OPEN_ISSUE_STATUSES } },
      }),
      this.prisma.inspection.groupBy({
        by: ['type', 'status'],
        _count: { _all: true },
        where: { status: { not: InspectionStatus.VOIDED } },
      }),
      this.hoursByDay(trendStart),
      this.hoursByCraft(trendStart),
      this.prisma.workReport.aggregate({
        _sum: { hours: true },
        where: { createdAt: { gte: monthStart } },
      }),
      this.prisma.workException.count({ where: { status: { in: OPEN_EXCEPTION_STATUSES } } }),
    ]);

    // 延期行补充工单平均进度（无工单为 0）
    const delayedIds = delayedRows.map((p) => p.id);
    const progressGroups = delayedIds.length
      ? await this.prisma.workOrder.groupBy({
          by: ['projectId'],
          _avg: { progress: true },
          where: { projectId: { in: delayedIds }, status: { not: RecordStatus.VOIDED } },
        })
      : [];
    const progressByProject = new Map(progressGroups.map((g) => [g.projectId, g._avg.progress ?? 0]));

    const countOf = (statuses: string[]) =>
      statusGroups.filter((g) => statuses.includes(g.status)).reduce((s, g) => s + g._count._all, 0);

    const openQualityIssues = severityGroups.reduce((s, g) => s + g._count._all, 0);
    const openDebugIssues = debugStageGroups.reduce((s, g) => s + g._count._all, 0);
    const avgKitRate = kittingOverview.length
      ? Math.round(kittingOverview.reduce((s, k) => s + k.kitRate, 0) / kittingOverview.length)
      : 0;

    const inspectionByType = new Map<string, InspectionTypeSummary>();
    for (const g of inspectionGroups) {
      const row =
        inspectionByType.get(g.type) ??
        ({ type: g.type, pending: 0, passed: 0, rejected: 0 } as InspectionTypeSummary);
      if (g.status === InspectionStatus.PENDING) row.pending += g._count._all;
      else if (g.status === InspectionStatus.PASSED) row.passed += g._count._all;
      else if (g.status === InspectionStatus.REJECTED) row.rejected += g._count._all;
      inspectionByType.set(g.type, row);
    }

    const openedMap = new Map(openedByMonth.map((r) => [r.month, r.count]));
    const closedMap = new Map(closedByMonth.map((r) => [r.month, r.count]));
    const qualityTrend: MonthlyIssuePoint[] = monthKeys.map((month) => ({
      month,
      opened: openedMap.get(month) ?? 0,
      closed: closedMap.get(month) ?? 0,
    }));

    return {
      kpi: {
        totalProjects: statusGroups.reduce((s, g) => s + g._count._all, 0),
        activeProjects: countOf(ACTIVE_STATUSES),
        completedProjects: countOf([RecordStatus.COMPLETED, RecordStatus.CLOSED]),
        delayedProjects: delayedCount,
        dueSoonProjects,
        avgKitRate,
        kittingProjects: kittingOverview.length,
        openQualityIssues,
        openDebugIssues,
        openExceptions,
        monthWorkHours: this.round1(Number(monthHoursAgg._sum.hours ?? 0)),
      },
      projectsByStatus: statusGroups
        .map((g) => ({ status: g.status as RecordStatus, count: g._count._all }))
        .sort((a, b) => b.count - a.count),
      kittingRanking: [...kittingOverview].sort((a, b) => a.kitRate - b.kitRate).slice(0, 12),
      qualityBySeverity: severityGroups.map((g) => ({
        severity: g.severity as IssueSeverity,
        count: g._count._all,
      })),
      qualityTrend,
      debugByStage: debugStageGroups.map((g) => ({
        stage: g.stage as StageCount['stage'],
        count: g._count._all,
      })),
      inspectionByType: [...inspectionByType.values()],
      workHoursTrend: this.fillDays(dayKeys, hoursByDay),
      workHoursByCraft: hoursByCraft,
      delayedProjects: delayedRows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        managerName: p.manager?.displayName ?? null,
        planEndAt: p.planEndAt!.toISOString(),
        overdueDays: Math.ceil((now.getTime() - p.planEndAt!.getTime()) / DAY_MS),
        riskLevel: p.riskLevel as RiskLevel,
        avgProgress: Math.round(progressByProject.get(p.id) ?? 0),
      })),
      generatedAt: now.toISOString(),
    };
  }

  // ============================================================
  //  项目看板
  // ============================================================

  async project(projectId: string): Promise<ProjectDashboard> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        customerName: true,
        contractNo: true,
        projectType: true,
        status: true,
        riskLevel: true,
        equipmentCount: true,
        planStartAt: true,
        planEndAt: true,
        actualEndAt: true,
        manager: { select: { displayName: true } },
      },
    });
    if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);

    const now = new Date();
    const { trendStart, dayKeys } = this.buckets(now);

    const [
      kittingResult,
      milestones,
      workOrders,
      wbsTotal,
      wbsCompleted,
      qualityGroups,
      debugStageGroups,
      openExceptions,
      openRisks,
      totalHoursRows,
      hoursByDay,
      hoursByCraft,
      openQualityRows,
      openDebugRows,
    ] = await Promise.all([
      this.kitting.forProject(projectId),
      this.prisma.projectMilestone.findMany({
        where: { projectId },
        select: { id: true, name: true, planDate: true, actualDate: true },
        orderBy: [{ sort: 'asc' }, { planDate: 'asc' }],
      }),
      this.prisma.workOrder.findMany({
        where: { projectId, status: { not: RecordStatus.VOIDED } },
        select: {
          id: true,
          code: true,
          name: true,
          craft: true,
          status: true,
          progress: true,
          planEndAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.projectTask.count({ where: { projectId } }),
      this.prisma.projectTask.count({ where: { projectId, status: RecordStatus.COMPLETED } }),
      this.prisma.qualityIssue.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { projectId },
      }),
      this.prisma.debugIssue.groupBy({
        by: ['stage'],
        _count: { _all: true },
        where: { projectId, status: { in: OPEN_ISSUE_STATUSES } },
      }),
      this.prisma.workException.count({
        where: { projectId, status: { in: OPEN_EXCEPTION_STATUSES } },
      }),
      this.prisma.projectRisk.count({ where: { projectId, status: 'OPEN' } }),
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COALESCE(SUM(r.hours), 0)::float AS total
        FROM prod_work_report r
        JOIN prod_task t ON t.id = r.task_id
        JOIN prod_work_order wo ON wo.id = t.work_order_id
        WHERE wo.project_id = ${projectId}`,
      this.hoursByDay(trendStart, projectId),
      this.hoursByCraft(null, projectId),
      this.prisma.qualityIssue.findMany({
        where: { projectId, status: { in: OPEN_ISSUE_STATUSES } },
        select: {
          id: true,
          code: true,
          title: true,
          severity: true,
          status: true,
          createdAt: true,
          handler: { select: { displayName: true } },
        },
      }),
      this.prisma.debugIssue.findMany({
        where: { projectId, status: { in: OPEN_ISSUE_STATUSES } },
        select: {
          id: true,
          code: true,
          title: true,
          severity: true,
          status: true,
          stage: true,
          createdAt: true,
          handler: { select: { displayName: true } },
        },
      }),
    ]);

    // 查询已排除作废工单
    const avgWorkOrderProgress = workOrders.length
      ? Math.round(workOrders.reduce((s, w) => s + w.progress, 0) / workOrders.length)
      : 0;

    const hasBom = kittingResult.bomId !== null;
    const shortageTop = kittingResult.rows
      .filter((r) => r.status === 'SHORTAGE')
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 5)
      .map((r) => ({
        materialCode: r.materialCode,
        materialName: r.materialName,
        unit: r.unit,
        gap: r.gap,
        latestExpectedDate: r.latestExpectedDate,
        isLongLead: r.isLongLead,
      }));

    const openIssues: OpenIssueRow[] = [
      ...openQualityRows.map((r) => ({
        kind: 'QUALITY' as const,
        id: r.id,
        code: r.code,
        title: r.title,
        severity: r.severity as IssueSeverity,
        status: r.status,
        stage: null,
        handlerName: r.handler?.displayName ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      ...openDebugRows.map((r) => ({
        kind: 'DEBUG' as const,
        id: r.id,
        code: r.code,
        title: r.title,
        severity: r.severity as IssueSeverity,
        status: r.status,
        stage: r.stage as OpenIssueRow['stage'],
        handlerName: r.handler?.displayName ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    ]
      .sort(
        (a, b) =>
          (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
          b.createdAt.localeCompare(a.createdAt),
      )
      .slice(0, 10);

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        customerName: project.customerName,
        contractNo: project.contractNo,
        projectType: project.projectType,
        status: project.status as RecordStatus,
        riskLevel: project.riskLevel as RiskLevel,
        managerName: project.manager?.displayName ?? null,
        equipmentCount: project.equipmentCount,
        planStartAt: project.planStartAt?.toISOString() ?? null,
        planEndAt: project.planEndAt?.toISOString() ?? null,
        actualEndAt: project.actualEndAt?.toISOString() ?? null,
      },
      kpi: {
        kitRate: hasBom ? kittingResult.kitRate : null,
        shortageRows: kittingResult.shortageRows,
        workOrderCount: workOrders.length,
        avgWorkOrderProgress,
        wbsTotal,
        wbsCompleted,
        wbsCompletionRate: wbsTotal ? Math.round((wbsCompleted / wbsTotal) * 100) : 0,
        openQualityIssues: openQualityRows.length,
        openDebugIssues: openDebugRows.length,
        openExceptions,
        openRisks,
        totalWorkHours: this.round1(totalHoursRows[0]?.total ?? 0),
      },
      kitting: hasBom
        ? {
            bomVersion: kittingResult.bomVersion,
            kitRate: kittingResult.kitRate,
            kitRateByQty: kittingResult.kitRateByQty,
            fulfilledRows: kittingResult.fulfilledRows,
            inTransitRows: kittingResult.inTransitRows,
            shortageRows: kittingResult.shortageRows,
            longLeadAlerts: kittingResult.longLeadAlerts,
          }
        : null,
      shortageTop,
      milestones: milestones.map((m) => ({
        id: m.id,
        name: m.name,
        planDate: m.planDate?.toISOString() ?? null,
        actualDate: m.actualDate?.toISOString() ?? null,
      })),
      workOrders: workOrders.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
        craft: w.craft as ProjectDashboard['workOrders'][number]['craft'],
        status: w.status as RecordStatus,
        progress: w.progress,
        planEndAt: w.planEndAt?.toISOString() ?? null,
      })),
      qualityByStatus: qualityGroups.map((g) => ({
        status: g.status as QualityIssueStatus,
        count: g._count._all,
      })),
      debugByStage: debugStageGroups.map((g) => ({
        stage: g.stage as StageCount['stage'],
        count: g._count._all,
      })),
      workHoursTrend: this.fillDays(dayKeys, hoursByDay),
      workHoursByCraft: hoursByCraft,
      openIssues,
      generatedAt: now.toISOString(),
    };
  }

  // ============================================================
  //  工作台指标（登录即可见）
  // ============================================================

  async workbench(): Promise<WorkbenchSummary> {
    const now = new Date();
    const { monthStart } = this.buckets(now);

    const [
      activeProjects,
      newProjectsThisMonth,
      kittingOverview,
      taskGroups,
      activeWorkOrders,
      openQualityIssues,
      openDebugIssues,
      deliveryRows,
      recentExceptions,
      recentQuality,
      recentDebug,
    ] = await Promise.all([
      this.prisma.project.count({
        where: { deletedAt: null, status: { in: ACTIVE_STATUSES } },
      }),
      this.prisma.project.count({
        where: { deletedAt: null, status: { not: RecordStatus.VOIDED }, createdAt: { gte: monthStart } },
      }),
      this.kitting.overview(),
      this.prisma.assemblyTask.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.workOrder.count({ where: { status: RecordStatus.IN_PROGRESS } }),
      this.prisma.qualityIssue.count({ where: { status: { in: OPEN_ISSUE_STATUSES } } }),
      this.prisma.debugIssue.count({ where: { status: { in: OPEN_ISSUE_STATUSES } } }),
      this.prisma.project.findMany({
        where: { deletedAt: null, status: { in: ACTIVE_STATUSES } },
        select: { id: true, code: true, name: true, status: true, riskLevel: true, planEndAt: true },
        orderBy: [{ planEndAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: 4,
      }),
      this.prisma.workException.findMany({
        where: { status: { in: OPEN_EXCEPTION_STATUSES } },
        select: { code: true, title: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      this.prisma.qualityIssue.findMany({
        where: { status: { in: OPEN_ISSUE_STATUSES } },
        select: { code: true, title: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      this.prisma.debugIssue.findMany({
        where: { status: { in: OPEN_ISSUE_STATUSES } },
        select: { code: true, title: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    ]);

    const deliveryIds = deliveryRows.map((p) => p.id);
    const progressGroups = deliveryIds.length
      ? await this.prisma.workOrder.groupBy({
          by: ['projectId'],
          _avg: { progress: true },
          where: { projectId: { in: deliveryIds }, status: { not: RecordStatus.VOIDED } },
        })
      : [];
    const progressByProject = new Map(progressGroups.map((g) => [g.projectId, g._avg.progress ?? 0]));

    const taskTotal = taskGroups.reduce((s, g) => s + g._count._all, 0);
    const taskCompleted = taskGroups
      .filter((g) => g.status === 'COMPLETED')
      .reduce((s, g) => s + g._count._all, 0);

    const todos = [
      ...recentExceptions.map((r) => ({ kind: 'EXCEPTION' as const, ...r })),
      ...recentQuality.map((r) => ({ kind: 'QUALITY' as const, ...r })),
      ...recentDebug.map((r) => ({ kind: 'DEBUG' as const, ...r })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 6)
      .map((r) => ({ kind: r.kind, code: r.code, title: r.title, createdAt: r.createdAt.toISOString() }));

    return {
      metrics: {
        activeProjects,
        newProjectsThisMonth,
        avgKitRate: kittingOverview.length
          ? Math.round(kittingOverview.reduce((s, k) => s + k.kitRate, 0) / kittingOverview.length)
          : 0,
        kittingProjects: kittingOverview.length,
        shortageItems: kittingOverview.reduce((s, k) => s + k.shortageRows, 0),
        taskTotal,
        taskCompleted,
        assemblyCompletionRate: taskTotal ? Math.round((taskCompleted / taskTotal) * 100) : 0,
        activeWorkOrders,
        openQualityIssues,
        openDebugIssues,
      },
      delivery: deliveryRows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status as RecordStatus,
        riskLevel: p.riskLevel as RiskLevel,
        planEndAt: p.planEndAt?.toISOString() ?? null,
        progress: Math.round(progressByProject.get(p.id) ?? 0),
      })),
      todos,
      generatedAt: now.toISOString(),
    };
  }

  // ============================================================
  //  私有：分桶与工时聚合
  // ============================================================

  /**
   * 以北京时间计算各统计窗口的边界（返回真实 UTC 时刻用于 WHERE），
   * 以及补零用的日/月桶键（与 SQL 端 to_char 的键一致）。
   */
  private buckets(now: Date) {
    const shNow = now.getTime() + SH_OFFSET_MS;
    const todayStartSh = Math.floor(shNow / DAY_MS) * DAY_MS;
    // 位移后的 Date 用 getUTC* 读出来的就是北京墙上时间
    const sh = new Date(shNow);
    const y = sh.getUTCFullYear();
    const m = sh.getUTCMonth();

    const dayKeys: string[] = [];
    for (let i = 29; i >= 0; i--) {
      dayKeys.push(new Date(todayStartSh - i * DAY_MS).toISOString().slice(0, 10));
    }
    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      monthKeys.push(new Date(Date.UTC(y, m - i, 1)).toISOString().slice(0, 7));
    }

    return {
      monthStart: new Date(Date.UTC(y, m, 1) - SH_OFFSET_MS),
      sixMonthsAgo: new Date(Date.UTC(y, m - 5, 1) - SH_OFFSET_MS),
      trendStart: new Date(todayStartSh - 29 * DAY_MS - SH_OFFSET_MS),
      dayKeys,
      monthKeys,
    };
  }

  /** 日报工工时（可选按项目收窄）。 */
  private hoursByDay(since: Date, projectId?: string) {
    if (projectId) {
      return this.prisma.$queryRaw<{ day: string; hours: number }[]>`
        SELECT to_char((r.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${SH_TZ}, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(r.hours), 0)::float AS hours
        FROM prod_work_report r
        JOIN prod_task t ON t.id = r.task_id
        JOIN prod_work_order wo ON wo.id = t.work_order_id
        WHERE r.created_at >= ${since} AND wo.project_id = ${projectId}
        GROUP BY 1`;
    }
    return this.prisma.$queryRaw<{ day: string; hours: number }[]>`
      SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${SH_TZ}, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(hours), 0)::float AS hours
      FROM prod_work_report
      WHERE created_at >= ${since}
      GROUP BY 1`;
  }

  /** 按专业汇总工时。since 为 null 表示不限时间（项目累计）。 */
  private async hoursByCraft(since: Date | null, projectId?: string): Promise<CraftHours[]> {
    const rows = await this.prisma.$queryRaw<{ craft: string; hours: number }[]>`
      SELECT wo.craft AS craft, COALESCE(SUM(r.hours), 0)::float AS hours
      FROM prod_work_report r
      JOIN prod_task t ON t.id = r.task_id
      JOIN prod_work_order wo ON wo.id = t.work_order_id
      WHERE (${since}::timestamp IS NULL OR r.created_at >= ${since})
        AND (${projectId ?? null}::text IS NULL OR wo.project_id = ${projectId ?? null})
      GROUP BY wo.craft
      ORDER BY hours DESC`;
    return rows.map((r) => ({
      craft: r.craft as CraftHours['craft'],
      hours: this.round1(r.hours),
    }));
  }

  private fillDays(dayKeys: string[], rows: { day: string; hours: number }[]): DailyHoursPoint[] {
    const map = new Map(rows.map((r) => [r.day, r.hours]));
    return dayKeys.map((date) => ({ date, hours: this.round1(map.get(date) ?? 0) }));
  }

  /** 工时展示对齐 Decimal(x,1)：消除 float 累加噪音。 */
  private round1(n: number): number {
    return Math.round(n * 10) / 10;
  }
}
