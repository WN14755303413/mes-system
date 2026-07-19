import type { Readable } from 'node:stream';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCode,
  INSPECTION_STATUS_LABEL,
  INSPECTION_TYPE_LABEL,
  INSPECTION_TYPE_META,
  InspectionStatus,
  type AttachmentItem,
  type CurrentUser,
  type InspectionDetail,
  type InspectionRow,
  type JudgeInspectionResult,
  type PageResult,
} from '@mes/shared';
import { CodeGeneratorService } from '../../../common/code/code-generator.service';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  CreateInspectionDto,
  InspectionItemDto,
  InspectionListQueryDto,
  JudgeInspectionDto,
  UpdateInspectionDto,
} from '../dto/quality.dto';
import { IssueService } from './issue.service';
import { QcPhotoService } from './qc-photo.service';

/** 附件表上检验单的对象类型标识（sys_attachment 建表注释里的预留值）。 */
const ATTACHMENT_TARGET = 'INSPECTION';
const PHOTO_KEY_PREFIX = 'inspections';
const MAX_ITEMS_PER_INSPECTION = 100;

const INSPECTION_INCLUDE = Prisma.validator<Prisma.InspectionInclude>()({
  project: { select: { code: true, name: true } },
  workOrder: { select: { code: true } },
  task: { select: { name: true } },
  inspector: { select: { displayName: true } },
  judgedBy: { select: { displayName: true } },
  _count: { select: { items: true } },
  /// 不合格行单独取（追溯列 + 自动生成问题单的描述来源）
  items: { where: { passed: false }, select: { id: true } },
});
type InspectionWithMeta = Prisma.InspectionGetPayload<{ include: typeof INSPECTION_INCLUDE }>;

/**
 * 检验单（M8，业务方案 §8.7 五类检验）。
 *
 * 生命周期极简：PENDING 待检（可编辑）→ judge 判定即终态（锁定）。
 * 判定不合格时在同一事务内强制生成质量问题单（§9.7），闭环不遗漏。
 * 必填关联维度按类型查 shared INSPECTION_TYPE_META——前后端同一张表。
 */
