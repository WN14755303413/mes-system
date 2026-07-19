import type { Readable } from 'node:stream';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEBUG_RECORD_STATUS_LABEL,
  DebugRecordStatus,
  ErrorCode,
  type AttachmentItem,
  type CurrentUser,
  type DebugRecordDetail,
  type DebugRecordRow,
  type PageResult,
} from '@mes/shared';
import { CodeGeneratorService } from '../../../common/code/code-generator.service';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { QcPhotoService } from '../../quality/services/qc-photo.service';
import type {
  CreateDebugRecordDto,
  DebugParamDto,
  DebugRecordListQueryDto,
  UpdateDebugRecordDto,
} from '../dto/debug.dto';

/** 附件表上调试记录的对象类型标识（sys_attachment 建表注释里的预留值）。 */
const ATTACHMENT_TARGET = 'DEBUG_RECORD';
const PHOTO_KEY_PREFIX = 'debug-records';
const MAX_PARAMS_PER_RECORD = 200;

const RECORD_INCLUDE = Prisma.validator<Prisma.DebugRecordInclude>()({
  project: { select: { code: true, name: true } },
  executor: { select: { displayName: true } },
  completedBy: { select: { displayName: true } },
  _count: { select: { params: true } },
  /// 未达标行与未关闭问题单独取（列表列 + 报告统计）
  params: { where: { passed: false }, select: { id: true } },
  issues: { where: { status: { in: ['OPEN', 'HANDLING', 'RECHECKING'] } }, select: { id: true } },
});
type RecordWithMeta = Prisma.DebugRecordGetPayload<{ include: typeof RECORD_INCLUDE }>;

/**
 * 调试记录（M9，业务方案 §8.8）。
 *
 * 生命周期：创建即调试中（现场动作无草稿态）→ 完成即锁定；错了作废重录。
 * 电气/软件/工艺三类记录同一张表按 type 区分——字段结构完全一致，
 * 分表只会让「按项目汇总调试进度」变成三次查询。
 */
