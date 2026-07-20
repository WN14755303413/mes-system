import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode, type AttachmentItem } from '@mes/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StorageService } from '../../../common/storage/storage.service';

/** 附件表上反馈域的对象类型标识。 */
export const FEEDBACK_TARGET = 'FEEDBACK';
export const FEEDBACK_ACTION_TARGET = 'FEEDBACK_ACTION';
const KEY_PREFIX = 'feedback';

/**
 * 反馈附件比质量照片宽：截图之外，日志/导出表格/录屏都是有效的问题证据。
 * 白名单制——图片必须 image/* mime，其余按扩展名放行（浏览器给的 mime 不可靠）。
 */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const FILE_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'log', 'md',
  'zip', '7z',
  'mp4', 'webm',
]);

const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** 主单附件上限（提交时的截图与材料）。 */
export const MAX_FEEDBACK_ATTACHMENTS = 12;
/** 单条回复附件上限。 */
export const MAX_ACTION_ATTACHMENTS = 4;

const ATTACHMENT_INCLUDE = Prisma.validator<Prisma.AttachmentInclude>()({
  uploadedBy: { select: { displayName: true } },
});
type AttachmentWithUploader = Prisma.AttachmentGetPayload<{ include: typeof ATTACHMENT_INCLUDE }>;

/**
 * 反馈单/回复共用的附件存取（通用附件表 sys_attachment，同 QcPhotoService 骨架）。
 * 归属与状态校验（谁可传、传到主单还是回复）在 FeedbackService；
 * 这里只管格式/大小/数量、对象存储写入与索引落库。
 */
@Injectable()
export class FeedbackAttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(
    targetType: string,
    targetId: string,
    maxCount: number,
    file: Express.Multer.File,
    uploaderId: string,
  ): Promise<AttachmentItem> {
    if (!file?.buffer?.length) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '未收到文件', HttpStatus.BAD_REQUEST);
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `附件超出大小上限 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    const fileName = decodeOriginalName(file.originalname);
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!FILE_EXTENSIONS.has(ext)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        '不支持的文件类型（支持图片 / 文档 / 压缩包 / 录屏）',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (IMAGE_EXTENSIONS.has(ext) && file.mimetype && !file.mimetype.startsWith('image/')) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '图片文件内容异常', HttpStatus.BAD_REQUEST);
    }
    const count = await this.prisma.attachment.count({ where: { targetType, targetId } });
    if (count >= maxCount) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `附件数量已达上限 ${maxCount} 个`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const storageKey = `${KEY_PREFIX}/${targetId}/${randomUUID()}/${sanitizeFileName(fileName)}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype);

    try {
      const attachment = await this.prisma.attachment.create({
        data: {
          targetType,
          targetId,
          storageKey,
          fileName,
          fileSize: file.size,
          mimeType: file.mimetype || 'application/octet-stream',
          uploadedById: uploaderId,
        },
        include: ATTACHMENT_INCLUDE,
      });
      return toItem(attachment);
    } catch (err) {
      // 库没写成，存储里的孤儿文件立即清掉
      await this.storage.remove(storageKey);
      throw err;
    }
  }

  /** 查附件记录（限定反馈域的两种 targetType，防止跨域串号）。 */
  async findOrThrow(attachmentId: string): Promise<AttachmentWithUploader> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, targetType: { in: [FEEDBACK_TARGET, FEEDBACK_ACTION_TARGET] } },
      include: ATTACHMENT_INCLUDE,
    });
    if (!attachment) {
      throw new AppException(ErrorCode.NOT_FOUND, '附件不存在', HttpStatus.NOT_FOUND);
    }
    return attachment;
  }

  async stream(
    attachment: AttachmentWithUploader,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string; fileSize: number }> {
    const stream = await this.storage.getStream(attachment.storageKey);
    return {
      stream,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
    };
  }

  async listByTarget(targetType: string, targetId: string): Promise<AttachmentItem[]> {
    const rows = await this.prisma.attachment.findMany({
      where: { targetType, targetId },
      include: ATTACHMENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toItem);
  }

  /** 回复附件按 actionId 批量取，详情页一次装配整条时间线。 */
  async listByTargets(targetType: string, targetIds: string[]): Promise<Map<string, AttachmentItem[]>> {
    if (!targetIds.length) return new Map();
    const rows = await this.prisma.attachment.findMany({
      where: { targetType, targetId: { in: targetIds } },
      include: ATTACHMENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    const map = new Map<string, AttachmentItem[]>();
    for (const row of rows) {
      const list = map.get(row.targetId) ?? [];
      list.push(toItem(row));
      map.set(row.targetId, list);
    }
    return map;
  }

  /** 列表页附件数聚合（主单 + 回复一起算）。 */
  async countByFeedback(feedbackIds: string[], actionIdsByFeedback: Map<string, string[]>): Promise<Map<string, number>> {
    if (!feedbackIds.length) return new Map();
    const actionIds = [...actionIdsByFeedback.values()].flat();
    const counts = await this.prisma.attachment.groupBy({
      by: ['targetType', 'targetId'],
      where: {
        OR: [
          { targetType: FEEDBACK_TARGET, targetId: { in: feedbackIds } },
          ...(actionIds.length ? [{ targetType: FEEDBACK_ACTION_TARGET, targetId: { in: actionIds } }] : []),
        ],
      },
      _count: { _all: true },
    });
    const actionOwner = new Map<string, string>();
    for (const [feedbackId, ids] of actionIdsByFeedback) {
      for (const id of ids) actionOwner.set(id, feedbackId);
    }
    const result = new Map<string, number>();
    for (const c of counts) {
      const feedbackId =
        c.targetType === FEEDBACK_TARGET ? c.targetId : actionOwner.get(c.targetId);
      if (!feedbackId) continue;
      result.set(feedbackId, (result.get(feedbackId) ?? 0) + c._count._all);
    }
    return result;
  }
}

function toItem(p: AttachmentWithUploader): AttachmentItem {
  return {
    id: p.id,
    fileName: p.fileName,
    fileSize: p.fileSize,
    mimeType: p.mimeType,
    uploadedByName: p.uploadedBy?.displayName ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

/** multer 把非 ASCII 文件名按 latin1 解码，这里还原 UTF-8（与图纸/照片上传同一处理）。 */
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
