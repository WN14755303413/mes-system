import type { Readable } from 'node:stream';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCode,
  FEEDBACK_ACTION_RULES,
  FEEDBACK_STATUS_LABEL,
  FeedbackActionType,
  FeedbackStatus,
  Permission,
  type CurrentUser,
  type FeedbackDetail,
  type FeedbackRow,
  type FeedbackStats,
  type PageResult,
} from '@mes/shared';
import { CodeGeneratorService } from '../../../common/code/code-generator.service';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationService } from '../../notification/services/notification.service';
import type {
  CreateFeedbackDto,
  FeedbackListQueryDto,
  FeedbackReplyDto,
  FeedbackTransitionDto,
} from '../dto/feedback.dto';
import {
  FEEDBACK_ACTION_TARGET,
  FEEDBACK_TARGET,
  FeedbackAttachmentService,
  MAX_ACTION_ATTACHMENTS,
  MAX_FEEDBACK_ATTACHMENTS,
} from './feedback-attachment.service';

const FEEDBACK_INCLUDE = Prisma.validator<Prisma.FeedbackInclude>()({
  submitter: { select: { displayName: true } },
  handler: { select: { displayName: true } },
});
type FeedbackWithMeta = Prisma.FeedbackGetPayload<{ include: typeof FEEDBACK_INCLUDE }>;

