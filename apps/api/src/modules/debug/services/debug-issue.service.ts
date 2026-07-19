import type { Readable } from 'node:stream';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEBUG_ISSUE_ACTION_LABEL,
  DEBUG_ISSUE_ACTION_RULES,
  DEBUG_ISSUE_STATUS_LABEL,
  DebugIssueActionType,
  DebugIssueStatus,
  ErrorCode,
  Permission,
  type AttachmentItem,
  type CurrentUser,
  type DebugIssueDetail,
  type DebugIssueRow,
  type PageResult,
} from '@mes/shared';
import { CodeGeneratorService } from '../../../common/code/code-generator.service';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { QcPhotoService } from '../../quality/services/qc-photo.service';
import type {
  AssignDebugIssueDto,
  CreateDebugIssueDto,
  DebugIssueListQueryDto,
  RecheckDebugIssueDto,
  SubmitDebugIssueDto,
  UpdateDebugIssueDto,
  VoidDebugIssueDto,
} from '../dto/debug.dto';

/** 附件表上调试问题的对象类型标识。 */
const ATTACHMENT_TARGET = 'DEBUG_ISSUE';
const PHOTO_KEY_PREFIX = 'debug-issues';

const ISSUE_INCLUDE = Prisma.validator<Prisma.DebugIssueInclude>()({
  project: { select: { code: true, name: true } },
  record: { select: { code: true } },
  reporter: { select: { displayName: true } },
  handler: { select: { displayName: true } },
  closedBy: { select: { displayName: true } },
});
type IssueWithMeta = Prisma.DebugIssueGetPayload<{ include: typeof ISSUE_INCLUDE }>;

/**
 * 调试问题（M9，§8.8 问题清单 + 多轮整改复测）。
 *
 * 与 M8 质量问题单同构：可见性分层（有 debug:read 看全部，其余只见自己
 * 发起或负责的，越权 detail 一律 404）；状态流转唯一依据 shared
 * DEBUG_ISSUE_ACTION_RULES，动作全部落 debug_issue_action 日志。
 * FAT/SAT 现场发现的问题也走本清单（stage 区分），验收「通过」门禁据此统计。
 */
