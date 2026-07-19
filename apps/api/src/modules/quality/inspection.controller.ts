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
  InspectionDetail,
  InspectionRow,
  JudgeInspectionResult,
  PageResult,
} from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import {
  CreateInspectionDto,
  InspectionListQueryDto,
  JudgeInspectionDto,
  UpdateInspectionDto,
} from './dto/quality.dto';
import { InspectionService } from './services/inspection.service';

/** multer 兜底上限；业务上限（默认 10MB/张）在 QcPhotoService 内按 MAX_UPLOAD_MB 校验。 */
const HARD_UPLOAD_CAP = 50 * 1024 * 1024;

/**
 * 检验单（M8，业务方案 §8.7）。
 * 判定即终态；不合格在同一事务内自动生成质量问题单（§9.7）。
 */
@Controller('inspections')
export class InspectionController {
  constructor(private readonly inspections: InspectionService) {}

  @Get()
  @RequirePermission('inspection:read')
  list(@Query() query: InspectionListQueryDto): Promise<PageResult<InspectionRow>> {
    return this.inspections.list(query);
  }

  /** 照片预览/下载。声明在 :id 之前，避免被参数路由吞掉。 */
  @Get('photos/:attachmentId')
  @RequirePermission('inspection:read')
  async downloadPhoto(
    @Param('attachmentId') attachmentId: string,
    @Query('inline') inline: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName, mimeType, fileSize } =
      await this.inspections.downloadPhoto(attachmentId);
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
  @RequirePermission('inspection:read')
  detail(@Param('id') id: string): Promise<InspectionDetail> {
    return this.inspections.detail(id);
  }

  @Post()
  @RequirePermission('inspection:write')
  @Audit('inspection.create', { targetType: 'inspection', targetIdFrom: 'result' })
  create(
    @Body() dto: CreateInspectionDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ id: string; code: string }> {
    return this.inspections.create(dto, user);
  }

  @Put(':id')
  @RequirePermission('inspection:write')
  @Audit('inspection.update', { targetType: 'inspection' })
  async update(@Param('id') id: string, @Body() dto: UpdateInspectionDto): Promise<{ ok: true }> {
    await this.inspections.update(id, dto);
    return { ok: true };
  }

  /** 判定（唯一的状态动作）。不合格时返回自动生成的问题单编号。 */
  @Post(':id/judge')
  @RequirePermission('inspection:write')
  @Audit('inspection.judge', { targetType: 'inspection' })
  @HttpCode(HttpStatus.OK)
  judge(
    @Param('id') id: string,
    @Body() dto: JudgeInspectionDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<JudgeInspectionResult> {
    return this.inspections.judge(id, dto, user);
  }

  @Post(':id/void')
  @RequirePermission('inspection:write')
  @Audit('inspection.void', { targetType: 'inspection' })
  @HttpCode(HttpStatus.OK)
  async void(@Param('id') id: string): Promise<{ ok: true }> {
    await this.inspections.void(id);
    return { ok: true };
  }

  @Post(':id/photos')
  @RequirePermission('inspection:write')
  @Audit('inspection.photo.upload', { targetType: 'inspection' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_UPLOAD_CAP } }))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<AttachmentItem> {
    return this.inspections.uploadPhoto(id, file, user);
  }
}
