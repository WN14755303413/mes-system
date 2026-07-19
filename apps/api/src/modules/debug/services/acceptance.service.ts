import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACCEPTANCE_STATUS_LABEL,
  AcceptanceStatus,
  ErrorCode,
  type AcceptanceDetail,
  type AcceptanceReport,
  type AcceptanceRow,
  type CurrentUser,
  type PageResult,
} from '@mes/shared';
import { CodeGeneratorService } from '../../../common/code/code-generator.service';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  AcceptanceItemDto,
  AcceptanceListQueryDto,
  ConcludeAcceptanceDto,
  CreateAcceptanceDto,
  UpdateAcceptanceDto,
} from '../dto/debug.dto';

const MAX_ITEMS_PER_ACCEPTANCE = 200;

/** 未关闭 = 会阻塞「通过」结论的调试问题状态（作废/已关闭不算）。 */
const OPEN_ISSUE_STATUSES = ['OPEN', 'HANDLING', 'RECHECKING'];

const ACCEPTANCE_INCLUDE = Prisma.validator<Prisma.AcceptanceInclude>()({
  project: { select: { code: true, name: true, customerName: true } },
  createdBy: { select: { displayName: true } },
  concludedBy: { select: { displayName: true } },
  _count: { select: { items: true } },
  items: { where: { passed: false }, select: { id: true } },
});
type AcceptanceWithMeta = Prisma.AcceptanceGetPayload<{ include: typeof ACCEPTANCE_INCLUDE }>;

/**
 * FAT/SAT 验收单（M9，§8.8 / §9.8 / §9.9）。
 *
 * 生命周期同检验单：PENDING 验收中（单头与检查项可编辑）→ conclude 出具
 * 结论即终态锁定。「通过」有门禁：项目存在未关闭调试问题时拒绝（§9.8
 * 「FAT 验收前确认问题状态」）；「有条件通过」必须写明遗留问题与整改期限。
 * 验收报告不落表——report 接口实时聚合调试/问题/检验数据，前端打印视图出 PDF。
 */