@Injectable()
export class DebugRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: CodeGeneratorService,
    private readonly photos: QcPhotoService,
  ) {}

  async list(query: DebugRecordListQueryDto): Promise<PageResult<DebugRecordRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.DebugRecordWhereInput = {
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
      this.prisma.debugRecord.count({ where }),
      this.prisma.debugRecord.findMany({
        where,
        include: RECORD_INCLUDE,
        orderBy: { debugAt: 'desc' },
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

  async detail(id: string): Promise<DebugRecordDetail> {
    const row = await this.getOrThrow(id);
    const [params, photos, issues] = await Promise.all([
      this.prisma.debugParam.findMany({ where: { recordId: id }, orderBy: { seq: 'asc' } }),
      this.photos.listByTarget(ATTACHMENT_TARGET, id),
      this.prisma.debugIssue.findMany({
        where: { recordId: id },
        select: { id: true, code: true, title: true, status: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      ...this.toRow(row, photos.length),
      params: params.map((p) => ({
        id: p.id,
        seq: p.seq,
        name: p.name,
        standard: p.standard,
        actual: p.actual,
        unit: p.unit,
        passed: p.passed,
        remark: p.remark,
      })),
      photos,
      issues: issues.map((i) => ({
        id: i.id,
        code: i.code,
        title: i.title,
        status: i.status as DebugRecordDetail['issues'][number]['status'],
      })),
    };
  }

  async create(dto: CreateDebugRecordDto, user: CurrentUser): Promise<{ id: string; code: string }> {
    await this.assertProject(dto.projectId);
    const executorId = await this.resolveExecutor(dto.executorId, user);
    this.assertParamCount(dto.params);

    // 单据编号规则（业务方案 §10.2）：DBG-年月日-流水号
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const code = await this.codeGen.next(`DBG-${today}`);

    return this.prisma.debugRecord.create({
      data: {
        code,
        type: dto.type,
        title: dto.title.trim(),
        projectId: dto.projectId,
        equipmentNo: dto.equipmentNo?.trim() || null,
        content: dto.content?.trim() || null,
        executorId,
        ...(dto.debugAt ? { debugAt: new Date(dto.debugAt) } : {}),
        remark: dto.remark?.trim() || null,
        ...(dto.params?.length ? { params: { create: this.toParamRows(dto.params) } } : {}),
      },
      select: { id: true, code: true },
    });
  }

  /** 编辑（仅调试中）。参数明细全量替换——行数少，替换比 diff 简单可靠。 */
  async update(id: string, dto: UpdateDebugRecordDto): Promise<void> {
    const row = await this.getOrThrow(id);
    this.assertInProgress(row.status, '编辑');
    this.assertParamCount(dto.params);
    if (dto.executorId) {
      await this.assertUser(dto.executorId, '调试人');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.debugRecord.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.equipmentNo !== undefined ? { equipmentNo: dto.equipmentNo?.trim() || null } : {}),
          ...(dto.content !== undefined ? { content: dto.content?.trim() || null } : {}),
          ...(dto.executorId !== undefined ? { executorId: dto.executorId || null } : {}),
          ...(dto.debugAt !== undefined && dto.debugAt ? { debugAt: new Date(dto.debugAt) } : {}),
          ...(dto.remark !== undefined ? { remark: dto.remark?.trim() || null } : {}),
        },
      });
      if (dto.params !== undefined) {
        await tx.debugParam.deleteMany({ where: { recordId: id } });
        if (dto.params.length) {
          await tx.debugParam.createMany({
            data: this.toParamRows(dto.params).map((p) => ({ ...p, recordId: id })),
          });
        }
      }
    });
  }

  /** 完成调试：锁定单头与参数。调试期问题不阻塞完成——问题闭环由调试问题清单负责。 */
  async complete(id: string, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    this.assertInProgress(row.status, '完成');

    await this.prisma.debugRecord.update({
      where: { id },
      data: {
        status: DebugRecordStatus.COMPLETED,
        completedById: user.id,
        completedAt: new Date(),
      },
    });
  }

  /** 作废（错录/重录）。任何非终态可作废；已完成的单不可作废，保执行史实。 */
  async void(id: string): Promise<void> {
    const row = await this.getOrThrow(id);
    this.assertInProgress(row.status, '作废');

    await this.prisma.debugRecord.update({
      where: { id },
      data: { status: DebugRecordStatus.VOIDED },
    });
  }

  // ============ 照片 ============

  async uploadPhoto(
    id: string,
    file: Express.Multer.File,
    user: CurrentUser,
  ): Promise<AttachmentItem> {
    const row = await this.getOrThrow(id);
    this.assertInProgress(row.status, '上传照片');
    return this.photos.upload(ATTACHMENT_TARGET, id, PHOTO_KEY_PREFIX, file, user.id);
  }

  async downloadPhoto(
    attachmentId: string,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string; fileSize: number }> {
    const attachment = await this.photos.findOrThrow(attachmentId, ATTACHMENT_TARGET);
    return this.photos.stream(attachment);
  }

  // ---- 私有辅助 ----

  private assertInProgress(status: string, action: string): void {
    if (status !== DebugRecordStatus.IN_PROGRESS) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        `「${DEBUG_RECORD_STATUS_LABEL[status as DebugRecordStatus]}」状态不可${action}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertParamCount(params?: DebugParamDto[]): void {
    if (params && params.length > MAX_PARAMS_PER_RECORD) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `参数明细最多 ${MAX_PARAMS_PER_RECORD} 行`,
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

  private async assertUser(userId: string, label: string): Promise<void> {
    const found = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!found) {
      throw new AppException(ErrorCode.NOT_FOUND, `${label}不存在或已停用`, HttpStatus.NOT_FOUND);
    }
  }

  private async resolveExecutor(
    executorId: string | null | undefined,
    user: CurrentUser,
  ): Promise<string> {
    if (!executorId || executorId === user.id) return user.id;
    await this.assertUser(executorId, '调试人');
    return executorId;
  }

  private toParamRows(params: DebugParamDto[]): {
    seq: number;
    name: string;
    standard: string | null;
    actual: string | null;
    unit: string | null;
    passed: boolean | null;
    remark: string | null;
  }[] {
    return params.map((p, index) => ({
      seq: index + 1,
      name: p.name.trim(),
      standard: p.standard?.trim() || null,
      actual: p.actual?.trim() || null,
      unit: p.unit?.trim() || null,
      passed: p.passed ?? null,
      remark: p.remark?.trim() || null,
    }));
  }

  private async getOrThrow(id: string): Promise<RecordWithMeta> {
    const row = await this.prisma.debugRecord.findUnique({ where: { id }, include: RECORD_INCLUDE });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, '调试记录不存在', HttpStatus.NOT_FOUND);
    return row;
  }

  private toRow(row: RecordWithMeta, photoCount: number): DebugRecordRow {
    return {
      id: row.id,
      code: row.code,
      type: row.type as DebugRecordRow['type'],
      status: row.status as DebugRecordRow['status'],
      projectId: row.projectId,
      projectCode: row.project?.code ?? null,
      projectName: row.project?.name ?? null,
      equipmentNo: row.equipmentNo,
      title: row.title,
      content: row.content,
      executorId: row.executorId,
      executorName: row.executor?.displayName ?? null,
      debugAt: row.debugAt.toISOString(),
      completedByName: row.completedBy?.displayName ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      remark: row.remark,
      paramCount: row._count.params,
      failedParamCount: row.params.length,
      openIssueCount: row.issues.length,
      photoCount,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
