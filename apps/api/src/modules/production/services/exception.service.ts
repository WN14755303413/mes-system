import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  EXCEPTION_STATUS_LABEL,
  EXCEPTION_STATUS_TRANSITIONS,
  ErrorCode,
  ExceptionStatus,
  Permission,
  type AttachmentItem,
  type CurrentUser,
  type ExceptionDetail,
  type ExceptionRow,
  type PageResult,
} from '@mes/shared';
import { CodeGeneratorService } from '../../../common/code/code-generator.service';
import { AppException } from '../../../common/exceptions/app.exception';
import { IntegrationNotifyService } from '../../integration/services/notify.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StateMachineService } from '../../../common/state/state-machine.service';
import { StorageService } from '../../../common/storage/storage.service';
import type {
  AssignExceptionDto,
  CloseExceptionDto,
  CreateExceptionDto,
  ExceptionListQueryDto,
  ResolveExceptionDto,
} from '../dto/production.dto';

/** 附件表上异常单的对象类型标识。 */
const ATTACHMENT_TARGET = 'EXCEPTION';

/** 现场照片只收图片格式，与图纸上传的全格式白名单有意不同——异常单不是文件中转站。 */
const PHOTO_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const MAX_PHOTOS_PER_EXCEPTION = 9;

const EXCEPTION_INCLUDE = Prisma.validator<Prisma.WorkExceptionInclude>()({
  project: { select: { code: true, name: true } },
  workOrder: { select: { code: true } },
  task: { select: { name: true } },
  reporter: { select: { displayName: true } },
  handler: { select: { displayName: true } },
  closedBy: { select: { displayName: true } },
});
type ExceptionWithMeta = Prisma.WorkExceptionGetPayload<{ include: typeof EXCEPTION_INCLUDE }>;

/**
 * 现场异常单（M7，业务方案 §9.6 装配异常到问题闭环）。
 *
 * 读写的可见范围按权限分层：有 plan:read（计划员/项目经理/管理层）看全部；
 * 只有 task:exception 的现场人员只看自己提交或自己负责的——过滤在本服务内强制，
 * 控制器上的 @RequireAnyPermission 只负责挡住两种权限都没有的请求。
 */