@Injectable()
export class AcceptanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: CodeGeneratorService,
  ) {}

  async list(query: AcceptanceListQueryDto): Promise<PageResult<AcceptanceRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.AcceptanceWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.keyword
        ? {
            OR: [
              { code: { contains: query.keyword, mode: 'insensitive' } },
              { title: { contains: query.keyword, mode: 'insensitive' } },
              { equipmentNo: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.acceptance.count({ where }),
      this.prisma.acceptance.findMany({
        where,
        include: ACCEPTANCE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map((r) => this.toRow(r)), total, page, pageSize };
  }

  async detail(id: string): Promise<AcceptanceDetail> {
    const row = await this.getOrThrow(id);
    const items = await this.prisma.acceptanceItem.findMany({
      where: { acceptanceId: id },
      orderBy: { seq: 'asc' },
    });
    return { ...this.toRow(row), items: items.map(toItemRow) };
  }

  async create(dto: CreateAcceptanceDto, user: CurrentUser): Promise<{ id: string; code: string }> {
    await this.assertProject(dto.projectId);
    this.assertItemCount(dto.items);

    // 单据编号规则（业务方案 §10.2）：FAT/SAT-年月日-流水号，前缀即验收类型
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const code = await this.codeGen.next(`${dto.type}-${today}`);

    return this.prisma.acceptance.create({
      data: {
        code,
        type: dto.type,
        title: dto.title.trim(),
        projectId: dto.projectId,
        equipmentNo: dto.equipmentNo?.trim() || null,
        plannedAt: dto.plannedAt ? new Date(dto.plannedAt) : null,
        location: dto.location?.trim() || null,
        customerRep: dto.customerRep?.trim() || null,
        remark: dto.remark?.trim() || null,
        createdById: user.id,
        ...(dto.items?.length ? { items: { create: toItemRows(dto.items) } } : {}),
      },
      select: { id: true, code: true },
    });
  }

  /** 编辑（仅验收中）。检查项全量替换。 */
  async update(id: string, dto: UpdateAcceptanceDto): Promise<void> {
    const row = await this.getOrThrow(id);
    this.assertPending(row.status, '编辑');
    this.assertItemCount(dto.items);

    await this.prisma.$transaction(async (tx) => {
      await tx.acceptance.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.equipmentNo !== undefined ? { equipmentNo: dto.equipmentNo?.trim() || null } : {}),
          ...(dto.plannedAt !== undefined
            ? { plannedAt: dto.plannedAt ? new Date(dto.plannedAt) : null }
            : {}),
          ...(dto.location !== undefined ? { location: dto.location?.trim() || null } : {}),
          ...(dto.customerRep !== undefined ? { customerRep: dto.customerRep?.trim() || null } : {}),
          ...(dto.remark !== undefined ? { remark: dto.remark?.trim() || null } : {}),
        },
      });
      if (dto.items !== undefined) {
        await tx.acceptanceItem.deleteMany({ where: { acceptanceId: id } });
        if (dto.items.length) {
          await tx.acceptanceItem.createMany({
            data: toItemRows(dto.items).map((it) => ({ ...it, acceptanceId: id })),
          });
        }
      }
    });
  }

  /**
   * 出具验收结论（终态，锁定）。
   * PASSED：项目存在未关闭调试问题时拒绝——问题先闭环再通过（§9.8）。
   * CONDITIONAL：conclusion 必填（遗留问题与整改期限），报告中明示。
   */
  async conclude(id: string, dto: ConcludeAcceptanceDto, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    this.assertPending(row.status, '出具结论');

    if (dto.result === AcceptanceStatus.PASSED) {
      const openCount = await this.countOpenIssues(row.projectId);
      if (openCount > 0) {
        throw new AppException(
          ErrorCode.ILLEGAL_STATE_TRANSITION,
          `项目尚有 ${openCount} 个未关闭调试问题，不可出具「通过」结论；请先闭环，或改为「有条件通过」并写明遗留问题`,
          HttpStatus.CONFLICT,
        );
      }
    }
    if (dto.result === AcceptanceStatus.CONDITIONAL && !dto.conclusion?.trim()) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '「有条件通过」必须写明遗留问题与整改期限',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.acceptance.update({
      where: { id },
      data: {
        status: dto.result,
        conclusion: dto.conclusion?.trim() || null,
        concludedById: user.id,
        concludedAt: new Date(),
      },
    });
  }

  /** 作废（仅验收中）。已出结论的单不可作废，验收史实不可抹。 */
  async void(id: string): Promise<void> {
    const row = await this.getOrThrow(id);
    this.assertPending(row.status, '作废');
    await this.prisma.acceptance.update({
      where: { id },
      data: { status: AcceptanceStatus.VOIDED },
    });
  }

  /**
   * 验收报告聚合（M9 验收标准「生成 FAT 报告 PDF」的数据源）。
   * 项目维度一次拼齐：调试记录汇总、调试问题闭环状态、出厂/调试检验结果。
   * 有设备号时调试数据按设备号过滤（同项目多台设备各出各的报告）。
   */
  async report(id: string): Promise<AcceptanceReport> {
    const row = await this.getOrThrow(id);
    const detail = await this.detail(id);

    /// 同项目多设备时按设备号收窄；未填设备号的调试数据始终计入（宁可多列不可漏列）
    const equipmentFilter = row.equipmentNo
      ? { OR: [{ equipmentNo: row.equipmentNo }, { equipmentNo: null }] }
      : {};

    const [project, debugRecords, debugIssues, inspections] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: row.projectId },
        select: {
          code: true,
          name: true,
          customerName: true,
          contractNo: true,
          projectType: true,
          planEndAt: true,
          manager: { select: { displayName: true } },
        },
      }),
      this.prisma.debugRecord.findMany({
        where: { projectId: row.projectId, status: { not: 'VOIDED' }, ...equipmentFilter },
        include: {
          executor: { select: { displayName: true } },
          _count: { select: { params: true } },
          params: { where: { passed: false }, select: { id: true } },
        },
        orderBy: { debugAt: 'asc' },
      }),
      this.prisma.debugIssue.findMany({
        where: { projectId: row.projectId, status: { not: 'VOIDED' }, ...equipmentFilter },
        include: { handler: { select: { displayName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      /// FQC 出厂检验 + DEBUG 调试检验（M8 联动），作废单不进报告
      this.prisma.inspection.findMany({
        where: { projectId: row.projectId, type: { in: ['FQC', 'DEBUG'] }, status: { not: 'VOIDED' } },
        select: { code: true, type: true, title: true, status: true, judgedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    if (!project) {
      throw new AppException(ErrorCode.NOT_FOUND, '所属项目不存在', HttpStatus.NOT_FOUND);
    }

    return {
      acceptance: detail,
      project: {
        code: project.code,
        name: project.name,
        customerName: project.customerName,
        contractNo: project.contractNo,
        projectType: project.projectType,
        managerName: project.manager?.displayName ?? null,
        planEndAt: project.planEndAt?.toISOString() ?? null,
      },
      debugRecords: debugRecords.map((r) => ({
        code: r.code,
        type: r.type as AcceptanceReport['debugRecords'][number]['type'],
        title: r.title,
        status: r.status as AcceptanceReport['debugRecords'][number]['status'],
        executorName: r.executor?.displayName ?? null,
        debugAt: r.debugAt.toISOString(),
        paramCount: r._count.params,
        failedParamCount: r.params.length,
      })),
      debugIssues: debugIssues.map((i) => ({
        code: i.code,
        title: i.title,
        stage: i.stage as AcceptanceReport['debugIssues'][number]['stage'],
        severity: i.severity as AcceptanceReport['debugIssues'][number]['severity'],
        status: i.status as AcceptanceReport['debugIssues'][number]['status'],
        handlerName: i.handler?.displayName ?? null,
        closedAt: i.closedAt?.toISOString() ?? null,
      })),
      openDebugIssueCount: debugIssues.filter((i) => OPEN_ISSUE_STATUSES.includes(i.status)).length,
      inspections: inspections.map((q) => ({
        code: q.code,
        type: q.type as AcceptanceReport['inspections'][number]['type'],
        title: q.title,
        status: q.status as AcceptanceReport['inspections'][number]['status'],
        judgedAt: q.judgedAt?.toISOString() ?? null,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  // ---- 私有辅助 ----

  private countOpenIssues(projectId: string): Promise<number> {
    return this.prisma.debugIssue.count({
      where: { projectId, status: { in: OPEN_ISSUE_STATUSES } },
    });
  }

  private assertPending(status: string, action: string): void {
    if (status !== AcceptanceStatus.PENDING) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        `「${ACCEPTANCE_STATUS_LABEL[status as AcceptanceStatus]}」状态不可${action}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertItemCount(items?: AcceptanceItemDto[]): void {
    if (items && items.length > MAX_ITEMS_PER_ACCEPTANCE) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `检查项最多 ${MAX_ITEMS_PER_ACCEPTANCE} 行`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async assertProject(projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);
  }

  private async getOrThrow(id: string): Promise<AcceptanceWithMeta> {
    const row = await this.prisma.acceptance.findUnique({
      where: { id },
      include: ACCEPTANCE_INCLUDE,
    });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, '验收单不存在', HttpStatus.NOT_FOUND);
    return row;
  }

  private toRow(row: AcceptanceWithMeta): AcceptanceRow {
    return {
      id: row.id,
      code: row.code,
      type: row.type as AcceptanceRow['type'],
      status: row.status as AcceptanceRow['status'],
      projectId: row.projectId,
      projectCode: row.project?.code ?? null,
      projectName: row.project?.name ?? null,
      customerName: row.project?.customerName ?? null,
      equipmentNo: row.equipmentNo,
      title: row.title,
      plannedAt: row.plannedAt?.toISOString() ?? null,
      location: row.location,
      customerRep: row.customerRep,
      conclusion: row.conclusion,
      createdByName: row.createdBy?.displayName ?? null,
      concludedByName: row.concludedBy?.displayName ?? null,
      concludedAt: row.concludedAt?.toISOString() ?? null,
      remark: row.remark,
      itemCount: row._count.items,
      failedItemCount: row.items.length,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function toItemRow(it: {
  id: string;
  seq: number;
  name: string;
  standard: string | null;
  actual: string | null;
  passed: boolean | null;
  remark: string | null;
}): AcceptanceDetail['items'][number] {
  return {
    id: it.id,
    seq: it.seq,
    name: it.name,
    standard: it.standard,
    actual: it.actual,
    passed: it.passed,
    remark: it.remark,
  };
}

function toItemRows(items: AcceptanceItemDto[]): {
  seq: number;
  name: string;
  standard: string | null;
  actual: string | null;
  passed: boolean | null;
  remark: string | null;
}[] {
  return items.map((it, index) => ({
    seq: index + 1,
    name: it.name.trim(),
    standard: it.standard?.trim() || null,
    actual: it.actual?.trim() || null,
    passed: it.passed ?? null,
    remark: it.remark?.trim() || null,
  }));
}
