import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
  ExceptionDetail,
  ExceptionRow,
  PageResult,
} from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import {
  CurrentUser,
  RequireAnyPermission,
  RequirePermission,
} from '../../common/decorators/auth.decorators';
import {
  AssignExceptionDto,
  CloseExceptionDto,
  CreateExceptionDto,
  ExceptionListQueryDto,
  ResolveExceptionDto,
} from './dto/production.dto';
import { ExceptionService } from './services/exception.service';

/** multer 兜底上限；业务上限（默认 10MB/张）在 service 里按 MAX_UPLOAD_MB 校验。 */
const HARD_UPLOAD_CAP = 50 * 1024 * 1024;

/**
 * 现场异常单（M7）。读接口对「计划侧」与「现场侧」都开放（anyOf），
 * 现场人员的可见范围在 service 内收窄为本人相关。
 */
@Controller('exceptions')
export class ExceptionController {
  constructor(private readonly exceptions: ExceptionService) {}

  @Get()
  @RequireAnyPermission('plan:read', 'task:exception')
  list(
    @Query() query: ExceptionListQueryDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<PageResult<ExceptionRow>> {
    return this.exceptions.list(query, user);
  }

  /** 照片预览/下载。声明在 :id 之前，避免被参数路由吞掉。 */
  @Get('photos/:attachmentId')
  @RequireAnyPermission('plan:read', 'task:exception')
  async downloadPhoto(
    @Param('attachmentId') attachmentId: string,
    @Query('inline') inline: string | undefined,
    @CurrentUser() user: CurrentUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName, mimeType, fileSize } = await this.exceptions.downloadPhoto(
      attachmentId,
      user,
    );
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
  @RequireAnyPermission('plan:read', 'task:exception')
  detail(@Param('id') id: string, @CurrentUser() user: CurrentUserDto): Promise<ExceptionDetail> {
    return this.exceptions.detail(id, user);
  }

  @Post()
  @RequirePermission('task:exception')
  @Audit('exception.create', { targetType: 'exception', targetIdFrom: 'result' })
  create(
    @Body() dto: CreateExceptionDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ id: string; code: string }> {
    return this.exceptions.create(dto, user);
  }

  @Post(':id/assign')
  @RequirePermission('plan:write')
  @Audit('exception.assign', { targetType: 'exception' })
  @HttpCode(HttpStatus.OK)
  async assign(@Param('id') id: string, @Body() dto: AssignExceptionDto): Promise<{ ok: true }> {
    await this.exceptions.assign(id, dto);
    return { ok: true };
  }

  /** 责任人提交处理结果（现场责任人无 plan:write 也可提交，身份在 service 校验）。 */
  @Post(':id/resolve')
  @RequireAnyPermission('task:exception', 'plan:write')
  @Audit('exception.resolve', { targetType: 'exception' })
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveExceptionDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.exceptions.resolve(id, dto, user);
    return { ok: true };
  }

  @Post(':id/close')
  @RequirePermission('plan:write')
  @Audit('exception.close', { targetType: 'exception' })
  @HttpCode(HttpStatus.OK)
  async close(
    @Param('id') id: string,
    @Body() dto: CloseExceptionDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.exceptions.close(id, dto, user);
    return { ok: true };
  }

  /** 复检不通过退回整改。 */
  @Post(':id/reopen')
  @RequirePermission('plan:write')
  @Audit('exception.reopen', { targetType: 'exception' })
  @HttpCode(HttpStatus.OK)
  async reopen(@Param('id') id: string, @Body() dto: CloseExceptionDto): Promise<{ ok: true }> {
    await this.exceptions.reopen(id, dto);
    return { ok: true };
  }

  @Post(':id/photos')
  @RequireAnyPermission('task:exception', 'plan:write')
  @Audit('exception.photo.upload', { targetType: 'exception' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_UPLOAD_CAP } }))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<AttachmentItem> {
    return this.exceptions.uploadPhoto(id, file, user);
  }
}
