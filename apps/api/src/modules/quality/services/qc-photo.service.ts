import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ErrorCode, type AttachmentItem } from '@mes/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StorageService } from '../../../common/storage/storage.service';

/** 与 M7 异常单同一口径：质量单据的照片只收图片格式，不做文件中转站。 */
const PHOTO_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const MAX_PHOTOS_PER_TARGET = 9;

const ATTACHMENT_INCLUDE = Prisma.validator<Prisma.AttachmentInclude>()({
  uploadedBy: { select: { displayName: true } },
});
type AttachmentWithUploader = Prisma.AttachmentGetPayload<{ include: typeof ATTACHMENT_INCLUDE }>;

/**
 * 检验单 / 质量问题单共用的照片存取（通用附件表 sys_attachment）。
 * 业务归属校验（谁可以传、什么状态可传、谁可见）留在各自的 service——
 * 这里只负责格式/大小/数量校验、对象存储写入与附件索引落库。
 */
@Injectable()
export class QcPhotoService {
  private readonly maxPhotoBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    // 与 M7 现场照片同一上限：图纸上限的 1/5（默认 10MB），手机原图足够
    this.maxPhotoBytes = Math.max(1, Number(config.get('MAX_UPLOAD_MB') ?? 50) / 5) * 1024 * 1024;
  }

  async upload(
    targetType: string,
    targetId: string,
    keyPrefix: string,
    file: Express.Multer.File,
    uploaderId: string,
  ): Promise<AttachmentItem> {
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
    const count = await this.prisma.attachment.count({ where: { targetType, targetId } });
    if (count >= MAX_PHOTOS_PER_TARGET) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `每张单据最多 ${MAX_PHOTOS_PER_TARGET} 张照片`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const storageKey = `${keyPrefix}/${targetId}/${randomUUID()}/${sanitizeFileName(fileName)}`;
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
      return this.toItem(attachment);
    } catch (err) {
      // 库没写成，存储里的孤儿文件立即清掉
      await this.storage.remove(storageKey);
      throw err;
    }
  }

  /** 查附件记录（限定 targetType，防止跨单据类型串号）。 */
  async findOrThrow(attachmentId: string, targetType: string): Promise<AttachmentWithUploader> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, targetType },
      include: ATTACHMENT_INCLUDE,
    });
    if (!attachment) {
      throw new AppException(ErrorCode.NOT_FOUND, '照片不存在', HttpStatus.NOT_FOUND);
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
    return rows.map((r) => this.toItem(r));
  }

  /** 列表页照片数按批聚合（附件与业务对象无外键）。 */
  async countByTargets(targetType: string, targetIds: string[]): Promise<Map<string, number>> {
    if (!targetIds.length) return new Map();
    const counts = await this.prisma.attachment.groupBy({
      by: ['targetId'],
      where: { targetType, targetId: { in: targetIds } },
      _count: { _all: true },
    });
    return new Map(counts.map((c) => [c.targetId, c._count._all]));
  }

  private toItem(p: AttachmentWithUploader): AttachmentItem {
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

/** multer 把非 ASCII 文件名按 latin1 解码，这里还原 UTF-8（与图纸/异常单上传同一处理）。 */
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
