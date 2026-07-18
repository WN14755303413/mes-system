import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DrawingStatus,
  ErrorCode,
  Permission,
  type CurrentUser,
  type DrawingItem,
  type UploadDrawingResponse,
} from '@mes/shared';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StorageService } from '../../../common/storage/storage.service';
import type { DrawingListQueryDto, UploadDrawingDto } from '../dto/bom.dto';

/**
 * 允许上传的扩展名。图纸的常见交付格式：PDF、CAD（dwg/dxf）、三维（step/stp/igs/iges）、
 * 图片、Office 与压缩包。可执行文件一律拒绝——上传目录绝不能变成投毒入口。
 */
const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'dwg',
  'dxf',
  'step',
  'stp',
  'igs',
  'iges',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'xls',
  'xlsx',
  'doc',
  'docx',
  'txt',
  'zip',
  '7z',
  'rar',
]);

/**
 * 图纸管理（M5）。
 *
 * 文件本体在对象存储，DB 只存索引（storageKey/大小/类型）。
 * 下载必须经本服务鉴权——控制器上叠加 @Audit('drawing.download')，
 * 满足「重要文件下载必须记录日志」（业务方案 §11.2）与 M5 验收标准。
 */
@Injectable()
export class DrawingService {
  private readonly maxUploadBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.maxUploadBytes = Number(config.get('MAX_UPLOAD_MB') ?? 50) * 1024 * 1024;
  }

  /** 是否可见已作废图纸。现场只见有效版本，防误用旧图（业务方案 §8.2）。 */
  private canSeeVoided(user: CurrentUser): boolean {
    return user.permissions.includes(Permission.DRAWING_WRITE);
  }

  async list(query: DrawingListQueryDto, user: CurrentUser): Promise<DrawingItem[]> {
    const rows = await this.prisma.drawing.findMany({
      where: {
        projectId: query.projectId,
        status: this.canSeeVoided(user) ? query.status : DrawingStatus.ACTIVE,
        ...(query.keyword
          ? {
              OR: [
                { code: { contains: query.keyword, mode: 'insensitive' } },
                { name: { contains: query.keyword, mode: 'insensitive' } },
                { fileName: { contains: query.keyword, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { uploadedBy: { select: { displayName: true } } },
      orderBy: [{ status: 'asc' }, { code: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      code: r.code,
      name: r.name,
      version: r.version,
      status: r.status as DrawingStatus,
      fileName: r.fileName,
      fileSize: r.fileSize,
      mimeType: r.mimeType,
      uploadedByName: r.uploadedBy?.displayName ?? null,
      voidedAt: r.voidedAt?.toISOString() ?? null,
      remark: r.remark,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * 上传新图纸。同项目同图号的其它有效版本自动作废——「旧图纸必须标识作废，
   * 避免误用」（业务方案 §8.2）。先写存储、后写库，写库失败回滚清理文件。
   */
  async upload(
    dto: UploadDrawingDto,
    file: Express.Multer.File,
    userId: string,
  ): Promise<UploadDrawingResponse> {
    if (!file?.buffer?.length) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '未收到文件', HttpStatus.BAD_REQUEST);
    }
    if (file.size > this.maxUploadBytes) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `文件超出大小上限 ${Math.round(this.maxUploadBytes / 1024 / 1024)}MB`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const fileName = decodeOriginalName(file.originalname);
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `不支持的文件类型 .${ext}，允许：${[...ALLOWED_EXTENSIONS].join(' / ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new AppException(ErrorCode.NOT_FOUND, '项目不存在', HttpStatus.NOT_FOUND);

    const code = dto.code.trim();
    const version = dto.version.trim();
    const duplicate = await this.prisma.drawing.findUnique({
      where: { projectId_code_version: { projectId: dto.projectId, code, version } },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `图号 ${code} 的版本 ${version} 已存在，如需替换请先作废旧记录或提升版本号`,
        HttpStatus.CONFLICT,
      );
    }

    // key 里的 uuid 段保证全局唯一，文件名段只为运维排查时肉眼可读
    const storageKey = `drawings/${dto.projectId}/${randomUUID()}/${sanitizeFileName(fileName)}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 同图号的其它有效版本自动作废
        const superseded = await tx.drawing.updateMany({
          where: { projectId: dto.projectId, code, status: DrawingStatus.ACTIVE },
          data: { status: DrawingStatus.VOIDED, voidedAt: new Date() },
        });

        const drawing = await tx.drawing.create({
          data: {
            projectId: dto.projectId,
            code,
            name: dto.name.trim(),
            version,
            status: DrawingStatus.ACTIVE,
            storageKey,
            fileName,
            fileSize: file.size,
            mimeType: file.mimetype || 'application/octet-stream',
            uploadedById: userId,
            remark: dto.remark?.trim() || null,
          },
          select: { id: true },
        });

        return { id: drawing.id, supersededCount: superseded.count };
      });
    } catch (err) {
      // 库没写成，存储里的孤儿文件立即清掉
      await this.storage.remove(storageKey);
      throw err;
    }
  }

  /** 人工作废。作废不删文件——追溯需要能拿到历史版本原件。 */
  async void(id: string): Promise<void> {
    const drawing = await this.getDrawingOrThrow(id);
    if (drawing.status === DrawingStatus.VOIDED) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, '图纸已是作废状态', HttpStatus.BAD_REQUEST);
    }
    await this.prisma.drawing.update({
      where: { id },
      data: { status: DrawingStatus.VOIDED, voidedAt: new Date() },
    });
  }

  /** 取下载流。作废图纸仅设计人员可取（历史追溯），现场拒绝。 */
  async download(
    id: string,
    user: CurrentUser,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string; fileSize: number }> {
    const drawing = await this.getDrawingOrThrow(id);

    if (drawing.status === DrawingStatus.VOIDED && !this.canSeeVoided(user)) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        '图纸已作废，请获取最新版本',
        HttpStatus.FORBIDDEN,
      );
    }

    const stream = await this.storage.getStream(drawing.storageKey);
    return {
      stream,
      fileName: drawing.fileName,
      mimeType: drawing.mimeType,
      fileSize: drawing.fileSize,
    };
  }

  private async getDrawingOrThrow(id: string) {
    const drawing = await this.prisma.drawing.findUnique({ where: { id } });
    if (!drawing) throw new AppException(ErrorCode.NOT_FOUND, '图纸不存在', HttpStatus.NOT_FOUND);
    return drawing;
  }
}

/**
 * multer(busboy) 默认按 latin1 解码 multipart 里的文件名，中文会成乱码。
 * 按 latin1 还原原始字节再按 utf8 解码即恢复；解出替换符则说明本来就不是
 * 被错编的 utf8，保留原值。
 */
function decodeOriginalName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

/** 存储 key 中的文件名段：去掉路径分隔与控制字符，防穿越；中文等合法字符保留。 */
function sanitizeFileName(name: string): string {
  const cleaned = [...name.replace(/[/\\]/g, '_')]
    .filter((ch) => ch.charCodeAt(0) >= 0x20)
    .join('')
    .trim();
  return cleaned || 'file';
}
