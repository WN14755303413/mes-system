import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  DebugIssueDetail,
  DebugIssueRow,
  PageResult,
} from '@mes/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import {
  AssignDebugIssueDto,
  CreateDebugIssueDto,
  DebugIssueListQueryDto,
  RecheckDebugIssueDto,
  SubmitDebugIssueDto,
  UpdateDebugIssueDto,
  VoidDebugIssueDto,
} from './dto/debug.dto';
import { DebugIssueService } from './services/debug-issue.service';

/** multer 兜底上限；业务上限在 QcPhotoService 内校验。 */
const HARD_UPLOAD_CAP = 50 * 1024 * 1024;

/**
 * 调试问题（M9，§8.8 问题清单 + 多轮整改复测）。
 *
 * 读接口与责任人动作不挂权限点（同 M8 问题单）——责任人可能是任何角色
 * （电气设计/软件/工艺…）。真正的访问控制在 service 内：
 * 无 debug:read 者只见与自己相关的问题（404 不暴露存在性），
 * submit 只允许责任人本人（或有 debug:write 者代提）。
 */
@Controller('debug-issues')
export class DebugIssueController {
  constructor(private readonly issues: DebugIssueService) {}

  @Get()
  list(
    @Query() query: DebugIssueListQueryDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<PageResult<DebugIssueRow>> {
    return this.issues.list(query, user);
  }

  /** 照片预览/下载。声明在 :id 之前，避免被参数路由吞掉。 */
  @Get('photos/:attachmentId')
  async downloadPhoto(
    @Param('attachmentId') attachmentId: string,
    @Query('inline') inline: string | undefined,
    @CurrentUser() user: CurrentUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, fileName, mimeType, fileSize } = await this.issues.downloadPhoto(
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
  detail(@Param('id') id: string, @CurrentUser() user: CurrentUserDto): Promise<DebugIssueDetail> {
    return this.issues.detail(id, user);
  }

  @Post()
  @RequirePermission('debug:write')
  @Audit('debug-issue.create', { targetType: 'debug-issue', targetIdFrom: 'result' })
  create(
    @Body() dto: CreateDebugIssueDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ id: string; code: string }> {
    return this.issues.create(dto, user);
  }

  /** 编辑基础信息与整改措施（写权限或责任人本人，service 内校验）。 */
  @Patch(':id')
  @Audit('debug-issue.update', { targetType: 'debug-issue' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDebugIssueDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.issues.update(id, dto, user);
    return { ok: true };
  }

  @Post(':id/assign')
  @RequirePermission('debug:write')
  @Audit('debug-issue.assign', { targetType: 'debug-issue' })
  @HttpCode(HttpStatus.OK)
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignDebugIssueDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.issues.assign(id, dto, user);
    return { ok: true };
  }

  /** 责任人提交整改（跨角色动作，身份在 service 校验）。 */
  @Post(':id/submit')
  @Audit('debug-issue.submit', { targetType: 'debug-issue' })
  @HttpCode(HttpStatus.OK)
  async submit(
    @Param('id') id: string,
    @Body() dto: SubmitDebugIssueDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.issues.submit(id, dto, user);
    return { ok: true };
  }

  /** 复测（§8.8 整改复测）：通过即关闭，不通过退回整改。 */
  @Post(':id/recheck')
  @RequirePermission('debug:write')
  @Audit('debug-issue.recheck', { targetType: 'debug-issue' })
  @HttpCode(HttpStatus.OK)
  async recheck(
    @Param('id') id: string,
    @Body() dto: RecheckDebugIssueDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.issues.recheck(id, dto, user);
    return { ok: true };
  }

  @Post(':id/void')
  @RequirePermission('debug:write')
  @Audit('debug-issue.void', { targetType: 'debug-issue' })
  @HttpCode(HttpStatus.OK)
  async void(
    @Param('id') id: string,
    @Body() dto: VoidDebugIssueDto,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<{ ok: true }> {
    await this.issues.void(id, dto, user);
    return { ok: true };
  }

  @Post(':id/photos')
  @Audit('debug-issue.photo.upload', { targetType: 'debug-issue' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_UPLOAD_CAP } }))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserDto,
  ): Promise<AttachmentItem> {
    return this.issues.uploadPhoto(id, file, user);
  }
}