@Injectable()
export class InspectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: CodeGeneratorService,
    private readonly photos: QcPhotoService,
    private readonly issues: IssueService,
  ) {}

  async list(query: InspectionListQueryDto): Promise<PageResult<InspectionRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.InspectionWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.keyword
        ? {
            OR: [
              { code: { contains: query.keyword, mode: 'insensitive' } },
              { title: { contains: query.keyword, mode: 'insensitive' } },
              { materialCode: { contains: query.keyword, mode: 'insensitive' } },
              { batchNo: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.inspection.count({ where }),
      this.prisma.inspection.findMany({
        where,
        include: INSPECTION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const photoCounts = await this.photos.countByTargets(
      ATTACHMENT_TARGET,
      rows.map((r) => r.id),
    );

    return {
      items: rows.map((r) => this.toRow(r, photoCounts.get(r.id) ?? 0)),
      total,
      page,
      pageSize,
    };
  }

  async detail(id: string): Promise<InspectionDetail> {
    const row = await this.getOrThrow(id);
    const [items, photos, issues] = await Promise.all([
      this.prisma.inspectionItem.findMany({ where: { inspectionId: id }, orderBy: { seq: 'asc' } }),
      this.photos.listByTarget(ATTACHMENT_TARGET, id),
      this.prisma.qualityIssue.findMany({
        where: { inspectionId: id },
        select: { id: true, code: true, status: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      ...this.toRow(row, photos.length),
      items: items.map((it) => ({
        id: it.id,
        seq: it.seq,
        name: it.name,
        standard: it.standard,
        actual: it.actual,
        passed: it.passed,
        remark: it.remark,
      })),
      photos,
      issues: issues.map((i) => ({
        id: i.id,
        code: i.code,
        status: i.status as InspectionDetail['issues'][number]['status'],
      })),
    };
  }

  /**
   * 创建检验单。必填关联维度按类型校验（INSPECTION_TYPE_META）；
   * 带任务/工单时归属反查（学 M7 异常单）；带到货记录时物料/项目自动带出。
   */
  async create(dto: CreateInspectionDto, user: CurrentUser): Promise<{ id: string; code: string }> {
    const linkage = await this.resolveLinkage(dto);
    this.assertRequiredDimensions(dto.type, linkage);
    this.assertItemCount(dto.items);

    // 单据编号规则（业务方案 §10.2）：QC-年月日-流水号
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const code = await this.codeGen.next(`QC-${today}`);

    return this.prisma.inspection.create({
      data: {
        code,
        type: dto.type,
        title: dto.title.trim(),
        projectId: linkage.projectId,
        workOrderId: linkage.workOrderId,
        taskId: linkage.taskId,
        arrivalId: linkage.arrivalId,
        materialCode: linkage.materialCode,
        batchNo: dto.batchNo?.trim() || null,
        supplierName: dto.supplierName?.trim() || null,
        remark: dto.remark?.trim() || null,
        inspectorId: user.id,
        ...(dto.items?.length ? { items: { create: this.toItemRows(dto.items) } } : {}),
      },
      select: { id: true, code: true },
    });
  }

  /** 编辑（仅待检态）。明细行全量替换——行数少，替换比 diff 简单可靠。 */
  async update(id: string, dto: UpdateInspectionDto): Promise<void> {
    const row = await this.getOrThrow(id);
    this.assertPending(row.status, '编辑');
    this.assertItemCount(dto.items);

    await this.prisma.$transaction(async (tx) => {
      await tx.inspection.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.materialCode !== undefined
            ? { materialCode: dto.materialCode?.trim() || null }
            : {}),
          ...(dto.batchNo !== undefined ? { batchNo: dto.batchNo?.trim() || null } : {}),
          ...(dto.supplierName !== undefined
            ? { supplierName: dto.supplierName?.trim() || null }
            : {}),
          ...(dto.remark !== undefined ? { remark: dto.remark?.trim() || null } : {}),
        },
      });
      if (dto.items !== undefined) {
        await tx.inspectionItem.deleteMany({ where: { inspectionId: id } });
        if (dto.items.length) {
          await tx.inspectionItem.createMany({
            data: this.toItemRows(dto.items).map((it) => ({ ...it, inspectionId: id })),
          });
        }
      }
    });
  }

  /**
   * 判定（检验单唯一的状态动作，判定即终态）。
   * 不合格时同一事务内自动生成质量问题单并返回其编号——
   * 检验单进终态与问题单产生要么都发生要么都不发生（§9.7 闭环不遗漏）。
   */
  async judge(id: string, dto: JudgeInspectionDto, user: CurrentUser): Promise<JudgeInspectionResult> {
    const row = await this.getOrThrow(id);
    this.assertPending(row.status, '判定');

    const judgeData = {
      status: dto.result,
      judgedById: user.id,
      judgedAt: new Date(),
      ...(dto.remark?.trim()
        ? { remark: row.remark ? `${row.remark}\n[判定] ${dto.remark.trim()}` : `[判定] ${dto.remark.trim()}` }
        : {}),
    };

    if (dto.result === InspectionStatus.PASSED) {
      await this.prisma.inspection.update({ where: { id }, data: judgeData });
      return { ok: true };
    }

    const failedItems = await this.prisma.inspectionItem.findMany({
      where: { inspectionId: id, passed: false },
      orderBy: { seq: 'asc' },
      select: { name: true, standard: true, actual: true },
    });

    const issue = await this.prisma.$transaction(async (tx) => {
      await tx.inspection.update({ where: { id }, data: judgeData });
      return this.issues.createFromInspectionTx(
        tx,
        {
          inspectionId: id,
          inspectionCode: row.code,
          inspectionTitle: row.title,
          projectId: row.projectId,
          workOrderId: row.workOrderId,
          taskId: row.taskId,
          materialCode: row.materialCode,
          batchNo: row.batchNo,
          supplierName: row.supplierName,
          failedItems,
          judgeRemark: dto.remark?.trim() || null,
        },
        user.id,
      );
    });

    return { ok: true, issueId: issue.id, issueCode: issue.code };
  }

  /** 作废（仅待检态；误建单据）。已判定的检验记录不可作废——它已是质量档案。 */
  async void(id: string): Promise<void> {
    const row = await this.getOrThrow(id);
    this.assertPending(row.status, '作废');
    await this.prisma.inspection.update({
      where: { id },
      data: { status: InspectionStatus.VOIDED },
    });
  }

  // ============ 照片 ============

  /**
   * 上传检验照片。已作废不可传；已判定仍可补传——照片是佐证材料，
   * 补充佐证不改变判定结论（判定结论与明细在终态锁定）。
   */
  async uploadPhoto(
    id: string,
    file: Express.Multer.File,
    user: CurrentUser,
  ): Promise<AttachmentItem> {
    const row = await this.getOrThrow(id);
    if (row.status === InspectionStatus.VOIDED) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '检验单已作废，不可上传照片',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.photos.upload(ATTACHMENT_TARGET, id, PHOTO_KEY_PREFIX, file, user.id);
  }

  /** 照片下载/预览。可见性同检验单（inspection:read 在控制器拦截，无行级收窄）。 */
  async downloadPhoto(
    attachmentId: string,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string; fileSize: number }> {
    const attachment = await this.photos.findOrThrow(attachmentId, ATTACHMENT_TARGET);
    return this.photos.stream(attachment);
  }

  // ---- 私有辅助 ----

  private assertPending(status: string, action: string): void {
    if (status !== InspectionStatus.PENDING) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        `「${INSPECTION_STATUS_LABEL[status as InspectionStatus]}」状态的检验单不可${action}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertItemCount(items?: InspectionItemDto[]): void {
    if (items && items.length > MAX_ITEMS_PER_INSPECTION) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `检验项明细最多 ${MAX_ITEMS_PER_INSPECTION} 行`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** 按类型断言必填关联维度（shared INSPECTION_TYPE_META，与前端同表）。 */
  private assertRequiredDimensions(
    type: CreateInspectionDto['type'],
    linkage: { projectId: string | null; workOrderId: string | null; materialCode: string | null },
  ): void {
    for (const field of INSPECTION_TYPE_META[type].requires) {
      if (!linkage[field]) {
        const label = { projectId: '项目', workOrderId: '工单', materialCode: '物料编码' }[field];
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          `${INSPECTION_TYPE_LABEL[type]}必须关联${label}`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  /**
   * 关联归属反查：任务 → 工单 → 项目（防止前端拼错归属，学 M7 异常单）；
   * 到货记录带出物料编码与项目（未显式指定时）。
   */
  private async resolveLinkage(dto: CreateInspectionDto): Promise<{
    projectId: string | null;
    workOrderId: string | null;
    taskId: string | null;
    arrivalId: string | null;
    materialCode: string | null;
  }> {
    let projectId = dto.projectId ?? null;
    let workOrderId = dto.workOrderId ?? null;
    const taskId = dto.taskId ?? null;
    const arrivalId = dto.arrivalId ?? null;
    let materialCode = dto.materialCode?.trim() || null;

    if (taskId) {
      const task = await this.prisma.assemblyTask.findUnique({
        where: { id: taskId },
        select: { workOrderId: true, workOrder: { select: { projectId: true } } },
      });
      if (!task) throw new AppException(ErrorCode.NOT_FOUND, '关联任务不存在', HttpStatus.NOT_FOUND);
      workOrderId = task.workOrderId;
      projectId = task.workOrder.projectId;
    } else if (workOrderId) {
      const wo = await this.prisma.workOrder.findUnique({
        where: { id: workOrderId },
        select: { projectId: true },
      });
      if (!wo) throw new AppException(ErrorCode.NOT_FOUND, '关联工单不存在', HttpStatus.NOT_FOUND);
      projectId = wo.projectId;
    }

    if (arrivalId) {
      const arrival = await this.prisma.arrival.findUnique({
        where: { id: arrivalId },
        select: { materialCode: true, projectId: true },
      });
      if (!arrival) {
        throw new AppException(ErrorCode.NOT_FOUND, '关联到货记录不存在', HttpStatus.NOT_FOUND);
      }
      materialCode = materialCode ?? arrival.materialCode;
      projectId = projectId ?? arrival.projectId;
    }

    if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: { id: true },
      });
      if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);
    }

    return { projectId, workOrderId, taskId, arrivalId, materialCode };
  }

  private toItemRows(items: InspectionItemDto[]): {
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

  private async getOrThrow(id: string): Promise<InspectionWithMeta> {
    const row = await this.prisma.inspection.findUnique({
      where: { id },
      include: INSPECTION_INCLUDE,
    });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, '检验单不存在', HttpStatus.NOT_FOUND);
    return row;
  }

  private toRow(row: InspectionWithMeta, photoCount: number): InspectionRow {
    return {
      id: row.id,
      code: row.code,
      type: row.type as InspectionRow['type'],
      status: row.status as InspectionRow['status'],
      projectId: row.projectId,
      projectCode: row.project?.code ?? null,
      projectName: row.project?.name ?? null,
      workOrderId: row.workOrderId,
      workOrderCode: row.workOrder?.code ?? null,
      taskId: row.taskId,
      taskName: row.task?.name ?? null,
      arrivalId: row.arrivalId,
      materialCode: row.materialCode,
      batchNo: row.batchNo,
      supplierName: row.supplierName,
      title: row.title,
      inspectorId: row.inspectorId,
      inspectorName: row.inspector?.displayName ?? null,
      judgedByName: row.judgedBy?.displayName ?? null,
      judgedAt: row.judgedAt?.toISOString() ?? null,
      remark: row.remark,
      itemCount: row._count.items,
      failedItemCount: row.items.length,
      photoCount,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