@Injectable()
export class ExceptionService {
  private readonly maxPhotoBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: CodeGeneratorService,
    private readonly stateMachine: StateMachineService,
    private readonly storage: StorageService,
    private readonly notify: IntegrationNotifyService,
    config: ConfigService,
  ) {
    // 现场照片上限收紧到图纸上限的 1/5（默认 10MB），手机原图足够
    this.maxPhotoBytes = Math.max(1, Number(config.get('MAX_UPLOAD_MB') ?? 50) / 5) * 1024 * 1024;
  }

  /** 是否可见全量异常。现场人员（无 plan:read）只见与自己相关的。 */
  private canSeeAll(user: CurrentUser): boolean {
    return user.permissions.includes(Permission.PLAN_READ);
  }

  private mineFilter(userId: string): Prisma.WorkExceptionWhereInput {
    return { OR: [{ reporterId: userId }, { handlerId: userId }] };
  }

  async list(query: ExceptionListQueryDto, user: CurrentUser): Promise<PageResult<ExceptionRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const restrictToMine = query.onlyMine || !this.canSeeAll(user);
    const where: Prisma.WorkExceptionWhereInput = {
      ...(restrictToMine ? this.mineFilter(user.id) : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
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
      this.prisma.workException.count({ where }),
      this.prisma.workException.findMany({
        where,
        include: EXCEPTION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // 附件与业务对象无外键（通用附件表），照片数单独按批聚合
    const counts = rows.length
      ? await this.prisma.attachment.groupBy({
          by: ['targetId'],
          where: { targetType: ATTACHMENT_TARGET, targetId: { in: rows.map((r) => r.id) } },
          _count: { _all: true },
        })
      : [];
    const photoCounts = new Map(counts.map((c) => [c.targetId, c._count._all]));

    return {
      items: rows.map((r) => this.toRow(r, photoCounts.get(r.id) ?? 0)),
      total,
      page,
      pageSize,
    };
  }

  async detail(id: string, user: CurrentUser): Promise<ExceptionDetail> {
    const row = await this.getVisibleOrThrow(id, user);
    const photos = await this.prisma.attachment.findMany({
      where: { targetType: ATTACHMENT_TARGET, targetId: id },
      include: { uploadedBy: { select: { displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...this.toRow(row, photos.length),
      photos: photos.map((p) => this.toAttachmentItem(p)),
    };
  }

  /**
   * 提交异常（§9.6：选择项目/工单/工序/物料 + 说明）。
   * 带 taskId 时项目与工单从任务反查，防止前端拼错归属。
   */
  async create(dto: CreateExceptionDto, user: CurrentUser): Promise<{ id: string; code: string }> {
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
    }

    if (!projectId) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '请指定异常所属项目（或关联任务/工单）',
        HttpStatus.BAD_REQUEST,
      );
    }
    // 存在性校验顺带取出编号与项目经理，供创建后的钉钉通知使用
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, code: true, name: true, manager: { select: { id: true, displayName: true } } },
    });
    if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);

    // 单据编号规则（业务方案 §10.2）：EX-年月日-流水号
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const code = await this.codeGen.next(`EX-${today}`);

    const created = await this.prisma.workException.create({
      data: {
        code,
        projectId,
        workOrderId,
        taskId,
        materialCode: dto.materialCode?.trim() || null,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        reporterId: user.id,
      },
      select: { id: true, code: true },
    });

    // 钉钉挂点（§9.6「系统推送责任人」）：现场异常即刻通知项目经理。
    // fire-and-forget，通知失败进异常池，不影响上报本身。
    if (project.manager) {
      this.notify.sendWorkMessage(
        [{ id: project.manager.id, name: project.manager.displayName }],
        '现场异常上报',
        `项目「${project.name}」（${project.code}）现场异常 ${created.code}：${dto.title.trim()}，请关注处理。`,
        '/production/exception',
      );
    }

    return created;
  }

  /** 指派/改派责任人（§9.6「系统推送责任人」的一期人工版）。首次指派推进到处理中。 */
  async assign(id: string, dto: AssignExceptionDto): Promise<void> {
    const row = await this.getOrThrow(id);
    if (row.status !== ExceptionStatus.OPEN && row.status !== ExceptionStatus.HANDLING) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        `「${EXCEPTION_STATUS_LABEL[row.status as ExceptionStatus]}」状态不可指派`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const handler = await this.prisma.user.findFirst({
      where: { id: dto.handlerId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!handler) {
      throw new AppException(ErrorCode.NOT_FOUND, '责任人不存在或已停用', HttpStatus.NOT_FOUND);
    }

    await this.prisma.workException.update({
      where: { id },
      data: { handlerId: dto.handlerId, status: ExceptionStatus.HANDLING },
    });
  }

  /** 责任人提交处理结果。非责任人须有 plan:write（计划员/项目经理代处理）。 */
  async resolve(id: string, dto: ResolveExceptionDto, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    const isHandler = row.handlerId === user.id;
    if (!isHandler && !user.permissions.includes(Permission.PLAN_WRITE)) {
      throw new AppException(ErrorCode.FORBIDDEN, '只有责任人可以提交处理结果', HttpStatus.FORBIDDEN);
    }
    this.assertTransition(row.status, ExceptionStatus.RESOLVED);

    await this.prisma.workException.update({
      where: { id },
      data: {
        status: ExceptionStatus.RESOLVED,
        // 追加而非覆盖：退回后二次处理时，此前的处理与退回记录必须留痕
        handleNote: this.appendNote(row.handleNote, `[处理] ${dto.handleNote.trim()}`),
        resolvedAt: new Date(),
      },
    });
  }

  /** 确认关闭（§9.6「质量、工艺或项目经理确认关闭」）。未处理完也可直接关闭（如误报）。 */
  async close(id: string, dto: CloseExceptionDto, user: CurrentUser): Promise<void> {
    const row = await this.getOrThrow(id);
    this.assertTransition(row.status, ExceptionStatus.CLOSED);

    await this.prisma.workException.update({
      where: { id },
      data: {
        status: ExceptionStatus.CLOSED,
        closedById: user.id,
        closedAt: new Date(),
        ...(dto.note?.trim()
          ? { handleNote: this.appendNote(row.handleNote, `[关闭] ${dto.note.trim()}`) }
          : {}),
      },
    });
  }

  /** 复检不通过，退回处理中重新整改。 */
  async reopen(id: string, dto: CloseExceptionDto): Promise<void> {
    const row = await this.getOrThrow(id);
    this.assertTransition(row.status, ExceptionStatus.HANDLING);

    await this.prisma.workException.update({
      where: { id },
      data: {
        status: ExceptionStatus.HANDLING,
        resolvedAt: null,
        ...(dto.note?.trim()
          ? { handleNote: this.appendNote(row.handleNote, `[退回] ${dto.note.trim()}`) }
          : {}),
      },
    });
  }

  // ============ 现场照片（§8.5「现场拍照/附件上传」） ============

  /** 上传照片。提交人、责任人或有 plan:write 者可传；已关闭的异常不可再补图。 */
  async uploadPhoto(
    id: string,
    file: Express.Multer.File,
    user: CurrentUser,
  ): Promise<AttachmentItem> {
    const row = await this.getOrThrow(id);
    const allowed =
      row.reporterId === user.id ||
      row.handlerId === user.id ||
      user.permissions.includes(Permission.PLAN_WRITE);
    if (!allowed) {
      throw new AppException(ErrorCode.FORBIDDEN, '无权为该异常上传照片', HttpStatus.FORBIDDEN);
    }
    if (row.status === ExceptionStatus.CLOSED) {
      throw new AppException(
        ErrorCode.ILLEGAL_STATE_TRANSITION,
        '异常已关闭，不可再上传照片',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!file?.buffer?.length) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '未收到文件', HttpStatus.BAD_REQUEST);
    }
    if (file.size > this.maxPhotoBytes) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `照片超出大小上限 ${Math.round(this.maxPhotoBytes / 1024 / 1024)}MB`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    const fileName = decodeOriginalName(file.originalname);
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!PHOTO_EXTENSIONS.has(ext) || !file.mimetype.startsWith('image/')) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `仅支持图片格式：${[...PHOTO_EXTENSIONS].join(' / ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const count = await this.prisma.attachment.count({
      where: { targetType: ATTACHMENT_TARGET, targetId: id },
    });
    if (count >= MAX_PHOTOS_PER_EXCEPTION) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `每条异常最多 ${MAX_PHOTOS_PER_EXCEPTION} 张照片`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const storageKey = `exceptions/${id}/${randomUUID()}/${sanitizeFileName(fileName)}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype);

    try {
      const attachment = await this.prisma.attachment.create({
        data: {
          targetType: ATTACHMENT_TARGET,
          targetId: id,
          storageKey,
          fileName,
          fileSize: file.size,
          mimeType: file.mimetype || 'application/octet-stream',
          uploadedById: user.id,
        },
        include: { uploadedBy: { select: { displayName: true } } },
      });
      return this.toAttachmentItem(attachment);
    } catch (err) {
      // 库没写成，存储里的孤儿文件立即清掉
      await this.storage.remove(storageKey);
      throw err;
    }
  }

  /** 照片下载/预览。可见性与异常单一致：相关人或有 plan:read。 */
  async downloadPhoto(
    attachmentId: string,
    user: CurrentUser,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string; fileSize: number }> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, targetType: ATTACHMENT_TARGET },
    });
    if (!attachment) {
      throw new AppException(ErrorCode.NOT_FOUND, '照片不存在', HttpStatus.NOT_FOUND);
    }
    await this.getVisibleOrThrow(attachment.targetId, user);

    const stream = await this.storage.getStream(attachment.storageKey);
    return {
      stream,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
    };
  }

  // ---- 私有辅助 ----

  private assertTransition(from: string, to: ExceptionStatus): void {
    this.stateMachine.assertTransitionIn(
      EXCEPTION_STATUS_TRANSITIONS,
      EXCEPTION_STATUS_LABEL,
      from as ExceptionStatus,
      to,
    );
  }

  private appendNote(existing: string | null, line: string): string {
    return existing ? `${existing}\n${line}` : line;
  }

  private async getOrThrow(id: string): Promise<ExceptionWithMeta> {
    const row = await this.prisma.workException.findUnique({
      where: { id },
      include: EXCEPTION_INCLUDE,
    });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND, '异常单不存在', HttpStatus.NOT_FOUND);
    return row;
  }

  /** 读场景的可见性校验：现场人员只可见与自己相关的单，其余一律 404。 */
  private async getVisibleOrThrow(id: string, user: CurrentUser): Promise<ExceptionWithMeta> {
    const row = await this.getOrThrow(id);
    if (!this.canSeeAll(user) && row.reporterId !== user.id && row.handlerId !== user.id) {
      throw new AppException(ErrorCode.NOT_FOUND, '异常单不存在', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  private toRow(row: ExceptionWithMeta, photoCount: number): ExceptionRow {
    return {
      id: row.id,
      code: row.code,
      projectId: row.projectId,
      projectCode: row.project.code,
      projectName: row.project.name,
      workOrderId: row.workOrderId,
      workOrderCode: row.workOrder?.code ?? null,
      taskId: row.taskId,
      taskName: row.task?.name ?? null,
      materialCode: row.materialCode,
      title: row.title,
      description: row.description,
      status: row.status as ExceptionStatus,
      reporterId: row.reporterId,
      reporterName: row.reporter?.displayName ?? null,
      handlerId: row.handlerId,
      handlerName: row.handler?.displayName ?? null,
      handleNote: row.handleNote,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      closedByName: row.closedBy?.displayName ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      photoCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toAttachmentItem(
    p: Prisma.AttachmentGetPayload<{ include: { uploadedBy: { select: { displayName: true } } } }>,
  ): AttachmentItem {
    return {
      id: p.id,
      fileName: p.fileName,
      fileSize: p.fileSize,
      mimeType: p.mimeType,
      uploadedByName: p.uploadedBy?.displayName ?? null,
      createdAt: p.createdAt.toISOString(),
    };
  }
}

/** multer 把非 ASCII 文件名按 latin1 解码，这里还原 UTF-8（与图纸上传同一处理）。 */
function decodeOriginalName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

/** 清掉路径分隔符与控制字符。key 的唯一性由 uuid 段保证，文件名只为可读。 */
function sanitizeFileName(name: string): string {
  const cleaned = [...name.replace(/[/\\]/g, '_')]
    .filter((ch) => ch.charCodeAt(0) >= 0x20)
    .join('')
    .trim();
  return cleaned || 'file';
}
