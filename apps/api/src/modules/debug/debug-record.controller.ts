import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type {
  AttachmentItem,
  CurrentUser as CurrentUserDto,
  DebugRecordDetail,
  DebugRecordRow,
  PageResult,
} from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import {
  CreateDebugRecordDto,
  DebugRecordListQueryDto,
  UpdateDebugRecordDto,
} from './dto/debug.dto';
import { DebugRecordService } from './services/debug-record.service';

/** multer 兜底上限；业务上限在 QcPhotoService 内校验。 */
const HARD_UPLOAD_CAP = 50 * 1024 * 1024;

/**
 * 调试记录（M9，业务方案 §8.8）。
 *
 * 读挂 debug:read，写挂 debug:write——调试记录是正式执行档案，
 * 不像问题单有跨角色责任人动作，权限模型可以简单干净。
 */
@Controller('debug-records')
export class DebugRecordController {
  constructor(private readonly records: DebugRecordService) {}

  @Get()
  @RequirePermission('debug:read')
  list(@Query() query: DebugRecordListQueryDto): Promise<PageResult<DebugRecordRow>> {
    return this.records.list(query);
  }

  /** 照片预览/下载。声明在 :id 之前，避免被参数路由吞掉。 */
  @Get('photos/:attachmentId')
  @RequirePermission('debug:read')
  async downloadPhoto(
    @Param('attachmentId') attachmentId: string,
    @Query('inline') inline: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName, mimeType, fileSize } = await this.records.downloadPhoto(attachmentId);
    const disposition = inline === '1' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(fileSize));
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    return new StreamableFile(stream);
  }

  @Get(':id')
  @RequirePermission('debug:read')
  detail(@Param('id') id: string): Promise<DebugRecordDetail> {
    return this.records.detail(id);
  }

  @Post()
  @RequirePermission('debug:write')
  @Audit('debug-record.create', { targetType: 'debug-record', targetIdFrom: 'result' })
  create(
    @Body() dto: CreateDebugRecordDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ id: string; code: string }> {
    return this.records.create(dto, user);
  }

  @Put(':id')
  @RequirePermission('debug:write')
  @Audit('debug-record.update', { targetType: 'debug-record' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDebugRecordDto,
  ): Promise<{ ok: true }> {
    await this.records.update(id, dto);
    return { ok: true };
  }

  @Post(':id/complete')
  @RequirePermission('debug:write')
  @Audit('debug-record.complete', { targetType: 'debug-record' })
  @HttpCode(HttpStatus.OK)
  async complete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.records.complete(id, user);
    return { ok: true };
  }

  @Post(':id/void')
  @RequirePermission('debug:write')
  @Audit('debug-record.void', { targetType: 'debug-record' })
  @HttpCode(HttpStatus.OK)
  async void(@Param('id') id: string): Promise<{ ok: true }> {
    await this.records.void(id);
    return { ok: true };
  }

  @Post(':id/photos')
  @RequirePermission('debug:write')
  @Audit('debug-record.photo.upload', { targetType: 'debug-record' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_UPLOAD_CAP } }))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<AttachmentItem> {
    return this.records.uploadPhoto(id, file, user);
  }
}
