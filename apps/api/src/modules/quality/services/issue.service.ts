import type { Readable } from 'node:stream';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCode,
  ISSUE_ACTION_RULES,
  IssueSource,
  Permission,
  QUALITY_ISSUE_ACTION_LABEL,
  QUALITY_ISSUE_STATUS_LABEL,
  QualityIssueActionType,
  QualityIssueStatus,
  type AttachmentItem,
  type CurrentUser,
  type PageResult,
  type QualityIssueDetail,
  type QualityIssueRow,
} from '@mes/shared';
import { CodeGeneratorService } from '../../../common/code/code-generator.service';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  AssignQualityIssueDto,
  CreateQualityIssueDto,
  QualityIssueListQueryDto,
  RecheckQualityIssueDto,
  SubmitQualityIssueDto,
  UpdateQualityIssueDto,
  VoidQualityIssueDto,
} from '../dto/quality.dto';
import { QcPhotoService } from './qc-photo.service';

/** 附件表上问题单的对象类型标识。 */
const ATTACHMENT_TARGET = 'QUALITY_ISSUE';
const PHOTO_KEY_PREFIX = 'quality-issues';

const ISSUE_INCLUDE = Prisma.validator<Prisma.QualityIssueInclude>()({
  project: { select: { code: true, name: true } },
  workOrder: { select: { code: true } },
  task: { select: { name: true } },
  inspection: { select: { code: true } },
  reporter: { select: { displayName: true } },
  handler: { select: { displayName: true } },
  closedBy: { select: { displayName: true } },
});
type IssueWithMeta = Prisma.QualityIssueGetPayload<{ include: typeof ISSUE_INCLUDE }>;

/** 检验单判定不合格时自动生成问题单所需的最小字段（judge 事务内传入）。 */
export interface IssueFromInspectionInput {
  inspectionId: string;
  inspectionCode: string;
  inspectionTitle: string;
  projectId: string | null;
  workOrderId: string | null;
  taskId: string | null;
  materialCode: string | null;
  batchNo: string | null;
  supplierName: string | null;
  /** passed=false 的明细行，用于自动拼装问题描述。 */
  failedItems: { name: string; standard: string | null; actual: string | null }[];
  judgeRemark: string | null;
}

/**
 * 质量问题单（M8，§9.7 检验到整改闭环 + 8D）。
 *
 * 可见性分层：有 quality:issue:read（质量/PM/工艺/管理层）看全部；
 * 其余登录用户（责任人可能是任何角色）只看自己发起或自己负责的——
 * 过滤在本服务内强制，越权 detail 一律 404，不暴露单据存在性。
 * 状态流转唯一依据 shared ISSUE_ACTION_RULES，动作全部落 qc_issue_action 日志。
 */