/**
 * 反馈单（M12）。试运行期收集全员反馈的闭环。
 *
 * 可见性分层（同 M8 问题单先例）：有 feedback:manage 者（处理方）看全部；
 * 其余登录用户只看自己提交的。越权 detail 一律 404，不暴露单据存在性。
 * 状态流转唯一依据 shared FEEDBACK_ACTION_RULES，动作全部落 sys_feedback_action。
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: CodeGeneratorService,
    private readonly attachments: FeedbackAttachmentService,
    private readonly notify: NotificationService,
  ) {}

  private canManage(user: CurrentUser): boolean {
    return user.permissions.includes(Permission.FEEDBACK_MANAGE);
  }

  /** 有 feedback:manage 的在职用户——新反馈与「无处理人」时的通知对象。 */
  private async findManagers(): Promise<{ id: string; name: string }[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        roles: {
          some: {
            role: {
              enabled: true,
              permissions: { some: { permission: { code: Permission.FEEDBACK_MANAGE } } },
            },
          },
        },
      },
      select: { id: true, displayName: true },
    });
    return rows.map((r) => ({ id: r.id, name: r.displayName }));
  }

  async create(dto: CreateFeedbackDto, user: CurrentUser): Promise<{ id: string; code: string }> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const code = await this.codeGen.next(`FB-${today}`);

    const created = await this.prisma.$transaction(async (tx) => {
      const feedback = await tx.feedback.create({
        data: {
          code,
          type: dto.type,
          severity: dto.severity,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          pagePath: dto.pagePath?.trim() || null,
          pageTitle: dto.pageTitle?.trim() || null,
          clientInfo: dto.clientInfo?.trim() || null,
          submitterId: user.id,
        },
        select: { id: true, code: true },
      });
      await tx.feedbackAction.create({
        data: { feedbackId: feedback.id, type: FeedbackActionType.CREATE, operatorId: user.id },
      });
      return feedback;
    });

    // 通知处理组（fire-and-forget；提交人自己在处理组时不给自己发）
    const managers = await this.findManagers();
    this.notify.push(
      managers,
      '收到新反馈',
      `${user.displayName} 提交了反馈 ${created.code}：${dto.title.trim()}`,
      `/feedback?id=${created.id}`,
      { excludeUserId: user.id },
    );

    return created;
  }

  async list(query: FeedbackListQueryDto, user: CurrentUser): Promise<PageResult<FeedbackRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const restrictToMine = query.mine === '1' || !this.canManage(user);
    const where: Prisma.FeedbackWhereInput = {
      ...(restrictToMine ? { submitterId: user.id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.keyword
        ? {
            OR: [
              { code: { contains: query.keyword, mode: 'insensitive' } },
              { title: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.findMany({
        where,
        include: { ...FEEDBACK_INCLUDE, actions: { select: { id: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const actionIdsByFeedback = new Map(rows.map((r) => [r.id, r.actions.map((a) => a.id)]));
    const counts = await this.attachments.countByFeedback(
      rows.map((r) => r.id),
      actionIdsByFeedback,
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        code: r.code,
        type: r.type as FeedbackRow['type'],
        severity: r.severity as FeedbackRow['severity'],
        status: r.status as FeedbackRow['status'],
        title: r.title,
        pageTitle: r.pageTitle,
        submitterName: r.submitter.displayName,
        handlerName: r.handler?.displayName ?? null,
        attachmentCount: counts.get(r.id) ?? 0,
        lastActionAt: r.updatedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async stats(user: CurrentUser): Promise<FeedbackStats> {
    const manage = this.canManage(user);
    const scopeWhere: Prisma.FeedbackWhereInput = manage ? {} : { submitterId: user.id };
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    const [byStatus, weekNew] = await Promise.all([
      this.prisma.feedback.groupBy({
        by: ['status'],
        where: scopeWhere,
        _count: { _all: true },
      }),
      this.prisma.feedback.count({ where: { ...scopeWhere, createdAt: { gte: weekAgo } } }),
    ]);

    const count = (s: FeedbackStatus) =>
      byStatus.find((r) => r.status === s)?._count._all ?? 0;
    return {
      scope: manage ? 'ALL' : 'MINE',
      open: count(FeedbackStatus.OPEN),
      processing: count(FeedbackStatus.PROCESSING),
      resolved: count(FeedbackStatus.RESOLVED),
      rejected: count(FeedbackStatus.REJECTED),
      weekNew,
    };
  }

  /** 行级收窄：manage / 提交人 / 处理人之外一律 404，不暴露存在性。 */
  private async findVisibleOrThrow(id: string, user: CurrentUser): Promise<FeedbackWithMeta> {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
      include: FEEDBACK_INCLUDE,
    });
    const visible =
      feedback &&
      (this.canManage(user) || feedback.submitterId === user.id || feedback.handlerId === user.id);
    if (!visible) {
      throw new AppException(ErrorCode.NOT_FOUND, '反馈不存在', HttpStatus.NOT_FOUND);
    }
    return feedback;
  }

  async detail(id: string, user: CurrentUser): Promise<FeedbackDetail> {
    const feedback = await this.findVisibleOrThrow(id, user);

    const actions = await this.prisma.feedbackAction.findMany({
      where: { feedbackId: id },
      include: { operator: { select: { displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const [mainAttachments, actionAttachments] = await Promise.all([
      this.attachments.listByTarget(FEEDBACK_TARGET, id),
      this.attachments.listByTargets(
        FEEDBACK_ACTION_TARGET,
        actions.map((a) => a.id),
      ),
    ]);

    return {
      id: feedback.id,
      code: feedback.code,
      type: feedback.type as FeedbackDetail['type'],
      severity: feedback.severity as FeedbackDetail['severity'],
      status: feedback.status as FeedbackDetail['status'],
      title: feedback.title,
      description: feedback.description,
      pagePath: feedback.pagePath,
      pageTitle: feedback.pageTitle,
      clientInfo: feedback.clientInfo,
      submitterId: feedback.submitterId,
      submitterName: feedback.submitter.displayName,
      handlerId: feedback.handlerId,
      handlerName: feedback.handler?.displayName ?? null,
      resolvedAt: feedback.resolvedAt?.toISOString() ?? null,
      attachments: mainAttachments,
      actions: actions.map((a) => ({
        id: a.id,
        type: a.type as FeedbackActionType,
        note: a.note,
        operatorId: a.operatorId,
        operatorName: a.operator?.displayName ?? null,
        bySubmitter: a.operatorId === feedback.submitterId,
        attachments: actionAttachments.get(a.id) ?? [],
        createdAt: a.createdAt.toISOString(),
      })),
      createdAt: feedback.createdAt.toISOString(),
    };
  }

  /** 回复（双向对话，不流转状态）。返回 actionId 供前端补传回复附件。 */
  async reply(id: string, dto: FeedbackReplyDto, user: CurrentUser): Promise<{ actionId: string }> {
    const feedback = await this.findVisibleOrThrow(id, user);

    const action = await this.prisma.$transaction(async (tx) => {
      const created = await tx.feedbackAction.create({
        data: {
          feedbackId: id,
          type: FeedbackActionType.REPLY,
          note: dto.note.trim(),
          operatorId: user.id,
        },
        select: { id: true },
      });
      // touch updatedAt：列表的「最后动态」与排序靠它
      await tx.feedback.update({ where: { id }, data: { updatedAt: new Date() } });
      return created;
    });

    await this.notifyCounterpart(
      feedback,
      user,
      `反馈 ${feedback.code} 有新回复`,
      `${user.displayName}：${truncate(dto.note.trim(), 80)}`,
    );

    return { actionId: action.id };
  }

  /** 状态动作：接单/解决/驳回/重开。规则唯一来源 shared FEEDBACK_ACTION_RULES。 */
  async transition(id: string, dto: FeedbackTransitionDto, user: CurrentUser): Promise<{ ok: true }> {
    const feedback = await this.findVisibleOrThrow(id, user);
    const note = dto.note?.trim() || null;

    const rule = FEEDBACK_ACTION_RULES[dto.type];
    if (!rule.from.includes(feedback.status as FeedbackStatus)) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        `当前状态「${FEEDBACK_STATUS_LABEL[feedback.status as FeedbackStatus]}」不允许该操作`,
        HttpStatus.CONFLICT,
      );
    }

    if (dto.type === FeedbackActionType.REOPEN) {
      if (feedback.submitterId !== user.id) {
        throw new AppException(ErrorCode.FORBIDDEN, '仅提交人可重新打开', HttpStatus.FORBIDDEN);
      }
    } else if (!this.canManage(user)) {
      throw new AppException(ErrorCode.FORBIDDEN, '无权处理反馈', HttpStatus.FORBIDDEN);
    }
    if (dto.type !== FeedbackActionType.START && !note) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '请填写说明（处理结论 / 驳回原因 / 重开原因）',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.feedback.update({
        where: { id },
        data: {
          status: rule.to,
          // 接单即认领；重开保留原处理人继续跟进
          ...(dto.type === FeedbackActionType.START ? { handlerId: user.id } : {}),
          resolvedAt: dto.type === FeedbackActionType.RESOLVE ? new Date() : null,
        },
      });
      await tx.feedbackAction.create({
        data: { feedbackId: id, type: dto.type, note, operatorId: user.id },
      });
    });

    const titleByType: Record<string, string> = {
      [FeedbackActionType.START]: `你的反馈 ${feedback.code} 已被接单`,
      [FeedbackActionType.RESOLVE]: `你的反馈 ${feedback.code} 已解决`,
      [FeedbackActionType.REJECT]: `你的反馈 ${feedback.code} 被驳回`,
      [FeedbackActionType.REOPEN]: `反馈 ${feedback.code} 被重新打开`,
    };
    const content = note ? `${user.displayName}：${truncate(note, 80)}` : `处理人：${user.displayName}`;
    if (dto.type === FeedbackActionType.REOPEN) {
      await this.notifyCounterpart(feedback, user, titleByType[dto.type], content);
    } else {
      // 处理方动作 → 通知提交人
      this.notify.push(
        [{ id: feedback.submitterId, name: feedback.submitter.displayName }],
        titleByType[dto.type],
        content,
        `/feedback?id=${feedback.id}`,
        { excludeUserId: user.id },
      );
    }

    return { ok: true };
  }

  /** 提交人发声 → 通知处理人（未接单则通知处理组）；处理侧发声 → 通知提交人。 */
  private async notifyCounterpart(
    feedback: FeedbackWithMeta,
    operator: CurrentUser,
    title: string,
    content: string,
  ): Promise<void> {
    const link = `/feedback?id=${feedback.id}`;
    if (operator.id === feedback.submitterId) {
      const targets = feedback.handlerId
        ? [{ id: feedback.handlerId, name: feedback.handler?.displayName ?? '' }]
        : await this.findManagers();
      this.notify.push(targets, title, content, link, { excludeUserId: operator.id });
    } else {
      this.notify.push(
        [{ id: feedback.submitterId, name: feedback.submitter.displayName }],
        title,
        content,
        link,
        { excludeUserId: operator.id },
      );
    }
  }

  /**
   * 上传附件。不带 actionId → 主单附件（仅提交人、非终态）；
   * 带 actionId → 回复附件（仅该回复的操作人，给「发送后补图」用）。
   */
  async uploadAttachment(
    id: string,
    actionId: string | undefined,
    file: Express.Multer.File,
    user: CurrentUser,
  ) {
    const feedback = await this.findVisibleOrThrow(id, user);

    if (actionId) {
      const action = await this.prisma.feedbackAction.findFirst({
        where: { id: actionId, feedbackId: id },
        select: { operatorId: true },
      });
      if (!action) {
        throw new AppException(ErrorCode.NOT_FOUND, '回复不存在', HttpStatus.NOT_FOUND);
      }
      if (action.operatorId !== user.id) {
        throw new AppException(ErrorCode.FORBIDDEN, '只能给自己的回复添加附件', HttpStatus.FORBIDDEN);
      }
      return this.attachments.upload(FEEDBACK_ACTION_TARGET, actionId, MAX_ACTION_ATTACHMENTS, file, user.id);
    }

    if (feedback.submitterId !== user.id) {
      throw new AppException(ErrorCode.FORBIDDEN, '只有提交人可以补充反馈附件', HttpStatus.FORBIDDEN);
    }
    const terminal =
      feedback.status === FeedbackStatus.RESOLVED || feedback.status === FeedbackStatus.REJECTED;
    if (terminal) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '反馈已办结，如需补充请先重新打开',
        HttpStatus.CONFLICT,
      );
    }
    return this.attachments.upload(FEEDBACK_TARGET, id, MAX_FEEDBACK_ATTACHMENTS, file, user.id);
  }

  /** 附件预览/下载：反查所属反馈做同 detail 的行级校验。 */
  async downloadAttachment(
    attachmentId: string,
    user: CurrentUser,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string; fileSize: number }> {
    const attachment = await this.attachments.findOrThrow(attachmentId);
    const feedbackId =
      attachment.targetType === FEEDBACK_TARGET
        ? attachment.targetId
        : (
            await this.prisma.feedbackAction.findUnique({
              where: { id: attachment.targetId },
              select: { feedbackId: true },
            })
          )?.feedbackId;
    if (!feedbackId) {
      throw new AppException(ErrorCode.NOT_FOUND, '附件不存在', HttpStatus.NOT_FOUND);
    }
    await this.findVisibleOrThrow(feedbackId, user);
    return this.attachments.stream(attachment);
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
