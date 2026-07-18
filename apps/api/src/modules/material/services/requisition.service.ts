import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCode,
  RequisitionStatus,
  RequisitionType,
  type PageResult,
  type RequisitionRow,
} from '@mes/shared';
import { CodeGeneratorService } from '../../../common/code/code-generator.service';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { CreateRequisitionDto, RequisitionListQueryDto } from '../dto/material.dto';

const REQUISITION_INCLUDE = Prisma.validator<Prisma.RequisitionInclude>()({
  project: { select: { code: true } },
  requestedBy: { select: { displayName: true } },
  confirmedBy: { select: { displayName: true } },
});

type RequisitionWithMeta = Prisma.RequisitionGetPayload<{ include: typeof REQUISITION_INCLUDE }>;

/**
 * 领料/退料（M6）——MES 侧产生的数据（业务方案 §5.1）。
 * 流转：DRAFT →（仓库确认）CONFIRMED / CANCELLED。只有 CONFIRMED 计入齐套。
 */
@Injectable()
export class RequisitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: CodeGeneratorService,
  ) {}

  async list(query: RequisitionListQueryDto): Promise<PageResult<RequisitionRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.RequisitionWhereInput = {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.materialCode ? { materialCode: query.materialCode } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.requisition.count({ where }),
      this.prisma.requisition.findMany({
        where,
        include: REQUISITION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map((r) => this.toRow(r)), total, page, pageSize };
  }

  async create(dto: CreateRequisitionDto, userId: string): Promise<{ id: string; code: string }> {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);

    // 单据编号规则（业务方案 §10.2）：REQ-年月日-流水号
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const code = await this.codeGen.next(`REQ-${today}`);

    return this.prisma.requisition.create({
      data: {
        code,
        projectId: dto.projectId,
        materialCode: dto.materialCode.trim(),
        quantity: new Prisma.Decimal(dto.quantity),
        type: dto.type ?? RequisitionType.ISSUE,
        requestedById: userId,
        remark: dto.remark?.trim() || null,
      },
      select: { id: true, code: true },
    });
  }

  /** 仓库确认。确认后计入齐套的「已领料」。 */
  async confirm(id: string, userId: string): Promise<void> {
    await this.transition(id, RequisitionStatus.CONFIRMED, { confirmedById: userId, confirmedAt: new Date() });
  }

  async cancel(id: string): Promise<void> {
    await this.transition(id, RequisitionStatus.CANCELLED, {});
  }

  // ---- 私有辅助 ----

  private async transition(
    id: string,
    target: RequisitionStatus,
    extra: Prisma.RequisitionUncheckedUpdateInput,
  ): Promise<void> {
    const row = await this.prisma.requisition.findUnique({ where: { id }, select: { status: true } });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, '领料单不存在', HttpStatus.NOT_FOUND);
    if (row.status !== RequisitionStatus.DRAFT) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '仅待确认的领料单可操作',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.requisition.update({ where: { id }, data: { status: target, ...extra } });
  }

  private toRow(row: RequisitionWithMeta): RequisitionRow {
    return {
      id: row.id,
      code: row.code,
      projectId: row.projectId,
      projectCode: row.project.code,
      materialCode: row.materialCode,
      materialName: null, // 列表页由前端按需求不展示或后续冗余
      quantity: Number(row.quantity),
      type: row.type as RequisitionType,
      status: row.status as RequisitionStatus,
      requestedByName: row.requestedBy?.displayName ?? null,
      confirmedByName: row.confirmedBy?.displayName ?? null,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      remark: row.remark,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