@Injectable()
export class IssueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: CodeGeneratorService,
    private readonly photos: QcPhotoService,
  ) {}

  private canSeeAll(user: CurrentUser): boolean {
    return user.permissions.includes(Permission.QUALITY_ISSUE_READ);
  }

  private canWrite(user: CurrentUser): boolean {
    return user.permissions.includes(Permission.QUALITY_ISSUE_WRITE);
  }

  private mineFilter(userId: string): Prisma.QualityIssueWhereInput {
    return { OR: [{ reporterId: userId }, { handlerId: userId }] };
  }

  async list(
    query: QualityIssueListQueryDto,
    user: CurrentUser,
  ): Promise<PageResult<QualityIssueRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const restrictToMine = query.onlyMine || !this.canSeeAll(user);
    const where: Prisma.QualityIssueWhereInput = {
      ...(restrictToMine ? this.mineFilter(user.id) : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.keyword
        ? {
            OR: [
              { code: { contains: query.keyword, mode: 'insensitive' } },
              { title: { contains: query.keyword, mode: 'insensitive' } },
              { materialCode: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.qualityIssue.count({ where }),
      this.prisma.qualityIssue.findMany({
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

  async detail(id: string, user: CurrentUser): Promise<QualityIssueDetail> {
    const row = await this.getVisibleOrThrow(id, user);
    const [actions, photos] = await Promise.all([
      this.prisma.qualityIssueAction.findMany({
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
        type: a.type as QualityIssueActionType,
        note: a.note,
        operatorName: a.operator?.displayName ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
      photos,
    };
  }

  /**
   * 手动发起（§8.7 也允许调试/工艺等角色直接开质量问题）。
   * 关联任务/工单时归属反查，防止前端拼错；不强制关联项目——
   * IQC 类通用物料问题可能不属于任何项目，追溯靠物料/批次维度。
   */
  async create(dto: CreateQualityIssueDto, user: CurrentUser): Promise<{ id: string; code: string }> {
    const linked = await this.resolveLinkage(dto);

    const code = await this.nextCode();
    const created = await this.prisma.$transaction(async (tx) => {
      const issue = await tx.qualityIssue.create({
        data: {
          code,
          source: IssueSource.MANUAL,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          severity: dto.severity ?? 'MEDIUM',
          projectId: linked.projectId,
          workOrderId: linked.workOrderId,
          taskId: linked.taskId,
          materialCode: dto.materialCode?.trim() || null,
          batchNo: dto.batchNo?.trim() || null,
          supplierName: dto.supplierName?.trim() || null,
          reporterId: user.id,
        },
        select: { id: true, code: true },
      });
      await tx.qualityIssueAction.create({
        data: { issueId: issue.id, type: QualityIssueActionType.CREATE, operatorId: user.id },
      });
      return issue;
    });
    return created;
  }

  /**
   * 检验单判定不合格 → 自动生成问题单（§9.7「不合格则生成质量问题单」）。
   * 必须在 judge 的同一事务内调用：检验单进终态与问题单产生要么都发生要么都不发生。
   * 编号在事务外的独立序列上取号，回滚仅浪费一个号。
   */
  async createFromInspectionTx(
    tx: Prisma.TransactionClient,
    input: IssueFromInspectionInput,
    operatorId: string,
  ): Promise<{ id: string; code: string }> {
    const code = await this.nextCode();
    const failedLines = input.failedItems.map((it, i) => {
      const std = it.standard ? `（标准：${it.standard}）` : '';
      const act = it.actual ? `，实测：${it.actual}` : '';
      return `${i + 1}. ${it.name}${std}${act}`;
    });
    const description = [
      `来源检验单 ${input.inspectionCode}「${input.inspectionTitle}」判定不合格。`,
      failedLines.length ? `不合格项：\n${failedLines.join('\n')}` : null,
      input.judgeRemark ? `判定意见：${input.judgeRemark}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const issue = await tx.qualityIssue.create({
      data: {
        code,
        source: IssueSource.INSPECTION,
        inspectionId: input.inspectionId,
        title: truncate(`${input.inspectionTitle} 检验不合格`, 128),
        description,
        projectId: input.projectId,
        workOrderId: input.workOrderId,
        taskId: input.taskId,
        materialCode: input.materialCode,
        batchNo: input.batchNo,
        supplierName: input.supplierName,
        reporterId: operatorId,
      },
      select: { id: true, code: true },
    });
    await tx.qualityIssueAction.create({
      data: {
        issueId: issue.id,
        type: QualityIssueActionType.CREATE,
        note: `由检验单 ${input.inspectionCode} 判定不合格自动生成`,
        operatorId,
      },
    });
    return issue;
  }

  /** 编辑基础信息与 8D 字段。写权限或责任人本人；终态（已关闭/已作废）锁定。 */
  async update(id: string, dto: UpdateQualityIssueDto, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    if (!this.canWrite(user) && row.handlerId !== user.id) {
      throw new AppException(ErrorCode.FORBIDDEN, '无权编辑该问题单', HttpStatus.FORBIDDEN);
    }
    this.assertNotFinal(row.status);

    await this.prisma.qualityIssue.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
        ...this.eightDPatch(dto),
      },
    });
  }

  /** 分派/改派责任人（§9.7「分派责任部门」的一期到人版；部门由人带出）。 */
  async assign(id: string, dto: AssignQualityIssueDto, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    const to = this.assertAction(row.status, QualityIssueActionType.ASSIGN);

    const handler = await this.prisma.user.findFirst({
      where: { id: dto.handlerId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, displayName: true },
    });
    if (!handler) {
      throw new AppException(ErrorCode.NOT_FOUND, '责任人不存在或已停用', HttpStatus.NOT_FOUND);
    }

    await this.prisma.$transaction([
      this.prisma.qualityIssue.update({
        where: { id },
        data: { handlerId: handler.id, status: to },
      }),
      this.prisma.qualityIssueAction.create({
        data: {
          issueId: id,
          type: QualityIssueActionType.ASSIGN,
          note: joinNote(`分派给 ${handler.displayName}`, dto.note),
          operatorId: user.id,
        },
      }),
    ]);
  }

  /** 责任人提交整改：可同时补写 8D 字段，流转到待复检。 */
  async submit(id: string, dto: SubmitQualityIssueDto, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    if (row.handlerId !== user.id && !this.canWrite(user)) {
      throw new AppException(ErrorCode.FORBIDDEN, '只有责任人可以提交整改', HttpStatus.FORBIDDEN);
    }
    const to = this.assertAction(row.status, QualityIssueActionType.SUBMIT);

    await this.prisma.$transaction([
      this.prisma.qualityIssue.update({
        where: { id },
        data: { status: to, ...this.eightDPatch(dto) },
      }),
      this.prisma.qualityIssueAction.create({
        data: {
          issueId: id,
          type: QualityIssueActionType.SUBMIT,
          note: dto.note.trim(),
          operatorId: user.id,
        },
      }),
    ]);
  }

  /** 复检（§9.7 检验员复检）：通过即关闭，不通过退回整改中。 */
  async recheck(id: string, dto: RecheckQualityIssueDto, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    const action = dto.pass
      ? QualityIssueActionType.RECHECK_PASS
      : QualityIssueActionType.RECHECK_FAIL;
    const to = this.assertAction(row.status, action);

    await this.prisma.$transaction([
      this.prisma.qualityIssue.update({
        where: { id },
        data: {
          status: to,
          ...(dto.pass ? { closedById: user.id, closedAt: new Date() } : {}),
        },
      }),
      this.prisma.qualityIssueAction.create({
        data: { issueId: id, type: action, note: dto.note?.trim() || null, operatorId: user.id },
      }),
    ]);
  }

  /** 作废（误报）。区别于复检通过的正常关闭，质量统计时剔除。 */
  async void(id: string, dto: VoidQualityIssueDto, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    const to = this.assertAction(row.status, QualityIssueActionType.VOID);

    await this.prisma.$transaction([
      this.prisma.qualityIssue.update({
        where: { id },
        data: { status: to, closedById: user.id, closedAt: new Date() },
      }),
      this.prisma.qualityIssueAction.create({
        data: {
          issueId: id,
          type: QualityIssueActionType.VOID,
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
    const allowed =
      row.reporterId === user.id || row.handlerId === user.id || this.canWrite(user);
    if (!allowed) {
      throw new AppException(ErrorCode.FORBIDDEN, '无权为该问题单上传照片', HttpStatus.FORBIDDEN);
    }
    this.assertNotFinal(row.status);
    return this.photos.upload(ATTACHMENT_TARGET, id, PHOTO_KEY_PREFIX, file, user.id);
  }

  /** 照片下载/预览。可见性与问题单一致。 */
  async downloadPhoto(
    attachmentId: string,
    user: CurrentUser,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string; fileSize: number }> {
    const attachment = await this.photos.findOrThrow(attachmentId, ATTACHMENT_TARGET);
    await this.getVisibleOrThrow(attachment.targetId, user);
    return this.photos.stream(attachment);
  }

  // ---- 私有辅助 ----

  private async nextCode(): Promise<string> {
    // 单据编号规则（业务方案 §10.2）：QI-年月日-流水号
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return this.codeGen.next(`QI-${today}`);
  }

  /** 按动作规则表断言当前状态允许该动作，返回目标状态。 */
  private assertAction(
    status: string,
    action: Exclude<QualityIssueActionType, 'CREATE'>,
  ): QualityIssueStatus {
    const rule = ISSUE_ACTION_RULES[action];
    if (!rule.from.includes(status as QualityIssueStatus)) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        `「${QUALITY_ISSUE_STATUS_LABEL[status as QualityIssueStatus]}」状态不可执行「${QUALITY_ISSUE_ACTION_LABEL[action]}」`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return rule.to;
  }

  private assertNotFinal(status: string): void {
    if (status === QualityIssueStatus.CLOSED || status === QualityIssueStatus.VOIDED) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        `「${QUALITY_ISSUE_STATUS_LABEL[status as QualityIssueStatus]}」状态已锁定，不可修改`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** dto 中显式出现的 8D 字段生成 update patch（undefined 表示不改，null 表示清空）。 */
  private eightDPatch(dto: {
    containmentAction?: string | null;
    rootCause?: string | null;
    correctiveAction?: string | null;
    preventiveAction?: string | null;
    disposition?: string | null;
  }): Prisma.QualityIssueUpdateInput {
    return {
      ...(dto.containmentAction !== undefined
        ? { containmentAction: dto.containmentAction?.trim() || null }
        : {}),
      ...(dto.rootCause !== undefined ? { rootCause: dto.rootCause?.trim() || null } : {}),
      ...(dto.correctiveAction !== undefined
        ? { correctiveAction: dto.correctiveAction?.trim() || null }
        : {}),
      ...(dto.preventiveAction !== undefined
        ? { preventiveAction: dto.preventiveAction?.trim() || null }
        : {}),
      ...(dto.disposition !== undefined ? { disposition: dto.disposition } : {}),
    };
  }

  /** 手动发起时的关联归属反查（学 M7 异常单：带任务/工单时归属以后端反查为准）。 */
  private async resolveLinkage(dto: {
    projectId?: string | null;
    workOrderId?: string | null;
    taskId?: string | null;
  }): Promise<{ projectId: string | null; workOrderId: string | null; taskId: string | null }> {
    let projectId = dto.projectId ?? null;
    let workOrderId = dto.workOrderId ?? null;
    const taskId = dto.taskId ?? null;

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
    } else if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: { id: true },
      });
      if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);
    }

    return { projectId, workOrderId, taskId };
  }

  private async getOrThrow(id: string): Promise<IssueWithMeta> {
    const row = await this.prisma.qualityIssue.findUnique({ where: { id }, include: ISSUE_INCLUDE });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, '问题单不存在', HttpStatus.NOT_FOUND);
    return row;
  }

  /** 读场景可见性：无全局读权限者只可见自己相关的单，其余一律 404 不暴露存在性。 */
  private async getVisibleOrThrow(id: string, user: CurrentUser): Promise<IssueWithMeta> {
    const row = await this.getOrThrow(id);
    if (!this.canSeeAll(user) && row.reporterId !== user.id && row.handlerId !== user.id) {
      throw new AppException(ErrorCode.NOT_FOUND, '问题单不存在', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  private toRow(row: IssueWithMeta, photoCount: number): QualityIssueRow {
    return {
      id: row.id,
      code: row.code,
      source: row.source as QualityIssueRow['source'],
      inspectionId: row.inspectionId,
      inspectionCode: row.inspection?.code ?? null,
      status: row.status as QualityIssueRow['status'],
      severity: row.severity as QualityIssueRow['severity'],
      projectId: row.projectId,
      projectCode: row.project?.code ?? null,
      projectName: row.project?.name ?? null,
      workOrderId: row.workOrderId,
      workOrderCode: row.workOrder?.code ?? null,
      taskId: row.taskId,
      taskName: row.task?.name ?? null,
      materialCode: row.materialCode,
      batchNo: row.batchNo,
      supplierName: row.supplierName,
      title: row.title,
      description: row.description,
      containmentAction: row.containmentAction,
      rootCause: row.rootCause,
      correctiveAction: row.correctiveAction,
      preventiveAction: row.preventiveAction,
      disposition: row.disposition as QualityIssueRow['disposition'],
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

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function joinNote(prefix: string, note?: string | null): string {
  const extra = note?.trim();
  return extra ? `${prefix}：${extra}` : prefix;
}