@Injectable()
export class DebugIssueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: CodeGeneratorService,
    private readonly photos: QcPhotoService,
  ) {}

  private canSeeAll(user: CurrentUser): boolean {
    return user.permissions.includes(Permission.DEBUG_READ);
  }

  private canWrite(user: CurrentUser): boolean {
    return user.permissions.includes(Permission.DEBUG_WRITE);
  }

  private mineFilter(userId: string): Prisma.DebugIssueWhereInput {
    return { OR: [{ reporterId: userId }, { handlerId: userId }] };
  }

  async list(query: DebugIssueListQueryDto, user: CurrentUser): Promise<PageResult<DebugIssueRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const restrictToMine = query.onlyMine || !this.canSeeAll(user);
    const where: Prisma.DebugIssueWhereInput = {
      ...(restrictToMine ? this.mineFilter(user.id) : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.recordId ? { recordId: query.recordId } : {}),
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
      this.prisma.debugIssue.count({ where }),
      this.prisma.debugIssue.findMany({
        where,
        include: ISSUE_INCLUDE,
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

  async detail(id: string, user: CurrentUser): Promise<DebugIssueDetail> {
    const row = await this.getVisibleOrThrow(id, user);
    const [actions, photos] = await Promise.all([
      this.prisma.debugIssueAction.findMany({
        where: { issueId: id },
        include: { operator: { select: { displayName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.photos.listByTarget(ATTACHMENT_TARGET, id),
    ]);
    return {
      ...this.toRow(row, photos.length),
      actions: actions.map((a) => ({
        id: a.id,
        type: a.type as DebugIssueActionType,
        note: a.note,
        operatorName: a.operator?.displayName ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
      photos,
    };
  }

  /** 发起调试问题。关联调试记录时项目/设备号以后端反查为准，防止前端拼错。 */
  async create(dto: CreateDebugIssueDto, user: CurrentUser): Promise<{ id: string; code: string }> {
    const linked = await this.resolveLinkage(dto);

    // 单据编号规则（业务方案 §10.2）：DI-年月日-流水号
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const code = await this.codeGen.next(`DI-${today}`);

    return this.prisma.$transaction(async (tx) => {
      const issue = await tx.debugIssue.create({
        data: {
          code,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          severity: dto.severity ?? 'MEDIUM',
          stage: dto.stage ?? 'DEBUG',
          projectId: linked.projectId,
          recordId: linked.recordId,
          equipmentNo: linked.equipmentNo,
          reporterId: user.id,
        },
        select: { id: true, code: true },
      });
      await tx.debugIssueAction.create({
        data: { issueId: issue.id, type: DebugIssueActionType.CREATE, operatorId: user.id },
      });
      return issue;
    });
  }

  /** 编辑基础信息与整改措施。写权限或责任人本人；终态锁定。 */
  async update(id: string, dto: UpdateDebugIssueDto, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    if (!this.canWrite(user) && row.handlerId !== user.id) {
      throw new AppException(ErrorCode.FORBIDDEN, '无权编辑该调试问题', HttpStatus.FORBIDDEN);
    }
    this.assertNotFinal(row.status);

    await this.prisma.debugIssue.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
        ...(dto.stage !== undefined ? { stage: dto.stage } : {}),
        ...(dto.equipmentNo !== undefined ? { equipmentNo: dto.equipmentNo?.trim() || null } : {}),
        ...(dto.solution !== undefined ? { solution: dto.solution?.trim() || null } : {}),
      },
    });
  }

  /** 分派/改派责任人。调试问题的责任方常是设计/软件——责任人可以是任何角色。 */
  async assign(id: string, dto: AssignDebugIssueDto, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    const to = this.assertAction(row.status, DebugIssueActionType.ASSIGN);

    const handler = await this.prisma.user.findFirst({
      where: { id: dto.handlerId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, displayName: true },
    });
    if (!handler) {
      throw new AppException(ErrorCode.NOT_FOUND, '责任人不存在或已停用', HttpStatus.NOT_FOUND);
    }

    await this.prisma.$transaction([
      this.prisma.debugIssue.update({
        where: { id },
        data: { handlerId: handler.id, status: to },
      }),
      this.prisma.debugIssueAction.create({
        data: {
          issueId: id,
          type: DebugIssueActionType.ASSIGN,
          note: joinNote(`分派给 ${handler.displayName}`, dto.note),
          operatorId: user.id,
        },
      }),
    ]);
  }

  /** 责任人提交整改：可同时更新整改措施，流转到待复测。 */
  async submit(id: string, dto: SubmitDebugIssueDto, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    if (row.handlerId !== user.id && !this.canWrite(user)) {
      throw new AppException(ErrorCode.FORBIDDEN, '只有责任人可以提交整改', HttpStatus.FORBIDDEN);
    }
    const to = this.assertAction(row.status, DebugIssueActionType.SUBMIT);

    await this.prisma.$transaction([
      this.prisma.debugIssue.update({
        where: { id },
        data: {
          status: to,
          ...(dto.solution !== undefined ? { solution: dto.solution?.trim() || null } : {}),
        },
      }),
      this.prisma.debugIssueAction.create({
        data: {
          issueId: id,
          type: DebugIssueActionType.SUBMIT,
          note: dto.note.trim(),
          operatorId: user.id,
        },
      }),
    ]);
  }

  /** 复测（§8.8 整改复测）：通过即关闭，不通过退回整改中。 */
  async recheck(id: string, dto: RecheckDebugIssueDto, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    const action = dto.pass
      ? DebugIssueActionType.RECHECK_PASS
      : DebugIssueActionType.RECHECK_FAIL;
    const to = this.assertAction(row.status, action);

    await this.prisma.$transaction([
      this.prisma.debugIssue.update({
        where: { id },
        data: {
          status: to,
          ...(dto.pass ? { closedById: user.id, closedAt: new Date() } : {}),
        },
      }),
      this.prisma.debugIssueAction.create({
        data: { issueId: id, type: action, note: dto.note?.trim() || null, operatorId: user.id },
      }),
    ]);
  }

  /** 作废（误报）。与正常关闭区分，统计与验收门禁均剔除。 */
  async void(id: string, dto: VoidDebugIssueDto, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    const to = this.assertAction(row.status, DebugIssueActionType.VOID);

    await this.prisma.$transaction([
      this.prisma.debugIssue.update({
        where: { id },
        data: { status: to, closedById: user.id, closedAt: new Date() },
      }),
      this.prisma.debugIssueAction.create({
        data: {
          issueId: id,
          type: DebugIssueActionType.VOID,
          note: dto.note?.trim() || null,
          operatorId: user.id,
        },
      }),
    ]);
  }

  // ============ 照片 ============

  /** 相关人（发起人/责任人）或有写权限者可传；终态锁定。 */
  async uploadPhoto(
    id: string,
    file: Express.Multer.File,
    user: CurrentUser,
  ): Promise<AttachmentItem> {
    const row = await this.getOrThrow(id);
    const allowed = row.reporterId === user.id || row.handlerId === user.id || this.canWrite(user);
    if (!allowed) {
      throw new AppException(ErrorCode.FORBIDDEN, '无权为该问题上传照片', HttpStatus.FORBIDDEN);
    }
    this.assertNotFinal(row.status);
    return this.photos.upload(ATTACHMENT_TARGET, id, PHOTO_KEY_PREFIX, file, user.id);
  }

  /** 照片下载/预览。可见性与问题一致。 */
  async downloadPhoto(
    attachmentId: string,
    user: CurrentUser,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string; fileSize: number }> {
    const attachment = await this.photos.findOrThrow(attachmentId, ATTACHMENT_TARGET);
    await this.getVisibleOrThrow(attachment.targetId, user);
    return this.photos.stream(attachment);
  }

  // ---- 私有辅助 ----

  /** 按动作规则表断言当前状态允许该动作，返回目标状态。 */
  private assertAction(
    status: string,
    action: Exclude<DebugIssueActionType, 'CREATE'>,
  ): DebugIssueStatus {
    const rule = DEBUG_ISSUE_ACTION_RULES[action];
    if (!rule.from.includes(status as DebugIssueStatus)) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        `「${DEBUG_ISSUE_STATUS_LABEL[status as DebugIssueStatus]}」状态不可执行「${DEBUG_ISSUE_ACTION_LABEL[action]}」`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return rule.to;
  }

  private assertNotFinal(status: string): void {
    if (status === DebugIssueStatus.CLOSED || status === DebugIssueStatus.VOIDED) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        `「${DEBUG_ISSUE_STATUS_LABEL[status as DebugIssueStatus]}」状态已锁定，不可修改`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** 关联反查：带调试记录时项目/设备号以记录为准；仅带项目时校验项目存在。 */
  private async resolveLinkage(dto: {
    projectId?: string | null;
    recordId?: string | null;
    equipmentNo?: string | null;
  }): Promise<{ projectId: string; recordId: string | null; equipmentNo: string | null }> {
    if (dto.recordId) {
      const record = await this.prisma.debugRecord.findUnique({
        where: { id: dto.recordId },
        select: { id: true, projectId: true, equipmentNo: true },
      });
      if (!record) {
        throw new AppException(ErrorCode.NOT_FOUND, '关联调试记录不存在', HttpStatus.NOT_FOUND);
      }
      return {
        projectId: record.projectId,
        recordId: record.id,
        equipmentNo: dto.equipmentNo?.trim() || record.equipmentNo,
      };
    }

    if (!dto.projectId) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '调试问题必须关联项目或调试记录',
        HttpStatus.BAD_REQUEST,
      );
    }
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);
    return {
      projectId: dto.projectId,
      recordId: null,
      equipmentNo: dto.equipmentNo?.trim() || null,
    };
  }

  private async getOrThrow(id: string): Promise<IssueWithMeta> {
    const row = await this.prisma.debugIssue.findUnique({ where: { id }, include: ISSUE_INCLUDE });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, '调试问题不存在', HttpStatus.NOT_FOUND);
    return row;
  }

  /** 读场景可见性：无 debug:read 者只可见自己相关的问题，其余一律 404 不暴露存在性。 */
  private async getVisibleOrThrow(id: string, user: CurrentUser): Promise<IssueWithMeta> {
    const row = await this.getOrThrow(id);
    if (!this.canSeeAll(user) && row.reporterId !== user.id && row.handlerId !== user.id) {
      throw new AppException(ErrorCode.NOT_FOUND, '调试问题不存在', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  private toRow(row: IssueWithMeta, photoCount: number): DebugIssueRow {
    return {
      id: row.id,
      code: row.code,
      status: row.status as DebugIssueRow['status'],
      severity: row.severity as DebugIssueRow['severity'],
      stage: row.stage as DebugIssueRow['stage'],
      projectId: row.projectId,
      projectCode: row.project?.code ?? null,
      projectName: row.project?.name ?? null,
      recordId: row.recordId,
      recordCode: row.record?.code ?? null,
      equipmentNo: row.equipmentNo,
      title: row.title,
      description: row.description,
      solution: row.solution,
      reporterId: row.reporterId,
      reporterName: row.reporter?.displayName ?? null,
      handlerId: row.handlerId,
      handlerName: row.handler?.displayName ?? null,
      closedByName: row.closedBy?.displayName ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      photoCount,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function joinNote(prefix: string, note?: string | null): string {
  const extra = note?.trim();
  return extra ? `${prefix}：${extra}` : prefix;
}
